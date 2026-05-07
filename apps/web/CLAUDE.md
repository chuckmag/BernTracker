# apps/web — CLAUDE.md

Web admin portal (Vite + React + Tailwind). See the repo-root `CLAUDE.md` for cross-cutting topics (worktree dev, enums, PR rules, schema migrations).

> **Convention:** any new pattern, primitive, or rule that applies only to the web app belongs here, not in the root.

## Design system

Established by #81. **Always use existing primitives before writing custom Tailwind for the same pattern.** Look here first; only inline styles when the primitive genuinely doesn't fit.

### Primitives — `src/components/ui/`

| Primitive | When to use | Notes |
|---|---|---|
| `Button` | Every clickable action button | Variants: `primary` (brand blue CTA), `secondary` (gray, less weight), `tertiary` (text-only, e.g. pagination/back-arrows), `destructive` (rose, delete actions), `accent` (teal, for Log Result — uses `text-slate-900` not white). Includes the shared focus ring — never bake your own focus styles on top. |
| `Chip` | Tags, status pills, toggle filter pills | Variants: `neutral`, `accent`, `status-published`, `status-draft`, `status-rejected`. Pass `onToggle` for toggle-pill behavior (auto-adds `aria-pressed`); pass `onDismiss` for an `×` close affordance. |
| `ChipGroup` | Row of toggle chips | Handles horizontal-scroll overflow and exposes a trailing "Clear" chip via `onClear`. Use in any filter strip. |
| `SegmentedControl` | Mutually-exclusive selection within a single context | The level filter on `WodDetail` is the canonical example. Use this for radio-group-like UIs with 2–5 options. **Not** for page-level tab navigation (those are still custom — see "Patterns to extract" below). |
| `Badge` | Small numeric count next to a nav item or icon | 10px font, `min-w-5`. **Not** for big heading-counts — those use a separate `text-sm` chip pattern shared between `Members` and `ProgramsIndex`. |
| `EmptyState` | Empty list/page with title, body, optional CTA | Use whenever a data fetch returns zero results. Don't render a bare paragraph like "No X yet". |
| `Skeleton` | Loading state placeholder | Variants: `feed-row`, `history-row`, `calendar-cell`. Pass `count` to repeat. **Always** use this instead of a "Loading…" string. |

### Token modules — `src/lib/`

