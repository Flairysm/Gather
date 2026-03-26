import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { useReconnect } from "../hooks/useReconnect";
import { useAppNavigation } from "../navigation/NavigationContext";
import type { Listing, WantedPost } from "../data/market";
import { formatListingPrice } from "../data/market";

type SavedItem = {
  id: string;
  item_type: "listing" | "wanted" | "auction";
  item_id: string;
  created_at: string;
};

type AuctionBookmark = {
  id: string;
  card_name: string;
  edition: string | null;
  images: string[] | null;
  current_bid: number | null;
  starting_price: number;
  status: string;
};

type BookmarkRow =
  | ({ item_type: "listing" } & Listing)
  | ({ item_type: "wanted" } & WantedPost)
  | ({ item_type: "auction" } & AuctionBookmark);

type Props = { onBack: () => void };

export default function MyBookmarksScreen({ onBack }: Props) {
  const { push } = useAppNavigation();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BookmarkRow[]>([]);

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

    const { data: saved } = await supabase
      .from("saved_items")
      .select("id, item_type, item_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);

    const savedItems = (saved ?? []) as SavedItem[];
    const listingIds = savedItems
      .filter((s) => s.item_type === "listing")
      .map((s) => s.item_id);
    const wantedIds = savedItems
      .filter((s) => s.item_type === "wanted")
      .map((s) => s.item_id);
    const auctionIds = savedItems
      .filter((s) => s.item_type === "auction")
      .map((s) => s.item_id);

    const [
      { data: listings },
      { data: wantedPosts },
      { data: auctions },
    ] = await Promise.all([
      listingIds.length
        ? supabase
            .from("listings")
            .select(
              "id, seller_id, card_name, edition, grade, condition, price, quantity, category, description, images, views, status, created_at, seller:profiles!seller_id(username, display_name, rating, total_sales, review_count, avatar_url)"
            )
            .in("id", listingIds)
        : Promise.resolve({ data: [] }),
      wantedIds.length
        ? supabase
            .from("wanted_posts")
            .select(
              "id, buyer_id, card_name, edition, grade_wanted, offer_price, category, description, image_url, views, status, created_at, buyer:profiles!buyer_id(username, display_name, rating, total_purchases, avatar_url)"
            )
            .in("id", wantedIds)
        : Promise.resolve({ data: [] }),
      auctionIds.length
        ? supabase
            .from("auction_items")
            .select("id, card_name, edition, images, current_bid, starting_price, status")
            .in("id", auctionIds)
        : Promise.resolve({ data: [] }),
    ]);

    const listingMap = new Map(
      (listings ?? []).map((l: any) => [l.id, l]),
    );
    const wantedMap = new Map(
      (wantedPosts ?? []).map((w: any) => [w.id, w]),
    );
    const auctionMap = new Map(
      (auctions ?? []).map((a: any) => [a.id, a]),
    );

    const ordered: BookmarkRow[] = [];
    for (const s of savedItems) {
      if (s.item_type === "listing") {
        const l = listingMap.get(s.item_id);
        if (l) ordered.push({ item_type: "listing", ...(l as any) });
        else ordered.push({ item_type: "listing", id: s.item_id, card_name: "Removed Listing", status: "removed", seller_id: "", edition: null, grade: null, condition: null, price: "0", quantity: 0, category: "", description: null, images: [], views: 0, created_at: s.created_at, seller: null } as any);
      } else if (s.item_type === "wanted") {
        const w = wantedMap.get(s.item_id);
        if (w) ordered.push({ item_type: "wanted", ...(w as any) });
        else ordered.push({ item_type: "wanted", id: s.item_id, card_name: "Removed Post", status: "removed", buyer_id: "", edition: null, grade_wanted: null, offer_price: 0, category: "", description: null, image_url: null, views: 0, created_at: s.created_at, buyer: null } as any);
      } else {
        const a = auctionMap.get(s.item_id);
        if (a) ordered.push({ item_type: "auction", ...(a as any) });
        else ordered.push({ item_type: "auction", id: s.item_id, card_name: "Removed Auction", edition: null, images: null, current_bid: null, starting_price: 0, status: "removed" } as any);
      }
    }

    setRows(ordered);
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  useReconnect(load);

  const bookmarkedListings = useMemo(
    () => rows.filter((r) => r.item_type === "listing") as any as Listing[],
    [rows],
  );
  const bookmarkedWanted = useMemo(
    () => rows.filter((r) => r.item_type === "wanted") as any as WantedPost[],
    [rows],
  );
  const bookmarkedAuctions = useMemo(
    () => rows.filter((r) => r.item_type === "auction") as any as AuctionBookmark[],
    [rows],
  );

  function auctionThumb(a: AuctionBookmark): string | null {
    const raw = a.images;
    if (!raw) return null;
    if (Array.isArray(raw) && raw[0]) return raw[0];
    if (typeof raw === "string") {
      try {
        const p = JSON.parse(raw);
        if (Array.isArray(p) && p[0]) return p[0];
      } catch {
        if (raw.startsWith("http")) return raw;
      }
    }
    return null;
  }

  function auctionPriceLabel(a: AuctionBookmark): string {
    const n = a.current_bid ?? a.starting_price;
    return formatListingPrice(n);
  }

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar style="light" />
        <View style={st.header}>
          <Pressable style={st.backBtn} onPress={onBack}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>
          <Text style={st.headerTitle}>My Bookmarks</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={st.centerLoading}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const isEmpty = rows.length === 0;

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />

      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>My Bookmarks</Text>
        <View style={{ width: 36 }} />
      </View>

      {isEmpty ? (
        <ScrollView contentContainerStyle={st.emptyWrap}>
          <View style={st.emptyCard}>
            <Ionicons name="bookmark-outline" size={34} color={C.textSecondary} />
            <Text style={st.emptyTitle}>No bookmarks yet</Text>
            <Text style={st.emptySub}>
              Tap the bookmark icon on listings, auctions, or wanted posts to save them here.
            </Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll}>
          {bookmarkedListings.length > 0 && (
            <View style={st.section}>
              <Text style={st.sectionTitle}>Bookmarked Listings</Text>
              {bookmarkedListings.map((l) => {
                const img = Array.isArray((l as any).images) ? (l as any).images[0] : null;
                const removed = (l as any).status === "removed";
                return (
                  <Pressable
                    key={l.id}
                    style={[st.row, removed && st.rowRemoved]}
                    onPress={() => !removed && push({ type: "LISTING_DETAIL", listingId: l.id })}
                    disabled={removed}
                  >
                    <View style={st.thumb}>
                      {img ? (
                        <Image source={{ uri: img }} style={st.thumbImg} />
                      ) : (
                        <View style={st.thumbPlaceholder}>
                          <Ionicons name={removed ? "trash-outline" : "image-outline"} size={18} color={C.textMuted} />
                        </View>
                      )}
                    </View>
                    <View style={st.rowInfo}>
                      <Text style={[st.rowTitle, removed && st.rowTitleRemoved]} numberOfLines={1}>
                        {l.card_name}
                      </Text>
                      <Text style={st.rowSub} numberOfLines={1}>
                        {removed ? "This item is no longer available" : (l.edition ?? l.category)}
                      </Text>
                      {!removed && <Text style={st.rowPrice}>{formatListingPrice(l.price)}</Text>}
                    </View>
                    {!removed && <Feather name="chevron-right" size={16} color={C.textMuted} />}
                  </Pressable>
                );
              })}
            </View>
          )}

          {bookmarkedAuctions.length > 0 && (
            <View style={st.section}>
              <Text style={st.sectionTitle}>Bookmarked Auctions</Text>
              {bookmarkedAuctions.map((a) => {
                const img = auctionThumb(a);
                const removed = a.status === "removed";
                return (
                  <Pressable
                    key={a.id}
                    style={[st.row, removed && st.rowRemoved]}
                    onPress={() => !removed && push({ type: "AUCTION_DETAIL", auctionId: a.id })}
                    disabled={removed}
                  >
                    <View style={st.thumb}>
                      {img ? (
                        <Image source={{ uri: img }} style={st.thumbImg} />
                      ) : (
                        <View style={st.thumbPlaceholder}>
                          <Ionicons name={removed ? "trash-outline" : "hammer-outline"} size={18} color={C.textMuted} />
                        </View>
                      )}
                    </View>
                    <View style={st.rowInfo}>
                      <Text style={[st.rowTitle, removed && st.rowTitleRemoved]} numberOfLines={1}>
                        {a.card_name}
                      </Text>
                      <Text style={st.rowSub} numberOfLines={1}>
                        {removed ? "This auction is no longer available" : (a.edition ?? (a.status === "active" ? "Live auction" : a.status))}
                      </Text>
                      {!removed && <Text style={st.rowPrice}>{auctionPriceLabel(a)}</Text>}
                    </View>
                    {!removed && <Feather name="chevron-right" size={16} color={C.textMuted} />}
                  </Pressable>
                );
              })}
            </View>
          )}

          {bookmarkedWanted.length > 0 && (
            <View style={st.section}>
              <Text style={st.sectionTitle}>Bookmarked Wanted</Text>
              {bookmarkedWanted.map((w) => {
                const removed = (w as any).status === "removed";
                return (
                  <Pressable
                    key={w.id}
                    style={[st.row, removed && st.rowRemoved]}
                    onPress={() => !removed && push({ type: "WANTED_DETAIL", wantedId: w.id })}
                    disabled={removed}
                  >
                    <View style={st.thumb}>
                      {w.image_url ? (
                        <Image source={{ uri: w.image_url }} style={st.thumbImg} />
                      ) : (
                        <View style={st.thumbPlaceholder}>
                          <Ionicons name={removed ? "trash-outline" : "image-outline"} size={18} color={C.textMuted} />
                        </View>
                      )}
                    </View>
                    <View style={st.rowInfo}>
                      <Text style={[st.rowTitle, removed && st.rowTitleRemoved]} numberOfLines={1}>
                        {w.card_name}
                      </Text>
                      <Text style={st.rowSub} numberOfLines={1}>
                        {removed ? "This post is no longer available" : (w.edition ?? w.category)}
                      </Text>
                      {!removed && <Text style={st.rowPrice}>{formatListingPrice(w.offer_price)}</Text>}
                    </View>
                    {!removed && <Feather name="chevron-right" size={16} color={C.textMuted} />}
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
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
  scroll: {
    paddingHorizontal: S.screenPadding,
    paddingTop: S.xl,
    paddingBottom: 120,
  },
  centerLoading: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyWrap: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: S.screenPadding,
  },
  emptyCard: {
    width: "100%",
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    gap: 8,
    alignItems: "center",
    textAlign: "center",
  },
  emptyTitle: {
    color: C.textPrimary,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 6,
  },
  emptySub: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
    textAlign: "center",
  },
  section: { marginBottom: S.xl },
  sectionTitle: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: S.md,
    marginLeft: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    marginBottom: S.md,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.elevated,
  },
  thumbImg: { width: "100%", height: "100%" },
  thumbPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  rowRemoved: { opacity: 0.5 },
  rowInfo: { flex: 1, gap: 3 },
  rowTitle: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
  rowTitleRemoved: { color: C.textMuted, textDecorationLine: "line-through" },
  rowSub: { color: C.textSecondary, fontSize: 12, fontWeight: "600" },
  rowPrice: { color: C.link, fontSize: 13, fontWeight: "900", marginTop: 2 },
});

