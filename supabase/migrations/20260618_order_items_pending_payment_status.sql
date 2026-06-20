-- Card-at-checkout stages order_items as 'pending_payment' until Stripe confirms.
-- Allow that value in the fulfillment_status check constraint.

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_fulfillment_status_check;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_fulfillment_status_check
  CHECK (fulfillment_status = ANY (ARRAY[
    'pending_payment'::text, 'pending'::text, 'confirmed'::text,
    'shipped'::text, 'delivered'::text, 'cancelled'::text, 'refunded'::text
  ]));
