# apps/mobile — CLAUDE.md

React Native (Expo) member app. See the repo-root `CLAUDE.md` for cross-cutting topics (worktree dev, enums, PR rules, schema migrations).

> **Convention:** any new pattern, primitive, or rule that applies only to the mobile app belongs here, not in the root.

## Layout

```
apps/mobile/
  App.tsx               # root navigator + providers
  src/
    components/         # shared RN components
    context/            # React contexts (auth, program filter, …)
    lib/                # API client, storage helpers, formatters
    screens/            # one file per screen
  __tests__/            # Jest + @testing-library/react-native
```

## Commands

Run from `apps/mobile/` unless noted.

```bash
npm run dev             # expo start — prints QR code for Expo Go
npm run ios             # open in iOS Simulator (requires Xcode)
npm run android         # open in Android emulator
npm run test            # jest (uses jest-expo preset)
```

**Run a single test:**
```bash
# single file
npx jest __tests__/FeedScreen.test.tsx

# filter by test name
npx jest -t "renders feed rows"
```

**Connecting Expo Go to a local API:** set `EXPO_PUBLIC_API_URL` in the repo-root `.env` to your Mac's LAN IP (`ipconfig getifaddr en0`), not `localhost` — `localhost` resolves to the phone, not the dev machine. iOS Simulator can use `localhost` directly.

## Cross-app contracts (web parity)

Mobile must mirror the per-user state shapes the web already uses, so a member can switch between web and mobile without losing context. When adding a new piece of persisted state, check `apps/web/CLAUDE.md` → *Cross-app contracts* first and match the storage key + API shape. The active mobile-parity backlog lives at #130; see the root CLAUDE.md → *Parity-first feature design* for the planning rule that governs how mobile and web stay in sync.

When mobile lacks a screen that web has, that's a parity gap, not a "phase 2" — file it against #130 (or whichever issue is the active mobile-parity tracker) so it stays visible.

- **Program filter:** `AsyncStorage["programFilter:<gymId>"]` → JSON `string[]`. Same `?programIds=id1,id2` query shape on `GET /api/gyms/:gymId/workouts` as the web.

## Design system

There is no mobile design system yet. When one is established, document it here — primitives, palette, typography, a11y baseline, and "when to extract" rules — mirroring the structure in `apps/web/CLAUDE.md`. Do **not** copy the web design system wholesale; tokens and primitives need to be re-derived for RN's `StyleSheet` + native components, and the touch-target / contrast baselines should be re-checked against iOS HIG and Material guidelines.

Until then: keep styles co-located with their component, prefer small composable RN components over deep prop trees, and avoid one-off styling that conflicts with future tokens (e.g. don't hardcode brand colors — pull from a `theme` constant once one exists).

## Testing

Unit/component tests live in `__tests__/` at the app root and use **Jest** (not Vitest — `jest-expo` provides the RN-aware preset). Each test file matches a screen or context.

**Patterns:**
- Wrap rendered screens in their navigator (`NavigationContainer`) and any required context providers when the screen consumes them.
- Mock `lib/api.ts` to control fetch responses — never hit a real API in unit tests.
- Use `@testing-library/react-native` queries (`getByText`, `findByRole`) — they mirror the web RTL API.

There is no E2E layer for mobile yet. When one is added (Detox or Maestro most likely), document the runner + how to invoke single tests here.
