import Fuse from 'fuse.js'

/**
 * Minimal shape this matcher needs from a Movement. Both the API DB row and
 * the client-side `Movement` type satisfy it as long as `aliases` is
 * present in the GET /api/movements response.
 *
 * Kept structural (not nominal) so callers can pass either their own
 * Movement type or a Prisma row without conversion.
 */
export interface MatchableMovement {
  id:        string
  name:      string
  // Optional in the type so older API responses (or test fixtures) that
  // omit `aliases` don't make the matcher throw — Pass 1 just becomes a
  // no-op for those rows. The shipped server response always populates
  // it; this is a defensive contract, not an excuse to skip aliases.
  aliases?:  string[]
}

/**
 * Detect canonical movements in a free-text workout description. Pure
 * function: deterministic given the same `description` + `catalog`, no
 * I/O, safe to call on every keystroke.
 *
 * Originally lived in `apps/api/src/db/movementDbManager.ts` and ran on
 * every editor keystroke via POST /api/movements/detect. Moved here so
 * web + mobile can run the same algorithm against the catalog they
 * already cache via `useMovements()` — no round-trip, works offline,
 * single source of truth (#330).
 *
 * Algorithm (unchanged from the server impl):
 * 1. Build an alias index — `alias.toLowerCase() → Set<movementId>`.
 * 2. Tokenise the description into 1/2/3-word lowercase n-grams.
 * 3. **Pass 1** — exact alias hits per n-gram. Aliases are explicit
 *    declarations by the programmer that a short form ("WB", "KBS",
 *    "Wall Ball") maps to a canonical movement; honor them as strong
 *    signals so they survive Fuse's threshold + the length gate below.
 * 4. **Pass 2** — Fuse.js fuzzy match on canonical name (threshold 0.3)
 *    with a 60% length-ratio gate. The gate prevents short n-grams
 *    ("pull") from matching long names ("Burpee Pull-up", "Sumo
 *    Deadlift High Pull") while still letting whole-name typos through.
 *    Single tokens shorter than 4 chars are skipped from the fuzzy pass
 *    because they over-match.
 *
 * Returns the subset of `catalog` whose ids matched, preserving the
 * input order so callers can show "first match wins" UI without
 * re-sorting.
 */
export function detectMovementsInText<M extends MatchableMovement>(
  description: string,
  catalog: M[],
): M[] {
  if (!description.trim() || catalog.length === 0) return []

  // Pass 1 setup: alias → ids.
  const aliasIndex = new Map<string, Set<string>>()
  for (const m of catalog) {
    for (const alias of m.aliases ?? []) {
      const key = alias.toLowerCase()
      const set = aliasIndex.get(key) ?? new Set<string>()
      set.add(m.id)
      aliasIndex.set(key, set)
    }
  }

  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const matchedIds = new Set<string>()

  // Pass 1: exact alias hits per single token AND per 2/3-word n-gram so
  // multi-word aliases like "Wall Ball" also match.
  const allTokens = new Set<string>()
  for (let i = 0; i < words.length; i++) {
    allTokens.add(words[i])
    if (words[i + 1]) allTokens.add(`${words[i]} ${words[i + 1]}`)
    if (words[i + 1] && words[i + 2]) allTokens.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`)
  }
  for (const tok of allTokens) {
    const ids = aliasIndex.get(tok)
    if (ids) for (const id of ids) matchedIds.add(id)
  }

  // Pass 2: fuzzy match against canonical names with the 60% length gate.
  const fuse = new Fuse(catalog, { keys: ['name'], threshold: 0.3, includeScore: true })
  const ngrams = new Set<string>()
  for (let i = 0; i < words.length; i++) {
    if (words[i].length >= 4) ngrams.add(words[i])
    if (words[i + 1]) ngrams.add(`${words[i]} ${words[i + 1]}`)
    if (words[i + 1] && words[i + 2]) ngrams.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`)
  }
  for (const gram of ngrams) {
    for (const result of fuse.search(gram)) {
      if (gram.length / result.item.name.length >= 0.6) {
        matchedIds.add(result.item.id)
      }
    }
  }

  return catalog.filter((m) => matchedIds.has(m.id))
}
