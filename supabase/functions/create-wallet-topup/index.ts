// Edge Function: create-wallet-topup
//
// Creates a PaymentIntent (on the Evend PLATFORM balance) to fund a wallet
// top-up, and records a pending wallet_topups row. The wallet is credited only
// after Stripe confirms payment, via the stripe-webhook -> credit_wallet_topup.
//
// Returns the client_secret for the mobile Payment Sheet. No card is saved
// (no ephemeral key) — keeps the MVP simple and avoids API-version coupling.

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

// Lazy, guarded init: an empty key makes Stripe's constructor throw, so building
// the client at module scope would crash the isolate with an opaque 500 boot
// error. Constructing it inside the handler surfaces a clear, catchable message.
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

const MAX_TOPUP = 10000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authed = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const {
      data: { user },
      error: uErr,
    } = await authed.auth.getUser();
    if (uErr || !user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const amount = Math.round(Number(body.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      return json({ error: "invalid_amount", message: "Enter a valid top-up amount." }, 400);
    }
    if (amount > MAX_TOPUP) {
      return json({ error: "amount_too_large", message: `Maximum top-up is RM${MAX_TOPUP}.` }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    const stripe = getStripe();

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
      amount: Math.round(amount * 100),
      currency: "myr",
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      metadata: { evend_user_id: user.id, purpose: "wallet_topup" },
    });

    await admin.from("wallet_topups").insert({
      user_id: user.id,
      payment_intent_id: pi.id,
      amount,
      status: "pending",
    });

    return json({ client_secret: pi.client_secret, payment_intent_id: pi.id, amount });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: "stripe_error", message }, 400);
  }
});
