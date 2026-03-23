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
import { FILTERS } from "../data/mock";
import type { FilterItem } from "../data/mock";
import { useAppNavigation } from "../navigation/NavigationContext";
import { useCart } from "../data/cart";
import { useCallback, useEffect, useState } from "react";
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
      price: number;
      images: string[];
    } | null;
  }[];
};

export default function HomeScreen() {
  const { push } = useAppNavigation();
  const { items } = useCart();
  const [banner, setBanner] = useState<FeaturedBanner | null>(null);
  const [vendorStores, setVendorStores] = useState<VendorStoreRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

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
        id, store_name, description, logo_url, banner_url, theme_color,
        display_items:vendor_display_items(
          listing_id, display_order,
          listing:listings(id, card_name, edition, price, images)
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

  useEffect(() => {
    let mounted = true;
    loadFeaturedBanner().catch(() => {});
    loadVendorStores().catch(() => {});

    return () => {
      mounted = false;
    };
  }, [loadFeaturedBanner, loadVendorStores]);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([
      loadFeaturedBanner().catch(() => {}),
      loadVendorStores().catch(() => {}),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 700));
    setRefreshing(false);
  }

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
              />
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
            {FILTERS.map((item: FilterItem, i) => (
              <Pressable
                key={item.label}
                style={[
                  sh.pill,
                  item.isSeeAll ? sh.pillSeeAll : i === 0 && sh.pillActive,
                ]}
              >
                <Text
                  style={
                    item.isSeeAll
                      ? sh.pillSeeAllText
                      : [sh.pillText, i === 0 && sh.pillTextActive]
                  }
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Vendor Stores — each store is its own section */}
          {vendorStores.map((store) => (
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
                    <Text style={sh.offlineTag}>● OFFLINE</Text>
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
                  {store.display_items.map((di) =>
                    di.listing ? (
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
                        </View>
                        <Text style={h.vaultEdition}>
                          {di.listing.edition ?? "Listing"}
                        </Text>
                        <Text style={h.vaultName} numberOfLines={1}>
                          {di.listing.card_name}
                        </Text>
                        <View style={h.priceRow}>
                          <Text style={h.vaultPrice}>
                            ${Number(di.listing.price).toLocaleString()}
                          </Text>
                        </View>
                      </Pressable>
                    ) : null,
                  )}
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
        </ScrollView>

      </View>
    </SafeAreaView>
  );
}
