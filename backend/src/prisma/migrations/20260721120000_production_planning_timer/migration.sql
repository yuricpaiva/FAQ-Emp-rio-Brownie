ALTER TABLE "ProductionPlanningDay" ADD COLUMN "productionStartedAt" DATETIME;
ALTER TABLE "ProductionPlanningDay" ADD COLUMN "productionFinishedAt" DATETIME;

UPDATE "ProductionPlanningDay"
SET "productionStartedAt" = "updatedAt"
WHERE "status" = 'em_producao';
