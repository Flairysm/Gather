import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { C, S } from "../theme";
import { supabase } from "../lib/supabase";
import { useAppNavigation } from "../navigation/NavigationContext";
import { ALL_CATEGORIES } from "../data/categories";
import ErrorState from "../components/ErrorState";
import { StyleSheet } from "react-native";

type SortMode = "recommended" | "popular" | "az";

export default function CategoryBrowseScreen({
  onBack,
}: {
  onBack: () => void;
}) {
  const { push } = useAppNavigation();
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("recommended");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase
      .from("listings")
      .select("category")
      .eq("status", "active")
      .limit(1000);

    if (error) {
      console.warn("CategoryBrowse load error:", error.message);
      setLoadError(true);
      setLoading(false);
      return;
    }

    if (data) {
      const map: Record<string, number> = {};
      for (const cat of ALL_CATEGORIES) map[cat.key] = 0;
      for (const row of data as any[]) {
        const cat = row.category as string;
        map[cat] = (map[cat] ?? 0) + 1;
      }
      setStats(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    let cats = [...ALL_CATEGORIES];
    if (q) cats = cats.filter((c) => c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q));

    if (sortMode === "popular") {
      cats.sort((a, b) => (stats[b.key] ?? 0) - (stats[a.key] ?? 0));
    } else if (sortMode === "az") {
      cats.sort((a, b) => a.label.localeCompare(b.label));
    }
    return cats;
  }, [sortMode, stats, search]);

  function formatCount(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  }

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />
      {/* Header */}
      <View style={st.header}>
        <Pressable onPress={onBack} style={st.backBtn}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <View style={st.searchBar}>
          <Feather name="search" size={16} color={C.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search"
            placeholderTextColor={C.textMuted}
            style={st.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!!search.trim() && (
            <Pressable onPress={() => setSearch("")} hitSlop={10}>
              <Feather name="x-circle" size={16} color={C.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Sort Pills */}
      <View style={st.sortRow}>
        {([
          { key: "recommended" as SortMode, label: "Default" },
          { key: "popular" as SortMode, label: "Popular" },
          { key: "az" as SortMode, label: "A-Z" },
        ]).map((s) => (
          <Pressable
            key={s.key}
            style={[st.sortPill, sortMode === s.key && st.sortPillActive]}
            onPress={() => setSortMode(s.key)}
          >
            <Text
              style={[
                st.sortPillText,
                sortMode === s.key && st.sortPillTextActive,
              ]}
            >
              {s.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={st.loadingWrap}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : loadError ? (
        <ErrorState
          message="Failed to load categories. Check your connection and try again."
          onRetry={load}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={st.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.accent}
            />
          }
        >
          {sorted.map((cat) => {
            const count = stats[cat.key] ?? 0;
            const disabled = count === 0;
            return (
              <Pressable
                key={cat.key}
                style={[st.row, disabled && st.rowDisabled]}
                onPress={() =>
                  push({ type: "CATEGORY_LISTINGS", category: cat.key })
                }
                disabled={disabled}
              >
                <View style={{ flex: 1 }}>
                  <Text style={st.rowLabel}>{cat.label}</Text>
                  <Text style={st.rowCount}>
                    {formatCount(count)} Listing{count !== 1 ? "s" : ""}
                  </Text>
                </View>
                {!disabled && (
                  <Feather name="chevron-right" size={16} color={C.textMuted} />
                )}
              </Pressable>
            );
          })}

          {sorted.length === 0 && (
            <View style={st.emptyWrap}>
              <Text style={st.emptyText}>No matching categories</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S.screenPadding,
    paddingVertical: 10,
    gap: 10,
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
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "500",
  },

  sortRow: {
    flexDirection: "row",
    paddingHorizontal: S.screenPadding,
    gap: 8,
    marginBottom: 14,
    marginTop: 4,
  },
  sortPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: "transparent",
  },
  sortPillActive: {
    borderColor: C.textPrimary,
    backgroundColor: "transparent",
  },
  sortPillText: {
    color: C.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  sortPillTextActive: {
    color: C.textPrimary,
  },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  list: {
    paddingHorizontal: S.screenPadding,
    paddingBottom: 40,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  rowDisabled: {
    opacity: 0.4,
  },
  rowLabel: {
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  rowCount: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
  },

  emptyWrap: {
    width: "100%",
    alignItems: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyText: {
    color: C.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
});
