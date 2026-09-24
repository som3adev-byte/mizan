import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EntityScopedClient } from '../prisma/entity-scope.js';
import type { Role } from '../generated/prisma/enums.js';
import { AuthError } from '../auth/auth.service.js';
import type { AuthContext, RequestMeta } from '../auth/auth.types.js';

export type UsersErrorCode = 'cannot_change_self' | 'last_admin';

class UsersError extends AuthError {
  constructor(code: UsersErrorCode) {
    super(code, HttpStatus.CONFLICT);
  }
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private audit(db: EntityScopedClient, auth: AuthContext, action: string, target: string, meta: RequestMeta, extra?: object) {
    return db.auditLog.create({ data: { entityId: auth.entityId, actorId: auth.userId, action, target, ip: meta.ip ?? null, meta: extra as object } });
  }

  /** Everyone in the entity, plus invitations that were not accepted yet. */
  async list(auth: AuthContext) {
    const db = this.prisma.forEntity(auth.entityId);
    const [users, invitations] = await Promise.all([
      db.user.findMany({
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, email: true, role: true, status: true, mfaEnabled: true, createdAt: true },
      }),
      db.invitation.findMany({
        where: { acceptedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      }),
    ]);
    const now = Date.now();
    return {
      users,
      invitations: invitations.map((i) => ({ ...i, expired: i.expiresAt.getTime() <= now })),
    };
  }

  private async target(db: EntityScopedClient, id: string) {
    // RLS hides other entities' users, so an id from another entity is simply "not found".
    const user = await db.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException({ code: 'not_found' });
    return user;
  }

  private async assertAnotherAdminRemains(db: EntityScopedClient, excludingId: string) {
    const admins = await db.user.count({ where: { role: 'ADMIN', status: 'ACTIVE', id: { not: excludingId } } });
    if (admins === 0) throw new UsersError('last_admin');
  }

  async changeRole(auth: AuthContext, id: string, role: Role, meta: RequestMeta) {
    if (id === auth.userId) throw new UsersError('cannot_change_self');
    const db = this.prisma.forEntity(auth.entityId);
    const user = await this.target(db, id);
    if (user.role === role) return;
    if (user.role === 'ADMIN') await this.assertAnotherAdminRemains(db, id);
    await db.user.update({ where: { id }, data: { role } });
    await this.audit(db, auth, 'user.role_changed', id, meta, { from: user.role, to: role });
  }

  async setActive(auth: AuthContext, id: string, active: boolean, meta: RequestMeta) {
    if (id === auth.userId) throw new UsersError('cannot_change_self');
    const db = this.prisma.forEntity(auth.entityId);
    const user = await this.target(db, id);
    if (!active && user.role === 'ADMIN') await this.assertAnotherAdminRemains(db, id);

    await db.user.update({ where: { id }, data: { status: active ? 'ACTIVE' : 'DISABLED', failedLogins: 0, lockedUntil: null } });
    if (!active) {
      // Sign the person out everywhere, immediately.
      await db.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await this.audit(db, auth, active ? 'user.enabled' : 'user.disabled', id, meta);
  }

  async revokeInvitation(auth: AuthContext, id: string, meta: RequestMeta) {
    const db = this.prisma.forEntity(auth.entityId);
    const { count } = await db.invitation.deleteMany({ where: { id, acceptedAt: null } });
    if (count === 0) throw new NotFoundException({ code: 'not_found' });
    await this.audit(db, auth, 'user.invitation_revoked', id, meta);
  }
}
