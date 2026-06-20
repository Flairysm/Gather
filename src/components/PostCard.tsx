import { memo, useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";

import CachedImage from "./CachedImage";
import { C } from "../theme";
import { feed as f } from "../styles/feed.styles";
import { authorLabel, timeAgo, type FeedPost } from "../data/feed";

type Props = {
  post: FeedPost;
  onPress?: () => void;
  onLike: () => void;
  onComment?: () => void;
  onMore: () => void;
  /** Open the author's profile. Only wired for non-anonymous posts. */
  onAuthorPress?: () => void;
};

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function mediaStyle(count: number) {
  if (count === 1) return f.mediaSingle;
  if (count === 3) return f.mediaThird;
  return f.mediaHalf;
}

function PostCardBase({ post, onPress, onLike, onComment, onMore, onAuthorPress }: Props) {
  const name = authorLabel(post);
  const showAvatar = !post.is_anonymous && post.author_avatar_url;
  const canOpenAuthor = !post.is_anonymous && !!post.author_id && !!onAuthorPress;

  // Heart "pop" on like.
  const scale = useRef(new Animated.Value(1)).current;
  function handleLike() {
    if (!post.liked_by_me) {
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.35, useNativeDriver: true, speed: 50, bounciness: 14 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 10 }),
      ]).start();
    }
    onLike();
  }

  const media = post.media_urls.slice(0, 4);

  return (
    <Pressable
      style={({ pressed }) => [f.card, pressed && f.cardPressed]}
      onPress={onPress}
    >
      <Pressable
        style={[f.avatar, post.is_anonymous && f.avatarAnon]}
        onPress={canOpenAuthor ? onAuthorPress : undefined}
        disabled={!canOpenAuthor}
        hitSlop={6}
      >
        {showAvatar ? (
          <CachedImage source={{ uri: post.author_avatar_url! }} style={f.avatarImg} />
        ) : (
          <Ionicons
            name={post.is_anonymous ? "eye-off-outline" : "person"}
            size={18}
            color={C.textSecondary}
          />
        )}
      </Pressable>

      <View style={f.cardBody}>
        <View style={f.authorRow}>
          <Pressable
            style={f.authorTap}
            onPress={canOpenAuthor ? onAuthorPress : undefined}
            disabled={!canOpenAuthor}
            hitSlop={6}
          >
            <Text style={f.authorName} numberOfLines={1}>{name}</Text>
            {!post.is_anonymous && post.author_username ? (
              <Text style={f.authorHandle} numberOfLines={1}>@{post.author_username}</Text>
            ) : null}
          </Pressable>
          <Text style={f.dot}>·</Text>
          <Text style={f.timeText}>{timeAgo(post.created_at)}</Text>
          {post.is_anonymous ? (
            <View style={f.anonBadge}>
              <Ionicons name="eye-off-outline" size={11} color={C.textSecondary} />
              <Text style={f.anonBadgeText}>Anon</Text>
            </View>
          ) : null}
        </View>

        {post.body ? <Text style={f.bodyText}>{post.body}</Text> : null}

        {media.length > 0 ? (
          <View style={f.mediaGrid}>
            {media.map((url, i) => (
              <CachedImage
                key={`${url}-${i}`}
                source={{ uri: url }}
                style={mediaStyle(media.length)}
              />
            ))}
          </View>
        ) : null}

        <View style={f.actionsRow}>
          <Pressable
            style={[f.action, post.liked_by_me && f.actionLiked]}
            onPress={handleLike}
            hitSlop={8}
          >
            <Animated.View style={{ transform: [{ scale }] }}>
              <Ionicons
                name={post.liked_by_me ? "heart" : "heart-outline"}
                size={19}
                color={post.liked_by_me ? C.live : C.textMuted}
              />
            </Animated.View>
            <Text style={[f.actionText, post.liked_by_me && f.actionTextActive]}>
              {post.like_count > 0 ? formatCount(post.like_count) : ""}
            </Text>
          </Pressable>

          <View style={f.actionSpacer} />

          <Pressable style={f.action} onPress={onComment ?? onPress} hitSlop={8}>
            <Feather name="message-circle" size={17} color={C.textMuted} />
            <Text style={f.actionText}>
              {post.comment_count > 0 ? formatCount(post.comment_count) : ""}
            </Text>
          </Pressable>

          <Pressable style={f.moreBtn} onPress={onMore} hitSlop={8}>
            <Feather name="more-horizontal" size={18} color={C.textMuted} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

export default memo(PostCardBase);
