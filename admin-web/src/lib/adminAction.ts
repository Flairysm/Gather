export async function adminAction<T = Record<string, unknown>>(
  action: string,
  params: Record<string, unknown> = {},
): Promise<{ ok: boolean; error?: string; data?: T }> {
  try {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...params }),
      credentials: "include",
    });

    const text = await res.text();
    let data: (T & { ok?: boolean; error?: string }) | Record<string, never> = {};
    try {
      data = text ? (JSON.parse(text) as T & { ok?: boolean; error?: string }) : {};
    } catch {
      return {
        ok: false,
        error: text?.slice(0, 200) || `Invalid response (${res.status})`,
      };
    }

    if (!res.ok || (data as { error?: string }).error) {
      return { ok: false, error: (data as { error?: string }).error ?? `Request failed (${res.status})` };
    }
    return { ok: true, data: data as T };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { ok: false, error: msg };
  }
}
