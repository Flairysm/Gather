import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, S } from "../theme";
import { useUser } from "../data/user";
import { supabase } from "../lib/supabase";
import { requireNetwork } from "../lib/network";
import { useAppNavigation } from "../navigation/NavigationContext";
import ScreenHeader from "../components/ScreenHeader";

type Props = { onBack: () => void };

const CATEGORIES = ["Pokémon", "MTG", "Sports", "YGO", "Other"];

export default function VendorApplicationScreen({ onBack }: Props) {
  const { vendorStatus, setVendorStatus } = useUser();
  const { push } = useAppNavigation();
  const insets = useSafeAreaInsets();

  const [storeName, setStoreName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [experience, setExperience] = useState("");
  // ── Verification (KYC) ──
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [icNumber, setIcNumber] = useState("");
  const [icFrontUri, setIcFrontUri] = useState<string | null>(null); // newly picked local image
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [icFrontOnFile, setIcFrontOnFile] = useState(false); // already uploaded on a prior submit
  const [selfieOnFile, setSelfieOnFile] = useState(false);
  const [existingIcPath, setExistingIcPath] = useState<string | null>(null);
  const [existingSelfiePath, setExistingSelfiePath] = useState<string | null>(null);

  const [submitted, setSubmitted] = useState(vendorStatus === "pending");
  const [submitting, setSubmitting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<string | null>(null);

  function toggleCategory(cat: string) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  async function captureFor(target: "ic" | "selfie") {
    const setter = target === "ic" ? setIcFrontUri : setSelfieUri;
    const launchCamera = async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Camera Permission",
          target === "ic"
            ? "Allow camera access to take a photo of your IC."
            : "Allow camera access to take a selfie holding your IC.",
        );
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true });
      if (!res.canceled && res.assets[0]) setter(res.assets[0].uri);
    };
    const launchLibrary = async () => {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, allowsEditing: true });
      if (!res.canceled && res.assets[0]) setter(res.assets[0].uri);
    };
    Alert.alert(
      target === "ic" ? "IC Photo" : "Selfie with IC",
      "Take a clear photo or choose one from your library.",
      [
        { text: "Take Photo", onPress: launchCamera },
        { text: "Choose from Library", onPress: launchLibrary },
        { text: "Cancel", style: "cancel" },
      ],
    );
  }

  const missingFields = [
    storeName.trim().length === 0 && "Store name",
    description.trim().length === 0 && "About your store",
    selectedCategories.length === 0 && "At least one card category",
    fullName.trim().length === 0 && "Full name",
    phone.trim().length === 0 && "Phone number",
    icNumber.trim().length === 0 && "IC / NRIC number",
    !icFrontUri && !icFrontOnFile && "IC photo (front)",
  ].filter((v): v is string => typeof v === "string");

  const canSubmit = missingFields.length === 0;

  useEffect(() => {
    let mounted = true;

    async function loadExistingApplication() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;
      if (!user) {
        setLoadingExisting(false);
        return;
      }

      const { data, error } = await supabase
        .from("vendor_applications")
        .select("store_name, description, categories, status, notes, experience, full_name, phone, ic_number, ic_front_path, selfie_path")
        .eq("profile_id", user.id)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        setFormError(error.message);
        setLoadingExisting(false);
        return;
      }

      if (data) {
        setStoreName(data.store_name ?? "");
        setDescription(data.description ?? "");
        setSelectedCategories(data.categories ?? []);
        setExperience((data as any).experience ?? "");
        setFullName((data as any).full_name ?? "");
        setPhone((data as any).phone ?? "");
        setIcNumber((data as any).ic_number ?? "");
        setExistingIcPath((data as any).ic_front_path ?? null);
        setExistingSelfiePath((data as any).selfie_path ?? null);
        setIcFrontOnFile(!!(data as any).ic_front_path);
        setSelfieOnFile(!!(data as any).selfie_path);
        setReviewNotes(data.notes ?? null);
        if (data.status === "approved") setVendorStatus("approved");
        if (data.status === "pending") {
          setVendorStatus("pending");
          setSubmitted(true);
        }
        if (data.status === "rejected") {
          setVendorStatus("rejected");
          setSubmitted(false);
        }
      }

      setLoadingExisting(false);
    }

    loadExistingApplication();

    return () => {
      mounted = false;
    };
  }, [setVendorStatus]);

  async function handleSubmit() {
    if (!(await requireNetwork())) return;
    setFormError(null);
    setSubmitting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSubmitting(false);
      setFormError("Please sign in to submit a vendor application.");
      return;
    }

    async function uploadKyc(localUri: string, kind: "ic-front" | "selfie") {
      const ext = (localUri.split(".").pop() || "jpg").toLowerCase().split("?")[0];
      const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      const path = `${user!.id}/${kind}-${Date.now()}.${ext}`;
      const resp = await fetch(localUri);
      const blob = await resp.blob();
      const { error: upErr } = await supabase.storage
        .from("vendor-kyc")
        .upload(path, blob, { contentType, upsert: true });
      if (upErr) throw upErr;
      return path;
    }

    let icPath = existingIcPath;
    let selfiePath = existingSelfiePath;
    try {
      if (icFrontUri) icPath = await uploadKyc(icFrontUri, "ic-front");
    } catch (e: any) {
      setSubmitting(false);
      setFormError(e?.message ?? "Failed to upload your IC photo. Please try again.");
      return;
    }
    try {
      if (selfieUri) selfiePath = await uploadKyc(selfieUri, "selfie");
    } catch (e: any) {
      setSubmitting(false);
      setFormError(e?.message ?? "Failed to upload your selfie. Please try again.");
      return;
    }

    const payload = {
      profile_id: user.id,
      store_name: storeName.trim(),
      description: description.trim(),
      categories: selectedCategories,
      experience: experience.trim() || null,
      full_name: fullName.trim(),
      phone: phone.trim(),
      ic_number: icNumber.trim(),
      ic_front_path: icPath,
      selfie_path: selfiePath,
      status: "pending" as const,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("vendor_applications")
      .upsert(payload, { onConflict: "profile_id" });

    setSubmitting(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    setVendorStatus("pending");
    setSubmitted(true);
  }

  if (loadingExisting) {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar style="light" />
        <ScreenHeader title="Become a Vendor" onBack={onBack} />
        <View style={st.loadingWrap}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (vendorStatus === "approved") {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar style="light" />
        <ScreenHeader title="Vendor Application" onBack={onBack} />
        <View style={st.pendingState}>
          <View style={[st.pendingCircle, { backgroundColor: C.success }]}>
            <Ionicons name="checkmark" size={36} color={C.textHero} />
          </View>
          <Text style={st.pendingTitle}>Application Approved</Text>
          <Text style={st.pendingSub}>
            Congratulations! Your vendor application has been approved.
            You can now manage your store from the Vendor Hub.
          </Text>
          <Pressable
            style={[st.doneBtn, { marginBottom: Math.max(insets.bottom, 14) }]}
            onPress={() => push({ type: "VENDOR_HUB" })}
          >
            <Text style={st.doneBtnText}>Go to Vendor Hub</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (submitted || vendorStatus === "pending") {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar style="light" />
        <ScreenHeader title="Vendor Application" onBack={onBack} />
        <View style={st.pendingState}>
          <View style={st.pendingCircle}>
            <Ionicons name="time" size={36} color={C.textHero} />
          </View>
          <Text style={st.pendingTitle}>Application Under Review</Text>
          <Text style={st.pendingSub}>
            We're reviewing your vendor application. You'll be notified once
            approved — usually within 24-48 hours.
          </Text>
          <View style={st.pendingInfo}>
            <View style={st.pendingInfoRow}>
              <Text style={st.pendingInfoLabel}>Status</Text>
              <View style={st.pendingChip}>
                <Text style={st.pendingChipText}>Pending Review</Text>
              </View>
            </View>
          </View>
          <Pressable
            style={[st.doneBtn, { marginBottom: Math.max(insets.bottom, 14) }]}
            onPress={onBack}
          >
            <Text style={st.doneBtnText}>Got it</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />

      <ScreenHeader title="Become a Vendor" onBack={onBack} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={st.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Intro ── */}
        {vendorStatus === "rejected" && (
          <View style={st.rejectedCard}>
            <View style={st.rejectedHeader}>
              <Ionicons name="alert-circle" size={18} color={C.danger} />
              <Text style={st.rejectedTitle}>Previous application was rejected</Text>
            </View>
            <Text style={st.rejectedSub}>
              Update your store details and submit again for another review.
            </Text>
            {reviewNotes ? (
              <View style={st.rejectedNotesBox}>
                <Text style={st.rejectedNotesLabel}>Reviewer notes</Text>
                <Text style={st.rejectedNotesText}>{reviewNotes}</Text>
              </View>
            ) : null}
          </View>
        )}

        <View style={st.introCard}>
          <Ionicons name="storefront" size={28} color={C.accent} />
          <Text style={st.introTitle}>Start Selling on Evend</Text>
          <Text style={st.introSub}>
            Apply to become a verified vendor. Once approved, you'll be able to
            list cards for sale, manage orders, and build your seller reputation.
          </Text>
        </View>

        {/* ── Benefits ── */}
        <View style={st.benefitsCard}>
          {[
            { icon: "checkmark-circle" as const, text: "List cards for sale on the marketplace" },
            { icon: "shield-checkmark" as const, text: "Verified seller badge on your profile" },
            { icon: "trending-up" as const, text: "Access to seller analytics & insights" },
            { icon: "cash" as const, text: "Secure payments with seller protection" },
          ].map((b) => (
            <View key={b.text} style={st.benefitRow}>
              <Ionicons name={b.icon} size={18} color={C.success} />
              <Text style={st.benefitText}>{b.text}</Text>
            </View>
          ))}
        </View>

        {/* ── Form ── */}
        <Text style={st.sectionTitle}>Store Details</Text>

        <Text style={st.fieldLabel}>Store Name *</Text>
        <TextInput
          style={st.textInput}
          value={storeName}
          onChangeText={setStoreName}
          placeholder="e.g. Vault King Cards"
          placeholderTextColor={C.textMuted}
        />

        <Text style={st.fieldLabel}>About Your Store *</Text>
        <TextInput
          style={st.textArea}
          value={description}
          onChangeText={setDescription}
          placeholder="Tell us about your card business, what you sell, and your experience..."
          placeholderTextColor={C.textMuted}
          multiline
          textAlignVertical="top"
        />

        <Text style={st.fieldLabel}>Card Categories *</Text>
        <Text style={st.fieldHint}>Select all that apply</Text>
        <View style={st.catRow}>
          {CATEGORIES.map((cat) => {
            const active = selectedCategories.includes(cat);
            return (
              <Pressable
                key={cat}
                style={[st.catPill, active && st.catPillActive]}
                onPress={() => toggleCategory(cat)}
              >
                <Text style={[st.catPillText, active && st.catPillTextActive]}>
                  {cat}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={st.fieldLabel}>Selling Experience</Text>
        <TextInput
          style={st.textInput}
          value={experience}
          onChangeText={setExperience}
          placeholder="e.g. 3 years on TCGPlayer, eBay Top Rated..."
          placeholderTextColor={C.textMuted}
        />

        {/* ── Identity Verification ── */}
        <Text style={[st.sectionTitle, { marginTop: S.xxl }]}>Identity Verification</Text>
        <Text style={st.fieldHint}>
          Required to verify sellers and keep buyers safe. Your details are private and
          only used for verification.
        </Text>

        <Text style={st.fieldLabel}>Full Name (as on IC) *</Text>
        <TextInput
          style={st.textInput}
          value={fullName}
          onChangeText={setFullName}
          placeholder="e.g. Ahmad bin Abdullah"
          placeholderTextColor={C.textMuted}
          autoCapitalize="words"
        />

        <Text style={st.fieldLabel}>Phone Number *</Text>
        <TextInput
          style={st.textInput}
          value={phone}
          onChangeText={setPhone}
          placeholder="e.g. 012-345 6789"
          placeholderTextColor={C.textMuted}
          keyboardType="phone-pad"
        />

        <Text style={st.fieldLabel}>IC / NRIC Number *</Text>
        <TextInput
          style={st.textInput}
          value={icNumber}
          onChangeText={setIcNumber}
          placeholder="e.g. 990101-14-5678"
          placeholderTextColor={C.textMuted}
          keyboardType="numbers-and-punctuation"
        />

        <Text style={st.fieldLabel}>IC Photo (front) *</Text>
        <Text style={st.fieldHint}>Snap a clear photo of the front of your IC.</Text>
        <Pressable style={st.uploadTile} onPress={() => captureFor("ic")}>
          {icFrontUri ? (
            <Image source={{ uri: icFrontUri }} style={st.uploadPreview} resizeMode="cover" />
          ) : icFrontOnFile ? (
            <View style={st.uploadInner}>
              <Ionicons name="checkmark-circle" size={26} color={C.success} />
              <Text style={st.uploadText}>IC on file — tap to replace</Text>
            </View>
          ) : (
            <View style={st.uploadInner}>
              <Ionicons name="camera" size={26} color={C.textAccent} />
              <Text style={st.uploadText}>Tap to take IC photo</Text>
            </View>
          )}
        </Pressable>

        <Text style={st.fieldLabel}>Selfie holding your IC</Text>
        <Text style={st.fieldHint}>Recommended — speeds up verification.</Text>
        <Pressable style={st.uploadTile} onPress={() => captureFor("selfie")}>
          {selfieUri ? (
            <Image source={{ uri: selfieUri }} style={st.uploadPreview} resizeMode="cover" />
          ) : selfieOnFile ? (
            <View style={st.uploadInner}>
              <Ionicons name="checkmark-circle" size={26} color={C.success} />
              <Text style={st.uploadText}>Selfie on file — tap to replace</Text>
            </View>
          ) : (
            <View style={st.uploadInner}>
              <Ionicons name="person-circle-outline" size={26} color={C.textAccent} />
              <Text style={st.uploadText}>Tap to take selfie with IC</Text>
            </View>
          )}
        </Pressable>

        {formError && (
          <View style={st.errorBox}>
            <Text style={st.errorText}>{formError}</Text>
          </View>
        )}

        {/* ── Terms ── */}
        <View style={st.termsRow}>
          <Ionicons name="information-circle" size={16} color={C.textAccent} />
          <Text style={st.termsText}>
            By applying, you agree to Evend's Vendor Terms of Service and
            commit to maintaining quality listings and timely shipping.
          </Text>
        </View>
      </ScrollView>

      {/* ── Bottom Bar ── */}
      <View style={[st.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        {!canSubmit && (
          <View style={st.checklistBox}>
            <Text style={st.checklistLabel}>Complete these to submit:</Text>
            {missingFields.map((f) => (
              <View key={f} style={st.checklistRow}>
                <Ionicons name="ellipse-outline" size={13} color={C.textMuted} />
                <Text style={st.checklistText}>{f}</Text>
              </View>
            ))}
          </View>
        )}
        <Pressable
          style={[st.submitBtn, !canSubmit && st.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={C.textHero} />
          ) : (
            <>
              <Ionicons name="storefront" size={18} color={C.textHero} />
              <Text style={st.submitText}>Submit Application</Text>
            </>
          )}
        </Pressable>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  scroll: {
    paddingHorizontal: S.screenPadding,
    paddingTop: S.xl,
    paddingBottom: S.xl,
  },

  introCard: {
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    alignItems: "center",
    gap: S.md,
    marginBottom: S.xl,
  },
  introTitle: { color: C.textPrimary, fontSize: 18, fontWeight: "900" },
  introSub: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 20,
  },

  benefitsCard: {
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    gap: S.md,
    marginBottom: S.xxl,
  },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: S.md },
  benefitText: { color: C.textPrimary, fontSize: 13, fontWeight: "600", flex: 1 },

  sectionTitle: {
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: S.lg,
  },

  fieldLabel: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: S.lg,
  },
  fieldHint: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "500",
    marginBottom: S.md,
  },

  textInput: {
    backgroundColor: C.surface,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    height: 46,
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "500",
  },
  textArea: {
    backgroundColor: C.surface,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 100,
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },

  uploadTile: {
    height: 150,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: "dashed",
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  uploadInner: { alignItems: "center", gap: 8 },
  uploadText: { color: C.textSecondary, fontSize: 12, fontWeight: "600" },
  uploadPreview: { width: "100%", height: "100%" },

  catRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  catPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
  },
  catPillActive: {
    backgroundColor: C.accentGlow,
    borderColor: C.accent,
  },
  catPillText: { color: C.textSecondary, fontSize: 13, fontWeight: "700" },
  catPillTextActive: { color: C.textAccent },

  termsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: C.accentGlow,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.borderStream,
    padding: S.lg,
    marginTop: S.xxl,
  },
  termsText: {
    flex: 1,
    color: C.textAccent,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16,
  },

  bottomBar: {
    paddingHorizontal: S.screenPadding,
    paddingTop: S.lg,
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: S.radiusSmall,
    paddingVertical: 16,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: { color: C.textHero, fontSize: 15, fontWeight: "800" },

  checklistBox: {
    backgroundColor: C.surface,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginBottom: 10,
    gap: 6,
  },
  checklistLabel: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  checklistRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  checklistText: { color: C.textPrimary, fontSize: 12, fontWeight: "600" },

  // ── Pending state ──
  pendingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: S.screenPadding,
    gap: 16,
  },
  pendingCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  pendingTitle: { color: C.textPrimary, fontSize: 22, fontWeight: "900" },
  pendingSub: {
    color: C.textSecondary,
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 20,
  },
  pendingInfo: {
    width: "100%",
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    marginTop: S.md,
  },
  pendingInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pendingInfoLabel: { color: C.textSecondary, fontSize: 13, fontWeight: "600" },
  pendingChip: {
    backgroundColor: "rgba(245,158,11,0.12)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pendingChipText: { color: "#F59E0B", fontSize: 11, fontWeight: "800" },
  doneBtn: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accent,
    borderRadius: S.radiusSmall,
    paddingVertical: 16,
    marginTop: S.lg,
  },
  doneBtnText: { color: C.textHero, fontSize: 15, fontWeight: "800" },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBox: {
    marginTop: S.lg,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    backgroundColor: "rgba(239,68,68,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    color: C.danger,
    fontSize: 12,
    fontWeight: "600",
  },
  rejectedCard: {
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    backgroundColor: "rgba(239,68,68,0.1)",
    padding: S.lg,
    marginBottom: S.lg,
    gap: 8,
  },
  rejectedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rejectedTitle: {
    color: C.danger,
    fontSize: 13,
    fontWeight: "800",
  },
  rejectedSub: {
    color: C.textPrimary,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 18,
  },
  rejectedNotesBox: {
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    backgroundColor: "rgba(4,7,13,0.32)",
    padding: 10,
    gap: 4,
  },
  rejectedNotesLabel: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  rejectedNotesText: {
    color: C.textPrimary,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 17,
  },
});
