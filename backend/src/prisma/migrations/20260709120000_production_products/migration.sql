CREATE TABLE "ProductionProduct" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ProductionProduct_code_key" ON "ProductionProduct"("code");
CREATE INDEX "ProductionProduct_active_code_idx" ON "ProductionProduct"("active", "code");
