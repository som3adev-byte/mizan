import { getFormatter, getTranslations } from "next-intl/server";
import type { ComponentType, SVGProps } from "react";
import { Logo } from "@/components/brand/Logo";
import { Link } from "@/i18n/navigation";
import {
  IconBell,
  IconCalendar,
  IconCog,
  IconFile,
  IconGrid,
  IconLog,
  IconMore,
  IconReport,
  IconShield,
  IconTask,
} from "@/components/icons";

type NavItem = {
  key: "dashboard" | "controls" | "evidence" | "tasks" | "reports" | "auditLog" | "settings" | "alerts" | "more";
  href: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  // Where the item shows: the desktop rail, the mobile tab bar, or both.
  on: "both" | "rail" | "tabs";
};

const NAV: NavItem[] = [
  { key: "dashboard", href: "/", Icon: IconGrid, on: "both" },
  { key: "controls", href: "/controls", Icon: IconShield, on: "both" },
  { key: "alerts", href: "/alerts", Icon: IconBell, on: "both" },
  { key: "evidence", href: "/evidence", Icon: IconFile, on: "both" },
  { key: "tasks", href: "/tasks", Icon: IconTask, on: "rail" },
  { key: "reports", href: "/reports", Icon: IconReport, on: "rail" },
  { key: "auditLog", href: "/audit-log", Icon: IconLog, on: "rail" },
  { key: "settings", href: "/settings", Icon: IconCog, on: "rail" },
  { key: "more", href: "/more", Icon: IconMore, on: "tabs" },
];

/** `alertCount` is the number of high-priority alerts; it shows as a red dot on the alerts item. */
export type EvidenceSummary = { total: number; expired: number; expiring: number };
/** The next auditor visit and how many days away it is (from the server, in Riyadh time). */
export type NextVisit = { visitDate: string; days: number } | null;

export async function Sidebar({
  current,
  alertCount = 0,
  evidence = null,
  visit = null,
}: {
  current: NavItem["key"];
  alertCount?: number;
  /** Desktop rail card; hidden when the counts could not load. */
  evidence?: EvidenceSummary | null;
  /** Desktop rail card; absent when no visit is scheduled. */
  visit?: NextVisit;
}) {
  const t = await getTranslations("Nav");
  const format = await getFormatter();

  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line bg-surface px-1 pb-[calc(4px+env(safe-area-inset-bottom))] pt-1
                 md:sticky md:top-0 md:h-dvh md:flex-col md:justify-start md:gap-1 md:border-0 md:bg-rail md:px-3 dark:md:border-e dark:md:border-line md:py-8 print:hidden"
    >
      {/* Logo at the top of the desktop rail; the mobile tab bar has no header. */}
      <Link href="/" aria-label={t("home")} className="mb-4 hidden px-2 text-on-rail no-underline md:block">
        <Logo markClassName="size-7" />
      </Link>
      
      {NAV.map(({ key, href, Icon, on }) => {
        const active = key === current;
        const visibility = on === "rail" ? "hidden md:flex" : on === "tabs" ? "flex md:hidden" : "flex";
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`${visibility} relative flex-1 flex-col items-center gap-1 px-1 py-2 text-badge text-muted no-underline
                        md:flex-none md:flex-row md:gap-3 md:rounded-control md:px-4 md:py-3 md:text-body md:text-nav-text
                        md:hover:bg-rail-2 md:hover:text-on-rail
                        ${active ? "font-semibold text-text md:bg-rail-3 md:text-on-rail md:shadow-[inset_0_0_0_1px_var(--color-nav-ring)]" : ""}`}
          >
            <Icon className={`size-6 md:size-[18px] ${active ? "text-text md:text-on-rail" : "md:text-nav-muted"}`} />
            <span>{t(key)}</span>
            {key === "alerts" && alertCount > 0 && (
              <span
                aria-label={t("alertCount", { count: alertCount })}
                className="num absolute start-[calc(50%+2px)] top-0 min-w-[18px] rounded-pill bg-danger-fill px-1 text-center text-badge font-bold leading-[18px] text-on-rail
                           md:static md:ms-auto"
              >
                {alertCount}
              </span>
            )}
            {active && (
              <span aria-hidden="true" className="absolute inset-x-[30%] -bottom-1 h-[3px] rounded-pill bg-text md:hidden" />
            )}
          </Link>
        );
      })}

      <span aria-hidden="true" className="hidden flex-1 md:block" />

      {visit && (
        <Link
          href="/settings#visits"
          className="mb-2 hidden items-start gap-3 rounded-panel border border-nav-edge bg-rail-2 p-4 text-label leading-relaxed text-nav-muted no-underline hover:border-nav-ring md:flex"
        >
          <IconCalendar className="mt-1 size-[18px] shrink-0" />
          <span className="flex flex-col">
            <span>{t("visitCard")}</span>
            <b className="text-body font-semibold text-on-rail">
              {visit.days === 0 ? t("visitToday") : t("visitIn", { count: visit.days, n: visit.days })}
            </b>
            <span>
              {format.dateTime(new Date(`${visit.visitDate}T00:00:00Z`), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC", numberingSystem: "latn" })}
            </span>
          </span>
        </Link>
      )}

      {evidence && (
        <>
          <Link
            href="/evidence"
            className="hidden items-start gap-3 rounded-panel border border-nav-edge bg-rail-2 p-4 text-label leading-relaxed text-nav-muted no-underline hover:border-nav-ring md:flex"
          >
            <IconFile className="mt-1 size-[18px] shrink-0" />
            <span className="flex flex-col">
              <span>{t("evidenceCard")}</span>
              <b className="text-body font-semibold text-on-rail">{t("evidenceTotal", { count: evidence.total, n: evidence.total })}</b>
              {evidence.expired > 0 && <span className="text-amber-on-ink">{t("evidenceExpired", { count: evidence.expired, n: evidence.expired })}</span>}
              {evidence.expiring > 0 && <span className="text-amber-on-ink">{t("evidenceExpiring", { count: evidence.expiring, n: evidence.expiring })}</span>}
            </span>
          </Link>
        </>
      )}
    </nav>
  );
}
