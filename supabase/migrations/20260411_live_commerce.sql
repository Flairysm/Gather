-- ============================================================
-- Live Commerce: product pinning + live auctions + alerts
-- ============================================================

-- ── live_stream_pins ─────────────────────────────────────────
-- One active pin per stream at a time. pin_type determines
-- whether it's a direct-sale listing or a live auction.
create table if not exists live_stream_pins (
  id          uuid primary key default gen_random_uuid(),
  stream_id   uuid not null references live_streams(id) on delete cascade,
  host_id     uuid not null references profiles(id),
  pin_type    text not null check (pin_type in ('listing', 'auction', 'flash')),
  listing_id  uuid references listings(id),
  auction_id  uuid references auction_items(id),
  is_active   boolean not null default true,
  -- Auction-specific fields (null for listings)
  starting_price  numeric,
  current_bid     numeric,
  highest_bidder_id uuid references profiles(id),
  bid_count       integer not null default 0,
  ends_at         timestamptz,
  -- Flash auction inline item data (no linked listing/auction required)
  flash_name       text,
  flash_image_url  text,
  bid_increment    numeric,
  reserve_price    numeric,
  pinned_at   timestamptz not null default now(),
  unpinned_at timestamptz,

  constraint pin_has_item check (
    (pin_type = 'listing' and listing_id is not null) or
    (pin_type = 'auction' and auction_id is not null) or
    (pin_type = 'flash' and flash_name is not null)
  )
);

create index idx_pins_stream_active on live_stream_pins(stream_id) where is_active;
create index idx_pins_host on live_stream_pins(host_id);

