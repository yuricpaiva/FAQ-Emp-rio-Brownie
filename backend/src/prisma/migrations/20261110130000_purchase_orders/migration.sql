CREATE TABLE "PurchaseAccess" (
    "userId" INTEGER NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PurchaseOrder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "buyerId" INTEGER NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierEverestId" TEXT NOT NULL DEFAULT '',
    "supplierName" TEXT NOT NULL,
    "supplierLegalName" TEXT NOT NULL DEFAULT '',
    "supplierCnpj" TEXT NOT NULL DEFAULT '',
    "productSubtotalCents" INTEGER NOT NULL,
    "additionsTotalCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "signatureLabel" TEXT,
    "signatureThresholdCents" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "cancelledAt" DATETIME,
    "cancelledById" INTEGER,
    CONSTRAINT "PurchaseOrder_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrder_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PurchaseOrderItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "everestProductId" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "supplierUnitId" TEXT NOT NULL,
    "supplierUnitEverestId" TEXT NOT NULL DEFAULT '',
    "supplierUnitCode" TEXT NOT NULL DEFAULT '',
    "supplierUnitLabel" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    CONSTRAINT "PurchaseOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PurchaseOrderAddition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    CONSTRAINT "PurchaseOrderAddition_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PurchaseOrder_number_key" ON "PurchaseOrder"("number");
CREATE INDEX "PurchaseOrder_createdAt_idx" ON "PurchaseOrder"("createdAt");
CREATE INDEX "PurchaseOrder_status_createdAt_idx" ON "PurchaseOrder"("status", "createdAt");
CREATE INDEX "PurchaseOrder_buyerId_createdAt_idx" ON "PurchaseOrder"("buyerId", "createdAt");
CREATE INDEX "PurchaseOrder_supplierId_createdAt_idx" ON "PurchaseOrder"("supplierId", "createdAt");
CREATE INDEX "PurchaseOrder_cancelledById_idx" ON "PurchaseOrder"("cancelledById");
CREATE INDEX "PurchaseOrderItem_orderId_idx" ON "PurchaseOrderItem"("orderId");
CREATE INDEX "PurchaseOrderItem_productId_orderId_idx" ON "PurchaseOrderItem"("productId", "orderId");
CREATE INDEX "PurchaseOrderAddition_orderId_idx" ON "PurchaseOrderAddition"("orderId");
