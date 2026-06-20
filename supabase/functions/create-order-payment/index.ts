// Edge Function: create-order-payment
//
// Card-at-checkout for marketplace orders. Validates + reserves stock and stages
// the order(s) via create_card_checkout (one order per seller, escrow 'pending'),
// then creates ONE PaymentIntent on the Evend PLATFORM balance for the server-
// authoritative total. Funds are settled to escrow ('held') only after Stripe
// confirms payment, via stripe-webhook -> confirm_card_order.
//
// Returns the client_secret for the mobile Payment Sheet, plus the staged
// order_ids so the app can release the reservation if the buyer dismisses the
// sheet (cancel_card_order).
//
// NOTE: We call the Stripe REST API directly with `fetch` (no `npm:stripe` SDK).
// The SDK's npm: import can fail to resolve on a cold edge isolate, producing an
// uncatchable BOOT_ERROR (HTTP 500) that bypasses the request try/catch. Direct
// fetch removes that cold-start risk and makes every Stripe error catchable.

import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

// Flatten a nested params object into Stripe's form-encoded bracket notation,
// e.g. { metadata: { a: 1 }, automatic_payment_methods: { enabled: true } } ->
// "metadata[a]=1&automatic_payment_methods[enabled]=true".
function encodeForm(params: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const k = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object") {
      parts.push(encodeForm(value as Record<string, unknown>, k));
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

async function stripeRequest(path: string, params: Record<string, unknown>): Promise<Record<string, any>> {
  if (!STRIPE_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set on this Edge Function. Add it in Supabase → Edge Functions → Secrets.");
  }
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${STRIPE_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encodeForm(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message ?? `Stripe ${path} failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let orderIds: string[] = [];
  let voucherRedemptionId: string | null = null;
  let admin: ReturnType<typeof createClient> | null = null;

  try {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const authed = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user }, error: uErr } = await authed.auth.getUser();
    if (uErr || !user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const items = Array.isArray(body.items) ? body.items : [];
    const shippingFee = Math.round(Number(body.shipping_fee ?? 0) * 100) / 100;
    const shippingAddress = body.shipping_address ?? null;
    const voucherCode = typeof body.voucher_code === "string" && body.voucher_code.trim() ? body.voucher_code.trim() : null;
    if (items.length === 0) return json({ error: "no_items", message: "Your cart is empty." }, 400);

    // Reserve stock + stage the orders (server-authoritative pricing). A voucher,
    // if supplied, is reserved here and reduces the amount we charge on the card.
    const { data: staged, error: sErr } = await authed.rpc("create_card_checkout", {
      p_items: items,
      p_shipping_fee: Number.isFinite(shippingFee) ? shippingFee : 0,
      p_shipping_address: shippingAddress,
      p_voucher_code: voucherCode,
    });
    if (sErr) return json({ error: "checkout_failed", message: sErr.message }, 400);

    orderIds = (staged?.order_ids ?? []) as string[];
    const total = Number(staged?.total ?? 0);
    const voucherApplied = Number(staged?.voucher_applied ?? 0);
    const payable = Number(staged?.payable ?? total);
    voucherRedemptionId = (staged?.voucher_redemption_id ?? null) as string | null;
    if (!orderIds.length || !(total > 0)) {
      return json({ error: "checkout_failed", message: "Could not stage your order." }, 400);
    }

    // Voucher fully covers the cart — already settled in the RPC, no card charge.
    if (staged?.fully_paid === true || payable <= 0) {
      return json({ paid: true, order_ids: orderIds, total, voucher_applied: voucherApplied });
    }

    const { data: profile } = await admin
      .from("profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle();
    let customerId = profile?.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripeRequest("customers", {
        email: user.email ?? undefined,
        metadata: { evend_user_id: user.id },
      });
      customerId = customer.id as string;
      await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    const pi = await stripeRequest("payment_intents", {
      amount: Math.round(payable * 100),
      currency: "myr",
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      metadata: { evend_user_id: user.id, purpose: "order_payment", order_ids: orderIds.join(",") },
    });

    // Link the staged escrow rows to this PaymentIntent so the webhook can settle.
    await admin.from("order_payments").update({ payment_intent_id: pi.id }).in("order_id", orderIds);
    // Link the reserved voucher credit to the same PaymentIntent (consumed on confirm).
    if (voucherRedemptionId) {
      await admin.from("voucher_redemptions").update({ payment_intent_id: pi.id }).eq("id", voucherRedemptionId);
    }

    return json({
      client_secret: pi.client_secret,
      payment_intent_id: pi.id,
      order_ids: orderIds,
      total,
      payable,
      voucher_applied: voucherApplied,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Surface the real cause in the Edge Function logs (otherwise a throw here
    // becomes an opaque non-2xx with no body for the client to read).
    console.error("[create-order-payment] failed:", message, e);
    // On any failure after staging (e.g. Stripe error), release reserved stock
    // and any voucher credit we reserved for this checkout.
    if (admin && orderIds.length) {
      await admin.rpc("_void_card_orders", { p_order_ids: orderIds }).catch(() => {});
    }
    if (admin && voucherRedemptionId) {
      await admin.rpc("release_voucher_reservation", { p_redemption_id: voucherRedemptionId }).catch(() => {});
    }
    return json({ error: "stripe_error", message }, 400);
  }
});
