import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect } from '@react-navigation/native'
import { api, type DashboardToday, type GymProgram } from '../lib/api'
import { useGym } from '../context/GymContext'
import { useAuth } from '../context/AuthContext'
import { useProgramFilter } from '../context/ProgramFilterContext'
import { isRecoveryWorkoutType } from '../lib/workoutTypeStyles'
import WodHeroCard from '../components/WodHeroCard'
import LeaderboardCard from '../components/LeaderboardCard'
import UpcomingCard from '../components/UpcomingCard'
import HotTodayCard from '../components/HotTodayCard'
import GoalsCard from '../components/GoalsCard'
import { useTheme } from '../lib/theme'
import ThemedText from '../components/ThemedText'
import ThemedView from '../components/ThemedView'

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

function dashboardStorageKey(gymId: string): string {
  return `dashboardProgram:${gymId}`
}

export default function HomeScreen() {
  const { colors } = useTheme()
  const { activeGym } = useGym()
  const { user } = useAuth()
  const { available, defaultProgramId } = useProgramFilter()
  const [selectedProgramId, setSelectedProgramId] = useState<string>('')
  const [data, setData] = useState<DashboardToday | null>(null)
  const [activeWorkoutIdx, setActiveWorkoutIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track which gym the selection was last initialized for so we re-seed
  // when the active gym changes without running on every available[] update.
  const initializedForGymRef = useRef<string | null>(null)

  // Seed selectedProgramId from AsyncStorage (falling back to the gym's default
  // program) the first time `available` resolves for the active gym.
  useEffect(() => {
    const gymId = activeGym?.id ?? null
    if (!gymId || available.length === 0) return
    if (initializedForGymRef.current === gymId) return

    initializedForGymRef.current = gymId
    const validIds = new Set(available.map((gp) => gp.program.id))

    AsyncStorage.getItem(dashboardStorageKey(gymId))
      .then((stored) => {
        if (stored && validIds.has(stored)) {
          setSelectedProgramId(stored)
        } else if (defaultProgramId) {
          setSelectedProgramId(defaultProgramId)
          AsyncStorage.setItem(dashboardStorageKey(gymId), defaultProgramId).catch(() => {})
        } else {
          setSelectedProgramId('')
        }
      })
      .catch(() => {
        if (defaultProgramId) setSelectedProgramId(defaultProgramId)
      })
  }, [activeGym?.id, available, defaultProgramId])

  // Reset when the gym changes so the above effect re-seeds for the new gym.
  useEffect(() => {
    const gymId = activeGym?.id ?? null
    if (!gymId) return
    if (initializedForGymRef.current !== gymId) {
      setSelectedProgramId('')
    }
  }, [activeGym?.id])

  async function load(quiet = false) {
    if (!activeGym) return
    if (!quiet) setLoading(true)
    setError(null)
    try {
      const programIds = selectedProgramId ? [selectedProgramId] : undefined
      const result = await api.gyms.dashboard.today(activeGym.id, programIds)
      setData(result)
      // Pre-select the first non-recovery workout (warmup/mobility/cooldown tabs
      // appear first in the strip for natural class flow, but the main WOD is the default).
      const firstMain = result.workouts?.findIndex((w) => !isRecoveryWorkoutType(w.workout.type)) ?? -1
      setActiveWorkoutIdx(firstMain === -1 ? 0 : firstMain)
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

  function handleSelectProgram(id: string) {
    setSelectedProgramId(id)
    const gymId = activeGym?.id
    if (gymId) {
      AsyncStorage.setItem(dashboardStorageKey(gymId), id).catch(() => {})
    }
  }

  const greeting = greetingFor(firstNameOf(user))
  const showPicker = available.length > 1
  const upcomingProgramIds = selectedProgramId ? [selectedProgramId] : undefined
  // Resolve the active entry once so LeaderboardCard and HotTodayCard can't
  // diverge from WodHeroCard if `activeWorkoutIdx` is stale (e.g. just after a
  // refetch that shrank the array).
  const activeEntry = data?.workouts?.[activeWorkoutIdx] ?? data?.workouts?.[0] ?? null

  return (
    <ThemedView variant="screen" style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Greeting row: 60% greeting, 30% program picker */}
        <View style={styles.greetingRow}>
          <ThemedText style={styles.greeting}>{greeting}</ThemedText>
          {showPicker && (
            <View style={styles.pickerSlot}>
              <DashboardProgramPicker
                available={available}
                selectedId={selectedProgramId}
                onSelect={handleSelectProgram}
              />
            </View>
          )}
        </View>

        {loading && !refreshing && (
          <ThemedView variant="card" style={[styles.loadingCard, { borderColor: colors.borderSubtle }]}>
            <View style={[styles.loadingShimmer, { backgroundColor: colors.surfaceSubtle }]} />
            <View style={[styles.loadingShimmer, { backgroundColor: colors.surfaceSubtle, width: '70%', marginTop: 8 }]} />
          </ThemedView>
        )}

        {!loading && error && (
          <ThemedView variant="card" style={[styles.errorCard, { borderColor: colors.borderSubtle }]}>
            <ThemedText variant="tertiary" style={styles.errorText}>{error}</ThemedText>
          </ThemedView>
        )}

        {!loading && data && (
          <WodHeroCard
            workouts={data.workouts ?? []}
            gymMemberCount={data.gymMemberCount}
            activeIdx={activeWorkoutIdx}
            onActiveIdxChange={setActiveWorkoutIdx}
          />
        )}

        {!loading && activeEntry && (
          <LeaderboardCard
            workoutId={activeEntry.workout.id}
            workoutTitle={activeEntry.workout.title}
            myUserId={user?.id ?? ''}
          />
        )}

        {/* My Goals — fetches its own data; renders regardless of WOD presence. */}
        {!loading && <GoalsCard />}

        {!loading && activeGym && (
          <UpcomingCard gymId={activeGym.id} programIds={upcomingProgramIds} />
        )}

        {/* Hot Today — top results by social activity (reactions + comments) */}
        {!loading && activeEntry && <HotTodayCard workoutId={activeEntry.workout.id} />}
      </ScrollView>
    </ThemedView>
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
  const { colors } = useTheme()
  const [open, setOpen] = useState(false)

  const selectedGp = available.find((gp) => gp.program.id === selectedId)
  const label = selectedGp
    ? selectedGp.program.name + (selectedGp.isDefault && selectedGp.gymId ? ' (Default)' : '')
    : 'All programs'

  const options = [
    { id: '', name: 'All programs', isDefault: false },
    ...available.map((gp) => ({
      id: gp.program.id,
      name: gp.program.name,
      isDefault: gp.isDefault && !!gp.gymId,
    })),
  ]

  return (
    <>
      <TouchableOpacity
        style={[styles.pickerBtn, { backgroundColor: colors.inputBg, borderColor: colors.borderInteractive }]}
        onPress={() => setOpen(true)}
        accessibilityLabel="Filter by program"
      >
        <ThemedText variant="secondary" style={styles.pickerBtnText}>{label}</ThemedText>
        <ThemedText style={[styles.pickerChevron, { color: colors.primary }]}>▾</ThemedText>
      </TouchableOpacity>

      <Modal animationType="fade" transparent visible={open} onRequestClose={() => setOpen(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.modalScrim }]} onPress={() => setOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <ThemedView variant="card" style={styles.sheet}>
              <ThemedText style={styles.sheetTitle}>Program</ThemedText>
              {options.map((p) => {
                const isSelected = selectedId === p.id
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.sheetRow, { borderBottomColor: colors.borderSubtle }]}
                    onPress={() => { onSelect(p.id); setOpen(false) }}
                  >
                    <ThemedText
                      variant="secondary"
                      style={[styles.sheetRowText, isSelected && { color: colors.primary, fontWeight: '600' }]}
                    >
                      {p.name}{p.isDefault ? ' (Default)' : ''}
                    </ThemedText>
                    {isSelected && <ThemedText style={[styles.sheetCheckmark, { color: colors.primary }]}>✓</ThemedText>}
                  </TouchableOpacity>
                )
              })}
            </ThemedView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    flexShrink: 1,
  },
  pickerBtnText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
    flexWrap: 'wrap',
  },
  pickerChevron: {
    fontSize: 11,
    marginLeft: 4,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  sheetRowText: {
    fontSize: 15,
    flex: 1,
  },
  sheetCheckmark: {
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  loadingCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    minHeight: 120,
  },
  loadingShimmer: {
    height: 16,
    borderRadius: 8,
    width: '90%',
  },
  errorCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  errorText: {
    fontSize: 14,
  },
})
