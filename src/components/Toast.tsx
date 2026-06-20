import { useCallback, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { C, S } from "../theme";

/**
 * Lightweight transient toast. Returns a `toast` node to render near the root of
 * a screen and a `showToast` helper. Mirrors the in-screen toast used in
 * VendorHubScreen so feedback looks consistent across the app.
 */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  const showToast = useCallback(
    (message: string) => {
      setMsg(message);
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(1800),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setMsg(null));
    },
    [opacity],
  );

  const toast = msg ? (
    <Animated.View pointerEvents="none" style={[st.toast, { opacity }]}>
      <Text style={st.toastText}>{msg}</Text>
    </Animated.View>
  ) : null;

  return { toast, showToast };
}

const st = StyleSheet.create({
  toast: {
    position: "absolute",
    left: S.screenPadding,
    right: S.screenPadding,
    bottom: 40,
    backgroundColor: C.elevated,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    zIndex: 50,
  },
  toastText: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
});
