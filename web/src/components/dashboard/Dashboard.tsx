"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { IconCalendar, IconChevron, IconClock, IconUser } from "@/components/icons";
import { Link } from "@/i18n/navigation";
import { CellMark, Code, STATUS_STYLE, StatusChip, StatusIcon } from "@/components/controls/status";
import { ControlDrawer } from "@/components/controls/ControlDrawer";
import {
  type Assignee,
  type AttentionItem,
  type ComplianceStatus,
  type ControlsPayload,
  STATUS_ORDER,
  attentionItems,
} from "@/lib/controls";
import type { Role } from "@/lib/session";

type Props = {
  data: ControlsPayload;
  today: string;
  me: { id: string; role: Role };
  /** People the Admin can assign controls to; null for everyone else. */
  assignees: Assignee[] | null;
};

const scrollTo = (el: HTMLElement | null) => el?.scrollIntoView({ behavior: "smooth", block: "start" });

export function Dashboard({ data, today, me, assignees }: Props) {
  const t = useTranslations("Dashboard");
  const st = useTranslations("Status");
  const locale = useLocale();
  const ar = locale === "ar";

  const [filter, setFilter] = useState<Set<ComplianceStatus>>(new Set());
  const [focusDomain, setFocusDomain] = useState<string | null>(null);
  const [openCode, setOpenCode] = useState<string | null>(null);
  const mapRef = useRef<HTMLElement>(null);
  const attentionRef = useRef<HTMLElement>(null);

  const { summary, domains } = data;
  // A Control Owner's list shows their own controls; everyone else sees all.
  const items = useMemo(
    () => attentionItems(domains, today, me.role === "CONTROL_OWNER" ? me.id : undefined),
    [domains, today, me],
  );
  const flagged = useMemo(() => new Set(items.map((i) => i.control.code)), [items]);
  const urgent = items.filter((i) => i.kind !== "dueSoon").length;

  // The weakest scored domain is marked only when the scores actually differ.
  const scored = domains.filter((d) => d.summary.score !== null);
  const lowest = Math.min(...scored.map((d) => d.summary.score!));
  const weakest = new Set(scored.map((d) => d.summary.score)).size > 1 ? scored.find((d) => d.summary.score === lowest)!.code : null;

  const toggleStatus = (s: ComplianceStatus) =>
    setFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const name = (x: { nameAr: string; nameEn: string }) => (ar ? x.nameAr : x.nameEn);
  const pct = (score: number | null) => (score === null ? "—" : `${score}%`);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {me.role === "ADMIN" && data.usesCloud === null && (
        <div className="order-first flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-4 py-3 md:order-none">
          <p className="text-body-sm">{t("cloudPrompt")}</p>
          <Link href="/settings" className="ms-auto inline-flex h-8 items-center rounded-control bg-ink px-4 text-label font-semibold text-on-ink no-underline hover:bg-ink-2">
            {t("cloudPromptAction")}
          </Link>
        </div>
      )}
      <div className="contents md:grid md:grid-cols-2 md:gap-6 lg:grid-cols-[1.05fr_1fr_1.05fr]">
        {/* Domain results */}
        <section aria-labelledby="h-dom" className="order-2 rounded-panel border border-line bg-surface p-4 md:order-none md:p-6">
          <h2 id="h-dom" className="mb-4 text-headline font-bold">
            {t("domainsTitle")}
          </h2>
          <div className="flex flex-col gap-3">
            {domains.map((d) => {
              const pressed = focusDomain === d.code;
              const isWeak = d.code === weakest;
              const score = d.summary.score ?? 0;
              const barColor = isWeak ? "bg-status-noncompliant-bar" : score >= 80 ? "bg-status-compliant-bar" : "bg-status-partial-bar";
              return (
                <button
                  key={d.code}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => {
                    setFocusDomain(pressed ? null : d.code);
                    if (!pressed) scrollTo(mapRef.current);
                  }}
                  className="group grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 rounded-control py-2 text-start"
                >
                  <span className={`flex items-center gap-2 text-body-sm font-medium group-hover:underline group-hover:underline-offset-4 ${pressed ? "text-saffron-text" : ""}`}>
                    <IconChevron className={`flip-rtl size-4 ${pressed ? "text-saffron-text" : "text-faint"}`} />
                    {name(d)}
                    {isWeak && (
                      <span className="rounded-badge bg-status-noncompliant-bg px-2 text-badge font-semibold leading-[22px] text-status-noncompliant">
                        {t("weakest")}
                      </span>
                    )}
                  </span>
                  <span className="num text-body font-bold">{pct(d.summary.score)}</span>
                  <span className="col-span-2 h-1.5 overflow-hidden rounded-pill bg-surface-2">
                    <span className={`block h-full rounded-pill ${barColor}`} style={{ width: `${score}%` }} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Overall score */}
        <section aria-labelledby="h-score" className="order-1 flex flex-col justify-center rounded-panel border border-line bg-surface p-4 md:order-none md:p-6">
          <h2 id="h-score" className="mb-4 text-headline font-bold">
            {t("scoreTitle")}
          </h2>
          <p className="text-display-mobile font-bold leading-none tracking-[-0.02em] md:text-display">
            <span className="num">{pct(summary.score)}</span>
          </p>
          <div
            role="img"
            aria-label={(["COMPLIANT", "PARTIAL", "NON_COMPLIANT", "NOT_STARTED"] as const).map((s) => `${st(s)} ${summary.counts[s]}`).join(ar ? "، " : ", ")}
            className="mb-3 mt-6 flex h-2 gap-1 overflow-hidden rounded-badge"
          >
            {(["COMPLIANT", "PARTIAL", "NON_COMPLIANT", "NOT_STARTED"] as const).map((s) =>
              summary.counts[s] > 0 ? <span key={s} className={`block h-full ${STATUS_STYLE[s].bar}`} style={{ flexGrow: summary.counts[s] }} /> : null,
            )}
          </div>
          <p className="text-label text-muted">{t("internalNote")}</p>
        </section>

        {/* Status breakdown, also a filter for the map */}
        <section aria-labelledby="h-st" className="order-5 rounded-panel border border-line bg-surface p-4 md:order-none md:col-span-2 md:p-6 lg:col-span-1">
          <h2 id="h-st" className="mb-4 text-headline font-bold">
            {t("statesTitle")} <span className="num text-body font-medium text-muted">({summary.total})</span>
          </h2>
          <div role="group" aria-label={t("filterLabel")} className="grid grid-cols-3 gap-y-3 md:grid-cols-5 md:gap-y-0">
            {STATUS_ORDER.map((s, i) => (
              <button
                key={s}
                type="button"
                aria-pressed={filter.has(s)}
                onClick={() => {
                  toggleStatus(s);
                  scrollTo(mapRef.current);
                }}
                className={`flex flex-col items-center gap-2 px-1 py-2 ${i % 3 !== 0 ? "border-s border-line" : ""} ${i === 0 ? "" : "md:border-s md:border-line"}
                            aria-pressed:rounded-control aria-pressed:bg-saffron-bg aria-pressed:shadow-[inset_0_0_0_1px_var(--color-saffron)]`}
              >
                <StatusIcon status={s} className="size-[34px]" />
                <span className="min-h-[2lh] text-center text-label font-medium leading-snug md:min-h-0 lg:min-h-[2lh]">{st(s)}</span>
                <span className={`num text-stat font-bold leading-none ${STATUS_STYLE[s].count}`}>{summary.counts[s]}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Mobile: urgent items strip */}
      {urgent > 0 && (
        <div
          role="status"
          className="order-3 flex items-center gap-3 rounded-panel border border-status-noncompliant-line bg-status-noncompliant-bg px-4 py-3 font-bold text-status-noncompliant md:hidden"
        >
          <span>{t("urgentCount", { count: urgent, n: urgent })}</span>
          <button
            type="button"
            onClick={() => scrollTo(attentionRef.current)}
            className="ms-auto h-[38px] min-w-[110px] rounded-control bg-ink px-4 text-label font-semibold text-on-ink hover:bg-ink-2"
          >
            {t("show")}
          </button>
        </div>
      )}

      {/* Control map */}
      <section ref={mapRef} aria-labelledby="h-map" className="order-6 scroll-mt-6 rounded-panel border border-line bg-surface p-4 md:order-none md:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 id="h-map" className="text-headline font-bold">
            {t("mapTitle")} <span className="num text-body font-medium text-muted">({summary.total})</span>
          </h2>
          <div role="group" aria-label={t("filterLabel")} className="flex flex-wrap gap-x-2 gap-y-1 md:ms-auto">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={filter.has(s)}
                onClick={() => toggleStatus(s)}
                className="inline-flex h-8 items-center gap-2 rounded-control border border-transparent px-3 text-label text-muted hover:bg-surface-2
                           aria-pressed:border-saffron aria-pressed:bg-saffron-bg aria-pressed:text-text"
              >
                <StatusIcon status={s} />
                {st(s)}
              </button>
            ))}
            <span className="inline-flex items-center gap-2 px-2 text-label text-muted">
              <span aria-hidden="true" className="block size-3.5 rounded-badge bg-surface-2 outline-2 outline-offset-1 outline-text [outline-style:solid]" />
              {t("flagLegend")}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-y-6 md:grid-cols-2 lg:grid-cols-4">
          {domains.map((d, i) => {
            const controls = d.subdomains.flatMap((s) => s.controls.map((c) => ({ c, s })));
            const dimmed = focusDomain !== null && focusDomain !== d.code;
            return (
              <div
                key={d.code}
                className={`flex flex-col border-line transition-opacity duration-200 max-md:border-t max-md:pt-4 max-md:first:border-t-0 max-md:first:pt-0
                            md:px-4 ${i % 2 === 1 ? "md:border-s" : "md:ps-0"} lg:border-s lg:ps-4 lg:first:border-s-0 lg:first:ps-0 ${dimmed ? "opacity-30" : ""}`}
              >
                <div className="text-body font-bold leading-snug">{name(d)}</div>
                <div className="mb-3 mt-1 flex items-baseline justify-between">
                  <span className="text-label text-muted">
                    (<span className="num">{controls.length}</span>)
                  </span>
                  <span className={`num text-headline font-bold ${d.code === weakest ? "text-status-noncompliant" : ""}`}>{pct(d.summary.score)}</span>
                </div>
                <div className="mb-4 grid grid-cols-10 gap-1">
                  {controls.map(({ c, s }) => {
                    const match = filter.size === 0 || filter.has(c.status);
                    const isFlagged = flagged.has(c.code);
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => setOpenCode(c.code)}
                        title={`${c.code} · ${name(s)} · ${st(c.status)}`}
                        aria-label={`${c.code} ${st(c.status)}${isFlagged ? `، ${t("flagLegend")}` : ""}`}
                        className={`grid aspect-square place-items-center rounded-badge transition-[transform,opacity] duration-150 hover:scale-[1.2] ${STATUS_STYLE[c.status].cell}
                                    ${isFlagged ? "outline-2 outline-offset-1 outline-text [outline-style:solid]" : ""} ${match ? "" : "opacity-15"}`}
                      >
                        <CellMark status={c.status} />
                      </button>
                    );
                  })}
                </div>
                <div className="mt-auto grid grid-cols-5 border-t border-line pt-3 text-center">
                  {STATUS_ORDER.map((s) => (
                    <div key={s} title={st(s)} className="flex flex-col items-center gap-1">
                      <StatusIcon status={s} className="size-4" />
                      <span className="sr-only">{st(s)}</span>
                      <b className={`num text-body-sm font-bold ${STATUS_STYLE[s].count}`}>{d.summary.counts[s]}</b>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Needs your attention */}
      <section
        ref={attentionRef}
        aria-labelledby="h-att"
        className="order-4 scroll-mt-6 md:order-none md:rounded-panel md:border md:border-line md:bg-surface md:p-6"
      >
        <h2 id="h-att" className="mb-4 text-page-title font-bold md:text-headline">
          {t("attentionTitle")}
        </h2>
        {items.length === 0 ? (
          <p className="rounded-panel bg-surface-2 p-4 text-body-sm text-muted md:bg-transparent md:p-0">
            {me.role === "ADMIN" ? t("attentionEmptyAdmin") : t("attentionEmpty")}
          </p>
        ) : (
          <AttentionList items={items} canEdit={me.role === "ADMIN" || me.role === "CONTROL_OWNER"} onOpen={setOpenCode} />
        )}
      </section>

      <ControlDrawer data={data} code={openCode} onClose={() => setOpenCode(null)} me={me} assignees={assignees} today={today} />
    </div>
  );
}

function DueText({ item }: { item: AttentionItem }) {
  const t = useTranslations("Dashboard");
  const days = item.days;
  const text =
    item.kind === "overdue"
      ? t("overdue", { count: days ?? 0, n: days ?? 0 })
      : days === null
        ? t("noDueDate")
        : days === 0
          ? t("dueToday")
          : t("dueIn", { count: days, n: days });
  const tone = item.kind === "overdue" ? "text-status-noncompliant" : days === null ? "text-muted" : "text-status-partial-text";
  const Icon = item.kind === "overdue" ? IconClock : IconCalendar;
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap text-label font-medium ${tone}`}>
      <Icon className="size-4" />
      {text}
    </span>
  );
}

function AttentionList({ items, canEdit, onOpen }: { items: AttentionItem[]; canEdit: boolean; onOpen: (code: string) => void }) {
  const t = useTranslations("Dashboard");
  const ar = useLocale() === "ar";
  const action = canEdit ? t("updateAction") : t("viewAction");
  const subName = (i: AttentionItem) => (ar ? i.subdomain.nameAr : i.subdomain.nameEn);
  const actionClass = "h-8 min-w-32 whitespace-nowrap rounded-control bg-ink px-4 text-label font-semibold text-on-ink hover:bg-ink-2 active:translate-y-px";

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line text-label text-muted">
              <th className="px-3 py-2 text-start font-medium">{t("colAction")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("colCode")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("colSubdomain")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("colOwner")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("colDue")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("colStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.control.code} className="border-b border-line text-body-sm last:border-b-0 hover:bg-surface-2">
                <td className="px-3 py-2">
                  <button type="button" onClick={() => onOpen(i.control.code)} className={actionClass}>
                    {action}
                  </button>
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <button type="button" onClick={() => onOpen(i.control.code)} className="hover:underline hover:underline-offset-4">
                    <Code>{i.control.code}</Code>
                  </button>
                </td>
                <td className="px-3 py-2">{subName(i)}</td>
                <td className="px-3 py-2">{i.control.owner?.name ?? <span className="text-muted">{t("unassigned")}</span>}</td>
                <td className="px-3 py-2">
                  <DueText item={i} />
                </td>
                <td className="px-3 py-2">
                  <StatusChip status={i.control.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        {items.map((i) => (
          <article key={i.control.code} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 rounded-panel border border-line bg-surface p-4">
            <div className="text-body font-semibold leading-normal">{subName(i)}</div>
            <span className="self-start justify-self-end rounded-badge bg-surface-2 px-3 text-body-sm leading-7">
              <Code>{i.control.code}</Code>
            </span>
            <span className="flex items-center gap-2 text-body-sm text-muted">
              <IconUser className="size-4" />
              {i.control.owner?.name ?? t("unassigned")}
            </span>
            <span className="self-start justify-self-end">
              <DueText item={i} />
            </span>
            <button type="button" onClick={() => onOpen(i.control.code)} className={`${actionClass} col-span-2 h-11 w-full text-body`}>
              {action}
            </button>
          </article>
        ))}
      </div>
    </>
  );
}
