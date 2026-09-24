import { ForbiddenException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { AuthError } from '../auth/auth.service.js';
import { CLOUD_SUBDOMAIN } from '../entity/entity.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ComplianceStatus } from '../generated/prisma/enums.js';
import type { AuthContext, RequestMeta } from '../auth/auth.types.js';
import { assertAssignable } from './assignable.js';
import { summarize } from './summary.js';

export interface ControlUpdate {
  status?: ComplianceStatus;
  /** A user id, or null to unassign. */
  ownerId?: string | null;
  /** YYYY-MM-DD, or null to clear. */
  dueDate?: string | null;
}

type Catalog = Awaited<ReturnType<ControlsService['loadCatalog']>>;

@Injectable()
export class ControlsService {
  private catalog?: Promise<Catalog>;

  constructor(private readonly prisma: PrismaService) {}

  /** The catalog only changes with a migration, so it is read once per process. */
  private getCatalog() {
    this.catalog ??= this.loadCatalog().catch((err: unknown) => {
      this.catalog = undefined;
      throw err;
    });
    return this.catalog;
  }

  private loadCatalog() {
    return this.prisma.eccDomain.findMany({
      orderBy: { sort: 'asc' },
      select: {
        code: true,
        nameAr: true,
        nameEn: true,
        subdomains: {
          orderBy: { sort: 'asc' },
          select: {
            code: true,
            nameAr: true,
            nameEn: true,
            objectiveAr: true,
            objectiveEn: true,
            controls: {
              where: { parentCode: null },
              orderBy: { sort: 'asc' },
              select: {
                code: true,
                textAr: true,
                textEn: true,
                children: { orderBy: { sort: 'asc' }, select: { code: true, textAr: true, textEn: true } },
              },
            },
          },
        },
      },
    });
  }

  /**
   * The whole catalog with this entity's status, owner and due date on every
   * main control, plus summaries for the entity, each domain and subdomain.
   * Subcontrols are listed under their main control; status is tracked on
   * main controls only.
   */
  async list(auth: AuthContext) {
    const db = this.prisma.forEntity(auth.entityId);
    const [catalog, rows, evidence, entity] = await Promise.all([
      this.getCatalog(),
      db.controlStatus.findMany({
        select: { controlCode: true, status: true, dueDate: true, updatedAt: true, owner: { select: { id: true, name: true } } },
      }),
      db.evidence.groupBy({ by: ['controlCode'], where: { removedAt: null }, _count: { _all: true } }),
      db.entity.findUniqueOrThrow({ where: { id: auth.entityId }, select: { usesCloud: true } }),
    ]);
    const byCode = new Map(rows.map((r) => [r.controlCode, r]));
    const evidenceCount = new Map(evidence.map((e) => [e.controlCode, e._count._all]));
    const all: ComplianceStatus[] = [];

    const domains = catalog.map((d) => {
      const inDomain: ComplianceStatus[] = [];
      const subdomains = d.subdomains.map((s) => {
        const controls = s.controls.map(({ children, ...c }) => {
          const row = byCode.get(c.code);
          const status = row?.status ?? 'NOT_STARTED';
          inDomain.push(status);
          return {
            ...c,
            status,
            owner: row?.owner ?? null,
            dueDate: row?.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
            updatedAt: row?.updatedAt ?? null,
            evidenceCount: evidenceCount.get(c.code) ?? 0,
            subcontrols: children,
          };
        });
        return { ...s, summary: summarize(controls.map((c) => c.status)), controls };
      });
      all.push(...inDomain);
      return { ...d, summary: summarize(inDomain), subdomains };
    });

    return { framework: 'ECC-2:2024', usesCloud: entity.usesCloud, summary: summarize(all), domains };
  }

  /**
   * Admins set status, owner and due date. A Control Owner may only change the
   * status of controls assigned to them.
   */
  async update(auth: AuthContext, code: string, change: ControlUpdate, meta: RequestMeta) {
    if (auth.role !== 'ADMIN') {
      const onlyStatus = change.ownerId === undefined && change.dueDate === undefined;
      const current = await this.prisma
        .forEntity(auth.entityId)
        .controlStatus.findUnique({ where: { entityId_controlCode: { entityId: auth.entityId, controlCode: code } }, select: { ownerId: true } });
      if (auth.role !== 'CONTROL_OWNER' || !onlyStatus || current?.ownerId !== auth.userId) {
        // Checked after the code exists, so a bad code is still "not found".
        await this.assertMainControls([code]);
        throw new ForbiddenException({ code: 'forbidden' });
      }
    }
    await this.apply(auth, [code], change, meta);
  }

  /** Admin only: the same change on many controls, all or nothing. */
  async updateMany(auth: AuthContext, codes: string[], change: ControlUpdate, meta: RequestMeta) {
    await this.apply(auth, codes, change, meta);
  }

  private async assertMainControls(codes: string[]) {
    const found = await this.prisma.eccControl.count({ where: { code: { in: codes }, parentCode: null } });
    if (found !== codes.length) throw new NotFoundException({ code: 'not_found' });
  }

  private async apply(auth: AuthContext, codes: string[], change: ControlUpdate, meta: RequestMeta) {
    await this.assertMainControls(codes);

    // While the entity says it does not use cloud services, 4-2 stays not applicable.
    if (change.status !== undefined && change.status !== 'NOT_APPLICABLE' && codes.some((c) => c.startsWith(`${CLOUD_SUBDOMAIN}-`))) {
      const entity = await this.prisma.forEntity(auth.entityId).entity.findUniqueOrThrow({ where: { id: auth.entityId }, select: { usesCloud: true } });
      if (entity.usesCloud === false) throw new AuthError('cloud_not_used', HttpStatus.CONFLICT);
    }

    if (change.ownerId) await assertAssignable(this.prisma.forEntity(auth.entityId), change.ownerId);

    const data = {
      ...(change.status !== undefined && { status: change.status }),
      ...(change.ownerId !== undefined && { ownerId: change.ownerId }),
      ...(change.dueDate !== undefined && { dueDate: change.dueDate === null ? null : new Date(`${change.dueDate}T00:00:00Z`) }),
    };
    const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

    // One transaction, scoped to the entity the same way forEntity() does.
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.entity_id', ${auth.entityId}, true)`;
      const existing = await tx.controlStatus.findMany({ where: { controlCode: { in: codes } } });
      const before = new Map(existing.map((r) => [r.controlCode, r]));
      for (const code of codes) {
        const current = before.get(code);
        await tx.controlStatus.upsert({
          where: { entityId_controlCode: { entityId: auth.entityId, controlCode: code } },
          create: { entityId: auth.entityId, controlCode: code, ...data },
          update: data,
        });
        await tx.auditLog.create({
          data: {
            entityId: auth.entityId,
            actorId: auth.userId,
            action: 'control.updated',
            target: code,
            ip: meta.ip ?? null,
            meta: {
              before: { status: current?.status ?? 'NOT_STARTED', ownerId: current?.ownerId ?? null, dueDate: day(current?.dueDate) },
              change: { ...change },
              ...(codes.length > 1 && { bulk: codes.length }),
            },
          },
        });
      }
    });
  }
}
