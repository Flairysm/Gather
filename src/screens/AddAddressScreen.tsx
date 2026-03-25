import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { C, S } from "../theme";
import { supabase } from "../lib/supabase";

const LABELS = ["Home", "Work", "Other"] as const;

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

type Props = { editId?: string; onBack: () => void };

export default function AddAddressScreen({ editId, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [label, setLabel] = useState<string>("Home");
  const [fullName, setFullName] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editId);

  useEffect(() => {
    if (!editId) return;
    (async () => {
      const { data } = await supabase
        .from("user_addresses")
        .select("*")
        .eq("id", editId)
        .maybeSingle();
      if (data) {
        setLabel(data.label);
        setFullName(data.full_name);
        setLine1(data.address_line1);
        setLine2(data.address_line2 ?? "");
        setCity(data.city);
        setState(data.state);
        setZip(data.zip);
        setIsDefault(data.is_default);
      }
      setLoading(false);
    })();
  }, [editId]);

  const isValid =
    fullName.trim().length > 0 &&
    line1.trim().length > 0 &&
    city.trim().length > 0 &&
    state.trim().length >= 2 &&
    zip.trim().length >= 5;

  async function handleSave() {
    if (!isValid || saving) return;
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const payload = {
        user_id: user.id,
        label,
        full_name: fullName.trim(),
        address_line1: line1.trim(),
        address_line2: line2.trim() || null,
        city: city.trim(),
        state: state.trim().toUpperCase(),
        zip: zip.trim(),
        // Malaysia-first for now
        country: "MY",
        is_default: isDefault,
      };

      if (isDefault) {
        await supabase
          .from("user_addresses")
          .update({ is_default: false })
          .eq("user_id", user.id);
      }

      if (editId) {
        const { error } = await supabase
          .from("user_addresses")
          .update(payload)
          .eq("id", editId);
        if (error) throw error;
      } else {
        const { data: existing } = await supabase
          .from("user_addresses")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);
        const isFirst = (existing as any)?.length === 0 || !(existing as any);

        const { error } = await supabase
          .from("user_addresses")
          .insert({ ...payload, is_default: isFirst ? true : payload.is_default });
        if (error) throw error;
      }

      onBack();
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Failed to save address");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar style="light" />
        <View style={st.header}>
          <Pressable style={st.backBtn} onPress={onBack}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>
          <Text style={st.headerTitle}>{editId ? "Edit Address" : "Add Address"}</Text>
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
        <Text style={st.headerTitle}>{editId ? "Edit Address" : "Add Address"}</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={st.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Label */}
          <Text style={st.fieldLabel}>Label</Text>
          <View style={st.labelRow}>
            {LABELS.map((l) => (
              <Pressable
                key={l}
                style={[st.labelPill, label === l && st.labelPillActive]}
                onPress={() => setLabel(l)}
              >
                <Text style={[st.labelPillText, label === l && st.labelPillTextActive]}>
                  {l}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Full Name */}
          <Text style={st.fieldLabel}>Full Name</Text>
          <TextInput
            style={st.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="John Doe"
            placeholderTextColor={C.textMuted}
            autoCapitalize="words"
          />

          {/* Address Line 1 */}
          <Text style={st.fieldLabel}>Address Line 1</Text>
          <TextInput
            style={st.input}
            value={line1}
            onChangeText={setLine1}
            placeholder="123 Main Street"
            placeholderTextColor={C.textMuted}
          />

          {/* Address Line 2 */}
          <Text style={st.fieldLabel}>
            Address Line 2 <Text style={st.optional}>(optional)</Text>
          </Text>
          <TextInput
            style={st.input}
            value={line2}
            onChangeText={setLine2}
            placeholder="Apt 4B"
            placeholderTextColor={C.textMuted}
          />

          {/* City + State row */}
          <View style={st.rowFields}>
            <View style={{ flex: 2 }}>
              <Text style={st.fieldLabel}>City</Text>
              <TextInput
                style={st.input}
                value={city}
                onChangeText={setCity}
                placeholder="New York"
                placeholderTextColor={C.textMuted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.fieldLabel}>State</Text>
              <TextInput
                style={st.input}
                value={state}
                onChangeText={(t) => setState(t.toUpperCase().slice(0, 2))}
                placeholder="NY"
                placeholderTextColor={C.textMuted}
                autoCapitalize="characters"
                maxLength={2}
              />
            </View>
          </View>

          {/* ZIP */}
          <Text style={st.fieldLabel}>ZIP Code</Text>
          <TextInput
            style={[st.input, { maxWidth: 160 }]}
            value={zip}
            onChangeText={(t) => setZip(t.replace(/\D/g, "").slice(0, 5))}
            placeholder="10001"
            placeholderTextColor={C.textMuted}
            keyboardType="number-pad"
            maxLength={5}
          />

          {/* Default toggle */}
          <Pressable
            style={st.defaultRow}
            onPress={() => setIsDefault(!isDefault)}
          >
            <View style={[st.checkbox, isDefault && st.checkboxActive]}>
              {isDefault && <Ionicons name="checkmark" size={14} color={C.textHero} />}
            </View>
            <Text style={st.defaultLabel}>Set as default shipping address</Text>
          </Pressable>
        </ScrollView>

        {/* Bottom save button */}
        <View style={[st.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <Pressable
            style={[st.saveBtn, !isValid && st.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!isValid || saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={C.textHero} />
            ) : (
              <Text style={[st.saveBtnText, !isValid && st.saveBtnTextDisabled]}>
                {editId ? "Update Address" : "Save Address"}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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

  scroll: {
    paddingHorizontal: S.screenPadding, paddingTop: S.xl, paddingBottom: 120,
  },

  fieldLabel: {
    color: C.textPrimary, fontSize: 13, fontWeight: "700", marginBottom: 6,
  },
  optional: { color: C.textMuted, fontWeight: "500" },

  input: {
    backgroundColor: C.elevated, borderRadius: S.radiusSmall,
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 14, height: 46,
    color: C.textPrimary, fontSize: 14, fontWeight: "500",
    marginBottom: S.xl,
  },

  labelRow: {
    flexDirection: "row", gap: 8, marginBottom: S.xl,
  },
  labelPill: {
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: S.radiusPill, backgroundColor: C.elevated,
    borderWidth: 1, borderColor: C.border,
  },
  labelPillActive: { backgroundColor: C.accent, borderColor: C.accent },
  labelPillText: { color: C.textSecondary, fontSize: 13, fontWeight: "700" },
  labelPillTextActive: { color: C.textHero },

  rowFields: { flexDirection: "row", gap: S.md },

  defaultRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: S.md,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: C.elevated, borderWidth: 1.5, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  checkboxActive: { backgroundColor: C.accent, borderColor: C.accent },
  defaultLabel: { color: C.textPrimary, fontSize: 13, fontWeight: "600" },

  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: S.screenPadding, paddingTop: S.lg,
    backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border,
  },
  saveBtn: {
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.accent, borderRadius: S.radiusSmall,
    paddingVertical: 16,
  },
  saveBtnDisabled: { backgroundColor: C.muted },
  saveBtnText: { color: C.textHero, fontSize: 15, fontWeight: "800" },
  saveBtnTextDisabled: { color: C.textMuted },
});
