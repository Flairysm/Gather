import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, S } from "../theme";

type Props = {
  message?: string;
  onRetry?: () => void;
};

export default function ErrorState({
  message = "Something went wrong. Please try again.",
  onRetry,
}: Props) {
  return (
    <View style={st.wrap}>
      <View style={st.icon}>
        <Ionicons name="cloud-offline-outline" size={32} color={C.textMuted} />
      </View>
      <Text style={st.title}>Oops!</Text>
      <Text style={st.msg}>{message}</Text>
      {onRetry && (
        <Pressable style={st.btn} onPress={onRetry}>
          <Ionicons name="refresh" size={16} color={C.textHero} />
          <Text style={st.btnText}>Retry</Text>
        </Pressable>
      )}
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
  title: { color: C.textPrimary, fontSize: 18, fontWeight: "900" },
  msg: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 280,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.accent,
    borderRadius: S.radiusSmall,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 8,
  },
  btnText: { color: C.textHero, fontSize: 14, fontWeight: "800" },
});
