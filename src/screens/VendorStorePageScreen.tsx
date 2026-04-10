import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  TextInput,
  Text,
  View,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { C, S } from "../theme";
import { supabase } from "../lib/supabase";
import { useAppNavigation } from "../navigation/NavigationContext";
import ErrorState from "../components/ErrorState";
import { StyleSheet } from "react-native";

const SCREEN_W = Dimensions.get("window").width;
const CARD_GAP = 10;
const CARD_W = (SCREEN_W - S.screenPadding * 2 - CARD_GAP) / 2;
const FEATURED_W = SCREEN_W * 0.42;

type StoreData = {
  id: string;
  profile_id: string;
  store_name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  theme_color: string;
  created_at: string;
};

type SellerProfile = {
  display_name: string | null;
  username: string | null;
  rating: number;
  total_sales: number;
  verified_seller: boolean;
  review_count: number;
};

type StoreListing = {
  id: string;
  card_name: string;
  edition: string | null;
  grade: string | null;
  condition: string | null;
  price: number;
  quantity: number;
  images: string[];
  category: string;
};

type StoreReview = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
};

type StoreTab = "listings" | "reviews";
type SortKey = "newest" | "price_asc" | "price_desc" | "name_asc";

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

export default function VendorStorePageScreen({
  storeId,
  onBack,
}: {
  storeId: string;
  onBack: () => void;
}) {
  const { push } = useAppNavigation();
  const [store, setStore] = useState<StoreData | null>(null);
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [listings, setListings] = useState<StoreListing[]>([]);
  const [featuredIds, setFeaturedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StoreTab>("listings");
  const [reviews, setReviews] = useState<StoreReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);

  const loadReviews = useCallback(async (sellerId: string) => {
    setLoadingReviews(true);
    const { data } = await supabase
      .from("reviews")
      .select("id, rating, comment, created_at, reviewer:profiles!reviewer_id(username, display_name, avatar_url)")
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: false })
      .limit(100);

    const mapped = (data ?? []).map((r: any) => ({
      ...r,
      reviewer: Array.isArray(r.reviewer) ? r.reviewer[0] : r.reviewer,
    }));
    setReviews(mapped as StoreReview[]);
    setLoadingReviews(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);

    const { data: storeData, error: storeErr } = await supabase
      .from("vendor_stores")
      .select("id, profile_id, store_name, description, logo_url, banner_url, theme_color, created_at")
      .eq("id", storeId)
      .maybeSingle();

    if (storeErr) {
      console.warn("VendorStorePage load error:", storeErr.message);
      setLoadError(true);
      setLoading(false);
      return;
    }

    if (!storeData) {
      setLoading(false);
      return;
    }
    setStore(storeData as StoreData);

    const [{ data: profileData }, { data: displayData }, { data: listingData }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, username, rating, total_sales, verified_seller, review_count")
          .eq("id", (storeData as any).profile_id)
          .maybeSingle(),
        supabase
          .from("vendor_display_items")
          .select("listing_id, display_order")
          .eq("store_id", storeId)
          .order("display_order", { ascending: true }),
        supabase
          .from("listings")
          .select("id, card_name, edition, grade, condition, price, quantity, images, category")
          .eq("seller_id", (storeData as any).profile_id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

    if (profileData) setSeller(profileData as SellerProfile);

    const featIds = new Set((displayData ?? []).map((d: any) => d.listing_id as string));
    setFeaturedIds(featIds);

    const allListings = (listingData ?? []).map((l: any) => ({
      ...l,
      images: normalizeImages(l.images),
    })) as StoreListing[];

    setListings(allListings);
    setLoading(false);
    loadReviews((storeData as any).profile_id);
  }, [storeId, loadReviews]);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(() => {
    const cats = new Set(listings.map((l) => l.category));
    return ["All", ...Array.from(cats)];
  }, [listings]);

  const featured = useMemo(
    () => listings.filter((l) => featuredIds.has(l.id) && (l.quantity ?? 0) > 0),
    [listings, featuredIds],
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const catFiltered =
      activeCategory === "All"
        ? listings
        : listings.filter((l) => l.category === activeCategory);

    const searched = !q
      ? catFiltered
      : catFiltered.filter((l) => {
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
  }, [listings, activeCategory, searchQuery, sortKey]);

  const memberSince = store?.created_at
    ? new Date(store.created_at).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })
    : "";

  const ratingBreakdown = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const r of reviews) {
      if (r.rating >= 1 && r.rating <= 5) counts[r.rating - 1]++;
    }
    return counts;
  }, [reviews]);

  const avgRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    return reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  }, [reviews]);

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <View style={st.loadingWrap}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!store) {
    return (
      <SafeAreaView style={st.safe}>
        <View style={st.header}>
          <Pressable onPress={onBack} style={st.backBtn}>
            <Feather name="arrow-left" size={22} color={C.textPrimary} />
          </Pressable>
          <Text style={st.headerTitle}>{loadError ? "Error" : "Store Not Found"}</Text>
          <View style={{ width: 36 }} />
        </View>
        {loadError ? (
          <ErrorState
            message="Failed to load store. Check your connection and try again."
            onRetry={load}
          />
        ) : (
          <View style={st.loadingWrap}>
            <Ionicons name="storefront-outline" size={40} color={C.textMuted} />
            <Text style={st.emptyTitle}>This store doesn't exist</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  const tc = store.theme_color;

  function handleMessage() {
    push({
      type: "CHAT",
      sellerId: store!.profile_id,
      listingId: "",
      topic: store!.store_name,
    });
  }

  const renderItem = ({ item }: { item: StoreListing }) => {
    const isFeat = featuredIds.has(item.id);
    return (
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
          {isFeat && (
            <View style={[st.featBadge, { backgroundColor: tc }]}>
              <Ionicons name="star" size={8} color="#fff" />
            </View>
          )}
        </View>
        <Text style={st.cardEdition}>{item.edition ?? item.category}</Text>
        <Text style={st.cardName} numberOfLines={1}>{item.card_name}</Text>
        {item.grade && <Text style={st.cardGrade}>{item.grade}</Text>}
        <View style={st.cardBottom}>
          <Text style={[st.cardPrice, { color: tc }]}>
            RM{Number(item.price).toLocaleString("en-MY", { maximumFractionDigits: 0 })}
          </Text>
          {item.quantity > 1 && (
            <Text style={st.cardQty}>x{item.quantity}</Text>
          )}
        </View>
      </Pressable>
    );
  };

  const ListHeader = () => (
    <>
      {/* ── Hero Banner ── */}
      <View style={st.bannerWrap}>
        {store.banner_url ? (
          <Image source={{ uri: store.banner_url }} style={st.banner} />
        ) : (
          <View style={[st.banner, { backgroundColor: tc + "18" }]} />
        )}
        <LinearGradient
          colors={["transparent", "rgba(4,7,13,0.65)", C.bg]}
          locations={[0.2, 0.7, 1]}
          style={st.bannerGradient}
        />

        <View style={st.backOverlay}>
          <Pressable onPress={onBack} style={st.backBtnFloat}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* ── Store Identity ── */}
      <View style={st.identity}>
        <View style={st.logoRow}>
          {store.logo_url ? (
            <Image source={{ uri: store.logo_url }} style={[st.logo, { borderColor: tc }]} />
          ) : (
            <View style={[st.logo, { borderColor: tc, backgroundColor: tc + "22" }]}>
              <Ionicons name="storefront" size={26} color={tc} />
            </View>
          )}
          <View style={st.identityInfo}>
            <View style={st.nameRow}>
              <Text style={st.storeName}>{store.store_name}</Text>
              {seller?.verified_seller && (
                <View style={[st.verifiedBadge, { backgroundColor: tc }]}>
                  <Ionicons name="shield-checkmark" size={10} color="#fff" />
                </View>
              )}
            </View>
            {seller?.username && (
              <Text style={st.sellerHandle}>@{seller.username}</Text>
            )}
          </View>
        </View>

        {store.description && (
          <Text style={st.storeDesc}>{store.description}</Text>
        )}

        {/* ── Action Buttons ── */}
        <View style={st.actionRow}>
          {currentUserId !== store.profile_id && (
            <Pressable style={[st.actionBtn, { backgroundColor: tc }]} onPress={handleMessage}>
              <Ionicons name="chatbubble-outline" size={15} color="#fff" />
              <Text style={st.actionBtnTextPrimary}>Message</Text>
            </Pressable>
          )}
          <Pressable style={st.actionBtnOutline} onPress={() => Share.share({ message: `Check out ${store?.store_name ?? "this store"} on Evend!` })}>
            <Ionicons name="share-outline" size={15} color={C.textPrimary} />
            <Text style={st.actionBtnText}>Share</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Stats Bar ── */}
      <View style={st.statsBar}>
        <View style={st.statItem}>
          <Ionicons name="star" size={13} color="#F59E0B" />
          <Text style={st.statValue}>
            {Number(seller?.rating ?? 0).toFixed(1)}
          </Text>
          <Text style={st.statLabel}>
            {(seller?.review_count ?? 0) > 0
              ? `${seller!.review_count} review${seller!.review_count === 1 ? "" : "s"}`
              : "Rating"}
          </Text>
        </View>
        <View style={st.statDivider} />
        <View style={st.statItem}>
          <Ionicons name="bag-check-outline" size={13} color={C.success} />
          <Text style={st.statValue}>{seller?.total_sales ?? 0}</Text>
          <Text style={st.statLabel}>Sales</Text>
        </View>
        <View style={st.statDivider} />
        <View style={st.statItem}>
          <Ionicons name="pricetag-outline" size={13} color={C.accent} />
          <Text style={st.statValue}>{listings.length}</Text>
          <Text style={st.statLabel}>Listings</Text>
        </View>
        <View style={st.statDivider} />
        <View style={st.statItem}>
          <Ionicons name="calendar-outline" size={13} color={C.textAccent} />
          <Text style={st.statValue2}>{memberSince}</Text>
          <Text style={st.statLabel}>Joined</Text>
        </View>
      </View>

      {/* ── Tab Bar ── */}
      <View style={st.tabBar}>
        <Pressable
          style={[st.tabItem, activeTab === "listings" && { borderBottomColor: tc }]}
          onPress={() => setActiveTab("listings")}
        >
          <Ionicons name="grid-outline" size={15} color={activeTab === "listings" ? tc : C.textMuted} />
          <Text style={[st.tabText, activeTab === "listings" && { color: tc }]}>
            Listings ({listings.length})
          </Text>
        </Pressable>
        <Pressable
          style={[st.tabItem, activeTab === "reviews" && { borderBottomColor: tc }]}
          onPress={() => setActiveTab("reviews")}
        >
          <Ionicons name="star-outline" size={15} color={activeTab === "reviews" ? tc : C.textMuted} />
          <Text style={[st.tabText, activeTab === "reviews" && { color: tc }]}>
            Reviews ({seller?.review_count ?? 0})
          </Text>
        </Pressable>
      </View>

      {activeTab === "reviews" ? null : (
      <>
      {/* ── Featured Section ── */}
      {featured.length > 0 && (
        <View style={st.featuredSection}>
          <View style={st.sectionHeader}>
            <Ionicons name="star" size={14} color="#F59E0B" />
            <Text style={st.sectionTitle}>Featured</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={st.featuredScroll}
          >
            {featured.map((item) => (
              <Pressable
                key={item.id}
                style={st.featCard}
                onPress={() => push({ type: "LISTING_DETAIL", listingId: item.id })}
              >
                <View style={st.featArt}>
                  {item.images?.[0] ? (
                    <Image source={{ uri: item.images[0] }} style={st.featImg} />
                  ) : (
                    <Ionicons name="image-outline" size={20} color={C.textMuted} />
                  )}
                </View>
                <Text style={st.featName} numberOfLines={1}>{item.card_name}</Text>
                <Text style={st.featEdition} numberOfLines={1}>
                  {item.edition ?? item.category}
                </Text>
                <Text style={[st.featPrice, { color: tc }]}>
                  RM{Number(item.price).toLocaleString("en-MY", { maximumFractionDigits: 0 })}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Category Filter ── */}
      {categories.length > 2 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.catRow}
          style={{ flexGrow: 0 }}
        >
          {categories.map((cat) => (
            <Pressable
              key={cat}
              style={[
                st.catChip,
                activeCategory === cat && { backgroundColor: tc, borderColor: tc },
              ]}
              onPress={() => setActiveCategory(cat)}
            >
              <Text
                style={[
                  st.catChipText,
                  activeCategory === cat && st.catChipTextActive,
                ]}
              >
                {cat}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* ── Search ── */}
      <View style={st.searchWrap}>
        <View style={st.searchBox}>
          <Ionicons name="search" size={16} color={C.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search this store"
            placeholderTextColor={C.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={st.searchInput}
          />
          {!!searchQuery.trim() && (
            <Pressable
              onPress={() => setSearchQuery("")}
              hitSlop={10}
              style={st.searchClear}
            >
              <Ionicons name="close-circle" size={18} color={C.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Sort / Filters ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.sortRow}
        style={{ flexGrow: 0 }}
      >
        <Pressable
          onPress={() => setSortKey("newest")}
          style={[
            st.sortChip,
            sortKey === "newest" && { backgroundColor: tc, borderColor: tc },
          ]}
        >
          <Ionicons
            name="sparkles-outline"
            size={14}
            color={sortKey === "newest" ? "#fff" : C.textMuted}
          />
          <Text
            style={[
              st.sortChipText,
              sortKey === "newest" && st.sortChipTextActive,
            ]}
          >
            Newest
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setSortKey("price_asc")}
          style={[
            st.sortChip,
            sortKey === "price_asc" && { backgroundColor: tc, borderColor: tc },
          ]}
        >
          <Ionicons
            name="trending-up-outline"
            size={14}
            color={sortKey === "price_asc" ? "#fff" : C.textMuted}
          />
          <Text
            style={[
              st.sortChipText,
              sortKey === "price_asc" && st.sortChipTextActive,
            ]}
          >
            Price ↑
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setSortKey("price_desc")}
          style={[
            st.sortChip,
            sortKey === "price_desc" && { backgroundColor: tc, borderColor: tc },
          ]}
        >
          <Ionicons
            name="trending-down-outline"
            size={14}
            color={sortKey === "price_desc" ? "#fff" : C.textMuted}
          />
          <Text
            style={[
              st.sortChipText,
              sortKey === "price_desc" && st.sortChipTextActive,
            ]}
          >
            Price ↓
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setSortKey("name_asc")}
          style={[
            st.sortChip,
            sortKey === "name_asc" && { backgroundColor: tc, borderColor: tc },
          ]}
        >
          <Ionicons
            name="text-outline"
            size={14}
            color={sortKey === "name_asc" ? "#fff" : C.textMuted}
          />
          <Text
            style={[
              st.sortChipText,
              sortKey === "name_asc" && st.sortChipTextActive,
            ]}
          >
            A–Z
          </Text>
        </Pressable>

      </ScrollView>

      {/* ── Items Header ── */}
      <View style={st.itemsHeader}>
        <Text style={st.itemsTitle}>
          {activeCategory === "All" ? "All Items" : activeCategory}
        </Text>
        <Text style={st.itemsCount}>{filtered.length}</Text>
      </View>
      </>
      )}
    </>
  );

  const renderReview = ({ item }: { item: StoreReview }) => {
    const reviewer = item.reviewer;
    const displayName = reviewer?.display_name || reviewer?.username || "Anonymous";
    const stars = Array.from({ length: 5 }, (_, i) => i < item.rating ? "star" : "star-outline");
    const ago = timeAgoShort(item.created_at);

    return (
      <View style={st.reviewCard}>
        <View style={st.reviewHeader}>
          {reviewer?.avatar_url ? (
            <Image source={{ uri: reviewer.avatar_url }} style={st.reviewAvatar} />
          ) : (
            <View style={[st.reviewAvatar, st.reviewAvatarPlaceholder]}>
              <Ionicons name="person" size={14} color={C.textMuted} />
            </View>
          )}
          <View style={st.reviewMeta}>
            <Text style={st.reviewName}>{displayName}</Text>
            <View style={st.reviewStarsRow}>
              {stars.map((name, i) => (
                <Ionicons key={i} name={name as any} size={12} color="#F59E0B" />
              ))}
              <Text style={st.reviewTime}>{ago}</Text>
            </View>
          </View>
        </View>
        {item.comment ? <Text style={st.reviewComment}>{item.comment}</Text> : null}
      </View>
    );
  };

  function timeAgoShort(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d`;
    return `${Math.floor(days / 30)}mo`;
  }

  const ReviewsHeader = () => (
    <View style={st.reviewsSummary}>
      <View style={st.ratingBig}>
        <Text style={st.ratingBigNumber}>{avgRating.toFixed(1)}</Text>
        <View style={st.ratingBigStars}>
          {Array.from({ length: 5 }, (_, i) => (
            <Ionicons key={i} name={i < Math.round(avgRating) ? "star" : "star-outline"} size={16} color="#F59E0B" />
          ))}
        </View>
        <Text style={st.ratingBigCount}>{reviews.length} review{reviews.length !== 1 ? "s" : ""}</Text>
      </View>
      <View style={st.ratingBars}>
        {[5, 4, 3, 2, 1].map((star) => {
          const count = ratingBreakdown[star - 1];
          const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
          return (
            <View key={star} style={st.ratingBarRow}>
              <Text style={st.ratingBarLabel}>{star}</Text>
              <Ionicons name="star" size={10} color="#F59E0B" />
              <View style={st.ratingBarTrack}>
                <View style={[st.ratingBarFill, { width: `${pct}%`, backgroundColor: tc }]} />
              </View>
              <Text style={st.ratingBarCount}>{count}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={st.safe}>
      {activeTab === "reviews" ? (
        <FlatList
          key="reviews-list"
          data={reviews}
          keyExtractor={(item) => item.id}
          renderItem={renderReview}
          ListHeaderComponent={
            <>
              <ListHeader />
              {loadingReviews ? (
                <View style={st.emptyWrap}><ActivityIndicator size="large" color={C.accent} /></View>
              ) : reviews.length > 0 ? (
                <ReviewsHeader />
              ) : null}
            </>
          }
          ListEmptyComponent={
            loadingReviews ? null : (
              <View style={st.emptyWrap}>
                <Ionicons name="chatbubble-outline" size={32} color={C.textMuted} />
                <Text style={st.emptyTitle}>No reviews yet</Text>
                <Text style={st.emptySub}>{"This seller hasn't received any reviews."}</Text>
              </View>
            )
          }
          contentContainerStyle={st.reviewsList}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          key="listings-grid"
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
                {searchQuery.trim() ? "No matching items" : "No items found"}
              </Text>
              <Text style={st.emptySub}>
                {searchQuery.trim()
                  ? "Try a different search term."
                  : activeCategory !== "All"
                    ? "Try another category"
                    : "This vendor hasn't listed any cards yet."}
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
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
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
  headerTitle: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },

  // ── Banner ──
  bannerWrap: {
    position: "relative",
  },
  banner: {
    height: 180,
    width: "100%",
  },
  bannerGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  backOverlay: {
    position: "absolute",
    top: 12,
    left: S.screenPadding,
    zIndex: 10,
  },
  backBtnFloat: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Identity ──
  identity: {
    paddingHorizontal: S.screenPadding,
    marginTop: -32,
    marginBottom: 4,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 14,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  identityInfo: {
    flex: 1,
    paddingBottom: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  storeName: {
    color: C.textPrimary,
    fontSize: 20,
    fontWeight: "900",
  },
  verifiedBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sellerHandle: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  storeDesc: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 19,
    marginTop: 10,
  },

  // ── Actions ──
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
  },
  actionBtnTextPrimary: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  actionBtnOutline: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  actionBtnText: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },

  // ── Stats Bar ──
  statsBar: {
    flexDirection: "row",
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    marginHorizontal: S.screenPadding,
    marginTop: 16,
    marginBottom: 4,
    paddingVertical: 12,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  statDivider: {
    width: 1,
    backgroundColor: C.border,
    marginVertical: 2,
  },
  statValue: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: "900",
  },
  statValue2: {
    color: C.textPrimary,
    fontSize: 11,
    fontWeight: "800",
  },
  statLabel: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  // ── Featured ──
  featuredSection: {
    marginTop: 18,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: S.screenPadding,
    marginBottom: 10,
  },
  sectionTitle: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  featuredScroll: {
    paddingHorizontal: S.screenPadding,
    gap: 10,
  },
  featCard: {
    width: FEATURED_W,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 8,
  },
  featArt: {
    aspectRatio: 0.72,
    borderRadius: 10,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.borderCard,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 6,
  },
  featImg: {
    width: "100%",
    height: "100%",
    borderRadius: 10,
    resizeMode: "cover",
  },
  featName: {
    color: C.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  featEdition: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginTop: 1,
  },
  featPrice: {
    fontSize: 13,
    fontWeight: "800",
    marginTop: 4,
  },

  // ── Categories ──
  catRow: {
    flexDirection: "row",
    paddingHorizontal: S.screenPadding,
    gap: 8,
    marginTop: 16,
    marginBottom: 4,
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  catChipText: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  catChipTextActive: {
    color: "#fff",
  },

  // ── Search ──
  searchWrap: {
    paddingHorizontal: S.screenPadding,
    marginTop: 10,
    marginBottom: 2,
  },
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
  },
  searchInput: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  searchClear: {
    paddingLeft: 4,
  },

  // ── Sort / Filters ──
  sortRow: {
    flexDirection: "row",
    paddingHorizontal: S.screenPadding,
    gap: 8,
    marginTop: 10,
    marginBottom: 2,
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
  sortChipTextActive: {
    color: "#fff",
  },
  sortDivider: {
    width: 1,
    backgroundColor: C.border,
    marginVertical: 6,
    marginHorizontal: 2,
  },

  // ── Items Grid ──
  itemsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: S.screenPadding,
    marginTop: 14,
    marginBottom: S.md,
  },
  itemsTitle: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  itemsCount: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  flatContent: {
    paddingBottom: 40,
  },
  row: {
    paddingHorizontal: S.screenPadding,
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },

  // ── Product Card ──
  card: {
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    padding: S.md,
  },
  cardArt: {
    aspectRatio: 0.72,
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
    resizeMode: "cover",
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
  featBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
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
  cardGrade: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  cardPrice: {
    fontSize: 14,
    fontWeight: "800",
  },
  cardQty: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: "600",
  },

  // ── Tabs ──
  tabBar: {
    flexDirection: "row",
    marginHorizontal: S.screenPadding,
    marginTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabText: {
    color: C.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },

  // ── Reviews ──
  reviewsList: {
    paddingBottom: 40,
  },
  reviewsSummary: {
    flexDirection: "row",
    marginHorizontal: S.screenPadding,
    marginTop: 16,
    marginBottom: 8,
    padding: 16,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    gap: 16,
  },
  ratingBig: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 80,
  },
  ratingBigNumber: {
    color: C.textPrimary,
    fontSize: 32,
    fontWeight: "900",
  },
  ratingBigStars: {
    flexDirection: "row",
    gap: 2,
  },
  ratingBigCount: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  ratingBars: {
    flex: 1,
    gap: 4,
    justifyContent: "center",
  },
  ratingBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingBarLabel: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    width: 10,
    textAlign: "right",
  },
  ratingBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: C.elevated,
    borderRadius: 3,
    overflow: "hidden",
  },
  ratingBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  ratingBarCount: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: "600",
    width: 20,
  },
  reviewCard: {
    marginHorizontal: S.screenPadding,
    marginTop: 10,
    padding: 14,
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  reviewAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: "hidden",
  },
  reviewAvatarPlaceholder: {
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewMeta: {
    flex: 1,
    gap: 2,
  },
  reviewName: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  reviewStarsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  reviewTime: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: "600",
    marginLeft: 6,
  },
  reviewComment: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 19,
    marginTop: 8,
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
