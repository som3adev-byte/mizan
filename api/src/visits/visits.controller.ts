import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AuthError } from '../auth/auth.service.js';
import { Auth, Meta, Roles } from '../auth/guards.js';
import type { AuthContext, RequestMeta } from '../auth/auth.types.js';
import { type VisitInput, VisitsService } from './visits.service.js';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function parse(body: Record<string, unknown>): VisitInput {
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some((k) => k !== 'visitDate' && k !== 'notes')) throw new AuthError('invalid_input');
  const out: VisitInput = {};
  if ('visitDate' in body) {
    const d = body.visitDate;
    if (!(typeof d === 'string' && DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)))) throw new AuthError('invalid_input');
    out.visitDate = d;
  }
  if ('notes' in body) {
    const n = body.notes;
    if (n !== null && !(typeof n === 'string' && n.length <= 2000)) throw new AuthError('invalid_input');
    out.notes = typeof n === 'string' ? n.trim() || null : null;
  }
  return out;
}

/** Auditor visits: the Admin schedules; everyone sees them. */
@Controller('visits')
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Get()
  list(@Auth() auth: AuthContext) {
    return this.visits.list(auth);
  }

  @Get('next')
  async next(@Auth() auth: AuthContext) {
    return { next: await this.visits.next(auth) };
  }

  @Roles('ADMIN')
  @Post()
  create(@Auth() auth: AuthContext, @Body() body: Record<string, unknown>, @Meta() meta: RequestMeta) {
    const input = parse(body ?? {});
    if (!input.visitDate) throw new AuthError('invalid_input');
    return this.visits.create(auth, { ...input, visitDate: input.visitDate }, meta);
  }

  @Roles('ADMIN')
  @Post(':id')
  @HttpCode(200)
  update(@Auth() auth: AuthContext, @Param('id', uuid) id: string, @Body() body: Record<string, unknown>, @Meta() meta: RequestMeta) {
    return this.visits.update(auth, id, parse(body ?? {}), meta);
  }

  @Roles('ADMIN')
  @Post(':id/cancel')
  @HttpCode(204)
  async cancel(@Auth() auth: AuthContext, @Param('id', uuid) id: string, @Meta() meta: RequestMeta) {
    await this.visits.cancel(auth, id, meta);
  }
}
