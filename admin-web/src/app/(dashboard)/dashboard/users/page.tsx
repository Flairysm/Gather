"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { adminAction } from "@/lib/adminAction";
import { adminQuery } from "@/lib/adminQuery";

type User = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  verified_seller: boolean;
  transaction_banned: boolean;
  transaction_ban_reason: string | null;
  phone_number: string | null;
  phone_verified: boolean;
  total_sales: number;
  total_purchases: number;
  rating: number;
  review_count: number;
  created_at: string;
};

export default function UsersAdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [roleChangeUser, setRoleChangeUser] = useState<User | null>(null);
  const [banTarget, setBanTarget] = useState<User | null>(null);
  const [banReason, setBanReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await adminQuery<User>({
      table: "profiles",
      select: "*",
      order: [{ column: "created_at", ascending: false }],
      limit: 500,
    });
    if (error) { setLoadError(error); setLoading(false); return; }
    setUsers(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.display_name ?? "").toLowerCase().includes(q) ||
        (u.phone_number ?? "").includes(q)
    );
  }, [users, search]);

  function toggleBan(user: User) {
    const newBan = !user.transaction_banned;
    if (newBan) {
      setBanReason("");
      setBanTarget(user);
    } else {
      executeBan(user, false, "");
    }
  }

  async function executeBan(user: User, banned: boolean, reason: string) {
    setActionLoading(user.id);
    setActionError(null);
    const { ok, error } = await adminAction("user.toggleBan", {
      id: user.id,
      banned,
      reason: reason || "Admin action",
    });
    if (!ok) setActionError(`Failed to update user: ${error}`);
    await load();
    setActionLoading(null);
  }

  async function runChangeRole(user: User) {
    const newRole = user.role === "admin" ? "user" : "admin";
    setActionLoading(user.id);
    setActionError(null);
    const { ok, error } = await adminAction("user.changeRole", { id: user.id, newRole });
    if (!ok) setActionError(`Failed to change role: ${error}`);
    await load();
    setActionLoading(null);
  }

  return (
    <div>
      {loadError && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          <span>Failed to load users: {loadError}</span>
          <button onClick={load} className="ml-4 rounded bg-red-800 px-3 py-1 text-xs text-red-100 hover:bg-red-700">Retry</button>
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">User Management</h1>
          <p className="mt-1 text-sm text-slate-400">
            {users.length} total users
          </p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone..."
          className="w-72 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none ring-sky-500 focus:ring-2"
        />
      </div>

      {actionError && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-rose-700/40 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="ml-3 text-xs text-rose-400 hover:text-rose-200">Dismiss</button>
        </div>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-slate-500">Loading users...</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4">User</th>
                <th className="pb-2 pr-4">Role</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Phone</th>
                <th className="pb-2 pr-4">Sales</th>
                <th className="pb-2 pr-4">Rating</th>
                <th className="pb-2 pr-4">Joined</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-xs text-slate-400">
                          {(u.username?.[0] ?? "?").toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{u.display_name || u.username}</p>
                        <p className="text-xs text-slate-500">@{u.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      u.role === "admin" ? "bg-purple-500/20 text-purple-300" : "bg-slate-800 text-slate-400"
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    {u.transaction_banned ? (
                      <span className="rounded bg-rose-500/20 px-2 py-0.5 text-xs font-medium text-rose-300">
                        Banned
                      </span>
                    ) : u.verified_seller ? (
                      <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300">
                        Verified Seller
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">Active</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-xs text-slate-400">
                    {u.phone_number ?? "–"}
                    {u.phone_verified && " ✓"}
                  </td>
                  <td className="py-3 pr-4 text-xs">{u.total_sales}</td>
                  <td className="py-3 pr-4 text-xs">
                    {Number(u.rating).toFixed(1)} ({u.review_count})
                  </td>
                  <td className="py-3 pr-4 text-xs text-slate-500">
                    {new Date(u.created_at).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => toggleBan(u)}
                        disabled={actionLoading === u.id}
                        className={`rounded px-2 py-1 text-xs font-medium transition ${
                          u.transaction_banned
                            ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                            : "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
                        } disabled:opacity-50`}
                      >
                        {u.transaction_banned ? "Unban" : "Ban"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRoleChangeUser(u)}
                        disabled={actionLoading === u.id}
                        className="rounded bg-purple-500/20 px-2 py-1 text-xs font-medium text-purple-300 transition hover:bg-purple-500/30 disabled:opacity-50"
                      >
                        {u.role === "admin" ? "Remove Admin" : "Make Admin"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="mt-6 text-center text-sm text-slate-500">No users found.</p>
          )}
        </div>
      )}

      <ConfirmModal
        open={roleChangeUser !== null}
        title="Change user role"
        message={
          roleChangeUser
            ? `Set @${roleChangeUser.username} as ${roleChangeUser.role === "admin" ? "user" : "admin"}?`
            : ""
        }
        confirmLabel="Update role"
        busy={roleChangeUser !== null && actionLoading === roleChangeUser.id}
        onCancel={() => setRoleChangeUser(null)}
        onConfirm={async () => {
          if (!roleChangeUser) return;
          const u = roleChangeUser;
          setRoleChangeUser(null);
          await runChangeRole(u);
        }}
      />

      {banTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-100">Ban User</h2>
            <p className="mt-2 text-sm text-slate-400">
              Ban @{banTarget.username} from transactions?
            </p>
            <input
              type="text"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Ban reason (optional)"
              className="mt-3 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-500 focus:ring-2"
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setBanTarget(null)} className="rounded-lg border border-slate-600 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const u = banTarget;
                  setBanTarget(null);
                  await executeBan(u, true, banReason);
                }}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500"
              >
                Ban
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
