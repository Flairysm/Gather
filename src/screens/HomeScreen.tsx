import {
  ImageBackground,
  Linking,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, Ionicons } from "@expo/vector-icons";

import CachedImage from "../components/CachedImage";
import ErrorState from "../components/ErrorState";
import Shimmer, { ShimmerGroup } from "../components/Shimmer";
import { C, S } from "../theme";
import { home as h } from "../styles/home.styles";
import { shared as sh } from "../styles/shared.styles";
import type { FilterItem } from "../data/mock";
import { useAppNavigation } from "../navigation/NavigationContext";
import { useCart } from "../data/cart";
import { useFeedPreferences } from "../data/feedPreferences";
import { ALL_CATEGORIES } from "../data/categories";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBadgeContext } from "../hooks/useBadgeCounts";

type FeaturedBanner = {
  id: string;
  image_url: string;
  target_url: string | null;
  heading: string | null;
  subheading: string | null;
  priority: number;
};

type VendorStoreRow = {
  id: string;
  profile_id: string;
  store_name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  theme_color: string;
  display_items: {
    listing_id: string;
    display_order: number;
    listing: {
      id: string;
      card_name: string;
      edition: string | null;
      grade: string | null;
      condition: string | null;
      price: number;
      category: string;
      images: string[];
    } | null;
  }[];
};

function resolveConditionLabel(
  condition: string | null | undefined,
  grade: string | null | undefined,
) {
  const normalizedCondition = (condition ?? "").trim();
  const lower = normalizedCondition.toLowerCase();
  const isNaCondition =
    lower === "na" || lower === "n/a" || lower === "condition n/a";

  if (normalizedCondition && !isNaCondition) return normalizedCondition;

  const normalizedGrade = (grade ?? "").trim();
  return normalizedGrade || null;
}

