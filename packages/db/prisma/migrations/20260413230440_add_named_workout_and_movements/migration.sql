-- CreateEnum
CREATE TYPE "WorkoutCategory" AS ENUM ('GIRL_WOD', 'HERO_WOD', 'OPEN_WOD', 'GAMES_WOD', 'BENCHMARK');

-- AlterTable
ALTER TABLE "Workout" ADD COLUMN     "movements" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "namedWorkoutId" TEXT;

-- CreateTable
CREATE TABLE "NamedWorkout" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "WorkoutCategory" NOT NULL,
    "aliases" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "templateWorkoutId" TEXT,

    CONSTRAINT "NamedWorkout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NamedWorkout_name_key" ON "NamedWorkout"("name");

-- CreateIndex
CREATE UNIQUE INDEX "NamedWorkout_templateWorkoutId_key" ON "NamedWorkout"("templateWorkoutId");

-- AddForeignKey
ALTER TABLE "NamedWorkout" ADD CONSTRAINT "NamedWorkout_templateWorkoutId_fkey" FOREIGN KEY ("templateWorkoutId") REFERENCES "Workout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_namedWorkoutId_fkey" FOREIGN KEY ("namedWorkoutId") REFERENCES "NamedWorkout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
