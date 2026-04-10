import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { countUnreadConversations } from "../data/messages";

export type BadgeCounts = {
  unreadChats: number;
  unreadNotifications: number;
  pendingShipments: number;
  myOrders: number;
  myOrdersByCategory: {
    pending: number;
    confirmed: number;
    shipped: number;
    delivered: number;
    to_rate: number;
    refunded: number;
    cancelled: number;
  };
};

export type BadgeContextValue = {
  counts: BadgeCounts;
  refresh: () => Promise<void>;
};

export const BadgeContext = createContext<BadgeContextValue>({
  counts: {
    unreadChats: 0,
    unreadNotifications: 0,
    pendingShipments: 0,
    myOrders: 0,
    myOrdersByCategory: {
      pending: 0, confirmed: 0, shipped: 0, delivered: 0,
      to_rate: 0, refunded: 0, cancelled: 0,
    },
  },
  refresh: async () => {},
});

export function useBadgeContext() {
  return useContext(BadgeContext);
}

async function computeUnreadNotifications(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) console.warn("Badge: unread notifications error:", error.message);
  return count ?? 0;
}

async function computePendingShipments(userId: string): Promise<number> {
  const { data: sellerListings, error: listErr } = await supabase
    .from("listings")
    .select("id")
    .eq("seller_id", userId)
    .limit(500);
  if (listErr) {
    console.warn("Badge: seller listings error:", listErr.message);
    return 0;
  }
  if (!sellerListings || sellerListings.length === 0) return 0;

  const listingIds = sellerListings.map((l: any) => l.id);
  const { count, error } = await supabase
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .in("listing_id", listingIds)
    .eq("fulfillment_status", "confirmed");
  if (error) console.warn("Badge: pending shipments error:", error.message);

  return count ?? 0;
}

function emptyOrderCategoryCounts() {
  return {
    pending: 0,
    confirmed: 0,
    shipped: 0,
    delivered: 0,
    to_rate: 0,
    refunded: 0,
    cancelled: 0,
  };
}

async function computeMyOrdersBadges(userId: string): Promise<{
  total: number;
  byCategory: BadgeCounts["myOrdersByCategory"];
}> {
  const [orderResult, winsResult] = await Promise.all([
    supabase
      .from("order_items")
      .select("order_id, fulfillment_status, order:orders!inner(id, buyer_id)")
      .eq("order.buyer_id", userId)
      .limit(500),
    supabase
      .from("auction_wins")
      .select("id")
      .eq("winner_id", userId)
      .eq("payment_status", "pending")
      .limit(200),
  ]);
  if (orderResult.error) console.warn("Badge: order items error:", orderResult.error.message);
  if (winsResult.error) console.warn("Badge: auction wins error:", winsResult.error.message);
  const orderItems = orderResult.data;
  const wins = winsResult.data;

  const byCategory = emptyOrderCategoryCounts();
  const statusPriority = [
    "cancelled",
    "refunded",
    "pending",
    "confirmed",
    "shipped",
    "delivered",
  ];

  const orderStatuses = new Map<string, Set<string>>();
  for (const row of orderItems ?? []) {
    const orderId = (row as any).order_id as string;
    if (!orderId) continue;
    const raw = ((row as any).fulfillment_status ?? "") as string;
    const st = raw === "pending" ? "confirmed" : raw;
    const set = orderStatuses.get(orderId) ?? new Set<string>();
    if (st) set.add(st);
    orderStatuses.set(orderId, set);
  }

  const deliveredOrderIds: string[] = [];
  for (const [orderId, statuses] of orderStatuses) {
    const finalStatus =
      statusPriority.find((st) => statuses.has(st)) ?? "confirmed";
    if (finalStatus in byCategory) {
      (byCategory as any)[finalStatus] += 1;
    }
    if (finalStatus === "delivered") deliveredOrderIds.push(orderId);
  }

  if (deliveredOrderIds.length > 0) {
    const { data: reviews, error: revErr } = await supabase
      .from("reviews")
      .select("order_id")
      .eq("reviewer_id", userId)
      .in("order_id", deliveredOrderIds);
    if (revErr) console.warn("Badge: reviews error:", revErr.message);
    const reviewed = new Set<string>((reviews ?? []).map((r: any) => r.order_id));
    byCategory.to_rate = deliveredOrderIds.filter((id) => !reviewed.has(id)).length;
  }

  // Unpaid auction wins count as "To Pay"
  byCategory.pending += (wins ?? []).length;

  const total = byCategory.pending + byCategory.confirmed + byCategory.shipped + byCategory.to_rate;
  return { total, byCategory };
}

export function useBadgeCounts() {
  const [counts, setCounts] = useState<BadgeCounts>({
    unreadChats: 0,
    unreadNotifications: 0,
    pendingShipments: 0,
    myOrders: 0,
    myOrdersByCategory: emptyOrderCategoryCounts(),
  });

  const refresh = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      setCounts({
        unreadChats: 0,
        unreadNotifications: 0,
        pendingShipments: 0,
        myOrders: 0,
        myOrdersByCategory: emptyOrderCategoryCounts(),
      });
      return;
    }

    const [unreadChats, unreadNotifications, pendingShipments, myOrderBadges] = await Promise.all([
      countUnreadConversations(userId),
      computeUnreadNotifications(userId),
      computePendingShipments(userId),
      computeMyOrdersBadges(userId),
    ]);

    setCounts({
      unreadChats,
      unreadNotifications,
      pendingShipments,
      myOrders: myOrderBadges.total,
      myOrdersByCategory: myOrderBadges.byCategory,
    });
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
    const id = setInterval(() => {
      refresh().catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel("badge-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => { refresh().catch(() => {}); },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_items" },
        () => { refresh().catch(() => {}); },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        () => { refresh().catch(() => {}); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  return { counts, refresh };
}

