ALTER TABLE "PurchaseOrder" ADD COLUMN "paid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PurchaseOrder" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "paymentNote" TEXT NOT NULL DEFAULT '';
