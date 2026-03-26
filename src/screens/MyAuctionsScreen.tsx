import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";

import CachedImage from "../components/CachedImage";
import TruncationNotice from "../components/TruncationNotice";
import { C, S } from "../theme";
import { supabase } from "../lib/supabase";
import { useReconnect } from "../hooks/useReconnect";
import { useAppNavigation } from "../navigation/NavigationContext";

type TabId = "won" | "active" | "lost" | "history" | "watching";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "watching", label: "Watching", icon: "eye-outline" },
  { id: "active", label: "Active", icon: "hammer-outline" },
  { id: "won", label: "Won", icon: "trophy-outline" },
  { id: "lost", label: "Loss", icon: "close-circle-outline" },
  { id: "history", label: "History", icon: "time-outline" },
];

type AuctionInfo = {
  id: string;
  card_name: string;
  edition: string | null;
  grade: string | null;
  images: unknown;
  current_bid: number | null;
  starting_price: number;
  ends_at: string;
  status: string;
  winner_id: string | null;
  highest_bidder_id: string | null;
  seller_id: string;
  seller?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

type WinRow = {
  id: string;
  auction_id: string;
  winning_bid: number;
  payment_deadline: string;
  payment_status: string;
  paid_at: string | null;
  created_at: string;
  auction: AuctionInfo | null;
};

type BidRow = {
  id: string;
  auction_id: string;
  amount: number;
  created_at: string;
  auction: AuctionInfo | null;
};

type WatchRow = {
  auction_id: string;
  created_at: string;
  auction: AuctionInfo | null;
};

type ActiveBid = {
  auctionId: string;
  highestBid: number;
  bidCount: number;
  isHighBidder: boolean;
  auction: AuctionInfo;
};

type LostAuction = {
  auctionId: string;
  myHighest: number;
  auction: AuctionInfo;
};

function normalizeImages(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.flatMap((v) => normalizeImages(v));
  if (typeof raw === "string") {
    const trimmed = raw.replace(/^\{|\}$/g, "");
    if (trimmed.startsWith("http")) return [trimmed];
    try {
      return normalizeImages(JSON.parse(trimmed));
    } catch {
      return [];
    }
  }
  return [];
}

function formatPrice(n: number): string {
  return `RM${n.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatCountdown(deadline: string): { text: string; urgent: boolean; expired: boolean } {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return { text: "Expired", urgent: false, expired: true };

  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hrs = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);

  if (days > 0) return { text: `${days}d ${hrs}h left`, urgent: days < 1, expired: false };
  if (hrs > 0) return { text: `${hrs}h ${mins}m left`, urgent: true, expired: false };
  return { text: `${mins}m left`, urgent: true, expired: false };
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

export default function MyAuctionsScreen({ onBack }: { onBack: () => void }) {
  const { push } = useAppNavigation();
  const [tab, setTab] = useState<TabId>("won");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  

  const [wins, setWins] = useState<WinRow[]>([]);
  const [allBids, setAllBids] = useState<BidRow[]>([]);
  const [watched, setWatched] = useState<WatchRow[]>([]);

  const [, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    tickRef.current = setInterval(() => setTick((t) => t + 1), 30000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const AUCTION_SELECT = `
      id, card_name, edition, grade, images, current_bid, starting_price,
      ends_at, status, winner_id, highest_bidder_id, seller_id,
      seller:profiles!seller_id(username, display_name, avatar_url)
    `;

    const [{ data: winsData }, { data: bidsData }, { data: watchedData }] = await Promise.all([
      supabase
        .from("auction_wins")
        .select(`
          id, auction_id, winning_bid, payment_deadline, payment_status, paid_at, created_at,
          auction:auction_items!auction_id(${AUCTION_SELECT})
        `)
        .eq("winner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("auction_bids")
        .select(`
          id, auction_id, amount, created_at,
          auction:auction_items!auction_id(${AUCTION_SELECT})
        `)
        .eq("bidder_id", user.id)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("auction_watchers")
        .select(`
          auction_id, created_at,
          auction:auction_items!auction_id(${AUCTION_SELECT})
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    const mapRow = (row: any) => ({
      ...row,
      auction: Array.isArray(row.auction) ? row.auction[0] : row.auction,
    });

    setWins((winsData ?? []).map(mapRow));
    setAllBids((bidsData ?? []).map(mapRow));
    setWatched((watchedData ?? []).map(mapRow));
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useReconnect(load);

  const activeBids = useMemo<ActiveBid[]>(() => {
    if (!userId) return [];
    const map = new Map<string, BidRow[]>();
    for (const b of allBids) {
      if (!b.auction || b.auction.status !== "active") continue;
      const list = map.get(b.auction_id) ?? [];
      list.push(b);
      map.set(b.auction_id, list);
    }
    const result: ActiveBid[] = [];
    for (const [auctionId, bids] of map) {
      const sorted = bids.sort((a, b) => b.amount - a.amount);
      const auction = sorted[0].auction!;
      result.push({
        auctionId,
        highestBid: sorted[0].amount,
        bidCount: sorted.length,
        isHighBidder: auction.highest_bidder_id === userId,
        auction,
      });
    }
    return result.sort(
      (a, b) => new Date(a.auction.ends_at).getTime() - new Date(b.auction.ends_at).getTime(),
    );
  }, [allBids, userId]);

  const lostAuctions = useMemo<LostAuction[]>(() => {
    if (!userId) return [];
    const wonIds = new Set(wins.map((w) => w.auction_id));
    const map = new Map<string, BidRow[]>();
    for (const b of allBids) {
      if (!b.auction) continue;
      if (b.auction.status !== "ended") continue;
      if (wonIds.has(b.auction_id)) continue;
      if (b.auction.winner_id === userId) continue;
      const list = map.get(b.auction_id) ?? [];
      list.push(b);
      map.set(b.auction_id, list);
    }
    const result: LostAuction[] = [];
    for (const [auctionId, bids] of map) {
      const sorted = bids.sort((a, b) => b.amount - a.amount);
      result.push({
        auctionId,
        myHighest: sorted[0].amount,
        auction: sorted[0].auction!,
      });
    }
    return result;
  }, [allBids, wins, userId]);

  const bidHistory = useMemo(() => {
    return allBids.filter((b) => b.auction);
  }, [allBids]);

  const watchedAuctions = useMemo(() => {
    return watched
      .filter((w) => w.auction)
      .sort((a, b) => {
        const aActive = a.auction?.status === "active";
        const bActive = b.auction?.status === "active";
        if (aActive !== bActive) return aActive ? -1 : 1;
        if (aActive && bActive) {
          return (
            new Date(a.auction?.ends_at ?? 0).getTime() -
            new Date(b.auction?.ends_at ?? 0).getTime()
          );
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [watched]);

  function handlePayNow(win: WinRow) {
    push({ type: "AUCTION_CHECKOUT", winId: win.id });
  }

  function auctionThumb(auction: AuctionInfo | null): string | null {
    if (!auction) return null;
    const imgs = normalizeImages(auction.images);
    return imgs[0] ?? null;
  }

  function sellerName(auction: AuctionInfo | null): string {
    if (!auction?.seller) return "Seller";
    return auction.seller.display_name ?? auction.seller.username ?? "Seller";
  }

  function renderWonTab() {
    if (wins.length === 0) {
      return (
        <View style={st.emptyState}>
          <Ionicons name="trophy-outline" size={44} color={C.textMuted} />
          <Text style={st.emptyTitle}>No won auctions</Text>
          <Text style={st.emptySub}>Auctions you win will appear here</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={wins}
        keyExtractor={(item) => item.id}
        contentContainerStyle={st.list}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews
        renderItem={({ item: win }) => {
          const img = auctionThumb(win.auction);
          const isPaid = win.payment_status === "paid";
          const isExpired = win.payment_status === "expired";
          const countdown = !isPaid && !isExpired ? formatCountdown(win.payment_deadline) : null;
          const deadlineExpired = countdown?.expired ?? false;

          return (
            <Pressable
              style={st.card}
              onPress={() => win.auction && push({ type: "AUCTION_DETAIL", auctionId: win.auction_id })}
            >
              <View style={st.cardRow}>
                <View style={st.thumb}>
                  {img ? (
                    <CachedImage source={{ uri: img }} style={st.thumbImg} />
                  ) : (
                    <Ionicons name="hammer-outline" size={18} color={C.textMuted} />
                  )}
                </View>
                <View style={st.cardInfo}>
                  <Text style={st.cardName} numberOfLines={1}>
                    {win.auction?.card_name ?? "Auction"}
                  </Text>
                  <Text style={st.cardMeta} numberOfLines={1}>
                    {win.auction?.edition ?? ""}{win.auction?.grade ? ` · ${win.auction.grade}` : ""}
                  </Text>
                  <Text style={st.cardSeller}>from {sellerName(win.auction)}</Text>
                </View>
                <View style={st.cardRight}>
                  <Text style={st.winPrice}>{formatPrice(win.winning_bid)}</Text>
                  {isPaid && (
                    <View style={st.paidBadge}>
                      <Ionicons name="checkmark-circle" size={12} color={C.success} />
                      <Text style={st.paidText}>Paid</Text>
                    </View>
                  )}
                  {isExpired && (
                    <View style={st.expiredBadge}>
                      <Ionicons name="close-circle" size={12} color={C.danger} />
                      <Text style={st.expiredText}>Expired</Text>
                    </View>
                  )}
                </View>
              </View>

              {!isPaid && !isExpired && countdown && (
                <View style={st.paymentBar}>
                  <View style={st.paymentTimerRow}>
                    <Ionicons
                      name="time-outline"
                      size={14}
                      color={countdown.urgent ? "#F59E0B" : C.textSecondary}
                    />
                    <Text
                      style={[
                        st.paymentTimerText,
                        countdown.urgent && st.paymentTimerUrgent,
                        deadlineExpired && st.paymentTimerExpired,
                      ]}
                    >
                      {deadlineExpired ? "Payment deadline passed" : `Pay within ${countdown.text}`}
                    </Text>
                  </View>
                  {!deadlineExpired && (
                    <Pressable
                      style={st.payNowBtn}
                      onPress={() => handlePayNow(win)}
                    >
                      <Text style={st.payNowText}>Pay Now</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </Pressable>
          );
        }}
      />
    );
  }

  function renderActiveTab() {
    if (activeBids.length === 0) {
      return (
        <View style={st.emptyState}>
          <Ionicons name="hammer-outline" size={44} color={C.textMuted} />
          <Text style={st.emptyTitle}>No active bids</Text>
          <Text style={st.emptySub}>Place bids on live auctions to see them here</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={activeBids}
        keyExtractor={(item) => item.auctionId}
        contentContainerStyle={st.list}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews
        renderItem={({ item: ab }) => {
          const img = auctionThumb(ab.auction);
          const timer = formatCountdown(ab.auction.ends_at);
          const currentPrice = ab.auction.current_bid ?? ab.auction.starting_price;

          return (
            <Pressable
              style={st.card}
              onPress={() => push({ type: "AUCTION_DETAIL", auctionId: ab.auctionId })}
            >
              <View style={st.cardRow}>
                <View style={st.thumb}>
                  {img ? (
                    <CachedImage source={{ uri: img }} style={st.thumbImg} />
                  ) : (
                    <Ionicons name="hammer-outline" size={18} color={C.textMuted} />
                  )}
                </View>
                <View style={st.cardInfo}>
                  <Text style={st.cardName} numberOfLines={1}>
                    {ab.auction.card_name}
                  </Text>
                  <Text style={st.cardMeta} numberOfLines={1}>
                    {ab.auction.edition ?? ""}{ab.auction.grade ? ` · ${ab.auction.grade}` : ""}
                  </Text>
                  <View style={st.bidStatusRow}>
                    <View
                      style={[
                        st.bidStatusChip,
                        ab.isHighBidder ? st.bidStatusWinning : st.bidStatusOutbid,
                      ]}
                    >
                      <Ionicons
                        name={ab.isHighBidder ? "arrow-up-circle" : "arrow-down-circle"}
                        size={12}
                        color={ab.isHighBidder ? C.success : "#F59E0B"}
                      />
                      <Text
                        style={[
                          st.bidStatusText,
                          { color: ab.isHighBidder ? C.success : "#F59E0B" },
                        ]}
                      >
                        {ab.isHighBidder ? "Winning" : "Outbid"}
                      </Text>
                    </View>
                    <Text style={st.bidCountLabel}>
                      {ab.bidCount} bid{ab.bidCount !== 1 ? "s" : ""}
                    </Text>
                  </View>
                </View>
                <View style={st.cardRight}>
                  <Text style={st.currentPrice}>{formatPrice(currentPrice)}</Text>
                  <Text style={st.myBidLabel}>My: {formatPrice(ab.highestBid)}</Text>
                  <View style={[st.timerChip, timer.urgent && st.timerChipUrgent]}>
                    <Ionicons name="time-outline" size={10} color={C.textHero} />
                    <Text style={st.timerChipText}>{timer.text}</Text>
                  </View>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    );
  }

  function renderLostTab() {
    if (lostAuctions.length === 0) {
      return (
        <View style={st.emptyState}>
          <Ionicons name="close-circle-outline" size={44} color={C.textMuted} />
          <Text style={st.emptyTitle}>No lost auctions</Text>
          <Text style={st.emptySub}>Auctions you didn't win appear here</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={lostAuctions}
        keyExtractor={(item) => item.auctionId}
        contentContainerStyle={st.list}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews
        renderItem={({ item: la }) => {
          const img = auctionThumb(la.auction);
          const finalPrice = la.auction.current_bid ?? la.auction.starting_price;

          return (
            <Pressable
              style={st.card}
              onPress={() => push({ type: "AUCTION_DETAIL", auctionId: la.auctionId })}
            >
              <View style={st.cardRow}>
                <View style={st.thumb}>
                  {img ? (
                    <CachedImage source={{ uri: img }} style={st.thumbImg} />
                  ) : (
                    <Ionicons name="hammer-outline" size={18} color={C.textMuted} />
                  )}
                </View>
                <View style={st.cardInfo}>
                  <Text style={st.cardName} numberOfLines={1}>
                    {la.auction.card_name}
                  </Text>
                  <Text style={st.cardMeta} numberOfLines={1}>
                    {la.auction.edition ?? ""}{la.auction.grade ? ` · ${la.auction.grade}` : ""}
                  </Text>
                  <View style={st.lostRow}>
                    <Text style={st.lostLabel}>My highest:</Text>
                    <Text style={st.lostMyBid}>{formatPrice(la.myHighest)}</Text>
                  </View>
                </View>
                <View style={st.cardRight}>
                  <Text style={st.lostFinalLabel}>Sold for</Text>
                  <Text style={st.lostFinalPrice}>{formatPrice(finalPrice)}</Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    );
  }

  function renderHistoryTab() {
    if (bidHistory.length === 0) {
      return (
        <View style={st.emptyState}>
          <Ionicons name="time-outline" size={44} color={C.textMuted} />
          <Text style={st.emptyTitle}>No bid history</Text>
          <Text style={st.emptySub}>Your bids across all auctions will be listed here</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={bidHistory}
        keyExtractor={(item) => item.id}
        contentContainerStyle={st.list}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews
        renderItem={({ item: bid }) => {
          const img = auctionThumb(bid.auction);
          return (
            <Pressable
              style={st.historyRow}
              onPress={() => bid.auction && push({ type: "AUCTION_DETAIL", auctionId: bid.auction_id })}
            >
              <View style={st.historyThumb}>
                {img ? (
                  <CachedImage source={{ uri: img }} style={st.historyThumbImg} />
                ) : (
                  <Ionicons name="hammer-outline" size={14} color={C.textMuted} />
                )}
              </View>
              <View style={st.historyInfo}>
                <Text style={st.historyName} numberOfLines={1}>
                  {bid.auction?.card_name ?? "Auction"}
                </Text>
                <Text style={st.historyTime}>{relativeTime(bid.created_at)}</Text>
              </View>
              <Text style={st.historyAmount}>{formatPrice(bid.amount)}</Text>
              <Feather name="chevron-right" size={14} color={C.textMuted} />
            </Pressable>
          );
        }}
        ListFooterComponent={<TruncationNotice count={allBids.length} limit={500} label="bids" />}
      />
    );
  }

  function renderWatchingTab() {
    if (watchedAuctions.length === 0) {
      return (
        <View style={st.emptyState}>
          <Ionicons name="eye-outline" size={44} color={C.textMuted} />
          <Text style={st.emptyTitle}>No watched auctions</Text>
          <Text style={st.emptySub}>Auctions you watch will appear here</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={watchedAuctions}
        keyExtractor={(item) => item.auction_id}
        contentContainerStyle={st.list}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews
        renderItem={({ item }) => {
          const auction = item.auction;
          if (!auction) return null;
          const img = auctionThumb(auction);
          const timer = auction.status === "active" ? formatCountdown(auction.ends_at) : null;
          const currentPrice = auction.current_bid ?? auction.starting_price;
          return (
            <Pressable
              style={st.card}
              onPress={() => push({ type: "AUCTION_DETAIL", auctionId: item.auction_id })}
            >
              <View style={st.cardRow}>
                <View style={st.thumb}>
                  {img ? (
                    <CachedImage source={{ uri: img }} style={st.thumbImg} />
                  ) : (
                    <Ionicons name="hammer-outline" size={18} color={C.textMuted} />
                  )}
                </View>
                <View style={st.cardInfo}>
                  <Text style={st.cardName} numberOfLines={1}>
                    {auction.card_name}
                  </Text>
                  <Text style={st.cardMeta} numberOfLines={1}>
                    {auction.edition ?? ""}
                    {auction.grade ? ` · ${auction.grade}` : ""}
                  </Text>
                  <Text style={st.cardSeller}>from {sellerName(auction)}</Text>
                </View>
                <View style={st.cardRight}>
                  <Text style={st.currentPrice}>{formatPrice(currentPrice)}</Text>
                  <View style={[st.watchStatusChip, auction.status === "active" ? st.watchStatusChipActive : st.watchStatusChipEnded]}>
                    <Text style={[st.watchStatusText, auction.status === "active" ? st.watchStatusTextActive : st.watchStatusTextEnded]}>
                      {auction.status === "active" ? "Live" : "Ended"}
                    </Text>
                  </View>
                  {timer && (
                    <View style={[st.timerChip, timer.urgent && st.timerChipUrgent]}>
                      <Ionicons name="time-outline" size={10} color={C.textHero} />
                      <Text style={st.timerChipText}>{timer.text}</Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          );
        }}
        ListFooterComponent={<TruncationNotice count={watched.length} limit={300} label="watched auctions" />}
      />
    );
  }

  const tabCounts = useMemo(
    () => ({
      won: wins.length,
      active: activeBids.length,
      lost: lostAuctions.length,
      history: bidHistory.length,
      watching: watchedAuctions.length,
    }),
    [wins.length, activeBids.length, lostAuctions.length, bidHistory.length, watchedAuctions.length],
  );

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />

      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>My Auctions</Text>
        <Pressable style={st.backBtn} onPress={load} hitSlop={8}>
          <Ionicons name="refresh" size={16} color={C.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.tabRow}
        style={{ flexGrow: 0 }}
      >
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            style={[st.tabChip, tab === t.id && st.tabChipActive]}
            onPress={() => setTab(t.id)}
          >
            <Ionicons
              name={t.icon as any}
              size={14}
              color={tab === t.id ? C.accent : C.textMuted}
            />
            <Text style={[st.tabChipText, tab === t.id && st.tabChipTextActive]}>
              {t.label}
            </Text>
            {tabCounts[t.id] > 0 && (
              <View style={[st.tabBadge, tab === t.id && st.tabBadgeActive]}>
                <Text style={[st.tabBadgeText, tab === t.id && st.tabBadgeTextActive]}>
                  {tabCounts[t.id]}
                </Text>
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <View style={st.loadingWrap}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      ) : (
        <>
          {tab === "won" && renderWonTab()}
          {tab === "active" && renderActiveTab()}
          {tab === "lost" && renderLostTab()}
          {tab === "history" && renderHistoryTab()}
          {tab === "watching" && renderWatchingTab()}
        </>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S.screenPadding,
    paddingVertical: S.md,
    gap: S.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },

  tabRow: {
    flexDirection: "row",
    paddingHorizontal: S.screenPadding,
    gap: 8,
    paddingVertical: S.md,
  },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  tabChipActive: {
    backgroundColor: C.accentGlow,
    borderColor: C.accent,
  },
  tabChipText: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  tabChipTextActive: {
    color: C.accent,
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
  },
  tabBadgeActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  tabBadgeText: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: "800",
  },
  tabBadgeTextActive: {
    color: C.textHero,
  },

  list: {
    paddingHorizontal: S.screenPadding,
    paddingBottom: 60,
  },

  // ── Card ──
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 12,
    overflow: "hidden",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImg: { width: 56, height: 56, borderRadius: 14 },
  cardInfo: { flex: 1, gap: 2 },
  cardName: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
  cardMeta: { color: C.textSecondary, fontSize: 11, fontWeight: "600" },
  cardSeller: { color: C.textMuted, fontSize: 10, fontWeight: "600", marginTop: 2 },
  cardRight: { alignItems: "flex-end", gap: 4 },

  // ── Won tab ──
  winPrice: { color: C.link, fontSize: 16, fontWeight: "900" },
  paidBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(34,197,94,0.08)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.25)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  paidText: { color: C.success, fontSize: 10, fontWeight: "800" },
  expiredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(239,68,68,0.08)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  expiredText: { color: C.danger, fontSize: 10, fontWeight: "800" },
  paymentBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: "rgba(245,158,11,0.04)",
  },
  paymentTimerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  paymentTimerText: { color: C.textSecondary, fontSize: 12, fontWeight: "700" },
  paymentTimerUrgent: { color: "#F59E0B" },
  paymentTimerExpired: { color: C.danger },
  payNowBtn: {
    backgroundColor: C.accent,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  payNowText: { color: C.textHero, fontSize: 12, fontWeight: "900" },

  // ── Active tab ──
  currentPrice: { color: C.link, fontSize: 15, fontWeight: "900" },
  myBidLabel: { color: C.textSecondary, fontSize: 10, fontWeight: "600" },
  bidStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  bidStatusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  bidStatusWinning: {
    backgroundColor: "rgba(34,197,94,0.08)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.25)",
  },
  bidStatusOutbid: {
    backgroundColor: "rgba(245,158,11,0.08)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.25)",
  },
  bidStatusText: { fontSize: 10, fontWeight: "800" },
  bidCountLabel: { color: C.textMuted, fontSize: 10, fontWeight: "600" },
  timerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(44,128,255,0.85)",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  timerChipUrgent: { backgroundColor: "rgba(234,61,94,0.85)" },
  timerChipText: { color: C.textHero, fontSize: 9, fontWeight: "900" },

  // ── Lost tab ──
  lostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  lostLabel: { color: C.textMuted, fontSize: 10, fontWeight: "600" },
  lostMyBid: { color: C.textSecondary, fontSize: 11, fontWeight: "800" },
  lostFinalLabel: { color: C.textMuted, fontSize: 10, fontWeight: "600" },
  lostFinalPrice: { color: C.link, fontSize: 15, fontWeight: "900" },

  // ── History tab ──
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  historyThumb: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  historyThumbImg: { width: 36, height: 36, borderRadius: 10 },
  historyInfo: { flex: 1, gap: 1 },
  historyName: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  historyTime: { color: C.textMuted, fontSize: 10, fontWeight: "500" },
  historyAmount: { color: C.link, fontSize: 13, fontWeight: "900", marginRight: 4 },

  // ── Watching tab ──
  watchStatusChip: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  watchStatusChipActive: {
    backgroundColor: "rgba(34,197,94,0.08)",
    borderColor: "rgba(34,197,94,0.25)",
  },
  watchStatusChipEnded: {
    backgroundColor: "rgba(107,114,128,0.08)",
    borderColor: "rgba(107,114,128,0.25)",
  },
  watchStatusText: {
    fontSize: 10,
    fontWeight: "800",
  },
  watchStatusTextActive: {
    color: C.success,
  },
  watchStatusTextEnded: {
    color: C.textMuted,
  },

  // ── Empty state ──
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingBottom: 80,
  },
  emptyTitle: {
    color: C.textPrimary,
    fontSize: 17,
    fontWeight: "800",
  },
  emptySub: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
