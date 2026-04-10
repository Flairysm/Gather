import { supabase } from "../lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ── Types ──

export type OfferStatus = "pending" | "accepted" | "declined" | "countered" | "withdrawn";

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
  listingId: string | null;
  listingImage: string | null;
  listingPrice: number | null;
};

export type ImageMessage = BaseMessage & {
  kind: "image";
  mediaUrls: string[];
  text: string;
};

export type ListingShareMessage = BaseMessage & {
  kind: "listing_share";
  sharedListing: {
    id: string;
    card_name: string;
    price: number;
    image: string | null;
  };
};

export type Message = TextMessage | OfferMessage | ImageMessage | ListingShareMessage;

export type Conversation = {
  id: string;
  participantIds: string[];
  otherUser: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    storeName: string | null;
    storeLogo: string | null;
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
    const offerListing = row._offer_listing ?? null;
    return {
      ...base,
      kind: "offer",
      amount: `RM${Number(row.offer_amount).toLocaleString("en-MY", { maximumFractionDigits: 0 })}`,
      cardName: row.offer_card_name ?? "Card",
      status: row.offer_status ?? "pending",
      listingId: row.offer_listing_id ?? null,
      listingImage: offerListing ? getFirstImage(offerListing.images) : null,
      listingPrice: offerListing ? Number(offerListing.price) : null,
    };
  }

  if (row.kind === "image") {
    const urls: string[] = Array.isArray(row.media_urls) ? row.media_urls : [];
    return { ...base, kind: "image", mediaUrls: urls, text: row.text ?? "" };
  }

  if (row.kind === "listing_share" && row._shared_listing) {
    return {
      ...base,
      kind: "listing_share",
      sharedListing: {
        id: row._shared_listing.id,
        card_name: row._shared_listing.card_name,
        price: Number(row._shared_listing.price),
        image: getFirstImage(row._shared_listing.images),
      },
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

  const [metaResult, readResult] = await Promise.all([
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
  if (metaResult.error) console.warn("loadConversations meta error:", metaResult.error.message);
  if (readResult.error) console.warn("loadConversations reads error:", readResult.error.message);
  const metaRows = metaResult.data;
  const readRows = readResult.data;

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
  let storeMap: Record<string, any> = {};
  if (otherIds.length > 0) {
    const [{ data: profiles }, { data: stores }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", otherIds),
      supabase
        .from("vendor_stores")
        .select("profile_id, store_name, logo_url")
        .in("profile_id", otherIds),
    ]);

    if (profiles) {
      for (const p of profiles) {
        profileMap[p.id] = p;
      }
    }
    if (stores) {
      for (const s of stores) {
        storeMap[(s as any).profile_id] = s;
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
    const store = otherId ? storeMap[otherId] : null;

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
        storeName: store?.store_name ?? null,
        storeLogo: store?.logo_url ?? null,
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
  _listingId?: string,
  topic?: string,
): Promise<string> {
  const sorted = [myId, otherId].sort();

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      participant_ids: sorted,
      listing_id: _listingId ?? null,
      topic: topic ?? null,
    })
    .select("id")
    .single();

  if (created) {
    return created.id;
  }

  if (error && error.code !== "23505") throw error;

  const { data: existing, error: selErr } = await supabase
    .from("conversations")
    .select("id")
    .contains("participant_ids", sorted)
    .limit(1)
    .single();

  if (selErr) throw selErr;

  const { error: metaErr } = await supabase.from("conversation_user_meta").upsert(
    {
      user_id: myId,
      conversation_id: existing.id,
      is_hidden: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,conversation_id" },
  );
  if (metaErr) console.warn("conversation_user_meta upsert error:", metaErr.message);

  return existing.id;
}

// ── Message queries ──

export async function loadMessages(
  conversationId: string,
  myId: string,
): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, kind, text, offer_amount, offer_card_name, offer_status, offer_listing_id, media_urls, shared_listing_id, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) throw error;

  const allListingIds = [
    ...new Set(
      (data ?? [])
        .map((r: any) => r.shared_listing_id ?? r.offer_listing_id)
        .filter((id: any): id is string => !!id),
    ),
  ];

  let listingMap: Record<string, any> = {};
  if (allListingIds.length > 0) {
    const { data: listings } = await supabase
      .from("listings")
      .select("id, card_name, price, images")
      .in("id", allListingIds);
    for (const l of listings ?? []) listingMap[l.id] = l;
  }

  return (data ?? []).map((row: any) => {
    if (row.kind === "listing_share" && row.shared_listing_id) {
      row._shared_listing = listingMap[row.shared_listing_id] ?? null;
    }
    if (row.kind === "offer" && row.offer_listing_id) {
      row._offer_listing = listingMap[row.offer_listing_id] ?? null;
    }
    return dbRowToMessage(row, myId);
  });
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

  const { error: convErr } = await supabase
    .from("conversations")
    .update({
      last_message_text: text,
      last_message_at: new Date().toISOString(),
      last_sender_id: senderId,
    })
    .eq("id", conversationId);
  if (convErr) console.warn("conversation update error:", convErr.message);
}

export async function sendOfferMessage(
  conversationId: string,
  senderId: string,
  amount: number,
  cardName: string,
  listingId?: string,
): Promise<void> {
  const { error: msgErr } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    kind: "offer",
    offer_amount: amount,
    offer_card_name: cardName,
    offer_status: "pending",
    offer_listing_id: listingId ?? null,
  });
  if (msgErr) throw msgErr;

  const { error: convErr } = await supabase
    .from("conversations")
    .update({
      last_message_text: `Offer: RM${amount.toLocaleString("en-MY", { maximumFractionDigits: 0 })}`,
      last_message_at: new Date().toISOString(),
      last_sender_id: senderId,
    })
    .eq("id", conversationId);
  if (convErr) console.warn("conversation update error:", convErr.message);
}

