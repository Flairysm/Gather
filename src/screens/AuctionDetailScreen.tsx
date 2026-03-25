import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, S } from "../theme";
import { useAppNavigation } from "../navigation/NavigationContext";
import { supabase } from "../lib/supabase";

const SCREEN_W = Dimensions.get("window").width;
const SCREEN_H = Dimensions.get("window").height;
const SPRING_CONFIG = { tension: 65, friction: 11, useNativeDriver: true };

type AuctionRow = {
  id: string;
  seller_id: string;
  card_name: string;
  edition: string | null;
  grade: string | null;
  condition: string | null;
  description: string | null;
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
  highest_bidder_id: string | null;
  winner_id: string | null;
  min_bid_increment: number;
  snipe_threshold_seconds: number;
  snipe_extension_seconds: number;
  created_at: string;
  seller?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    rating: number | null;
    total_sales: number | null;
  };
};

type BidRow = {
  id: string;
  bidder_id: string;
  amount: number;
  created_at: string;
  bidder?: {
    username: string | null;
    display_name: string | null;
  };
};

type Props = { auctionId: string; onBack: () => void };

function normalizeImages(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.flatMap((v) => normalizeImages(v));
  if (typeof raw === "string") {
    const trimmed = raw.replace(/^\{|\}$/g, "");
    if (trimmed.startsWith("http")) return [trimmed];
    try { return normalizeImages(JSON.parse(trimmed)); } catch { return []; }
  }
  return [];
}

