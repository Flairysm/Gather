import { supabase } from "../lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ── Types ──

export type OfferStatus = "pending" | "accepted" | "declined" | "countered";

export type BaseMessage = {
  id: string;
  senderId: string;
  timestamp: string;
  isMe: boolean;
};

export type TextMessage = BaseMessage & {
  kind: "text";
  text: string;
};

export type OfferMessage = BaseMessage & {
  kind: "offer";
  amount: string;
  cardName: string;
  status: OfferStatus;
};

export type Message = TextMessage | OfferMessage;

export type Conversation = {
  id: string;
  participantIds: string[];
  otherUser: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
  topic: string | null;
  listingId: string | null;
  listingImage: string | null;
  wantedId: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastSenderId: string | null;
  createdAt: string;
  isFavorite: boolean;
  isUnread: boolean;
};

// ── Helpers ──

export function formatTimestamp(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(isoStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatMessageTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getFirstImage(value: unknown): string | null {
  if (Array.isArray(value)) {
    const first = value.find((v) => typeof v === "string" && !!v);
    return typeof first === "string" ? first : null;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        const first = parsed.find((v) => typeof v === "string" && !!v);
        return typeof first === "string" ? first : null;
      }
    } catch {
      // no-op
    }
  }
  return null;
}

function dbRowToMessage(row: any, myId: string): Message {
  const base: BaseMessage = {
    id: row.id,
    senderId: row.sender_id,
    timestamp: formatMessageTime(row.created_at),
    isMe: row.sender_id === myId,
  };

  if (row.kind === "offer") {
    return {
      ...base,
      kind: "offer",
      amount: `RM${Number(row.offer_amount).toLocaleString("en-MY", { maximumFractionDigits: 0 })}`,
      cardName: row.offer_card_name ?? "Card",
      status: row.offer_status ?? "pending",
    };
  }

  return { ...base, kind: "text", text: row.text ?? "" };
}

// ── Conversation queries ──

export async function loadConversations(
  userId: string,
): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, participant_ids, listing_id, wanted_id, topic, last_message_text, last_message_at, last_sender_id, created_at")
    .contains("participant_ids", [userId])
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const conversationIds = data.map((c: any) => c.id);

  const [{ data: metaRows }, { data: readRows }] = await Promise.all([
    supabase
      .from("conversation_user_meta")
      .select("conversation_id, is_favorite, is_hidden")
      .eq("user_id", userId)
      .in("conversation_id", conversationIds),
    supabase
      .from("conversation_reads")
      .select("conversation_id, last_read_at")
      .eq("user_id", userId)
      .in("conversation_id", conversationIds),
  ]);

  const metaMap = new Map<string, { is_favorite: boolean; is_hidden: boolean }>();
  for (const row of metaRows ?? []) {
    metaMap.set((row as any).conversation_id, {
      is_favorite: !!(row as any).is_favorite,
      is_hidden: !!(row as any).is_hidden,
    });
  }

  const readMap = new Map<string, string>();
  for (const row of readRows ?? []) {
    readMap.set((row as any).conversation_id, (row as any).last_read_at);
  }

  const otherIds = [
    ...new Set(
      data.flatMap((c: any) =>
        (c.participant_ids as string[]).filter((pid: string) => pid !== userId),
      ),
    ),
  ];

  let profileMap: Record<string, any> = {};
  if (otherIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", otherIds);

    if (profiles) {
      for (const p of profiles) {
        profileMap[p.id] = p;
      }
    }
  }

  const listingIds = [
    ...new Set(
      data
        .map((c: any) => c.listing_id)
        .filter((id: any): id is string => !!id),
    ),
  ];

  let listingImageMap: Record<string, string> = {};
  if (listingIds.length > 0) {
    const { data: listings } = await supabase
      .from("listings")
      .select("id, images")
      .in("id", listingIds);

    if (listings) {
      for (const l of listings) {
        const first = getFirstImage((l as any).images);
        if (first) listingImageMap[l.id] = first;
      }
    }
  }

  return data
    .filter((c: any) => !metaMap.get(c.id)?.is_hidden)
    .map((c: any) => {
    const otherId = (c.participant_ids as string[]).find(
      (pid: string) => pid !== userId,
    );
    const profile = otherId ? profileMap[otherId] : null;

    const lastReadAt = readMap.get(c.id);
    const fromOther = c.last_sender_id && c.last_sender_id !== userId;
    const isUnread = !!(
      fromOther &&
      c.last_message_at &&
      (!lastReadAt || new Date(lastReadAt).getTime() < new Date(c.last_message_at).getTime())
    );

    return {
      id: c.id,
      participantIds: c.participant_ids,
      otherUser: {
        id: otherId ?? "",
        username: profile?.username ?? null,
        displayName: profile?.display_name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
      },
      topic: c.topic,
      listingId: c.listing_id,
      listingImage: c.listing_id
        ? listingImageMap[c.listing_id] ?? null
        : null,
      wantedId: c.wanted_id,
      lastMessage: c.last_message_text,
      lastMessageAt: c.last_message_at,
      lastSenderId: c.last_sender_id ?? null,
      createdAt: c.created_at,
      isFavorite: metaMap.get(c.id)?.is_favorite ?? false,
      isUnread,
    } satisfies Conversation;
  })
    .sort((a, b) => {
      const fa = a.isFavorite ? 1 : 0;
      const fb = b.isFavorite ? 1 : 0;
      if (fa !== fb) return fb - fa;
      return new Date(b.lastMessageAt ?? b.createdAt).getTime() - new Date(a.lastMessageAt ?? a.createdAt).getTime();
    });
}

