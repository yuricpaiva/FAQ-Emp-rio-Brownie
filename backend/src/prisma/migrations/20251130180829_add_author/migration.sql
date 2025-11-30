-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Article" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author" TEXT NOT NULL DEFAULT 'Admin',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Article" ("category", "content", "createdAt", "id", "slug", "title", "updatedAt") SELECT "category", "content", "createdAt", "id", "slug", "title", "updatedAt" FROM "Article";
DROP TABLE "Article";
ALTER TABLE "new_Article" RENAME TO "Article";
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