function formatPrice(n: number): string {
  return `RM${n.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatCountdown(endsAt: string) {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return { text: "Auction Ended", urgent: false, ended: true, seconds: 0 };

  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hrs = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  if (days > 0) return { text: `${days}d ${hrs}h ${pad(mins)}m`, urgent: false, ended: false, seconds: totalSec };
  if (hrs > 0) return { text: `${pad(hrs)}:${pad(mins)}:${pad(secs)}`, urgent: false, ended: false, seconds: totalSec };
  return { text: `${pad(mins)}:${pad(secs)}`, urgent: mins < 5, ended: false, seconds: totalSec };
}

function bidTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type BidEligibility = {
  phoneVerified: boolean;
  hasAddress: boolean;
  isBanned: boolean;
  banReason: string | null;
  loaded: boolean;
};

type WinRecord = {
  id: string;
  payment_status: string;
  payment_deadline: string;
  winning_bid: number;
  paid_at: string | null;
};

export default function AuctionDetailScreen({ auctionId, onBack }: Props) {
  const { push } = useAppNavigation();
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<AuctionRow | null>(null);
  const [bids, setBids] = useState<BidRow[]>([]);
  const [vendorStore, setVendorStore] = useState<{ id: string; store_name: string; logo_url: string | null } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bidding, setBidding] = useState(false);
  const [showBidSheet, setShowBidSheet] = useState(false);
  const [bidAmount, setBidAmount] = useState("");
  const [imageIndex, setImageIndex] = useState(0);
  const [snipeToast, setSnipeToast] = useState(false);
  const [, setTick] = useState(0);
  const [isWatching, setIsWatching] = useState(false);
  const [eligibility, setEligibility] = useState<BidEligibility>({
    phoneVerified: false, hasAddress: false, isBanned: false, banReason: null, loaded: false,
  });
  const [winRecord, setWinRecord] = useState<WinRecord | null>(null);
  const [paying, setPaying] = useState(false);

  const sheetAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const snipeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const loadAuction = useCallback(async () => {
    const { data } = await supabase
      .from("auction_items")
      .select(`
        id, seller_id, card_name, edition, grade, condition, description,
        starting_price, current_bid, bid_count, watchers, category,
        images, ends_at, original_ends_at, status, buy_now_price,
        reserve_price, highest_bidder_id, winner_id, min_bid_increment,
        snipe_threshold_seconds, snipe_extension_seconds, created_at,
        seller:profiles!seller_id(username, display_name, avatar_url, rating, total_sales, review_count)
      `)
      .eq("id", auctionId)
      .maybeSingle();

    if (data) {
      const row = { ...data, seller: Array.isArray(data.seller) ? data.seller[0] : data.seller } as AuctionRow;
      setItem(row);
      setVendorStore(null);

      const { data: store } = await supabase
        .from("vendor_stores")
        .select("id, store_name, logo_url")
        .eq("profile_id", row.seller_id)
        .eq("is_active", true)
        .maybeSingle();
      if (store?.id) setVendorStore(store as any);
    }
  }, [auctionId]);

  const loadBids = useCallback(async () => {
    const { data } = await supabase
      .from("auction_bids")
      .select(`
        id, bidder_id, amount, created_at,
        bidder:profiles!bidder_id(username, display_name)
      `)
      .eq("auction_id", auctionId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) {
      setBids(
        (data as any[]).map((r) => ({
          ...r,
          bidder: Array.isArray(r.bidder) ? r.bidder[0] : r.bidder,
        })),
      );
    }
  }, [auctionId]);

  const loadEligibility = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: profile }, { count: addrCount }] = await Promise.all([
      supabase
        .from("profiles")
        .select("phone_verified, transaction_banned, transaction_ban_reason")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("user_addresses")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
    ]);

    setEligibility({
      phoneVerified: profile?.phone_verified ?? false,
      hasAddress: (addrCount ?? 0) > 0,
      isBanned: profile?.transaction_banned ?? false,
      banReason: profile?.transaction_ban_reason ?? null,
      loaded: true,
    });
  }, []);

  const loadWinRecord = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("auction_wins")
      .select("id, payment_status, payment_deadline, winning_bid, paid_at")
      .eq("auction_id", auctionId)
      .eq("winner_id", user.id)
      .maybeSingle();

    if (data) setWinRecord(data as WinRecord);
  }, [auctionId]);

  const loadWatchStatus = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("auction_watchers")
      .select("id")
      .eq("auction_id", auctionId)
      .eq("user_id", user.id)
      .maybeSingle();
    setIsWatching(!!data);
  }, [auctionId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
    supabase.rpc("increment_auction_views", { p_auction_id: auctionId });
    Promise.all([loadAuction(), loadBids(), loadEligibility(), loadWinRecord(), loadWatchStatus()]).finally(() => setLoading(false));
  }, [loadAuction, loadBids, loadEligibility, loadWinRecord, loadWatchStatus]);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel(`auction-${auctionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "auction_items", filter: `id=eq.${auctionId}` },
        (payload) => {
          setItem((prev) => {
            if (!prev) return prev;
            const updated = { ...prev, ...payload.new } as AuctionRow;
            updated.seller = prev.seller;
            if (
              prev.ends_at !== updated.ends_at &&
              new Date(updated.ends_at).getTime() > new Date(prev.ends_at).getTime()
            ) {
              triggerSnipeToast();
            }
            return updated;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "auction_bids", filter: `auction_id=eq.${auctionId}` },
        () => {
          loadBids();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [auctionId, loadBids]);

  // Auto-end detection
  useEffect(() => {
    if (!item || item.status !== "active") return;
    const diff = new Date(item.ends_at).getTime() - Date.now();
    if (diff > 0) return;
    supabase.rpc("end_auction", { p_auction_id: auctionId }).then(() => {
      loadAuction();
    });
  }, [item?.ends_at, item?.status]);

  function triggerSnipeToast() {
    setSnipeToast(true);
    snipeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(snipeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(snipeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setSnipeToast(false));
  }

  function checkEligibility(): boolean {
    if (eligibility.isBanned) {
      Alert.alert(
        "Transaction Banned",
        eligibility.banReason ?? "You are banned from transactions.",
      );
      return false;
    }
    if (!eligibility.phoneVerified) {
      Alert.alert(
        "Phone Verification Required",
        "You must verify your phone number before placing bids.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Verify Now", onPress: () => push({ type: "PHONE_VERIFY" }) },
        ],
      );
      return false;
    }
    if (!eligibility.hasAddress) {
      Alert.alert(
        "Shipping Address Required",
        "You must add a shipping address before placing bids.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Add Address", onPress: () => push({ type: "ADDRESS_BOOK" }) },
        ],
      );
      return false;
    }
    return true;
  }

  function openBidSheet() {
    if (!item) return;
    if (!checkEligibility()) return;

    const minBid = item.current_bid
      ? item.current_bid + item.min_bid_increment
      : item.starting_price;
    setBidAmount(String(minBid));
    setShowBidSheet(true);
    sheetAnim.setValue(0);
    backdropAnim.setValue(0);
    Animated.parallel([
      Animated.spring(sheetAnim, { ...SPRING_CONFIG, toValue: 1 }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }

  function closeBidSheet(cb?: () => void) {
    Animated.parallel([
      Animated.timing(sheetAnim, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => {
      setShowBidSheet(false);
      cb?.();
    });
  }

  async function handlePlaceBid() {
    if (!item || bidding) return;
    const amount = parseFloat(bidAmount.replace(/(RM|\$|,)/gi, ""));
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid Bid", "Please enter a valid amount.");
      return;
    }

    setBidding(true);
    const { data, error } = await supabase.rpc("place_bid", {
      p_auction_id: auctionId,
      p_amount: amount,
    });

    setBidding(false);
    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("PHONE_NOT_VERIFIED")) {
        Alert.alert("Phone Verification Required", "Verify your phone number to bid.", [
          { text: "Cancel", style: "cancel" },
          { text: "Verify Now", onPress: () => push({ type: "PHONE_VERIFY" }) },
        ]);
      } else if (msg.includes("NO_ADDRESS")) {
        Alert.alert("Shipping Address Required", "Add a shipping address to bid.", [
          { text: "Cancel", style: "cancel" },
          { text: "Add Address", onPress: () => push({ type: "ADDRESS_BOOK" }) },
        ]);
      } else if (msg.includes("BANNED")) {
        Alert.alert("Transaction Banned", msg.replace("BANNED: ", ""));
      } else {
        Alert.alert("Bid Failed", msg);
      }
      return;
    }

    closeBidSheet(() => {
      loadAuction();
      loadBids();
    });
  }

  async function handleBuyNow() {
    if (!item || !item.buy_now_price) return;
    if (!checkEligibility()) return;
    Alert.alert(
      "Buy It Now",
      `Purchase this item immediately for ${formatPrice(item.buy_now_price)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          style: "default",
          onPress: async () => {
            setBidding(true);
            const { error } = await supabase.rpc("place_bid", {
              p_auction_id: auctionId,
              p_amount: item.buy_now_price,
            });
            if (error) {
              Alert.alert("Error", error.message);
              setBidding(false);
              return;
            }
            await supabase
              .from("auction_items")
              .update({ status: "ended", winner_id: currentUserId, updated_at: new Date().toISOString() })
              .eq("id", auctionId);
            setBidding(false);
            loadAuction();
            loadBids();
          },
        },
      ],
    );
  }

  function quickBid(increment: number) {
    const current = parseFloat(bidAmount.replace(/(RM|\$|,)/gi, "")) || 0;
    setBidAmount(String(current + increment));
  }

  async function handlePayNow() {
    if (!winRecord || paying) return;
    setPaying(true);
    const { error } = await supabase.rpc("pay_auction_win", { p_win_id: winRecord.id });
    setPaying(false);
    if (error) {
      Alert.alert("Payment Failed", error.message);
      return;
    }
    Alert.alert("Payment Confirmed", "Your payment has been recorded. The seller will ship your item.");
    loadWinRecord();
  }

  async function handleToggleWatch() {
    const { data, error } = await supabase.rpc("toggle_auction_watch", { p_auction_id: auctionId });
    if (error) return;
    setIsWatching((data as any).watching);
    setItem((prev) => prev ? { ...prev, watchers: (data as any).watchers } : prev);
  }

  async function handleShare() {
    if (!item) return;
    const { Share } = await import("react-native");
    Share.share({
      message: `Check out "${item.card_name}" on Gather Auctions!${item.current_bid ? ` Current bid: ${formatPrice(item.current_bid)}` : ""}`,
    });
  }

  const images = useMemo(() => normalizeImages(item?.images), [item?.images]);
  const countdown = item ? formatCountdown(item.ends_at) : null;
  const isOwner = currentUserId === item?.seller_id;
  const isWinner = currentUserId === item?.winner_id;
  const isHighBidder = currentUserId === item?.highest_bidder_id;
  const minNextBid = item
    ? item.current_bid
      ? item.current_bid + item.min_bid_increment
      : item.starting_price
    : 0;
  const reserveMet =
    item?.reserve_price != null && item.current_bid != null && item.current_bid >= item.reserve_price;
  const hasReserve = item?.reserve_price != null;
  const isEnded = item?.status === "ended" || (countdown?.ended ?? false);
  const isExtended =
    item?.original_ends_at &&
    new Date(item.ends_at).getTime() > new Date(item.original_ends_at).getTime();
  const showBuyNow =
    item?.buy_now_price != null &&
    !isEnded &&
    !isOwner &&
    (item.current_bid == null || item.current_bid < item.buy_now_price);

  const sellerName =
    vendorStore?.store_name ??
    item?.seller?.display_name ??
    (item?.seller?.username ? `@${item.seller.username}` : "Seller");

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar style="light" />
        <View style={st.header}>
          <Pressable style={st.backBtn} onPress={onBack}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>
          <Text style={st.headerTitle}>Auction</Text>
          <View style={{ width: 68 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar style="light" />
        <View style={st.header}>
          <Pressable style={st.backBtn} onPress={onBack}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>
          <Text style={st.headerTitle}>Auction</Text>
          <View style={{ width: 68 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: C.textMuted, fontSize: 14 }}>Auction not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />

      {/* Snipe toast */}
      {snipeToast && (
        <Animated.View
          style={[
            st.snipeToast,
            {
              top: Math.max(insets.top + 8, 16),
              opacity: snipeAnim,
              transform: [{ translateY: snipeAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
            },
          ]}
        >
          <Ionicons name="shield-checkmark" size={18} color={C.textHero} />
          <Text style={st.snipeToastText}>Anti-Snipe: Time Extended! +{item.snipe_extension_seconds}s</Text>
        </Animated.View>
      )}

      {/* Bid bottom sheet */}
      {showBidSheet && (
        <View style={st.sheetOverlay} pointerEvents="box-none">
          <Animated.View style={[st.sheetBackdrop, { opacity: backdropAnim }]}>
            <Pressable style={{ flex: 1 }} onPress={() => closeBidSheet()} />
          </Animated.View>
          <Animated.View
            style={[
              st.sheet,
              {
                paddingBottom: Math.max(insets.bottom, 20),
                transform: [{ translateY: sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_H * 0.5, 0] }) }],
              },
            ]}
          >
            <View style={st.sheetHandle} />
            <Text style={st.sheetTitle}>Place Your Bid</Text>

            <View style={st.sheetCurrentRow}>
              <Text style={st.sheetLabel}>Current Bid</Text>
              <Text style={st.sheetCurrentBid}>
                {item.current_bid ? formatPrice(item.current_bid) : "No bids yet"}
              </Text>
            </View>

            <View style={st.sheetMinRow}>
              <Ionicons name="information-circle-outline" size={14} color={C.textSecondary} />
              <Text style={st.sheetMinText}>Min bid: {formatPrice(minNextBid)}</Text>
            </View>

            <View style={st.sheetDivider} />

            <Text style={st.sheetFieldLabel}>Your Bid</Text>
            <View style={st.sheetInputRow}>
              <Text style={st.sheetDollar}>RM</Text>
              <TextInput
                style={st.sheetInput}
                value={bidAmount}
                onChangeText={setBidAmount}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={C.textMuted}
              />
            </View>

            <View style={st.quickBidRow}>
              {[1, 5, 10, 50].map((inc) => (
                <Pressable key={inc} style={st.quickBidBtn} onPress={() => quickBid(inc)}>
                  <Text style={st.quickBidText}>+RM{inc}</Text>
                </Pressable>
              ))}
            </View>

            {countdown && !countdown.ended && countdown.seconds <= (item.snipe_threshold_seconds ?? 30) && (
              <View style={st.snipeWarning}>
                <Ionicons name="shield" size={14} color="#F59E0B" />
                <Text style={st.snipeWarningText}>
                  Anti-snipe active — bidding now extends the timer by {item.snipe_extension_seconds}s
                </Text>
              </View>
            )}

            <View style={st.sheetActions}>
              <Pressable style={st.sheetCancelBtn} onPress={() => closeBidSheet()}>
                <Text style={st.sheetCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={st.sheetConfirmBtn} onPress={handlePlaceBid} disabled={bidding}>
                {bidding ? (
                  <ActivityIndicator size="small" color={C.textHero} />
                ) : (
                  <>
                    <Ionicons name="hammer" size={16} color={C.textHero} />
                    <Text style={st.sheetConfirmText}>Place Bid</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Animated.View>
        </View>
      )}

      {/* Header */}
      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>Auction</Text>
        <View style={st.headerActions}>
          <Pressable style={st.headerIconBtn} onPress={handleShare}>
            <Feather name="share" size={16} color={C.textSearch} />
          </Pressable>
          <Pressable style={st.headerIconBtn} onPress={handleToggleWatch}>
            <Ionicons name={isWatching ? "bookmark" : "bookmark-outline"} size={16} color={isWatching ? C.accent : C.textSearch} />
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll}>
        {/* Image carousel */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setImageIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))}
          style={st.imageCarousel}
        >
          {images.length > 0 ? (
            images.map((uri, i) => (
              <Image key={i} source={{ uri }} style={st.heroImage} />
            ))
          ) : (
            <View style={st.heroPlaceholder}>
              <Ionicons name="image-outline" size={40} color={C.textMuted} />
              <Text style={{ color: C.textMuted, fontSize: 14, marginTop: 8 }}>No Image</Text>
            </View>
          )}
        </ScrollView>
        {images.length > 1 && (
          <View style={st.dotRow}>
            {images.map((_, i) => (
              <View key={i} style={[st.dot, i === imageIndex && st.dotActive]} />
            ))}
          </View>
        )}

        {/* Timer bar */}
        <View style={[st.timerBar, isEnded && st.timerBarEnded, (countdown?.urgent && !isEnded) && st.timerBarUrgent]}>
          <View style={st.timerBarLeft}>
            <Ionicons
              name={isEnded ? "checkmark-circle" : "time-outline"}
              size={18}
              color={C.textHero}
            />
            <Text style={st.timerBarText}>{countdown?.text ?? "—"}</Text>
          </View>
          {isExtended && !isEnded && (
            <View style={st.timerExtendedBadge}>
              <Ionicons name="shield" size={12} color="#F59E0B" />
              <Text style={st.timerExtendedText}>Extended</Text>
            </View>
          )}
        </View>

        {/* Card info */}
        <View style={st.infoSection}>
          <View style={st.categoryChip}>
            <Text style={st.categoryText}>{item.category}</Text>
          </View>
          <Text style={st.cardName}>{item.card_name}</Text>
          <Text style={st.editionText}>{item.edition ?? "—"}</Text>
        </View>

        {/* Bid info */}
        <View style={st.bidSection}>
          <View>
            <Text style={st.bidLabel}>{isEnded ? "Final Bid" : "Current Bid"}</Text>
            <Text style={st.bidPrice}>
              {item.current_bid ? formatPrice(item.current_bid) : formatPrice(item.starting_price)}
            </Text>
            {!item.current_bid && <Text style={st.startingLabel}>Starting price</Text>}
          </View>
          <View style={st.bidMeta}>
            <View style={st.bidMetaItem}>
              <Ionicons name="hammer-outline" size={14} color={C.textSecondary} />
              <Text style={st.bidMetaText}>{item.bid_count ?? 0} bids</Text>
            </View>
            <View style={st.bidMetaItem}>
              <Ionicons name="eye-outline" size={14} color={C.textSecondary} />
              <Text style={st.bidMetaText}>{item.watchers ?? 0} watchers</Text>
            </View>
          </View>
        </View>

        {/* Reserve and high bidder indicators */}
        <View style={st.indicatorRow}>
          {hasReserve && (
            <View style={[st.indicator, reserveMet ? st.indicatorGreen : st.indicatorYellow]}>
              <Ionicons
                name={reserveMet ? "checkmark-circle" : "alert-circle"}
                size={14}
                color={reserveMet ? C.success : "#F59E0B"}
              />
              <Text style={[st.indicatorText, reserveMet ? st.indicatorTextGreen : st.indicatorTextYellow]}>
                {reserveMet ? "Reserve Met" : "Reserve Not Met"}
              </Text>
            </View>
          )}
          {isHighBidder && !isEnded && (
            <View style={[st.indicator, st.indicatorGreen]}>
              <Ionicons name="trophy" size={14} color={C.success} />
              <Text style={[st.indicatorText, st.indicatorTextGreen]}>You're Winning</Text>
            </View>
          )}
          {isEnded && isWinner && (
            <View style={[st.indicator, st.indicatorGreen]}>
              <Ionicons name="trophy" size={14} color={C.success} />
              <Text style={[st.indicatorText, st.indicatorTextGreen]}>You Won!</Text>
            </View>
          )}
          {showBuyNow && (
            <View style={[st.indicator, st.indicatorBlue]}>
              <Ionicons name="flash" size={14} color={C.textAccent} />
              <Text style={[st.indicatorText, st.indicatorTextBlue]}>
                Buy Now: {formatPrice(item.buy_now_price!)}
              </Text>
            </View>
          )}
        </View>

        {/* Winner payment banner */}
        {isWinner && isEnded && winRecord && winRecord.payment_status === "pending" && (
          <View style={st.paymentBanner}>
            <View style={st.paymentBannerHeader}>
              <Ionicons name="trophy" size={20} color="#F59E0B" />
              <Text style={st.paymentBannerTitle}>You Won This Auction!</Text>
            </View>
            <Text style={st.paymentBannerAmount}>Amount Due: {formatPrice(winRecord.winning_bid)}</Text>
            <Text style={st.paymentBannerDeadline}>
              Pay by {new Date(winRecord.payment_deadline).toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
              })} or your account will be banned from transactions.
            </Text>
            <Pressable style={st.payNowBtn} onPress={handlePayNow} disabled={paying}>
              {paying ? (
                <ActivityIndicator size="small" color={C.textHero} />
              ) : (
                <>
                  <Ionicons name="card" size={16} color={C.textHero} />
                  <Text style={st.payNowText}>Pay Now</Text>
                </>
              )}
            </Pressable>
          </View>
        )}
        {isWinner && isEnded && winRecord && winRecord.payment_status === "paid" && (
          <View style={st.paidBanner}>
            <Ionicons name="checkmark-circle" size={18} color={C.success} />
            <Text style={st.paidBannerText}>
              Payment confirmed on {new Date(winRecord.paid_at!).toLocaleDateString("en-US", {
                month: "short", day: "numeric",
              })}. Seller will ship your item.
            </Text>
          </View>
        )}
        {isWinner && isEnded && winRecord && winRecord.payment_status === "expired" && (
          <View style={st.expiredBanner}>
            <Ionicons name="warning" size={18} color={C.danger} />
            <Text style={st.expiredBannerText}>
              Payment deadline expired. Your account has been restricted from transactions.
            </Text>
          </View>
        )}

        {/* Eligibility requirement hints for non-owners on active auctions */}
        {!isOwner && !isEnded && eligibility.loaded && (!eligibility.phoneVerified || !eligibility.hasAddress) && !eligibility.isBanned && (
          <View style={st.eligibilityBanner}>
            <Text style={st.eligibilityTitle}>Before you can bid:</Text>
            {!eligibility.phoneVerified && (
              <Pressable style={st.eligibilityRow} onPress={() => push({ type: "PHONE_VERIFY" })}>
                <Ionicons name="call-outline" size={14} color={C.textAccent} />
                <Text style={st.eligibilityText}>Verify your phone number</Text>
                <Feather name="chevron-right" size={14} color={C.textMuted} />
              </Pressable>
            )}
            {!eligibility.hasAddress && (
              <Pressable style={st.eligibilityRow} onPress={() => push({ type: "ADDRESS_BOOK" })}>
                <Ionicons name="location-outline" size={14} color={C.textAccent} />
                <Text style={st.eligibilityText}>Add a shipping address</Text>
                <Feather name="chevron-right" size={14} color={C.textMuted} />
              </Pressable>
            )}
          </View>
        )}

        {eligibility.isBanned && !isOwner && !isEnded && (
          <View style={st.expiredBanner}>
            <Ionicons name="ban" size={18} color={C.danger} />
            <Text style={st.expiredBannerText}>
              {eligibility.banReason ?? "You are banned from transactions."}
            </Text>
          </View>
        )}

        <View style={st.divider} />

        {/* Seller */}
        <View style={st.sellerSection}>
          <View style={st.sellerAvatar}>
            {vendorStore?.logo_url ? (
              <Image
                source={{ uri: vendorStore.logo_url }}
                style={{ width: "100%", height: "100%", borderRadius: 22 }}
              />
            ) : item.seller?.avatar_url ? (
              <Image
                source={{ uri: item.seller.avatar_url }}
                style={{ width: "100%", height: "100%", borderRadius: 22 }}
              />
            ) : (
              <Text style={st.sellerAvatarText}>
                {sellerName.charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <View style={st.sellerInfo}>
            <Text style={st.sellerName}>{sellerName}</Text>
            <View style={st.sellerMeta}>
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text style={st.ratingText}>
                {Number(item.seller?.rating ?? 5).toFixed(1)}
                {(item.seller as any)?.review_count > 0 ? ` (${(item.seller as any).review_count})` : ""}
              </Text>
              <Text style={st.salesText}>{item.seller?.total_sales ?? 0} sales</Text>
            </View>
          </View>
          {vendorStore?.id && (
            <Pressable
              style={st.viewVendorBtn}
              onPress={() => push({ type: "VENDOR_STORE_PAGE", storeId: vendorStore.id })}
            >
              <Text style={st.viewVendorText}>View Vendor</Text>
            </Pressable>
          )}
        </View>

        <View style={st.divider} />

        {/* Description & details */}
        {item.description && (
          <>
            <View style={st.descSection}>
              <Text style={st.descTitle}>About This Item</Text>
              <Text style={st.descText}>{item.description}</Text>
            </View>
            <View style={st.divider} />
          </>
        )}

        <View style={st.detailChips}>
          {item.grade && (
            <View style={st.chip}>
              <Text style={st.chipLabel}>Grade</Text>
              <Text style={st.chipValue}>{item.grade}</Text>
            </View>
          )}
          {item.condition && (
            <View style={st.chip}>
              <Text style={st.chipLabel}>Condition</Text>
              <Text style={st.chipValue}>{item.condition}</Text>
            </View>
          )}
          <View style={st.chip}>
            <Text style={st.chipLabel}>Start</Text>
            <Text style={st.chipValue}>{formatPrice(item.starting_price)}</Text>
          </View>
          <View style={st.chip}>
            <Text style={st.chipLabel}>Min Raise</Text>
            <Text style={st.chipValue}>{formatPrice(item.min_bid_increment)}</Text>
          </View>
        </View>

        <View style={st.divider} />

        {/* Bid history */}
        <View style={st.bidHistorySection}>
          <Text style={st.bidHistoryTitle}>Bid History ({bids.length})</Text>
          {bids.length === 0 ? (
            <Text style={st.bidHistoryEmpty}>No bids yet. Be the first!</Text>
          ) : (
            bids.slice(0, 20).map((bid, i) => (
              <View key={bid.id} style={st.bidHistoryRow}>
                <View style={st.bidHistoryLeft}>
                  <View style={[st.bidHistoryAvatar, i === 0 && st.bidHistoryAvatarTop]}>
                    <Text style={st.bidHistoryAvatarText}>
                      {(bid.bidder?.display_name ?? bid.bidder?.username ?? "?").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={st.bidHistoryName}>
                      {bid.bidder?.display_name ?? (bid.bidder?.username ? `@${bid.bidder.username}` : "Bidder")}
                      {i === 0 ? "  👑" : ""}
                    </Text>
                    <Text style={st.bidHistoryTime}>{bidTimeAgo(bid.created_at)}</Text>
                  </View>
                </View>
                <Text style={[st.bidHistoryAmount, i === 0 && st.bidHistoryAmountTop]}>
                  {formatPrice(bid.amount)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Bottom bar */}
      <View style={[st.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        {isOwner ? (
          <View style={st.ownBar}>
            <Ionicons name="hammer-outline" size={18} color={C.textAccent} />
            <Text style={st.ownBarText}>Your auction</Text>
          </View>
        ) : isEnded ? (
          <View style={st.ownBar}>
            <Ionicons name="checkmark-circle" size={18} color={C.textSecondary} />
            <Text style={st.ownBarText}>Auction ended</Text>
          </View>
        ) : (
          <>
            <Pressable style={st.msgBtn} onPress={() => push({ type: "CHAT", sellerId: item.seller_id, listingId: item.id, topic: item.card_name })}>
              <Feather name="message-circle" size={19} color={C.textPrimary} />
            </Pressable>
            <Pressable style={st.bidBtn} onPress={openBidSheet}>
              <Ionicons name="hammer" size={18} color={C.textHero} />
              <Text style={st.bidBtnText}>Place Bid</Text>
            </Pressable>
            {showBuyNow && (
              <Pressable style={st.binBtn} onPress={handleBuyNow}>
                <Ionicons name="flash" size={18} color={C.textHero} />
                <Text style={st.binBtnText}>Buy Now</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  snipeToast: {
    position: "absolute",
    left: S.screenPadding,
    right: S.screenPadding,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F59E0B",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  snipeToastText: { color: C.textHero, fontSize: 13, fontWeight: "800" },

  sheetOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 19, justifyContent: "flex-end" },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: C.border,
    paddingHorizontal: S.screenPadding,
    paddingTop: 12,
    gap: 14,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginBottom: 4 },
  sheetTitle: { color: C.textPrimary, fontSize: 18, fontWeight: "900", textAlign: "center" },
  sheetCurrentRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetLabel: { color: C.textSecondary, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  sheetCurrentBid: { color: C.link, fontSize: 20, fontWeight: "900" },
  sheetMinRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sheetMinText: { color: C.textSecondary, fontSize: 12, fontWeight: "600" },
  sheetDivider: { height: 1, backgroundColor: C.border },
  sheetFieldLabel: { color: C.textSecondary, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  sheetInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.elevated,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    height: 54,
  },
  sheetDollar: { color: C.textAccent, fontSize: 22, fontWeight: "900", marginRight: 8 },
  sheetInput: { flex: 1, color: C.textPrimary, fontSize: 22, fontWeight: "800" },
  quickBidRow: { flexDirection: "row", gap: 8 },
  quickBidBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: S.radiusSmall,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
  },
  quickBidText: { color: C.textAccent, fontSize: 13, fontWeight: "800" },
  snipeWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(245,158,11,0.12)",
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.25)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  snipeWarningText: { flex: 1, color: "#F59E0B", fontSize: 11, fontWeight: "700" },
  sheetActions: { flexDirection: "row", gap: 10 },
  sheetCancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.borderIcon,
    backgroundColor: C.elevated,
    paddingVertical: 16,
  },
  sheetCancelText: { color: C.textPrimary, fontSize: 14, fontWeight: "700" },
  sheetConfirmBtn: {
    flex: 1.6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: C.accent,
    paddingVertical: 16,
  },
  sheetConfirmText: { color: C.textHero, fontSize: 14, fontWeight: "800" },

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
  headerTitle: { flex: 1, color: C.textPrimary, fontSize: 16, fontWeight: "800" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: S.sm + 4 },
  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.borderIcon,
    alignItems: "center",
    justifyContent: "center",
  },

  scroll: { paddingBottom: 100 },

  imageCarousel: { width: SCREEN_W, height: SCREEN_W * 1.0 },
  heroImage: { width: SCREEN_W, height: SCREEN_W * 1.0, resizeMode: "cover" },
  heroPlaceholder: { width: SCREEN_W, height: SCREEN_W * 1.0, backgroundColor: C.cardAlt, alignItems: "center", justifyContent: "center" },
  dotRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.muted },
  dotActive: { backgroundColor: C.accent, width: 18, borderRadius: 3 },

  timerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.accent,
    marginHorizontal: S.screenPadding,
    marginTop: S.md,
    borderRadius: S.radiusSmall,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  timerBarEnded: { backgroundColor: C.muted },
  timerBarUrgent: { backgroundColor: C.live },
  timerBarLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  timerBarText: { color: C.textHero, fontSize: 18, fontWeight: "900", letterSpacing: 0.5 },
  timerExtendedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: S.radiusBadge,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  timerExtendedText: { color: C.textHero, fontSize: 10, fontWeight: "800" },

  infoSection: { paddingHorizontal: S.screenPadding, paddingTop: S.xl, gap: 6 },
  categoryChip: {
    alignSelf: "flex-start",
    backgroundColor: C.muted,
    borderRadius: S.radiusBadge,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 4,
  },
  categoryText: { color: C.textIcon, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  cardName: { color: C.textPrimary, fontSize: 22, fontWeight: "900" },
  editionText: { color: C.textSecondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },

  bidSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: S.screenPadding,
    paddingTop: S.xl,
    paddingBottom: S.lg,
  },
  bidLabel: { color: C.textSecondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  bidPrice: { color: C.link, fontSize: 28, fontWeight: "900" },
  startingLabel: { color: C.textMuted, fontSize: 10, fontWeight: "600", marginTop: 2 },
  bidMeta: { alignItems: "flex-end", gap: 4 },
  bidMetaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  bidMetaText: { color: C.textSecondary, fontSize: 12, fontWeight: "600" },

  indicatorRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: S.screenPadding, paddingBottom: S.lg },
  indicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: S.radiusBadge,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  indicatorGreen: { backgroundColor: C.successBg, borderColor: "rgba(34,197,94,0.3)" },
  indicatorYellow: { backgroundColor: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.25)" },
  indicatorBlue: { backgroundColor: C.accentGlow, borderColor: C.borderStream },
  indicatorText: { fontSize: 11, fontWeight: "800" },
  indicatorTextGreen: { color: C.success },
  indicatorTextYellow: { color: "#F59E0B" },
  indicatorTextBlue: { color: C.textAccent },

  divider: { height: 1, backgroundColor: C.border, marginHorizontal: S.screenPadding },

  sellerSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S.screenPadding,
    paddingVertical: S.xl,
    gap: S.md,
  },
  sellerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.muted,
    borderWidth: 1.5,
    borderColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  sellerAvatarText: { color: C.textHero, fontSize: 16, fontWeight: "800" },
  sellerInfo: { flex: 1, gap: 2 },
  sellerName: { color: C.textPrimary, fontSize: 15, fontWeight: "700" },
  sellerMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  ratingText: { color: "#F59E0B", fontSize: 12, fontWeight: "800" },
  salesText: { color: C.textSecondary, fontSize: 12, fontWeight: "600" },
  viewVendorBtn: {
    backgroundColor: C.elevated,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.borderIcon,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  viewVendorText: { color: C.textAccent, fontSize: 11, fontWeight: "800" },

  descSection: { paddingHorizontal: S.screenPadding, paddingVertical: S.xl, gap: S.md },
  descTitle: { color: C.textPrimary, fontSize: 15, fontWeight: "800" },
  descText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, fontWeight: "500" },

  detailChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: S.screenPadding,
    paddingVertical: S.xl,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.elevated,
    borderRadius: S.radiusBadge,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipLabel: { color: C.textMuted, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  chipValue: { color: C.textPrimary, fontSize: 11, fontWeight: "700" },

  bidHistorySection: { paddingHorizontal: S.screenPadding, paddingVertical: S.xl, gap: S.md },
  bidHistoryTitle: { color: C.textPrimary, fontSize: 15, fontWeight: "800" },
  bidHistoryEmpty: { color: C.textMuted, fontSize: 13, fontWeight: "500" },
  bidHistoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  bidHistoryLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  bidHistoryAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  bidHistoryAvatarTop: { backgroundColor: C.accentGlow, borderWidth: 1, borderColor: C.accent },
  bidHistoryAvatarText: { color: C.textPrimary, fontSize: 12, fontWeight: "800" },
  bidHistoryName: { color: C.textPrimary, fontSize: 13, fontWeight: "600" },
  bidHistoryTime: { color: C.textMuted, fontSize: 10, fontWeight: "600" },
  bidHistoryAmount: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
  bidHistoryAmountTop: { color: C.link },

  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    paddingHorizontal: S.screenPadding,
    paddingTop: S.lg,
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  ownBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.elevated,
    borderRadius: S.radiusSmall,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  ownBarText: { color: C.textSecondary, fontSize: 14, fontWeight: "700" },
  msgBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.borderIcon,
  },
  bidBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: C.accent,
    borderRadius: S.radiusSmall,
    paddingVertical: 14,
  },
  bidBtnText: { color: C.textHero, fontSize: 14, fontWeight: "800" },
  binBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: C.success,
    borderRadius: S.radiusSmall,
    paddingVertical: 14,
  },
  binBtnText: { color: C.textHero, fontSize: 14, fontWeight: "800" },

  paymentBanner: {
    marginHorizontal: S.screenPadding,
    marginBottom: S.lg,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.25)",
    padding: S.lg,
    gap: 10,
  },
  paymentBannerHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  paymentBannerTitle: { color: "#F59E0B", fontSize: 16, fontWeight: "900" },
  paymentBannerAmount: { color: C.textPrimary, fontSize: 20, fontWeight: "900" },
  paymentBannerDeadline: { color: C.textSecondary, fontSize: 12, fontWeight: "600", lineHeight: 18 },
  payNowBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: C.success, borderRadius: S.radiusSmall,
    paddingVertical: 14, marginTop: 4,
  },
  payNowText: { color: C.textHero, fontSize: 14, fontWeight: "800" },

  paidBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: S.screenPadding, marginBottom: S.lg,
    backgroundColor: C.successBg, borderRadius: S.radiusSmall,
    borderWidth: 1, borderColor: "rgba(34,197,94,0.25)",
    padding: S.lg,
  },
  paidBannerText: { flex: 1, color: C.success, fontSize: 12, fontWeight: "700", lineHeight: 18 },

  expiredBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: S.screenPadding, marginBottom: S.lg,
    backgroundColor: C.dangerBg, borderRadius: S.radiusSmall,
    borderWidth: 1, borderColor: "rgba(239,68,68,0.25)",
    padding: S.lg,
  },
  expiredBannerText: { flex: 1, color: C.danger, fontSize: 12, fontWeight: "700", lineHeight: 18 },

  eligibilityBanner: {
    marginHorizontal: S.screenPadding, marginBottom: S.lg,
    backgroundColor: C.accentGlow, borderRadius: S.radiusCard,
    borderWidth: 1, borderColor: C.borderStream,
    padding: S.lg, gap: 8,
  },
  eligibilityTitle: { color: C.textPrimary, fontSize: 13, fontWeight: "800" },
  eligibilityRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.elevated, borderRadius: S.radiusSmall,
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  eligibilityText: { flex: 1, color: C.textAccent, fontSize: 13, fontWeight: "700" },
});
