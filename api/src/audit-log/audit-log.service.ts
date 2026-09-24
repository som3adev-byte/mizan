import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthContext } from '../auth/auth.types.js';

export const AUDIT_CATEGORIES = ['control', 'task', 'evidence', 'visit', 'user', 'auth', 'entity'] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const PAGE_SIZE = 50;

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Newest first, PAGE_SIZE at a time. `before` is the id of the last entry
   * already shown. People are returned by id so the page can name actors and
   * targets, including users who were disabled since.
   */
  async list(auth: AuthContext, opts: { before?: bigint; category?: AuditCategory }) {
    const db = this.prisma.forEntity(auth.entityId);
    const rows = await db.auditLog.findMany({
      where: {
        ...(opts.before !== undefined && { id: { lt: opts.before } }),
        ...(opts.category && { action: { startsWith: `${opts.category}.` } }),
      },
      orderBy: { id: 'desc' },
      take: PAGE_SIZE + 1,
    });
    const page = rows.slice(0, PAGE_SIZE);

    const ids = new Set<string>();
    for (const r of page) {
      if (r.actorId) ids.add(r.actorId);
      if (r.action.startsWith('user.') && r.target) ids.add(r.target);
      const owner = (r.meta as { change?: { ownerId?: string | null } } | null)?.change?.ownerId;
      if (owner) ids.add(owner);
    }
    const people = await db.user.findMany({ where: { id: { in: [...ids].filter(isUuid) } }, select: { id: true, name: true } });

    return {
      entries: page.map((r) => ({
        id: r.id.toString(),
        createdAt: r.createdAt,
        action: r.action,
        actorId: r.actorId,
        target: r.target,
        meta: r.meta,
        ip: r.ip,
      })),
      people: Object.fromEntries(people.map((p) => [p.id, p.name])),
      nextBefore: rows.length > PAGE_SIZE ? page[page.length - 1].id.toString() : null,
    };
  }
}

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
