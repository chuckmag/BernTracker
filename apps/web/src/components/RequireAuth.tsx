import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading"
        className="flex h-screen flex-col items-center justify-center gap-5 bg-slate-50 dark:bg-gray-950"
      >
        <img
          src="/favicon-96x96.png"
          alt=""
          aria-hidden="true"
          className="h-16 w-16 rounded-2xl"
        />
        <p className="text-xl font-bold tracking-tight text-slate-950 dark:text-white">
          WODalytics
        </p>
        <div
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 dark:border-gray-700 border-t-primary"
        />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
