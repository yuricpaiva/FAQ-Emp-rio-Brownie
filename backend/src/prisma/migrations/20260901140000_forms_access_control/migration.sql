CREATE TABLE "FormAccess" (
    "userId" INTEGER NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Preserve access for every active user who already used the module.
INSERT INTO "FormAccess" ("userId", "createdAt")
SELECT "id", CURRENT_TIMESTAMP
FROM "User"
WHERE "active" = true;
