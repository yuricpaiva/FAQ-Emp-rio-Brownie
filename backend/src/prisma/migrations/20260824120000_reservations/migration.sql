-- CreateTable
CREATE TABLE "ReservationResourceType" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reservationMode" TEXT NOT NULL DEFAULT 'TIME_SLOT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReservationResource" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "typeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "attributes" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReservationResource_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ReservationResourceType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "resourceId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "cancelledAt" DATETIME,
    "cancelledById" INTEGER,
    "cancellationReason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reservation_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "ReservationResource" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Reservation_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReservationBlock" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "resourceId" INTEGER NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" INTEGER NOT NULL,
    "cancelledAt" DATETIME,
    "cancelledById" INTEGER,
    "cancellationReason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReservationBlock_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "ReservationResource" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReservationBlock_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReservationBlock_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ReservationResourceType_name_key" ON "ReservationResourceType"("name");
CREATE INDEX "ReservationResourceType_active_name_idx" ON "ReservationResourceType"("active", "name");
CREATE UNIQUE INDEX "ReservationResource_typeId_name_key" ON "ReservationResource"("typeId", "name");
CREATE INDEX "ReservationResource_typeId_active_name_idx" ON "ReservationResource"("typeId", "active", "name");
CREATE INDEX "Reservation_resourceId_status_startAt_endAt_idx" ON "Reservation"("resourceId", "status", "startAt", "endAt");
CREATE INDEX "Reservation_userId_status_startAt_idx" ON "Reservation"("userId", "status", "startAt");
CREATE INDEX "Reservation_startAt_endAt_idx" ON "Reservation"("startAt", "endAt");
CREATE INDEX "Reservation_cancelledById_idx" ON "Reservation"("cancelledById");
CREATE INDEX "ReservationBlock_resourceId_status_startAt_endAt_idx" ON "ReservationBlock"("resourceId", "status", "startAt", "endAt");
CREATE INDEX "ReservationBlock_createdById_createdAt_idx" ON "ReservationBlock"("createdById", "createdAt");
CREATE INDEX "ReservationBlock_cancelledById_idx" ON "ReservationBlock"("cancelledById");

-- Database-level overlap protection. Intervals are half-open: [startAt, endAt).
CREATE TRIGGER "Reservation_no_overlap_insert"
BEFORE INSERT ON "Reservation"
WHEN NEW."status" = 'CONFIRMED'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM "Reservation" r
    WHERE r."resourceId" = NEW."resourceId" AND r."status" = 'CONFIRMED'
      AND NEW."startAt" < r."endAt" AND NEW."endAt" > r."startAt"
  ) THEN RAISE(ABORT, 'RESERVATION_CONFLICT') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM "ReservationBlock" b
    WHERE b."resourceId" = NEW."resourceId" AND b."status" = 'ACTIVE'
      AND NEW."startAt" < b."endAt" AND NEW."endAt" > b."startAt"
  ) THEN RAISE(ABORT, 'RESERVATION_BLOCK_CONFLICT') END;
END;

CREATE TRIGGER "Reservation_no_overlap_update"
BEFORE UPDATE OF "resourceId", "startAt", "endAt", "status" ON "Reservation"
WHEN NEW."status" = 'CONFIRMED'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM "Reservation" r
    WHERE r."id" <> NEW."id" AND r."resourceId" = NEW."resourceId" AND r."status" = 'CONFIRMED'
      AND NEW."startAt" < r."endAt" AND NEW."endAt" > r."startAt"
  ) THEN RAISE(ABORT, 'RESERVATION_CONFLICT') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM "ReservationBlock" b
    WHERE b."resourceId" = NEW."resourceId" AND b."status" = 'ACTIVE'
      AND NEW."startAt" < b."endAt" AND NEW."endAt" > b."startAt"
  ) THEN RAISE(ABORT, 'RESERVATION_BLOCK_CONFLICT') END;
END;

CREATE TRIGGER "ReservationBlock_no_overlap_insert"
BEFORE INSERT ON "ReservationBlock"
WHEN NEW."status" = 'ACTIVE'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM "Reservation" r
    WHERE r."resourceId" = NEW."resourceId" AND r."status" = 'CONFIRMED'
      AND NEW."startAt" < r."endAt" AND NEW."endAt" > r."startAt"
  ) THEN RAISE(ABORT, 'BLOCK_RESERVATION_CONFLICT') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM "ReservationBlock" b
    WHERE b."resourceId" = NEW."resourceId" AND b."status" = 'ACTIVE'
      AND NEW."startAt" < b."endAt" AND NEW."endAt" > b."startAt"
  ) THEN RAISE(ABORT, 'BLOCK_CONFLICT') END;
END;

CREATE TRIGGER "ReservationBlock_no_overlap_update"
BEFORE UPDATE OF "resourceId", "startAt", "endAt", "status" ON "ReservationBlock"
WHEN NEW."status" = 'ACTIVE'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM "Reservation" r
    WHERE r."resourceId" = NEW."resourceId" AND r."status" = 'CONFIRMED'
      AND NEW."startAt" < r."endAt" AND NEW."endAt" > r."startAt"
  ) THEN RAISE(ABORT, 'BLOCK_RESERVATION_CONFLICT') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM "ReservationBlock" b
    WHERE b."id" <> NEW."id" AND b."resourceId" = NEW."resourceId" AND b."status" = 'ACTIVE'
      AND NEW."startAt" < b."endAt" AND NEW."endAt" > b."startAt"
  ) THEN RAISE(ABORT, 'BLOCK_CONFLICT') END;
END;
