"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { adminAction } from "@/lib/adminAction";
import { adminQuery } from "@/lib/adminQuery";

type Auction = {
  id: string;
  card_name: string;
  edition: string | null;
  starting_price: number;
  current_bid: number | null;
  bid_count: number;
  category: string;
  images: string[];
  ends_at: string;
  status: string;
  reserve_price: number | null;
  buy_now_price: number | null;
  views: number;
  created_at: string;
  seller: { username: string; display_name: string | null } | null;
  winner: { username: string; display_name: string | null } | null;
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-300",
  ended: "bg-slate-700 text-slate-300",
  cancelled: "bg-rose-500/20 text-rose-300",
};

type FilterId = "all" | "active" | "ended" | "cancelled";

type PendingAuction =
  | { kind: "end"; auction: Auction }
  | { kind: "cancel"; auction: Auction }
  | { kind: "delete"; auction: Auction };

export default function AuctionsAdminPage() {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAuction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await adminQuery<Record<string, unknown>>({
      table: "auction_items",
      select: `id, card_name, edition, starting_price, current_bid, bid_count,
        category, images, ends_at, status, reserve_price, buy_now_price, views, created_at,
        seller:profiles!seller_id(username, display_name),
        winner:profiles!winner_id(username, display_name)`,
      order: [{ column: "created_at", ascending: false }],
      limit: 500,
    });

    if (error) { setLoadError(error); setLoading(false); return; }

    const mapped = data.map((d) => ({
      ...d,
      seller: Array.isArray(d.seller) ? d.seller[0] : d.seller,
      winner: Array.isArray(d.winner) ? d.winner[0] : d.winner,
    }));
    setAuctions(mapped as Auction[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let result = auctions;
    if (filter !== "all") result = result.filter((a) => a.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((a) =>
        a.card_name.toLowerCase().includes(q) ||
        (a.edition ?? "").toLowerCase().includes(q) ||
        (a.seller?.username ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [auctions, filter, search]);

  const stats = useMemo(() => {
    let active = 0, ended = 0, totalBids = 0;
    for (const a of auctions) {
      if (a.status === "active") active++;
      if (a.status === "ended") ended++;
      totalBids += a.bid_count;
    }
    return { active, ended, totalBids };
  }, [auctions]);

  async function runPendingAction(p: PendingAuction) {
    const a = p.auction;
    setActionLoading(a.id);
    const action =
      p.kind === "end"
        ? "auction.end"
        : p.kind === "cancel"
          ? "auction.cancel"
          : "auction.delete";
    setActionError(null);
    const { ok, error } = await adminAction(action, { id: a.id });
    if (!ok) {
      setActionError(
        `Failed to ${p.kind === "end" ? "end" : p.kind === "cancel" ? "cancel" : "delete"} auction: ${error}`,
      );
    }
    await load();
    setActionLoading(null);
  }

  function formatEnds(d: string) {
    const dt = new Date(d);
    const now = new Date();
    if (dt < now) return "Ended";
    const diff = dt.getTime() - now.getTime();
    const hrs = Math.floor(diff / 3600000);
    if (hrs < 24) return `${hrs}h left`;
    return `${Math.floor(hrs / 24)}d left`;
  }

  return (
    <div>
      {loadError && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          <span>Failed to load auctions: {loadError}</span>
          <button onClick={load} className="ml-4 rounded bg-red-800 px-3 py-1 text-xs text-red-100 hover:bg-red-700">Retry</button>
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Auctions</h1>
          <p className="mt-1 text-sm text-slate-400">
            {stats.active} active · {stats.ended} ended · {stats.totalBids} total bids
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterId)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="ended">Ended</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search auctions..."
            className="w-64 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none ring-sky-500 focus:ring-2"
          />
        </div>
      </div>

      {actionError && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-rose-700/40 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="ml-3 text-xs text-rose-400 hover:text-rose-200">Dismiss</button>
        </div>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-slate-500">Loading auctions...</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4">Auction</th>
                <th className="pb-2 pr-4">Starting</th>
                <th className="pb-2 pr-4">Current Bid</th>
                <th className="pb-2 pr-4">Bids</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Ends</th>
                <th className="pb-2 pr-4">Seller</th>
                <th className="pb-2 pr-4">Winner</th>
                <th className="pb-2 pr-4">Views</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      {a.images?.[0] ? (
                        <img src={a.images[0]} alt="" className="h-9 w-9 rounded object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded bg-slate-800 text-xs text-slate-500">–</div>
                      )}
                      <div>
                        <p className="font-medium leading-tight">{a.card_name}</p>
                        {a.edition && <p className="text-xs text-slate-500">{a.edition}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">RM{Number(a.starting_price).toFixed(2)}</td>
                  <td className="py-3 pr-4 font-mono text-xs font-semibold">
                    {a.current_bid ? `RM${Number(a.current_bid).toFixed(2)}` : "—"}
                  </td>
                  <td className="py-3 pr-4 text-xs">{a.bid_count}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[a.status] ?? STATUS_STYLES.ended}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-xs text-slate-400">{formatEnds(a.ends_at)}</td>
                  <td className="py-3 pr-4 text-xs text-slate-400">@{a.seller?.username ?? "?"}</td>
                  <td className="py-3 pr-4 text-xs text-slate-400">
                    {a.winner ? `@${a.winner.username}` : "—"}
                  </td>
                  <td className="py-3 pr-4 text-xs text-slate-500">{a.views}</td>
                  <td className="py-3">
                    <div className="flex gap-1.5">
                      {a.status === "active" && (
                        <>
                          <button
                            type="button"
                            onClick={() => setPending({ kind: "end", auction: a })}
                            disabled={actionLoading === a.id}
                            className="rounded bg-amber-500/20 px-2 py-1 text-xs font-medium text-amber-300 transition hover:bg-amber-500/30 disabled:opacity-50"
                          >
                            End Now
                          </button>
                          <button
                            type="button"
                            onClick={() => setPending({ kind: "cancel", auction: a })}
                            disabled={actionLoading === a.id}
                            className="rounded bg-rose-500/20 px-2 py-1 text-xs font-medium text-rose-300 transition hover:bg-rose-500/30 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {(a.status === "ended" || a.status === "cancelled") && (
                        <button
                          type="button"
                          onClick={() => setPending({ kind: "delete", auction: a })}
                          disabled={actionLoading === a.id}
                          className="rounded bg-rose-500/20 px-2 py-1 text-xs font-medium text-rose-300 transition hover:bg-rose-500/30 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="mt-6 text-center text-sm text-slate-500">No auctions found.</p>
          )}
        </div>
      )}

      <ConfirmModal
        open={pending !== null}
        title={
          pending?.kind === "end"
            ? "End auction now"
            : pending?.kind === "cancel"
              ? "Cancel auction"
              : "Delete auction"
        }
        message={
          pending
            ? pending.kind === "end"
              ? `End “${pending.auction.card_name}” immediately?`
              : pending.kind === "cancel"
                ? `Cancel “${pending.auction.card_name}”? This cannot be undone.`
                : `Permanently delete “${pending.auction.card_name}”? This cannot be undone.`
            : ""
        }
        confirmLabel={pending?.kind === "delete" ? "Delete" : "Confirm"}
        danger={pending?.kind === "delete" || pending?.kind === "cancel"}
        busy={pending !== null && actionLoading === pending.auction.id}
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          if (!pending) return;
          const p = pending;
          setPending(null);
          await runPendingAction(p);
        }}
      />
    </div>
  );
}
