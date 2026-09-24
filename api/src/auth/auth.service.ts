import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EntityScopedClient } from '../prisma/entity-scope.js';
import type { Role, UserStatus } from '../generated/prisma/enums.js';
import {
  DUMMY_PASSWORD_HASH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  decryptSecret,
  encryptSecret,
  hashPassword,
  hashToken,
  newToken,
  verifyPassword,
} from './crypto.js';
import { generateTotpSecret, otpauthUrl, verifyTotp } from './totp.js';
import {
  type AuthContext,
  type AuthErrorCode,
  INVITATION_TTL_MS,
  LOCKOUT_MS,
  MAX_FAILED_LOGINS,
  PENDING_MFA_TTL_MS,
  type RequestMeta,
  SESSION_IDLE_MS,
  SESSION_TTL_MS,
} from './auth.types.js';

export class AuthError extends HttpException {
  constructor(code: AuthErrorCode, status = HttpStatus.BAD_REQUEST) {
    super({ code }, status);
  }
}

type UserLookup = {
  id: string;
  entity_id: string;
  role: Role;
  status: UserStatus;
  password_hash: string | null;
  mfa_enabled: boolean;
  mfa_secret: string | null;
  failed_logins: number;
  locked_until: Date | null;
};

type SessionLookup = {
  id: string;
  user_id: string;
  entity_id: string;
  role: Role;
  user_status: UserStatus;
  mfa_verified: boolean;
  expires_at: Date;
  revoked_at: Date | null;
  last_seen_at: Date;
};

type InvitationLookup = {
  id: string;
  entity_id: string;
  email: string;
  role: Role;
  expires_at: Date;
  accepted_at: Date | null;
};

