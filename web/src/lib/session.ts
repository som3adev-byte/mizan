import "server-only";
import { cookies } from "next/headers";

export type Role = "ADMIN" | "CONTROL_OWNER" | "EXECUTIVE" | "AUDITOR";

export type Me = {
  id: string;
  name: string;
  email: string;
  role: Role;
  entity: { id: string; name: string; nameEn: string | null };
};

/** The entity's name for this interface language: the English one when set, else the Arabic. */
export const entityName = (entity: Me["entity"], locale: string) => (locale === "en" && entity.nameEn) || entity.name;

export type SessionState = { status: "signed-in"; me: Me } | { status: "mfa-pending" } | { status: "signed-out" };

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3001";

/** Asks the API who owns the current session cookie. The API is the only authority. */
export async function getSession(): Promise<SessionState> {
  const cookie = (await cookies()).toString();
  if (!cookie.includes("mizan_session=")) return { status: "signed-out" };

  const res = await fetch(`${API_ORIGIN}/auth/me`, { headers: { cookie }, cache: "no-store" });
  if (res.ok) return { status: "signed-in", me: (await res.json()) as Me };

  const body = (await res.json().catch(() => ({}))) as { code?: string };
  return body.code === "mfa_required" ? { status: "mfa-pending" } : { status: "signed-out" };
}

/** Server-side GET to the API with the caller's cookie. */
export async function apiGet<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  const cookie = (await cookies()).toString();
  const res = await fetch(`${API_ORIGIN}${path}`, { headers: { cookie }, cache: "no-store" });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, data: (await res.json()) as T };
}
