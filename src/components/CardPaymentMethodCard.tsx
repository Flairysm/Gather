import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, S } from "../theme";

/** Payment-method card for card-at-checkout (Stripe). Shown on checkout screens. */
export default function CardPaymentMethodCard() {
  return (
    <View style={st.card}>
      <View style={st.row}>
        <View style={st.iconWrap}>
          <Ionicons name="card" size={18} color={C.accent} />
        </View>
        <View style={st.info}>
          <Text style={st.title}>Card / FPX / e-Wallet</Text>
          <Text style={st.sub}>Secure payment powered by Stripe</Text>
        </View>
        <Ionicons name="lock-closed" size={16} color={C.textMuted} />
      </View>
      <View style={st.noteRow}>
        <Ionicons name="shield-checkmark" size={14} color={C.success} />
        <Text style={st.noteText}>
          Your payment is held safely and only released to the seller after your item is delivered.
        </Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    gap: S.md,
  },
  row: { flexDirection: "row", alignItems: "center", gap: S.md },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.accentGlow,
    borderWidth: 1,
    borderColor: C.borderStream,
    alignItems: "center",
    justifyContent: "center",
  },
  info: { flex: 1, gap: 1 },
  title: { color: C.textPrimary, fontSize: 13, fontWeight: "800" },
  sub: { color: C.textSecondary, fontSize: 12, fontWeight: "600" },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "rgba(34,197,94,0.08)",
    borderRadius: S.radiusSmall,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  noteText: { flex: 1, color: C.success, fontSize: 11, fontWeight: "700", lineHeight: 15 },
});
