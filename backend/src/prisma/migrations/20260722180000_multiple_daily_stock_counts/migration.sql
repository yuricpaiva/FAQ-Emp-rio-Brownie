DROP INDEX "StockCount_productionStoreId_stockDate_key";

CREATE INDEX "StockCount_productionStoreId_stockDate_status_idx"
ON "StockCount"("productionStoreId", "stockDate", "status");
