-- 5% platform fee on seller earnings.
--
-- Sellers receive 95% of their item earnings; Evend keeps 5%. We apply the fee
-- in the balance derivation (read-time) rather than mutating order_payments, so
-- every downstream figure stays in NET terms and the payout reservation math
-- needs no gross/net bookkeeping:
--   net_released = SUM(amount - platform_fee) of 'released' orders * 0.95
--   net_held     = SUM(amount - platform_fee) of 'held' orders     * 0.95
--   reserved     = SUM(amount) of seller_payouts in ('requested','paid')  -- already net
--   available    = net_released - reserved
-- A withdrawal request therefore pays out exactly the net available balance.
--
-- platform_fee on order_payments remains the shipping the platform retains; the
-- 5% is a separate commission layered on top of the seller's item earnings.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_seller_balance()
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_fee_rate numeric := 0.05;          -- 5% platform fee
  v_gross_released numeric := 0;
  v_gross_held     numeric := 0;
  v_released numeric := 0;             -- net of fee
  v_held     numeric := 0;             -- net of fee
  v_reserved numeric := 0;             -- requested + paid (already net)
  v_pending  numeric := 0;             -- requested only
  v_paid     numeric := 0;             -- paid only
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT
    COALESCE(SUM(CASE WHEN escrow_status = 'released' THEN GREATEST(amount - platform_fee, 0) END), 0),
    COALESCE(SUM(CASE WHEN escrow_status = 'held'     THEN GREATEST(amount - platform_fee, 0) END), 0)
  INTO v_gross_released, v_gross_held
  FROM order_payments
  WHERE seller_id = v_uid;

  v_released := round(v_gross_released * (1 - v_fee_rate), 2);
  v_held     := round(v_gross_held     * (1 - v_fee_rate), 2);

  SELECT
    COALESCE(SUM(CASE WHEN status IN ('requested','paid') THEN amount END), 0),
    COALESCE(SUM(CASE WHEN status = 'requested' THEN amount END), 0),
    COALESCE(SUM(CASE WHEN status = 'paid'      THEN amount END), 0)
  INTO v_reserved, v_pending, v_paid
  FROM seller_payouts
  WHERE seller_id = v_uid;

  RETURN jsonb_build_object(
    'in_escrow',      round(v_held, 2),
    'released_total', round(v_released, 2),
    'available',      round(GREATEST(v_released - v_reserved, 0), 2),
    'pending',        round(v_pending, 2),
    'lifetime_paid',  round(v_paid, 2),
    'fee_rate',       v_fee_rate,
    'gross_earned',   round(v_gross_released + v_gross_held, 2)
  );
END;
$function$;

COMMIT;
