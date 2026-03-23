import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { useUser } from "../data/user";
import { supabase } from "../lib/supabase";

type Props = { onBack: () => void };

const CATEGORIES = ["Pokémon", "MTG", "Sports", "YGO", "Other"];

export default function VendorApplicationScreen({ onBack }: Props) {
  const { vendorStatus, setVendorStatus } = useUser();
  const insets = useSafeAreaInsets();

  const [storeName, setStoreName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [experience, setExperience] = useState("");
  const [submitted, setSubmitted] = useState(vendorStatus === "pending");
  const [submitting, setSubmitting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  function toggleCategory(cat: string) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  const canSubmit =
    storeName.trim().length > 0 &&
    description.trim().length > 0 &&
    selectedCategories.length > 0;

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
        .select("store_name, description, categories, status, notes")
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
        if (data.status === "approved") setVendorStatus("approved");
        if (data.status === "pending") {
          setVendorStatus("pending");
          setSubmitted(true);
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

    const payload = {
      profile_id: user.id,
      store_name: storeName.trim(),
      description: description.trim(),
      categories: selectedCategories,
      notes: experience.trim() || null,
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
        <View style={st.loadingWrap}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (submitted || vendorStatus === "pending") {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar style="light" />
        <View style={st.header}>
          <Pressable style={st.backBtn} onPress={onBack}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>
          <Text style={st.headerTitle}>Vendor Application</Text>
          <View style={{ width: 36 }} />
        </View>
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

      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>Become a Vendor</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={st.scroll}
      >
        {/* ── Intro ── */}
        <View style={st.introCard}>
          <Ionicons name="storefront" size={28} color={C.accent} />
          <Text style={st.introTitle}>Start Selling on Gather</Text>
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

        {formError && (
          <View style={st.errorBox}>
            <Text style={st.errorText}>{formError}</Text>
          </View>
        )}

        {/* ── Terms ── */}
        <View style={st.termsRow}>
          <Ionicons name="information-circle" size={16} color={C.textAccent} />
          <Text style={st.termsText}>
            By applying, you agree to Gather's Vendor Terms of Service and
            commit to maintaining quality listings and timely shipping.
          </Text>
        </View>
      </ScrollView>

      {/* ── Bottom Bar ── */}
      <View style={[st.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
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

  scroll: {
    paddingHorizontal: S.screenPadding,
    paddingTop: S.xl,
    paddingBottom: 120,
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
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
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
});
