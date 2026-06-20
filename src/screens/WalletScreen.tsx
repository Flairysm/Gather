import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStripe } from "@stripe/stripe-react-native";

import { C, S } from "../theme";
import { requireNetwork } from "../lib/network";
import { useAppNavigation } from "../navigation/NavigationContext";
import { WALLET_TOPUP_ENABLED } from "../lib/featureFlags";
import ErrorState from "../components/ErrorState";
import {
  createWalletTopup,
  fetchWalletLedger,
  formatRM,
  getWalletBalance,
  useWallet,
  type WalletLedgerEntry,
} from "../data/wallet";

type Props = { onBack: () => void };

const QUICK_AMOUNTS = [10, 50, 100, 200, 500];

const LEDGER_META: Record<
  WalletLedgerEntry["type"],
  { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; color: string }
> = {
  topup: { label: "Top-up", icon: "add-circle-outline", color: C.success },
  purchase: { label: "Purchase", icon: "bag-handle-outline", color: C.link },
  auction: { label: "Auction", icon: "hammer-outline", color: C.link },
  refund: { label: "Refund", icon: "return-down-back-outline", color: C.success },
  conversion: { label: "Token Conversion", icon: "swap-horizontal-outline", color: C.accent },
  adjustment: { label: "Adjustment", icon: "construct-outline", color: C.textSecondary },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function WalletScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { push } = useAppNavigation();
  const { balance, refresh } = useWallet();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [amount, setAmount] = useState("");
  const [toppingUp, setToppingUp] = useState(false);
  const [ledgerError, setLedgerError] = useState(false);

  const loadLedger = useCallback(async () => {
    try {
      setLedgerError(false);
      const rows = await fetchWalletLedger(100);
      setLedger(rows);
    } catch (e: any) {
      console.warn("WalletScreen loadLedger error:", e?.message ?? e);
      setLedgerError(true);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([refresh(), loadLedger()]);
    setLoading(false);
  }, [refresh, loadLedger]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const parsedAmount = useMemo(() => {
    const n = parseFloat(amount.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }, [amount]);

  const canTopUp = parsedAmount > 0 && parsedAmount <= 10000 && !toppingUp;

  async function pollForCredit(previousBalance: number) {
    // The webhook credits the wallet shortly after payment. Poll a few times.
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const latest = await getWalletBalance();
        if (latest > previousBalance + 0.001) {
          await Promise.all([refresh(), loadLedger()]);
          return true;
        }
      } catch {
        // keep polling
      }
    }
    await Promise.all([refresh(), loadLedger()]);
    return false;
  }

  async function handleTopUp() {
    if (!WALLET_TOPUP_ENABLED || !canTopUp) return;
    Keyboard.dismiss();
    if (!(await requireNetwork())) return;
    setToppingUp(true);
    const previousBalance = balance;
    try {
      const { clientSecret } = await createWalletTopup(parsedAmount);

      const init = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: "Evend",
        returnURL: "evend://stripe-redirect",
        allowsDelayedPaymentMethods: true,
      });
      if (init.error) throw new Error(init.error.message);

      const result = await presentPaymentSheet();
      if (result.error) {
        if (result.error.code !== "Canceled") {
          Alert.alert("Payment Failed", result.error.message);
        }
        return;
      }

      setAmount("");
      const credited = await pollForCredit(previousBalance);
      Alert.alert(
        "Payment Received",
        credited
          ? `${formatRM(parsedAmount)} has been added to your wallet.`
          : `${formatRM(parsedAmount)} is being processed and will appear in your wallet shortly.`,
      );
    } catch (e: any) {
      Alert.alert("Top-up Failed", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setToppingUp(false);
    }
  }

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />

      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>My Wallet</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[st.scroll, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
        }
      >
        {/* ── Balance card ── */}
        <View style={st.balanceCard}>
          <View style={st.balanceTopRow}>
            <Text style={st.balanceLabel}>Available Balance</Text>
            <Ionicons name="wallet" size={20} color={C.accent} />
          </View>
          {loading ? (
            <ActivityIndicator color={C.accent} style={{ alignSelf: "flex-start", marginVertical: 8 }} />
          ) : (
            <Text style={st.balanceValue}>{formatRM(balance)}</Text>
          )}
          <Text style={st.balanceHint}>
            {WALLET_TOPUP_ENABLED
              ? "Use your balance to pay for marketplace and auction purchases."
              : "Pay securely by card at checkout — no top-up needed."}
          </Text>
        </View>

        {/* ── Top up ── */}
        {!WALLET_TOPUP_ENABLED ? (
          <View style={st.disabledCard}>
            <View style={st.convertIcon}>
              <Ionicons name="card-outline" size={18} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.convertTitle}>Pay by card at checkout</Text>
              <Text style={st.convertSub}>
                Wallet top-ups are currently unavailable. You can pay for orders and auction wins
                directly by card, FPX, or e-wallet — securely via Stripe.
              </Text>
            </View>
          </View>
        ) : (
        <>
        <Text style={st.sectionTitle}>Top Up</Text>
        <View style={st.topupCard}>
          <View style={st.chipRow}>
            {QUICK_AMOUNTS.map((amt) => {
              const active = parsedAmount === amt;
              return (
                <Pressable
                  key={amt}
                  style={[st.chip, active && st.chipActive]}
                  onPress={() => setAmount(String(amt))}
                >
                  <Text style={[st.chipText, active && st.chipTextActive]}>RM{amt}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={st.amountRow}>
            <Text style={st.amountPrefix}>RM</Text>
            <TextInput
              style={st.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={C.textMuted}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={handleTopUp}
            />
          </View>

          {parsedAmount > 10000 && (
            <View style={st.maxNoteRow}>
              <Ionicons name="alert-circle-outline" size={14} color={C.danger} />
              <Text style={st.maxNoteText}>Maximum top-up is RM10,000.</Text>
            </View>
          )}

          <Pressable
            style={[st.topupBtn, !canTopUp && st.topupBtnDisabled]}
            onPress={handleTopUp}
            disabled={!canTopUp}
          >
            {toppingUp ? (
              <ActivityIndicator size="small" color={C.textHero} />
            ) : (
              <Ionicons name="add-circle" size={18} color={canTopUp ? C.textHero : C.textMuted} />
            )}
            <Text style={[st.topupBtnText, !canTopUp && st.topupBtnTextDisabled]}>
              {toppingUp
                ? "Processing…"
                : parsedAmount > 0
                  ? `Add ${formatRM(parsedAmount)}`
                  : "Enter an amount"}
            </Text>
          </Pressable>

          <View style={st.noteRow}>
            <Ionicons name="information-circle-outline" size={14} color={C.textMuted} />
            <Text style={st.noteText}>
              Payments are processed securely by Stripe (cards, FPX, e-wallets). Wallet balance is
              for purchases only and can't be withdrawn.
            </Text>
          </View>
        </View>
        </>
        )}

        {/* ── DropsTCG vouchers ── */}
        <Pressable style={st.convertCard} onPress={() => push({ type: "VOUCHERS" })}>
          <View style={st.convertIcon}>
            <Ionicons name="ticket" size={18} color={C.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.convertTitle}>DropsTCG Vouchers</Text>
            <Text style={st.convertSub}>Redeem a voucher code and use the credit at checkout.</Text>
          </View>
          <Feather name="chevron-right" size={18} color={C.textMuted} />
        </Pressable>

        {/* ── History ── */}
        <Text style={st.sectionTitle}>Transaction History</Text>
        {loading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 24 }} />
        ) : ledgerError ? (
          <ErrorState message="Couldn't load your transaction history." onRetry={loadLedger} />
        ) : ledger.length === 0 ? (
          <View style={st.emptyCard}>
            <Ionicons name="receipt-outline" size={28} color={C.textMuted} />
            <Text style={st.emptyText}>No transactions yet</Text>
            <Text style={st.emptySub}>
              {WALLET_TOPUP_ENABLED
                ? "Top up your wallet to get started."
                : "Your wallet activity will appear here."}
            </Text>
          </View>
        ) : (
          <View style={st.historyCard}>
            {ledger.map((entry, i) => {
              const meta = LEDGER_META[entry.type] ?? LEDGER_META.adjustment;
              const credit = entry.amount >= 0;
              return (
                <View key={entry.id}>
                  {i > 0 && <View style={st.historyDivider} />}
                  <View style={st.historyRow}>
                    <View style={[st.historyIcon, { backgroundColor: meta.color + "1A" }]}>
                      <Ionicons name={meta.icon} size={18} color={meta.color} />
                    </View>
                    <View style={st.historyInfo}>
                      <Text style={st.historyLabel}>{entry.description ?? meta.label}</Text>
                      <Text style={st.historyDate}>{formatDate(entry.created_at)}</Text>
                    </View>
                    <View style={st.historyRight}>
                      <Text style={[st.historyAmount, { color: credit ? C.success : C.textPrimary }]}>
                        {credit ? "+" : "−"}
                        {formatRM(Math.abs(entry.amount))}
                      </Text>
                      <Text style={st.historyBalance}>{formatRM(entry.balance_after)}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S.screenPadding,
    paddingVertical: S.md,
    gap: S.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
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
  headerTitle: { flex: 1, color: C.textPrimary, fontSize: 16, fontWeight: "800", textAlign: "center" },

  scroll: { paddingHorizontal: S.screenPadding, paddingTop: S.lg },

  balanceCard: {
    backgroundColor: C.accentGlow,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.borderStream,
    padding: S.xl,
    gap: 6,
  },
  balanceTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  balanceLabel: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  balanceValue: { color: C.textPrimary, fontSize: 38, fontWeight: "900", letterSpacing: -1 },
  balanceHint: { color: C.textSecondary, fontSize: 12, fontWeight: "500", marginTop: 2 },

  sectionTitle: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: "800",
    marginTop: S.xl,
    marginBottom: S.md,
  },

  topupCard: {
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    gap: S.md,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: { backgroundColor: C.accentGlow, borderColor: C.accent },
  chipText: { color: C.textSecondary, fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: C.accent },

  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.elevated,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: S.lg,
  },
  amountPrefix: { color: C.textSecondary, fontSize: 18, fontWeight: "800", marginRight: 6 },
  amountInput: { flex: 1, color: C.textPrimary, fontSize: 22, fontWeight: "800", paddingVertical: 12 },

  topupBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: S.radiusSmall,
    paddingVertical: 15,
  },
  topupBtnDisabled: { backgroundColor: C.muted },
  topupBtnText: { color: C.textHero, fontSize: 15, fontWeight: "800" },
  topupBtnTextDisabled: { color: C.textMuted },

  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  noteText: { flex: 1, color: C.textMuted, fontSize: 11, fontWeight: "500", lineHeight: 15 },
  maxNoteRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  maxNoteText: { color: C.danger, fontSize: 12, fontWeight: "600" },

  convertCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    marginTop: S.md,
  },
  disabledCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: S.md,
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    marginTop: S.lg,
  },
  convertIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.accentGlow,
    borderWidth: 1,
    borderColor: C.borderStream,
    alignItems: "center",
    justifyContent: "center",
  },
  convertTitle: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
  convertSub: { color: C.textSecondary, fontSize: 11, fontWeight: "500", marginTop: 1 },
  soonBadge: {
    backgroundColor: C.elevated,
    borderRadius: S.radiusBadge,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  soonBadgeText: { color: C.textMuted, fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },

  emptyCard: { alignItems: "center", gap: 6, paddingVertical: 40 },
  emptyText: { color: C.textPrimary, fontSize: 14, fontWeight: "700", marginTop: 4 },
  emptySub: { color: C.textMuted, fontSize: 12, fontWeight: "500" },

  historyCard: {
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  historyRow: { flexDirection: "row", alignItems: "center", gap: S.md, padding: S.lg },
  historyIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  historyInfo: { flex: 1, gap: 2 },
  historyLabel: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  historyDate: { color: C.textMuted, fontSize: 11, fontWeight: "500" },
  historyRight: { alignItems: "flex-end", gap: 2 },
  historyAmount: { fontSize: 14, fontWeight: "900" },
  historyBalance: { color: C.textMuted, fontSize: 10, fontWeight: "600" },
  historyDivider: { height: 1, backgroundColor: C.border, marginLeft: 66 },
});
