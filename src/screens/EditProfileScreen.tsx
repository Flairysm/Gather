import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { C, S } from "../theme";
import { supabase } from "../lib/supabase";

type Props = { onBack: () => void };

export default function EditProfileScreen({ onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");

  const load = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data } = await supabase
        .from("profiles")
        .select("display_name, username")
        .eq("id", user.id)
        .maybeSingle();

      if (data) {
        setDisplayName(data.display_name ?? "");
        setUsername(data.username ?? "");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!userId || saving) return;

    const nextUsername = username.trim().toLowerCase();
    const nextDisplayName = displayName.trim();

    if (!nextUsername) {
      Alert.alert("Username required", "Please enter a username.");
      return;
    }
    if (!/^[a-z0-9_]{3,20}$/.test(nextUsername)) {
      Alert.alert(
        "Invalid username",
        "Use 3-20 characters: lowercase letters, numbers, or underscore.",
      );
      return;
    }
    if (!nextDisplayName) {
      Alert.alert("Display name required", "Please enter a display name.");
      return;
    }

    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", nextUsername)
        .neq("id", userId)
        .maybeSingle();

      if (existing) {
        Alert.alert("Username taken", "Please choose another username.");
        setSaving(false);
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: nextDisplayName,
          username: nextUsername,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) throw error;

      Alert.alert("Saved", "Your profile has been updated.", [
        { text: "OK", onPress: onBack },
      ]);
    } catch (e: any) {
      Alert.alert("Update failed", e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar style="light" />
        <View style={st.loadingWrap}>
          <ActivityIndicator color={C.accent} size="large" />
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
        <Text style={st.headerTitle}>Edit Profile</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={st.card}>
        <Text style={st.label}>Display Name</Text>
        <TextInput
          style={st.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your public name"
          placeholderTextColor={C.textMuted}
          maxLength={40}
        />

        <Text style={st.label}>Username</Text>
        <TextInput
          style={st.input}
          value={username}
          onChangeText={(v) => setUsername(v.replace(/\s+/g, ""))}
          placeholder="username"
          placeholderTextColor={C.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
        />
        <Text style={st.hint}>
          3-20 chars, lowercase letters, numbers, underscore.
        </Text>
      </View>

      <View style={st.footer}>
        <Pressable style={st.saveBtn} onPress={save} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={C.textHero} size="small" />
          ) : (
            <Text style={st.saveBtnText}>Save Changes</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
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
  headerTitle: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  card: {
    margin: S.screenPadding,
    padding: S.lg,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    gap: 8,
  },
  label: {
    marginTop: 6,
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: S.radiusSmall,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "500",
  },
  hint: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
  footer: {
    marginTop: "auto",
    paddingHorizontal: S.screenPadding,
    paddingBottom: 20,
  },
  saveBtn: {
    backgroundColor: C.accent,
    borderRadius: S.radiusSmall,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  saveBtnText: {
    color: C.textHero,
    fontSize: 14,
    fontWeight: "800",
  },
});
