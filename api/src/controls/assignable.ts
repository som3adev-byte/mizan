import { HttpStatus } from '@nestjs/common';
import { AuthError } from '../auth/auth.service.js';
import type { EntityScopedClient } from '../prisma/entity-scope.js';

/**
 * Controls and remediation steps can be owned by active Admins and Control
 * Owners of the same entity. The lookup runs under RLS, so a user from another
 * entity is simply not found.
 */
export async function assertAssignable(db: EntityScopedClient, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { status: true, role: true } });
  if (!user || user.status !== 'ACTIVE' || (user.role !== 'ADMIN' && user.role !== 'CONTROL_OWNER')) {
    throw new AuthError('invalid_owner', HttpStatus.UNPROCESSABLE_ENTITY);
  }
}
