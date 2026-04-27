import SegmentedControl from './ui/SegmentedControl'
import type { IdentifiedGender } from '../lib/api'

// Reused by /onboarding (step 1) and /profile. The first option doubles as the
// caller-side fallback when the user's identifiedGender is null/empty.
export const GENDER_OPTIONS: { value: NonNullable<IdentifiedGender>; label: string }[] = [
  { value: 'FEMALE', label: 'Female' },
  { value: 'MALE', label: 'Male' },
  { value: 'NON_BINARY', label: 'Non-binary' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
]

const TEXT_INPUT =
  'w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500'

interface NameFieldsProps {
  firstName: string
  lastName: string
  onFirstNameChange: (v: string) => void
  onLastNameChange: (v: string) => void
  autoFocus?: boolean
}

export function NameFields({
  firstName,
  lastName,
  onFirstNameChange,
  onLastNameChange,
  autoFocus,
}: NameFieldsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="block">
        <span className="text-xs text-gray-400 mb-1 block">First name</span>
        <input
          type="text"
          autoFocus={autoFocus}
          value={firstName}
          onChange={(e) => onFirstNameChange(e.target.value)}
          className={TEXT_INPUT}
        />
      </label>
      <label className="block">
        <span className="text-xs text-gray-400 mb-1 block">Last name</span>
        <input
          type="text"
          value={lastName}
          onChange={(e) => onLastNameChange(e.target.value)}
          className={TEXT_INPUT}
        />
      </label>
    </div>
  )
}

interface BirthdayFieldProps {
  value: string
  onChange: (v: string) => void
  helperText?: string
}

export function BirthdayField({ value, onChange, helperText }: BirthdayFieldProps) {
  return (
    <label className="block">
      <span className="text-xs text-gray-400 mb-1 block">Birthday</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={TEXT_INPUT}
      />
      {helperText && <span className="text-xs text-gray-500 mt-1 block">{helperText}</span>}
    </label>
  )
}

interface GenderFieldProps {
  value: NonNullable<IdentifiedGender>
  onChange: (v: NonNullable<IdentifiedGender>) => void
  helperText?: string
}

export function GenderField({ value, onChange, helperText }: GenderFieldProps) {
  return (
    <div>
      <span className="text-xs text-gray-400 mb-1 block">Gender</span>
      <SegmentedControl
        aria-label="Identified gender"
        options={GENDER_OPTIONS}
        value={value}
        onChange={onChange}
        className="flex-wrap"
      />
      {helperText && <span className="text-xs text-gray-500 mt-1 block">{helperText}</span>}
    </div>
  )
}
