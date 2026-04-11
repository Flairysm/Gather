import { supabase } from "../lib/supabase";

// ── Types ────────────────────────────────────────────────────

export type PinType = "listing" | "auction" | "flash";

export type LiveStreamPin = {
  id: string;
  stream_id: string;
  host_id: string;
  pin_type: PinType;
  listing_id: string | null;
  auction_id: string | null;
  is_active: boolean;
  starting_price: number | null;
  current_bid: number | null;
  highest_bidder_id: string | null;
  bid_count: number;
  ends_at: string | null;
  flash_name: string | null;
  flash_image_url: string | null;
  bid_increment: number | null;
  reserve_price: number | null;
  pinned_at: string;
  unpinned_at: string | null;
  // Joined data
  listing?: {
    card_name: string;
    price: number;
    images: string[];
    category: string;
  } | null;
  auction_item?: {
    card_name: string;
    images: string[];
    category: string;
  } | null;
  highest_bidder?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

export type LiveStreamAlert = {
  id: string;
  stream_id: string;
  alert_type: "purchase" | "bid" | "auction_won" | "pin_changed";
  payload: Record<string, unknown>;
  created_at: string;
};

export type LiveAuctionBid = {
  id: string;
  pin_id: string;
  stream_id: string;
  bidder_id: string;
  amount: number;
  created_at: string;
  bidder?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

// ── Selects ──────────────────────────────────────────────────

const PIN_SELECT = `
  id, stream_id, host_id, pin_type, listing_id, auction_id,
  is_active, starting_price, current_bid, highest_bidder_id,
  bid_count, ends_at, pinned_at, unpinned_at,
  flash_name, flash_image_url, bid_increment, reserve_price,
  listing:listings!listing_id(card_name, price, images, category),
  auction_item:auction_items!auction_id(card_name, images, category),
  highest_bidder:profiles!highest_bidder_id(username, display_name, avatar_url)
`;

const BID_SELECT = `
  id, pin_id, stream_id, bidder_id, amount, created_at,
  bidder:profiles!bidder_id(username, display_name, avatar_url)
`;

// ── Helpers: flatten Supabase joins ──────────────────────────

function flattenPin(r: any): LiveStreamPin {
  return {
    ...r,
    listing: Array.isArray(r.listing) ? r.listing[0] ?? null : r.listing,
    auction_item: Array.isArray(r.auction_item) ? r.auction_item[0] ?? null : r.auction_item,
    highest_bidder: Array.isArray(r.highest_bidder) ? r.highest_bidder[0] ?? null : r.highest_bidder,
  };
}

function flattenBid(r: any): LiveAuctionBid {
  return { ...r, bidder: Array.isArray(r.bidder) ? r.bidder[0] ?? null : r.bidder };
}

// ── Fetch ────────────────────────────────────────────────────

export async function fetchActivePin(streamId: string): Promise<LiveStreamPin | null> {
  const { data } = await supabase
    .from("live_stream_pins")
    .select(PIN_SELECT)
    .eq("stream_id", streamId)
    .eq("is_active", true)
    .maybeSingle();
  return data ? flattenPin(data) : null;
}

export async function fetchPinBids(pinId: string, limit = 50): Promise<LiveAuctionBid[]> {
  const { data } = await supabase
    .from("live_auction_bids")
    .select(BID_SELECT)
    .eq("pin_id", pinId)
    .order("amount", { ascending: false })
    .limit(limit);
  return (data ?? []).map(flattenBid);
}

export async function fetchRecentAlerts(streamId: string, limit = 20): Promise<LiveStreamAlert[]> {
  const { data } = await supabase
    .from("live_stream_alerts")
    .select("*")
    .eq("stream_id", streamId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as LiveStreamAlert[];
}

// ── Mutations ────────────────────────────────────────────────

export async function pinProduct(opts: {
  streamId: string;
  pinType: PinType;
  listingId?: string;
  auctionId?: string;
  startingPrice?: number;
  durationSeconds?: number;
  flashName?: string;
  flashImageUrl?: string;
  bidIncrement?: number;
  reservePrice?: number;
}): Promise<string> {
  const { data, error } = await supabase.rpc("pin_product", {
    p_stream_id: opts.streamId,
    p_pin_type: opts.pinType,
    p_listing_id: opts.listingId ?? null,
    p_auction_id: opts.auctionId ?? null,
    p_starting_price: opts.startingPrice ?? null,
    p_duration_seconds: opts.durationSeconds ?? 300,
    p_flash_name: opts.flashName ?? null,
    p_flash_image_url: opts.flashImageUrl ?? null,
    p_bid_increment: opts.bidIncrement ?? null,
    p_reserve_price: opts.reservePrice ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function tryFinalizeFlashPin(pinId: string): Promise<{
  status: string;
  winner_id?: string;
  win_id?: string;
}> {
  const { data, error } = await supabase.rpc("try_finalize_flash_pin", {
    p_pin_id: pinId,
  });
  if (error) throw new Error(error.message);
  return data as any;
}

export async function unpinProduct(streamId: string): Promise<void> {
  const { error } = await supabase.rpc("unpin_product", { p_stream_id: streamId });
  if (error) throw new Error(error.message);
}

export async function placeLiveBid(pinId: string, amount: number): Promise<{
  current_bid: number;
  bid_count: number;
  ends_at: string | null;
}> {
  const { data, error } = await supabase.rpc("place_live_bid", {
    p_pin_id: pinId,
    p_amount: amount,
  });
  if (error) throw new Error(error.message);
  return data as any;
}

// ── Realtime subscriptions ───────────────────────────────────

export function subscribePinUpdates(
  streamId: string,
  onUpdate: (pin: Partial<LiveStreamPin>) => void,
) {
  return supabase
    .channel(`live-pin-${streamId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "live_stream_pins", filter: `stream_id=eq.${streamId}` },
      (payload) => onUpdate(payload.new as Partial<LiveStreamPin>),
    )
    .subscribe();
}

export function subscribeAlerts(
  streamId: string,
  onAlert: (alert: LiveStreamAlert) => void,
) {
  return supabase
    .channel(`live-alerts-${streamId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "live_stream_alerts", filter: `stream_id=eq.${streamId}` },
      (payload) => onAlert(payload.new as LiveStreamAlert),
    )
    .subscribe();
}

export function subscribeLiveBids(
  pinId: string,
  onBid: (bid: LiveAuctionBid) => void,
) {
  return supabase
    .channel(`live-bids-${pinId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "live_auction_bids", filter: `pin_id=eq.${pinId}` },
      async (payload) => {
        const row = payload.new as any;
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, display_name, avatar_url")
          .eq("id", row.bidder_id)
          .maybeSingle();
        onBid({ ...row, bidder: profile });
      },
    )
    .subscribe();
}

// ── Host helpers: fetch own listings for pinning ─────────────

export async function fetchHostListings(hostId: string) {
  const { data } = await supabase
    .from("listings")
    .select("id, card_name, price, images, category, quantity, status")
    .eq("seller_id", hostId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function fetchHostAuctions(hostId: string) {
  const { data } = await supabase
    .from("auction_items")
    .select("id, card_name, starting_price, current_bid, images, category, status, ends_at")
    .eq("seller_id", hostId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}
