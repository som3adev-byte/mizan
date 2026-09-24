-- AlterTable
ALTER TABLE "entities" ADD COLUMN     "uses_cloud" BOOLEAN;


-- An Admin answers the cloud question for their own entity. mizan_app may
-- update this one column only, and only on the row RLS already exposes.
GRANT UPDATE ("uses_cloud") ON "entities" TO mizan_app;

CREATE POLICY entity_self_update ON "entities"
  FOR UPDATE USING ("id" = app_current_entity()) WITH CHECK ("id" = app_current_entity());
