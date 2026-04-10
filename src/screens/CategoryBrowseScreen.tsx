import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { C, S } from "../theme";
import { supabase } from "../lib/supabase";
import { useAppNavigation } from "../navigation/NavigationContext";
import { ALL_CATEGORIES, type CategoryDef } from "../data/categories";
import ErrorState from "../components/ErrorState";
import { StyleSheet } from "react-native";

const SCREEN_W = Dimensions.get("window").width;
const COL_GAP = 8;
const COLS = 3;
const CARD_W =
  (SCREEN_W - S.screenPadding * 2 - COL_GAP * (COLS - 1)) / COLS;

type SortMode = "recommended" | "popular" | "az";

type CatStats = {
  count: number;
  image: string | null;
};

function normalizeImages(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === "string" && !!v);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed))
        return parsed.filter((v): v is string => typeof v === "string" && !!v);
    } catch {
      /* no-op */
    }
  }
  return [];
}

export default function CategoryBrowseScreen({
  onBack,
}: {
  onBack: () => void;
}) {
  const { push } = useAppNavigation();
  const [stats, setStats] = useState<Record<string, CatStats>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("recommended");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase
      .from("listings")
      .select("category, images")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.warn("CategoryBrowse load error:", error.message);
      setLoadError(true);
      setLoading(false);
      return;
    }

    if (data) {
      const map: Record<string, CatStats> = {};
      for (const cat of ALL_CATEGORIES) {
        map[cat.key] = { count: 0, image: null };
      }
      for (const row of data as any[]) {
        const cat = row.category as string;
        if (!map[cat]) map[cat] = { count: 0, image: null };
        map[cat].count++;
        if (!map[cat].image) {
          const imgs = normalizeImages(row.images);
          if (imgs.length > 0) map[cat].image = imgs[0];
        }
      }
      setStats(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    let cats = [...ALL_CATEGORIES];
    if (q) cats = cats.filter((c) => c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q));

    if (sortMode === "popular") {
      cats.sort((a, b) => (stats[b.key]?.count ?? 0) - (stats[a.key]?.count ?? 0));
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
          { key: "recommended" as SortMode, label: "Recommended" },
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
          contentContainerStyle={st.grid}
        >
          {sorted.map((cat) => {
            const s = stats[cat.key];
            const count = s?.count ?? 0;
            return (
              <Pressable
                key={cat.key}
                style={st.card}
                onPress={() =>
                  push({ type: "CATEGORY_LISTINGS", category: cat.key })
                }
              >
                <View style={st.cardImgWrap}>
                  {s?.image ? (
                    <Image source={{ uri: s.image }} style={st.cardImg} />
                  ) : (
                    <View style={st.cardImgEmpty}>
                      <Ionicons name={cat.icon} size={28} color={cat.color} />
                    </View>
                  )}
                </View>
                <Text style={st.cardLabel} numberOfLines={2}>
                  {cat.label}
                </Text>
                <View style={st.countRow}>
                  <View style={st.countDot} />
                  <Text style={st.countText}>
                    {formatCount(count)} Listing{count !== 1 ? "s" : ""}
                  </Text>
                </View>
              </Pressable>
            );
          })}

          {sorted.length === 0 && (
            <View style={st.emptyWrap}>
              <Ionicons name="search-outline" size={28} color={C.textMuted} />
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

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: S.screenPadding,
    gap: COL_GAP,
    paddingBottom: 40,
  },
  card: {
    width: CARD_W,
    marginBottom: 6,
  },
  cardImgWrap: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    marginBottom: 6,
  },
  cardImg: {
    width: "100%",
    height: "100%",
  },
  cardImgEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.elevated,
  },
  cardLabel: {
    color: C.textPrimary,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 15,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  countDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#EF4444",
  },
  countText: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: "700",
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
