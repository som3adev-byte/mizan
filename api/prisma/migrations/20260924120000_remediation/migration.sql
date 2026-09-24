-- CreateTable
CREATE TABLE "remediation_tasks" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "control_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "owner_id" UUID,
    "due_date" DATE,
    "done_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "remediation_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "remediation_tasks_entity_id_control_code_idx" ON "remediation_tasks"("entity_id", "control_code");

-- AddForeignKey
ALTER TABLE "remediation_tasks" ADD CONSTRAINT "remediation_tasks_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remediation_tasks" ADD CONSTRAINT "remediation_tasks_control_code_fkey" FOREIGN KEY ("control_code") REFERENCES "ecc_controls"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remediation_tasks" ADD CONSTRAINT "remediation_tasks_owner_id_entity_id_fkey" FOREIGN KEY ("owner_id", "entity_id") REFERENCES "users"("id", "entity_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Tenant isolation. Steps are never deleted by the API (removal sets removed_at).
ALTER TABLE "remediation_tasks" ENABLE ROW LEVEL SECURITY;

CREATE POLICY remediation_tasks_same_entity ON "remediation_tasks"
  USING ("entity_id" = app_current_entity())
  WITH CHECK ("entity_id" = app_current_entity());

GRANT SELECT, INSERT, UPDATE ON "remediation_tasks" TO mizan_app;
