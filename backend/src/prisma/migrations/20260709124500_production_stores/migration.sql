CREATE TABLE "ProductionStore" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "sourceCode" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ProductionStoreRoute" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "storeId" INTEGER NOT NULL,
  "weekday" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ProductionStoreRoute_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "ProductionStore" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProductionStore_sourceCode_key" ON "ProductionStore"("sourceCode");
CREATE INDEX "ProductionStore_active_displayName_idx" ON "ProductionStore"("active", "displayName");
CREATE UNIQUE INDEX "ProductionStoreRoute_storeId_weekday_key" ON "ProductionStoreRoute"("storeId", "weekday");
CREATE INDEX "ProductionStoreRoute_active_weekday_idx" ON "ProductionStoreRoute"("active", "weekday");
