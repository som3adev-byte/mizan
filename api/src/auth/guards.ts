import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '../generated/prisma/enums.js';
import { AuthService } from './auth.service.js';
import { type AuthContext, type RequestMeta, SESSION_COOKIE } from './auth.types.js';

export const PUBLIC = 'auth:public';
export const ALLOW_PENDING_MFA = 'auth:allow-pending-mfa';
export const ROLES = 'auth:roles';
export const UPLOAD = 'auth:upload';

/** No session needed (sign-in, accepting an invitation). */
export const Public = () => SetMetadata(PUBLIC, true);
/** Session needed, but MFA may still be pending (the MFA steps themselves). */
export const AllowPendingMfa = () => SetMetadata(ALLOW_PENDING_MFA, true);
/**
 * The route takes a multipart file upload instead of JSON. Such requests must
 * carry an Origin header from the web app: a cross-site form could otherwise
 * post multipart without one.
 */
export const Upload = () => SetMetadata(UPLOAD, true);
/** Only these roles may call the route. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

type AuthedRequest = Request & { auth?: AuthContext };

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const auth = ctx.switchToHttp().getRequest<AuthedRequest>().auth;
  if (!auth) throw new UnauthorizedException();
  return auth;
});

export const Meta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
});

/**
 * Global guard, in order:
 * 1. State-changing requests must be JSON and, when an Origin is sent, come
 *    from the web app. @Upload() routes take multipart instead and require the
 *    Origin. Together with SameSite=Lax cookies this blocks CSRF.
 * 2. Every route needs a live session unless marked @Public().
 * 3. The session must have passed MFA unless marked @AllowPendingMfa().
 * 4. @Roles() limits the route to those roles.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const flag = <T>(key: string) => this.reflector.getAllAndOverride<T>(key, [ctx.getHandler(), ctx.getClass()]);

    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const allowed = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',');
      const origin = req.headers.origin;
      if (flag<boolean>(UPLOAD)) {
        if (!origin || !allowed.includes(origin)) throw new ForbiddenException({ code: 'bad_origin' });
        if (!req.is('multipart/form-data')) throw new ForbiddenException({ code: 'multipart_required' });
      } else {
        if (origin && !allowed.includes(origin)) throw new ForbiddenException({ code: 'bad_origin' });
        if (!req.is('application/json')) throw new ForbiddenException({ code: 'json_required' });
      }
    }

    if (flag<boolean>(PUBLIC)) return true;

    const token = readCookie(req, SESSION_COOKIE);
    const auth = token ? await this.auth.resolveSession(token) : null;
    if (!auth) throw new UnauthorizedException({ code: 'not_signed_in' });

    if (!auth.mfaVerified && !flag<boolean>(ALLOW_PENDING_MFA)) {
      throw new UnauthorizedException({ code: 'mfa_required' });
    }

    const roles = flag<Role[] | undefined>(ROLES);
    if (roles && !roles.includes(auth.role)) throw new ForbiddenException({ code: 'forbidden' });

    req.auth = auth;
    return true;
  }
}
