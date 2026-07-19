CREATE TABLE "ProductionPlanningDay" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "day" TEXT NOT NULL,
    "comparisonStartDate" TEXT NOT NULL,
    "comparisonEndDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'nao_iniciado',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ProductionPlanningStore" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "planningDayId" INTEGER NOT NULL,
    "productionStoreId" INTEGER NOT NULL,
    "storeName" TEXT NOT NULL,
    "defaultIncreasePercent" DECIMAL,
    CONSTRAINT "ProductionPlanningStore_planningDayId_fkey" FOREIGN KEY ("planningDayId") REFERENCES "ProductionPlanningDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductionPlanningStore_productionStoreId_fkey" FOREIGN KEY ("productionStoreId") REFERENCES "ProductionStore" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ProductionPlanningItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "planningStoreId" INTEGER NOT NULL,
    "productionProductId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "family" TEXT NOT NULL DEFAULT '',
    "averageSold" DECIMAL NOT NULL DEFAULT 0,
    "servedDates" TEXT NOT NULL DEFAULT '[]',
    "stockQuantity" DECIMAL,
    "stockStatus" TEXT NOT NULL DEFAULT 'unavailable',
    "stockDate" TEXT NOT NULL DEFAULT '',
    "stockReason" TEXT NOT NULL DEFAULT '',
    "stockSource" TEXT NOT NULL DEFAULT '',
    "increasePercent" DECIMAL,
    "fixedQuantity" DECIMAL NOT NULL DEFAULT 0,
    "orderQuantity" DECIMAL NOT NULL DEFAULT 0,
    "suggestion" DECIMAL NOT NULL DEFAULT 0,
    "importedOnly" BOOLEAN NOT NULL DEFAULT false,
    "dispatchStatus" TEXT,
    "actualQuantity" DECIMAL,
    "justification" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "ProductionPlanningItem_planningStoreId_fkey" FOREIGN KEY ("planningStoreId") REFERENCES "ProductionPlanningStore" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductionPlanningItem_productionProductId_fkey" FOREIGN KEY ("productionProductId") REFERENCES "ProductionProduct" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProductionPlanningDay_day_key" ON "ProductionPlanningDay"("day");
CREATE INDEX "ProductionPlanningDay_day_status_idx" ON "ProductionPlanningDay"("day", "status");
CREATE INDEX "ProductionPlanningDay_createdAt_idx" ON "ProductionPlanningDay"("createdAt");
CREATE UNIQUE INDEX "ProductionPlanningStore_planningDayId_productionStoreId_key" ON "ProductionPlanningStore"("planningDayId", "productionStoreId");
CREATE INDEX "ProductionPlanningStore_planningDayId_storeName_idx" ON "ProductionPlanningStore"("planningDayId", "storeName");
CREATE UNIQUE INDEX "ProductionPlanningItem_planningStoreId_productionProductId_key" ON "ProductionPlanningItem"("planningStoreId", "productionProductId");
CREATE INDEX "ProductionPlanningItem_planningStoreId_code_idx" ON "ProductionPlanningItem"("planningStoreId", "code");
CREATE INDEX "ProductionPlanningItem_dispatchStatus_idx" ON "ProductionPlanningItem"("dispatchStatus");
