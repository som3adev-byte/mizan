import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthContext, RequestMeta } from '../auth/auth.types.js';

/** Subdomain 4-2 (cloud computing and hosting) applies only to entities that use or plan to use cloud services. */
export const CLOUD_SUBDOMAIN = '4-2';

@Injectable()
export class EntityService {
  constructor(private readonly prisma: PrismaService) {}

  async get(auth: AuthContext) {
    return this.prisma.forEntity(auth.entityId).entity.findUniqueOrThrow({
      where: { id: auth.entityId },
      select: { id: true, name: true, nameEn: true, usesCloud: true },
    });
  }

  /** Admin corrects the entity's names. nameEn null clears it (the interface falls back to the Arabic name). */
  async setNames(auth: AuthContext, names: { name: string; nameEn: string | null }, meta: RequestMeta) {
    const db = this.prisma.forEntity(auth.entityId);
    const before = await db.entity.findUniqueOrThrow({ where: { id: auth.entityId }, select: { name: true, nameEn: true } });
    if (before.name === names.name && before.nameEn === names.nameEn) return this.get(auth);
    await db.entity.update({ where: { id: auth.entityId }, data: names });
    await db.auditLog.create({
      data: { entityId: auth.entityId, actorId: auth.userId, action: 'entity.renamed', ip: meta.ip ?? null, meta: { before, after: names } },
    });
    return this.get(auth);
  }

  /**
   * Answering "no" marks every 4-2 control not applicable; answering "yes"
   * returns the ones that were not applicable to not started. One transaction,
   * one audit entry for the answer and one per control that changed.
   */
  async setUsesCloud(auth: AuthContext, usesCloud: boolean, meta: RequestMeta) {
    const codes = (
      await this.prisma.eccControl.findMany({ where: { subdomainCode: CLOUD_SUBDOMAIN, parentCode: null }, select: { code: true }, orderBy: { sort: 'asc' } })
    ).map((c) => c.code);

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.entity_id', ${auth.entityId}, true)`;
      const entity = await tx.entity.findUniqueOrThrow({ where: { id: auth.entityId }, select: { usesCloud: true } });
      if (entity.usesCloud === usesCloud) return;
      await tx.entity.update({ where: { id: auth.entityId }, data: { usesCloud } });

      const rows = new Map((await tx.controlStatus.findMany({ where: { controlCode: { in: codes } } })).map((r) => [r.controlCode, r]));
      const changed: string[] = [];
      for (const code of codes) {
        const current = rows.get(code)?.status ?? 'NOT_STARTED';
        const next = usesCloud ? (current === 'NOT_APPLICABLE' ? 'NOT_STARTED' : current) : 'NOT_APPLICABLE';
        if (next === current) continue;
        await tx.controlStatus.upsert({
          where: { entityId_controlCode: { entityId: auth.entityId, controlCode: code } },
          create: { entityId: auth.entityId, controlCode: code, status: next },
          update: { status: next },
        });
        await tx.auditLog.create({
          data: {
            entityId: auth.entityId,
            actorId: auth.userId,
            action: 'control.updated',
            target: code,
            ip: meta.ip ?? null,
            meta: { before: { status: current }, change: { status: next }, reason: 'cloud_answer' },
          },
        });
        changed.push(code);
      }
      await tx.auditLog.create({
        data: { entityId: auth.entityId, actorId: auth.userId, action: 'entity.cloud_changed', ip: meta.ip ?? null, meta: { from: entity.usesCloud, to: usesCloud, controls: changed } },
      });
    });
    return this.get(auth);
  }
}
