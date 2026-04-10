# Evend — Supabase Schema Reference

> Auto-exported 2026-04-10. 28 tables, 22 RPC functions, 80+ RLS policies, 4 notification triggers.

---

## Tables

### profiles
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| id | uuid | — | NO |
| username | text | — | NO |
| display_name | text | — | YES |
| avatar_url | text | — | YES |
| bio | text | — | YES |
| rating | numeric | 5.00 | YES |
| total_sales | integer | 0 | YES |
| total_purchases | integer | 0 | YES |
| verified_seller | boolean | false | YES |
| role | text | 'user' | NO |
| feed_categories | text[] | — | YES |
| phone_number | text | — | YES |
| phone_verified | boolean | false | NO |
| transaction_banned | boolean | false | NO |
| transaction_ban_reason | text | — | YES |
| review_count | integer | 0 | NO |
| notifications_last_seen_at | timestamptz | — | YES |
| created_at | timestamptz | now() | YES |
| updated_at | timestamptz | now() | YES |

### listings
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| id | uuid | gen_random_uuid() | NO |
| seller_id | uuid | — | NO |
| card_name | text | — | NO |
| edition | text | — | YES |
| grade | text | — | YES |
| condition | text | — | YES |
| price | numeric | — | NO |
| category | text | — | NO |
| description | text | — | YES |
| images | text[] | '{}' | YES |
| views | integer | 0 | YES |
| status | text | 'active' | YES |
| quantity | integer | 1 | NO |
| grading_company | text | — | YES |
| grade_value | text | — | YES |
| created_at | timestamptz | now() | YES |
| updated_at | timestamptz | now() | YES |

### wanted_posts
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| id | uuid | gen_random_uuid() | NO |
| buyer_id | uuid | — | NO |
| card_name | text | — | NO |
| edition | text | — | YES |
| grade_wanted | text | — | YES |
| offer_price | numeric | — | NO |
| category | text | — | NO |
| description | text | — | YES |
| image_url | text | — | YES |
| views | integer | 0 | YES |
| status | text | 'active' | YES |
| grading_company_wanted | text | — | YES |
| grade_value_wanted | text | — | YES |
| created_at | timestamptz | now() | YES |
| updated_at | timestamptz | now() | YES |

### orders
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| id | uuid | gen_random_uuid() | NO |
| buyer_id | uuid | — | NO |
| status | text | 'confirmed' | NO |
| total | numeric | — | NO |
| created_at | timestamptz | now() | NO |

### order_items
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| id | uuid | gen_random_uuid() | NO |
| order_id | uuid | — | NO |
| listing_id | uuid | — | NO |
| seller_id | uuid | — | NO |
| quantity | integer | 1 | NO |
| unit_price | numeric | — | NO |
| fulfillment_status | text | 'pending' | NO |
| tracking_number | text | — | YES |
| shipped_at | timestamptz | — | YES |
| delivered_at | timestamptz | — | YES |
| received_at | timestamptz | — | YES |
| dispute_deadline | timestamptz | — | YES |
| created_at | timestamptz | now() | NO |

### disputes
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| id | uuid | gen_random_uuid() | NO |
| order_item_id | uuid | — | NO |
| order_id | uuid | — | NO |
| buyer_id | uuid | — | NO |
| seller_id | uuid | — | NO |
| reason | text | — | NO |
| description | text | — | YES |
| status | text | 'open' | NO |
| resolution_notes | text | — | YES |
| created_at | timestamptz | now() | YES |
| updated_at | timestamptz | now() | YES |

### conversations
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| id | uuid | gen_random_uuid() | NO |
| participant_ids | uuid[] | — | NO |
| topic | text | — | YES |
| listing_id | uuid | — | YES |
| wanted_id | uuid | — | YES |
| last_message_text | text | — | YES |
| last_message_at | timestamptz | now() | YES |
| last_sender_id | uuid | — | YES |
| created_at | timestamptz | now() | YES |

### messages
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| id | uuid | gen_random_uuid() | NO |
| conversation_id | uuid | — | NO |
| sender_id | uuid | — | NO |
| kind | text | 'text' | NO |
| text | text | — | YES |
| offer_amount | numeric | — | YES |
| offer_card_name | text | — | YES |
| offer_status | text | — | YES |
| offer_listing_id | uuid | — | YES |
| media_urls | text[] | '{}' | YES |
| shared_listing_id | uuid | — | YES |
| created_at | timestamptz | now() | YES |

