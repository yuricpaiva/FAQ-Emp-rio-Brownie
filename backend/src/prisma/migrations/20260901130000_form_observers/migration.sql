-- Add optional default observer to form models.
ALTER TABLE "FormModel" ADD COLUMN "defaultObserverId" INTEGER REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add the historical observer assigned to each submission.
ALTER TABLE "FormSubmission" ADD COLUMN "observerId" INTEGER REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "FormModel_defaultObserverId_idx" ON "FormModel"("defaultObserverId");
CREATE INDEX "FormSubmission_observerId_status_createdAt_idx" ON "FormSubmission"("observerId", "status", "createdAt");
