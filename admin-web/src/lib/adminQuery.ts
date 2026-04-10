export type AdminQueryParams = {
  table: string;
  select?: string;
  filters?: { column: string; op: string; value: unknown }[];
  order?: { column: string; ascending?: boolean }[];
  limit?: number;
};

function parseJsonSafe(text: string, status: number): { data?: unknown[]; error?: string; count?: number } {
  try {
    return text ? (JSON.parse(text) as { data?: unknown[]; error?: string; count?: number }) : {};
  } catch {
    return { error: text?.slice(0, 200) || `Invalid response (${status})` };
  }
}

export async function adminQuery<T = unknown>(
  params: AdminQueryParams,
): Promise<{ data: T[]; error?: string }> {
  try {
    const res = await fetch("/api/admin/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      credentials: "include",
    });

    const text = await res.text();
    const json = parseJsonSafe(text, res.status);
    if (!res.ok || json.error) {
      return { data: [], error: json.error ?? `Request failed (${res.status})` };
    }
    return { data: (json.data ?? []) as T[] };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { data: [], error: msg };
  }
}

export async function adminCount(
  table: string,
  filters?: { column: string; op: string; value: unknown }[],
): Promise<number> {
  try {
    const res = await fetch("/api/admin/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table, select: "id", filters, countOnly: true }),
      credentials: "include",
    });

    const text = await res.text();
    const json = parseJsonSafe(text, res.status) as { count?: number; error?: string };
    if (!res.ok || json.error) return -1;
    return json.count ?? 0;
  } catch {
    return -1;
  }
}
