import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";
import { C, S } from "../theme";
import { supabase } from "../lib/supabase";
import { useAppNavigation } from "../navigation/NavigationContext";

type FulfillmentStatus = "pending" | "confirmed" | "shipped" | "delivered";
type FilterId = "all" | FulfillmentStatus;

type OrderItem = {
  id: string;
  order_id: string;
  listing_id: string;
  quantity: number;
  unit_price: number;
  fulfillment_status: FulfillmentStatus;
  created_at: string;
  listing: {
    id: string;
    card_name: string;
    edition: string | null;
    grade: string | null;
    images: string[];
  } | null;
  seller: {
    username: string;
    display_name: string | null;
  } | null;
};

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
  { id: "shipped", label: "Shipped" },
  { id: "delivered", label: "Delivered" },
];

const STATUS_CONFIG: Record<
  FulfillmentStatus,
  { label: string; icon: string; color: string; bg: string; border: string }
> = {
  pending: {
    label: "Pending",
    icon: "time-outline",
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.25)",
  },
  confirmed: {
    label: "Confirmed",
    icon: "checkmark-circle-outline",
    color: C.accent,
    bg: "rgba(44,128,255,0.08)",
    border: "rgba(44,128,255,0.25)",
  },
  shipped: {
    label: "Shipped",
    icon: "airplane-outline",
    color: "#8B5CF6",
    bg: "rgba(139,92,246,0.08)",
    border: "rgba(139,92,246,0.25)",
  },
  delivered: {
    label: "Delivered",
    icon: "checkmark-done-circle-outline",
    color: C.success,
    bg: "rgba(34,197,94,0.08)",
    border: "rgba(34,197,94,0.25)",
  },
};

