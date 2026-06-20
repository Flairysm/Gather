"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { adminAction } from "@/lib/adminAction";
import { adminQuery } from "@/lib/adminQuery";

type Payout = {
  id: string;
  seller_id: string;
  amount: number;
  status: "requested" | "paid" | "cancelled" | "rejected";
  account_holder: string | null;
  bank_name: string | null;
  account_number: string | null;
  phone: string | null;
  reference: string | null;
  note: string | null;
  requested_at: string;
  paid_at: string | null;
  created_at: string;
};

type SellerProfile = { id: string; username: string | null; display_name: string | null };

const STATUS_STYLES: Record<Payout["status"], string> = {
  requested: "bg-amber-500/20 text-amber-300",
  paid: "bg-emerald-500/20 text-emerald-300",
  cancelled: "bg-slate-700 text-slate-300",
  rejected: "bg-rose-500/20 text-rose-300",
};

type FilterId = "requested" | "paid" | "all";

function rm(v: number) {
  return `RM${Number(v).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PayoutsAdminPage() {
  const [items, setItems] = useState<Payout[]>([]);
  const [sellers, setSellers] = useState<Map<string, SellerProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>("requested");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [payModal, setPayModal] = useState<Payout | null>(null);
  const [reference, setReference] = useState("");
  const [rejectPending, setRejectPending] = useState<Payout | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await adminQuery<Payout>({
      table: "seller_payouts",
      select:
        "id, seller_id, amount, status, account_holder, bank_name, account_number, phone, reference, note, requested_at, paid_at, created_at",
      order: [{ column: "created_at", ascending: false }],
      limit: 500,
    });
    if (error) {
      setLoadError(error);
      setLoading(false);
      return;
    }
    const rows = (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) }));
    setItems(rows);

    const sellerIds = Array.from(new Set(rows.map((r) => r.seller_id)));
    if (sellerIds.length > 0) {
      const { data: profiles } = await adminQuery<SellerProfile>({
        table: "profiles",
        select: "id, username, display_name",
        filters: [{ column: "id", op: "in", value: `(${sellerIds.join(",")})` }],
        limit: 1000,
      });
      setSellers(new Map((profiles ?? []).map((p) => [p.id, p])));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let result = items;
    if (filter !== "all") result = result.filter((i) => i.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((i) => {
        const s = sellers.get(i.seller_id);
        return (
          (s?.username ?? "").toLowerCase().includes(q) ||
          (s?.display_name ?? "").toLowerCase().includes(q) ||
          (i.account_holder ?? "").toLowerCase().includes(q) ||
          (i.bank_name ?? "").toLowerCase().includes(q) ||
          (i.account_number ?? "").toLowerCase().includes(q)
        );
      });
    }
    return result;
  }, [items, filter, search, sellers]);

  const stats = useMemo(() => {
    const pending = items.filter((i) => i.status === "requested");
    const pendingTotal = pending.reduce((sum, i) => sum + i.amount, 0);
    const paidTotal = items.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.amount, 0);
    return { pendingCount: pending.length, pendingTotal, paidTotal };
  }, [items]);

  async function markPaid(payout: Payout, ref: string) {
    setActionLoading(payout.id);
    setActionError(null);
    const { ok, error } = await adminAction("payout.markPaid", {
      payout_id: payout.id,
      reference: ref.trim() || undefined,
    });
    if (!ok) setActionError(`Failed to mark paid: ${error}`);
    await load();
    setActionLoading(null);
  }

  async function rejectPayout(payout: Payout) {
    setActionLoading(payout.id);
    setActionError(null);
    const { ok, error } = await adminAction("payout.reject", { payout_id: payout.id });
    if (!ok) setActionError(`Failed to reject: ${error}`);
    await load();
    setActionLoading(null);
  }

  const sellerName = (i: Payout) => {
    const s = sellers.get(i.seller_id);
    return s?.display_name || s?.username || i.seller_id.slice(0, 8);
  };

  return (
    <div>
      {loadError && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          <span>Failed to load payouts: {loadError}</span>
          <button onClick={load} className="ml-4 rounded bg-red-800 px-3 py-1 text-xs text-red-100 hover:bg-red-700">
            Retry
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Payouts</h1>
          <p className="mt-1 text-sm text-slate-400">
            {stats.pendingCount} pending · {rm(stats.pendingTotal)} to pay · {rm(stats.paidTotal)} paid all-time
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterId)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
          >
            <option value="requested">Pending</option>
            <option value="paid">Paid</option>
            <option value="all">All</option>
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search seller / bank..."
            className="w-64 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none ring-sky-500 focus:ring-2"
          />
        </div>
      </div>

      {actionError && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-rose-700/40 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="ml-3 text-xs text-rose-400 hover:text-rose-200">
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-slate-500">Loading payouts...</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4">Seller</th>
                <th className="pb-2 pr-4">Amount</th>
                <th className="pb-2 pr-4">Bank details</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Requested</th>
                <th className="pb-2 pr-4">Reference</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-3 pr-4">
                    <p className="font-medium leading-tight">{sellerName(i)}</p>
                    <p className="text-[10px] text-slate-500 font-mono">@{sellers.get(i.seller_id)?.username ?? "?"}</p>
                  </td>
                  <td className="py-3 pr-4 font-mono text-sm font-semibold text-emerald-300">{rm(i.amount)}</td>
                  <td className="py-3 pr-4 text-xs">
                    <p className="font-medium text-slate-200">{i.account_holder ?? "—"}</p>
                    <p className="text-slate-400">
                      {i.bank_name ?? "—"} · <span className="font-mono">{i.account_number ?? "—"}</span>
                    </p>
                    {i.phone ? <p className="text-slate-500">{i.phone}</p> : null}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[i.status]}`}>{i.status}</span>
                  </td>
                  <td className="py-3 pr-4 text-xs text-slate-500">{i.created_at?.slice(0, 10) ?? "—"}</td>
                  <td className="py-3 pr-4 text-xs font-mono text-slate-400">{i.reference ?? "—"}</td>
                  <td className="py-3">
                    {i.status === "requested" ? (
                      <div className="flex gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            setReference("");
                            setPayModal(i);
                          }}
                          disabled={actionLoading === i.id}
                          className="rounded bg-emerald-500/20 px-2 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-50"
                        >
                          Mark Paid
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejectPending(i)}
                          disabled={actionLoading === i.id}
                          className="rounded bg-rose-500/20 px-2 py-1 text-xs font-medium text-rose-300 transition hover:bg-rose-500/30 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="mt-6 text-center text-sm text-slate-500">No payouts found.</p>}
        </div>
      )}

      <ConfirmModal
        open={rejectPending !== null}
        title="Reject payout request"
        message={
          rejectPending
            ? `Reject the ${rm(rejectPending.amount)} payout request from ${sellerName(rejectPending)}? The funds return to their available balance.`
            : ""
        }
        confirmLabel="Reject"
        danger
        busy={rejectPending !== null && actionLoading === rejectPending.id}
        onCancel={() => setRejectPending(null)}
        onConfirm={async () => {
          if (!rejectPending) return;
          const p = rejectPending;
          setRejectPending(null);
          await rejectPayout(p);
        }}
      />

      {payModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-100">Mark payout as paid</h2>
            <p className="mt-2 text-sm text-slate-400">
              Confirm you transferred <span className="font-semibold text-emerald-300">{rm(payModal.amount)}</span> to{" "}
              <span className="text-slate-200">{payModal.account_holder}</span> ({payModal.bank_name} {payModal.account_number}).
            </p>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Transfer / DuitNow reference (optional)"
              className="mt-3 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-500 focus:ring-2"
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayModal(null)}
                className="rounded-lg border border-slate-600 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const p = payModal;
                  setPayModal(null);
                  await markPaid(p, reference);
                }}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Confirm Paid
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
