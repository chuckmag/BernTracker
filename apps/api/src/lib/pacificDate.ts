/**
 * Returns midnight of "today" in America/Los_Angeles, expressed as a UTC Date.
 * The CrossFit ingest jobs use this to ask the upstream API for a WOD on
 * Pacific time — which is when the CrossFit team posts.
 *
 * Uses Intl.DateTimeFormat (no Temporal / dayjs dep) — extracts y/m/d in PT,
 * then constructs a UTC Date from those components. Downstream consumers only
 * read getUTC*() so the absolute instant is irrelevant.
 */
export function todayInPacific(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const y = Number(get('year'))
  const m = Number(get('month'))
  const d = Number(get('day'))
  return new Date(Date.UTC(y, m - 1, d))
}
