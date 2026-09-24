import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthContext } from '../auth/auth.types.js';

export type AlertKind =
  | 'control_overdue'
  | 'control_gap'
  | 'control_due_soon'
  | 'task_overdue'
  | 'task_due_soon'
  | 'evidence_expired'
  | 'evidence_expiring'
  | 'audit_visit';

export interface Alert {
  /** Stable per source, so the page can key and link it. */
  id: string;
  kind: AlertKind;
  /** high: something is already wrong. medium: it will be soon. */
  severity: 'high' | 'medium';
  /** Null for entity-wide alerts (the auditor visit). */
  controlCode: string | null;
  /** Days late / expired (positive), or days left; null when undated. */
  days: number | null;
  /** The step or evidence title, when the alert is about one. */
  title: string | null;
  owner: { id: string; name: string } | null;
  /** audit_visit only: controls still non-compliant or partially compliant. */
  openGaps?: number;
}

export const CONTROL_SOON_DAYS = 14;
export const TASK_SOON_DAYS = 7;
export const EVIDENCE_SOON_DAYS = 30;
export const VISIT_SOON_DAYS = 14;

const DAY = 86_400_000;
/** Today in Riyadh as a UTC midnight, the same basis as DATE columns. */
export function riyadhToday(now = new Date()) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(now);
  return new Date(`${ymd}T00:00:00Z`);
}
/** How late a high alert is; a gap is not late, only non-compliant. */
const lateness = (a: Alert) => (a.kind === 'control_gap' || a.kind === 'audit_visit' ? -1 : (a.days ?? 0));
const daysFrom = (today: Date, d: Date) => Math.round((d.getTime() - today.getTime()) / DAY);

/**
 * Alerts are derived, not stored: every request reads the current state of
 * controls, remediation steps and evidence. So an alert disappears as soon as
 * its cause is fixed, and there is nothing to mark as read.
 */
@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(auth: AuthContext, now = new Date()): Promise<Alert[]> {
    const db = this.prisma.forEntity(auth.entityId);
    const today = riyadhToday(now);
    const [controls, tasks, evidence, visit] = await Promise.all([
      db.controlStatus.findMany({
        where: { status: { notIn: ['COMPLIANT', 'NOT_APPLICABLE'] } },
        select: { controlCode: true, status: true, dueDate: true, owner: { select: { id: true, name: true } } },
      }),
      db.remediationTask.findMany({
        where: { removedAt: null, doneAt: null, dueDate: { not: null, lte: new Date(today.getTime() + TASK_SOON_DAYS * DAY) } },
        select: { id: true, controlCode: true, title: true, dueDate: true, owner: { select: { id: true, name: true } } },
      }),
      db.evidence.findMany({
        where: { removedAt: null, expiresOn: { not: null, lte: new Date(today.getTime() + EVIDENCE_SOON_DAYS * DAY) } },
        select: { id: true, controlCode: true, title: true, expiresOn: true, uploadedBy: { select: { id: true, name: true } } },
      }),
      db.auditVisit.findFirst({
        where: { cancelledAt: null, visitDate: { gte: today, lte: new Date(today.getTime() + VISIT_SOON_DAYS * DAY) } },
        orderBy: { visitDate: 'asc' },
        select: { id: true, visitDate: true },
      }),
    ]);

    const controlOwner = new Map(controls.map((c) => [c.controlCode, c.owner?.id ?? null]));
    const alerts: Alert[] = [];

    for (const c of controls) {
      const left = c.dueDate ? daysFrom(today, c.dueDate) : null;
      const base = { controlCode: c.controlCode, title: null, owner: c.owner };
      if (left !== null && left < 0) alerts.push({ ...base, id: `c:${c.controlCode}`, kind: 'control_overdue', severity: 'high', days: -left });
      else if (c.status === 'NON_COMPLIANT') alerts.push({ ...base, id: `c:${c.controlCode}`, kind: 'control_gap', severity: 'high', days: left });
      else if (left !== null && left <= CONTROL_SOON_DAYS) alerts.push({ ...base, id: `c:${c.controlCode}`, kind: 'control_due_soon', severity: 'medium', days: left });
    }
    for (const t of tasks) {
      const left = daysFrom(today, t.dueDate!);
      const base = { id: `t:${t.id}`, controlCode: t.controlCode, title: t.title, owner: t.owner };
      alerts.push(left < 0 ? { ...base, kind: 'task_overdue', severity: 'high', days: -left } : { ...base, kind: 'task_due_soon', severity: 'medium', days: left });
    }
    for (const e of evidence) {
      const left = daysFrom(today, e.expiresOn!);
      const base = { id: `e:${e.id}`, controlCode: e.controlCode, title: e.title, owner: e.uploadedBy };
      alerts.push(left < 0 ? { ...base, kind: 'evidence_expired', severity: 'high', days: -left } : { ...base, kind: 'evidence_expiring', severity: 'medium', days: left });
    }

    if (visit) {
      const openGaps = controls.filter((c) => c.status === 'NON_COMPLIANT' || c.status === 'PARTIAL').length;
      alerts.push({
        id: `v:${visit.id}`,
        kind: 'audit_visit',
        // Within three days it needs action now; before that it is coming up.
        severity: daysFrom(today, visit.visitDate) <= 3 ? 'high' : 'medium',
        controlCode: null,
        days: daysFrom(today, visit.visitDate),
        title: null,
        owner: null,
        openGaps,
      });
    }

    // A Control Owner sees what concerns them: their controls, their steps, their uploads.
    const mine =
      auth.role === 'CONTROL_OWNER'
        ? alerts.filter((a) => a.kind === 'audit_visit' || a.owner?.id === auth.userId || (a.controlCode && controlOwner.get(a.controlCode) === auth.userId))
        : alerts;

    return mine.sort(
      (a, b) =>
        (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1) ||
        // Most late first among high (gaps, whose days count forward, after anything late),
        // soonest first among medium.
        (a.severity === 'high' ? lateness(b) - lateness(a) : (a.days ?? Infinity) - (b.days ?? Infinity)) ||
        (a.controlCode ?? '').localeCompare(b.controlCode ?? '', 'en', { numeric: true }),
    );
  }
}
