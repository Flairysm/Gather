export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Overview</h1>
      <p className="mt-2 text-sm text-slate-400">
        Admin dashboard scaffold is ready. Start with vendor application
        approvals, then add listing moderation and user management.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { title: "Pending Vendor Apps", value: "-" },
          { title: "Active Listings", value: "-" },
          { title: "Reports Open", value: "-" },
          { title: "New Users (24h)", value: "-" },
        ].map((card) => (
          <div
            key={card.title}
            className="rounded-xl border border-slate-800 bg-slate-950 p-4"
          >
            <p className="text-xs text-slate-500">{card.title}</p>
            <p className="mt-2 text-2xl font-semibold">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
