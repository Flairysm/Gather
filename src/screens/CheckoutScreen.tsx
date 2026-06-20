import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, S } from "../theme";
import { useCart, parsePrice, formatPrice, CartItem } from "../data/cart";
import { supabase } from "../lib/supabase";
import { requireNetwork } from "../lib/network";
import { useAppNavigation } from "../navigation/NavigationContext";
import CachedImage from "../components/CachedImage";
import CardPaymentMethodCard from "../components/CardPaymentMethodCard";
import { useCardPayment, createOrderPayment, cancelCardOrder } from "../data/payments";
import { fetchUsableVouchers, type Voucher } from "../data/vouchers";

const MIN_CARD_CHARGE = 2; // Mirrors the server: never leave a residual below this.

type ShippingAddress = {
  id: string;
  label: string;
  full_name: string;
  phone: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
};

type SellerGroup = {
  sellerId: string;
  sellerName: string;
  items: CartItem[];
  subtotal: number;
  shippingFee: number;
};

const EAST_MALAYSIA = ["Sabah", "Sarawak", "W.P. Labuan"];
const SHIPPING_WEST = 10;
const SHIPPING_EAST = 15;

function getShippingFee(state: string): number {
  return EAST_MALAYSIA.some((s) => s.toLowerCase() === state.toLowerCase())
    ? SHIPPING_EAST
    : SHIPPING_WEST;
}

type Props = { onBack: () => void };

