import { useStripe } from "@stripe/stripe-react-native";
import { supabase } from "../lib/supabase";

// Card-at-checkout payment flow (Stripe). Replaces the wallet as the payment
// method for marketplace orders and auction wins. The buyer is charged on the
// Evend platform balance; funds settle to per-order escrow once Stripe confirms.

export type CartLineInput = { listing_id: string; quantity: number; offer_id?: string };

/** Snapshot of the buyer's shipping address, stored on the order for the seller. */
export type ShippingAddressSnapshot = {
  full_name: string;
  phone: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string | null;
  label?: string | null;
};

async function invokeError(error: { message: string; context?: { json?: () => Promise<{ message?: string; error?: string }> } }): Promise<string> {
  let message = error.message;
  const ctx = error.context;
  if (ctx?.json) {
    try {
      const j = await ctx.json();
      message = j.message ?? j.error ?? message;
    } catch {
      // keep default
    }
  }
  return message;
}

export type CreateOrderPaymentResult = {
  /** Empty when the voucher fully covered the cart (no card charge). */
  clientSecret: string;
  paymentIntentId: string;
  orderIds: string[];
  /** Server-authoritative grand total (before voucher). */
  total: number;
  /** Amount of voucher credit applied to this checkout. */
  voucherApplied: number;
  /** Amount charged to the card (total − voucherApplied). */
  payable: number;
  /** True when a voucher covered the whole cart and orders are already settled. */
  fullyPaid: boolean;
};

/** Reserves stock + creates a PaymentIntent for a marketplace cart. */
export async function createOrderPayment(
  items: CartLineInput[],
  shippingFee: number,
  shippingAddress?: ShippingAddressSnapshot | null,
  voucherCode?: string | null,
): Promise<CreateOrderPaymentResult> {
  const { data, error } = await supabase.functions.invoke("create-order-payment", {
    body: {
      items,
      shipping_fee: shippingFee,
      shipping_address: shippingAddress ?? null,
      voucher_code: voucherCode ?? null,
    },
  });
  if (error) throw new Error(await invokeError(error as any));
  const d = (data ?? {}) as {
    client_secret?: string; payment_intent_id?: string; order_ids?: string[];
    total?: number; payable?: number; voucher_applied?: number; paid?: boolean; message?: string;
  };
  const total = Number(d.total ?? 0);
  const voucherApplied = Number(d.voucher_applied ?? 0);
  // Voucher fully covered the cart: settled server-side, nothing to charge.
  if (d.paid === true) {
    return {
      clientSecret: "",
      paymentIntentId: "",
      orderIds: d.order_ids ?? [],
      total,
      voucherApplied,
      payable: 0,
      fullyPaid: true,
    };
  }
  if (!d.client_secret) throw new Error(d.message ?? "Could not start payment");
  return {
    clientSecret: d.client_secret,
    paymentIntentId: d.payment_intent_id ?? "",
    orderIds: d.order_ids ?? [],
    total,
    voucherApplied,
    payable: Number(d.payable ?? total),
    fullyPaid: false,
  };
}

/** Creates (or reuses) a PaymentIntent for an auction win. */
export async function createAuctionPayment(
  winId: string,
  shippingFee: number,
  shippingAddress?: ShippingAddressSnapshot | null,
): Promise<{ clientSecret: string; paymentIntentId: string; orderId: string; total: number }> {
  const { data, error } = await supabase.functions.invoke("create-auction-payment", {
    body: { win_id: winId, shipping_fee: shippingFee, shipping_address: shippingAddress ?? null },
  });
  if (error) throw new Error(await invokeError(error as any));
  const d = (data ?? {}) as { client_secret?: string; payment_intent_id?: string; order_id?: string; total?: number; message?: string };
  if (!d.client_secret) throw new Error(d.message ?? "Could not start payment");
  return {
    clientSecret: d.client_secret,
    paymentIntentId: d.payment_intent_id ?? "",
    orderId: d.order_id ?? "",
    total: Number(d.total ?? 0),
  };
}

/** Releases reserved stock for unpaid order(s) when the buyer abandons the sheet. */
export async function cancelCardOrder(orderIds: string[]): Promise<void> {
  if (!orderIds.length) return;
  await supabase.rpc("cancel_card_order", { p_order_ids: orderIds });
}

/**
 * Seller-initiated cancel of a paid, not-yet-shipped order. Refunds the buyer to
 * their original source (card via Stripe, voucher/wallet restored) and restocks.
 */
export async function sellerCancelOrder(orderId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("cancel-order", {
    body: { order_id: orderId },
  });
  if (error) throw new Error(await invokeError(error as any));
}

/**
 * Buyer-initiated cancel of a paid order the seller failed to ship within the
 * 5-day window. Server validates the deadline lapsed, then refunds to source.
 */
export async function buyerCancelOverdueOrder(orderId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("cancel-order", {
    body: { order_id: orderId },
  });
  if (error) throw new Error(await invokeError(error as any));
}

export type PayResult = { status: "paid" | "canceled" | "failed"; message?: string };

/**
 * Presents the Stripe Payment Sheet for a PaymentIntent client secret.
 * Use inside a component (it relies on the StripeProvider hook).
 */
export function useCardPayment() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  return async function pay(clientSecret: string): Promise<PayResult> {
    const init = await initPaymentSheet({
      paymentIntentClientSecret: clientSecret,
      merchantDisplayName: "Evend",
      returnURL: "evend://stripe-redirect",
      // Escrow needs immediate capture, so no delayed/asynchronous methods here.
      allowsDelayedPaymentMethods: false,
    });
    if (init.error) return { status: "failed", message: init.error.message };

    const res = await presentPaymentSheet();
    if (res.error) {
      return { status: res.error.code === "Canceled" ? "canceled" : "failed", message: res.error.message };
    }
    return { status: "paid" };
  };
}
