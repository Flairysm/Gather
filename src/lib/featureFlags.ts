// Runtime feature flags.
//
// WALLET_TOPUP_ENABLED: a user-funded, stored-value wallet spendable across many
// third-party sellers likely qualifies as "e-money" under Bank Negara Malaysia's
// rules (EMI licensing, capital requirements). For the compliant MVP we keep the
// wallet code but DISABLE real-money top-ups and pay per order by card instead.
// Flip this on only once you hold the appropriate approval/licence.
export const WALLET_TOPUP_ENABLED =
  process.env.EXPO_PUBLIC_WALLET_TOPUP_ENABLED === "true";
