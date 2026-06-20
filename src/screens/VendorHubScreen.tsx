import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { C, S } from "../theme";
import { supabase } from "../lib/supabase";
import { onAppEvent, APP_EVENTS } from "../lib/appEvents";
import { useAppNavigation } from "../navigation/NavigationContext";
import ScreenHeader from "../components/ScreenHeader";
import DisputesView from "./DisputesView";
import {
  getSellerBalance,
  getPayoutAccount,
  savePayoutAccount,
  requestPayout,
  cancelPayout,
  fetchSellerPayouts,
  type SellerBalance,
  type PayoutAccount,
  type SellerPayout,
} from "../data/payouts";
import { sellerCancelOrder } from "../data/payments";

type ViewId = "home" | "orders" | "listings" | "auctions" | "store" | "performance" | "disputes" | "payouts";

type VendorStore = {
  id: string;
  store_name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  theme_color: string;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  stripe_details_submitted: boolean;
  social_links: Record<string, string> | null;
  specialties: string[] | null;
};

const SOCIAL_PLATFORMS: {
  key: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  placeholder: string;
}[] = [
  { key: "instagram", label: "Instagram", icon: "instagram", placeholder: "@handle or link" },
  { key: "tiktok", label: "TikTok", icon: "music", placeholder: "@handle or link" },
  { key: "twitter", label: "X / Twitter", icon: "twitter", placeholder: "@handle or link" },
  { key: "youtube", label: "YouTube", icon: "youtube", placeholder: "Channel link" },
  { key: "whatsapp", label: "WhatsApp", icon: "message-circle", placeholder: "Phone or wa.me link" },
  { key: "website", label: "Website", icon: "globe", placeholder: "https://" },
];

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
  ship_deadline?: string | null;
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
    shipping_address: ShippingAddressSnapshot | null;
  } | null;
  source?: "market" | "auction";
};

