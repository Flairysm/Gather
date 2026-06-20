import { supabase } from "../lib/supabase";

export type SellerTier = "Bronze" | "Silver" | "Gold" | "Platinum";

export type SellerTrust = {
  score: number;
  tier: SellerTier;
  response_minutes: number | null;
  response_label: string | null;
};

/** Friendly passport-style trust summary (score, tier, response time). */
export async function fetchSellerTrust(sellerId: string): Promise<SellerTrust | null> {
  const { data, error } = await supabase.rpc("get_seller_trust", {
    p_seller_id: sellerId,
  });
  if (error || !data) {
    if (error) console.warn("fetchSellerTrust:", error.message);
    return null;
  }
  const d = data as any;
  return {
    score: d.score ?? 0,
    tier: (d.tier ?? "Bronze") as SellerTier,
    response_minutes: d.response_minutes ?? null,
    response_label: d.response_label ?? null,
  };
}

export const TIER_COLORS: Record<SellerTier, string> = {
  Bronze: "#C98A5E",
  Silver: "#A8B0BC",
  Gold: "#E0A100",
  Platinum: "#7FB6D1",
};
