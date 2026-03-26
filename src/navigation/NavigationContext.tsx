import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Easing, StyleSheet, View } from "react-native";
import { C } from "../theme";

const SCREEN_W = Dimensions.get("window").width;
const IOS_EASE = Easing.bezier(0.25, 0.46, 0.45, 0.94);

export type ChatScreenParams =
  | { type: "CHAT"; conversationId: string; openOffer?: boolean }
  | { type: "CHAT"; sellerId: string; listingId: string; topic?: string; openOffer?: boolean };

export type AppScreen =
  | { type: "MESSAGES" }
  | { type: "NOTIFICATIONS_HUB" }
  | ChatScreenParams
  | { type: "LISTING_DETAIL"; listingId: string }
  | { type: "WANTED_DETAIL"; wantedId: string }
  | { type: "CREATE_LISTING" }
  | { type: "CREATE_WANTED" }
  | { type: "CART" }
  | { type: "CHECKOUT" }
  | { type: "VENDOR_APPLICATION" }
  | { type: "VENDOR_HUB" }
  | { type: "VENDOR_STORE_PAGE"; storeId: string }
  | { type: "MY_LISTINGS" }
  | { type: "MY_ORDERS"; filter?: string }
  | { type: "EDIT_PROFILE" }
  | { type: "FEED_PREFERENCES" }
  | { type: "BROWSE_CATEGORIES" }
  | { type: "CATEGORY_LISTINGS"; category: string }
  | { type: "AUCTION_DETAIL"; auctionId: string }
  | { type: "CREATE_AUCTION" }
  | { type: "PHONE_VERIFY" }
  | { type: "ADDRESS_BOOK" }
  | { type: "ADD_ADDRESS"; editId?: string }
  | { type: "MY_BOOKMARKS" }
  | { type: "ORDER_REVIEW"; orderId: string; sellerId: string }
  | { type: "MY_AUCTIONS" }
  | { type: "LIVE_VIEWER"; streamId: string }
  | { type: "GO_LIVE" };

type StackItem = { id: number; screen: AppScreen };

type NavContextValue = {
  push: (screen: AppScreen) => void;
  pop: () => void;
  stack: AppScreen[];
};

export const NavigationContext = createContext<NavContextValue>({
  push: () => {},
  pop: () => {},
  stack: [],
});

export function useAppNavigation() {
  return useContext(NavigationContext);
}

// Each screen slides in on mount and provides its own pop() to renderOverlay.
// Parent is notified via onExited() after the exit animation completes.
function StackScreen({
  item,
  isTop,
  onExited,
  renderOverlay,
}: {
  item: StackItem;
  isTop: boolean;
  onExited: (id: number) => void;
  renderOverlay: (screen: AppScreen, pop: () => void) => React.ReactNode;
}) {
  const translateX = useRef(new Animated.Value(SCREEN_W)).current;
  const exiting = useRef(false);

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: 0,
      duration: 200,
      easing: IOS_EASE,
      useNativeDriver: true,
    }).start();
  }, []);

  const pop = useCallback(() => {
    if (exiting.current) return;
    exiting.current = true;
    Animated.timing(translateX, {
      toValue: SCREEN_W,
      duration: 180,
      easing: IOS_EASE,
      useNativeDriver: true,
    }).start(() => onExited(item.id));
  }, [item.id, onExited, translateX]);

  return (
    <Animated.View
      pointerEvents={isTop ? "auto" : "none"}
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: C.bg, transform: [{ translateX }] },
      ]}
    >
      {renderOverlay(item.screen, pop)}
    </Animated.View>
  );
}

type Props = {
  children: React.ReactNode;
  renderOverlay: (screen: AppScreen, pop: () => void) => React.ReactNode;
};

let nextId = 0;

export function NavigationProvider({ children, renderOverlay }: Props) {
  const [stack, setStack] = useState<StackItem[]>([]);

  const push = useCallback(
    (screen: AppScreen) => {
      setStack((prev) => [...prev, { id: nextId++, screen }]);
    },
    []
  );

  const handleExited = useCallback(
    (id: number) => {
      setStack((prev) => prev.filter((s) => s.id !== id));
    },
    []
  );

  return (
    <NavigationContext.Provider
      value={{ push, pop: () => {}, stack: stack.map((s) => s.screen) }}
    >
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{ flex: 1 }}>{children}</View>

        {stack.map((item, index) => (
          <StackScreen
            key={item.id}
            item={item}
            isTop={index === stack.length - 1}
            onExited={handleExited}
            renderOverlay={renderOverlay}
          />
        ))}
      </View>
    </NavigationContext.Provider>
  );
}
