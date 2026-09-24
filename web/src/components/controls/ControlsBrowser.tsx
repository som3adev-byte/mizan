"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { FormError } from "@/components/auth/fields";
import { ControlDrawer } from "@/components/controls/ControlDrawer";
import { Code, StatusChip, StatusIcon } from "@/components/controls/status";
import { IconCalendar, IconClock, IconClose, IconUser } from "@/components/icons";
import { useRouter } from "@/i18n/navigation";
import { postJson } from "@/lib/api-client";
import {
  type Assignee,
  type ComplianceStatus,
  type Control,
  type ControlsPayload,
  STATUS_ORDER,
  daysUntil,
  normalizeSearch,
} from "@/lib/controls";
import type { Role } from "@/lib/session";

export type ControlsFilters = { q: string; statuses: ComplianceStatus[]; domain: string; owner: string };

type Props = {
  data: ControlsPayload;
  today: string;
  me: { id: string; role: Role };
  assignees: Assignee[] | null;
  initial: ControlsFilters;
};

const NO_OWNER = "none";

/** Keeps the filters in the address bar so a filtered list can be shared or reloaded. */
function writeUrl(f: ControlsFilters) {
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.statuses.length) params.set("status", f.statuses.join(","));
  if (f.domain) params.set("domain", f.domain);
  if (f.owner) params.set("owner", f.owner);
  const qs = params.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

