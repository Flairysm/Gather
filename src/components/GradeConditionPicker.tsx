import { useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { C } from "../theme";
import {
  GRADING_COMPANIES,
  CONDITION_TIERS,
  getCompanyById,
  type GradingCompany,
} from "../data/grading";

type Props = {
  gradingCompany: string | null;
  gradeValue: string | null;
  condition: string | null;
  onChangeGradingCompany: (v: string | null) => void;
  onChangeGradeValue: (v: string | null) => void;
  onChangeCondition: (v: string | null) => void;
  mode?: "full" | "grade-only";
};

export default function GradeConditionPicker({
  gradingCompany,
  gradeValue,
  condition,
  onChangeGradingCompany,
  onChangeGradeValue,
  onChangeCondition,
  mode = "full",
}: Props) {
  const [expandedCondition, setExpandedCondition] = useState<string | null>(
    null,
  );
  const selectedCompany = gradingCompany
    ? getCompanyById(gradingCompany)
    : null;
  const isRaw = gradingCompany === "RAW";
  const grades = selectedCompany?.grades ?? [];

  function selectCompany(c: GradingCompany) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (gradingCompany === c.id) {
      onChangeGradingCompany(null);
      onChangeGradeValue(null);
      if (c.id === "RAW") onChangeCondition(null);
    } else {
      onChangeGradingCompany(c.id);
      onChangeGradeValue(null);
      if (c.id !== "RAW") onChangeCondition(null);
    }
  }

  function selectGrade(val: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChangeGradeValue(gradeValue === val ? null : val);
  }

  return (
    <View style={st.root}>
      {/* ── Company ── */}
      <Text style={st.sectionLabel}>Grading</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.companyRow}
      >
        {GRADING_COMPANIES.map((c) => {
          const active = gradingCompany === c.id;
          return (
            <Pressable
              key={c.id}
              style={[st.companyCard, active && st.companyCardActive]}
              onPress={() => selectCompany(c)}
            >
              {c.logo ? (
                <Image
                  source={c.logo}
                  style={st.logoImage}
                  resizeMode="contain"
                />
              ) : (
                <Ionicons
                  name="cube-outline"
                  size={22}
                  color={active ? C.accent : C.textMuted}
                />
              )}
              <Text
                style={[st.companyName, active && st.companyNameActive]}
                numberOfLines={1}
              >
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Grade chips ── */}
      {selectedCompany && !isRaw && grades.length > 0 && (
        <>
          <Text style={st.sectionLabel}>Grade</Text>
          <View style={st.gradeRow}>
            {grades.map((g) => {
              const active = gradeValue === g.value;
              return (
                <Pressable
                  key={g.value}
                  style={[st.gradeChip, active && st.gradeChipActive]}
                  onPress={() => selectGrade(g.value)}
                >
                  <Text
                    style={[
                      st.gradeChipText,
                      active && st.gradeChipTextActive,
                    ]}
                  >
                    {g.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* ── Condition (raw only) ── */}
      {mode === "full" && isRaw && (
        <View style={st.conditionSection}>
          <Text style={st.sectionLabel}>Condition</Text>
          <View style={st.conditionRow}>
            {CONDITION_TIERS.map((t) => {
              const active = condition === t.tier;
              const expanded = expandedCondition === t.tier;
              return (
                <Pressable
                  key={t.tier}
                  style={[
                    st.conditionChip,
                    active && {
                      backgroundColor: `${t.color}18`,
                      borderColor: `${t.color}50`,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onChangeCondition(active ? null : t.tier);
                    setExpandedCondition(expanded ? null : t.tier);
                  }}
                >
                  <Text
                    style={[st.conditionTier, active && { color: t.color }]}
                  >
                    {t.tier}
                  </Text>
                  <Text
                    style={[st.conditionShort, active && { color: t.color }]}
                    numberOfLines={1}
                  >
                    {t.shortTitle}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {expandedCondition &&
            (() => {
              const tier = CONDITION_TIERS.find(
                (t) => t.tier === expandedCondition,
              );
              if (!tier) return null;
              return (
                <View style={st.conditionInfo}>
                  <View style={st.conditionInfoHeader}>
                    <Text
                      style={[st.conditionInfoTier, { color: tier.color }]}
                    >
                      {tier.tier}
                    </Text>
                    <Text style={st.conditionInfoTitle}>{tier.title}</Text>
                  </View>
                  <Text style={st.conditionInfoDesc}>{tier.description}</Text>
                </View>
              );
            })()}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { gap: 2, marginBottom: 12 },

  sectionLabel: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 10,
  },

  companyRow: { gap: 10, paddingBottom: 6 },
  companyCard: {
    width: 72,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: C.elevated,
    borderWidth: 1.2,
    borderColor: C.border,
  },
  companyCardActive: {
    backgroundColor: C.accentGlow,
    borderColor: C.accent,
  },

  logoImage: { width: 32, height: 32 },

  companyName: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 0.3,
  },
  companyNameActive: { color: C.accent },

  gradeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  gradeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.elevated,
    borderWidth: 1.2,
    borderColor: C.border,
  },
  gradeChipActive: {
    backgroundColor: C.accentGlow,
    borderColor: C.accent,
  },
  gradeChipText: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  gradeChipTextActive: { color: C.accent },

  conditionSection: { marginTop: 4 },
  conditionRow: { flexDirection: "row", gap: 6, marginBottom: 6 },
  conditionChip: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: C.elevated,
    borderWidth: 1.2,
    borderColor: C.border,
  },
  conditionTier: { color: C.textPrimary, fontSize: 16, fontWeight: "900" },
  conditionShort: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: "700",
    textAlign: "center",
  },

  conditionInfo: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    gap: 6,
  },
  conditionInfoHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  conditionInfoTier: { fontSize: 18, fontWeight: "900" },
  conditionInfoTitle: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  conditionInfoDesc: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 17,
  },
});
