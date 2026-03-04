import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { accessToken, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-white">
        Loading…
      </div>
    )
  }

  if (!accessToken) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
