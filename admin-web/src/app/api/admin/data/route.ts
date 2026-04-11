import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const ALLOWED_TABLES = new Set([
  "profiles",
  "listings",
  "auction_items",
  "orders",
  "order_items",
  "disputes",
  "vendor_applications",
  "vendor_stores",
  "featured_banners",
  "notifications",
  "audit_log",
  "reviews",
  "live_streams",
  "live_stream_pins",
  "live_stream_alerts",
  "live_auction_bids",
]);

const ALLOWED_FILTER_OPS = new Set([
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "not.eq", "not.is",
]);

async function getAuthUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      "",
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).single();
    if (profile?.role !== "admin") return NextResponse.json({ error: "Not authorized" }, { status: 403 });

    const body = await req.json();
    const { table, select, filters, order, limit, countOnly } = body;

    if (!table || !ALLOWED_TABLES.has(table)) {
      return NextResponse.json({ error: `Table not allowed: ${table}` }, { status: 400 });
    }

    for (const f of filters ?? []) {
      if (!ALLOWED_FILTER_OPS.has(f.op)) {
        return NextResponse.json({ error: `Filter operator not allowed: ${f.op}` }, { status: 400 });
      }
    }

    if (countOnly) {
      let q = admin.from(table).select("id", { count: "exact", head: true });
      for (const f of filters ?? []) {
        q = q.filter(f.column, f.op, f.value);
      }
      const { count, error } = await q;
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ count: count ?? 0 });
    }

    let q = admin.from(table).select(select ?? "*");
    for (const f of filters ?? []) {
      q = q.filter(f.column, f.op, f.value);
    }
    for (const o of order ?? []) {
      q = q.order(o.column, { ascending: o.ascending ?? false });
    }
    const MAX_LIMIT = 1000;
    q = q.limit(Math.min(limit ?? MAX_LIMIT, MAX_LIMIT));

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}
