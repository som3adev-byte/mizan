import { getTranslations, setRequestLocale } from "next-intl/server";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { AppShell } from "@/components/shell/AppShell";
import type { UsersPayload } from "@/components/users/UsersList";
import { type Assignee, type ControlsPayload, todayInRiyadh } from "@/lib/controls";
import { requireSignedIn } from "@/lib/require-session";
import { apiGet } from "@/lib/session";
import { titleFrom } from "@/lib/metadata";

export const generateMetadata = titleFrom("Dashboard", "title", { absolute: true });

export default async function DashboardPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireSignedIn(locale);
  const t = await getTranslations("Dashboard");

  const [controls, users] = await Promise.all([
    apiGet<ControlsPayload>("/controls"),
    me.role === "ADMIN" ? apiGet<UsersPayload>("/users") : null,
  ]);
  // A failed load is an error the page cannot hide; error.tsx explains it.
  if (!controls.ok) throw new Error(`GET /controls failed with ${controls.status}`);

  // Only active Admins and Control Owners can own controls.
  const assignees: Assignee[] | null = users?.ok
    ? users.data.users
        .filter((u) => u.status === "ACTIVE" && (u.role === "ADMIN" || u.role === "CONTROL_OWNER"))
        .map((u) => ({ id: u.id, name: u.name }))
    : null;

  return (
    <AppShell me={me} current="dashboard">
      <h1 className="sr-only">{t("title")}</h1>
      <Dashboard data={controls.data} today={todayInRiyadh()} me={{ id: me.id, role: me.role }} assignees={assignees} />
    </AppShell>
  );
}
