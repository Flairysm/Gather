import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, S } from "../theme";
import { useCart, parsePrice, formatPrice } from "../data/cart";
import { supabase } from "../lib/supabase";
import { requireNetwork } from "../lib/network";

type Props = { onBack: () => void };

export default function CheckoutScreen({ onBack }: Props) {
  const { items, clearCart, total } = useCart();
  const insets = useSafeAreaInsets();
  const [confirmed, setConfirmed] = useState(false);
  const [processing, setProcessing] = useState(false);
  const totalUnits = items.reduce((sum, ci) => sum + ci.quantity, 0);

  async function handleConfirm() {
    if (processing || items.length === 0) return;
    if (!(await requireNetwork())) return;
    setProcessing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "You must be signed in to complete a purchase.");
        setProcessing(false);
        return;
      }

      const ownItems = items.filter((ci) => ci.listing.seller_id === user.id);
      if (ownItems.length > 0) {
        Alert.alert(
          "Cannot Purchase Own Listing",
          `You own ${ownItems.length === 1 ? `"${ownItems[0].listing.card_name}"` : `${ownItems.length} items`} in your cart. Remove them before checking out.`,
        );
        setProcessing(false);
        return;
      }

      const payload = items.map((ci) => ({
        listing_id: ci.listing.id,
        quantity: ci.quantity,
        unit_price: parsePrice(ci.listing.price),
      }));

      const { data, error } = await supabase.rpc("checkout_order", {
        p_items: payload,
      });

      if (error) throw new Error(error.message);

      setConfirmed(true);
    } catch (err: any) {
      Alert.alert("Purchase Failed", err.message ?? "Something went wrong. Please try again.");
    } finally {
      setProcessing(false);
    }
  }

  function handleDone() {
    clearCart();
    onBack();
  }

  if (confirmed) {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar style="light" />
        <View style={st.successState}>
          <View style={st.successCircle}>
            <Ionicons name="checkmark" size={40} color={C.textHero} />
          </View>
          <Text style={st.successTitle}>Order Confirmed!</Text>
          <Text style={st.successSub}>
            Your {totalUnits === 1 ? "card has" : `${totalUnits} cards have`} been
            purchased. The seller will be notified.
          </Text>
          <View style={st.successDetails}>
            {items.map((ci) => (
              <View key={ci.listing.id} style={st.successItem}>
                <Text style={st.successItemName} numberOfLines={1}>
                  {ci.listing.card_name} x{ci.quantity}
                </Text>
                <Text style={st.successItemPrice}>
                  {formatPrice(parsePrice(ci.listing.price) * ci.quantity)}
                </Text>
              </View>
            ))}
            <View style={st.successDivider} />
            <View style={st.successItem}>
              <Text style={st.successTotalLabel}>Total Paid</Text>
              <Text style={st.successTotalPrice}>{total()}</Text>
            </View>
          </View>
          <Pressable
            style={[st.doneBtn, { marginBottom: Math.max(insets.bottom, 14) }]}
            onPress={handleDone}
          >
            <Text style={st.doneBtnText}>Back to Market</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

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
        {/* ── Order Summary ── */}
        <Text style={st.sectionTitle}>Order Summary</Text>
        <View style={st.summaryCard}>
          {items.map((ci, i) => (
            <View key={ci.listing.id}>
              <View style={st.summaryRow}>
                <View style={st.summaryLeft}>
                  <View style={st.summaryArt} />
                  <View style={st.summaryInfo}>
                    <Text style={st.summaryName} numberOfLines={1}>
                      {ci.listing.card_name}
                    </Text>
                    <Text style={st.summaryEdition}>{ci.listing.edition ?? "—"}</Text>
                    <Text style={st.summaryGrade}>{ci.listing.grade ?? "Ungraded"}</Text>
                    <Text style={st.summaryQty}>Qty: {ci.quantity}</Text>
                  </View>
                </View>
                <Text style={st.summaryPrice}>
                  {formatPrice(parsePrice(ci.listing.price) * ci.quantity)}
                </Text>
              </View>
              {i < items.length - 1 && <View style={st.summaryDivider} />}
            </View>
          ))}
        </View>

        {/* ── Shipping ── */}
        <Text style={st.sectionTitle}>Shipping Address</Text>
        <Pressable style={st.addressCard}>
          <Feather name="map-pin" size={18} color={C.textAccent} />
          <View style={st.addressInfo}>
            <Text style={st.addressName}>Add Shipping Address</Text>
            <Text style={st.addressSub}>Tap to set your delivery address</Text>
          </View>
          <Feather name="chevron-right" size={18} color={C.textMuted} />
        </Pressable>

        {/* ── Payment ── */}
        <Text style={st.sectionTitle}>Payment Method</Text>
        <Pressable style={st.paymentCard}>
          <Ionicons name="card-outline" size={18} color={C.textAccent} />
          <View style={st.addressInfo}>
            <Text style={st.addressName}>Add Payment Method</Text>
            <Text style={st.addressSub}>Credit/Debit card, Apple Pay</Text>
          </View>
          <Feather name="chevron-right" size={18} color={C.textMuted} />
        </Pressable>

        {/* ── Price Breakdown ── */}
        <Text style={st.sectionTitle}>Price Breakdown</Text>
        <View style={st.breakdownCard}>
          <View style={st.breakdownRow}>
            <Text style={st.breakdownLabel}>
              Subtotal ({totalUnits} {totalUnits === 1 ? "item" : "items"})
            </Text>
            <Text style={st.breakdownValue}>{total()}</Text>
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
            <Text style={st.breakdownTotal}>{total()}</Text>
          </View>
        </View>

        {/* ── Protection Note ── */}
        <View style={st.protectionRow}>
          <Ionicons name="shield-checkmark" size={16} color={C.success} />
          <Text style={st.protectionText}>
            Buyer Protection covers authentication verification, condition guarantee, and full refund if item doesn't match listing.
          </Text>
        </View>
      </ScrollView>

      {/* ── Bottom Bar ── */}
      <View style={[st.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable
          style={[st.confirmBtn, processing && { opacity: 0.7 }]}
          onPress={handleConfirm}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator size="small" color={C.textHero} />
          ) : (
            <Ionicons name="lock-closed" size={18} color={C.textHero} />
          )}
          <Text style={st.confirmText}>
            {processing ? "Processing…" : `Confirm Purchase  •  ${total()}`}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: S.screenPadding, paddingVertical: S.md,
    gap: S.md, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { flex: 1, color: C.textPrimary, fontSize: 16, fontWeight: "800", textAlign: "center" },

  scroll: { paddingHorizontal: S.screenPadding, paddingTop: S.xl, paddingBottom: 120, gap: 6 },

  sectionTitle: { color: C.textPrimary, fontSize: 15, fontWeight: "800", marginTop: S.lg, marginBottom: S.md },

  summaryCard: {
    backgroundColor: C.surface, borderRadius: S.radiusCard, borderWidth: 1, borderColor: C.border,
    padding: S.lg,
  },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryLeft: { flexDirection: "row", alignItems: "center", gap: S.md, flex: 1 },
  summaryArt: { width: 48, height: 60, borderRadius: 6, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.borderCard },
  summaryInfo: { flex: 1, gap: 2 },
  summaryName: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  summaryEdition: { color: C.textSecondary, fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  summaryGrade: { color: C.textAccent, fontSize: 10, fontWeight: "700" },
  summaryQty: { color: C.textSecondary, fontSize: 10, fontWeight: "700" },
  summaryPrice: { color: C.link, fontSize: 15, fontWeight: "900" },
  summaryDivider: { height: 1, backgroundColor: C.border, marginVertical: S.md },

  addressCard: {
    flexDirection: "row", alignItems: "center", gap: S.md,
    backgroundColor: C.surface, borderRadius: S.radiusCard, borderWidth: 1, borderColor: C.border,
    padding: S.lg,
  },
  addressInfo: { flex: 1, gap: 2 },
  addressName: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  addressSub: { color: C.textSecondary, fontSize: 11, fontWeight: "500" },

  paymentCard: {
    flexDirection: "row", alignItems: "center", gap: S.md,
    backgroundColor: C.surface, borderRadius: S.radiusCard, borderWidth: 1, borderColor: C.border,
    padding: S.lg,
  },

  breakdownCard: {
    backgroundColor: C.surface, borderRadius: S.radiusCard, borderWidth: 1, borderColor: C.border,
    padding: S.lg, gap: S.md,
  },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  breakdownLabel: { color: C.textSecondary, fontSize: 13, fontWeight: "600" },
  breakdownValue: { color: C.textPrimary, fontSize: 13, fontWeight: "600" },
  breakdownFree: { color: C.success, fontSize: 13, fontWeight: "800" },
  breakdownDivider: { height: 1, backgroundColor: C.border },
  breakdownTotalLabel: { color: C.textPrimary, fontSize: 15, fontWeight: "800" },
  breakdownTotal: { color: C.link, fontSize: 20, fontWeight: "900" },

  protectionRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: C.successBg, borderRadius: S.radiusSmall,
    borderWidth: 1, borderColor: "rgba(34,197,94,0.2)",
    padding: S.lg, marginTop: S.md,
  },
  protectionText: { flex: 1, color: C.success, fontSize: 11, fontWeight: "600", lineHeight: 16 },

  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: S.screenPadding, paddingTop: S.lg,
    backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border,
  },
  confirmBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: C.success, borderRadius: S.radiusSmall, paddingVertical: 16,
  },
  confirmText: { color: C.textHero, fontSize: 15, fontWeight: "800" },

  // ── Success state ──
  successState: {
    flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: S.screenPadding, gap: 16,
  },
  successCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: C.success, alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  successTitle: { color: C.textPrimary, fontSize: 24, fontWeight: "900" },
  successSub: { color: C.textSecondary, fontSize: 14, fontWeight: "500", textAlign: "center", lineHeight: 20 },
  successDetails: {
    width: "100%", backgroundColor: C.surface, borderRadius: S.radiusCard,
    borderWidth: 1, borderColor: C.border, padding: S.lg, gap: S.md, marginTop: S.md,
  },
  successItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  successItemName: { color: C.textPrimary, fontSize: 13, fontWeight: "700", flex: 1, marginRight: S.md },
  successItemPrice: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  successDivider: { height: 1, backgroundColor: C.border },
  successTotalLabel: { color: C.textPrimary, fontSize: 15, fontWeight: "800" },
  successTotalPrice: { color: C.link, fontSize: 20, fontWeight: "900" },
  doneBtn: {
    width: "100%", alignItems: "center", justifyContent: "center",
    backgroundColor: C.accent, borderRadius: S.radiusSmall, paddingVertical: 16, marginTop: S.lg,
  },
  doneBtnText: { color: C.textHero, fontSize: 15, fontWeight: "800" },
});
