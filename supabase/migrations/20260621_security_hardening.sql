-- Production security & performance hardening (advisor-driven).
--
-- 1. Close notification spoofing. The previous INSERT policy used
--    WITH CHECK (true), letting any authenticated/anon client forge
--    notifications to any user. All legitimate inserts come from
--    SECURITY DEFINER triggers/RPCs (table owner, bypasses RLS) or the
--    service role (bypasses RLS), so removing the policy denies only
--    direct client inserts. Verified: the mobile client only
--    selects/updates/subscribes to notifications, never inserts.
drop policy if exists "System can insert notifications" on public.notifications;

-- 2. Pin search_path on flagged functions so a caller-controlled
--    search_path can't redirect unqualified object references
--    (search_path hijack), which matters most for SECURITY DEFINER.
alter function public.notify_seller_new_sale() set search_path = public, pg_temp;
alter function public.notify_buyer_shipped() set search_path = public, pg_temp;
alter function public.notify_buyer_delivered() set search_path = public, pg_temp;
alter function public.notify_seller_dispute() set search_path = public, pg_temp;
alter function public._moderation_norm(text) set search_path = public, pg_temp;
alter function public.feed_text_violation(text) set search_path = public, pg_temp;
alter function public._rank_seller_quality(numeric, integer) set search_path = public, pg_temp;

-- 3. Add covering indexes for foreign keys that lacked them. Improves
--    join/lookup and (critically) cascade-delete performance at scale.
create index if not exists idx_auction_items_highest_bidder_id on public.auction_items (highest_bidder_id);
create index if not exists idx_auction_items_winner_id on public.auction_items (winner_id);
create index if not exists idx_auction_watchers_user_id on public.auction_watchers (user_id);
create index if not exists idx_auction_wins_seller_id on public.auction_wins (seller_id);
create index if not exists idx_conversation_reads_conversation_id on public.conversation_reads (conversation_id);
create index if not exists idx_conversation_user_meta_conversation_id on public.conversation_user_meta (conversation_id);
create index if not exists idx_disputes_order_item_id on public.disputes (order_item_id);
create index if not exists idx_disputes_order_id on public.disputes (order_id);
create index if not exists idx_messages_shared_listing_id on public.messages (shared_listing_id);
create index if not exists idx_messages_offer_listing_id on public.messages (offer_listing_id);
create index if not exists idx_messages_shared_wanted_id on public.messages (shared_wanted_id);
create index if not exists idx_post_comments_author_id on public.post_comments (author_id);
create index if not exists idx_post_reports_reporter_id on public.post_reports (reporter_id);
create index if not exists idx_user_reports_conversation_id on public.user_reports (conversation_id);
create index if not exists idx_vendor_applications_reviewed_by on public.vendor_applications (reviewed_by);
create index if not exists idx_vendor_display_items_listing_id on public.vendor_display_items (listing_id);
