"use client";

import { useEffect, useState } from "react";
import { adminAction } from "@/lib/adminAction";
import { adminQuery } from "@/lib/adminQuery";

type VendorStore = {
  id: string;
  profile_id: string;
  store_name: string;
  description: string | null;
  logo_url: string | null;
  theme_color: string;
  priority: number;
  pinned_position: number | null;
  is_active: boolean;
  created_at: string;
  profile?: { username: string | null; display_name: string | null };
};

export default function VendorStoresPage() {
  const [rows, setRows] = useState<VendorStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPriority, setEditPriority] = useState("");
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [editPinned, setEditPinned] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadStores() {
    setLoading(true);
    setError(null);

    const { data, error: queryError } = await adminQuery<Record<string, any>>({
      table: "vendor_stores",
      select: "id, profile_id, store_name, description, logo_url, theme_color, priority, pinned_position, is_active, created_at, profile:profiles(username, display_name)",
      order: [{ column: "priority", ascending: true }, { column: "created_at", ascending: false }],
    });

    if (queryError) {
      setError(queryError);
      setLoading(false);
      return;
    }

    setRows(
      data.map((r) => ({
        ...r,
        profile: Array.isArray(r.profile) ? r.profile[0] : r.profile,
      })) as VendorStore[],
    );
    setLoading(false);
  }

  useEffect(() => {
    loadStores();
  }, []);

  async function handleSavePriority(id: string) {
    const parsed = Number.parseInt(editPriority, 10);
    if (Number.isNaN(parsed)) {
      setError("Priority must be a number.");
      return;
    }

    setSaving(true);
    const { ok, error: err } = await adminAction("store.updatePriority", { id, priority: parsed });
    setSaving(false);

    if (!ok) {
      setError(err ?? "Failed to update priority");
      return;
    }

    setEditingId(null);
    setEditPriority("");
    await loadStores();
  }

  async function handleSavePinned(id: string) {
    const trimmed = editPinned.trim();
    let pinned_position: number | null;
    if (trimmed === "" || trimmed === "0") {
      pinned_position = null;
    } else {
      const parsed = Number.parseInt(trimmed, 10);
      if (Number.isNaN(parsed) || parsed < 1) {
        setError("Pinned slot must be a whole number 1 or greater (leave empty to unpin).");
        return;
      }
      pinned_position = parsed;
    }

    setSaving(true);
    const { ok, error: err } = await adminAction("store.setPinnedPosition", { id, pinned_position });
    setSaving(false);

    if (!ok) {
      setError(err ?? "Failed to update pinned slot");
      return;
    }

    setPinningId(null);
    setEditPinned("");
    await loadStores();
  }

  async function handleUnpin(id: string) {
    setSaving(true);
    const { ok, error: err } = await adminAction("store.setPinnedPosition", { id, pinned_position: null });
    setSaving(false);

    if (!ok) {
      setError(err ?? "Failed to unpin store");
      return;
    }

    setPinningId(null);
    setEditPinned("");
    await loadStores();
  }

  async function toggleActive(id: string, active: boolean) {
    const { ok, error: err } = await adminAction("store.toggleActive", { id, active });
    if (!ok) {
      setError(err ?? "Failed to toggle store status");
      return;
    }
    await loadStores();
  }

  async function handleDeleteStore(row: VendorStore) {
    setDeleting(true);
    setError(null);

    const { ok, error: err } = await adminAction("store.delete", {
      id: row.id,
      profile_id: row.profile_id,
    });

    if (!ok) {
      setDeleting(false);
      setError(err ?? "Failed to delete store");
      return;
    }

    setDeleting(false);
    setConfirmDeleteId(null);
    await loadStores();
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Vendor Stores</h1>
        <p className="mt-1 text-sm text-slate-400">
          Pinned stores lock to a specific slot on the Home carousel (slot #1 is
          first). Unpinned stores are auto-ranked by reputation and popularity;
          priority is only used as a legacy tie-breaker.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-700/40 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
          Loading vendor stores...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
          No vendor stores yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-950">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Pinned Slot</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900">
              {rows.map((row) => (
                <tr key={row.id} className="text-sm">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-full border-2"
                        style={{
                          borderColor: row.theme_color,
                          backgroundColor: row.theme_color + "22",
                        }}
                      >
                        {row.logo_url ? (
                          <img
                            src={row.logo_url}
                            alt=""
                            className="h-full w-full rounded-full object-cover"
                          />
                        ) : (
                          <span
                            className="text-xs font-bold"
                            style={{ color: row.theme_color }}
                          >
                            {row.store_name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-slate-100">
                          {row.store_name}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">
                          {row.description ?? "No description"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-slate-300">
                      {row.profile?.display_name ??
                        row.profile?.username ??
                        row.profile_id.slice(0, 8)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {editingId === row.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={editPriority}
                          onChange={(e) => setEditPriority(e.target.value)}
                          className="w-20 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm outline-none ring-sky-500 focus:ring-2"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSavePriority(row.id)}
                          disabled={saving}
                          className="rounded-md bg-sky-500 px-2 py-1 text-xs font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditPriority("");
                          }}
                          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span className="font-mono text-sm font-semibold text-slate-200">
                        {row.priority}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {pinningId === row.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={editPinned}
                          onChange={(e) => setEditPinned(e.target.value)}
                          placeholder="Slot #"
                          className="w-20 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm outline-none ring-sky-500 focus:ring-2"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSavePinned(row.id)}
                          disabled={saving}
                          className="rounded-md bg-sky-500 px-2 py-1 text-xs font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setPinningId(null);
                            setEditPinned("");
                          }}
                          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : row.pinned_position !== null ? (
                      <span className="rounded-full bg-sky-900/40 px-2 py-1 text-xs font-medium text-sky-300">
                        Pinned #{row.pinned_position}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">Auto-ranked</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        row.is_active
                          ? "bg-emerald-900/40 text-emerald-300"
                          : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      {row.is_active ? "active" : "hidden"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {new Date(row.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingId(row.id);
                          setEditPriority(String(row.priority));
                        }}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                      >
                        Edit Priority
                      </button>
                      <button
                        onClick={() => {
                          setPinningId(row.id);
                          setEditPinned(
                            row.pinned_position !== null ? String(row.pinned_position) : "",
                          );
                        }}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                      >
                        {row.pinned_position !== null ? "Edit Pin" : "Pin Slot"}
                      </button>
                      {row.pinned_position !== null && (
                        <button
                          onClick={() => handleUnpin(row.id)}
                          disabled={saving}
                          className="rounded-md border border-rose-700/40 bg-rose-900/20 px-2 py-1 text-xs text-rose-300 hover:bg-rose-900/40 disabled:opacity-50"
                        >
                          Unpin
                        </button>
                      )}
                      {row.is_active ? (
                        <button
                          onClick={() => toggleActive(row.id, false)}
                          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          Hide
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleActive(row.id, true)}
                          className="rounded-md bg-sky-500 px-2 py-1 text-xs font-medium text-slate-950 hover:bg-sky-400"
                        >
                          Show
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmDeleteId(row.id)}
                        className="rounded-md border border-rose-700/40 bg-rose-900/20 px-2 py-1 text-xs text-rose-300 hover:bg-rose-900/40"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold text-rose-300">Delete Vendor Store</h2>
            <p className="mt-2 text-sm text-slate-300">
              This will permanently delete the vendor store, remove their verified
              seller status, and delete their vendor application. The vendor will
              need to reapply from scratch.
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Store:{" "}
              <span className="font-medium text-slate-200">
                {rows.find((r) => r.id === confirmDeleteId)?.store_name ?? "Unknown"}
              </span>
            </p>
            <div className="mt-5 flex items-center gap-2">
              <button
                onClick={() => {
                  const row = rows.find((r) => r.id === confirmDeleteId);
                  if (row) handleDeleteStore(row);
                }}
                disabled={deleting}
                className="rounded-md bg-rose-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-rose-400 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Confirm Delete"}
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
