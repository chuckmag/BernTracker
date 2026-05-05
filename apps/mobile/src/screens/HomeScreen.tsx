import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { api, type DashboardToday, type GymProgram } from '../lib/api'
import { useGym } from '../context/GymContext'
import { useAuth } from '../context/AuthContext'
import { useProgramFilter } from '../context/ProgramFilterContext'
import WodHeroCard from '../components/WodHeroCard'
import LeaderboardCard from '../components/LeaderboardCard'
import UpcomingCard from '../components/UpcomingCard'

function firstNameOf(user: { firstName?: string | null; name?: string | null } | null): string | null {
  if (user?.firstName) return user.firstName
  if (user?.name) return user.name.split(' ')[0]
  return null
}

function greetingFor(firstName: string | null | undefined): string {
  const hour = new Date().getHours()
  const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  return firstName ? `Good ${period}, ${firstName}` : `Good ${period}`
}

export default function HomeScreen() {
  const { activeGym } = useGym()
  const { user } = useAuth()
  const { available } = useProgramFilter()
  const [selectedProgramId, setSelectedProgramId] = useState<string>('')
  const [data, setData] = useState<DashboardToday | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load(quiet = false) {
    if (!activeGym) return
    if (!quiet) setLoading(true)
    setError(null)
    try {
      const programIds = selectedProgramId ? [selectedProgramId] : undefined
      const result = await api.gyms.dashboard.today(activeGym.id, programIds)
      setData(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useFocusEffect(
    useCallback(() => {
      load()
    }, [activeGym, selectedProgramId]),
  )

  useEffect(() => {
    if (activeGym) load()
  }, [selectedProgramId])  // eslint-disable-line react-hooks/exhaustive-deps

  function onRefresh() {
    setRefreshing(true)
    load(true)
  }

  const greeting = greetingFor(firstNameOf(user))
  const showPicker = available.length > 1

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#818cf8" />}
    >
      {/* Greeting row: 60% greeting, 30% program picker */}
      <View style={styles.greetingRow}>
        <Text style={styles.greeting}>{greeting}</Text>
        {showPicker && (
          <View style={styles.pickerSlot}>
            <DashboardProgramPicker
              available={available}
              selectedId={selectedProgramId}
              onSelect={setSelectedProgramId}
            />
          </View>
        )}
      </View>

      {loading && !refreshing && (
        <View style={styles.loadingCard}>
          <View style={styles.loadingShimmer} />
          <View style={[styles.loadingShimmer, { width: '70%', marginTop: 8 }]} />
        </View>
      )}

      {!loading && error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!loading && data && (
        <>
          <WodHeroCard data={data} />
          {data.workout && (
            <LeaderboardCard
              workoutId={data.workout.id}
              workoutTitle={data.workout.title}
              myUserId={user?.id ?? ''}
            />
          )}
        </>
      )}

      {!loading && activeGym && (
        <UpcomingCard gymId={activeGym.id} />
      )}

      {/* Social feed placeholder — deferred until social features are scoped */}
      <View style={styles.socialPlaceholder}>
        <Text style={styles.socialPlaceholderText}>Social feed coming soon</Text>
      </View>
    </ScrollView>
  )
}

function DashboardProgramPicker({
  available,
  selectedId,
  onSelect,
}: {
  available: GymProgram[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const label = available.find((gp) => gp.program.id === selectedId)?.program.name ?? 'All programs'

  const options = [
    { id: '', name: 'All programs' },
    ...available.map((gp) => ({ id: gp.program.id, name: gp.program.name })),
  ]

  return (
    <>
      <TouchableOpacity
        style={styles.pickerBtn}
        onPress={() => setOpen(true)}
        accessibilityLabel="Filter by program"
      >
        <Text style={styles.pickerBtnText}>{label}</Text>
        <Text style={styles.pickerChevron}>▾</Text>
      </TouchableOpacity>

      <Modal animationType="fade" transparent visible={open} onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Program</Text>
            {options.map((p) => {
              const isSelected = selectedId === p.id
              return (
                <TouchableOpacity
                  key={p.id}
                  style={styles.sheetRow}
                  onPress={() => { onSelect(p.id); setOpen(false) }}
                >
                  <Text style={[styles.sheetRowText, isSelected && styles.sheetRowSelected]}>
                    {p.name}
                  </Text>
                  {isSelected && <Text style={styles.sheetCheckmark}>✓</Text>}
                </TouchableOpacity>
              )
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#030712',
  },
  content: {
    padding: 14,
    gap: 12,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  greeting: {
    flex: 6,
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.3,
    flexWrap: 'wrap',
  },
  pickerSlot: {
    flex: 3,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1f2937',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#374151',
    flexShrink: 1,
  },
  pickerBtnText: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
    flexWrap: 'wrap',
  },
  pickerChevron: {
    color: '#818cf8',
    fontSize: 11,
    marginLeft: 4,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  sheetRowText: {
    fontSize: 15,
    color: '#d1d5db',
    flex: 1,
  },
  sheetRowSelected: {
    color: '#818cf8',
    fontWeight: '600',
  },
  sheetCheckmark: {
    color: '#818cf8',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  loadingCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 20,
    minHeight: 120,
  },
  loadingShimmer: {
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1f2937',
    width: '90%',
  },
  errorCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  socialPlaceholder: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    borderStyle: 'dashed',
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialPlaceholderText: {
    fontSize: 13,
    color: '#4b5563',
  },
})
