import { supabase } from "../lib/supabase";

export type SellerBalance = {
  /** Net (after fee) held in escrow (not yet releasable). */
  in_escrow: number;
  /** Lifetime net (after fee) released from escrow. */
  released_total: number;
  /** Withdrawable now (released − requested − paid). */
  available: number;
  /** Sum of open withdrawal requests. */
  pending: number;
  /** Lifetime amount actually paid out. */
  lifetime_paid: number;
  /** Platform fee rate applied to earnings (e.g. 0.05 = 5%). */
  fee_rate: number;
  /** Gross item earnings before the platform fee. */
  gross_earned: number;
};

export type PayoutAccount = {
  account_holder: string;
  bank_name: string;
  account_number: string;
  phone: string | null;
  ic_number: string | null;
  updated_at?: string;
};

export type SellerPayoutStatus = "requested" | "paid" | "cancelled" | "rejected";

export type SellerPayout = {
  id: string;
  amount: number;
  status: SellerPayoutStatus;
  account_holder: string | null;
  bank_name: string | null;
  account_number: string | null;
  reference: string | null;
  note: string | null;
  requested_at: string;
  paid_at: string | null;
  created_at: string;
};

const EMPTY_BALANCE: SellerBalance = {
  in_escrow: 0,
  released_total: 0,
  available: 0,
  pending: 0,
  lifetime_paid: 0,
  fee_rate: 0.05,
  gross_earned: 0,
};

export async function getSellerBalance(): Promise<SellerBalance> {
  const { data, error } = await supabase.rpc("get_seller_balance");
  if (error) throw error;
  const d = (data ?? {}) as Partial<SellerBalance>;
  return {
    in_escrow: Number(d.in_escrow ?? 0),
    released_total: Number(d.released_total ?? 0),
    available: Number(d.available ?? 0),
    pending: Number(d.pending ?? 0),
    lifetime_paid: Number(d.lifetime_paid ?? 0),
    fee_rate: Number(d.fee_rate ?? 0.05),
    gross_earned: Number(d.gross_earned ?? 0),
  };
}

export async function getPayoutAccount(): Promise<PayoutAccount | null> {
  const { data, error } = await supabase.rpc("get_payout_account");
  if (error) throw error;
  if (!data) return null;
  const d = data as PayoutAccount;
  return {
    account_holder: d.account_holder ?? "",
    bank_name: d.bank_name ?? "",
    account_number: d.account_number ?? "",
    phone: d.phone ?? null,
    ic_number: d.ic_number ?? null,
    updated_at: d.updated_at,
  };
}

export async function savePayoutAccount(input: {
  account_holder: string;
  bank_name: string;
  account_number: string;
  phone?: string | null;
  ic_number?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("save_payout_account", {
    p_account_holder: input.account_holder,
    p_bank_name: input.bank_name,
    p_account_number: input.account_number,
    p_phone: input.phone ?? null,
    p_ic_number: input.ic_number ?? null,
  });
  if (error) throw error;
}

/** Request a withdrawal. Pass null/undefined to withdraw the full available balance. */
export async function requestPayout(amount?: number | null): Promise<{ amount: number }> {
  const { data, error } = await supabase.rpc("request_payout", {
    p_amount: amount ?? null,
  });
  if (error) throw error;
  return { amount: Number((data as { amount?: number })?.amount ?? 0) };
}

export async function cancelPayout(payoutId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_payout", { p_payout_id: payoutId });
  if (error) throw error;
}

export async function fetchSellerPayouts(limit = 50): Promise<SellerPayout[]> {
  const { data, error } = await supabase
    .from("seller_payouts")
    .select("id, amount, status, account_holder, bank_name, account_number, reference, note, requested_at, paid_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })) as SellerPayout[];
}

export { EMPTY_BALANCE };
