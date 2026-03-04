import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.tsx'
import RequireAuth from './components/RequireAuth.tsx'
import Sidebar from './components/Sidebar.tsx'
import Login from './pages/Login.tsx'
import Dashboard from './pages/Dashboard.tsx'
import Calendar from './pages/Calendar.tsx'
import Members from './pages/Members.tsx'
import Settings from './pages/Settings.tsx'

function AppLayout() {
  return (
    <div className="flex h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/members" element={<Members />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
