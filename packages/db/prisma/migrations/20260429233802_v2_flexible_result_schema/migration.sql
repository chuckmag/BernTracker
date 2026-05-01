-- Result.value JSON shape changes from the legacy AMRAP/FOR_TIME
-- discriminated union to a flexible {score, movementResults} shape (issue
-- #3 slice 1). Pre-prod / dev databases only — no production data exists,
-- and old rows would fail Zod validation in the API. Drop them so every
-- row in the table conforms to the new schema after migrate.
TRUNCATE TABLE "Result";

-- CreateEnum
CREATE TYPE "LoadUnit" AS ENUM ('LB', 'KG');

-- CreateEnum
CREATE TYPE "DistanceUnit" AS ENUM ('M', 'KM', 'MI', 'FT', 'YD');

-- AlterTable
ALTER TABLE "Result" ADD COLUMN     "primaryScoreKind" TEXT,
ADD COLUMN     "primaryScoreValue" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "preferredDistanceUnit" "DistanceUnit" NOT NULL DEFAULT 'MI',
ADD COLUMN     "preferredLoadUnit" "LoadUnit" NOT NULL DEFAULT 'LB';

-- AlterTable
ALTER TABLE "Workout" ADD COLUMN     "timeCapSeconds" INTEGER,
ADD COLUMN     "tracksRounds" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WorkoutMovement" ADD COLUMN     "calories" INTEGER,
ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "distance" DOUBLE PRECISION,
ADD COLUMN     "distanceUnit" "DistanceUnit",
ADD COLUMN     "load" DOUBLE PRECISION,
ADD COLUMN     "loadUnit" "LoadUnit",
ADD COLUMN     "reps" TEXT,
ADD COLUMN     "seconds" INTEGER,
ADD COLUMN     "sets" INTEGER,
ADD COLUMN     "tempo" TEXT;

-- CreateIndex
CREATE INDEX "Result_workoutId_primaryScoreKind_primaryScoreValue_idx" ON "Result"("workoutId", "primaryScoreKind", "primaryScoreValue");

-- CreateIndex
CREATE INDEX "WorkoutMovement_workoutId_displayOrder_idx" ON "WorkoutMovement"("workoutId", "displayOrder");
