import { useMemo } from "react";
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { C, S } from "../theme";
import { ALL_CATEGORIES } from "../data/categories";
import { useFeedPreferences } from "../data/feedPreferences";
import ScreenHeader from "../components/ScreenHeader";

export default function FeedPreferencesScreen({ onBack }: { onBack: () => void }) {
  const { selectedCategories, toggleCategory, loading } = useFeedPreferences();

  const enabledCount = selectedCategories.length;
  const subtitle = useMemo(() => {
    if (enabledCount === ALL_CATEGORIES.length) return "Showing all categories in your home feed";
    if (enabledCount === 1) return "Showing 1 category in your home feed";
    return `Showing ${enabledCount} categories in your home feed`;
  }, [enabledCount]);

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />
      <ScreenHeader title="My Feed Categories" onBack={onBack} />

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
                  <View style={{ flex: 1 }}>
                    <Text style={st.rowLabel}>{cat.label}</Text>
                    <Text style={st.rowSub}>Show on Home</Text>
                  </View>
                  <Switch
                    value={isOn}
                    disabled={loading}
                    onValueChange={() => {
                      if (isOn && enabledCount === 1) {
                        Alert.alert(
                          "Keep at least one category on",
                          "Your Home feed needs at least one category.",
                        );
                        return;
                      }
                      toggleCategory(cat.key);
                    }}
                    trackColor={{ false: C.muted, true: C.accent + "88" }}
                    thumbColor={isOn ? C.accent : C.textMuted}
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
    marginLeft: S.lg,
  },
});