- **`workoutTypeStyles.ts`** — `WORKOUT_TYPE_STYLES[type]` returns `{ abbr, label, category, tint, bg, accentBar }` for every `WorkoutType`. Any surface that renders a workout type **must** pull from this map. The deprecated `TYPE_ABBR` shim in `lib/api.ts` re-exports `.abbr` only; new code should reach for `WORKOUT_TYPE_STYLES` directly.
- **`workoutTypeStyles.WORKOUT_CATEGORIES`** — display order for category groupings in pickers/lists.
- **`designTokens.ts`** — `BRAND_TOKENS` with raw hex values for light/dark brand colors (for Recharts or other canvas-based renderers that can't use CSS vars). `CHART_COLORS` for categorical chart series. Always keep in sync with the CSS vars in `index.css`.

### Dual-theme palette — required on every element

The app renders in light or dark based on `.dark` on `<html>`. **Every element must carry both a light and dark class** — never use a dark-only class (`bg-gray-900`, `text-gray-300`, `text-white`) without its light-mode counterpart. Full reference: `resources/design-tokens.md`.

#### Brand tokens (already theme-aware — no `dark:` prefix needed)

| Token | Tailwind | Light | Dark | Usage |
|---|---|---|---|---|
| Primary | `bg-primary` | `#1E5AA8` | `#5B9BE6` | CTA buttons |
| Primary hover | `bg-primary-hover` | `#1A4D90` | `#7AB0EE` | Primary hover |
| Accent | `bg-accent`, `text-accent` | `#2BA8A4` | `#5FD4D0` | Log Result, links |
| Accent hover | `bg-accent-hover` | `#238F8B` | `#7AE4E0` | Accent hover |

Accent buttons use **`text-slate-900`** (not white) — `#2BA8A4` has only ~1.7:1 contrast with white; dark text achieves 8.8:1 AAA on both light and dark accent backgrounds.

#### Semantic surface pairs

| Surface | Light | Dark |
|---|---|---|
| Page bg | `bg-slate-50` | `dark:bg-gray-950` |
| Card / panel / drawer | `bg-white` | `dark:bg-gray-900` |
| Input | `bg-white border-slate-300` | `dark:bg-gray-800 dark:border-gray-700` |
| Subtle border | `border-slate-200` | `dark:border-gray-800` |
| Interactive border | `border-slate-300` | `dark:border-gray-700` |
| Heading / primary text | `text-slate-950` | `dark:text-white` |
| Body text | `text-slate-700` | `dark:text-gray-300` |
| Secondary / caption | `text-slate-500` | `dark:text-gray-400` |
| Form label | `text-slate-600` | `dark:text-gray-400` |
| Placeholder | `placeholder-slate-400` | `dark:placeholder-gray-500` |
| Row hover | `hover:bg-slate-50` | `dark:hover:bg-gray-800` |
| Selected / highlight | `bg-slate-100` | `dark:bg-gray-800` |

#### Status colors (translucent fills — text needs a pair)

| Status | Fill | Light text | Dark text |
|---|---|---|---|
| Published / success | `bg-emerald-500/15` | `text-emerald-700` | `dark:text-emerald-300` |
| Draft / warning | `bg-amber-500/15` | `text-amber-700` | `dark:text-amber-300` |
| Rejected / error | `bg-rose-500/15` | `text-rose-700` | `dark:text-rose-300` |

#### Focus rings

`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950`

Inside drawers: `ring-offset-white dark:ring-offset-gray-900`.

#### Destructive: `rose-600` / `rose-700`. Danger-zone sections: `bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50`.

### A11y baseline (#81 PR 5)

Every interactive element must satisfy these. The primitives above already do — only worry about it when you're writing a one-off control.

- **Contrast:** text under 14px (`text-xs`, `text-[10px]`, `text-[11px]`) uses `text-gray-400` or lighter. `text-gray-500` passes contrast only at `text-sm` (14px) and larger — fine for de-emphasized secondary copy. Reserve `text-gray-600` for invisible / disabled / decorative-only states (e.g. `·` separators marked `aria-hidden="true"`); never put it on visible user-facing copy. Lighthouse will flag any of these.
- **Touch targets:** the WCAG 2.5.8 AA bar is **24×24** (Lighthouse uses this); aim for **28×28** as the team default. Audit candidate: `grep -rE "w-[0-5]\b|h-[0-5]\b" src` — every match should be non-interactive. When you need a bigger hit area without growing the surrounding layout, pair the size bump with a margin clawback: `className="-my-1 -mr-1.5 w-7 h-7 inline-flex items-center justify-center …"`. For checkbox + label pairs, `min-h-7` on the wrapping `<label>` clears the hit area without enlarging the visible checkbox.
- **Focus rings:** always `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950` (offset color matches the parent surface — use `ring-offset-gray-900` inside a drawer). Use the primitive instead of duplicating this string.
- **`title`** attribute on truncated text for hover reveal (e.g. workout pills in calendar cells).

### ARIA patterns (lessons-learned)

- **Toggle button** (`Chip` with `onToggle`, color-swatch pickers, etc.): `role="button"` (the default for `<button>`) + `aria-pressed={selected}`.
- **Radio group** (`SegmentedControl`-style mutually-exclusive selection): container is `role="radiogroup"`; each segment is `role="radio"` with `aria-checked={selected}`. **Do NOT also set `aria-pressed`** — axe's `aria-allowed-attr` rule rejects `aria-pressed` on `radio`. Pair this with **roving tabindex**: only the selected segment has `tabIndex={0}`, others `tabIndex={-1}`. Arrow keys move selection (and focus follows).
- **Form selects:** pair `<label htmlFor="x">` with `<select id="x">`. Sibling proximity is **not** enough — both axe and screen readers require the explicit association. When there's no visible label (e.g., a single-purpose toolbar select), use `aria-label` instead.
- **Decorative-only icons / separators:** add `aria-hidden="true"` so axe's contrast rule skips them.

### When to extract a new primitive

Extract when **the same pattern appears in 3+ places** (or 2 with strong likelihood of a third). Don't pre-extract. Two more checks before committing to it:

1. There's interactive behavior worth encapsulating: keyboard handling, ARIA state, focus management, or a non-trivial style permutation (variants).
2. Pulling it out makes consumer code visibly tighter — the consumer reads as intent, not as a styling recipe.

If only the visual is shared but the behavior is trivial (e.g., a one-line styled `<div>`), inline the markup. If the behavior is shared but the visual differs heavily across uses, prefer a hook/utility over a primitive. If the same enum value drives styling across multiple surfaces, that's a **token map** under `lib/<domain>Styles.ts`, not a primitive.

**Process for adding one:**

1. Identify the two real call sites and sketch the prop API on paper. Variants belong as discriminated string unions, not boolean props (`variant: 'primary' | 'secondary'`, never `isPrimary` + `isSecondary`). Default the most-used variant in the prop signature so consumers can pass nothing for the common case.
2. Add the file under `src/components/ui/<Name>.tsx`. Include the shared `FOCUS_RING` constant if interactive. Mirror the existing primitives' shape — generic over the value type when relevant (see `SegmentedControl<T extends string>`).
3. Co-locate `<Name>.test.tsx` covering: each variant renders, click / keyboard fires the right handlers, `disabled` blocks both, and `aria-*` attributes reflect state. Follow the existing primitive tests for shape.
4. Migrate **at least one** real call site in the same PR — never ship an unconsumed primitive. If it's worth pulling out, it's worth proving the pull-out fits at a real call site.
5. Add a row to the *Primitives* table above and remove the entry from *Patterns to extract* if it was flagged.
6. Run `npx vitest run` — including the page-level `src/test/a11y.test.tsx` axe check — before opening the PR.

**Patterns to extract** (flagged but not yet primitive):
- **Drawer** — slide-from-right + overlay + Escape-to-close. Currently re-implemented in `WorkoutDrawer`, `LogResultDrawer`, `ProgramFormDrawer`. Worth extracting next time someone touches them.
- **Tabs** — page-section navigation with underline indicator. Currently custom in `ProgramDetail`; will repeat in slice 4 of #82 (Browse + Members tabs).
- **FormField + TextInput / Textarea / DatePicker** — every form repeats `<label class="text-xs text-gray-400">` + styled input. Extract when a third form joins (slice 3 of #82 likely is it).
- **HeadingCount** — the `text-sm` count chip next to page headings (Members, ProgramsIndex use the same `<span class="bg-gray-700 text-sm px-2 py-0.5 rounded-full">{N}</span>` literal twice). Extract to ui/HeadingCount.tsx if a third caller appears.
- **ConfirmDialog** — currently using `window.confirm` for delete confirmations. Replace with a primitive when we want consistent in-app styling.

### Cross-app contracts (mobile parity)

> **Required, not aspirational.** Every phone-suitable feature ships on web *and* mobile — see the root CLAUDE.md → *Parity-first feature design* (the rule is task-ergonomics-driven, not role-driven; trainers and owners use mobile too). The contracts below pin the persisted-state shapes that both surfaces must agree on, so mobile can mirror web without re-deriving.

When you add a new piece of persisted user state (localStorage / query string / cookie) on web for a phone-suitable feature, **add an entry here in the same PR**. That's the mechanism by which mobile knows what to mirror — skipping this step is how parity drift starts. Active parity backlog: #130.

- **Program filter** (`src/context/ProgramFilterContext.tsx`)
  - Storage: `localStorage["programFilter:<gymId>"]` → JSON `string[]` of program IDs (empty = "all programs")
  - URL: `?programIds=id1,id2` on `/feed` and `/calendar`
  - API: `GET /api/gyms/:gymId/workouts?programIds=id1,id2` (each ID independently access-checked; first failure → 403/404)
  - Mobile: read/write the same storage key (via `AsyncStorage`) and call the same endpoint with the same CSV shape.

- **Dashboard program selection** (`src/pages/Dashboard.tsx`)
  - Storage: `localStorage["dashboardProgram:<gymId>"]` → single program ID string (empty string = "all programs")
  - Default: auto-selects the gym's default program (`GymProgram.isDefault = true`) on first visit when no stored preference exists.
  - API: `GET /api/gyms/:gymId/dashboard/today?programIds=<id>` — single ID (Dashboard shows one program at a time, unlike the multi-select Feed/Calendar filter).
  - Mobile: read/write the same key via `AsyncStorage`. Picker bottom sheet labels default program with ` (Default)` suffix. Separate from `programFilter:<gymId>` which is Feed-scoped and multi-select.

- **Theme preference** (`src/context/ThemeContext.tsx`, `src/lib/useTheme.ts`)
  - Storage: `localStorage["wodalytics-theme"]` → `"light" | "dark" | "system"` (absent = `"system"`)
  - Web: `ThemeProvider` wraps `App`; `useTheme()` exposes `{ mode, setMode }`. Applies `dark` class to `<html>` via `applyTheme()`. A no-flash inline script in `index.html` applies the class before React mounts.
  - Mobile: read/write the same key via `AsyncStorage`; apply via React Navigation `theme` prop. Mobile parity tracked in #254.

### Reference

Visual guide with before/after mockups: `resources/design-guide.html`. Issue #81 has the full implementation plan in 5 PRs.

## Testing

### Unit tests (Vitest + React Testing Library)

Located in `src/**/*.test.tsx`, co-located with the component each test covers.

**Run all:**
```bash
# from repo root
npm run test:unit --workspace=@wodalytics/web

# from apps/web/
npx vitest run
```

**Run a single test file or by name:**
```bash
# single file
npx vitest run src/pages/Foo.test.tsx

# filter by test name (substring match)
npx vitest run -t "renders without crashing"
```

**Requires:** nothing running — fully in-process, no server or DB needed.

**Setup:** Vitest is configured in `vite.config.ts` (`test.environment: 'jsdom'`). The global setup file `src/test/setup.ts` imports `@testing-library/jest-dom` matchers. Vitest globals (`describe`, `it`, `expect`, `vi`) are enabled so no imports are needed in test files.

**When to write unit tests vs E2E:**
- Unit tests cover **component rendering and logic**: does the page render without crashing? Are the right elements shown given a mocked API response? Use `vi.mock('../lib/api')` to control API responses.
- E2E tests (Playwright) cover **user flows end-to-end**: navigation, real API calls, DB state. Use E2E when the correctness depends on the full stack.
- **Every page must have at least one render test** that asserts it mounts without throwing. This catches crashes from type mismatches, missing fields, or bad assumptions about API shape — bugs that would otherwise only surface in the browser.

**Patterns to follow:**
- Wrap the component in `<MemoryRouter>` with `<Routes>` matching the real URL pattern so `useParams` works.
- Mock `../lib/api` fully — every `api.*` call used by the component must be mocked or the test will hang.
- Mock `../context/AuthContext` to return a minimal `{ user: { id, name } }`.
- Use `screen.findBy*` (async) for elements that appear after a resolved promise.

### E2E tests (Playwright)

Located in `tests/`. Each spec uses Playwright and seeds DB fixtures directly via `PrismaClient` (imported via `createRequire` to bypass ESM/CJS issues).

**Run all:**
```bash
# from worktree root — uses worktree-aware ports
npm run test:worktree -- e2e

# from repo root, against default ports
npm run test:e2e --workspace=@wodalytics/web

# from apps/web/
npx dotenv-cli -e ../../.env -- npx playwright test
```

**Run a single spec or by name:**
```bash
# single file
npm run test:e2e --workspace=@wodalytics/web -- tests/programs.spec.ts

# filter by test title
npm run test:e2e --workspace=@wodalytics/web -- -g "subscriber sees published workouts"
```

**Requires:** dev stack running. From a worktree, use `npm run dev:worktree`; otherwise `turbo dev` (API on `:3000`, web on `:5173`).

**Patterns to follow:**
- Tests are independent. Seed all fixtures in `test.beforeEach` (or inline at the top of the test) and tear down in `test.afterEach`. **Do not** use `test.describe.configure({ mode: 'serial' })` or shared `test.beforeAll` fixtures — `playwright.config.ts` runs the suite in parallel (`fullyParallel: true`).
- **Auth via JWT cookie injection** — never drive the `/login` form. Use `loginAs(context, userId, role)` from `tests/lib/auth.ts`, which signs a refresh token, persists a `RefreshToken` row, and adds the cookie. AuthProvider's mount-time refresh consumes it on the next `page.goto`. The dedicated login-form spec is the only exception.
- Seed directly via Prisma (not via API) to keep setup fast and independent of API state.
- Use unique nonces for fixture rows (`randomUUID().slice(0, 8)`) so parallel workers can't collide on names/slugs.
- `gymId` belongs in `localStorage` before any gym-scoped navigation: `await page.addInitScript((id) => localStorage.setItem('gymId', id), gymId)`.
- Import PrismaClient via `createRequire(import.meta.url)` — do not use ESM named imports from `@prisma/client`.
- Keep the surface tight (~5 specs covering true cross-stack flows). Anything that's "does this page render the right text" belongs in `src/**/*.test.tsx` with mocked `api`. See #111 for the rationale.
