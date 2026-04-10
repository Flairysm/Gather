export async function adminAction(
  action: string,
  params: Record<string, unknown> = {},
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...params }),
      credentials: "include",
    });

    const text = await res.text();
    let data: { ok?: boolean; error?: string } = {};
    try {
      data = text ? (JSON.parse(text) as { ok?: boolean; error?: string }) : {};
    } catch {
      return {
        ok: false,
        error: text?.slice(0, 200) || `Invalid response (${res.status})`,
      };
    }

    if (!res.ok || data.error) {
      return { ok: false, error: data.error ?? `Request failed (${res.status})` };
    }
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { ok: false, error: msg };
  }
}
