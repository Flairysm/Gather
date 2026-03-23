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
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditableListing | null>(null);
  const [editingWanted, setEditingWanted] = useState<EditableWanted | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
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
    const { data } = await supabase
      .from("listings")
      .select(
        "id, seller_id, card_name, edition, grade, condition, price, category, description, images, views, status, created_at",
      )
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false });

    const { data: wantedData } = await supabase
      .from("wanted_posts")
      .select(
        "id, buyer_id, card_name, edition, grade_wanted, offer_price, category, description, image_url, views, status, created_at",
      )
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false });

    setRows((data ?? []) as Listing[]);
    setWantedRows((wantedData ?? []) as WantedPost[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  const isEmpty = useMemo(
    () =>
      !loading &&
      (tab === "listings" ? rows.length === 0 : wantedRows.length === 0),
    [loading, rows.length, tab, wantedRows.length],
  );

  async function handleDelete(id: string) {
    if (!currentUserId) return;
    Alert.alert("Delete listing", "Are you sure you want to delete this listing?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from("listings")
            .delete()
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
    const nextPrice = parseFloat(String(editing.price).replace(/[$,]/g, ""));
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
    const nextPrice = parseFloat(String(editingWanted.offer_price).replace(/[$,]/g, ""));
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
        <View style={st.centerWrap}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
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
        <FlatList
          data={tab === "listings" ? rows : wantedRows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={st.list}
          renderItem={({ item }) => (
            <View style={st.row}>
              <View style={st.thumb}>
                {"images" in item && item.images?.[0] ? (
                  <Image source={{ uri: item.images[0] }} style={st.thumbImg} />
                ) : "image_url" in item && item.image_url ? (
                  <Image source={{ uri: item.image_url }} style={st.thumbImg} />
                ) : (
                  <Ionicons name="image-outline" size={18} color={C.textMuted} />
                )}
              </View>
              <View style={st.info}>
                <Text style={st.name} numberOfLines={1}>
                  {item.card_name}
                </Text>
                <Text style={st.meta} numberOfLines={1}>
                  {item.edition ?? "—"}{" "}
                  {"grade" in item && item.grade ? `• ${item.grade}` : ""}
                  {"grade_wanted" in item && item.grade_wanted ? `• ${item.grade_wanted}` : ""}
                </Text>
                <Text style={st.price}>
                  $
                  {Number(
                    "price" in item ? item.price : item.offer_price,
                  ).toLocaleString()}
                </Text>
              </View>
              <View style={st.actions}>
                <View
                  style={[
                    st.statusChip,
                    item.status === "active" ? st.statusActive : st.statusInactive,
                  ]}
                >
                  <Text
                    style={[
                      st.statusText,
                      item.status === "active" ? st.statusTextActive : st.statusTextInactive,
                    ]}
                  >
                    {item.status}
                  </Text>
                </View>
                <Pressable
                  style={st.actionBtn}
                  onPress={() => {
                    if ("price" in item) {
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
                      });
                    } else {
                      setEditingWanted({
                        id: item.id,
                        card_name: item.card_name,
                        edition: item.edition,
                        grade_wanted: item.grade_wanted,
                        offer_price: item.offer_price,
                        category: item.category,
                        description: item.description,
                        status: item.status,
                      });
                    }
                  }}
                >
                  <Feather name="edit-2" size={13} color={C.textPrimary} />
                  <Text style={st.actionText}>Edit</Text>
                </Pressable>
                <Pressable
                  style={st.deleteBtn}
                  onPress={() =>
                    "price" in item ? handleDelete(item.id) : handleDeleteWanted(item.id)
                  }
                >
                  <Feather name="trash-2" size={13} color={C.danger} />
                  <Text style={st.deleteText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
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
});

