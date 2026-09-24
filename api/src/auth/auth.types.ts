import type { Role } from '../generated/prisma/enums.js';

/** Who is calling, resolved from the session cookie by SessionGuard. */
export interface AuthContext {
  sessionId: string;
  userId: string;
  entityId: string;
  role: Role;
  mfaVerified: boolean;
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export const SESSION_COOKIE = 'mizan_session';

/** Signed-in session: 12 h absolute, 30 min idle. Before MFA: 10 min. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const PENDING_MFA_TTL_MS = 10 * 60 * 1000;
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

/**
 * Error codes the web app translates. Sign-in failures always return
 * `invalid_credentials`, whether or not the email exists.
 */
export type AuthErrorCode =
  | 'invalid_credentials'
  | 'account_locked'
  | 'invalid_code'
  | 'mfa_already_enabled'
  | 'mfa_not_started'
  | 'invalid_invitation'
  | 'email_taken'
  | 'weak_password'
  | 'invalid_input'
  | 'cannot_change_self'
  | 'last_admin'
  | 'invalid_owner'
  | 'file_type'
  | 'cloud_not_used';
