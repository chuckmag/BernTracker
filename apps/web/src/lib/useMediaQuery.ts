import { useEffect, useState } from 'react'

/**
 * Subscribes to a CSS media query and returns its current match state.
 *
 * Hydration-safe: returns `false` on the first render when `window` is not
 * available (SSR or jsdom without matchMedia), then re-evaluates after
 * mount. Components that branch on the return value should treat `false`
 * as the "default / wide viewport" path so existing desktop tests don't
 * need to opt in.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false
    }
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const mql = window.matchMedia(query)
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches)
    setMatches(mql.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}

// Tailwind's `md:` breakpoint is 768px. Anything below that is the
// phone / mobile-web target for the condensed-calendar work in #240/#241.
export const MOBILE_VIEWPORT_QUERY = '(max-width: 767px)'