export async function setConversationFavorite(
  userId: string,
  conversationId: string,
  isFavorite: boolean,
): Promise<void> {
  const { error } = await supabase.from("conversation_user_meta").upsert(
    {
      user_id: userId,
      conversation_id: conversationId,
      is_favorite: isFavorite,
      is_hidden: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,conversation_id" },
  );
  if (error) throw error;
}

export async function hideConversationForUser(
  userId: string,
  conversationId: string,
): Promise<void> {
  const { error } = await supabase.from("conversation_user_meta").upsert(
    {
      user_id: userId,
      conversation_id: conversationId,
      is_hidden: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,conversation_id" },
  );
  if (error) throw error;
}

export async function findOrCreateConversation(
  myId: string,
  otherId: string,
  listingId?: string,
  topic?: string,
): Promise<string> {
  let query = supabase
    .from("conversations")
    .select("id")
    .contains("participant_ids", [myId, otherId]);

  if (listingId) {
    query = query.eq("listing_id", listingId);
  }

  const { data: existing } = await query.limit(1).maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      participant_ids: [myId, otherId],
      listing_id: listingId ?? null,
      topic: topic ?? null,
    })
    .select("id")
    .single();

  if (error) throw error;
  return created.id;
}

// ── Message queries ──

export async function loadMessages(
  conversationId: string,
  myId: string,
): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, kind, text, offer_amount, offer_card_name, offer_status, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) throw error;
  return (data ?? []).map((row: any) => dbRowToMessage(row, myId));
}

export async function sendTextMessage(
  conversationId: string,
  senderId: string,
  text: string,
): Promise<void> {
  const { error: msgErr } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    kind: "text",
    text,
  });
  if (msgErr) throw msgErr;

  await supabase
    .from("conversations")
    .update({
      last_message_text: text,
      last_message_at: new Date().toISOString(),
      last_sender_id: senderId,
    })
    .eq("id", conversationId);
}

export async function sendOfferMessage(
  conversationId: string,
  senderId: string,
  amount: number,
  cardName: string,
): Promise<void> {
  const { error: msgErr } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    kind: "offer",
    offer_amount: amount,
    offer_card_name: cardName,
    offer_status: "pending",
  });
  if (msgErr) throw msgErr;

  await supabase
    .from("conversations")
    .update({
      last_message_text: `Offer: RM${amount.toLocaleString("en-MY", { maximumFractionDigits: 0 })}`,
      last_message_at: new Date().toISOString(),
      last_sender_id: senderId,
    })
    .eq("id", conversationId);
}

export async function markConversationRead(
  conversationId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from("conversation_reads").upsert(
    {
      user_id: userId,
      conversation_id: conversationId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "user_id,conversation_id" },
  );
  if (error) throw error;
}

export async function countUnreadConversations(userId: string): Promise<number> {
  const { data: conversations, error } = await supabase
    .from("conversations")
    .select("id, last_message_at, last_sender_id")
    .contains("participant_ids", [userId])
    .not("last_message_at", "is", null)
    .neq("last_sender_id", userId)
    .limit(500);

  if (error || !conversations || conversations.length === 0) return 0;

  const conversationIds = conversations.map((c: any) => c.id);
  const { data: readRows } = await supabase
    .from("conversation_reads")
    .select("conversation_id, last_read_at")
    .eq("user_id", userId)
    .in("conversation_id", conversationIds);

  const readMap = new Map<string, string>();
  for (const row of readRows ?? []) {
    readMap.set((row as any).conversation_id, (row as any).last_read_at);
  }

  let unread = 0;
  for (const c of conversations as any[]) {
    const lastReadAt = readMap.get(c.id);
    if (!lastReadAt || new Date(lastReadAt).getTime() < new Date(c.last_message_at).getTime()) {
      unread += 1;
    }
  }

  return unread;
}

export async function updateOfferStatus(
  messageId: string,
  newStatus: OfferStatus,
): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .update({ offer_status: newStatus })
    .eq("id", messageId);
  if (error) throw error;
}

// ── Realtime subscriptions ──

export function subscribeToConversations(
  userId: string,
  onUpdate: () => void,
): RealtimeChannel {
  return supabase
    .channel(`conversations:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "conversations" },
      (payload) => {
        const row = (payload.new ?? payload.old) as any;
        if (
          row?.participant_ids &&
          (row.participant_ids as string[]).includes(userId)
        ) {
          onUpdate();
        }
      },
    )
    .subscribe();
}

export function subscribeToMessages(
  conversationId: string,
  myId: string,
  onNewMessage: (msg: Message) => void,
  onMessageUpdate: (msg: Message) => void,
): RealtimeChannel {
  return supabase
    .channel(`messages:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        onNewMessage(dbRowToMessage(payload.new, myId));
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        onMessageUpdate(dbRowToMessage(payload.new, myId));
      },
    )
    .subscribe();
}

export { formatTimestamp };
