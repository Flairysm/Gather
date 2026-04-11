import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { C, S } from "../theme";
import { shared as sh } from "../styles/shared.styles";
import { NavigationProvider, type AppScreen } from "./NavigationContext";
import { CartContext, type CartItem, parsePrice, formatPrice } from "../data/cart";
import type { Listing } from "../data/market";

const CART_STORAGE_KEY = "@evend_cart";
import HomeScreen from "../screens/HomeScreen";
import MarketScreen from "../screens/MarketScreen";
import LiveScreen from "../screens/LiveScreen";
import AuctionScreen from "../screens/AuctionScreen";
import SettingsScreen from "../screens/SettingsScreen";
import MessagesScreen from "../screens/MessagesScreen";
import NotificationHubScreen from "../screens/NotificationHubScreen";
import ChatScreen from "../screens/ChatScreen";
import ListingDetailScreen from "../screens/ListingDetailScreen";
import WantedDetailScreen from "../screens/WantedDetailScreen";
import CreateListingScreen from "../screens/CreateListingScreen";
import CreateWantedScreen from "../screens/CreateWantedScreen";
import CartScreen from "../screens/CartScreen";
import CheckoutScreen from "../screens/CheckoutScreen";
import VendorApplicationScreen from "../screens/VendorApplicationScreen";
import VendorHubScreen from "../screens/VendorHubScreen";
import VendorStorePageScreen from "../screens/VendorStorePageScreen";
import MyListingsScreen from "../screens/MyListingsScreen";
import MyOrdersScreen from "../screens/MyOrdersScreen";
import EditProfileScreen from "../screens/EditProfileScreen";
import CategoryBrowseScreen from "../screens/CategoryBrowseScreen";
import CategoryListingsScreen from "../screens/CategoryListingsScreen";
import FeedPreferencesScreen from "../screens/FeedPreferencesScreen";
import AuctionDetailScreen from "../screens/AuctionDetailScreen";
import CreateAuctionScreen from "../screens/CreateAuctionScreen";
import PhoneVerifyScreen from "../screens/PhoneVerifyScreen";
import AddressBookScreen from "../screens/AddressBookScreen";
import AddAddressScreen from "../screens/AddAddressScreen";
import MyBookmarksScreen from "../screens/MyBookmarksScreen";
import OrderReviewScreen from "../screens/OrderReviewScreen";
import MyAuctionsScreen from "../screens/MyAuctionsScreen";
import AuctionCheckoutScreen from "../screens/AuctionCheckoutScreen";
import { UserContext, fetchVendorStatus, type VendorStatus } from "../data/user";
import { FeedPrefsProvider } from "../data/feedPreferences";
import { supabase } from "../lib/supabase";
import { useBadgeCounts, BadgeContext } from "../hooks/useBadgeCounts";

type TabId = "HOME" | "MARKET" | "LIVE" | "AUCTION" | "SETTINGS";

const TABS: {
  id: TabId;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
}[] = [
  { id: "HOME",     label: "HOME",     icon: "home-outline" },
  { id: "MARKET",   label: "MARKET",   icon: "storefront-outline" },
  { id: "LIVE",     label: "LIVE",     icon: "radio" },
  { id: "AUCTION",  label: "AUCTION",  icon: "hammer-outline" },
  { id: "SETTINGS", label: "PROFILE", icon: "person-outline" },
];

function FadeScreen({ active, children }: { active: boolean; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: active ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [active]);

  return (
    <Animated.View
      pointerEvents={active ? "auto" : "none"}
      style={[styles.screenLayer, { opacity }]}
    >
      {children}
    </Animated.View>
  );
}

