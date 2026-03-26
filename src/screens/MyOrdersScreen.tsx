import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import TruncationNotice from "../components/TruncationNotice";

type FulfillmentStatus = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled" | "refunded";
type FilterId = "all" | FulfillmentStatus | "to_rate";

type OrderItemRow = {
  id: string;
  order_id: string;
  listing_id: string;
  seller_id: string;
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
    avatar_url: string | null;
    rating: number | null;
    review_count: number;
  } | null;
  source?: "market" | "auction";
  winId?: string;
  tracking_number?: string | null;
  delivered_at?: string | null;
  received_at?: string | null;
  dispute_deadline?: string | null;
};

type GroupedOrder = {
  orderId: string;
  sellerId: string;
  seller: OrderItemRow["seller"];
  status: FulfillmentStatus;
  total: number;
  itemCount: number;
  items: OrderItemRow[];
  createdAt: string;
  hasReview: boolean;
  reviewRating: number | null;
};

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "To Pay" },
  { id: "confirmed", label: "To Ship" },
  { id: "shipped", label: "To Receive" },
  { id: "delivered", label: "Completed" },
  { id: "to_rate", label: "To Rate" },
  { id: "refunded", label: "Refunded" },
  { id: "cancelled", label: "Cancelled" },
];

const STATUS_CONFIG: Record<
  FulfillmentStatus,
  { label: string; icon: string; color: string; bg: string; border: string }
