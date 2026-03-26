import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { C, S } from "../theme";
import { supabase } from "../lib/supabase";
import { useAppNavigation } from "../navigation/NavigationContext";

type ViewId = "home" | "orders" | "listings" | "auctions" | "store";

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
  views: number;
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
  tracking_number: string | null;
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
  source?: "market" | "auction";
};

type VendorAuction = {
  id: string;
  card_name: string;
  edition: string | null;
  grade: string | null;
  starting_price: number;
  current_bid: number | null;
  bid_count: number;
  watchers: number;
  views: number;
  images: string[] | null;
  ends_at: string;
  status: string;
  winner_id: string | null;
  created_at: string;
  winner?: { username: string | null; display_name: string | null } | null;
};

const FULFILLMENT_CONFIG: Record<
  FulfillmentStatus,
  { label: string; icon: string; bg: string; border: string; color: string }
> = {
  pending: { label: "Unpaid", icon: "time-outline", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", color: "#F59E0B" },
  confirmed: { label: "To Ship", icon: "cube-outline", bg: "rgba(44,128,255,0.08)", border: "rgba(44,128,255,0.25)", color: C.accent },
  shipped: { label: "Shipping", icon: "airplane-outline", bg: "rgba(139,92,246,0.08)", border: "rgba(139,92,246,0.25)", color: "#8B5CF6" },
  delivered: { label: "Completed", icon: "checkmark-done-circle-outline", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.25)", color: C.success },
  cancelled: { label: "Cancelled", icon: "close-circle-outline", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", color: "#EF4444" },
  refunded: { label: "Refunded", icon: "receipt-outline", bg: "rgba(107,114,128,0.08)", border: "rgba(107,114,128,0.25)", color: "#6B7280" },
};

const ORDER_TABS: { id: FulfillmentStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Unpaid" },
  { id: "confirmed", label: "To Ship" },
  { id: "shipped", label: "Shipping" },
  { id: "delivered", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

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
    } catch { /* */ }
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

export default function VendorHubScreen({ onBack }: { onBack: () => void }) {
  const { push } = useAppNavigation();
  const [userId, setUserId] = useState<string | null>(null);
  const [view, setView] = useState<ViewId>("home");

  const [store, setStore] = useState<VendorStore | null>(null);
  const [displayItems, setDisplayItems] = useState<DisplayItem[]>([]);
  const [myListings, setMyListings] = useState<VendorListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const [orderItems, setOrderItems] = useState<SellerOrderItem[]>([]);
  const [orderFilter, setOrderFilter] = useState<FulfillmentStatus | "all">("all");
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  const [storeName, setStoreName] = useState("");
  const [storeDesc, setStoreDesc] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [logoLocalUri, setLogoLocalUri] = useState<string | null>(null);
  const [bannerLocalUri, setBannerLocalUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [themeColor, setThemeColor] = useState("#2C80FF");

  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEdition, setEditEdition] = useState("");
  const [editGrade, setEditGrade] = useState("");
  const [editCondition, setEditCondition] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [savingListing, setSavingListing] = useState(false);

  const [myAuctions, setMyAuctions] = useState<VendorAuction[]>([]);
  const [auctionFilter, setAuctionFilter] = useState<"all" | "active" | "ended" | "cancelled">("active");
  const [listingFilter, setListingFilter] = useState<"all" | "active" | "sold" | "paused" | "draft">("active");

  // Sold counts per listing (from order_items)
  const [soldCounts, setSoldCounts] = useState<Record<string, number>>({});

  // Tracking number modal
  const [shipModalItemId, setShipModalItemId] = useState<string | null>(null);
  const [trackingInput, setTrackingInput] = useState("");

  // Computed order counts for dashboard
  const orderCounts = {
    confirmed: orderItems.filter((oi) => oi.fulfillment_status === "confirmed").length,
    shipped: orderItems.filter((oi) => oi.fulfillment_status === "shipped").length,
    cancelled: orderItems.filter((oi) => oi.fulfillment_status === "cancelled").length,
    pending: orderItems.filter((oi) => oi.fulfillment_status === "pending").length,
  };

  const totalRevenue = orderItems.reduce((s, i) => s + i.quantity * Number(i.unit_price), 0);
  const activeListingCount = myListings.filter((l) => l.status === "active").length;

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
        .select("id, card_name, edition, grade, condition, price, quantity, images, status, views, created_at")
        .eq("seller_id", user.id)
        .neq("status", "removed")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setMyListings((data ?? []) as VendorListing[]);

      const listingIds = (data ?? []).map((l: any) => l.id);
      if (listingIds.length > 0) {
        const { data: oiData } = await supabase
          .from("order_items")
          .select("listing_id, quantity")
          .in("listing_id", listingIds);
        const counts: Record<string, number> = {};
        for (const row of oiData ?? []) {
          counts[(row as any).listing_id] = (counts[(row as any).listing_id] ?? 0) + ((row as any).quantity ?? 1);
        }
        setSoldCounts(counts);
      }
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
          id, order_id, listing_id, quantity, unit_price, fulfillment_status, tracking_number, created_at,
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
        source: "market",
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

      // Paid auction wins now create real order_items via the RPC, so they
      // appear in the market order query above. Only show unpaid wins as
      // synthetic "Unpaid" rows so the vendor can see awaiting-payment items.
      const { data: wins } = await supabase
        .from("auction_wins")
        .select(`
          id, winner_id, seller_id, winning_bid, payment_status, created_at,
          auction:auction_items!auction_id(id, card_name, edition, grade, condition, images),
          winner:profiles!winner_id(username, display_name)
        `)
        .eq("seller_id", userId)
        .eq("payment_status", "pending")
        .order("created_at", { ascending: false })
        .limit(100);

      const auctionMapped: SellerOrderItem[] = (wins ?? []).map((row: any) => {
        const auction = Array.isArray(row.auction) ? row.auction[0] : row.auction;
        const winner = Array.isArray(row.winner) ? row.winner[0] : row.winner;
        return {
          id: `auction-${row.id}`,
          order_id: `auction-${row.id}`,
          listing_id: auction?.id ?? "",
          quantity: 1,
          unit_price: Number(row.winning_bid),
          fulfillment_status: "pending" as FulfillmentStatus,
          created_at: row.created_at,
          tracking_number: null,
          listing: auction
            ? { card_name: auction.card_name, edition: auction.edition, grade: auction.grade ?? auction.condition ?? null, images: normalizeImages(auction.images) }
            : null,
          order: { id: `auction-${row.id}`, buyer_id: row.winner_id, total: Number(row.winning_bid), created_at: row.created_at, buyer: winner ?? null },
          source: "auction",
        };
      });

      // Hydrate real order_items that reference auction_items (listing_id → auction_items.id)
      const missingListingIds = [...new Set(mapped.filter((m) => !m.listing && !!m.listing_id).map((m) => m.listing_id))];
      if (missingListingIds.length > 0) {
        const { data: aiRows } = await supabase
          .from("auction_items")
          .select("id, card_name, edition, grade, condition, images")
          .in("id", missingListingIds);
        for (const a of aiRows ?? []) {
          const existing = mapped.find((m) => m.listing_id === (a as any).id && !m.listing);
          if (existing) {
            (existing as any).listing = {
              card_name: (a as any).card_name,
              edition: (a as any).edition ?? null,
              grade: (a as any).grade ?? (a as any).condition ?? null,
              images: normalizeImages((a as any).images),
            };
          }
        }
      }

      setOrderItems(
        [...mapped, ...auctionMapped].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      );
    } catch (e) {
      showToast(errMsg(e, "Failed to load orders"));
    }
  }, [userId]);

  const loadMyAuctions = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from("auction_items")
        .select(`
          id, card_name, edition, grade, starting_price, current_bid,
          bid_count, watchers, views, images, ends_at, status, winner_id, created_at,
          winner:profiles!winner_id(username, display_name)
        `)
        .eq("seller_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setMyAuctions(
        (data ?? []).map((r: any) => ({ ...r, winner: Array.isArray(r.winner) ? r.winner[0] : r.winner })),
      );
    } catch (e) {
      showToast(errMsg(e, "Failed to load auctions"));
    }
  }, [userId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadStore();
      setLoading(false);
    })();
  }, [loadStore]);

  useEffect(() => {
    if (!userId) return;
    loadOrderItems();
    loadMyAuctions();
  }, [userId, loadOrderItems, loadMyAuctions]);

  useEffect(() => {
    if (store?.id) {
      loadDisplayItems();
      loadMyListings();
    }
  }, [store?.id, loadDisplayItems, loadMyListings]);

  // ── Order Fulfillment ──
  // Vendor flow: confirmed → shipped (requires tracking number). Buyer handles delivered.

  function vendorNextAction(current: FulfillmentStatus): { label: string; color: string } | null {
    if (current === "confirmed") return { label: "Ship with Tracking", color: "#8B5CF6" };
    return null;
  }

  async function updateFulfillment(itemId: string, newStatus: FulfillmentStatus, extra?: Record<string, unknown>) {
    const target = orderItems.find((oi) => oi.id === itemId);
    if (!target || target.source === "auction") return;
    setUpdatingOrderId(itemId);
    try {
      const { error } = await supabase
        .from("order_items")
        .update({ fulfillment_status: newStatus, ...extra })
        .eq("id", itemId);
      if (error) throw error;
      setOrderItems((prev) =>
        prev.map((oi) => (oi.id === itemId ? { ...oi, fulfillment_status: newStatus, ...(extra as any) } : oi)),
      );
      showToast(`Order ${FULFILLMENT_CONFIG[newStatus].label.toLowerCase()}`);
    } catch (e) {
      showToast(errMsg(e, "Failed to update order"));
    } finally {
      setUpdatingOrderId(null);
    }
  }

  async function handleShipWithTracking() {
    const tn = trackingInput.trim();
    if (!tn) { showToast("Please enter a tracking number"); return; }
    if (!shipModalItemId) return;
    await updateFulfillment(shipModalItemId, "shipped", {
      tracking_number: tn,
      shipped_at: new Date().toISOString(),
    });
    setShipModalItemId(null);
    setTrackingInput("");
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
      setSaving(false); setUploadingImage(false);
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
    setSaving(false); setUploadingImage(false);
    setLogoLocalUri(null); setBannerLocalUri(null);
    showToast("Store saved successfully");
  }

  async function pickImage(type: "logo" | "banner") {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { showToast("Photo access is required"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], allowsEditing: true, quality: 0.9,
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
    setEditName(item.card_name); setEditEdition(item.edition ?? "");
    setEditGrade(item.grade ?? ""); setEditCondition(item.condition ?? "");
    setEditPrice(String(item.price)); setEditQuantity(String(item.quantity));
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
      card_name: editName.trim(), edition: editEdition.trim() || null,
      grade: editGrade.trim() || null, condition: editCondition.trim() || null,
      price: parsed, quantity: parsedQty, updated_at: new Date().toISOString(),
    }).eq("id", listingId);
    setSavingListing(false);
    if (error) { showToast(errMsg(error, "Failed to update listing")); return; }
    await loadMyListings(); await loadDisplayItems();
    cancelEditListing(); showToast("Listing updated");
  }

  async function removeListing(item: VendorListing) {
    Alert.alert("Remove listing?", "This will remove it from your store, but keep order history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          await supabase.from("vendor_display_items").delete().eq("listing_id", item.id);
          const { error } = await supabase.from("listings").update({ status: "removed", updated_at: new Date().toISOString() }).eq("id", item.id);
          if (error) { showToast(errMsg(error, "Failed to remove listing")); return; }
          if (editingListingId === item.id) cancelEditListing();
          await loadMyListings(); await loadDisplayItems();
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
        text: "Cancel Auction", style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("auction_items").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", auction.id);
          if (error) { showToast(errMsg(error, "Failed to cancel auction")); return; }
          await loadMyAuctions(); showToast("Auction cancelled");
        },
      },
    ]);
  }

  const filteredAuctions = auctionFilter === "all" ? myAuctions : myAuctions.filter((a) => a.status === auctionFilter);
  const filteredListings = listingFilter === "all" ? myListings : myListings.filter((l) => l.status === listingFilter);
  const filteredOrders = orderFilter === "all" ? orderItems : orderItems.filter((oi) => oi.fulfillment_status === orderFilter);

  const listingTabCounts = {
    active: myListings.filter((l) => l.status === "active").length,
    sold: myListings.filter((l) => l.status === "sold").length,
    paused: myListings.filter((l) => l.status === "paused").length,
    draft: myListings.filter((l) => l.status === "draft").length,
  };

  function goToOrders(filter?: FulfillmentStatus | "all") {
    if (filter) setOrderFilter(filter);
    setView("orders");
  }

  // ── Sub-view header ──
  function SubHeader({ title }: { title: string }) {
    return (
      <View style={st.subHeader}>
        <Pressable onPress={() => setView("home")} style={st.subBackBtn}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={st.subHeaderTitle}>{title}</Text>
        <View style={{ width: 36 }} />
      </View>
    );
  }

  // ── Loading ──

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <View style={st.center}><ActivityIndicator color={C.accent} size="large" /></View>
      </SafeAreaView>
    );
  }

  // ══════════════════ HOME / DASHBOARD ══════════════════
  if (view === "home") {
    return (
      <SafeAreaView style={st.safe}>
        <View style={st.header}>
          <Pressable onPress={onBack} style={st.backBtn}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>
          <Text style={st.headerTitle}>My Shop</Text>
          <Pressable onPress={() => setView("store")} style={st.headerIconBtn}>
            <Ionicons name="settings-outline" size={20} color={C.textPrimary} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.homeScroll}>
          {/* Store Profile Card */}
          <View style={st.storeCard}>
            <View style={st.storeCardInner}>
              <View style={st.storeLogo}>
                {store?.logo_url ? (
                  <Image source={{ uri: store.logo_url }} style={st.storeLogoImg} />
                ) : (
                  <Ionicons name="storefront" size={24} color={C.accent} />
                )}
              </View>
              <View style={st.storeInfo}>
                <Text style={st.storeNameText} numberOfLines={1}>
                  {store?.store_name ?? "Set Up Your Store"}
                </Text>
                <Text style={st.storeDescText} numberOfLines={1}>
                  {store?.description ?? "Tap settings to customize"}
                </Text>
              </View>
              {store && (
                <Pressable
                  style={st.viewShopBtn}
                  onPress={() => push({ type: "VENDOR_STORE_PAGE", storeId: store.id })}
                >
                  <Text style={st.viewShopText}>View Shop</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Revenue Banner */}
          <View style={st.revenueBanner}>
            <View style={st.revenueLeft}>
              <Ionicons name="cash-outline" size={18} color={C.success} />
              <Text style={st.revenueLabel}>Total Revenue</Text>
            </View>
            <Text style={st.revenueValue}>{formatCurrency(totalRevenue)}</Text>
          </View>

          {/* Order Status Section */}
          <View style={st.sectionHeader}>
            <Text style={st.sectionTitle}>Order Status</Text>
            <Pressable
              style={st.sectionLink}
              onPress={() => goToOrders("all")}
            >
              <Text style={st.sectionLinkText}>View Sales History</Text>
              <Feather name="chevron-right" size={14} color={C.textAccent} />
            </Pressable>
          </View>

          <View style={st.statusGrid}>
            {([
              { key: "confirmed" as const, label: "To Ship", icon: "cube-outline", color: C.accent },
              { key: "shipped" as const, label: "Shipping", icon: "airplane-outline", color: "#8B5CF6" },
              { key: "cancelled" as const, label: "Cancelled", icon: "close-circle-outline", color: "#EF4444" },
              { key: "pending" as const, label: "Unpaid", icon: "time-outline", color: "#F59E0B" },
            ] as const).map((item) => (
              <Pressable
                key={item.key}
                style={st.statusTile}
                onPress={() => goToOrders(item.key)}
              >
                <Text style={st.statusTileCount}>
                  {orderCounts[item.key]}
                </Text>
                <Ionicons name={item.icon as any} size={18} color={item.color} style={{ marginBottom: 2 }} />
                <Text style={st.statusTileLabel}>{item.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Quick Tools Grid */}
          <Text style={[st.sectionTitle, { marginLeft: 4, marginTop: 8, marginBottom: 14 }]}>
            Quick Tools
          </Text>

          <View style={st.toolsGrid}>
            {[
              { icon: "cube-outline", label: "My Products", color: C.accent, bg: "rgba(44,128,255,0.1)", onPress: () => setView("listings") },
              { icon: "hammer-outline", label: "My Auctions", color: "#F59E0B", bg: "rgba(245,158,11,0.1)", onPress: () => setView("auctions") },
              { icon: "bar-chart-outline", label: "Performance", color: C.success, bg: "rgba(34,197,94,0.1)", onPress: () => goToOrders("all") },
              { icon: "storefront-outline", label: "Store Settings", color: "#8B5CF6", bg: "rgba(139,92,246,0.1)", onPress: () => setView("store") },
              { icon: "add-circle-outline", label: "New Listing", color: C.accent, bg: "rgba(44,128,255,0.1)", onPress: () => push({ type: "CREATE_LISTING" }) },
              { icon: "add-circle-outline", label: "New Auction", color: "#F59E0B", bg: "rgba(245,158,11,0.1)", onPress: () => push({ type: "CREATE_AUCTION" }) },
            ].map((tool, i) => (
              <Pressable key={i} style={st.toolTile} onPress={tool.onPress}>
                <View style={[st.toolIcon, { backgroundColor: tool.bg }]}>
                  <Ionicons name={tool.icon as any} size={24} color={tool.color} />
                </View>
                <Text style={st.toolLabel}>{tool.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Recent Orders */}
          <View style={st.sectionHeader}>
            <Text style={st.sectionTitle}>Recent Orders</Text>
            {orderItems.length > 0 && (
              <Pressable style={st.sectionLink} onPress={() => goToOrders("all")}>
                <Text style={st.sectionLinkText}>See All</Text>
                <Feather name="chevron-right" size={14} color={C.textAccent} />
              </Pressable>
            )}
          </View>

          {orderItems.length === 0 ? (
            <View style={st.emptyCard}>
              <Ionicons name="receipt-outline" size={28} color={C.textMuted} />
              <Text style={st.emptyTitle}>No Orders Yet</Text>
              <Text style={st.emptySub}>Orders from buyers will appear here</Text>
            </View>
          ) : (
            orderItems.slice(0, 5).map((oi) => {
              const cfg = FULFILLMENT_CONFIG[oi.fulfillment_status];
              const imgUrl = oi.listing?.images?.[0];
              return (
                <Pressable key={oi.id} style={st.recentCard} onPress={() => goToOrders(oi.fulfillment_status)}>
                  <View style={st.recentThumb}>
                    {imgUrl ? (
                      <Image source={{ uri: imgUrl }} style={st.recentThumbImg} />
                    ) : (
                      <Ionicons name="image-outline" size={16} color={C.textMuted} />
                    )}
                  </View>
                  <View style={st.recentInfo}>
                    <Text style={st.recentName} numberOfLines={1}>{oi.listing?.card_name ?? "Item"}</Text>
                    <Text style={st.recentMeta}>
                      {oi.order?.buyer?.display_name ?? oi.order?.buyer?.username ?? "Buyer"}
                      {" · "}{relativeTime(oi.created_at)}
                    </Text>
                  </View>
                  <View style={st.recentRight}>
                    <Text style={st.recentPrice}>{formatCurrency(oi.quantity * Number(oi.unit_price))}</Text>
                    <View style={[st.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                      <Text style={[st.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>

        {toastMsg && (
          <Animated.View style={[st.toast, { opacity: toastOpacity }]}>
            <Feather name="check-circle" size={16} color="#fff" />
            <Text style={st.toastText}>{toastMsg}</Text>
          </Animated.View>
        )}
      </SafeAreaView>
    );
  }

  // ══════════════════ ORDERS (My Sales) ══════════════════
  if (view === "orders") {
    return (
      <SafeAreaView style={st.safe}>
        <SubHeader title="My Sales" />

        {/* Shopee-style tab bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.orderTabRow}
          style={{ flexGrow: 0 }}
        >
          {ORDER_TABS.map((t) => {
            const isActive = orderFilter === t.id;
            const count = t.id === "all" ? orderItems.length : orderItems.filter((oi) => oi.fulfillment_status === t.id).length;
            return (
              <Pressable key={t.id} style={st.orderTab} onPress={() => setOrderFilter(t.id)}>
                <Text style={[st.orderTabText, isActive && st.orderTabTextActive]}>
                  {t.label}
                </Text>
                {count > 0 && <View style={[st.orderTabBadge, isActive && st.orderTabBadgeActive]}>
                  <Text style={[st.orderTabBadgeText, isActive && st.orderTabBadgeTextActive]}>{count > 99 ? "99+" : count}</Text>
                </View>}
                {isActive && <View style={st.orderTabIndicator} />}
              </Pressable>
            );
          })}
        </ScrollView>

        {filteredOrders.length === 0 ? (
          <View style={[st.emptyCard, { margin: S.screenPadding, marginTop: 40 }]}>
            <Ionicons name="receipt-outline" size={36} color={C.textMuted} />
            <Text style={st.emptyTitle}>
              {orderFilter === "all" ? "No Orders Yet" : `No ${FULFILLMENT_CONFIG[orderFilter as FulfillmentStatus]?.label ?? orderFilter} orders`}
            </Text>
            <Text style={st.emptySub}>
              {orderFilter === "all" ? "When buyers purchase your items, orders appear here" : "Try a different filter"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredOrders}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: S.screenPadding, paddingBottom: 40, paddingTop: 4 }}
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews
            renderItem={({ item: oi }) => {
              const cfg = FULFILLMENT_CONFIG[oi.fulfillment_status];
              const action = oi.source !== "auction" ? vendorNextAction(oi.fulfillment_status) : null;
              const imgUrl = oi.listing?.images?.[0];
              const buyerName = oi.order?.buyer?.display_name ?? oi.order?.buyer?.username ?? "Buyer";

              return (
                <View style={st.orderCard}>
                  <View style={st.orderCardHead}>
                    <Text style={st.orderIdText}>#{oi.order_id.slice(0, 8).toUpperCase()}</Text>
                    <View style={[st.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                      <Ionicons name={cfg.icon as any} size={10} color={cfg.color} />
                      <Text style={[st.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>

                  <View style={st.orderCardBody}>
                    <View style={st.orderThumb}>
                      {imgUrl ? (
                        <Image source={{ uri: imgUrl }} style={st.orderThumbImg} />
                      ) : (
                        <Ionicons name="image-outline" size={18} color={C.textMuted} />
                      )}
                    </View>
                    <View style={st.orderInfo}>
                      <Text style={st.orderItemName} numberOfLines={1}>{oi.listing?.card_name ?? "Item"}</Text>
                      <Text style={st.orderItemMeta}>
                        {oi.listing?.edition ?? ""}{oi.listing?.grade ? ` · ${oi.listing.grade}` : ""}
                      </Text>
                      <View style={st.orderBuyerRow}>
                        <Ionicons name="person-circle-outline" size={12} color={C.textAccent} />
                        <Text style={st.orderBuyerName}>{buyerName}</Text>
                      </View>
                    </View>
                    <View style={st.orderPriceCol}>
                      <Text style={st.orderPrice}>{formatCurrency(oi.quantity * Number(oi.unit_price))}</Text>
                      <Text style={st.orderDate}>{relativeTime(oi.created_at)}</Text>
                    </View>
                  </View>

                  {/* Tracking number display */}
                  {oi.tracking_number && (
                    <View style={st.trackingRow}>
                      <Ionicons name="locate-outline" size={13} color={C.textAccent} />
                      <Text style={st.trackingLabel}>Tracking:</Text>
                      <Text style={st.trackingNumber}>{oi.tracking_number}</Text>
                    </View>
                  )}

                  {oi.source !== "auction" && (action || oi.fulfillment_status === "pending") && (
                    <View style={st.orderActions}>
                      {oi.fulfillment_status === "pending" && (
                        <Pressable
                          style={[st.orderActionBtn, st.orderActionDanger]}
                          onPress={() => {
                            Alert.alert("Cancel Order?", "This will cancel the order for the buyer.", [
                              { text: "Keep", style: "cancel" },
                              { text: "Cancel Order", style: "destructive", onPress: () => updateFulfillment(oi.id, "cancelled") },
                            ]);
                          }}
                          disabled={updatingOrderId === oi.id}
                        >
                          <Text style={st.orderActionDangerText}>Cancel</Text>
                        </Pressable>
                      )}
                      {action && (
                        <Pressable
                          style={[st.orderActionBtn, { backgroundColor: action.color }]}
                          onPress={() => {
                            setTrackingInput("");
                            setShipModalItemId(oi.id);
                          }}
                          disabled={updatingOrderId === oi.id}
                        >
                          {updatingOrderId === oi.id ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={st.orderActionBtnText}>{action.label}</Text>
                          )}
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}

        {/* Tracking Number Modal */}
        <Modal visible={!!shipModalItemId} transparent animationType="fade" onRequestClose={() => setShipModalItemId(null)}>
          <Pressable style={st.modalOverlay} onPress={() => setShipModalItemId(null)}>
            <Pressable style={st.modalCard} onPress={() => {}}>
              <Text style={st.modalTitle}>Ship Order</Text>
              <Text style={st.modalSub}>Enter the tracking number for this shipment.</Text>
              <TextInput
                style={st.modalInput}
                value={trackingInput}
                onChangeText={setTrackingInput}
                placeholder="e.g. MY1234567890"
                placeholderTextColor={C.textMuted}
                autoFocus
                autoCapitalize="characters"
              />
              <View style={st.modalBtns}>
                <Pressable style={st.modalCancelBtn} onPress={() => setShipModalItemId(null)}>
                  <Text style={st.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[st.modalConfirmBtn, !trackingInput.trim() && { opacity: 0.5 }]}
                  onPress={handleShipWithTracking}
                  disabled={!trackingInput.trim() || !!updatingOrderId}
                >
                  {updatingOrderId ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={st.modalConfirmText}>Confirm Shipment</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {toastMsg && (
          <Animated.View style={[st.toast, { opacity: toastOpacity }]}>
            <Feather name="check-circle" size={16} color="#fff" />
            <Text style={st.toastText}>{toastMsg}</Text>
          </Animated.View>
        )}
      </SafeAreaView>
    );
  }

  // ══════════════════ LISTINGS (My Products) ══════════════════
  if (view === "listings") {
    const LISTING_TABS: { id: typeof listingFilter; label: string; count: number }[] = [
      { id: "active", label: "Live", count: listingTabCounts.active },
      { id: "sold", label: "Sold out", count: listingTabCounts.sold },
      { id: "paused", label: "Paused", count: listingTabCounts.paused },
      { id: "draft", label: "Draft", count: listingTabCounts.draft },
    ];

    return (
      <SafeAreaView style={st.safe}>
        <SubHeader title="My Products" />

        {/* Shopee-style tab strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.prodTabRow}
          style={{ flexGrow: 0 }}
        >
          {LISTING_TABS.map((t) => {
            const active = listingFilter === t.id;
            return (
              <Pressable
                key={t.id}
                style={st.prodTab}
                onPress={() => setListingFilter(t.id)}
              >
                <Text style={[st.prodTabText, active && st.prodTabTextActive]}>
                  {t.label}
                </Text>
                <Text style={[st.prodTabCount, active && st.prodTabCountActive]}>
                  ({t.count})
                </Text>
                {active && <View style={st.prodTabIndicator} />}
              </Pressable>
            );
          })}
        </ScrollView>

        {filteredListings.length === 0 ? (
          <View style={[st.emptyCard, { margin: S.screenPadding, marginTop: 20 }]}>
            <Ionicons name="pricetag-outline" size={32} color={C.textMuted} />
            <Text style={st.emptyTitle}>
              {listingFilter === "active" ? "No live products" : `No ${listingFilter} products`}
            </Text>
            <Text style={st.emptySub}>Create a listing to start selling</Text>
          </View>
        ) : (
          <FlatList
            data={filteredListings}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: S.screenPadding, paddingBottom: 100 }}
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews
            renderItem={({ item }) => {
              const isDisplayed = displayItems.some((d) => d.listing_id === item.id);
              const isEditing = editingListingId === item.id;
              const sold = soldCounts[item.id] ?? 0;

              return (
                <View style={st.prodCard}>
                  {/* Main row: image + info */}
                  <View style={st.prodCardRow}>
                    <View style={st.prodThumb}>
                      {item.images?.[0] ? (
                        <Image source={{ uri: item.images[0] }} style={st.prodThumbImg} />
                      ) : (
                        <Ionicons name="image-outline" size={24} color={C.textMuted} />
                      )}
                    </View>
                    <View style={st.prodInfo}>
                      <Text style={st.prodName} numberOfLines={2}>{item.card_name}</Text>
                      {(item.edition || item.grade || item.condition) && (
                        <Text style={st.prodMeta} numberOfLines={1}>
                          {[item.edition, item.grade, item.condition].filter(Boolean).join(" · ")}
                        </Text>
                      )}
                      <Text style={st.prodPrice}>{formatCurrency(Number(item.price))}</Text>
                    </View>
                  </View>

                  {/* Stats row */}
                  <View style={st.prodStatsRow}>
                    <View style={st.prodStat}>
                      <Ionicons name="layers-outline" size={13} color={C.textMuted} />
                      <Text style={st.prodStatText}>Stock {item.quantity}</Text>
                    </View>
                    <View style={st.prodStat}>
                      <Ionicons name="cart-outline" size={13} color={C.textMuted} />
                      <Text style={st.prodStatText}>Sold {sold}</Text>
                    </View>
                  </View>

                  {/* Action buttons row */}
                  <View style={st.prodActionsRow}>
                    <Pressable style={st.prodActionBtn} onPress={() => removeListing(item)}>
                      <Text style={st.prodActionText}>Delist</Text>
                    </Pressable>
                    <Pressable
                      style={[st.prodActionBtn, st.prodActionBtnEdit]}
                      onPress={() => startEditListing(item)}
                    >
                      <Text style={st.prodActionEditText}>Edit</Text>
                    </Pressable>
                    <View style={{ flex: 1 }} />
                    {store && (
                      <Pressable
                        style={st.prodActionBtnMore}
                        onPress={() =>
                          isDisplayed
                            ? removeDisplayItem(displayItems.find((d) => d.listing_id === item.id)!.id)
                            : addDisplayItem(item.id)
                        }
                      >
                        <Ionicons name={isDisplayed ? "star" : "star-outline"} size={18} color={isDisplayed ? "#F59E0B" : C.textMuted} />
                      </Pressable>
                    )}
                  </View>

                  {/* Inline editor */}
                  {isEditing && (
                    <View style={st.editorPane}>
                      <TextInput style={st.editorInput} value={editName} onChangeText={setEditName} placeholder="Card name" placeholderTextColor={C.textMuted} />
                      <View style={st.editorRow}>
                        <TextInput style={[st.editorInput, st.editorHalf]} value={editEdition} onChangeText={setEditEdition} placeholder="Edition" placeholderTextColor={C.textMuted} />
                        <TextInput style={[st.editorInput, st.editorHalf]} value={editGrade} onChangeText={setEditGrade} placeholder="Grade" placeholderTextColor={C.textMuted} />
                      </View>
                      <View style={st.editorRow}>
                        <TextInput style={[st.editorInput, st.editorHalf]} value={editCondition} onChangeText={setEditCondition} placeholder="Condition" placeholderTextColor={C.textMuted} />
                        <TextInput style={[st.editorInput, st.editorHalf]} value={editPrice} onChangeText={setEditPrice} placeholder="Price" keyboardType="numeric" placeholderTextColor={C.textMuted} />
                      </View>
                      <TextInput style={st.editorInput} value={editQuantity} onChangeText={setEditQuantity} placeholder="Quantity" keyboardType="number-pad" placeholderTextColor={C.textMuted} />
                      <View style={st.editorBtns}>
                        <Pressable style={st.editorCancelBtn} onPress={cancelEditListing} disabled={savingListing}>
                          <Text style={st.editorCancelText}>Cancel</Text>
                        </Pressable>
                        <Pressable style={st.editorSaveBtn} onPress={() => saveListingEdits(item.id)} disabled={savingListing}>
                          {savingListing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={st.editorSaveText}>Save</Text>}
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}

        {/* Add New Product sticky bottom button */}
        <View style={st.prodBottomBar}>
          <Pressable style={st.prodAddBtn} onPress={() => push({ type: "CREATE_LISTING" })}>
            <Text style={st.prodAddBtnText}>Add New Product</Text>
          </Pressable>
        </View>

        {toastMsg && (
          <Animated.View style={[st.toast, { opacity: toastOpacity }]}>
            <Feather name="check-circle" size={16} color="#fff" />
            <Text style={st.toastText}>{toastMsg}</Text>
          </Animated.View>
        )}
      </SafeAreaView>
    );
  }

  // ══════════════════ AUCTIONS ══════════════════
  if (view === "auctions") {
    const auctionTabCounts = {
      active: myAuctions.filter((a) => a.status === "active").length,
      ended: myAuctions.filter((a) => a.status === "ended").length,
      cancelled: myAuctions.filter((a) => a.status === "cancelled").length,
    };
    const AUCTION_TABS: { id: typeof auctionFilter; label: string; count?: number }[] = [
      { id: "active", label: "Live", count: auctionTabCounts.active },
      { id: "ended", label: "Ended", count: auctionTabCounts.ended },
      { id: "cancelled", label: "Cancelled", count: auctionTabCounts.cancelled },
    ];

    return (
      <SafeAreaView style={st.safe}>
        <SubHeader title="My Auctions" />

        {/* Shopee-style tab strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.prodTabRow}
          style={{ flexGrow: 0 }}
        >
          {AUCTION_TABS.map((t) => {
            const active = auctionFilter === t.id;
            return (
              <Pressable
                key={t.id}
                style={st.prodTab}
                onPress={() => setAuctionFilter(t.id as any)}
              >
                <Text style={[st.prodTabText, active && st.prodTabTextActive]}>
                  {t.label}
                </Text>
                <Text style={[st.prodTabCount, active && st.prodTabCountActive]}>
                  ({t.count ?? 0})
                </Text>
                {active && <View style={st.prodTabIndicator} />}
              </Pressable>
            );
          })}
        </ScrollView>

        {filteredAuctions.length === 0 ? (
          <View style={[st.emptyCard, { margin: S.screenPadding, marginTop: 20 }]}>
            <Ionicons name="hammer-outline" size={32} color={C.textMuted} />
            <Text style={st.emptyTitle}>
              {auctionFilter === "all" ? "No auctions yet" : `No ${auctionFilter} auctions`}
            </Text>
            <Text style={st.emptySub}>Create an auction to start selling via bidding</Text>
          </View>
        ) : (
          <FlatList
            data={filteredAuctions}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: S.screenPadding, paddingBottom: 100 }}
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews
            renderItem={({ item: auction }) => {
              const imgs = normalizeImages(auction.images);
              const isActive = auction.status === "active";
              const isEnded = auction.status === "ended";
              const diff = new Date(auction.ends_at).getTime() - Date.now();
              const timeStr = !isActive
                ? ""
                : diff <= 0 ? "Ending..." : diff < 3600000 ? `${Math.floor(diff / 60000)}m left` : diff < 86400000 ? `${Math.floor(diff / 3600000)}h left` : `${Math.floor(diff / 86400000)}d left`;

              return (
                <Pressable
                  style={st.prodCard}
                  onPress={() => push({ type: "AUCTION_DETAIL", auctionId: auction.id })}
                >
                  {/* Main row */}
                  <View style={st.prodCardRow}>
                    <View style={st.prodThumb}>
                      {imgs[0] ? (
                        <Image source={{ uri: imgs[0] }} style={st.prodThumbImg} />
                      ) : (
                        <Ionicons name="image-outline" size={24} color={C.textMuted} />
                      )}
                    </View>
                    <View style={st.prodInfo}>
                      <Text style={st.prodName} numberOfLines={2}>{auction.card_name}</Text>
                      {(auction.edition || auction.grade) && (
                        <Text style={st.prodMeta} numberOfLines={1}>
                          {[auction.edition, auction.grade].filter(Boolean).join(" · ")}
                        </Text>
                      )}
                      <Text style={st.prodPrice}>
                        {auction.current_bid ? formatCurrency(auction.current_bid) : formatCurrency(auction.starting_price)}
                      </Text>
                      {isActive && timeStr ? (
                        <View style={st.auctionTimerInline}>
                          <Ionicons name="time-outline" size={11} color={diff < 3600000 ? "#EF4444" : C.accent} />
                          <Text style={[st.auctionTimerText, diff < 3600000 && { color: "#EF4444" }]}>{timeStr}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  {/* Stats row */}
                  <View style={st.prodStatsRow}>
                    <View style={st.prodStat}>
                      <Ionicons name="hammer-outline" size={13} color={C.textMuted} />
                      <Text style={st.prodStatText}>Bids {auction.bid_count ?? 0}</Text>
                    </View>
                    <View style={st.prodStat}>
                      <Ionicons name="people-outline" size={13} color={C.textMuted} />
                      <Text style={st.prodStatText}>Watchers {auction.watchers ?? 0}</Text>
                    </View>
                  </View>

                  {/* Winner row for ended auctions */}
                  {isEnded && auction.winner && (
                    <View style={st.auctionWinnerRow}>
                      <Ionicons name="trophy" size={13} color="#F59E0B" />
                      <Text style={st.auctionWinnerText}>
                        Winner: {auction.winner.display_name ?? auction.winner.username ?? "—"}
                      </Text>
                    </View>
                  )}

                  {/* Action buttons */}
                  <View style={st.prodActionsRow}>
                    {isActive && (auction.bid_count ?? 0) === 0 && (
                      <Pressable
                        style={[st.prodActionBtn, st.prodActionBtnDanger]}
                        onPress={() => cancelAuction(auction)}
                      >
                        <Text style={st.prodActionDangerText}>Cancel</Text>
                      </Pressable>
                    )}
                    <View style={{ flex: 1 }} />
                    <Pressable
                      style={[st.prodActionBtn, st.prodActionBtnEdit]}
                      onPress={() => push({ type: "AUCTION_DETAIL", auctionId: auction.id })}
                    >
                      <Text style={st.prodActionEditText}>View Details</Text>
                    </Pressable>
                  </View>
                </Pressable>
              );
            }}
          />
        )}

        {/* Add New Auction sticky bottom button */}
        <View style={st.prodBottomBar}>
          <Pressable style={st.prodAddBtn} onPress={() => push({ type: "CREATE_AUCTION" })}>
            <Text style={st.prodAddBtnText}>Add New Auction</Text>
          </Pressable>
        </View>

        {toastMsg && (
          <Animated.View style={[st.toast, { opacity: toastOpacity }]}>
            <Feather name="check-circle" size={16} color="#fff" />
            <Text style={st.toastText}>{toastMsg}</Text>
          </Animated.View>
        )}
      </SafeAreaView>
    );
  }

  // ══════════════════ STORE SETTINGS ══════════════════
  return (
    <SafeAreaView style={st.safe}>
      <SubHeader title="Store Settings" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.storeScroll}>
        {/* Preview Card */}
        <View style={[st.previewCard, { borderColor: themeColor + "40" }]}>
          {bannerLocalUri || bannerUrl.trim() ? (
            <Image source={{ uri: bannerLocalUri ?? bannerUrl }} style={st.previewBanner} />
          ) : (
            <View style={[st.previewBanner, { backgroundColor: themeColor + "22" }]} />
          )}
          <View style={st.previewBody}>
            <View style={st.previewLogoRow}>
              {logoLocalUri || logoUrl.trim() ? (
                <Image source={{ uri: logoLocalUri ?? logoUrl }} style={[st.previewLogo, { borderColor: themeColor }]} />
              ) : (
                <View style={[st.previewLogo, { borderColor: themeColor, backgroundColor: themeColor + "22" }]}>
                  <Ionicons name="storefront" size={20} color={themeColor} />
                </View>
              )}
              <View style={st.previewInfo}>
                <Text style={st.previewName}>{storeName || "Your Store Name"}</Text>
                <Text style={st.previewDesc} numberOfLines={1}>{storeDesc || "Store description"}</Text>
              </View>
            </View>
          </View>
        </View>

        <Text style={st.formLabel}>Store Details</Text>
        <View style={st.formCard}>
          <View style={st.field}>
            <Text style={st.fieldLabel}>Store Name *</Text>
            <TextInput style={st.fieldInput} value={storeName} onChangeText={setStoreName} placeholder="Enter store name" placeholderTextColor={C.textMuted} />
          </View>
          <View style={st.field}>
            <Text style={st.fieldLabel}>Description</Text>
            <TextInput style={[st.fieldInput, st.fieldMulti]} value={storeDesc} onChangeText={setStoreDesc} placeholder="Tell buyers about your store" placeholderTextColor={C.textMuted} multiline numberOfLines={3} />
          </View>
          <View style={st.field}>
            <Text style={st.fieldLabel}>Store Logo</Text>
            <Pressable style={st.uploadBtn} onPress={() => pickImage("logo")}>
              <Feather name="image" size={16} color={C.textPrimary} />
              <Text style={st.uploadBtnText}>{logoLocalUri ? "Logo selected" : logoUrl ? "Change logo" : "Upload logo"}</Text>
            </Pressable>
          </View>
          <View style={st.field}>
            <Text style={st.fieldLabel}>Store Banner</Text>
            <Pressable style={st.uploadBtn} onPress={() => pickImage("banner")}>
              <Feather name="image" size={16} color={C.textPrimary} />
              <Text style={st.uploadBtnText}>{bannerLocalUri ? "Banner selected" : bannerUrl ? "Change banner" : "Upload banner"}</Text>
            </Pressable>
          </View>
        </View>

        <Text style={st.formLabel}>Theme Color</Text>
        <View style={st.colorRow}>
          {THEME_COLORS.map((color) => (
            <Pressable key={color} onPress={() => setThemeColor(color)} style={[st.colorDot, { backgroundColor: color }, themeColor === color && st.colorDotActive]}>
              {themeColor === color && <Feather name="check" size={14} color="#fff" />}
            </Pressable>
          ))}
        </View>

        <Pressable style={[st.saveBtn, { backgroundColor: themeColor }]} onPress={handleSaveStore} disabled={saving || !storeName.trim()}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>{uploadingImage ? "Uploading images..." : store ? "Update Store" : "Create Store"}</Text>}
        </Pressable>

        {/* Display Items */}
        <View style={st.displayHeader}>
          <Text style={st.formLabel}>Display Items</Text>
          <Text style={st.displayCount}>{displayItems.length}/10</Text>
        </View>
        <Text style={st.displayHint}>Featured listings shown on your store page. Manage from My Products.</Text>

        {!store ? (
          <View style={st.emptyCard}>
            <Ionicons name="storefront-outline" size={28} color={C.textMuted} />
            <Text style={st.emptyTitle}>Create your store first</Text>
            <Text style={st.emptySub}>Save your store details above to get started</Text>
          </View>
        ) : displayItems.length === 0 ? (
          <View style={st.emptyCard}>
            <Ionicons name="grid-outline" size={28} color={C.textMuted} />
            <Text style={st.emptyTitle}>No display items</Text>
            <Text style={st.emptySub}>Feature listings from My Products</Text>
          </View>
        ) : (
          displayItems.map((item, idx) => (
            <View key={item.id} style={st.displayRow}>
              <View style={st.displayOrder}><Text style={st.displayOrderText}>{item.display_order}</Text></View>
              <View style={st.displayInfo}>
                <Text style={st.displayName} numberOfLines={1}>{item.listing?.card_name ?? "Unknown"}</Text>
                <Text style={st.displayMeta}>{item.listing?.edition ?? ""} {item.listing?.grade ? `· ${item.listing.grade}` : ""}</Text>
                <Text style={st.displayPrice}>{item.listing ? formatCurrency(Number(item.listing.price)) : "—"}</Text>
              </View>
              <View style={st.displayActions}>
                <Pressable onPress={() => moveDisplayItem(item.id, "up")} style={[st.miniBtn, idx === 0 && { opacity: 0.3 }]} disabled={idx === 0} hitSlop={8}>
                  <Feather name="chevron-up" size={14} color={C.textPrimary} />
                </Pressable>
                <Pressable onPress={() => moveDisplayItem(item.id, "down")} style={[st.miniBtn, idx === displayItems.length - 1 && { opacity: 0.3 }]} disabled={idx === displayItems.length - 1} hitSlop={8}>
                  <Feather name="chevron-down" size={14} color={C.textPrimary} />
                </Pressable>
                <Pressable onPress={() => removeDisplayItem(item.id)} style={st.miniBtn} hitSlop={8}>
                  <Feather name="x" size={14} color={C.danger} />
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {toastMsg && (
        <Animated.View style={[st.toast, { opacity: toastOpacity }]}>
          <Feather name="check-circle" size={16} color="#fff" />
          <Text style={st.toastText}>{toastMsg}</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ═════════════════════════════════════
// ══ STYLES ══
// ═════════════════════════════════════

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  // ── Header ──
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: S.screenPadding, paddingVertical: 12, gap: S.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.borderIcon,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: {
    flex: 1, color: C.textPrimary, fontSize: 18, fontWeight: "800", textAlign: "center",
  },
  headerIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.borderIcon,
    alignItems: "center", justifyContent: "center",
  },

  // ── Sub-view header ──
  subHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: S.screenPadding, paddingVertical: 12, gap: S.md,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  subBackBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.borderIcon,
    alignItems: "center", justifyContent: "center",
  },
  subHeaderTitle: {
    flex: 1, color: C.textPrimary, fontSize: 16, fontWeight: "800", textAlign: "center",
  },

  // ══ HOME / DASHBOARD ══
  homeScroll: { paddingHorizontal: S.screenPadding, paddingBottom: 60 },

  storeCard: {
    backgroundColor: C.surface, borderRadius: 16,
    borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 12,
  },
  storeCardInner: {
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  storeLogo: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.borderIcon,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  storeLogoImg: { width: 48, height: 48, borderRadius: 24 },
  storeInfo: { flex: 1 },
  storeNameText: { color: C.textPrimary, fontSize: 16, fontWeight: "800" },
  storeDescText: { color: C.textSecondary, fontSize: 12, fontWeight: "500", marginTop: 2 },
  viewShopBtn: {
    borderRadius: 8, borderWidth: 1, borderColor: C.accent,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  viewShopText: { color: C.accent, fontSize: 12, fontWeight: "700" },

  revenueBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "rgba(34,197,94,0.06)", borderRadius: 12,
    borderWidth: 1, borderColor: "rgba(34,197,94,0.2)",
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 20,
  },
  revenueLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  revenueLabel: { color: C.success, fontSize: 13, fontWeight: "700" },
  revenueValue: { color: C.success, fontSize: 18, fontWeight: "900" },

  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    color: C.textPrimary, fontSize: 15, fontWeight: "800",
  },
  sectionLink: { flexDirection: "row", alignItems: "center", gap: 2 },
  sectionLinkText: { color: C.textAccent, fontSize: 12, fontWeight: "600" },

  statusGrid: {
    flexDirection: "row", gap: 10, marginBottom: 24,
  },
  statusTile: {
    flex: 1, alignItems: "center", justifyContent: "center",
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, paddingVertical: 14, gap: 4,
  },
  statusTileCount: { color: C.textPrimary, fontSize: 22, fontWeight: "900" },
  statusTileLabel: { color: C.textSecondary, fontSize: 10, fontWeight: "700" },

  toolsGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 28,
  },
  toolTile: {
    width: "30%" as any, alignItems: "center", gap: 8, paddingVertical: 14,
  },
  toolIcon: {
    width: 48, height: 48, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  toolLabel: { color: C.textSecondary, fontSize: 11, fontWeight: "700", textAlign: "center" },

  recentCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 1, borderColor: C.border,
    padding: 12, gap: 10, marginBottom: 8,
  },
  recentThumb: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  recentThumbImg: { width: 40, height: 40, borderRadius: 10 },
  recentInfo: { flex: 1 },
  recentName: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  recentMeta: { color: C.textSecondary, fontSize: 11, fontWeight: "500", marginTop: 2 },
  recentRight: { alignItems: "flex-end", gap: 4 },
  recentPrice: { color: C.accent, fontSize: 13, fontWeight: "800" },

  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1,
  },
  statusBadgeText: { fontSize: 10, fontWeight: "700" },

  // ══ ORDERS (My Sales) ══
  orderTabRow: {
    flexDirection: "row", paddingHorizontal: S.screenPadding,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  orderTab: {
    alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, position: "relative",
  },
  orderTabText: { color: C.textMuted, fontSize: 13, fontWeight: "700" },
  orderTabTextActive: { color: C.accent },
  orderTabBadge: {
    position: "absolute", top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: C.elevated, alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  orderTabBadgeActive: { backgroundColor: C.accent },
  orderTabBadgeText: { color: C.textMuted, fontSize: 9, fontWeight: "800" },
  orderTabBadgeTextActive: { color: "#fff" },
  orderTabIndicator: {
    position: "absolute", bottom: 0, left: 16, right: 16, height: 3,
    backgroundColor: C.accent, borderTopLeftRadius: 2, borderTopRightRadius: 2,
  },

  orderCard: {
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, marginBottom: 10, overflow: "hidden",
  },
  orderCardHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4,
  },
  orderIdText: { color: C.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  orderCardBody: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 10, gap: 10,
  },
  orderThumb: {
    width: 48, height: 48, borderRadius: 10,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  orderThumbImg: { width: 48, height: 48, borderRadius: 10 },
  orderInfo: { flex: 1 },
  orderItemName: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  orderItemMeta: { color: C.textSecondary, fontSize: 11, fontWeight: "500", marginTop: 1 },
  orderBuyerRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  orderBuyerName: { color: C.textAccent, fontSize: 11, fontWeight: "600" },
  orderPriceCol: { alignItems: "flex-end", gap: 4 },
  orderPrice: { color: C.accent, fontSize: 14, fontWeight: "900" },
  orderDate: { color: C.textMuted, fontSize: 10, fontWeight: "500" },
  orderActions: {
    flexDirection: "row", gap: 8,
    borderTopWidth: 1, borderTopColor: C.border, padding: 10,
  },
  orderActionBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 10,
    alignItems: "center", justifyContent: "center",
  },
  orderActionBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  orderActionDanger: {
    backgroundColor: "transparent", borderWidth: 1, borderColor: "rgba(239,68,68,0.4)",
  },
  orderActionDangerText: { color: "#EF4444", fontSize: 12, fontWeight: "700" },

  trackingRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingBottom: 10,
  },
  trackingLabel: { color: C.textSecondary, fontSize: 11, fontWeight: "600" },
  trackingNumber: { color: C.textAccent, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },

  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center", justifyContent: "center", padding: 24,
  },
  modalCard: {
    width: "100%", backgroundColor: C.surface, borderRadius: 18,
    borderWidth: 1, borderColor: C.border, padding: 20, gap: 12,
  },
  modalTitle: { color: C.textPrimary, fontSize: 17, fontWeight: "800" },
  modalSub: { color: C.textSecondary, fontSize: 13, fontWeight: "500", lineHeight: 18 },
  modalInput: {
    backgroundColor: C.elevated, borderRadius: 10, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 14, paddingVertical: 12, color: C.textPrimary, fontSize: 15, fontWeight: "600",
    letterSpacing: 1,
  },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalCancelBtn: {
    flex: 1, borderRadius: 10, borderWidth: 1, borderColor: C.border,
    paddingVertical: 12, alignItems: "center", justifyContent: "center",
  },
  modalCancelText: { color: C.textSecondary, fontSize: 13, fontWeight: "700" },
  modalConfirmBtn: {
    flex: 2, borderRadius: 10, backgroundColor: "#8B5CF6",
    paddingVertical: 12, alignItems: "center", justifyContent: "center",
  },
  modalConfirmText: { color: "#fff", fontSize: 13, fontWeight: "800" },

  auctionWinnerRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 12, paddingVertical: 8,
  },
  auctionWinnerText: { color: "#F59E0B", fontSize: 11, fontWeight: "700" },

  // ══ PRODUCTS / AUCTIONS (Shopee-style) ══
  prodTabRow: {
    flexDirection: "row", paddingHorizontal: S.screenPadding,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  prodTab: {
    alignItems: "center", paddingVertical: 12, paddingHorizontal: 16,
    position: "relative", flexDirection: "row", gap: 4,
  },
  prodTabText: { color: C.textMuted, fontSize: 13, fontWeight: "700" },
  prodTabTextActive: { color: C.accent },
  prodTabCount: { color: C.textMuted, fontSize: 13, fontWeight: "600" },
  prodTabCountActive: { color: C.accent },
  prodTabIndicator: {
    position: "absolute", bottom: 0, left: 12, right: 12, height: 3,
    backgroundColor: C.accent, borderTopLeftRadius: 2, borderTopRightRadius: 2,
  },

  prodCard: {
    borderRadius: 14, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface, marginTop: 12, overflow: "hidden",
  },
  prodCardRow: {
    flexDirection: "row", padding: 14, gap: 12,
  },
  prodThumb: {
    width: 72, height: 72, borderRadius: 10,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  prodThumbImg: { width: 72, height: 72, borderRadius: 10 },
  prodInfo: { flex: 1, gap: 2, justifyContent: "center" },
  prodName: { color: C.textPrimary, fontSize: 14, fontWeight: "700", lineHeight: 19 },
  prodMeta: { color: C.textSecondary, fontSize: 11, fontWeight: "500" },
  prodPrice: { color: C.accent, fontSize: 15, fontWeight: "900", marginTop: 2 },

  prodStatsRow: {
    flexDirection: "row", paddingHorizontal: 14, paddingBottom: 10,
    gap: 20,
  },
  prodStat: { flexDirection: "row", alignItems: "center", gap: 5 },
  prodStatText: { color: C.textSecondary, fontSize: 12, fontWeight: "600" },

  prodActionsRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderTopWidth: 1, borderTopColor: C.border,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  prodActionBtn: {
    borderRadius: 8, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 16, paddingVertical: 8,
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.surface,
  },
  prodActionText: { color: C.textPrimary, fontSize: 12, fontWeight: "700" },
  prodActionBtnEdit: { borderColor: C.accent },
  prodActionEditText: { color: C.accent, fontSize: 12, fontWeight: "700" },
  prodActionBtnDanger: { borderColor: "rgba(239,68,68,0.4)" },
  prodActionDangerText: { color: "#EF4444", fontSize: 12, fontWeight: "700" },
  prodActionBtnMore: {
    width: 36, height: 36, borderRadius: 8,
    borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.surface,
  },

  prodBottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: S.screenPadding, paddingVertical: 12,
    backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border,
  },
  prodAddBtn: {
    backgroundColor: C.accent, borderRadius: 12,
    paddingVertical: 14, alignItems: "center", justifyContent: "center",
  },
  prodAddBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  auctionTimerInline: {
    flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3,
  },
  auctionTimerText: { color: C.accent, fontSize: 11, fontWeight: "700" },

  editorPane: {
    borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.elevated, padding: 10, gap: 8,
  },
  editorInput: {
    backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 10, paddingVertical: 9, color: C.textPrimary, fontSize: 13, fontWeight: "500",
  },
  editorRow: { flexDirection: "row", gap: 8 },
  editorHalf: { flex: 1 },
  editorBtns: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 2 },
  editorCancelBtn: {
    borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  editorCancelText: { color: C.textSecondary, fontSize: 12, fontWeight: "700" },
  editorSaveBtn: {
    borderRadius: 8, backgroundColor: C.accent, paddingHorizontal: 12, paddingVertical: 8,
    minWidth: 80, alignItems: "center", justifyContent: "center",
  },
  editorSaveText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  // ══ STORE SETTINGS ══
  storeScroll: { paddingHorizontal: S.screenPadding, paddingBottom: 60, paddingTop: S.lg },

  previewCard: {
    borderRadius: S.radiusCard, borderWidth: 1, backgroundColor: C.surface,
    overflow: "hidden", marginBottom: S.xl,
  },
  previewBanner: { height: 100, width: "100%" },
  previewBody: { padding: S.lg },
  previewLogoRow: { flexDirection: "row", alignItems: "center", gap: S.md, marginTop: -36 },
  previewLogo: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 2,
    alignItems: "center", justifyContent: "center", backgroundColor: C.bg,
  },
  previewInfo: { flex: 1, paddingTop: 14 },
  previewName: { color: C.textPrimary, fontSize: 16, fontWeight: "800" },
  previewDesc: { color: C.textSecondary, fontSize: 12, fontWeight: "500", marginTop: 2 },

  formLabel: {
    color: C.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.8,
    textTransform: "uppercase", marginBottom: S.sm, marginLeft: 4,
  },
  formCard: {
    backgroundColor: C.surface, borderRadius: S.radiusCard, borderWidth: 1,
    borderColor: C.border, padding: S.lg, gap: S.lg, marginBottom: S.xl,
  },
  field: { gap: 6 },
  fieldLabel: { color: C.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  fieldInput: {
    backgroundColor: C.elevated, borderRadius: S.radiusSmall, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 12, paddingVertical: 10, color: C.textPrimary, fontSize: 14, fontWeight: "500",
  },
  fieldMulti: { minHeight: 72, textAlignVertical: "top" },
  uploadBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.elevated, borderRadius: S.radiusSmall, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 12, paddingVertical: 12,
  },
  uploadBtnText: { color: C.textPrimary, fontSize: 13, fontWeight: "600" },

  colorRow: { flexDirection: "row", gap: 12, flexWrap: "wrap", marginBottom: S.xl },
  colorDot: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  colorDotActive: { borderWidth: 3, borderColor: "#fff" },

  saveBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  displayHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  displayCount: { color: C.accent, fontSize: 13, fontWeight: "800" },
  displayHint: { color: C.textSecondary, fontSize: 12, fontWeight: "500", marginBottom: S.lg },

  displayRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    padding: 12, gap: 10, marginBottom: 8,
  },
  displayOrder: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: C.accentGlow,
    alignItems: "center", justifyContent: "center",
  },
  displayOrderText: { color: C.accent, fontSize: 12, fontWeight: "900" },
  displayInfo: { flex: 1 },
  displayName: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  displayMeta: { color: C.textSecondary, fontSize: 11, fontWeight: "500", marginTop: 2 },
  displayPrice: { color: C.accent, fontSize: 12, fontWeight: "800", marginTop: 3 },
  displayActions: { flexDirection: "row", gap: 6 },
  miniBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },

  // ── Shared ──
  emptyCard: {
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.surface, borderRadius: S.radiusCard, borderWidth: 1, borderColor: C.border,
    paddingVertical: 40, gap: 8,
  },
  emptyTitle: { color: C.textPrimary, fontSize: 15, fontWeight: "800" },
  emptySub: { color: C.textSecondary, fontSize: 12, fontWeight: "500", textAlign: "center", paddingHorizontal: 40 },

  toast: {
    position: "absolute", bottom: 40, left: 20, right: 20,
    backgroundColor: C.success, borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 16,
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  toastText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
