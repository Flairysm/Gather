"use client";

import { useEffect, useState } from "react";
import { adminQuery, adminCount } from "@/lib/adminQuery";

type StatCard = { title: string; value: string | number; color?: string; isError?: boolean };

export default function DashboardPage() {
  const [stats, setStats] = useState<StatCard[]>([
    { title: "Total Users", value: "–" },
    { title: "Active Listings", value: "–" },
    { title: "Pending Vendor Apps", value: "–" },
    { title: "Open Disputes", value: "–" },
    { title: "Total Orders", value: "–" },
    { title: "Active Auctions", value: "–" },
    { title: "Revenue (All Time)", value: "–" },
    { title: "Unread Notifications", value: "–" },
  ]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    async function load() {
      const [users, listings, pendingApps, disputes, orders, auctions, revenue, notifications] =
        await Promise.all([
          adminCount("profiles"),
          adminCount("listings", [{ column: "status", op: "eq", value: "active" }]),
          adminCount("vendor_applications", [{ column: "status", op: "eq", value: "pending" }]),
          adminCount("disputes", [{ column: "status", op: "eq", value: "open" }]),
          adminCount("orders"),
          adminCount("auction_items", [{ column: "status", op: "eq", value: "active" }]),
          adminQuery<{ total: number }>({ table: "orders", select: "total" }),
          adminCount("notifications", [{ column: "is_read", op: "eq", value: false }]),
        ]);

      const anyErr = [users, listings, pendingApps, disputes, orders, auctions, notifications].some((v) => v === -1) || !!revenue.error;
      setLoadError(anyErr);

      const fmt = (v: number) => (v === -1 ? "Error" : v);
      const totalRevenue = revenue.error ? 0 : (revenue.data ?? []).reduce(
        (sum, o) => sum + Number(o.total ?? 0),
        0,
      );

      setStats([
        { title: "Total Users", value: fmt(users), isError: users === -1 },
        { title: "Active Listings", value: fmt(listings), isError: listings === -1 },
        {
          title: "Pending Vendor Apps",
          value: fmt(pendingApps),
          color: pendingApps > 0 ? "text-amber-400" : undefined,
          isError: pendingApps === -1,
        },
        {
          title: "Open Disputes",
          value: fmt(disputes),
          color: disputes > 0 ? "text-rose-400" : undefined,
          isError: disputes === -1,
        },
        { title: "Total Orders", value: fmt(orders), isError: orders === -1 },
        { title: "Active Auctions", value: fmt(auctions), isError: auctions === -1 },
        {
          title: "Revenue (All Time)",
          value: revenue.error ? "Error" : `RM ${totalRevenue.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`,
          isError: !!revenue.error,
        },
        { title: "Unread Notifications", value: fmt(notifications), isError: notifications === -1 },
      ]);
    }
    load();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Overview</h1>
      <p className="mt-2 text-sm text-slate-400">
        Live stats from the Evend platform.
      </p>

      {loadError && (
        <div className="mt-4 rounded-lg border border-amber-800 bg-amber-950/50 p-3 text-sm text-amber-300">
          ⚠ Some data failed to load. Cards marked &quot;Error&quot; could not reach the database.
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((card) => (
          <div
            key={card.title}
            className={`rounded-xl border p-4 ${card.isError ? "border-red-800 bg-red-950/30" : "border-slate-800 bg-slate-950"}`}
          >
            <p className="text-xs text-slate-500">{card.title}</p>
            <p className={`mt-2 text-2xl font-semibold ${card.isError ? "text-red-400" : card.color ?? ""}`}>
              {card.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
