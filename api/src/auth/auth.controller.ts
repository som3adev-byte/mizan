import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { Role } from '../generated/prisma/enums.js';
import { AuthError, AuthService } from './auth.service.js';
import { AllowPendingMfa, Auth, Meta, Public, Roles } from './guards.js';
import { type AuthContext, type RequestMeta, SESSION_COOKIE, SESSION_TTL_MS } from './auth.types.js';

const ROLES: Role[] = ['ADMIN', 'CONTROL_OWNER', 'EXECUTIVE', 'AUDITOR'];

function str(value: unknown, max = 320): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) throw new AuthError('invalid_input');
  return value;
}

function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: Record<string, unknown>, @Meta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    const { token, next } = await this.auth.login(str(body.email), str(body.password, 256), meta);
    setSessionCookie(res, token);
    return { next };
  }

  @AllowPendingMfa()
  @Post('mfa/enroll')
  @HttpCode(200)
  startEnrollment(@Auth() auth: AuthContext) {
    return this.auth.startEnrollment(auth);
  }

  @AllowPendingMfa()
  @Post('mfa/enroll/confirm')
  @HttpCode(204)
  async confirmEnrollment(@Auth() auth: AuthContext, @Body() body: Record<string, unknown>, @Meta() meta: RequestMeta) {
    await this.auth.confirmEnrollment(auth, str(body.code, 6), meta);
  }

  @AllowPendingMfa()
  @Post('mfa/verify')
  @HttpCode(204)
  async verifyMfa(@Auth() auth: AuthContext, @Body() body: Record<string, unknown>, @Meta() meta: RequestMeta) {
    await this.auth.verifyMfa(auth, str(body.code, 6), meta);
  }

  @AllowPendingMfa()
  @Post('logout')
  @HttpCode(204)
  async logout(@Auth() auth: AuthContext, @Meta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(auth, meta);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  me(@Auth() auth: AuthContext) {
    return this.auth.me(auth);
  }

  @Roles('ADMIN')
  @Post('invitations')
  createInvitation(@Auth() auth: AuthContext, @Body() body: Record<string, unknown>, @Meta() meta: RequestMeta) {
    const role = str(body.role, 32) as Role;
    if (!ROLES.includes(role)) throw new AuthError('invalid_input');
    return this.auth.createInvitation(auth, str(body.email), role, meta);
  }

  @Public()
  @Post('invitations/accept')
  @HttpCode(200)
  acceptInvitation(@Body() body: Record<string, unknown>, @Meta() meta: RequestMeta) {
    return this.auth.acceptInvitation(str(body.token, 128), str(body.name, 120), str(body.password, 256), meta);
  }
}
