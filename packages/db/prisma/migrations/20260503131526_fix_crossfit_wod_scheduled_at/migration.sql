-- CrossFit posts each day's WOD at 23:55 UTC; the ingest job previously used
-- `publishingDate` as `scheduledAt`, placing every WOD one day early.
-- The correct scheduledAt is UTC midnight of the YYYYMMDD date encoded in
-- externalSourceId (e.g. "crossfit-mainsite:w20260425" → 2026-04-25 00:00:00 UTC).
UPDATE "Workout"
SET "scheduledAt" = (
  to_date(
    substring("externalSourceId" FROM 'crossfit-mainsite:w([0-9]{8})'),
    'YYYYMMDD'
  )::timestamp AT TIME ZONE 'UTC'
)
WHERE "externalSourceId" LIKE 'crossfit-mainsite:w%'
  AND date_trunc('day', "scheduledAt" AT TIME ZONE 'UTC') <>
      (to_date(
        substring("externalSourceId" FROM 'crossfit-mainsite:w([0-9]{8})'),
        'YYYYMMDD'
      )::timestamp AT TIME ZONE 'UTC');
