-- Remove live streaming + flash auctions from the Evend project.
--
-- This reverts the live-commerce feature added in 20260411_live_commerce.sql:
--   * unschedules the flash-auction finalizer cron job
--   * drops all live/flash RPCs
--   * rewrites pay_auction_win to handle regular timed auctions only
--   * removes flash columns from auction_wins / order_items
--   * drops the live_* tables and stream_presets
--
-- Regular timed auctions (auction_items / auction_bids / auction_wins) are kept.

BEGIN;

-- 1. Stop the per-minute flash finalizer cron job (jobid may differ; match by command).
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job
   WHERE command ILIKE '%finalize_expired_flash_auctions%'
   LIMIT 1;
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

-- 2. Drop live/flash RPCs.
DROP FUNCTION IF EXISTS public.finalize_expired_flash_auctions();
DROP FUNCTION IF EXISTS public.try_finalize_flash_pin(uuid);
DROP FUNCTION IF EXISTS public.place_live_bid(uuid, numeric);
DROP FUNCTION IF EXISTS public.pin_product(uuid, text, uuid, uuid, numeric, integer, text, text, numeric, numeric);
DROP FUNCTION IF EXISTS public.unpin_product(uuid);
DROP FUNCTION IF EXISTS public.go_live(text, text, text[], text, text);
DROP FUNCTION IF EXISTS public.end_live(uuid);
DROP FUNCTION IF EXISTS public.join_live_stream(uuid);
DROP FUNCTION IF EXISTS public.leave_live_stream(uuid);
DROP FUNCTION IF EXISTS public.toggle_live_like(uuid);

-- 3. Remove flash-only data so the flash columns can be dropped cleanly.
--    (Pre-launch test data only.)
DELETE FROM order_items WHERE flash_pin_id IS NOT NULL;
DELETE FROM auction_wins WHERE flash_pin_id IS NOT NULL;

-- 4. Rewrite pay_auction_win without the flash branch.
CREATE OR REPLACE FUNCTION public.pay_auction_win(p_win_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_win auction_wins%ROWTYPE;
  v_order_id uuid;
BEGIN
  SELECT * INTO v_win FROM auction_wins WHERE id = p_win_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Win record not found'; END IF;
  IF auth.uid() <> v_win.winner_id THEN RAISE EXCEPTION 'Not your win'; END IF;
  IF v_win.payment_status <> 'pending' THEN RAISE EXCEPTION 'Win is already %', v_win.payment_status; END IF;
  IF v_win.payment_deadline < now() THEN RAISE EXCEPTION 'Payment deadline has passed'; END IF;

  UPDATE auction_wins
  SET payment_status = 'paid', paid_at = now()
  WHERE id = p_win_id;

  INSERT INTO orders (buyer_id, total)
  VALUES (v_win.winner_id, v_win.winning_bid)
  RETURNING id INTO v_order_id;

  INSERT INTO order_items (order_id, listing_id, seller_id, quantity, unit_price, fulfillment_status)
  VALUES (v_order_id, v_win.auction_id, v_win.seller_id, 1, v_win.winning_bid, 'confirmed');

  INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'auction_payment', 'auction_win', p_win_id,
    jsonb_build_object('auction_id', v_win.auction_id, 'amount', v_win.winning_bid, 'order_id', v_order_id));

  RETURN jsonb_build_object(
    'win_id', p_win_id,
    'payment_status', 'paid',
    'paid_at', now(),
    'order_id', v_order_id
  );
END;
$function$;

-- 5. Drop flash columns.
ALTER TABLE order_items
  DROP COLUMN IF EXISTS flash_pin_id,
  DROP COLUMN IF EXISTS item_name,
  DROP COLUMN IF EXISTS item_image_url;

ALTER TABLE auction_wins
  DROP COLUMN IF EXISTS flash_pin_id;

-- 6. Drop live tables (CASCADE clears dependent FKs / policies / publications).
DROP TABLE IF EXISTS live_auction_bids CASCADE;
DROP TABLE IF EXISTS live_stream_alerts CASCADE;
DROP TABLE IF EXISTS live_stream_pins CASCADE;
DROP TABLE IF EXISTS live_chat_messages CASCADE;
DROP TABLE IF EXISTS live_likes CASCADE;
DROP TABLE IF EXISTS live_viewers CASCADE;
DROP TABLE IF EXISTS stream_presets CASCADE;
DROP TABLE IF EXISTS live_streams CASCADE;

COMMIT;
