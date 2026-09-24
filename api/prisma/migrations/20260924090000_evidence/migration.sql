-- CreateTable
CREATE TABLE "evidence" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "control_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "expires_on" DATE,
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),
    "removed_by_id" UUID,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evidence_storage_key_key" ON "evidence"("storage_key");

-- CreateIndex
CREATE INDEX "evidence_entity_id_control_code_idx" ON "evidence"("entity_id", "control_code");

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_control_code_fkey" FOREIGN KEY ("control_code") REFERENCES "ecc_controls"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_uploaded_by_id_entity_id_fkey" FOREIGN KEY ("uploaded_by_id", "entity_id") REFERENCES "users"("id", "entity_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Tenant isolation, same as every entity-owned table. Evidence is never
-- deleted by the API (removal sets removed_at), so mizan_app gets no DELETE.
-- ---------------------------------------------------------------------------
ALTER TABLE "evidence" ENABLE ROW LEVEL SECURITY;

CREATE POLICY evidence_same_entity ON "evidence"
  USING ("entity_id" = app_current_entity())
  WITH CHECK ("entity_id" = app_current_entity());

GRANT SELECT, INSERT, UPDATE ON "evidence" TO mizan_app;
