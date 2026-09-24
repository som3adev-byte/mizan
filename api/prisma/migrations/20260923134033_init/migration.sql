-- CreateEnum
CREATE TYPE "role" AS ENUM ('ADMIN', 'CONTROL_OWNER', 'EXECUTIVE', 'AUDITOR');

-- CreateEnum
CREATE TYPE "compliance_status" AS ENUM ('COMPLIANT', 'PARTIAL', 'NON_COMPLIANT', 'NOT_APPLICABLE', 'NOT_STARTED');

-- CreateTable
CREATE TABLE "entities" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_statuses" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "control_code" TEXT NOT NULL,
    "status" "compliance_status" NOT NULL DEFAULT 'NOT_STARTED',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "control_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_entity_id_idx" ON "users"("entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_entity_id_email_key" ON "users"("entity_id", "email");

-- CreateIndex
CREATE INDEX "control_statuses_entity_id_idx" ON "control_statuses"("entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "control_statuses_entity_id_control_code_key" ON "control_statuses"("entity_id", "control_code");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_statuses" ADD CONSTRAINT "control_statuses_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Tenant isolation (row-level security)
-- The API connects as mizan_app and sets app.entity_id inside each
-- transaction. With no entity set, every tenant table returns nothing.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app_current_entity() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.entity_id', true), '')::uuid $$;

ALTER TABLE "entities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "control_statuses" ENABLE ROW LEVEL SECURITY;

-- An entity can read its own row only. Creating entities is a provisioning
-- task done with the owner connection, so mizan_app gets no insert policy.
CREATE POLICY entity_self ON "entities"
  FOR SELECT USING ("id" = app_current_entity());

CREATE POLICY users_same_entity ON "users"
  USING ("entity_id" = app_current_entity())
  WITH CHECK ("entity_id" = app_current_entity());

CREATE POLICY control_statuses_same_entity ON "control_statuses"
  USING ("entity_id" = app_current_entity())
  WITH CHECK ("entity_id" = app_current_entity());

GRANT USAGE ON SCHEMA public TO mizan_app;
GRANT SELECT ON "entities" TO mizan_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "users", "control_statuses" TO mizan_app;
GRANT EXECUTE ON FUNCTION app_current_entity() TO mizan_app;
