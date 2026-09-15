ALTER TABLE "AppSettings"
ADD COLUMN "browninhoConfig" TEXT NOT NULL DEFAULT '{}';

CREATE TABLE "AiConversation" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "userId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AiConversation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AiMessage" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "conversationId" INTEGER NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "AiConversation" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AiAttachment" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "messageId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'upload',
  "storageKey" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiAttachment_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "AiMessage" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AiConversation_userId_updatedAt_idx"
ON "AiConversation"("userId", "updatedAt");

CREATE INDEX "AiMessage_conversationId_createdAt_idx"
ON "AiMessage"("conversationId", "createdAt");

CREATE INDEX "AiAttachment_messageId_idx"
ON "AiAttachment"("messageId");

CREATE INDEX "AiAttachment_kind_createdAt_idx"
ON "AiAttachment"("kind", "createdAt");
