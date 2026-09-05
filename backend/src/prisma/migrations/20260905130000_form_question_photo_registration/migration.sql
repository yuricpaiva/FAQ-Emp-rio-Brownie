-- Allow photographic evidence to be optional or required per question.
ALTER TABLE "FormQuestion" ADD COLUMN "allowPhoto" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FormAnswer" ADD COLUMN "photoAllowedSnapshot" BOOLEAN NOT NULL DEFAULT false;
