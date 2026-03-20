import { Animated, Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, S } from "../theme";
import { ld } from "../styles/listingDetail.styles";
import { listings, type Listing } from "../data/market";
import { useAppNavigation } from "../navigation/NavigationContext";
import { conversations } from "../data/messages";
import { useCart } from "../data/cart";

type Props = {
  listingId: string;
  onBack: () => void;
};

export default function ListingDetailScreen({ listingId, onBack }: Props) {
  const { push } = useAppNavigation();
  const { addItem } = useCart();
  const insets = useSafeAreaInsets();
  const [showCartToast, setShowCartToast] = useState(false);
  const [showQtyPicker, setShowQtyPicker] = useState(false);
  const [qtyToAdd, setQtyToAdd] = useState(1);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const item = listings.find((l) => l.id === listingId);

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  if (!item) return null;

  const similar = listings.filter(
    (l) => l.category === item.category && l.id !== item.id,
  );
  const sellerConversation = conversations.find(
    (c) => c.user === item.seller && c.topic?.toLowerCase().includes(item.cardName.toLowerCase()),
  ) ?? conversations.find((c) => c.user === item.seller);

  function triggerCartToast() {
    setShowCartToast(true);
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }

    toastAnim.setValue(0);
    Animated.timing(toastAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();

    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setShowCartToast(false));
    }, 1500);
  }

  function openQtyPicker() {
    setQtyToAdd(1);
    setShowQtyPicker(true);
  }

  return (
    <SafeAreaView style={ld.safe}>
      <StatusBar style="light" />
      {showCartToast && (
        <Animated.View
          style={[
            ld.cartToast,
            {
              top: Math.max(insets.top + 8, 16),
              opacity: toastAnim,
              transform: [
                {
                  translateY: toastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-10, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={ld.cartToastText}>Successfully added to cart</Text>
        </Animated.View>
      )}
      {showQtyPicker && (
        <View style={ld.qtyOverlay}>
          <View style={ld.qtySheet}>
            <Text style={ld.qtyTitle}>Select Quantity</Text>
            <Text style={ld.qtySubtitle}>
              Stock available: {item.stockAvailable}
            </Text>
            <View style={ld.qtyRow}>
              <Pressable
                style={[ld.qtyBtn, qtyToAdd <= 1 && ld.qtyBtnDisabled]}
                onPress={() => setQtyToAdd((prev) => Math.max(1, prev - 1))}
                disabled={qtyToAdd <= 1}
              >
                <Feather name="minus" size={16} color={C.textPrimary} />
              </Pressable>
              <Text style={ld.qtyValue}>{qtyToAdd}</Text>
              <Pressable
                style={[
                  ld.qtyBtn,
                  qtyToAdd >= item.stockAvailable && ld.qtyBtnDisabled,
                ]}
                onPress={() =>
                  setQtyToAdd((prev) => Math.min(item.stockAvailable, prev + 1))
                }
                disabled={qtyToAdd >= item.stockAvailable}
              >
                <Feather name="plus" size={16} color={C.textPrimary} />
              </Pressable>
            </View>
            <View style={ld.qtyActions}>
              <Pressable
                style={ld.qtyCancelBtn}
                onPress={() => setShowQtyPicker(false)}
              >
                <Text style={ld.qtyCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={ld.qtyConfirmBtn}
                onPress={() => {
                  addItem(item, qtyToAdd);
                  setShowQtyPicker(false);
                  triggerCartToast();
                }}
              >
                <Text style={ld.qtyConfirmText}>Add {qtyToAdd} to Cart</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* ── Header ── */}
      <View style={ld.header}>
        <Pressable style={ld.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={ld.headerTitle}>Listing</Text>
        <View style={ld.headerActions}>
          <Pressable style={ld.headerIconBtn}>
            <Feather name="share" size={16} color={C.textSearch} />
          </Pressable>
          <Pressable style={ld.headerIconBtn}>
            <Feather name="bookmark" size={16} color={C.textSearch} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={ld.scroll}
      >
        {/* ── Hero Art ── */}
        <View style={ld.heroArt}>
          <Text style={ld.heroPlaceholderText}>Card Image</Text>
          <View style={ld.heroGradeBadge}>
            <Text style={ld.heroGradeText}>{item.grade}</Text>
          </View>
          <View style={ld.viewsBadge}>
            <Feather name="eye" size={12} color={C.textPrimary} />
            <Text style={ld.viewsText}>
              {item.views.toLocaleString()} views
            </Text>
          </View>
        </View>

        {/* ── Card Info ── */}
        <View style={ld.infoSection}>
          <View style={ld.categoryChip}>
            <Text style={ld.categoryText}>{item.category}</Text>
          </View>
          <Text style={ld.cardName}>{item.cardName}</Text>
          <Text style={ld.editionText}>{item.edition}</Text>
        </View>

        {/* ── Price Row ── */}
        <View style={ld.priceRow}>
          <View>
            <Text style={ld.priceLabel}>Asking Price</Text>
            <Text style={ld.price}>{item.price}</Text>
            <Text style={ld.stockText}>Stock: {item.stockAvailable}</Text>
          </View>
          <View style={ld.conditionChip}>
            <Ionicons
              name="shield-checkmark"
              size={13}
              color={C.success}
            />
            <Text style={ld.conditionText}>{item.condition}</Text>
          </View>
        </View>

        <View style={ld.divider} />

        {/* ── Seller ── */}
        <View style={ld.sellerSection}>
          <View style={ld.sellerAvatar}>
            <Text style={ld.sellerAvatarText}>
              {item.seller.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={ld.sellerInfo}>
            <Text style={ld.sellerName}>@{item.seller}</Text>
            <View style={ld.sellerMeta}>
              <View style={ld.ratingRow}>
                <Ionicons name="star" size={12} color="#F59E0B" />
                <Text style={ld.ratingText}>{item.sellerRating}</Text>
              </View>
              <Text style={ld.salesText}>
                {item.sellerSales} sales
              </Text>
            </View>
          </View>
          <Pressable style={ld.viewProfileBtn}>
            <Text style={ld.viewProfileText}>View Profile</Text>
          </Pressable>
        </View>

        <View style={ld.divider} />

        {/* ── Description ── */}
        <View style={ld.descSection}>
          <Text style={ld.descTitle}>About This Card</Text>
          <Text style={ld.descText}>{item.description}</Text>
          <View style={ld.detailChips}>
            <View style={ld.detailChip}>
              <Text style={ld.detailChipLabel}>Grade</Text>
              <Text style={ld.detailChipValue}>{item.grade}</Text>
            </View>
            <View style={ld.detailChip}>
              <Text style={ld.detailChipLabel}>Condition</Text>
              <Text style={ld.detailChipValue}>{item.condition}</Text>
            </View>
            <View style={ld.detailChip}>
              <Text style={ld.detailChipLabel}>Posted</Text>
              <Text style={ld.detailChipValue}>{item.postedAt}</Text>
            </View>
          </View>
        </View>

        <View style={ld.divider} />

        {/* ── Similar Listings ── */}
        {similar.length > 0 && (
          <View style={ld.similarSection}>
            <Text style={ld.similarTitle}>Similar Listings</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={ld.similarScroll}
            >
              {similar.map((s) => (
                <Pressable
                  key={s.id}
                  style={ld.similarCard}
                  onPress={() =>
                    push({ type: "LISTING_DETAIL", listingId: s.id })
                  }
                >
                  <View style={ld.similarArt} />
                  <Text style={ld.similarName} numberOfLines={1}>
                    {s.cardName}
                  </Text>
                  <Text style={ld.similarEdition}>{s.edition}</Text>
                  <Text style={ld.similarPrice}>{s.price}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* ── Bottom Bar ── */}
      <View style={[ld.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable
          style={ld.msgIconBtn}
          onPress={() => {
            if (sellerConversation) {
              push({ type: "CHAT", conversationId: sellerConversation.id });
              return;
            }
            push({ type: "MESSAGES" });
          }}
        >
          <Feather name="message-circle" size={19} color={C.textPrimary} />
        </Pressable>
        <Pressable
          style={ld.buyNowBtn}
          onPress={openQtyPicker}
        >
          <Ionicons name="cart" size={18} color={C.textHero} />
          <Text style={ld.buyNowText}>Add to Cart</Text>
        </Pressable>
        <Pressable
          style={ld.makeOfferBtn}
          onPress={() => {
            if (sellerConversation) {
              push({ type: "CHAT", conversationId: sellerConversation.id });
            } else {
              push({ type: "MESSAGES" });
            }
          }}
        >
          <Ionicons name="pricetag" size={18} color={C.textHero} />
          <Text style={ld.makeOfferText}>Make Offer</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
