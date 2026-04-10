import { createContext, useContext, useEffect, useRef } from "react";
import { Animated, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { C } from "../theme";

/** Fades children in on mount. Use to smooth the transition from shimmer → real content. */
export function FadeIn({
  children,
  duration = 300,
  style,
}: {
  children: React.ReactNode;
  duration?: number;
  style?: ViewStyle;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration,
      useNativeDriver: true,
    }).start();
  }, []);
  return (
    <Animated.View style={[{ opacity, flex: 1 }, style]}>{children}</Animated.View>
  );
}

const BASE = C.elevated;
const HIGHLIGHT = "rgba(255,255,255,0.05)";

const ShimmerContext = createContext<Animated.Value | null>(null);

/**
 * Wrap multiple <Shimmer /> blocks in a single <ShimmerGroup> so they
 * share one animation loop and pulse in sync.
 */
export function ShimmerGroup({ children }: { children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 1100,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <ShimmerContext.Provider value={anim}>{children}</ShimmerContext.Provider>
  );
}

type Props = {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
};

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

export default function Shimmer({ width, height, borderRadius = 8, style }: Props) {
  const shared = useContext(ShimmerContext);
  const local = useRef(new Animated.Value(-1)).current;
  const anim = shared ?? local;

  useEffect(() => {
    if (shared) return;
    const loop = Animated.loop(
      Animated.timing(local, {
        toValue: 1,
        duration: 1100,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [shared, local]);

  const translateX = anim.interpolate({
    inputRange: [-1, 1],
    outputRange: [-200, 400],
  });

  return (
    <View
      style={[
        { width, height, borderRadius, backgroundColor: BASE, overflow: "hidden" },
        style,
      ]}
    >
      <AnimatedGradient
        colors={["transparent", HIGHLIGHT, "transparent"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: "80%",
          transform: [{ translateX }],
        }}
      />
    </View>
  );
}
