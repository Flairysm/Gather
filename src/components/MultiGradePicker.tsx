import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { C } from "../theme";
import {
  GRADING_COMPANIES,
  formatGradeCombined,
  gradeKey,
  getCompanyById,
  type GradingCompany,
  type WantedGrade,
} from "../data/grading";

type Props = {
  value: WantedGrade[];
  onChange: (next: WantedGrade[]) => void;
};

// Multi-select grade picker for WTB posts. A buyer can accept several grades,
// even across different grading companies (e.g. "PSA 10, BGS 9.5, Raw").
export default function MultiGradePicker({ value, onChange }: Props) {
  const [activeCompany, setActiveCompany] = useState<string | null>(
    value.find((g) => g.company !== "RAW")?.company ?? null,
  );

  const selectedKeys = new Set(value.map(gradeKey));
  const hasCompany = (id: string) =>
    value.some((g) => g.company === id || (id === "RAW" && g.company === "RAW"));

  function tapCompany(c: GradingCompany) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (c.id === "RAW") {
      // Raw has no grades — tapping toggles it directly.
      toggleGrade({ company: "RAW", value: null });
      return;
    }
    setActiveCompany((prev) => (prev === c.id ? null : c.id));
  }

  function toggleGrade(g: WantedGrade) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const key = gradeKey(g);
    if (selectedKeys.has(key)) {
      onChange(value.filter((x) => gradeKey(x) !== key));
    } else {
      onChange([...value, g]);
    }
  }

  function removeAt(g: WantedGrade) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const key = gradeKey(g);
    onChange(value.filter((x) => gradeKey(x) !== key));
  }

  const company = activeCompany ? getCompanyById(activeCompany) : null;
  const grades = company?.grades ?? [];

  return (
    <View style={st.root}>
      <View style={st.headerRow}>
        <Text style={st.sectionLabel}>Acceptable Grades</Text>
        <Text style={st.optionalHint}>Optional · pick any</Text>
      </View>

      {/* ── Company ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.companyRow}
      >
        {GRADING_COMPANIES.map((c) => {
          const active = activeCompany === c.id;
          const selected = hasCompany(c.id);
          return (
            <Pressable
              key={c.id}
              style={[
                st.companyCard,
                active && st.companyCardActive,
                selected && st.companyCardSelected,
              ]}
              onPress={() => tapCompany(c)}
            >
              {selected && (
                <View style={st.companyDot}>
                  <Ionicons name="checkmark" size={10} color={C.textHero} />
                </View>
              )}
              {c.logo ? (
                <Image source={c.logo} style={st.logoImage} resizeMode="contain" />
              ) : (
                <Ionicons
                  name="cube-outline"
                  size={22}
                  color={active || selected ? C.accent : C.textMuted}
                />
              )}
              <Text
                style={[st.companyName, (active || selected) && st.companyNameActive]}
                numberOfLines={1}
              >
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Grade chips for the active company ── */}
      {company && grades.length > 0 && (
        <>
          <Text style={st.gradeHint}>Tap grades you'll accept from {company.label}</Text>
          <View style={st.gradeRow}>
            {grades.map((g) => {
              const active = selectedKeys.has(gradeKey({ company: company.id, value: g.value }));
              return (
                <Pressable
                  key={g.value}
                  style={[st.gradeChip, active && st.gradeChipActive]}
                  onPress={() => toggleGrade({ company: company.id, value: g.value })}
                >
                  <Text style={[st.gradeChipText, active && st.gradeChipTextActive]}>
                    {g.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* ── Selected summary ── */}
      {value.length > 0 && (
        <View style={st.selectedWrap}>
          {value.map((g) => (
            <Pressable key={gradeKey(g)} style={st.selectedChip} onPress={() => removeAt(g)}>
              <Text style={st.selectedChipText}>{formatGradeCombined(g.company, g.value)}</Text>
              <Feather name="x" size={13} color={C.accent} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { gap: 2, marginBottom: 12 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    marginTop: 10,
  },
  sectionLabel: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  optionalHint: { color: C.textMuted, fontSize: 11, fontWeight: "600" },

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
  companyCardActive: { borderColor: C.accent },
  companyCardSelected: { backgroundColor: C.accentGlow, borderColor: C.accent },
  companyDot: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
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

  gradeHint: { color: C.textMuted, fontSize: 11, fontWeight: "600", marginTop: 10, marginBottom: 8 },
  gradeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  gradeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.elevated,
    borderWidth: 1.2,
    borderColor: C.border,
  },
  gradeChipActive: { backgroundColor: C.accentGlow, borderColor: C.accent },
  gradeChipText: { color: C.textSecondary, fontSize: 12, fontWeight: "700" },
  gradeChipTextActive: { color: C.accent },

  selectedWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: C.accentGlow,
    borderWidth: 1.2,
    borderColor: C.accent,
  },
  selectedChipText: { color: C.accent, fontSize: 12.5, fontWeight: "800" },
});
