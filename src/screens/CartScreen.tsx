import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, S } from "../theme";
import { useCart, parsePrice, formatPrice } from "../data/cart";
import { useAppNavigation } from "../navigation/NavigationContext";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Props = { onBack: () => void };

export default function CartScreen({ onBack }: Props) {
  const { items, setQuantity, removeItem, clearCart, total } = useCart();
  const { push } = useAppNavigation();
  const insets = useSafeAreaInsets();
  const [vendorStoreNames, setVendorStoreNames] = useState<Record<string, string>>({});
  const [vendorStoreLogos, setVendorStoreLogos] = useState<Record<string, string>>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      const sellerIds = Array.from(
        new Set(items.map((ci) => ci.listing.seller_id).filter(Boolean)),
      );
      if (sellerIds.length === 0) {
        if (mounted) setVendorStoreNames({});
        return;
      }
      const { data } = await supabase
        .from("vendor_stores")
        .select("profile_id, store_name, logo_url")
        .in("profile_id", sellerIds)
        .eq("is_active", true);
      if (!mounted) return;
      if (data) {
        const map: Record<string, string> = {};
        const logoMap: Record<string, string> = {};
        for (const s of data as any[]) {
          if (s.profile_id && s.store_name) map[s.profile_id] = s.store_name;
          if (s.profile_id && s.logo_url) logoMap[s.profile_id] = s.logo_url;
        }
        setVendorStoreNames(map);
        setVendorStoreLogos(logoMap);
      } else {
        setVendorStoreNames({});
        setVendorStoreLogos({});
      }
    })().catch(() => {});

    return () => {
      mounted = false;
    };
  }, [items]);

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />

      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>Cart ({items.length})</Text>
        {items.length > 0 && (
          <Pressable onPress={clearCart}>
            <Text style={st.clearText}>Clear All</Text>
          </Pressable>
        )}
      </View>

      {items.length === 0 ? (
        <View style={st.emptyState}>
          <Feather name="shopping-cart" size={48} color={C.textMuted} />
          <Text style={st.emptyTitle}>Your cart is empty</Text>
          <Text style={st.emptySub}>
            Browse the market and add cards to your cart
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={st.scroll}
          >
            {items.map((ci) => (
              <View key={ci.listing.id} style={st.card}>
                <View style={st.cardArt}>
                  {ci.listing.images?.[0] ? (
                    <Image source={{ uri: ci.listing.images[0] }} style={st.cardArtImg} />
                  ) : (
                    <Ionicons name="image-outline" size={20} color={C.textMuted} />
                  )}
                </View>
                <View style={st.cardInfo}>
                  <Text style={st.cardName} numberOfLines={1}>
                    {ci.listing.card_name}
                  </Text>
                  <Text style={st.cardEdition}>{ci.listing.edition ?? "—"}</Text>
                  <Text style={st.cardGrade}>{ci.listing.grade ?? "Ungraded"}</Text>
                  <View style={st.sellerRow}>
                    <View style={st.sellerDot}>
                      {vendorStoreLogos[ci.listing.seller_id] ? (
                        <Image
                          source={{ uri: vendorStoreLogos[ci.listing.seller_id] }}
                          style={st.sellerDotImg}
                        />
                      ) : ci.listing.seller?.avatar_url ? (
                        <Image
                          source={{ uri: ci.listing.seller.avatar_url }}
                          style={st.sellerDotImg}
                        />
                      ) : (
                        <Ionicons name="person" size={8} color={C.textMuted} />
                      )}
                    </View>
                    <Text style={st.sellerName} numberOfLines={1}>
                      {vendorStoreNames[ci.listing.seller_id] ??
                        ci.listing.seller?.display_name ??
                        (ci.listing.seller?.username ? `@${ci.listing.seller.username}` : "Vendor")}
                    </Text>
                  </View>
                </View>
                <View style={st.cardRight}>
                  <Text style={st.cardPrice}>
                    {formatPrice(parsePrice(ci.listing.price) * ci.quantity)}
                  </Text>
                  <View style={st.qtyControl}>
                    <Pressable
                      style={[
                        st.qtyBtn,
                        ci.quantity <= 1 && st.qtyBtnDisabled,
                      ]}
                      onPress={() => setQuantity(ci.listing.id, ci.quantity - 1)}
                      disabled={ci.quantity <= 1}
                    >
                      <Feather name="minus" size={12} color={C.textPrimary} />
                    </Pressable>
                    <Text style={st.qtyValue}>{ci.quantity}</Text>
                    <Pressable
                      style={[
                        st.qtyBtn,
                        ci.quantity >= (ci.listing.quantity ?? 99) && st.qtyBtnDisabled,
                      ]}
                      onPress={() => setQuantity(ci.listing.id, ci.quantity + 1)}
                      disabled={ci.quantity >= (ci.listing.quantity ?? 99)}
                    >
                      <Feather name="plus" size={12} color={C.textPrimary} />
                    </Pressable>
                  </View>
                  <Text style={st.stockHint}>
                    {ci.listing.quantity ?? "?"} in stock
                  </Text>
                  <Pressable
                    style={st.removeBtn}
                    onPress={() => removeItem(ci.listing.id)}
                  >
                    <Feather name="trash-2" size={14} color={C.danger} />
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={[st.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            <View style={st.totalRow}>
              <Text style={st.totalLabel}>Total</Text>
              <Text style={st.totalPrice}>{total()}</Text>
            </View>
            <Pressable
              style={st.checkoutBtn}
              onPress={() => push({ type: "CHECKOUT" })}
            >
              <Ionicons name="flash" size={20} color={C.textHero} />
              <Text style={st.checkoutText}>Proceed to Checkout</Text>
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

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
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { flex: 1, color: C.textPrimary, fontSize: 16, fontWeight: "800" },
  clearText: { color: C.danger, fontSize: 13, fontWeight: "700" },

  emptyState: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingBottom: 80,
  },
  emptyTitle: { color: C.textPrimary, fontSize: 18, fontWeight: "800" },
  emptySub: { color: C.textSecondary, fontSize: 13, fontWeight: "500", textAlign: "center", paddingHorizontal: 40 },

  scroll: { paddingHorizontal: S.screenPadding, paddingTop: S.lg, paddingBottom: 160, gap: S.md },

  card: {
    flexDirection: "row", alignItems: "center", gap: S.md,
    backgroundColor: C.surface, borderRadius: S.radiusCard, borderWidth: 1, borderColor: C.border,
    padding: S.md,
  },
  cardArt: {
    width: 64, height: 80, borderRadius: S.radiusSmall,
    backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.borderCard,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  cardArtImg: { width: "100%", height: "100%" },
  cardInfo: { flex: 1, gap: 2 },
  cardName: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
  cardEdition: { color: C.textSecondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  cardGrade: { color: C.textAccent, fontSize: 11, fontWeight: "700" },
  stockHint: { color: C.textSecondary, fontSize: 10, fontWeight: "600" },
  sellerRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  sellerDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.muted,
    borderWidth: 1,
    borderColor: C.borderAvatar,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  sellerDotImg: { width: "100%", height: "100%" },
  sellerName: { color: C.textMuted, fontSize: 10, fontWeight: "600" },

  cardRight: { alignItems: "flex-end", gap: 6 },
  cardPrice: { color: C.link, fontSize: 16, fontWeight: "900" },
  qtyControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  qtyBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
  },
  qtyBtnDisabled: {
    opacity: 0.4,
  },
  qtyValue: {
    minWidth: 18,
    textAlign: "center",
    color: C.textPrimary,
    fontSize: 12,
    fontWeight: "800",
  },
  removeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: C.dangerBg, alignItems: "center", justifyContent: "center",
  },

  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: S.screenPadding, paddingTop: S.lg,
    backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border,
    gap: S.md,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { color: C.textSecondary, fontSize: 14, fontWeight: "700" },
  totalPrice: { color: C.link, fontSize: 24, fontWeight: "900" },
  checkoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: C.success, borderRadius: S.radiusSmall, paddingVertical: 16,
  },
  checkoutText: { color: C.textHero, fontSize: 15, fontWeight: "800" },
});
