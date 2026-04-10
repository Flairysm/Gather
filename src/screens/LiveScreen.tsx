import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";

import { C, S } from "../theme";
import { live as l } from "../styles/live.styles";
import { fetchLiveStreams, type LiveStream } from "../data/live";
import { useAppNavigation } from "../navigation/NavigationContext";
import { AGORA_DISABLED } from "../lib/agoraFlag";
import CachedImage from "../components/CachedImage";
import ErrorState from "../components/ErrorState";
import Shimmer, { ShimmerGroup, FadeIn } from "../components/Shimmer";
import { useReconnect } from "../hooks/useReconnect";

function formatViewers(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function timeSince(started: string): string {
  const mins = Math.floor((Date.now() - new Date(started).getTime()) / 60000);
  if (mins < 1) return "Just started";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function StreamCard({ stream }: { stream: LiveStream }) {
  const { push } = useAppNavigation();
  const name = stream.streamer?.display_name || stream.streamer?.username || "Streamer";

  return (
    <Pressable
      style={cardSt.card}
      onPress={() => push({ type: "LIVE_VIEWER", streamId: stream.id })}
    >
      <View style={cardSt.thumbnail}>
        {stream.thumbnail_url ? (
          <CachedImage source={{ uri: stream.thumbnail_url }} style={cardSt.thumbImg} />
        ) : (
          <View style={cardSt.thumbPlaceholder}>
            <Feather name="play" size={28} color={C.accent} />
          </View>
        )}
        <View style={cardSt.overlay}>
          <Text style={cardSt.overlayLive}>LIVE</Text>
          <Text style={cardSt.overlayJoin}>JOIN NOW</Text>
        </View>
        <View style={cardSt.liveBadge}>
          <View style={cardSt.liveDot} />
          <Text style={cardSt.liveText}>LIVE</Text>
        </View>
        <View style={cardSt.viewerBadge}>
          <Ionicons name="eye-outline" size={10} color={C.textPrimary} />
          <Text style={cardSt.viewerText}>{formatViewers(stream.viewer_count)}</Text>
        </View>
      </View>

      <View style={cardSt.info}>
        <View style={cardSt.avatarWrap}>
          {stream.streamer?.avatar_url ? (
            <CachedImage source={{ uri: stream.streamer.avatar_url }} style={cardSt.avatar} />
          ) : (
            <View style={[cardSt.avatar, cardSt.avatarFallback]}>
              <Text style={cardSt.avatarText}>{name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>
        <View style={cardSt.meta}>
          <Text style={cardSt.title} numberOfLines={1}>{stream.title}</Text>
          <Text style={cardSt.sub} numberOfLines={1}>
            {name} · {stream.category} · {timeSince(stream.started_at)}
          </Text>
        </View>
      </View>

      {stream.tags.length > 0 && (
        <View style={cardSt.tags}>
          {stream.tags.slice(0, 3).map((t) => (
            <View key={t} style={cardSt.tag}>
              <Text style={cardSt.tagText}>{t}</Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}

export default function LiveScreen() {
  const insets = useSafeAreaInsets();
  const { push, stack } = useAppNavigation();
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoadError(false);
      const data = await fetchLiveStreams();
      setStreams(data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useReconnect(load);

  const hasOverlay = stack.some(
    (s) => s.type === "LIVE_VIEWER" || s.type === "GO_LIVE",
  );
  const prevOverlayRef = useRef(hasOverlay);
  useEffect(() => {
    if (prevOverlayRef.current && !hasOverlay) {
      load().catch(() => {});
    }
    prevOverlayRef.current = hasOverlay;
  }, [hasOverlay, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load().catch(() => {});
    setRefreshing(false);
  }, [load]);

  const filtered = search.trim()
    ? streams.filter(
        (s) =>
          s.title.toLowerCase().includes(search.toLowerCase()) ||
          s.category.toLowerCase().includes(search.toLowerCase()) ||
          (s.streamer?.username ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : streams;

  return (
    <View style={l.root}>
      <StatusBar style="light" />

      {/* Search / Go Live header */}
      <View style={[headerSt.header, { paddingTop: insets.top + 8 }]}>
        <View style={headerSt.row}>
          {searchVisible ? (
            <>
              <View style={headerSt.searchBar}>
                <Feather name="search" size={16} color={C.textMuted} />
                <TextInput
                  style={headerSt.searchInput}
                  placeholder="Search live streams"
                  placeholderTextColor={C.textMuted}
                  value={search}
                  onChangeText={setSearch}
                  autoFocus
                />
              </View>
              <Pressable
                onPress={() => {
                  setSearchVisible(false);
                  setSearch("");
                }}
              >
                <Text style={headerSt.cancelText}>Cancel</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable style={headerSt.searchBar} onPress={() => setSearchVisible(true)}>
                <Feather name="search" size={16} color={C.textMuted} />
                <Text style={headerSt.searchPlaceholder}>Search live streams</Text>
              </Pressable>
              {!AGORA_DISABLED && (
                <Pressable style={l.goLiveBtn} onPress={() => push({ type: "GO_LIVE" })}>
                  <Ionicons name="radio" size={14} color={C.textHero} />
                  <Text style={l.goLiveText}>GO LIVE</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      </View>

      {loading ? (
        <ShimmerGroup>
          <ScrollView
            contentContainerStyle={{
              paddingTop: insets.top + 64,
              paddingHorizontal: S.screenPadding,
              paddingBottom: S.scrollPaddingBottom,
              gap: 14,
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ backgroundColor: C.card, borderRadius: S.radiusCard, borderWidth: 1, borderColor: C.borderCard, overflow: "hidden" }}>
                <Shimmer width="100%" height={180} borderRadius={0} />
                <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 10 }}>
                  <Shimmer width={36} height={36} borderRadius={18} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Shimmer width="65%" height={14} borderRadius={5} />
                    <Shimmer width="45%" height={11} borderRadius={4} />
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        </ShimmerGroup>
      ) : loadError ? (
        <ErrorState message="Could not load live streams." onRetry={load} />
      ) : filtered.length === 0 ? (
        <View style={emptySt.center}>
          <Ionicons name="radio-outline" size={48} color={C.textMuted} />
          <Text style={emptySt.title}>
            {search ? "No streams match your search" : "No one is live right now"}
          </Text>
          <Text style={emptySt.sub}>Be the first — tap GO LIVE above!</Text>
        </View>
      ) : (
        <FadeIn>
          <FlatList
            data={filtered}
            keyExtractor={(s) => s.id}
            renderItem={({ item }) => <StreamCard stream={item} />}
            contentContainerStyle={{
              paddingTop: insets.top + 64,
              paddingHorizontal: S.screenPadding,
              paddingBottom: S.scrollPaddingBottom,
              gap: 14,
            }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
            }
            initialNumToRender={6}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews
          />
        </FadeIn>
      )}
    </View>
  );
}

/* ── Inline styles ── */
import { StyleSheet } from "react-native";

const headerSt = StyleSheet.create({
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: S.screenPadding,
    paddingBottom: S.md,
    backgroundColor: C.bg,
  },
  row: { flexDirection: "row", alignItems: "center", gap: S.md },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: S.md,
    gap: S.sm,
    height: 40,
  },
  searchInput: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "500",
  },
  searchPlaceholder: { color: C.textMuted, fontSize: 14, fontWeight: "500" },
  cancelText: { color: C.textPrimary, fontSize: 14, fontWeight: "600" },
});

const cardSt = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: S.radiusCard,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.borderCard,
  },
  thumbnail: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: C.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  thumbImg: { width: "100%", height: "100%" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    zIndex: 1,
  },
  overlayLive: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 2,
  },
  overlayJoin: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  thumbPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(44,128,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  liveBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(234,61,94,0.9)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    zIndex: 2,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#fff" },
  liveText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  viewerBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    zIndex: 2,
  },
  viewerText: { color: C.textPrimary, fontSize: 10, fontWeight: "700" },
  info: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
  },
  avatarWrap: {},
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: {
    backgroundColor: C.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: C.textHero, fontSize: 14, fontWeight: "800" },
  meta: { flex: 1 },
  title: { color: C.textPrimary, fontSize: 14, fontWeight: "700" },
  sub: { color: C.textSecondary, fontSize: 11, fontWeight: "600", marginTop: 2 },
  tags: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  tag: {
    backgroundColor: C.cardAlt,
    borderRadius: S.radiusBadge,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { color: C.textIcon, fontSize: 10, fontWeight: "700" },
});

const emptySt = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10 },
  title: { color: C.textPrimary, fontSize: 16, fontWeight: "700" },
  sub: { color: C.textSecondary, fontSize: 13, fontWeight: "500" },
});
