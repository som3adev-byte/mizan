import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Code } from "@/components/controls/status";
import type { ComplianceStatus } from "@/lib/controls";

export type AuditEntry = {
  id: string;
  createdAt: string;
  action: string;
  actorId: string | null;
  target: string | null;
  meta: Record<string, unknown> | null;
  ip: string | null;
};

type ControlMeta = {
  before?: { status?: ComplianceStatus; ownerId?: string | null; dueDate?: string | null };
  change?: { status?: ComplianceStatus; ownerId?: string | null; dueDate?: string | null };
  bulk?: number;
};

/** One line of human-readable detail per audit entry. Unknown shapes show nothing rather than raw JSON. */
export function AuditDetails({ entry: e, people }: { entry: AuditEntry; people: Record<string, string> }) {
  const t = useTranslations("AuditLog");
  const st = useTranslations("Status");
  const roles = useTranslations("Roles");
  const format = useFormatter();
  const person = (id: string | null | undefined) => (id ? (people[id] ?? t("unknownPerson")) : t("unassigned"));
  const day = (d: string | null | undefined) =>
    d ? format.dateTime(new Date(`${d}T00:00:00Z`), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC", numberingSystem: "latn" }) : t("noDate");
  const arrow = <span aria-hidden="true" className="flip-rtl inline-block px-1 text-faint">→</span>;
  const meta = e.meta ?? {};

  if (e.action === "control.updated") {
    const { before = {}, change = {}, bulk } = meta as ControlMeta;
    const parts: ReactNode[] = [];
    if (change.status !== undefined)
      parts.push(
        <span key="s">
          {t("fieldStatus")}: {st(before.status ?? "NOT_STARTED")} {arrow} {st(change.status)}
        </span>,
      );
    if (change.ownerId !== undefined)
      parts.push(
        <span key="o">
          {t("fieldOwner")}: {person(before.ownerId)} {arrow} {person(change.ownerId)}
        </span>,
      );
    if (change.dueDate !== undefined)
      parts.push(
        <span key="d">
          {t("fieldDue")}: {day(before.dueDate)} {arrow} {day(change.dueDate)}
        </span>,
      );
    return (
      <div className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          {e.target && <Code className="font-semibold">{e.target}</Code>}
          {bulk && <span className="rounded-badge bg-surface-2 px-2 text-badge text-muted">{t("bulk", { n: bulk })}</span>}
        </span>
        {parts.length > 0 && <span className="flex flex-col text-muted">{parts}</span>}
      </div>
    );
  }

  if (e.action.startsWith("evidence.") || e.action.startsWith("task.")) {
    const m = meta as { title?: string; fileName?: string };
    return (
      <span className="flex flex-wrap items-center gap-2">
        {e.target && <Code className="font-semibold">{e.target}</Code>}
        <span>{m.title}</span>
        {m.fileName && (
          <bdi className="text-muted">({m.fileName})</bdi>
        )}
      </span>
    );
  }
  if (e.action === "user.role_changed") {
    const m = meta as { from?: string; to?: string };
    return (
      <span>
        {person(e.target)}: {m.from ? roles(m.from) : ""} {arrow} {m.to ? roles(m.to) : ""}
      </span>
    );
  }
  if (e.action === "user.enabled" || e.action === "user.disabled") return <span>{person(e.target)}</span>;
  if (e.action === "user.invited") {
    const m = meta as { email?: string; role?: string };
    return (
      <span>
        <bdi dir="ltr">{m.email}</bdi> · {m.role ? roles(m.role) : ""}
      </span>
    );
  }
  if (e.action.startsWith("visit.")) {
    const m = meta as { visitDate?: string; before?: { visitDate?: string }; change?: { visitDate?: string; notes?: string | null } };
    if (m.change?.visitDate && m.before?.visitDate && m.change.visitDate !== m.before.visitDate)
      return (
        <span>
          {day(m.before.visitDate)} {arrow} {day(m.change.visitDate)}
        </span>
      );
    const d = m.visitDate ?? m.before?.visitDate;
    return (
      <span className="flex flex-col gap-1">
        {d && <span>{day(d)}</span>}
        {m.change?.notes && <span className="text-muted">{m.change.notes}</span>}
      </span>
    );
  }
  if (e.action === "entity.cloud_changed") {
    const m = meta as { from?: boolean | null; to?: boolean; controls?: string[] };
    const answer = (v: boolean | null | undefined) => (v == null ? t("cloudUnset") : v ? t("cloudYes") : t("cloudNo"));
    return (
      <span className="flex flex-col gap-1">
        <span>
          {answer(m.from)} {arrow} {answer(m.to)}
        </span>
        {m.controls && m.controls.length > 0 && <span className="text-muted">{t("cloudControls", { n: m.controls.length })}</span>}
      </span>
    );
  }
  if (e.action === "entity.renamed") {
    const m = meta as { before?: { name?: string; nameEn?: string | null }; after?: { name?: string; nameEn?: string | null } };
    const show = (x?: { name?: string; nameEn?: string | null }) => [x?.name, x?.nameEn].filter(Boolean).join(" / ");
    return (
      <span>
        {show(m.before)} {arrow} {show(m.after)}
      </span>
    );
  }
  if (e.action === "entity.created") {
    const m = meta as { firstAdmin?: string };
    return m.firstAdmin ? <bdi dir="ltr">{m.firstAdmin}</bdi> : null;
  }
  if (e.action.startsWith("auth.") && e.ip) {
    return (
      <span className="text-muted">
        {t("ip")} <span dir="ltr" className="inline-block font-latin tabular-nums">{e.ip}</span>
      </span>
    );
  }
  return null;
}
