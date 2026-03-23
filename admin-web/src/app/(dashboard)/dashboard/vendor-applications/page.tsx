"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type VendorApplication = {
  id: string;
  profile_id: string;
  store_name: string | null;
  description: string | null;
  categories: string[] | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  reviewed_at: string | null;
  created_at: string;
};

export default function VendorApplicationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<VendorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<VendorApplication | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from("vendor_applications")
      .select(
        "id, profile_id, store_name, description, categories, notes, status, reviewed_at, created_at",
      )
      .order("created_at", { ascending: false });

    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as VendorApplication[]);
    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;

    async function boot() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!mounted) return;
      setAdminId(user?.id ?? null);
      await load();
    }

    boot();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  async function updateApplicationStatus(
    row: VendorApplication,
    status: "approved" | "rejected",
  ) {
    if (!adminId) {
      setError("Cannot resolve current admin user.");
      return;
    }

    setSaving(true);
    setError(null);

    const now = new Date().toISOString();
    const trimmedNote = adminNote.trim();

    const { error: appErr } = await supabase
      .from("vendor_applications")
      .update({
        status,
        reviewed_by: adminId,
        reviewed_at: now,
        notes: trimmedNote || row.notes,
        updated_at: now,
      })
      .eq("id", row.id);

    if (appErr) {
      setSaving(false);
      setError(appErr.message);
      return;
    }

    const { error: profileErr } = await supabase
      .from("profiles")
      .update({ verified_seller: status === "approved" })
      .eq("id", row.profile_id);

    if (profileErr) {
      setSaving(false);
      setError(profileErr.message);
      return;
    }

    if (status === "approved") {
      const { error: storeErr } = await supabase
        .from("vendor_stores")
        .upsert(
          {
            profile_id: row.profile_id,
            store_name: row.store_name?.trim() || "Untitled Store",
            description: row.description?.trim() || null,
            is_active: true,
            updated_at: now,
          },
          { onConflict: "profile_id" },
        );

      if (storeErr) {
        setSaving(false);
        setError(storeErr.message);
        return;
      }
    }

    setSaving(false);
    setSelected(null);
    setAdminNote("");
    await load();
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Vendor Applications</h1>
          <p className="mt-1 text-sm text-slate-400">
            Review and manage seller verification requests.
          </p>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
          Loading applications...
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-700/40 bg-rose-900/20 p-4 text-sm text-rose-300">
          {error}
          <p className="mt-2 text-xs text-rose-200/80">
            If table does not exist yet, create `vendor_applications` in Supabase
            before using this page.
          </p>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
          No applications yet.
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-950">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Applicant</th>
                <th className="px-4 py-3">Categories</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900">
              {rows.map((row) => (
                <tr key={row.id} className="text-sm">
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.store_name ?? "Untitled store"}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                      {row.description ?? "No description"}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">
                    {row.profile_id}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(row.categories ?? []).map((cat) => (
                        <span
                          key={cat}
                          className="rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-xs text-slate-300"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        row.status === "approved"
                          ? "bg-emerald-900/40 text-emerald-300"
                          : row.status === "rejected"
                            ? "bg-rose-900/40 text-rose-300"
                            : "bg-amber-900/40 text-amber-300"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => {
                        setSelected(row);
                        setAdminNote(row.notes ?? "");
                      }}
                      className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Review Vendor Application</h2>
              <button
                onClick={() => setSelected(null)}
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 text-sm md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Store Name</p>
                <p className="mt-1 text-slate-100">{selected.store_name ?? "Untitled"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Applicant</p>
                <p className="mt-1 font-mono text-xs text-slate-300">{selected.profile_id}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">Description</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-200">
                  {selected.description ?? "No description provided."}
                </p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">Categories</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(selected.categories ?? []).map((cat) => (
                    <span
                      key={cat}
                      className="rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-xs text-slate-300"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Submitted</p>
                <p className="mt-1 text-slate-300">
                  {new Date(selected.created_at).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
                <p className="mt-1 capitalize text-slate-200">{selected.status}</p>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs uppercase tracking-wide text-slate-500">
                  Admin Note
                </label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-500 focus:ring-2"
                  placeholder="Optional reason or internal note..."
                />
              </div>
            </div>

            <div className="mt-5 flex items-center gap-2">
              <button
                onClick={() => updateApplicationStatus(selected, "approved")}
                disabled={saving}
                className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                Approve Vendor
              </button>
              <button
                onClick={() => updateApplicationStatus(selected, "rejected")}
                disabled={saving}
                className="rounded-md bg-rose-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-rose-400 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