export default function HomeScreen() {
  const { push } = useAppNavigation();
  const { items } = useCart();
  const { counts, refresh: refreshBadges } = useBadgeContext();
  const { selectedCategories } = useFeedPreferences();
  const [banner, setBanner] = useState<FeaturedBanner | null>(null);
  const [vendorStores, setVendorStores] = useState<VendorStoreRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("For You");
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const feedFilters: FilterItem[] = useMemo(() => {
    const catPills: FilterItem[] = ALL_CATEGORIES
      .filter((c) => selectedCategories.includes(c.key))
      .map((c) => ({ label: c.key }));
    return [
      { label: "For You" },
      ...catPills,
      { label: "See All Categories", isSeeAll: true },
    ];
  }, [selectedCategories]);

  const loadFeaturedBanner = useCallback(async (): Promise<boolean> => {
    const { data, error } = await supabase
      .from("featured_banners")
      .select("id, image_url, target_url, heading, subheading, priority")
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("loadFeaturedBanner failed:", error.message);
      setBanner(null);
      return false;
    }
    setBanner((data as FeaturedBanner | null) ?? null);
    return true;
  }, []);

  const loadVendorStores = useCallback(async (): Promise<boolean> => {
    const { data: ranked, error: rankError } = await supabase.rpc(
      "get_ranked_vendor_stores",
      { p_limit: 12 },
    );

    if (rankError) {
      console.warn("get_ranked_vendor_stores failed:", rankError.message);
      setVendorStores([]);
      return false;
    }

    const rankedRows = (ranked as { store_id: string; slot: number }[]) ?? [];
    const storeIds = rankedRows.map((r) => r.store_id);

    if (storeIds.length === 0) {
      setVendorStores([]);
      return true;
    }

    const slotOrder = new Map(storeIds.map((id, index) => [id, index]));

    const { data, error } = await supabase
      .from("vendor_stores")
      .select(`
        id, profile_id, store_name, description, logo_url, banner_url, theme_color,
        display_items:vendor_display_items(
          listing_id, display_order,
          listing:listings(id, card_name, edition, grade, condition, price, quantity, category, images)
        )
      `)
      .in("id", storeIds);

    if (error) {
      console.warn("loadVendorStores failed:", error.message);
      setVendorStores([]);
      return false;
    }
    if (data) {
      setVendorStores(
        (data as any[])
          .slice()
          .sort(
            (a, b) =>
              (slotOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
              (slotOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
          )
          .map((store) => ({
            ...store,
            display_items: (store.display_items ?? [])
              .map((di: any) => ({
                ...di,
                listing: Array.isArray(di.listing) ? di.listing[0] : di.listing,
              }))
              .filter((di: any) => di.listing && (di.listing.quantity ?? 0) > 0)
              .sort((a: any, b: any) => a.display_order - b.display_order),
          })),
      );
    }
    return true;
  }, []);

  const [partialError, setPartialError] = useState(false);

  const loadAll = useCallback(async () => {
    const results = await Promise.all([
      loadFeaturedBanner(),
      loadVendorStores(),
    ]);
    const failCount = results.filter((ok) => !ok).length;
    setLoadError(failCount === results.length);
    setPartialError(failCount > 0 && failCount < results.length);
  }, [loadFeaturedBanner, loadVendorStores]);

  useEffect(() => {
    loadAll().finally(() => setInitialLoading(false));
  }, [loadAll]);

  async function onRefresh() {
    setRefreshing(true);
    setLoadError(false);
    await Promise.all([
      loadAll(),
      refreshBadges().catch(() => {}),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 700));
    setRefreshing(false);
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredVendorStores = vendorStores
    .map((store) => {
      let items = store.display_items;

      if (activeFilter !== "For You") {
        items = items.filter(
          (di) => di.listing && di.listing.category === activeFilter,
        );
      }

      if (normalizedQuery) {
        const storeMatches = [store.store_name, store.description ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

        if (!storeMatches) {
          items = items.filter((di) => {
            if (!di.listing) return false;
            const hay = [
              di.listing.card_name,
              di.listing.edition ?? "",
              di.listing.grade ?? "",
              di.listing.condition ?? "",
            ]
              .join(" ")
              .toLowerCase();
            return hay.includes(normalizedQuery);
          });
        }
      }

      return { ...store, display_items: items };
    });

  return (
    <SafeAreaView style={h.safe}>
      <StatusBar style="light" />
      <View style={h.root}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={h.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.accent}
            />
          }
        >
          {/* Header */}
          <View style={h.header}>
            <View style={h.searchBar}>
              <Feather name="search" size={S.iconSize.md} color={C.textMuted} />
              <TextInput
                style={h.searchInput}
                placeholder="Search Evend"
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
            <View style={h.headerActions}>
              <Pressable style={h.iconBtn} onPress={() => push({ type: "CART" })} hitSlop={8}>
                <Feather name="shopping-cart" size={S.iconSize.lg} color={C.textSearch} />
                {items.length > 0 && (
                  <View style={h.cartBadge}>
                    <Text style={h.cartBadgeText}>{items.length}</Text>
                  </View>
                )}
              </Pressable>
              <Pressable style={h.iconBtn} onPress={() => push({ type: "MESSAGES" })} hitSlop={8}>
                <Feather name="message-circle" size={S.iconSize.lg} color={C.textSearch} />
                {counts.unreadChats > 0 && (
                  <View style={h.cartBadge}>
                    <Text style={h.cartBadgeText}>
                      {counts.unreadChats > 99 ? "99+" : counts.unreadChats}
                    </Text>
                  </View>
                )}
              </Pressable>
              <Pressable style={h.iconBtn} onPress={() => push({ type: "NOTIFICATIONS_HUB" })} hitSlop={8}>
                <Ionicons name="notifications-outline" size={S.iconSize.lg} color={C.textSearch} />
                {counts.unreadNotifications > 0 && (
                  <View style={h.cartBadge}>
                    <Text style={h.cartBadgeText}>
                      {counts.unreadNotifications > 99 ? "99+" : counts.unreadNotifications}
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>

          {/* Error State */}
          {loadError && !initialLoading && !refreshing && (
            <ErrorState
              message="Failed to load content. Check your connection and try again."
              onRetry={onRefresh}
            />
          )}

          {/* Partial error banner */}
          {partialError && !loadError && !initialLoading && !refreshing && (
            <Pressable
              onPress={onRefresh}
              style={{ backgroundColor: "#78350F", borderRadius: S.radiusCard, padding: 10, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Ionicons name="warning-outline" size={16} color="#FBBF24" />
              <Text style={{ color: "#FDE68A", fontSize: 12, flex: 1 }}>Some content failed to load. Tap to retry.</Text>
            </Pressable>
          )}

          {/* Hero Banner */}
          {refreshing || initialLoading ? (
            <Shimmer width="100%" height={S.heroHeight} borderRadius={S.radiusCard} />
          ) : banner ? (
            (() => {
              const targetUrl =
                banner.target_url && /^https?:\/\//i.test(banner.target_url)
                  ? banner.target_url
                  : null;
              const heroContent = (
                <ImageBackground
                  source={{ uri: banner.image_url }}
                  imageStyle={h.heroImg}
                  style={h.hero}
                >
                  <LinearGradient
                    colors={["transparent", C.gradientHeroEnd]}
                    style={h.heroGradient}
                  >
                    <Text style={h.heroTitle}>{banner.heading ?? "FEATURED"}</Text>
                    <Text style={h.heroSub}>
                      {banner.subheading ?? (targetUrl ? "Tap to learn more" : "Live promotion")}
                    </Text>
                  </LinearGradient>
                </ImageBackground>
              );
              return targetUrl ? (
                <Pressable onPress={() => Linking.openURL(targetUrl)}>{heroContent}</Pressable>
              ) : (
                heroContent
              );
            })()
          ) : (
            <View style={[h.hero, h.noBanner]}>
              <Text style={h.noBannerTitle}>No featured banner</Text>
              <Text style={h.noBannerSub}>
                Check back soon for promotions.
              </Text>
            </View>
          )}

          {/* Filter Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={h.filterScroll}
          >
            {feedFilters.map((item: FilterItem) => {
              const isActive = !item.isSeeAll && activeFilter === item.label;
              return (
                <Pressable
                  key={item.label}
                  style={[
                    sh.pill,
                    item.isSeeAll ? sh.pillSeeAll : isActive && sh.pillActive,
                  ]}
                  onPress={() => {
                    if (item.isSeeAll) {
                      push({ type: "BROWSE_CATEGORIES" });
                    } else {
                      setActiveFilter(item.label);
                    }
                  }}
                >
                  <Text
                    style={
                      item.isSeeAll
                        ? sh.pillSeeAllText
                        : [sh.pillText, isActive && sh.pillTextActive]
                    }
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Vendor Stores — each store is its own section */}
          {filteredVendorStores.map((store) => (
            <View key={store.id} style={h.vendorSection}>
              {/* Section header — same pattern as placeholders */}
              <View style={sh.sectionRow}>
                <View style={sh.sectionLeft}>
                  <View style={sh.sectionIcon}>
                    {store.logo_url ? (
                      <CachedImage
                        source={{ uri: store.logo_url }}
                        style={h.sectionLogoImg}
                      />
                    ) : (
                      <Ionicons name="storefront" size={S.iconSize.sm} color={C.textIcon} />
                    )}
                  </View>
                  <View>
                    <Text style={sh.sectionName}>{store.store_name}</Text>
                  </View>
                </View>
                <Pressable
                  style={sh.arrowBtn}
                  onPress={() =>
                    push({ type: "VENDOR_STORE_PAGE", storeId: store.id })
                  }
                >
                  <Feather name="chevron-right" size={S.iconSize.md} color={C.textArrow} />
                </Pressable>
              </View>

              {/* Display items — horizontal scroll */}
              {(() => {
                const hasItems = store.display_items.length > 0;

                if (!hasItems) {
                  return (
                    <View style={h.noDisplayItems}>
                      <Text style={h.noDisplayItemsText}>No items listed</Text>
                    </View>
                  );
                }

                return (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={h.vaultScroll}
                  >
                    {/* Regular display items */}
                    {store.display_items.map((di) => {
                      if (!di.listing) return null;
                      const label = resolveConditionLabel(
                        di.listing.condition,
                        di.listing.grade,
                      );

                      return (
                        <Pressable
                          key={di.listing_id}
                          style={[h.vaultCard, { width: S.vaultCardW }]}
                          onPress={() =>
                            push({ type: "LISTING_DETAIL", listingId: di.listing!.id })
                          }
                        >
                          <View style={h.vaultArt}>
                            {di.listing.images?.[0] ? (
                              <CachedImage
                                source={{ uri: di.listing.images[0] }}
                                style={h.displayItemImg}
                              />
                            ) : (
                              <View style={h.artPlaceholder} />
                            )}
                            {label ? (
                              <View style={h.conditionBadge}>
                                <Text numberOfLines={1} style={h.conditionBadgeText}>
                                  {label}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={h.vaultEdition}>
                            {[di.listing.edition, di.listing.grade].filter(Boolean).join(" · ") || "Listing"}
                          </Text>
                          <Text style={h.vaultName} numberOfLines={1}>
                            {di.listing.card_name}
                          </Text>
                          <View style={h.priceRow}>
                            <Text style={h.vaultPrice}>
                              RM
                              {Number(di.listing.price).toLocaleString("en-MY", {
                                maximumFractionDigits: 0,
                              })}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                );
              })()}
            </View>
          ))}
          {initialLoading ? (
            <ShimmerGroup>
              {[0, 1].map((i) => (
                <View key={i} style={{ marginBottom: 20, gap: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: S.screenPadding }}>
                    <Shimmer width={36} height={36} borderRadius={18} />
                    <View style={{ gap: 4 }}>
                      <Shimmer width={100} height={13} borderRadius={5} />
                      <Shimmer width={60} height={10} borderRadius={4} />
                    </View>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: S.screenPadding, gap: 10 }}>
                    {[0, 1, 2].map((j) => (
                      <Shimmer key={j} width={140} height={180} borderRadius={S.radiusCard} />
                    ))}
                  </ScrollView>
                </View>
              ))}
            </ShimmerGroup>
          ) : filteredVendorStores.length === 0 ? (
            <View style={h.noDisplayItems}>
              <Text style={h.noDisplayItemsText}>
                {normalizedQuery
                  ? "No matching results"
                  : activeFilter !== "For You"
                    ? `No ${activeFilter} items in stores right now`
                    : "No vendor stores yet"}
              </Text>
            </View>
          ) : null}
        </ScrollView>

      </View>
    </SafeAreaView>
  );
}
