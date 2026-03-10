import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type MyGym } from '../lib/api'

export default function TopBar() {
  const [gyms, setGyms] = useState<MyGym[]>([])
  const currentGymId = localStorage.getItem('gymId') ?? ''

  useEffect(() => {
    api.me.gyms().then(setGyms).catch(() => {})
  }, [])

  function handleGymChange(e: React.ChangeEvent<HTMLSelectElement>) {
    localStorage.setItem('gymId', e.target.value)
    window.location.reload()
  }

  return (
    <header className="h-12 flex items-center justify-end px-6 border-b border-gray-800 bg-gray-950 shrink-0">
      {gyms.length === 0 ? (
        <Link to="/settings" className="text-sm text-indigo-400 hover:text-indigo-300">
          Set up a gym →
        </Link>
      ) : gyms.length === 1 ? (
        <span className="text-sm text-gray-300">{gyms[0].name}</span>
      ) : (
        <select
          value={currentGymId}
          onChange={handleGymChange}
          className="text-sm bg-gray-800 text-gray-200 border border-gray-700 rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
        >
          {gyms.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      )}
    </header>
  )
}
