import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthError } from '../auth/auth.service.js';
import { Auth, Meta, Roles } from '../auth/guards.js';
import type { AuthContext, RequestMeta } from '../auth/auth.types.js';
import { EntityService } from './entity.service.js';

/** The caller's own entity. There is no way to address another one. */
@Controller('entity')
export class EntityController {
  constructor(private readonly entity: EntityService) {}

  @Get()
  get(@Auth() auth: AuthContext) {
    return this.entity.get(auth);
  }

  @Roles('ADMIN')
  @Post('names')
  @HttpCode(200)
  setNames(@Auth() auth: AuthContext, @Body() body: Record<string, unknown>, @Meta() meta: RequestMeta) {
    const keys = Object.keys(body ?? {});
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const rawEn = body?.nameEn;
    const nameEn = typeof rawEn === 'string' ? rawEn.trim() || null : rawEn === null ? null : undefined;
    if (keys.some((k) => k !== 'name' && k !== 'nameEn') || name.length < 2 || name.length > 200 || nameEn === undefined || (nameEn !== null && nameEn.length > 200)) {
      throw new AuthError('invalid_input');
    }
    return this.entity.setNames(auth, { name, nameEn }, meta);
  }

  @Roles('ADMIN')
  @Post('cloud')
  @HttpCode(200)
  setCloud(@Auth() auth: AuthContext, @Body() body: Record<string, unknown>, @Meta() meta: RequestMeta) {
    if (typeof body?.usesCloud !== 'boolean' || Object.keys(body).length !== 1) throw new AuthError('invalid_input');
    return this.entity.setUsesCloud(auth, body.usesCloud, meta);
  }
}