function renderOverlay(screen: AppScreen, pop: () => void) {
  switch (screen.type) {
    case "MESSAGES":
      return <MessagesScreen onBack={pop} />;
    case "NOTIFICATIONS_HUB":
      return <NotificationHubScreen onBack={pop} />;
    case "CHAT":
      return (
        <ChatScreen
          {...("conversationId" in screen
            ? { conversationId: screen.conversationId }
            : { sellerId: screen.sellerId, listingId: screen.listingId, topic: screen.topic })}
          openOffer={screen.openOffer}
          onBack={pop}
        />
      );
    case "LISTING_DETAIL":
      return <ListingDetailScreen listingId={screen.listingId} onBack={pop} />;
    case "WANTED_DETAIL":
      return <WantedDetailScreen wantedId={screen.wantedId} onBack={pop} />;
    case "CREATE_LISTING":
      return <CreateListingScreen onBack={pop} />;
    case "CREATE_WANTED":
      return <CreateWantedScreen onBack={pop} />;
    case "CART":
      return <CartScreen onBack={pop} />;
    case "CHECKOUT":
      return <CheckoutScreen onBack={pop} />;
    case "VENDOR_APPLICATION":
      return <VendorApplicationScreen onBack={pop} />;
    case "VENDOR_HUB":
      return <VendorHubScreen onBack={pop} />;
    case "VENDOR_STORE_PAGE":
      return <VendorStorePageScreen storeId={screen.storeId} onBack={pop} />;
    case "MY_LISTINGS":
      return <MyListingsScreen onBack={pop} />;
    case "MY_ORDERS":
      return <MyOrdersScreen onBack={pop} initialFilter={screen.filter} />;
    case "EDIT_PROFILE":
      return <EditProfileScreen onBack={pop} />;
    case "FEED_PREFERENCES":
      return <FeedPreferencesScreen onBack={pop} />;
    case "BROWSE_CATEGORIES":
      return <CategoryBrowseScreen onBack={pop} />;
    case "CATEGORY_LISTINGS":
      return <CategoryListingsScreen category={screen.category} onBack={pop} />;
    case "AUCTION_DETAIL":
      return <AuctionDetailScreen auctionId={screen.auctionId} onBack={pop} />;
    case "CREATE_AUCTION":
      return <CreateAuctionScreen onBack={pop} />;
    case "PHONE_VERIFY":
      return <PhoneVerifyScreen onBack={pop} />;
    case "ADDRESS_BOOK":
      return <AddressBookScreen onBack={pop} />;
    case "ADD_ADDRESS":
      return <AddAddressScreen editId={screen.editId} onBack={pop} />;
    case "MY_BOOKMARKS":
      return <MyBookmarksScreen onBack={pop} />;
    case "ORDER_REVIEW":
      return <OrderReviewScreen orderId={screen.orderId} sellerId={screen.sellerId} onBack={pop} />;
    case "MY_AUCTIONS":
      return <MyAuctionsScreen onBack={pop} />;
    case "LIVE_VIEWER": {
      const LiveViewerScreen = require("../screens/LiveViewerScreen").default;
      return <LiveViewerScreen streamId={screen.streamId} onBack={pop} />;
    }
    case "GO_LIVE": {
      const GoLiveScreen = require("../screens/GoLiveScreen").default;
      return <GoLiveScreen onBack={pop} />;
    }
    case "AUCTION_CHECKOUT":
      return <AuctionCheckoutScreen winId={screen.winId} onBack={pop} />;
  }
}

const SCREENS: { id: TabId; render: () => React.ReactNode }[] = [
  { id: "HOME",     render: () => <HomeScreen /> },
  { id: "MARKET",   render: () => <MarketScreen /> },
  { id: "LIVE",     render: () => <LiveScreen /> },
  { id: "AUCTION",  render: () => <AuctionScreen /> },
  { id: "SETTINGS", render: () => <SettingsScreen /> },
];

