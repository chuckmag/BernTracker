/**
 * Pure helpers for surface-pr-comments.mjs — kept I/O-free so the hook's
 * core logic can be unit-tested without a real PR or filesystem.
 */

/**
 * Return inbox entries whose `id` is not yet present in the read set.
 * Entries without an `id` are skipped (defensive — we can't mark them read).
 */
export function filterUnread(entries, readIds) {
  return entries.filter(e => e?.id && !readIds.has(e.id))
}

/**
 * Format unread entries as a single Markdown chunk suitable for
 * additionalContext in a Claude Code hook reply. One header line + one
 * bullet per entry. Bodies are clipped to 500 chars per entry to avoid
 * ballooning the context payload when reviewers paste long examples.
 */
export function formatContext(entries) {
  const header = `📝 ${entries.length} new PR review comment${entries.length === 1 ? '' : 's'} since last turn:`
  const bullets = entries.map(e => {
    const loc = e.path ? ` (${e.path}${e.line ? `:${e.line}` : ''})` : ''
    const state = e.state ? ` [${e.state}]` : ''
    const preview = (e.body || '').trim().slice(0, 500)
    const url = e.url ? `\n  ${e.url}` : ''
    return `- @${e.author ?? 'unknown'}${state}${loc}: ${preview}${url}`
  })
  return [header, ...bullets].join('\n')
}

/**
 * Fold newly-surfaced entries into the read state. Returns a new object —
 * does not mutate the input. `lastReadAt` is refreshed on every call so
 * stale `read.json` files are obvious during debugging.
 */
export function mergeRead(readState, entries) {
  const ids = [
    ...(readState?.ids ?? []),
    ...entries.map(e => e?.id).filter(Boolean),
  ]
  return { ids, lastReadAt: new Date().toISOString() }
}
