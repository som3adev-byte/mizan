import "server-only";
import { redirect } from "@/i18n/navigation";
import { type Me, getSession } from "./session";

/** For signed-in pages: returns the user, or redirects to sign-in / MFA. */
export async function requireSignedIn(locale: string): Promise<Me> {
  const session = await getSession();
  if (session.status === "signed-in") return session.me;
  return redirect({ href: session.status === "mfa-pending" ? "/mfa" : "/login", locale });
}
