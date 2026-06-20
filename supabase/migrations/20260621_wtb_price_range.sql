-- WTB (wanted) posts can now specify a budget RANGE instead of a single offer.
--
-- offer_price stays the minimum / base budget (backward compatible). When
-- offer_price_max is set and greater than offer_price, the post advertises a
-- range, e.g. "RM100 – RM200".

BEGIN;

ALTER TABLE public.wanted_posts
  ADD COLUMN IF NOT EXISTS offer_price_max numeric;

COMMENT ON COLUMN public.wanted_posts.offer_price_max IS
  'Optional upper bound of the buyer budget. NULL = single offer (offer_price).';

-- Recreate the ranked-wanted feed so offer_price_max flows through to the client.
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
      w.offer_price_max,
      w.grading_company_wanted, w.grade_value_wanted, w.grades_wanted,
      w.category, w.description,
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
    'grade_wanted', grade_wanted, 'offer_price', offer_price, 'offer_price_max', offer_price_max,
    'grading_company_wanted', grading_company_wanted, 'grade_value_wanted', grade_value_wanted,
    'grades_wanted', grades_wanted,
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

grant execute on function public.get_ranked_wanted(text, integer, integer) to anon, authenticated;

COMMIT;
