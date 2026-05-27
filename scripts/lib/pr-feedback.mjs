/**
 * Pure helpers for the watch-pr.mjs PR-feedback loop.
 *
 * Kept I/O-free so they can be unit-tested without spawning `gh` or touching
 * the filesystem. The daemon owns all process spawning, file reads, and file
 * writes; this module only normalizes API shapes and computes set diffs.
 */

/**
 * Parse owner+repo from a github.com PR URL.
 * Returns null when the URL doesn't match.
 */
export function parseRepoFromPrUrl(prUrl) {
  const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/\d+/)
  if (!match) return null
  return { owner: match[1], repo: match[2] }
}

/**
 * Normalize the three GitHub feedback shapes into a flat list of inbox-ready
 * entries. Each input array is the raw JSON from gh/GitHub:
 *   issueComments — `gh pr view --json comments` → .comments
 *   reviews       — `gh pr view --json reviews`  → .reviews
 *   reviewComments — `gh api repos/{o}/{r}/pulls/{n}/comments`
 *
 * Every entry the daemon emits to inbox.jsonl flows through this function.
 */
export function normalizeFeedback({ issueComments = [], reviews = [], reviewComments = [] }) {
  const entries = []

  for (const c of issueComments) {
    if (!c?.id) continue
    entries.push({
      kind: 'issue_comment',
      id: String(c.id),
      ts: c.createdAt ?? new Date().toISOString(),
      author: c.author?.login ?? 'unknown',
      body: c.body ?? '',
      url: c.url ?? '',
    })
  }

  for (const r of reviews) {
    if (!r?.id) continue
    // Skip reviews with no body — pure APPROVED/COMMENTED with no text is noise.
    const body = (r.body ?? '').trim()
    if (!body) continue
    entries.push({
      kind: 'review',
      id: String(r.id),
      ts: r.submittedAt ?? new Date().toISOString(),
      author: r.author?.login ?? 'unknown',
      state: r.state ?? 'COMMENTED',
      body,
      url: r.url ?? '',
    })
  }

  for (const rc of reviewComments) {
    if (!rc?.id && rc?.id !== 0) continue
    entries.push({
      kind: 'review_comment',
      id: String(rc.id),
      ts: rc.created_at ?? new Date().toISOString(),
      author: rc.user?.login ?? 'unknown',
      path: rc.path ?? null,
      line: rc.line ?? rc.original_line ?? null,
      body: rc.body ?? '',
      url: rc.html_url ?? '',
    })
  }

  return entries
}

/**
 * Given the current normalized entries and a seen-state object, return only
 * the entries whose IDs are not yet recorded as seen. IDs are bucketed by
 * `kind` because the three GitHub ID namespaces (IC_*, PRR_*, PRRC_*) can
 * theoretically collide and bucketing makes the seen.json file easier to read.
 */
export function diffNew(currentEntries, seen) {
  const buckets = {
    issue_comment: new Set(seen?.issueComments ?? []),
    review: new Set(seen?.reviews ?? []),
    review_comment: new Set(seen?.reviewComments ?? []),
  }
  return currentEntries.filter(e => !buckets[e.kind]?.has(e.id))
}

/**
 * Fold a list of new entries into the seen-state object. Returns a new
 * object — does not mutate the input.
 */
export function mergeSeen(seen, newEntries) {
  const next = {
    issueComments: [...(seen?.issueComments ?? [])],
    reviews: [...(seen?.reviews ?? [])],
    reviewComments: [...(seen?.reviewComments ?? [])],
    seededAt: seen?.seededAt ?? new Date().toISOString(),
  }
  for (const e of newEntries) {
    if (e.kind === 'issue_comment') next.issueComments.push(e.id)
    else if (e.kind === 'review') next.reviews.push(e.id)
    else if (e.kind === 'review_comment') next.reviewComments.push(e.id)
  }
  return next
}
