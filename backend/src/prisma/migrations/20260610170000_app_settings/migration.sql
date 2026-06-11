CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "poolEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "AppSettings" ("id", "poolEnabled", "updatedAt")
VALUES (1, true, CURRENT_TIMESTAMP);
