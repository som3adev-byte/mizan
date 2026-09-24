/** Browser-side JSON POST to the API through the /api rewrite. */
export async function postJson<T = unknown>(path: string, body: object = {}) {
  try {
    const res = await fetch(`/api${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (res.ok) return { ok: true as const, data: data as T };
    const code = (data as { code?: string } | null)?.code ?? "unknown";
    return { ok: false as const, code };
  } catch {
    return { ok: false as const, code: "unknown" };
  }
}
