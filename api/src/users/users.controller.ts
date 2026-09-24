import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { Role } from '../generated/prisma/enums.js';
import { AuthError } from '../auth/auth.service.js';
import { Auth, Meta, Roles } from '../auth/guards.js';
import type { AuthContext, RequestMeta } from '../auth/auth.types.js';
import { UsersService } from './users.service.js';

const ROLES: Role[] = ['ADMIN', 'CONTROL_OWNER', 'EXECUTIVE', 'AUDITOR'];
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Admins manage people; Auditors may look (they see everything). */
  @Roles('ADMIN', 'AUDITOR')
  @Get()
  list(@Auth() auth: AuthContext) {
    return this.users.list(auth);
  }

  @Roles('ADMIN')
  @Post(':id/role')
  @HttpCode(204)
  async changeRole(@Auth() auth: AuthContext, @Param('id', uuid) id: string, @Body() body: Record<string, unknown>, @Meta() meta: RequestMeta) {
    const role = body.role as Role;
    if (!ROLES.includes(role)) throw new AuthError('invalid_input');
    await this.users.changeRole(auth, id, role, meta);
  }

  @Roles('ADMIN')
  @Post(':id/disable')
  @HttpCode(204)
  async disable(@Auth() auth: AuthContext, @Param('id', uuid) id: string, @Meta() meta: RequestMeta) {
    await this.users.setActive(auth, id, false, meta);
  }

  @Roles('ADMIN')
  @Post(':id/enable')
  @HttpCode(204)
  async enable(@Auth() auth: AuthContext, @Param('id', uuid) id: string, @Meta() meta: RequestMeta) {
    await this.users.setActive(auth, id, true, meta);
  }

  @Roles('ADMIN')
  @Post('invitations/:id/revoke')
  @HttpCode(204)
  async revokeInvitation(@Auth() auth: AuthContext, @Param('id', uuid) id: string, @Meta() meta: RequestMeta) {
    await this.users.revokeInvitation(auth, id, meta);
  }
}
