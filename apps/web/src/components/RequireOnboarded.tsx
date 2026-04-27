import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'

// Redirects unfinished users to /onboarding. Wraps the main app shell so every
// authenticated route enforces a complete profile. /onboarding itself sits
// outside this guard so the user can actually complete it.
export default function RequireOnboarded({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()

  if (user && !user.onboardedAt) {
    return <Navigate to="/onboarding" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}
