import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";

import { C, S } from "../theme";
import { supabase } from "../lib/supabase";
import { useAppNavigation } from "../navigation/NavigationContext";

type NotificationItem = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  createdAt: string;
  cta?: string;
  action?: () => void;
};

type Props = { onBack: () => void };

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function NotificationHubScreen({ onBack }: Props) {
  const { push } = useAppNavigation();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<NotificationItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }

    await supabase
      .from("profiles")
      .update({ notifications_last_seen_at: new Date().toISOString() })
      .eq("id", user.id);

    const [winsRes, bidsRes, ordersRes] = await Promise.all([
      supabase
        .from("auction_wins")
        .select("id, auction_id, payment_status, payment_deadline, created_at, winning_bid, auction:auction_items!auction_id(card_name)")
        .eq("winner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("auction_bids")
        .select("id, auction_id, amount, created_at, auction:auction_items!auction_id(card_name, status, highest_bidder_id)")
        .eq("bidder_id", user.id)
        .order("created_at", { ascending: false })
        .limit(80),
      supabase
        .from("order_items")
        .select("id, fulfillment_status, created_at, listing:listings!order_items_listing_id_fkey(id, card_name), order:orders!inner(id, buyer_id)")
        .eq("order.buyer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(80),
    ]);

    const notifications: NotificationItem[] = [];

    for (const w of winsRes.data ?? []) {
      const auction = Array.isArray((w as any).auction) ? (w as any).auction[0] : (w as any).auction;
      const name = auction?.card_name ?? "Auction item";
      if ((w as any).payment_status === "pending") {
        notifications.push({
          id: `win-pending-${(w as any).id}`,
          icon: "card-outline",
          title: "Payment due for won auction",
          subtitle: `${name} · RM${Number((w as any).winning_bid ?? 0).toLocaleString("en-MY")}`,
          createdAt: (w as any).created_at,
          cta: "Pay now",
          action: () => push({ type: "MY_AUCTIONS" }),
        });
      } else if ((w as any).payment_status === "expired") {
        notifications.push({
          id: `win-expired-${(w as any).id}`,
          icon: "alert-circle-outline",
          title: "Auction payment expired",
          subtitle: `${name} · Payment deadline passed`,
          createdAt: (w as any).created_at,
          cta: "View",
          action: () => push({ type: "MY_AUCTIONS" }),
        });
      }
    }

    const seenOutbid = new Set<string>();
    for (const b of bidsRes.data ?? []) {
      const auction = Array.isArray((b as any).auction) ? (b as any).auction[0] : (b as any).auction;
      if (!auction || auction.status !== "active") continue;
      if (auction.highest_bidder_id === user.id) continue;
      if (seenOutbid.has((b as any).auction_id)) continue;
      seenOutbid.add((b as any).auction_id);
      notifications.push({
        id: `outbid-${(b as any).id}`,
        icon: "trending-down-outline",
        title: "You were outbid",
        subtitle: `${auction.card_name ?? "Auction item"} · Place a higher bid`,
        createdAt: (b as any).created_at,
        cta: "Bid again",
        action: () => push({ type: "AUCTION_DETAIL", auctionId: (b as any).auction_id }),
      });
    }

    for (const oi of ordersRes.data ?? []) {
      const listing = Array.isArray((oi as any).listing) ? (oi as any).listing[0] : (oi as any).listing;
      if (!listing) continue;
      if ((oi as any).fulfillment_status === "shipped") {
        notifications.push({
          id: `order-shipped-${(oi as any).id}`,
          icon: "cube-outline",
          title: "Order shipped",
          subtitle: `${listing.card_name ?? "Item"} is on the way`,
          createdAt: (oi as any).created_at,
          cta: "Track",
          action: () => push({ type: "MY_ORDERS", filter: "shipped" }),
        });
      } else if ((oi as any).fulfillment_status === "delivered") {
        notifications.push({
          id: `order-delivered-${(oi as any).id}`,
          icon: "checkmark-done-circle-outline",
          title: "Order delivered",
          subtitle: `${listing.card_name ?? "Item"} delivered · You can rate now`,
          createdAt: (oi as any).created_at,
          cta: "Rate",
          action: () => push({ type: "MY_ORDERS", filter: "to_rate" }),
        });
      }
    }

    notifications.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    setRows(notifications.slice(0, 80));
    setLoading(false);
  }, [push]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  const empty = useMemo(() => !loading && rows.length === 0, [loading, rows.length]);

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />

      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>Notification Hub</Text>
        <Pressable style={st.backBtn} onPress={load}>
          <Ionicons name="refresh" size={16} color={C.textPrimary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={st.centerWrap}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : empty ? (
        <View style={st.centerWrap}>
          <Ionicons name="notifications-off-outline" size={40} color={C.textMuted} />
          <Text style={st.emptyTitle}>No notifications</Text>
          <Text style={st.emptySub}>New auction, order, and bid updates will show up here.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={st.list}
          renderItem={({ item }) => (
            <Pressable style={st.row} onPress={item.action} disabled={!item.action}>
              <View style={st.iconWrap}>
                <Ionicons name={item.icon} size={17} color={C.accent} />
              </View>
              <View style={st.info}>
                <Text style={st.title}>{item.title}</Text>
                <Text style={st.sub} numberOfLines={2}>{item.subtitle}</Text>
                <Text style={st.time}>{relativeTime(item.createdAt)}</Text>
              </View>
              {item.cta ? <Text style={st.cta}>{item.cta}</Text> : null}
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S.screenPadding,
    paddingVertical: S.md,
    gap: S.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 40,
  },
  emptyTitle: { color: C.textPrimary, fontSize: 16, fontWeight: "800" },
  emptySub: { color: C.textSecondary, fontSize: 12, textAlign: "center" },
  list: { paddingHorizontal: S.screenPadding, paddingVertical: 12, gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accentGlow,
  },
  info: { flex: 1, gap: 2 },
  title: { color: C.textPrimary, fontSize: 13, fontWeight: "800" },
  sub: { color: C.textSecondary, fontSize: 11, fontWeight: "500" },
  time: { color: C.textMuted, fontSize: 10, fontWeight: "600", marginTop: 2 },
  cta: { color: C.accent, fontSize: 11, fontWeight: "800" },
});
