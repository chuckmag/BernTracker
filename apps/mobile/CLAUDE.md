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

Mobile must mirror the per-user state shapes the web already uses, so a user can switch between web and mobile without losing context. When adding a new piece of persisted state, check `apps/web/CLAUDE.md` → *Cross-app contracts* first and match the storage key + API shape. The active mobile-parity backlog lives at #130; see the root CLAUDE.md → *Parity-first feature design* for the planning rule that governs how mobile and web stay in sync.

When mobile lacks a screen that web has *and the underlying task is phone-suitable* (quick / on-the-go / often used away from a desk), that's a parity gap — file it against #130 (or whichever issue is the active mobile-parity tracker) so it stays visible. Web-only is appropriate for desk-suitable tasks (heavy authoring, multi-step planning); see the root CLAUDE.md for the boundary.

- **Program filter:** `AsyncStorage["programFilter:<gymId>"]` → JSON `string[]`. Same `?programIds=id1,id2` query shape on `GET /api/gyms/:gymId/workouts` as the web.

- **Dashboard program selection:** `AsyncStorage["dashboardProgram:<gymId>"]` → single program ID string (empty = "all programs"). Auto-seeded from `GymProgram.isDefault` on first visit. Picker labels the default program with ` (Default)`. Separate from the multi-select feed filter above.

## Design system

### Palette — `src/lib/theme.ts`

The app supports light and dark mode. All colors come from `COLORS` in `src/lib/theme.ts`, which is kept in sync with the web's `index.css` CSS custom properties and `designTokens.ts`. **Never hardcode hex values** — always pull from `colors` returned by `useTheme()`.

```ts
import { useTheme } from '../lib/theme'

function MyComponent() {
  const { colors, isDark } = useTheme()
  return <View style={{ backgroundColor: colors.cardBg }}>…</View>
}
```

Key color roles:

| Role | Key | Light | Dark |
|---|---|---|---|
| Screen background | `colors.screenBg` | `#f8fafc` | `#030712` |
| Card / panel | `colors.cardBg` | `#ffffff` | `#111827` |
| Input background | `colors.inputBg` | `#ffffff` | `#1f2937` |
| Primary text | `colors.textPrimary` | `#020617` | `#ffffff` |
| Secondary text | `colors.textSecondary` | `#334155` | `#d1d5db` |
| Muted / caption | `colors.textTertiary` | `#64748b` | `#9ca3af` |
| Form label | `colors.textLabel` | `#475569` | `#9ca3af` |
| Placeholder | `colors.textPlaceholder` | `#94a3b8` | `#6b7280` |
| Subtle border | `colors.borderSubtle` | `#e2e8f0` | `#1f2937` |
| Interactive border | `colors.borderInteractive` | `#cbd5e1` | `#374151` |
| Brand primary | `colors.primary` | `#1E5AA8` | `#5B9BE6` |
| Brand accent (teal) | `colors.accent` | `#2BA8A4` | `#5FD4D0` |

> **Accent text:** use `colors.accentText` (`#020617`) not white — teal has only ~1.7:1 contrast with white.

### Base components — `src/components/Themed*.tsx`

React Native has no CSS inheritance. Use these instead of bare `Text`/`View` to get theme-correct defaults automatically.

**`ThemedText`** — replaces `<Text>`. Applies the right text color for the active theme.
```tsx
import ThemedText from '../components/ThemedText'

<ThemedText>Body copy — textPrimary by default</ThemedText>
<ThemedText variant="secondary">De-emphasised copy</ThemedText>
<ThemedText variant="tertiary">Caption / metadata</ThemedText>
<ThemedText variant="label">Form label</ThemedText>
<ThemedText variant="muted">Disabled / hint</ThemedText>
<ThemedText style={{ fontSize: 24, fontWeight: 'bold' }}>Heading</ThemedText>
```

**`ThemedView`** — replaces `<View>` when a background is needed.
```tsx
import ThemedView from '../components/ThemedView'

<ThemedView variant="screen" style={styles.fill}>…</ThemedView>  {/* screenBg */}
<ThemedView variant="card" style={styles.card}>…</ThemedView>    {/* cardBg */}
<ThemedView variant="input" style={styles.input}>…</ThemedView>  {/* inputBg */}
<ThemedView>…</ThemedView>  {/* transparent — same as bare View */}
```

### Theme preference persistence

`useTheme()` currently reads from `useColorScheme()` (OS preference). When #254 (AsyncStorage-backed `wodalytics-theme` preference) lands, update `src/lib/theme.ts` → `useTheme()` to read from the stored value instead, falling back to `useColorScheme()`. The storage key is `AsyncStorage["wodalytics-theme"]` → `"light" | "dark" | "system"`, matching the web contract documented in `apps/web/CLAUDE.md` → *Cross-app contracts*.

### What's still missing

- Typography scale (font sizes, weights, line heights)
- Touch-target baseline (iOS HIG: 44×44; Material: 48×48)
- A11y contrast audit against iOS/Android contrast checkers
- `ThemedInput`, `ThemedButton` primitives (extract when the same pattern appears 3+ times)
- Navigation theme integration (React Navigation `DarkTheme`/`DefaultTheme` passed to `NavigationContainer`)

## Testing

Unit/component tests live in `__tests__/` at the app root and use **Jest** (not Vitest — `jest-expo` provides the RN-aware preset). Each test file matches a screen or context.

**Patterns:**
- Wrap rendered screens in their navigator (`NavigationContainer`) and any required context providers when the screen consumes them.
- Mock `lib/api.ts` to control fetch responses — never hit a real API in unit tests.
- Use `@testing-library/react-native` queries (`getByText`, `findByRole`) — they mirror the web RTL API.

There is no E2E layer for mobile yet. When one is added (Detox or Maestro most likely), document the runner + how to invoke single tests here.
