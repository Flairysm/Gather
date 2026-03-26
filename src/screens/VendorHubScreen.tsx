import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

// ── Types ──

type TabId = "overview" | "orders" | "listings" | "auctions" | "store";

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
  condition: string | null;
  price: number;
  quantity: number;
  images: string[];
  status: string;
  created_at: string;
};

type FulfillmentStatus = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled" | "refunded";

type SellerOrderItem = {
  id: string;
  order_id: string;
  listing_id: string;
  quantity: number;
  unit_price: number;
  fulfillment_status: FulfillmentStatus;
  created_at: string;
  listing: {
    card_name: string;
    edition: string | null;
    grade: string | null;
    images: string[];
  } | null;
  order: {
    id: string;
    buyer_id: string;
    total: number;
    created_at: string;
    buyer: { username: string; display_name: string | null } | null;
  } | null;
};

type OverviewStats = {
  revenue: number;
  totalOrders: number;
  activeListings: number;
  pendingShipments: number;
};

type VendorAuction = {
  id: string;
  card_name: string;
  edition: string | null;
  grade: string | null;
  starting_price: number;
  current_bid: number | null;
  bid_count: number;
  images: string[] | null;
  ends_at: string;
  status: string;
  winner_id: string | null;
  created_at: string;
  winner?: { username: string | null; display_name: string | null } | null;
};

// ── Constants ──

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "analytics-outline" },
  { id: "orders", label: "Orders", icon: "receipt-outline" },
  { id: "listings", label: "Listings", icon: "pricetag-outline" },
  { id: "auctions", label: "Auctions", icon: "hammer-outline" },
  { id: "store", label: "Store", icon: "storefront-outline" },
];

const ORDER_FILTERS: { id: FulfillmentStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
  { id: "shipped", label: "Shipped" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
  { id: "refunded", label: "Refunded" },
];

const FULFILLMENT_CONFIG: Record<
  FulfillmentStatus,
  { label: string; icon: string; bg: string; border: string; color: string }
> = {
  pending: {
    label: "Pending",
    icon: "time-outline",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.25)",
    color: "#F59E0B",
  },
  confirmed: {
    label: "Confirmed",
    icon: "checkmark-circle-outline",
    bg: "rgba(44,128,255,0.08)",
    border: "rgba(44,128,255,0.25)",
    color: C.accent,
  },
  shipped: {
    label: "Shipped",
    icon: "airplane-outline",
    bg: "rgba(139,92,246,0.08)",
    border: "rgba(139,92,246,0.25)",
    color: "#8B5CF6",
  },
  delivered: {
    label: "Delivered",
    icon: "checkmark-done-circle-outline",
    bg: "rgba(34,197,94,0.08)",
    border: "rgba(34,197,94,0.25)",
    color: C.success,
  },
  cancelled: {
    label: "Cancelled",
    icon: "close-circle-outline",
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.25)",
    color: "#EF4444",
  },
  refunded: {
    label: "Refunded",
    icon: "receipt-outline",
    bg: "rgba(107,114,128,0.08)",
    border: "rgba(107,114,128,0.25)",
    color: "#6B7280",
  },
};

const THEME_COLORS = [
  "#2C80FF", "#EA3D5E", "#22C55E", "#F59E0B",
  "#8B5CF6", "#EC4899", "#06B6D4", "#F97316",
];

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

function formatListingStatus(status: string) {
  const n = (status || "").toLowerCase();
  if (n === "active") return "Active";
  if (n === "paused") return "Paused";
  if (n === "draft") return "Draft";
  if (n === "sold") return "Sold";
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : "Unknown";
}

