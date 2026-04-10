import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";

import { C, S } from "../theme";
import { supabase } from "../lib/supabase";

type Mode = "login" | "register";

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setInfo(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Email and password are required.");
      return;
    }

    if (mode === "register") {
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setLoading(true);
    if (mode === "login") {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      setLoading(false);
      if (signInError) {
        setError(signInError.message);
      }
      return;
    }

    const { error: signUpError, data } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (!data.session) {
      setInfo("Account created. Please check your email to confirm login.");
    } else {
      setInfo("Account created successfully.");
    }
  }

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />
      <View style={st.root}>
        <View style={st.card}>
          <View style={st.header}>
            <View style={st.logoWrap}>
              <Ionicons name="albums" size={22} color={C.textHero} />
            </View>
            <Text style={st.title}>Evend</Text>
            <Text style={st.subtitle}>
              {mode === "login"
                ? "Sign in to continue"
                : "Create your account"}
            </Text>
          </View>

          <View style={st.segmentRow}>
            <Pressable
              style={[st.segmentBtn, mode === "login" && st.segmentBtnActive]}
              onPress={() => {
                setMode("login");
                setError(null);
                setInfo(null);
              }}
            >
              <Text
                style={[
                  st.segmentText,
                  mode === "login" && st.segmentTextActive,
                ]}
              >
                Login
              </Text>
            </Pressable>
            <Pressable
              style={[
                st.segmentBtn,
                mode === "register" && st.segmentBtnActive,
              ]}
              onPress={() => {
                setMode("register");
                setError(null);
                setInfo(null);
              }}
            >
              <Text
                style={[
                  st.segmentText,
                  mode === "register" && st.segmentTextActive,
                ]}
              >
                Register
              </Text>
            </Pressable>
          </View>

          <View style={st.form}>
            <TextInput
              style={st.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={C.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={st.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={C.textMuted}
              secureTextEntry
            />
            {mode === "register" && (
              <TextInput
                style={st.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm Password"
                placeholderTextColor={C.textMuted}
                secureTextEntry
              />
            )}
          </View>

          {error && (
            <View style={st.errorBox}>
              <Text style={st.errorText}>{error}</Text>
            </View>
          )}
          {info && (
            <View style={st.infoBox}>
              <Text style={st.infoText}>{info}</Text>
            </View>
          )}

          <Pressable
            style={[st.submitBtn, loading && st.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={C.textHero} />
            ) : (
              <>
                <Ionicons
                  name={mode === "login" ? "log-in-outline" : "person-add-outline"}
                  size={18}
                  color={C.textHero}
                />
                <Text style={st.submitText}>
                  {mode === "login" ? "Sign In" : "Create Account"}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  root: { flex: 1, justifyContent: "center", paddingHorizontal: S.screenPadding },
  card: {
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.xl,
    gap: S.lg,
  },
  header: { alignItems: "center", gap: 6 },
  logoWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: { color: C.textPrimary, fontSize: 24, fontWeight: "900" },
  subtitle: { color: C.textSecondary, fontSize: 13, fontWeight: "500" },

  segmentRow: {
    flexDirection: "row",
    backgroundColor: C.elevated,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.border,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: S.radiusSmall - 1,
  },
  segmentBtnActive: { backgroundColor: C.accent },
  segmentText: { color: C.textSecondary, fontSize: 12, fontWeight: "700" },
  segmentTextActive: { color: C.textHero },

  form: { gap: S.md },
  input: {
    height: 46,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.elevated,
    color: C.textPrimary,
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: "500",
  },

  errorBox: {
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    backgroundColor: "rgba(239,68,68,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: { color: C.danger, fontSize: 12, fontWeight: "600" },
  infoBox: {
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.35)",
    backgroundColor: "rgba(34,197,94,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  infoText: { color: C.success, fontSize: 12, fontWeight: "600" },

  submitBtn: {
    height: 48,
    borderRadius: S.radiusSmall,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: C.textHero, fontSize: 14, fontWeight: "800" },
});