function useCartState() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(CART_STORAGE_KEY).then((raw) => {
      if (cancelled) return;
      if (raw) {
        try {
          const parsed: CartItem[] = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setItems(parsed);
            setSelectedIds(new Set(parsed.map((ci) => ci.listing.id)));
          }
        } catch {}
      }
      setHydrated(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (items.length === 0) {
      AsyncStorage.removeItem(CART_STORAGE_KEY);
    } else {
      AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    }
  }, [items, hydrated]);

  const addItem = useCallback((listing: Listing, quantity: number = 1) => {
    if (!hydrated) return;
    setItems((prev) => {
      const maxStock = listing.quantity ?? 99;
      const safeQty = Math.max(1, quantity);
      const existing = prev.find((ci) => ci.listing.id === listing.id);
      if (existing) {
        return prev.map((ci) =>
          ci.listing.id === listing.id
            ? { ...ci, quantity: Math.min(ci.quantity + safeQty, maxStock) }
            : ci,
        );
      }
      return [...prev, { listing, quantity: Math.min(safeQty, maxStock), addedAt: Date.now() }];
    });
    setSelectedIds((prev) => new Set(prev).add(listing.id));
  }, [hydrated]);

  const setQuantity = useCallback((listingId: string, quantity: number) => {
    setItems((prev) =>
      prev.flatMap((ci) => {
        if (ci.listing.id !== listingId) return [ci];
        if (quantity <= 0) return [];
        const maxStock = ci.listing.quantity ?? 99;
        return [{ ...ci, quantity: Math.min(Math.max(1, quantity), maxStock) }];
      }),
    );
  }, []);

  const removeItem = useCallback((listingId: string) => {
    setItems((prev) => prev.filter((ci) => ci.listing.id !== listingId));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(listingId);
      return next;
    });
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setSelectedIds(new Set());
  }, []);

  const isInCart = useCallback(
    (listingId: string) => items.some((ci) => ci.listing.id === listingId),
    [items],
  );

  const total = useCallback(() => {
    const sum = items.reduce(
      (acc, ci) => acc + parsePrice(ci.listing.price) * ci.quantity,
      0,
    );
    return formatPrice(sum);
  }, [items]);

  const toggleSelected = useCallback((listingId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(listingId)) next.delete(listingId);
      else next.add(listingId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map((ci) => ci.listing.id)));
  }, [items]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const allSelected = items.length > 0 && items.every((ci) => selectedIds.has(ci.listing.id));

  const selectedItemsFn = useCallback(
    () => items.filter((ci) => selectedIds.has(ci.listing.id)),
    [items, selectedIds],
  );

  const selectedTotal = useCallback(() => {
    const sum = items
      .filter((ci) => selectedIds.has(ci.listing.id))
      .reduce((acc, ci) => acc + parsePrice(ci.listing.price) * ci.quantity, 0);
    return formatPrice(sum);
  }, [items, selectedIds]);

  return {
    items, addItem, setQuantity, removeItem, clearCart, isInCart, total,
    selectedIds, toggleSelected, selectAll, deselectAll,
    selectedItems: selectedItemsFn, selectedTotal, allSelected,
  };
}

type InAppToast = { id: string; title: string; body: string; icon: React.ComponentProps<typeof Ionicons>["name"]; color: string };

function useOrderNotifications() {
  const [toasts, setToasts] = useState<InAppToast[]>([]);
  const userIdRef = useRef<string | null>(null);
  const toastAnims = useRef(new Map<string, Animated.Value>()).current;
  const dismissTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      userIdRef.current = data.user?.id ?? null;
      setReady(true);
    });
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      userIdRef.current = session?.user?.id ?? null;
      setReady(true);
    });
    return () => { authSub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!ready || !userIdRef.current) return;

    const timers = dismissTimers.current;

    const channel = supabase
      .channel("purchase-notifs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_items" },
        async (payload) => {
          const row = payload.new as any;
          if (!userIdRef.current) return;
          const { data: listing } = await supabase
            .from("listings")
            .select("seller_id, card_name")
            .eq("id", row.listing_id)
            .maybeSingle();
          if (!listing || listing.seller_id !== userIdRef.current) return;

          const id = row.id ?? Date.now().toString();
          const toast: InAppToast = {
            id,
            title: "New Sale!",
            body: `${listing.card_name} was purchased`,
            icon: "bag-check-outline",
            color: C.success,
          };

          const anim = new Animated.Value(0);
          toastAnims.set(id, anim);
          setToasts((prev) => [...prev, toast]);
          Animated.timing(anim, { toValue: 1, duration: 250, useNativeDriver: true }).start();

          const timer = setTimeout(() => {
            timers.delete(timer);
            Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
              setToasts((prev) => prev.filter((t) => t.id !== id));
              toastAnims.delete(id);
            });
          }, 4000);
          timers.add(timer);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  }, [ready]);

  return { toasts, toastAnims };
}

