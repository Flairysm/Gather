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
  createdAt: string;
};

// ── Helpers ──

function formatTimestamp(isoStr: string): string {
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
      amount: `$${Number(row.offer_amount).toLocaleString()}`,
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
    .select("*")
    .contains("participant_ids", [userId])
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) throw error;
  if (!data || data.length === 0) return [];

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

  return data.map((c: any) => {
    const otherId = (c.participant_ids as string[]).find(
      (pid: string) => pid !== userId,
    );
    const profile = otherId ? profileMap[otherId] : null;

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
      createdAt: c.created_at,
    } satisfies Conversation;
  });
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
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

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
      last_message_text: `Offer: $${amount.toLocaleString()}`,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversationId);
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
