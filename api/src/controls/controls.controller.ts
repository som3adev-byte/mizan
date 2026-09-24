import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { ComplianceStatus } from '../generated/prisma/enums.js';
import { AuthError } from '../auth/auth.service.js';
import { Auth, Meta, Roles } from '../auth/guards.js';
import type { AuthContext, RequestMeta } from '../auth/auth.types.js';
import { type ControlUpdate, ControlsService } from './controls.service.js';
import { STATUSES } from './summary.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts only the fields it knows, each either a valid value or null (to clear). */
function parseUpdate(body: Record<string, unknown>): ControlUpdate {
  const change: ControlUpdate = {};
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some((k) => !['status', 'ownerId', 'dueDate'].includes(k))) throw new AuthError('invalid_input');

  if ('status' in body) {
    if (!STATUSES.includes(body.status as ComplianceStatus)) throw new AuthError('invalid_input');
    change.status = body.status as ComplianceStatus;
  }
  if ('ownerId' in body) {
    if (body.ownerId !== null && !(typeof body.ownerId === 'string' && UUID.test(body.ownerId))) throw new AuthError('invalid_input');
    change.ownerId = body.ownerId;
  }
  if ('dueDate' in body) {
    const d = body.dueDate;
    if (d !== null && !(typeof d === 'string' && DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)))) throw new AuthError('invalid_input');
    change.dueDate = d;
  }
  return change;
}

@Controller('controls')
export class ControlsController {
  constructor(private readonly controls: ControlsService) {}

  /** Every role can see the catalog and the entity's progress. */
  @Get()
  list(@Auth() auth: AuthContext) {
    return this.controls.list(auth);
  }

  /** Admin only: one change applied to up to all 108 controls. */
  @Roles('ADMIN')
  @Post('bulk')
  @HttpCode(204)
  async updateMany(@Auth() auth: AuthContext, @Body() body: Record<string, unknown>, @Meta() meta: RequestMeta) {
    const { codes, ...rest } = body ?? {};
    if (!Array.isArray(codes) || codes.length === 0 || codes.length > 108 || !codes.every((c) => typeof c === 'string')) {
      throw new AuthError('invalid_input');
    }
    await this.controls.updateMany(auth, [...new Set(codes as string[])], parseUpdate(rest), meta);
  }

  @Roles('ADMIN', 'CONTROL_OWNER')
  @Post(':code')
  @HttpCode(204)
  async update(@Auth() auth: AuthContext, @Param('code') code: string, @Body() body: Record<string, unknown>, @Meta() meta: RequestMeta) {
    await this.controls.update(auth, code, parseUpdate(body ?? {}), meta);
  }
}
