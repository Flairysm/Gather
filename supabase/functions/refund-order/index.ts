// Edge Function: refund-order  (verify_jwt=false; service-role bearer only)
//
// Refunds a still-held order during the dispute window. Called by admin tooling
// and by the dispute-resolution flow (resolve in buyer's favor).
//   * Card / mixed: issues a Stripe refund for the CARD portion only
//     (amount − voucher_amount), then flips DB state.
//   * Voucher portion: restored to the voucher inside apply_order_refund.
//   * Wallet-funded: credited back to the wallet inside apply_order_refund.
// Only valid while escrow_status = 'held' (before payout).
//
// NOTE: calls the Stripe REST API directly with `fetch` (no npm: SDK) to avoid
// the cold-start BOOT_ERROR risk on edge isolates.

import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

function encodeForm(params: Record<string, unknown>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

async function stripeRefund(params: Record<string, unknown>, idempotencyKey: string): Promise<void> {
  if (!STRIPE_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set on this Edge Function. Add it in Supabase → Edge Functions → Secrets.");
  }
  const res = await fetch("https://api.stripe.com/v1/refunds", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${STRIPE_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyKey,
    },
    body: encodeForm(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Stripe refund failed (${res.status})`);
  }
}

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
      .select("order_id, funding_source, payment_intent_id, escrow_status, amount, voucher_amount")
      .eq("order_id", orderId)
      .maybeSingle();
    if (error) return json({ error: "db_error", message: error.message }, 400);
    if (!op) return json({ error: "not_found" }, 404);
    if (op.escrow_status === "refunded") return json({ status: "already_refunded" });
    if (op.escrow_status !== "held")
      return json({ status: "not_refundable", escrow_status: op.escrow_status });

    // Card portion = total − voucher credit. Refund that exact amount on Stripe.
    const cardAmount = Math.max(0, Math.round((Number(op.amount) - Number(op.voucher_amount ?? 0)) * 100));
    if (cardAmount > 0 && op.payment_intent_id && (op.funding_source === "card" || op.funding_source === "mixed")) {
      await stripeRefund(
        { payment_intent: op.payment_intent_id as string, amount: cardAmount },
        `refund_${orderId}`,
      );
    }

    // Restores voucher/wallet portions, restocks unshipped items, flips state.
    const { data: result, error: rpcError } = await admin.rpc("apply_order_refund", {
      p_order_id: orderId,
    });
    if (rpcError) return json({ error: "db_error", message: rpcError.message }, 400);

    return json(result ?? { status: "refunded" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[refund-order] failed:", message, e);
    return json({ error: "stripe_error", message }, 400);
  }
});
