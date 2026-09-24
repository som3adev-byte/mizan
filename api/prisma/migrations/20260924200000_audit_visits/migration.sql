-- CreateTable
CREATE TABLE "audit_visits" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "visit_date" DATE NOT NULL,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "audit_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_visits_entity_id_visit_date_idx" ON "audit_visits"("entity_id", "visit_date");

-- AddForeignKey
ALTER TABLE "audit_visits" ADD CONSTRAINT "audit_visits_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Tenant isolation. Visits are never deleted by the API (cancel sets cancelled_at).
ALTER TABLE "audit_visits" ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_visits_same_entity ON "audit_visits"
  USING ("entity_id" = app_current_entity())
  WITH CHECK ("entity_id" = app_current_entity());

GRANT SELECT, INSERT, UPDATE ON "audit_visits" TO mizan_app;
