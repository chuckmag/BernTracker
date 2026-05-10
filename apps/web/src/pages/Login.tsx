import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'

export default function Login() {
  const { login, loginWithGoogle, register, user, isLoading } = useAuth()

  if (!isLoading && user) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-gray-950">
      <div className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-900 p-8 shadow-lg">
        <h1 className="mb-2 text-2xl font-bold text-slate-950 dark:text-white">Welcome to WODalytics</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-gray-400">Sign in to your account or create a new one.</p>

        <div className="space-y-3">
          <button
            type="button"
            onClick={login}
            className="w-full rounded-md bg-primary hover:bg-primary-hover py-2 text-sm font-medium text-white"
          >
            Sign in
          </button>

          <button
            type="button"
            onClick={register}
            className="w-full rounded-md border border-primary py-2 text-sm font-medium text-primary hover:bg-primary/5"
          >
            Create account
          </button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-xs text-slate-500 dark:text-gray-400">
              <span className="bg-white dark:bg-gray-900 px-2">or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={loginWithGoogle}
            className="w-full rounded-md border border-slate-300 dark:border-gray-700 py-2 text-sm font-medium text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-800"
          >
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  )
}
