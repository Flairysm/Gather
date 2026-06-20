import { supabase } from "../lib/supabase";

// Anti-spam character limits. Mirrored server-side in create_post /
// add_post_comment so they can't be bypassed.
export const POST_MAX_CHARS = 2000;
export const COMMENT_MAX_CHARS = 1000;

export type FeedPost = {
  id: string;
  body: string;
  media_urls: string[];
  is_anonymous: boolean;
  like_count: number;
  comment_count: number;
  created_at: string;
  edited_at: string | null;
  author_id: string | null;
  author_username: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
  is_mine: boolean;
  liked_by_me: boolean;
};

export type FeedComment = {
  id: string;
  post_id: string;
  parent_comment_id: string | null;
  body: string;
  is_anonymous: boolean;
  created_at: string;
  author_id: string | null;
  author_username: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
  is_mine: boolean;
  like_count: number;
  liked_by_me: boolean;
};

export type PublicProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  verified_seller: boolean;
  created_at: string;
  post_count: number;
  follower_count: number;
  following_count: number;
  is_following: boolean;
  is_me: boolean;
  store_id: string | null;
};

const PAGE_SIZE = 20;

/** Display name for a post/comment author, respecting anonymity. */
export function authorLabel(p: {
  is_anonymous: boolean;
  author_display_name: string | null;
  author_username: string | null;
}): string {
  if (p.is_anonymous) return "Anonymous";
  return p.author_display_name ?? p.author_username ?? "Collector";
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

/**
 * Ranked ("hot") feed, newest-and-most-engaged first. Falls back to a strictly
 * chronological read if the ranking RPC is unavailable (e.g. migration not yet
 * applied), so the feed never hard-fails. Pagination is offset-based because
 * the rank score changes over time.
 */
export async function fetchFeed(offset = 0): Promise<FeedPost[]> {
  const { data, error } = await supabase.rpc("get_ranked_feed", {
    p_limit: PAGE_SIZE,
    p_offset: offset,
  });
  if (error) return fetchFeedChronological(offset);
  return (data ?? []) as FeedPost[];
}

/** Chronological timeline of posts from accounts the viewer follows. */
export async function fetchFollowingFeed(offset = 0): Promise<FeedPost[]> {
  const { data, error } = await supabase.rpc("get_following_feed", {
    p_limit: PAGE_SIZE,
    p_offset: offset,
  });
  if (error) throw error;
  return (data ?? []) as FeedPost[];
}

async function fetchFeedChronological(offset: number): Promise<FeedPost[]> {
  const { data, error } = await supabase
    .from("feed_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (error) throw error;
  return (data ?? []) as FeedPost[];
}

/** A user's PUBLIC (non-anonymous) posts, newest first. */
export async function fetchUserPosts(
  userId: string,
  beforeCreatedAt?: string,
): Promise<FeedPost[]> {
  let query = supabase
    .from("feed_posts")
    .select("*")
    .eq("author_id", userId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (beforeCreatedAt) query = query.lt("created_at", beforeCreatedAt);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as FeedPost[];
}

/** Aggregate profile (counts, follow state) for a given user. */
export async function fetchPublicProfile(
  userId: string,
): Promise<PublicProfile | null> {
  const { data, error } = await supabase.rpc("get_public_profile", {
    p_user_id: userId,
  });
  if (error) throw error;
  return (data as PublicProfile | null) ?? null;
}

export async function fetchPost(postId: string): Promise<FeedPost | null> {
  const { data, error } = await supabase
    .from("feed_posts")
    .select("*")
    .eq("id", postId)
    .maybeSingle();
  if (error) throw error;
  return (data as FeedPost | null) ?? null;
}

export async function fetchComments(postId: string): Promise<FeedComment[]> {
  const { data, error } = await supabase
    .from("feed_comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FeedComment[];
}

export async function createPost(
  body: string,
  mediaUrls: string[],
  isAnonymous: boolean,
): Promise<string> {
  const { data, error } = await supabase.rpc("create_post", {
    p_body: body,
    p_media_urls: mediaUrls,
    p_is_anonymous: isAnonymous,
  });
  if (error) throw error;
  return data as string;
}

export async function deletePost(postId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_post", { p_post_id: postId });
  if (error) throw error;
}

export async function togglePostLike(
  postId: string,
): Promise<{ liked: boolean; like_count: number }> {
  const { data, error } = await supabase.rpc("toggle_post_like", { p_post_id: postId });
  if (error) throw error;
  return data as { liked: boolean; like_count: number };
}

export async function toggleCommentLike(
  commentId: string,
): Promise<{ liked: boolean; like_count: number }> {
  const { data, error } = await supabase.rpc("toggle_comment_like", { p_comment_id: commentId });
  if (error) throw error;
  return data as { liked: boolean; like_count: number };
}

export async function addComment(
  postId: string,
  body: string,
  isAnonymous: boolean,
  parentCommentId: string | null = null,
): Promise<string> {
  const { data, error } = await supabase.rpc("add_post_comment", {
    p_post_id: postId,
    p_body: body,
    p_is_anonymous: isAnonymous,
    p_parent_comment_id: parentCommentId,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_post_comment", { p_comment_id: commentId });
  if (error) throw error;
}

export async function reportPost(postId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("report_post", { p_post_id: postId, p_reason: reason });
  if (error) throw error;
}

export async function toggleFollow(targetUserId: string): Promise<{ following: boolean }> {
  const { data, error } = await supabase.rpc("toggle_follow", { p_target_user_id: targetUserId });
  if (error) throw error;
  return data as { following: boolean };
}

/**
 * Run uploaded post images through image safety moderation.
 * Fail-open: any error (network / unconfigured provider) resolves to allowed so a
 * provider outage can't block legitimate posts. Flagged content returns allowed:false.
 */
export async function moderatePostMedia(
  imageUrls: string[],
): Promise<{ allowed: boolean; reason?: string }> {
  if (imageUrls.length === 0) return { allowed: true };
  try {
    const { data, error } = await supabase.functions.invoke("moderate-post-media", {
      body: { image_urls: imageUrls },
    });
    if (error) {
      console.warn("moderatePostMedia invoke error:", error.message);
      return { allowed: true };
    }
    return {
      allowed: data?.allowed !== false,
      reason: data?.reason,
    };
  } catch (e: any) {
    console.warn("moderatePostMedia error:", e?.message ?? e);
    return { allowed: true };
  }
}

/** Delete previously-uploaded post images (used when moderation rejects a post). */
export async function deletePostMedia(imageUrls: string[]): Promise<void> {
  const paths = imageUrls
    .map((url) => {
      const marker = "/post-media/";
      const idx = url.indexOf(marker);
      if (idx === -1) return null;
      return url.slice(idx + marker.length).split("?")[0];
    })
    .filter((p): p is string => !!p);
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from("post-media").remove(paths);
  if (error) console.warn("deletePostMedia error:", error.message);
}

/** Upload images to the post-media bucket; returns public URLs. */
export async function uploadPostMedia(uris: string[]): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
  };

  const urls: string[] = [];
  for (let i = 0; i < uris.length; i += 1) {
    const uri = uris[i];
    const extMatch = uri.match(/\.(\w+)(\?|$)/);
    const ext = extMatch?.[1]?.toLowerCase() ?? "jpg";
    const contentType = mimeTypes[ext] ?? "image/jpeg";
    const filePath = `${user.id}/post-${Date.now()}-${i}.${ext}`;
    const resp = await fetch(uri);
    const arrayBuf = await resp.arrayBuffer();
    const { error } = await supabase.storage
      .from("post-media")
      .upload(filePath, arrayBuf, { upsert: true, contentType });
    if (error) throw error;
    const { data } = supabase.storage.from("post-media").getPublicUrl(filePath);
    urls.push(data.publicUrl);
  }
  return urls;
}
