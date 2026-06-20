import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";
import { C, S } from "../theme";
import { supabase } from "../lib/supabase";

type Props = { onBack: () => void };

type Step = "ENTER_PHONE" | "ENTER_CODE" | "VERIFIED";

export default function PhoneVerifyScreen({ onBack }: Props) {
  const [step, setStep] = useState<Step>("ENTER_PHONE");
  const [phone, setPhone] = useState("");
  const [e164Phone, setE164Phone] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [existingPhone, setExistingPhone] = useState<string | null>(null);
  const [alreadyVerified, setAlreadyVerified] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [unavailable, setUnavailable] = useState(false);

  const checkAnim = useRef(new Animated.Value(0)).current;
  const codeInputRef = useRef<TextInput>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("phone_number, phone_verified")
        .eq("id", user.id)
        .maybeSingle();
      if (data?.phone_verified) {
        setAlreadyVerified(true);
        setExistingPhone(data.phone_number);
        setStep("VERIFIED");
        checkAnim.setValue(1);
      } else if (data?.phone_number) {
        setExistingPhone(data.phone_number);
        setPhone(data.phone_number);
      }
    })();
  }, []);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const iv = setInterval(() => setResendTimer((t) => t - 1), 1000);
    return () => clearInterval(iv);
  }, [resendTimer]);

  const formatPhone = useCallback((raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }, []);

  async function handleSendCode() {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 10) {
      Alert.alert(
        "Invalid Phone",
        "Please enter a valid Malaysian phone number (9-10 digits).",
      );
      return;
    }

    // Malaysia mobile numbers are often entered with a leading 0 (e.g. 01X...).
    // Store in E.164 as +60 (drop the leading 0 when present).
    const normalized = digits.startsWith("0") ? digits.slice(1) : digits;
    if (normalized.length < 8) {
      Alert.alert("Invalid Phone", "Phone number looks too short after normalization.");
      return;
    }

    const e164 = `+60${normalized}`;

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      // Persist the entered number first so the profile reflects the latest input,
      // but DO NOT mark it verified until the OTP is actually confirmed below.
      await supabase
        .from("profiles")
        .update({ phone_number: e164, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      // Real SMS OTP via Supabase Auth. The user is already authenticated (email),
      // so we ATTACH the phone to the existing account via updateUser (which sends a
      // phone-change OTP) rather than signInWithOtp (which would start a separate
      // phone sign-in). Requires an SMS provider (e.g. Twilio) configured in the
      // Supabase project's Auth settings; without it this errors.
      const { error: otpError } = await supabase.auth.updateUser({ phone: e164 });
      if (otpError) {
        setUnavailable(true);
        Alert.alert(
          "Phone Verification Unavailable",
          "We couldn't send a verification code right now. Phone verification is temporarily unavailable — please try again later.",
        );
        return;
      }

      setE164Phone(e164);
      setUnavailable(false);
      setStep("ENTER_CODE");
      setResendTimer(60);
      setTimeout(() => codeInputRef.current?.focus(), 300);
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Failed to send code");
    } finally {
      setSending(false);
    }
  }

  async function handleVerifyCode() {
    if (code.length < 6) {
      Alert.alert("Invalid Code", "Please enter the 6-digit code.");
      return;
    }

    setVerifying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      // Verify the SMS OTP. Only on success do we mark the profile as verified.
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone: e164Phone,
        token: code,
        type: "phone_change",
      });
      if (verifyError) {
        Alert.alert("Invalid Code", "That code is incorrect or has expired. Please try again.");
        return;
      }

      await supabase
        .from("profiles")
        .update({ phone_verified: true, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      setStep("VERIFIED");
      Animated.spring(checkAnim, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (resendTimer > 0 || sending) return;
    setCode("");
    if (!e164Phone) {
      handleSendCode();
      return;
    }
    setSending(true);
    try {
      const { error: otpError } = await supabase.auth.updateUser({ phone: e164Phone });
      if (otpError) {
        // Supabase enforces a cooldown between OTP sends; surface that clearly.
        Alert.alert(
          "Couldn't Resend",
          otpError.message ?? "Please wait a moment before requesting another code.",
        );
        return;
      }
      setResendTimer(60);
    } finally {
      setSending(false);
    }
  }

  const phoneDigits = phone.replace(/\D/g, "");

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />

      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>Verify Phone</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={st.body}>
          {step === "ENTER_PHONE" && (
            <>
              <View style={st.iconCircle}>
                <Ionicons name="call-outline" size={32} color={C.accent} />
              </View>
              <Text style={st.title}>Verify Your Phone Number</Text>
              <Text style={st.subtitle}>
                A verified phone number is required to place bids on auctions. We'll send a verification code via SMS.
              </Text>

              {unavailable && (
                <View style={st.unavailableNotice}>
                  <Ionicons name="warning-outline" size={16} color="#F59E0B" />
                  <Text style={st.unavailableText}>
                    Phone verification is temporarily unavailable. Please try again later.
                  </Text>
                </View>
              )}

              <Text style={st.fieldLabel}>Phone Number</Text>
              <View style={st.phoneInputRow}>
                <View style={st.countryCode}>
                  <Text style={st.countryCodeText}>+60</Text>
                </View>
                <TextInput
                  style={st.phoneInput}
                  value={formatPhone(phone)}
                  onChangeText={(t) => setPhone(t.replace(/\D/g, "").slice(0, 10))}
                  placeholder="12 345 6789"
                  placeholderTextColor={C.textMuted}
                  keyboardType="phone-pad"
                  autoFocus
                />
              </View>

              <Pressable
                style={[st.primaryBtn, phoneDigits.length < 9 && st.primaryBtnDisabled]}
                onPress={handleSendCode}
                disabled={phoneDigits.length < 9 || sending}
              >
                {sending ? (
                  <ActivityIndicator size="small" color={C.textHero} />
                ) : (
                  <Text style={[st.primaryBtnText, phoneDigits.length < 9 && st.primaryBtnTextDisabled]}>
                    Send Verification Code
                  </Text>
                )}
              </Pressable>
            </>
          )}

          {step === "ENTER_CODE" && (
            <>
              <View style={st.iconCircle}>
                <Ionicons name="keypad-outline" size={32} color={C.accent} />
              </View>
              <Text style={st.title}>Enter Verification Code</Text>
              <Text style={st.subtitle}>
                We sent a 6-digit code to{"\n"}
                <Text style={{ color: C.textAccent, fontWeight: "800" }}>
                  +60 {formatPhone(phone)}
                </Text>
              </Text>

              <Pressable
                style={st.codeRow}
                onPress={() => codeInputRef.current?.focus()}
              >
                {Array.from({ length: 6 }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      st.codeBox,
                      code.length === i && st.codeBoxActive,
                      code.length > i && st.codeBoxFilled,
                    ]}
                  >
                    <Text style={st.codeDigit}>{code[i] ?? ""}</Text>
                  </View>
                ))}
                <TextInput
                  ref={codeInputRef}
                  style={st.hiddenInput}
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
                  keyboardType="number-pad"
                  autoFocus
                  maxLength={6}
                />
              </Pressable>

              <Pressable
                style={[st.primaryBtn, code.length < 6 && st.primaryBtnDisabled]}
                onPress={handleVerifyCode}
                disabled={code.length < 6 || verifying}
              >
                {verifying ? (
                  <ActivityIndicator size="small" color={C.textHero} />
                ) : (
                  <Text style={[st.primaryBtnText, code.length < 6 && st.primaryBtnTextDisabled]}>
                    Verify
                  </Text>
                )}
              </Pressable>

              <Pressable style={st.resendBtn} onPress={handleResend} disabled={resendTimer > 0}>
                <Text style={[st.resendText, resendTimer > 0 && { color: C.textMuted }]}>
                  {resendTimer > 0 ? `Resend code in ${resendTimer}s` : "Resend Code"}
                </Text>
              </Pressable>

              <Pressable style={st.changeBtn} onPress={() => { setStep("ENTER_PHONE"); setCode(""); }}>
                <Feather name="edit-2" size={13} color={C.textAccent} />
                <Text style={st.changeBtnText}>Change Number</Text>
              </Pressable>
            </>
          )}

          {step === "VERIFIED" && (
            <>
              <Animated.View
                style={[
                  st.successCircle,
                  {
                    transform: [{ scale: checkAnim }],
                    opacity: checkAnim,
                  },
                ]}
              >
                <Ionicons name="checkmark" size={40} color={C.textHero} />
              </Animated.View>
              <Text style={st.title}>Phone Verified!</Text>
              <Text style={st.subtitle}>
                {alreadyVerified
                  ? `Your phone number ${existingPhone ?? ""} is verified. You're all set to bid on auctions.`
                  : "Your phone number has been verified. You can now place bids on auctions."}
              </Text>
              <Pressable style={st.primaryBtn} onPress={onBack}>
                <Text style={st.primaryBtnText}>Done</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
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
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { flex: 1, color: C.textPrimary, fontSize: 16, fontWeight: "800", textAlign: "center" },

  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: S.screenPadding + 10,
    gap: 16,
  },

  iconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: C.accentGlow,
    borderWidth: 1.5, borderColor: C.borderStream,
    alignItems: "center", justifyContent: "center",
    marginBottom: 8,
  },
  successCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: C.success,
    alignItems: "center", justifyContent: "center",
    marginBottom: 8,
  },

  title: { color: C.textPrimary, fontSize: 22, fontWeight: "900", textAlign: "center" },
  subtitle: {
    color: C.textSecondary, fontSize: 14, fontWeight: "500",
    textAlign: "center", lineHeight: 20, marginBottom: 8,
  },

  fieldLabel: {
    color: C.textSecondary, fontSize: 11, fontWeight: "700",
    textTransform: "uppercase", letterSpacing: 0.6,
    alignSelf: "stretch", marginBottom: -8,
  },

  unavailableNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "stretch",
    backgroundColor: "rgba(245,158,11,0.1)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
    borderRadius: S.radiusSmall,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  unavailableText: { flex: 1, color: "#F59E0B", fontSize: 12, fontWeight: "600", lineHeight: 16 },

  phoneInputRow: {
    flexDirection: "row",
    alignSelf: "stretch",
    backgroundColor: C.elevated,
    borderRadius: S.radiusSmall,
    borderWidth: 1.5,
    borderColor: C.border,
    overflow: "hidden",
  },
  countryCode: {
    backgroundColor: C.muted,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  countryCodeText: { color: C.textPrimary, fontSize: 16, fontWeight: "800" },
  phoneInput: {
    flex: 1, height: 52,
    color: C.textPrimary, fontSize: 18, fontWeight: "600",
    paddingHorizontal: 14,
  },

  codeRow: {
    flexDirection: "row", gap: 10,
    alignSelf: "stretch", justifyContent: "center",
    position: "relative",
  },
  codeBox: {
    width: 44, height: 56, borderRadius: 10,
    backgroundColor: C.elevated, borderWidth: 1.5, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  codeBoxActive: { borderColor: C.accent },
  codeBoxFilled: { borderColor: C.accent, backgroundColor: C.accentGlow },
  codeDigit: { color: C.textPrimary, fontSize: 22, fontWeight: "900" },
  hiddenInput: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0,
  },

  primaryBtn: {
    alignSelf: "stretch",
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.accent, borderRadius: S.radiusSmall,
    paddingVertical: 16, marginTop: 8,
  },
  primaryBtnDisabled: { backgroundColor: C.muted },
  primaryBtnText: { color: C.textHero, fontSize: 15, fontWeight: "800" },
  primaryBtnTextDisabled: { color: C.textMuted },

  resendBtn: { paddingVertical: 8 },
  resendText: { color: C.textAccent, fontSize: 13, fontWeight: "700" },

  changeBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8,
  },
  changeBtnText: { color: C.textAccent, fontSize: 13, fontWeight: "700" },
});
