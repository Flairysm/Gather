-- Escrow / buyer-protection — Phase B
--
--   1. Ship-by deadline: every confirmed (paid) order item gets a 5-day window for
--      the seller to ship. Set by a trigger so it covers every confirm path
--      (card webhook, voucher-settled, wallet auction win).
--   2. Overdue notifications: an hourly cron pings buyer + seller once when the
--      ship window lapses without a shipment.
--   3. Buyer overdue-cancel eligibility helper (the cancel-order Edge Function lets
--      the buyer refund themselves once the seller misses the ship deadline).

-- ── Ship deadline column ────────────────────────────────────────────────────
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS ship_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS ship_overdue_notified_at timestamptz;

-- Set a 5-day ship-by deadline the moment an item becomes 'confirmed' (paid).
CREATE OR REPLACE FUNCTION public._set_ship_deadline()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.fulfillment_status = 'confirmed' AND NEW.ship_deadline IS NULL THEN
    NEW.ship_deadline := now() + interval '5 days';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_ship_deadline ON public.order_items;
CREATE TRIGGER trg_set_ship_deadline
  BEFORE INSERT OR UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public._set_ship_deadline();

-- Backfill: give existing confirmed-but-unshipped items a deadline so they're not
-- stuck without one (5 days from now, a grace period).
UPDATE public.order_items
  SET ship_deadline = now() + interval '5 days'
  WHERE fulfillment_status = 'confirmed' AND ship_deadline IS NULL;

-- ── is_shipment_overdue: buyer cancel/refund eligibility ────────────────────
-- True when the order is still held, nothing has shipped, and the ship deadline
-- has lapsed. Used by the cancel-order Edge Function to authorize a buyer refund.
CREATE OR REPLACE FUNCTION public.is_shipment_overdue(p_order_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM order_payments op WHERE op.order_id = p_order_id AND op.escrow_status = 'held'
  )
  AND NOT EXISTS (
    SELECT 1 FROM order_items oi
    WHERE oi.order_id = p_order_id AND oi.fulfillment_status IN ('shipped','delivered','cancelled','refunded')
  )
  AND EXISTS (
    SELECT 1 FROM order_items oi
    WHERE oi.order_id = p_order_id AND oi.fulfillment_status = 'confirmed'
      AND oi.ship_deadline IS NOT NULL AND oi.ship_deadline < now()
  );
$function$;

REVOKE ALL ON FUNCTION public.is_shipment_overdue(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_shipment_overdue(uuid) TO authenticated, service_role;

-- ── Overdue-shipment notifications (hourly cron) ────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_overdue_shipments()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT oi.order_id, op.buyer_id, op.seller_id
    FROM order_items oi
    JOIN order_payments op ON op.order_id = oi.order_id
    WHERE oi.fulfillment_status = 'confirmed'
      AND oi.ship_deadline IS NOT NULL
      AND oi.ship_deadline < now()
      AND oi.ship_overdue_notified_at IS NULL
      AND op.escrow_status = 'held'
  LOOP
    INSERT INTO notifications (user_id, type, title, body, icon, color, reference_type, reference_id)
    VALUES
      (r.seller_id, 'ship_overdue', 'Shipment overdue',
       'You missed the 5-day ship-by deadline for an order. Ship it now or the buyer can cancel for a full refund.',
       'alert-circle-outline', '#EF4444', 'order', r.order_id),
      (r.buyer_id, 'ship_overdue', 'Seller missed the ship deadline',
       'The seller hasn''t shipped within 5 days. You can cancel this order for a full refund from your orders.',
       'time-outline', '#F59E0B', 'order', r.order_id);

    UPDATE order_items SET ship_overdue_notified_at = now()
      WHERE order_id = r.order_id AND fulfillment_status = 'confirmed' AND ship_overdue_notified_at IS NULL;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_overdue_shipments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_overdue_shipments() TO service_role;

DO $cron$
BEGIN
  PERFORM cron.unschedule('notify-overdue-shipments');
EXCEPTION WHEN OTHERS THEN NULL;
END
$cron$;

DO $cron$
BEGIN
  PERFORM cron.schedule('notify-overdue-shipments', '15 * * * *', 'SELECT public.notify_overdue_shipments();');
EXCEPTION WHEN OTHERS THEN NULL;
END
$cron$;
