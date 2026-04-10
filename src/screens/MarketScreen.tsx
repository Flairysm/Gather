import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import CachedImage from "../components/CachedImage";
import ErrorState from "../components/ErrorState";
import Shimmer, { ShimmerGroup, FadeIn } from "../components/Shimmer";
import { formatConditionShort, getConditionColor, GRADING_COMPANIES, CONDITION_TIERS } from "../data/grading";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, S } from "../theme";
import { market as m } from "../styles/market.styles";
import { shared as sh } from "../styles/shared.styles";
import {
  MARKET_FILTERS,
  formatListingPrice,
  timeAgo,
  type Listing,
  type WantedPost,
} from "../data/market";
import { useAppNavigation } from "../navigation/NavigationContext";
import { useUser } from "../data/user";
import { supabase } from "../lib/supabase";

type Tab = "Listings" | "Wanted";
type SortMode = "newest" | "price_low" | "price_high";

const FILTER_COMPANIES = GRADING_COMPANIES.filter((c) => c.id !== "RAW");
const RAW_COMPANY = GRADING_COMPANIES.find((c) => c.id === "RAW")!;


const FAB_ACTIONS = [
  {
    id: "sell",
    label: "Sell Your Cards",
    icon: <Feather name="tag" size={18} color={C.textHero} />,
    color: C.accent,
  },
  {
    id: "wanted",
    label: 'Place "Wanted" Card',
    icon: <MaterialCommunityIcons name="card-search-outline" size={18} color={C.textHero} />,
    color: C.live,
  },
] as const;
const SKELETON_CARD_W =
  (Dimensions.get("window").width - S.screenPadding * 2 - S.cardGap) / 2;

function hasDisplayableCondition(condition: string | null | undefined) {
  const normalized = (condition ?? "").trim().toLowerCase();
  return Boolean(
    normalized &&
      normalized !== "na" &&
      normalized !== "n/a" &&
      normalized !== "condition n/a",
  );
}

function formatGradeLabel(grade: string | null | undefined) {
  const value = (grade ?? "").trim();
  if (!value) return null;
  return value;
}

