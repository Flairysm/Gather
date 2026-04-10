import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";
import { C, S } from "../theme";
import { useAppNavigation } from "../navigation/NavigationContext";
import { supabase } from "../lib/supabase";

type Address = {
  id: string;
  label: string;
  full_name: string;
  phone: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  is_default: boolean;
};

type Props = { onBack: () => void };

export default function AddressBookScreen({ onBack }: Props) {
  const { push } = useAppNavigation();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("AddressBookScreen load failed:", error.message);
      setAddresses([]);
      return;
    }
    if (data) setAddresses(data as Address[]);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function handleSetDefault(id: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error: clearError } = await supabase.from("user_addresses").update({ is_default: false }).eq("user_id", user.id);
    if (clearError) {
      console.warn("AddressBookScreen clear default failed:", clearError.message);
      return;
    }
    const { error: setError } = await supabase.from("user_addresses").update({ is_default: true }).eq("id", id);
    if (setError) {
      console.warn("AddressBookScreen set default failed:", setError.message);
    }
    load();
  }

  function handleDelete(address: Address) {
    Alert.alert(
      "Delete Address",
      `Remove "${address.label}" at ${address.address_line1}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.from("user_addresses").delete().eq("id", address.id);
            if (error) {
              console.warn("AddressBookScreen delete failed:", error.message);
            }
            load();
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar style="light" />
        <View style={st.header}>
          <Pressable style={st.backBtn} onPress={onBack}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>
          <Text style={st.headerTitle}>Address Book</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />

      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>Address Book</Text>
        <Pressable
          style={st.addBtn}
          onPress={() => push({ type: "ADD_ADDRESS" })}
        >
          <Feather name="plus" size={18} color={C.accent} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={st.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
        }
      >
        {addresses.length === 0 ? (
          <View style={st.emptyState}>
            <View style={st.emptyIcon}>
              <Ionicons name="location-outline" size={36} color={C.textMuted} />
            </View>
            <Text style={st.emptyTitle}>No Saved Addresses</Text>
            <Text style={st.emptySub}>
              Add a shipping address to start bidding on auctions.
            </Text>
            <Pressable
              style={st.emptyBtn}
              onPress={() => push({ type: "ADD_ADDRESS" })}
            >
              <Feather name="plus" size={16} color={C.textHero} />
              <Text style={st.emptyBtnText}>Add Address</Text>
            </Pressable>
          </View>
        ) : (
          addresses.map((addr) => (
            <View key={addr.id} style={[st.card, addr.is_default && st.cardDefault]}>
              <View style={st.cardHeader}>
                <View style={st.labelRow}>
                  <Ionicons name="location" size={16} color={addr.is_default ? C.accent : C.textSecondary} />
                  <Text style={st.cardLabel}>{addr.label}</Text>
                  {addr.is_default && (
                    <View style={st.defaultBadge}>
                      <Text style={st.defaultBadgeText}>Default</Text>
                    </View>
                  )}
                </View>
                <View style={st.cardActions}>
                  <Pressable
                    style={st.iconAction}
                    onPress={() => push({ type: "ADD_ADDRESS", editId: addr.id })}
                  >
                    <Feather name="edit-2" size={14} color={C.textSecondary} />
                  </Pressable>
                  <Pressable style={st.iconAction} onPress={() => handleDelete(addr)}>
                    <Feather name="trash-2" size={14} color={C.danger} />
                  </Pressable>
                </View>
              </View>

              <Text style={st.cardName}>{addr.full_name}</Text>
              {addr.phone ? <Text style={st.cardPhone}>{addr.phone}</Text> : null}
              <Text style={st.cardLine}>{addr.address_line1}</Text>
              {addr.address_line2 ? <Text style={st.cardLine}>{addr.address_line2}</Text> : null}
              <Text style={st.cardLine}>{addr.zip} {addr.city}, {addr.state}</Text>
              <Text style={st.cardCountry}>Malaysia</Text>

              {!addr.is_default && (
                <Pressable style={st.setDefaultBtn} onPress={() => handleSetDefault(addr.id)}>
                  <Text style={st.setDefaultText}>Set as Default</Text>
                </Pressable>
              )}
            </View>
          ))
        )}
      </ScrollView>
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
  headerTitle: {
    flex: 1, color: C.textPrimary, fontSize: 16, fontWeight: "800", textAlign: "center",
  },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.accentGlow, borderWidth: 1, borderColor: C.borderStream,
    alignItems: "center", justifyContent: "center",
  },

  scroll: {
    paddingHorizontal: S.screenPadding, paddingTop: S.xl, paddingBottom: S.scrollPaddingBottom,
  },

  emptyState: {
    alignItems: "center", justifyContent: "center",
    paddingTop: 80, gap: 12,
  },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  emptyTitle: { color: C.textPrimary, fontSize: 18, fontWeight: "900" },
  emptySub: {
    color: C.textSecondary, fontSize: 13, fontWeight: "500",
    textAlign: "center", lineHeight: 20, maxWidth: 260,
  },
  emptyBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: C.accent, borderRadius: S.radiusSmall,
    paddingHorizontal: 20, paddingVertical: 14, marginTop: 12,
  },
  emptyBtnText: { color: C.textHero, fontSize: 14, fontWeight: "800" },

  card: {
    backgroundColor: C.surface, borderRadius: S.radiusCard,
    borderWidth: 1, borderColor: C.border,
    padding: S.lg, marginBottom: S.md, gap: 4,
  },
  cardDefault: { borderColor: C.borderStream },
  cardHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 8,
  },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardLabel: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
  defaultBadge: {
    backgroundColor: C.accentGlow, borderRadius: S.radiusBadge,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: C.borderStream,
  },
  defaultBadgeText: { color: C.textAccent, fontSize: 9, fontWeight: "800" },
  cardActions: { flexDirection: "row", gap: 8 },
  iconAction: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  cardName: { color: C.textPrimary, fontSize: 14, fontWeight: "700" },
  cardPhone: { color: C.textSecondary, fontSize: 13, fontWeight: "500" },
  cardLine: { color: C.textSecondary, fontSize: 13, fontWeight: "500" },
  cardCountry: { color: C.textMuted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  setDefaultBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: C.elevated, borderRadius: S.radiusBadge,
    borderWidth: 1, borderColor: C.border, marginTop: 8,
  },
  setDefaultText: { color: C.textAccent, fontSize: 11, fontWeight: "700" },
});
