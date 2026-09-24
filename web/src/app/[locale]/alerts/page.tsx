import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlertsList } from "@/components/alerts/AlertsList";
import { AppShell } from "@/components/shell/AppShell";
import type { UsersPayload } from "@/components/users/UsersList";
import type { AlertsPayload } from "@/lib/alerts";
import { type Assignee, type ControlsPayload, todayInRiyadh } from "@/lib/controls";
import { requireSignedIn } from "@/lib/require-session";
import { apiGet } from "@/lib/session";
import { titleFrom } from "@/lib/metadata";

export const generateMetadata = titleFrom("Alerts", "title");

export default async function AlertsPage({ params }: PageProps<"/[locale]/alerts">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireSignedIn(locale);
  const t = await getTranslations("Alerts");

  const [alerts, controls, users] = await Promise.all([
    apiGet<AlertsPayload>("/alerts"),
    apiGet<ControlsPayload>("/controls"),
    me.role === "ADMIN" ? apiGet<UsersPayload>("/users") : null,
  ]);
  if (!alerts.ok) throw new Error(`GET /alerts failed with ${alerts.status}`);
  if (!controls.ok) throw new Error(`GET /controls failed with ${controls.status}`);
  const assignees: Assignee[] | null = users?.ok
    ? users.data.users.filter((u) => u.status === "ACTIVE" && (u.role === "ADMIN" || u.role === "CONTROL_OWNER")).map((u) => ({ id: u.id, name: u.name }))
    : null;

  return (
    <AppShell me={me} current="alerts">
      <div className="flex flex-col gap-1">
        <h1 className="text-page-title font-bold">{t("title")}</h1>
        <p className="text-body-sm text-muted">{me.role === "CONTROL_OWNER" ? t("subtitleOwner") : t("subtitle")}</p>
      </div>
      <AlertsList alerts={alerts.data.alerts} controls={controls.data} today={todayInRiyadh()} me={{ id: me.id, role: me.role }} assignees={assignees} />
    </AppShell>
  );
}
