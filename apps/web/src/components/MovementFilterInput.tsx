import { useState } from 'react'
import type { Movement } from '../lib/api'
import Chip from './ui/Chip'

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
        <Chip
          key={m.id}
          variant="accent"
          onDismiss={() => remove(m.id)}
          aria-label={`Remove ${m.name} filter`}
        >
          {m.name}
        </Chip>
      ))}

      {/* Search input + dropdown */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && searchResults.length === 1) {
              e.preventDefault()
              select(searchResults[0])
            }
          }}
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