const ISSUER = 'Mizan';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private async audit(db: EntityScopedClient, entityId: string, action: string, actorId: string | null, meta: RequestMeta, extra?: object) {
    await db.auditLog.create({
      data: { entityId, actorId, action, ip: meta.ip ?? null, meta: extra ? (extra as object) : undefined },
    });
  }

  /** Step 1: email + password. Returns a session token that still needs MFA. */
  async login(emailInput: string, password: string, meta: RequestMeta) {
    const email = emailInput.trim().toLowerCase();
    const [user] = await this.prisma.$queryRaw<UserLookup[]>`SELECT * FROM auth_user_by_email(${email})`;

    if (!user || user.status !== 'ACTIVE' || !user.password_hash) {
      await verifyPassword(password, DUMMY_PASSWORD_HASH);
      throw new AuthError('invalid_credentials', HttpStatus.UNAUTHORIZED);
    }

    const db = this.prisma.forEntity(user.entity_id);

    if (user.locked_until && user.locked_until.getTime() > Date.now()) {
      await verifyPassword(password, DUMMY_PASSWORD_HASH);
      await this.audit(db, user.entity_id, 'auth.login_blocked', user.id, meta);
      throw new AuthError('account_locked', HttpStatus.TOO_MANY_REQUESTS);
    }

    if (!(await verifyPassword(password, user.password_hash))) {
      const failed = user.failed_logins + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await db.user.update({
        where: { id: user.id },
        data: { failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCKOUT_MS) : undefined },
      });
      await this.audit(db, user.entity_id, lock ? 'auth.account_locked' : 'auth.login_failed', user.id, meta);
      throw new AuthError('invalid_credentials', HttpStatus.UNAUTHORIZED);
    }

    await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });

    const token = newToken();
    await db.session.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        entityId: user.entity_id,
        mfaVerified: false,
        expiresAt: new Date(Date.now() + PENDING_MFA_TTL_MS),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 400) ?? null,
      },
    });
    await this.audit(db, user.entity_id, 'auth.password_ok', user.id, meta);

    return { token, next: user.mfa_enabled ? ('mfa_verify' as const) : ('mfa_enroll' as const) };
  }

  /** Resolves a cookie token to a live session, or null. Also refreshes idle time. */
  async resolveSession(token: string): Promise<AuthContext | null> {
    const [s] = await this.prisma.$queryRaw<SessionLookup[]>`SELECT * FROM auth_session_by_token(${hashToken(token)})`;
    if (!s || s.revoked_at || s.user_status !== 'ACTIVE') return null;

    const now = Date.now();
    if (s.expires_at.getTime() <= now) return null;
    if (s.mfa_verified && now - s.last_seen_at.getTime() > SESSION_IDLE_MS) return null;

    if (now - s.last_seen_at.getTime() > 60_000) {
      await this.prisma.forEntity(s.entity_id).session.update({ where: { id: s.id }, data: { lastSeenAt: new Date(now) } });
    }

    return { sessionId: s.id, userId: s.user_id, entityId: s.entity_id, role: s.role, mfaVerified: s.mfa_verified };
  }

  /** Step 2a (first sign-in): create a secret and show it as a QR / key. */
  async startEnrollment(auth: AuthContext) {
    const db = this.prisma.forEntity(auth.entityId);
    const user = await db.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (user.mfaEnabled) throw new AuthError('mfa_already_enabled', HttpStatus.CONFLICT);

    const secret = generateTotpSecret();
    await db.user.update({ where: { id: user.id }, data: { mfaSecret: encryptSecret(secret) } });
    return { secret, otpauthUrl: otpauthUrl(ISSUER, user.email, secret) };
  }

  /** Step 2a (continued): first code proves the app is set up; MFA turns on. */
  async confirmEnrollment(auth: AuthContext, code: string, meta: RequestMeta) {
    const db = this.prisma.forEntity(auth.entityId);
    const user = await db.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (user.mfaEnabled) throw new AuthError('mfa_already_enabled', HttpStatus.CONFLICT);
    if (!user.mfaSecret) throw new AuthError('mfa_not_started');

    const step = verifyTotp(code, decryptSecret(user.mfaSecret));
    if (step === null) {
      await this.audit(db, auth.entityId, 'auth.mfa_enroll_failed', user.id, meta);
      throw new AuthError('invalid_code');
    }

    await db.user.update({ where: { id: user.id }, data: { mfaEnabled: true, mfaLastStep: step } });
    await this.markVerified(db, auth);
    await this.audit(db, auth.entityId, 'auth.mfa_enrolled', user.id, meta);
  }

  /** Step 2b (later sign-ins): check the code from the app. */
  async verifyMfa(auth: AuthContext, code: string, meta: RequestMeta) {
    const db = this.prisma.forEntity(auth.entityId);
    const user = await db.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!user.mfaEnabled || !user.mfaSecret) throw new AuthError('mfa_not_started');

    const step = verifyTotp(code, decryptSecret(user.mfaSecret));
    if (step === null || (user.mfaLastStep !== null && step <= user.mfaLastStep)) {
      await this.audit(db, auth.entityId, 'auth.mfa_failed', user.id, meta);
      throw new AuthError('invalid_code');
    }

    await db.user.update({ where: { id: user.id }, data: { mfaLastStep: step } });
    await this.markVerified(db, auth);
    await this.audit(db, auth.entityId, 'auth.login_succeeded', user.id, meta);
  }

  private async markVerified(db: EntityScopedClient, auth: AuthContext) {
    await db.session.update({
      where: { id: auth.sessionId },
      data: { mfaVerified: true, lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
  }

  async logout(auth: AuthContext, meta: RequestMeta) {
    const db = this.prisma.forEntity(auth.entityId);
    await db.session.update({ where: { id: auth.sessionId }, data: { revokedAt: new Date() } });
    await this.audit(db, auth.entityId, 'auth.logout', auth.userId, meta);
  }

  async me(auth: AuthContext) {
    const db = this.prisma.forEntity(auth.entityId);
    const user = await db.user.findUniqueOrThrow({ where: { id: auth.userId } });
    const [entity] = await db.entity.findMany({ where: { id: auth.entityId } });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      entity: { id: auth.entityId, name: entity?.name ?? '', nameEn: entity?.nameEn ?? null },
    };
  }

  /** Admin invites someone. Returns the one-time token; only its hash is stored. */
  async createInvitation(auth: AuthContext, emailInput: string, role: Role, meta: RequestMeta) {
    const email = emailInput.trim().toLowerCase();
    // One @, something on both sides, a dot in the domain, no spaces. Delivery is the real proof.
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError('invalid_input');
    const [existing] = await this.prisma.$queryRaw<UserLookup[]>`SELECT * FROM auth_user_by_email(${email})`;
    if (existing) throw new AuthError('email_taken', HttpStatus.CONFLICT);

    const db = this.prisma.forEntity(auth.entityId);
    // Inviting the same address again re-sends: the new link replaces any
    // pending one, so only one link per person is ever valid.
    const replaced = await db.invitation.findMany({ where: { email, acceptedAt: null }, select: { id: true } });
    if (replaced.length) await db.invitation.deleteMany({ where: { id: { in: replaced.map((r) => r.id) } } });

    const token = newToken();
    const invitation = await db.invitation.create({
      data: {
        tokenHash: hashToken(token),
        entityId: auth.entityId,
        email,
        role,
        invitedById: auth.userId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });
    await this.audit(db, auth.entityId, 'user.invited', auth.userId, meta, {
      invitationId: invitation.id,
      email,
      role,
      ...(replaced.length && { replaced: replaced.map((r) => r.id) }),
    });
    return { token, expiresAt: invitation.expiresAt };
  }

  /** The invited person sets their name and password. MFA is set up at first sign-in. */
  async acceptInvitation(token: string, name: string, password: string, meta: RequestMeta) {
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      throw new AuthError('weak_password');
    }
    const [inv] = await this.prisma.$queryRaw<InvitationLookup[]>`SELECT * FROM auth_invitation_by_token(${hashToken(token)})`;
    if (!inv || inv.accepted_at || inv.expires_at.getTime() <= Date.now()) {
      throw new AuthError('invalid_invitation', HttpStatus.GONE);
    }

    const db = this.prisma.forEntity(inv.entity_id);
    const [existing] = await this.prisma.$queryRaw<UserLookup[]>`SELECT * FROM auth_user_by_email(${inv.email})`;
    if (existing) throw new AuthError('email_taken', HttpStatus.CONFLICT);

    const user = await db.user.create({
      data: { entityId: inv.entity_id, email: inv.email, name: name.trim(), role: inv.role, passwordHash: await hashPassword(password) },
    });
    await db.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
    await this.audit(db, inv.entity_id, 'user.invitation_accepted', user.id, meta, { invitationId: inv.id });
    return { email: user.email };
  }
}
