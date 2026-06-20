// Edge Function: stripe-webhook  (public — verify_jwt MUST be false)
//
// Single entry point for Stripe events. Verifies the signature, then routes.
// Handlers are IDEMPOTENT, so Stripe retries (and duplicate deliveries) are
// safe; stripe_events is recorded best-effort for audit only.
//
// Required secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
// Configure the endpoint in Stripe (test mode) ->
//   https://<project-ref>.functions.supabase.co/stripe-webhook
// Subscribe to: payment_intent.succeeded, payment_intent.payment_failed,
//   payment_intent.canceled, account.updated, charge.refunded,
//   transfer.created, transfer.reversed.

import Stripe from "npm:stripe@18";
import { createClient } from "jsr:@supabase/supabase-js@2";

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!STRIPE_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set on this Edge Function. Add it in Supabase → Edge Functions → Secrets.");
  }
  if (!_stripe) _stripe = new Stripe(STRIPE_KEY, { httpClient: Stripe.createFetchHttpClient() });
  return _stripe;
}
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const bodyText = await req.text();

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      bodyText,
      sig ?? "",
      WEBHOOK_SECRET,
      undefined,
      cryptoProvider,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(`Webhook signature verification failed: ${message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const purpose = pi.metadata?.purpose;
        if (purpose === "wallet_topup") {
          await admin.rpc("credit_wallet_topup", { p_payment_intent_id: pi.id });
        } else if (purpose === "order_payment") {
          // Settle the staged card order(s): escrow -> held, items -> confirmed,
          // auction win -> paid. Idempotent.
          await admin.rpc("confirm_card_order", {
            p_payment_intent_id: pi.id,
            p_charge_id: (pi.latest_charge as string) ?? null,
          });
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const purpose = pi.metadata?.purpose;
        if (purpose === "wallet_topup") {
          await admin
            .from("wallet_topups")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("payment_intent_id", pi.id)
            .neq("status", "credited");
        }
        // For order_payment we intentionally do NOT release stock here. A failed
        // charge attempt is not terminal: Stripe keeps the PaymentIntent
        // retryable (status 'requires_payment_method'), and a subsequent
        // payment_intent.succeeded can still settle it. Voiding on this event
        // caused successfully-paid orders to be deleted when a stale
        // failed-attempt event was delivered alongside the success. Stock is
        // released on explicit cancel (cancel_card_order, called by the client
        // when the buyer dismisses/fails the sheet) or on payment_intent.canceled.
        break;
      }

      case "payment_intent.canceled": {
        const pi = event.data.object as Stripe.PaymentIntent;
        if (pi.metadata?.purpose === "order_payment") {
          // PaymentIntent is terminally canceled — release any still-reserved stock.
          await admin.rpc("fail_card_order", { p_payment_intent_id: pi.id });
        }
        break;
      }

      case "account.updated": {
        const acct = event.data.object as Stripe.Account;
        await admin
          .from("vendor_stores")
          .update({
            stripe_charges_enabled: acct.charges_enabled,
            stripe_payouts_enabled: acct.payouts_enabled,
            stripe_details_submitted: acct.details_submitted,
          })
          .eq("stripe_account_id", acct.id);
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const pi = charge.payment_intent as string | null;
        if (pi) {
          await admin
            .from("order_payments")
            .update({ escrow_status: "refunded", refunded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("payment_intent_id", pi);
        }
        break;
      }

      default:
        break;
    }
  } catch (e) {
    console.error("stripe-webhook handler error", event.type, e);
    // 500 -> Stripe retries; handlers are idempotent so retries are safe.
    return new Response("handler error", { status: 500 });
  }

  // Best-effort audit record (duplicates ignored).
  await admin
    .from("stripe_events")
    .insert({ id: event.id, type: event.type, payload: event as unknown as Record<string, unknown> })
    .then(() => {})
    .catch(() => {});

  return new Response("ok", { status: 200 });
});
