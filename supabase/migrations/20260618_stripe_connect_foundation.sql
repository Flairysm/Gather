-- Stripe Connect escrow foundation (Evend platform — sandbox/MVP).
--
-- Additive only. Establishes the shared spine for the Connect build:
--   * seller connected-account state on vendor_stores
--   * buyer Stripe customer id on profiles
--   * a per-order escrow ledger (order_payments) that tracks funds held on the
--     platform balance and released to sellers via Transfers
--   * wallet top-up tracking (credit-once via webhook)
--   * webhook event idempotency
--
-- Money model (coexist): wallet top-ups AND direct card charges both land real
-- funds in the Evend platform balance. Seller payouts are Transfers out of that
-- balance on delivery. order_payments is the source of truth for escrow state.

BEGIN;

-- 1. Seller connected-account state ------------------------------------------
ALTER TABLE public.vendor_stores
  ADD COLUMN IF NOT EXISTS stripe_account_id        text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_details_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_onboarded_at      timestamptz;

-- 2. Buyer Stripe customer (for Payment Sheet ephemeral keys / saved methods) -
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- 3. Per-order escrow ledger --------------------------------------------------
-- Checkout creates one order per seller, so each order maps to a single seller,
-- a single charge (when card-funded), and a single Transfer on release.
-- buyer_id / seller_id are denormalized uuids (no FK) to stay decoupled from the
-- profiles/auth.users split and avoid cross-table constraint coupling.
CREATE TABLE IF NOT EXISTS public.order_payments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                 uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  buyer_id                 uuid NOT NULL,
  seller_id                uuid,
  seller_stripe_account_id text,
  amount                   numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency                 text NOT NULL DEFAULT 'myr',
  platform_fee             numeric(12,2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
  funding_source           text NOT NULL CHECK (funding_source IN ('wallet','card','mixed')),
  payment_intent_id        text,
  charge_id                text,
  transfer_id              text,
  escrow_status            text NOT NULL DEFAULT 'pending'
                             CHECK (escrow_status IN ('pending','held','released','refunded','failed')),
  held_at                  timestamptz,
  released_at              timestamptz,
  refunded_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_payments_order  ON public.order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_seller ON public.order_payments(seller_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_buyer  ON public.order_payments(buyer_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_payments_pi
  ON public.order_payments(payment_intent_id) WHERE payment_intent_id IS NOT NULL;

-- 4. Wallet top-ups (Stripe-funded; credited once via webhook) ---------------
CREATE TABLE IF NOT EXISTS public.wallet_topups (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_intent_id text UNIQUE,
  amount            numeric(12,2) NOT NULL CHECK (amount > 0),
  currency          text NOT NULL DEFAULT 'myr',
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','succeeded','failed','credited')),
  credited_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_topups_user ON public.wallet_topups(user_id);

-- 5. Webhook event idempotency ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id          text PRIMARY KEY,            -- Stripe event id (evt_...)
  type        text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload     jsonb
);

-- 6. RLS ----------------------------------------------------------------------
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_topups  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events  ENABLE ROW LEVEL SECURITY;

-- order_payments: buyer or seller may read their own rows. All writes happen
-- through Edge Functions using the service role (which bypasses RLS).
DROP POLICY IF EXISTS order_payments_select_own ON public.order_payments;
CREATE POLICY order_payments_select_own ON public.order_payments
  FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());

-- wallet_topups: owner may read their own rows.
DROP POLICY IF EXISTS wallet_topups_select_own ON public.wallet_topups;
CREATE POLICY wallet_topups_select_own ON public.wallet_topups
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- stripe_events: no policies => service role only.

COMMIT;
