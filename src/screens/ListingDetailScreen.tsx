import {
  ActivityIndicator,
  Animated,
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
import { useCart } from "../data/cart";
import { supabase } from "../lib/supabase";

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
  const [loading, setLoading] = useState(true);
  const [showCartToast, setShowCartToast] = useState(false);
  const [showQtyPicker, setShowQtyPicker] = useState(false);
  const [qtyToAdd, setQtyToAdd] = useState(1);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;

  const loadListing = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("listings")
      .select(`
        id, seller_id, card_name, edition, grade, condition, price,
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
          id, seller_id, card_name, edition, grade, condition, price,
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
                style={ld.qtyBtn}
                onPress={() => setQtyToAdd((prev) => prev + 1)}
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
        <Pressable
          style={ld.msgIconBtn}
          onPress={() => push({ type: "MESSAGES" })}
        >
          <Feather name="message-circle" size={19} color={C.textPrimary} />
        </Pressable>
        <Pressable
          style={ld.buyNowBtn}
          onPress={() => {
            setQtyToAdd(1);
            setShowQtyPicker(true);
          }}
        >
          <Ionicons name="cart" size={18} color={C.textHero} />
          <Text style={ld.buyNowText}>Add to Cart</Text>
        </Pressable>
        <Pressable
          style={ld.makeOfferBtn}
          onPress={() => push({ type: "MESSAGES" })}
        >
          <Ionicons name="pricetag" size={18} color={C.textHero} />
          <Text style={ld.makeOfferText}>Make Offer</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
