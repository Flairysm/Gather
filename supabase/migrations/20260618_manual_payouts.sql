-- Manual seller payouts (MVP — no Stripe Connect).
--
-- Money already lands in the Evend platform balance (card charges on the
-- platform account + wallet). This migration lets sellers cash out by hand:
--   * escrow releases into a withdrawable balance WITHOUT a Stripe Transfer
--     (release based purely on delivery + dispute window + no open dispute)
--   * sellers save a bank account and request a withdrawal of their available
--     balance
--   * an admin pays them out-of-band (DuitNow / online banking) and marks the
--     request paid, recording a reference
--
-- Balance model (derived, not stored):
--   released_total = SUM(amount - platform_fee) of order_payments at 'released'
--   reserved       = SUM(amount) of seller_payouts in ('requested','paid')
--   available      = released_total - reserved
-- A 'cancelled'/'rejected' payout frees its reservation automatically.

BEGIN;

-- ── 1. Seller bank account (one current account per seller) ─────────────────
CREATE TABLE IF NOT EXISTS public.seller_payout_accounts (
  seller_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_holder text NOT NULL,
  bank_name      text NOT NULL,
  account_number text NOT NULL,
  phone          text,
  ic_number      text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Withdrawal requests ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.seller_payouts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount         numeric(12,2) NOT NULL CHECK (amount > 0),
  status         text NOT NULL DEFAULT 'requested'
                   CHECK (status IN ('requested','paid','cancelled','rejected')),
  -- bank snapshot at request time (so editing the account later can't rewrite history)
  account_holder text,
  bank_name      text,
  account_number text,
  phone          text,
  reference      text,         -- DuitNow / transfer reference, set by admin on pay
  note           text,         -- admin note or rejection reason
  requested_at   timestamptz NOT NULL DEFAULT now(),
  paid_at        timestamptz,
  paid_by        uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_seller_payouts_seller ON public.seller_payouts(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seller_payouts_status ON public.seller_payouts(status);

-- ── 3. RLS: owners read their own rows; all writes go through RPCs / service ─
ALTER TABLE public.seller_payout_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_payouts         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seller_payout_accounts_select_own ON public.seller_payout_accounts;
CREATE POLICY seller_payout_accounts_select_own ON public.seller_payout_accounts
  FOR SELECT TO authenticated USING (seller_id = auth.uid());

DROP POLICY IF EXISTS seller_payouts_select_own ON public.seller_payouts;
CREATE POLICY seller_payouts_select_own ON public.seller_payouts
  FOR SELECT TO authenticated USING (seller_id = auth.uid());

-- ── 4. Derived seller balance ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_seller_balance()
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_released numeric := 0;
  v_held     numeric := 0;
  v_reserved numeric := 0;   -- requested + paid
  v_pending  numeric := 0;   -- requested only
  v_paid     numeric := 0;   -- paid only
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT
    COALESCE(SUM(CASE WHEN escrow_status = 'released' THEN GREATEST(amount - platform_fee, 0) END), 0),
    COALESCE(SUM(CASE WHEN escrow_status = 'held'     THEN GREATEST(amount - platform_fee, 0) END), 0)
  INTO v_released, v_held
  FROM order_payments
  WHERE seller_id = v_uid;

  SELECT
    COALESCE(SUM(CASE WHEN status IN ('requested','paid') THEN amount END), 0),
    COALESCE(SUM(CASE WHEN status = 'requested' THEN amount END), 0),
    COALESCE(SUM(CASE WHEN status = 'paid'      THEN amount END), 0)
  INTO v_reserved, v_pending, v_paid
  FROM seller_payouts
  WHERE seller_id = v_uid;

  RETURN jsonb_build_object(
    'in_escrow',     round(v_held, 2),
    'released_total', round(v_released, 2),
    'available',     round(GREATEST(v_released - v_reserved, 0), 2),
    'pending',       round(v_pending, 2),
    'lifetime_paid', round(v_paid, 2)
  );
END;
$function$;

-- ── 5. Read the caller's saved bank account ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_payout_account()
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row seller_payout_accounts%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM seller_payout_accounts WHERE seller_id = v_uid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'account_holder', v_row.account_holder,
    'bank_name',      v_row.bank_name,
    'account_number', v_row.account_number,
    'phone',          v_row.phone,
    'ic_number',      v_row.ic_number,
    'updated_at',     v_row.updated_at
  );
END;
$function$;

-- ── 6. Save / update the caller's bank account ──────────────────────────────
CREATE OR REPLACE FUNCTION public.save_payout_account(
  p_account_holder text,
  p_bank_name      text,
  p_account_number text,
  p_phone          text DEFAULT NULL,
  p_ic_number      text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF COALESCE(btrim(p_account_holder), '') = '' THEN RAISE EXCEPTION 'Account holder name is required'; END IF;
  IF COALESCE(btrim(p_bank_name), '') = ''      THEN RAISE EXCEPTION 'Bank name is required'; END IF;
  IF COALESCE(btrim(p_account_number), '') = ''  THEN RAISE EXCEPTION 'Account number is required'; END IF;

  INSERT INTO seller_payout_accounts (seller_id, account_holder, bank_name, account_number, phone, ic_number)
  VALUES (v_uid, btrim(p_account_holder), btrim(p_bank_name), btrim(p_account_number),
          NULLIF(btrim(p_phone), ''), NULLIF(btrim(p_ic_number), ''))
  ON CONFLICT (seller_id) DO UPDATE
    SET account_holder = EXCLUDED.account_holder,
        bank_name      = EXCLUDED.bank_name,
        account_number = EXCLUDED.account_number,
        phone          = EXCLUDED.phone,
        ic_number      = EXCLUDED.ic_number,
        updated_at     = now();

  RETURN jsonb_build_object('status', 'saved');
END;
$function$;

-- ── 7. Request a withdrawal ─────────────────────────────────────────────────
-- p_amount NULL => withdraw the full available balance. One open ('requested')
-- payout at a time keeps the balance math and the admin queue simple.
CREATE OR REPLACE FUNCTION public.request_payout(p_amount numeric DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_acct seller_payout_accounts%ROWTYPE;
  v_available numeric;
  v_amount numeric;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_acct FROM seller_payout_accounts WHERE seller_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Add a bank account before requesting a payout'; END IF;

  IF EXISTS (SELECT 1 FROM seller_payouts WHERE seller_id = v_uid AND status = 'requested') THEN
    RAISE EXCEPTION 'You already have a pending payout request';
  END IF;

  v_available := (get_seller_balance()->>'available')::numeric;
  v_amount := round(COALESCE(p_amount, v_available), 2);

  IF v_amount <= 0 THEN RAISE EXCEPTION 'No funds available to withdraw'; END IF;
  IF v_amount > v_available THEN
    RAISE EXCEPTION 'Amount exceeds your available balance of %', v_available;
  END IF;

  INSERT INTO seller_payouts (seller_id, amount, account_holder, bank_name, account_number, phone)
  VALUES (v_uid, v_amount, v_acct.account_holder, v_acct.bank_name, v_acct.account_number, v_acct.phone)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('status', 'requested', 'payout_id', v_id, 'amount', v_amount);
END;
$function$;

-- ── 8. Seller cancels their own pending request ─────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_payout(p_payout_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_rows int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE seller_payouts
    SET status = 'cancelled', updated_at = now()
    WHERE id = p_payout_id AND seller_id = v_uid AND status = 'requested';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RAISE EXCEPTION 'Payout not found or no longer cancellable'; END IF;
  RETURN jsonb_build_object('status', 'cancelled');
END;
$function$;

-- ── 9. Manual escrow release (DB-only; no Stripe Transfer) ──────────────────
-- Releases every held escrow whose order is delivered, past its dispute window,
-- and dispute-free. Released funds become withdrawable balance for the seller.
CREATE OR REPLACE FUNCTION public.run_manual_escrow_release()
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_rows int;
BEGIN
  UPDATE order_payments op
    SET escrow_status = 'released', released_at = now(), updated_at = now()
    WHERE op.escrow_status = 'held'
      AND (op.amount - op.platform_fee) > 0
      AND NOT EXISTS (
        SELECT 1 FROM disputes d
        WHERE d.order_id = op.order_id AND d.status NOT IN ('resolved', 'rejected')
      )
      AND NOT EXISTS (
        SELECT 1 FROM order_items oi
        WHERE oi.order_id = op.order_id
          AND (oi.fulfillment_status <> 'delivered'
               OR oi.dispute_deadline IS NULL
               OR oi.dispute_deadline > now())
      );
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('released', v_rows);
END;
$function$;

-- ── 10. Admin: force-release one order's escrow (no Stripe) ─────────────────
CREATE OR REPLACE FUNCTION public.admin_release_order(p_order_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_rows int;
BEGIN
  UPDATE order_payments
    SET escrow_status = 'released', released_at = now(), updated_at = now()
    WHERE order_id = p_order_id AND escrow_status = 'held';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('status', CASE WHEN v_rows > 0 THEN 'released' ELSE 'noop' END);
END;
$function$;

-- ── 11. Admin: mark a payout paid / rejected ────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(
  p_payout_id uuid,
  p_reference text DEFAULT NULL,
  p_admin_id  uuid DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_rows int;
BEGIN
  UPDATE seller_payouts
    SET status = 'paid', reference = NULLIF(btrim(p_reference), ''),
        paid_at = now(), paid_by = p_admin_id, updated_at = now()
    WHERE id = p_payout_id AND status = 'requested';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RAISE EXCEPTION 'Payout not found or not in a payable state'; END IF;
  RETURN jsonb_build_object('status', 'paid');
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reject_payout(
  p_payout_id uuid,
  p_note text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_rows int;
BEGIN
  UPDATE seller_payouts
    SET status = 'rejected', note = NULLIF(btrim(p_note), ''), updated_at = now()
    WHERE id = p_payout_id AND status = 'requested';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RAISE EXCEPTION 'Payout not found or not in a rejectable state'; END IF;
  RETURN jsonb_build_object('status', 'rejected');
END;
$function$;

-- ── 12. Grants ──────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.get_seller_balance()                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_payout_account()                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_payout_account(text,text,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_payout(numeric)                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_payout(uuid)                        FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_seller_balance()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payout_account()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_payout_account(text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_payout(numeric)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_payout(uuid)                     TO authenticated;

REVOKE ALL ON FUNCTION public.run_manual_escrow_release()                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_release_order(uuid)                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_mark_payout_paid(uuid,text,uuid)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_reject_payout(uuid,text)             FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_manual_escrow_release()             TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_release_order(uuid)               TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid,text,uuid)  TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_reject_payout(uuid,text)          TO service_role;

-- ── 13. Swap the auto-release cron to the DB-only manual path ───────────────
-- The old job hit the release-escrow Edge Function (Stripe Transfers), which
-- has no connected accounts in the manual model. Run the DB release instead.
DO $cron$
BEGIN
  PERFORM cron.unschedule('release-escrow-batch');
EXCEPTION WHEN OTHERS THEN NULL;
END
$cron$;

DO $cron$
BEGIN
  PERFORM cron.unschedule('manual-escrow-release');
EXCEPTION WHEN OTHERS THEN NULL;
END
$cron$;

DO $cron$
BEGIN
  PERFORM cron.schedule('manual-escrow-release', '*/30 * * * *', 'SELECT public.run_manual_escrow_release();');
EXCEPTION WHEN OTHERS THEN NULL;
END
$cron$;

COMMIT;