### conversation_reads
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| user_id | uuid | — | NO |
| conversation_id | uuid | — | NO |
| last_read_at | timestamptz | now() | NO |
| created_at | timestamptz | now() | NO |

### conversation_user_meta
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| user_id | uuid | — | NO |
| conversation_id | uuid | — | NO |
| is_favorite | boolean | false | NO |
| is_hidden | boolean | false | NO |
| updated_at | timestamptz | now() | NO |
| created_at | timestamptz | now() | NO |

### auction_items
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| id | uuid | gen_random_uuid() | NO |
| seller_id | uuid | — | NO |
| card_name | text | — | NO |
| edition | text | — | YES |
| grade | text | — | YES |
| starting_price | numeric | — | NO |
| current_bid | numeric | — | YES |
| bid_count | integer | 0 | YES |
| watchers | integer | 0 | YES |
| category | text | — | NO |
| description | text | — | YES |
| images | text[] | '{}' | YES |
| ends_at | timestamptz | — | NO |
| status | text | 'active' | YES |
| condition | text | — | YES |
| reserve_price | numeric | — | YES |
| buy_now_price | numeric | — | YES |
| highest_bidder_id | uuid | — | YES |
| winner_id | uuid | — | YES |
| original_ends_at | timestamptz | — | YES |
| snipe_threshold_seconds | integer | 30 | NO |
| snipe_extension_seconds | integer | 30 | NO |
| min_bid_increment | numeric | 1 | NO |
| views | integer | 0 | NO |
| grading_company | text | — | YES |
| grade_value | text | — | YES |
| created_at | timestamptz | now() | YES |
| updated_at | timestamptz | now() | YES |

### auction_bids
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| id | uuid | gen_random_uuid() | NO |
| auction_id | uuid | — | NO |
| bidder_id | uuid | — | NO |
| amount | numeric | — | NO |
| created_at | timestamptz | now() | YES |

### auction_wins
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| id | uuid | gen_random_uuid() | NO |
| auction_id | uuid | — | NO |
| winner_id | uuid | — | NO |
| seller_id | uuid | — | NO |
| winning_bid | numeric | — | NO |
| payment_deadline | timestamptz | — | NO |
| payment_status | text | 'pending' | NO |
| paid_at | timestamptz | — | YES |
| created_at | timestamptz | now() | NO |

### auction_watchers
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| id | uuid | gen_random_uuid() | NO |
| auction_id | uuid | — | NO |
| user_id | uuid | — | NO |
| created_at | timestamptz | now() | NO |

### reviews
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| id | uuid | gen_random_uuid() | NO |
| order_id | uuid | — | NO |
| reviewer_id | uuid | — | NO |
| seller_id | uuid | — | NO |
| rating | integer | — | NO |
| comment | text | — | YES |
| created_at | timestamptz | now() | NO |

### saved_items
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| id | uuid | gen_random_uuid() | NO |
| user_id | uuid | — | NO |
| item_type | text | — | NO |
| item_id | uuid | — | NO |
| created_at | timestamptz | now() | NO |

### user_addresses
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| id | uuid | gen_random_uuid() | NO |
| user_id | uuid | — | NO |
| label | text | 'Home' | NO |
| full_name | text | — | NO |
| phone | text | — | YES |
| address_line1 | text | — | NO |
| address_line2 | text | — | YES |
| city | text | — | NO |
| state | text | — | NO |
| zip | text | — | NO |
| country | text | 'MY' | NO |
| is_default | boolean | false | NO |
| created_at | timestamptz | now() | NO |

### vendor_stores
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| id | uuid | gen_random_uuid() | NO |
| profile_id | uuid | — | NO |
| store_name | text | — | NO |
| description | text | — | YES |
| logo_url | text | — | YES |
| banner_url | text | — | YES |
| theme_color | text | '#2C80FF' | NO |
| priority | integer | 100 | NO |
| is_active | boolean | true | NO |
| created_at | timestamptz | now() | NO |
| updated_at | timestamptz | now() | NO |

### vendor_applications
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| id | uuid | gen_random_uuid() | NO |
| profile_id | uuid | — | NO |
| store_name | text | — | YES |
| description | text | — | YES |
| categories | text[] | '{}' | NO |
| status | text | 'pending' | NO |
| reviewed_by | uuid | — | YES |
| reviewed_at | timestamptz | — | YES |
| notes | text | — | YES |
| created_at | timestamptz | now() | NO |
| updated_at | timestamptz | now() | NO |

