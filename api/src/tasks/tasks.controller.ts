import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { AuthError } from '../auth/auth.service.js';
import { Auth, Meta, Roles } from '../auth/guards.js';
import type { AuthContext, RequestMeta } from '../auth/auth.types.js';
import { type TaskInput, TasksService } from './tasks.service.js';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const CODE = /^\d+-\d+-\d+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Only known fields, each valid or null (to clear). */
function parse(body: Record<string, unknown>, allowDone: boolean): TaskInput {
  const out: TaskInput = {};
  const allowed = ['title', 'ownerId', 'dueDate', ...(allowDone ? ['done'] : [])];
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some((k) => !allowed.includes(k))) throw new AuthError('invalid_input');
  if ('title' in body) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (title.length < 2 || title.length > 300) throw new AuthError('invalid_input');
    out.title = title;
  }
  if ('ownerId' in body) {
    if (body.ownerId !== null && !(typeof body.ownerId === 'string' && UUID.test(body.ownerId))) throw new AuthError('invalid_input');
    out.ownerId = body.ownerId;
  }
  if ('dueDate' in body) {
    const d = body.dueDate;
    if (d !== null && !(typeof d === 'string' && DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)))) throw new AuthError('invalid_input');
    out.dueDate = d;
  }
  if ('done' in body) {
    if (typeof body.done !== 'boolean') throw new AuthError('invalid_input');
    out.done = body.done;
  }
  return out;
}

/** Remediation plans: steps on a control, each with an owner and a due date. */
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@Auth() auth: AuthContext, @Query('control') control?: string, @Query('mine') mine?: string) {
    if (control !== undefined && !CODE.test(control)) throw new AuthError('invalid_input');
    return this.tasks.list(auth, { controlCode: control, mine: mine === '1' });
  }

  @Roles('ADMIN', 'CONTROL_OWNER')
  @Post()
  create(@Auth() auth: AuthContext, @Body() body: Record<string, unknown>, @Meta() meta: RequestMeta) {
    const { controlCode, ...rest } = body ?? {};
    if (typeof controlCode !== 'string' || !CODE.test(controlCode)) throw new AuthError('invalid_input');
    const input = parse(rest, false);
    if (input.title === undefined) throw new AuthError('invalid_input');
    return this.tasks.create(auth, controlCode, { ...input, title: input.title }, meta);
  }

  @Roles('ADMIN', 'CONTROL_OWNER')
  @Post(':id')
  @HttpCode(200)
  update(@Auth() auth: AuthContext, @Param('id', uuid) id: string, @Body() body: Record<string, unknown>, @Meta() meta: RequestMeta) {
    return this.tasks.update(auth, id, parse(body ?? {}, true), meta);
  }

  @Roles('ADMIN', 'CONTROL_OWNER')
  @Post(':id/remove')
  @HttpCode(204)
  async remove(@Auth() auth: AuthContext, @Param('id', uuid) id: string, @Meta() meta: RequestMeta) {
    await this.tasks.remove(auth, id, meta);
  }
}
