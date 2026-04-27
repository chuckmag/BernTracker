import { useEffect, useRef, useState } from 'react'
import { useProgramFilter } from '../context/ProgramFilterContext.tsx'

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

  if (!available.length && !loading) {
    // Hide the picker entirely until at least one program exists, otherwise it
    // shows a useless empty dropdown for first-run gyms.
    return null
  }

  const selectedPrograms = available
    .map((gp) => gp.program)
    .filter((p) => selected.includes(p.id))

  let label: string
  if (selectedPrograms.length === 0) label = 'All programs'
  else if (selectedPrograms.length === 1) label = selectedPrograms[0].name
  else label = `${selectedPrograms[0].name} + ${selectedPrograms.length - 1} more`

  return (
    <div ref={containerRef} className="relative px-3 py-3 border-b border-gray-800">
      <span className="block text-xs uppercase tracking-widest text-gray-400 mb-1">Programs</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm text-left bg-gray-800 text-gray-200 hover:bg-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
      >
        <span className="truncate">{label}</span>
        <span className="text-gray-400 text-xs shrink-0">▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-50 left-3 right-3 mt-1 max-h-72 overflow-y-auto bg-gray-900 border border-gray-700 rounded-md shadow-2xl"
        >
          {available.map(({ program }) => {
            const isSelected = selected.includes(program.id)
            return (
              <label
                key={program.id}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500"
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

          {selected.length > 0 && (
            <div className="border-t border-gray-800 px-3 py-2 flex justify-end">
              <button
                type="button"
                onClick={clear}
                className="text-xs text-gray-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 rounded px-1"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
