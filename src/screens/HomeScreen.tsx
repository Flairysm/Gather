import {
  Image,
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
  const { selectedCategories } = useFeedPreferences();
  const [banner, setBanner] = useState<FeaturedBanner | null>(null);
  const [vendorStores, setVendorStores] = useState<VendorStoreRow[]>([]);
  const [liveProfileIds, setLiveProfileIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("For You");
  const [refreshing, setRefreshing] = useState(false);

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

  const loadFeaturedBanner = useCallback(async () => {
    const { data } = await supabase
      .from("featured_banners")
      .select("id, image_url, target_url, heading, subheading, priority")
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setBanner((data as FeaturedBanner | null) ?? null);
  }, []);

  const loadVendorStores = useCallback(async () => {
    const { data } = await supabase
      .from("vendor_stores")
      .select(`
        id, profile_id, store_name, description, logo_url, banner_url, theme_color,
        display_items:vendor_display_items(
          listing_id, display_order,
          listing:listings(id, card_name, edition, grade, condition, price, quantity, category, images)
        )
      `)
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .limit(10);

    if (data) {
      setVendorStores(
        (data as any[]).map((store) => ({
          ...store,
          display_items: (store.display_items ?? [])
            .map((di: any) => ({
              ...di,
              listing: Array.isArray(di.listing) ? di.listing[0] : di.listing,
            }))
            .sort((a: any, b: any) => a.display_order - b.display_order),
        })),
      );
    }
  }, []);

  const loadLiveStreams = useCallback(async () => {
    const { data } = await supabase
      .from("live_streams")
      .select("streamer_id")
      .eq("is_live", true);
    if (data) {
      setLiveProfileIds(new Set(data.map((s: any) => s.streamer_id)));
    }
  }, []);

  useEffect(() => {
    loadFeaturedBanner().catch(() => {});
    loadVendorStores().catch(() => {});
    loadLiveStreams().catch(() => {});
  }, [loadFeaturedBanner, loadVendorStores, loadLiveStreams]);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([
      loadFeaturedBanner().catch(() => {}),
      loadVendorStores().catch(() => {}),
      loadLiveStreams().catch(() => {}),
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
    })
    .filter(
      (store) =>
        store.display_items.length > 0 ||
        (normalizedQuery &&
          store.store_name.toLowerCase().includes(normalizedQuery)),
    );

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
                placeholder="Search Gather"
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
              <Pressable style={h.iconBtn} onPress={() => push({ type: "CART" })}>
                <Feather name="shopping-cart" size={S.iconSize.lg} color={C.textSearch} />
                {items.length > 0 && (
                  <View style={h.cartBadge}>
                    <Text style={h.cartBadgeText}>{items.length}</Text>
                  </View>
                )}
              </Pressable>
              <Pressable style={h.iconBtn} onPress={() => push({ type: "MESSAGES" })}>
                <Feather name="message-circle" size={S.iconSize.lg} color={C.textSearch} />
              </Pressable>
              <Image
                source={require("../../assets/icon.png")}
                style={h.avatar}
              />
            </View>
          </View>

          {/* Hero Banner */}
          {refreshing ? (
            <View style={h.refreshSkeletonHero} />
          ) : banner ? (
            <Pressable
              onPress={() => {
                if (banner.target_url) {
                  Linking.openURL(banner.target_url);
                }
              }}
            >
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
                    {banner.subheading ??
                      (banner.target_url ? "Tap to learn more" : "Live promotion")}
                  </Text>
                </LinearGradient>
              </ImageBackground>
            </Pressable>
          ) : (
            <View style={[h.hero, h.noBanner]}>
              <Text style={h.noBannerTitle}>No featured banner</Text>
              <Text style={h.noBannerSub}>
                Admin can add banners from the dashboard.
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
                      <Image
                        source={{ uri: store.logo_url }}
                        style={h.sectionLogoImg}
                      />
                    ) : (
                      <Ionicons name="storefront" size={S.iconSize.sm} color={C.textIcon} />
                    )}
                  </View>
                  <View>
                    <Text style={sh.sectionName}>{store.store_name}</Text>
                    {liveProfileIds.has(store.profile_id) ? (
                      <Text style={sh.liveTag}>● LIVE</Text>
                    ) : (
                      <Text style={sh.offlineTag}>● OFFLINE</Text>
                    )}
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

              {/* Display items — horizontal scroll like featured cards */}
              {store.display_items.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={h.vaultScroll}
                >
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
                            <Image
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
                          {di.listing.edition ?? "Listing"}
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
              ) : (
                <View style={h.noDisplayItems}>
                  <Text style={h.noDisplayItemsText}>
                    No display items yet
                  </Text>
                </View>
              )}
            </View>
          ))}
          {filteredVendorStores.length === 0 && (
            <View style={h.noDisplayItems}>
              <Text style={h.noDisplayItemsText}>
                {normalizedQuery
                  ? "No matching results"
                  : activeFilter !== "For You"
                    ? `No ${activeFilter} items in stores right now`
                    : "No vendor stores yet"}
              </Text>
            </View>
          )}
        </ScrollView>

      </View>
    </SafeAreaView>
  );
}
