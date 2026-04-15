-- Add NON_BINARY and PREFER_NOT_TO_SAY back to the Gender enum.
-- FEMALE and MALE were added in the previous migration.
ALTER TYPE "Gender" ADD VALUE IF NOT EXISTS 'NON_BINARY';
ALTER TYPE "Gender" ADD VALUE IF NOT EXISTS 'PREFER_NOT_TO_SAY';
