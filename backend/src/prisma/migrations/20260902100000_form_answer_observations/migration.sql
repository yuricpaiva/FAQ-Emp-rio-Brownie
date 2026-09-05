-- Allow each model question to opt into an optional author observation.
ALTER TABLE "FormQuestion" ADD COLUMN "allowObservation" BOOLEAN NOT NULL DEFAULT false;

-- Preserve the setting and optional observation in each historical answer.
ALTER TABLE "FormAnswer" ADD COLUMN "observationAllowedSnapshot" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FormAnswer" ADD COLUMN "observationText" TEXT;
