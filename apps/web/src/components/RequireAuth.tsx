import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { accessToken, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-gray-950 text-slate-950 dark:text-white">
        Loading…
      </div>
    )
  }

  if (!accessToken) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
