import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type WalletLedgerEntry = {
  id: string;
  amount: number;
  balance_after: number;
  type: "topup" | "purchase" | "auction" | "refund" | "conversion" | "adjustment";
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_at: string;
};

/** Wallet amounts use 2-decimal RM precision. */
export function formatRM(amount: number): string {
  return `RM${Number(amount).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export type WalletSnapshot = {
  /** Total funds in the wallet. */
  balance: number;
  /** Funds reserved by the user's active (highest) auction bids. */
  held: number;
  /** Spendable / bid-able funds (balance − held). */
  available: number;
};

export async function getWallet(): Promise<WalletSnapshot> {
  const { data, error } = await supabase.rpc("get_wallet");
  if (error) throw error;
  const d = (data ?? {}) as Partial<WalletSnapshot>;
  const balance = Number(d.balance ?? 0);
  const held = Number(d.held ?? 0);
  const available = Number(d.available ?? Math.max(balance - held, 0));
  return { balance, held, available };
}

export async function getWalletBalance(): Promise<number> {
  return (await getWallet()).balance;
}

/**
 * Starts a Stripe-funded wallet top-up. Returns the PaymentIntent client secret
 * for the mobile Payment Sheet. The wallet is credited asynchronously by the
 * Stripe webhook once payment succeeds — not here.
 */
export async function createWalletTopup(
  amount: number,
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const { data, error } = await supabase.functions.invoke("create-wallet-topup", {
    body: { amount },
  });
  if (error) {
    let message = error.message;
    const ctx = (error as { context?: { json?: () => Promise<{ message?: string; error?: string }> } }).context;
    if (ctx?.json) {
      try {
        const j = await ctx.json();
        message = j.message ?? j.error ?? message;
      } catch {
        // keep default message
      }
    }
    throw new Error(message);
  }
  const d = (data ?? {}) as { client_secret?: string; payment_intent_id?: string; message?: string };
  if (!d.client_secret) throw new Error(d.message ?? "Could not start top-up");
  return { clientSecret: d.client_secret, paymentIntentId: d.payment_intent_id ?? "" };
}

export async function fetchWalletLedger(limit = 50): Promise<WalletLedgerEntry[]> {
  const { data, error } = await supabase
    .from("wallet_ledger")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as WalletLedgerEntry[];
}

// ── Context for a shared, live balance across widgets ──

type WalletContextValue = {
  balance: number;
  /** Funds reserved by active auction bids. */
  held: number;
  /** Spendable / bid-able funds (balance − held). */
  available: number;
  loading: boolean;
  refresh: () => Promise<void>;
  setBalance: (value: number) => void;
};

const WalletContext = createContext<WalletContextValue>({
  balance: 0,
  held: 0,
  available: 0,
  loading: true,
  refresh: async () => {},
  setBalance: () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [balance, setBalance] = useState(0);
  const [held, setHeld] = useState(0);
  const [available, setAvailable] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setBalance(0);
        setHeld(0);
        setAvailable(0);
        return;
      }
      const snap = await getWallet();
      setBalance(snap.balance);
      setHeld(snap.held);
      setAvailable(snap.available);
    } catch {
      // keep last known values
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  return (
    <WalletContext.Provider value={{ balance, held, available, loading, refresh, setBalance }}>
      {children}
    </WalletContext.Provider>
  );
}
