-- Phases 3-5: escrow release (Transfers), refunds, and auction escrow.
--
-- The Edge Functions hold the Stripe secret and perform the actual Stripe calls
-- (Transfer / Refund). These RPCs encapsulate eligibility + DB state changes and
-- are callable only by the service role (Edge Functions / cron).

BEGIN;

-- ── Refund a held order back to the buyer ───────────────────────────────────
-- Wallet-funded: credit the wallet. Card-funded: the Edge Function issues the
-- Stripe refund; here we only flip state (no wallet credit). Only valid while
-- funds are still held (refunds happen during the dispute window, before payout).
CREATE OR REPLACE FUNCTION public.apply_order_refund(p_order_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  op record;
BEGIN
  SELECT * INTO op FROM order_payments WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF op.escrow_status = 'refunded' THEN RETURN jsonb_build_object('status', 'already_refunded'); END IF;
  IF op.escrow_status <> 'held' THEN
    RETURN jsonb_build_object('status', 'not_refundable', 'escrow_status', op.escrow_status);
  END IF;

  IF op.funding_source = 'wallet' THEN
    PERFORM _wallet_apply(op.buyer_id, op.amount, 'refund', 'order', op.order_id, 'Order refund');
  END IF;

  UPDATE order_payments
    SET escrow_status = 'refunded', refunded_at = now(), updated_at = now()
    WHERE id = op.id;

  UPDATE order_items SET fulfillment_status = 'refunded' WHERE order_id = p_order_id;

  RETURN jsonb_build_object('status', 'refunded', 'funding_source', op.funding_source, 'amount', op.amount);
END;
$function$;

-- ── Releasable escrows (cron batch eligibility) ─────────────────────────────
-- Released when: still held, seller has a payouts-enabled connected account,
-- no open dispute, and every order item is delivered with its dispute window
-- elapsed.
CREATE OR REPLACE FUNCTION public.escrow_releasable()
  RETURNS TABLE (
    order_id uuid,
    seller_stripe_account_id text,
    transfer_amount numeric
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT op.order_id, op.seller_stripe_account_id, (op.amount - op.platform_fee) AS transfer_amount
  FROM order_payments op
  WHERE op.escrow_status = 'held'
    AND op.seller_stripe_account_id IS NOT NULL
    AND (op.amount - op.platform_fee) > 0
    AND EXISTS (
      SELECT 1 FROM vendor_stores vs
      WHERE vs.profile_id = op.seller_id AND vs.stripe_payouts_enabled
    )
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
$function$;

-- ── Mark an escrow released after a successful Transfer ─────────────────────
CREATE OR REPLACE FUNCTION public.mark_escrow_released(p_order_id uuid, p_transfer_id text)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_rows int;
BEGIN
  UPDATE order_payments
    SET escrow_status = 'released', transfer_id = p_transfer_id, released_at = now(), updated_at = now()
    WHERE order_id = p_order_id AND escrow_status = 'held';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('status', CASE WHEN v_rows > 0 THEN 'released' ELSE 'noop' END);
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_order_refund(uuid)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.escrow_releasable()                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_escrow_released(uuid, text)    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_refund(uuid)         TO service_role;
GRANT EXECUTE ON FUNCTION public.escrow_releasable()              TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_escrow_released(uuid, text) TO service_role;

-- ── Auctions on Connect: record an escrow row when a win is paid ────────────
CREATE OR REPLACE FUNCTION public.pay_auction_win(p_win_id uuid, p_shipping_fee numeric DEFAULT 0)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_win auction_wins%ROWTYPE;
  v_order_id uuid;
  v_shipping numeric := round(COALESCE(p_shipping_fee, 0), 2);
  v_total numeric;
  v_stripe_acct text;
BEGIN
  SELECT * INTO v_win FROM auction_wins WHERE id = p_win_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Win record not found'; END IF;
  IF auth.uid() <> v_win.winner_id THEN RAISE EXCEPTION 'Not your win'; END IF;
  IF v_win.payment_status <> 'pending' THEN RAISE EXCEPTION 'Win is already %', v_win.payment_status; END IF;
  IF v_win.payment_deadline < now() THEN RAISE EXCEPTION 'Payment deadline has passed'; END IF;

  v_total := round(v_win.winning_bid + v_shipping, 2);

  UPDATE auction_wins SET payment_status = 'paid', paid_at = now() WHERE id = p_win_id;

  INSERT INTO orders (buyer_id, total) VALUES (v_win.winner_id, v_total) RETURNING id INTO v_order_id;

  UPDATE auction_holds
  SET status = 'captured', updated_at = now()
  WHERE auction_id = v_win.auction_id AND user_id = v_win.winner_id AND status = 'active';

  PERFORM _wallet_apply(v_win.winner_id, -v_total, 'auction', 'order', v_order_id, 'Auction payment');

  INSERT INTO order_items (order_id, listing_id, seller_id, quantity, unit_price, fulfillment_status)
  VALUES (v_order_id, v_win.auction_id, v_win.seller_id, 1, v_win.winning_bid, 'confirmed');

  SELECT stripe_account_id INTO v_stripe_acct FROM vendor_stores WHERE profile_id = v_win.seller_id;
  INSERT INTO order_payments (
    order_id, buyer_id, seller_id, seller_stripe_account_id,
    amount, platform_fee, funding_source, escrow_status, held_at
  ) VALUES (
    v_order_id, v_win.winner_id, v_win.seller_id, v_stripe_acct,
    v_total, v_shipping, 'wallet', 'held', now()
  );

  INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'auction_payment', 'auction_win', p_win_id,
    jsonb_build_object('auction_id', v_win.auction_id, 'amount', v_win.winning_bid,
      'shipping', v_shipping, 'total', v_total, 'order_id', v_order_id, 'paid_with', 'wallet'));

  RETURN jsonb_build_object('win_id', p_win_id, 'payment_status', 'paid', 'paid_at', now(),
    'order_id', v_order_id, 'total', v_total);
END;
$function$;

-- ── Auto-release cron (calls the release-escrow Edge Function via pg_net) ────
-- Requires the service-role key stored in Vault as 'evend_service_role_key':
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'evend_service_role_key');
-- Until then this is a safe no-op; admins can release manually.
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public._auto_release_escrow_http()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'evend_service_role_key' LIMIT 1;
  IF v_key IS NULL THEN RETURN; END IF;

  PERFORM net.http_post(
    url := 'https://elvfmfpqmeficvmksdnx.supabase.co/functions/v1/release-escrow',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('batch', true)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._auto_release_escrow_http() FROM PUBLIC, anon, authenticated;

DO $cron$
BEGIN
  PERFORM cron.unschedule('release-escrow-batch');
EXCEPTION WHEN OTHERS THEN NULL;
END
$cron$;

DO $cron$
BEGIN
  PERFORM cron.schedule('release-escrow-batch', '*/30 * * * *', 'SELECT public._auto_release_escrow_http();');
EXCEPTION WHEN OTHERS THEN NULL;
END
$cron$;

COMMIT;
