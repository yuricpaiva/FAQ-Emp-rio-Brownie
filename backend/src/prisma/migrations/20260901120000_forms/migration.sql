-- CreateTable
CREATE TABLE "FormModel" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "resultType" TEXT NOT NULL DEFAULT 'SIMPLE',
    "scoreMin" DECIMAL NOT NULL DEFAULT 0,
    "scoreMax" DECIMAL NOT NULL DEFAULT 10,
    "scoreCalculationType" TEXT NOT NULL DEFAULT 'SIMPLE_AVERAGE',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FormModel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "FormQuestion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "modelId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "photoRequired" BOOLEAN NOT NULL DEFAULT false,
    "weight" DECIMAL NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FormQuestion_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "FormModel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "FormModelRolePermission" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "modelId" INTEGER NOT NULL,
    "permissionType" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormModelRolePermission_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "FormModel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "FormModelUserPermission" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "modelId" INTEGER NOT NULL,
    "permissionType" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormModelUserPermission_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "FormModel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FormModelUserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "FormSubmission" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "modelId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "finalScore" DECIMAL,
    "modelSnapshot" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" DATETIME,
    "approvedAt" DATETIME,
    "approvedById" INTEGER,
    "rejectedAt" DATETIME,
    "rejectedById" INTEGER,
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FormSubmission_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "FormModel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FormSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FormSubmission_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FormSubmission_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "FormAnswer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "submissionId" INTEGER NOT NULL,
    "sourceQuestionId" INTEGER NOT NULL,
    "questionTextSnapshot" TEXT NOT NULL,
    "questionTypeSnapshot" TEXT NOT NULL,
    "positionSnapshot" INTEGER NOT NULL,
    "requiredSnapshot" BOOLEAN NOT NULL DEFAULT false,
    "photoRequiredSnapshot" BOOLEAN NOT NULL DEFAULT false,
    "weightSnapshot" DECIMAL NOT NULL DEFAULT 1,
    "textValue" TEXT,
    "numberValue" DECIMAL,
    "booleanValue" BOOLEAN,
    "scoreValue" DECIMAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FormAnswer_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FormSubmission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "FormAnswerPhoto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "answerId" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FormAnswerPhoto_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "FormAnswer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "FormModel_active_name_idx" ON "FormModel"("active", "name");
CREATE INDEX "FormModel_createdById_createdAt_idx" ON "FormModel"("createdById", "createdAt");
CREATE UNIQUE INDEX "FormQuestion_modelId_position_key" ON "FormQuestion"("modelId", "position");
CREATE INDEX "FormQuestion_modelId_type_idx" ON "FormQuestion"("modelId", "type");
CREATE UNIQUE INDEX "FormModelRolePermission_modelId_permissionType_role_key" ON "FormModelRolePermission"("modelId", "permissionType", "role");
CREATE INDEX "FormModelRolePermission_permissionType_role_modelId_idx" ON "FormModelRolePermission"("permissionType", "role", "modelId");
CREATE UNIQUE INDEX "FormModelUserPermission_modelId_permissionType_userId_key" ON "FormModelUserPermission"("modelId", "permissionType", "userId");
CREATE INDEX "FormModelUserPermission_permissionType_userId_modelId_idx" ON "FormModelUserPermission"("permissionType", "userId", "modelId");
CREATE INDEX "FormSubmission_userId_status_createdAt_idx" ON "FormSubmission"("userId", "status", "createdAt");
CREATE INDEX "FormSubmission_modelId_status_createdAt_idx" ON "FormSubmission"("modelId", "status", "createdAt");
CREATE INDEX "FormSubmission_status_finalizedAt_idx" ON "FormSubmission"("status", "finalizedAt");
CREATE INDEX "FormSubmission_approvedById_idx" ON "FormSubmission"("approvedById");
CREATE INDEX "FormSubmission_rejectedById_idx" ON "FormSubmission"("rejectedById");
CREATE UNIQUE INDEX "FormAnswer_submissionId_sourceQuestionId_key" ON "FormAnswer"("submissionId", "sourceQuestionId");
CREATE INDEX "FormAnswer_submissionId_positionSnapshot_idx" ON "FormAnswer"("submissionId", "positionSnapshot");
CREATE UNIQUE INDEX "FormAnswerPhoto_answerId_key" ON "FormAnswerPhoto"("answerId");
CREATE UNIQUE INDEX "FormAnswerPhoto_storageKey_key" ON "FormAnswerPhoto"("storageKey");
