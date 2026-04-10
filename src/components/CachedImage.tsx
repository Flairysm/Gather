import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Image, type ImageProps } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { C } from "../theme";

const BASE = C.elevated;
const HIGHLIGHT = "rgba(255,255,255,0.05)";
const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

export default function CachedImage(props: ImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const sweep = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    if (loaded || failed) return;
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1100,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [loaded, failed, sweep]);

  const translateX = sweep.interpolate({
    inputRange: [-1, 1],
    outputRange: [-200, 400],
  });

  return (
    <View style={props.style as StyleProp<ViewStyle>}>
      {!loaded && !failed && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: BASE, overflow: "hidden" }]}>
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
      )}
      {failed && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: BASE, alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name="image-outline" size={24} color={C.textMuted} />
        </View>
      )}
      {!failed && (
        <Image
          {...props}
          style={StyleSheet.absoluteFill}
          placeholder={undefined}
          cachePolicy="memory-disk"
          recyclingKey={
            props.source && typeof props.source === "object" && "uri" in props.source
              ? (props.source as { uri: string }).uri
              : undefined
          }
          transition={200}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}
