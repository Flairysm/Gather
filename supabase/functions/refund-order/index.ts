// Edge Function: refund-order  (verify_jwt=false; service-role bearer only)
//
// Refunds a still-held order during the dispute window. Called by admin tooling.
//   * Card-funded:   issues a Stripe refund against the PaymentIntent, then
//                    flips DB state (the charge.refunded webhook is idempotent).
//   * Wallet-funded: credits the buyer's wallet via apply_order_refund.
// Only valid while escrow_status = 'held' (before payout).

import Stripe from "npm:stripe@18";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!STRIPE_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set on this Edge Function. Add it in Supabase → Edge Functions → Secrets.");
  }
  if (!_stripe) _stripe = new Stripe(STRIPE_KEY, { httpClient: Stripe.createFetchHttpClient() });
  return _stripe;
}
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

function authorized(req: Request): boolean {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  return token.length > 0 && token === SERVICE_ROLE;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!authorized(req)) return json({ error: "unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const orderId = body.order_id as string | undefined;
    if (!orderId) return json({ error: "order_id required" }, 400);

    const { data: op, error } = await admin
      .from("order_payments")
      .select("order_id, funding_source, payment_intent_id, escrow_status")
      .eq("order_id", orderId)
      .maybeSingle();
    if (error) return json({ error: "db_error", message: error.message }, 400);
    if (!op) return json({ error: "not_found" }, 404);
    if (op.escrow_status === "refunded") return json({ status: "already_refunded" });
    if (op.escrow_status !== "held")
      return json({ status: "not_refundable", escrow_status: op.escrow_status });

    // Card-funded: refund the PaymentIntent on Stripe first.
    if (op.funding_source === "card" && op.payment_intent_id) {
      await getStripe().refunds.create(
        { payment_intent: op.payment_intent_id as string },
        { idempotencyKey: `refund_${orderId}` },
      );
    }

    const { data: result, error: rpcError } = await admin.rpc("apply_order_refund", {
      p_order_id: orderId,
    });
    if (rpcError) return json({ error: "db_error", message: rpcError.message }, 400);

    return json(result ?? { status: "refunded" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: "stripe_error", message }, 400);
  }
});
