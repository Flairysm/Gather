import {
  Image,
  ImageBackground,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

import { C, S } from "../theme";
import { home as h } from "../styles/home.styles";
import { shared as sh } from "../styles/shared.styles";
import { FILTERS, streamFeatured, vaultCards } from "../data/mock";
import type { FilterItem } from "../data/mock";
import { useAppNavigation } from "../navigation/NavigationContext";
import { useCart } from "../data/cart";

export default function HomeScreen() {
  const { push } = useAppNavigation();
  const { items } = useCart();

  return (
    <SafeAreaView style={h.safe}>
      <StatusBar style="light" />
      <View style={h.root}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={h.scroll}
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
          <ImageBackground
            source={require("../../assets/reference-design.png")}
            imageStyle={h.heroImg}
            style={h.hero}
          >
            <LinearGradient
              colors={["transparent", C.gradientHeroEnd]}
              style={h.heroGradient}
            >
              <Text style={h.heroTitle}>NATIONAL CARD EXPO</Text>
              <Text style={h.heroSub}>VIRTUAL ACCESS  •  LIVE NOW</Text>
            </LinearGradient>
          </ImageBackground>

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

          {/* SlabLab Section */}
          <View style={sh.sectionRow}>
            <View style={sh.sectionLeft}>
              <View style={sh.sectionIcon}>
                <Ionicons name="flask" size={S.iconSize.sm} color={C.textIcon} />
              </View>
              <View>
                <Text style={sh.sectionName}>SlabLab</Text>
                <Text style={sh.liveTag}>● LIVE</Text>
              </View>
            </View>
            <Pressable style={sh.arrowBtn}>
              <Feather name="chevron-right" size={S.iconSize.md} color={C.textArrow} />
            </Pressable>
          </View>

          {/* Stream + Featured Cards */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={h.streamRow}
          >
            <View style={[h.streamCard, { width: S.streamCardW }]}>
              <LinearGradient
                colors={[C.accentGlow, C.gradientStreamEnd]}
                style={h.streamInner}
              >
                <View style={h.playCircle}>
                  <Feather name="play" size={S.iconSize.play} color="#DCEAFF" />
                </View>
                <Text style={h.streamCta}>JOIN STREAM</Text>
                <Text style={h.streamMeta}>1.2K WATCHING</Text>
              </LinearGradient>
            </View>

            {streamFeatured.map((card) => (
              <View key={card.id} style={[h.featuredCard, { width: S.featuredCardW }]}>
                <View style={h.featuredArt} />
                <Text style={h.featuredEdition}>{card.edition}</Text>
                <Text style={h.featuredName} numberOfLines={1}>
                  {card.name}
                </Text>
                <Text style={h.featuredPrice}>{card.price}</Text>
              </View>
            ))}
          </ScrollView>

          {/* The Rip Vault Section */}
          <View style={sh.sectionRow}>
            <View style={sh.sectionLeft}>
              <View style={sh.sectionIcon}>
                <MaterialCommunityIcons
                  name="diamond-stone"
                  size={S.iconSize.sm}
                  color={C.textIcon}
                />
              </View>
              <View>
                <Text style={sh.sectionName}>The Rip Vault</Text>
                <Text style={sh.offlineTag}>● OFFLINE</Text>
              </View>
            </View>
            <Pressable style={sh.arrowBtn}>
              <Feather name="chevron-right" size={S.iconSize.md} color={C.textArrow} />
            </Pressable>
          </View>

          {/* Vault Cards */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={h.vaultScroll}
          >
            {vaultCards.map((card) => (
              <View key={card.id} style={[h.vaultCard, { width: S.vaultCardW }]}>
                <View style={h.vaultArt}>
                  <View style={h.badgeChip}>
                    <Text style={h.badgeText}>{card.badge}</Text>
                  </View>
                  <View style={h.artPlaceholder} />
                </View>
                <Text style={h.vaultEdition}>{card.edition}</Text>
                <Text style={h.vaultName} numberOfLines={1}>
                  {card.name}
                </Text>
                <View style={h.priceRow}>
                  <Text style={h.vaultPrice}>{card.price}</Text>
                  <View
                    style={[
                      h.trendChip,
                      card.trendUp ? h.trendUp : h.trendDown,
                    ]}
                  >
                    <Text
                      style={[
                        h.trendText,
                        card.trendUp ? h.trendTextUp : h.trendTextDown,
                      ]}
                    >
                      {card.trend}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        </ScrollView>

      </View>
    </SafeAreaView>
  );
}
