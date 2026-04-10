"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminAction } from "@/lib/adminAction";
import { adminQuery } from "@/lib/adminQuery";

type Dispute = {
  id: string;
  order_item_id: string;
  order_id: string;
  buyer_id: string;
  seller_id: string;
  reason: string;
  description: string | null;
  status: string;
  resolution_notes: string | null;
  evidence_urls: string[] | null;
  created_at: string;
  updated_at: string;
  buyer: { username: string; display_name: string | null } | null;
  seller: { username: string; display_name: string | null } | null;
  order_item: { listing: { card_name: string; images: string[] } | null } | null;
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-rose-500/20 text-rose-300",
  under_review: "bg-amber-500/20 text-amber-300",
  resolved: "bg-emerald-500/20 text-emerald-300",
  rejected: "bg-slate-700 text-slate-400",
};

export default function DisputesAdminPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "under_review" | "resolved" | "rejected">("all");
  const [resolveModal, setResolveModal] = useState<Dispute | null>(null);
  const [resolution, setResolution] = useState("");
  const [resAction, setResAction] = useState<"resolved" | "rejected">("resolved");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await adminQuery<Record<string, unknown>>({
      table: "disputes",
      select: `*,
        buyer:profiles!buyer_id(username, display_name),
        seller:profiles!seller_id(username, display_name),
        order_item:order_items!order_item_id(listing:listings!listing_id(card_name, images))`,
      order: [{ column: "created_at", ascending: false }],
    });

    if (error) { setLoadError(error); setLoading(false); return; }

    const mapped = data.map((d) => ({
      ...d,
      buyer: Array.isArray(d.buyer) ? d.buyer[0] : d.buyer,
      seller: Array.isArray(d.seller) ? d.seller[0] : d.seller,
      order_item: Array.isArray(d.order_item) ? d.order_item[0] : d.order_item,
    }));
    setDisputes(mapped as Dispute[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === "all") return disputes;
    return disputes.filter((d) => d.status === filter);
  }, [disputes, filter]);

  async function handleResolve() {
    if (!resolveModal || !resolution.trim()) return;
    setSubmitting(true);

    const { ok, error } = await adminAction("dispute.resolve", {
      id: resolveModal.id,
      status: resAction,
      resolution_notes: resolution.trim(),
      buyer_id: resolveModal.buyer_id,
      seller_id: resolveModal.seller_id,
    });

    if (!ok) {
      setActionError(`Failed to ${resAction} dispute: ${error}`);
      setSubmitting(false);
      return;
    }

    setResolveModal(null);
    setResolution("");
    setSubmitting(false);
    load();
  }

  const buyerName = (d: Dispute) => d.buyer?.display_name || d.buyer?.username || "Buyer";
  const sellerName = (d: Dispute) => d.seller?.display_name || d.seller?.username || "Seller";
  const cardName = (d: Dispute) => (d.order_item as Dispute["order_item"])?.listing?.card_name ?? "Item";
  const cardImage = (d: Dispute) => (d.order_item as Dispute["order_item"])?.listing?.images?.[0] ?? null;

  return (
    <div>
      {loadError && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          <span>Failed to load disputes: {loadError}</span>
          <button onClick={load} className="ml-4 rounded bg-red-800 px-3 py-1 text-xs text-red-100 hover:bg-red-700">Retry</button>
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Disputes</h1>
          <p className="mt-1 text-sm text-slate-400">
            {disputes.filter((d) => d.status === "open" || d.status === "under_review").length} open disputes
          </p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
        >
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="under_review">Under Review</option>
          <option value="resolved">Resolved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {actionError && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-rose-700/40 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="ml-3 text-xs text-rose-400 hover:text-rose-200">Dismiss</button>
        </div>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-slate-500">Loading disputes...</p>
      ) : filtered.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="text-lg font-medium text-slate-300">No disputes</p>
          <p className="mt-1 text-sm text-slate-500">
            {filter === "all" ? "No disputes have been filed." : `No ${filter.replace("_", " ")} disputes.`}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {filtered.map((d) => (
            <div key={d.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="flex items-start gap-3">
                {cardImage(d) ? (
                  <img src={cardImage(d)!} alt="" className="h-14 w-14 flex-shrink-0 rounded-lg border border-slate-700 object-cover" />
                ) : (
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-500">–</div>
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[d.status] ?? STATUS_STYLES.open}`}>
                      {d.status.replace("_", " ")}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(d.created_at).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>
                  <h3 className="mt-1 font-medium">{cardName(d)}</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Buyer: {buyerName(d)} · Seller: {sellerName(d)}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 p-3">
                <p className="text-xs font-medium text-slate-500">REASON</p>
                <p className="mt-1 text-sm font-medium">{d.reason}</p>
                {d.description && <p className="mt-1 text-sm text-slate-400">{d.description}</p>}
              </div>

              {d.evidence_urls && d.evidence_urls.length > 0 && (
                <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900 p-3">
                  <p className="text-xs font-medium text-slate-500">BUYER EVIDENCE ({d.evidence_urls.length} photos)</p>
                  <div className="mt-2 flex gap-2 overflow-x-auto">
                    {d.evidence_urls.map((url, idx) => (
                      <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                        <img
                          src={url}
                          alt={`Evidence ${idx + 1}`}
                          className="h-24 w-24 rounded-lg border border-slate-700 object-cover transition hover:border-sky-500 hover:opacity-90"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {d.resolution_notes && (
                <div className="mt-2 rounded-lg border border-sky-800/40 bg-sky-900/10 p-3">
                  <p className="text-xs font-medium text-slate-500">RESOLUTION</p>
                  <p className="mt-1 text-sm text-slate-300">{d.resolution_notes}</p>
                </div>
              )}

              {(d.status === "open" || d.status === "under_review") && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => { setResolveModal(d); setResAction("resolved"); setResolution(""); }}
                    className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/30"
                  >
                    Resolve
                  </button>
                  <button
                    onClick={() => { setResolveModal(d); setResAction("rejected"); setResolution(""); }}
                    className="rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/30"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {resolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold">
              {resAction === "resolved" ? "Resolve Dispute" : "Reject Dispute"}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {resAction === "resolved"
                ? "Explain the resolution. Both buyer and seller will be notified."
                : "Explain why this dispute is rejected."}
            </p>
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="Enter resolution notes..."
              rows={4}
              maxLength={1000}
              className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm outline-none ring-sky-500 focus:ring-2"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setResolveModal(null)}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleResolve}
                disabled={!resolution.trim() || submitting}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                  resAction === "resolved"
                    ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                    : "bg-rose-500 text-white hover:bg-rose-400"
                }`}
              >
                {submitting ? "Submitting..." : resAction === "resolved" ? "Resolve" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
