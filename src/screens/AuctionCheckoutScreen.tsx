import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, S } from "../theme";
import { supabase } from "../lib/supabase";
import { requireNetwork } from "../lib/network";

type Props = { winId: string; onBack: () => void };

type WinData = {
  id: string;
  auction_id: string;
  winning_bid: number;
  payment_deadline: string;
  payment_status: string;
  seller_id: string;
  card_name: string;
  edition: string | null;
  grade: string | null;
  images: string[];
  seller_name: string;
  seller_avatar: string | null;
};

function normalizeImages(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === "string" && !!v);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed))
        return parsed.filter((v): v is string => typeof v === "string" && !!v);
    } catch {
      /* no-op */
    }
  }
  return [];
}

function formatPrice(n: number): string {
  return `RM${n.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function AuctionCheckoutScreen({ winId, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [win, setWin] = useState<WinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const loadWin = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("auction_wins")
        .select(`
          id, auction_id, winning_bid, payment_deadline, payment_status, seller_id,
          auction:auction_items!auction_id(card_name, edition, grade, condition, images),
          seller:profiles!seller_id(username, display_name, avatar_url)
        `)
        .eq("id", winId)
        .maybeSingle();

      if (!data) return;

      const auction = Array.isArray((data as any).auction)
        ? (data as any).auction[0]
        : (data as any).auction;
      const seller = Array.isArray((data as any).seller)
        ? (data as any).seller[0]
        : (data as any).seller;

      setWin({
        id: data.id,
        auction_id: (data as any).auction_id,
        winning_bid: Number((data as any).winning_bid),
        payment_deadline: (data as any).payment_deadline,
        payment_status: (data as any).payment_status,
        seller_id: (data as any).seller_id,
        card_name: auction?.card_name ?? "Auction Item",
        edition: auction?.edition ?? null,
        grade: auction?.grade ?? auction?.condition ?? null,
        images: normalizeImages(auction?.images),
        seller_name: seller?.display_name ?? seller?.username ?? "Seller",
        seller_avatar: seller?.avatar_url ?? null,
      });
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [winId]);

  useEffect(() => {
    loadWin();
  }, [loadWin]);

  async function handleConfirmPayment() {
    if (processing || !win) return;
    if (!(await requireNetwork())) return;
    setProcessing(true);

    try {
      const { error } = await supabase.rpc("pay_auction_win", {
        p_win_id: win.id,
      });
      if (error) throw new Error(error.message);
      setConfirmed(true);
    } catch (err: any) {
      Alert.alert(
        "Payment Failed",
        err.message ?? "Something went wrong. Please try again.",
      );
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar style="light" />
        <View style={st.header}>
          <Pressable style={st.backBtn} onPress={onBack}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>
          <Text style={st.headerTitle}>Checkout</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={st.center}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (confirmed && win) {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar style="light" />
        <View style={st.successState}>
          <View style={st.successCircle}>
            <Ionicons name="checkmark" size={40} color={C.textHero} />
          </View>
          <Text style={st.successTitle}>Payment Confirmed!</Text>
          <Text style={st.successSub}>
            Your auction win has been paid. The seller will ship your item soon.
          </Text>
          <View style={st.successDetails}>
            <View style={st.successItem}>
              <Text style={st.successItemName} numberOfLines={1}>
                {win.card_name}
              </Text>
              <Text style={st.successItemPrice}>
                {formatPrice(win.winning_bid)}
              </Text>
            </View>
            <View style={st.successDivider} />
            <View style={st.successItem}>
              <Text style={st.successTotalLabel}>Total Paid</Text>
              <Text style={st.successTotalPrice}>
                {formatPrice(win.winning_bid)}
              </Text>
            </View>
          </View>
          <Pressable
            style={[st.doneBtn, { marginBottom: Math.max(insets.bottom, 14) }]}
            onPress={onBack}
          >
            <Text style={st.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!win) {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar style="light" />
        <View style={st.header}>
          <Pressable style={st.backBtn} onPress={onBack}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>
          <Text style={st.headerTitle}>Checkout</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={st.center}>
          <Text style={st.emptyText}>Win record not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const deadlinePassed =
    win.payment_deadline && new Date(win.payment_deadline) < new Date();
  const imageUrl = win.images[0];

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />

      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>Checkout</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={st.scroll}
      >
        {/* Auction badge */}
        <View style={st.auctionBadge}>
          <Ionicons name="hammer" size={14} color="#F59E0B" />
          <Text style={st.auctionBadgeText}>Auction Win</Text>
        </View>

        {/* Item card */}
        <Text style={st.sectionTitle}>Item Won</Text>
        <View style={st.itemCard}>
          <View style={st.itemThumb}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={st.itemThumbImg} />
            ) : (
              <Ionicons name="image-outline" size={24} color={C.textMuted} />
            )}
          </View>
          <View style={st.itemInfo}>
            <Text style={st.itemName} numberOfLines={2}>
              {win.card_name}
            </Text>
            {win.edition && (
              <Text style={st.itemEdition}>{win.edition}</Text>
            )}
            {win.grade && <Text style={st.itemGrade}>{win.grade}</Text>}
          </View>
          <Text style={st.itemPrice}>{formatPrice(win.winning_bid)}</Text>
        </View>

        {/* Seller */}
        <Text style={st.sectionTitle}>Seller</Text>
        <View style={st.sellerCard}>
          <View style={st.sellerAvatar}>
            {win.seller_avatar ? (
              <Image
                source={{ uri: win.seller_avatar }}
                style={st.sellerAvatarImg}
              />
            ) : (
              <Text style={st.sellerInitial}>
                {win.seller_name.charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <Text style={st.sellerName}>{win.seller_name}</Text>
        </View>

        {/* Shipping */}
        <Text style={st.sectionTitle}>Shipping Address</Text>
        <Pressable style={st.addressCard}>
          <Feather name="map-pin" size={18} color={C.textAccent} />
          <View style={st.addressInfo}>
            <Text style={st.addressName}>Add Shipping Address</Text>
            <Text style={st.addressSub}>
              Tap to set your delivery address
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={C.textMuted} />
        </Pressable>

        {/* Payment */}
        <Text style={st.sectionTitle}>Payment Method</Text>
        <Pressable style={st.addressCard}>
          <Ionicons name="card-outline" size={18} color={C.textAccent} />
          <View style={st.addressInfo}>
            <Text style={st.addressName}>Add Payment Method</Text>
            <Text style={st.addressSub}>Credit/Debit card, Apple Pay</Text>
          </View>
          <Feather name="chevron-right" size={18} color={C.textMuted} />
        </Pressable>

        {/* Price breakdown */}
        <Text style={st.sectionTitle}>Price Breakdown</Text>
        <View style={st.breakdownCard}>
          <View style={st.breakdownRow}>
            <Text style={st.breakdownLabel}>Winning Bid</Text>
            <Text style={st.breakdownValue}>
              {formatPrice(win.winning_bid)}
            </Text>
          </View>
          <View style={st.breakdownRow}>
            <Text style={st.breakdownLabel}>Buyer Protection</Text>
            <Text style={st.breakdownFree}>FREE</Text>
          </View>
          <View style={st.breakdownRow}>
            <Text style={st.breakdownLabel}>Shipping</Text>
            <Text style={st.breakdownValue}>Calculated at next step</Text>
          </View>
          <View style={st.breakdownDivider} />
          <View style={st.breakdownRow}>
            <Text style={st.breakdownTotalLabel}>Total</Text>
            <Text style={st.breakdownTotal}>
              {formatPrice(win.winning_bid)}
            </Text>
          </View>
        </View>

        {/* Protection note */}
        <View style={st.protectionRow}>
          <Ionicons name="shield-checkmark" size={16} color={C.success} />
          <Text style={st.protectionText}>
            Buyer Protection covers authentication verification, condition
            guarantee, and full refund if item doesn't match listing.
          </Text>
        </View>
      </ScrollView>

      {/* Bottom bar */}
      <View
        style={[st.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}
      >
        {deadlinePassed ? (
          <View style={st.expiredBtn}>
            <Ionicons name="time-outline" size={18} color={C.danger} />
            <Text style={st.expiredText}>Payment Deadline Passed</Text>
          </View>
        ) : (
          <Pressable
            style={[st.confirmBtn, processing && { opacity: 0.7 }]}
            onPress={handleConfirmPayment}
            disabled={processing}
          >
            {processing ? (
              <ActivityIndicator size="small" color={C.textHero} />
            ) : (
              <Ionicons name="lock-closed" size={18} color={C.textHero} />
            )}
            <Text style={st.confirmText}>
              {processing
                ? "Processing…"
                : `Confirm Payment  •  ${formatPrice(win.winning_bid)}`}
            </Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: C.textMuted, fontSize: 14 },

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

  scroll: {
    paddingHorizontal: S.screenPadding,
    paddingTop: S.lg,
    paddingBottom: 120,
    gap: 6,
  },

  auctionBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.25)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: S.sm,
  },
  auctionBadgeText: {
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "800",
  },

  sectionTitle: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: "800",
    marginTop: S.lg,
    marginBottom: S.md,
  },

  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
  },
  itemThumb: {
    width: 56,
    height: 72,
    borderRadius: 8,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.borderCard,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  itemThumbImg: { width: "100%", height: "100%" },
  itemInfo: { flex: 1, gap: 2 },
  itemName: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
  itemEdition: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  itemGrade: { color: C.textAccent, fontSize: 11, fontWeight: "700" },
  itemPrice: { color: C.link, fontSize: 16, fontWeight: "900" },

  sellerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
  },
  sellerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  sellerAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  sellerInitial: { color: C.accent, fontSize: 14, fontWeight: "900" },
  sellerName: { color: C.textPrimary, fontSize: 14, fontWeight: "700" },

  addressCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
  },
  addressInfo: { flex: 1, gap: 2 },
  addressName: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  addressSub: { color: C.textSecondary, fontSize: 11, fontWeight: "500" },

  breakdownCard: {
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    gap: S.md,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  breakdownLabel: { color: C.textSecondary, fontSize: 13, fontWeight: "600" },
  breakdownValue: { color: C.textPrimary, fontSize: 13, fontWeight: "600" },
  breakdownFree: { color: C.success, fontSize: 13, fontWeight: "800" },
  breakdownDivider: { height: 1, backgroundColor: C.border },
  breakdownTotalLabel: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  breakdownTotal: { color: C.link, fontSize: 20, fontWeight: "900" },

  protectionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(34,197,94,0.06)",
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.2)",
    padding: S.lg,
    marginTop: S.md,
  },
  protectionText: {
    flex: 1,
    color: C.success,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16,
  },

  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: S.screenPadding,
    paddingTop: S.lg,
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.success,
    borderRadius: S.radiusSmall,
    paddingVertical: 16,
  },
  confirmText: { color: C.textHero, fontSize: 15, fontWeight: "800" },
  expiredBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(239,68,68,0.1)",
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
    paddingVertical: 16,
  },
  expiredText: { color: C.danger, fontSize: 15, fontWeight: "800" },

  successState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: S.screenPadding,
    gap: 16,
  },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.success,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  successTitle: { color: C.textPrimary, fontSize: 24, fontWeight: "900" },
  successSub: {
    color: C.textSecondary,
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 20,
  },
  successDetails: {
    width: "100%",
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    gap: S.md,
    marginTop: S.md,
  },
  successItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  successItemName: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
    marginRight: S.md,
  },
  successItemPrice: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  successDivider: { height: 1, backgroundColor: C.border },
  successTotalLabel: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  successTotalPrice: { color: C.link, fontSize: 20, fontWeight: "900" },
  doneBtn: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accent,
    borderRadius: S.radiusSmall,
    paddingVertical: 16,
    marginTop: S.lg,
  },
  doneBtnText: { color: C.textHero, fontSize: 15, fontWeight: "800" },
});
