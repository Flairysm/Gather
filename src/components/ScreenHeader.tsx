import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, S } from "../theme";

type Props = {
  title?: string;
  /** Show a circular back button on the left when provided. */
  onBack?: () => void;
  /** Optional content rendered on the right (actions, step indicator, etc.). */
  right?: React.ReactNode;
  /** Hide the bottom hairline (e.g. headers that sit over a colored hero). */
  borderless?: boolean;
  /** Center the title instead of left-aligning it. */
  centerTitle?: boolean;
  style?: ViewStyle;
};

/**
 * Shared app header: circular back button + title + optional right slot.
 * Matches the canonical detail/checkout header so every overlay screen is
 * visually identical. The right slot keeps each screen's existing actions.
 */
export default function ScreenHeader({
  title,
  onBack,
  right,
  borderless,
  centerTitle,
  style,
}: Props) {
  return (
    <View style={[st.header, borderless && st.borderless, style]}>
      {onBack ? (
        <Pressable
          style={st.backBtn}
          onPress={onBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
      ) : (
        centerTitle && <View style={st.side} />
      )}

      <Text
        style={[st.title, centerTitle && st.titleCentered]}
        numberOfLines={1}
      >
        {title}
      </Text>

      {right !== undefined ? (
        <View style={st.right}>{right}</View>
      ) : (
        // Reserve symmetric space so a centered title stays centered.
        (centerTitle || onBack) && <View style={st.side} />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S.screenPadding,
    paddingVertical: S.md,
    gap: S.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  borderless: {
    borderBottomWidth: 0,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  side: {
    width: 36,
    height: 36,
  },
  title: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  titleCentered: {
    textAlign: "center",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
  },
});
