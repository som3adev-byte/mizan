import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Code, STATUS_STYLE, StatusChip, StatusIcon } from "@/components/controls/status";
import { IconClock } from "@/components/icons";
import { LogoMark } from "@/components/brand/Logo";
import { PrintButton } from "@/components/reports/PrintButton";
import { AppShell } from "@/components/shell/AppShell";
import { type Control, type ControlsPayload, STATUS_ORDER, daysUntil, todayInRiyadh } from "@/lib/controls";
import { type Evidence, validity } from "@/lib/evidence";
import { requireSignedIn } from "@/lib/require-session";
import { apiGet, entityName } from "@/lib/session";
import type { Task } from "@/lib/tasks";
import { titleFrom } from "@/lib/metadata";

/**
 * Compliance report, built to be printed or saved as PDF from the browser
 * (no server-side PDF library). Every role can read it; it carries
 * the internal-score and independence notes required by the product.
 */
export const generateMetadata = titleFrom("Nav", "reports");

export default async function ReportsPage({ params }: PageProps<"/[locale]/reports">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireSignedIn(locale);
  const t = await getTranslations("Reports");
  const st = await getTranslations("Status");
  const footer = await getTranslations("Footer");
  const format = await getFormatter();
  const ar = locale === "ar";

  const [controls, tasks, evidence] = await Promise.all([
    apiGet<ControlsPayload>("/controls"),
    apiGet<Task[]>("/tasks"),
    apiGet<Evidence[]>("/evidence"),
  ]);
  if (!controls.ok || !tasks.ok || !evidence.ok) throw new Error("Report data failed to load");

  const today = todayInRiyadh();
  const { summary, domains } = controls.data;
  const name = (x: { nameAr: string; nameEn: string }) => (ar ? x.nameAr : x.nameEn);
  const pct = (s: number | null) => (s === null ? "—" : `${s}%`);
  const date = (d: string) => format.dateTime(new Date(`${d}T00:00:00Z`), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC", numberingSystem: "latn" });
  const text = (c: Control) => (ar ? c.textAr : (c.textEn ?? c.textAr));

  const all = domains.flatMap((d) => d.subdomains.flatMap((s) => s.controls.map((c) => ({ c, s }))));
  const gaps = all.filter(({ c }) => c.status === "NON_COMPLIANT" || c.status === "PARTIAL");
  // Per control: how many remediation steps exist and how many are still open.
  const plans = new Map<string, { total: number; open: number }>();
  for (const x of tasks.data) {
    const p = plans.get(x.controlCode) ?? { total: 0, open: 0 };
    p.total += 1;
    if (!x.done) p.open += 1;
    plans.set(x.controlCode, p);
  }
  const planText = (code: string) => {
    const p = plans.get(code);
    if (!p) return <span className="text-muted">{t("noPlan")}</span>;
    if (p.open === 0) return t("planDone", { count: p.total, n: p.total });
    return t("planOpen", { count: p.open, n: p.open, total: p.total });
  };
  const overdueSteps = tasks.data.filter((x) => !x.done && x.dueDate && daysUntil(today, x.dueDate) < 0).length;
  const expired = evidence.data.filter((e) => validity(e.expiresOn, today).kind === "expired").length;
  const expiring = evidence.data.filter((e) => validity(e.expiresOn, today).kind === "expiring").length;
  const unassigned = all.filter(({ c }) => !c.owner && c.status !== "NOT_APPLICABLE").length;

  const th = "whitespace-nowrap px-3 py-2 text-start text-label font-medium text-muted";
  const td = "px-3 py-2 align-top";

  return (
    <AppShell me={me} current="reports">
      <article className="flex flex-col gap-8 print:gap-6 print:text-body-sm">
        <header className="flex flex-wrap items-start gap-4 border-b border-line pb-6">
          <div className="flex flex-col gap-1">
            <p className="flex items-center gap-2 text-label text-muted">
              <LogoMark className="size-5 text-ink" />
              {t("kicker")}
            </p>
            <h1 className="text-page-title font-bold">{t("title", { entity: entityName(me.entity, locale) })}</h1>
            <p className="text-body-sm text-muted">{t("meta", { date: date(today), name: me.name })}</p>
          </div>
          <div className="ms-auto">
            <PrintButton />
          </div>
        </header>

        {/* 1. Summary */}
        <section aria-labelledby="r-summary" className="flex flex-col gap-4 break-inside-avoid">
          <h2 id="r-summary" className="text-headline font-bold">{t("summaryTitle")}</h2>
          <div className="grid gap-4 md:grid-cols-[auto_1fr] print:grid-cols-[auto_1fr]">
            <div className="flex flex-col gap-1 rounded-panel border border-line bg-surface p-6">
              <span className="text-label text-muted">{t("overall")}</span>
              <span className="num text-display-mobile font-bold leading-none">{pct(summary.score)}</span>
              <span className="text-label text-muted">{t("internalNote")}</span>
            </div>
            <div className="grid grid-cols-5 rounded-panel border border-line bg-surface p-4">
              {STATUS_ORDER.map((s) => (
                <div key={s} className="flex flex-col items-center gap-1 text-center">
                  <StatusIcon status={s} className="size-6" />
                  <span className="text-label">{st(s)}</span>
                  <span className={`num text-stat font-bold ${STATUS_STYLE[s].count}`}>{summary.counts[s]}</span>
                </div>
              ))}
            </div>
          </div>
          <ul className="grid gap-2 text-body-sm md:grid-cols-2 print:grid-cols-2">
            <li>{t("factGaps", { count: gaps.length, n: gaps.length })}</li>
            <li>{t("factUnassigned", { count: unassigned, n: unassigned })}</li>
            <li>{t("factSteps", { count: tasks.data.filter((x) => !x.done).length, n: tasks.data.filter((x) => !x.done).length, overdue: overdueSteps })}</li>
            <li>{t("factEvidence", { count: evidence.data.length, n: evidence.data.length, expired, expiring })}</li>
          </ul>
        </section>

        {/* 2. Domains */}
        <section aria-labelledby="r-domains" className="flex flex-col gap-3">
          <h2 id="r-domains" className="text-headline font-bold">{t("domainsTitle")}</h2>
          <div className="overflow-x-auto rounded-panel border border-line bg-surface">
            <table className="w-full border-collapse text-body-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className={th}>{t("colDomain")}</th>
                  <th className={th}>{t("colScore")}</th>
                  {STATUS_ORDER.map((s) => (
                    <th key={s} className={`${th} text-center`}>{st(s)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {domains.flatMap((d) => [
                  <tr key={d.code} className="border-b border-line bg-surface-2 font-bold">
                    <td className={td}>{d.code}. {name(d)}</td>
                    <td className={`${td} num`}>{pct(d.summary.score)}</td>
                    {STATUS_ORDER.map((s) => <td key={s} className={`${td} num text-center`}>{d.summary.counts[s]}</td>)}
                  </tr>,
                  ...d.subdomains.map((s) => (
                    <tr key={s.code} className="border-b border-line last:border-b-0">
                      <td className={`${td} ps-6`}><Code className="text-muted">{s.code}</Code> {name(s)}</td>
                      <td className={`${td} num`}>{pct(s.summary.score)}</td>
                      {STATUS_ORDER.map((x) => <td key={x} className={`${td} num text-center text-muted`}>{s.summary.counts[x]}</td>)}
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        </section>

        {/* 3. Gaps */}
        <section aria-labelledby="r-gaps" className="flex flex-col gap-3 print:break-before-page">
          <h2 id="r-gaps" className="text-headline font-bold">{t("gapsTitle")} <span className="num text-body font-medium text-muted">({gaps.length})</span></h2>
          {gaps.length === 0 ? (
            <p className="text-body-sm text-muted">{t("noGaps")}</p>
          ) : (
            <div className="overflow-x-auto rounded-panel border border-line bg-surface">
              <table className="w-full border-collapse text-body-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className={th}>{t("colControl")}</th>
                    <th className={th}>{t("colText")}</th>
                    <th className={th}>{t("colStatus")}</th>
                    <th className={th}>{t("colOwner")}</th>
                    <th className={th}>{t("colDue")}</th>
                    <th className={th}>{t("colPlan")}</th>
                  </tr>
                </thead>
                <tbody>
                  {gaps.map(({ c }) => (
                    <tr key={c.code} className="break-inside-avoid border-b border-line last:border-b-0">
                      <td className={`${td} whitespace-nowrap font-semibold`}><Code>{c.code}</Code></td>
                      <td className={`${td} min-w-64`}>{text(c)}</td>
                      <td className={td}><StatusChip status={c.status} /></td>
                      <td className={`${td} whitespace-nowrap`}>{c.owner?.name ?? <span className="text-muted">{t("unassigned")}</span>}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        {c.dueDate ? (
                          daysUntil(today, c.dueDate) < 0 ? (
                            // Late is said in words and with an icon, never by colour alone.
                            <span className="inline-flex flex-col font-semibold text-status-noncompliant">
                              <span>{date(c.dueDate)}</span>
                              <span className="inline-flex items-center gap-1 text-badge">
                                <IconClock className="size-3.5" />
                                {t("overdueBy", { count: -daysUntil(today, c.dueDate), n: -daysUntil(today, c.dueDate) })}
                              </span>
                            </span>
                          ) : (
                            <span>{date(c.dueDate)}</span>
                          )
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className={td}>{planText(c.code)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 4. Appendix: every control */}
        <section aria-labelledby="r-all" className="flex flex-col gap-3 print:break-before-page">
          <h2 id="r-all" className="text-headline font-bold">{t("allTitle")} <span className="num text-body font-medium text-muted">({summary.total})</span></h2>
          <div className="overflow-x-auto rounded-panel border border-line bg-surface">
            <table className="w-full border-collapse text-body-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className={th}>{t("colControl")}</th>
                  <th className={th}>{t("colSubdomain")}</th>
                  <th className={th}>{t("colStatus")}</th>
                  <th className={th}>{t("colOwner")}</th>
                  <th className={th}>{t("colEvidence")}</th>
                </tr>
              </thead>
              <tbody>
                {all.map(({ c, s }) => (
                  <tr key={c.code} className="break-inside-avoid border-b border-line last:border-b-0">
                    <td className={`${td} whitespace-nowrap font-semibold`}><Code>{c.code}</Code></td>
                    <td className={td}>{name(s)}</td>
                    <td className={td}><StatusChip status={c.status} /></td>
                    <td className={`${td} whitespace-nowrap`}>{c.owner?.name ?? <span className="text-muted">—</span>}</td>
                    <td className={`${td} num`}>{c.evidenceCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="flex flex-col gap-1 border-t border-line pt-4 text-label text-muted">
          <span>{footer("independence")}</span>
          <span>{footer("internalScore")}</span>
          <span>{t("source")}</span>
        </footer>
      </article>
    </AppShell>
  );
}
