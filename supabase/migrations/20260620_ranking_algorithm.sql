-- ============================================================================
-- Ranking algorithm for Home (vendors), Market (listings + wanted), Auctions.
-- Mirrors the proven feed-ranking approach: engagement / time-decay * quality,
-- with optional category personalization (viewer's profiles.feed_categories)
-- and admin hard-pinned slots for the Home vendor carousel.
--
-- All ranked-list functions are SECURITY DEFINER so they can read aggregate
-- signals (order_items / saved_items / disputes) that are RLS-restricted for
-- normal callers. They only ever expose public-facing fields of active rows.
-- ============================================================================

-- ── Admin override: hard-pinned slot for a vendor on the Home carousel ──────
alter table public.vendor_stores
  add column if not exists pinned_position smallint;

comment on column public.vendor_stores.pinned_position is
  'Admin hard-pin: when set, this store locks to this 1-based slot on the Home carousel. NULL = auto-ranked by vendor score.';

-- ── Seller quality multiplier (0.8 .. 1.2) ──────────────────────────────────
-- Bayesian average rating shrunk toward a 4.6 prior with weight 8 reviews,
-- so a single 5.0 review cannot outrank an established seller.
create or replace function public._rank_seller_quality(p_rating numeric, p_reviews integer)
returns numeric
language sql
immutable
as $$
  select 0.8 + 0.4 * (
    ((8 * 4.6) + coalesce(p_rating, 4.6) * greatest(coalesce(p_reviews, 0), 0))
    / (8 + greatest(coalesce(p_reviews, 0), 0))
  ) / 5.0;
$$;

-- ── Ranked marketplace listings ─────────────────────────────────────────────
create or replace function public.get_ranked_listings(
  p_category text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns setof jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with viewer as (
    select coalesce(
      (select feed_categories from public.profiles where id = auth.uid()),
      '{}'::text[]
    ) as cats
  ),
  saves as (
    select item_id, count(*)::numeric as cnt
    from public.saved_items where item_type = 'listing' group by item_id
  ),
  recent_sales as (
    select listing_id, sum(quantity)::numeric as cnt
    from public.order_items
    where created_at > now() - interval '14 days'
    group by listing_id
  ),
  scored as (
    select
      l.id, l.seller_id, l.card_name, l.edition, l.grade, l.grading_company,
      l.grade_value, l.condition, l.price, l.quantity, l.category, l.description,
      l.images, l.views, l.status, l.created_at,
      p.username, p.display_name, p.rating as seller_rating,
      p.total_sales as seller_total_sales, p.avatar_url,
      (
        (1 + coalesce(s.cnt, 0) + 0.1 * coalesce(l.views, 0) + 2 * coalesce(rs.cnt, 0))
        / power(extract(epoch from (now() - l.created_at)) / 3600.0 + 4, 1.2)
      )
      * public._rank_seller_quality(p.rating, p.review_count)
      * (case when l.category = any(v.cats) then 1.25 else 1.0 end)
      as score
    from public.listings l
    cross join viewer v
    join public.profiles p on p.id = l.seller_id
    left join saves s on s.item_id = l.id
    left join recent_sales rs on rs.listing_id = l.id
    where l.status = 'active'
      and coalesce(l.quantity, 0) > 0
      and not coalesce(p.transaction_banned, false)
      and (p_category is null or p_category = 'All' or l.category = p_category)
  )
  select jsonb_build_object(
    'id', id, 'seller_id', seller_id, 'card_name', card_name, 'edition', edition,
    'grade', grade, 'grading_company', grading_company, 'grade_value', grade_value,
    'condition', condition, 'price', price, 'quantity', quantity, 'category', category,
    'description', description, 'images', images, 'views', views, 'status', status,
    'created_at', created_at,
    'seller', jsonb_build_object(
      'username', username, 'display_name', display_name,
      'rating', seller_rating, 'total_sales', seller_total_sales, 'avatar_url', avatar_url
    )
  )
  from scored
  order by score desc, created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

-- ── Ranked wanted / WTB posts ───────────────────────────────────────────────
create or replace function public.get_ranked_wanted(
  p_category text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns setof jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with viewer as (
    select coalesce(
      (select feed_categories from public.profiles where id = auth.uid()),
      '{}'::text[]
    ) as cats
  ),
  saves as (
    select item_id, count(*)::numeric as cnt
    from public.saved_items where item_type = 'wanted' group by item_id
  ),
  scored as (
    select
      w.id, w.buyer_id, w.card_name, w.edition, w.grade_wanted, w.offer_price,
      w.grading_company_wanted, w.grade_value_wanted, w.category, w.description,
      w.image_url, w.views, w.status, w.created_at, w.expires_at,
      p.username, p.display_name, p.rating as buyer_rating,
      p.total_purchases as buyer_total_purchases, p.avatar_url,
      (
        (1 + coalesce(s.cnt, 0) + 0.1 * coalesce(w.views, 0))
        / power(extract(epoch from (now() - w.created_at)) / 3600.0 + 4, 1.0)
      )
      * (0.9 + 0.2 * least(ln(1 + coalesce(p.total_purchases, 0)) / ln(201), 1))
      * (case when w.category = any(v.cats) then 1.25 else 1.0 end)
      as score
    from public.wanted_posts w
    cross join viewer v
    join public.profiles p on p.id = w.buyer_id
    left join saves s on s.item_id = w.id
    where w.status = 'active'
      and (w.expires_at is null or w.expires_at > now())
      and not coalesce(p.transaction_banned, false)
      and (p_category is null or p_category = 'All' or w.category = p_category)
  )
  select jsonb_build_object(
    'id', id, 'buyer_id', buyer_id, 'card_name', card_name, 'edition', edition,
    'grade_wanted', grade_wanted, 'offer_price', offer_price,
    'grading_company_wanted', grading_company_wanted, 'grade_value_wanted', grade_value_wanted,
    'category', category, 'description', description, 'image_url', image_url,
    'views', views, 'status', status, 'created_at', created_at, 'expires_at', expires_at,
    'buyer', jsonb_build_object(
      'username', username, 'display_name', display_name,
      'rating', buyer_rating, 'total_purchases', buyer_total_purchases, 'avatar_url', avatar_url
    )
  )
  from scored
  order by score desc, created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

-- ── Ranked auctions (engagement x urgency x seller quality) ─────────────────
-- Returns live + recently-ended (within 30 days) auctions, same window the
-- browse screen uses. Each row carries a `rank_score` for the Recommended sort.
create or replace function public.get_ranked_auctions(
  p_category text default null,
  p_limit integer default 200
)
returns setof jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with viewer as (
    select coalesce(
      (select feed_categories from public.profiles where id = auth.uid()),
      '{}'::text[]
    ) as cats
  ),
  scored as (
    select
      a.id, a.seller_id, a.card_name, a.edition, a.grade, a.condition,
      a.starting_price, a.current_bid, a.bid_count, a.watchers, a.category,
      a.images, a.ends_at, a.original_ends_at, a.status, a.buy_now_price,
      a.reserve_price, a.created_at,
      p.username, p.display_name, p.avatar_url,
      (
        (1 + 3 * coalesce(a.bid_count, 0) + coalesce(a.watchers, 0) + 0.05 * coalesce(a.views, 0))
        * (case
             when a.status = 'ended' or a.ends_at <= now() then 0.15
             else 1 + 3 * exp(
               - greatest(extract(epoch from (a.ends_at - now())) / 3600.0, 0) / 12.0
             )
           end)
        * public._rank_seller_quality(p.rating, p.review_count)
        * (case when a.category = any(v.cats) then 1.25 else 1.0 end)
      ) as score
    from public.auction_items a
    cross join viewer v
    join public.profiles p on p.id = a.seller_id
    where a.status in ('active', 'ended')
      and a.ends_at >= now() - interval '30 days'
      and not coalesce(p.transaction_banned, false)
      and (p_category is null or p_category = 'All' or a.category = p_category)
  )
  select jsonb_build_object(
    'id', id, 'seller_id', seller_id, 'card_name', card_name, 'edition', edition,
    'grade', grade, 'condition', condition, 'starting_price', starting_price,
    'current_bid', current_bid, 'bid_count', bid_count, 'watchers', watchers,
    'category', category, 'images', images, 'ends_at', ends_at,
    'original_ends_at', original_ends_at, 'status', status, 'buy_now_price', buy_now_price,
    'reserve_price', reserve_price, 'created_at', created_at,
    'rank_score', score,
    'seller', jsonb_build_object(
      'username', username, 'display_name', display_name, 'avatar_url', avatar_url
    )
  )
  from scored
  order by score desc, ends_at asc
  limit greatest(p_limit, 1);
$$;

-- ── Ranked Home vendor carousel (admin pins + vendor score) ─────────────────
-- Returns ordered store IDs with their final slot position. Pinned stores take
-- their slot first (by pinned_position); the rest fill remaining slots by score.
create or replace function public.get_ranked_vendor_stores(
  p_limit integer default 12
)
returns table(store_id uuid, slot integer, score numeric, pinned boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with last_listing as (
    select seller_id, max(created_at) as last_at
    from public.listings group by seller_id
  ),
  open_disputes as (
    select seller_id, count(*)::numeric as cnt
    from public.disputes
    where status in ('open', 'under_review')
    group by seller_id
  ),
  scored as (
    select
      vs.id as store_id,
      vs.pinned_position,
      (
        0.35 * (
          ((8 * 4.6) + coalesce(p.rating, 4.6) * greatest(coalesce(p.review_count, 0), 0))
          / (8 + greatest(coalesce(p.review_count, 0), 0))
        ) / 5.0
        + 0.25 * least(ln(1 + greatest(coalesce(p.total_sales, 0), 0)) / ln(501), 1)
        + 0.20 * (case
                    when ll.last_at is null then 0
                    else exp(- (extract(epoch from (now() - ll.last_at)) / 86400.0) / 30.0)
                  end)
        + 0.10 * (case when coalesce(p.verified_seller, false) then 1 else 0 end)
        - 0.10 * least(coalesce(od.cnt, 0) / (greatest(coalesce(p.total_sales, 0), 0) + 5), 1)
      ) as score
    from public.vendor_stores vs
    join public.profiles p on p.id = vs.profile_id
    left join last_listing ll on ll.seller_id = vs.profile_id
    left join open_disputes od on od.seller_id = vs.profile_id
    where vs.is_active = true
      and not coalesce(p.transaction_banned, false)
  )
  select
    store_id,
    row_number() over (
      order by (pinned_position is null), pinned_position asc nulls last, score desc
    )::int as slot,
    score,
    (pinned_position is not null) as pinned
  from scored
  order by slot
  limit greatest(p_limit, 1);
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────
grant execute on function public._rank_seller_quality(numeric, integer) to anon, authenticated;
grant execute on function public.get_ranked_listings(text, integer, integer) to anon, authenticated;
grant execute on function public.get_ranked_wanted(text, integer, integer) to anon, authenticated;
grant execute on function public.get_ranked_auctions(text, integer) to anon, authenticated;
grant execute on function public.get_ranked_vendor_stores(integer) to anon, authenticated;
