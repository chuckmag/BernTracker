-- Rename Gender enum values from [WOMAN, MAN, NON_BINARY, PREFER_NOT_TO_SAY] to [FEMALE, MALE].
-- All existing identifiedGender values are NULL (field was never exposed in the UI),
-- so the column can be safely cast to NULL for the type change.
ALTER TYPE "Gender" RENAME TO "Gender_old";
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE');
ALTER TABLE "User" ALTER COLUMN "identifiedGender" TYPE "Gender" USING NULL;
DROP TYPE "Gender_old";