export default function CheckoutScreen({ onBack }: Props) {
  const { items, clearCart, selectedItems, selectedTotal, removeItem, selectedIds } = useCart();

  const checkoutPriceRefreshKey = useMemo(() => {
    return selectedItems()
      .map((ci) => `${ci.listing.id}:${ci.quantity}`)
      .sort()
      .join("|");
  }, [items, selectedIds]);
  const { push, stack } = useAppNavigation();
  const pay = useCardPayment();
  const insets = useSafeAreaInsets();
  const [confirmed, setConfirmed] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [address, setAddress] = useState<ShippingAddress | null>(null);
  const [loadingAddr, setLoadingAddr] = useState(true);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [orderSnapshot, setOrderSnapshot] = useState<{
    sellerGroups: SellerGroup[];
    totalUnits: number;
    grandTotal: number;
    voucherApplied: number;
    amountPaid: number;
  } | null>(null);
  const [pricesRefreshed, setPricesRefreshed] = useState(false);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [vouchersLoading, setVouchersLoading] = useState(true);
  const [selectedVoucherCode, setSelectedVoucherCode] = useState<string | null>(null);
  const checkoutItems = selectedItems();
  const totalUnits = checkoutItems.reduce((sum, ci) => sum + ci.quantity, 0);

  const sellerGroups = useMemo(() => {
    const map = new Map<string, SellerGroup>();
    for (const ci of checkoutItems) {
      const sid = ci.listing.seller_id;
      if (!map.has(sid)) {
        const name = ci.listing.seller?.display_name || ci.listing.seller?.username || "Seller";
        map.set(sid, { sellerId: sid, sellerName: name, items: [], subtotal: 0, shippingFee: 0 });
      }
      const grp = map.get(sid)!;
      grp.items.push(ci);
      grp.subtotal += parsePrice(ci.listing.price) * ci.quantity;
    }
    const fee = address ? getShippingFee(address.state) : 0;
    for (const grp of map.values()) grp.shippingFee = fee;
    return Array.from(map.values());
  }, [checkoutItems, address]);

  const subtotal = useMemo(() => sellerGroups.reduce((s, g) => s + g.subtotal, 0), [sellerGroups]);
  const totalShipping = useMemo(() => (address ? sellerGroups.length * getShippingFee(address.state) : 0), [sellerGroups, address]);
  const grandTotal = subtotal + totalShipping;

  const selectedVoucher = useMemo(
    () => vouchers.find((v) => v.code === selectedVoucherCode) ?? null,
    [vouchers, selectedVoucherCode],
  );

  // Estimate how much voucher credit applies (server is authoritative). Mirror
  // the server rule: cover fully, or leave at least the minimum card charge.
  const voucherApplied = useMemo(() => {
    if (!selectedVoucher || grandTotal <= 0) return 0;
    let applied = Math.min(selectedVoucher.remaining_value, grandTotal);
    if (applied < grandTotal && grandTotal - applied < MIN_CARD_CHARGE) {
      applied = Math.max(0, grandTotal - MIN_CARD_CHARGE);
    }
    return Math.round(applied * 100) / 100;
  }, [selectedVoucher, grandTotal]);

  const payableTotal = Math.max(0, Math.round((grandTotal - voucherApplied) * 100) / 100);
  const fullyCovered = voucherApplied > 0 && payableTotal <= 0;

  const loadDefaultAddress = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setSignedIn(!!user);
    if (!user) { setLoadingAddr(false); return; }
    const { data, error } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) console.warn("CheckoutScreen loadDefaultAddress error:", error.message);
    if (data) setAddress(data as ShippingAddress);
    setLoadingAddr(false);
  }, []);

  useEffect(() => { loadDefaultAddress(); }, [loadDefaultAddress]);
  useEffect(() => { loadDefaultAddress(); }, [stack.length]);

  useEffect(() => {
    let cancelled = false;
    setVouchersLoading(true);
    fetchUsableVouchers()
      .then((rows) => { if (!cancelled) setVouchers(rows); })
      .catch((e) => console.warn("CheckoutScreen loadVouchers error:", e?.message ?? e))
      .finally(() => { if (!cancelled) setVouchersLoading(false); });
    return () => { cancelled = true; };
  }, [stack.length]);

  useEffect(() => {
    let cancelled = false;
    async function refreshPrices() {
      const selected = selectedItems();
      const ids = selected.map((ci) => ci.listing.id);
      if (ids.length === 0) {
        setPricesRefreshed(true);
        return;
      }
      setPricesRefreshed(false);
      const { data, error } = await supabase
        .from("listings")
        .select("id, price, quantity, status")
        .in("id", ids);
      if (cancelled) return;
      if (error) {
        console.warn("CheckoutScreen refreshPrices error:", error.message);
        Alert.alert(
          "Couldn't verify prices",
          "Check your connection and try again. The final amount is confirmed when you place the order.",
        );
        setPricesRefreshed(true);
        return;
      }
      if (!data) {
        setPricesRefreshed(true);
        return;
      }
      const dbMap = new Map(data.map((r: any) => [r.id, r]));
      const staleItems: string[] = [];
      for (const ci of selected) {
        // Accepted-offer items keep their agreed price (the server re-validates
        // and charges that exact amount); never overwrite it with the list price.
        if (ci.offerId) continue;
        const db = dbMap.get(ci.listing.id);
        if (!db) continue;
        if (parsePrice(db.price) !== parsePrice(ci.listing.price)) {
          ci.listing.price = db.price;
          staleItems.push(ci.listing.card_name);
        }
      }
      if (staleItems.length > 0 && !cancelled) {
        Alert.alert("Prices Updated", `Prices changed for: ${staleItems.join(", ")}. Please review before confirming.`);
      }
      if (!cancelled) setPricesRefreshed(true);
    }
    refreshPrices();
    return () => {
      cancelled = true;
    };
  }, [checkoutPriceRefreshKey]);

  async function handleConfirm() {
    if (processing || checkoutItems.length === 0) return;
    if (checkoutItems.length > 0 && !pricesRefreshed) return;
    if (!address) {
      Alert.alert("Shipping Address Required", "Please add a shipping address before confirming your purchase.");
      return;
    }
    if (!(await requireNetwork())) return;
    setProcessing(true);

    let orderIds: string[] = [];
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "You must be signed in to complete a purchase.");
        setProcessing(false);
        return;
      }

      const ownItems = checkoutItems.filter((ci) => ci.listing.seller_id === user.id);
      if (ownItems.length > 0) {
        Alert.alert(
          "Cannot Purchase Own Listing",
          `You own ${ownItems.length === 1 ? `"${ownItems[0].listing.card_name}"` : `${ownItems.length} items`} in your cart. Remove them before checking out.`,
        );
        setProcessing(false);
        return;
      }

      // 1. Reserve stock + create the PaymentIntent (server-authoritative pricing).
      const lines = checkoutItems.map((ci) => ({
        listing_id: ci.listing.id,
        quantity: ci.quantity,
        ...(ci.offerId ? { offer_id: ci.offerId } : {}),
      }));
      const shippingFee = getShippingFee(address.state);
      const shippingAddress = {
        full_name: address.full_name,
        phone: address.phone,
        address_line1: address.address_line1,
        address_line2: address.address_line2,
        city: address.city,
        state: address.state,
        zip: address.zip,
        country: "Malaysia",
        label: address.label,
      };
      const { clientSecret, orderIds: ids, total, fullyPaid, voucherApplied: appliedFromServer, payable } = await createOrderPayment(
        lines,
        shippingFee,
        shippingAddress,
        selectedVoucherCode,
      );
      orderIds = ids;

      // 2. If a voucher fully covered the cart, the order is already settled —
      //    skip the Stripe sheet entirely.
      if (!fullyPaid) {
        const result = await pay(clientSecret);
        if (result.status !== "paid") {
          // Buyer cancelled or payment failed — release the reserved stock (and voucher hold).
          await cancelCardOrder(orderIds).catch(() => {});
          if (result.status === "failed") {
            Alert.alert("Payment Failed", result.message ?? "Your payment could not be completed. Please try again.");
          } else {
            Alert.alert("Payment Cancelled", "Your order was not placed. Your items are still in your cart.");
          }
          return;
        }
      }

      // 3. Paid. Settlement (escrow + order confirmation) happens via webhook
      //    (card) or inline (voucher-only).
      {
        const grand = total || grandTotal;
        const applied = appliedFromServer ?? voucherApplied;
        setOrderSnapshot({
          sellerGroups: [...sellerGroups],
          totalUnits,
          grandTotal: grand,
          voucherApplied: applied,
          amountPaid: fullyPaid ? 0 : (payable ?? Math.max(0, grand - applied)),
        });
      }
      for (const ci of checkoutItems) removeItem(ci.listing.id);
      setConfirmed(true);
    } catch (err: any) {
      if (orderIds.length) await cancelCardOrder(orderIds).catch(() => {});
      Alert.alert("Purchase Failed", err.message ?? "Something went wrong. Please try again.");
    } finally {
      setProcessing(false);
    }
  }

  function handleDone() {
    onBack();
  }

  const isEast = address ? EAST_MALAYSIA.some((s) => s.toLowerCase() === address.state.toLowerCase()) : false;

  if (confirmed && orderSnapshot) {
    const snap = orderSnapshot;
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar style="light" />
        <View style={st.successState}>
          <View style={st.successCircle}>
            <Ionicons name="checkmark" size={40} color={C.textHero} />
          </View>
          <Text style={st.successTitle}>Order Confirmed!</Text>
          <Text style={st.successSub}>
            {snap.sellerGroups.length > 1
              ? `${snap.sellerGroups.length} orders placed with ${snap.sellerGroups.length} sellers. Each seller will be notified.`
              : `Your ${snap.totalUnits === 1 ? "card has" : `${snap.totalUnits} cards have`} been purchased. The seller will be notified.`}
          </Text>
          <View style={st.successDetails}>
            {snap.sellerGroups.map((group) => (
              <View key={group.sellerId}>
                {snap.sellerGroups.length > 1 && (
                  <Text style={st.sellerGroupLabel}>{group.sellerName}</Text>
                )}
                {group.items.map((ci) => (
                  <View key={ci.listing.id} style={st.successItem}>
                    <Text style={st.successItemName} numberOfLines={1}>
                      {ci.listing.card_name} x{ci.quantity}
                    </Text>
                    <Text style={st.successItemPrice}>
                      {formatPrice(parsePrice(ci.listing.price) * ci.quantity)}
                    </Text>
                  </View>
                ))}
                <View style={st.successItem}>
                  <Text style={st.successItemName}>Shipping</Text>
                  <Text style={st.successItemPrice}>{formatPrice(group.shippingFee)}</Text>
                </View>
                {snap.sellerGroups.length > 1 && <View style={st.successDivider} />}
              </View>
            ))}
            {snap.sellerGroups.length === 1 && <View style={st.successDivider} />}
            {snap.voucherApplied > 0 && (
              <>
                <View style={st.successItem}>
                  <Text style={st.successItemName}>Order Total</Text>
                  <Text style={st.successItemPrice}>{formatPrice(snap.grandTotal)}</Text>
                </View>
                <View style={st.successItem}>
                  <Text style={st.successItemName}>Voucher Credit</Text>
                  <Text style={[st.successItemPrice, { color: C.success }]}>
                    −{formatPrice(snap.voucherApplied)}
                  </Text>
                </View>
              </>
            )}
            <View style={st.successItem}>
              <Text style={st.successTotalLabel}>
                {snap.voucherApplied > 0 && snap.amountPaid <= 0 ? "Paid with Voucher" : "Total Paid"}
              </Text>
              <Text style={st.successTotalPrice}>
                {snap.voucherApplied > 0 ? formatPrice(snap.amountPaid) : formatPrice(snap.grandTotal)}
              </Text>
            </View>
          </View>
          <Pressable
            style={st.doneBtn}
            onPress={handleDone}
          >
            <Text style={st.doneBtnText}>Back to Cart</Text>
          </Pressable>
          <Pressable
            style={[st.viewOrdersBtn, { marginBottom: Math.max(insets.bottom, 14) }]}
            onPress={() => push({ type: "MY_ORDERS" })}
          >
            <Ionicons name="receipt-outline" size={16} color={C.textAccent} />
            <Text style={st.viewOrdersText}>View Orders</Text>
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
        {signedIn === false && (
          <View style={st.signInGate}>
            <Ionicons name="lock-closed" size={16} color={C.danger} />
            <Text style={st.signInGateText}>
              You're not signed in. Please sign in to add a shipping address and complete your purchase.
            </Text>
          </View>
        )}

        {/* ── Order Summary (grouped by seller) ── */}
        <Text style={st.sectionTitle}>
          Order Summary
          {sellerGroups.length > 1 && (
            <Text style={st.sectionNote}> · {sellerGroups.length} sellers</Text>
          )}
        </Text>

        {sellerGroups.map((group, gi) => (
          <View key={group.sellerId} style={[st.summaryCard, gi > 0 && { marginTop: 10 }]}>
            {sellerGroups.length > 1 && (
              <View style={st.sellerHeader}>
                <Ionicons name="storefront-outline" size={14} color={C.textAccent} />
                <Text style={st.sellerHeaderText}>{group.sellerName}</Text>
                {address && (
                  <Text style={st.sellerShipping}>
                    Shipping: {formatPrice(group.shippingFee)} ({isEast ? "East MY" : "West MY"})
                  </Text>
                )}
              </View>
            )}
            {group.items.map((ci, i) => {
              const img = ci.listing.images?.[0] ?? null;
              return (
                <View key={ci.listing.id}>
                  {(sellerGroups.length > 1 || i > 0) && i > 0 && <View style={st.summaryDivider} />}
                  <View style={st.summaryRow}>
                    <View style={st.summaryLeft}>
                      {img ? (
                        <CachedImage source={{ uri: img }} style={st.summaryImg} />
                      ) : (
                        <View style={st.summaryImgPlaceholder}>
                          <Ionicons name="image-outline" size={20} color={C.textMuted} />
                        </View>
                      )}
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
                </View>
              );
            })}
          </View>
        ))}

        {/* ── Shipping ── */}
        <Text style={st.sectionTitle}>
          Shipping Address <Text style={st.required}>*</Text>
        </Text>
        <Pressable
          style={[st.addressCard, !address && st.addressCardEmpty]}
          onPress={() => push({ type: "ADDRESS_BOOK" })}
        >
          <Feather name="map-pin" size={18} color={address ? C.textAccent : C.textMuted} />
          {loadingAddr ? (
            <View style={st.addressInfo}>
              <ActivityIndicator size="small" color={C.accent} />
            </View>
          ) : address ? (
            <View style={st.addressInfo}>
              <View style={st.addressNameRow}>
                <Text style={st.addressName}>{address.full_name}</Text>
                <View style={st.addressBadge}>
                  <Text style={st.addressBadgeText}>{address.label ?? "Address"}</Text>
                </View>
              </View>
              {address.phone ? <Text style={st.addressPhone}>{address.phone}</Text> : null}
              <Text style={st.addressSub}>{address.address_line1}</Text>
              {address.address_line2 ? <Text style={st.addressSub}>{address.address_line2}</Text> : null}
              <Text style={st.addressSub}>{address.zip} {address.city}, {address.state}</Text>
            </View>
          ) : (
            <View style={st.addressInfo}>
              <Text style={st.addressEmptyTitle}>Add Shipping Address</Text>
              <Text style={st.addressEmptySub}>Required — tap to add your delivery address</Text>
            </View>
          )}
          <Feather name="chevron-right" size={18} color={C.textMuted} />
        </Pressable>

        {/* ── Voucher ── */}
        <Text style={st.sectionTitle}>Voucher</Text>
        {vouchersLoading ? (
          <View style={[st.voucherCard, st.voucherLoadingRow]}>
            <ActivityIndicator size="small" color={C.accent} />
            <Text style={st.voucherEmptyText}>Checking for vouchers…</Text>
          </View>
        ) : vouchers.length === 0 ? (
          <Pressable style={st.voucherEmptyCard} onPress={() => push({ type: "VOUCHERS" })}>
            <Ionicons name="ticket-outline" size={18} color={C.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={st.voucherEmptyTitle}>Have a voucher code?</Text>
              <Text style={st.voucherEmptyText}>Tap to redeem it, then come back to apply it.</Text>
            </View>
            <Feather name="chevron-right" size={18} color={C.textMuted} />
          </Pressable>
        ) : (
          <>
            <View style={st.voucherCard}>
              {vouchers.map((v, i) => {
                const active = v.code === selectedVoucherCode;
                return (
                  <View key={v.id}>
                    {i > 0 && <View style={st.voucherDivider} />}
                    <Pressable
                      style={st.voucherRow}
                      onPress={() => setSelectedVoucherCode(active ? null : v.code)}
                    >
                      <View style={[st.radio, active && st.radioOn]}>
                        {active && <View style={st.radioDot} />}
                      </View>
                      <View style={st.voucherInfo}>
                        <Text style={st.voucherCode}>{v.code}</Text>
                        <Text style={st.voucherBal}>{formatPrice(v.remaining_value)} available</Text>
                      </View>
                      <Ionicons name="ticket" size={18} color={active ? C.accent : C.textMuted} />
                    </Pressable>
                  </View>
                );
              })}
              {selectedVoucherCode && (
                <Pressable style={st.voucherClear} onPress={() => setSelectedVoucherCode(null)}>
                  <Text style={st.voucherClearText}>Don't use a voucher</Text>
                </Pressable>
              )}
            </View>
          </>
        )}

        {/* ── Payment ── */}
        <Text style={st.sectionTitle}>Payment Method</Text>
        {fullyCovered ? (
          <View style={st.voucherCoveredCard}>
            <Ionicons name="checkmark-circle" size={18} color={C.success} />
            <Text style={st.voucherCoveredText}>
              Your voucher covers this order in full — no card payment needed.
            </Text>
          </View>
        ) : (
          <CardPaymentMethodCard />
        )}

        {/* ── Price Breakdown ── */}
        <Text style={st.sectionTitle}>Price Breakdown</Text>
        <View style={st.breakdownCard}>
          <View style={st.breakdownRow}>
            <Text style={st.breakdownLabel}>
              Subtotal ({totalUnits} {totalUnits === 1 ? "item" : "items"})
            </Text>
            <Text style={st.breakdownValue}>{formatPrice(subtotal)}</Text>
          </View>
          <View style={st.breakdownRow}>
            <Text style={st.breakdownLabel}>Buyer Protection</Text>
            <Text style={st.breakdownFree}>FREE</Text>
          </View>
          <View style={st.breakdownRow}>
            <Text style={st.breakdownLabel}>
              Shipping{sellerGroups.length > 1 ? ` (${sellerGroups.length} packages)` : ""}
            </Text>
            {address ? (
              <View style={st.shippingValue}>
                <Text style={st.breakdownValue}>{formatPrice(totalShipping)}</Text>
                <Text style={st.shippingRegion}>
                  {isEast ? "East MY" : "West MY"}
                  {sellerGroups.length > 1 ? ` × ${sellerGroups.length}` : ""}
                </Text>
              </View>
            ) : (
              <Text style={st.breakdownMuted}>Add address to calculate</Text>
            )}
          </View>
          {voucherApplied > 0 && (
            <View style={st.breakdownRow}>
              <Text style={st.breakdownLabel}>Voucher{selectedVoucher ? ` (${selectedVoucher.code})` : ""}</Text>
              <Text style={st.breakdownDiscount}>− {formatPrice(voucherApplied)}</Text>
            </View>
          )}
          <View style={st.breakdownDivider} />
          <View style={st.breakdownRow}>
            <Text style={st.breakdownTotalLabel}>
              {voucherApplied > 0 ? "Total Due" : "Total"}
              {!address ? <Text style={st.breakdownExclShipping}> (excl. shipping)</Text> : null}
            </Text>
            <Text style={st.breakdownTotal}>{formatPrice(payableTotal)}</Text>
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
        {signedIn === false ? (
          <Pressable
            style={st.confirmBtn}
            onPress={() =>
              Alert.alert(
                "Sign in required",
                "Please sign in to complete your purchase.",
                [{ text: "OK", onPress: onBack }],
              )
            }
          >
            <Ionicons name="log-in-outline" size={18} color={C.textHero} />
            <Text style={st.confirmText}>Sign In to Checkout</Text>
          </Pressable>
        ) : (
          <>
        {!address && !loadingAddr && (
          <Text style={st.noAddrHint}>Please add a shipping address to continue</Text>
        )}
        {checkoutItems.length === 0 && (
          <Text style={st.noAddrHint}>No items selected for checkout</Text>
        )}
        <Pressable
          style={[
            st.confirmBtn,
            (processing || !address || checkoutItems.length === 0 || (checkoutItems.length > 0 && !pricesRefreshed)) && st.confirmBtnDisabled,
          ]}
          onPress={handleConfirm}
          disabled={processing || !address || checkoutItems.length === 0 || (checkoutItems.length > 0 && !pricesRefreshed)}
        >
          {processing ? (
            <ActivityIndicator size="small" color={C.textHero} />
          ) : checkoutItems.length > 0 && !pricesRefreshed ? (
            <ActivityIndicator size="small" color={C.textHero} />
          ) : (
            <Ionicons name={fullyCovered ? "ticket" : "lock-closed"} size={18} color={!address ? C.textMuted : C.textHero} />
          )}
          <Text
            style={[
              st.confirmText,
              (!address || (checkoutItems.length > 0 && !pricesRefreshed)) && st.confirmTextDisabled,
            ]}
          >
            {processing
              ? "Processing…"
              : checkoutItems.length > 0 && !pricesRefreshed
                ? "Verifying prices…"
                  : fullyCovered
                    ? "Place Order  •  Paid with Voucher"
                    : `Pay  •  ${formatPrice(payableTotal)}`}
          </Text>
        </Pressable>
          </>
        )}
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
  sectionNote: { color: C.textMuted, fontSize: 12, fontWeight: "600" },

  summaryCard: {
    backgroundColor: C.surface, borderRadius: S.radiusCard, borderWidth: 1, borderColor: C.border,
    padding: S.lg,
  },
  sellerHeader: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingBottom: S.md, marginBottom: S.md,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  sellerHeaderText: { color: C.textPrimary, fontSize: 13, fontWeight: "800", flex: 1 },
  sellerShipping: { color: C.textMuted, fontSize: 10, fontWeight: "600" },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryLeft: { flexDirection: "row", alignItems: "center", gap: S.md, flex: 1 },
  summaryImg: { width: 52, height: 68, borderRadius: 6, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.borderCard },
  summaryImgPlaceholder: { width: 52, height: 68, borderRadius: 6, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.borderCard, alignItems: "center", justifyContent: "center" },
  summaryInfo: { flex: 1, gap: 2 },
  summaryName: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  summaryEdition: { color: C.textSecondary, fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  summaryGrade: { color: C.textAccent, fontSize: 10, fontWeight: "700" },
  summaryQty: { color: C.textSecondary, fontSize: 10, fontWeight: "700" },
  summaryPrice: { color: C.link, fontSize: 15, fontWeight: "900" },
  summaryDivider: { height: 1, backgroundColor: C.border, marginVertical: S.md },

  required: { color: C.danger, fontSize: 13, fontWeight: "700" },
  addressCard: {
    flexDirection: "row", alignItems: "center", gap: S.md,
    backgroundColor: C.surface, borderRadius: S.radiusCard, borderWidth: 1, borderColor: C.border,
    padding: S.lg,
  },
  addressCardEmpty: { borderColor: C.danger, borderStyle: "dashed" },
  addressInfo: { flex: 1, gap: 2 },
  addressNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  addressName: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  addressBadge: { backgroundColor: C.accentGlow, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: C.borderStream },
  addressBadgeText: { color: C.textAccent, fontSize: 9, fontWeight: "800" },
  addressPhone: { color: C.textSecondary, fontSize: 12, fontWeight: "500" },
  addressSub: { color: C.textSecondary, fontSize: 11, fontWeight: "500" },
  addressEmptyTitle: { color: C.danger, fontSize: 13, fontWeight: "700" },
  addressEmptySub: { color: C.textMuted, fontSize: 11, fontWeight: "500" },

  breakdownCard: {
    backgroundColor: C.surface, borderRadius: S.radiusCard, borderWidth: 1, borderColor: C.border,
    padding: S.lg, gap: S.md,
  },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  breakdownLabel: { color: C.textSecondary, fontSize: 13, fontWeight: "600" },
  breakdownValue: { color: C.textPrimary, fontSize: 13, fontWeight: "600" },
  breakdownFree: { color: C.success, fontSize: 13, fontWeight: "800" },
  breakdownDiscount: { color: C.success, fontSize: 13, fontWeight: "800" },

  voucherCard: {
    backgroundColor: C.surface, borderRadius: S.radiusCard, borderWidth: 1, borderColor: C.border,
    padding: S.sm,
  },
  voucherRow: { flexDirection: "row", alignItems: "center", gap: S.md, padding: S.md },
  voucherDivider: { height: 1, backgroundColor: C.border },
  voucherInfo: { flex: 1, gap: 2 },
  voucherCode: { color: C.textPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  voucherBal: { color: C.textSecondary, fontSize: 11, fontWeight: "600" },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  radioOn: { borderColor: C.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent },
  voucherClear: { paddingVertical: 8, alignItems: "center" },
  voucherClearText: { color: C.textMuted, fontSize: 12, fontWeight: "700" },
  voucherLoadingRow: { flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: S.md, paddingHorizontal: S.md },
  voucherEmptyCard: {
    flexDirection: "row", alignItems: "center", gap: S.md,
    backgroundColor: C.surface, borderRadius: S.radiusCard, borderWidth: 1, borderColor: C.border,
    padding: S.md,
  },
  voucherEmptyTitle: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  voucherEmptyText: { color: C.textSecondary, fontSize: 11, fontWeight: "500", marginTop: 1 },
  voucherCoveredCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.successBg, borderRadius: S.radiusCard,
    borderWidth: 1, borderColor: "rgba(34,197,94,0.2)", padding: S.lg,
  },
  voucherCoveredText: { flex: 1, color: C.success, fontSize: 12, fontWeight: "600", lineHeight: 16 },
  breakdownMuted: { color: C.textMuted, fontSize: 12, fontWeight: "500", fontStyle: "italic" },
  shippingValue: { alignItems: "flex-end", gap: 1 },
  shippingRegion: { color: C.textMuted, fontSize: 10, fontWeight: "600" },
  breakdownDivider: { height: 1, backgroundColor: C.border },
  breakdownTotalLabel: { color: C.textPrimary, fontSize: 15, fontWeight: "800" },
  breakdownExclShipping: { color: C.textMuted, fontSize: 11, fontWeight: "600" },
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
  noAddrHint: { color: C.danger, fontSize: 11, fontWeight: "600", textAlign: "center", marginBottom: 8 },
  confirmBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: C.success, borderRadius: S.radiusSmall, paddingVertical: 16,
  },
  confirmBtnDisabled: { backgroundColor: C.muted },
  topupBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: C.accent, borderRadius: S.radiusSmall, paddingVertical: 16,
  },
  confirmText: { color: C.textHero, fontSize: 15, fontWeight: "800" },
  confirmTextDisabled: { color: C.textMuted },

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
  sellerGroupLabel: { color: C.textAccent, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
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
  viewOrdersBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 12, marginTop: 4,
  },
  viewOrdersText: { color: C.textAccent, fontSize: 14, fontWeight: "800" },
  signInGate: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: C.dangerBg, borderRadius: S.radiusSmall,
    borderWidth: 1, borderColor: "rgba(239,68,68,0.25)",
    padding: S.lg, marginTop: S.md,
  },
  signInGateText: { flex: 1, color: C.danger, fontSize: 12, fontWeight: "600", lineHeight: 16 },
});
