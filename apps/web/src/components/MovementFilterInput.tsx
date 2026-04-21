import { useState } from 'react'
import type { Movement } from '../lib/api'

interface Props {
  allMovements: Movement[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
}

export default function MovementFilterInput({
  allMovements,
  selectedIds,
  onChange,
  placeholder = 'Filter by movement…',
}: Props) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const selectedMovements = allMovements.filter((m) => selectedIds.includes(m.id))
  const searchResults = search.trim()
    ? allMovements
        .filter(
          (m) =>
            !selectedIds.includes(m.id) &&
            m.name.toLowerCase().includes(search.toLowerCase()),
        )
        .slice(0, 8)
    : []

  function select(m: Movement) {
    onChange([...selectedIds, m.id])
    setSearch('')
    setOpen(false)
  }

  function remove(id: string) {
    onChange(selectedIds.filter((x) => x !== id))
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Selected chips */}
      {selectedMovements.map((m) => (
        <span
          key={m.id}
          className="flex items-center gap-1 bg-indigo-600 text-white text-xs px-2.5 py-1 rounded-full"
        >
          {m.name}
          <button
            type="button"
            onMouseDown={() => remove(m.id)}
            className="flex items-center justify-center w-3.5 h-3.5 -mr-0.5 hover:bg-indigo-500 rounded-full transition-colors"
            aria-label={`Remove ${m.name} filter`}
          >
            ×
          </button>
        </span>
      ))}

      {/* Search input + dropdown */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={selectedIds.length === 0 ? placeholder : 'Add movement…'}
          className="bg-transparent text-sm text-white placeholder-gray-600 outline-none w-36 focus:w-48 transition-all"
        />

        {open && searchResults.length > 0 && (
          <div className="absolute left-0 top-full mt-1 z-50 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
            {searchResults.map((m) => (
              <button
                key={m.id}
                type="button"
                onMouseDown={() => select(m)}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
              >
                {m.name}
                {m.parentId && (
                  <span className="ml-1 text-gray-500 text-xs">
                    ({allMovements.find((x) => x.id === m.parentId)?.name ?? 'variation'})
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedIds.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors ml-1"
        >
          Clear
        </button>
      )}
    </div>
  )
}
