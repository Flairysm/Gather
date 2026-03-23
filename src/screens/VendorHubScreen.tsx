import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { C, S } from "../theme";
import { supabase } from "../lib/supabase";
import { useAppNavigation } from "../navigation/NavigationContext";
import { vendorHub as vh } from "../styles/vendorHub.styles";

type TabId = "design" | "display" | "listings";

type VendorStore = {
  id: string;
  store_name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  theme_color: string;
};

type DisplayItem = {
  id: string;
  listing_id: string;
  display_order: number;
  listing?: {
    id: string;
    card_name: string;
    edition: string | null;
    grade: string | null;
    price: number;
    images: string[];
  };
};

type VendorListing = {
  id: string;
  card_name: string;
  edition: string | null;
  grade: string | null;
  price: number;
  images: string[];
  status: string;
  created_at: string;
};

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "design", label: "Store", icon: "brush-outline" },
  { id: "display", label: "Display", icon: "grid-outline" },
  { id: "listings", label: "Listings", icon: "pricetag-outline" },
];

export default function VendorHubScreen({ onBack }: { onBack: () => void }) {
  const { push } = useAppNavigation();
  const [tab, setTab] = useState<TabId>("design");
  const [store, setStore] = useState<VendorStore | null>(null);
  const [displayItems, setDisplayItems] = useState<DisplayItem[]>([]);
  const [myListings, setMyListings] = useState<VendorListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  // Store design form
  const [storeName, setStoreName] = useState("");
  const [storeDesc, setStoreDesc] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [logoLocalUri, setLogoLocalUri] = useState<string | null>(null);
  const [bannerLocalUri, setBannerLocalUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [themeColor, setThemeColor] = useState("#2C80FF");

  const THEME_COLORS = [
    "#2C80FF", "#EA3D5E", "#22C55E", "#F59E0B", "#8B5CF6",
    "#EC4899", "#06B6D4", "#F97316",
  ];

  function showToast(msg: string) {
    setToastMsg(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToastMsg(null));
  }

  const loadStore = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("vendor_stores")
      .select("id, store_name, description, logo_url, banner_url, theme_color")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (data) {
      setStore(data as VendorStore);
      setStoreName(data.store_name);
      setStoreDesc(data.description ?? "");
      setLogoUrl(data.logo_url ?? "");
      setBannerUrl(data.banner_url ?? "");
      setThemeColor(data.theme_color ?? "#2C80FF");
    }
  }, []);

  const loadDisplayItems = useCallback(async () => {
    if (!store?.id) return;

    const { data } = await supabase
      .from("vendor_display_items")
      .select(`
        id, listing_id, display_order,
        listing:listings(id, card_name, edition, grade, price, images)
      `)
      .eq("store_id", store.id)
      .order("display_order", { ascending: true });

    if (data) {
      setDisplayItems(
        (data as any[]).map((d) => ({
          ...d,
          listing: Array.isArray(d.listing) ? d.listing[0] : d.listing,
        })),
      );
    }
  }, [store?.id]);

  const loadMyListings = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("listings")
      .select("id, card_name, edition, grade, price, images, status, created_at")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false });

    setMyListings((data ?? []) as VendorListing[]);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadStore();
      setLoading(false);
    })();
  }, [loadStore]);

  useEffect(() => {
    if (store?.id) {
      loadDisplayItems();
      loadMyListings();
    }
  }, [store?.id, loadDisplayItems, loadMyListings]);

  async function handleSaveStore() {
    if (!storeName.trim()) return;
    setSaving(true);
    setUploadingImage(false);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    async function uploadImage(localUri: string, type: "logo" | "banner") {
      const extMatch = localUri.match(/\.(\w+)(\?|$)/);
      const ext = extMatch?.[1]?.toLowerCase() ?? "jpg";
      const mimeTypes: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
      };
      const contentType = mimeTypes[ext] ?? "image/jpeg";
      const filePath = `${user!.id}/${type}-${Date.now()}.${ext}`;

      const resp = await fetch(localUri);
      const arrayBuf = await resp.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from("vendor-assets")
        .upload(filePath, arrayBuf, {
          upsert: true,
          contentType,
        });

      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("vendor-assets").getPublicUrl(filePath);
      return data.publicUrl;
    }

    let finalLogoUrl = logoUrl.trim() || null;
    let finalBannerUrl = bannerUrl.trim() || null;

    try {
      if (logoLocalUri || bannerLocalUri) setUploadingImage(true);
      if (logoLocalUri) {
        finalLogoUrl = await uploadImage(logoLocalUri, "logo");
      }
      if (bannerLocalUri) {
        finalBannerUrl = await uploadImage(bannerLocalUri, "banner");
      }
    } catch {
      setSaving(false);
      setUploadingImage(false);
      showToast("Image upload failed");
      return;
    }

    const payload = {
      store_name: storeName.trim(),
      description: storeDesc.trim() || null,
      logo_url: finalLogoUrl,
      banner_url: finalBannerUrl,
      theme_color: themeColor,
      updated_at: new Date().toISOString(),
    };

    if (store) {
      await supabase.from("vendor_stores").update(payload).eq("id", store.id);
    } else {
      await supabase.from("vendor_stores").insert({ ...payload, profile_id: user.id });
    }

    await loadStore();
    setSaving(false);
    setUploadingImage(false);
    setLogoLocalUri(null);
    setBannerLocalUri(null);
    showToast("Store saved successfully");
  }

  async function pickImage(type: "logo" | "banner") {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showToast("Photo access is required");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.9,
      aspect: type === "logo" ? [1, 1] : [16, 9],
    });
    if (result.canceled) return;
    const uri = result.assets[0]?.uri;
    if (!uri) return;
    if (type === "logo") {
      setLogoLocalUri(uri);
    } else {
      setBannerLocalUri(uri);
    }
  }

  async function addDisplayItem(listingId: string) {
    if (!store?.id) return;
    if (displayItems.length >= 10) {
      showToast("Maximum 10 display items");
      return;
    }
    if (displayItems.some((d) => d.listing_id === listingId)) {
      showToast("Already in display items");
      return;
    }

    const nextOrder = displayItems.length + 1;
    await supabase.from("vendor_display_items").insert({
      store_id: store.id,
      listing_id: listingId,
      display_order: nextOrder,
    });

    await loadDisplayItems();
    showToast("Added to display");
  }

  async function removeDisplayItem(itemId: string) {
    await supabase.from("vendor_display_items").delete().eq("id", itemId);
    await loadDisplayItems();
    showToast("Removed from display");
  }

  async function moveDisplayItem(itemId: string, direction: "up" | "down") {
    const idx = displayItems.findIndex((d) => d.id === itemId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= displayItems.length) return;

    const a = displayItems[idx];
    const b = displayItems[swapIdx];

    await Promise.all([
      supabase.from("vendor_display_items").update({ display_order: b.display_order }).eq("id", a.id),
      supabase.from("vendor_display_items").update({ display_order: a.display_order }).eq("id", b.id),
    ]);

    await loadDisplayItems();
  }

  function formatPrice(cents: number) {
    return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  }

  if (loading) {
    return (
      <SafeAreaView style={vh.safe}>
        <View style={vh.loadingWrap}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={vh.safe}>
      {/* Header */}
      <View style={vh.header}>
        <Pressable onPress={onBack} style={vh.backBtn}>
          <Feather name="arrow-left" size={22} color={C.textPrimary} />
        </Pressable>
        <Text style={vh.headerTitle}>Vendor Hub</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tabs */}
      <View style={vh.tabRow}>
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            style={[vh.tabBtn, tab === t.id && vh.tabBtnActive]}
            onPress={() => setTab(t.id)}
          >
            <Ionicons
              name={t.icon as any}
              size={16}
              color={tab === t.id ? C.accent : C.textMuted}
            />
            <Text style={[vh.tabLabel, tab === t.id && vh.tabLabelActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Content */}
      {tab === "design" && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={vh.content}
        >
          {/* Preview Card */}
          <View style={[vh.previewCard, { borderColor: themeColor + "40" }]}>
            {bannerLocalUri || bannerUrl.trim() ? (
              <Image source={{ uri: bannerLocalUri ?? bannerUrl }} style={vh.previewBanner} />
            ) : (
              <View style={[vh.previewBanner, { backgroundColor: themeColor + "22" }]} />
            )}
            <View style={vh.previewBody}>
              <View style={vh.previewLogoRow}>
                {logoLocalUri || logoUrl.trim() ? (
                  <Image
                    source={{ uri: logoLocalUri ?? logoUrl }}
                    style={[vh.previewLogo, { borderColor: themeColor }]}
                  />
                ) : (
                  <View style={[vh.previewLogo, { borderColor: themeColor, backgroundColor: themeColor + "22" }]}>
                    <Ionicons name="storefront" size={20} color={themeColor} />
                  </View>
                )}
                <View style={vh.previewInfo}>
                  <Text style={vh.previewName}>{storeName || "Your Store Name"}</Text>
                  <Text style={vh.previewDesc} numberOfLines={1}>
                    {storeDesc || "Store description"}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Form */}
          <Text style={vh.sectionTitle}>Store Details</Text>
          <View style={vh.formCard}>
            <View style={vh.field}>
              <Text style={vh.label}>Store Name *</Text>
              <TextInput
                style={vh.input}
                value={storeName}
                onChangeText={setStoreName}
                placeholder="Enter store name"
                placeholderTextColor={C.textMuted}
              />
            </View>
            <View style={vh.field}>
              <Text style={vh.label}>Description</Text>
              <TextInput
                style={[vh.input, vh.inputMulti]}
                value={storeDesc}
                onChangeText={setStoreDesc}
                placeholder="Tell buyers about your store"
                placeholderTextColor={C.textMuted}
                multiline
                numberOfLines={3}
              />
            </View>
            <View style={vh.field}>
              <Text style={vh.label}>Store Logo</Text>
              <Pressable style={vh.uploadBtn} onPress={() => pickImage("logo")}>
                <Feather name="image" size={16} color={C.textPrimary} />
                <Text style={vh.uploadBtnText}>
                  {logoLocalUri ? "Logo selected" : logoUrl ? "Change logo image" : "Upload logo image"}
                </Text>
              </Pressable>
            </View>
            <View style={vh.field}>
              <Text style={vh.label}>Store Banner</Text>
              <Pressable style={vh.uploadBtn} onPress={() => pickImage("banner")}>
                <Feather name="image" size={16} color={C.textPrimary} />
                <Text style={vh.uploadBtnText}>
                  {bannerLocalUri ? "Banner selected" : bannerUrl ? "Change banner image" : "Upload banner image"}
                </Text>
              </Pressable>
            </View>
          </View>

          <Text style={vh.sectionTitle}>Theme Color</Text>
          <View style={vh.colorRow}>
            {THEME_COLORS.map((color) => (
              <Pressable
                key={color}
                onPress={() => setThemeColor(color)}
                style={[
                  vh.colorDot,
                  { backgroundColor: color },
                  themeColor === color && vh.colorDotActive,
                ]}
              >
                {themeColor === color && (
                  <Feather name="check" size={14} color="#fff" />
                )}
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[vh.saveBtn, { backgroundColor: themeColor }]}
            onPress={handleSaveStore}
            disabled={saving || !storeName.trim()}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={vh.saveBtnText}>
                {uploadingImage
                  ? "Uploading images..."
                  : store
                    ? "Update Store"
                    : "Create Store"}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      )}

      {tab === "display" && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={vh.content}
        >
          <View style={vh.displayHeader}>
            <Text style={vh.sectionTitle}>Display Items</Text>
            <Text style={vh.displayCount}>{displayItems.length}/10</Text>
          </View>
          <Text style={vh.displayHint}>
            Select up to 10 listings to showcase on your store's home page.
            Lower order appears first.
          </Text>

          {!store ? (
            <View style={vh.emptyCard}>
              <Ionicons name="storefront-outline" size={32} color={C.textMuted} />
              <Text style={vh.emptyTitle}>Set up your store first</Text>
              <Text style={vh.emptySub}>Go to the Store tab to create your store</Text>
            </View>
          ) : displayItems.length === 0 ? (
            <View style={vh.emptyCard}>
              <Ionicons name="grid-outline" size={32} color={C.textMuted} />
              <Text style={vh.emptyTitle}>No display items yet</Text>
              <Text style={vh.emptySub}>
                Add listings from the Listings tab
              </Text>
            </View>
          ) : (
            displayItems.map((item, idx) => (
              <View key={item.id} style={vh.displayRow}>
                <View style={vh.displayOrder}>
                  <Text style={vh.displayOrderText}>{item.display_order}</Text>
                </View>
                <View style={vh.displayInfo}>
                  <Text style={vh.displayName} numberOfLines={1}>
                    {item.listing?.card_name ?? "Unknown"}
                  </Text>
                  <Text style={vh.displayMeta}>
                    {item.listing?.edition ?? ""}{" "}
                    {item.listing?.grade ? `• ${item.listing.grade}` : ""}
                  </Text>
                </View>
                <View style={vh.displayActions}>
                  <Pressable
                    onPress={() => moveDisplayItem(item.id, "up")}
                    style={[vh.miniBtn, idx === 0 && vh.miniBtnDisabled]}
                    disabled={idx === 0}
                  >
                    <Feather name="chevron-up" size={14} color={idx === 0 ? C.textMuted : C.textPrimary} />
                  </Pressable>
                  <Pressable
                    onPress={() => moveDisplayItem(item.id, "down")}
                    style={[vh.miniBtn, idx === displayItems.length - 1 && vh.miniBtnDisabled]}
                    disabled={idx === displayItems.length - 1}
                  >
                    <Feather name="chevron-down" size={14} color={idx === displayItems.length - 1 ? C.textMuted : C.textPrimary} />
                  </Pressable>
                  <Pressable onPress={() => removeDisplayItem(item.id)} style={vh.miniBtn}>
                    <Feather name="x" size={14} color={C.danger} />
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {tab === "listings" && (
        <View style={{ flex: 1 }}>
          <View style={vh.listingsHeader}>
            <Text style={vh.sectionTitle}>My Listings</Text>
            <Pressable
              style={vh.newListingBtn}
              onPress={() => push({ type: "CREATE_LISTING" })}
            >
              <Feather name="plus" size={16} color="#fff" />
              <Text style={vh.newListingBtnText}>New Listing</Text>
            </Pressable>
          </View>

          {myListings.length === 0 ? (
            <View style={[vh.emptyCard, { marginHorizontal: S.screenPadding }]}>
              <Ionicons name="pricetag-outline" size={32} color={C.textMuted} />
              <Text style={vh.emptyTitle}>No listings yet</Text>
              <Text style={vh.emptySub}>
                Create a listing to start selling on Gather
              </Text>
            </View>
          ) : (
            <FlatList
              data={myListings}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingHorizontal: S.screenPadding, paddingBottom: 40 }}
              renderItem={({ item }) => {
                const isDisplayed = displayItems.some((d) => d.listing_id === item.id);
                return (
                  <View style={vh.listingRow}>
                    <View style={vh.listingThumb}>
                      {item.images?.[0] ? (
                        <Image source={{ uri: item.images[0] }} style={vh.listingThumbImg} />
                      ) : (
                        <Ionicons name="image-outline" size={20} color={C.textMuted} />
                      )}
                    </View>
                    <View style={vh.listingInfo}>
                      <Text style={vh.listingName} numberOfLines={1}>{item.card_name}</Text>
                      <Text style={vh.listingMeta}>
                        {item.edition ?? ""} {item.grade ? `• ${item.grade}` : ""}
                      </Text>
                      <Text style={vh.listingPrice}>${Number(item.price).toLocaleString()}</Text>
                    </View>
                    <View style={vh.listingActions}>
                      <View style={[vh.statusChip, item.status === "active" ? vh.statusActive : vh.statusInactive]}>
                        <Text style={[vh.statusText, item.status === "active" ? vh.statusTextActive : vh.statusTextInactive]}>
                          {item.status}
                        </Text>
                      </View>
                      {store && (
                        <Pressable
                          onPress={() =>
                            isDisplayed
                              ? removeDisplayItem(displayItems.find((d) => d.listing_id === item.id)!.id)
                              : addDisplayItem(item.id)
                          }
                          style={[vh.displayToggle, isDisplayed && vh.displayToggleActive]}
                        >
                          <Feather
                            name={isDisplayed ? "star" : "star"}
                            size={14}
                            color={isDisplayed ? "#F59E0B" : C.textMuted}
                          />
                          <Text style={[vh.displayToggleText, isDisplayed && vh.displayToggleTextActive]}>
                            {isDisplayed ? "Displayed" : "Display"}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      )}

      {/* Toast */}
      {toastMsg && (
        <Animated.View style={[vh.toast, { opacity: toastOpacity }]}>
          <Feather name="check-circle" size={16} color="#fff" />
          <Text style={vh.toastText}>{toastMsg}</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}
