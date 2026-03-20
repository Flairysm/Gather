import { useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";

import { C, S } from "../theme";
import { auction as a } from "../styles/auction.styles";
import { shared as sh } from "../styles/shared.styles";
import {
  AUCTION_FILTERS,
  auctionItems,
  type AuctionItem,
} from "../data/auction";

function isUrgent(timeLeft: string): boolean {
  return timeLeft.includes("m") && !timeLeft.includes("h");
}

export default function AuctionScreen() {
  const [activeFilter, setActiveFilter] = useState("All");

  const filtered =
    activeFilter === "All"
      ? auctionItems
      : auctionItems.filter((item) => item.category === activeFilter);

  return (
    <SafeAreaView style={a.safe}>
      <StatusBar style="light" />
      <View style={a.root}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={a.scroll}
        >
          {/* ── Header ── */}
          <View style={a.header}>
            <View style={a.searchBar}>
              <Feather name="search" size={S.iconSize.md} color={C.textMuted} />
              <TextInput
                style={a.searchInput}
                placeholder="Search Auctions"
                placeholderTextColor={C.textMuted}
              />
            </View>
            <Pressable style={a.iconBtn}>
              <Feather name="sliders" size={S.iconSize.md} color={C.textSearch} />
            </Pressable>
          </View>

          {/* ── Filter Pills ── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={a.filterScroll}
          >
            {AUCTION_FILTERS.map((label) => (
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

          {/* ── Auction Grid ── */}
          <View style={a.grid}>
            {filtered.map((item: AuctionItem) => (
              <Pressable key={item.id} style={a.card}>
                <View style={a.artArea}>
                  <View
                    style={[
                      a.timerBadge,
                      isUrgent(item.timeLeft) && a.timerUrgent,
                    ]}
                  >
                    <Ionicons name="time-outline" size={10} color={C.textHero} />
                    <Text style={a.timerText}>{item.timeLeft}</Text>
                  </View>
                  <View style={a.gradeBadge}>
                    <Text style={a.gradeBadgeText}>{item.grade}</Text>
                  </View>
                </View>

                <View style={a.cardInfo}>
                  <Text style={a.cardName} numberOfLines={1}>
                    {item.cardName}
                  </Text>
                  <Text style={a.cardEdition}>{item.edition}</Text>

                  <Text style={a.currentBid}>{item.currentBid}</Text>

                  <View style={a.statsRow}>
                    <View style={a.statItem}>
                      <Ionicons name="hammer-outline" size={11} color={C.textSecondary} />
                      <Text style={a.statText}>
                        {item.bidCount} bid{item.bidCount !== 1 ? "s" : ""}
                      </Text>
                    </View>
                    <View style={a.statItem}>
                      <Ionicons name="eye-outline" size={11} color={C.textSecondary} />
                      <Text style={a.statText}>{item.watchers}</Text>
                    </View>
                  </View>

                  <View style={a.sellerRow}>
                    <View style={a.sellerAvatar} />
                    <Text style={a.sellerName}>@{item.seller}</Text>
                  </View>

                  <Pressable style={a.placeBidBtn}>
                    <Text style={a.placeBidText}>Place Bid</Text>
                  </Pressable>
                </View>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
