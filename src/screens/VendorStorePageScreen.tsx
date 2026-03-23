import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  Text,
  View,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { C, S } from "../theme";
import { supabase } from "../lib/supabase";
import { useAppNavigation } from "../navigation/NavigationContext";
import { StyleSheet } from "react-native";

const SCREEN_W = Dimensions.get("window").width;
const CARD_GAP = 10;
const CARD_W = (SCREEN_W - S.screenPadding * 2 - CARD_GAP) / 2;

type StoreData = {
  id: string;
  store_name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  theme_color: string;
};

type StoreListing = {
  id: string;
  card_name: string;
  edition: string | null;
  grade: string | null;
  price: number;
  images: string[];
  category: string;
};

export default function VendorStorePageScreen({
  storeId,
  onBack,
}: {
  storeId: string;
  onBack: () => void;
}) {
  const { push } = useAppNavigation();
  const [store, setStore] = useState<StoreData | null>(null);
  const [listings, setListings] = useState<StoreListing[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: storeData } = await supabase
      .from("vendor_stores")
      .select("id, store_name, description, logo_url, banner_url, theme_color, profile_id")
      .eq("id", storeId)
      .maybeSingle();

    if (!storeData) {
      setLoading(false);
      return;
    }

    setStore(storeData as StoreData);

    const { data: listingData } = await supabase
      .from("listings")
      .select("id, card_name, edition, grade, price, images, category")
      .eq("seller_id", (storeData as any).profile_id)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    setListings((listingData ?? []) as StoreListing[]);
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <View style={st.loadingWrap}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!store) {
    return (
      <SafeAreaView style={st.safe}>
        <View style={st.header}>
          <Pressable onPress={onBack} style={st.backBtn}>
            <Feather name="arrow-left" size={22} color={C.textPrimary} />
          </Pressable>
          <Text style={st.headerTitle}>Store Not Found</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={st.loadingWrap}>
          <Ionicons name="storefront-outline" size={40} color={C.textMuted} />
          <Text style={st.emptyTitle}>This store doesn't exist</Text>
        </View>
      </SafeAreaView>
    );
  }

  const tc = store.theme_color;

  const renderItem = ({ item }: { item: StoreListing }) => (
    <Pressable
      style={[st.card, { width: CARD_W }]}
      onPress={() => push({ type: "LISTING_DETAIL", listingId: item.id })}
    >
      <View style={st.cardArt}>
        {item.images?.[0] ? (
          <Image source={{ uri: item.images[0] }} style={st.cardImg} />
        ) : (
          <Ionicons name="image-outline" size={24} color={C.textMuted} />
        )}
      </View>
      <Text style={st.cardEdition}>{item.edition ?? item.category}</Text>
      <Text style={st.cardName} numberOfLines={1}>
        {item.card_name}
      </Text>
      {item.grade && <Text style={st.cardGrade}>{item.grade}</Text>}
      <Text style={[st.cardPrice, { color: tc }]}>
        ${Number(item.price).toLocaleString()}
      </Text>
    </Pressable>
  );

  const ListHeader = () => (
    <>
      {/* Banner */}
      {store.banner_url ? (
        <Image source={{ uri: store.banner_url }} style={st.banner} />
      ) : (
        <View style={[st.banner, { backgroundColor: tc + "18" }]}>
          <LinearGradient
            colors={[tc + "30", "transparent"]}
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}

      {/* Back button overlay */}
      <View style={st.backOverlay}>
        <Pressable onPress={onBack} style={st.backBtnFloat}>
          <Feather name="arrow-left" size={20} color="#fff" />
        </Pressable>
      </View>

      {/* Store info */}
      <View style={st.storeInfo}>
        <View style={st.logoRow}>
          {store.logo_url ? (
            <Image source={{ uri: store.logo_url }} style={[st.logo, { borderColor: tc }]} />
          ) : (
            <View style={[st.logo, { borderColor: tc, backgroundColor: tc + "22" }]}>
              <Ionicons name="storefront" size={24} color={tc} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={st.storeName}>{store.store_name}</Text>
            {store.description && (
              <Text style={st.storeDesc} numberOfLines={2}>
                {store.description}
              </Text>
            )}
          </View>
        </View>

        <View style={st.statsRow}>
          <View style={st.statItem}>
            <Text style={st.statValue}>{listings.length}</Text>
            <Text style={st.statLabel}>Listings</Text>
          </View>
          <View style={[st.statDivider, { backgroundColor: tc + "30" }]} />
          <View style={st.statItem}>
            <Text style={st.statValue}>
              {listings.filter((l) => l.images?.length > 0).length}
            </Text>
            <Text style={st.statLabel}>With Images</Text>
          </View>
        </View>
      </View>

      {/* Items heading */}
      <View style={st.itemsHeader}>
        <Text style={st.itemsTitle}>All Items</Text>
        <Text style={st.itemsCount}>{listings.length}</Text>
      </View>
    </>
  );

  return (
    <SafeAreaView style={st.safe}>
      <FlatList
        data={listings}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={2}
        columnWrapperStyle={st.row}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <View style={st.emptyWrap}>
            <Ionicons name="cube-outline" size={32} color={C.textMuted} />
            <Text style={st.emptyTitle}>No listings yet</Text>
            <Text style={st.emptySub}>
              This vendor hasn't listed any cards for sale.
            </Text>
          </View>
        }
        contentContainerStyle={st.flatContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S.screenPadding,
    paddingVertical: 12,
    gap: S.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.borderIcon,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },

  banner: {
    height: 160,
    width: "100%",
  },
  backOverlay: {
    position: "absolute",
    top: 8,
    left: S.screenPadding,
    zIndex: 10,
  },
  backBtnFloat: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },

  storeInfo: {
    paddingHorizontal: S.screenPadding,
    paddingBottom: S.lg,
    marginTop: -28,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  storeName: {
    color: C.textPrimary,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 8,
  },
  storeDesc: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: "500",
    marginTop: 4,
    lineHeight: 18,
  },

  statsRow: {
    flexDirection: "row",
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    marginTop: S.lg,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: S.lg,
  },
  statDivider: {
    width: 1,
    marginVertical: 10,
  },
  statValue: {
    color: C.textPrimary,
    fontSize: 18,
    fontWeight: "900",
  },
  statLabel: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },

  itemsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: S.screenPadding,
    marginTop: S.lg,
    marginBottom: S.md,
  },
  itemsTitle: {
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  itemsCount: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },

  flatContent: {
    paddingBottom: 40,
  },
  row: {
    paddingHorizontal: S.screenPadding,
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },

  card: {
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    padding: S.md,
  },
  cardArt: {
    height: 130,
    borderRadius: S.radiusCardInner,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.borderCard,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: S.sm,
  },
  cardImg: {
    width: "100%",
    height: "100%",
    borderRadius: S.radiusCardInner,
  },
  cardEdition: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  cardName: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  cardGrade: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
  cardPrice: {
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
  },

  emptyWrap: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  emptySub: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