type ShippingAddressSnapshot = {
  full_name?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  label?: string | null;
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

function formatCurrency2(v: number) {
  return `RM${v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Common Malaysian banks for the payout account dropdown. "Others" lets the
// seller type a bank not in the list.
const MALAYSIAN_BANKS = [
  "Maybank",
  "CIMB Bank",
  "Public Bank",
  "RHB Bank",
  "Hong Leong Bank",
  "AmBank",
  "Bank Islam",
  "Bank Rakyat",
  "Affin Bank",
  "Alliance Bank",
  "Bank Simpanan Nasional (BSN)",
  "OCBC Bank",
  "HSBC Bank",
  "Standard Chartered",
  "UOB Bank",
  "Bank Muamalat",
  "Agrobank",
  "MBSB Bank",
  "Citibank",
];
const OTHER_BANK = "Others";

const PAYOUT_STATUS_META: Record<
  SellerPayout["status"],
  { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; color: string }
> = {
  requested: { label: "Pending", icon: "time-outline", color: "#F59E0B" },
  paid: { label: "Paid", icon: "checkmark-circle", color: C.success },
  cancelled: { label: "Cancelled", icon: "close-circle-outline", color: C.textSecondary },
  rejected: { label: "Rejected", icon: "alert-circle-outline", color: C.danger },
};

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
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutsLoading, setPayoutsLoading] = useState(true);
  const [payoutsError, setPayoutsError] = useState(false);
  const [balance, setBalance] = useState<SellerBalance | null>(null);
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccount | null>(null);
  const [payouts, setPayouts] = useState<SellerPayout[]>([]);
  const [editingAccount, setEditingAccount] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [cancellingPayoutId, setCancellingPayoutId] = useState<string | null>(null);
  // Bank account form fields
  const [paHolder, setPaHolder] = useState("");
  const [paBank, setPaBank] = useState("");
  const [paAccount, setPaAccount] = useState("");
  const [bankOpen, setBankOpen] = useState(false);
  const [bankIsOther, setBankIsOther] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const [orderItems, setOrderItems] = useState<SellerOrderItem[]>([]);
  const [orderFilter, setOrderFilter] = useState<FulfillmentStatus | "all">("all");
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [refreshingOrders, setRefreshingOrders] = useState(false);

  const [storeName, setStoreName] = useState("");
  const [storeDesc, setStoreDesc] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [logoLocalUri, setLogoLocalUri] = useState<string | null>(null);
  const [bannerLocalUri, setBannerLocalUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [themeColor, setThemeColor] = useState("#2C80FF");
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({});
  const [specialtiesInput, setSpecialtiesInput] = useState("");

  const [myAuctions, setMyAuctions] = useState<VendorAuction[]>([]);
  const [auctionFilter, setAuctionFilter] = useState<"all" | "active" | "ended" | "cancelled">("active");
  const [listingFilter, setListingFilter] = useState<"all" | "active" | "sold" | "paused" | "draft">("active");

  // Display item picker
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

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
    delivered: orderItems.filter((oi) => oi.fulfillment_status === "delivered").length,
    refunded: orderItems.filter((oi) => oi.fulfillment_status === "refunded").length,
  };

  const activeListingCount = myListings.filter((l) => l.status === "active").length;

  const [openDisputeCount, setOpenDisputeCount] = useState(0);
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { count } = await supabase
        .from("disputes")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", userId)
        .in("status", ["open", "under_review"]);
      setOpenDisputeCount(count ?? 0);
    })();
  }, [userId]);

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
        .select(
          "id, store_name, description, logo_url, banner_url, theme_color, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, social_links, specialties",
        )
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
        setSocialLinks(
          data.social_links && typeof data.social_links === "object"
            ? (data.social_links as Record<string, string>)
            : {},
        );
        setSpecialtiesInput(Array.isArray(data.specialties) ? data.specialties.join(", ") : "");
      }
    } catch (e) {
      showToast(errMsg(e, "Failed to load store"));
    }
  }, []);

  const loadPayouts = useCallback(async () => {
    setPayoutsError(false);
    try {
      const [bal, acct, list] = await Promise.all([
        getSellerBalance(),
        getPayoutAccount(),
        fetchSellerPayouts(50),
      ]);
      setBalance(bal);
      setPayoutAccount(acct);
      setPayouts(list);
      if (acct) {
        setPaHolder(acct.account_holder ?? "");
        setPaBank(acct.bank_name ?? "");
        setPaAccount(acct.account_number ?? "");
        setBankIsOther(!!acct.bank_name && !MALAYSIAN_BANKS.includes(acct.bank_name));
      }
    } catch {
      setPayoutsError(true);
    } finally {
      setPayoutsLoading(false);
    }
  }, []);

  const loadDisplayItems = useCallback(async () => {
    if (!store?.id) return;
    try {
      const { data, error } = await supabase
        .from("vendor_display_items")
        .select(`id, listing_id, display_order, listing:listings(id, card_name, edition, grade, price, quantity, status, images)`)
        .eq("store_id", store.id)
        .order("display_order", { ascending: true });
      if (error) throw error;
      if (data) {
        const mapped = (data as any[]).map((d) => ({
          ...d,
          listing: Array.isArray(d.listing) ? d.listing[0] : d.listing,
        }));

        // Auto-remove display items whose listing is gone or no longer active
        const stale = mapped.filter(
          (d) => !d.listing || d.listing.status !== "active" || (d.listing.quantity ?? 0) <= 0,
        );
        if (stale.length > 0) {
          await supabase
            .from("vendor_display_items")
            .delete()
            .in("id", stale.map((d) => d.id));
        }

        setDisplayItems(mapped.filter(
          (d) => d.listing && d.listing.status === "active" && (d.listing.quantity ?? 0) > 0,
        ));
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
      // order_items has no FK to `listings`, so listing details can't be
      // embedded here — they are hydrated by listing_id further below.
      const { data, error } = await supabase
        .from("order_items")
        .select(`
          id, order_id, listing_id, quantity, unit_price, fulfillment_status, tracking_number, ship_deadline, created_at,
          order:orders(id, buyer_id, total, created_at, shipping_address)
        `)
        .eq("seller_id", userId)
        // Hide orders still awaiting card payment — they only become real sales
        // once Stripe confirms (status flips to 'confirmed').
        .neq("fulfillment_status", "pending_payment")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const mapped: SellerOrderItem[] = (data ?? []).map((row: any) => ({
        ...row,
        listing: Array.isArray(row.listing) ? row.listing[0] : row.listing,
        order: Array.isArray(row.order) ? row.order[0] : row.order,
        source: "market",
      }));

      const buyerIds = [...new Set(mapped.map((m) => m.order?.buyer_id).filter(Boolean))] as string[];
      let buyerMap: Record<string, { username: string; display_name: string | null }> = {};
      if (buyerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username, display_name")
          .in("id", buyerIds);
        for (const p of profiles ?? []) {
          buyerMap[(p as any).id] = { username: (p as any).username, display_name: (p as any).display_name };
        }
      }

      for (const item of mapped) {
        if (item.order) {
          item.order.buyer = buyerMap[item.order.buyer_id] ?? null;
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
          order: { id: `auction-${row.id}`, buyer_id: row.winner_id, total: Number(row.winning_bid), created_at: row.created_at, buyer: winner ?? null, shipping_address: null },
          source: "auction",
        };
      });

      // Hydrate listing details by listing_id. Market items resolve from
      // `listings`; auction-origin items (listing_id → auction_items.id)
      // resolve from `auction_items`.
      const marketListingIds = [...new Set(mapped.filter((m) => !m.listing && !!m.listing_id).map((m) => m.listing_id))];
      if (marketListingIds.length > 0) {
        const { data: listingRows } = await supabase
          .from("listings")
          .select("id, card_name, edition, grade, images")
          .in("id", marketListingIds);
        for (const l of listingRows ?? []) {
          for (const m of mapped) {
            if (m.listing_id === (l as any).id && !m.listing) {
              (m as any).listing = {
                card_name: (l as any).card_name,
                edition: (l as any).edition ?? null,
                grade: (l as any).grade ?? null,
                images: normalizeImages((l as any).images),
              };
            }
          }
        }
      }

      const missingListingIds = [...new Set(mapped.filter((m) => !m.listing && !!m.listing_id).map((m) => m.listing_id))];
      if (missingListingIds.length > 0) {
        const { data: aiRows } = await supabase
          .from("auction_items")
          .select("id, card_name, edition, grade, condition, images")
          .in("id", missingListingIds);
        for (const a of aiRows ?? []) {
          for (const m of mapped) {
            if (m.listing_id === (a as any).id && !m.listing) {
              (m as any).listing = {
                card_name: (a as any).card_name,
                edition: (a as any).edition ?? null,
                grade: (a as any).grade ?? (a as any).condition ?? null,
                images: normalizeImages((a as any).images),
              };
            }
          }
        }
      }

      setOrderItems(
        [...mapped, ...auctionMapped].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      );
    } catch (e) {
      showToast(errMsg(e, "Failed to load orders"));
    } finally {
      setOrdersLoading(false);
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
    loadPayouts();
  }, [userId, loadOrderItems, loadMyAuctions, loadPayouts]);

  useEffect(() => {
    if (store?.id) loadDisplayItems();
  }, [store?.id, loadDisplayItems]);

  useEffect(() => {
    if (userId) loadMyListings();
  }, [userId, loadMyListings]);

  // Refresh products when a listing is edited on the dedicated edit screen.
  useEffect(() => {
    return onAppEvent(APP_EVENTS.listingsChanged, () => {
      loadMyListings();
      loadDisplayItems();
    });
  }, [loadMyListings, loadDisplayItems]);

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

  async function handleCancelOrder(itemId: string, orderId: string) {
    setUpdatingOrderId(itemId);
    try {
      await sellerCancelOrder(orderId);
      // Refund/void flips the whole order to refunded (or removes it). Reflect it.
      setOrderItems((prev) =>
        prev.map((oi) =>
          oi.order_id === orderId ? { ...oi, fulfillment_status: "refunded" as FulfillmentStatus } : oi,
        ),
      );
      showToast("Order cancelled and buyer refunded");
      loadOrderItems();
    } catch (e) {
      showToast(errMsg(e, "Failed to cancel order"));
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

    const cleanedSocials = Object.fromEntries(
      Object.entries(socialLinks)
        .map(([k, v]) => [k, (v ?? "").trim()])
        .filter(([, v]) => v.length > 0),
    );
    const cleanedSpecialties = specialtiesInput
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 12);

    const payload = {
      store_name: storeName.trim(),
      description: storeDesc.trim() || null,
      logo_url: finalLogoUrl,
      banner_url: finalBannerUrl,
      theme_color: themeColor,
      social_links: cleanedSocials,
      specialties: cleanedSpecialties,
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
    const [r1, r2] = await Promise.all([
      supabase.from("vendor_display_items").update({ display_order: b.display_order }).eq("id", a.id),
      supabase.from("vendor_display_items").update({ display_order: a.display_order }).eq("id", b.id),
    ]);
    if (r1.error || r2.error) {
      showToast("Failed to reorder items");
    }
    await loadDisplayItems();
  }

  // ── Listing actions ──

  async function removeListing(item: VendorListing) {
    Alert.alert("Remove listing?", "This will remove it from your store, but keep order history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          const { error: dispErr } = await supabase.from("vendor_display_items").delete().eq("listing_id", item.id);
          if (dispErr) console.warn("removeListing display cleanup:", dispErr.message);
          const { error } = await supabase.from("listings").update({ status: "removed", updated_at: new Date().toISOString() }).eq("id", item.id);
          if (error) { showToast(errMsg(error, "Failed to remove listing")); return; }
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

  async function refreshOrders() {
    setRefreshingOrders(true);
    await loadOrderItems();
    setRefreshingOrders(false);
  }

  function messageBuyer(oi: SellerOrderItem) {
    const buyerId = oi.order?.buyer_id;
    if (!buyerId) return;
    push({
      type: "CHAT",
      sellerId: buyerId,
      listingId: oi.listing_id || undefined,
      topic: oi.listing?.card_name ?? undefined,
    });
  }

  async function handleSaveAccount() {
    if (!paHolder.trim() || !paBank.trim() || !paAccount.trim()) {
      showToast("Fill in name, bank, and account number");
      return;
    }
    setSavingAccount(true);
    try {
      await savePayoutAccount({
        account_holder: paHolder,
        bank_name: paBank,
        account_number: paAccount,
      });
      await loadPayouts();
      setEditingAccount(false);
      showToast("Bank account saved");
    } catch (e) {
      showToast(errMsg(e, "Couldn't save bank account"));
    } finally {
      setSavingAccount(false);
    }
  }

  async function handleRequestPayout() {
    const available = balance?.available ?? 0;
    if (available <= 0) {
      showToast("No funds available to withdraw");
      return;
    }
    if (!payoutAccount) {
      showToast("Add a bank account first");
      setEditingAccount(true);
      return;
    }
    Alert.alert(
      "Request payout?",
      `Withdraw ${formatCurrency2(available)} to ${payoutAccount.bank_name} ${payoutAccount.account_number}. The Evend team will transfer it and mark it paid.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Request",
          onPress: async () => {
            setPayoutLoading(true);
            try {
              const { amount } = await requestPayout(null);
              await loadPayouts();
              showToast(`Payout of ${formatCurrency2(amount)} requested`);
            } catch (e) {
              showToast(errMsg(e, "Couldn't request payout"));
            } finally {
              setPayoutLoading(false);
            }
          },
        },
      ],
    );
  }

  async function handleCancelPayout(id: string) {
    setCancellingPayoutId(id);
    try {
      await cancelPayout(id);
      await loadPayouts();
      showToast("Payout request cancelled");
    } catch (e) {
      showToast(errMsg(e, "Couldn't cancel payout"));
    } finally {
      setCancellingPayoutId(null);
    }
  }

  // ── Sub-view header ──
  function SubHeader({ title }: { title: string }) {
    return (
      <>
        <StatusBar style="light" />
        <View style={st.subHeader}>
          <Pressable onPress={() => setView("home")} style={st.subBackBtn}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>
          <Text style={st.subHeaderTitle}>{title}</Text>
          <View style={{ width: 36 }} />
        </View>
      </>
    );
  }

  // ── Loading ──

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar style="light" />
        <ScreenHeader title="My Shop" onBack={onBack} />
        <View style={st.center}><ActivityIndicator color={C.accent} size="large" /></View>
      </SafeAreaView>
    );
  }

  // ══════════════════ HOME / DASHBOARD ══════════════════
  if (view === "home") {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar style="light" />
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

          {/* Payout Setup Alert */}
          {payoutsLoading ? (
            <View style={[st.shipAlert, st.payoutSkeleton]}>
              <View style={[st.shipAlertIcon, { backgroundColor: C.elevated }]} />
              <View style={st.shipAlertInfo}>
                <View style={st.skeletonLineWide} />
                <View style={st.skeletonLineNarrow} />
              </View>
            </View>
          ) : payoutsError ? (
            <Pressable
              style={[st.shipAlert, { backgroundColor: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.25)" }]}
              onPress={() => { setPayoutsLoading(true); loadPayouts(); }}
            >
              <View style={[st.shipAlertIcon, { backgroundColor: "#EF4444" }]}>
                <Ionicons name="alert-circle-outline" size={20} color="#fff" />
              </View>
              <View style={st.shipAlertInfo}>
                <Text style={[st.shipAlertTitle, { color: "#EF4444" }]}>Couldn't load payouts</Text>
                <Text style={st.shipAlertSub}>Tap to retry</Text>
              </View>
              <Feather name="refresh-cw" size={16} color="#EF4444" />
            </Pressable>
          ) : store && !payoutAccount ? (
            <Pressable style={st.shipAlert} onPress={() => setView("payouts")}>
              <View style={[st.shipAlertIcon, { backgroundColor: "#10B981" }]}>
                <Ionicons name="card-outline" size={20} color="#fff" />
              </View>
              <View style={st.shipAlertInfo}>
                <Text style={st.shipAlertTitle}>Set up payouts</Text>
                <Text style={st.shipAlertSub}>Add a bank account to withdraw your sales earnings</Text>
              </View>
              <Feather name="chevron-right" size={16} color={C.accent} />
            </Pressable>
          ) : store && (balance?.available ?? 0) > 0 && !payouts.some((p) => p.status === "requested") ? (
            <Pressable style={st.shipAlert} onPress={() => setView("payouts")}>
              <View style={[st.shipAlertIcon, { backgroundColor: "#10B981" }]}>
                <Ionicons name="cash-outline" size={20} color="#fff" />
              </View>
              <View style={st.shipAlertInfo}>
                <Text style={st.shipAlertTitle}>{formatCurrency2(balance?.available ?? 0)} ready to withdraw</Text>
                <Text style={st.shipAlertSub}>Tap to request a payout to your bank</Text>
              </View>
              <Feather name="chevron-right" size={16} color={C.accent} />
            </Pressable>
          ) : null}

          {/* To Ship Alert */}
          {orderCounts.confirmed > 0 && (
            <Pressable style={st.shipAlert} onPress={() => goToOrders("confirmed")}>
              <View style={st.shipAlertIcon}>
                <Ionicons name="cube-outline" size={20} color="#fff" />
              </View>
              <View style={st.shipAlertInfo}>
                <Text style={st.shipAlertTitle}>
                  {orderCounts.confirmed} order{orderCounts.confirmed === 1 ? "" : "s"} to ship
                </Text>
                <Text style={st.shipAlertSub}>Tap to view and ship orders</Text>
              </View>
              <Feather name="chevron-right" size={16} color={C.accent} />
            </Pressable>
          )}

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
              { key: "pending" as const, label: "Unpaid", icon: "time-outline", color: "#F59E0B" },
              { key: "confirmed" as const, label: "To Ship", icon: "cube-outline", color: C.accent },
              { key: "shipped" as const, label: "Shipping", icon: "airplane-outline", color: "#8B5CF6" },
              { key: "delivered" as const, label: "Completed", icon: "checkmark-done-circle-outline", color: C.success },
              { key: "cancelled" as const, label: "Cancelled", icon: "close-circle-outline", color: "#EF4444" },
              { key: "refunded" as const, label: "Refunded", icon: "receipt-outline", color: "#6B7280" },
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
              { icon: "bar-chart-outline", label: "Performance", color: C.success, bg: "rgba(34,197,94,0.1)", onPress: () => setView("performance") },
              { icon: "alert-circle-outline", label: "Disputes", color: "#EF4444", bg: "rgba(239,68,68,0.1)", onPress: () => setView("disputes"), badge: openDisputeCount },
              { icon: "card-outline", label: "Payouts", color: "#10B981", bg: "rgba(16,185,129,0.1)", onPress: () => setView("payouts") },
              { icon: "add-circle-outline", label: "New Listing", color: C.accent, bg: "rgba(44,128,255,0.1)", onPress: () => push({ type: "CREATE_LISTING" }) },
              { icon: "add-circle-outline", label: "New Auction", color: "#F59E0B", bg: "rgba(245,158,11,0.1)", onPress: () => push({ type: "CREATE_AUCTION" }) },
            ].map((tool, i) => (
              <Pressable key={i} style={st.toolTile} onPress={tool.onPress}>
                <View style={[st.toolIcon, { backgroundColor: tool.bg }]}>
                  <Ionicons name={tool.icon as any} size={24} color={tool.color} />
                  {"badge" in tool && (tool as any).badge > 0 && (
                    <View style={st.toolBadge}>
                      <Text style={st.toolBadgeText}>{(tool as any).badge > 99 ? "99+" : (tool as any).badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={st.toolLabel}>{tool.label}</Text>
              </Pressable>
            ))}
          </View>

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

        {ordersLoading && orderItems.length === 0 ? (
          <View style={st.center}>
            <ActivityIndicator size="large" color={C.accent} />
          </View>
        ) : filteredOrders.length === 0 ? (
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            refreshControl={
              <RefreshControl tintColor={C.accent} refreshing={refreshingOrders} onRefresh={refreshOrders} />
            }
          >
            <View style={[st.emptyCard, { margin: S.screenPadding, marginTop: 40 }]}>
              <Ionicons name="receipt-outline" size={36} color={C.textMuted} />
              <Text style={st.emptyTitle}>
                {orderFilter === "all" ? "No Orders Yet" : `No ${FULFILLMENT_CONFIG[orderFilter as FulfillmentStatus]?.label ?? orderFilter} orders`}
              </Text>
              <Text style={st.emptySub}>
                {orderFilter === "all" ? "When buyers purchase your items, orders appear here" : "Try a different filter"}
              </Text>
            </View>
          </ScrollView>
        ) : (
          <FlatList
            data={filteredOrders}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: S.screenPadding, paddingBottom: 40, paddingTop: 4 }}
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews
            refreshControl={
              <RefreshControl tintColor={C.accent} refreshing={refreshingOrders} onRefresh={refreshOrders} />
            }
            renderItem={({ item: oi }) => {
              const cfg = FULFILLMENT_CONFIG[oi.fulfillment_status] ?? FULFILLMENT_CONFIG.pending;
              const action = oi.source !== "auction" ? vendorNextAction(oi.fulfillment_status) : null;
              const imgUrl = oi.listing?.images?.[0];
              const buyerDisplay = oi.order?.buyer?.display_name ?? oi.order?.buyer?.username ?? "Buyer";
              const buyerHandle = oi.order?.buyer?.username ? `@${oi.order.buyer.username}` : null;
              const buyerId = oi.order?.buyer_id ? oi.order.buyer_id.slice(0, 8).toUpperCase() : null;

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
                        <Text style={st.orderBuyerName}>{buyerDisplay}</Text>
                        {buyerHandle && <Text style={st.orderBuyerHandle}>{buyerHandle}</Text>}
                      </View>
                      {buyerId && (
                        <Text style={st.orderBuyerId}>ID: {buyerId}</Text>
                      )}
                    </View>
                    <View style={st.orderPriceCol}>
                      <Text style={st.orderPrice}>{formatCurrency(oi.quantity * Number(oi.unit_price))}</Text>
                      <Text style={st.orderDate}>{relativeTime(oi.created_at)}</Text>
                    </View>
                  </View>

                  {/* Ship-by deadline for confirmed (paid, unshipped) orders */}
                  {oi.fulfillment_status === "confirmed" && oi.ship_deadline && oi.source !== "auction" && (() => {
                    const ms = new Date(oi.ship_deadline).getTime() - Date.now();
                    const overdue = ms < 0;
                    const days = Math.ceil(Math.abs(ms) / (24 * 60 * 60 * 1000));
                    return (
                      <View style={[st.shipByRow, overdue && st.shipByOverdue]}>
                        <Ionicons
                          name={overdue ? "alert-circle-outline" : "time-outline"}
                          size={13}
                          color={overdue ? "#EF4444" : "#F59E0B"}
                        />
                        <Text style={[st.shipByText, { color: overdue ? "#EF4444" : "#F59E0B" }]}>
                          {overdue
                            ? `Overdue by ${days} day${days !== 1 ? "s" : ""} — ship now or the buyer can cancel`
                            : `Ship within ${days} day${days !== 1 ? "s" : ""}`}
                        </Text>
                      </View>
                    );
                  })()}

                  {/* Tracking number display */}
                  {oi.tracking_number && (
                    <View style={st.trackingRow}>
                      <Ionicons name="locate-outline" size={13} color={C.textAccent} />
                      <Text style={st.trackingLabel}>Tracking:</Text>
                      <Text style={st.trackingNumber}>{oi.tracking_number}</Text>
                    </View>
                  )}

                  {/* Shipping address — where to send the parcel */}
                  {oi.source !== "auction" && oi.order?.shipping_address?.address_line1 ? (
                    (() => {
                      const a = oi.order.shipping_address!;
                      const line2 = [a.address_line2, [a.zip, a.city].filter(Boolean).join(" "), a.state]
                        .filter(Boolean)
                        .join(", ");
                      const copyText = [
                        a.full_name,
                        a.address_line1,
                        a.address_line2,
                        [a.zip, a.city].filter(Boolean).join(" "),
                        a.state,
                        a.country,
                        a.phone ? `Phone: ${a.phone}` : null,
                      ]
                        .filter(Boolean)
                        .join("\n");
                      return (
                        <View style={st.shipAddrRow}>
                          <Ionicons name="location-outline" size={14} color={C.textAccent} style={{ marginTop: 1 }} />
                          <View style={{ flex: 1 }}>
                            <View style={st.shipAddrNameRow}>
                              <Text style={st.shipAddrName}>{a.full_name ?? "Recipient"}</Text>
                              {a.phone ? <Text style={st.shipAddrPhone}>{a.phone}</Text> : null}
                            </View>
                            <Text style={st.shipAddrText} selectable>{a.address_line1}</Text>
                            {line2 ? <Text style={st.shipAddrText} selectable>{line2}</Text> : null}
                          </View>
                          <Pressable
                            style={st.shipCopyBtn}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel="Copy shipping address"
                            onPress={async () => {
                              await Clipboard.setStringAsync(copyText);
                              showToast("Address copied");
                            }}
                          >
                            <Feather name="copy" size={13} color={C.textAccent} />
                            <Text style={st.shipCopyText}>Copy</Text>
                          </Pressable>
                        </View>
                      );
                    })()
                  ) : oi.source !== "auction" ? (
                    <View style={st.shipAddrRow}>
                      <Ionicons name="location-outline" size={14} color={C.textMuted} style={{ marginTop: 1 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={st.shipAddrName}>Address not provided</Text>
                        <Text style={st.shipAddrText}>Ask the buyer for a delivery address before shipping.</Text>
                      </View>
                      <Pressable
                        style={st.shipCopyBtn}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Message buyer"
                        onPress={() => messageBuyer(oi)}
                      >
                        <Feather name="message-circle" size={13} color={C.textAccent} />
                        <Text style={st.shipCopyText}>Message</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {/* Unpaid auction win — vendor waits for the buyer to pay */}
                  {oi.source === "auction" && oi.fulfillment_status === "pending" && (
                    <View style={st.waitingRow}>
                      <Ionicons name="time-outline" size={14} color="#F59E0B" />
                      <Text style={st.waitingText}>Waiting for buyer to pay</Text>
                    </View>
                  )}

                  {oi.source !== "auction" && (action || oi.fulfillment_status === "pending" || oi.fulfillment_status === "confirmed") && (
                    <View style={st.orderActions}>
                      {(oi.fulfillment_status === "pending" || oi.fulfillment_status === "confirmed") && (
                        <Pressable
                          style={[st.orderActionBtn, st.orderActionDanger]}
                          onPress={() => {
                            Alert.alert(
                              "Cancel Order?",
                              "This cancels the order for the buyer and refunds their payment to its original source (card, voucher, or wallet). Stock is returned to your listing. This can't be undone.",
                              [
                                { text: "Keep", style: "cancel" },
                                { text: "Cancel Order", style: "destructive", onPress: () => handleCancelOrder(oi.id, oi.order_id) },
                              ],
                            );
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
      { id: "all", label: "All", count: myListings.length },
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
              {listingFilter === "active" ? "No live products" : listingFilter === "all" ? "No products yet" : `No ${listingFilter} products`}
            </Text>
            <Text style={st.emptySub}>Create a listing to start selling</Text>
            <Pressable style={st.emptyCtaBtn} onPress={() => push({ type: "CREATE_LISTING" })}>
              <Ionicons name="add" size={16} color={C.textHero} />
              <Text style={st.emptyCtaText}>Add New Product</Text>
            </Pressable>
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
                      onPress={() => push({ type: "EDIT_LISTING", listingId: item.id })}
                    >
                      <Text style={st.prodActionEditText}>Edit</Text>
                    </Pressable>
                    <View style={{ flex: 1 }} />
                    {store && (
                      <Pressable
                        style={[st.prodActionBtnFeature, isDisplayed && st.prodActionBtnFeatureActive]}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={isDisplayed ? "Remove from featured" : "Add to featured"}
                        onPress={() =>
                          isDisplayed
                            ? removeDisplayItem(displayItems.find((d) => d.listing_id === item.id)!.id)
                            : addDisplayItem(item.id)
                        }
                      >
                        <Ionicons name={isDisplayed ? "star" : "star-outline"} size={16} color={isDisplayed ? "#F59E0B" : C.textMuted} />
                        <Text style={[st.prodActionFeatureText, isDisplayed && { color: "#F59E0B" }]}>
                          {isDisplayed ? "Featured" : "Feature"}
                        </Text>
                      </Pressable>
                    )}
                  </View>
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
                <View style={st.prodCard}>
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
                </View>
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

  // ══════════════════ PERFORMANCE / ANALYTICS ══════════════════
  if (view === "performance") {
    // All orders that represent a real sale (everything except cancelled/refunded)
    const allSoldItems = orderItems.filter(
      (oi) => oi.fulfillment_status !== "cancelled" && oi.fulfillment_status !== "refunded"
    );
    const deliveredItems = allSoldItems.filter(
      (oi) => oi.fulfillment_status === "delivered"
    );

    const totalRevenue = allSoldItems.reduce(
      (sum, oi) => sum + oi.quantity * Number(oi.unit_price),
      0
    );
    const completedRevenue = deliveredItems.reduce(
      (sum, oi) => sum + oi.quantity * Number(oi.unit_price),
      0
    );
    const pendingRevenue = totalRevenue - completedRevenue;
    const totalSales = allSoldItems.reduce((sum, oi) => sum + oi.quantity, 0);
    const avgOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;

    const totalViews = myListings.reduce((sum, l) => sum + (l.views ?? 0), 0)
      + myAuctions.reduce((sum, a) => sum + (a.views ?? 0), 0);
    const conversionRate = totalViews > 0 ? ((totalSales / totalViews) * 100) : 0;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - (dayOfWeek - 1));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const revenueFor = (since: Date) =>
      allSoldItems
        .filter((oi) => new Date(oi.created_at) >= since)
        .reduce((s, oi) => s + oi.quantity * Number(oi.unit_price), 0);

    const salesFor = (since: Date) =>
      allSoldItems
        .filter((oi) => new Date(oi.created_at) >= since)
        .reduce((s, oi) => s + oi.quantity, 0);

    const todayRevenue = revenueFor(startOfToday);
    const weekRevenue = revenueFor(startOfWeek);
    const monthRevenue = revenueFor(startOfMonth);
    const todaySales = salesFor(startOfToday);
    const weekSales = salesFor(startOfWeek);
    const monthSales = salesFor(startOfMonth);

    // Top sellers by revenue (all sold, not just delivered)
    const itemRevMap: Record<string, { name: string; revenue: number; qty: number }> = {};
    for (const oi of allSoldItems) {
      const name = oi.listing?.card_name ?? "Unknown";
      const key = oi.listing_id || name;
      if (!itemRevMap[key]) itemRevMap[key] = { name, revenue: 0, qty: 0 };
      itemRevMap[key].revenue += oi.quantity * Number(oi.unit_price);
      itemRevMap[key].qty += oi.quantity;
    }
    const topSellers = Object.values(itemRevMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return (
      <SafeAreaView style={st.safe}>
        <SubHeader title="Performance" />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: S.screenPadding, paddingBottom: 40 }}>

          {/* Revenue Hero */}
          <View style={st.perfHero}>
            <Text style={st.perfHeroLabel}>Total Revenue</Text>
            <Text style={st.perfHeroValue}>{formatCurrency(totalRevenue)}</Text>
            {pendingRevenue > 0 && (
              <Text style={st.perfHeroPending}>
                {formatCurrency(completedRevenue)} completed · {formatCurrency(pendingRevenue)} pending
              </Text>
            )}
          </View>

          {/* Key Metrics Row */}
          <View style={st.perfMetricsRow}>
            <View style={st.perfMetricCard}>
              <Ionicons name="cart-outline" size={18} color={C.accent} />
              <Text style={st.perfMetricValue}>{totalSales}</Text>
              <Text style={st.perfMetricLabel}>Items Sold</Text>
            </View>
            <View style={st.perfMetricCard}>
              <Ionicons name="pricetag-outline" size={18} color="#8B5CF6" />
              <Text style={st.perfMetricValue}>{formatCurrency(avgOrderValue)}</Text>
              <Text style={st.perfMetricLabel}>Avg. Item Value</Text>
            </View>
            <View style={st.perfMetricCard}>
              <Ionicons name="eye-outline" size={18} color="#F59E0B" />
              <Text style={st.perfMetricValue}>{totalViews.toLocaleString()}</Text>
              <Text style={st.perfMetricLabel}>Total Views</Text>
            </View>
          </View>

          {/* Conversion Rate */}
          <View style={st.perfConversion}>
            <View style={st.perfConvLeft}>
              <Ionicons name="trending-up" size={20} color={C.success} />
              <Text style={st.perfConvLabel}>Conversion Rate</Text>
            </View>
            <Text style={st.perfConvValue}>{conversionRate.toFixed(1)}%</Text>
          </View>

          {/* Period Breakdown */}
          <Text style={st.perfSectionTitle}>Revenue Breakdown</Text>
          <View style={st.perfPeriodGrid}>
            {[
              { label: "Today", rev: todayRevenue, sales: todaySales, icon: "today-outline", color: C.accent },
              { label: "This Week", rev: weekRevenue, sales: weekSales, icon: "calendar-outline", color: "#8B5CF6" },
              { label: "This Month", rev: monthRevenue, sales: monthSales, icon: "calendar-number-outline", color: "#F59E0B" },
              { label: "All Time", rev: totalRevenue, sales: totalSales, icon: "infinite-outline", color: C.success },
            ].map((p) => (
              <View key={p.label} style={st.perfPeriodCard}>
                <View style={st.perfPeriodHeader}>
                  <Ionicons name={p.icon as any} size={16} color={p.color} />
                  <Text style={st.perfPeriodLabel}>{p.label}</Text>
                </View>
                <Text style={st.perfPeriodValue}>{formatCurrency(p.rev)}</Text>
                <Text style={st.perfPeriodSales}>{p.sales} sold</Text>
              </View>
            ))}
          </View>

          {/* Order Status Breakdown */}
          <Text style={st.perfSectionTitle}>Order Status</Text>
          <View style={st.perfStatusList}>
            {[
              { label: "Completed", count: orderCounts.delivered, color: C.success, icon: "checkmark-done-circle-outline" },
              { label: "To Ship", count: orderCounts.confirmed, color: C.accent, icon: "cube-outline" },
              { label: "Shipping", count: orderCounts.shipped, color: "#8B5CF6", icon: "airplane-outline" },
              { label: "Unpaid", count: orderCounts.pending, color: "#F59E0B", icon: "time-outline" },
              { label: "Cancelled", count: orderCounts.cancelled, color: "#EF4444", icon: "close-circle-outline" },
            ].map((s) => (
              <View key={s.label} style={st.perfStatusRow}>
                <View style={st.perfStatusLeft}>
                  <View style={[st.perfStatusDot, { backgroundColor: s.color }]} />
                  <Ionicons name={s.icon as any} size={16} color={s.color} />
                  <Text style={st.perfStatusLabel}>{s.label}</Text>
                </View>
                <Text style={[st.perfStatusCount, { color: s.color }]}>{s.count}</Text>
              </View>
            ))}
          </View>

          {/* Inventory Summary */}
          <Text style={st.perfSectionTitle}>Inventory</Text>
          <View style={st.perfMetricsRow}>
            <View style={st.perfMetricCard}>
              <Ionicons name="layers-outline" size={18} color={C.accent} />
              <Text style={st.perfMetricValue}>{activeListingCount}</Text>
              <Text style={st.perfMetricLabel}>Active Listings</Text>
            </View>
            <View style={st.perfMetricCard}>
              <Ionicons name="hammer-outline" size={18} color="#F59E0B" />
              <Text style={st.perfMetricValue}>
                {myAuctions.filter((a) => a.status === "active").length}
              </Text>
              <Text style={st.perfMetricLabel}>Active Auctions</Text>
            </View>
            <View style={st.perfMetricCard}>
              <Ionicons name="people-outline" size={18} color="#8B5CF6" />
              <Text style={st.perfMetricValue}>
                {myAuctions.reduce((s, a) => s + (a.watchers ?? 0), 0)}
              </Text>
              <Text style={st.perfMetricLabel}>Watchers</Text>
            </View>
          </View>

          {/* Top Selling Items */}
          {topSellers.length > 0 && (
            <>
              <Text style={st.perfSectionTitle}>Top Sellers</Text>
              {topSellers.map((item, idx) => (
                <View key={idx} style={st.perfTopRow}>
                  <View style={st.perfTopRank}>
                    <Text style={st.perfTopRankText}>#{idx + 1}</Text>
                  </View>
                  <View style={st.perfTopInfo}>
                    <Text style={st.perfTopName} numberOfLines={1}>{item.name}</Text>
                    <Text style={st.perfTopMeta}>{item.qty} sold</Text>
                  </View>
                  <Text style={st.perfTopRevenue}>{formatCurrency(item.revenue)}</Text>
                </View>
              ))}
            </>
          )}

        </ScrollView>
      </SafeAreaView>
    );
  }

  // ══════════════════ PAYOUTS ══════════════════
  if (view === "payouts") {
    const available = balance?.available ?? 0;
    const pendingPayout = payouts.find((p) => p.status === "requested") ?? null;
    const canRequest = available > 0 && !!payoutAccount && !pendingPayout && !payoutLoading;
    const showForm = editingAccount || !payoutAccount;
    return (
      <SafeAreaView style={st.safe}>
        <SubHeader title="Payouts" />
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={st.homeScroll}
        >
          {payoutsLoading ? (
            <View style={st.payoutStateWrap}>
              <ActivityIndicator size="large" color={C.accent} />
              <Text style={st.payoutStateText}>Loading your payouts…</Text>
            </View>
          ) : payoutsError ? (
            <View style={st.payoutStateWrap}>
              <Ionicons name="cloud-offline-outline" size={40} color={C.textMuted} />
              <Text style={st.payoutStateText}>Couldn't load your payout details.</Text>
              <Pressable
                style={st.payoutRetryBtn}
                onPress={() => { setPayoutsLoading(true); loadPayouts(); }}
              >
                <Text style={st.payoutRetryText}>Try again</Text>
              </Pressable>
            </View>
          ) : (
          <>
          {/* Balance */}
          <View style={st.payoutBalanceCard}>
            <Text style={st.earningsLabel}>Available to withdraw</Text>
            <Text style={st.payoutBalanceValue}>{formatCurrency2(available)}</Text>
            <View style={st.payoutStatRow}>
              <View style={st.payoutStat}>
                <Text style={st.payoutStatValue}>{formatCurrency2(balance?.in_escrow ?? 0)}</Text>
                <Text style={st.payoutStatLabel}>In escrow</Text>
              </View>
              <View style={st.payoutStatSep} />
              <View style={st.payoutStat}>
                <Text style={st.payoutStatValue}>{formatCurrency2(balance?.pending ?? 0)}</Text>
                <Text style={st.payoutStatLabel}>Pending</Text>
              </View>
              <View style={st.payoutStatSep} />
              <View style={st.payoutStat}>
                <Text style={st.payoutStatValue}>{formatCurrency2(balance?.lifetime_paid ?? 0)}</Text>
                <Text style={st.payoutStatLabel}>Paid out</Text>
              </View>
            </View>
            <Text style={st.earningsHint}>
              Escrow is released once the buyer receives the order and the dispute window closes. Amounts shown are what you receive after a {Math.round((balance?.fee_rate ?? 0.05) * 100)}% platform fee.
            </Text>
          </View>

          {/* Request / pending */}
          {pendingPayout ? (
            <View style={st.pendingCard}>
              <View style={st.pendingIcon}>
                <Ionicons name="time-outline" size={18} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.pendingTitle}>Payout requested</Text>
                <Text style={st.pendingSub}>
                  {formatCurrency2(pendingPayout.amount)} · the Evend team will transfer it to your bank
                </Text>
              </View>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    "Cancel payout request?",
                    `This withdrawal request of ${formatCurrency2(pendingPayout.amount)} will be cancelled and the funds returned to your available balance.`,
                    [
                      { text: "Keep Request", style: "cancel" },
                      { text: "Cancel Payout", style: "destructive", onPress: () => handleCancelPayout(pendingPayout.id) },
                    ],
                  )
                }
                disabled={cancellingPayoutId === pendingPayout.id}
                style={st.pendingCancel}
              >
                {cancellingPayoutId === pendingPayout.id ? (
                  <ActivityIndicator size="small" color={C.textSecondary} />
                ) : (
                  <Text style={st.pendingCancelText}>Cancel</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={[st.payoutBtn, !canRequest && { opacity: 0.5 }]}
              onPress={handleRequestPayout}
              disabled={!canRequest}
            >
              {payoutLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="cash-outline" size={18} color="#fff" />
                  <Text style={st.payoutBtnText}>
                    {available > 0 ? `Withdraw ${formatCurrency2(available)}` : "No funds to withdraw"}
                  </Text>
                </>
              )}
            </Pressable>
          )}

          {!pendingPayout && !canRequest && !payoutLoading && (
            <Text style={st.withdrawHint}>
              {!payoutAccount
                ? "Add a bank account below before you can withdraw."
                : available <= 0
                  ? "No funds available yet. Earnings become available after the buyer confirms receipt and the dispute window closes."
                  : "Withdrawals are temporarily unavailable. Please try again shortly."}
            </Text>
          )}

          {/* Bank account */}
          <View style={st.payoutSectionHead}>
            <Text style={st.payoutSectionTitle}>Bank account</Text>
            {payoutAccount && !showForm && (
              <Pressable onPress={() => setEditingAccount(true)} hitSlop={8}>
                <Text style={st.payoutEditLink}>Edit</Text>
              </Pressable>
            )}
          </View>

          {!showForm && payoutAccount ? (
            <View style={st.bankCard}>
              <View style={st.bankIcon}>
                <Ionicons name="business-outline" size={18} color={C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.bankHolder}>{payoutAccount.account_holder}</Text>
                <Text style={st.bankLine}>
                  {payoutAccount.bank_name} · {payoutAccount.account_number}
                </Text>
              </View>
            </View>
          ) : (
            <View style={st.bankForm}>
              <Text style={st.payoutInputLabel}>Account holder name</Text>
              <TextInput
                style={st.payoutInput}
                value={paHolder}
                onChangeText={setPaHolder}
                placeholder="As shown on your bank account"
                placeholderTextColor={C.textMuted}
              />
              <Text style={st.payoutInputLabel}>Bank</Text>
              <Pressable
                style={st.bankSelect}
                onPress={() => setBankOpen((o) => !o)}
              >
                <Text style={[st.bankSelectText, !bankIsOther && !paBank && { color: C.textMuted }]}>
                  {bankIsOther ? OTHER_BANK : paBank || "Select your bank"}
                </Text>
                <Ionicons name={bankOpen ? "chevron-up" : "chevron-down"} size={18} color={C.textMuted} />
              </Pressable>
              {bankOpen && (
                <View style={st.bankDropdown}>
                  <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {MALAYSIAN_BANKS.map((b) => {
                      const active = !bankIsOther && paBank === b;
                      return (
                        <Pressable
                          key={b}
                          style={[st.bankOption, active && st.bankOptionActive]}
                          onPress={() => {
                            setBankIsOther(false);
                            setPaBank(b);
                            setBankOpen(false);
                          }}
                        >
                          <Text style={[st.bankOptionText, active && { color: C.accent }]}>{b}</Text>
                          {active && <Ionicons name="checkmark" size={16} color={C.accent} />}
                        </Pressable>
                      );
                    })}
                    <Pressable
                      style={[st.bankOption, bankIsOther && st.bankOptionActive]}
                      onPress={() => {
                        setBankIsOther(true);
                        setPaBank("");
                        setBankOpen(false);
                      }}
                    >
                      <Text style={[st.bankOptionText, bankIsOther && { color: C.accent }]}>{OTHER_BANK}</Text>
                      {bankIsOther && <Ionicons name="checkmark" size={16} color={C.accent} />}
                    </Pressable>
                  </ScrollView>
                </View>
              )}
              {bankIsOther && (
                <TextInput
                  style={[st.payoutInput, { marginTop: 8 }]}
                  value={paBank}
                  onChangeText={setPaBank}
                  placeholder="Enter your bank name"
                  placeholderTextColor={C.textMuted}
                  autoFocus
                />
              )}
              <Text style={st.payoutInputLabel}>Account number</Text>
              <TextInput
                style={st.payoutInput}
                value={paAccount}
                onChangeText={setPaAccount}
                placeholder="Your bank account number"
                placeholderTextColor={C.textMuted}
                keyboardType="number-pad"
              />
              <View style={st.bankFormBtnRow}>
                {payoutAccount && (
                  <Pressable
                    style={st.bankCancelBtn}
                    onPress={() => {
                      setEditingAccount(false);
                      setBankOpen(false);
                      setPaHolder(payoutAccount.account_holder ?? "");
                      setPaBank(payoutAccount.bank_name ?? "");
                      setPaAccount(payoutAccount.account_number ?? "");
                      setBankIsOther(!!payoutAccount.bank_name && !MALAYSIAN_BANKS.includes(payoutAccount.bank_name));
                    }}
                  >
                    <Text style={st.bankCancelText}>Cancel</Text>
                  </Pressable>
                )}
                <Pressable
                  style={[st.bankSaveBtn, savingAccount && { opacity: 0.6 }]}
                  onPress={handleSaveAccount}
                  disabled={savingAccount}
                >
                  {savingAccount ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={st.bankSaveText}>Save bank account</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}

          {/* History */}
          {payouts.length === 0 ? (
            <>
              <Text style={[st.payoutSectionTitle, { marginTop: 22, marginBottom: 10 }]}>Payout history</Text>
              <View style={st.historyEmptyCard}>
                <Ionicons name="receipt-outline" size={22} color={C.textMuted} />
                <Text style={st.historyEmptyText}>No payouts yet</Text>
                <Text style={st.historyEmptySub}>Your withdrawal requests will appear here.</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={[st.payoutSectionTitle, { marginTop: 22, marginBottom: 10 }]}>Payout history</Text>
              <View style={st.historyCard}>
                {payouts.map((p, i) => {
                  const meta = PAYOUT_STATUS_META[p.status];
                  return (
                    <View key={p.id}>
                      {i > 0 && <View style={st.historyDivider} />}
                      <View style={st.historyRow}>
                        <View style={[st.historyIcon, { backgroundColor: meta.color + "1A" }]}>
                          <Ionicons name={meta.icon} size={16} color={meta.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={st.historyLabel}>{formatCurrency2(p.amount)}</Text>
                          <Text style={st.historyDate}>
                            {new Date(p.created_at).toLocaleDateString("en-MY", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                            {p.reference ? ` · Ref ${p.reference}` : ""}
                          </Text>
                          {p.status === "rejected" && p.note ? (
                            <Text style={st.historyNote}>{p.note}</Text>
                          ) : null}
                        </View>
                        <View style={[st.payoutBadge, { backgroundColor: meta.color + "22" }]}>
                          <Text style={[st.payoutBadgeText, { color: meta.color }]}>{meta.label}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          <View style={st.payoutNoteRow}>
            <Ionicons name="information-circle-outline" size={14} color={C.textMuted} />
            <Text style={st.payoutNoteText}>
              Payouts are processed manually by the Evend team via bank transfer, usually within 1–3 business days of your request.
            </Text>
          </View>
          </>
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

  if (view === "disputes") {
    return <DisputesView userId={userId ?? ""} onBack={() => setView("home")} />;
  }

  // ══════════════════ STORE SETTINGS ══════════════════

  const pickerListings = myListings
    .filter((l) => l.status === "active" && !displayItems.some((d) => d.listing_id === l.id))
    .filter((l) => {
      if (!pickerSearch.trim()) return true;
      const q = pickerSearch.toLowerCase();
      return (
        l.card_name.toLowerCase().includes(q) ||
        (l.edition ?? "").toLowerCase().includes(q)
      );
    });

  return (
    <SafeAreaView style={st.safe}>
      <SubHeader title="Store Settings" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.storeScroll}>

        {/* ── Store Preview ── */}
        <View style={[st.previewCard, { borderColor: themeColor + "40" }]}>
          {bannerLocalUri || bannerUrl.trim() ? (
            <Image source={{ uri: bannerLocalUri ?? bannerUrl }} style={st.previewBanner} />
          ) : (
            <View style={[st.previewBanner, { backgroundColor: themeColor + "22" }]}>
              <Ionicons name="image-outline" size={28} color={themeColor + "55"} />
            </View>
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

        {/* ── Store Details ── */}
        <Text style={st.formLabel}>Store Details</Text>
        <View style={st.formCard}>
          <View style={st.field}>
            <Text style={st.fieldLabel}>Store Name *</Text>
            <TextInput style={st.fieldInput} value={storeName} onChangeText={setStoreName} placeholder="Enter store name" placeholderTextColor={C.textMuted} />
            {!storeName.trim() && (
              <Text style={st.fieldError}>Store name is required to save.</Text>
            )}
          </View>
          <View style={st.field}>
            <Text style={st.fieldLabel}>Description</Text>
            <TextInput style={[st.fieldInput, st.fieldMulti]} value={storeDesc} onChangeText={setStoreDesc} placeholder="Tell buyers about your store" placeholderTextColor={C.textMuted} multiline numberOfLines={3} />
          </View>
          <View style={st.field}>
            <Text style={st.fieldLabel}>Specialties</Text>
            <TextInput
              style={st.fieldInput}
              value={specialtiesInput}
              onChangeText={setSpecialtiesInput}
              placeholder="e.g. Pokémon, Vintage, Graded slabs"
              placeholderTextColor={C.textMuted}
              autoCapitalize="words"
            />
            <Text style={st.fieldHint}>Comma-separated tags shown on your storefront.</Text>
          </View>
        </View>

        {/* ── Social Links ── */}
        <Text style={st.formLabel}>Social Links</Text>
        <View style={st.formCard}>
          <Text style={st.fieldHint}>
            Shown on your storefront once you're a verified seller.
          </Text>
          {SOCIAL_PLATFORMS.map((p) => (
            <View key={p.key} style={st.socialRow}>
              <View style={st.socialIcon}>
                <Feather name={p.icon} size={15} color={C.textSecondary} />
              </View>
              <View style={st.socialInputWrap}>
                <Text style={st.socialLabel}>{p.label}</Text>
                <TextInput
                  style={st.socialInput}
                  value={socialLinks[p.key] ?? ""}
                  onChangeText={(t) => setSocialLinks((prev) => ({ ...prev, [p.key]: t }))}
                  placeholder={p.placeholder}
                  placeholderTextColor={C.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
          ))}
        </View>

        {/* ── Branding ── */}
        <Text style={st.formLabel}>Branding</Text>
        <View style={st.formCard}>
          <View style={st.field}>
            <Text style={st.fieldLabel}>Store Logo</Text>
            <Pressable style={st.uploadBtn} onPress={() => pickImage("logo")}>
              {logoLocalUri || logoUrl.trim() ? (
                <Image source={{ uri: logoLocalUri ?? logoUrl }} style={st.uploadThumb} />
              ) : (
                <View style={st.uploadThumbEmpty}>
                  <Feather name="camera" size={14} color={C.textMuted} />
                </View>
              )}
              <Text style={st.uploadBtnText}>{logoLocalUri ? "Logo selected" : logoUrl ? "Change logo" : "Upload logo"}</Text>
              <Feather name="chevron-right" size={14} color={C.textMuted} style={{ marginLeft: "auto" }} />
            </Pressable>
          </View>
          <View style={st.field}>
            <Text style={st.fieldLabel}>Store Banner</Text>
            <Pressable style={st.uploadBtn} onPress={() => pickImage("banner")}>
              {bannerLocalUri || bannerUrl.trim() ? (
                <Image source={{ uri: bannerLocalUri ?? bannerUrl }} style={st.uploadThumbWide} />
              ) : (
                <View style={[st.uploadThumbEmpty, { width: 48, borderRadius: 6 }]}>
                  <Feather name="image" size={14} color={C.textMuted} />
                </View>
              )}
              <Text style={st.uploadBtnText}>{bannerLocalUri ? "Banner selected" : bannerUrl ? "Change banner" : "Upload banner"}</Text>
              <Feather name="chevron-right" size={14} color={C.textMuted} style={{ marginLeft: "auto" }} />
            </Pressable>
          </View>
          <View style={st.field}>
            <Text style={st.fieldLabel}>Theme Color</Text>
            <View style={st.colorRow}>
              {THEME_COLORS.map((color) => (
                <Pressable key={color} onPress={() => setThemeColor(color)} style={[st.colorDot, { backgroundColor: color }, themeColor === color && st.colorDotActive]}>
                  {themeColor === color && <Feather name="check" size={14} color="#fff" />}
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <Pressable style={[st.saveBtn, { backgroundColor: themeColor }]} onPress={handleSaveStore} disabled={saving || !storeName.trim()}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.saveBtnText}>{uploadingImage ? "Uploading images..." : store ? "Update Store" : "Create Store"}</Text>}
        </Pressable>

        {/* ── Display Items ── */}
        <View style={st.displaySectionHeader}>
          <View>
            <Text style={st.formLabel}>Display Items</Text>
            <Text style={st.displayHint}>Featured listings shown on your store page</Text>
          </View>
          <Text style={st.displayCount}>{displayItems.length}/10</Text>
        </View>

        {!store ? (
          <View style={st.emptyCard}>
            <Ionicons name="storefront-outline" size={28} color={C.textMuted} />
            <Text style={st.emptyTitle}>Create your store first</Text>
            <Text style={st.emptySub}>Save your store details above to get started</Text>
          </View>
        ) : (
          <View style={st.displayCard}>
            {displayItems.length === 0 ? (
              <View style={st.displayEmpty}>
                <Ionicons name="grid-outline" size={24} color={C.textMuted} />
                <Text style={st.displayEmptyText}>No featured items yet</Text>
              </View>
            ) : (
              displayItems.map((item, idx) => {
                const thumb = item.listing?.images?.[0];
                return (
                  <View key={item.id} style={[st.displayRow, idx < displayItems.length - 1 && st.displayRowBorder]}>
                    {thumb ? (
                      <Image source={{ uri: thumb }} style={st.displayThumb} />
                    ) : (
                      <View style={[st.displayThumb, { backgroundColor: C.elevated, alignItems: "center", justifyContent: "center" }]}>
                        <Ionicons name="image-outline" size={16} color={C.textMuted} />
                      </View>
                    )}
                    <View style={st.displayInfo}>
                      <Text style={st.displayName} numberOfLines={1}>{item.listing?.card_name ?? "Unknown"}</Text>
                      <Text style={st.displayMeta} numberOfLines={1}>
                        {[item.listing?.edition, item.listing?.grade].filter(Boolean).join(" · ") || "—"}
                      </Text>
                      <Text style={st.displayPrice}>{item.listing ? formatCurrency(Number(item.listing.price)) : "—"}</Text>
                    </View>
                    <View style={st.displayActions}>
                      <Pressable onPress={() => moveDisplayItem(item.id, "up")} style={[st.miniBtn, idx === 0 && { opacity: 0.3 }]} disabled={idx === 0} hitSlop={8}>
                        <Feather name="chevron-up" size={14} color={C.textPrimary} />
                      </Pressable>
                      <Pressable onPress={() => moveDisplayItem(item.id, "down")} style={[st.miniBtn, idx === displayItems.length - 1 && { opacity: 0.3 }]} disabled={idx === displayItems.length - 1} hitSlop={8}>
                        <Feather name="chevron-down" size={14} color={C.textPrimary} />
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          Alert.alert(
                            "Remove featured item?",
                            `"${item.listing?.card_name ?? "This item"}" will no longer be featured on your store page.`,
                            [
                              { text: "Keep", style: "cancel" },
                              { text: "Remove", style: "destructive", onPress: () => removeDisplayItem(item.id) },
                            ],
                          )
                        }
                        style={st.miniBtn}
                        hitSlop={8}
                      >
                        <Feather name="x" size={14} color={C.danger} />
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}

            {displayItems.length < 10 && (
              <Pressable
                style={st.addDisplayBtn}
                onPress={() => { setPickerSearch(""); setPickerVisible(true); }}
              >
                <Ionicons name="add-circle-outline" size={20} color={C.accent} />
                <Text style={st.addDisplayBtnText}>Add Item</Text>
              </Pressable>
            )}
          </View>
        )}

      </ScrollView>

      {/* ── Listing Picker Modal ── */}
      <Modal visible={pickerVisible} animationType="fade" transparent>
        <View style={st.pickerOverlay}>
          <View style={st.pickerSheet}>
            <View style={st.pickerHeader}>
              <Text style={st.pickerTitle}>Select a Listing</Text>
              <Pressable onPress={() => setPickerVisible(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={C.textPrimary} />
              </Pressable>
            </View>

            <View style={st.pickerSearchWrap}>
              <Feather name="search" size={16} color={C.textMuted} />
              <TextInput
                style={st.pickerSearchInput}
                value={pickerSearch}
                onChangeText={setPickerSearch}
                placeholder="Search listings..."
                placeholderTextColor={C.textMuted}
              />
              {pickerSearch.length > 0 && (
                <Pressable onPress={() => setPickerSearch("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={C.textMuted} />
                </Pressable>
              )}
            </View>

            <FlatList
              data={pickerListings}
              keyExtractor={(l) => l.id}
              contentContainerStyle={{ paddingBottom: 20 }}
              ListEmptyComponent={
                <View style={st.pickerEmpty}>
                  <Ionicons name="search-outline" size={24} color={C.textMuted} />
                  <Text style={st.pickerEmptyText}>
                    {pickerSearch ? "No matching listings" : "No active listings available"}
                  </Text>
                </View>
              }
              renderItem={({ item: listing }) => {
                const thumb = listing.images?.[0];
                return (
                  <Pressable
                    style={st.pickerRow}
                    onPress={async () => {
                      await addDisplayItem(listing.id);
                      setPickerVisible(false);
                    }}
                  >
                    {thumb ? (
                      <Image source={{ uri: thumb }} style={st.pickerThumb} />
                    ) : (
                      <View style={[st.pickerThumb, { backgroundColor: C.elevated, alignItems: "center", justifyContent: "center" }]}>
                        <Ionicons name="image-outline" size={18} color={C.textMuted} />
                      </View>
                    )}
                    <View style={st.pickerInfo}>
                      <Text style={st.pickerName} numberOfLines={1}>{listing.card_name}</Text>
                      <Text style={st.pickerMeta} numberOfLines={1}>
                        {[listing.edition, listing.grade].filter(Boolean).join(" · ")}
                      </Text>
                      <Text style={st.pickerPrice}>{formatCurrency(Number(listing.price))}</Text>
                    </View>
                    <View style={st.pickerAddIcon}>
                      <Ionicons name="add" size={18} color={C.accent} />
                    </View>
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
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

  shipAlert: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "rgba(44,128,255,0.08)", borderRadius: 12,
    borderWidth: 1, borderColor: "rgba(44,128,255,0.25)",
    padding: 14, marginBottom: 12,
  },
  shipAlertIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.accent,
    alignItems: "center", justifyContent: "center",
  },
  shipAlertInfo: { flex: 1, gap: 1 },
  shipAlertTitle: { color: C.accent, fontSize: 14, fontWeight: "800" },
  shipAlertSub: { color: C.textSecondary, fontSize: 11, fontWeight: "500" },
  payoutSkeleton: { backgroundColor: C.surface, borderColor: C.border },
  skeletonLineWide: {
    height: 12, width: "60%", borderRadius: 6, backgroundColor: C.elevated, marginBottom: 6,
  },
  skeletonLineNarrow: {
    height: 10, width: "40%", borderRadius: 5, backgroundColor: C.elevated,
  },

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
    flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24,
  },
  statusTile: {
    flexGrow: 1, flexBasis: "30%", alignItems: "center", justifyContent: "center",
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
  toolBadge: {
    position: "absolute", top: -4, right: -4,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: "#EF4444",
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 4,
  },
  toolBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900" },

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
  orderBuyerName: { color: C.textAccent, fontSize: 11, fontWeight: "700" },
  orderBuyerHandle: { color: C.textMuted, fontSize: 10, fontWeight: "600" },
  orderBuyerId: { color: C.textMuted, fontSize: 9, fontWeight: "600", marginTop: 1 },
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

  shipByRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingBottom: 10,
  },
  shipByOverdue: {},
  shipByText: { flex: 1, fontSize: 11, fontWeight: "700" },

  shipAddrRow: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(44,128,255,0.05)",
    borderWidth: 1,
    borderColor: C.border,
  },
  shipAddrNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  shipAddrName: { color: C.textPrimary, fontSize: 12, fontWeight: "800" },
  shipAddrPhone: { color: C.textSecondary, fontSize: 11, fontWeight: "600" },
  shipAddrText: { color: C.textSecondary, fontSize: 11, fontWeight: "500", lineHeight: 15, marginTop: 1 },
  shipCopyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  shipCopyText: { color: C.textAccent, fontSize: 11, fontWeight: "700" },

  waitingRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginHorizontal: 12, marginBottom: 10,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
    backgroundColor: "rgba(245,158,11,0.08)",
    borderWidth: 1, borderColor: "rgba(245,158,11,0.25)",
  },
  waitingText: { color: "#F59E0B", fontSize: 12, fontWeight: "700" },

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
  prodActionBtnFeature: {
    flexDirection: "row", alignItems: "center", gap: 5,
    height: 36, paddingHorizontal: 12, borderRadius: 8,
    borderWidth: 1, borderColor: C.border,
    justifyContent: "center", backgroundColor: C.surface,
  },
  prodActionBtnFeatureActive: { borderColor: "#F59E0B" },
  prodActionFeatureText: { color: C.textMuted, fontSize: 12, fontWeight: "700" },

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

  // ══ PERFORMANCE ══
  perfHero: {
    backgroundColor: C.surface, borderRadius: S.radiusCard, borderWidth: 1, borderColor: C.border,
    padding: 24, alignItems: "center", marginBottom: 16,
  },
  perfHeroLabel: { color: C.textSecondary, fontSize: 12, fontWeight: "600", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 },
  perfHeroValue: { color: C.success, fontSize: 36, fontWeight: "900" },
  perfHeroPending: { color: "#F59E0B", fontSize: 13, fontWeight: "600", marginTop: 4 },

  perfMetricsRow: { flexDirection: "row" as const, gap: 10, marginBottom: 16 },
  perfMetricCard: {
    flex: 1, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    padding: 14, alignItems: "center" as const, gap: 4,
  },
  perfMetricValue: { color: C.textPrimary, fontSize: 18, fontWeight: "900" },
  perfMetricLabel: { color: C.textSecondary, fontSize: 10, fontWeight: "600", textAlign: "center" as const },

  perfConversion: {
    flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const,
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    padding: 16, marginBottom: 20,
  },
  perfConvLeft: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
  perfConvLabel: { color: C.textPrimary, fontSize: 14, fontWeight: "700" },
  perfConvValue: { color: C.success, fontSize: 22, fontWeight: "900" },

  perfSectionTitle: {
    color: C.textPrimary, fontSize: 16, fontWeight: "800", marginBottom: 12, marginTop: 4,
  },

  perfPeriodGrid: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 10, marginBottom: 20 },
  perfPeriodCard: {
    width: "47%" as any, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    padding: 14,
  },
  perfPeriodHeader: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, marginBottom: 8 },
  perfPeriodLabel: { color: C.textSecondary, fontSize: 12, fontWeight: "600" },
  perfPeriodValue: { color: C.textPrimary, fontSize: 20, fontWeight: "900" },
  perfPeriodSales: { color: C.textSecondary, fontSize: 11, fontWeight: "500", marginTop: 2 },

  perfStatusList: {
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    padding: 4, marginBottom: 20,
  },
  perfStatusRow: {
    flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  perfStatusLeft: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
  perfStatusDot: { width: 8, height: 8, borderRadius: 4 },
  perfStatusLabel: { color: C.textPrimary, fontSize: 13, fontWeight: "600" },
  perfStatusCount: { fontSize: 16, fontWeight: "900" },

  perfTopRow: {
    flexDirection: "row" as const, alignItems: "center" as const,
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    padding: 12, marginBottom: 8, gap: 10,
  },
  perfTopRank: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: C.accentGlow,
    alignItems: "center" as const, justifyContent: "center" as const,
  },
  perfTopRankText: { color: C.accent, fontSize: 12, fontWeight: "900" },
  perfTopInfo: { flex: 1 },
  perfTopName: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  perfTopMeta: { color: C.textSecondary, fontSize: 11, fontWeight: "500", marginTop: 1 },
  perfTopRevenue: { color: C.success, fontSize: 14, fontWeight: "800" },

  // ══ STORE SETTINGS ══
  storeScroll: { paddingHorizontal: S.screenPadding, paddingBottom: 60, paddingTop: S.lg },

  previewCard: {
    borderRadius: S.radiusCard, borderWidth: 1, backgroundColor: C.surface,
    overflow: "hidden", marginBottom: S.xl,
  },
  previewBanner: { height: 100, width: "100%", alignItems: "center" as const, justifyContent: "center" as const },
  previewBody: { padding: S.lg },
  previewLogoRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: S.md, marginTop: -36 },
  previewLogo: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 2, overflow: "hidden" as const,
    alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: C.bg,
  },
  previewInfo: { flex: 1, paddingTop: 14 },
  previewName: { color: C.textPrimary, fontSize: 16, fontWeight: "800" },
  previewDesc: { color: C.textSecondary, fontSize: 12, fontWeight: "500", marginTop: 2 },

  formLabel: {
    color: C.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.8,
    textTransform: "uppercase" as const, marginBottom: S.sm, marginLeft: 4,
  },
  formCard: {
    backgroundColor: C.surface, borderRadius: S.radiusCard, borderWidth: 1,
    borderColor: C.border, padding: S.lg, gap: S.lg, marginBottom: S.xl,
  },
  field: { gap: 6 },
  fieldLabel: { color: C.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" as const },
  fieldInput: {
    backgroundColor: C.elevated, borderRadius: S.radiusSmall, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 12, paddingVertical: 10, color: C.textPrimary, fontSize: 14, fontWeight: "500",
  },
  fieldError: { color: C.danger, fontSize: 11, fontWeight: "600", marginTop: 5 },
  fieldHint: { color: C.textMuted, fontSize: 11, fontWeight: "500", marginTop: 4 },
  fieldMulti: { minHeight: 72, textAlignVertical: "top" as const },
  socialRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 10 },
  socialIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border,
    alignItems: "center" as const, justifyContent: "center" as const,
  },
  socialInputWrap: { flex: 1, gap: 3 },
  socialLabel: { color: C.textSecondary, fontSize: 11, fontWeight: "700" },
  socialInput: {
    backgroundColor: C.elevated, borderRadius: S.radiusSmall, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 12, paddingVertical: 8, color: C.textPrimary, fontSize: 13, fontWeight: "500",
  },
  uploadBtn: {
    flexDirection: "row" as const, alignItems: "center" as const, gap: 10,
    backgroundColor: C.elevated, borderRadius: S.radiusSmall, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  uploadBtnText: { color: C.textPrimary, fontSize: 13, fontWeight: "600" },
  uploadThumb: { width: 36, height: 36, borderRadius: 18, overflow: "hidden" as const },
  uploadThumbWide: { width: 48, height: 28, borderRadius: 6, overflow: "hidden" as const },
  uploadThumbEmpty: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border,
    alignItems: "center" as const, justifyContent: "center" as const,
  },

  colorRow: { flexDirection: "row" as const, gap: 10, flexWrap: "wrap" as const, marginTop: 4 },
  colorDot: { width: 32, height: 32, borderRadius: 16, alignItems: "center" as const, justifyContent: "center" as const },
  colorDotActive: { borderWidth: 3, borderColor: "#fff" },

  saveBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center" as const, justifyContent: "center" as const, marginBottom: 28 },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  displaySectionHeader: {
    flexDirection: "row" as const, alignItems: "flex-start" as const, justifyContent: "space-between" as const,
    marginBottom: 12,
  },
  displayCount: { color: C.accent, fontSize: 14, fontWeight: "900", marginTop: 2 },
  displayHint: { color: C.textSecondary, fontSize: 12, fontWeight: "500", marginTop: 2 },

  displayCard: {
    backgroundColor: C.surface, borderRadius: S.radiusCard, borderWidth: 1, borderColor: C.border,
    overflow: "hidden" as const,
  },
  displayEmpty: {
    alignItems: "center" as const, justifyContent: "center" as const,
    paddingVertical: 32, gap: 6,
  },
  displayEmptyText: { color: C.textMuted, fontSize: 13, fontWeight: "600" },

  displayRow: {
    flexDirection: "row" as const, alignItems: "center" as const,
    paddingHorizontal: 12, paddingVertical: 10, gap: 10,
  },
  displayRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  displayThumb: { width: 44, height: 44, borderRadius: 8, overflow: "hidden" as const },
  displayInfo: { flex: 1 },
  displayName: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  displayMeta: { color: C.textSecondary, fontSize: 11, fontWeight: "500", marginTop: 1 },
  displayPrice: { color: C.accent, fontSize: 12, fontWeight: "800", marginTop: 2 },
  displayActions: { flexDirection: "row" as const, gap: 4 },
  miniBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border,
    alignItems: "center" as const, justifyContent: "center" as const,
  },
  addDisplayBtn: {
    flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const,
    gap: 6, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  addDisplayBtnText: { color: C.accent, fontSize: 14, fontWeight: "700" },

  // ══ LISTING PICKER MODAL ══
  pickerOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center" as const, alignItems: "center" as const,
    padding: 24,
  },
  pickerSheet: {
    backgroundColor: C.bg, borderRadius: 20,
    width: "100%", maxHeight: "75%" as any, paddingBottom: 16,
    overflow: "hidden" as const,
  },
  pickerHeader: {
    flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const,
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12,
  },
  pickerTitle: { color: C.textPrimary, fontSize: 17, fontWeight: "800" },
  pickerSearchWrap: {
    flexDirection: "row" as const, alignItems: "center" as const, gap: 8,
    backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border,
    marginHorizontal: 20, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  pickerSearchInput: { flex: 1, color: C.textPrimary, fontSize: 14, fontWeight: "500", padding: 0 },
  pickerEmpty: { alignItems: "center" as const, justifyContent: "center" as const, paddingVertical: 40, gap: 8 },
  pickerEmptyText: { color: C.textMuted, fontSize: 13, fontWeight: "600" },
  pickerRow: {
    flexDirection: "row" as const, alignItems: "center" as const, gap: 12,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  pickerThumb: { width: 50, height: 50, borderRadius: 10, overflow: "hidden" as const },
  pickerInfo: { flex: 1 },
  pickerName: { color: C.textPrimary, fontSize: 14, fontWeight: "700" },
  pickerMeta: { color: C.textSecondary, fontSize: 12, fontWeight: "500", marginTop: 1 },
  pickerPrice: { color: C.accent, fontSize: 13, fontWeight: "800", marginTop: 2 },
  pickerAddIcon: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: C.accentGlow,
    alignItems: "center" as const, justifyContent: "center" as const,
  },

  // ── Shared ──
  emptyCard: {
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.surface, borderRadius: S.radiusCard, borderWidth: 1, borderColor: C.border,
    paddingVertical: 40, gap: 8,
  },
  emptyTitle: { color: C.textPrimary, fontSize: 15, fontWeight: "800" },
  emptySub: { color: C.textSecondary, fontSize: 12, fontWeight: "500", textAlign: "center", paddingHorizontal: 40 },
  emptyCtaBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8,
    backgroundColor: C.accent, borderRadius: S.radiusSmall,
    paddingHorizontal: 18, paddingVertical: 11,
  },
  emptyCtaText: { color: C.textHero, fontSize: 13, fontWeight: "800" },

  toast: {
    position: "absolute", bottom: 40, left: 20, right: 20,
    backgroundColor: C.success, borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 16,
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  toastText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  // ── Earnings ──
  earningsCard: {
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
    padding: 16, marginTop: 8, gap: 12,
  },
  earningsTopRow: { flexDirection: "row" },
  earningsPending: { flex: 1, gap: 2 },
  earningsLabel: { color: C.textSecondary, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  earningsBig: { color: C.textPrimary, fontSize: 28, fontWeight: "900" },
  earningsHint: { color: C.textSecondary, fontSize: 11, fontWeight: "500" },
  earningsBottomRow: { flexDirection: "row", alignItems: "center" },
  earningsCell: { flex: 1, gap: 2 },
  earningsCellDivider: { width: 1, alignSelf: "stretch", backgroundColor: C.border, marginHorizontal: 8 },
  earningsCellLabel: { color: C.textSecondary, fontSize: 12, fontWeight: "600" },
  earningsCellValue: { fontSize: 18, fontWeight: "800" },
  earningsFootnote: { color: C.textSecondary, fontSize: 11, lineHeight: 16 },

  // ── Payouts ──
  payoutHero: { alignItems: "center", paddingVertical: 20, paddingHorizontal: 12, gap: 10 },
  payoutHeroIcon: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: "center", justifyContent: "center",
  },
  payoutHeroTitle: { color: C.textPrimary, fontSize: 20, fontWeight: "800", textAlign: "center" },
  payoutHeroSub: {
    color: C.textSecondary, fontSize: 13, lineHeight: 19,
    textAlign: "center", paddingHorizontal: 8,
  },
  payoutStatusCard: {
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
    padding: 16, marginTop: 8, gap: 12,
  },
  payoutStatusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  payoutStatusLabel: { color: C.textPrimary, fontSize: 14, fontWeight: "700" },
  payoutCheckLabel: { color: C.textSecondary, fontSize: 13, fontWeight: "600" },
  payoutBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999,
  },
  payoutDot: { width: 7, height: 7, borderRadius: 4 },
  payoutBadgeText: { fontSize: 12, fontWeight: "800" },
  payoutDivider: { height: 1, backgroundColor: C.border },
  payoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: C.accent, borderRadius: 14, paddingVertical: 15, marginTop: 18,
  },
  payoutBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  withdrawHint: {
    color: C.textSecondary, fontSize: 11, fontWeight: "500",
    textAlign: "center", lineHeight: 15, marginTop: 8, paddingHorizontal: 12,
  },
  payoutFootnote: {
    color: C.textSecondary, fontSize: 11, textAlign: "center",
    marginTop: 12, paddingHorizontal: 16, lineHeight: 16,
  },

  // ── Manual payouts ──
  payoutBalanceCard: {
    backgroundColor: C.accentGlow, borderRadius: 16,
    borderWidth: 1, borderColor: C.borderStream, padding: 18, gap: 6,
  },
  payoutBalanceValue: { color: C.textPrimary, fontSize: 34, fontWeight: "900", letterSpacing: -1 },
  payoutStatRow: {
    flexDirection: "row", alignItems: "center",
    marginTop: 10, marginBottom: 4,
  },
  payoutStat: { flex: 1, gap: 2, alignItems: "center" },
  payoutStatSep: { width: 1, alignSelf: "stretch", backgroundColor: C.border, marginVertical: 2 },
  payoutStatValue: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
  payoutStatLabel: { color: C.textSecondary, fontSize: 11, fontWeight: "600" },

  pendingCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(245,158,11,0.35)",
    padding: 14, marginTop: 14,
  },
  pendingIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(245,158,11,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  pendingTitle: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
  pendingSub: { color: C.textSecondary, fontSize: 12, fontWeight: "500", marginTop: 1 },
  pendingCancel: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1, borderColor: C.border,
  },
  pendingCancelText: { color: C.textSecondary, fontSize: 12, fontWeight: "700" },

  payoutSectionHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 22, marginBottom: 10,
  },
  payoutSectionTitle: { color: C.textPrimary, fontSize: 15, fontWeight: "800" },
  payoutEditLink: { color: C.link, fontSize: 13, fontWeight: "700" },

  bankCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, padding: 14,
  },
  bankIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.accentGlow, borderWidth: 1, borderColor: C.borderStream,
    alignItems: "center", justifyContent: "center",
  },
  bankHolder: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
  bankLine: { color: C.textSecondary, fontSize: 12, fontWeight: "600", marginTop: 2 },
  bankSub: { color: C.textMuted, fontSize: 11, fontWeight: "500", marginTop: 1 },

  bankForm: {
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, padding: 14, gap: 6,
  },
  payoutInputLabel: { color: C.textSecondary, fontSize: 12, fontWeight: "700", marginTop: 6 },
  payoutInput: {
    backgroundColor: C.elevated, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 12, paddingVertical: 11,
    color: C.textPrimary, fontSize: 14, fontWeight: "600",
  },
  bankSelect: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: C.elevated, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 12, paddingVertical: 11,
  },
  bankSelectText: { color: C.textPrimary, fontSize: 14, fontWeight: "600", flex: 1 },
  bankDropdown: {
    marginTop: 6, backgroundColor: C.elevated, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, overflow: "hidden",
  },
  bankOption: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  bankOptionActive: { backgroundColor: C.accentGlow },
  bankOptionText: { color: C.textPrimary, fontSize: 14, fontWeight: "600" },
  bankFormBtnRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  bankCancelBtn: {
    paddingHorizontal: 16, paddingVertical: 13, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center",
  },
  bankCancelText: { color: C.textSecondary, fontSize: 14, fontWeight: "700" },
  bankSaveBtn: {
    flex: 1, backgroundColor: C.accent, borderRadius: 10,
    paddingVertical: 13, alignItems: "center", justifyContent: "center",
  },
  bankSaveText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  historyCard: {
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, overflow: "hidden",
  },
  historyDivider: { height: 1, backgroundColor: C.border, marginLeft: 60 },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  historyIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  historyLabel: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
  historyDate: { color: C.textMuted, fontSize: 11, fontWeight: "500", marginTop: 1 },
  historyNote: { color: C.danger, fontSize: 11, fontWeight: "600", marginTop: 2 },

  historyEmptyCard: {
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
    paddingVertical: 24, gap: 6,
  },
  historyEmptyText: { color: C.textSecondary, fontSize: 13, fontWeight: "700" },
  historyEmptySub: { color: C.textMuted, fontSize: 11, fontWeight: "500" },

  payoutStateWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 64, gap: 12 },
  payoutStateText: { color: C.textSecondary, fontSize: 13, fontWeight: "600", textAlign: "center" },
  payoutRetryBtn: {
    marginTop: 4, paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.elevated,
  },
  payoutRetryText: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },

  payoutNoteRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 18 },
  payoutNoteText: { flex: 1, color: C.textMuted, fontSize: 11, fontWeight: "500", lineHeight: 15 },
});