function normalizeImages(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === "string" && !!v);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed))
        return parsed.filter((v): v is string => typeof v === "string" && !!v);
    } catch {
      /* no-op */
    }
  }
  return [];
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function MyOrdersScreen({ onBack }: { onBack: () => void }) {
  const { push } = useAppNavigation();
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterId>("all");

  const loadOrders = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("order_items")
        .select(`
          id, order_id, listing_id, quantity, unit_price, fulfillment_status, created_at,
          listing:listings(id, card_name, edition, grade, images),
          seller:profiles!seller_id(username, display_name)
        `)
        .eq("order_id.buyer_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        const { data: orders } = await supabase
          .from("orders")
          .select("id")
          .eq("buyer_id", user.id);

        if (!orders || orders.length === 0) {
          setItems([]);
          return;
        }

        const orderIds = orders.map((o) => o.id);
        const { data: fallbackData } = await supabase
          .from("order_items")
          .select(`
            id, order_id, listing_id, quantity, unit_price, fulfillment_status, created_at,
            listing:listings(id, card_name, edition, grade, images),
            seller:profiles!seller_id(username, display_name)
          `)
          .in("order_id", orderIds)
          .order("created_at", { ascending: false });

        const mapped = (fallbackData ?? []).map((row: any) => ({
          ...row,
          listing: Array.isArray(row.listing) ? row.listing[0] : row.listing,
          seller: Array.isArray(row.seller) ? row.seller[0] : row.seller,
        }));
        for (const m of mapped) {
          if (m.listing) m.listing.images = normalizeImages(m.listing.images);
        }
        setItems(mapped);
        return;
      }

      const mapped = (data ?? []).map((row: any) => ({
        ...row,
        listing: Array.isArray(row.listing) ? row.listing[0] : row.listing,
        seller: Array.isArray(row.seller) ? row.seller[0] : row.seller,
      }));
      for (const m of mapped) {
        if (m.listing) m.listing.images = normalizeImages(m.listing.images);
      }
      setItems(mapped);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const filtered =
    filter === "all" ? items : items.filter((oi) => oi.fulfillment_status === filter);

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>My Orders</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={st.loadingWrap}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      ) : (
        <>
          {/* Filters */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={st.filterRow}
            style={{ flexGrow: 0 }}
          >
            {FILTERS.map((f) => (
              <Pressable
                key={f.id}
                style={[st.filterChip, filter === f.id && st.filterChipActive]}
                onPress={() => setFilter(f.id)}
              >
                <Text
                  style={[st.filterChipText, filter === f.id && st.filterChipTextActive]}
                >
                  {f.label}
                  {f.id !== "all" &&
                    ` (${items.filter((i) => i.fulfillment_status === f.id).length})`}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {filtered.length === 0 ? (
            <View style={st.emptyState}>
              <Ionicons name="receipt-outline" size={48} color={C.textMuted} />
              <Text style={st.emptyTitle}>
                {filter === "all" ? "No orders yet" : `No ${filter} orders`}
              </Text>
              <Text style={st.emptySub}>
                {filter === "all"
                  ? "Items you purchase will appear here"
                  : "Try a different filter"}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              contentContainerStyle={st.list}
              renderItem={({ item: oi }) => {
                const cfg = STATUS_CONFIG[oi.fulfillment_status];
                const imgUrl = oi.listing?.images?.[0];
                const sellerName =
                  oi.seller?.display_name ?? oi.seller?.username ?? "Seller";

                return (
                  <Pressable
                    style={st.card}
                    onPress={() => {
                      if (oi.listing?.id)
                        push({ type: "LISTING_DETAIL", listingId: oi.listing.id });
                    }}
                  >
                    <View style={st.cardThumb}>
                      {imgUrl ? (
                        <Image source={{ uri: imgUrl }} style={st.cardThumbImg} />
                      ) : (
                        <Ionicons name="image-outline" size={20} color={C.textMuted} />
                      )}
                    </View>
                    <View style={st.cardBody}>
                      <Text style={st.cardName} numberOfLines={1}>
                        {oi.listing?.card_name ?? "Item"}
                      </Text>
                      <Text style={st.cardMeta}>
                        {oi.listing?.edition ?? ""}
                        {oi.listing?.grade ? ` · ${oi.listing.grade}` : ""}
                      </Text>
                      <View style={st.sellerRow}>
                        <View style={st.sellerDot} />
                        <Text style={st.sellerName}>@{sellerName}</Text>
                      </View>
                    </View>
                    <View style={st.cardRight}>
                      <Text style={st.cardPrice}>
                        ${(oi.quantity * Number(oi.unit_price)).toLocaleString()}
                      </Text>
                      <Text style={st.cardQty}>Qty: {oi.quantity}</Text>
                      <View
                        style={[
                          st.statusChip,
                          { backgroundColor: cfg.bg, borderColor: cfg.border },
                        ]}
                      >
                        <Ionicons name={cfg.icon as any} size={10} color={cfg.color} />
                        <Text style={[st.statusText, { color: cfg.color }]}>
                          {cfg.label}
                        </Text>
                      </View>
                      <Text style={st.cardTime}>{relativeTime(oi.created_at)}</Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

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

  filterRow: {
    flexDirection: "row",
    paddingHorizontal: S.screenPadding,
    gap: 8,
    marginBottom: S.md,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  filterChipActive: {
    backgroundColor: C.accentGlow,
    borderColor: C.accent,
  },
  filterChipText: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  filterChipTextActive: {
    color: C.accent,
  },

  list: {
    paddingHorizontal: S.screenPadding,
    paddingBottom: 40,
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    gap: 10,
    marginBottom: 8,
  },
  cardThumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  cardThumbImg: {
    width: 52,
    height: 52,
    borderRadius: 12,
  },
  cardBody: {
    flex: 1,
  },
  cardName: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  cardMeta: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
  },
  sellerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  sellerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.accent,
  },
  sellerName: {
    color: C.textAccent,
    fontSize: 11,
    fontWeight: "600",
  },
  cardRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  cardPrice: {
    color: C.accent,
    fontSize: 14,
    fontWeight: "900",
  },
  cardQty: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "600",
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
  },
  cardTime: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: "500",
  },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingBottom: 80,
  },
  emptyTitle: {
    color: C.textPrimary,
    fontSize: 17,
    fontWeight: "800",
  },
  emptySub: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
