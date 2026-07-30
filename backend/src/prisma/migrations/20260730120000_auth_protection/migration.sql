ALTER TABLE "User" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "LoginThrottle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "scope" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lockLevel" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" DATETIME NOT NULL,
    "lockedUntil" DATETIME,
    "lastFailedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "LoginThrottle_scope_keyHash_key"
ON "LoginThrottle"("scope", "keyHash");

CREATE INDEX "LoginThrottle_lockedUntil_idx"
ON "LoginThrottle"("lockedUntil");

CREATE INDEX "LoginThrottle_updatedAt_idx"
ON "LoginThrottle"("updatedAt");
