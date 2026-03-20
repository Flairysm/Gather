import { useRef, useState } from "react";
import {
  Animated,
  Pressable,
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
  listings,
  wantedPosts,
  type Listing,
  type WantedPost,
} from "../data/market";
import { useAppNavigation } from "../navigation/NavigationContext";
import { useUser } from "../data/user";

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

export default function MarketScreen() {
  const { push } = useAppNavigation();
  const { isVerifiedVendor } = useUser();
  const [activeTab, setActiveTab] = useState<Tab>("Listings");
  const [activeFilter, setActiveFilter] = useState("All");
  const [fabOpen, setFabOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  const filteredListings =
    activeFilter === "All"
      ? listings
      : listings.filter((l) => l.category === activeFilter);

  const filteredWanted =
    activeFilter === "All"
      ? wantedPosts
      : wantedPosts.filter((w) => w.category === activeFilter);

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

  return (
    <SafeAreaView style={m.safe}>
      <StatusBar style="light" />
      <View style={m.root}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={m.scroll}
        >
          {/* ── Header ── */}
          <View style={m.header}>
            <View style={m.searchBar}>
              <Feather name="search" size={S.iconSize.md} color={C.textMuted} />
              <TextInput
                style={m.searchInput}
                placeholder="Search Market"
                placeholderTextColor={C.textMuted}
              />
            </View>
            <Pressable style={m.iconBtn}>
              <Feather name="sliders" size={S.iconSize.md} color={C.textSearch} />
            </Pressable>
          </View>

          {/* ── Segment Control ── */}
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

          {/* ── Category Filter Pills ── */}
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

          {/* ── Listings Tab ── */}
          {activeTab === "Listings" && (
            <View style={m.listingsGrid}>
              {filteredListings.map((item: Listing) => (
                <Pressable
                  key={item.id}
                  style={m.listingCard}
                  onPress={() => push({ type: "LISTING_DETAIL", listingId: item.id })}
                >
                  <View style={m.listingArt}>
                    <View style={m.gradeBadge}>
                      <Text style={m.gradeBadgeText}>{item.grade}</Text>
                    </View>
                  </View>
                  <View style={m.listingInfo}>
                    <Text style={m.listingName} numberOfLines={1}>
                      {item.cardName}
                    </Text>
                    <Text style={m.listingEdition}>{item.edition}</Text>
                    <Text style={m.listingPrice}>{item.price}</Text>
                    <View style={m.listingMeta}>
                      <View style={m.sellerRow}>
                        <View style={m.sellerAvatar} />
                        <Text style={m.sellerName}>@{item.seller}</Text>
                      </View>
                      <Text style={m.postedAt}>{item.postedAt}</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {/* ── Wanted Tab ── */}
          {activeTab === "Wanted" && (
            <View style={m.wantedGrid}>
              {filteredWanted.map((item: WantedPost) => (
                <Pressable
                  key={item.id}
                  style={m.wantedCard}
                  onPress={() => push({ type: "WANTED_DETAIL", wantedId: item.id })}
                >
                  <View style={m.wantedArt} />
                  <View style={m.wantedTag}>
                    <Text style={m.wantedTagText}>WTB</Text>
                  </View>
                  <Text style={m.wantedName} numberOfLines={1}>
                    {item.cardName}
                  </Text>
                  <Text style={m.wantedEdition}>{item.edition}</Text>
                  <View style={m.gradeWantedChip}>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={11}
                      color={C.textIcon}
                    />
                    <Text style={m.gradeWantedText}>{item.gradeWanted}</Text>
                  </View>
                  <View style={m.wantedDivider} />
                  <View style={m.offerRow}>
                    <Text style={m.offerLabel}>Offering</Text>
                    <Text style={m.offerPrice}>{item.offerPrice}</Text>
                  </View>
                  <View style={m.wantedMeta}>
                    <View style={m.wantedBuyerRow}>
                      <View style={m.wantedAvatar} />
                      <Text style={m.wantedBuyer}>@{item.buyer}</Text>
                    </View>
                    <Text style={m.wantedPostedAt}>{item.postedAt}</Text>
                  </View>
                </Pressable>
              ))}
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
