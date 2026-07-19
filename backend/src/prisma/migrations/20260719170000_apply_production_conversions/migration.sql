ALTER TABLE "ProductionPlanningItem" ADD COLUMN "fixedOrderSources" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ProductionPlanningItem" ADD COLUMN "stockSources" TEXT NOT NULL DEFAULT '[]';

INSERT OR IGNORE INTO "ProductionProduct" (
  "code",
  "name",
  "active",
  "createdAt",
  "updatedAt"
)
SELECT
  "conversionCode",
  MIN("conversionName"),
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ProductionConversion"
WHERE "active" = true
GROUP BY "conversionCode";

UPDATE "ProductionProduct"
SET "active" = true,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" IN (
  SELECT "conversionCode"
  FROM "ProductionConversion"
  WHERE "active" = true
);
