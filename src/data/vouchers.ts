import { supabase } from "../lib/supabase";

// DropsTCG → Evend prepaid vouchers. A user redeems a code into their profile,
// then applies the held credit at checkout (partial use supported).

export type VoucherStatus = "active" | "redeemed" | "used" | "expired" | "void";

export type Voucher = {
  id: string;
  code: string;
  face_value: number;
  remaining_value: number;
  currency: string;
  status: VoucherStatus;
  source: string | null;
  expires_at: string | null;
  redeemed_at: string | null;
  created_at: string;
};

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapVoucher(r: Record<string, unknown>): Voucher {
  return {
    id: String(r.id),
    code: String(r.code ?? ""),
    face_value: toNum(r.face_value),
    remaining_value: toNum(r.remaining_value),
    currency: String(r.currency ?? "myr"),
    status: (r.status as VoucherStatus) ?? "redeemed",
    source: (r.source as string) ?? null,
    expires_at: (r.expires_at as string) ?? null,
    redeemed_at: (r.redeemed_at as string) ?? null,
    created_at: String(r.created_at ?? ""),
  };
}

/** Vouchers the current user has redeemed (RLS scopes to redeemed_by = me). */
export async function fetchMyVouchers(): Promise<Voucher[]> {
  const { data, error } = await supabase
    .from("vouchers")
    .select("id, code, face_value, remaining_value, currency, status, source, expires_at, redeemed_at, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapVoucher(r as Record<string, unknown>));
}

/** Vouchers that can be applied at checkout right now. */
export async function fetchUsableVouchers(): Promise<Voucher[]> {
  const all = await fetchMyVouchers();
  const now = Date.now();
  return all.filter(
    (v) =>
      v.status === "redeemed" &&
      v.remaining_value > 0 &&
      (!v.expires_at || new Date(v.expires_at).getTime() > now),
  );
}

/** Redeems a voucher code into the current user's account. */
export async function redeemVoucher(code: string): Promise<{ status: string; code: string; remaining_value: number; face_value: number }> {
  const { data, error } = await supabase.rpc("redeem_voucher", { p_code: code });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as { status?: string; code?: string; remaining_value?: unknown; face_value?: unknown };
  return {
    status: d.status ?? "redeemed",
    code: d.code ?? code,
    remaining_value: toNum(d.remaining_value),
    face_value: toNum(d.face_value),
  };
}
