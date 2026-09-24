-- AlterTable
ALTER TABLE "entities" ADD COLUMN     "name_en" TEXT;


-- An Admin can correct the entity's names (Arabic and English) from the
-- entity profile; the same own-entity update policy as uses_cloud applies.
GRANT UPDATE ("name", "name_en") ON "entities" TO mizan_app;