export async function sendImageMessage(
  conversationId: string,
  senderId: string,
  mediaUrls: string[],
  caption?: string,
): Promise<void> {
  const text = caption?.trim() || "";
  const { error: msgErr } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    kind: "image",
    text,
    media_urls: mediaUrls,
  });
  if (msgErr) throw msgErr;

  const { error: convErr } = await supabase
    .from("conversations")
    .update({
      last_message_text: text || (mediaUrls.length > 1 ? `Sent ${mediaUrls.length} photos` : "Sent a photo"),
      last_message_at: new Date().toISOString(),
      last_sender_id: senderId,
    })
    .eq("id", conversationId);
  if (convErr) console.warn("conversation update error:", convErr.message);
}

export async function sendListingShareMessage(
  conversationId: string,
  senderId: string,
  listingId: string,
): Promise<void> {
  const { error: msgErr } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    kind: "listing_share",
    shared_listing_id: listingId,
  });
  if (msgErr) throw msgErr;

  const { error: convErr } = await supabase
    .from("conversations")
    .update({
      last_message_text: "Shared a listing",
      last_message_at: new Date().toISOString(),
      last_sender_id: senderId,
    })
    .eq("id", conversationId);
  if (convErr) console.warn("conversation update error:", convErr.message);
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

export async function updateOfferAmount(
  messageId: string,
  newAmount: number,
): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .update({ offer_amount: newAmount })
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
      async (payload) => {
        const row = payload.new as any;
        const listingId = row.offer_listing_id ?? row.shared_listing_id;

        if ((row.kind === "offer" || row.kind === "listing_share") && listingId) {
          const { data: listing } = await supabase
            .from("listings")
            .select("id, card_name, price, images")
            .eq("id", listingId)
            .maybeSingle();

          if (listing) {
            if (row.kind === "offer") row._offer_listing = listing;
            if (row.kind === "listing_share") row._shared_listing = listing;
          }
        }

        onNewMessage(dbRowToMessage(row, myId));
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

