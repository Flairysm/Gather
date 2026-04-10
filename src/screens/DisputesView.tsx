import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { C, S } from "../theme";
import { supabase } from "../lib/supabase";

type Dispute = {
  id: string;
  order_item_id: string;
  order_id: string;
  buyer_id: string;
  seller_id: string;
  reason: string;
  description: string | null;
  status: string;
  resolution_notes: string | null;
  evidence_urls: string[];
  created_at: string;
  updated_at: string;
  buyer?: { username: string; display_name: string | null };
  listing?: { card_name: string; images: string[] } | null;
};

type Props = {
  userId: string;
  onBack: () => void;
};

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: "Open", color: "#EF4444", bg: "rgba(239,68,68,0.12)" },
  under_review: { label: "Under Review", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  resolved: { label: "Resolved", color: "#22C55E", bg: "rgba(34,197,94,0.12)" },
  rejected: { label: "Rejected", color: C.textMuted, bg: "rgba(127,127,127,0.12)" },
};

export default function DisputesView({ userId, onBack }: Props) {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const [replyModal, setReplyModal] = useState<Dispute | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase
      .from("disputes")
      .select(`
        *,
        buyer:profiles!buyer_id(username, display_name),
        order_item:order_items!order_item_id(listing:listings!listing_id(card_name, images))
      `)
      .eq("seller_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("DisputesView load error:", error.message);
      setLoadError(true);
      setLoading(false);
      return;
    }

    const mapped: Dispute[] = (data ?? []).map((d: any) => ({
      ...d,
      buyer: Array.isArray(d.buyer) ? d.buyer[0] : d.buyer,
      listing: d.order_item
        ? Array.isArray(d.order_item) ? d.order_item[0]?.listing : d.order_item?.listing
        : null,
    }));
    setDisputes(mapped);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const filtered = disputes.filter((d) => {
    if (filter === "all") return true;
    if (filter === "open") return d.status === "open" || d.status === "under_review";
    return d.status === "resolved" || d.status === "rejected";
  });

  async function handleReply() {
    if (!replyModal || !replyText.trim()) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("disputes")
      .update({
        resolution_notes: replyText.trim(),
        status: "under_review",
        updated_at: new Date().toISOString(),
      })
      .eq("id", replyModal.id);

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      setReplyModal(null);
      setReplyText("");
      load();
    }
    setSubmitting(false);
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString("en-MY", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>Disputes</Text>
        <Pressable style={st.backBtn} onPress={load}>
          <Ionicons name="refresh" size={16} color={C.textPrimary} />
        </Pressable>
      </View>

      <View style={st.filterRow}>
        {(["all", "open", "resolved"] as const).map((f) => (
          <Pressable
            key={f}
            style={[st.filterPill, filter === f && st.filterPillActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[st.filterText, filter === f && st.filterTextActive]}>
              {f === "all" ? "All" : f === "open" ? "Open" : "Resolved"}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={st.centerWrap}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={st.centerWrap}>
          <Ionicons name="shield-checkmark-outline" size={40} color={C.textMuted} />
          <Text style={st.emptyTitle}>No disputes</Text>
          <Text style={st.emptySub}>
            {filter === "open" ? "No open disputes right now." : "No disputes found."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(d) => d.id}
          contentContainerStyle={st.list}
          renderItem={({ item }) => {
            const sl = STATUS_LABELS[item.status] ?? STATUS_LABELS.open;
            const listing = Array.isArray(item.listing) ? item.listing[0] : item.listing;
            const buyerName = item.buyer?.display_name || item.buyer?.username || "Buyer";
            const cardName = (listing as any)?.card_name ?? "Item";

            return (
              <View style={st.card}>
                <View style={st.cardTop}>
                  <View style={[st.statusBadge, { backgroundColor: sl.bg }]}>
                    <Text style={[st.statusText, { color: sl.color }]}>{sl.label}</Text>
                  </View>
                  <Text style={st.cardDate}>{formatDate(item.created_at)}</Text>
                </View>

                <Text style={st.cardTitle}>{cardName}</Text>
                <Text style={st.cardSub}>Filed by {buyerName}</Text>

                <View style={st.reasonBox}>
                  <Text style={st.reasonLabel}>Reason</Text>
                  <Text style={st.reasonText}>{item.reason}</Text>
                  {item.description ? (
                    <Text style={st.descText}>{item.description}</Text>
                  ) : null}
                </View>

                {item.evidence_urls?.length > 0 && (
                  <View style={st.evidenceSection}>
                    <Text style={st.reasonLabel}>Evidence ({item.evidence_urls.length} photos)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.evidenceScroll}>
                      {item.evidence_urls.map((url, idx) => (
                        <Image key={idx} source={{ uri: url }} style={st.evidenceImg} />
                      ))}
                    </ScrollView>
                  </View>
                )}

                {item.resolution_notes ? (
                  <View style={st.replyBox}>
                    <Text style={st.reasonLabel}>Your Response</Text>
                    <Text style={st.descText}>{item.resolution_notes}</Text>
                  </View>
                ) : null}

                {item.status === "open" && (
                  <Pressable style={st.replyBtn} onPress={() => { setReplyModal(item); setReplyText(item.resolution_notes ?? ""); }}>
                    <Feather name="message-square" size={14} color={C.textHero} />
                    <Text style={st.replyBtnText}>Respond</Text>
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      )}

      <Modal visible={!!replyModal} transparent animationType="fade" onRequestClose={() => setReplyModal(null)}>
        <Pressable style={st.overlay} onPress={() => setReplyModal(null)}>
          <Pressable style={st.modal} onPress={() => {}}>
            <Text style={st.modalTitle}>Respond to Dispute</Text>
            <Text style={st.modalSub}>
              Provide your side of the story. An admin will review both parties.
            </Text>
            <TextInput
              style={st.modalInput}
              value={replyText}
              onChangeText={setReplyText}
              placeholder="Explain the situation..."
              placeholderTextColor={C.textMuted}
              multiline
              maxLength={1000}
            />
            <View style={st.modalActions}>
              <Pressable style={st.cancelBtn} onPress={() => setReplyModal(null)}>
                <Text style={st.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[st.submitBtn, !replyText.trim() && st.submitBtnDisabled]}
                onPress={handleReply}
                disabled={!replyText.trim() || submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={C.textHero} />
                ) : (
                  <Text style={st.submitBtnText}>Submit</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: S.screenPadding, paddingVertical: S.md, gap: S.md,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { flex: 1, color: C.textPrimary, fontSize: 16, fontWeight: "800", textAlign: "center" },

  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: S.screenPadding, paddingVertical: 12 },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border,
  },
  filterPillActive: { backgroundColor: C.accent, borderColor: C.accent },
  filterText: { color: C.textSecondary, fontSize: 12, fontWeight: "700" },
  filterTextActive: { color: C.textHero },

  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 40 },
  emptyTitle: { color: C.textPrimary, fontSize: 16, fontWeight: "800" },
  emptySub: { color: C.textSecondary, fontSize: 12, textAlign: "center" },

  list: { paddingHorizontal: S.screenPadding, paddingVertical: 6, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 14, padding: 14, gap: 8,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  cardDate: { color: C.textMuted, fontSize: 10, fontWeight: "600" },
  cardTitle: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
  cardSub: { color: C.textSecondary, fontSize: 11, fontWeight: "500" },

  reasonBox: {
    backgroundColor: C.elevated, borderRadius: 10, padding: 10, gap: 4,
    borderWidth: 1, borderColor: C.border,
  },
  evidenceSection: {
    gap: 6,
  },
  evidenceScroll: {
    gap: 8,
  },
  evidenceImg: {
    width: 80, height: 80, borderRadius: 8,
  },
  replyBox: {
    backgroundColor: "rgba(44,128,255,0.06)", borderRadius: 10, padding: 10, gap: 4,
    borderWidth: 1, borderColor: C.borderStream,
  },
  reasonLabel: { color: C.textMuted, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  reasonText: { color: C.textPrimary, fontSize: 12, fontWeight: "700" },
  descText: { color: C.textSecondary, fontSize: 12, fontWeight: "500" },

  replyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: C.accent, borderRadius: S.radiusSmall,
    paddingVertical: 10, marginTop: 2,
  },
  replyBtnText: { color: C.textHero, fontSize: 13, fontWeight: "800" },

  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center", alignItems: "center", padding: 30,
  },
  modal: {
    width: "100%", backgroundColor: C.surface,
    borderRadius: 16, padding: 20, gap: 12,
    borderWidth: 1, borderColor: C.border,
  },
  modalTitle: { color: C.textPrimary, fontSize: 16, fontWeight: "900" },
  modalSub: { color: C.textSecondary, fontSize: 12, fontWeight: "500" },
  modalInput: {
    backgroundColor: C.elevated, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
    padding: 12, color: C.textPrimary, fontSize: 13,
    minHeight: 100, textAlignVertical: "top",
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, alignItems: "center", paddingVertical: 12,
    borderRadius: S.radiusSmall, backgroundColor: C.elevated,
    borderWidth: 1, borderColor: C.border,
  },
  cancelBtnText: { color: C.textSecondary, fontSize: 13, fontWeight: "700" },
  submitBtn: {
    flex: 1, alignItems: "center", paddingVertical: 12,
    borderRadius: S.radiusSmall, backgroundColor: C.accent,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: C.textHero, fontSize: 13, fontWeight: "800" },
});
