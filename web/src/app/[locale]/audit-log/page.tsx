import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { type AuditEntry, AuditDetails } from "@/components/audit/AuditDetails";
import { AppShell } from "@/components/shell/AppShell";
import { Link } from "@/i18n/navigation";
import { requireSignedIn } from "@/lib/require-session";
import { apiGet } from "@/lib/session";
import { titleFrom } from "@/lib/metadata";

type AuditPage = { entries: AuditEntry[]; people: Record<string, string>; nextBefore: string | null };

const CATEGORIES = ["", "control", "task", "evidence", "visit", "user", "auth"] as const;

export const generateMetadata = titleFrom("AuditLog", "title");

export default async function AuditLogPage({ params, searchParams }: PageProps<"/[locale]/audit-log">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireSignedIn(locale);
  const t = await getTranslations("AuditLog");
  const format = await getFormatter();
  const sp = await searchParams;
  const category = CATEGORIES.find((c) => c && c === sp.category) ?? "";
  const before = typeof sp.before === "string" && /^\d+$/.test(sp.before) ? sp.before : "";

  const canView = me.role === "ADMIN" || me.role === "AUDITOR";
  const qs = new URLSearchParams({ ...(category && { category }), ...(before && { before }) }).toString();
  const res = canView ? await apiGet<AuditPage>(`/audit-log${qs ? `?${qs}` : ""}`) : null;

  const eventName = (action: string) => {
    const key = `events.${action.replace(".", "_")}`;
    return t.has(key) ? t(key) : action;
  };
  const when = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh", numberingSystem: "latn" });

  return (
    <AppShell me={me} current="auditLog">
      <div className="flex flex-col gap-1">
        <h1 className="text-page-title font-bold">{t("title")}</h1>
        <p className="text-body-sm text-muted">{t("subtitle")}</p>
      </div>

      {!res?.ok ? (
        <p className="rounded-panel border border-line bg-surface p-6 text-body-sm text-muted">{canView ? t("loadFailed") : t("noAccess")}</p>
      ) : (
        <>
          <nav aria-label={t("categories")} className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <Link
                key={c || "all"}
                href={c ? `/audit-log?category=${c}` : "/audit-log"}
                aria-current={c === category ? "page" : undefined}
                className="inline-flex h-8 items-center rounded-control border border-transparent px-3 text-label text-muted no-underline hover:bg-surface-2
                           aria-[current=page]:border-saffron aria-[current=page]:bg-saffron-bg aria-[current=page]:text-text"
              >
                {t(`category.${c || "all"}`)}
              </Link>
            ))}
          </nav>

          {res.data.entries.length === 0 ? (
            <p className="rounded-panel border border-line bg-surface p-6 text-body-sm text-muted">{t("empty")}</p>
          ) : (
            <section aria-label={t("title")} className="overflow-hidden rounded-panel border border-line bg-surface">
              <table className="w-full border-collapse text-body-sm">
                <thead className="hidden md:table-header-group">
                  <tr className="border-b border-line text-label text-muted">
                    <th className="px-4 py-3 text-start font-medium">{t("colTime")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("colActor")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("colEvent")}</th>
                    <th className="px-4 py-3 text-start font-medium">{t("colDetails")}</th>
                  </tr>
                </thead>
                <tbody>
                  {res.data.entries.map((e) => (
                    <tr key={e.id} className="flex flex-col gap-1 border-b border-line px-4 py-3 align-top last:border-b-0 md:table-row md:px-0 md:py-0">
                      <td className="whitespace-nowrap text-label text-muted md:px-4 md:py-3 md:text-body-sm">
                        <time dateTime={e.createdAt}>{when(e.createdAt)}</time>
                      </td>
                      <td className="md:px-4 md:py-3">{e.actorId ? (res.data.people[e.actorId] ?? t("unknownPerson")) : t("system")}</td>
                      <td className="font-semibold md:px-4 md:py-3">{eventName(e.action)}</td>
                      <td className="md:px-4 md:py-3">
                        <AuditDetails entry={e} people={res.data.people} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <div className="flex gap-2">
            {before && (
              <Link
                href={category ? `/audit-log?category=${category}` : "/audit-log"}
                className="inline-flex h-10 items-center rounded-control border border-line bg-surface px-4 text-label no-underline hover:border-text"
              >
                {t("newest")}
              </Link>
            )}
            {res.data.nextBefore && (
              <Link
                href={`/audit-log?${new URLSearchParams({ ...(category && { category }), before: res.data.nextBefore })}`}
                className="inline-flex h-10 items-center rounded-control bg-ink px-4 text-label font-semibold text-on-ink no-underline hover:bg-ink-2"
              >
                {t("older")}
              </Link>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}
