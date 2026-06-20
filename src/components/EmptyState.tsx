import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, S } from "../theme";

type Props = {
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  message?: string;
  /** Optional primary action button. */
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
};

/**
 * Shared empty-state block: muted icon, title, supporting copy, optional CTA.
 * Use for "no results" / "nothing here yet" states across lists and details.
 */
export default function EmptyState({
  icon = "cube-outline",
  title,
  message,
  actionLabel,
  onAction,
  style,
}: Props) {
  return (
    <View style={[st.wrap, style]}>
      <View style={st.icon}>
        <Ionicons name={icon} size={30} color={C.textMuted} />
      </View>
      <Text style={st.title}>{title}</Text>
      {message ? <Text style={st.msg}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable style={st.btn} onPress={onAction} accessibilityRole="button">
          <Text style={st.btnText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: S.screenPadding,
    gap: 10,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: { color: C.textPrimary, fontSize: 17, fontWeight: "900" },
  msg: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 280,
  },
  btn: {
    backgroundColor: C.accent,
    borderRadius: S.radiusSmall,
    paddingHorizontal: 22,
    paddingVertical: 12,
    marginTop: 8,
  },
  btnText: { color: C.textHero, fontSize: 14, fontWeight: "800" },
});
