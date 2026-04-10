import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";

import { C, S } from "../theme";
import { supabase } from "../lib/supabase";
import type { Listing, WantedPost } from "../data/market";
import Shimmer, { ShimmerGroup, FadeIn } from "../components/Shimmer";
import ErrorState from "../components/ErrorState";

type Props = { onBack: () => void };

type EditableListing = {
  id: string;
  card_name: string;
  edition: string | null;
  grade: string | null;
  price: number;
  category: string;
  description: string | null;
  status: string;
  images: string[];
};

type EditableWanted = {
  id: string;
  card_name: string;
  edition: string | null;
  grade_wanted: string | null;
  offer_price: number;
  category: string;
  description: string | null;
  status: string;
};

const STATUS_OPTIONS = ["active", "sold", "removed"] as const;
const WANTED_STATUS_OPTIONS = ["active", "fulfilled", "removed"] as const;
type TabId = "listings" | "wtb";

export default function MyListingsScreen({ onBack }: Props) {
  const [tab, setTab] = useState<TabId>("listings");
  const [rows, setRows] = useState<Listing[]>([]);
  const [wantedRows, setWantedRows] = useState<WantedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditableListing | null>(null);
  const [editingWanted, setEditingWanted] = useState<EditableWanted | null>(null);
  const [soldCounts, setSoldCounts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setCurrentUserId(null);
      setRows([]);
      setLoading(false);
      return;
    }

    setCurrentUserId(user.id);
    const { data, error: listErr } = await supabase
      .from("listings")
      .select(
        "id, seller_id, card_name, edition, grade, condition, price, quantity, category, description, images, views, status, created_at",
      )
      .eq("seller_id", user.id)
      .neq("status", "removed")
      .order("created_at", { ascending: false })
      .limit(200);

    if (listErr) {
      console.warn("MyListingsScreen load listings error:", listErr.message);
      setLoadError(true);
      setLoading(false);
      return;
    }

    const { data: wantedData } = await supabase
      .from("wanted_posts")
      .select(
        "id, buyer_id, card_name, edition, grade_wanted, offer_price, category, description, image_url, views, status, created_at",
      )
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);

    setRows((data ?? []) as Listing[]);
    setWantedRows((wantedData ?? []) as WantedPost[]);
    const listingIds = (data ?? []).map((l: any) => l.id);
    if (listingIds.length > 0) {
      const { data: oiData } = await supabase
        .from("order_items")
        .select("listing_id, quantity")
        .in("listing_id", listingIds);
      const counts: Record<string, number> = {};
      for (const row of oiData ?? []) {
        const id = (row as any).listing_id as string;
        counts[id] = (counts[id] ?? 0) + Number((row as any).quantity ?? 1);
      }
      setSoldCounts(counts);
    } else {
      setSoldCounts({});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch(() => { setLoadError(true); setLoading(false); });
  }, [load]);

  const isEmpty = useMemo(
    () =>
      !loading &&
      (tab === "listings" ? rows.length === 0 : wantedRows.length === 0),
    [loading, rows.length, tab, wantedRows.length],
  );

  async function handleDelete(id: string) {
    if (!currentUserId) return;
    Alert.alert("Remove listing", "This will remove it from marketplace, but keep order history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          // Keep order history intact: listings are referenced by `order_items`, so we soft-remove.
          await supabase.from("vendor_display_items").delete().eq("listing_id", id);
          const { error } = await supabase
            .from("listings")
            .update({ status: "removed", updated_at: new Date().toISOString() })
            .eq("id", id)
            .eq("seller_id", currentUserId);
          if (error) {
            Alert.alert("Error", error.message);
            return;
          }
          await load();
        },
      },
    ]);
  }

  async function handleDeleteWanted(id: string) {
    if (!currentUserId) return;
    Alert.alert("Delete WTB post", "Are you sure you want to delete this WTB post?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from("wanted_posts")
            .delete()
            .eq("id", id)
            .eq("buyer_id", currentUserId);
          if (error) {
            Alert.alert("Error", error.message);
            return;
          }
          await load();
        },
      },
    ]);
  }

  async function handleSaveEdit() {
    if (!editing || !currentUserId) return;
    setSaving(true);
    const nextPrice = parseFloat(
      String(editing.price).replace(/(RM|\$|,)/gi, ""),
    );
    if (isNaN(nextPrice) || nextPrice <= 0) {
      setSaving(false);
      Alert.alert("Error", "Price must be a valid number.");
      return;
    }

    const { error } = await supabase
      .from("listings")
      .update({
        card_name: editing.card_name.trim(),
        edition: editing.edition?.trim() || null,
        grade: editing.grade?.trim() || null,
        price: nextPrice,
        category: editing.category.trim(),
        description: editing.description?.trim() || null,
        status: editing.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editing.id)
      .eq("seller_id", currentUserId);

    setSaving(false);
    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    setEditing(null);
    await load();
  }

  async function handleSaveWantedEdit() {
    if (!editingWanted || !currentUserId) return;
    setSaving(true);
    const nextPrice = parseFloat(
      String(editingWanted.offer_price).replace(/(RM|\$|,)/gi, ""),
    );
    if (isNaN(nextPrice) || nextPrice <= 0) {
      setSaving(false);
      Alert.alert("Error", "Offer price must be a valid number.");
      return;
    }

    const { error } = await supabase
      .from("wanted_posts")
      .update({
        card_name: editingWanted.card_name.trim(),
        edition: editingWanted.edition?.trim() || null,
        grade_wanted: editingWanted.grade_wanted?.trim() || null,
        offer_price: nextPrice,
        category: editingWanted.category.trim(),
        description: editingWanted.description?.trim() || null,
        status: editingWanted.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editingWanted.id)
      .eq("buyer_id", currentUserId);

    setSaving(false);
    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    setEditingWanted(null);
    await load();
  }

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.header}>
        <Pressable onPress={onBack} style={st.backBtn}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={st.title}>My Listings</Text>
        <Pressable onPress={() => load()} style={st.refreshBtn}>
          <Ionicons name="refresh" size={18} color={C.textPrimary} />
        </Pressable>
      </View>
      <View style={st.segmentRow}>
        <Pressable
          style={[st.segmentTab, tab === "listings" && st.segmentTabActive]}
          onPress={() => setTab("listings")}
        >
          <Text style={[st.segmentText, tab === "listings" && st.segmentTextActive]}>
            Listings
          </Text>
        </Pressable>
        <Pressable
          style={[st.segmentTab, tab === "wtb" && st.segmentTabActive]}
          onPress={() => setTab("wtb")}
        >
          <Text style={[st.segmentText, tab === "wtb" && st.segmentTextActive]}>
            WTB Posts
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <ShimmerGroup>
          <View style={st.list}>
            {[0, 1, 2, 3, 4].map((i) => (
              <View key={i} style={st.prodCard}>
                <View style={st.prodCardRow}>
                  <Shimmer width={56} height={56} borderRadius={12} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Shimmer width="75%" height={14} borderRadius={6} />
                    <Shimmer width="50%" height={11} borderRadius={5} />
                    <Shimmer width="35%" height={12} borderRadius={5} />
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                  <Shimmer width={70} height={10} borderRadius={4} />
                  <Shimmer width={60} height={10} borderRadius={4} />
                </View>
              </View>
            ))}
          </View>
        </ShimmerGroup>
      ) : loadError ? (
        <ErrorState message="Could not load your listings." onRetry={load} />
      ) : isEmpty ? (
        <View style={st.centerWrap}>
          <Ionicons name="pricetag-outline" size={30} color={C.textMuted} />
          <Text style={st.emptyTitle}>
            {tab === "listings" ? "No listings yet" : "No WTB posts yet"}
          </Text>
          <Text style={st.emptySub}>
            {tab === "listings"
              ? "Create your first listing from Market."
              : "Create your first wanted post from Market."}
          </Text>
        </View>
      ) : (
        <FadeIn>
        <FlatList
          data={(tab === "listings" ? rows : wantedRows) as any[]}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={st.list}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews
          renderItem={({ item }: { item: any }) => {
            if ("price" in item) {
              const sold = soldCounts[item.id] ?? 0;
              const qty = Number((item as any).quantity ?? 0);
              return (
                <View style={st.prodCard}>
                  <View style={st.prodCardRow}>
                    <View style={st.prodThumb}>
                      {item.images?.[0] ? (
                        <Image source={{ uri: item.images[0] }} style={st.prodThumbImg} />
                      ) : (
                        <Ionicons name="image-outline" size={20} color={C.textMuted} />
                      )}
                    </View>
                    <View style={st.prodInfo}>
                      <Text style={st.prodName} numberOfLines={2}>{item.card_name}</Text>
                      <Text style={st.prodMeta} numberOfLines={1}>
                        {[item.edition, item.grade].filter(Boolean).join(" · ")}
                      </Text>
                      <Text style={st.prodPrice}>
                        RM{Number(item.price).toLocaleString("en-MY", { maximumFractionDigits: 0 })}
                      </Text>
                    </View>
                  </View>
                  <View style={st.prodStatsRow}>
                    <View style={st.prodStat}>
                      <Ionicons name="layers-outline" size={13} color={C.textMuted} />
                      <Text style={st.prodStatText}>Stock {qty}</Text>
                    </View>
                    <View style={st.prodStat}>
                      <Ionicons name="cart-outline" size={13} color={C.textMuted} />
                      <Text style={st.prodStatText}>Sold {sold}</Text>
                    </View>
                  </View>
                  <View style={st.prodActionsRow}>
                    <Pressable style={st.prodActionBtn} onPress={() => handleDelete(item.id)}>
                      <Text style={st.prodActionText}>Delist</Text>
                    </Pressable>
                    <Pressable
                      style={[st.prodActionBtn, st.prodActionBtnEdit]}
                      onPress={() =>
                        setEditing({
                          id: item.id,
                          card_name: item.card_name,
                          edition: item.edition,
                          grade: item.grade,
                          price: item.price,
                          category: item.category,
                          description: item.description,
                          status: item.status,
                          images: item.images ?? [],
                        })
                      }
                    >
                      <Text style={st.prodActionEditText}>Edit</Text>
                    </Pressable>
                  </View>
                </View>
              );
            }
            return (
              <View style={st.prodCard}>
                <View style={st.prodCardRow}>
                  <View style={st.prodThumb}>
                    {"image_url" in item && item.image_url ? (
                      <Image source={{ uri: item.image_url }} style={st.prodThumbImg} />
                    ) : (
                      <Ionicons name="image-outline" size={20} color={C.textMuted} />
                    )}
                  </View>
                  <View style={st.prodInfo}>
                    <Text style={st.prodName} numberOfLines={2}>{item.card_name}</Text>
                    <Text style={st.prodMeta} numberOfLines={1}>
                      {[item.edition, item.grade_wanted].filter(Boolean).join(" · ")}
                    </Text>
                    <Text style={st.prodPrice}>
                      RM{Number(item.offer_price).toLocaleString("en-MY", { maximumFractionDigits: 0 })}
                    </Text>
                  </View>
                </View>
                <View style={st.prodStatsRow}>
                  <View style={st.prodStat}>
                    <Ionicons name="grid-outline" size={13} color={C.textMuted} />
                    <Text style={st.prodStatText}>{item.category || "General"}</Text>
                  </View>
                  <View style={st.prodStat}>
                    <Ionicons name="checkmark-circle-outline" size={13} color={C.textMuted} />
                    <Text style={st.prodStatText}>{item.status}</Text>
                  </View>
                </View>
                <View style={st.prodActionsRow}>
                  <Pressable style={st.prodActionBtn} onPress={() => handleDeleteWanted(item.id)}>
                    <Text style={st.prodActionText}>Delete</Text>
                  </Pressable>
                  <Pressable
                    style={[st.prodActionBtn, st.prodActionBtnEdit]}
                    onPress={() =>
                      setEditingWanted({
                        id: item.id,
                        card_name: item.card_name,
                        edition: item.edition,
                        grade_wanted: item.grade_wanted,
                        offer_price: item.offer_price,
                        category: item.category,
                        description: item.description,
                        status: item.status,
                      })
                    }
                  >
                    <Text style={st.prodActionEditText}>Edit</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
        </FadeIn>
      )}

      {editing && (
        <View style={st.modalScrim}>
          <View style={st.modal}>
            <Text style={st.modalTitle}>Edit Listing</Text>
            <TextInput
              style={st.input}
              value={editing.card_name}
              onChangeText={(v) => setEditing({ ...editing, card_name: v })}
              placeholder="Card name"
              placeholderTextColor={C.textMuted}
            />
            <TextInput
              style={st.input}
              value={editing.edition ?? ""}
              onChangeText={(v) => setEditing({ ...editing, edition: v })}
              placeholder="Edition"
              placeholderTextColor={C.textMuted}
            />
            <TextInput
              style={st.input}
              value={editing.grade ?? ""}
              onChangeText={(v) => setEditing({ ...editing, grade: v })}
              placeholder="Grade"
              placeholderTextColor={C.textMuted}
            />
            <TextInput
              style={st.input}
              value={String(editing.price)}
              onChangeText={(v) => setEditing({ ...editing, price: Number(v) || 0 })}
              placeholder="Price"
              placeholderTextColor={C.textMuted}
              keyboardType="numeric"
            />
            <TextInput
              style={st.input}
              value={editing.category}
              onChangeText={(v) => setEditing({ ...editing, category: v })}
              placeholder="Category"
              placeholderTextColor={C.textMuted}
            />
            <TextInput
              style={[st.input, st.inputMulti]}
              value={editing.description ?? ""}
              onChangeText={(v) => setEditing({ ...editing, description: v })}
              placeholder="Description"
              placeholderTextColor={C.textMuted}
              multiline
            />
            <View style={st.statusRow}>
              {STATUS_OPTIONS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setEditing({ ...editing, status: s })}
                  style={[st.statusOption, editing.status === s && st.statusOptionActive]}
                >
                  <Text
                    style={[
                      st.statusOptionText,
                      editing.status === s && st.statusOptionTextActive,
                    ]}
                  >
                    {s}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={st.modalActions}>
              <Pressable style={st.cancelBtn} onPress={() => setEditing(null)}>
                <Text style={st.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={st.saveBtn} onPress={handleSaveEdit} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color={C.textHero} />
                ) : (
                  <Text style={st.saveText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      )}
      {editingWanted && (
        <View style={st.modalScrim}>
          <View style={st.modal}>
            <Text style={st.modalTitle}>Edit WTB Post</Text>
            <TextInput
              style={st.input}
              value={editingWanted.card_name}
              onChangeText={(v) => setEditingWanted({ ...editingWanted, card_name: v })}
              placeholder="Card name"
              placeholderTextColor={C.textMuted}
            />
            <TextInput
              style={st.input}
              value={editingWanted.edition ?? ""}
              onChangeText={(v) => setEditingWanted({ ...editingWanted, edition: v })}
              placeholder="Edition"
              placeholderTextColor={C.textMuted}
            />
            <TextInput
              style={st.input}
              value={editingWanted.grade_wanted ?? ""}
              onChangeText={(v) => setEditingWanted({ ...editingWanted, grade_wanted: v })}
              placeholder="Grade wanted"
              placeholderTextColor={C.textMuted}
            />
            <TextInput
              style={st.input}
              value={String(editingWanted.offer_price)}
              onChangeText={(v) =>
                setEditingWanted({ ...editingWanted, offer_price: Number(v) || 0 })
              }
              placeholder="Offer price"
              placeholderTextColor={C.textMuted}
              keyboardType="numeric"
            />
            <TextInput
              style={st.input}
              value={editingWanted.category}
              onChangeText={(v) => setEditingWanted({ ...editingWanted, category: v })}
              placeholder="Category"
              placeholderTextColor={C.textMuted}
            />
            <TextInput
              style={[st.input, st.inputMulti]}
              value={editingWanted.description ?? ""}
              onChangeText={(v) => setEditingWanted({ ...editingWanted, description: v })}
              placeholder="Description"
              placeholderTextColor={C.textMuted}
              multiline
            />
            <View style={st.statusRow}>
              {WANTED_STATUS_OPTIONS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setEditingWanted({ ...editingWanted, status: s })}
                  style={[st.statusOption, editingWanted.status === s && st.statusOptionActive]}
                >
                  <Text
                    style={[
                      st.statusOptionText,
                      editingWanted.status === s && st.statusOptionTextActive,
                    ]}
                  >
                    {s}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={st.modalActions}>
              <Pressable style={st.cancelBtn} onPress={() => setEditingWanted(null)}>
                <Text style={st.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={st.saveBtn} onPress={handleSaveWantedEdit} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color={C.textHero} />
                ) : (
                  <Text style={st.saveText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: S.screenPadding,
    paddingVertical: S.md,
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
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: C.textPrimary, fontSize: 16, fontWeight: "800" },
  segmentRow: {
    flexDirection: "row",
    marginHorizontal: S.screenPadding,
    marginTop: S.md,
    marginBottom: S.sm,
    backgroundColor: C.elevated,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.border,
    padding: 3,
  },
  segmentTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: S.radiusSmall - 1,
  },
  segmentTabActive: {
    backgroundColor: C.accent,
  },
  segmentText: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  segmentTextActive: {
    color: C.textHero,
  },
  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyTitle: { color: C.textPrimary, fontSize: 15, fontWeight: "800" },
  emptySub: { color: C.textSecondary, fontSize: 12 },
  list: { padding: S.screenPadding, gap: S.md, paddingBottom: 80 },
  row: {
    flexDirection: "row",
    gap: S.md,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: S.radiusCard,
    padding: S.md,
  },
  thumb: {
    width: 62,
    height: 62,
    borderRadius: 10,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.borderCard,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImg: { width: 62, height: 62 },
  info: { flex: 1, justifyContent: "center", gap: 2 },
  name: { color: C.textPrimary, fontSize: 13, fontWeight: "800" },
  meta: { color: C.textSecondary, fontSize: 11, fontWeight: "500" },
  price: { color: C.accent, fontSize: 13, fontWeight: "800", marginTop: 2 },
  actions: { alignItems: "flex-end", gap: 6, justifyContent: "center" },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusActive: { backgroundColor: "rgba(16,185,129,0.2)" },
  statusInactive: { backgroundColor: "rgba(148,163,184,0.2)" },
  statusText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  statusTextActive: { color: "#34D399" },
  statusTextInactive: { color: C.textSecondary },
  actionBtn: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  actionText: { color: C.textPrimary, fontSize: 11, fontWeight: "700" },
  deleteBtn: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.28)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  deleteText: { color: C.danger, fontSize: 11, fontWeight: "700" },
  modalScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modal: {
    width: "100%",
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    gap: 10,
  },
  modalTitle: { color: C.textPrimary, fontSize: 16, fontWeight: "800" },
  input: {
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    color: C.textPrimary,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
    fontWeight: "500",
  },
  inputMulti: {
    height: 74,
    paddingTop: 10,
    textAlignVertical: "top",
  },
  statusRow: { flexDirection: "row", gap: 8 },
  statusOption: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.elevated,
    alignItems: "center",
    paddingVertical: 8,
  },
  statusOptionActive: {
    borderColor: C.accent,
    backgroundColor: C.accentGlow,
  },
  statusOptionText: { color: C.textSecondary, fontSize: 11, fontWeight: "700" },
  statusOptionTextActive: { color: C.textAccent },
  modalActions: { flexDirection: "row", gap: 8, marginTop: 2 },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    backgroundColor: C.elevated,
  },
  cancelText: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  saveBtn: {
    flex: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    backgroundColor: C.accent,
  },
  saveText: { color: C.textHero, fontSize: 13, fontWeight: "800" },
  // My Product-style cards for listings tab
  prodCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    marginBottom: 12,
    overflow: "hidden",
  },
  prodCardRow: { flexDirection: "row", padding: 14, gap: 12 },
  prodThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  prodThumbImg: { width: 72, height: 72, borderRadius: 10 },
  prodInfo: { flex: 1, justifyContent: "center", gap: 2 },
  prodName: { color: C.textPrimary, fontSize: 14, fontWeight: "700" },
  prodMeta: { color: C.textSecondary, fontSize: 11, fontWeight: "500" },
  prodPrice: { color: C.accent, fontSize: 15, fontWeight: "900", marginTop: 2 },
  prodStatsRow: { flexDirection: "row", paddingHorizontal: 14, paddingBottom: 10, gap: 20 },
  prodStat: { flexDirection: "row", alignItems: "center", gap: 5 },
  prodStatText: { color: C.textSecondary, fontSize: 12, fontWeight: "600" },
  prodActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  prodActionBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
  },
  prodActionText: { color: C.textPrimary, fontSize: 12, fontWeight: "700" },
  prodActionBtnEdit: { borderColor: C.accent },
  prodActionEditText: { color: C.accent, fontSize: 12, fontWeight: "700" },
});

