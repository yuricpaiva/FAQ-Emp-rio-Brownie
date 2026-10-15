-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN "allUsersParticipants" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "CalendarEventParticipant" (
    "eventId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("eventId", "userId"),
    CONSTRAINT "CalendarEventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CalendarEventParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CalendarEventParticipant_userId_eventId_idx" ON "CalendarEventParticipant"("userId", "eventId");
