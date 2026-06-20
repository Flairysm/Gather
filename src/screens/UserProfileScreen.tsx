import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";

import { LinearGradient } from "expo-linear-gradient";

import CachedImage from "../components/CachedImage";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import PostCard from "../components/PostCard";
import Shimmer, { ShimmerGroup } from "../components/Shimmer";
import { C, S } from "../theme";
import { feed as f } from "../styles/feed.styles";
import { useAppNavigation } from "../navigation/NavigationContext";
import { usePostLike } from "../hooks/usePostLike";
import {
  deletePost,
  fetchPublicProfile,
  fetchUserPosts,
  reportPost,
  toggleFollow,
  type FeedPost,
  type PublicProfile,
} from "../data/feed";

type Props = { userId: string; onBack: () => void };

const REPORT_REASONS = ["Spam or scam", "Harassment or hate", "Inappropriate content", "Other"];

function memberSince(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function UserProfileScreen({ userId, onBack }: Props) {
  const { push } = useAppNavigation();
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const [actionPost, setActionPost] = useState<FeedPost | null>(null);
  const [reporting, setReporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, ps] = await Promise.all([
        fetchPublicProfile(userId),
        fetchUserPosts(userId),
      ]);
      setProfile(p);
      setPosts(ps);
      setError(!p);
    } catch {
      setError(true);
    }
  }, [userId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const patchPost = useCallback((id: string, patch: Partial<FeedPost>) => {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const handleLike = usePostLike(patchPost);

  async function handleFollow() {
    if (!profile || profile.is_me || followBusy) return;
    const wasFollowing = profile.is_following;
    setFollowBusy(true);
    setProfile({
      ...profile,
      is_following: !wasFollowing,
      follower_count: profile.follower_count + (wasFollowing ? -1 : 1),
    });
    try {
      // Server is authoritative for follow state; the optimistic count above
      // already reflects the toggle, so just trust the returned flag.
      const res = await toggleFollow(userId);
      setProfile((cur) => (cur ? { ...cur, is_following: res.following } : cur));
    } catch {
      setProfile((cur) =>
        cur ? { ...cur, is_following: wasFollowing, follower_count: profile.follower_count } : cur,
      );
      Alert.alert("Couldn't update follow", "Please try again.");
    } finally {
      setFollowBusy(false);
    }
  }

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
      setProfile((cur) => (cur ? { ...cur, post_count: Math.max(cur.post_count - 1, 0) } : cur));
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

  const FloatingBack = (
    <Pressable
      style={[st.floatingBack, { top: insets.top + 8 }]}
      onPress={onBack}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <Feather name="arrow-left" size={20} color={C.textHero} />
    </Pressable>
  );

  if (loading) {
    return (
      <View style={f.safe}>
        <StatusBar style="light" />
        <ShimmerGroup>
          <View>
            <View style={[st.banner, { height: BANNER_H + insets.top }]} />
            <View style={st.headerCard}>
              <View style={st.topRow}>
                <Shimmer width={AVATAR + 8} height={AVATAR + 8} borderRadius={(AVATAR + 8) / 2} />
                <Shimmer width={108} height={38} borderRadius={S.radiusPill} />
              </View>
              <Shimmer width={170} height={20} borderRadius={6} style={{ marginTop: 14 }} />
              <Shimmer width={120} height={13} borderRadius={6} style={{ marginTop: 8 }} />
              <Shimmer width="90%" height={13} borderRadius={6} style={{ marginTop: 14 }} />
              <Shimmer width="60%" height={13} borderRadius={6} style={{ marginTop: 8 }} />
              <Shimmer width={220} height={14} borderRadius={6} style={{ marginTop: 16 }} />
            </View>
          </View>
        </ShimmerGroup>
        {FloatingBack}
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={f.safe}>
        <StatusBar style="light" />
        <View style={{ height: insets.top + 52 }}>{FloatingBack}</View>
        <ErrorState message="This profile is unavailable." onRetry={onBack} />
      </View>
    );
  }

  const displayName = profile.display_name ?? profile.username ?? "Collector";
  const canMessage = !profile.is_me;

  const ProfileHeader = (
    <View>
      <LinearGradient
        colors={[C.accent, C.accentGlow, C.bg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[st.banner, { height: BANNER_H + insets.top }]}
      />

      <View style={st.headerCard}>
        <View style={st.topRow}>
          <View style={st.avatarRing}>
            <View style={st.avatar}>
              {profile.avatar_url ? (
                <CachedImage source={{ uri: profile.avatar_url }} style={st.avatarImg} />
              ) : (
                <Ionicons name="person" size={40} color={C.textSecondary} />
              )}
            </View>
          </View>

          <View style={st.actionRow}>
            {profile.is_me ? (
              <Pressable style={st.secondaryBtn} onPress={() => push({ type: "EDIT_PROFILE" })}>
                <Feather name="edit-2" size={14} color={C.textPrimary} />
                <Text style={st.secondaryBtnText}>Edit profile</Text>
              </Pressable>
            ) : (
              <>
                {canMessage ? (
                  <Pressable
                    style={st.iconBtn}
                    onPress={() => push({ type: "CHAT", sellerId: userId, topic: displayName })}
                    accessibilityLabel="Message"
                  >
                    <Feather name="mail" size={17} color={C.textPrimary} />
                  </Pressable>
                ) : null}
                <Pressable
                  style={[st.followBtn, profile.is_following && st.followingBtn]}
                  onPress={handleFollow}
                  disabled={followBusy}
                >
                  {profile.is_following ? (
                    <Text style={st.followingBtnText}>Following</Text>
                  ) : (
                    <Text style={st.followBtnText}>Follow</Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </View>

        <View style={st.nameRow}>
          <Text style={st.name} numberOfLines={1}>{displayName}</Text>
          {profile.verified_seller ? (
            <Ionicons name="checkmark-circle" size={19} color={C.accent} />
          ) : null}
        </View>
        {profile.username ? <Text style={st.handle}>@{profile.username}</Text> : null}

        {profile.bio ? (
          <Text style={st.bio}>{profile.bio}</Text>
        ) : profile.is_me ? (
          <Pressable onPress={() => push({ type: "EDIT_PROFILE" })}>
            <Text style={st.bioEmpty}>Add a bio to tell collectors about yourself…</Text>
          </Pressable>
        ) : null}

        <View style={st.metaRow}>
          <Feather name="calendar" size={13} color={C.textMuted} />
          <Text style={st.metaText}>Joined {memberSince(profile.created_at)}</Text>
          {profile.store_id ? (
            <Pressable
              style={st.metaStore}
              onPress={() => push({ type: "VENDOR_STORE_PAGE", storeId: profile.store_id! })}
              hitSlop={6}
            >
              <Ionicons name="storefront-outline" size={13} color={C.textAccent} />
              <Text style={st.metaStoreText}>View store</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={st.statsRow}>
          <Text style={st.statItem}>
            <Text style={st.statNum}>{profile.following_count}</Text>
            <Text style={st.statLabel}> Following</Text>
          </Text>
          <Text style={st.statItem}>
            <Text style={st.statNum}>{profile.follower_count}</Text>
            <Text style={st.statLabel}> Followers</Text>
          </Text>
          <Text style={st.statItem}>
            <Text style={st.statNum}>{profile.post_count}</Text>
            <Text style={st.statLabel}> Posts</Text>
          </Text>
        </View>
      </View>

      <View style={st.tabBar}>
        <View style={st.tabActive}>
          <Text style={st.tabActiveText}>Posts</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={f.safe}>
      <StatusBar style="light" />

      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={f.listContent}
        ListHeaderComponent={ProfileHeader}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.accent}
            colors={[C.accent]}
          />
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onPress={() => push({ type: "FEED_POST_DETAIL", postId: item.id })}
            onComment={() => push({ type: "FEED_POST_DETAIL", postId: item.id })}
            onLike={() => handleLike(item)}
            onMore={() => setActionPost(item)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title={profile.is_me ? "You haven't posted yet" : "No posts yet"}
            message={
              profile.is_me
                ? "Share a pull, a grail, or a hot take with the community."
                : `${displayName} hasn't shared any public posts.`
            }
            actionLabel={profile.is_me ? "Create a post" : undefined}
            onAction={profile.is_me ? () => push({ type: "POST_COMPOSER" }) : undefined}
          />
        }
      />

      {FloatingBack}

      {/* Action sheet (delete own / report others) */}
      <Modal
        visible={!!actionPost}
        transparent
        animationType="fade"
        onRequestClose={() => setActionPost(null)}
      >
        <Pressable style={st.sheetScrim} onPress={() => setActionPost(null)}>
          <Pressable style={st.sheet}>
            <View style={st.sheetHandleWrap}>
              <View style={st.sheetHandle} />
            </View>
            {actionPost?.is_mine ? (
              <Pressable style={st.sheetRow} onPress={() => actionPost && confirmDelete(actionPost)}>
                <Feather name="trash-2" size={20} color={C.danger} />
                <Text style={st.sheetRowDanger}>Delete post</Text>
              </Pressable>
            ) : (
              <View>
                <Text style={st.sheetHint}>Report this post</Text>
                {REPORT_REASONS.map((reason) => (
                  <Pressable
                    key={reason}
                    disabled={reporting}
                    style={st.sheetRow}
                    onPress={() => actionPost && submitReport(actionPost, reason)}
                  >
                    <Feather name="flag" size={18} color={C.textSecondary} />
                    <Text style={st.sheetRowText}>{reason}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const AVATAR = 88;
const BANNER_H = 124;

const st = StyleSheet.create({
  banner: {
    height: BANNER_H,
    width: "100%",
    backgroundColor: C.muted,
  },

  floatingBack: {
    position: "absolute",
    top: 10,
    left: S.screenPadding,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(4,7,13,0.55)",
  },

  headerCard: {
    paddingHorizontal: S.screenPadding,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },

  topRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: -(AVATAR / 2),
  },
  avatarRing: {
    width: AVATAR + 8,
    height: AVATAR + 8,
    borderRadius: (AVATAR + 8) / 2,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: C.muted,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: AVATAR, height: AVATAR },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 6,
  },

  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  name: { color: C.textPrimary, fontSize: 22, fontWeight: "900", maxWidth: 280, letterSpacing: -0.3 },
  handle: { color: C.textMuted, fontSize: 14, marginTop: 2, fontWeight: "600" },
  bio: {
    color: C.textPrimary,
    fontSize: 14.5,
    lineHeight: 21,
    marginTop: 12,
  },
  bioEmpty: {
    color: C.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
    fontStyle: "italic",
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    flexWrap: "wrap",
  },
  metaText: { color: C.textMuted, fontSize: 13, fontWeight: "600" },
  metaStore: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 6 },
  metaStoreText: { color: C.textAccent, fontSize: 13, fontWeight: "700" },

  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginTop: 14,
  },
  statItem: { color: C.textMuted },
  statNum: { color: C.textPrimary, fontSize: 14.5, fontWeight: "900" },
  statLabel: { color: C.textMuted, fontSize: 14, fontWeight: "500" },

  followBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accent,
    paddingVertical: 9,
    paddingHorizontal: 22,
    borderRadius: S.radiusPill,
    minWidth: 104,
  },
  followBtnText: { color: C.textHero, fontSize: 14.5, fontWeight: "800" },
  followingBtn: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.borderCard,
  },
  followingBtnText: { color: C.textPrimary, fontSize: 14.5, fontWeight: "800" },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.borderCard,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.borderCard,
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: S.radiusPill,
  },
  secondaryBtnText: { color: C.textPrimary, fontSize: 14.5, fontWeight: "800" },

  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  tabActive: {
    paddingVertical: 14,
    marginLeft: S.screenPadding,
    borderBottomWidth: 2.5,
    borderBottomColor: C.accent,
  },
  tabActiveText: {
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  sheetScrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: S.radiusCard,
    borderTopRightRadius: S.radiusCard,
    paddingBottom: 28,
    paddingTop: 8,
  },
  sheetHandleWrap: { alignItems: "center", paddingVertical: 8 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: C.border },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 22, paddingVertical: 15 },
  sheetRowText: { color: C.textPrimary, fontSize: 15 },
  sheetRowDanger: { color: C.danger, fontSize: 16, fontWeight: "700" },
  sheetHint: { color: C.textMuted, fontSize: 13, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 4 },
});
