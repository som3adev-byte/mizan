import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthContext, RequestMeta } from '../auth/auth.types.js';
import { assertAssignable } from '../controls/assignable.js';

export interface TaskInput {
  title?: string;
  ownerId?: string | null;
  dueDate?: string | null;
  done?: boolean;
}

const SELECT = {
  id: true,
  controlCode: true,
  title: true,
  dueDate: true,
  doneAt: true,
  createdAt: true,
  owner: { select: { id: true, name: true } },
} as const;

type Row = { dueDate: Date | null; doneAt: Date | null } & Record<string, unknown>;
const shape = <T extends Row>(r: T) => ({ ...r, dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null, done: r.doneAt !== null });
const date = (d: string | null | undefined) => (d ? new Date(`${d}T00:00:00Z`) : null);

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  /** Open steps first (by due date, undated last), then done ones. */
  async list(auth: AuthContext, opts: { controlCode?: string; mine?: boolean }) {
    const rows = await this.prisma.forEntity(auth.entityId).remediationTask.findMany({
      where: { removedAt: null, ...(opts.controlCode && { controlCode: opts.controlCode }), ...(opts.mine && { ownerId: auth.userId }) },
      orderBy: [{ doneAt: { sort: 'desc', nulls: 'first' } }, { dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      select: SELECT,
    });
    return rows.map(shape);
  }

  /** Admins plan any control; a Control Owner plans the controls assigned to them. */
  private async canPlan(auth: AuthContext, controlCode: string) {
    if (auth.role === 'ADMIN') return true;
    if (auth.role !== 'CONTROL_OWNER') return false;
    const status = await this.prisma
      .forEntity(auth.entityId)
      .controlStatus.findUnique({ where: { entityId_controlCode: { entityId: auth.entityId, controlCode } }, select: { ownerId: true } });
    return status?.ownerId === auth.userId;
  }

  private audit(auth: AuthContext, action: string, controlCode: string, meta: RequestMeta, extra: object) {
    return this.prisma.forEntity(auth.entityId).auditLog.create({
      data: { entityId: auth.entityId, actorId: auth.userId, action, target: controlCode, ip: meta.ip ?? null, meta: extra },
    });
  }

  async create(auth: AuthContext, controlCode: string, input: Required<Pick<TaskInput, 'title'>> & TaskInput, meta: RequestMeta) {
    const control = await this.prisma.eccControl.findUnique({ where: { code: controlCode }, select: { parentCode: true } });
    if (!control || control.parentCode !== null) throw new NotFoundException({ code: 'not_found' });
    if (!(await this.canPlan(auth, controlCode))) throw new ForbiddenException({ code: 'forbidden' });

    const db = this.prisma.forEntity(auth.entityId);
    if (input.ownerId) await assertAssignable(db, input.ownerId);
    const row = await db.remediationTask.create({
      data: {
        entityId: auth.entityId,
        controlCode,
        title: input.title,
        ownerId: input.ownerId ?? null,
        dueDate: date(input.dueDate),
        createdById: auth.userId,
      },
      select: SELECT,
    });
    await this.audit(auth, 'task.created', controlCode, meta, { taskId: row.id, title: input.title, ownerId: input.ownerId ?? null, dueDate: input.dueDate ?? null });
    return shape(row);
  }

  /**
   * Planners (Admin, the control's owner) change anything. The step's own
   * owner may only mark it done or not done.
   */
  async update(auth: AuthContext, id: string, input: TaskInput, meta: RequestMeta) {
    const db = this.prisma.forEntity(auth.entityId);
    const task = await db.remediationTask.findFirst({ where: { id, removedAt: null } });
    if (!task) throw new NotFoundException({ code: 'not_found' });

    const onlyDone = input.title === undefined && input.ownerId === undefined && input.dueDate === undefined;
    const planner = await this.canPlan(auth, task.controlCode);
    if (!planner && !(onlyDone && task.ownerId === auth.userId)) {
      throw new ForbiddenException({ code: 'forbidden' });
    }
    if (input.ownerId) await assertAssignable(db, input.ownerId);

    const row = await db.remediationTask.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.ownerId !== undefined && { ownerId: input.ownerId }),
        ...(input.dueDate !== undefined && { dueDate: date(input.dueDate) }),
        ...(input.done !== undefined && { doneAt: input.done ? (task.doneAt ?? new Date()) : null }),
      },
      select: SELECT,
    });
    const action = input.done !== undefined && onlyDone ? (input.done ? 'task.done' : 'task.reopened') : 'task.updated';
    await this.audit(auth, action, task.controlCode, meta, { taskId: id, title: row.title, change: { ...input } });
    return shape(row);
  }

  async remove(auth: AuthContext, id: string, meta: RequestMeta) {
    const db = this.prisma.forEntity(auth.entityId);
    const task = await db.remediationTask.findFirst({ where: { id, removedAt: null } });
    if (!task) throw new NotFoundException({ code: 'not_found' });
    if (!(await this.canPlan(auth, task.controlCode))) throw new ForbiddenException({ code: 'forbidden' });
    await db.remediationTask.update({ where: { id }, data: { removedAt: new Date() } });
    await this.audit(auth, 'task.removed', task.controlCode, meta, { taskId: id, title: task.title });
  }
}
