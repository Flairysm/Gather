"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { adminAction } from "@/lib/adminAction";
import { adminQuery } from "@/lib/adminQuery";

type Listing = {
  id: string;
  card_name: string;
  edition: string | null;
  price: number;
  quantity: number;
  status: string;
  category: string;
  images: string[];
  views: number;
  created_at: string;
  seller: { username: string; display_name: string | null } | null;
};

export default function ListingsAdminPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "removed" | "sold">("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Listing | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await adminQuery<Record<string, unknown>>({
      table: "listings",
      select: "id, card_name, edition, price, quantity, status, category, images, views, created_at, seller:profiles!seller_id(username, display_name)",
      order: [{ column: "created_at", ascending: false }],
      limit: 500,
    });

    if (error) { setLoadError(error); setLoading(false); return; }

    const mapped = data.map((d) => ({
      ...d,
      seller: Array.isArray(d.seller) ? d.seller[0] : d.seller,
    }));
    setListings(mapped as Listing[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let result = listings;
    if (statusFilter !== "all") {
      result = result.filter((l) => {
        if (statusFilter === "sold") return l.quantity === 0 && l.status !== "removed";
        if (statusFilter === "removed") return l.status === "removed";
        return l.status === statusFilter && l.quantity > 0;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((l) =>
        l.card_name.toLowerCase().includes(q) ||
        (l.edition ?? "").toLowerCase().includes(q) ||
        (l.seller?.username ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [listings, search, statusFilter]);

  async function toggleStatus(l: Listing) {
    const newStatus = l.status === "active" ? "removed" : "active";
    setActionLoading(l.id);
    const { ok, error } = await adminAction("listing.toggleStatus", { id: l.id, newStatus });
    if (!ok) setActionError(`Failed to update listing: ${error}`);
    await load();
    setActionLoading(null);
  }

  async function runDeleteListing(l: Listing) {
    setActionLoading(l.id);
    setActionError(null);
    const { ok, error } = await adminAction("listing.delete", { id: l.id });
    if (!ok) setActionError(`Failed to delete "${l.card_name}": ${error}`);
    await load();
    setActionLoading(null);
  }

  return (
    <div>
      {loadError && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          <span>Failed to load listings: {loadError}</span>
          <button onClick={load} className="ml-4 rounded bg-red-800 px-3 py-1 text-xs text-red-100 hover:bg-red-700">Retry</button>
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Listings Moderation</h1>
          <p className="mt-1 text-sm text-slate-400">
            {listings.length} total listings
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="removed">Removed</option>
            <option value="sold">Sold out</option>
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search listings..."
            className="w-64 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none ring-sky-500 focus:ring-2"
          />
        </div>
      </div>

      {actionError && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-rose-700/40 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="ml-3 text-xs text-rose-400 hover:text-rose-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-slate-500">Loading listings...</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4">Listing</th>
                <th className="pb-2 pr-4">Price</th>
                <th className="pb-2 pr-4">Qty</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Category</th>
                <th className="pb-2 pr-4">Seller</th>
                <th className="pb-2 pr-4">Views</th>
                <th className="pb-2 pr-4">Created</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      {l.images?.[0] ? (
                        <img src={l.images[0]} alt="" className="h-9 w-9 rounded object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded bg-slate-800 text-xs text-slate-500">–</div>
                      )}
                      <div>
                        <p className="font-medium leading-tight">{l.card_name}</p>
                        {l.edition && <p className="text-xs text-slate-500">{l.edition}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">RM{Number(l.price).toFixed(2)}</td>
                  <td className="py-3 pr-4 text-xs">{l.quantity}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      l.status === "active"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-slate-800 text-slate-400"
                    }`}>
                      {l.quantity === 0 ? "Sold out" : l.status}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-xs text-slate-400">{l.category}</td>
                  <td className="py-3 pr-4 text-xs text-slate-400">
                    @{l.seller?.username ?? "?"}
                  </td>
                  <td className="py-3 pr-4 text-xs text-slate-500">{l.views}</td>
                  <td className="py-3 pr-4 text-xs text-slate-500">
                    {new Date(l.created_at).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => toggleStatus(l)}
                        disabled={actionLoading === l.id}
                        className={`rounded px-2 py-1 text-xs font-medium transition ${
                          l.status === "active"
                            ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                            : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                        } disabled:opacity-50`}
                      >
                        {l.status === "active" ? "Remove" : "Activate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(l)}
                        disabled={actionLoading === l.id}
                        className="rounded bg-rose-500/20 px-2 py-1 text-xs font-medium text-rose-300 transition hover:bg-rose-500/30 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="mt-6 text-center text-sm text-slate-500">No listings found.</p>
          )}
        </div>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete listing"
        message={
          deleteTarget
            ? `Permanently delete “${deleteTarget.card_name}”? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        danger
        busy={deleteTarget !== null && actionLoading === deleteTarget.id}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const l = deleteTarget;
          setDeleteTarget(null);
          await runDeleteListing(l);
        }}
      />
    </div>
  );
}