function formatCurrency(v: number) {
  return `RM${v.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ── Main Component ──

export default function VendorHubScreen({ onBack }: { onBack: () => void }) {
  const { push } = useAppNavigation();
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("overview");

  // Shared
  const [store, setStore] = useState<VendorStore | null>(null);
  const [displayItems, setDisplayItems] = useState<DisplayItem[]>([]);
  const [myListings, setMyListings] = useState<VendorListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  // Overview
  const [stats, setStats] = useState<OverviewStats>({
    revenue: 0,
    totalOrders: 0,
    activeListings: 0,
    pendingShipments: 0,
  });
  const [recentOrders, setRecentOrders] = useState<SellerOrderItem[]>([]);

  // Orders
  const [orderItems, setOrderItems] = useState<SellerOrderItem[]>([]);
  const [orderFilter, setOrderFilter] = useState<FulfillmentStatus | "all">("all");
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // Store design form
  const [storeName, setStoreName] = useState("");
  const [storeDesc, setStoreDesc] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [logoLocalUri, setLogoLocalUri] = useState<string | null>(null);
  const [bannerLocalUri, setBannerLocalUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [themeColor, setThemeColor] = useState("#2C80FF");

  // Listing editor
  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEdition, setEditEdition] = useState("");
  const [editGrade, setEditGrade] = useState("");
  const [editCondition, setEditCondition] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [savingListing, setSavingListing] = useState(false);

  // Auctions
  const [myAuctions, setMyAuctions] = useState<VendorAuction[]>([]);
  const [auctionFilter, setAuctionFilter] = useState<"all" | "active" | "ended" | "cancelled">("all");

  // ── Helpers ──

  function showToast(msg: string) {
    setToastMsg(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToastMsg(null));
  }

  function errMsg(error: unknown, fallback: string) {
    if (error && typeof error === "object" && "message" in error) {
      const m = String((error as { message?: unknown }).message ?? "").trim();
      if (m) return m;
    }
    return fallback;
  }

  // ── Data Loaders ──

  const loadStore = useCallback(async () => {
    try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
      setUserId(user.id);

      const { data, error } = await supabase
      .from("vendor_stores")
      .select("id, store_name, description, logo_url, banner_url, theme_color")
      .eq("profile_id", user.id)
      .maybeSingle();
      if (error) throw error;

    if (data) {
      setStore(data as VendorStore);
      setStoreName(data.store_name);
      setStoreDesc(data.description ?? "");
      setLogoUrl(data.logo_url ?? "");
      setBannerUrl(data.banner_url ?? "");
      setThemeColor(data.theme_color ?? "#2C80FF");
      }
    } catch (e) {
      showToast(errMsg(e, "Failed to load store"));
    }
  }, []);

  const loadDisplayItems = useCallback(async () => {
    if (!store?.id) return;
    try {
      const { data, error } = await supabase
      .from("vendor_display_items")
        .select(`id, listing_id, display_order, listing:listings(id, card_name, edition, grade, price, images)`)
      .eq("store_id", store.id)
      .order("display_order", { ascending: true });
      if (error) throw error;
    if (data) {
      setDisplayItems(
        (data as any[]).map((d) => ({
          ...d,
          listing: Array.isArray(d.listing) ? d.listing[0] : d.listing,
        })),
      );
      }
    } catch (e) {
      showToast(errMsg(e, "Failed to load display items"));
    }
  }, [store?.id]);

  const loadMyListings = useCallback(async () => {
    try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
      const { data, error } = await supabase
      .from("listings")
        .select("id, card_name, edition, grade, condition, price, quantity, images, status, created_at")
      .eq("seller_id", user.id)
        .neq("status", "removed")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
    setMyListings((data ?? []) as VendorListing[]);
    } catch (e) {
      showToast(errMsg(e, "Failed to load listings"));
    }
  }, []);

  const loadOrderItems = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from("order_items")
        .select(`
          id, order_id, listing_id, quantity, unit_price, fulfillment_status, created_at,
          listing:listings(card_name, edition, grade, images),
          order:orders(id, buyer_id, total, created_at,
            buyer:profiles!buyer_id(username, display_name)
          )
        `)
        .eq("seller_id", userId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const mapped: SellerOrderItem[] = (data ?? []).map((row: any) => ({
        ...row,
        listing: Array.isArray(row.listing) ? row.listing[0] : row.listing,
        order: Array.isArray(row.order) ? row.order[0] : row.order,
      }));

      for (const item of mapped) {
        if (item.order) {
          item.order.buyer = Array.isArray((item.order as any).buyer)
            ? (item.order as any).buyer[0]
            : (item.order as any).buyer;
        }
        if (item.listing) {
          (item.listing as any).images = normalizeImages((item.listing as any).images);
        }
      }

      setOrderItems(mapped);
    } catch (e) {
      showToast(errMsg(e, "Failed to load orders"));
    }
  }, [userId]);

  const loadOverview = useCallback(async () => {
    if (!userId) return;
    try {
      const [
        { data: items },
        { count: activeLCount },
      ] = await Promise.all([
        supabase
          .from("order_items")
          .select(`id, quantity, unit_price, fulfillment_status, created_at, order_id,
            listing:listings(card_name, images),
            order:orders(id, buyer_id, created_at, buyer:profiles!buyer_id(username, display_name))
          `)
          .eq("seller_id", userId)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("listings")
          .select("id", { count: "exact", head: true })
          .eq("seller_id", userId)
          .eq("status", "active"),
      ]);

      const allItems: SellerOrderItem[] = (items ?? []).map((row: any) => ({
        ...row,
        listing: Array.isArray(row.listing) ? row.listing[0] : row.listing,
        order: Array.isArray(row.order) ? row.order[0] : row.order,
      }));

      for (const item of allItems) {
        if (item.order) {
          item.order.buyer = Array.isArray((item.order as any).buyer)
            ? (item.order as any).buyer[0]
            : (item.order as any).buyer;
        }
        if (item.listing) {
          (item.listing as any).images = normalizeImages((item.listing as any).images);
        }
      }

      const revenue = allItems.reduce((s, i) => s + i.quantity * Number(i.unit_price), 0);
      const uniqueOrders = new Set(allItems.map((i) => i.order_id)).size;
      const pendingShip = allItems.filter(
        (i) => i.fulfillment_status === "pending" || i.fulfillment_status === "confirmed",
      ).length;

      setStats({
        revenue,
        totalOrders: uniqueOrders,
        activeListings: activeLCount ?? 0,
        pendingShipments: pendingShip,
      });
      setRecentOrders(allItems.slice(0, 5));
    } catch {
      /* silent */
    }
  }, [userId]);

  const loadMyAuctions = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from("auction_items")
        .select(`
          id, card_name, edition, grade, starting_price, current_bid,
          bid_count, images, ends_at, status, winner_id, created_at,
          winner:profiles!winner_id(username, display_name)
        `)
        .eq("seller_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setMyAuctions(
        (data ?? []).map((r: any) => ({
          ...r,
          winner: Array.isArray(r.winner) ? r.winner[0] : r.winner,
        })),
      );
    } catch (e) {
      showToast(errMsg(e, "Failed to load auctions"));
    }
  }, [userId]);

  // ── Initial Load ──

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadStore();
      setLoading(false);
    })();
  }, [loadStore]);

  useEffect(() => {
    if (!userId) return;
    loadOverview();
    loadOrderItems();
    loadMyAuctions();
  }, [userId, loadOverview, loadOrderItems, loadMyAuctions]);

  useEffect(() => {
    if (store?.id) {
      loadDisplayItems();
      loadMyListings();
    }
  }, [store?.id, loadDisplayItems, loadMyListings]);

  // ── Order Fulfillment ──

  function nextFulfillmentStatus(current: FulfillmentStatus): FulfillmentStatus | null {
    if (current === "pending") return "confirmed";
    if (current === "confirmed") return "shipped";
    if (current === "shipped") return "delivered";
    return null;
  }

  function nextFulfillmentLabel(current: FulfillmentStatus): string {
    if (current === "pending") return "Confirm Order";
    if (current === "confirmed") return "Mark Shipped";
    if (current === "shipped") return "Mark Delivered";
    return "";
  }

  function nextFulfillmentColor(current: FulfillmentStatus): string {
    if (current === "pending") return C.accent;
    if (current === "confirmed") return "#8B5CF6";
    if (current === "shipped") return C.success;
    return C.accent;
  }

  async function updateFulfillment(itemId: string, newStatus: FulfillmentStatus) {
    setUpdatingOrderId(itemId);
    try {
      const { error } = await supabase
        .from("order_items")
        .update({ fulfillment_status: newStatus })
        .eq("id", itemId);
      if (error) throw error;

      setOrderItems((prev) =>
        prev.map((oi) => (oi.id === itemId ? { ...oi, fulfillment_status: newStatus } : oi)),
      );
      setRecentOrders((prev) =>
        prev.map((oi) => (oi.id === itemId ? { ...oi, fulfillment_status: newStatus } : oi)),
      );

      if (newStatus === "confirmed" || newStatus === "shipped" || newStatus === "delivered") {
        setStats((prev) => ({
          ...prev,
          pendingShipments: Math.max(0, prev.pendingShipments - (newStatus === "shipped" || newStatus === "delivered" ? 1 : 0)),
        }));
      }

      showToast(`Order ${FULFILLMENT_CONFIG[newStatus].label.toLowerCase()}`);
    } catch (e) {
      showToast(errMsg(e, "Failed to update order"));
    } finally {
      setUpdatingOrderId(null);
    }
  }

  // ── Store Actions ──

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
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
        gif: "image/gif", webp: "image/webp",
      };
      const contentType = mimeTypes[ext] ?? "image/jpeg";
      const filePath = `${user!.id}/${type}-${Date.now()}.${ext}`;
      const resp = await fetch(localUri);
      const arrayBuf = await resp.arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from("vendor-assets")
        .upload(filePath, arrayBuf, { upsert: true, contentType });
      if (uploadError) throw uploadError;
      return supabase.storage.from("vendor-assets").getPublicUrl(filePath).data.publicUrl;
    }

    let finalLogoUrl = logoUrl.trim() || null;
    let finalBannerUrl = bannerUrl.trim() || null;

    try {
      if (logoLocalUri || bannerLocalUri) setUploadingImage(true);
      if (logoLocalUri) finalLogoUrl = await uploadImage(logoLocalUri, "logo");
      if (bannerLocalUri) finalBannerUrl = await uploadImage(bannerLocalUri, "banner");
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
      const { error } = await supabase.from("vendor_stores").update(payload).eq("id", store.id);
      if (error) { setSaving(false); setUploadingImage(false); showToast(errMsg(error, "Failed to update store")); return; }
    } else {
      const { error } = await supabase.from("vendor_stores").insert({ ...payload, profile_id: user.id });
      if (error) { setSaving(false); setUploadingImage(false); showToast(errMsg(error, "Failed to create store")); return; }
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
    if (!permission.granted) { showToast("Photo access is required"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.9,
      aspect: type === "logo" ? [1, 1] : [16, 9],
    });
    if (result.canceled) return;
    const uri = result.assets[0]?.uri;
    if (!uri) return;
    if (type === "logo") setLogoLocalUri(uri);
    else setBannerLocalUri(uri);
  }

  // ── Display Item Actions ──

  async function addDisplayItem(listingId: string) {
    if (!store?.id) return;
    if (displayItems.length >= 10) { showToast("Maximum 10 display items"); return; }
    if (displayItems.some((d) => d.listing_id === listingId)) { showToast("Already in display"); return; }

    const { error } = await supabase.from("vendor_display_items").insert({
      store_id: store.id, listing_id: listingId, display_order: displayItems.length + 1,
    });
    if (error) { showToast(errMsg(error, "Failed to add display item")); return; }
    await loadDisplayItems();
    showToast("Added to display");
  }

  async function removeDisplayItem(itemId: string) {
    const { error } = await supabase.from("vendor_display_items").delete().eq("id", itemId);
    if (error) { showToast(errMsg(error, "Failed to remove display item")); return; }
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

  // ── Listing Editor ──

  function startEditListing(item: VendorListing) {
    setEditingListingId(item.id);
    setEditName(item.card_name);
    setEditEdition(item.edition ?? "");
    setEditGrade(item.grade ?? "");
    setEditCondition(item.condition ?? "");
    setEditPrice(String(item.price));
    setEditQuantity(String(item.quantity));
  }

  function cancelEditListing() {
    setEditingListingId(null);
    setEditName(""); setEditEdition(""); setEditGrade("");
    setEditCondition(""); setEditPrice(""); setEditQuantity("");
  }

  async function saveListingEdits(listingId: string) {
    const parsed = Number(editPrice);
    const parsedQty = parseInt(editQuantity, 10);
    if (!editName.trim()) { showToast("Card name is required"); return; }
    if (!Number.isFinite(parsed) || parsed <= 0) { showToast("Enter a valid price"); return; }
    if (isNaN(parsedQty) || parsedQty < 0) { showToast("Enter a valid quantity"); return; }

    setSavingListing(true);
    const { error } = await supabase.from("listings").update({
      card_name: editName.trim(),
      edition: editEdition.trim() || null,
      grade: editGrade.trim() || null,
      condition: editCondition.trim() || null,
      price: parsed,
      quantity: parsedQty,
      updated_at: new Date().toISOString(),
    }).eq("id", listingId);

    setSavingListing(false);
    if (error) { showToast(errMsg(error, "Failed to update listing")); return; }
    await loadMyListings();
    await loadDisplayItems();
    cancelEditListing();
    showToast("Listing updated");
  }

  async function removeListing(item: VendorListing) {
    Alert.alert(
      "Remove listing?",
      "This will remove it from your store, but keep order history.",
      [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await supabase.from("vendor_display_items").delete().eq("listing_id", item.id);
          const { error } = await supabase
            .from("listings")
            .update({ status: "removed", updated_at: new Date().toISOString() })
            .eq("id", item.id);
          if (error) { showToast(errMsg(error, "Failed to remove listing")); return; }
          if (editingListingId === item.id) cancelEditListing();
          await loadMyListings();
          await loadDisplayItems();
          showToast("Listing removed");
        },
      },
    ]);
  }

  // ── Auction Actions ──

  async function cancelAuction(auction: VendorAuction) {
    if ((auction.bid_count ?? 0) > 0) {
      Alert.alert("Cannot Cancel", "This auction already has bids and cannot be cancelled.");
      return;
    }
    Alert.alert("Cancel Auction?", "This will permanently cancel the auction.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel Auction",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from("auction_items")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("id", auction.id);
          if (error) { showToast(errMsg(error, "Failed to cancel auction")); return; }
          await loadMyAuctions();
          showToast("Auction cancelled");
        },
      },
    ]);
  }

  const filteredAuctions =
    auctionFilter === "all"
      ? myAuctions
      : myAuctions.filter((a) => a.status === auctionFilter);

  // ── Filtered orders ──

  const filteredOrders =
    orderFilter === "all"
      ? orderItems
      : orderItems.filter((oi) => oi.fulfillment_status === orderFilter);

  // ── Render ──

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
              size={15}
              color={tab === t.id ? C.accent : C.textMuted}
            />
            <Text style={[vh.tabLabel, tab === t.id && vh.tabLabelActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ═══════════════ OVERVIEW TAB ═══════════════ */}
      {tab === "overview" && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={vh.content}>
          {/* Stats Grid */}
          <View style={vh.statsGrid}>
            <View style={vh.statCard}>
              <View style={vh.statIconRow}>
                <View style={[vh.statIconWrap, { backgroundColor: "rgba(34,197,94,0.12)" }]}>
                  <Ionicons name="cash-outline" size={16} color={C.success} />
                </View>
              </View>
              <Text style={vh.statValue}>{formatCurrency(stats.revenue)}</Text>
              <Text style={vh.statLabel}>Total Revenue</Text>
            </View>
            <View style={vh.statCard}>
              <View style={vh.statIconRow}>
                <View style={[vh.statIconWrap, { backgroundColor: C.accentGlow }]}>
                  <Ionicons name="receipt-outline" size={16} color={C.accent} />
                </View>
              </View>
              <Text style={vh.statValue}>{stats.totalOrders}</Text>
              <Text style={vh.statLabel}>Total Orders</Text>
            </View>
            <View style={vh.statCard}>
              <View style={vh.statIconRow}>
                <View style={[vh.statIconWrap, { backgroundColor: "rgba(139,92,246,0.12)" }]}>
                  <Ionicons name="pricetag-outline" size={16} color="#8B5CF6" />
                </View>
              </View>
              <Text style={vh.statValue}>{stats.activeListings}</Text>
              <Text style={vh.statLabel}>Active Listings</Text>
            </View>
            <View style={vh.statCard}>
              <View style={vh.statIconRow}>
                <View style={[vh.statIconWrap, { backgroundColor: "rgba(245,158,11,0.12)" }]}>
                  <Ionicons name="cube-outline" size={16} color="#F59E0B" />
                </View>
              </View>
              <Text style={vh.statValue}>{stats.pendingShipments}</Text>
              <Text style={vh.statLabel}>Needs Shipping</Text>
            </View>
          </View>

          {/* Quick Actions */}
          <View style={vh.quickActions}>
            <Pressable
              style={[vh.quickBtn, vh.quickBtnPrimary]}
              onPress={() => push({ type: "CREATE_LISTING" })}
            >
              <Feather name="plus" size={16} color="#fff" />
              <Text style={[vh.quickBtnText, vh.quickBtnTextPrimary]}>New Listing</Text>
            </Pressable>
            {store && (
              <Pressable
                style={vh.quickBtn}
                onPress={() => push({ type: "VENDOR_STORE_PAGE", storeId: store.id })}
              >
                <Ionicons name="eye-outline" size={16} color={C.textPrimary} />
                <Text style={vh.quickBtnText}>View Store</Text>
              </Pressable>
            )}
          </View>

          {/* Recent Orders */}
          <View style={vh.recentOrdersSection}>
            <Text style={vh.sectionTitle}>Recent Orders</Text>
            {recentOrders.length === 0 ? (
              <View style={vh.emptyCard}>
                <Ionicons name="receipt-outline" size={28} color={C.textMuted} />
                <Text style={vh.emptyTitle}>No orders yet</Text>
                <Text style={vh.emptySub}>Orders from buyers will appear here</Text>
              </View>
            ) : (
              recentOrders.map((oi) => {
                const cfg = FULFILLMENT_CONFIG[oi.fulfillment_status];
                const imgUrl = oi.listing?.images?.[0];
                return (
                  <View key={oi.id} style={vh.recentOrderCard}>
                    <View style={vh.recentOrderThumb}>
                      {imgUrl ? (
                        <Image source={{ uri: imgUrl }} style={vh.recentOrderThumbImg} />
                      ) : (
                        <Ionicons name="image-outline" size={16} color={C.textMuted} />
                      )}
                    </View>
                    <View style={vh.recentOrderInfo}>
                      <Text style={vh.recentOrderName} numberOfLines={1}>
                        {oi.listing?.card_name ?? "Item"}
                      </Text>
                      <Text style={vh.recentOrderMeta}>
                        {oi.order?.buyer?.display_name ?? oi.order?.buyer?.username ?? "Buyer"}
                        {" · "}{relativeTime(oi.created_at)}
                      </Text>
                    </View>
                    <View style={vh.recentOrderRight}>
                      <Text style={vh.recentOrderPrice}>
                        {formatCurrency(oi.quantity * Number(oi.unit_price))}
                      </Text>
                      <View style={[vh.fulfillmentChip, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                        <Ionicons name={cfg.icon as any} size={10} color={cfg.color} />
                        <Text style={[vh.fulfillmentChipText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}

      {/* ═══════════════ ORDERS TAB ═══════════════ */}
      {tab === "orders" && (
        <View style={{ flex: 1 }}>
          {/* Status Filters */}
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={vh.filterRow}
            style={{ flexGrow: 0 }}
          >
            {ORDER_FILTERS.map((f) => (
              <Pressable
                key={f.id}
                style={[vh.filterChip, orderFilter === f.id && vh.filterChipActive]}
                onPress={() => setOrderFilter(f.id)}
              >
                <Text style={[vh.filterChipText, orderFilter === f.id && vh.filterChipTextActive]}>
                  {f.label}
                  {f.id !== "all" && (
                    ` (${orderItems.filter((oi) => oi.fulfillment_status === f.id).length})`
                  )}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {filteredOrders.length === 0 ? (
            <View style={[vh.emptyCard, { marginHorizontal: S.screenPadding, marginTop: S.lg }]}>
              <Ionicons name="receipt-outline" size={32} color={C.textMuted} />
              <Text style={vh.emptyTitle}>
                {orderFilter === "all" ? "No orders yet" : `No ${orderFilter} orders`}
              </Text>
              <Text style={vh.emptySub}>
                {orderFilter === "all"
                  ? "When buyers purchase your items, orders appear here"
                  : "Try a different filter to see orders"}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredOrders}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingHorizontal: S.screenPadding, paddingBottom: 40 }}
              initialNumToRender={10}
              maxToRenderPerBatch={8}
              windowSize={5}
              removeClippedSubviews
              renderItem={({ item: oi }) => {
                const cfg = FULFILLMENT_CONFIG[oi.fulfillment_status];
                const nextStatus = nextFulfillmentStatus(oi.fulfillment_status);
                const imgUrl = oi.listing?.images?.[0];
                const buyerName =
                  oi.order?.buyer?.display_name ?? oi.order?.buyer?.username ?? "Buyer";

                return (
                  <View style={vh.orderCard}>
                    <View style={vh.orderCardHeader}>
                      <Text style={vh.orderIdText}>
                        Order #{oi.order_id.slice(0, 8).toUpperCase()}
                      </Text>
                      <Text style={vh.orderDateText}>{relativeTime(oi.created_at)}</Text>
                    </View>

                    <View style={vh.orderCardBody}>
                      <View style={vh.orderItemThumb}>
                        {imgUrl ? (
                          <Image source={{ uri: imgUrl }} style={vh.orderItemThumbImg} />
                        ) : (
                          <Ionicons name="image-outline" size={18} color={C.textMuted} />
                        )}
                      </View>
                      <View style={vh.orderItemInfo}>
                        <Text style={vh.orderItemName} numberOfLines={1}>
                          {oi.listing?.card_name ?? "Item"}
                        </Text>
                        <Text style={vh.orderItemMeta}>
                          {oi.listing?.edition ?? ""}
                          {oi.listing?.grade ? ` · ${oi.listing.grade}` : ""}
                        </Text>
                        <View style={vh.orderBuyerRow}>
                          <View style={vh.orderBuyerDot} />
                          <Text style={vh.orderBuyerName}>@{buyerName}</Text>
                        </View>
                      </View>
                      <View style={vh.orderItemRight}>
                        <Text style={vh.orderItemPrice}>
                          {formatCurrency(oi.quantity * Number(oi.unit_price))}
                        </Text>
                        <Text style={vh.orderItemQty}>Qty: {oi.quantity}</Text>
                      </View>
                    </View>

                    <View style={vh.orderCardFooter}>
                      <View style={[vh.fulfillmentChip, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                        <Ionicons name={cfg.icon as any} size={11} color={cfg.color} />
                        <Text style={[vh.fulfillmentChipText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                      <View style={{ flex: 1 }} />
                      {oi.fulfillment_status === "pending" && (
                        <Pressable
                          style={[vh.fulfillmentBtn, { backgroundColor: "rgba(239,68,68,0.85)" }]}
                          onPress={() => {
                            Alert.alert("Cancel Order?", "This will cancel the order for the buyer.", [
                              { text: "Keep", style: "cancel" },
                              { text: "Cancel Order", style: "destructive", onPress: () => updateFulfillment(oi.id, "cancelled") },
                            ]);
                          }}
                          disabled={updatingOrderId === oi.id}
                        >
                          <Feather name="x" size={14} color="#fff" />
                          <Text style={vh.fulfillmentBtnText}>Cancel</Text>
                        </Pressable>
                      )}
                      {nextStatus && (
                        <Pressable
                          style={[vh.fulfillmentBtn, { backgroundColor: nextFulfillmentColor(oi.fulfillment_status) }]}
                          onPress={() => updateFulfillment(oi.id, nextStatus)}
                          disabled={updatingOrderId === oi.id}
                        >
                          {updatingOrderId === oi.id ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <>
                              <Ionicons
                                name={(
                                  oi.fulfillment_status === "pending"
                                    ? "checkmark-circle"
                                    : oi.fulfillment_status === "confirmed"
                                      ? "airplane"
                                      : "checkmark-done-circle"
                                ) as any}
                                size={14}
                                color="#fff"
                              />
                              <Text style={vh.fulfillmentBtnText}>
                                {nextFulfillmentLabel(oi.fulfillment_status)}
                              </Text>
                            </>
                          )}
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

      {/* ═══════════════ LISTINGS TAB ═══════════════ */}
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
              initialNumToRender={10}
              maxToRenderPerBatch={8}
              windowSize={5}
              removeClippedSubviews
              renderItem={({ item }) => {
                const isDisplayed = displayItems.some((d) => d.listing_id === item.id);
                const isEditing = editingListingId === item.id;
                return (
                  <View style={vh.listingCardWrap}>
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
                          {item.edition ?? ""} {item.grade ? `· ${item.grade}` : ""}
                          {item.condition ? ` · ${item.condition}` : ""}
                        </Text>
                        <Text style={vh.listingPrice}>
                          {formatCurrency(Number(item.price))}
                          <Text style={vh.listingQty}>  ·  Qty: {item.quantity}</Text>
                        </Text>
                      </View>
                      <View style={vh.listingActions}>
                        <View style={[vh.statusChip, item.status === "active" ? vh.statusActive : vh.statusInactive]}>
                          <Text style={[vh.statusText, item.status === "active" ? vh.statusTextActive : vh.statusTextInactive]}>
                            {formatListingStatus(item.status)}
                          </Text>
                        </View>
                        <View style={vh.rowActionButtons}>
                          <Pressable onPress={() => startEditListing(item)} style={vh.listingActionBtn} hitSlop={8}>
                            <Feather name="edit-2" size={12} color={C.textPrimary} />
                            <Text style={vh.listingActionBtnText}>Edit</Text>
                          </Pressable>
                          <Pressable onPress={() => removeListing(item)} style={vh.listingActionBtn} hitSlop={8}>
                            <Feather name="trash-2" size={12} color={C.danger} />
                            <Text style={[vh.listingActionBtnText, vh.listingActionBtnDangerText]}>Delete</Text>
                          </Pressable>
                        </View>
                        {store && (
                          <Pressable
                            onPress={() =>
                              isDisplayed
                                ? removeDisplayItem(displayItems.find((d) => d.listing_id === item.id)!.id)
                                : addDisplayItem(item.id)
                            }
                            style={[vh.displayToggle, isDisplayed && vh.displayToggleActive]}
                            hitSlop={8}
                          >
                            <Feather name="star" size={14} color={isDisplayed ? "#F59E0B" : C.textMuted} />
                            <Text style={[vh.displayToggleText, isDisplayed && vh.displayToggleTextActive]}>
                              {isDisplayed ? "Featured" : "Feature"}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                    {isEditing && (
                      <View style={vh.listingEditor}>
                        <TextInput
                          style={vh.editorInput}
                          value={editName}
                          onChangeText={setEditName}
                          placeholder="Card name"
                          placeholderTextColor={C.textMuted}
                        />
                        <View style={vh.editorRow}>
                          <TextInput
                            style={[vh.editorInput, vh.editorHalf]}
                            value={editEdition}
                            onChangeText={setEditEdition}
                            placeholder="Edition"
                            placeholderTextColor={C.textMuted}
                          />
                          <TextInput
                            style={[vh.editorInput, vh.editorHalf]}
                            value={editGrade}
                            onChangeText={setEditGrade}
                            placeholder="Grade"
                            placeholderTextColor={C.textMuted}
                          />
                        </View>
                        <View style={vh.editorRow}>
                          <TextInput
                            style={[vh.editorInput, vh.editorHalf]}
                            value={editCondition}
                            onChangeText={setEditCondition}
                            placeholder="Condition"
                            placeholderTextColor={C.textMuted}
                          />
                          <TextInput
                            style={[vh.editorInput, vh.editorHalf]}
                            value={editPrice}
                            onChangeText={setEditPrice}
                            placeholder="Price"
                            keyboardType="numeric"
                            placeholderTextColor={C.textMuted}
                          />
                        </View>
                        <TextInput
                          style={vh.editorInput}
                          value={editQuantity}
                          onChangeText={setEditQuantity}
                          placeholder="Quantity"
                          keyboardType="number-pad"
                          placeholderTextColor={C.textMuted}
                        />
                        <View style={vh.editorActions}>
                          <Pressable style={vh.editorCancelBtn} onPress={cancelEditListing} disabled={savingListing}>
                            <Text style={vh.editorCancelText}>Cancel</Text>
                          </Pressable>
                          <Pressable
                            style={vh.editorSaveBtn}
                            onPress={() => saveListingEdits(item.id)}
                            disabled={savingListing}
                          >
                            {savingListing ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Text style={vh.editorSaveText}>Save</Text>
                            )}
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>
      )}

      {/* ═══════════════ AUCTIONS TAB ═══════════════ */}
      {tab === "auctions" && (
        <View style={{ flex: 1 }}>
          <View style={vh.listingsHeader}>
            <Text style={vh.sectionTitle}>My Auctions</Text>
            <Pressable
              style={vh.newListingBtn}
              onPress={() => push({ type: "CREATE_AUCTION" })}
            >
              <Feather name="plus" size={16} color="#fff" />
              <Text style={vh.newListingBtnText}>New Auction</Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={vh.filterRow}
            style={{ flexGrow: 0 }}
          >
            {(["all", "active", "ended", "cancelled"] as const).map((f) => (
              <Pressable
                key={f}
                style={[vh.filterChip, auctionFilter === f && vh.filterChipActive]}
                onPress={() => setAuctionFilter(f)}
              >
                <Text style={[vh.filterChipText, auctionFilter === f && vh.filterChipTextActive]}>
                  {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                  {f !== "all" && ` (${myAuctions.filter((a) => a.status === f).length})`}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {filteredAuctions.length === 0 ? (
            <View style={[vh.emptyCard, { marginHorizontal: S.screenPadding, marginTop: S.lg }]}>
              <Ionicons name="hammer-outline" size={32} color={C.textMuted} />
              <Text style={vh.emptyTitle}>
                {auctionFilter === "all" ? "No auctions yet" : `No ${auctionFilter} auctions`}
              </Text>
              <Text style={vh.emptySub}>Create an auction to start selling via bidding</Text>
            </View>
          ) : (
            <FlatList
              data={filteredAuctions}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingHorizontal: S.screenPadding, paddingBottom: 40 }}
              initialNumToRender={10}
              maxToRenderPerBatch={8}
              windowSize={5}
              removeClippedSubviews
              renderItem={({ item: auction }) => {
                const imgs = normalizeImages(auction.images);
                const isActive = auction.status === "active";
                const isEnded = auction.status === "ended";
                const diff = new Date(auction.ends_at).getTime() - Date.now();
                const timeStr =
                  !isActive
                    ? auction.status.charAt(0).toUpperCase() + auction.status.slice(1)
                    : diff <= 0
                      ? "Ending..."
                      : diff < 3600000
                        ? `${Math.floor(diff / 60000)}m left`
                        : diff < 86400000
                          ? `${Math.floor(diff / 3600000)}h left`
                          : `${Math.floor(diff / 86400000)}d left`;

                return (
                  <Pressable
                    style={vh.orderCard}
                    onPress={() => push({ type: "AUCTION_DETAIL", auctionId: auction.id })}
                  >
                    <View style={vh.orderCardBody}>
                      <View style={vh.orderItemThumb}>
                        {imgs[0] ? (
                          <Image source={{ uri: imgs[0] }} style={vh.orderItemThumbImg} />
                        ) : (
                          <Ionicons name="image-outline" size={18} color={C.textMuted} />
                        )}
                      </View>
                      <View style={vh.orderItemInfo}>
                        <Text style={vh.orderItemName} numberOfLines={1}>{auction.card_name}</Text>
                        <Text style={vh.orderItemMeta}>
                          {auction.edition ?? ""}
                          {auction.grade ? ` · ${auction.grade}` : ""}
                        </Text>
                        <Text style={vh.orderItemMeta}>
                          {auction.bid_count ?? 0} bid{(auction.bid_count ?? 0) !== 1 ? "s" : ""}
                          {" · "}{timeStr}
                        </Text>
                      </View>
                      <View style={vh.orderItemRight}>
                        <Text style={vh.orderItemPrice}>
                          {auction.current_bid
                            ? formatCurrency(auction.current_bid)
                            : formatCurrency(auction.starting_price)}
                        </Text>
                        <View
                          style={[
                            vh.fulfillmentChip,
                            {
                              backgroundColor: isActive
                                ? C.successBg
                                : isEnded
                                  ? C.accentGlow
                                  : "rgba(239,68,68,0.08)",
                              borderColor: isActive
                                ? "rgba(34,197,94,0.3)"
                                : isEnded
                                  ? C.borderStream
                                  : "rgba(239,68,68,0.25)",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              vh.fulfillmentChipText,
                              {
                                color: isActive
                                  ? C.success
                                  : isEnded
                                    ? C.textAccent
                                    : C.danger,
                              },
                            ]}
                          >
                            {auction.status.charAt(0).toUpperCase() + auction.status.slice(1)}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {isEnded && auction.winner && (
                      <View style={[vh.orderCardFooter, { gap: 6, paddingTop: 8 }]}>
                        <Ionicons name="trophy" size={13} color="#F59E0B" />
                        <Text style={[vh.fulfillmentChipText, { color: "#F59E0B" }]}>
                          Winner: {auction.winner.display_name ?? auction.winner.username ?? "—"}
                        </Text>
                      </View>
                    )}

                    {isActive && (auction.bid_count ?? 0) === 0 && (
                      <View style={vh.orderCardFooter}>
                        <View style={{ flex: 1 }} />
                        <Pressable
                          style={[vh.fulfillmentBtn, { backgroundColor: C.danger }]}
                          onPress={() => cancelAuction(auction)}
                        >
                          <Feather name="x" size={14} color="#fff" />
                          <Text style={vh.fulfillmentBtnText}>Cancel</Text>
                        </Pressable>
                      </View>
                    )}
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      )}

      {/* ═══════════════ STORE TAB ═══════════════ */}
      {tab === "store" && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={vh.content}>
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

          {/* Store Details Form */}
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
                  {logoLocalUri ? "Logo selected" : logoUrl ? "Change logo" : "Upload logo"}
                </Text>
              </Pressable>
            </View>
            <View style={vh.field}>
              <Text style={vh.label}>Store Banner</Text>
              <Pressable style={vh.uploadBtn} onPress={() => pickImage("banner")}>
                <Feather name="image" size={16} color={C.textPrimary} />
                <Text style={vh.uploadBtnText}>
                  {bannerLocalUri ? "Banner selected" : bannerUrl ? "Change banner" : "Upload banner"}
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
                style={[vh.colorDot, { backgroundColor: color }, themeColor === color && vh.colorDotActive]}
              >
                {themeColor === color && <Feather name="check" size={14} color="#fff" />}
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
                {uploadingImage ? "Uploading images..." : store ? "Update Store" : "Create Store"}
              </Text>
            )}
          </Pressable>

          {/* Display Items section inside Store tab */}
          <View style={vh.displayHeader}>
            <Text style={vh.sectionTitle}>Display Items</Text>
            <Text style={vh.displayCount}>{displayItems.length}/10</Text>
          </View>
          <Text style={vh.displayHint}>
            Featured listings shown on your store page. Manage from the Listings tab.
          </Text>

          {!store ? (
            <View style={vh.emptyCard}>
              <Ionicons name="storefront-outline" size={28} color={C.textMuted} />
              <Text style={vh.emptyTitle}>Create your store first</Text>
              <Text style={vh.emptySub}>Save your store details above to get started</Text>
            </View>
          ) : displayItems.length === 0 ? (
            <View style={vh.emptyCard}>
              <Ionicons name="grid-outline" size={28} color={C.textMuted} />
              <Text style={vh.emptyTitle}>No display items</Text>
              <Text style={vh.emptySub}>Feature listings from the Listings tab</Text>
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
                    {item.listing?.grade ? `· ${item.listing.grade}` : ""}
                  </Text>
                  <Text style={vh.displayPrice}>
                    {item.listing ? `RM${Number(item.listing.price).toLocaleString("en-MY", { maximumFractionDigits: 0 })}` : "—"}
                  </Text>
                </View>
                <View style={vh.displayActions}>
                  <Pressable
                    onPress={() => moveDisplayItem(item.id, "up")}
                    style={[vh.miniBtn, idx === 0 && vh.miniBtnDisabled]}
                    disabled={idx === 0}
                    hitSlop={8}
                  >
                    <Feather name="chevron-up" size={14} color={idx === 0 ? C.textMuted : C.textPrimary} />
                  </Pressable>
                  <Pressable
                    onPress={() => moveDisplayItem(item.id, "down")}
                    style={[vh.miniBtn, idx === displayItems.length - 1 && vh.miniBtnDisabled]}
                    disabled={idx === displayItems.length - 1}
                    hitSlop={8}
                  >
                    <Feather name="chevron-down" size={14} color={idx === displayItems.length - 1 ? C.textMuted : C.textPrimary} />
                  </Pressable>
                  <Pressable
                    onPress={() => removeDisplayItem(item.id)}
                    style={vh.miniBtn}
                    hitSlop={8}
                  >
                    <Feather name="x" size={14} color={C.danger} />
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </ScrollView>
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
