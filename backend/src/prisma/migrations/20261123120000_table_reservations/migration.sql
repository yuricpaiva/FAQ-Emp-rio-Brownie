-- CreateTable
CREATE TABLE "TableReservationAccess" (
    "userId" INTEGER NOT NULL PRIMARY KEY,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TableReservationAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RestaurantTable" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productionStoreId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RestaurantTable_productionStoreId_fkey" FOREIGN KEY ("productionStoreId") REFERENCES "ProductionStore" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TableReservation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productionStoreId" INTEGER NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "reservationAt" DATETIME NOT NULL,
    "peopleCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMADA',
    "createdById" INTEGER NOT NULL,
    "checkedInById" INTEGER,
    "checkedInAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TableReservation_productionStoreId_fkey" FOREIGN KEY ("productionStoreId") REFERENCES "ProductionStore" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TableReservation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TableReservation_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TableReservationAssignment" (
    "tableReservationId" INTEGER NOT NULL,
    "restaurantTableId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("tableReservationId", "restaurantTableId"),
    CONSTRAINT "TableReservationAssignment_tableReservationId_fkey" FOREIGN KEY ("tableReservationId") REFERENCES "TableReservation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TableReservationAssignment_restaurantTableId_fkey" FOREIGN KEY ("restaurantTableId") REFERENCES "RestaurantTable" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantTable_productionStoreId_name_key" ON "RestaurantTable"("productionStoreId", "name");
CREATE INDEX "RestaurantTable_productionStoreId_active_name_idx" ON "RestaurantTable"("productionStoreId", "active", "name");
CREATE INDEX "TableReservation_productionStoreId_reservationAt_idx" ON "TableReservation"("productionStoreId", "reservationAt");
CREATE INDEX "TableReservation_productionStoreId_status_reservationAt_idx" ON "TableReservation"("productionStoreId", "status", "reservationAt");
CREATE INDEX "TableReservation_createdById_createdAt_idx" ON "TableReservation"("createdById", "createdAt");
CREATE INDEX "TableReservation_checkedInById_checkedInAt_idx" ON "TableReservation"("checkedInById", "checkedInAt");
CREATE INDEX "TableReservationAssignment_restaurantTableId_tableReservationId_idx" ON "TableReservationAssignment"("restaurantTableId", "tableReservationId");
