-- AlterTable
ALTER TABLE "NamedWorkout" ADD COLUMN     "description" TEXT,
ADD COLUMN     "sourceUrl" TEXT;

-- CreateTable
CREATE TABLE "BenchmarkResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "namedWorkoutId" TEXT NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL,
    "level" "WorkoutLevel" NOT NULL,
    "workoutGender" "WorkoutGender" NOT NULL,
    "value" JSONB NOT NULL,
    "notes" TEXT,
    "primaryScoreKind" TEXT,
    "primaryScoreValue" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenchmarkResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BenchmarkResult_userId_namedWorkoutId_idx" ON "BenchmarkResult"("userId", "namedWorkoutId");

-- CreateIndex
CREATE INDEX "BenchmarkResult_namedWorkoutId_primaryScoreKind_primaryScor_idx" ON "BenchmarkResult"("namedWorkoutId", "primaryScoreKind", "primaryScoreValue");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkResult_userId_namedWorkoutId_achievedAt_key" ON "BenchmarkResult"("userId", "namedWorkoutId", "achievedAt");

-- AddForeignKey
ALTER TABLE "BenchmarkResult" ADD CONSTRAINT "BenchmarkResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkResult" ADD CONSTRAINT "BenchmarkResult_namedWorkoutId_fkey" FOREIGN KEY ("namedWorkoutId") REFERENCES "NamedWorkout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
