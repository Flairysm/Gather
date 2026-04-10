import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { C, S } from "../theme";
import { supabase } from "../lib/supabase";
import { useAppNavigation } from "../navigation/NavigationContext";
import { formatListingPrice, timeAgo } from "../data/market";
import ErrorState from "../components/ErrorState";
import { StyleSheet } from "react-native";

const SCREEN_W = Dimensions.get("window").width;
const CARD_GAP = 10;
const CARD_W = (SCREEN_W - S.screenPadding * 2 - CARD_GAP) / 2;

type SortKey = "newest" | "price_asc" | "price_desc" | "name_asc";

type ListingRow = {
  id: string;
  seller_id: string;
  card_name: string;
  edition: string | null;
  grade: string | null;
  condition: string | null;
  price: number;
  quantity: number;
  category: string;
  images: string[];
  created_at: string;
  seller: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
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

const CATEGORY_META: Record<string, { icon: React.ComponentProps<typeof Ionicons>["name"]; color: string }> = {
  "Pokémon": { icon: "flash", color: "#F59E0B" },
  MTG: { icon: "sparkles", color: "#8B5CF6" },
  Sports: { icon: "football", color: "#22C55E" },
  YGO: { icon: "eye", color: "#3B82F6" },
  All: { icon: "layers-outline", color: C.accent },
};

export default function CategoryListingsScreen({
  category,
  onBack,
}: {
  category: string;
  onBack: () => void;
}) {
  const { push } = useAppNavigation();
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [vendorStoreNames, setVendorStoreNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");

  const meta = CATEGORY_META[category] ?? { icon: "pricetag-outline" as const, color: C.accent };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    let query = supabase
      .from("listings")
      .select(`
        id, seller_id, card_name, edition, grade, condition, price, quantity,
        category, images, created_at,
        seller:profiles!seller_id(username, display_name, avatar_url)
      `)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(200);

    if (category !== "All") {
      query = query.eq("category", category);
    }

    const { data, error } = await query;
    if (error) {
      console.warn("CategoryListings load error:", error.message);
      setLoadError(true);
      setLoading(false);
      return;
    }
    if (data) {
      const mapped = (data as any[]).map((r) => ({
        ...r,
        images: normalizeImages(r.images),
        seller: Array.isArray(r.seller) ? r.seller[0] : r.seller,
      })) as ListingRow[];

      setListings(mapped);

      const sellerIds = Array.from(new Set(mapped.map((m) => m.seller_id).filter(Boolean)));
      if (sellerIds.length > 0) {
        const { data: stores } = await supabase
          .from("vendor_stores")
          .select("profile_id, store_name")
          .in("profile_id", sellerIds)
          .eq("is_active", true);
        if (stores) {
          const map: Record<string, string> = {};
          for (const s of stores as any[]) {
            if (s.profile_id && s.store_name) map[s.profile_id] = s.store_name;
          }
          setVendorStoreNames(map);
        } else {
          setVendorStoreNames({});
        }
      } else {
        setVendorStoreNames({});
      }
    }
    setLoading(false);
  }, [category]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const searched = !q
      ? listings
      : listings.filter((l) => {
          const hay = [
            l.card_name,
            l.edition ?? "",
            l.grade ?? "",
            l.condition ?? "",
            l.category,
          ]
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        });

    const sorted = [...searched];
    if (sortKey === "price_asc") sorted.sort((a, b) => a.price - b.price);
    if (sortKey === "price_desc") sorted.sort((a, b) => b.price - a.price);
    if (sortKey === "name_asc")
      sorted.sort((a, b) => a.card_name.localeCompare(b.card_name));
    return sorted;
  }, [listings, searchQuery, sortKey]);

  const renderItem = ({ item }: { item: ListingRow }) => (
    <Pressable
      style={[st.card, { width: CARD_W }]}
      onPress={() => push({ type: "LISTING_DETAIL", listingId: item.id })}
    >
      <View style={st.cardArt}>
        {item.images?.[0] ? (
          <Image source={{ uri: item.images[0] }} style={st.cardImg} />
        ) : (
          <Ionicons name="image-outline" size={24} color={C.textMuted} />
        )}
        {item.condition && (
          <View style={st.conditionBadge}>
            <Text style={st.conditionText}>{item.condition}</Text>
          </View>
        )}
        {item.grade && (
          <View style={st.gradeBadge}>
            <Text style={st.gradeText}>{item.grade}</Text>
          </View>
        )}
      </View>
      <Text style={st.cardEdition} numberOfLines={1}>
        {item.edition ?? item.category}
      </Text>
      <Text style={st.cardName} numberOfLines={1}>
        {item.card_name}
      </Text>
      <Text style={[st.cardPrice, { color: meta.color }]}>
        {formatListingPrice(item.price)}
      </Text>
      <View style={st.cardSeller}>
        {item.seller?.avatar_url ? (
          <Image
            source={{ uri: item.seller.avatar_url }}
            style={st.sellerAvatar}
          />
        ) : (
          <View style={st.sellerAvatarPlaceholder} />
        )}
        <Text style={st.sellerName} numberOfLines={1}>
          {vendorStoreNames[item.seller_id] ??
            item.seller?.display_name ??
            (item.seller?.username ? `@${item.seller.username}` : "Vendor")}
        </Text>
        <Text style={st.cardTime}>{timeAgo(item.created_at)}</Text>
      </View>
    </Pressable>
  );

  const ListHeader = () => (
    <>
      {/* ── Category Badge ── */}
      <View style={st.catBadgeRow}>
        <View style={[st.catBadge, { backgroundColor: meta.color + "18", borderColor: meta.color + "44" }]}>
          <Ionicons name={meta.icon} size={14} color={meta.color} />
          <Text style={[st.catBadgeText, { color: meta.color }]}>
            {category === "All" ? "All Categories" : category}
          </Text>
        </View>
        <Text style={st.resultCount}>
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </Text>
      </View>

      {/* ── Search ── */}
      <View style={st.searchBox}>
        <Ionicons name="search" size={16} color={C.textMuted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={`Search ${category === "All" ? "all" : category} cards`}
          placeholderTextColor={C.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={st.searchInput}
        />
        {!!searchQuery.trim() && (
          <Pressable onPress={() => setSearchQuery("")} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={C.textMuted} />
          </Pressable>
        )}
      </View>

      {/* ── Sort Chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.sortRow}
        style={{ flexGrow: 0 }}
      >
        {([
          { key: "newest" as SortKey, label: "Newest", icon: "sparkles-outline" as const },
          { key: "price_asc" as SortKey, label: "Price ↑", icon: "trending-up-outline" as const },
          { key: "price_desc" as SortKey, label: "Price ↓", icon: "trending-down-outline" as const },
          { key: "name_asc" as SortKey, label: "A–Z", icon: "text-outline" as const },
        ]).map((s) => (
          <Pressable
            key={s.key}
            onPress={() => setSortKey(s.key)}
            style={[
              st.sortChip,
              sortKey === s.key && {
                backgroundColor: meta.color,
                borderColor: meta.color,
              },
            ]}
          >
            <Ionicons
              name={s.icon}
              size={14}
              color={sortKey === s.key ? "#fff" : C.textMuted}
            />
            <Text
              style={[
                st.sortChipText,
                sortKey === s.key && { color: "#fff" },
              ]}
            >
              {s.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </>
  );

  return (
    <SafeAreaView style={st.safe}>
      {/* Header */}
      <View style={st.header}>
        <Pressable onPress={onBack} style={st.backBtn}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <View style={st.headerCenter}>
          <Ionicons name={meta.icon} size={16} color={meta.color} />
          <Text style={st.headerTitle} numberOfLines={1}>
            {category === "All" ? "All Listings" : category}
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={st.loadingWrap}>
          <ActivityIndicator size="large" color={meta.color} />
        </View>
      ) : loadError ? (
        <ErrorState
          message="Failed to load listings. Check your connection and try again."
          onRetry={load}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={st.row}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            <View style={st.emptyWrap}>
              <Ionicons
                name={searchQuery.trim() ? "search-outline" : "cube-outline"}
                size={32}
                color={C.textMuted}
              />
              <Text style={st.emptyTitle}>
                {searchQuery.trim() ? "No matching items" : "No listings yet"}
              </Text>
              <Text style={st.emptySub}>
                {searchQuery.trim()
                  ? "Try a different search term."
                  : `No ${category === "All" ? "" : category + " "}cards listed right now.`}
              </Text>
            </View>
          }
          contentContainerStyle={st.flatContent}
          showsVerticalScrollIndicator={false}
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
    paddingVertical: 12,
    gap: S.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.borderIcon,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  headerTitle: {
    color: C.textPrimary,
    fontSize: 17,
    fontWeight: "800",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Category badge row ──
  catBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: S.screenPadding,
    marginBottom: 10,
  },
  catBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  catBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },
  resultCount: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },

  // ── Search ──
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: S.screenPadding,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },

  // ── Sort ──
  sortRow: {
    flexDirection: "row",
    paddingHorizontal: S.screenPadding,
    gap: 8,
    marginBottom: 14,
  },
  sortChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  sortChipText: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },

  // ── Grid ──
  flatContent: {
    paddingBottom: 40,
  },
  row: {
    paddingHorizontal: S.screenPadding,
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },
  card: {
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    padding: S.md,
  },
  cardArt: {
    height: 130,
    borderRadius: S.radiusCardInner,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.borderCard,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: S.sm,
    position: "relative",
  },
  cardImg: {
    width: "100%",
    height: "100%",
    borderRadius: S.radiusCardInner,
  },
  conditionBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  conditionText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
  },
  gradeBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(30,64,175,0.85)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  gradeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
  },
  cardEdition: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  cardName: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  cardPrice: {
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
  },
  cardSeller: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  sellerAvatar: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  sellerAvatarPlaceholder: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.borderCard,
  },
  sellerName: {
    flex: 1,
    color: C.textMuted,
    fontSize: 10,
    fontWeight: "600",
  },
  cardTime: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: "600",
  },

  // ── Empty ──
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  emptySub: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
