import { getTranslations, setRequestLocale } from "next-intl/server";
import { type ControlsFilters, ControlsBrowser } from "@/components/controls/ControlsBrowser";
import { AppShell } from "@/components/shell/AppShell";
import type { UsersPayload } from "@/components/users/UsersList";
import { type Assignee, type ComplianceStatus, type ControlsPayload, STATUS_ORDER, todayInRiyadh } from "@/lib/controls";
import { requireSignedIn } from "@/lib/require-session";
import { apiGet } from "@/lib/session";
import { titleFrom } from "@/lib/metadata";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export const generateMetadata = titleFrom("Controls", "title");

export default async function ControlsPage({ params, searchParams }: PageProps<"/[locale]/controls">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireSignedIn(locale);
  const t = await getTranslations("Controls");
  const sp = await searchParams;

  const [controls, users] = await Promise.all([
    apiGet<ControlsPayload>("/controls"),
    me.role === "ADMIN" ? apiGet<UsersPayload>("/users") : null,
  ]);
  if (!controls.ok) throw new Error(`GET /controls failed with ${controls.status}`);

  const assignees: Assignee[] | null = users?.ok
    ? users.data.users
        .filter((u) => u.status === "ACTIVE" && (u.role === "ADMIN" || u.role === "CONTROL_OWNER"))
        .map((u) => ({ id: u.id, name: u.name }))
    : null;

  const initial: ControlsFilters = {
    q: one(sp.q),
    statuses: one(sp.status)
      .split(",")
      .filter((s): s is ComplianceStatus => STATUS_ORDER.includes(s as ComplianceStatus)),
    domain: controls.data.domains.some((d) => d.code === one(sp.domain)) ? one(sp.domain) : "",
    owner: one(sp.owner),
  };

  return (
    <AppShell me={me} current="controls">
      <div className="flex flex-col gap-1">
        <h1 className="text-page-title font-bold">{t("title")}</h1>
        <p className="text-body-sm text-muted">{t("subtitle", { total: controls.data.summary.total })}</p>
      </div>
      <ControlsBrowser data={controls.data} today={todayInRiyadh()} me={{ id: me.id, role: me.role }} assignees={assignees} initial={initial} />
    </AppShell>
  );
}
