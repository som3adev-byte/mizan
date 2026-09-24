import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthContext, RequestMeta } from '../auth/auth.types.js';
import { riyadhToday } from '../alerts/alerts.service.js';

export interface VisitInput {
  visitDate?: string;
  notes?: string | null;
}

const SELECT = { id: true, visitDate: true, notes: true, createdAt: true } as const;
type Row = { visitDate: Date } & Record<string, unknown>;
const shape = <T extends Row>(r: T) => ({ ...r, visitDate: r.visitDate.toISOString().slice(0, 10) });
const date = (d: string) => new Date(`${d}T00:00:00Z`);

@Injectable()
export class VisitsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The nearest visit from today on, or null. */
  async next(auth: AuthContext, now = new Date()) {
    const row = await this.prisma.forEntity(auth.entityId).auditVisit.findFirst({
      where: { cancelledAt: null, visitDate: { gte: riyadhToday(now) } },
      orderBy: { visitDate: 'asc' },
      select: SELECT,
    });
    return row ? shape(row) : null;
  }

  /** Upcoming visits soonest first, then past ones most recent first. */
  async list(auth: AuthContext, now = new Date()) {
    const today = riyadhToday(now);
    const db = this.prisma.forEntity(auth.entityId);
    const [upcoming, past] = await Promise.all([
      db.auditVisit.findMany({ where: { cancelledAt: null, visitDate: { gte: today } }, orderBy: { visitDate: 'asc' }, select: SELECT }),
      db.auditVisit.findMany({ where: { cancelledAt: null, visitDate: { lt: today } }, orderBy: { visitDate: 'desc' }, select: SELECT }),
    ]);
    return { upcoming: upcoming.map(shape), past: past.map(shape) };
  }

  private audit(auth: AuthContext, action: string, meta: RequestMeta, extra: object) {
    return this.prisma.forEntity(auth.entityId).auditLog.create({
      data: { entityId: auth.entityId, actorId: auth.userId, action, ip: meta.ip ?? null, meta: extra },
    });
  }

  async create(auth: AuthContext, input: Required<Pick<VisitInput, 'visitDate'>> & VisitInput, meta: RequestMeta) {
    const row = await this.prisma.forEntity(auth.entityId).auditVisit.create({
      data: { entityId: auth.entityId, visitDate: date(input.visitDate), notes: input.notes ?? null, createdById: auth.userId },
      select: SELECT,
    });
    await this.audit(auth, 'visit.scheduled', meta, { visitId: row.id, visitDate: input.visitDate });
    return shape(row);
  }

  /** Changing the date or adding notes afterwards (e.g. what the auditor found). */
  async update(auth: AuthContext, id: string, input: VisitInput, meta: RequestMeta) {
    const db = this.prisma.forEntity(auth.entityId);
    const before = await db.auditVisit.findFirst({ where: { id, cancelledAt: null } });
    if (!before) throw new NotFoundException({ code: 'not_found' });
    const row = await db.auditVisit.update({
      where: { id },
      data: {
        ...(input.visitDate !== undefined && { visitDate: date(input.visitDate) }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
      select: SELECT,
    });
    await this.audit(auth, 'visit.updated', meta, {
      visitId: id,
      before: { visitDate: before.visitDate.toISOString().slice(0, 10) },
      change: { ...input },
    });
    return shape(row);
  }

  async cancel(auth: AuthContext, id: string, meta: RequestMeta) {
    const db = this.prisma.forEntity(auth.entityId);
    const visit = await db.auditVisit.findFirst({ where: { id, cancelledAt: null } });
    if (!visit) throw new NotFoundException({ code: 'not_found' });
    await db.auditVisit.update({ where: { id }, data: { cancelledAt: new Date() } });
    await this.audit(auth, 'visit.cancelled', meta, { visitId: id, visitDate: visit.visitDate.toISOString().slice(0, 10) });
  }
}
