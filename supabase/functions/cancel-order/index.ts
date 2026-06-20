// Edge Function: cancel-order  (user-authed: the seller of the order)
//
// Lets a seller cancel a paid order before it ships and ACTUALLY refund the buyer
// (previously "Cancel Order" only flipped a status and kept the money). Refunds to
// the original source: card portion via Stripe, voucher/wallet portions restored
// in-DB by apply_order_refund. Stock is returned to sale.
//
//   * escrow 'pending' (card not yet confirmed): void + restock, no charge existed.
//   * escrow 'held'   (paid):                    refund card portion + restore + restock.
// Disallowed once an item has shipped/delivered (use the dispute flow instead).

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
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

function encodeForm(params: Record<string, unknown>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

async function stripeRefund(params: Record<string, unknown>, idempotencyKey: string): Promise<void> {
  if (!STRIPE_KEY) throw new Error("STRIPE_SECRET_KEY is not set on this Edge Function.");
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
  if (!res.ok) throw new Error(data?.error?.message ?? `Stripe refund failed (${res.status})`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authed = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user }, error: uErr } = await authed.auth.getUser();
    if (uErr || !user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const orderId = (body.order_id ?? null) as string | null;
    if (!orderId) return json({ error: "order_id required" }, 400);

    const { data: op, error } = await admin
      .from("order_payments")
      .select("order_id, seller_id, buyer_id, funding_source, payment_intent_id, escrow_status, amount, voucher_amount")
      .eq("order_id", orderId)
      .maybeSingle();
    if (error) return json({ error: "db_error", message: error.message }, 400);
    if (!op) return json({ error: "not_found" }, 404);

    const isSeller = op.seller_id === user.id;
    const isBuyer = op.buyer_id === user.id;
    if (!isSeller && !isBuyer) return json({ error: "forbidden" }, 403);

    // A buyer may only cancel once the seller has missed the ship-by deadline.
    if (isBuyer && !isSeller) {
      const { data: overdue, error: oErr } = await admin.rpc("is_shipment_overdue", { p_order_id: orderId });
      if (oErr) return json({ error: "db_error", message: oErr.message }, 400);
      if (!overdue) {
        return json({ error: "not_overdue", message: "You can only cancel after the seller misses the 5-day ship deadline." }, 400);
      }
    }

    // Block once anything in the order has shipped — that's a dispute, not a cancel.
    const { data: items } = await admin
      .from("order_items")
      .select("fulfillment_status")
      .eq("order_id", orderId);
    const shipped = (items ?? []).some(
      (i: { fulfillment_status: string }) => i.fulfillment_status === "shipped" || i.fulfillment_status === "delivered",
    );
    if (shipped) return json({ error: "already_shipped", message: "This order has already shipped and can't be cancelled." }, 400);

    let result: unknown;
    if (op.escrow_status === "pending") {
      // Unpaid (card never confirmed) — just void + restock.
      const { error: vErr } = await admin.rpc("_void_card_orders", { p_order_ids: [orderId] });
      if (vErr) return json({ error: "db_error", message: vErr.message }, 400);
      result = { status: "voided" };
    } else if (op.escrow_status === "held") {
      const cardAmount = Math.max(0, Math.round((Number(op.amount) - Number(op.voucher_amount ?? 0)) * 100));
      if (cardAmount > 0 && op.payment_intent_id && (op.funding_source === "card" || op.funding_source === "mixed")) {
        await stripeRefund({ payment_intent: op.payment_intent_id as string, amount: cardAmount }, `refund_${orderId}`);
      }
      const { data: r, error: rErr } = await admin.rpc("apply_order_refund", { p_order_id: orderId });
      if (rErr) return json({ error: "db_error", message: rErr.message }, 400);
      result = r ?? { status: "refunded" };

      // Notify the appropriate counterparty depending on who cancelled.
      const notif = isSeller && !isBuyer
        ? {
            user_id: op.buyer_id,
            title: "Order cancelled & refunded",
            body: "The seller cancelled your order. Your payment has been refunded to its original source.",
          }
        : {
            user_id: op.seller_id,
            title: "Buyer cancelled an overdue order",
            body: "The buyer cancelled an order you didn't ship in time. Their payment has been refunded.",
          };
      await admin.from("notifications").insert({
        ...notif,
        type: "order_cancelled",
        icon: "close-circle-outline",
        color: "#EF4444",
        reference_type: "order",
        reference_id: orderId,
      }).then(() => {}, () => {});

      // Buyer cancelled because the seller missed the ship deadline → strike seller.
      if (isBuyer && !isSeller) {
        await admin.rpc("add_strike", {
          p_user_id: op.seller_id,
          p_kind: "seller_no_ship",
          p_reason: "Did not ship a paid order within the 5-day deadline",
          p_ref_type: "order",
          p_ref_id: orderId,
        }).then(() => {}, () => {});
      }
    } else {
      return json({ status: "not_cancellable", escrow_status: op.escrow_status }, 400);
    }

    return json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cancel-order] failed:", message, e);
    return json({ error: "cancel_failed", message }, 400);
  }
});
