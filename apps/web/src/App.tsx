import { useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { ErrorBoundary } from 'react-error-boundary'
import { AuthProvider } from './context/AuthContext.tsx'
import { GymProvider } from './context/GymContext.tsx'
import { MovementsProvider } from './context/MovementsContext.tsx'
import { ProgramFilterProvider } from './context/ProgramFilterContext.tsx'
import { InvitationsProvider } from './context/InvitationsContext.tsx'
import RequireAuth from './components/RequireAuth.tsx'
import RequireOnboarded from './components/RequireOnboarded.tsx'
import Sidebar from './components/Sidebar.tsx'
import TopBar from './components/TopBar.tsx'
import InvitationsBanner from './components/InvitationsBanner.tsx'
import Login from './pages/Login.tsx'
import Register from './pages/Register.tsx'
import Onboarding from './pages/Onboarding.tsx'
import Profile from './pages/Profile.tsx'
import Dashboard from './pages/Dashboard.tsx'
import Calendar from './pages/Calendar.tsx'
import ProgramsIndex from './pages/ProgramsIndex.tsx'
import ProgramDetail from './pages/ProgramDetail.tsx'
import BrowsePrograms from './pages/BrowsePrograms.tsx'
import BrowseGyms from './pages/BrowseGyms.tsx'
import GymCreate from './pages/GymCreate.tsx'
import GymSettings from './pages/GymSettings.tsx'
import Feed from './pages/Feed.tsx'
import WodDetail from './pages/WodDetail.tsx'
import WodResultDetail from './pages/WodResultDetail.tsx'
import History from './pages/History.tsx'
import AdminSettings from './pages/AdminSettings.tsx'
import PersonalProgram from './pages/PersonalProgram.tsx'
import AdminProgramDetail from './pages/AdminProgramDetail.tsx'

export function PageErrorFallback({ error, resetErrorBoundary }: { error: unknown; resetErrorBoundary: () => void }) {
  const navigate = useNavigate()
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
      <p className="text-gray-400 text-sm">Something went wrong on this page.</p>
      <p className="text-gray-400 text-xs font-mono">{message}</p>
      <div className="flex gap-3">
        <button
          onClick={resetErrorBoundary}
          className="px-4 py-2 text-sm rounded bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
        >
          Try again
        </button>
        <button
          onClick={() => { resetErrorBoundary(); navigate('/feed') }}
          className="px-4 py-2 text-sm rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
        >
          Back to Feed
        </button>
      </div>
    </div>
  )
}

function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex h-screen w-full overflow-x-hidden bg-gray-950 text-white">
      <Sidebar isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <TopBar onMenuClick={() => setMobileNavOpen(true)} />
        <InvitationsBanner />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8">
          <ErrorBoundary FallbackComponent={PageErrorFallback} resetKeys={[window.location.pathname]}>
            <Routes>
              <Route path="/" element={<Navigate to="/feed" replace />} />
              <Route path="/feed" element={<Feed />} />
              <Route path="/workouts/:id" element={<WodDetail />} />
              <Route path="/workouts/:id/results/:resultId" element={<WodResultDetail />} />
              <Route path="/history" element={<History />} />
              <Route path="/personal-program" element={<PersonalProgram />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/programs" element={<ProgramsIndex />} />
              <Route path="/programs/:id" element={<ProgramDetail />} />
              <Route path="/browse-programs" element={<BrowsePrograms />} />
              <Route path="/gyms/browse" element={<BrowseGyms />} />
              <Route path="/gyms/new" element={<GymCreate />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/gym-settings" element={<GymSettings />} />
              {/*
                * WODalytics admin (#160). Server enforces the admin gate; the
                * sidebar additionally hides the entry point for non-admins.
                * Direct navigation to these routes for a non-admin will load
                * the page shell, then 403 on the API call and surface the
                * error inline (no redirect — failure is visible).
                */}
              <Route path="/admin/settings" element={<AdminSettings />} />
              <Route path="/admin/programs/:id" element={<AdminProgramDetail />} />
              {/* Legacy aliases — early admin work used split routes. */}
              <Route path="/admin/programs" element={<Navigate to="/admin/settings#programs" replace />} />
              <Route path="/admin/movements" element={<Navigate to="/admin/settings#movements" replace />} />
              {/* Legacy aliases — old bookmarks and deep links still resolve. */}
              <Route path="/settings" element={<Navigate to="/gym-settings" replace />} />
              <Route path="/members" element={<Navigate to="/gym-settings#members" replace />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <RequireOnboarded>
                <InvitationsProvider>
                  <GymProvider>
                    <MovementsProvider>
                      <ProgramFilterProvider>
                        <AppLayout />
                      </ProgramFilterProvider>
                    </MovementsProvider>
                  </GymProvider>
                </InvitationsProvider>
              </RequireOnboarded>
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
