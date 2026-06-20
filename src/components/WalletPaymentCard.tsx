import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { C, S } from "../theme";
import { formatRM, useWallet } from "../data/wallet";

type Props = {
  /** The amount that must be covered by the wallet (used for the sufficiency hint). */
  total: number;
  onTopUp: () => void;
};

/** Payment-method card showing the Evend wallet balance and whether it covers an order. */
export default function WalletPaymentCard({ total, onTopUp }: Props) {
  const { balance, loading } = useWallet();
  const sufficient = balance >= total;
  const shortfall = Math.max(0, total - balance);

  return (
    <View style={[st.card, !sufficient && total > 0 && st.cardInsufficient]}>
      <View style={st.row}>
        <View style={st.iconWrap}>
          <Ionicons name="wallet" size={18} color={C.accent} />
        </View>
        <View style={st.info}>
          <Text style={st.title}>Evend Wallet</Text>
          <Text style={st.balance}>{loading ? "—" : formatRM(balance)} available</Text>
        </View>
        <Pressable style={st.topupBtn} onPress={onTopUp} hitSlop={8}>
          <Feather name="plus" size={13} color={C.accent} />
          <Text style={st.topupText}>Top Up</Text>
        </Pressable>
      </View>

      {total > 0 && !loading && (
        <View style={[st.statusRow, sufficient ? st.statusOk : st.statusBad]}>
          <Ionicons
            name={sufficient ? "checkmark-circle" : "alert-circle"}
            size={14}
            color={sufficient ? C.success : C.danger}
          />
          <Text style={[st.statusText, { color: sufficient ? C.success : C.danger }]}>
            {sufficient
              ? "Balance covers this order"
              : `Add ${formatRM(shortfall)} more to pay with your wallet`}
          </Text>
        </View>
      )}
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
  cardInsufficient: { borderColor: "rgba(239,68,68,0.4)" },
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
  balance: { color: C.textSecondary, fontSize: 12, fontWeight: "600" },
  topupBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.accentGlow,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.borderStream,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  topupText: { color: C.accent, fontSize: 12, fontWeight: "800" },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: S.radiusSmall,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statusOk: { backgroundColor: "rgba(34,197,94,0.08)" },
  statusBad: { backgroundColor: "rgba(239,68,68,0.08)" },
  statusText: { flex: 1, fontSize: 11, fontWeight: "700" },
});
