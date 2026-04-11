import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { C, S } from "../theme";
import { fetchLiveStreams, type LiveStream } from "../data/live";
import { useAppNavigation } from "../navigation/NavigationContext";
import ErrorState from "../components/ErrorState";
import { useReconnect } from "../hooks/useReconnect";
import InlineLiveViewer from "../components/InlineLiveViewer";

const { height: SCREEN_H } = Dimensions.get("window");
const PAGE_SIZE = 10;

export default function LiveScreen() {
  const insets = useSafeAreaInsets();
  const { push, stack } = useAppNavigation();
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const allLoadedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setLoadError(false);
      allLoadedRef.current = false;
      const data = await fetchLiveStreams({ limit: PAGE_SIZE, offset: 0 });
      setStreams(data);
      if (data.length < PAGE_SIZE) allLoadedRef.current = true;
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useReconnect(load);

  const hasOverlay = stack.some((s) => s.type === "LIVE_VIEWER" || s.type === "GO_LIVE");
  const prevOverlayRef = useRef(hasOverlay);
  useEffect(() => {
    if (prevOverlayRef.current && !hasOverlay) load().catch(() => {});
    prevOverlayRef.current = hasOverlay;
  }, [hasOverlay, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load().catch(() => {});
    setRefreshing(false);
  }, [load]);

  const loadMore = useCallback(async () => {
    if (loadingMore || allLoadedRef.current) return;
    setLoadingMore(true);
    try {
      const data = await fetchLiveStreams({ limit: PAGE_SIZE, offset: streams.length });
      if (data.length < PAGE_SIZE) allLoadedRef.current = true;
      setStreams((prev) => [...prev, ...data]);
    } catch {}
    setLoadingMore(false);
  }, [loadingMore, streams.length]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  if (loading) {
    return (
      <View style={st.root}>
        <StatusBar style="light" />
        <ActivityIndicator color={C.accent} style={{ flex: 1 }} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={st.root}>
        <StatusBar style="light" />
        <ErrorState message="Could not load live streams." onRetry={load} />
      </View>
    );
  }

  if (streams.length === 0) {
    return (
      <View style={st.root}>
        <StatusBar style="light" />
        <Pressable style={[st.goLiveBtn, { top: insets.top + 8 }]} onPress={() => push({ type: "GO_LIVE" })}>
          <Ionicons name="radio" size={14} color="#fff" />
          <Text style={st.goLiveBtnText}>GO LIVE</Text>
        </Pressable>
        <View style={st.emptyCenter}>
          <Ionicons name="radio-outline" size={56} color={C.textMuted} />
          <Text style={st.emptyTitle}>No one is live right now</Text>
          <Text style={st.emptySub}>Be the first — tap GO LIVE!</Text>
        </View>
      </View>
    );

  }

  return (
    <View style={st.root}>
      <StatusBar style="light" />

      <FlatList
        data={streams}
        keyExtractor={(s) => s.id}
        renderItem={({ item, index }) => (
          <View style={{ height: SCREEN_H }}>
            <InlineLiveViewer
              streamId={item.id}
              isActive={index === activeIndex}
              initialStream={item}
            />
          </View>
        )}
        pagingEnabled
        snapToInterval={SCREEN_H}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onEndReached={loadMore}
        onEndReachedThreshold={1.5}
        getItemLayout={(_data, index) => ({
          length: SCREEN_H,
          offset: SCREEN_H * index,
          index,
        })}
        initialNumToRender={2}
        maxToRenderPerBatch={3}
        windowSize={3}
        removeClippedSubviews
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
        }
      />

      {loadingMore && (
        <View style={st.loadingFooter}>
          <ActivityIndicator size="small" color={C.accent} />
        </View>
      )}

      {/* GO LIVE — top right */}
      <Pressable style={[st.goLiveBtn, { top: insets.top + 8 }]} onPress={() => push({ type: "GO_LIVE" })}>
        <Ionicons name="radio" size={14} color="#fff" />
        <Text style={st.goLiveBtnText}>GO LIVE</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  emptyCenter: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10 },
  emptyTitle: { color: C.textPrimary, fontSize: 18, fontWeight: "700" },
  emptySub: { color: C.textSecondary, fontSize: 13, fontWeight: "500" },
  goLiveBtn: {
    position: "absolute",
    right: S.screenPadding,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.live,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: C.live,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 50,
  },
  goLiveBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  loadingFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 12,
    alignItems: "center",
  },
});
