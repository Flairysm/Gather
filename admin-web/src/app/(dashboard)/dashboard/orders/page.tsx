"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { adminAction } from "@/lib/adminAction";
import { adminQuery } from "@/lib/adminQuery";

type OrderItem = {
  id: string;
  order_id: string;
  listing_id: string;
  seller_id: string;
  quantity: number;
  unit_price: number;
  fulfillment_status: string;
  tracking_number: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  listing: { card_name: string; images: string[] } | null;
  seller: { username: string; display_name: string | null } | null;
  order: { buyer_id: string; status: string; total: number; buyer: { username: string; display_name: string | null } | null } | null;
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-slate-700 text-slate-300",
  confirmed: "bg-sky-500/20 text-sky-300",
  shipped: "bg-violet-500/20 text-violet-300",
  delivered: "bg-emerald-500/20 text-emerald-300",
  cancelled: "bg-rose-500/20 text-rose-300",
  refunded: "bg-amber-500/20 text-amber-300",
};

type FilterId = "all" | "pending" | "confirmed" | "shipped" | "delivered" | "cancelled" | "refunded";

export default function OrdersAdminPage() {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [trackingModal, setTrackingModal] = useState<{ item: OrderItem; mode: "ship" | "edit" } | null>(null);
  const [trackingInput, setTrackingInput] = useState("");
  const [orderPending, setOrderPending] = useState<{
    item: OrderItem;
    kind: "cancel" | "refund";
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await adminQuery<Record<string, unknown>>({
      table: "order_items",
      select: `id, order_id, listing_id, seller_id, quantity, unit_price,
        fulfillment_status, tracking_number, shipped_at, delivered_at, created_at,
        listing:listings!listing_id(card_name, images),
        seller:profiles!seller_id(username, display_name),
        order:orders!order_id(buyer_id, status, total, buyer:profiles!buyer_id(username, display_name))`,
      order: [{ column: "created_at", ascending: false }],
      limit: 500,
    });

    if (error) { setLoadError(error); setLoading(false); return; }

    const mapped = data.map((d) => ({
      ...d,
      listing: Array.isArray(d.listing) ? d.listing[0] : d.listing,
      seller: Array.isArray(d.seller) ? d.seller[0] : d.seller,
      order: (() => {
        const o = Array.isArray(d.order) ? d.order[0] : d.order;
        if (!o) return null;
        return { ...o, buyer: Array.isArray((o as any).buyer) ? (o as any).buyer[0] : (o as any).buyer };
      })(),
    }));
    setItems(mapped as OrderItem[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let result = items;
    if (filter !== "all") result = result.filter((i) => i.fulfillment_status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((i) =>
        (i.listing?.card_name ?? "").toLowerCase().includes(q) ||
        (i.seller?.username ?? "").toLowerCase().includes(q) ||
        (i.order?.buyer?.username ?? "").toLowerCase().includes(q) ||
        (i.tracking_number ?? "").toLowerCase().includes(q) ||
        i.order_id.toLowerCase().includes(q)
      );
    }
    return result;
  }, [items, filter, search]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of items) counts[i.fulfillment_status] = (counts[i.fulfillment_status] ?? 0) + 1;
    return counts;
  }, [items]);

  async function updateStatus(item: OrderItem, newStatus: string, trackingNumber?: string) {
    setActionLoading(item.id);
    setActionError(null);
    const payload: Record<string, unknown> = { id: item.id, newStatus };
    if (trackingNumber) payload.tracking_number = trackingNumber;
    const { ok, error } = await adminAction("order.updateStatus", payload);
    if (!ok) setActionError(`Failed to update order: ${error}`);
    await load();
    setActionLoading(null);
  }

  function openTrackingModal(item: OrderItem, mode: "ship" | "edit") {
    setTrackingInput(mode === "edit" ? (item.tracking_number ?? "") : "");
    setTrackingModal({ item, mode });
  }

  async function submitTracking() {
    if (!trackingModal) return;
    const { item, mode } = trackingModal;
    setTrackingModal(null);
    if (mode === "ship") {
      await updateStatus(item, "shipped", trackingInput || undefined);
    } else {
      setActionLoading(item.id);
      setActionError(null);
      const { ok, error } = await adminAction("order.setTracking", { id: item.id, tracking_number: trackingInput });
      if (!ok) setActionError(`Failed to update tracking: ${error}`);
      await load();
      setActionLoading(null);
    }
  }

  const buyerName = (i: OrderItem) => i.order?.buyer?.display_name || i.order?.buyer?.username || "—";
  const sellerName = (i: OrderItem) => i.seller?.display_name || i.seller?.username || "—";

  return (
    <div>
      {loadError && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          <span>Failed to load orders: {loadError}</span>
          <button onClick={load} className="ml-4 rounded bg-red-800 px-3 py-1 text-xs text-red-100 hover:bg-red-700">Retry</button>
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Orders</h1>
          <p className="mt-1 text-sm text-slate-400">
            {items.length} order items · {stats.confirmed ?? 0} to ship · {stats.shipped ?? 0} in transit
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterId)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
            <option value="refunded">Refunded</option>
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search orders..."
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
        <p className="mt-8 text-sm text-slate-500">Loading orders...</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4">Item</th>
                <th className="pb-2 pr-4">Price</th>
                <th className="pb-2 pr-4">Qty</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Buyer</th>
                <th className="pb-2 pr-4">Seller</th>
                <th className="pb-2 pr-4">Tracking</th>
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      {i.listing?.images?.[0] ? (
                        <img src={i.listing.images[0]} alt="" className="h-9 w-9 rounded object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded bg-slate-800 text-xs text-slate-500">–</div>
                      )}
                      <div>
                        <p className="font-medium leading-tight">{i.listing?.card_name ?? "—"}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{i.order_id.slice(0, 8)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">RM{Number(i.unit_price).toFixed(2)}</td>
                  <td className="py-3 pr-4 text-xs">{i.quantity}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[i.fulfillment_status] ?? STATUS_STYLES.pending}`}>
                      {i.fulfillment_status}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-xs text-slate-400">@{i.order?.buyer?.username ?? "?"}</td>
                  <td className="py-3 pr-4 text-xs text-slate-400">@{i.seller?.username ?? "?"}</td>
                  <td className="py-3 pr-4 text-xs text-slate-500 font-mono">{i.tracking_number ?? "—"}</td>
                  <td className="py-3 pr-4 text-xs text-slate-500">
                    {i.created_at?.slice(0, 10) ?? "—"}
                  </td>
                  <td className="py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      {i.fulfillment_status === "confirmed" && (
                        <button
                          type="button"
                          onClick={() => openTrackingModal(i, "ship")}
                          disabled={actionLoading === i.id}
                          className="rounded bg-violet-500/20 px-2 py-1 text-xs font-medium text-violet-300 transition hover:bg-violet-500/30 disabled:opacity-50"
                        >
                          Mark Shipped
                        </button>
                      )}
                      {i.fulfillment_status === "shipped" && (
                        <>
                          <button
                            type="button"
                            onClick={() => updateStatus(i, "delivered")}
                            disabled={actionLoading === i.id}
                            className="rounded bg-emerald-500/20 px-2 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-50"
                          >
                            Mark Delivered
                          </button>
                          <button
                            type="button"
                            onClick={() => openTrackingModal(i, "edit")}
                            disabled={actionLoading === i.id}
                            className="rounded bg-slate-700 px-2 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-600 disabled:opacity-50"
                          >
                            Edit Tracking
                          </button>
                        </>
                      )}
                      {!["cancelled", "refunded", "delivered"].includes(i.fulfillment_status) && (
                        <>
                          <button
                            type="button"
                            onClick={() => setOrderPending({ item: i, kind: "cancel" })}
                            disabled={actionLoading === i.id}
                            className="rounded bg-rose-500/20 px-2 py-1 text-xs font-medium text-rose-300 transition hover:bg-rose-500/30 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => setOrderPending({ item: i, kind: "refund" })}
                            disabled={actionLoading === i.id}
                            className="rounded bg-amber-500/20 px-2 py-1 text-xs font-medium text-amber-300 transition hover:bg-amber-500/30 disabled:opacity-50"
                          >
                            Refund
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="mt-6 text-center text-sm text-slate-500">No orders found.</p>
          )}
        </div>
      )}

      <ConfirmModal
        open={orderPending !== null}
        title={orderPending?.kind === "refund" ? "Refund order item" : "Cancel order item"}
        message={
          orderPending
            ? orderPending.kind === "refund"
              ? `Mark “${orderPending.item.listing?.card_name ?? "this item"}” as refunded?`
              : `Cancel “${orderPending.item.listing?.card_name ?? "this item"}”?`
            : ""
        }
        confirmLabel={orderPending?.kind === "refund" ? "Refund" : "Cancel order"}
        danger
        busy={orderPending !== null && actionLoading === orderPending.item.id}
        onCancel={() => setOrderPending(null)}
        onConfirm={async () => {
          if (!orderPending) return;
          const { item, kind } = orderPending;
          setOrderPending(null);
          await updateStatus(item, kind === "refund" ? "refunded" : "cancelled");
        }}
      />

      {trackingModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-100">
              {trackingModal.mode === "ship" ? "Mark as Shipped" : "Edit Tracking Number"}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              {trackingModal.mode === "ship"
                ? `Ship "${trackingModal.item.listing?.card_name ?? "this item"}"? Optionally add a tracking number.`
                : `Update tracking number for "${trackingModal.item.listing?.card_name ?? "this item"}".`}
            </p>
            <input
              type="text"
              value={trackingInput}
              onChange={(e) => setTrackingInput(e.target.value)}
              placeholder="Tracking number (optional)"
              className="mt-3 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-500 focus:ring-2"
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setTrackingModal(null)} className="rounded-lg border border-slate-600 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">
                Cancel
              </button>
              <button type="button" onClick={submitTracking} className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400">
                {trackingModal.mode === "ship" ? "Ship" : "Update"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
