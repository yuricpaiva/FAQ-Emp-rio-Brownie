PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "iconKey" TEXT NOT NULL DEFAULT 'default',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

INSERT INTO "Category" ("name", "slug", "iconKey", "sortOrder", "active", "createdAt", "updatedAt")
VALUES
    ('Operação', 'operacao', 'operacao', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Gente & Gestão', 'gente-gestao', 'gente-gestao', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('TI', 'ti', 'ti', 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Controladoria & Financeiro', 'controladoria-financeiro', 'controladoria-financeiro', 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Comercial', 'comercial', 'comercial', 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Marketing', 'marketing', 'marketing', 6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

CREATE TABLE "new_Article" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'published',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT NOT NULL DEFAULT '',
    "author" TEXT NOT NULL DEFAULT 'Admin',
    "authorPhoto" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT 'Admin',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_Article" (
    "id",
    "title",
    "slug",
    "summary",
    "category",
    "content",
    "status",
    "sortOrder",
    "tags",
    "author",
    "authorPhoto",
    "updatedBy",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "title",
    "slug",
    '',
    "category",
    "content",
    'published',
    0,
    '',
    "author",
    "authorPhoto",
    "updatedBy",
    "createdAt",
    "updatedAt"
FROM "Article";

DROP TABLE "Article";
ALTER TABLE "new_Article" RENAME TO "Article";

CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");
CREATE INDEX "Article_status_sortOrder_updatedAt_idx" ON "Article"("status", "sortOrder", "updatedAt");
CREATE INDEX "Article_category_idx" ON "Article"("category");

CREATE TABLE "ArticleRevision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "articleId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT 'Admin',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArticleRevision_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ArticleRevision_articleId_createdAt_idx" ON "ArticleRevision"("articleId", "createdAt");

INSERT INTO "ArticleRevision" ("articleId", "title", "summary", "category", "content", "status", "tags", "updatedBy", "createdAt")
SELECT "id", "title", "summary", "category", "content", "status", "tags", "updatedBy", "updatedAt"
FROM "Article";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
