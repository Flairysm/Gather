"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminQuery } from "@/lib/adminQuery";

type LogEntry = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown> | null;
  created_at: string;
  actor?: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

const ACTION_COLORS: Record<string, string> = {
  checkout: "bg-emerald-500/20 text-emerald-300",
  auction_payment: "bg-emerald-500/20 text-emerald-300",
  listing_created: "bg-sky-500/20 text-sky-300",
  listing_status_active: "bg-emerald-500/20 text-emerald-300",
  listing_status_sold: "bg-amber-500/20 text-amber-300",
  listing_status_removed: "bg-rose-500/20 text-rose-300",
  listing_price_changed: "bg-amber-500/20 text-amber-300",
  auction_created: "bg-sky-500/20 text-sky-300",
  auction_ended: "bg-amber-500/20 text-amber-300",
  auction_win_expired: "bg-rose-500/20 text-rose-300",
  dispute_opened: "bg-rose-500/20 text-rose-300",
  dispute_resolved: "bg-emerald-500/20 text-emerald-300",
  dispute_rejected: "bg-slate-500/20 text-slate-300",
  dispute_under_review: "bg-amber-500/20 text-amber-300",
  user_banned: "bg-rose-500/20 text-rose-300",
  user_unbanned: "bg-emerald-500/20 text-emerald-300",
  role_changed: "bg-purple-500/20 text-purple-300",
  vendor_app_approved: "bg-emerald-500/20 text-emerald-300",
  vendor_app_rejected: "bg-rose-500/20 text-rose-300",
  fulfillment_shipped: "bg-violet-500/20 text-violet-300",
  fulfillment_delivered: "bg-emerald-500/20 text-emerald-300",
  fulfillment_cancelled: "bg-rose-500/20 text-rose-300",
  fulfillment_refunded: "bg-amber-500/20 text-amber-300",
};

const ENTITY_ICONS: Record<string, string> = {
  order: "🛒",
  listing: "📦",
  auction: "🔨",
  auction_win: "🏆",
  dispute: "⚖️",
  profile: "👤",
  vendor_application: "📋",
  order_item: "📋",
};

const FILTER_OPTIONS = [
  { value: "all", label: "All Activity" },
  { value: "checkout", label: "Purchases" },
  { value: "listing", label: "Listings" },
  { value: "auction", label: "Auctions" },
  { value: "dispute", label: "Disputes" },
  { value: "fulfillment", label: "Fulfillment" },
  { value: "user", label: "User Actions" },
  { value: "vendor", label: "Vendor Apps" },
];

export default function ActivityLogPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await adminQuery<LogEntry>({
      table: "audit_log",
      select: "*, actor:profiles!audit_log_actor_id_fkey(username, display_name, avatar_url)",
      order: [{ column: "created_at", ascending: false }],
      limit: 1000,
    });
    setEntries(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let result = entries;

    if (filter !== "all") {
      result = result.filter((e) => {
        switch (filter) {
          case "checkout": return e.action === "checkout" || e.action === "auction_payment";
          case "listing": return e.entity_type === "listing" || e.action.startsWith("listing_");
          case "auction": return e.entity_type === "auction" || e.action.startsWith("auction_");
          case "dispute": return e.entity_type === "dispute" || e.action.startsWith("dispute_");
          case "fulfillment": return e.action.startsWith("fulfillment_");
          case "user": return e.action.startsWith("user_") || e.action === "role_changed";
          case "vendor": return e.action.startsWith("vendor_app_");
          default: return true;
        }
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.action.toLowerCase().includes(q) ||
          e.entity_type.toLowerCase().includes(q) ||
          (e.actor?.username ?? "").toLowerCase().includes(q) ||
          (e.actor?.display_name ?? "").toLowerCase().includes(q) ||
          JSON.stringify(e.details ?? {}).toLowerCase().includes(q)
      );
    }

    return result;
  }, [entries, filter, search]);

  const paged = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page],
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  function formatAction(action: string): string {
    return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function formatDetails(details: Record<string, unknown> | null): string {
    if (!details) return "";
    const parts: string[] = [];
    for (const [k, v] of Object.entries(details)) {
      if (v === null || v === undefined) continue;
      const key = k.replace(/_/g, " ");
      if (typeof v === "number" && (k.includes("price") || k.includes("total") || k.includes("amount") || k.includes("bid"))) {
        parts.push(`${key}: RM${Number(v).toFixed(2)}`);
      } else {
        parts.push(`${key}: ${String(v)}`);
      }
    }
    return parts.join(" · ");
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Activity Log</h1>
          <p className="mt-1 text-sm text-slate-400">
            {filtered.length} events logged · All vendor &amp; user activity
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <select
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setPage(0); }}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
        >
          {FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search by user, action, or detail..."
          className="w-80 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none ring-sky-500 focus:ring-2"
        />
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-slate-500">Loading activity log...</p>
      ) : paged.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="text-lg font-medium text-slate-300">No activity found</p>
          <p className="mt-1 text-sm text-slate-500">
            {filter === "all" ? "No events recorded yet." : "No matching events for this filter."}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 space-y-2">
            {paged.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 rounded-xl border border-slate-800/60 bg-slate-900/50 px-4 py-3 transition hover:bg-slate-800/40"
              >
                <div className="mt-0.5 text-lg">
                  {ENTITY_ICONS[entry.entity_type] ?? "📝"}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${ACTION_COLORS[entry.action] ?? "bg-slate-700/50 text-slate-300"}`}
                    >
                      {formatAction(entry.action)}
                    </span>
                    <span className="text-xs text-slate-500">
                      on <span className="font-mono text-slate-400">{entry.entity_type}</span>
                      <span className="ml-1 font-mono text-[10px] text-slate-600">{entry.entity_id.slice(0, 8)}</span>
                    </span>
                  </div>

                  {entry.details && Object.keys(entry.details).length > 0 && (
                    <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                      {formatDetails(entry.details)}
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <div className="flex items-center gap-2">
                    {entry.actor?.avatar_url ? (
                      <img src={entry.actor.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-[10px] text-slate-400">
                        {(entry.actor?.username ?? "?")[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs font-medium text-slate-300">
                      {entry.actor?.display_name ?? entry.actor?.username ?? "System"}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">{timeAgo(entry.created_at)}</p>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-slate-500">
                Page {page + 1} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
