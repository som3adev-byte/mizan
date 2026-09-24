import { Controller, Get, Query } from '@nestjs/common';
import { AuthError } from '../auth/auth.service.js';
import { Auth, Roles } from '../auth/guards.js';
import type { AuthContext } from '../auth/auth.types.js';
import { AUDIT_CATEGORIES, type AuditCategory, AuditLogService } from './audit-log.service.js';

/** Read-only by design: the audit log accepts no updates or deletes. */
@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Roles('ADMIN', 'AUDITOR')
  @Get()
  list(@Auth() auth: AuthContext, @Query('before') before?: string, @Query('category') category?: string) {
    if (before !== undefined && !/^\d{1,18}$/.test(before)) throw new AuthError('invalid_input');
    if (category !== undefined && !AUDIT_CATEGORIES.includes(category as AuditCategory)) throw new AuthError('invalid_input');
    return this.auditLog.list(auth, { before: before === undefined ? undefined : BigInt(before), category: category as AuditCategory | undefined });
  }
}
