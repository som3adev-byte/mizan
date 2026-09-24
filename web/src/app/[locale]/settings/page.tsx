import { getTranslations, setRequestLocale } from "next-intl/server";
import { CloudQuestion } from "@/components/entity/CloudQuestion";
import { EntityNames } from "@/components/entity/EntityNames";
import { VisitsSection } from "@/components/visits/VisitsSection";
import { todayInRiyadh } from "@/lib/controls";
import type { VisitsPayload } from "@/lib/visits";
import { AppShell } from "@/components/shell/AppShell";
import { InviteUserForm } from "@/components/users/InviteUserForm";
import { UsersList, type UsersPayload } from "@/components/users/UsersList";
import { requireSignedIn } from "@/lib/require-session";
import { apiGet } from "@/lib/session";
import { titleFrom } from "@/lib/metadata";

export const generateMetadata = titleFrom("Nav", "settings");

export default async function SettingsPage({ params }: PageProps<"/[locale]/settings">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireSignedIn(locale);
  const t = await getTranslations("Users");
  const nav = await getTranslations("Nav");

  const canView = me.role === "ADMIN" || me.role === "AUDITOR";
  const canEdit = me.role === "ADMIN";
  const [data, entity, visits] = await Promise.all([
    canView ? apiGet<UsersPayload>("/users") : null,
    apiGet<{ id: string; name: string; nameEn: string | null; usesCloud: boolean | null }>("/entity"),
    apiGet<VisitsPayload>("/visits"),
  ]);

  return (
    <AppShell me={me} current="settings">
      <div className="flex flex-col gap-1">
        <h1 className="text-page-title font-bold">{nav("settings")}</h1>
        <p className="text-body-sm text-muted">{nav("settingsSubtitle")}</p>
      </div>

      {entity.ok && (
        <>
          <EntityNames name={entity.data.name} nameEn={entity.data.nameEn} canEdit={canEdit} />
          <CloudQuestion usesCloud={entity.data.usesCloud} canEdit={canEdit} />
        </>
      )}
      {visits.ok && <VisitsSection data={visits.data} today={todayInRiyadh()} canEdit={canEdit} />}

      {!canView || !data?.ok ? (
        <p className="rounded-panel border border-line bg-surface p-6 text-body-sm text-muted">{t("noAccess")}</p>
      ) : (
        <>
          {!canEdit && <p className="text-body-sm text-muted">{t("readOnly")}</p>}
          {canEdit && <InviteUserForm />}
          <UsersList data={data.data} meId={me.id} canEdit={canEdit} />
        </>
      )}
    </AppShell>
  );
}
