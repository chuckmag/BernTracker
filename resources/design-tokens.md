# WODalytics Design Tokens

Reference for designers and engineers. All values are implemented in `apps/web/src/index.css` (CSS custom properties) and mirrored in `apps/web/src/lib/designTokens.ts` (typed constants for runtime use).

---

## Brand tokens

These switch automatically between light and dark based on the `.dark` class on `<html>`.

| Token | Tailwind utility | Light `#hex` | Dark `#hex` | Usage |
|---|---|---|---|---|
| Primary | `bg-primary`, `text-primary` | `#1E5AA8` | `#5B9BE6` | CTA buttons, primary actions |
| Primary hover | `bg-primary-hover` | `#1A4D90` | `#7AB0EE` | Hover state for primary |
| Accent | `bg-accent`, `text-accent` | `#2BA8A4` | `#5FD4D0` | Log Result button, links, highlights |
| Accent hover | `bg-accent-hover` | `#238F8B` | `#7AE4E0` | Hover state for accent |

### Contrast ratios

| Token | Background | Text | Ratio | WCAG level |
|---|---|---|---|---|
| Primary light (`#1E5AA8`) | white | white | 7.0:1 | AAA |
| Primary dark (`#5B9BE6`) | `#030712` (gray-950) | white | 5.6:1 | AA |
| Accent light (`#2BA8A4`) | white | `#0f172a` (slate-950) | 8.8:1 | AAA |
| Accent dark (`#5FD4D0`) | `#030712` (gray-950) | `#0f172a` (slate-950) | 8.8:1 | AAA |

> **Note:** Accent buttons use `text-slate-900` (dark text), not `text-white`. `#2BA8A4` has only ~1.7:1 contrast with white — failing WCAG AA. Dark text on teal passes at AAA in both modes.

---

## Semantic surface pairs

Every element must use both light and dark variants. Default pattern is `<light-class> dark:<dark-class>`.

### Backgrounds

| Surface | Light | Dark |
|---|---|---|
| Page | `bg-slate-50` | `dark:bg-gray-950` |
| Card / panel | `bg-white` | `dark:bg-gray-900` |
| Drawer (slide-in) | `bg-white` | `dark:bg-gray-900` |
| Input | `bg-white` | `dark:bg-gray-800` |
| Table header | `bg-slate-50` | `dark:bg-gray-800/50` |
| Selected row / highlight | `bg-slate-100` | `dark:bg-gray-800` |
| Row hover | `hover:bg-slate-50` | `dark:hover:bg-gray-800` |
| Subtle inline code / description bg | `bg-slate-100` | `dark:bg-gray-800/60` |

### Borders

| Border type | Light | Dark |
|---|---|---|
| Subtle (card, divider) | `border-slate-200` | `dark:border-gray-800` |
| Interactive (input, button) | `border-slate-300` | `dark:border-gray-700` |

### Text

| Role | Light | Dark |
|---|---|---|
| Heading / primary | `text-slate-950` | `dark:text-white` |
| Body / secondary | `text-slate-700` | `dark:text-gray-300` |
| Tertiary / caption | `text-slate-500` | `dark:text-gray-400` |
| Muted / label | `text-slate-500` | `dark:text-gray-500` |
| Form label (small) | `text-slate-600` | `dark:text-gray-400` |
| Placeholder | `placeholder-slate-400` | `dark:placeholder-gray-500` |
| Link | `text-accent` | (accent is theme-aware) |
| Destructive / error | `text-red-400` or `text-rose-400` | same |

### Status colors (translucent fills — same in both modes)

These use low-opacity fills that read correctly on both `bg-white` and `bg-gray-900`. Only the text color needs a light/dark pair.

| Status | Fill | Light text | Dark text |
|---|---|---|---|
| Published / success | `bg-emerald-500/15` | `text-emerald-700` | `dark:text-emerald-300` |
| Draft / warning | `bg-amber-500/15` | `text-amber-700` | `dark:text-amber-300` |
| Rejected / error | `bg-rose-500/15` | `text-rose-700` | `dark:text-rose-300` |
| Neutral / resolved | `bg-slate-200/80` | `text-slate-600` | `dark:bg-gray-700/40 dark:text-gray-300` |

---

## Full input field pattern

```tsx
<input
  className="w-full rounded-md bg-white border border-slate-300
             dark:bg-gray-800 dark:border-gray-700
             px-3 py-2 text-slate-950 dark:text-white
             placeholder-slate-400 dark:placeholder-gray-500
             focus:outline-none focus:ring-2 focus:ring-indigo-500"
/>
```

---

## Focus ring

```
focus-visible:outline-none
focus-visible:ring-2
focus-visible:ring-indigo-500
focus-visible:ring-offset-2
focus-visible:ring-offset-white        ← light mode
dark:focus-visible:ring-offset-gray-950  ← page bg in dark mode
```

Inside a drawer: use `ring-offset-white dark:ring-offset-gray-900` (drawer bg).

---

## Danger zone pattern

Used for destructive sections in Settings pages:

```
bg-rose-50 dark:bg-rose-950/20
border border-rose-200 dark:border-rose-900/50
```

---

## What NOT to do

- **Never use a dark-only class without its light pair.** E.g. `bg-gray-900` alone on a component that renders in light mode.
- **Never use `text-gray-300` without `text-slate-7xx` light pair** — `#d1d5db` is nearly invisible on white.
- **Never use `text-white` without `text-slate-950` light pair** — same issue.
- **`bg-primary` and `bg-accent` are already dual-theme** via CSS vars — no dark: prefix needed for these.
