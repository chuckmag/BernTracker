-- AlterTable
ALTER TABLE "NamedWorkout" ADD COLUMN     "description" TEXT,
ADD COLUMN     "sourceUrl" TEXT;

-- CreateTable
CREATE TABLE "BenchmarkResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "namedWorkoutName" TEXT NOT NULL,
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
CREATE INDEX "BenchmarkResult_userId_namedWorkoutName_idx" ON "BenchmarkResult"("userId", "namedWorkoutName");

-- CreateIndex
CREATE INDEX "BenchmarkResult_namedWorkoutName_primaryScoreKind_primarySc_idx" ON "BenchmarkResult"("namedWorkoutName", "primaryScoreKind", "primaryScoreValue");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkResult_userId_namedWorkoutName_achievedAt_key" ON "BenchmarkResult"("userId", "namedWorkoutName", "achievedAt");

-- AddForeignKey
ALTER TABLE "BenchmarkResult" ADD CONSTRAINT "BenchmarkResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
