-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'DISABLED');

-- DropIndex
DROP INDEX "users_entity_id_email_key";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failed_logins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMP(3),
ADD COLUMN     "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfa_secret" TEXT,
ADD COLUMN     "password_hash" TEXT,
ADD COLUMN     "status" "user_status" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "mfa_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "role" NOT NULL,
    "invited_by_id" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "entity_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_entity_id_idx" ON "sessions"("entity_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_entity_id_idx" ON "invitations"("entity_id");

-- CreateIndex
CREATE INDEX "audit_log_entity_id_created_at_idx" ON "audit_log"("entity_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Tenant isolation for the new tables
-- ---------------------------------------------------------------------------

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;

CREATE POLICY sessions_same_entity ON "sessions"
  USING ("entity_id" = app_current_entity())
  WITH CHECK ("entity_id" = app_current_entity());

CREATE POLICY invitations_same_entity ON "invitations"
  USING ("entity_id" = app_current_entity())
  WITH CHECK ("entity_id" = app_current_entity());

CREATE POLICY audit_log_read_same_entity ON "audit_log"
  FOR SELECT USING ("entity_id" = app_current_entity());
CREATE POLICY audit_log_write_same_entity ON "audit_log"
  FOR INSERT WITH CHECK ("entity_id" = app_current_entity());

GRANT SELECT, INSERT, UPDATE, DELETE ON "sessions", "invitations" TO mizan_app;
GRANT SELECT, INSERT ON "audit_log" TO mizan_app;
GRANT USAGE ON SEQUENCE "audit_log_id_seq" TO mizan_app;

-- ---------------------------------------------------------------------------
-- Audit log is append-only for everyone, including the table owner.
-- ---------------------------------------------------------------------------

CREATE FUNCTION audit_log_append_only() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN RAISE EXCEPTION 'audit_log is append-only'; END $$;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();

-- ---------------------------------------------------------------------------
-- Lookups that must happen before the entity is known.
-- SECURITY DEFINER runs as the owner; each returns only what sign-in needs,
-- for one exact key. mizan_app can call them and nothing more.
-- ---------------------------------------------------------------------------

CREATE FUNCTION auth_user_by_email(p_email text)
  RETURNS TABLE (id uuid, entity_id uuid, role "role", status "user_status", password_hash text,
                 mfa_enabled boolean, mfa_secret text, failed_logins integer, locked_until timestamp(3))
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
    SELECT u.id, u.entity_id, u.role, u.status, u.password_hash, u.mfa_enabled, u.mfa_secret,
           u.failed_logins, u.locked_until
    FROM users u WHERE u.email = lower(p_email)
  $$;

CREATE FUNCTION auth_session_by_token(p_token_hash text)
  RETURNS TABLE (id uuid, user_id uuid, entity_id uuid, role "role", user_status "user_status",
                 mfa_verified boolean, expires_at timestamp(3), revoked_at timestamp(3), last_seen_at timestamp(3))
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
    SELECT s.id, s.user_id, s.entity_id, u.role, u.status, s.mfa_verified, s.expires_at, s.revoked_at, s.last_seen_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = p_token_hash
  $$;

CREATE FUNCTION auth_invitation_by_token(p_token_hash text)
  RETURNS TABLE (id uuid, entity_id uuid, email text, role "role", expires_at timestamp(3), accepted_at timestamp(3))
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
    SELECT i.id, i.entity_id, i.email, i.role, i.expires_at, i.accepted_at
    FROM invitations i WHERE i.token_hash = p_token_hash
  $$;

REVOKE ALL ON FUNCTION auth_user_by_email(text), auth_session_by_token(text), auth_invitation_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_user_by_email(text), auth_session_by_token(text), auth_invitation_by_token(text) TO mizan_app;
