import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { Feather, Ionicons } from "@expo/vector-icons";

import { C, S } from "../theme";
import { auction as a } from "../styles/auction.styles";
import { shared as sh } from "../styles/shared.styles";
import { AUCTION_FILTERS } from "../data/auction";
import { useAppNavigation } from "../navigation/NavigationContext";
import { UserContext } from "../data/user";
import { supabase } from "../lib/supabase";
import { useContext } from "react";

type AuctionRow = {
  id: string;
  seller_id: string;
  card_name: string;
  edition: string | null;
  grade: string | null;
  condition: string | null;
  starting_price: number;
  current_bid: number | null;
  bid_count: number;
  watchers: number;
  category: string;
  images: string[] | null;
  ends_at: string;
  original_ends_at: string | null;
  status: string;
  buy_now_price: number | null;
  reserve_price: number | null;
  created_at: string;
  seller?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
};

type SortKey = "ending" | "newest" | "bids" | "priceLow" | "priceHigh";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "ending", label: "Ending Soon" },
  { key: "newest", label: "Newest" },
  { key: "bids", label: "Most Bids" },
  { key: "priceLow", label: "Price ↑" },
  { key: "priceHigh", label: "Price ↓" },
];

function normalizeImages(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.flatMap((v) => normalizeImages(v));
  if (typeof raw === "string") {
    const trimmed = raw.replace(/^\{|\}$/g, "");
    if (trimmed.startsWith("http")) return [trimmed];
    try {
      const parsed = JSON.parse(trimmed);
      return normalizeImages(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

function formatTimeLeft(endsAt: string): { text: string; urgent: boolean; ended: boolean } {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return { text: "Ended", urgent: false, ended: true };

  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hrs = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (days > 0) return { text: `${days}d ${hrs}h`, urgent: false, ended: false };
  if (hrs > 0) return { text: `${hrs}h ${mins}m`, urgent: false, ended: false };
  if (mins > 5) return { text: `${mins}m ${secs}s`, urgent: false, ended: false };
  if (mins > 0) return { text: `${mins}m ${secs}s`, urgent: true, ended: false };
  return { text: `${secs}s`, urgent: true, ended: false };
}

function formatPrice(n: number): string {
  return `RM${n.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function AuctionScreen() {
  const { push } = useAppNavigation();
  const { isVerifiedVendor } = useContext(UserContext);
  const [auctions, setAuctions] = useState<AuctionRow[]>([]);
  const [vendorStores, setVendorStores] = useState<
    Record<string, { store_name: string; logo_url: string | null }>
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("ending");
  const [searchQuery, setSearchQuery] = useState("");
  const [, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    tickRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("auction_items")
      .select(`
        id, seller_id, card_name, edition, grade, condition,
        starting_price, current_bid, bid_count, watchers, category,
        images, ends_at, original_ends_at, status, buy_now_price,
        reserve_price, created_at,
        seller:profiles!seller_id(username, display_name, avatar_url)
      `)
      .in("status", ["active", "ended"])
      .order("ends_at", { ascending: true });

    if (data) {
      const mapped: AuctionRow[] = (data as any[]).map((r) => ({
        ...r,
        seller: Array.isArray(r.seller) ? r.seller[0] : r.seller,
      }));
      setAuctions(mapped);

      const sellerIds = [...new Set(mapped.map((a) => a.seller_id))];
      if (sellerIds.length > 0) {
        const { data: stores } = await supabase
          .from("vendor_stores")
          .select("profile_id, store_name, logo_url")
          .in("profile_id", sellerIds)
          .eq("is_active", true);
        if (stores) {
          const map: Record<
            string,
            { store_name: string; logo_url: string | null }
          > = {};
          for (const s of stores) {
            if (s.profile_id) {
              map[s.profile_id] = {
                store_name: s.store_name,
                logo_url: s.logo_url ?? null,
              };
            }
          }
          setVendorStores(map);
        }
      }
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const filtered = useMemo(() => {
    let items = auctions;

    if (activeFilter !== "All") {
      items = items.filter((i) => i.category === activeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (i) =>
          i.card_name.toLowerCase().includes(q) ||
          (i.edition ?? "").toLowerCase().includes(q) ||
          (i.grade ?? "").toLowerCase().includes(q),
      );
    }

    const sorted = [...items];
    switch (sortKey) {
      case "ending":
        sorted.sort((a, b) => new Date(a.ends_at).getTime() - new Date(b.ends_at).getTime());
        break;
      case "newest":
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case "bids":
        sorted.sort((a, b) => (b.bid_count ?? 0) - (a.bid_count ?? 0));
        break;
      case "priceLow":
        sorted.sort((a, b) => (a.current_bid ?? a.starting_price) - (b.current_bid ?? b.starting_price));
        break;
      case "priceHigh":
        sorted.sort((a, b) => (b.current_bid ?? b.starting_price) - (a.current_bid ?? a.starting_price));
        break;
    }

    return sorted;
  }, [auctions, activeFilter, searchQuery, sortKey]);

  function getSellerLabel(item: AuctionRow): string {
    return (
      vendorStores[item.seller_id]?.store_name ??
      item.seller?.display_name ??
      (item.seller?.username ? `@${item.seller.username}` : "Seller")
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={a.safe}>
        <StatusBar style="light" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={a.safe}>
      <StatusBar style="light" />
      <View style={a.root}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={a.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
          }
        >
          <View style={a.header}>
            <View style={a.searchBar}>
              <Feather name="search" size={S.iconSize.md} color={C.textMuted} />
              <TextInput
                style={a.searchInput}
                placeholder="Search Auctions"
                placeholderTextColor={C.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery("")} hitSlop={10}>
                  <Feather name="x" size={16} color={C.textMuted} />
                </Pressable>
              )}
            </View>
          </View>

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
                <Text style={[sh.pillText, activeFilter === label && sh.pillTextActive]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={a.sortScroll}
          >
            {SORT_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                style={[a.sortChip, sortKey === opt.key && a.sortChipActive]}
                onPress={() => setSortKey(opt.key)}
              >
                <Text style={[a.sortChipText, sortKey === opt.key && a.sortChipTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {filtered.length === 0 ? (
            <View style={a.emptyWrap}>
              <Ionicons name="hammer-outline" size={36} color={C.textMuted} />
              <Text style={a.emptyText}>No auctions found</Text>
            </View>
          ) : (
            <View style={a.grid}>
              {filtered.map((item) => {
                const images = normalizeImages(item.images);
                const timer = formatTimeLeft(item.ends_at);
                const price = item.current_bid ?? item.starting_price;
                const isExtended =
                  item.original_ends_at &&
                  new Date(item.ends_at).getTime() > new Date(item.original_ends_at).getTime();
                const isHot = !timer.ended && timer.urgent;

                return (
                  <Pressable
                    key={item.id}
                    style={a.card}
                    onPress={() => push({ type: "AUCTION_DETAIL", auctionId: item.id })}
                  >
                    <View style={a.artArea}>
                      {images[0] ? (
                        <Image source={{ uri: images[0] }} style={a.artImage} />
                      ) : null}
                      <View style={[a.timerBadge, timer.urgent && a.timerUrgent, timer.ended && a.timerEnded]}>
                        <Ionicons name="time-outline" size={10} color={C.textHero} />
                        <Text style={a.timerText}>{timer.text}</Text>
                      </View>
                      {item.grade ? (
                        <View style={a.gradeBadge}>
                          <Text style={a.gradeBadgeText}>{item.grade}</Text>
                        </View>
                      ) : null}
                      {isHot && (
                        <View style={a.hotBadge}>
                          <Ionicons name="flame" size={8} color={C.textHero} />
                          <Text style={a.hotText}>Hot</Text>
                        </View>
                      )}
                      {isExtended && !timer.ended && (
                        <View style={a.snipeBadge}>
                          <Ionicons name="shield" size={7} color={C.textHero} />
                          <Text style={a.snipeText}>Extended</Text>
                        </View>
                      )}
                    </View>

                    <View style={a.cardInfo}>
                      <Text style={a.cardName} numberOfLines={1}>
                        {item.card_name}
                      </Text>
                      <Text style={a.cardEdition}>{item.edition ?? ""}</Text>
                      <Text style={a.currentBid}>{formatPrice(price)}</Text>
                      <View style={a.statsRow}>
                        <View style={a.statItem}>
                          <Ionicons name="hammer-outline" size={11} color={C.textSecondary} />
                          <Text style={a.statText}>
                            {item.bid_count ?? 0} bid{(item.bid_count ?? 0) !== 1 ? "s" : ""}
                          </Text>
                        </View>
                        <View style={a.statItem}>
                          <Ionicons name="eye-outline" size={11} color={C.textSecondary} />
                          <Text style={a.statText}>{item.watchers ?? 0}</Text>
                        </View>
                      </View>
                      <View style={a.sellerRow}>
                        <View style={a.sellerAvatar}>
                          {vendorStores[item.seller_id]?.logo_url ? (
                            <Image
                              source={{ uri: vendorStores[item.seller_id]!.logo_url! }}
                              style={{ width: 14, height: 14, borderRadius: 7 }}
                            />
                          ) : item.seller?.avatar_url ? (
                            <Image
                              source={{ uri: item.seller.avatar_url }}
                              style={{ width: 14, height: 14, borderRadius: 7 }}
                            />
                          ) : null}
                        </View>
                        <Text style={a.sellerName} numberOfLines={1}>
                          {getSellerLabel(item)}
                        </Text>
                      </View>
                      <View style={a.placeBidBtn}>
                        <Text style={a.placeBidText}>
                          {timer.ended ? "View Result" : "Place Bid"}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>

        {isVerifiedVendor && (
          <Pressable style={a.fab} onPress={() => push({ type: "CREATE_AUCTION" })}>
            <Ionicons name="add" size={28} color={C.textHero} />
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}
