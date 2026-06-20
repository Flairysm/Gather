-- Safety net for card-at-checkout: if a buyer abandons the Payment Sheet without
-- the app getting a chance to cancel (e.g. app killed mid-payment), the staged
-- order would otherwise hold reserved stock indefinitely. This hourly job voids
-- card orders still 'pending' after 60 minutes, restoring their stock.
--
-- Abandoned PaymentIntents are harmless: the client_secret is gone once the sheet
-- closes, so the buyer cannot confirm them later; Stripe expires them on its own.

BEGIN;

CREATE OR REPLACE FUNCTION public._void_stale_card_orders()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(order_id) INTO v_ids
    FROM order_payments
    WHERE funding_source = 'card'
      AND escrow_status = 'pending'
      AND created_at < now() - interval '60 minutes';
  IF v_ids IS NULL THEN RETURN 0; END IF;
  RETURN public._void_card_orders(v_ids);
END;
$function$;

REVOKE ALL ON FUNCTION public._void_stale_card_orders() FROM PUBLIC, anon, authenticated;

DO $cron$
BEGIN
  PERFORM cron.unschedule('void-stale-card-orders');
EXCEPTION WHEN OTHERS THEN NULL;
END
$cron$;

DO $cron$
BEGIN
  PERFORM cron.schedule('void-stale-card-orders', '*/20 * * * *', 'SELECT public._void_stale_card_orders();');
EXCEPTION WHEN OTHERS THEN NULL;
END
$cron$;

COMMIT;
