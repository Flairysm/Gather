-- Maintain profiles.total_sales from order_items.
--
-- total_sales is shown on the public vendor store page ("Sales") and feeds the
-- seller-quality signal in the ranking algorithm, but nothing ever populated it
-- (it sat at 0 even for sellers with completed orders). This adds a trigger that
-- recomputes a seller's total_sales whenever their order_items change, plus a
-- one-time backfill.
--
-- A "sale" is counted the same way the seller's own Performance view counts
-- "Items Sold": the summed quantity of order_items in any state except
-- pending_payment (not yet paid), cancelled, or refunded.
--
-- profiles has a protect_profile_columns BEFORE UPDATE trigger that reverts
-- changes to total_sales unless the writer is service_role. PostgreSQL forbids
-- SET ROLE inside a SECURITY DEFINER function, so instead the protection is
-- relaxed to also allow total_sales to change when the write arrives via a
-- trusted trigger cascade (pg_trigger_depth() > 1, i.e. from the order_items
-- trigger below). Direct client UPDATEs (depth 1) remain blocked.

BEGIN;

CREATE OR REPLACE FUNCTION public._recompute_seller_sales(p_seller uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_seller IS NULL THEN RETURN; END IF;
  UPDATE profiles SET total_sales = (
    SELECT COALESCE(SUM(quantity), 0)
    FROM order_items
    WHERE seller_id = p_seller
      AND fulfillment_status NOT IN ('pending_payment', 'cancelled', 'refunded')
  )
  WHERE id = p_seller;
END;
$$;

CREATE OR REPLACE FUNCTION public._bump_seller_sales()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public._recompute_seller_sales(OLD.seller_id);
    RETURN NULL;
  END IF;

  PERFORM public._recompute_seller_sales(NEW.seller_id);
  IF TG_OP = 'UPDATE' AND NEW.seller_id IS DISTINCT FROM OLD.seller_id THEN
    PERFORM public._recompute_seller_sales(OLD.seller_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_seller_sales ON public.order_items;
CREATE TRIGGER trg_seller_sales
  AFTER INSERT OR DELETE OR UPDATE OF fulfillment_status, quantity, seller_id
  ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public._bump_seller_sales();

-- Relax column protection for total_sales when written by a trusted cascade.
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- Only service role (via RPCs/triggers) can change these
  IF current_setting('role', true) <> 'service_role' THEN
    NEW.role := OLD.role;
    NEW.rating := OLD.rating;
    NEW.review_count := OLD.review_count;
    -- total_sales is derived from order_items by _recompute_seller_sales, which
    -- runs from the order_items trigger (pg_trigger_depth() > 1). Allow that
    -- path; block direct client updates.
    IF pg_trigger_depth() <= 1 THEN
      NEW.total_sales := OLD.total_sales;
    END IF;
    NEW.total_purchases := OLD.total_purchases;
    NEW.verified_seller := OLD.verified_seller;
    NEW.transaction_banned := OLD.transaction_banned;
    NEW.transaction_ban_reason := OLD.transaction_ban_reason;
  END IF;
  RETURN NEW;
END;
$$;

-- One-time backfill for existing orders. Runs as service_role so the protection
-- trigger lets the direct UPDATE through.
SET LOCAL ROLE service_role;
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT seller_id FROM order_items WHERE seller_id IS NOT NULL LOOP
    PERFORM public._recompute_seller_sales(r.seller_id);
  END LOOP;
END $$;
RESET ROLE;

COMMIT;