export default function TabNavigator() {
  const [activeTab, setActiveTab] = useState<TabId>("HOME");
  const [mounted, setMounted] = useState<Set<TabId>>(new Set(["HOME"]));
  const insets = useSafeAreaInsets();
  const cart = useCartState();
  const badges = useBadgeCounts();
  const orderNotifs = useOrderNotifications();
  const [vendorStatus, setVendorStatus] = useState<VendorStatus>("none");
  const userValue = {
    isVerifiedVendor: vendorStatus === "approved",
    vendorStatus,
    setVendorStatus,
  };

  useEffect(() => {
    let mounted = true;

    async function syncVendorStatus() {
      if (!mounted) return;
      try {
        const nextStatus = await fetchVendorStatus();
        if (!mounted) return;
        setVendorStatus(nextStatus);
      } catch {
        // Keep current status on transient errors instead of resetting to "none"
      }
    }

    syncVendorStatus();

    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      syncVendorStatus();
    });

    return () => {
      mounted = false;
      authSub.subscription.unsubscribe();
    };
  }, []);

  function switchTab(id: TabId) {
    setMounted((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setActiveTab(id);
  }

  return (
    <UserContext.Provider value={userValue}>
    <FeedPrefsProvider>
    <BadgeContext.Provider value={badges}>
    <CartContext.Provider value={cart}>
      <NavigationProvider renderOverlay={renderOverlay}>
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={{ flex: 1 }}>
            {SCREENS.map(
              (screen) =>
                mounted.has(screen.id) && (
                  <FadeScreen key={screen.id} active={activeTab === screen.id}>
                    {screen.render()}
                  </FadeScreen>
                ),
            )}
          </View>

          {orderNotifs.toasts.map((toast) => {
            const anim = orderNotifs.toastAnims.get(toast.id) ?? new Animated.Value(0);
            return (
              <Animated.View
                key={toast.id}
                style={[
                  styles.toastBanner,
                  { top: Math.max(insets.top + 8, 16),
                    opacity: anim,
                    transform: [
                      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) },
                      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
                    ],
                  },
                ]}
              >
                <View style={[styles.toastIcon, { backgroundColor: toast.color + "20" }]}>
                  <Ionicons name={toast.icon as any} size={20} color={toast.color} />
                </View>
                <View style={styles.toastContent}>
                  <Text style={styles.toastTitle}>{toast.title}</Text>
                  <Text style={styles.toastBody} numberOfLines={2}>{toast.body}</Text>
                </View>
              </Animated.View>
            );
          })}

          <View style={[sh.tabBar, { paddingBottom: Math.max(insets.bottom, S.tabBarPaddingBottom) }]}>
            {TABS.map((tab) => {
              const badgeCount =
                tab.id === "HOME" ? badges.counts.unreadChats :
                tab.id === "SETTINGS" ? (badges.counts.unreadNotifications + badges.counts.pendingShipments) : 0;
              return (
                <Pressable
                  key={tab.id}
                  style={sh.tabItem}
                  onPress={() => switchTab(tab.id)}
                >
                  <View>
                    <Ionicons
                      name={tab.icon}
                      size={S.iconSize.md}
                      color={activeTab === tab.id ? C.accent : C.textMuted}
                    />
                    {badgeCount > 0 && (
                      <View style={styles.tabBadge}>
                        <Text style={styles.tabBadgeText}>
                          {badgeCount > 99 ? "99+" : badgeCount}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={activeTab === tab.id ? sh.tabLabelActive : sh.tabLabel} numberOfLines={1}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </NavigationProvider>
    </CartContext.Provider>
    </BadgeContext.Provider>
    </FeedPrefsProvider>
    </UserContext.Provider>
  );
}

const styles = StyleSheet.create({
  screenLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  tabBadge: {
    position: "absolute",
    top: -4,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.live,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  toastBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  toastIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  toastContent: { flex: 1, gap: 2 },
  toastTitle: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
  toastBody: { color: C.textSecondary, fontSize: 12, fontWeight: "600" },
});
