"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ControlDrawer } from "@/components/controls/ControlDrawer";
import { Code } from "@/components/controls/status";
import { IconCalendar, IconClock, IconFile, IconTask, IconUser } from "@/components/icons";
import { Link } from "@/i18n/navigation";
import type { Alert } from "@/lib/alerts";
import type { Assignee, ControlsPayload, Subdomain } from "@/lib/controls";
import type { Role } from "@/lib/session";

type Props = {
  alerts: Alert[];
  controls: ControlsPayload;
  today: string;
  me: { id: string; role: Role };
  assignees: Assignee[] | null;
};

/** Alerts as action cards, the action first, grouped by urgency. */
export function AlertsList({ alerts, controls, today, me, assignees }: Props) {
  const t = useTranslations("Alerts");
  const ar = useLocale() === "ar";
  const [openCode, setOpenCode] = useState<string | null>(null);

  const subdomains = new Map<string, Subdomain>();
  for (const d of controls.domains) for (const s of d.subdomains) for (const c of s.controls) subdomains.set(c.code, s);

  const message = (a: Alert) => {
    const n = a.days ?? 0;
    return t(`kind.${a.kind}`, { count: n, n, title: a.title ?? "", gaps: a.openGaps ?? 0 });
  };

  const groups = [
    { key: "high", items: alerts.filter((a) => a.severity === "high") },
    { key: "medium", items: alerts.filter((a) => a.severity === "medium") },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      {alerts.length === 0 ? (
        <p className="rounded-panel border border-line bg-surface p-6 text-body-sm text-muted">{t("empty")}</p>
      ) : (
        groups.map(({ key, items }) =>
          items.length === 0 ? null : (
            <section key={key} aria-labelledby={`alerts-${key}`} className="flex flex-col gap-3">
              <h2 id={`alerts-${key}`} className={`flex items-baseline gap-2 text-headline font-bold ${key === "high" ? "text-status-noncompliant" : ""}`}>
                {t(`group.${key}`)} <span className="num text-body font-medium text-muted">({items.length})</span>
              </h2>
              <ul className="flex flex-col gap-3">
                {items.map((a) => {
                  const Icon = a.kind === "audit_visit" ? IconCalendar : a.kind.startsWith("evidence") ? IconFile : a.kind.startsWith("task") ? IconTask : a.severity === "high" ? IconClock : IconCalendar;
                  const sub = a.controlCode ? subdomains.get(a.controlCode) : undefined;
                  const action = "order-last col-span-2 h-11 rounded-control bg-ink px-4 text-body font-semibold text-on-ink hover:bg-ink-2 md:order-none md:col-span-1 md:h-8 md:text-label";
                  return (
                    <li
                      key={a.id}
                      className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-panel border border-line bg-surface p-4 md:grid-cols-[8rem_auto_1fr] md:items-center"
                    >
                      {a.controlCode ? (
                        <button type="button" onClick={() => setOpenCode(a.controlCode)} className={action}>
                          {t("open")}
                        </button>
                      ) : (
                        // The visit is entity-wide: prepare for it from the report.
                        <Link href="/reports" className={`${action} inline-flex items-center justify-center no-underline`}>
                          {t("openReport")}
                        </Link>
                      )}
                      <Icon className={`size-5 ${a.severity === "high" ? "text-status-noncompliant" : "text-status-partial-text"}`} />
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className={`font-semibold ${a.severity === "high" ? "text-status-noncompliant" : "text-status-partial-text"}`}>{message(a)}</span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-muted">
                          {a.kind === "audit_visit" && <span>{t("visitGaps", { count: a.openGaps ?? 0, n: a.openGaps ?? 0 })}</span>}
                          {a.controlCode && <Code className="text-text">{a.controlCode}</Code>}
                          {sub && <span>{ar ? sub.nameAr : sub.nameEn}</span>}
                          {a.kind !== "audit_visit" && (
                            <span className="inline-flex items-center gap-1">
                              <IconUser className="size-3.5" />
                              {a.owner?.name ?? t("unassigned")}
                            </span>
                          )}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ),
        )
      )}
      <ControlDrawer data={controls} code={openCode} onClose={() => setOpenCode(null)} me={me} assignees={assignees} today={today} />
    </div>
  );
}
