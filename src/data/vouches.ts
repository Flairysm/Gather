import { supabase } from "../lib/supabase";

export type Voucher = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  note: string | null;
  is_followed: boolean;
};

export type SellerVouches = {
  total: number;
  has_vouched: boolean;
  eligible: boolean;
  followed_count: number;
  sample: Voucher[];
};

const EMPTY: SellerVouches = {
  total: 0,
  has_vouched: false,
  eligible: false,
  followed_count: 0,
  sample: [],
};

/** Aggregate vouch data for a seller, social-graph aware (followed first). */
export async function fetchSellerVouches(sellerId: string): Promise<SellerVouches> {
  const { data, error } = await supabase.rpc("get_seller_vouches", {
    p_seller_id: sellerId,
  });
  if (error || !data) {
    if (error) console.warn("fetchSellerVouches:", error.message);
    return EMPTY;
  }
  const d = data as any;
  return {
    total: d.total ?? 0,
    has_vouched: !!d.has_vouched,
    eligible: !!d.eligible,
    followed_count: d.followed_count ?? 0,
    sample: Array.isArray(d.sample) ? (d.sample as Voucher[]) : [],
  };
}

/** Vouch for a seller. Server enforces the "completed order" gate. */
export async function addVouch(
  sellerId: string,
  note?: string | null,
): Promise<{ vouch_count: number }> {
  const { data, error } = await supabase.rpc("add_vouch", {
    p_seller_id: sellerId,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
  return { vouch_count: (data as any)?.vouch_count ?? 0 };
}

/** Remove your vouch for a seller. */
export async function removeVouch(sellerId: string): Promise<{ vouch_count: number }> {
  const { data, error } = await supabase.rpc("remove_vouch", {
    p_seller_id: sellerId,
  });
  if (error) throw new Error(error.message);
  return { vouch_count: (data as any)?.vouch_count ?? 0 };
}
