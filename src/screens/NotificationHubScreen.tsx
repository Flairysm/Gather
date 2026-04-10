import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";

import { C, S } from "../theme";
import { supabase } from "../lib/supabase";
import { useAppNavigation } from "../navigation/NavigationContext";
import { useBadgeContext } from "../hooks/useBadgeCounts";
import ErrorState from "../components/ErrorState";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  icon: string;
  color: string;
  reference_type: string | null;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
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
  const { refresh: refreshBadges } = useBadgeContext();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setRows([]); setLoading(false); return; }

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.warn("NotificationHub load error:", error.message);
      setLoadError(true);
      setLoading(false);
      return;
    }

    const fetched = ((data as NotificationRow[]) ?? []);
    setRows(fetched);

    const hasUnread = fetched.some((r) => !r.is_read);
    if (hasUnread) {
      const { error: markErr } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (markErr) {
        console.warn("NotificationHub mark-read error:", markErr.message);
      } else {
        setRows((prev) => prev.map((r) => ({ ...r, is_read: true })));
      }
    }

    const { error: seenErr } = await supabase
      .from("profiles")
      .update({ notifications_last_seen_at: new Date().toISOString() })
      .eq("id", user.id);
    if (seenErr) console.warn("NotificationHub last_seen update error:", seenErr.message);

    refreshBadges().catch(() => {});
    setLoading(false);
  }, [refreshBadges]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  function handleTap(notif: NotificationRow) {
    switch (notif.type) {
      case "new_sale":
        push({ type: "VENDOR_HUB" });
        break;
      case "order_shipped":
        push({ type: "MY_ORDERS", filter: "shipped" });
        break;
      case "order_delivered":
        push({ type: "MY_ORDERS", filter: "to_rate" });
        break;
      case "auction_won":
      case "auction_outbid":
        push({ type: "MY_AUCTIONS" });
        break;
      case "dispute_opened":
        push({ type: "VENDOR_HUB" });
        break;
      case "dispute_resolved":
        push({ type: "MY_ORDERS", filter: "delivered" });
        break;
      default:
        break;
    }
  }

  const markAllRead = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    setRows((prev) => prev.map((r) => ({ ...r, is_read: true })));
    refreshBadges().catch(() => {});
  }, [refreshBadges]);

  const unreadCount = useMemo(() => rows.filter((r) => !r.is_read).length, [rows]);
  const empty = useMemo(() => !loading && rows.length === 0, [loading, rows.length]);

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />

      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>Notifications</Text>
        <Pressable style={st.backBtn} onPress={load}>
          <Ionicons name="refresh" size={16} color={C.textPrimary} />
        </Pressable>
      </View>

      {unreadCount > 0 && (
        <Pressable style={st.markAllBar} onPress={markAllRead}>
          <Text style={st.markAllText}>Mark all as read ({unreadCount})</Text>
        </Pressable>
      )}

      {loading ? (
        <View style={st.centerWrap}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : loadError ? (
        <ErrorState
          message="Failed to load notifications. Check your connection and try again."
          onRetry={() => { setLoadError(false); load(); }}
        />
      ) : empty ? (
        <View style={st.centerWrap}>
          <Ionicons name="notifications-off-outline" size={40} color={C.textMuted} />
          <Text style={st.emptyTitle}>No notifications</Text>
          <Text style={st.emptySub}>Order updates, sales, and auction alerts will show up here.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={st.list}
          renderItem={({ item }) => (
            <Pressable
              style={[st.row, !item.is_read && st.rowUnread]}
              onPress={() => handleTap(item)}
            >
              <View style={[st.iconWrap, { backgroundColor: item.color + "18" }]}>
                <Ionicons name={item.icon as any} size={17} color={item.color} />
              </View>
              <View style={st.info}>
                <Text style={st.title}>{item.title}</Text>
                <Text style={st.sub} numberOfLines={2}>{item.body}</Text>
                <Text style={st.time}>{relativeTime(item.created_at)}</Text>
              </View>
              {!item.is_read && <View style={st.unreadDot} />}
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
  markAllBar: {
    paddingHorizontal: S.screenPadding,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    alignItems: "flex-end",
  },
  markAllText: { color: C.accent, fontSize: 12, fontWeight: "700" },
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
  rowUnread: {
    borderColor: C.borderStream,
    backgroundColor: C.accentGlow,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  info: { flex: 1, gap: 2 },
  title: { color: C.textPrimary, fontSize: 13, fontWeight: "800" },
  sub: { color: C.textSecondary, fontSize: 11, fontWeight: "500" },
  time: { color: C.textMuted, fontSize: 10, fontWeight: "600", marginTop: 2 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.accent,
  },
});
