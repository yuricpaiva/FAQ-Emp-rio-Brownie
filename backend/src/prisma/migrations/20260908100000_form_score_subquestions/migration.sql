CREATE TABLE "FormSubQuestion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "questionId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FormSubQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "FormQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "FormSubAnswer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "answerId" INTEGER NOT NULL,
    "sourceSubQuestionId" INTEGER NOT NULL,
    "questionTextSnapshot" TEXT NOT NULL,
    "questionTypeSnapshot" TEXT NOT NULL,
    "positionSnapshot" INTEGER NOT NULL,
    "booleanValue" BOOLEAN,
    "scoreValue" DECIMAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FormSubAnswer_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "FormAnswer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FormSubQuestion_questionId_position_key" ON "FormSubQuestion"("questionId", "position");
CREATE INDEX "FormSubQuestion_questionId_type_idx" ON "FormSubQuestion"("questionId", "type");
CREATE UNIQUE INDEX "FormSubAnswer_answerId_sourceSubQuestionId_key" ON "FormSubAnswer"("answerId", "sourceSubQuestionId");
CREATE INDEX "FormSubAnswer_answerId_positionSnapshot_idx" ON "FormSubAnswer"("answerId", "positionSnapshot");
