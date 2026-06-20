// Edge Function: release-escrow  (verify_jwt=false; service-role bearer only)
//
// Transfers held funds from the platform balance to the seller's connected
// account (separate charges & transfers). Called by:
//   * cron (batch: true)  -> releases everything past its dispute window
//   * admin (order_id)     -> manual/forced release of one order
// A Stripe idempotency key (per order) guarantees at most one Transfer.

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

type Target = { order_id: string; seller_stripe_account_id: string | null; transfer_amount: number };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!authorized(req)) return json({ error: "unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    let targets: Target[] = [];

    if (body.order_id) {
      const { data: op, error } = await admin
        .from("order_payments")
        .select("order_id, seller_stripe_account_id, amount, platform_fee, escrow_status")
        .eq("order_id", body.order_id)
        .maybeSingle();
      if (error) return json({ error: "db_error", message: error.message }, 400);
      if (!op) return json({ error: "not_found" }, 404);
      if (op.escrow_status !== "held")
        return json({ status: "not_held", escrow_status: op.escrow_status });
      if (!op.seller_stripe_account_id)
        return json({ error: "seller_not_onboarded" }, 400);
      targets = [{
        order_id: op.order_id as string,
        seller_stripe_account_id: op.seller_stripe_account_id as string,
        transfer_amount: Number(op.amount) - Number(op.platform_fee),
      }];
    } else {
      const { data, error } = await admin.rpc("escrow_releasable");
      if (error) return json({ error: "db_error", message: error.message }, 400);
      targets = (data ?? []) as Target[];
    }

    const stripe = getStripe();
    const released: unknown[] = [];
    for (const t of targets) {
      if (!t.seller_stripe_account_id || Number(t.transfer_amount) <= 0) continue;
      try {
        const transfer = await stripe.transfers.create(
          {
            amount: Math.round(Number(t.transfer_amount) * 100),
            currency: "myr",
            destination: t.seller_stripe_account_id,
            metadata: { order_id: t.order_id },
          },
          { idempotencyKey: `release_${t.order_id}` },
        );
        await admin.rpc("mark_escrow_released", { p_order_id: t.order_id, p_transfer_id: transfer.id });
        released.push({ order_id: t.order_id, transfer_id: transfer.id, status: "released" });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        released.push({ order_id: t.order_id, status: "error", message });
      }
    }

    return json({ released });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: "stripe_error", message }, 400);
  }
});
