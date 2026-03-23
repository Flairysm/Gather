"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AdminRole = "admin" | "user";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/featured-banners", label: "Featured Banners" },
  { href: "/dashboard/vendor-stores", label: "Vendor Stores" },
  { href: "/dashboard/vendor-applications", label: "Vendor Applications" },
  { href: "/dashboard/listings", label: "Listings (soon)" },
  { href: "/dashboard/users", label: "Users (soon)" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);

  const [isChecking, setIsChecking] = useState(true);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (!user) {
        router.replace("/login");
        return;
      }

      setEmail(user.email ?? null);

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!mounted) return;

      if (error || !profile?.role) {
        router.replace("/login?error=not-authorized");
        return;
      }

      if (profile.role !== "admin") {
        router.replace("/login?error=not-authorized");
        return;
      }

      setRole(profile.role as AdminRole);
      setIsChecking(false);
    }

    checkAuth();

    return () => {
      mounted = false;
    };
  }, [router, supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (isChecking) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center">
        <p className="text-sm text-slate-400">Checking admin access...</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-[1400px] gap-4 p-4">
        <aside className="sticky top-4 h-[calc(100vh-2rem)] w-72 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Gather Admin
            </p>
            <h2 className="mt-2 text-lg font-semibold">Control Center</h2>
          </div>

          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-lg px-3 py-2 text-sm transition ${
                    active
                      ? "bg-sky-500/20 text-sky-300"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
            <p className="font-medium text-slate-300">{email ?? "Admin user"}</p>
            <p className="mt-1">Role: {role}</p>
          </div>

          <button
            onClick={handleSignOut}
            className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            Sign out
          </button>
        </aside>

        <section className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          {children}
        </section>
      </div>
    </div>
  );
}
