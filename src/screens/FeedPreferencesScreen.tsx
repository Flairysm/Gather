import { useMemo } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { C, S } from "../theme";
import { ALL_CATEGORIES } from "../data/categories";
import { useFeedPreferences } from "../data/feedPreferences";

export default function FeedPreferencesScreen({ onBack }: { onBack: () => void }) {
  const { selectedCategories, toggleCategory } = useFeedPreferences();

  const enabledCount = selectedCategories.length;
  const subtitle = useMemo(() => {
    if (enabledCount === ALL_CATEGORIES.length) return "Showing all categories in your home feed";
    if (enabledCount === 1) return "Showing 1 category in your home feed";
    return `Showing ${enabledCount} categories in your home feed`;
  }, [enabledCount]);

  return (
    <SafeAreaView style={st.safe}>
      {/* Header */}
      <View style={st.header}>
        <Pressable onPress={onBack} style={st.backBtn}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>My Feed Categories</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll}>
        <View style={st.heroCard}>
          <View style={st.heroIcon}>
            <Ionicons name="options-outline" size={18} color={C.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.heroTitle}>Personalize your feed</Text>
            <Text style={st.heroSub}>{subtitle}</Text>
          </View>
        </View>

        <Text style={st.sectionTitle}>Categories</Text>
        <View style={st.sectionCard}>
          {ALL_CATEGORIES.map((cat, i) => {
            const isOn = selectedCategories.includes(cat.key);
            return (
              <View key={cat.key}>
                {i > 0 && <View style={st.divider} />}
                <View style={st.row}>
                  <View
                    style={[
                      st.rowIcon,
                      { backgroundColor: cat.color + "18", borderColor: cat.color + "33" },
                    ]}
                  >
                    <Ionicons name={cat.icon} size={18} color={cat.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.rowLabel}>{cat.label}</Text>
                    <Text style={st.rowSub}>Show in “For You”</Text>
                  </View>
                  <Switch
                    value={isOn}
                    onValueChange={() => toggleCategory(cat.key)}
                    trackColor={{ false: C.muted, true: cat.color + "88" }}
                    thumbColor={isOn ? cat.color : C.textMuted}
                    ios_backgroundColor={C.muted}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S.screenPadding,
    paddingVertical: 12,
    gap: S.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.borderIcon,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  scroll: {
    paddingHorizontal: S.screenPadding,
    paddingTop: 6,
    paddingBottom: S.scrollPaddingBottom,
  },

  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    marginBottom: S.xl,
  },
  heroIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.accentGlow,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "900",
  },
  heroSub: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },

  sectionTitle: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: S.sm,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    marginBottom: S.xl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: S.lg,
    gap: S.md,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: C.iconBg,
    borderWidth: 1,
    borderColor: C.borderIcon,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  rowSub: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginLeft: 56,
  },
});

