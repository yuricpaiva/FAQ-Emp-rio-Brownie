-- CreateTable
CREATE TABLE "SacSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "auditorUserId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SacSettings_auditorUserId_fkey" FOREIGN KEY ("auditorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SacSettings_auditorUserId_key" ON "SacSettings"("auditorUserId");

-- CreateTable
CREATE TABLE "SacAccess" (
    "userId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SacAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SacOption" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "normalizedLabel" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "SacOption_category_normalizedLabel_key" ON "SacOption"("category", "normalizedLabel");
CREATE INDEX "SacOption_category_active_position_idx" ON "SacOption"("category", "active", "position");

-- CreateTable
CREATE TABLE "SacComplaint" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerName" TEXT NOT NULL,
    "occurrenceDate" DATETIME NOT NULL,
    "problemTypeId" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,
    "purchaseStoreId" INTEGER NOT NULL,
    "suggestedOriginStoreId" INTEGER NOT NULL,
    "offenderStoreId" INTEGER,
    "occurrenceStatusId" INTEGER NOT NULL,
    "complaintText" TEXT NOT NULL,
    "complaintTypeId" INTEGER NOT NULL,
    "actionTaken" TEXT NOT NULL,
    "treatmentOwner" TEXT NOT NULL,
    "observation" TEXT NOT NULL DEFAULT '',
    "resolution" TEXT NOT NULL DEFAULT '',
    "workflowStatus" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "createdById" INTEGER NOT NULL,
    "auditedById" INTEGER,
    "submittedAt" DATETIME,
    "auditedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SacComplaint_problemTypeId_fkey" FOREIGN KEY ("problemTypeId") REFERENCES "SacOption" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SacComplaint_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "SacOption" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SacComplaint_purchaseStoreId_fkey" FOREIGN KEY ("purchaseStoreId") REFERENCES "SacOption" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SacComplaint_suggestedOriginStoreId_fkey" FOREIGN KEY ("suggestedOriginStoreId") REFERENCES "SacOption" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SacComplaint_offenderStoreId_fkey" FOREIGN KEY ("offenderStoreId") REFERENCES "SacOption" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SacComplaint_occurrenceStatusId_fkey" FOREIGN KEY ("occurrenceStatusId") REFERENCES "SacOption" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SacComplaint_complaintTypeId_fkey" FOREIGN KEY ("complaintTypeId") REFERENCES "SacOption" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SacComplaint_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SacComplaint_auditedById_fkey" FOREIGN KEY ("auditedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "SacComplaint_workflowStatus_occurrenceDate_idx" ON "SacComplaint"("workflowStatus", "occurrenceDate");
CREATE INDEX "SacComplaint_createdById_createdAt_idx" ON "SacComplaint"("createdById", "createdAt");
CREATE INDEX "SacComplaint_purchaseStoreId_occurrenceDate_idx" ON "SacComplaint"("purchaseStoreId", "occurrenceDate");
CREATE INDEX "SacComplaint_suggestedOriginStoreId_occurrenceDate_idx" ON "SacComplaint"("suggestedOriginStoreId", "occurrenceDate");
CREATE INDEX "SacComplaint_offenderStoreId_occurrenceDate_idx" ON "SacComplaint"("offenderStoreId", "occurrenceDate");
CREATE INDEX "SacComplaint_problemTypeId_occurrenceDate_idx" ON "SacComplaint"("problemTypeId", "occurrenceDate");
CREATE INDEX "SacComplaint_complaintTypeId_occurrenceDate_idx" ON "SacComplaint"("complaintTypeId", "occurrenceDate");

-- CreateTable
CREATE TABLE "SacComplaintHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "complaintId" INTEGER NOT NULL,
    "actorId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "changesJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SacComplaintHistory_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "SacComplaint" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SacComplaintHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "SacComplaintHistory_complaintId_createdAt_idx" ON "SacComplaintHistory"("complaintId", "createdAt");
CREATE INDEX "SacComplaintHistory_actorId_createdAt_idx" ON "SacComplaintHistory"("actorId", "createdAt");

-- Initial lists based on the current SAC spreadsheet.
INSERT INTO "SacOption" ("category", "label", "normalizedLabel", "position", "updatedAt") VALUES
('PROBLEM_TYPE', 'Entrega', 'entrega', 0, CURRENT_TIMESTAMP),
('PROBLEM_TYPE', 'Produto', 'produto', 1, CURRENT_TIMESTAMP),
('LOCATION', 'iFood', 'ifood', 0, CURRENT_TIMESTAMP),
('LOCATION', 'Loja', 'loja', 1, CURRENT_TIMESTAMP),
('STORE', 'Parangaba', 'parangaba', 0, CURRENT_TIMESTAMP),
('STORE', 'Eusébio', 'eusebio', 1, CURRENT_TIMESTAMP),
('STORE', 'Casa EB', 'casa eb', 2, CURRENT_TIMESTAMP),
('STORE', 'Matriz', 'matriz', 3, CURRENT_TIMESTAMP),
('STORE', 'Iguatemi', 'iguatemi', 4, CURRENT_TIMESTAMP),
('OCCURRENCE_STATUS', 'Em andamento', 'em andamento', 0, CURRENT_TIMESTAMP),
('OCCURRENCE_STATUS', 'Resolvido', 'resolvido', 1, CURRENT_TIMESTAMP),
('COMPLAINT_TYPE', 'Avaria na entrega', 'avaria na entrega', 0, CURRENT_TIMESTAMP),
('COMPLAINT_TYPE', 'Pontuação', 'pontuacao', 1, CURRENT_TIMESTAMP),
('COMPLAINT_TYPE', 'Qualidade do produto', 'qualidade do produto', 2, CURRENT_TIMESTAMP);
