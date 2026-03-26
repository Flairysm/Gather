import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { countUnreadConversations } from "../data/messages";

export type BadgeCounts = {
  unreadChats: number;
  unreadNotifications: number;
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

async function computeUnreadNotifications(userId: string): Promise<number> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("notifications_last_seen_at")
    .eq("id", userId)
    .maybeSingle();

  const seenAt = profile?.notifications_last_seen_at
    ? new Date(profile.notifications_last_seen_at).getTime()
    : 0;

  const [winsRes, bidsRes, ordersRes] = await Promise.all([
    supabase
      .from("auction_wins")
      .select("id, created_at, payment_status")
      .eq("winner_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("auction_bids")
      .select("id, auction_id, created_at, auction:auction_items!auction_id(status, highest_bidder_id)")
      .eq("bidder_id", userId)
      .order("created_at", { ascending: false })
      .limit(150),
    supabase
      .from("order_items")
      .select("id, fulfillment_status, created_at, order:orders!inner(id, buyer_id)")
      .eq("order.buyer_id", userId)
      .order("created_at", { ascending: false })
      .limit(150),
  ]);

  let count = 0;

  for (const w of winsRes.data ?? []) {
    if ((w as any).payment_status !== "pending" && (w as any).payment_status !== "expired") continue;
    if (new Date((w as any).created_at).getTime() > seenAt) count += 1;
  }

  const seenOutbid = new Set<string>();
  for (const b of bidsRes.data ?? []) {
    const auction = Array.isArray((b as any).auction) ? (b as any).auction[0] : (b as any).auction;
    if (!auction || auction.status !== "active") continue;
    if (auction.highest_bidder_id === userId) continue;
    if (seenOutbid.has((b as any).auction_id)) continue;
    seenOutbid.add((b as any).auction_id);
    if (new Date((b as any).created_at).getTime() > seenAt) count += 1;
  }

  for (const oi of ordersRes.data ?? []) {
    const st = (oi as any).fulfillment_status;
    if (st !== "shipped" && st !== "delivered") continue;
    if (new Date((oi as any).created_at).getTime() > seenAt) count += 1;
  }

  return count;
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
  const [{ data: orderItems }, { data: wins }] = await Promise.all([
    supabase
      .from("order_items")
      .select("order_id, fulfillment_status, order:orders!inner(id, buyer_id)")
      .eq("order.buyer_id", userId)
      .limit(500),
    // Only fetch unpaid auction wins — paid ones now create real order_items
    supabase
      .from("auction_wins")
      .select("id")
      .eq("winner_id", userId)
      .eq("payment_status", "pending")
      .limit(200),
  ]);

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
    const { data: reviews } = await supabase
      .from("reviews")
      .select("order_id")
      .eq("reviewer_id", userId)
      .in("order_id", deliveredOrderIds);
    const reviewed = new Set<string>((reviews ?? []).map((r: any) => r.order_id));
    byCategory.to_rate = deliveredOrderIds.filter((id) => !reviewed.has(id)).length;
  }

  // Unpaid auction wins count as "To Pay"
  byCategory.pending += (wins ?? []).length;

  const total = byCategory.pending + byCategory.confirmed + byCategory.shipped;
  return { total, byCategory };
}

export function useBadgeCounts() {
  const [counts, setCounts] = useState<BadgeCounts>({
    unreadChats: 0,
    unreadNotifications: 0,
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
        myOrders: 0,
        myOrdersByCategory: emptyOrderCategoryCounts(),
      });
      return;
    }

    const [unreadChats, unreadNotifications, myOrderBadges] = await Promise.all([
      countUnreadConversations(userId),
      computeUnreadNotifications(userId),
      computeMyOrdersBadges(userId),
    ]);

    setCounts({
      unreadChats,
      unreadNotifications,
      myOrders: myOrderBadges.total,
      myOrdersByCategory: myOrderBadges.byCategory,
    });
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
    const id = setInterval(() => {
      refresh().catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  return { counts, refresh };
}

