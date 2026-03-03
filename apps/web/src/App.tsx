import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar.tsx'
import Dashboard from './pages/Dashboard.tsx'
import Calendar from './pages/Calendar.tsx'
import Members from './pages/Members.tsx'
import Settings from './pages/Settings.tsx'

export default function App() {
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
