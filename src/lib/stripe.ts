// Stripe publishable (client) key + shared client config for the mobile app.
// The publishable key is safe to ship; the SECRET key lives only in Supabase
// Edge Function secrets and must never appear in the app bundle.

export const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

// Deep-link scheme used so redirect-based payment methods (FPX, GrabPay) can
// return to the app. Must match `expo.scheme` in app.json.
export const STRIPE_URL_SCHEME = "evend";

if (!STRIPE_PUBLISHABLE_KEY) {
  console.warn(
    "Missing EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY. Add the Evend Stripe " +
      "publishable (pk_live_... / pk_test_...) key to your .env. Payments will not work without it.",
  );
}
