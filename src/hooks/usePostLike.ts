import { useCallback, useRef } from "react";

import { togglePostLike, type FeedPost } from "../data/feed";

type Patch = (id: string, patch: Partial<FeedPost>) => void;

/**
 * Centralized "like" handler that keeps the UI and the database in sync.
 *
 * The bug it fixes: tapping a heart quickly used to fire several
 * `toggle_post_like` RPCs back-to-back. Because each tap read a stale copy of
 * the post from its render closure and nothing serialized the requests, the
 * responses could land out of order — leaving the row liked on screen but
 * unliked in the DB (or vice-versa). On the next refresh the like silently
 * "disappeared".
 *
 * Here we allow at most one in-flight request per post: while a toggle is
 * pending, further taps on the same post are ignored. That guarantees the DB
 * ends in exactly the state the user last saw, so refreshes stay consistent.
 */
export function usePostLike(patch: Patch) {
  const inFlight = useRef<Set<string>>(new Set());

  return useCallback(
    async (post: FeedPost) => {
      if (inFlight.current.has(post.id)) return;
      inFlight.current.add(post.id);

      const wasLiked = post.liked_by_me;
      const prevCount = post.like_count;

      // Optimistic update.
      patch(post.id, {
        liked_by_me: !wasLiked,
        like_count: Math.max(prevCount + (wasLiked ? -1 : 1), 0),
      });

      try {
        const res = await togglePostLike(post.id);
        // Server is authoritative for both flag and count.
        patch(post.id, { liked_by_me: res.liked, like_count: res.like_count });
      } catch {
        // Roll back to the pre-tap state.
        patch(post.id, { liked_by_me: wasLiked, like_count: prevCount });
      } finally {
        inFlight.current.delete(post.id);
      }
    },
    [patch],
  );
}
