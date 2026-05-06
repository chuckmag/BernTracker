import { useState } from 'react'
import Button from './ui/Button'
import type { EmergencyContact, CreateEmergencyContactPayload } from '../lib/api'

interface EmergencyContactsEditorProps {
  contacts: EmergencyContact[]
  onCreate: (data: CreateEmergencyContactPayload) => Promise<void>
  onRemove: (id: string) => Promise<void>
  // When true, the editor is being used in the onboarding flow — caller handles
  // submission, so we don't expose remove/update for not-yet-saved contacts.
  inline?: boolean
}

const EMPTY: CreateEmergencyContactPayload = { name: '', relationship: '', phone: '', email: '' }

export default function EmergencyContactsEditor({ contacts, onCreate, onRemove, inline }: EmergencyContactsEditorProps) {
  const [draft, setDraft] = useState<CreateEmergencyContactPayload>(EMPTY)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    if (!draft.name.trim() || !draft.phone.trim()) {
      setError('Name and phone are required.')
      return
    }
    setAdding(true)
    setError(null)
    try {
      await onCreate({
        name: draft.name.trim(),
        phone: draft.phone.trim(),
        relationship: draft.relationship?.trim() || undefined,
        email: draft.email?.trim() || undefined,
      })
      setDraft(EMPTY)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add contact')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="space-y-3">
      {contacts.length > 0 && (
        <ul className="space-y-2">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 rounded-lg bg-slate-100 dark:bg-gray-800 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-slate-950 dark:text-white truncate">
                  {c.name}
                  {c.relationship && <span className="text-slate-500 dark:text-gray-400"> · {c.relationship}</span>}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400">{c.phone}{c.email ? ` · ${c.email}` : ''}</p>
              </div>
              {!inline && (
                <button
                  type="button"
                  onClick={() => onRemove(c.id).catch((e) => setError(e instanceof Error ? e.message : 'Failed to remove'))}
                  className="text-xs text-rose-400 hover:text-rose-300"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 rounded-lg bg-slate-100 dark:bg-gray-800 p-3">
        <p className="text-xs text-slate-500 dark:text-gray-400">Add a contact</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="Name"
            aria-label="Contact name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded px-2 py-1.5 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="text"
            placeholder="Relationship (optional)"
            aria-label="Relationship"
            value={draft.relationship ?? ''}
            onChange={(e) => setDraft({ ...draft, relationship: e.target.value })}
            className="bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded px-2 py-1.5 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="tel"
            placeholder="Phone"
            aria-label="Phone"
            value={draft.phone}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            className="bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded px-2 py-1.5 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="email"
            placeholder="Email (optional)"
            aria-label="Email"
            value={draft.email ?? ''}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            className="bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded px-2 py-1.5 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <Button variant="secondary" disabled={adding} onClick={handleAdd}>
          {adding ? 'Adding…' : 'Add contact'}
        </Button>
      </div>
    </div>
  )
}
