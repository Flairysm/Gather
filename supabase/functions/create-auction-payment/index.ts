// Edge Function: create-auction-payment
//
// Card payment for an auction win. Stages an order via pay_auction_win_card
// (escrow 'pending', linked to the win) and creates a PaymentIntent on the Evend
// PLATFORM balance. The win flips to 'paid' + escrow 'held' only after Stripe
// confirms, via stripe-webhook -> confirm_card_order. Re-entrant: if a pending
// charge already exists for the win, its client_secret is returned again.

import Stripe from "npm:stripe@18";
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
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let orderId: string | null = null;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const authed = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user }, error: uErr } = await authed.auth.getUser();
    if (uErr || !user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const winId = String(body.win_id ?? "");
    const shippingFee = Math.round(Number(body.shipping_fee ?? 0) * 100) / 100;
    const shippingAddress = body.shipping_address ?? null;
    if (!winId) return json({ error: "no_win", message: "Missing auction win." }, 400);

    const { data: staged, error: sErr } = await authed.rpc("pay_auction_win_card", {
      p_win_id: winId,
      p_shipping_fee: Number.isFinite(shippingFee) ? shippingFee : 0,
      p_shipping_address: shippingAddress,
    });
    if (sErr) return json({ error: "checkout_failed", message: sErr.message }, 400);

    orderId = (staged?.order_id ?? null) as string | null;
    const total = Number(staged?.total ?? 0);
    if (!orderId || !(total > 0)) {
      return json({ error: "checkout_failed", message: "Could not stage your payment." }, 400);
    }

    const stripe = getStripe();

    // Re-entrant: reuse the existing PaymentIntent if this win is already in flight.
    if (staged?.reused && staged?.payment_intent_id) {
      const existing = await stripe.paymentIntents.retrieve(staged.payment_intent_id as string);
      if (existing.client_secret && existing.status !== "succeeded" && existing.status !== "canceled") {
        return json({ client_secret: existing.client_secret, payment_intent_id: existing.id, order_id: orderId, total });
      }
    }

    const { data: profile } = await admin
      .from("profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle();
    let customerId = profile?.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { evend_user_id: user.id },
      });
      customerId = customer.id;
      await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    const pi = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency: "myr",
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      metadata: { evend_user_id: user.id, purpose: "order_payment", order_ids: orderId, auction_win_id: winId },
    });

    await admin.from("order_payments").update({ payment_intent_id: pi.id }).eq("order_id", orderId);

    return json({ client_secret: pi.client_secret, payment_intent_id: pi.id, order_id: orderId, total });
  } catch (e) {
    if (orderId) {
      await admin.rpc("_void_card_orders", { p_order_ids: [orderId] }).catch(() => {});
    }
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: "stripe_error", message }, 400);
  }
});
