import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";

import CachedImage from "../components/CachedImage";
import PostCard from "../components/PostCard";
import ErrorState from "../components/ErrorState";
import { C } from "../theme";
import { feed as f } from "../styles/feed.styles";
import { useAppNavigation } from "../navigation/NavigationContext";
import { requireNetwork } from "../lib/network";
import { usePostLike } from "../hooks/usePostLike";
import {
  addComment,
  authorLabel,
  COMMENT_MAX_CHARS,
  deleteComment,
  deletePost,
  fetchComments,
  fetchPost,
  reportPost,
  timeAgo,
  toggleCommentLike,
  type FeedComment,
  type FeedPost,
} from "../data/feed";

type Props = { postId: string; onBack: () => void };

type CommentRow =
  | { kind: "comment"; comment: FeedComment; depth: number; parentLabel: string | null }
  | { kind: "toggle"; rootId: string; count: number; expanded: boolean };

export default function PostDetailScreen({ postId, onBack }: Props) {
  const { push } = useAppNavigation();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [draft, setDraft] = useState("");
  const [anon, setAnon] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<FeedComment | null>(null);
  // Root comment ids whose reply threads are collapsed (replies are expanded by default).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const inputRef = useRef<TextInput>(null);

  // Flatten the comments into a Threads-style list: each top-level comment,
  // an optional "view/hide replies" toggle, then its replies (when expanded),
  // indented one level and ordered by time.
  const rows = useMemo<CommentRow[]>(() => {
    const byId = new Map(comments.map((c) => [c.id, c]));
    const rootOf = (c: FeedComment): string => {
      let cur = c;
      let guard = 0;
      while (cur.parent_comment_id && byId.has(cur.parent_comment_id) && guard < 100) {
        cur = byId.get(cur.parent_comment_id)!;
        guard += 1;
      }
      return cur.id;
    };
    const repliesByRoot = new Map<string, FeedComment[]>();
    for (const c of comments) {
      if (!c.parent_comment_id) continue;
      const root = rootOf(c);
      const arr = repliesByRoot.get(root) ?? [];
      arr.push(c);
      repliesByRoot.set(root, arr);
    }
    const out: CommentRow[] = [];
    for (const top of comments) {
      if (top.parent_comment_id) continue;
      out.push({ kind: "comment", comment: top, depth: 0, parentLabel: null });
      const replies = (repliesByRoot.get(top.id) ?? []).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      if (replies.length === 0) continue;
      const isCollapsed = collapsed.has(top.id);
      out.push({ kind: "toggle", rootId: top.id, count: replies.length, expanded: !isCollapsed });
      if (isCollapsed) continue;
      for (const r of replies) {
        const parent = r.parent_comment_id ? byId.get(r.parent_comment_id) : null;
        const parentLabel = parent && parent.id !== top.id ? authorLabel(parent) : null;
        out.push({ kind: "comment", comment: r, depth: 1, parentLabel });
      }
    }
    return out;
  }, [comments, collapsed]);

  const toggleReplies = useCallback((rootId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  }, []);

  const handleCommentLike = useCallback((comment: FeedComment) => {
    const liked = !comment.liked_by_me;
    setComments((prev) =>
      prev.map((c) =>
        c.id === comment.id
          ? { ...c, liked_by_me: liked, like_count: Math.max(0, c.like_count + (liked ? 1 : -1)) }
          : c,
      ),
    );
    toggleCommentLike(comment.id).catch(() => {
      setComments((prev) =>
        prev.map((c) =>
          c.id === comment.id
            ? { ...c, liked_by_me: comment.liked_by_me, like_count: comment.like_count }
            : c,
        ),
      );
    });
  }, []);

  const startReply = useCallback((comment: FeedComment) => {
    setReplyingTo(comment);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([fetchPost(postId), fetchComments(postId)]);
      setPost(p);
      setComments(c);
      setError(!p);
    } catch {
      setError(true);
    }
  }, [postId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const patchPost = useCallback((id: string, patch: Partial<FeedPost>) => {
    setPost((cur) => (cur && cur.id === id ? { ...cur, ...patch } : cur));
  }, []);

  const toggleLike = usePostLike(patchPost);
  const handleLike = useCallback(() => {
    if (post) toggleLike(post);
  }, [post, toggleLike]);

  const commentCharCount = draft.length;

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    if (!(await requireNetwork())) return;
    setSending(true);
    try {
      await addComment(postId, text, anon, replyingTo?.id ?? null);
      setDraft("");
      setReplyingTo(null);
      const c = await fetchComments(postId);
      setComments(c);
      setPost((cur) => (cur ? { ...cur, comment_count: c.length } : cur));
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to add comment.");
    } finally {
      setSending(false);
    }
  }

  function confirmDeleteComment(comment: FeedComment) {
    Alert.alert("Delete comment", "Remove this comment?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteComment(comment.id);
            setComments((prev) => prev.filter((c) => c.id !== comment.id));
            setPost((cur) => (cur ? { ...cur, comment_count: Math.max(cur.comment_count - 1, 0) } : cur));
          } catch (err: any) {
            Alert.alert("Error", err?.message ?? "Failed to delete comment.");
          }
        },
      },
    ]);
  }

  async function handleReportPost() {
    if (!post) return;
    try {
      await reportPost(post.id, "Reported from detail view");
      Alert.alert("Reported", "Thanks — our team will review this post.");
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to report post.");
    }
  }

  function handlePostMore() {
    if (!post) return;
    if (post.is_mine) {
      Alert.alert("Delete post", "This will permanently remove your post.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deletePost(post.id);
              onBack();
            } catch (err: any) {
              Alert.alert("Error", err?.message ?? "Failed to delete post.");
            }
          },
        },
      ]);
    } else {
      Alert.alert("Report this post", "Our team will review it for inappropriate content.", [
        { text: "Cancel", style: "cancel" },
        { text: "Report", style: "destructive", onPress: handleReportPost },
      ]);
    }
  }

  return (
    <SafeAreaView style={f.safe}>
      <StatusBar style="light" />
      <View style={f.header}>
        <Pressable style={f.headerBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textSearch} />
        </Pressable>
        <Text style={f.headerTitle}>Post</Text>
        <View style={{ width: 34 }} />
      </View>

      {loading ? (
        <View style={f.centerState}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : error || !post ? (
        <ErrorState
          message="This post is unavailable."
          onRetry={() => {
            setLoading(true);
            load().finally(() => setLoading(false));
          }}
        />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <FlatList
            data={rows}
            keyExtractor={(r) => (r.kind === "toggle" ? `toggle-${r.rootId}` : r.comment.id)}
            contentContainerStyle={f.listContent}
            ListHeaderComponent={
              <PostCard
                post={post}
                onLike={handleLike}
                onComment={() => inputRef.current?.focus()}
                onAuthorPress={
                  post.author_id
                    ? () => push({ type: "USER_PROFILE", userId: post.author_id! })
                    : undefined
                }
                onMore={handlePostMore}
              />
            }
            renderItem={({ item: row }) => {
              if (row.kind === "toggle") {
                return (
                  <Pressable
                    style={f.repliesToggle}
                    onPress={() => toggleReplies(row.rootId)}
                    hitSlop={8}
                  >
                    <Text style={f.repliesToggleText}>
                      {row.expanded
                        ? "Hide replies"
                        : `View ${row.count} ${row.count === 1 ? "reply" : "replies"}`}
                    </Text>
                    <Feather
                      name={row.expanded ? "chevron-up" : "chevron-down"}
                      size={14}
                      color={C.textSecondary}
                    />
                  </Pressable>
                );
              }
              const item = row.comment;
              const showAvatar = !item.is_anonymous && item.author_avatar_url;
              const canOpenAuthor = !item.is_anonymous && !!item.author_id;
              const openAuthor = canOpenAuthor
                ? () => push({ type: "USER_PROFILE", userId: item.author_id! })
                : undefined;
              const isReply = row.depth > 0;
              const avatarSize = isReply ? 28 : 34;
              return (
                <View
                  style={[
                    f.commentRow,
                    isReply ? f.commentReplyIndent : f.commentThreadTop,
                  ]}
                >
                  <Pressable
                    style={[f.commentAvatar, isReply && f.commentAvatarSmall]}
                    onPress={openAuthor}
                    disabled={!canOpenAuthor}
                    hitSlop={6}
                  >
                    {showAvatar ? (
                      <CachedImage
                        source={{ uri: item.author_avatar_url! }}
                        style={{ width: avatarSize, height: avatarSize }}
                      />
                    ) : (
                      <Ionicons
                        name={item.is_anonymous ? "eye-off-outline" : "person"}
                        size={isReply ? 13 : 15}
                        color={C.textSecondary}
                      />
                    )}
                  </Pressable>
                  <View style={f.commentBody}>
                    {row.parentLabel ? (
                      <Text style={f.replyParentLabel}>Replying to {row.parentLabel}</Text>
                    ) : null}
                    <View style={f.authorRow}>
                      <Pressable onPress={openAuthor} disabled={!canOpenAuthor} hitSlop={6}>
                        <Text style={f.authorName}>{authorLabel(item)}</Text>
                      </Pressable>
                      <Text style={f.dot}>·</Text>
                      <Text style={f.timeText}>{timeAgo(item.created_at)}</Text>
                    </View>
                    <Text style={f.commentText}>{item.body}</Text>
                    <View style={f.commentActionsRow}>
                      <Pressable onPress={() => startReply(item)} hitSlop={8}>
                        <Text style={f.replyBtnText}>Reply</Text>
                      </Pressable>
                      {item.is_mine ? (
                        <Pressable onPress={() => confirmDeleteComment(item)} hitSlop={8}>
                          <Text style={f.replyBtnText}>Delete</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                  <Pressable
                    style={f.commentLikeCol}
                    onPress={() => handleCommentLike(item)}
                    hitSlop={8}
                  >
                    <Ionicons
                      name={item.liked_by_me ? "heart" : "heart-outline"}
                      size={17}
                      color={item.liked_by_me ? C.live : C.textMuted}
                    />
                    {item.like_count > 0 ? (
                      <Text style={[f.commentLikeCount, item.liked_by_me && f.commentLikeCountActive]}>
                        {item.like_count}
                      </Text>
                    ) : null}
                  </Pressable>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={{ padding: 28, alignItems: "center" }}>
                <Text style={f.emptySub}>No comments yet. Start the conversation.</Text>
              </View>
            }
          />

          {replyingTo ? (
            <View style={f.replyingChip}>
              <Text style={f.replyingChipText} numberOfLines={1}>
                Replying to {authorLabel(replyingTo)}
              </Text>
              <Pressable onPress={() => setReplyingTo(null)} hitSlop={8}>
                <Feather name="x" size={16} color={C.textMuted} />
              </Pressable>
            </View>
          ) : null}

          {commentCharCount > COMMENT_MAX_CHARS * 0.8 ? (
            <Text
              style={[
                f.commentCounter,
                commentCharCount >= COMMENT_MAX_CHARS && f.composerCounterOver,
              ]}
            >
              {commentCharCount}/{COMMENT_MAX_CHARS}
            </Text>
          ) : null}

          <View style={f.commentBar}>
            <Pressable
              style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
              onPress={() => setAnon((v) => !v)}
              hitSlop={8}
            >
              <Ionicons
                name={anon ? "eye-off" : "eye-off-outline"}
                size={22}
                color={anon ? C.textAccent : C.textMuted}
              />
              <Text style={{ fontSize: 12, fontWeight: "600", color: anon ? C.textAccent : C.textMuted }}>
                Anon
              </Text>
            </Pressable>
            <TextInput
              ref={inputRef}
              style={f.commentInput}
              value={draft}
              onChangeText={setDraft}
              placeholder={
                replyingTo
                  ? `Reply to ${authorLabel(replyingTo)}…`
                  : anon
                    ? "Comment anonymously…"
                    : "Add a comment…"
              }
              placeholderTextColor={C.textMuted}
              multiline
              maxLength={COMMENT_MAX_CHARS}
            />
            <Pressable
              style={[f.commentSend, (!draft.trim() || sending) && f.commentSendDisabled]}
              onPress={handleSend}
              disabled={!draft.trim() || sending}
              hitSlop={8}
            >
              {sending ? (
                <ActivityIndicator size="small" color={C.textHero} />
              ) : (
                <Feather name="send" size={16} color={C.textHero} />
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
