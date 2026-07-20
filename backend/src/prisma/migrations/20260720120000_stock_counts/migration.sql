PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'reader',
    "photoUrl" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "productionStoreId" INTEGER,
    CONSTRAINT "User_productionStoreId_fkey" FOREIGN KEY ("productionStoreId") REFERENCES "ProductionStore" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("active", "email", "id", "name", "passwordHash", "photoUrl", "role")
SELECT "active", "email", "id", "name", "passwordHash", "photoUrl", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_productionStoreId_idx" ON "User"("productionStoreId");

CREATE TABLE "StockCount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productionStoreId" INTEGER NOT NULL,
    "storeName" TEXT NOT NULL,
    "stockDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" INTEGER NOT NULL,
    "createdByName" TEXT NOT NULL,
    "finalizedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StockCount_productionStoreId_fkey" FOREIGN KEY ("productionStoreId") REFERENCES "ProductionStore" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "StockCountItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stockCountId" INTEGER NOT NULL,
    "productionProductId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StockCountItem_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockCountItem_productionProductId_fkey" FOREIGN KEY ("productionProductId") REFERENCES "ProductionProduct" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StockCount_productionStoreId_stockDate_key" ON "StockCount"("productionStoreId", "stockDate");
CREATE INDEX "StockCount_stockDate_status_idx" ON "StockCount"("stockDate", "status");
CREATE INDEX "StockCount_createdById_idx" ON "StockCount"("createdById");
CREATE UNIQUE INDEX "StockCountItem_stockCountId_productionProductId_key" ON "StockCountItem"("stockCountId", "productionProductId");
CREATE INDEX "StockCountItem_stockCountId_code_idx" ON "StockCountItem"("stockCountId", "code");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
