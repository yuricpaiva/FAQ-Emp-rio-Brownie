CREATE TABLE "ProductionConversion" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "sourceProductId" INTEGER NOT NULL,
  "conversionCode" TEXT NOT NULL,
  "conversionName" TEXT NOT NULL,
  "conversionFactor" DECIMAL NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ProductionConversion_sourceProductId_fkey" FOREIGN KEY ("sourceProductId") REFERENCES "ProductionProduct" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProductionConversion_sourceProductId_key" ON "ProductionConversion"("sourceProductId");
CREATE INDEX "ProductionConversion_active_sourceProductId_idx" ON "ProductionConversion"("active", "sourceProductId");
CREATE INDEX "ProductionConversion_conversionCode_idx" ON "ProductionConversion"("conversionCode");
