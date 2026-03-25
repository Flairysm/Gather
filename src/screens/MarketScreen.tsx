import { useCallback, useEffect, useRef, useState } from "react";
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
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

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
  const [activeTab, setActiveTab] = useState<Tab>("Listings");
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
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

  const loadListings = useCallback(async () => {
    setLoadingListings(true);
    const { data } = await supabase
      .from("listings")
      .select(`
        id, seller_id, card_name, edition, grade, condition, price, quantity,
        category, description, images, views, status, created_at,
        seller:profiles!seller_id(username, display_name, rating, total_sales, avatar_url)
      `)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(50);

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
  }, []);

  const loadWanted = useCallback(async () => {
    setLoadingWanted(true);
    const { data } = await supabase
      .from("wanted_posts")
      .select(`
        id, buyer_id, card_name, edition, grade_wanted, offer_price,
        category, description, image_url, views, status, created_at,
        buyer:profiles!buyer_id(username, display_name, rating, total_purchases, avatar_url)
      `)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) {
      setWantedPosts(
        (data as any[]).map((r) => ({
          ...r,
          buyer: Array.isArray(r.buyer) ? r.buyer[0] : r.buyer,
        })),
      );
    }
    setLoadingWanted(false);
  }, []);

  useEffect(() => {
    loadListings().catch(() => {});
    loadWanted().catch(() => {});
  }, [loadListings, loadWanted]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredListings =
    activeFilter === "All"
      ? listings
      : listings.filter((l) => l.category === activeFilter);

  const filteredWanted =
    activeFilter === "All"
      ? wantedPosts
      : wantedPosts.filter((w) => w.category === activeFilter);

  const searchedListings = normalizedQuery
    ? filteredListings.filter((item) => {
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
      })
    : filteredListings;

  const searchedWanted = normalizedQuery
    ? filteredWanted.filter((item) => {
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
      })
    : filteredWanted;

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
    await Promise.all([
      loadListings().catch(() => {}),
      loadWanted().catch(() => {}),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setRefreshing(false);
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
            <View style={{ gap: S.md, marginBottom: S.lg }}>
              <View
                style={{
                  height: 42,
                  borderRadius: S.radiusSmall,
                  backgroundColor: C.elevated,
                  borderWidth: 1,
                  borderColor: C.border,
                }}
              />
              <View
                style={{
                  height: 44,
                  borderRadius: S.radiusSmall,
                  backgroundColor: C.elevated,
                  borderWidth: 1,
                  borderColor: C.border,
                }}
              />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.cardGap }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <View
                    key={i}
                    style={{
                      width: SKELETON_CARD_W,
                      height: SKELETON_CARD_W * 1.65,
                      borderRadius: S.radiusCard,
                      backgroundColor: C.elevated,
                      borderWidth: 1,
                      borderColor: C.border,
                    }}
                  />
                ))}
              </View>
            </View>
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
            <Pressable style={m.iconBtn}>
              <Feather name="sliders" size={S.iconSize.md} color={C.textSearch} />
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
                <Text style={{ color: C.textMuted, fontSize: 13, padding: 20 }}>
                  Loading listings...
                </Text>
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
                searchedListings.map((item) => (
                  <Pressable
                    key={item.id}
                    style={m.listingCard}
                    onPress={() => push({ type: "LISTING_DETAIL", listingId: item.id })}
                  >
                    <View style={m.listingArt}>
                      {item.images?.[0] ? (
                        <Image
                          source={{ uri: item.images[0] }}
                          style={{ width: "100%", height: "100%", borderRadius: S.radiusCardInner }}
                        />
                      ) : null}
                      {hasDisplayableCondition(item.condition) && (
                        <View style={m.conditionBadge}>
                          <Text numberOfLines={1} style={m.conditionBadgeText}>
                            {item.condition}
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
                            <Image
                              source={{ uri: vendorStores[item.seller_id]!.logo_url! }}
                              style={{ width: 16, height: 16, borderRadius: 8 }}
                            />
                          ) : item.seller?.avatar_url ? (
                            <Image
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
                ))
              )}
            </View>
          )}

          {/* Wanted Tab */}
          {activeTab === "Wanted" && (
            <View style={m.wantedGrid}>
              {loadingWanted && wantedPosts.length === 0 ? (
                <Text style={{ color: C.textMuted, fontSize: 13, padding: 20 }}>
                  Loading wanted posts...
                </Text>
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
                searchedWanted.map((item) => (
                  <Pressable
                    key={item.id}
                    style={m.wantedCard}
                    onPress={() => push({ type: "WANTED_DETAIL", wantedId: item.id })}
                  >
                    <View style={m.wantedArt}>
                      {item.image_url ? (
                        <Image
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
                ))
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
      </View>
    </SafeAreaView>
  );
}
