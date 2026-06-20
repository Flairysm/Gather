"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { adminAction } from "@/lib/adminAction";
import { adminQuery } from "@/lib/adminQuery";

type Voucher = {
  id: string;
  code: string;
  face_value: number;
  remaining_value: number;
  status: "active" | "redeemed" | "used" | "expired" | "void";
  source: string | null;
  batch: string | null;
  expires_at: string | null;
  redeemed_by: string | null;
  redeemed_at: string | null;
  created_at: string;
};

const STATUS_STYLES: Record<Voucher["status"], string> = {
  active: "bg-sky-500/20 text-sky-300",
  redeemed: "bg-emerald-500/20 text-emerald-300",
  used: "bg-slate-700 text-slate-300",
  expired: "bg-amber-500/20 text-amber-300",
  void: "bg-rose-500/20 text-rose-300",
};

type FilterId = "all" | "active" | "redeemed" | "used" | "void";

function rm(v: number) {
  return `RM${Number(v).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function VouchersAdminPage() {
  const [items, setItems] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [voidPending, setVoidPending] = useState<Voucher | null>(null);

  // Issue form
  const [issueMode, setIssueMode] = useState<"single" | "batch">("single");
  const [code, setCode] = useState("");
  const [value, setValue] = useState("");
  const [count, setCount] = useState("10");
  const [prefix, setPrefix] = useState("");
  const [expires, setExpires] = useState("");
  const [batchName, setBatchName] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await adminQuery<Voucher>({
      table: "vouchers",
      select:
        "id, code, face_value, remaining_value, status, source, batch, expires_at, redeemed_by, redeemed_at, created_at",
      order: [{ column: "created_at", ascending: false }],
      limit: 1000,
    });
    if (error) {
      setLoadError(error);
      setLoading(false);
      return;
    }
    setItems((data ?? []).map((r) => ({ ...r, face_value: Number(r.face_value), remaining_value: Number(r.remaining_value) })));
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
      result = result.filter(
        (i) => i.code.toLowerCase().includes(q) || (i.batch ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, filter, search]);

  const stats = useMemo(() => {
    const outstanding = items
      .filter((i) => i.status === "redeemed")
      .reduce((s, i) => s + i.remaining_value, 0);
    const unredeemed = items.filter((i) => i.status === "active").length;
    const issuedValue = items.reduce((s, i) => s + i.face_value, 0);
    return { outstanding, unredeemed, issuedValue, total: items.length };
  }, [items]);

  async function handleIssue() {
    const val = parseFloat(value);
    if (!Number.isFinite(val) || val <= 0) {
      setIssueError("Enter a value greater than zero.");
      return;
    }
    setIssuing(true);
    setIssueError(null);
    setGeneratedCodes([]);
    const expires_at = expires ? new Date(expires).toISOString() : null;
    const batch = batchName.trim() || null;

    if (issueMode === "single") {
      if (!code.trim()) {
        setIssueError("Enter a code.");
        setIssuing(false);
        return;
      }
      const { ok, error } = await adminAction("voucher.create", {
        code: code.trim(),
        value: val,
        expires_at,
        batch,
      });
      if (!ok) setIssueError(error ?? "Failed to create voucher.");
      else {
        setCode("");
        await load();
      }
    } else {
      const { ok, error, data } = await adminAction<{ codes: string[]; errors: string[] }>("voucher.createBatch", {
        count: parseInt(count, 10) || 0,
        value: val,
        prefix: prefix.trim() || undefined,
        expires_at,
        batch,
      });
      if (!ok) setIssueError(error ?? "Failed to generate vouchers.");
      else {
        setGeneratedCodes(data?.codes ?? []);
        if ((data?.errors?.length ?? 0) > 0) setIssueError(`${data?.errors.length} code(s) failed to generate.`);
        await load();
      }
    }
    setIssuing(false);
  }

  async function voidVoucher(v: Voucher) {
    setActionLoading(v.id);
    setActionError(null);
    const { ok, error } = await adminAction("voucher.void", { id: v.id });
    if (!ok) setActionError(`Failed to void: ${error}`);
    await load();
    setActionLoading(null);
  }

  return (
    <div>
      {loadError && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          <span>Failed to load vouchers: {loadError}</span>
          <button onClick={load} className="ml-4 rounded bg-red-800 px-3 py-1 text-xs text-red-100 hover:bg-red-700">
            Retry
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Vouchers</h1>
          <p className="mt-1 text-sm text-slate-400">
            {stats.total} issued · {stats.unredeemed} unredeemed · {rm(stats.outstanding)} outstanding credit
          </p>
        </div>
      </div>

      {/* ── Issue ── */}
      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-200">Issue Vouchers</h2>
          <div className="ml-auto flex rounded-lg border border-slate-700 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setIssueMode("single")}
              className={`rounded px-3 py-1 ${issueMode === "single" ? "bg-sky-500/20 text-sky-300" : "text-slate-400"}`}
            >
              Single
            </button>
            <button
              type="button"
              onClick={() => setIssueMode("batch")}
              className={`rounded px-3 py-1 ${issueMode === "batch" ? "bg-sky-500/20 text-sky-300" : "text-slate-400"}`}
            >
              Batch
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          {issueMode === "single" ? (
            <label className="text-xs text-slate-400">
              Code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="WELCOME50"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm uppercase text-slate-100 outline-none ring-sky-500 focus:ring-2"
              />
            </label>
          ) : (
            <>
              <label className="text-xs text-slate-400">
                How many
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-500 focus:ring-2"
                />
              </label>
              <label className="text-xs text-slate-400">
                Prefix (optional)
                <input
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                  placeholder="DROPS"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm uppercase text-slate-100 outline-none ring-sky-500 focus:ring-2"
                />
              </label>
            </>
          )}
          <label className="text-xs text-slate-400">
            Value (RM)
            <input
              type="number"
              min={1}
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="50"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-500 focus:ring-2"
            />
          </label>
          <label className="text-xs text-slate-400">
            Expires (optional)
            <input
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-500 focus:ring-2"
            />
          </label>
          <label className="text-xs text-slate-400">
            Batch label (optional)
            <input
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="launch-2026"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-500 focus:ring-2"
            />
          </label>
        </div>

        {issueError && <p className="mt-3 text-xs text-rose-400">{issueError}</p>}

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={handleIssue}
            disabled={issuing}
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
          >
            {issuing ? "Working…" : issueMode === "single" ? "Create Voucher" : `Generate ${count || 0} Codes`}
          </button>
        </div>

        {generatedCodes.length > 0 && (
          <div className="mt-4 rounded-lg border border-emerald-700/40 bg-emerald-900/15 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-emerald-300">{generatedCodes.length} codes generated</p>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(generatedCodes.join("\n"))}
                className="rounded bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/30"
              >
                Copy all
              </button>
            </div>
            <textarea
              readOnly
              value={generatedCodes.join("\n")}
              rows={Math.min(generatedCodes.length, 8)}
              className="mt-2 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-200"
            />
          </div>
        )}
      </div>

      {/* ── Filters ── */}
      <div className="mt-6 flex items-center gap-2">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterId)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none"
        >
          <option value="all">All</option>
          <option value="active">Unredeemed</option>
          <option value="redeemed">Active (redeemed)</option>
          <option value="used">Used</option>
          <option value="void">Void</option>
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code / batch..."
          className="w-64 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none ring-sky-500 focus:ring-2"
        />
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
        <p className="mt-8 text-sm text-slate-500">Loading vouchers...</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4">Code</th>
                <th className="pb-2 pr-4">Value</th>
                <th className="pb-2 pr-4">Remaining</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Batch</th>
                <th className="pb-2 pr-4">Expires</th>
                <th className="pb-2 pr-4">Created</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-3 pr-4 font-mono font-semibold text-slate-100">{i.code}</td>
                  <td className="py-3 pr-4 font-mono text-slate-300">{rm(i.face_value)}</td>
                  <td className="py-3 pr-4 font-mono text-emerald-300">{rm(i.remaining_value)}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[i.status]}`}>{i.status}</span>
                  </td>
                  <td className="py-3 pr-4 text-xs text-slate-400">{i.batch ?? "—"}</td>
                  <td className="py-3 pr-4 text-xs text-slate-500">{i.expires_at?.slice(0, 10) ?? "—"}</td>
                  <td className="py-3 pr-4 text-xs text-slate-500">{i.created_at?.slice(0, 10) ?? "—"}</td>
                  <td className="py-3">
                    {i.status === "active" || i.status === "redeemed" ? (
                      <button
                        type="button"
                        onClick={() => setVoidPending(i)}
                        disabled={actionLoading === i.id}
                        className="rounded bg-rose-500/20 px-2 py-1 text-xs font-medium text-rose-300 transition hover:bg-rose-500/30 disabled:opacity-50"
                      >
                        Void
                      </button>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="mt-6 text-center text-sm text-slate-500">No vouchers found.</p>}
        </div>
      )}

      <ConfirmModal
        open={voidPending !== null}
        title="Void voucher"
        message={
          voidPending
            ? `Void ${voidPending.code} (${rm(voidPending.remaining_value)} remaining)? It can no longer be redeemed or used.`
            : ""
        }
        confirmLabel="Void"
        danger
        busy={voidPending !== null && actionLoading === voidPending.id}
        onCancel={() => setVoidPending(null)}
        onConfirm={async () => {
          if (!voidPending) return;
          const v = voidPending;
          setVoidPending(null);
          await voidVoucher(v);
        }}
      />
    </div>
  );
}
