import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  SafeAreaView,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";

import CachedImage from "../components/CachedImage";
import ErrorState from "../components/ErrorState";
import PostCard from "../components/PostCard";
import Shimmer, { ShimmerGroup } from "../components/Shimmer";
import { C, S } from "../theme";
import { feed as f } from "../styles/feed.styles";
import { supabase } from "../lib/supabase";
import { useAppNavigation } from "../navigation/NavigationContext";
import { onTabReselect } from "../lib/tabEvents";
import { usePostLike } from "../hooks/usePostLike";
import {
  deletePost,
  fetchFeed,
  fetchFollowingFeed,
  reportPost,
  type FeedPost,
} from "../data/feed";

type FeedTab = "for_you" | "following";

const REPORT_REASONS = ["Spam or scam", "Harassment or hate", "Inappropriate content", "Other"];

function SkeletonCard() {
  return (
    <View style={f.skeletonCard}>
      <Shimmer width={42} height={42} borderRadius={21} />
      <View style={f.skeletonBody}>
        <Shimmer width="45%" height={13} borderRadius={6} />
        <Shimmer width="92%" height={11} borderRadius={6} />
        <Shimmer width="78%" height={11} borderRadius={6} />
        <Shimmer width={120} height={12} borderRadius={6} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

export default function FeedScreen() {
  const { push } = useAppNavigation();
  const listRef = useRef<FlatList<FeedPost>>(null);
  const offsetRef = useRef(0);

  const [tab, setTab] = useState<FeedTab>("for_you");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [error, setError] = useState(false);

  const [actionPost, setActionPost] = useState<FeedPost | null>(null);
  const [reporting, setReporting] = useState(false);

  const [me, setMe] = useState<{ id: string; avatar_url: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadMe() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setMe({ id: user.id, avatar_url: (data?.avatar_url as string | null) ?? null });
    }
    loadMe();
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async () => {
    try {
      const data =
        tab === "following" ? await fetchFollowingFeed() : await fetchFeed();
      setPosts(data);
      setReachedEnd(data.length < 20);
      setError(false);
    } catch {
      setError(true);
    }
  }, [tab]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const selectTab = useCallback(
    (next: FeedTab) => {
      if (next === tab) return;
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      setTab(next);
      setPosts([]);
      setReachedEnd(false);
      setError(false);
      setLoading(true);
    },
    [tab],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Instagram-style: tapping the active FEED tab scrolls to top; if already at
  // the top, it triggers a refresh.
  useEffect(() => {
    return onTabReselect("FEED", () => {
      if (offsetRef.current > 8) {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      } else {
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
        onRefresh();
      }
    });
  }, [onRefresh]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetRef.current = e.nativeEvent.contentOffset.y;
  }, []);

  async function loadMore() {
    if (loadingMore || reachedEnd || posts.length === 0) return;
    setLoadingMore(true);
    try {
      const more =
        tab === "following"
          ? await fetchFollowingFeed(posts.length)
          : await fetchFeed(posts.length);
      // Ranked feed uses offset pagination; scores shift over time, so guard
      // against a post appearing on two pages.
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...more.filter((p) => !seen.has(p.id))];
      });
      if (more.length < 20) setReachedEnd(true);
    } catch {
      Alert.alert("Couldn't load more", "Check your connection and try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  function openComposer() {
    if (!me) {
      Alert.alert("Sign in required", "Please sign in to create a post.");
      return;
    }
    push({ type: "POST_COMPOSER" });
  }

  const patchPost = useCallback((id: string, patch: Partial<FeedPost>) => {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const handleLike = usePostLike(patchPost);

  function confirmDelete(post: FeedPost) {
    setActionPost(null);
    Alert.alert("Delete post", "This will permanently remove your post.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => handleDelete(post) },
    ]);
  }

  async function handleDelete(post: FeedPost) {
    try {
      await deletePost(post.id);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to delete post.");
    }
  }

  async function submitReport(post: FeedPost, reason: string) {
    setReporting(true);
    try {
      await reportPost(post.id, reason);
      setActionPost(null);
      Alert.alert("Reported", "Thanks — our team will review this post.");
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to report post.");
    } finally {
      setReporting(false);
    }
  }

  const Header = (
    <View style={f.header}>
      <View style={f.headerLeft}>
        <Pressable
          style={f.headerAvatar}
          onPress={() =>
            me
              ? push({ type: "USER_PROFILE", userId: me.id })
              : Alert.alert("Sign in required", "Please sign in to view your profile.")
          }
          hitSlop={6}
          accessibilityLabel="Open your profile"
        >
          {me?.avatar_url ? (
            <CachedImage source={{ uri: me.avatar_url }} style={f.headerAvatarImg} />
          ) : (
            <Ionicons name="person" size={18} color={C.textSecondary} />
          )}
        </Pressable>
        <Text style={f.headerTitle}>Social</Text>
      </View>
      <Pressable style={f.headerBtn} onPress={openComposer}>
        <Feather name="edit-3" size={18} color={C.textSearch} />
      </Pressable>
    </View>
  );

  const Tabs = (
    <View style={f.tabsBar}>
      {(["for_you", "following"] as FeedTab[]).map((t) => {
        const active = tab === t;
        return (
          <Pressable key={t} style={f.tabItem} onPress={() => selectTab(t)} hitSlop={4}>
            <Text style={[f.tabText, active && f.tabTextActive]}>
              {t === "for_you" ? "For You" : "Following"}
            </Text>
            {active ? <View style={f.tabUnderline} /> : null}
          </Pressable>
        );
      })}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={f.safe}>
        <StatusBar style="light" />
        {Header}
        {Tabs}
        <ShimmerGroup>
          <View>
            {Array.from({ length: 7 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </View>
        </ShimmerGroup>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={f.safe}>
      <StatusBar style="light" />
      {Header}
      {Tabs}

      {error && posts.length === 0 ? (
        <ErrorState message="Couldn't load Social. Pull to retry." onRetry={onRefresh} />
      ) : (
        <FlatList
          ref={listRef}
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={f.listContent}
          onScroll={onScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.accent}
              colors={[C.accent]}
            />
          }
          onEndReachedThreshold={0.5}
          onEndReached={loadMore}
          removeClippedSubviews
          renderItem={({ item }) => (
            <PostCard
              post={item}
              onPress={() => push({ type: "FEED_POST_DETAIL", postId: item.id })}
              onLike={() => handleLike(item)}
              onComment={() => push({ type: "FEED_POST_DETAIL", postId: item.id })}
              onAuthorPress={
                item.author_id
                  ? () => push({ type: "USER_PROFILE", userId: item.author_id! })
                  : undefined
              }
              onMore={() => setActionPost(item)}
            />
          )}
          ListEmptyComponent={
            tab === "following" ? (
              <View style={f.centerState}>
                <View style={f.emptyIconWrap}>
                  <Ionicons name="people-outline" size={32} color={C.textSecondary} />
                </View>
                <Text style={f.emptyTitle}>Nothing here yet</Text>
                <Text style={f.emptySub}>
                  Follow collectors and the posts from people you follow will show up here.
                </Text>
                <Pressable style={f.emptyBtn} onPress={() => selectTab("for_you")}>
                  <Ionicons name="sparkles-outline" size={15} color={C.textHero} />
                  <Text style={f.emptyBtnText}>Explore For You</Text>
                </Pressable>
              </View>
            ) : (
              <View style={f.centerState}>
                <View style={f.emptyIconWrap}>
                  <Ionicons name="chatbubbles-outline" size={32} color={C.textSecondary} />
                </View>
                <Text style={f.emptyTitle}>No posts yet</Text>
                <Text style={f.emptySub}>
                  Be the first to share a pull, a grail, or a hot take with the community.
                </Text>
                <Pressable style={f.emptyBtn} onPress={openComposer}>
                  <Feather name="edit-3" size={15} color={C.textHero} />
                  <Text style={f.emptyBtnText}>Create a post</Text>
                </Pressable>
              </View>
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 20 }}>
                <ActivityIndicator color={C.accent} />
              </View>
            ) : reachedEnd && posts.length > 0 ? (
              <View style={f.endFooter}>
                <Ionicons name="sparkles-outline" size={16} color={C.textMuted} />
                <Text style={f.endFooterText}>You're all caught up</Text>
              </View>
            ) : null
          }
        />
      )}

      <Pressable style={f.fab} onPress={openComposer}>
        <Feather name="plus" size={26} color={C.textHero} />
      </Pressable>

      {/* Action sheet */}
      <Modal
        visible={!!actionPost}
        transparent
        animationType="fade"
        onRequestClose={() => setActionPost(null)}
      >
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} onPress={() => setActionPost(null)}>
          <Pressable
            style={{
              backgroundColor: C.surface,
              borderTopLeftRadius: S.radiusCard,
              borderTopRightRadius: S.radiusCard,
              paddingBottom: 28,
              paddingTop: 8,
            }}
          >
            <View style={{ alignItems: "center", paddingVertical: 8 }}>
              <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: C.border }} />
            </View>
            {actionPost?.is_mine ? (
              <Pressable
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 22, paddingVertical: 16 }}
                onPress={() => actionPost && confirmDelete(actionPost)}
              >
                <Feather name="trash-2" size={20} color={C.danger} />
                <Text style={{ color: C.danger, fontSize: 16, fontWeight: "700" }}>Delete post</Text>
              </Pressable>
            ) : (
              <View>
                <Text style={{ color: C.textMuted, fontSize: 13, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 4 }}>
                  Report this post
                </Text>
                {REPORT_REASONS.map((reason) => (
                  <Pressable
                    key={reason}
                    disabled={reporting}
                    style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 22, paddingVertical: 14 }}
                    onPress={() => actionPost && submitReport(actionPost, reason)}
                  >
                    <Feather name="flag" size={18} color={C.textSecondary} />
                    <Text style={{ color: C.textPrimary, fontSize: 15 }}>{reason}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
