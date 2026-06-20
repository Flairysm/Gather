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
import * as Clipboard from "expo-clipboard";

import { C, S } from "../theme";
import { requireNetwork } from "../lib/network";
import { fetchMyVouchers, redeemVoucher, type Voucher, type VoucherStatus } from "../data/vouchers";
import ErrorState from "../components/ErrorState";
import { useToast } from "../components/Toast";

type Props = { onBack: () => void };

const STATUS_META: Record<VoucherStatus, { label: string; color: string; bg: string }> = {
  redeemed: { label: "Active", color: C.success, bg: C.successBg },
  used: { label: "Used", color: C.textMuted, bg: C.elevated },
  expired: { label: "Expired", color: C.danger, bg: "rgba(239,68,68,0.12)" },
  void: { label: "Void", color: C.danger, bg: "rgba(239,68,68,0.12)" },
  active: { label: "Available", color: C.accent, bg: C.accentGlow },
};

function formatRM(n: number): string {
  return `RM${n.toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
}

export default function VouchersScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { toast, showToast } = useToast();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoadError(false);
      const rows = await fetchMyVouchers();
      setVouchers(rows);
    } catch (e: any) {
      console.warn("VouchersScreen load error:", e?.message ?? e);
      setLoadError(true);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await load();
    setLoading(false);
  }, [load]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const totalAvailable = useMemo(
    () => vouchers.filter((v) => v.status === "redeemed").reduce((s, v) => s + v.remaining_value, 0),
    [vouchers],
  );

  const trimmed = code.trim();

  function handleRedeem() {
    if (redeeming || !trimmed) return;
    Keyboard.dismiss();
    Alert.alert(
      "Redeem Voucher",
      `Redeem code "${trimmed}" and add its credit to your account?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Redeem", onPress: doRedeem },
      ],
    );
  }

  async function copyCode(value: string) {
    await Clipboard.setStringAsync(value);
    showToast("Voucher code copied");
  }

  async function doRedeem() {
    if (redeeming || !trimmed) return;
    if (!(await requireNetwork())) return;
    setRedeeming(true);
    try {
      const res = await redeemVoucher(trimmed);
      setCode("");
      await load();
      Alert.alert(
        res.status === "already_yours" ? "Already Redeemed" : "Voucher Added",
        res.status === "already_yours"
          ? `This voucher is already in your account (${formatRM(res.remaining_value)} left).`
          : `${formatRM(res.remaining_value)} added. Apply it at checkout to pay for orders.`,
      );
    } catch (e: any) {
      Alert.alert("Couldn't Redeem", e?.message ?? "Please check the code and try again.");
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />

      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>My Vouchers</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[st.scroll, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        {/* ── Available balance ── */}
        <View style={st.balanceCard}>
          <View style={st.balanceTopRow}>
            <Text style={st.balanceLabel}>Voucher Credit Available</Text>
            <Ionicons name="ticket" size={20} color={C.accent} />
          </View>
          {loading ? (
            <ActivityIndicator color={C.accent} style={{ alignSelf: "flex-start", marginVertical: 8 }} />
          ) : (
            <Text style={st.balanceValue}>{formatRM(totalAvailable)}</Text>
          )}
          <Text style={st.balanceHint}>Apply your vouchers at checkout to pay for orders.</Text>
        </View>

        {/* ── Redeem ── */}
        <Text style={st.sectionTitle}>Redeem a Code</Text>
        <View style={st.redeemCard}>
          <View style={st.codeRow}>
            <Ionicons name="pricetag-outline" size={18} color={C.textMuted} />
            <TextInput
              style={st.codeInput}
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="Enter voucher code"
              placeholderTextColor={C.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleRedeem}
            />
          </View>
          <Pressable
            style={[st.redeemBtn, (!trimmed || redeeming) && st.redeemBtnDisabled]}
            onPress={handleRedeem}
            disabled={!trimmed || redeeming}
          >
            {redeeming ? (
              <ActivityIndicator size="small" color={C.textHero} />
            ) : (
              <Ionicons name="add-circle" size={18} color={!trimmed ? C.textMuted : C.textHero} />
            )}
            <Text style={[st.redeemBtnText, (!trimmed || redeeming) && st.redeemBtnTextDisabled]}>
              {redeeming ? "Redeeming…" : "Redeem"}
            </Text>
          </Pressable>
          <View style={st.noteRow}>
            <Ionicons name="information-circle-outline" size={14} color={C.textMuted} />
            <Text style={st.noteText}>
              Buy voucher codes on DropsTCG and redeem them here. Credit is for purchases only and
              can't be withdrawn as cash.
            </Text>
          </View>
        </View>

        {/* ── List ── */}
        <Text style={st.sectionTitle}>Your Vouchers</Text>
        {loading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 24 }} />
        ) : loadError ? (
          <ErrorState message="Couldn't load your vouchers." onRetry={onRefresh} />
        ) : vouchers.length === 0 ? (
          <View style={st.emptyCard}>
            <Ionicons name="ticket-outline" size={28} color={C.textMuted} />
            <Text style={st.emptyText}>No vouchers yet</Text>
            <Text style={st.emptySub}>Redeem a code above to add credit.</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {vouchers.map((v) => {
              const meta = STATUS_META[v.status] ?? STATUS_META.redeemed;
              const usable = v.status === "redeemed" && v.remaining_value > 0;
              const partlyUsed = v.remaining_value < v.face_value;
              return (
                <View key={v.id} style={st.voucherCard}>
                  <View style={[st.voucherIcon, { backgroundColor: meta.bg }]}>
                    <Ionicons name="ticket" size={20} color={meta.color} />
                  </View>
                  <View style={st.voucherInfo}>
                    <View style={st.voucherTopRow}>
                      <Pressable
                        style={st.voucherCodeBtn}
                        onPress={() => copyCode(v.code)}
                        hitSlop={8}
                      >
                        <Text style={st.voucherCode}>{v.code}</Text>
                        <Feather name="copy" size={12} color={C.textMuted} />
                      </Pressable>
                      <View style={[st.statusBadge, { backgroundColor: meta.bg }]}>
                        <Text style={[st.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                    </View>
                    <Text style={[st.voucherValue, !usable && { color: C.textMuted }]}>
                      {formatRM(v.remaining_value)}
                      {partlyUsed ? <Text style={st.voucherFace}>  of {formatRM(v.face_value)}</Text> : null}
                    </Text>
                    <Text style={st.voucherMeta}>
                      {v.source ? `${v.source} · ` : ""}
                      {v.expires_at ? `Expires ${formatDate(v.expires_at)}` : "No expiry"}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
      {toast}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: S.screenPadding, paddingVertical: S.md,
    gap: S.md, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { flex: 1, color: C.textPrimary, fontSize: 16, fontWeight: "800", textAlign: "center" },

  scroll: { paddingHorizontal: S.screenPadding, paddingTop: S.lg },

  balanceCard: {
    backgroundColor: C.accentGlow, borderRadius: S.radiusCard,
    borderWidth: 1, borderColor: C.borderStream, padding: S.xl, gap: 6,
  },
  balanceTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  balanceLabel: { color: C.textSecondary, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  balanceValue: { color: C.textPrimary, fontSize: 38, fontWeight: "900", letterSpacing: -1 },
  balanceHint: { color: C.textSecondary, fontSize: 12, fontWeight: "500", marginTop: 2 },

  sectionTitle: { color: C.textPrimary, fontSize: 15, fontWeight: "800", marginTop: S.xl, marginBottom: S.md },

  redeemCard: {
    backgroundColor: C.surface, borderRadius: S.radiusCard,
    borderWidth: 1, borderColor: C.border, padding: S.lg, gap: S.md,
  },
  codeRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.elevated, borderRadius: S.radiusSmall,
    borderWidth: 1, borderColor: C.border, paddingHorizontal: S.lg,
  },
  codeInput: { flex: 1, color: C.textPrimary, fontSize: 16, fontWeight: "800", letterSpacing: 1, paddingVertical: 12 },
  redeemBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: C.accent, borderRadius: S.radiusSmall, paddingVertical: 15,
  },
  redeemBtnDisabled: { backgroundColor: C.muted },
  redeemBtnText: { color: C.textHero, fontSize: 15, fontWeight: "800" },
  redeemBtnTextDisabled: { color: C.textMuted },

  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  noteText: { flex: 1, color: C.textMuted, fontSize: 11, fontWeight: "500", lineHeight: 15 },

  emptyCard: { alignItems: "center", gap: 6, paddingVertical: 40 },
  emptyText: { color: C.textPrimary, fontSize: 14, fontWeight: "700", marginTop: 4 },
  emptySub: { color: C.textMuted, fontSize: 12, fontWeight: "500" },

  voucherCard: {
    flexDirection: "row", alignItems: "center", gap: S.md,
    backgroundColor: C.surface, borderRadius: S.radiusCard,
    borderWidth: 1, borderColor: C.border, padding: S.lg,
  },
  voucherIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  voucherInfo: { flex: 1, gap: 3 },
  voucherTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  voucherCodeBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  voucherCode: { color: C.textPrimary, fontSize: 14, fontWeight: "900", letterSpacing: 0.5 },
  statusBadge: { borderRadius: S.radiusBadge, paddingHorizontal: 8, paddingVertical: 2 },
  statusBadgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  voucherValue: { color: C.success, fontSize: 18, fontWeight: "900" },
  voucherFace: { color: C.textMuted, fontSize: 12, fontWeight: "600" },
  voucherMeta: { color: C.textMuted, fontSize: 11, fontWeight: "500" },
});
