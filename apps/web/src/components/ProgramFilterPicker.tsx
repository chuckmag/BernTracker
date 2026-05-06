import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProgramFilter, PERSONAL_PROGRAM_SENTINEL } from '../context/ProgramFilterContext.tsx'

/**
 * Sidebar-mounted multi-select that scopes Feed + Calendar to the chosen
 * programs. Empty selection = "all programs".
 *
 * UX:
 *   - Compact button shows: "All programs" / "<Name>" / "<Name> + N more"
 *   - Click → checkbox panel
 *   - Each toggle updates the picker's URL (on filterable pages) + localStorage
 *
 * See ProgramFilterContext for the full filter contract (URL ↔ localStorage
 * sync, mobile parity).
 */
export default function ProgramFilterPicker() {
  const { selected, available, loading, toggle, clear } = useProgramFilter()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  function goToBrowse() {
    setOpen(false)
    navigate('/browse-programs')
  }

  const isPersonalSelected = selected.includes(PERSONAL_PROGRAM_SENTINEL)
  const selectedGymPrograms = available
    .map((gp) => gp.program)
    .filter((p) => selected.includes(p.id))

  // Build the compact button label. Personal Program counts as one selected item.
  let label: string
  const totalSelected = (isPersonalSelected ? 1 : 0) + selectedGymPrograms.length
  if (totalSelected === 0) {
    label = 'All programs'
  } else if (isPersonalSelected && selectedGymPrograms.length === 0) {
    label = 'Personal Program'
  } else if (!isPersonalSelected && selectedGymPrograms.length === 1) {
    label = selectedGymPrograms[0].name
  } else {
    const firstName = isPersonalSelected ? 'Personal' : selectedGymPrograms[0].name
    label = `${firstName} + ${totalSelected - 1} more`
  }

  return (
    <div ref={containerRef} className="relative px-3 py-3 border-b border-slate-200 dark:border-gray-800">
      <span className="block text-xs uppercase tracking-widest text-slate-500 dark:text-gray-400 mb-1">Programs</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm text-left bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-200 hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
      >
        <span className="truncate">{label}</span>
        <span className="text-slate-500 dark:text-gray-400 text-xs shrink-0">▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-50 left-3 right-3 mt-1 max-h-72 overflow-y-auto bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-md shadow-2xl"
        >
          {/* Personal Program — pinned at top, always visible */}
          <label className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-gray-800 cursor-pointer border-b border-slate-100 dark:border-gray-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-400 dark:border-gray-600 bg-white dark:bg-gray-800 text-indigo-500 focus:ring-indigo-500"
              checked={isPersonalSelected}
              onChange={() => toggle(PERSONAL_PROGRAM_SENTINEL)}
            />
            <span className="truncate flex-1">Personal Program</span>
            <span className="text-xs text-slate-400 dark:text-gray-500 shrink-0">private</span>
          </label>

          {available.map(({ program }) => {
            const isSelected = selected.includes(program.id)
            return (
              <label
                key={program.id}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-gray-800 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-400 dark:border-gray-600 bg-white dark:bg-gray-800 text-primary focus:ring-primary"
                  checked={isSelected}
                  onChange={() => toggle(program.id)}
                />
                {program.coverColor && (
                  <span
                    aria-hidden="true"
                    style={{ backgroundColor: program.coverColor }}
                    className="w-2 h-2 rounded-full shrink-0"
                  />
                )}
                <span className="truncate flex-1">{program.name}</span>
              </label>
            )
          })}

          {available.length === 0 && !loading && (
            <p className="px-3 py-2 text-xs text-slate-500 dark:text-gray-400">No gym programs.</p>
          )}

          {selected.length > 0 && (
            <div className="border-t border-slate-200 dark:border-gray-800 px-3 py-2 flex justify-end">
              <button
                type="button"
                onClick={clear}
                className="text-xs text-slate-500 dark:text-gray-400 hover:text-slate-950 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 rounded px-1"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Discovery entry point for the Browse page — primary path now that
              the standalone sidebar link has been retired. */}
          <div className="border-t border-slate-200 dark:border-gray-800">
            <button
              type="button"
              onClick={goToBrowse}
              className="w-full px-3 py-2 text-left text-sm text-primary hover:bg-slate-100 dark:hover:bg-gray-800 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
            >
              Browse public programs →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