-- ── live_stream_alerts ───────────────────────────────────────
-- Ephemeral events pushed to viewers via Realtime.
create table if not exists live_stream_alerts (
  id          uuid primary key default gen_random_uuid(),
  stream_id   uuid not null references live_streams(id) on delete cascade,
  alert_type  text not null check (alert_type in ('purchase', 'bid', 'auction_won', 'pin_changed')),
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index idx_alerts_stream on live_stream_alerts(stream_id, created_at desc);

-- ── live_auction_bids ────────────────────────────────────────
-- Bids placed on live-stream auctions (separate from regular auction_bids).
create table if not exists live_auction_bids (
  id          uuid primary key default gen_random_uuid(),
  pin_id      uuid not null references live_stream_pins(id) on delete cascade,
  stream_id   uuid not null references live_streams(id) on delete cascade,
  bidder_id   uuid not null references profiles(id),
  amount      numeric not null,
  created_at  timestamptz not null default now()
);

create index idx_lab_pin on live_auction_bids(pin_id, amount desc);
create index idx_lab_bidder on live_auction_bids(bidder_id);

-- ── RLS ──────────────────────────────────────────────────────
alter table live_stream_pins enable row level security;
alter table live_stream_alerts enable row level security;
alter table live_auction_bids enable row level security;

-- Pins: public read, host write
create policy "Pins are publicly readable"
  on live_stream_pins for select using (true);

create policy "Host can manage own pins"
  on live_stream_pins for all
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

-- Alerts: public read, server insert via SECURITY DEFINER RPCs
create policy "Alerts are publicly readable"
  on live_stream_alerts for select using (true);

create policy "Authenticated users can insert alerts"
  on live_stream_alerts for insert
  with check (auth.uid() is not null);

-- Live auction bids: public read, authenticated insert
create policy "Live bids are publicly readable"
  on live_auction_bids for select using (true);

create policy "Authenticated users can place live bids"
  on live_auction_bids for insert
  with check (auth.uid() = bidder_id);

-- ── RPC: pin_product ─────────────────────────────────────────
create or replace function pin_product(
  p_stream_id        uuid,
  p_pin_type         text,
  p_listing_id       uuid default null,
  p_auction_id       uuid default null,
  p_starting_price   numeric default null,
  p_duration_seconds integer default 300,
  p_flash_name       text default null,
  p_flash_image_url  text default null,
  p_bid_increment    numeric default null,
  p_reserve_price    numeric default null
) returns uuid
language plpgsql security definer as $$
declare
  v_host_id uuid;
  v_pin_id  uuid;
begin
  select streamer_id into v_host_id
    from live_streams where id = p_stream_id and is_live = true;
  if v_host_id is null or v_host_id != auth.uid() then
    raise exception 'Only the live host can pin products';
  end if;

  -- Deactivate any existing active pin
  update live_stream_pins
    set is_active = false, unpinned_at = now()
    where stream_id = p_stream_id and is_active;

  insert into live_stream_pins (
    stream_id, host_id, pin_type, listing_id, auction_id,
    starting_price, current_bid, ends_at,
    flash_name, flash_image_url, bid_increment, reserve_price
  ) values (
    p_stream_id, v_host_id, p_pin_type, p_listing_id, p_auction_id,
    p_starting_price, p_starting_price,
    case when p_pin_type in ('auction', 'flash')
      then now() + (p_duration_seconds || ' seconds')::interval
      else null end,
    p_flash_name, p_flash_image_url, p_bid_increment, p_reserve_price
  ) returning id into v_pin_id;

  -- Fire alert
  insert into live_stream_alerts (stream_id, alert_type, payload)
  values (p_stream_id, 'pin_changed', jsonb_build_object('pin_id', v_pin_id, 'pin_type', p_pin_type));

  return v_pin_id;
end;
$$;

-- ── RPC: unpin_product ───────────────────────────────────────
create or replace function unpin_product(p_stream_id uuid)
returns void
language plpgsql security definer as $$
declare
  v_host_id uuid;
begin
  select streamer_id into v_host_id
    from live_streams where id = p_stream_id and is_live = true;
  if v_host_id is null or v_host_id != auth.uid() then
    raise exception 'Only the live host can unpin products';
  end if;

  update live_stream_pins
    set is_active = false, unpinned_at = now()
    where stream_id = p_stream_id and is_active;

  insert into live_stream_alerts (stream_id, alert_type, payload)
  values (p_stream_id, 'pin_changed', jsonb_build_object('action', 'unpinned'));
end;
$$;

-- ── RPC: place_live_bid ──────────────────────────────────────
create or replace function place_live_bid(p_pin_id uuid, p_amount numeric)
returns jsonb
language plpgsql security definer as $$
declare
  v_pin      live_stream_pins;
  v_bidder   uuid := auth.uid();
begin
  select * into v_pin from live_stream_pins
    where id = p_pin_id and is_active and pin_type in ('auction', 'flash');
  if v_pin.id is null then
    raise exception 'Auction pin not found or inactive';
  end if;
  if v_pin.ends_at is not null and now() > v_pin.ends_at then
    raise exception 'Auction has ended';
  end if;
  if v_bidder = v_pin.host_id then
    raise exception 'Host cannot bid on own auction';
  end if;
  if p_amount <= coalesce(v_pin.current_bid, 0) then
    raise exception 'Bid must be higher than current bid';
  end if;
  if v_pin.bid_increment is not null and
     p_amount < coalesce(v_pin.current_bid, v_pin.starting_price, 0) + v_pin.bid_increment then
    raise exception 'Bid must be at least RM% higher', v_pin.bid_increment;
  end if;

  insert into live_auction_bids (pin_id, stream_id, bidder_id, amount)
  values (p_pin_id, v_pin.stream_id, v_bidder, p_amount);

  update live_stream_pins
    set current_bid = p_amount,
        highest_bidder_id = v_bidder,
        bid_count = bid_count + 1
    where id = p_pin_id;

  -- Anti-snipe: extend by 15s if bid placed within last 15s
  if v_pin.ends_at is not null and v_pin.ends_at - now() < interval '15 seconds' then
    update live_stream_pins
      set ends_at = ends_at + interval '15 seconds'
      where id = p_pin_id;
  end if;

  insert into live_stream_alerts (stream_id, alert_type, payload)
  values (v_pin.stream_id, 'bid', jsonb_build_object(
    'pin_id', p_pin_id,
    'bidder_id', v_bidder,
    'amount', p_amount,
    'bid_count', v_pin.bid_count + 1
  ));

  return jsonb_build_object(
    'current_bid', p_amount,
    'bid_count', v_pin.bid_count + 1,
    'ends_at', (select ends_at from live_stream_pins where id = p_pin_id)
  );
end;
$$;

-- ── Enable Realtime on new tables ────────────────────────────
alter publication supabase_realtime add table live_stream_pins;
alter publication supabase_realtime add table live_stream_alerts;
alter publication supabase_realtime add table live_auction_bids;

-- ── Adapt auction_wins for flash auction wins ────────────────
alter table auction_wins alter column auction_id drop not null;
alter table auction_wins add column if not exists flash_pin_id uuid references live_stream_pins(id);
alter table auction_wins add constraint auction_or_flash check (
  auction_id is not null or flash_pin_id is not null
);

-- ── Adapt order_items for flash auction orders ───────────────
alter table order_items alter column listing_id drop not null;
alter table order_items add column if not exists flash_pin_id uuid references live_stream_pins(id);
alter table order_items add column if not exists item_name text;
alter table order_items add column if not exists item_image_url text;

-- ── RPC: finalize_expired_flash_auctions ─────────────────────
-- Called by pg_cron every minute. Closes expired live auction
-- pins and creates auction_wins rows for winners.
create or replace function finalize_expired_flash_auctions()
returns integer
language plpgsql security definer set search_path to 'public' as $$
declare
  v_pin live_stream_pins;
  v_count integer := 0;
  v_winner_name text;
begin
  for v_pin in
    select * from live_stream_pins
    where is_active = true
      and pin_type in ('flash', 'auction')
      and ends_at is not null
      and ends_at < now()
    for update skip locked
  loop
    update live_stream_pins
      set is_active = false, unpinned_at = now()
      where id = v_pin.id;

    if v_pin.bid_count > 0 and v_pin.highest_bidder_id is not null then
      if v_pin.reserve_price is not null and coalesce(v_pin.current_bid, 0) < v_pin.reserve_price then
        insert into live_stream_alerts (stream_id, alert_type, payload)
        values (v_pin.stream_id, 'pin_changed', jsonb_build_object(
          'pin_id', v_pin.id, 'action', 'reserve_not_met',
          'flash_name', v_pin.flash_name
        ));
      else
        insert into auction_wins (auction_id, flash_pin_id, winner_id, seller_id, winning_bid, payment_deadline, payment_status)
        values (
          v_pin.auction_id,
          case when v_pin.pin_type = 'flash' then v_pin.id else null end,
          v_pin.highest_bidder_id,
          v_pin.host_id,
          v_pin.current_bid,
          now() + interval '3 days',
          'pending'
        );

        select coalesce(display_name, username, 'Someone') into v_winner_name
          from profiles where id = v_pin.highest_bidder_id;

        insert into live_stream_alerts (stream_id, alert_type, payload)
        values (v_pin.stream_id, 'auction_won', jsonb_build_object(
          'pin_id', v_pin.id,
          'winner_id', v_pin.highest_bidder_id,
          'winner_name', v_winner_name,
          'amount', v_pin.current_bid,
          'flash_name', v_pin.flash_name,
          'flash_image_url', v_pin.flash_image_url
        ));
      end if;
    else
      insert into live_stream_alerts (stream_id, alert_type, payload)
      values (v_pin.stream_id, 'pin_changed', jsonb_build_object(
        'pin_id', v_pin.id, 'action', 'expired_no_bids',
        'flash_name', v_pin.flash_name
      ));
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ── RPC: try_finalize_flash_pin ──────────────────────────────
-- Idempotent client-callable version for instant finalization.
create or replace function try_finalize_flash_pin(p_pin_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_pin live_stream_pins;
  v_winner_name text;
  v_win_id uuid;
begin
  select * into v_pin from live_stream_pins
    where id = p_pin_id for update skip locked;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_pin.is_active = false then
    return jsonb_build_object('status', 'already_finalized');
  end if;

  if v_pin.ends_at is null or v_pin.ends_at > now() then
    return jsonb_build_object('status', 'not_expired');
  end if;

  update live_stream_pins
    set is_active = false, unpinned_at = now()
    where id = v_pin.id;

  if v_pin.bid_count > 0 and v_pin.highest_bidder_id is not null then
    if v_pin.reserve_price is not null and coalesce(v_pin.current_bid, 0) < v_pin.reserve_price then
      insert into live_stream_alerts (stream_id, alert_type, payload)
      values (v_pin.stream_id, 'pin_changed', jsonb_build_object(
        'pin_id', v_pin.id, 'action', 'reserve_not_met',
        'flash_name', v_pin.flash_name
      ));
      return jsonb_build_object('status', 'reserve_not_met');
    end if;

    insert into auction_wins (auction_id, flash_pin_id, winner_id, seller_id, winning_bid, payment_deadline, payment_status)
    values (
      v_pin.auction_id,
      case when v_pin.pin_type = 'flash' then v_pin.id else null end,
      v_pin.highest_bidder_id,
      v_pin.host_id,
      v_pin.current_bid,
      now() + interval '3 days',
      'pending'
    ) returning id into v_win_id;

    select coalesce(display_name, username, 'Someone') into v_winner_name
      from profiles where id = v_pin.highest_bidder_id;

    insert into live_stream_alerts (stream_id, alert_type, payload)
    values (v_pin.stream_id, 'auction_won', jsonb_build_object(
      'pin_id', v_pin.id,
      'winner_id', v_pin.highest_bidder_id,
      'winner_name', v_winner_name,
      'amount', v_pin.current_bid,
      'flash_name', v_pin.flash_name,
      'flash_image_url', v_pin.flash_image_url,
      'win_id', v_win_id
    ));

    return jsonb_build_object('status', 'won', 'winner_id', v_pin.highest_bidder_id, 'win_id', v_win_id);
  else
    insert into live_stream_alerts (stream_id, alert_type, payload)
    values (v_pin.stream_id, 'pin_changed', jsonb_build_object(
      'pin_id', v_pin.id, 'action', 'expired_no_bids'
    ));
    return jsonb_build_object('status', 'no_bids');
  end if;
end;
$$;

-- ── Updated pay_auction_win to handle flash wins ─────────────
create or replace function pay_auction_win(p_win_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_win auction_wins%rowtype;
  v_order_id uuid;
  v_flash_pin live_stream_pins;
  v_item_name text;
  v_item_image text;
begin
  select * into v_win from auction_wins where id = p_win_id for update;
  if not found then raise exception 'Win record not found'; end if;
  if auth.uid() <> v_win.winner_id then raise exception 'Not your win'; end if;
  if v_win.payment_status <> 'pending' then raise exception 'Win is already %', v_win.payment_status; end if;
  if v_win.payment_deadline < now() then raise exception 'Payment deadline has passed'; end if;

  update auction_wins set payment_status = 'paid', paid_at = now() where id = p_win_id;

  insert into orders (buyer_id, total)
  values (v_win.winner_id, v_win.winning_bid)
  returning id into v_order_id;

  if v_win.flash_pin_id is not null then
    select * into v_flash_pin from live_stream_pins where id = v_win.flash_pin_id;
    v_item_name := coalesce(v_flash_pin.flash_name, 'Flash Auction Item');
    v_item_image := v_flash_pin.flash_image_url;

    insert into order_items (order_id, listing_id, flash_pin_id, seller_id, quantity, unit_price, fulfillment_status, item_name, item_image_url)
    values (v_order_id, null, v_win.flash_pin_id, v_win.seller_id, 1, v_win.winning_bid, 'confirmed', v_item_name, v_item_image);
  else
    insert into order_items (order_id, listing_id, seller_id, quantity, unit_price, fulfillment_status)
    values (v_order_id, v_win.auction_id, v_win.seller_id, 1, v_win.winning_bid, 'confirmed');
  end if;

  insert into audit_log (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'auction_payment', 'auction_win', p_win_id,
    jsonb_build_object('auction_id', v_win.auction_id, 'flash_pin_id', v_win.flash_pin_id, 'amount', v_win.winning_bid, 'order_id', v_order_id));

  return jsonb_build_object(
    'win_id', p_win_id,
    'payment_status', 'paid',
    'paid_at', now(),
    'order_id', v_order_id
  );
end;
$$;

-- ── pg_cron: finalize expired flash auctions every minute ────
select cron.schedule(
  'finalize-flash-auctions',
  '* * * * *',
  $$select finalize_expired_flash_auctions()$$
);
