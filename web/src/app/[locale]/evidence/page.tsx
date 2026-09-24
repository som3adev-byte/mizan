import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Code } from "@/components/controls/status";
import { ValidityBadge, formatSize } from "@/components/evidence/parts";
import { AppShell } from "@/components/shell/AppShell";
import { Link } from "@/i18n/navigation";
import { todayInRiyadh } from "@/lib/controls";
import { type Evidence, downloadUrl, validity } from "@/lib/evidence";
import { requireSignedIn } from "@/lib/require-session";
import { apiGet } from "@/lib/session";
import { titleFrom } from "@/lib/metadata";

const FILTERS = ["", "expiring", "expired"] as const;

export const generateMetadata = titleFrom("Evidence", "pageTitle");

export default async function EvidencePage({ params, searchParams }: PageProps<"/[locale]/evidence">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireSignedIn(locale);
  const t = await getTranslations("Evidence");
  const format = await getFormatter();
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f && f === sp.filter) ?? "";

  const res = await apiGet<Evidence[]>("/evidence");
  if (!res.ok) throw new Error(`GET /evidence failed with ${res.status}`);
  const today = todayInRiyadh();
  const all = res.data;
  const count = (kind: "expiring" | "expired") => all.filter((e) => validity(e.expiresOn, today).kind === kind).length;
  const shown = filter ? all.filter((e) => validity(e.expiresOn, today).kind === filter) : all;

  return (
    <AppShell me={me} current="evidence">
      <div className="flex flex-col gap-1">
        <h1 className="text-page-title font-bold">{t("pageTitle")}</h1>
        <p className="text-body-sm text-muted">{t("pageSubtitle")}</p>
      </div>

      <nav aria-label={t("filterLabel")} className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f || "all"}
            href={f ? `/evidence?filter=${f}` : "/evidence"}
            aria-current={f === filter ? "page" : undefined}
            className="inline-flex h-8 items-center gap-2 rounded-control border border-transparent px-3 text-label text-muted no-underline hover:bg-surface-2
                       aria-[current=page]:border-saffron aria-[current=page]:bg-saffron-bg aria-[current=page]:text-text"
          >
            {t(`filter.${f || "all"}`)}
            <span className="num">{f ? count(f) : all.length}</span>
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-panel border border-line bg-surface p-6">
          <p className="max-w-[65ch] text-body-sm text-muted">{filter ? t("emptyFiltered") : t("emptyPage")}</p>
          {!filter && (
            <Link href="/controls" className="inline-flex h-10 items-center rounded-control bg-ink px-4 text-label font-semibold text-on-ink no-underline hover:bg-ink-2">
              {t("openControls")}
            </Link>
          )}
        </div>
      ) : (
        <section aria-label={t("pageTitle")} className="overflow-hidden rounded-panel border border-line bg-surface">
          <table className="w-full border-collapse text-body-sm">
            <thead className="hidden md:table-header-group">
              <tr className="border-b border-line text-label text-muted">
                <th className="px-4 py-3 text-start font-medium">{t("colAction")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("colEvidence")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("colControl")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("colUploadedBy")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("colValidity")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} className="flex flex-col gap-2 border-b border-line px-4 py-4 last:border-b-0 hover:bg-surface-2 md:table-row md:px-0 md:py-0">
                  <td className="order-last md:px-4 md:py-3">
                    <a
                      href={downloadUrl(e.id)}
                      className="inline-flex h-11 w-full items-center justify-center rounded-control bg-ink px-4 text-body font-semibold text-on-ink no-underline hover:bg-ink-2 md:h-8 md:w-auto md:min-w-32 md:text-label"
                    >
                      {t("download")}
                    </a>
                  </td>
                  <td className="md:px-4 md:py-3">
                    <span className="block font-semibold">{e.title}</span>
                    <span className="text-label text-muted">
                      <bdi>{e.fileName}</bdi> · <span className="num">{formatSize(e.size)}</span>
                    </span>
                  </td>
                  <td className="md:px-4 md:py-3">
                    <Link href={`/controls?q=${e.controlCode}`} className="hover:underline hover:underline-offset-4">
                      <Code>{e.controlCode}</Code>
                    </Link>
                  </td>
                  <td className="text-muted md:px-4 md:py-3">
                    {e.uploadedBy.name} ·{" "}
                    {format.dateTime(new Date(e.createdAt), { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Riyadh", numberingSystem: "latn" })}
                  </td>
                  <td className="md:px-4 md:py-3">
                    <ValidityBadge expiresOn={e.expiresOn} today={today} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </AppShell>
  );
}
