UPDATE "ProductionProduct"
SET "active" = true,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN (
  SELECT "sourceProductId"
  FROM "ProductionConversion"
  WHERE "active" = true
);
