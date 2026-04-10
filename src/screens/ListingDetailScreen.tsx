import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  NativeScrollEvent,
  NativeSyntheticEvent,
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
import { Share } from "react-native";

import { C, S } from "../theme";
import { ld } from "../styles/listingDetail.styles";
import CachedImage from "../components/CachedImage";
import Shimmer, { ShimmerGroup, FadeIn } from "../components/Shimmer";
import { formatListingPrice, timeAgo, type Listing } from "../data/market";
import { useAppNavigation } from "../navigation/NavigationContext";
import { useCart, parsePrice, formatPrice } from "../data/cart";
import { supabase } from "../lib/supabase";
import { useReconnect } from "../hooks/useReconnect";
import { formatConditionLabel, getConditionColor } from "../data/grading";
import ErrorState from "../components/ErrorState";

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
  const [vendorStore, setVendorStore] = useState<{ id: string; store_name: string; logo_url: string | null } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showCartToast, setShowCartToast] = useState(false);
  const [showQtyPicker, setShowQtyPicker] = useState(false);
  const [qtyToAdd, setQtyToAdd] = useState(1);
  const [isSaved, setIsSaved] = useState(false);
  const [togglingSave, setTogglingSave] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
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
    setLoadError(false);
    const { data, error } = await supabase
      .from("listings")
      .select(`
        id, seller_id, card_name, edition, grade, grading_company, grade_value, condition, price, quantity,
        category, description, images, views, status, created_at,
        seller:profiles!seller_id(username, display_name, rating, total_sales, review_count, avatar_url)
      `)
      .eq("id", listingId)
      .maybeSingle();

    if (error) {
      console.warn("ListingDetail load error:", error.message);
      setLoadError(true);
      setItem(null);
      setLoading(false);
      return;
    }

    if (!data) {
      setItem(null);
      setSimilar([]);
      setVendorStore(null);
      setLoading(false);
      return;
    }

    const listing = {
      ...data,
      seller: Array.isArray(data.seller) ? data.seller[0] : data.seller,
    } as Listing;
    setItem(listing);
    setVendorStore(null);

    const { data: storeData } = await supabase
      .from("vendor_stores")
      .select("id, store_name, logo_url")
      .eq("profile_id", listing.seller_id)
      .eq("is_active", true)
      .maybeSingle();
    if (storeData?.id && storeData?.store_name) {
      setVendorStore(storeData as any);
    }

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
    setLoading(false);
  }, [listingId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id);
        supabase
          .from("saved_items")
          .select("id")
          .eq("user_id", user.id)
          .eq("item_type", "listing")
          .eq("item_id", listingId)
          .maybeSingle()
          .then(({ data }) => setIsSaved(!!data));
      }
    });
    supabase.rpc("increment_listing_views", { p_listing_id: listingId });
    loadListing().catch(() => setLoading(false));
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadListing]);

  useReconnect(loadListing);

  useEffect(() => {
    setHeroIndex(0);
  }, [item?.id]);

  async function handleShare() {
    if (!item) return;
    Share.share({
      message: `Check out "${item.card_name}" on Evend for ${formatListingPrice(item.price)}!`,
    });
  }

  async function handleToggleSave() {
    if (togglingSave) return;
    setTogglingSave(true);
    const { data, error } = await supabase.rpc("toggle_save_item", {
      p_item_type: "listing",
      p_item_id: listingId,
    });
    setTogglingSave(false);
    if (error) {
      console.warn("ListingDetailScreen toggle save failed:", error.message);
      Alert.alert("Error", "Failed to save item. Please try again.");
      return;
    }
    setIsSaved((data as any).saved);
  }

  function handleHeroScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / Dimensions.get("window").width);
    setHeroIndex(next);
  }

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
        <ShimmerGroup>
          <ScrollView contentContainerStyle={{ padding: S.screenPadding, gap: 14 }}>
            <Shimmer width="100%" height={280} borderRadius={S.radiusCard} />
            <Shimmer width="40%" height={12} borderRadius={6} />
            <Shimmer width="80%" height={18} borderRadius={6} />
            <Shimmer width="55%" height={13} borderRadius={6} />
            <View style={{ height: 8 }} />
            <Shimmer width="30%" height={10} borderRadius={5} />
            <Shimmer width="45%" height={22} borderRadius={6} />
            <View style={{ height: 12 }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Shimmer width={40} height={40} borderRadius={20} />
              <View style={{ flex: 1, gap: 6 }}>
                <Shimmer width="50%" height={13} borderRadius={5} />
                <Shimmer width="35%" height={10} borderRadius={5} />
              </View>
            </View>
          </ScrollView>
        </ShimmerGroup>
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
        {loadError ? (
          <ErrorState
            message="Failed to load listing. Check your connection and try again."
            onRetry={loadListing}
          />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: C.textMuted, fontSize: 14 }}>Listing not found</Text>
          </View>
        )}
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
                  <CachedImage
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
          <Pressable style={ld.headerIconBtn} onPress={handleShare}>
            <Feather name="share" size={16} color={C.textSearch} />
          </Pressable>
          <Pressable style={ld.headerIconBtn} onPress={handleToggleSave}>
            <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={16} color={isSaved ? C.accent : C.textSearch} />
          </Pressable>
        </View>
      </View>

      <FadeIn>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={ld.scroll}
      >
        {/* Hero Art */}
        <View style={ld.heroArt}>
          {item.images && item.images.length > 0 ? (
            <View style={ld.heroPagerWrap}>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleHeroScroll}
              >
                {item.images.map((uri, idx) => (
                  <View key={`${item.id}-img-${idx}`} style={ld.heroSlide}>
                    <CachedImage
                      source={{ uri }}
                      style={{ width: "100%", height: "100%", borderRadius: S.radiusCard }}
                    />
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : (
            <Text style={ld.heroPlaceholderText}>Card Image</Text>
          )}
          {item.grade && (
            <View style={ld.heroGradeBadge}>
              <Text style={ld.heroGradeText}>{item.grade}</Text>
            </View>
          )}
          {item.images && item.images.length > 1 && (
            <View style={ld.heroDots}>
              {item.images.map((_, idx) => (
                <View
                  key={`${item.id}-dot-${idx}`}
                  style={[ld.heroDot, idx === heroIndex && ld.heroDotActive]}
                />
              ))}
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
            <View style={[ld.conditionChip, { borderColor: `${getConditionColor(item.condition)}40` }]}>
              <Ionicons name="shield-checkmark" size={13} color={getConditionColor(item.condition)} />
              <Text style={[ld.conditionText, { color: getConditionColor(item.condition) }]}>
                {formatConditionLabel(item.condition)}
              </Text>
            </View>
          )}
        </View>

        <View style={ld.divider} />

        {/* Seller */}
        <View style={ld.sellerSection}>
          <View style={ld.sellerAvatar}>
            {vendorStore?.logo_url ? (
              <CachedImage
                source={{ uri: vendorStore.logo_url }}
                style={{ width: "100%", height: "100%", borderRadius: 20 }}
              />
            ) : item.seller?.avatar_url ? (
              <CachedImage
                source={{ uri: item.seller.avatar_url }}
                style={{ width: "100%", height: "100%", borderRadius: 20 }}
              />
            ) : (
              <Text style={ld.sellerAvatarText}>
                {(vendorStore?.store_name ?? item.seller?.display_name ?? item.seller?.username ?? "V")
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            )}
          </View>
          <View style={ld.sellerInfo}>
            <Text style={ld.sellerName}>
              {vendorStore?.store_name ??
                item.seller?.display_name ??
                (item.seller?.username ? `@${item.seller.username}` : "Vendor")}
            </Text>
            <View style={ld.sellerMeta}>
              <View style={ld.ratingRow}>
                <Ionicons name="star" size={12} color="#F59E0B" />
                <Text style={ld.ratingText}>
                  {Number(item.seller?.rating ?? 5).toFixed(1)}
                  {(item.seller as any)?.review_count > 0
                    ? ` (${(item.seller as any).review_count})`
                    : ""}
                </Text>
              </View>
              <Text style={ld.salesText}>
                {item.seller?.total_sales ?? 0} sales
              </Text>
            </View>
          </View>
          {vendorStore?.id ? (
            <Pressable
              style={ld.viewProfileBtn}
              onPress={() => push({ type: "VENDOR_STORE_PAGE", storeId: vendorStore.id })}
            >
              <Text style={ld.viewProfileText}>View Vendor</Text>
            </Pressable>
          ) : null}
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
                    <Text style={[ld.detailChipValue, { color: getConditionColor(item.condition) }]}>
                      {formatConditionLabel(item.condition)}
                    </Text>
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
                      <CachedImage
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
      </FadeIn>

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
                  listingId: "",
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
              style={[ld.makeOfferBtn, item.quantity <= 0 && { opacity: 0.45 }]}
              onPress={() =>
                push({
                  type: "CHAT",
                  sellerId: item.seller_id,
                  listingId: item.id,
                  topic: item.card_name,
                  openOffer: true,
                })
              }
              disabled={item.quantity <= 0}
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
