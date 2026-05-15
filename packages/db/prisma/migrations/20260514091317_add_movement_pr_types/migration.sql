-- CreateEnum
CREATE TYPE "MovementPrType" AS ENUM ('LOAD', 'MAX_REPS', 'TIME', 'DISTANCE', 'CALORIES', 'NONE');

-- AlterEnum
ALTER TYPE "MovementCategory" ADD VALUE 'MONOSTRUCTURAL';

-- AlterTable
ALTER TABLE "Movement" ADD COLUMN     "prTypes" "MovementPrType"[] DEFAULT ARRAY['LOAD']::"MovementPrType"[];
