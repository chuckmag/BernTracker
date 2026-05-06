import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGym } from '../context/GymContext.tsx'
import GymLogo from './GymLogo'

// Gym selector dropdown in the TopBar. Exposes:
//  - the user's current gyms (click to switch active)
//  - "Browse gyms" — discover other gyms to join (slice D2)
//  - "Set up a new gym" — always available, even when the user is in a gym
//
// Uses a portal-less click-outside dropdown — keeps the surface tiny while
// still being keyboard-dismissible (Esc + click-outside).
export default function GymPicker() {
  const { gyms, gymId, setGymId } = useGym()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function handleSelectGym(id: string) {
    setGymId(id)
    setOpen(false)
  }

  function handleBrowse() {
    setOpen(false)
    navigate('/gyms/browse')
  }

  function handleCreate() {
    setOpen(false)
    navigate('/gyms/new')
  }

  const activeGym = gyms.find((g) => g.id === gymId)
  const triggerLabel = activeGym?.name ?? (gyms.length > 0 ? 'Select gym' : 'No gym yet')

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-sm bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-200 border border-slate-300 dark:border-gray-700 rounded px-2 py-1 hover:bg-slate-200 dark:hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950"
      >
        <span className="max-w-[140px] truncate">{triggerLabel}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
          <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 min-w-[220px] rounded-lg bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 shadow-xl py-1 z-50"
        >
          {gyms.length > 0 && (
            <>
              <p className="px-3 pt-1 pb-0.5 text-[11px] uppercase tracking-wider text-slate-400 dark:text-gray-500">Your gyms</p>
              {gyms.map((g) => {
                const active = g.id === gymId
                return (
                  <button
                    key={g.id}
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => handleSelectGym(g.id)}
                    className={[
                      'w-full text-left px-3 py-1.5 text-sm flex items-center gap-2',
                      active ? 'text-slate-950 dark:text-white bg-slate-100 dark:bg-gray-800' : 'text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800',
                    ].join(' ')}
                  >
                    <GymLogo logoUrl={g.logoUrl} name={g.name} size="sm" />
                    <span className="flex-1 truncate">{g.name}</span>
                    {active && <span className="text-primary text-xs ml-2" aria-hidden="true">✓</span>}
                  </button>
                )
              })}
              <div className="my-1 border-t border-slate-200 dark:border-gray-800" aria-hidden="true" />
            </>
          )}
          <button
            role="menuitem"
            onClick={handleBrowse}
            className="w-full text-left px-3 py-1.5 text-sm text-primary hover:bg-slate-100 dark:hover:bg-gray-800 hover:opacity-80"
          >
            {gyms.length > 0 ? 'Find another gym to join →' : 'Browse gyms to join →'}
          </button>
          <button
            role="menuitem"
            onClick={handleCreate}
            className="w-full text-left px-3 py-1.5 text-sm text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800 hover:text-slate-950 dark:hover:text-white"
          >
            Set up a new gym
          </button>
        </div>
      )}
    </div>
  )
}

