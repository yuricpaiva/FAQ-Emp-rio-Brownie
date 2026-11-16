ALTER TABLE "AppSettings"
ADD COLUMN "purchaseSignatureThresholdCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AppSettings"
ADD COLUMN "purchaseSignatureLabel" TEXT NOT NULL DEFAULT '';
