import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, S } from "../theme";
import { ld } from "../styles/listingDetail.styles";
import { formatListingPrice, timeAgo, type Listing } from "../data/market";
import { useAppNavigation } from "../navigation/NavigationContext";
import { useCart, parsePrice, formatPrice } from "../data/cart";
import { supabase } from "../lib/supabase";

const SCREEN_H = Dimensions.get("window").height;
const SPRING_CONFIG = { tension: 65, friction: 11, useNativeDriver: true };

type Props = {
  listingId: string;
  onBack: () => void;
};

export default function ListingDetailScreen({ listingId, onBack }: Props) {
  const { push } = useAppNavigation();
  const { addItem } = useCart();
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<Listing | null>(null);
  const [similar, setSimilar] = useState<Listing[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCartToast, setShowCartToast] = useState(false);
  const [showQtyPicker, setShowQtyPicker] = useState(false);
  const [qtyToAdd, setQtyToAdd] = useState(1);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;

  // Bottom-sheet animation values
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  function openSheet() {
    setQtyToAdd(1);
    setShowQtyPicker(true);
    sheetAnim.setValue(0);
    backdropAnim.setValue(0);
    Animated.parallel([
      Animated.spring(sheetAnim, { ...SPRING_CONFIG, toValue: 1 }),
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }

  function closeSheet(cb?: () => void) {
    Animated.parallel([
      Animated.timing(sheetAnim, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowQtyPicker(false);
      cb?.();
    });
  }

  const loadListing = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("listings")
      .select(`
        id, seller_id, card_name, edition, grade, condition, price, quantity,
        category, description, images, views, status, created_at,
        seller:profiles!seller_id(username, display_name, rating, total_sales, avatar_url)
      `)
      .eq("id", listingId)
      .maybeSingle();

    if (data) {
      const listing = {
        ...data,
        seller: Array.isArray(data.seller) ? data.seller[0] : data.seller,
      } as Listing;
      setItem(listing);

      const { data: sim } = await supabase
        .from("listings")
        .select(`
          id, seller_id, card_name, edition, grade, condition, price, quantity,
          category, description, images, views, status, created_at,
          seller:profiles!seller_id(username, display_name, rating, total_sales, avatar_url)
        `)
        .eq("status", "active")
        .eq("category", listing.category)
        .neq("id", listingId)
        .order("created_at", { ascending: false })
        .limit(6);

      if (sim) {
        setSimilar(
          (sim as any[]).map((r) => ({
            ...r,
            seller: Array.isArray(r.seller) ? r.seller[0] : r.seller,
          })),
        );
      }
    }
    setLoading(false);
  }, [listingId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
    loadListing().catch(() => setLoading(false));
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadListing]);

  function triggerCartToast() {
    setShowCartToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);

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

  if (loading) {
    return (
      <SafeAreaView style={ld.safe}>
        <StatusBar style="light" />
        <View style={ld.header}>
          <Pressable style={ld.backBtn} onPress={onBack}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>
          <Text style={ld.headerTitle}>Listing</Text>
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
      <SafeAreaView style={ld.safe}>
        <StatusBar style="light" />
        <View style={ld.header}>
          <Pressable style={ld.backBtn} onPress={onBack}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>
          <Text style={ld.headerTitle}>Listing</Text>
          <View style={{ width: 68 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: C.textMuted, fontSize: 14 }}>Listing not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={ld.safe}>
      <StatusBar style="light" />
      {/* Success toast */}
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
                    outputRange: [-16, 0],
                  }),
                },
                {
                  scale: toastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.95, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <Ionicons name="checkmark-circle" size={18} color={C.textHero} />
          <Text style={ld.cartToastText}>Added to cart</Text>
        </Animated.View>
      )}

      {/* Quantity bottom sheet */}
      {showQtyPicker && (
        <View style={ld.qtyOverlay} pointerEvents="box-none">
          <Animated.View
            style={[ld.qtyBackdrop, { opacity: backdropAnim }]}
          >
            <Pressable
              style={{ flex: 1 }}
              onPress={() => closeSheet()}
            />
          </Animated.View>

          <Animated.View
            style={[
              ld.qtySheet,
              {
                paddingBottom: Math.max(insets.bottom, 20),
                transform: [
                  {
                    translateY: sheetAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [SCREEN_H * 0.5, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {/* Drag handle */}
            <View style={ld.qtyHandle} />

            {/* Item preview */}
            <View style={ld.qtyItemPreview}>
              <View style={ld.qtyItemThumb}>
                {item.images?.[0] ? (
                  <Image
                    source={{ uri: item.images[0] }}
                    style={{ width: "100%", height: "100%", borderRadius: 10 }}
                  />
                ) : (
                  <Ionicons name="image-outline" size={20} color={C.textMuted} />
                )}
              </View>
              <View style={ld.qtyItemInfo}>
                <Text style={ld.qtyItemName} numberOfLines={2}>
                  {item.card_name}
                </Text>
                {item.edition ? (
                  <Text style={ld.qtyItemEdition}>{item.edition}</Text>
                ) : null}
                <Text style={ld.qtyItemPrice}>
                  {formatListingPrice(item.price)}
                </Text>
              </View>
            </View>

            <View style={ld.qtyDivider} />

            {/* Stock indicator */}
            <View style={ld.qtyStockRow}>
              <Ionicons
                name={item.quantity > 0 ? "checkmark-circle" : "close-circle"}
                size={15}
                color={item.quantity > 0 ? C.success : C.danger}
              />
              <Text
                style={[
                  ld.qtyStockText,
                  item.quantity > 0 ? ld.qtyStockInStock : ld.qtyStockOut,
                ]}
              >
                {item.quantity > 0
                  ? `${item.quantity} in stock`
                  : "Out of stock"}
              </Text>
            </View>

            {/* Quantity stepper */}
            <Text style={ld.qtyTitle}>Quantity</Text>
            <View style={ld.qtyRow}>
              <Pressable
                style={[ld.qtyBtn, qtyToAdd <= 1 && ld.qtyBtnDisabled]}
                onPress={() => setQtyToAdd((prev) => Math.max(1, prev - 1))}
                disabled={qtyToAdd <= 1}
                hitSlop={12}
              >
                <Feather name="minus" size={18} color={qtyToAdd <= 1 ? C.textMuted : C.textPrimary} />
              </Pressable>
              <View style={ld.qtyValueWrap}>
                <Text style={ld.qtyValue}>{qtyToAdd}</Text>
              </View>
              <Pressable
                style={[ld.qtyBtn, qtyToAdd >= item.quantity && ld.qtyBtnDisabled]}
                onPress={() => setQtyToAdd((prev) => Math.min(item.quantity, prev + 1))}
                disabled={qtyToAdd >= item.quantity}
                hitSlop={12}
              >
                <Feather name="plus" size={18} color={qtyToAdd >= item.quantity ? C.textMuted : C.textPrimary} />
              </Pressable>
            </View>

            {/* Subtotal */}
            <View style={ld.qtySubtotalRow}>
              <Text style={ld.qtySubtotalLabel}>Subtotal</Text>
              <Text style={ld.qtySubtotalValue}>
                {formatPrice(parsePrice(item.price) * qtyToAdd)}
              </Text>
            </View>

            {/* Actions */}
            <View style={ld.qtyActions}>
              <Pressable
                style={ld.qtyCancelBtn}
                onPress={() => closeSheet()}
              >
                <Text style={ld.qtyCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={ld.qtyConfirmBtn}
                onPress={() => {
                  closeSheet(() => {
                    addItem(item, qtyToAdd);
                    triggerCartToast();
                  });
                }}
              >
                <Ionicons name="cart" size={16} color={C.textHero} />
                <Text style={ld.qtyConfirmText}>
                  Add to Cart
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      )}

      {/* Header */}
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
        {/* Hero Art */}
        <View style={ld.heroArt}>
          {item.images?.[0] ? (
            <Image
              source={{ uri: item.images[0] }}
              style={{ width: "100%", height: "100%", borderRadius: S.radiusCard }}
            />
          ) : (
            <Text style={ld.heroPlaceholderText}>Card Image</Text>
          )}
          {item.grade && (
            <View style={ld.heroGradeBadge}>
              <Text style={ld.heroGradeText}>{item.grade}</Text>
            </View>
          )}
          <View style={ld.viewsBadge}>
            <Feather name="eye" size={12} color={C.textPrimary} />
            <Text style={ld.viewsText}>
              {(item.views ?? 0).toLocaleString()} views
            </Text>
          </View>
        </View>

        {/* Card Info */}
        <View style={ld.infoSection}>
          <View style={ld.categoryChip}>
            <Text style={ld.categoryText}>{item.category}</Text>
          </View>
          <Text style={ld.cardName}>{item.card_name}</Text>
          <Text style={ld.editionText}>{item.edition ?? "—"}</Text>
        </View>

        {/* Price Row */}
        <View style={ld.priceRow}>
          <View>
            <Text style={ld.priceLabel}>Asking Price</Text>
            <Text style={ld.price}>{formatListingPrice(item.price)}</Text>
            <Text style={ld.stockText}>
              {item.quantity > 0
                ? `${item.quantity} available`
                : "Out of stock"}
            </Text>
          </View>
          {item.condition && (
            <View style={ld.conditionChip}>
              <Ionicons name="shield-checkmark" size={13} color={C.success} />
              <Text style={ld.conditionText}>{item.condition}</Text>
            </View>
          )}
        </View>

        <View style={ld.divider} />

        {/* Seller */}
        <View style={ld.sellerSection}>
          <View style={ld.sellerAvatar}>
            {item.seller?.avatar_url ? (
              <Image
                source={{ uri: item.seller.avatar_url }}
                style={{ width: "100%", height: "100%", borderRadius: 20 }}
              />
            ) : (
              <Text style={ld.sellerAvatarText}>
                {(item.seller?.username ?? "U").charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <View style={ld.sellerInfo}>
            <Text style={ld.sellerName}>
              @{item.seller?.username ?? "user"}
            </Text>
            <View style={ld.sellerMeta}>
              <View style={ld.ratingRow}>
                <Ionicons name="star" size={12} color="#F59E0B" />
                <Text style={ld.ratingText}>{item.seller?.rating ?? "5.0"}</Text>
              </View>
              <Text style={ld.salesText}>
                {item.seller?.total_sales ?? 0} sales
              </Text>
            </View>
          </View>
          <Pressable style={ld.viewProfileBtn}>
            <Text style={ld.viewProfileText}>View Profile</Text>
          </Pressable>
        </View>

        <View style={ld.divider} />

        {/* Description */}
        {item.description && (
          <>
            <View style={ld.descSection}>
              <Text style={ld.descTitle}>About This Card</Text>
              <Text style={ld.descText}>{item.description}</Text>
              <View style={ld.detailChips}>
                {item.grade && (
                  <View style={ld.detailChip}>
                    <Text style={ld.detailChipLabel}>Grade</Text>
                    <Text style={ld.detailChipValue}>{item.grade}</Text>
                  </View>
                )}
                {item.condition && (
                  <View style={ld.detailChip}>
                    <Text style={ld.detailChipLabel}>Condition</Text>
                    <Text style={ld.detailChipValue}>{item.condition}</Text>
                  </View>
                )}
                <View style={ld.detailChip}>
                  <Text style={ld.detailChipLabel}>Posted</Text>
                  <Text style={ld.detailChipValue}>{timeAgo(item.created_at)}</Text>
                </View>
              </View>
            </View>
            <View style={ld.divider} />
          </>
        )}

        {/* Similar Listings */}
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
                  <View style={ld.similarArt}>
                    {s.images?.[0] ? (
                      <Image
                        source={{ uri: s.images[0] }}
                        style={{ width: "100%", height: "100%", borderRadius: 8 }}
                      />
                    ) : null}
                  </View>
                  <Text style={ld.similarName} numberOfLines={1}>
                    {s.card_name}
                  </Text>
                  <Text style={ld.similarEdition}>{s.edition ?? "—"}</Text>
                  <Text style={ld.similarPrice}>
                    {formatListingPrice(s.price)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Bottom Bar */}
      <View style={[ld.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        {currentUserId && currentUserId === item.seller_id ? (
          <View style={ld.ownListingBar}>
            <Ionicons name="storefront-outline" size={18} color={C.textAccent} />
            <Text style={ld.ownListingText}>This is your listing</Text>
          </View>
        ) : (
          <>
            <Pressable
              style={ld.msgIconBtn}
              onPress={() =>
                push({
                  type: "CHAT",
                  sellerId: item.seller_id,
                  listingId: item.id,
                  topic: item.card_name,
                })
              }
            >
              <Feather name="message-circle" size={19} color={C.textPrimary} />
            </Pressable>
            <Pressable
              style={[ld.buyNowBtn, item.quantity <= 0 && { opacity: 0.45 }]}
              onPress={openSheet}
              disabled={item.quantity <= 0}
            >
              <Ionicons name="cart" size={18} color={C.textHero} />
              <Text style={ld.buyNowText}>
                {item.quantity > 0 ? "Add to Cart" : "Sold Out"}
              </Text>
            </Pressable>
            <Pressable
              style={ld.makeOfferBtn}
              onPress={() =>
                push({
                  type: "CHAT",
                  sellerId: item.seller_id,
                  listingId: item.id,
                  topic: item.card_name,
                  openOffer: true,
                })
              }
            >
              <Ionicons name="pricetag" size={18} color={C.textHero} />
              <Text style={ld.makeOfferText}>Make Offer</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