export function ControlsBrowser({ data, today, me, assignees, initial }: Props) {
  const t = useTranslations("Controls");
  const st = useTranslations("Status");
  const ar = useLocale() === "ar";
  const isAdmin = me.role === "ADMIN";

  const [filters, setFilters] = useState<ControlsFilters>(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const update = (patch: Partial<ControlsFilters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    writeUrl(next);
  };
  const clearFilters = () => update({ q: "", statuses: [], domain: "", owner: "" });
  const filtering = !!(filters.q || filters.statuses.length || filters.domain || filters.owner);

  const name = (x: { nameAr: string; nameEn: string }) => (ar ? x.nameAr : x.nameEn);
  const query = normalizeSearch(filters.q);
  const matches = (c: Control, subName: string) => {
    if (filters.statuses.length && !filters.statuses.includes(c.status)) return false;
    if (filters.owner === NO_OWNER ? c.owner !== null : filters.owner && c.owner?.id !== filters.owner) return false;
    if (!query) return true;
    if (c.code.startsWith(query)) return true;
    const haystack = [c.textAr, c.textEn ?? "", subName, ...c.subcontrols.flatMap((s) => [s.textAr, s.textEn ?? ""])].join(" ");
    return normalizeSearch(haystack).includes(query);
  };

  const groups = data.domains
    .filter((d) => !filters.domain || d.code === filters.domain)
    .map((d) => ({
      domain: d,
      subdomains: d.subdomains
        .map((s) => ({ subdomain: s, controls: s.controls.filter((c) => matches(c, `${s.nameAr} ${s.nameEn}`)) }))
        .filter((g) => g.controls.length > 0),
    }))
    .filter((g) => g.subdomains.length > 0);
  const visible = groups.flatMap((g) => g.subdomains.flatMap((s) => s.controls.map((c) => c.code)));

  // People who own something, for the owner filter (everyone can filter, not only Admins).
  const owners = new Map<string, string>();
  for (const d of data.domains) for (const s of d.subdomains) for (const c of s.controls) if (c.owner) owners.set(c.owner.id, c.owner.name);

  const toggle = (code: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  const allVisibleSelected = visible.length > 0 && visible.every((c) => selected.has(c));

  const selectClass = "h-10 rounded-control border border-line bg-surface px-3 text-body-sm outline-none hover:border-line-2 focus:border-text";

  return (
    // While rows are selected, room at the bottom so the floating bar never hides the last rows.
    <div className={`flex flex-col gap-6 ${isAdmin && selected.size > 0 ? "pb-72 md:pb-32" : ""}`}>
      {/* Filters */}
      <section aria-label={t("filtersLabel")} className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
          <div className="flex flex-1 flex-col gap-2 md:min-w-64">
            <label htmlFor="controls-q" className="text-label font-medium">
              {t("search")}
            </label>
            <input
              id="controls-q"
              type="search"
              value={filters.q}
              onChange={(e) => update({ q: e.target.value })}
              placeholder={t("searchPlaceholder")}
              className={`${selectClass} w-full`}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="controls-domain" className="text-label font-medium">
              {t("domain")}
            </label>
            <select id="controls-domain" value={filters.domain} onChange={(e) => update({ domain: e.target.value })} className={selectClass}>
              <option value="">{t("allDomains")}</option>
              {data.domains.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code}. {name(d)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="controls-owner" className="text-label font-medium">
              {t("owner")}
            </label>
            <select id="controls-owner" value={filters.owner} onChange={(e) => update({ owner: e.target.value })} className={selectClass}>
              <option value="">{t("allOwners")}</option>
              {me.role === "CONTROL_OWNER" && <option value={me.id}>{t("mine")}</option>}
              <option value={NO_OWNER}>{t("unassigned")}</option>
              {[...owners].filter(([id]) => !(me.role === "CONTROL_OWNER" && id === me.id)).map(([id, ownerName]) => (
                <option key={id} value={id}>
                  {ownerName}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div role="group" aria-label={t("statusFilter")} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {STATUS_ORDER.map((s) => {
            const on = filters.statuses.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => update({ statuses: on ? filters.statuses.filter((x) => x !== s) : [...filters.statuses, s] })}
                className="inline-flex h-8 items-center gap-2 rounded-control border border-transparent px-3 text-label text-muted hover:bg-surface-2
                           aria-pressed:border-saffron aria-pressed:bg-saffron-bg aria-pressed:text-text"
              >
                <StatusIcon status={s} />
                {st(s)}
                <span className="num">{data.summary.counts[s]}</span>
              </button>
            );
          })}
          {filtering && (
            <button type="button" onClick={clearFilters} className="ms-auto inline-flex h-8 items-center gap-1 px-2 text-label text-muted hover:text-text">
              <IconClose className="size-4" />
              {t("clearFilters")}
            </button>
          )}
        </div>
      </section>

      {/* Result line */}
      <div className="flex flex-wrap items-center gap-3" aria-live="polite">
        {notice && <p className="rounded-badge bg-status-compliant-bg px-3 py-1 text-body-sm text-status-compliant-text">{notice}</p>}
        <p className="text-body-sm text-muted">{t("showing", { count: visible.length, n: visible.length, total: data.summary.total })}</p>
        {isAdmin && visible.length > 0 && (
          <button
            type="button"
            onClick={() => setSelected(allVisibleSelected ? new Set() : new Set(visible))}
            className="h-8 rounded-control border border-line bg-surface px-3 text-label hover:border-text"
          >
            {allVisibleSelected ? t("unselectAll") : t("selectAll")}
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-panel border border-line bg-surface p-6">
          <p className="text-body-sm text-muted">{t("empty")}</p>
          <button type="button" onClick={clearFilters} className="h-10 rounded-control bg-ink px-4 text-label font-semibold text-on-ink hover:bg-ink-2">
            {t("clearFilters")}
          </button>
        </div>
      ) : (
        groups.map(({ domain, subdomains }) => (
          <section key={domain.code} aria-labelledby={`domain-${domain.code}`} className="flex flex-col gap-3">
            <h2 id={`domain-${domain.code}`} className="flex items-baseline gap-3 text-headline font-bold">
              {name(domain)}
              <span className="num text-body font-medium text-muted">{domain.summary.score === null ? "—" : `${domain.summary.score}%`}</span>
            </h2>
            <div className="overflow-hidden rounded-panel border border-line bg-surface">
              {subdomains.map(({ subdomain, controls }) => (
                <div key={subdomain.code} className="border-b border-line last:border-b-0">
                  <h3 className="flex items-center gap-2 bg-surface-2 px-4 py-2 text-label font-bold">
                    <Code className="text-muted">{subdomain.code}</Code>
                    {name(subdomain)}
                  </h3>
                  <ul>
                    {controls.map((c) => (
                      <ControlRow
                        key={c.code}
                        control={c}
                        today={today}
                        selectable={isAdmin}
                        selected={selected.has(c.code)}
                        onToggle={() => toggle(c.code)}
                        onOpen={() => setOpenCode(c.code)}
                        action={isAdmin || (me.role === "CONTROL_OWNER" && c.owner?.id === me.id) ? t("update") : t("view")}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {isAdmin && selected.size > 0 && (
        <BulkBar
          codes={[...selected]}
          assignees={assignees ?? []}
          onDone={(message) => {
            setSelected(new Set());
            setNotice(message ?? null);
          }}
        />
      )}

      <ControlDrawer data={data} code={openCode} onClose={() => setOpenCode(null)} me={me} assignees={assignees} today={today} />
    </div>
  );
}

function ControlRow({
  control: c,
  today,
  selectable,
  selected,
  onToggle,
  onOpen,
  action,
}: {
  control: Control;
  today: string;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  action: string;
}) {
  const t = useTranslations("Controls");
  const ar = useLocale() === "ar";
  const text = ar ? c.textAr : (c.textEn ?? c.textAr);
  const fallback = !ar && c.textEn === null;

  return (
    <li
      className={`grid grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-b-0 hover:bg-surface-2
                  md:grid-cols-[1rem_8rem_4.5rem_1fr_9rem_10rem_10rem] md:items-center ${selected ? "bg-saffron-bg hover:bg-saffron-bg" : ""}`}
    >
      {selectable ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={t("selectControl", { code: c.code })}
          className="mt-1 size-4 accent-text md:mt-0"
        />
      ) : (
        <span className="hidden md:block" />
      )}
      <button
        type="button"
        onClick={onOpen}
        className="order-last col-span-3 h-11 min-w-32 whitespace-nowrap rounded-control bg-ink px-4 text-body font-semibold text-on-ink hover:bg-ink-2 active:translate-y-px
                   md:order-none md:col-span-1 md:h-8 md:text-label"
      >
        {action}
      </button>
      <button type="button" onClick={onOpen} className="justify-self-start text-body-sm hover:underline hover:underline-offset-4 max-md:hidden">
        <Code>{c.code}</Code>
      </button>
      <p className="line-clamp-2 text-body-sm" lang={fallback ? "ar" : undefined} dir={fallback ? "rtl" : undefined}>
        {/* Wrapped so the gap follows the page direction, not the code's LTR. */}
        <span className="me-2 md:hidden">
          <Code>{c.code}</Code>
        </span>
        {text}
      </p>
      <span className="col-start-2 flex items-center gap-2 text-body-sm text-muted md:col-start-auto">
        <IconUser className="size-4 md:hidden" />
        {c.owner?.name ?? t("unassigned")}
      </span>
      <DueCell control={c} today={today} />
      <span className="col-start-2 md:col-start-auto">
        <StatusChip status={c.status} />
      </span>
    </li>
  );
}

function DueCell({ control: c, today }: { control: Control; today: string }) {
  const t = useTranslations("Controls");
  const format = useFormatter();
  if (!c.dueDate) return <span className="text-body-sm text-muted max-md:hidden">—</span>;
  const left = daysUntil(today, c.dueDate);
  const open = c.status !== "COMPLIANT" && c.status !== "NOT_APPLICABLE";
  if (open && left < 0) {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap text-label font-medium text-status-noncompliant">
        <IconClock className="size-4" />
        {t("overdue", { count: -left, n: -left })}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-label text-muted">
      <IconCalendar className="size-4" />
      <span className="tabular-nums">
        {format.dateTime(new Date(`${c.dueDate}T00:00:00Z`), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC", numberingSystem: "latn" })}
      </span>
    </span>
  );
}

/** Floating bar for the Admin: one change to every selected control. */
function BulkBar({ codes, assignees, onDone }: { codes: string[]; assignees: Assignee[]; onDone: (notice?: string) => void }) {
  const t = useTranslations("Controls");
  const st = useTranslations("Status");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const change: Record<string, string | null> = {};
    const status = String(form.get("status") ?? "");
    const owner = String(form.get("ownerId") ?? "");
    const due = String(form.get("dueDate") ?? "");
    if (status) change.status = status;
    if (owner) change.ownerId = owner === NO_OWNER ? null : owner;
    if (due) change.dueDate = due;
    if (Object.keys(change).length === 0) {
      setError(t("bulkNothing"));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await postJson("/controls/bulk", { codes, ...change });
    setBusy(false);
    if (!res.ok) {
      setError(t.has(`errors.${res.code}`) ? t(`errors.${res.code}`) : t("errors.unknown"));
      return;
    }
    onDone(t("bulkDone", { count: codes.length, n: codes.length }));
    router.refresh();
  }

  const field = "h-10 rounded-control border border-line bg-surface px-3 text-body-sm outline-none hover:border-line-2 focus:border-text";

  return (
    <form
      onSubmit={onSubmit}
      aria-label={t("bulkLabel")}
      className="fixed inset-x-4 bottom-[calc(80px+env(safe-area-inset-bottom))] z-30 flex flex-col gap-3 rounded-panel border border-line bg-surface p-4
                 shadow-[0_8px_32px_-12px_color-mix(in_srgb,var(--color-ink)_28%,transparent)] md:inset-x-8 md:bottom-6 md:ms-[250px] md:flex-row md:flex-wrap md:items-end"
    >
      <p className="font-bold md:self-center">{t("selected", { count: codes.length, n: codes.length })}</p>
      <label className="flex flex-col gap-1 text-label font-medium">
        {t("status")}
        <select name="status" defaultValue="" className={field}>
          <option value="">{t("noChange")}</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {st(s)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-label font-medium">
        {t("owner")}
        <select name="ownerId" defaultValue="" className={field}>
          <option value="">{t("noChange")}</option>
          <option value={NO_OWNER}>{t("unassigned")}</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-label font-medium">
        {t("dueDate")}
        <input name="dueDate" type="date" dir="ltr" className={`${field} text-start`} />
      </label>
      <div className="flex gap-2 md:ms-auto">
        <button type="submit" disabled={busy} className="h-10 flex-1 rounded-control bg-ink px-5 text-body-sm font-semibold text-on-ink hover:bg-ink-2 disabled:opacity-70">
          {t("bulkApply")}
        </button>
        <button type="button" onClick={() => onDone()} className="h-10 rounded-control border border-line px-4 text-body-sm hover:border-line-2">
          {t("unselectAll")}
        </button>
      </div>
      <div aria-live="polite" className="w-full empty:hidden">
        <FormError>{error}</FormError>
      </div>
    </form>
  );
}
