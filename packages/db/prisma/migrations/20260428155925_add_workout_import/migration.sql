-- CreateEnum
CREATE TYPE "WorkoutImportStatus" AS ENUM ('PENDING', 'DRAFT', 'PUBLISHED', 'FAILED');

-- AlterTable
ALTER TABLE "Workout" ADD COLUMN     "importId" TEXT;

-- CreateTable
CREATE TABLE "WorkoutImport" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "WorkoutImportStatus" NOT NULL DEFAULT 'PENDING',
    "parsedJson" JSONB,
    "errorJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkoutImport_programId_idx" ON "WorkoutImport"("programId");

-- CreateIndex
CREATE INDEX "Workout_importId_idx" ON "Workout"("importId");

-- AddForeignKey
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_importId_fkey" FOREIGN KEY ("importId") REFERENCES "WorkoutImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutImport" ADD CONSTRAINT "WorkoutImport_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutImport" ADD CONSTRAINT "WorkoutImport_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
