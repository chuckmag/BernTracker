import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from 'react-native'
import { api, type GoalResponse, type GoalCheckInResponse } from '../lib/api'

/**
 * Mobile equivalent of apps/web/src/components/HabitCheckInPanel.tsx.
 * Replaces the v1 "Mark complete" stub on HABIT goal detail with:
 *
 *   - Streak hero (currentStreak / longestStreak)
 *   - Tap-to-check primary button with optional note
 *   - Last-7-days dot strip
 *   - History list
 *
 * The parent owns the goal and receives refreshed copies via
 * `onGoalChange` after every write.
 */

const NOTE_MAX = 280
const HISTORY_PAGE_SIZE = 20

interface Props {
  goal: GoalResponse
  onGoalChange: (next: GoalResponse) => void
}

export default function HabitCheckInPanel({ goal, onGoalChange }: Props) {
  if (goal.progress.type !== 'HABIT') return null
  const progress = goal.progress

  const [noteDraft, setNoteDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<GoalCheckInResponse[] | null>(null)

  const todayDate = progress.last7Days[0]?.date
  const todayRow = history?.find((h) => h.date === todayDate) ?? null

  useEffect(() => {
    let cancelled = false
    api.goals.checkIns
      .list(goal.id, { limit: HISTORY_PAGE_SIZE })
      .then((rows) => { if (!cancelled) setHistory(rows) })
      .catch(() => { if (!cancelled) setHistory([]) })
    return () => { cancelled = true }
  }, [goal.id])

  useEffect(() => {
    setNoteDraft(todayRow?.note ?? '')
  }, [todayRow?.id, todayRow?.note])

  async function handleRecord() {
    if (busy) return
    setBusy(true)
    try {
      const trimmed = noteDraft.trim()
      const { goal: next } = await api.goals.checkIns.record(goal.id, {
        note: trimmed.length > 0 ? trimmed : undefined,
      })
      onGoalChange(next)
      const rows = await api.goals.checkIns.list(goal.id, { limit: HISTORY_PAGE_SIZE })
      setHistory(rows)
    } finally {
      setBusy(false)
    }
  }

  async function handleUndo() {
    if (busy || !todayDate) return
    setBusy(true)
    try {
      const { goal: next } = await api.goals.checkIns.remove(goal.id, todayDate)
      onGoalChange(next)
      setNoteDraft('')
      const rows = await api.goals.checkIns.list(goal.id, { limit: HISTORY_PAGE_SIZE })
      setHistory(rows)
    } finally {
      setBusy(false)
    }
  }

  const noteTooLong = noteDraft.length > NOTE_MAX

  return (
    <View style={s.container}>
      <StreakHero
        currentStreak={progress.currentStreak}
        longestStreak={progress.longestStreak}
        checkedInToday={progress.checkedInToday}
      />

      <Last7DaysStrip last7Days={progress.last7Days} />

      <View style={s.noteCard}>
        <Text style={s.noteLabel}>OPTIONAL NOTE</Text>
        <TextInput
          accessibilityLabel="Check-in note"
          placeholder="A word about today (optional)"
          placeholderTextColor="#6b7280"
          multiline
          maxLength={NOTE_MAX + 50}
          value={noteDraft}
          onChangeText={setNoteDraft}
          style={s.noteInput}
        />
        <View style={s.noteFooter}>
          <Text style={[s.noteCounter, noteTooLong && s.noteCounterTooLong]}>
            {noteDraft.length}/{NOTE_MAX}
          </Text>
          {progress.checkedInToday ? (
            <View style={s.actionRow}>
              <TouchableOpacity
                style={[s.undoBtn, busy && s.btnDisabled]}
                onPress={handleUndo}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Undo today's check-in"
              >
                <Text style={s.undoBtnText}>Undo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.saveBtn, (busy || noteTooLong) && s.btnDisabled]}
                onPress={handleRecord}
                disabled={busy || noteTooLong}
                accessibilityRole="button"
                accessibilityLabel="Save note"
              >
                {busy ? <ActivityIndicator color="#020617" /> : <Text style={s.saveBtnText}>Save note</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[s.tapBtn, (busy || noteTooLong) && s.btnDisabled]}
              onPress={handleRecord}
              disabled={busy || noteTooLong}
              accessibilityRole="button"
              accessibilityLabel="Record check-in for today"
            >
              {busy ? (
                <ActivityIndicator color="#020617" />
              ) : (
                <Text style={s.tapBtnText}>I did it today</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      <HistoryList history={history} />
    </View>
  )
}

// ─── Streak hero ─────────────────────────────────────────────────────────────

function StreakHero({
  currentStreak,
  longestStreak,
  checkedInToday,
}: {
  currentStreak: number
  longestStreak: number
  checkedInToday: boolean
}) {
  return (
    <View style={s.heroCard}>
      <Text style={s.heroLabel}>CURRENT STREAK</Text>
      <View style={s.heroRow}>
        <Text style={s.heroValue}>{currentStreak}</Text>
        <Text style={s.heroUnit}>{currentStreak === 1 ? 'day' : 'days'}</Text>
      </View>
      <Text style={s.heroStatus}>
        {currentStreak === 0
          ? 'Tap below to start a streak.'
          : checkedInToday
            ? 'Locked in for today.'
            : 'Tap below before midnight to keep the streak alive.'}
      </Text>
      {longestStreak > 0 && (
        <Text style={s.heroSubtle}>
          Longest streak: {longestStreak} {longestStreak === 1 ? 'day' : 'days'}
        </Text>
      )}
    </View>
  )
}

// ─── Last-7-days strip ───────────────────────────────────────────────────────

function Last7DaysStrip({
  last7Days,
}: {
  last7Days: Array<{ date: string; checkedIn: boolean }>
}) {
  // API returns newest-first; reverse so the row reads left-to-right.
  const reversed = [...last7Days].reverse()
  return (
    <View style={s.stripCard}>
      <Text style={s.stripLabel}>LAST 7 DAYS</Text>
      <View
        style={s.stripRow}
        accessibilityRole="list"
        accessibilityLabel="Last 7 days check-ins"
      >
        {reversed.map((d) => (
          <View
            key={d.date}
            style={[s.stripCell, d.checkedIn ? s.stripCellOn : s.stripCellOff]}
            accessibilityLabel={`${d.date} ${d.checkedIn ? 'checked in' : 'no check-in'}`}
          />
        ))}
      </View>
    </View>
  )
}

// ─── History list ────────────────────────────────────────────────────────────

function HistoryList({ history }: { history: GoalCheckInResponse[] | null }) {
  if (!history) {
    return (
      <View style={s.historyCard}>
        <ActivityIndicator color="#9ca3af" />
      </View>
    )
  }
  if (history.length === 0) {
    return (
      <View style={s.historyCard}>
        <Text style={s.historyEmpty}>No check-ins yet. Tap above to record your first.</Text>
      </View>
    )
  }
  return (
    <View style={s.historyCard}>
      <Text style={s.historyTitle}>CHECK-IN HISTORY</Text>
      <FlatList
        data={history}
        keyExtractor={(row) => row.id}
        renderItem={({ item }) => (
          <View style={s.historyRow}>
            <Text style={s.historyDate}>{item.date}</Text>
            {item.note && <Text style={s.historyNote}>{item.note}</Text>}
          </View>
        )}
        ItemSeparatorComponent={() => <View style={s.historySep} />}
        scrollEnabled={false}
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { gap: 12 },

  heroCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  heroLabel: { color: '#9ca3af', fontSize: 11, fontWeight: '600', letterSpacing: 0.8 },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 },
  heroValue: { color: '#ffffff', fontSize: 40, fontWeight: '700' },
  heroUnit: { color: '#9ca3af', fontSize: 14 },
  heroStatus: { color: '#cbd5e1', fontSize: 12, marginTop: 8 },
  heroSubtle: { color: '#6b7280', fontSize: 11, marginTop: 4 },

  stripCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  stripLabel: { color: '#9ca3af', fontSize: 11, fontWeight: '600', letterSpacing: 0.8, marginBottom: 8 },
  stripRow: { flexDirection: 'row', gap: 6 },
  stripCell: { flex: 1, height: 32, borderRadius: 6, borderWidth: 1 },
  stripCellOn: {
    backgroundColor: 'rgba(95, 212, 208, 0.2)',
    borderColor: 'rgba(95, 212, 208, 0.6)',
  },
  stripCellOff: { backgroundColor: '#1f2937', borderColor: '#1f2937' },

  noteCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    gap: 8,
  },
  noteLabel: { color: '#9ca3af', fontSize: 11, fontWeight: '600', letterSpacing: 0.8 },
  noteInput: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    color: '#f3f4f6',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    minHeight: 44,
  },
  noteFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  noteCounter: { color: '#6b7280', fontSize: 11 },
  noteCounterTooLong: { color: '#f87171' },

  tapBtn: {
    backgroundColor: '#5FD4D0',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    minWidth: 140,
  },
  tapBtnText: { color: '#020617', fontWeight: '700', fontSize: 14 },

  actionRow: { flexDirection: 'row', gap: 8 },
  saveBtn: {
    backgroundColor: '#5B9BE6',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: '#020617', fontWeight: '700', fontSize: 14 },
  undoBtn: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  undoBtnText: { color: '#cbd5e1', fontSize: 14 },

  btnDisabled: { opacity: 0.55 },

  historyCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  historyTitle: { color: '#9ca3af', fontSize: 11, fontWeight: '600', letterSpacing: 0.8, marginBottom: 8 },
  historyEmpty: { color: '#6b7280', fontSize: 12 },
  historyRow: { paddingVertical: 8 },
  historyDate: { color: '#f3f4f6', fontSize: 14 },
  historyNote: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  historySep: { height: 1, backgroundColor: '#1f2937' },
})
