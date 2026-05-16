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
            className="relative flex items-center justify-center w-full rounded-md border border-[#dadce0] dark:border-gray-700 bg-white dark:bg-gray-900 py-2 text-sm font-medium text-[#3c4043] dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-800"
          >
            <svg className="absolute left-3 shrink-0" width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span>Continue with Google</span>
          </button>
        </div>
      </div>
    </div>
  )
}