export default function MarketScreen() {
  const { push } = useAppNavigation();
  const { isVerifiedVendor } = useUser();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>("Listings");
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [selectedGrades, setSelectedGrades] = useState<Set<string>>(new Set());
  const [rawSelected, setRawSelected] = useState(false);
  const [selectedConditions, setSelectedConditions] = useState<Set<string>>(new Set());
  const [minPriceText, setMinPriceText] = useState("");
  const [maxPriceText, setMaxPriceText] = useState("");
  const [fabOpen, setFabOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  const [listings, setListings] = useState<Listing[]>([]);
  const [wantedPosts, setWantedPosts] = useState<WantedPost[]>([]);
  const [vendorStores, setVendorStores] = useState<
    Record<string, { store_name: string; logo_url: string | null }>
  >({});
  const [loadingListings, setLoadingListings] = useState(true);
  const [loadingWanted, setLoadingWanted] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadListings = useCallback(async (): Promise<boolean> => {
    setLoadingListings(true);
    const { data, error } = await supabase
      .from("listings")
      .select(`
        id, seller_id, card_name, edition, grade, grading_company, grade_value,
        condition, price, quantity, category, description, images, views, status, created_at,
        seller:profiles!seller_id(username, display_name, rating, total_sales, avatar_url)
      `)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.warn("MarketScreen loadListings error:", error.message);
      setLoadingListings(false);
      return false;
    }

    if (data) {
      const mapped = (data as any[]).map((r) => ({
          ...r,
          seller: Array.isArray(r.seller) ? r.seller[0] : r.seller,
      }));
      setListings(mapped);

      const sellerIds = Array.from(
        new Set(
          mapped
            .map((r: any) => r.seller_id)
            .filter((id: string | null | undefined) => Boolean(id)),
        ),
      );

      if (sellerIds.length > 0) {
        const { data: stores } = await supabase
          .from("vendor_stores")
          .select("profile_id, store_name, logo_url")
          .in("profile_id", sellerIds)
          .eq("is_active", true);

        if (stores) {
          const storeMap: Record<
            string,
            { store_name: string; logo_url: string | null }
          > = {};
          for (const s of stores as any[]) {
            if (s.profile_id && s.store_name) {
              storeMap[s.profile_id] = {
                store_name: s.store_name,
                logo_url: s.logo_url ?? null,
              };
            }
          }
          setVendorStores(storeMap);
        } else {
          setVendorStores({});
        }
      } else {
        setVendorStores({});
      }
    }
    setLoadingListings(false);
    return true;
  }, []);

  const loadWanted = useCallback(async (): Promise<boolean> => {
    setLoadingWanted(true);
    const { data, error } = await supabase
      .from("wanted_posts")
      .select(`
        id, buyer_id, card_name, edition, grade_wanted, offer_price,
        grading_company_wanted, grade_value_wanted,
        category, description, image_url, views, status, created_at,
        buyer:profiles!buyer_id(username, display_name, rating, total_purchases, avatar_url)
      `)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.warn("MarketScreen loadWanted error:", error.message);
      setWantedPosts([]);
      setLoadingWanted(false);
      return false;
    }
    if (data) {
      setWantedPosts(
        (data as any[]).map((r) => ({
          ...r,
          buyer: Array.isArray(r.buyer) ? r.buyer[0] : r.buyer,
        })),
      );
    }
    setLoadingWanted(false);
    return true;
  }, []);

  useEffect(() => {
    Promise.all([loadListings(), loadWanted()]).then((results) => {
      setLoadError(results.every((ok) => !ok));
    });
  }, [loadListings, loadWanted]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const minPrice = Number(minPriceText.replace(/(RM|\$|,)/gi, ""));
  const maxPrice = Number(maxPriceText.replace(/(RM|\$|,)/gi, ""));
  const hasCompanyFilter = selectedCompanies.size > 0;
  const hasGradeFilter = selectedGrades.size > 0;
  const hasConditionFilter = selectedConditions.size > 0;
  const hasMinPrice = Number.isFinite(minPrice) && minPrice > 0;
  const hasMaxPrice = Number.isFinite(maxPrice) && maxPrice > 0;
  const hasAdvancedFilters =
    sortMode !== "newest" ||
    hasCompanyFilter ||
    hasGradeFilter ||
    rawSelected ||
    hasConditionFilter ||
    hasMinPrice ||
    hasMaxPrice;
  const activeFilterCount =
    (sortMode !== "newest" ? 1 : 0) +
    (hasCompanyFilter ? selectedCompanies.size : 0) +
    (hasGradeFilter ? selectedGrades.size : 0) +
    (rawSelected ? 1 : 0) +
    (hasConditionFilter ? selectedConditions.size : 0) +
    (hasMinPrice ? 1 : 0) +
    (hasMaxPrice ? 1 : 0);

  const searchedListings = useMemo(() => {
    let next =
      activeFilter === "All"
        ? [...listings]
        : listings.filter((l) => l.category === activeFilter);

    if (normalizedQuery) {
      next = next.filter((item) => {
        const haystack = [
          item.card_name,
          item.edition ?? "",
          item.grade ?? "",
          item.condition ?? "",
          item.category ?? "",
          vendorStores[item.seller_id]?.store_name ?? "",
          item.seller?.username ?? "",
          item.seller?.display_name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      });
    }

    if (hasCompanyFilter || rawSelected) {
      next = next.filter((item) => {
        const company = (item as any).grading_company ?? "";
        const isRaw = !company || company === "RAW";
        if (isRaw) return rawSelected;
        return selectedCompanies.has(company);
      });
    }
    if (hasGradeFilter || hasConditionFilter) {
      next = next.filter((item) => {
        const gc = (item as any).grading_company ?? "";
        const isRaw = !gc || gc === "RAW";
        if (isRaw && hasConditionFilter) {
          const cond = (item.condition ?? "").trim().toUpperCase();
          return selectedConditions.has(cond);
        }
        if (!isRaw && hasGradeFilter) {
          const gv = (item as any).grade_value ?? "";
          return selectedGrades.has(`${gc}:${gv}`);
        }
        return true;
      });
    }
    if (hasMinPrice) next = next.filter((item) => Number(item.price) >= minPrice);
    if (hasMaxPrice) next = next.filter((item) => Number(item.price) <= maxPrice);

    if (sortMode === "price_low") {
      next.sort((a, b) => Number(a.price) - Number(b.price));
    } else if (sortMode === "price_high") {
      next.sort((a, b) => Number(b.price) - Number(a.price));
    } else {
      next.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
    return next;
  }, [
    activeFilter,
    listings,
    normalizedQuery,
    vendorStores,
    hasCompanyFilter,
    selectedCompanies,
    hasGradeFilter,
    selectedGrades,
    rawSelected,
    hasConditionFilter,
    selectedConditions,
    hasMinPrice,
    minPrice,
    hasMaxPrice,
    maxPrice,
    sortMode,
  ]);

  const searchedWanted = useMemo(() => {
    let next =
      activeFilter === "All"
        ? [...wantedPosts]
        : wantedPosts.filter((w) => w.category === activeFilter);

    if (normalizedQuery) {
      next = next.filter((item) => {
        const haystack = [
          item.card_name,
          item.edition ?? "",
          item.grade_wanted ?? "",
          item.category ?? "",
          item.buyer?.username ?? "",
          item.buyer?.display_name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      });
    }

    if (hasCompanyFilter || rawSelected) {
      next = next.filter((item) => {
        const company = (item as any).grading_company_wanted ?? "";
        const isRaw = !company || company === "RAW";
        if (isRaw) return rawSelected;
        return selectedCompanies.has(company);
      });
    }
    if (hasGradeFilter) {
      next = next.filter((item) => {
        const gc = (item as any).grading_company_wanted ?? "";
        const isRaw = !gc || gc === "RAW";
        if (isRaw) return true;
        const gv = (item as any).grade_value_wanted ?? "";
        return selectedGrades.has(`${gc}:${gv}`);
      });
    }
    if (hasMinPrice) next = next.filter((item) => Number(item.offer_price) >= minPrice);
    if (hasMaxPrice) next = next.filter((item) => Number(item.offer_price) <= maxPrice);

    if (sortMode === "price_low") {
      next.sort((a, b) => Number(a.offer_price) - Number(b.offer_price));
    } else if (sortMode === "price_high") {
      next.sort((a, b) => Number(b.offer_price) - Number(a.offer_price));
    } else {
      next.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
    return next;
  }, [
    activeFilter,
    wantedPosts,
    normalizedQuery,
    hasCompanyFilter,
    selectedCompanies,
    hasGradeFilter,
    selectedGrades,
    rawSelected,
    hasConditionFilter,
    selectedConditions,
    hasMinPrice,
    minPrice,
    hasMaxPrice,
    maxPrice,
    sortMode,
  ]);

  function toggleFab() {
    Animated.spring(anim, {
      toValue: fabOpen ? 0 : 1,
      useNativeDriver: true,
      tension: 60,
      friction: 8,
    }).start();
    setFabOpen((prev) => !prev);
  }

  function closeFab() {
    Animated.spring(anim, { toValue: 0, useNativeDriver: true }).start();
    setFabOpen(false);
  }

  function handleFabAction(id: string) {
    closeFab();
    if (id === "sell") {
      if (!isVerifiedVendor) {
        push({ type: "VENDOR_APPLICATION" });
        return;
      }
      push({ type: "CREATE_LISTING" });
    }
    if (id === "wanted") push({ type: "CREATE_WANTED" });
  }

  const rotateIcon = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "45deg"],
  });

  async function onRefresh() {
    setRefreshing(true);
    setLoadError(false);
    const results = await Promise.allSettled([loadListings(), loadWanted()]);
    setLoadError(results.every((r) => r.status === "rejected"));
    await new Promise((resolve) => setTimeout(resolve, 500));
    setRefreshing(false);
  }

  function clearAdvancedFilters() {
    setSortMode("newest");
    setSelectedCompanies(new Set());
    setSelectedGrades(new Set());
    setRawSelected(false);
    setSelectedConditions(new Set());
    setMinPriceText("");
    setMaxPriceText("");
  }

  function toggleCompany(id: string) {
    setSelectedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setSelectedGrades((gPrev) => {
          const gNext = new Set(gPrev);
          for (const key of gPrev) {
            if (key.startsWith(`${id}:`)) gNext.delete(key);
          }
          return gNext;
        });
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleGrade(companyId: string, gradeValue: string) {
    const key = `${companyId}:${gradeValue}`;
    setSelectedGrades((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleCondition(tier: string) {
    setSelectedConditions((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  }

  return (
    <SafeAreaView style={m.safe}>
      <StatusBar style="light" />
      <View style={m.root}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={m.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.accent}
            />
          }
        >
          {refreshing && (
            <ShimmerGroup>
              <View style={{ gap: S.md, marginBottom: S.lg }}>
                <Shimmer width="100%" height={42} borderRadius={S.radiusSmall} />
                <Shimmer width="100%" height={44} borderRadius={S.radiusSmall} />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.cardGap }}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <View key={i} style={{ width: SKELETON_CARD_W, gap: 8 }}>
                      <Shimmer width="100%" height={SKELETON_CARD_W * 1.2} borderRadius={S.radiusCardInner} />
                      <Shimmer width="75%" height={13} borderRadius={5} />
                      <Shimmer width="50%" height={11} borderRadius={5} />
                      <Shimmer width="40%" height={16} borderRadius={6} />
                    </View>
                  ))}
                </View>
              </View>
            </ShimmerGroup>
          )}

          {/* Header */}
          <View style={m.header}>
            <View style={m.searchBar}>
              <Feather name="search" size={S.iconSize.md} color={C.textMuted} />
              <TextInput
                style={m.searchInput}
                placeholder="Search Market"
                placeholderTextColor={C.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.trim().length > 0 && (
                <Pressable onPress={() => setSearchQuery("")} hitSlop={10}>
                  <Feather name="x-circle" size={16} color={C.textMuted} />
                </Pressable>
              )}
            </View>
            <Pressable style={[m.iconBtn, hasAdvancedFilters && (m as any).iconBtnActive]} onPress={() => setShowFilterSheet(true)}>
              <Feather name="sliders" size={S.iconSize.md} color={C.textSearch} />
              {activeFilterCount > 0 && (
                <View style={(m as any).filterCountBadge}>
                  <Text style={(m as any).filterCountBadgeText}>{activeFilterCount}</Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Segment Control */}
          <View style={m.segmentRow}>
            {(["Listings", "Wanted"] as Tab[]).map((tab) => (
              <Pressable
                key={tab}
                style={[m.segmentTab, activeTab === tab && m.segmentTabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text
                  style={[
                    m.segmentLabel,
                    activeTab === tab && m.segmentLabelActive,
                  ]}
                >
                  {tab}
                </Text>
              </Pressable>
            ))}
          </View>

          {loadError && !loadingListings && !loadingWanted && (
            <ErrorState
              message="Failed to load marketplace. Check your connection and try again."
              onRetry={onRefresh}
            />
          )}

          {/* Category Filter Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={m.filterScroll}
          >
            {MARKET_FILTERS.map((label) => (
              <Pressable
                key={label}
                style={[sh.pill, activeFilter === label && sh.pillActive]}
                onPress={() => setActiveFilter(label)}
              >
                <Text
                  style={[
                    sh.pillText,
                    activeFilter === label && sh.pillTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Listings Tab */}
          {activeTab === "Listings" && (
            <View style={m.listingsGrid}>
              {loadingListings && listings.length === 0 ? (
                <ShimmerGroup>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.cardGap, width: "100%" }}>
                    {[0, 1, 2, 3].map((i) => (
                      <View key={i} style={{ width: SKELETON_CARD_W, gap: 8, marginBottom: S.md }}>
                        <Shimmer width="100%" height={SKELETON_CARD_W * 1.2} borderRadius={S.radiusCardInner} />
                        <Shimmer width="75%" height={13} borderRadius={5} />
                        <Shimmer width="50%" height={11} borderRadius={5} />
                        <Shimmer width="40%" height={16} borderRadius={6} />
                      </View>
                    ))}
                  </View>
                </ShimmerGroup>
              ) : searchedListings.length === 0 ? (
                <View style={{ alignItems: "center", padding: 40, width: "100%" }}>
                  <Ionicons name="storefront-outline" size={32} color={C.textMuted} />
                  <Text style={{ color: C.textPrimary, fontSize: 14, fontWeight: "800", marginTop: 8 }}>
                    {normalizedQuery ? "No matching listings" : "No listings yet"}
                  </Text>
                  <Text style={{ color: C.textSecondary, fontSize: 12, marginTop: 4 }}>
                    {normalizedQuery
                      ? "Try a different keyword"
                      : "Be the first to list a card for sale"}
                  </Text>
                </View>
              ) : (
                <FadeIn style={{ flexDirection: "row", flexWrap: "wrap", gap: S.cardGap }}>
                {searchedListings.map((item) => (
                  <Pressable
                    key={item.id}
                    style={m.listingCard}
                    onPress={() => push({ type: "LISTING_DETAIL", listingId: item.id })}
                  >
                    <View style={m.listingArt}>
                      {item.images?.[0] ? (
                        <CachedImage
                          source={{ uri: item.images[0] }}
                          style={{ width: "100%", height: "100%", borderRadius: S.radiusCardInner }}
                        />
                      ) : null}
                      {hasDisplayableCondition(item.condition) && (
                        <View style={m.conditionBadge}>
                          <Text numberOfLines={1} style={m.conditionBadgeText}>
                            {formatConditionShort(item.condition) || item.condition}
                          </Text>
                        </View>
                      )}
                      {formatGradeLabel(item.grade) && (
                        <View style={[m.gradeBadge, m.gradeBadgeTopLeft]}>
                          <Text style={m.gradeBadgeText}>
                            {formatGradeLabel(item.grade)}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={m.listingInfo}>
                      <Text style={m.listingName} numberOfLines={1}>
                        {item.card_name}
                      </Text>
                      <Text style={m.listingEdition}>{item.edition ?? "—"}</Text>
                      <Text style={m.listingPrice}>
                        {formatListingPrice(item.price)}
                      </Text>
                      <View style={m.listingMeta}>
                        <View style={m.sellerRow}>
                          {vendorStores[item.seller_id]?.logo_url ? (
                            <CachedImage
                              source={{ uri: vendorStores[item.seller_id]!.logo_url! }}
                              style={{ width: 16, height: 16, borderRadius: 8 }}
                            />
                          ) : item.seller?.avatar_url ? (
                            <CachedImage
                              source={{ uri: item.seller.avatar_url }}
                              style={{ width: 16, height: 16, borderRadius: 8 }}
                            />
                          ) : (
                            <View style={m.sellerAvatar} />
                          )}
                          <Text style={m.sellerName}>
                            {vendorStores[item.seller_id]?.store_name ??
                              item.seller?.display_name ??
                              (item.seller?.username ? `@${item.seller.username}` : "Vendor")}
                          </Text>
                        </View>
                        <Text style={m.postedAt}>{timeAgo(item.created_at)}</Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
                </FadeIn>
              )}
            </View>
          )}

          {/* Wanted Tab */}
          {activeTab === "Wanted" && (
            <View style={m.wantedGrid}>
              {loadingWanted && wantedPosts.length === 0 ? (
                <ShimmerGroup>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.cardGap, width: "100%" }}>
                    {[0, 1, 2, 3].map((i) => (
                      <View key={i} style={{ width: SKELETON_CARD_W, gap: 8, marginBottom: S.md }}>
                        <Shimmer width="100%" height={SKELETON_CARD_W * 1.2} borderRadius={S.radiusCardInner} />
                        <Shimmer width="75%" height={13} borderRadius={5} />
                        <Shimmer width="50%" height={11} borderRadius={5} />
                        <Shimmer width="35%" height={14} borderRadius={5} />
                      </View>
                    ))}
                  </View>
                </ShimmerGroup>
              ) : searchedWanted.length === 0 ? (
                <View style={{ alignItems: "center", padding: 40, width: "100%" }}>
                  <MaterialCommunityIcons name="card-search-outline" size={32} color={C.textMuted} />
                  <Text style={{ color: C.textPrimary, fontSize: 14, fontWeight: "800", marginTop: 8 }}>
                    {normalizedQuery ? "No matching wanted posts" : "No wanted posts yet"}
                  </Text>
                  <Text style={{ color: C.textSecondary, fontSize: 12, marginTop: 4 }}>
                    {normalizedQuery
                      ? "Try a different keyword"
                      : "Post what cards you're looking for"}
                  </Text>
                </View>
              ) : (
                <FadeIn style={{ flexDirection: "row", flexWrap: "wrap", gap: S.cardGap }}>
                {searchedWanted.map((item) => (
                  <Pressable
                    key={item.id}
                    style={m.wantedCard}
                    onPress={() => push({ type: "WANTED_DETAIL", wantedId: item.id })}
                  >
                    <View style={m.wantedArt}>
                      {item.image_url ? (
                        <CachedImage
                          source={{ uri: item.image_url }}
                          style={{ width: "100%", height: "100%", borderRadius: S.radiusCardInner }}
                        />
                      ) : null}
                    </View>
                    <View style={m.wantedTag}>
                      <Text style={m.wantedTagText}>WTB</Text>
                    </View>
                    <Text style={m.wantedName} numberOfLines={1}>
                      {item.card_name}
                    </Text>
                    <Text style={m.wantedEdition}>{item.edition ?? "—"}</Text>
                    {item.grade_wanted && (
                      <View style={m.gradeWantedChip}>
                        <Ionicons
                          name="shield-checkmark-outline"
                          size={11}
                          color={C.textIcon}
                        />
                        <Text style={m.gradeWantedText}>{item.grade_wanted}</Text>
                      </View>
                    )}
                    <View style={m.wantedDivider} />
                    <View style={m.offerRow}>
                      <Text style={m.offerLabel}>Offering</Text>
                      <Text style={m.offerPrice}>
                        {formatListingPrice(item.offer_price)}
                      </Text>
                    </View>
                    <View style={m.wantedMeta}>
                      <View style={m.wantedBuyerRow}>
                        <View style={m.wantedAvatar} />
                        <Text style={m.wantedBuyer}>
                          @{item.buyer?.username ?? "user"}
                        </Text>
                      </View>
                      <Text style={m.wantedPostedAt}>{timeAgo(item.created_at)}</Text>
                    </View>
                  </Pressable>
                ))}
                </FadeIn>
              )}
            </View>
          )}
        </ScrollView>

        {/* Scrim */}
        {fabOpen && (
          <Pressable
            onPress={closeFab}
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: "rgba(4,7,13,0.55)",
            }}
          />
        )}

        {/* FAB actions */}
        {FAB_ACTIONS.map((action, i) => {
          const offset = (FAB_ACTIONS.length - i) * 68;
          const translateY = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -offset],
          });
          const opacity = anim.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0, 0, 1],
          });
          const scale = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.7, 1],
          });

          return (
            <Animated.View
              key={action.id}
              style={{
                position: "absolute",
                right: 18,
                bottom: 72,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                opacity,
                transform: [{ translateY }, { scale }],
              }}
              pointerEvents={fabOpen ? "auto" : "none"}
            >
              <View style={{
                backgroundColor: C.elevated,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: C.border,
                paddingHorizontal: 14,
                paddingVertical: 9,
              }}>
                <Text style={{ color: C.textPrimary, fontSize: 13, fontWeight: "700" }}>
                  {action.label}
                </Text>
              </View>
              <Pressable
                onPress={() => handleFabAction(action.id)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: action.color,
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: action.color,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.5,
                  shadowRadius: 8,
                  elevation: 6,
                }}
              >
                {action.icon}
              </Pressable>
            </Animated.View>
          );
        })}

        {/* Main FAB */}
        <Pressable
          onPress={toggleFab}
          style={{
            position: "absolute",
            right: 18,
            bottom: 72,
            width: 58,
            height: 58,
            borderRadius: 29,
            backgroundColor: C.accent,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: C.accent,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.5,
            shadowRadius: 12,
            elevation: 8,
          }}
        >
          <Animated.View style={{ transform: [{ rotate: rotateIcon }] }}>
            <Feather name="plus" size={28} color="#fff" />
          </Animated.View>
        </Pressable>

        {/* Filter Sheet */}
        {showFilterSheet && (
          <View style={(m as any).filterOverlay} pointerEvents="box-none">
            <Pressable style={(m as any).filterBackdrop} onPress={() => setShowFilterSheet(false)} />
            <View
              style={[
                (m as any).filterSheet,
                {
                  marginBottom: 72,
                  paddingBottom: Math.max(insets.bottom, 14),
                  maxHeight: "80%",
                },
              ]}
            >
              <View style={(m as any).filterSheetHeader}>
                <Text style={(m as any).filterSheetTitle}>Filters</Text>
                <Pressable onPress={() => setShowFilterSheet(false)} hitSlop={8}>
                  <Feather name="x" size={18} color={C.textPrimary} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 16, paddingBottom: 8 }}>

              {/* Sort */}
              <View style={{ gap: 8 }}>
                <Text style={(m as any).filterLabel}>Sort</Text>
                <View style={(m as any).sortRow}>
                  <Pressable
                    style={[(m as any).sortChip, sortMode === "newest" && (m as any).sortChipActive]}
                    onPress={() => setSortMode("newest")}
                  >
                    <Text style={[(m as any).sortChipText, sortMode === "newest" && (m as any).sortChipTextActive]}>Newest</Text>
                  </Pressable>
                  <Pressable
                    style={[(m as any).sortChip, sortMode === "price_low" && (m as any).sortChipActive]}
                    onPress={() => setSortMode("price_low")}
                  >
                    <Text style={[(m as any).sortChipText, sortMode === "price_low" && (m as any).sortChipTextActive]}>Price: Low to High</Text>
                  </Pressable>
                  <Pressable
                    style={[(m as any).sortChip, sortMode === "price_high" && (m as any).sortChipActive]}
                    onPress={() => setSortMode("price_high")}
                  >
                    <Text style={[(m as any).sortChipText, sortMode === "price_high" && (m as any).sortChipTextActive]}>Price: High to Low</Text>
                  </Pressable>
                </View>
              </View>

              {/* Price */}
              <View style={{ gap: 8 }}>
                <Text style={(m as any).filterLabel}>Price Range (RM)</Text>
                <View style={(m as any).priceRow}>
                  <TextInput
                    style={(m as any).priceInput}
                    placeholder="Min"
                    placeholderTextColor={C.textMuted}
                    keyboardType="number-pad"
                    value={minPriceText}
                    onChangeText={setMinPriceText}
                  />
                  <Text style={(m as any).priceDash}>-</Text>
                  <TextInput
                    style={(m as any).priceInput}
                    placeholder="Max"
                    placeholderTextColor={C.textMuted}
                    keyboardType="number-pad"
                    value={maxPriceText}
                    onChangeText={setMaxPriceText}
                  />
                </View>
              </View>

              {/* Grading Company */}
              <View style={{ gap: 8 }}>
                <Text style={(m as any).filterLabel}>Grading</Text>
                <View style={(m as any).sortRow}>
                  <Pressable
                    style={[
                      (m as any).sortChip,
                      { flexDirection: "row", alignItems: "center", gap: 6 },
                      rawSelected && (m as any).sortChipActive,
                    ]}
                    onPress={() => {
                      setRawSelected((v) => {
                        if (v) setSelectedConditions(new Set());
                        return !v;
                      });
                    }}
                  >
                    <Ionicons name="document-text-outline" size={14} color={rawSelected ? C.accent : C.textMuted} />
                    <Text
                      style={[
                        (m as any).sortChipText,
                        rawSelected && (m as any).sortChipTextActive,
                      ]}
                    >
                      Raw / Ungraded
                    </Text>
                  </Pressable>
                  {FILTER_COMPANIES.map((co) => {
                    const active = selectedCompanies.has(co.id);
                    return (
                      <Pressable
                        key={co.id}
                        style={[
                          (m as any).sortChip,
                          { flexDirection: "row", alignItems: "center", gap: 6 },
                          active && (m as any).sortChipActive,
                        ]}
                        onPress={() => toggleCompany(co.id)}
                      >
                        {co.logo && (
                          <Image
                            source={co.logo}
                            style={{ width: 16, height: 16, borderRadius: 3 }}
                            resizeMode="contain"
                          />
                        )}
                        <Text
                          style={[
                            (m as any).sortChipText,
                            active && (m as any).sortChipTextActive,
                          ]}
                        >
                          {co.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Condition tiers for Raw */}
              {rawSelected && (
                <View style={{ gap: 8 }}>
                  <Text style={(m as any).filterLabel}>Condition (Raw)</Text>
                  <View style={(m as any).sortRow}>
                    {CONDITION_TIERS.map((ct) => {
                      const active = selectedConditions.has(ct.tier);
                      return (
                        <Pressable
                          key={ct.tier}
                          style={[
                            (m as any).sortChip,
                            { flexDirection: "row", alignItems: "center", gap: 6 },
                            active && { borderColor: ct.color, backgroundColor: ct.color + "18" },
                          ]}
                          onPress={() => toggleCondition(ct.tier)}
                        >
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ct.color }} />
                          <Text
                            style={[
                              (m as any).sortChipText,
                              active && { color: ct.color },
                            ]}
                          >
                            {ct.tier} — {ct.shortTitle}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Grade Values (shown per selected company) */}
              {selectedCompanies.size > 0 && (
                <View style={{ gap: 12 }}>
                  <Text style={(m as any).filterLabel}>Grade Value</Text>
                  {FILTER_COMPANIES.filter((co) => selectedCompanies.has(co.id)).map((co) => (
                    <View key={co.id} style={{ gap: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        {co.logo && (
                          <Image
                            source={co.logo}
                            style={{ width: 14, height: 14, borderRadius: 2 }}
                            resizeMode="contain"
                          />
                        )}
                        <Text style={{ color: C.textSecondary, fontSize: 11, fontWeight: "700" }}>
                          {co.label}
                        </Text>
                      </View>
                      <View style={(m as any).sortRow}>
                        {co.grades.map((g) => {
                          const key = `${co.id}:${g.value}`;
                          const active = selectedGrades.has(key);
                          return (
                            <Pressable
                              key={key}
                              style={[
                                (m as any).sortChip,
                                active && (m as any).sortChipActive,
                              ]}
                              onPress={() => toggleGrade(co.id, g.value)}
                            >
                              <Text
                                style={[
                                  (m as any).sortChipText,
                                  active && (m as any).sortChipTextActive,
                                ]}
                              >
                                {g.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              </ScrollView>

              <View style={(m as any).filterActions}>
                <Pressable style={(m as any).filterResetBtn} onPress={clearAdvancedFilters}>
                  <Text style={(m as any).filterResetText}>Reset</Text>
                </Pressable>
                <Pressable style={(m as any).filterApplyBtn} onPress={() => setShowFilterSheet(false)}>
                  <Text style={(m as any).filterApplyText}>Apply</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
