import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { C, S } from "../theme";
import { shared as sh } from "../styles/shared.styles";
import { NavigationProvider, type AppScreen } from "./NavigationContext";
import { CartContext, type CartItem, parsePrice, formatPrice } from "../data/cart";
import type { Listing } from "../data/market";
import HomeScreen from "../screens/HomeScreen";
import MarketScreen from "../screens/MarketScreen";
import LiveScreen from "../screens/LiveScreen";
import AuctionScreen from "../screens/AuctionScreen";
import SettingsScreen from "../screens/SettingsScreen";
import MessagesScreen from "../screens/MessagesScreen";
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
import { UserContext, type VendorStatus } from "../data/user";
import { supabase } from "../lib/supabase";

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
  { id: "SETTINGS", label: "SETTINGS", icon: "settings-outline" },
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
    case "CHAT":
      return <ChatScreen conversationId={screen.conversationId} openOffer={screen.openOffer} onBack={pop} />;
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

  const addItem = useCallback((listing: Listing, quantity: number = 1) => {
    setItems((prev) => {
      const safeQty = Math.max(1, quantity);
      const existing = prev.find((ci) => ci.listing.id === listing.id);
      if (existing) {
        return prev.map((ci) =>
          ci.listing.id === listing.id
            ? { ...ci, quantity: ci.quantity + safeQty }
            : ci,
        );
      }
      return [...prev, { listing, quantity: safeQty, addedAt: Date.now() }];
    });
  }, []);

  const setQuantity = useCallback((listingId: string, quantity: number) => {
    setItems((prev) =>
      prev.flatMap((ci) => {
        if (ci.listing.id !== listingId) return [ci];
        if (quantity <= 0) return [];
        return [{ ...ci, quantity: Math.max(1, quantity) }];
      }),
    );
  }, []);

  const removeItem = useCallback((listingId: string) => {
    setItems((prev) => prev.filter((ci) => ci.listing.id !== listingId));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

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

  return { items, addItem, setQuantity, removeItem, clearCart, isInCart, total };
}

export default function TabNavigator() {
  const [activeTab, setActiveTab] = useState<TabId>("HOME");
  const [mounted, setMounted] = useState<Set<TabId>>(new Set(["HOME"]));
  const insets = useSafeAreaInsets();
  const cart = useCartState();
  const [vendorStatus, setVendorStatus] = useState<VendorStatus>("none");
  const userValue = {
    isVerifiedVendor: vendorStatus === "approved",
    vendorStatus,
    setVendorStatus,
  };

  useEffect(() => {
    let mounted = true;

    async function syncVendorStatus() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;
      if (!user) {
        setVendorStatus("none");
        return;
      }

      // Seller access is controlled by profiles.verified_seller.
      const { data: profile } = await supabase
        .from("profiles")
        .select("verified_seller")
        .eq("id", user.id)
        .maybeSingle();

      if (!mounted) return;
      if (profile?.verified_seller) {
        setVendorStatus("approved");
        return;
      }

      // If not approved, check if application is still pending.
      const { data: app } = await supabase
        .from("vendor_applications")
        .select("status")
        .eq("profile_id", user.id)
        .maybeSingle();

      if (!mounted) return;
      setVendorStatus(app?.status === "pending" ? "pending" : "none");
    }

    syncVendorStatus().catch(() => {
      if (mounted) setVendorStatus("none");
    });

    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      syncVendorStatus().catch(() => {
        if (mounted) setVendorStatus("none");
      });
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

          <View style={[sh.tabBar, { paddingBottom: Math.max(insets.bottom, S.tabBarPaddingBottom) }]}>
            {TABS.map((tab) => (
              <Pressable
                key={tab.id}
                style={sh.tabItem}
                onPress={() => switchTab(tab.id)}
              >
                <Ionicons
                  name={tab.icon}
                  size={S.iconSize.md}
                  color={activeTab === tab.id ? C.accent : C.textMuted}
                />
                <Text style={activeTab === tab.id ? sh.tabLabelActive : sh.tabLabel} numberOfLines={1}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </NavigationProvider>
    </CartContext.Provider>
    </UserContext.Provider>
  );
}

const styles = StyleSheet.create({
  screenLayer: {
    ...StyleSheet.absoluteFillObject,
  },
});
