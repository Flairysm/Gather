import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

async function getAuthUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      "",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function verifyAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return data?.role === "admin";
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const isAdmin = await verifyAdmin(userId);
    if (!isAdmin) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await req.json();
    const { action, ...params } = body;
    const admin = createAdminClient();

    switch (action) {
      // ─── Listings ───
      case "listing.toggleStatus": {
        const { id, newStatus } = params;
        if (newStatus !== "active" && newStatus !== "removed") {
          return NextResponse.json({ error: "Invalid listing status" }, { status: 400 });
        }
        const { error } = await admin
          .from("listings")
          .update({ status: newStatus })
          .eq("id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      case "listing.delete": {
        const { id } = params;
        const { count: orderCount } = await admin
          .from("order_items")
          .select("id", { count: "exact", head: true })
          .eq("listing_id", id);
        if ((orderCount ?? 0) > 0) {
          const { error: softErr } = await admin
            .from("listings")
            .update({ status: "removed", quantity: 0 })
            .eq("id", id);
          if (softErr) return NextResponse.json({ error: softErr.message }, { status: 400 });
          return NextResponse.json({ ok: true, soft: true });
        }
        const cleanups = await Promise.all([
          admin.from("messages").update({ shared_listing_id: null }).eq("shared_listing_id", id),
          admin.from("messages").update({ offer_listing_id: null }).eq("offer_listing_id", id),
          admin.from("vendor_display_items").delete().eq("listing_id", id),
          admin.from("conversations").update({ listing_id: null }).eq("listing_id", id),
        ]);
        const cleanupErr = cleanups.find((r) => r.error);
        if (cleanupErr?.error) {
          return NextResponse.json({ error: `Cleanup failed: ${cleanupErr.error.message}` }, { status: 400 });
        }
        const { error } = await admin.from("listings").delete().eq("id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      // ─── Auctions ───
      case "auction.end": {
        const { id } = params;
        const { error } = await admin.rpc("end_auction", { p_auction_id: id });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      case "auction.cancel": {
        const { id } = params;
        const { error } = await admin
          .from("auction_items")
          .update({ status: "cancelled" })
          .eq("id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      case "auction.delete": {
        const { id } = params;
        const aCleanups = await Promise.all([
          admin.from("auction_watchers").delete().eq("auction_id", id),
          admin.from("auction_bids").delete().eq("auction_id", id),
          admin.from("auction_wins").delete().eq("auction_id", id),
        ]);
        const aCleanupErr = aCleanups.find((r) => r.error);
        if (aCleanupErr?.error) {
          return NextResponse.json({ error: `Cleanup failed: ${aCleanupErr.error.message}` }, { status: 400 });
        }
        const { error } = await admin.from("auction_items").delete().eq("id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      // ─── Orders ───
      case "order.updateStatus": {
        const { id, newStatus, tracking_number } = params;
        const ALLOWED_ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled", "refunded"] as const;
        if (!ALLOWED_ORDER_STATUSES.includes(newStatus)) {
          return NextResponse.json({ error: "Invalid order status" }, { status: 400 });
        }
        const extra: Record<string, unknown> = { fulfillment_status: newStatus };
        if (newStatus === "shipped") {
          extra.shipped_at = new Date().toISOString();
          if (tracking_number) extra.tracking_number = tracking_number;
        }
        if (newStatus === "delivered") extra.delivered_at = new Date().toISOString();
        const { error } = await admin.from("order_items").update(extra).eq("id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      case "order.setTracking": {
        const { id, tracking_number } = params;
        const { error } = await admin.from("order_items").update({ tracking_number }).eq("id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      // ─── Users ───
      case "user.toggleBan": {
        const { id, banned, reason } = params;
        const { error } = await admin
          .from("profiles")
          .update({
            transaction_banned: banned,
            transaction_ban_reason: banned ? (reason || "Admin action") : null,
          })
          .eq("id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      case "user.changeRole": {
        const { id, newRole } = params;
        if (newRole !== "admin" && newRole !== "user") {
          return NextResponse.json({ error: "Invalid role" }, { status: 400 });
        }
        const { error } = await admin
          .from("profiles")
          .update({ role: newRole })
          .eq("id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      // ─── Disputes ───
      case "dispute.resolve": {
        const { id, status: newStatus, resolution_notes } = params;

        // Read buyer/seller IDs from the DB row — never trust the request body for notification targets
        const { data: disputeRow, error: fetchErr } = await admin
          .from("disputes")
          .select("buyer_id, seller_id")
          .eq("id", id)
          .single();
        if (fetchErr || !disputeRow) {
          return NextResponse.json({ error: fetchErr?.message ?? "Dispute not found" }, { status: 400 });
        }

        const { error } = await admin
          .from("disputes")
          .update({
            status: newStatus,
            resolution_notes,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        const icon = newStatus === "resolved" ? "checkmark-circle-outline" : "close-circle-outline";
        const color = newStatus === "resolved" ? "#22C55E" : "#EF4444";
        const title = newStatus === "resolved" ? "Dispute Resolved" : "Dispute Rejected";

        const { error: notifErr } = await admin.from("notifications").insert([
          { user_id: disputeRow.buyer_id, type: "dispute_resolved", title, body: (resolution_notes ?? '').slice(0, 200), icon, color, reference_type: "dispute", reference_id: id },
          { user_id: disputeRow.seller_id, type: "dispute_resolved", title, body: (resolution_notes ?? '').slice(0, 200), icon, color, reference_type: "dispute", reference_id: id },
        ]);
        if (notifErr) console.error("dispute.resolve notification insert failed:", notifErr.message);
        return NextResponse.json({ ok: true });
      }

      // ─── Vendor Applications ───
      case "vendor.review": {
        const { id, profile_id, status: newStatus, notes, store_name, description } = params;
        const now = new Date().toISOString();

        const { error: appErr } = await admin
          .from("vendor_applications")
          .update({ status: newStatus, reviewed_by: userId, reviewed_at: now, notes: notes || null, updated_at: now })
          .eq("id", id);
        if (appErr) return NextResponse.json({ error: appErr.message }, { status: 400 });

        const { error: profileErr } = await admin
          .from("profiles")
          .update({ verified_seller: newStatus === "approved" })
          .eq("id", profile_id);
        if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 400 });

        if (newStatus === "approved") {
          const { error: storeErr } = await admin.from("vendor_stores").upsert(
            { profile_id, store_name: store_name?.trim() || "Untitled Store", description: description?.trim() || null, is_active: true, updated_at: now },
            { onConflict: "profile_id" },
          );
          if (storeErr) return NextResponse.json({ error: storeErr.message }, { status: 400 });
        }
        return NextResponse.json({ ok: true });
      }

      // ─── Featured Banners ───
      case "banner.upsert": {
        const { id, payload } = params;
        const raw = payload as Record<string, unknown>;
        const BANNER_FIELDS = new Set(["image_url", "target_url", "heading", "subheading", "priority", "is_active"]);
        const p: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(raw)) {
          if (BANNER_FIELDS.has(k)) p[k] = v;
        }
        if (p.target_url && typeof p.target_url === "string" && !/^https?:\/\//i.test(p.target_url)) {
          return NextResponse.json({ error: "target_url must use http:// or https:// scheme" }, { status: 400 });
        }
        const query = id
          ? admin.from("featured_banners").update(p).eq("id", id)
          : admin.from("featured_banners").insert(p);
        const { error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      case "banner.setActive": {
        const { id, active } = params;
        const { error } = await admin.from("featured_banners").update({ is_active: active }).eq("id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      case "banner.delete": {
        const { id } = params;
        const { error } = await admin.from("featured_banners").delete().eq("id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      // ─── Vendor Stores ───
      case "store.updatePriority": {
        const { id, priority } = params;
        const { error } = await admin.from("vendor_stores").update({ priority }).eq("id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      case "store.toggleActive": {
        const { id, active } = params;
        const { error } = await admin.from("vendor_stores").update({ is_active: active }).eq("id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      case "store.delete": {
        const { id, profile_id } = params;
        const { error: profErr } = await admin.from("profiles").update({ verified_seller: false }).eq("id", profile_id);
        if (profErr) return NextResponse.json({ error: `Failed to update profile: ${profErr.message}` }, { status: 400 });
        const { error: appErr } = await admin.from("vendor_applications").delete().eq("profile_id", profile_id);
        if (appErr) return NextResponse.json({ error: `Failed to remove application: ${appErr.message}` }, { status: 400 });
        const { error } = await admin.from("vendor_stores").delete().eq("id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}