### vendor_display_items
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| id | uuid | gen_random_uuid() | NO |
| store_id | uuid | — | NO |
| listing_id | uuid | — | NO |
| display_order | integer | 1 | NO |
| created_at | timestamptz | now() | NO |

### featured_banners
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| id | uuid | gen_random_uuid() | NO |
| image_url | text | — | NO |
| target_url | text | — | YES |
| priority | integer | 100 | NO |
| is_active | boolean | true | NO |
| heading | text | — | YES |
| subheading | text | — | YES |
| created_at | timestamptz | now() | NO |
| updated_at | timestamptz | now() | NO |

### notifications
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| id | uuid | gen_random_uuid() | NO |
| user_id | uuid | — | NO |
| type | text | — | NO |
| title | text | — | NO |
| body | text | — | NO |
| icon | text | 'notifications-outline' | YES |
| color | text | '#2C80FF' | YES |
| reference_type | text | — | YES |
| reference_id | uuid | — | YES |
| is_read | boolean | false | NO |
| created_at | timestamptz | now() | NO |

### live_streams
| Column | Type | Default | Nullable |
|--------|------|---------|----------|
| id | uuid | gen_random_uuid() | NO |
| streamer_id | uuid | — | NO |
| title | text | — | NO |
| category | text | — | YES |
| tags | text[] | '{}' | YES |
| viewer_count | integer | 0 | YES |
| is_live | boolean | true | YES |
| thumbnail_url | text | — | YES |
| description | text | — | YES |
| like_count | integer | 0 | YES |
| share_count | integer | 0 | YES |
| started_at | timestamptz | now() | YES |
| ended_at | timestamptz | — | YES |

### live_viewers / live_likes / live_chat_messages / stream_presets / audit_log
_(Live streaming support tables — schema omitted for brevity, available via Supabase dashboard)_

---

## RPC Functions (SECURITY DEFINER)

| Function | Purpose |
|----------|---------|
| `handle_new_user` | Auto-creates profile on auth signup |
| `checkout_order(p_items)` | Creates order + order_items, decrements listing stock |
| `place_bid(p_auction_id, p_amount)` | Places bid with eligibility checks + anti-snipe |
| `end_auction(p_auction_id)` | Ends auction, sets winner, creates auction_win |
| `pay_auction_win(p_win_id)` | Marks auction win as paid, creates order |
| `submit_review(...)` | Creates review + updates seller rating |
| `update_fulfillment_status(...)` | Updates order item fulfillment (ship/deliver) |
| `toggle_save_item(...)` | Bookmark/unbookmark listing or auction |
| `toggle_auction_watch(...)` | Watch/unwatch auction |
| `increment_listing_views(...)` | Increment listing view counter |
| `increment_auction_views(...)` | Increment auction view counter |
| `increment_wanted_views(...)` | Increment wanted post view counter |
| `is_order_seller(order_id, user_id)` | Check if user sells items in an order (used by RLS) |
| `check_expired_auction_wins` | Expire unpaid wins past deadline |
| `go_live(...)` | Create/start live stream |
| `end_live(...)` | End live stream |
| `join_live_stream(...)` | Viewer joins stream |
| `leave_live_stream(...)` | Viewer leaves stream |
| `toggle_live_like(...)` | Like/unlike a live stream |
| `rls_auto_enable` | Utility: auto-enable RLS on new tables |
| `update_updated_at` | Trigger: auto-set updated_at |

---

## RLS Policies Summary

All 27 tables have RLS enabled. Key patterns:

- **profiles**: Public read, owner insert/update
- **listings**: Public read (active + buyer's purchased), owner CRUD
- **wanted_posts**: Public read (active), owner CRUD
- **orders**: Buyer read/insert, seller read via `is_order_seller()` SECURITY DEFINER
- **order_items**: Buyer read/insert/update, seller read/update
- **disputes**: Buyer insert, both participants read/update
- **conversations**: Participant read/insert/update
- **messages**: Participant read/insert, offer update
- **vendor_stores**: Public read (active), admin full CRUD, owner insert/update
- **vendor_applications**: Owner read/insert/update(pending), admin read/update
- **featured_banners**: Public read (active), admin CRUD
- **reviews**: Public read, reviewer insert
- **saved_items**: Owner CRUD
- **user_addresses**: Owner CRUD
- **auction_***: Public read, owner CRUD, bidder insert

---

## Migrations (47 total)

Managed via Supabase dashboard. Migration names stored in `supabase_migrations.schema_migrations`.

Last migration: `create_notification_triggers` (auto-generates notifications for sales, shipping, delivery, and disputes)
