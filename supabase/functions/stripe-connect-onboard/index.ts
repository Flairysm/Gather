// Edge Function: stripe-connect-onboard
//
// Creates (once) a Connect connected account for the calling seller and returns
// a Stripe-hosted onboarding (account link) URL. Also syncs the account's
// charges/payouts/details status back onto vendor_stores on every call.
//
// Account model: Standard connected account (controller: full Stripe dashboard,
// connected account is loss-liable and pays its own Stripe fees, Stripe collects
// KYC and hosts onboarding). This is the ONLY model a Malaysia (MY) platform can
// use: MY platforms are not allowed to be loss-liable, and Express dashboards
// REQUIRE the platform to control losses — so Express is rejected. Standard
// (dashboard "full" + losses.payments "stripe") is loss-liable on the connected
// account, which MY permits, and supports Connect-hosted onboarding via account
// links. We still use separate charges & transfers (escrow): the buyer is
// charged on the PLATFORM account and funds reach the seller via Transfers, so
// the connected account only needs `card_payments` + `transfers` capabilities.
//
// Required secret: STRIPE_SECRET_KEY (restricted test key needs Connect write,
// and later: PaymentIntents, Transfers, Customers, Refunds write).
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are auto-injected.

import Stripe from "npm:stripe@18";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

  try {
    const authed = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const {
      data: { user },
      error: uErr,
    } = await authed.auth.getUser();
    if (uErr || !user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: store, error: sErr } = await admin
      .from("vendor_stores")
      .select("id, profile_id, store_name, stripe_account_id")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (sErr) return json({ error: "db_error", message: sErr.message }, 400);
    if (!store)
      return json(
        { error: "no_store", message: "Create your store before setting up payouts." },
        400,
      );

    const stripe = getStripe();

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const returnBase = `${SUPABASE_URL}/functions/v1/stripe-onboard-return`;
    const returnUrl = (body.return_url as string) ?? `${returnBase}?status=done`;
    const refreshUrl = (body.refresh_url as string) ?? `${returnBase}?status=refresh`;

    let accountId = store.stripe_account_id as string | null;
    if (!accountId) {
      const account = await stripe.accounts.create({
        country: "MY",
        email: user.email ?? undefined,
        controller: {
          // Standard account: full Stripe dashboard, connected account is
          // loss-liable and pays its own Stripe fees (required for MY, where the
          // platform may not be loss-liable). Stripe collects requirements.
          stripe_dashboard: { type: "full" },
          fees: { payer: "account" },
          losses: { payments: "stripe" },
          requirement_collection: "stripe",
        },
        // full dashboard + transfers requires card_payments too; funds still
        // reach the seller via Transfers (separate charges & transfers).
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: { name: store.store_name ?? undefined },
        metadata: { evend_profile_id: user.id, evend_store_id: store.id },
      });
      accountId = account.id;
      await admin
        .from("vendor_stores")
        .update({ stripe_account_id: accountId })
        .eq("id", store.id);
    }

    const acct = await stripe.accounts.retrieve(accountId);
    await admin
      .from("vendor_stores")
      .update({
        stripe_charges_enabled: acct.charges_enabled,
        stripe_payouts_enabled: acct.payouts_enabled,
        stripe_details_submitted: acct.details_submitted,
        stripe_onboarded_at: acct.details_submitted ? new Date().toISOString() : null,
      })
      .eq("id", store.id);

    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      return_url: returnUrl,
      refresh_url: refreshUrl,
    });

    return json({
      url: link.url,
      account_id: accountId,
      charges_enabled: acct.charges_enabled,
      payouts_enabled: acct.payouts_enabled,
      details_submitted: acct.details_submitted,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Surface Stripe error shape (type/code/param) so the cause is visible in
    // Edge Function logs and to the client during setup.
    const anyErr = e as { type?: string; code?: string; param?: string; statusCode?: number };
    console.error("stripe-connect-onboard failed:", JSON.stringify({
      message,
      type: anyErr?.type,
      code: anyErr?.code,
      param: anyErr?.param,
      statusCode: anyErr?.statusCode,
    }));
    return json(
      { error: "stripe_error", message, type: anyErr?.type, code: anyErr?.code, param: anyErr?.param },
      400,
    );
  }
});
