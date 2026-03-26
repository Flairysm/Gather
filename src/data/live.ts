import { supabase } from "../lib/supabase";

export type LiveStream = {
  id: string;
  streamer_id: string;
  title: string;
  category: string;
  tags: string[];
  description: string | null;
  viewer_count: number;
  like_count: number;
  share_count: number;
  is_live: boolean;
  thumbnail_url: string | null;
  started_at: string;
  ended_at: string | null;
  streamer?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

export type ChatMessage = {
  id: string;
  stream_id: string;
  user_id: string;
  message: string;
  created_at: string;
  user?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

const STREAM_SELECT = `
  id, streamer_id, title, category, tags, description,
  viewer_count, like_count, share_count, is_live,
  thumbnail_url, started_at, ended_at,
  streamer:profiles!streamer_id(username, display_name, avatar_url)
`;

export async function fetchLiveStreams(): Promise<LiveStream[]> {
  const { data } = await supabase
    .from("live_streams")
    .select(STREAM_SELECT)
    .eq("is_live", true)
    .order("viewer_count", { ascending: false })
    .limit(50);

  return (data ?? []).map((r: any) => ({
    ...r,
    streamer: Array.isArray(r.streamer) ? r.streamer[0] : r.streamer,
  }));
}

export async function fetchStream(streamId: string): Promise<LiveStream | null> {
  const { data } = await supabase
    .from("live_streams")
    .select(STREAM_SELECT)
    .eq("id", streamId)
    .maybeSingle();

  if (!data) return null;
  return {
    ...(data as any),
    streamer: Array.isArray((data as any).streamer)
      ? (data as any).streamer[0]
      : (data as any).streamer,
  };
}

export async function fetchRecentChats(streamId: string, limit = 100): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from("live_chat_messages")
    .select("id, stream_id, user_id, message, created_at, user:profiles!user_id(username, display_name, avatar_url)")
    .eq("stream_id", streamId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as any[])
    .map((r) => ({
      ...r,
      user: Array.isArray(r.user) ? r.user[0] : r.user,
    }))
    .reverse();
}

export async function sendChatMessage(streamId: string, message: string): Promise<void> {
  const { error } = await supabase
    .from("live_chat_messages")
    .insert({ stream_id: streamId, user_id: (await supabase.auth.getUser()).data.user!.id, message });
  if (error) throw new Error(error.message);
}

export function subscribeLiveChat(
  streamId: string,
  onMessage: (msg: ChatMessage) => void,
) {
  return supabase
    .channel(`live-chat-${streamId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "live_chat_messages", filter: `stream_id=eq.${streamId}` },
      async (payload) => {
        const row = payload.new as any;
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, display_name, avatar_url")
          .eq("id", row.user_id)
          .maybeSingle();
        onMessage({ ...row, user: profile });
      },
    )
    .subscribe();
}

export async function joinStream(streamId: string): Promise<number> {
  const { data, error } = await supabase.rpc("join_live_stream", { p_stream_id: streamId });
  if (error) throw new Error(error.message);
  return (data as any)?.viewer_count ?? 0;
}

export async function leaveStream(streamId: string): Promise<void> {
  try {
    await supabase.rpc("leave_live_stream", { p_stream_id: streamId });
  } catch {
    // best-effort cleanup — don't throw if already left or stream ended
  }
}

export async function endStream(streamId: string): Promise<void> {
  const { error } = await supabase.rpc("end_live", { p_stream_id: streamId });
  if (error) throw new Error(error.message);
}

export async function toggleLike(streamId: string): Promise<{ liked: boolean; like_count: number }> {
  const { data, error } = await supabase.rpc("toggle_live_like", { p_stream_id: streamId });
  if (error) throw new Error(error.message);
  return data as any;
}

export function subscribeLiveStream(
  streamId: string,
  onUpdate: (stream: Partial<LiveStream>) => void,
) {
  return supabase
    .channel(`live-stream-${streamId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "live_streams", filter: `id=eq.${streamId}` },
      (payload) => {
        onUpdate(payload.new as Partial<LiveStream>);
      },
    )
    .subscribe();
}
