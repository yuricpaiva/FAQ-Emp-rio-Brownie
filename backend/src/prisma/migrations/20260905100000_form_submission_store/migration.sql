ALTER TABLE "FormModel" ADD COLUMN "requiresStore" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "FormSubmission" ADD COLUMN "productionStoreId" INTEGER REFERENCES "ProductionStore"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FormSubmission" ADD COLUMN "storeNameSnapshot" TEXT;

CREATE INDEX "FormSubmission_productionStoreId_status_createdAt_idx"
ON "FormSubmission"("productionStoreId", "status", "createdAt");