> = {
  pending: {
    label: "To Pay",
    icon: "time-outline",
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.25)",
  },
  confirmed: {
    label: "To Ship",
    icon: "cube-outline",
    color: C.accent,
    bg: "rgba(44,128,255,0.08)",
    border: "rgba(44,128,255,0.25)",
  },
  shipped: {
    label: "Shipping",
    icon: "airplane-outline",
    color: "#8B5CF6",
    bg: "rgba(139,92,246,0.08)",
    border: "rgba(139,92,246,0.25)",
  },
  delivered: {
    label: "Completed",
    icon: "checkmark-done-circle-outline",
    color: C.success,
    bg: "rgba(34,197,94,0.08)",
    border: "rgba(34,197,94,0.25)",
  },
  cancelled: {
    label: "Cancelled",
    icon: "close-circle-outline",
    color: "#EF4444",
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.25)",
  },
  refunded: {
    label: "Refunded",
    icon: "receipt-outline",
    color: "#6B7280",
    bg: "rgba(107,114,128,0.08)",
    border: "rgba(107,114,128,0.25)",
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

function formatPrice(n: number): string {
  return `RM${n.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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
  return new Date(dateStr).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function MyOrdersScreen({
  onBack,
  initialFilter,
}: {
  onBack: () => void;
  initialFilter?: string;
}) {
  const { push } = useAppNavigation();
  const [rawItems, setRawItems] = useState<OrderItemRow[]>([]);
  const [reviewedOrders, setReviewedOrders] = useState<
    Record<string, { rating: number }>
  >({});
  const [loading, setLoading] = useState(true);
  const validFilters: FilterId[] = ["all", "pending", "confirmed", "shipped", "delivered", "to_rate", "refunded", "cancelled"];
  const [filter, setFilter] = useState<FilterId>(
    validFilters.includes(initialFilter as FilterId) ? (initialFilter as FilterId) : "all",
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [vendorStoreLogos, setVendorStoreLogos] = useState<Record<string, string>>(
    {},
  );

  const loadOrders = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const SELECT = `
        id, order_id, listing_id, seller_id, quantity, unit_price, fulfillment_status, created_at,
        tracking_number, delivered_at, received_at, dispute_deadline,
        listing:listings(id, card_name, edition, grade, images),
        seller:profiles!seller_id(username, display_name, avatar_url, rating, review_count)
      `;

      const { data, error } = await supabase
        .from("order_items")
        .select(SELECT)
        .eq("order_id.buyer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(500);

      let rows: any[] = data ?? [];

      if (error) {
        const { data: orders } = await supabase
          .from("orders")
          .select("id")
          .eq("buyer_id", user.id);

        if (!orders || orders.length === 0) {
          setRawItems([]);
          return;
        }

        const orderIds = orders.map((o) => o.id);
        const { data: fallbackData } = await supabase
          .from("order_items")
          .select(SELECT)
          .in("order_id", orderIds)
          .order("created_at", { ascending: false })
          .limit(500);

        rows = fallbackData ?? [];
      }

      // Shopee model: checkout = paid → market orders are at minimum "To Ship".
      // If the DB still has fulfillment_status='pending' it means payment went
      // through but seller hasn't acted yet, so bump to 'confirmed' (To Ship).
      const mapped: OrderItemRow[] = rows.map((row: any) => ({
        ...row,
        fulfillment_status:
          row.fulfillment_status === "pending" ? "confirmed" : row.fulfillment_status,
        listing: Array.isArray(row.listing) ? row.listing[0] : row.listing,
        seller: Array.isArray(row.seller) ? row.seller[0] : row.seller,
        source: "market",
      }));
      for (const m of mapped) {
        if (m.listing)
          (m.listing as any).images = normalizeImages(m.listing.images);
      }

      // Some rows can come back without nested listing due relation/RLS mismatch.
      // Hydrate those missing listing payloads directly by listing_id.
      const missingMarketListingIds = [
        ...new Set(
          mapped
            .filter((m) => !m.listing && !!m.listing_id)
            .map((m) => m.listing_id),
        ),
      ];
      const marketListingMap = new Map<string, any>();
      if (missingMarketListingIds.length > 0) {
        const { data: listingRows } = await supabase
          .from("listings")
          .select("id, card_name, edition, grade, images")
          .in("id", missingMarketListingIds);
        for (const l of listingRows ?? []) {
          marketListingMap.set((l as any).id, {
            id: (l as any).id,
            card_name: (l as any).card_name,
            edition: (l as any).edition ?? null,
            grade: (l as any).grade ?? null,
            images: normalizeImages((l as any).images),
          });
        }
      }
      const hydratedMapped: OrderItemRow[] = mapped.map((m) =>
        !m.listing && m.listing_id && marketListingMap.has(m.listing_id)
          ? { ...m, listing: marketListingMap.get(m.listing_id) }
          : m,
      );

      // Unpaid auction wins show as "To Pay" virtual rows.
      // Paid auction wins now create real order_items via the RPC, so they
      // appear alongside market orders above — no synthetic rows needed.
      const { data: wins } = await supabase
        .from("auction_wins")
        .select(`
          id, auction_id, seller_id, winning_bid, payment_status, created_at,
          auction:auction_items!auction_id(id, card_name, edition, grade, condition, images),
          seller:profiles!seller_id(username, display_name, avatar_url, rating, review_count)
        `)
        .eq("winner_id", user.id)
        .eq("payment_status", "pending")
        .order("created_at", { ascending: false })
        .limit(100);

      const auctionRows: OrderItemRow[] = (wins ?? []).map((w: any) => {
        const auction = Array.isArray(w.auction) ? w.auction[0] : w.auction;
        const seller = Array.isArray(w.seller) ? w.seller[0] : w.seller;
        return {
          id: `auction-${w.id}`,
          order_id: `auction-${w.id}`,
          listing_id: auction?.id ?? "",
          seller_id: w.seller_id,
          quantity: 1,
          unit_price: Number(w.winning_bid),
          fulfillment_status: "pending" as FulfillmentStatus,
          created_at: w.created_at,
          listing: auction
            ? {
                id: auction.id,
                card_name: auction.card_name,
                edition: auction.edition,
                grade: auction.grade ?? auction.condition ?? null,
                images: normalizeImages(auction.images),
              }
            : null,
          seller: seller ?? null,
          source: "auction",
          winId: w.id,
        };
      });

      // Hydrate missing auction listing data for unpaid wins
      const missingAuctionIds = [
        ...new Set(
          (wins ?? [])
            .filter((w: any) => {
              const auction = Array.isArray((w as any).auction)
                ? (w as any).auction[0]
                : (w as any).auction;
              return !auction && !!(w as any).auction_id;
            })
            .map((w: any) => (w as any).auction_id),
        ),
      ];
      const auctionMap = new Map<string, any>();
      if (missingAuctionIds.length > 0) {
        const { data: auctionItems } = await supabase
          .from("auction_items")
          .select("id, card_name, edition, grade, condition, images")
          .in("id", missingAuctionIds);
        for (const a of auctionItems ?? []) {
          auctionMap.set((a as any).id, {
            id: (a as any).id,
            card_name: (a as any).card_name,
            edition: (a as any).edition ?? null,
            grade: (a as any).grade ?? (a as any).condition ?? null,
            images: normalizeImages((a as any).images),
          });
        }
      }
      const hydratedAuctionRows = auctionRows.map((r, idx) => {
        if (r.listing) return r;
        const w = (wins ?? [])[idx] as any;
        const fallbackId = w?.auction_id;
        if (fallbackId && auctionMap.has(fallbackId)) {
          return { ...r, listing_id: fallbackId, listing: auctionMap.get(fallbackId) };
        }
        return r;
      });

      // For real order_items that reference auction_items (listing_id points to
      // auction_items.id), hydrate listing data from auction_items table.
      const missingListingIds = [
        ...new Set(
          hydratedMapped
            .filter((m) => !m.listing && !!m.listing_id)
            .map((m) => m.listing_id),
        ),
      ];
      if (missingListingIds.length > 0) {
        const { data: aiRows } = await supabase
          .from("auction_items")
          .select("id, card_name, edition, grade, condition, images")
          .in("id", missingListingIds);
        for (const a of aiRows ?? []) {
          if (!marketListingMap.has((a as any).id)) {
            marketListingMap.set((a as any).id, {
              id: (a as any).id,
              card_name: (a as any).card_name,
              edition: (a as any).edition ?? null,
              grade: (a as any).grade ?? (a as any).condition ?? null,
              images: normalizeImages((a as any).images),
            });
          }
        }
      }
      const finalMapped: OrderItemRow[] = hydratedMapped.map((m) =>
        !m.listing && m.listing_id && marketListingMap.has(m.listing_id)
          ? { ...m, listing: marketListingMap.get(m.listing_id) }
          : m,
      );

      setRawItems([...finalMapped, ...hydratedAuctionRows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ));

      const sellerIds = [
        ...new Set(
          [...finalMapped, ...auctionRows]
            .map((r) => r.seller_id)
            .filter((id): id is string => !!id),
        ),
      ];
      if (sellerIds.length > 0) {
        const { data: stores } = await supabase
          .from("vendor_stores")
          .select("profile_id, logo_url")
          .in("profile_id", sellerIds)
          .eq("is_active", true);
        const logoMap: Record<string, string> = {};
        for (const s of stores ?? []) {
          if ((s as any).profile_id && (s as any).logo_url) {
            logoMap[(s as any).profile_id] = (s as any).logo_url;
          }
        }
        setVendorStoreLogos(logoMap);
      } else {
        setVendorStoreLogos({});
      }

      // Bulk-load reviews for these orders
      const uniqueOrderIds = [...new Set(mapped.map((m) => m.order_id).filter((id) => !id.startsWith("auction-")))];
      if (uniqueOrderIds.length > 0) {
        const { data: reviews } = await supabase
          .from("reviews")
          .select("order_id, rating")
          .eq("reviewer_id", user.id)
          .in("order_id", uniqueOrderIds);

        const reviewMap: Record<string, { rating: number }> = {};
        for (const r of reviews ?? []) {
          reviewMap[r.order_id] = { rating: r.rating };
        }
        setReviewedOrders(reviewMap);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const grouped: GroupedOrder[] = useMemo(() => {
    const map = new Map<string, OrderItemRow[]>();
    for (const item of rawItems) {
      const list = map.get(item.order_id) ?? [];
      list.push(item);
      map.set(item.order_id, list);
    }

    const result: GroupedOrder[] = [];
    for (const [orderId, items] of map) {
      const total = items.reduce(
        (s, i) => s + i.quantity * Number(i.unit_price),
        0,
      );
      const itemCount = items.reduce((s, i) => s + i.quantity, 0);
      const statusPriority: FulfillmentStatus[] = [
        "cancelled",
        "refunded",
        "pending",
        "confirmed",
        "shipped",
        "delivered",
      ];
      const lowestStatus = statusPriority.find((st) =>
        items.some((i) => i.fulfillment_status === st),
      ) ?? items[0].fulfillment_status;

      const review = reviewedOrders[orderId];

      result.push({
        orderId,
        sellerId: items[0].seller_id,
        seller: items[0].seller,
        status: lowestStatus,
        total,
        itemCount,
        items,
        createdAt: items[0].created_at,
        hasReview: !!review,
        reviewRating: review?.rating ?? null,
      });
    }

    return result.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [rawItems, reviewedOrders]);

  const filtered = useMemo(() => {
    if (filter === "all") return grouped;
    if (filter === "to_rate")
      return grouped.filter((g) => g.status === "delivered" && !g.hasReview);
    return grouped.filter((g) => g.status === filter);
  }, [grouped, filter]);

  const filterCounts = useMemo(() => {
    const counts: Record<FilterId, number> = {
      all: grouped.length,
      pending: 0,
      confirmed: 0,
      shipped: 0,
      delivered: 0,
      to_rate: 0,
      cancelled: 0,
      refunded: 0,
    };
    for (const g of grouped) {
      counts[g.status]++;
      if (g.status === "delivered" && !g.hasReview) counts.to_rate++;
    }
    return counts;
  }, [grouped]);

  function handleReview(orderId: string, sellerId: string) {
    push({ type: "ORDER_REVIEW", orderId, sellerId });
  }

  async function handleOrderReceived(orderItemId: string) {
    const now = new Date();
    const disputeDeadline = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    try {
      const { error } = await supabase
        .from("order_items")
        .update({
          fulfillment_status: "delivered",
          delivered_at: now.toISOString(),
          received_at: now.toISOString(),
          dispute_deadline: disputeDeadline.toISOString(),
        })
        .eq("id", orderItemId);
      if (error) throw error;
      setRawItems((prev) =>
        prev.map((item) =>
          item.id === orderItemId
            ? {
                ...item,
                fulfillment_status: "delivered" as FulfillmentStatus,
                delivered_at: now.toISOString(),
                received_at: now.toISOString(),
                dispute_deadline: disputeDeadline.toISOString(),
              }
            : item,
        ),
      );
    } catch {
      Alert.alert("Error", "Failed to confirm receipt. Please try again.");
    }
  }

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />

      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>My Orders</Text>
        <Pressable style={st.backBtn} onPress={loadOrders} hitSlop={8}>
          <Ionicons name="refresh" size={16} color={C.textPrimary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={st.loadingWrap}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      ) : (
        <>
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
                  style={[
                    st.filterChipText,
                    filter === f.id && st.filterChipTextActive,
                  ]}
                >
                  {f.label}
                  {f.id !== "all" && filterCounts[f.id] > 0
                    ? ` (${filterCounts[f.id]})`
                    : ""}
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
              keyExtractor={(item) => item.orderId}
              contentContainerStyle={st.list}
              initialNumToRender={10}
              maxToRenderPerBatch={8}
              windowSize={5}
              removeClippedSubviews
              renderItem={({ item: order }) => (
                <OrderCard
                  order={order}
                  vendorLogoUrl={vendorStoreLogos[order.sellerId] ?? null}
                  onViewItem={(listingId) =>
                    push({ type: "LISTING_DETAIL", listingId })
                  }
                  onReview={() =>
                    handleReview(order.orderId, order.sellerId)
                  }
                  onPayNow={(winId) =>
                    push({ type: "AUCTION_CHECKOUT", winId })
                  }
                  onReceived={(itemId) => {
                    Alert.alert(
                      "Confirm Receipt",
                      "By confirming, you acknowledge you've received the item. You'll have 3 days to file a dispute if there's an issue.",
                      [
                        { text: "Not Yet", style: "cancel" },
                        { text: "I've Received It", onPress: () => handleOrderReceived(itemId) },
                      ],
                    );
                  }}
                />
              )}
              ListFooterComponent={<TruncationNotice count={rawItems.length} limit={500} label="order items" />}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

function OrderCard({
  order,
  vendorLogoUrl,
  onViewItem,
  onReview,
  onPayNow,
  onReceived,
}: {
  order: GroupedOrder;
  vendorLogoUrl: string | null;
  onViewItem: (listingId: string) => void;
  onReview: () => void;
  onPayNow?: (winId: string) => void;
  onReceived?: (itemId: string) => void;
}) {
  const cfg = STATUS_CONFIG[order.status];
  const sellerName =
    order.seller?.display_name ?? order.seller?.username ?? "Seller";
  const sellerInitial = sellerName.charAt(0).toUpperCase();
  const isDelivered = order.status === "delivered";
  const isShipped = order.status === "shipped";
  const isPendingAuction =
    order.status === "pending" &&
    order.items.some((i) => i.source === "auction");

  const trackingNumber = order.items.find((i) => i.tracking_number)?.tracking_number;
  const disputeDeadline = order.items.find((i) => i.dispute_deadline)?.dispute_deadline;
  const disputeRemaining = disputeDeadline
    ? Math.max(0, new Date(disputeDeadline).getTime() - Date.now())
    : 0;
  const disputeDays = Math.ceil(disputeRemaining / (24 * 60 * 60 * 1000));
  const canRate = isDelivered;

  return (
    <View style={st.card}>
      {/* Order header */}
      <View style={st.cardHeader}>
        <View style={st.sellerRow}>
          <View style={st.sellerAvatar}>
            {vendorLogoUrl ? (
              <Image source={{ uri: vendorLogoUrl }} style={st.sellerAvatarImg} />
            ) : order.seller?.avatar_url ? (
              <Image
                source={{ uri: order.seller.avatar_url }}
                style={st.sellerAvatarImg}
              />
            ) : (
              <Text style={st.sellerInitial}>{sellerInitial}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.sellerName}>{sellerName}</Text>
            {order.seller?.username && (
              <Text style={st.sellerHandle}>@{order.seller.username}</Text>
            )}
          </View>
          <View
            style={[
              st.statusChip,
              { backgroundColor: cfg.bg, borderColor: cfg.border },
            ]}
          >
            <Ionicons name={cfg.icon as any} size={11} color={cfg.color} />
            <Text style={[st.statusText, { color: cfg.color }]}>
              {cfg.label}
            </Text>
          </View>
        </View>
      </View>

      {/* Item list */}
      <View style={st.itemList}>
        {order.items.map((oi) => {
          const imgUrl = oi.listing?.images?.[0];
          return (
            <Pressable
              key={oi.id}
              style={st.itemRow}
              onPress={() => oi.listing?.id && onViewItem(oi.listing.id)}
            >
              <View style={st.itemThumb}>
                {imgUrl ? (
                  <Image source={{ uri: imgUrl }} style={st.itemThumbImg} />
                ) : (
                  <Ionicons
                    name="image-outline"
                    size={16}
                    color={C.textMuted}
                  />
                )}
              </View>
              <View style={st.itemInfo}>
                <Text style={st.itemName} numberOfLines={1}>
                  {oi.listing?.card_name ?? "Item"}
                </Text>
                <Text style={st.itemMeta} numberOfLines={1}>
                  {oi.listing?.edition ?? ""}
                  {oi.listing?.grade ? ` · ${oi.listing.grade}` : ""}
                </Text>
              </View>
              <View style={st.itemRight}>
                <Text style={st.itemPrice}>
                  {formatPrice(oi.quantity * Number(oi.unit_price))}
                </Text>
                {oi.quantity > 1 && (
                  <Text style={st.itemQty}>x{oi.quantity}</Text>
                )}
              </View>
              <Feather name="chevron-right" size={14} color={C.textMuted} />
            </Pressable>
          );
        })}
      </View>

      {/* Order footer */}
      <View style={st.cardFooter}>
        <View style={st.footerLeft}>
          <Text style={st.footerLabel}>
            {order.itemCount} item{order.itemCount !== 1 ? "s" : ""}
          </Text>
          <Text style={st.footerTime}>{relativeTime(order.createdAt)}</Text>
        </View>
        <Text style={st.footerTotal}>{formatPrice(order.total)}</Text>
      </View>

      {/* Tracking number */}
      {trackingNumber && (isShipped || isDelivered) && (
        <View style={st.trackingRow}>
          <Ionicons name="locate-outline" size={14} color={C.textAccent} />
          <Text style={st.trackingLabel}>Tracking:</Text>
          <Text style={st.trackingNumber}>{trackingNumber}</Text>
        </View>
      )}

      {/* Pay Now for pending auction wins */}
      {isPendingAuction && onPayNow && (
        <Pressable
          style={st.payNowBtn}
          onPress={() => {
            const auctionItem = order.items.find((i) => i.source === "auction" && i.winId);
            if (auctionItem?.winId) onPayNow(auctionItem.winId);
          }}
        >
          <Ionicons name="card" size={16} color={C.textHero} />
          <Text style={st.payNowText}>Pay Now</Text>
        </Pressable>
      )}

      {/* Order Received button for shipped items */}
      {isShipped && onReceived && (
        <Pressable
          style={st.receivedBtn}
          onPress={() => {
            const marketItem = order.items.find((i) => i.source !== "auction");
            if (marketItem) onReceived(marketItem.id);
          }}
        >
          <Ionicons name="checkmark-circle" size={16} color={C.textHero} />
          <Text style={st.receivedBtnText}>Order Received</Text>
        </Pressable>
      )}

      {/* Dispute window for delivered orders */}
      {isDelivered && disputeRemaining > 0 && (
        <View style={st.disputeRow}>
          <Ionicons name="shield-checkmark" size={14} color={C.success} />
          <Text style={st.disputeText}>
            Buyer protection: {disputeDays} day{disputeDays !== 1 ? "s" : ""} left to file a dispute
          </Text>
        </View>
      )}

      {/* Review action for delivered orders */}
      {canRate && (
        <Pressable style={st.reviewBtn} onPress={onReview}>
          {order.hasReview ? (
            <>
              <View style={st.reviewStarsRow}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Ionicons
                    key={s}
                    name={
                      s <= (order.reviewRating ?? 0) ? "star" : "star-outline"
                    }
                    size={13}
                    color={
                      s <= (order.reviewRating ?? 0)
                        ? "#F59E0B"
                        : C.textMuted
                    }
                  />
                ))}
              </View>
              <Text style={st.reviewBtnTextEdit}>Edit Review</Text>
              <Feather name="edit-2" size={12} color={C.textAccent} />
            </>
          ) : (
            <>
              <Ionicons name="star-outline" size={15} color={C.accent} />
              <Text style={st.reviewBtnText}>Rate Seller</Text>
              <Feather name="chevron-right" size={14} color={C.accent} />
            </>
          )}
        </Pressable>
      )}
    </View>
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
    paddingVertical: S.md,
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
    paddingBottom: 60,
  },

  // ── Order Card ──
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 12,
    overflow: "hidden",
  },

  cardHeader: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sellerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sellerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  sellerAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  sellerInitial: { color: C.accent, fontSize: 13, fontWeight: "900" },
  sellerName: { color: C.textPrimary, fontSize: 13, fontWeight: "800" },
  sellerHandle: { color: C.textSecondary, fontSize: 11, fontWeight: "600" },

  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },

  // ── Item rows ──
  itemList: {
    paddingVertical: 4,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  itemThumb: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  itemThumbImg: { width: 42, height: 42, borderRadius: 10 },
  itemInfo: { flex: 1, gap: 1 },
  itemName: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  itemMeta: { color: C.textSecondary, fontSize: 11, fontWeight: "500" },
  itemRight: { alignItems: "flex-end", gap: 1 },
  itemPrice: { color: C.link, fontSize: 13, fontWeight: "900" },
  itemQty: { color: C.textSecondary, fontSize: 10, fontWeight: "600" },

  // ── Footer ──
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  footerLeft: { gap: 2 },
  footerLabel: { color: C.textSecondary, fontSize: 11, fontWeight: "700" },
  footerTime: { color: C.textMuted, fontSize: 10, fontWeight: "500" },
  footerTotal: { color: C.textPrimary, fontSize: 16, fontWeight: "900" },

  // ── Tracking row ──
  trackingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: S.lg,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: "rgba(44,128,255,0.04)",
  },
  trackingLabel: { color: C.textSecondary, fontSize: 11, fontWeight: "600" },
  trackingNumber: {
    color: C.textAccent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  // ── Order Received button ──
  receivedBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.success,
  },
  receivedBtnText: {
    color: C.textHero,
    fontSize: 13,
    fontWeight: "800",
  },

  // ── Dispute row ──
  disputeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: S.lg,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: "rgba(34,197,94,0.05)",
  },
  disputeText: {
    flex: 1,
    color: C.success,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 15,
  },

  // ── Pay Now button ──
  payNowBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.success,
  },
  payNowText: {
    color: C.textHero,
    fontSize: 13,
    fontWeight: "800",
  },

  // ── Review button ──
  reviewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.accentGlow,
  },
  reviewBtnText: {
    color: C.accent,
    fontSize: 13,
    fontWeight: "800",
  },
  reviewBtnTextEdit: {
    color: C.textAccent,
    fontSize: 13,
    fontWeight: "700",
  },
  reviewStarsRow: {
    flexDirection: "row",
    gap: 2,
  },

  // ── Empty state ──
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
