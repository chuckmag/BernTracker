import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { AGE_DIVISIONS, getAgeDivision } from '@wodalytics/types'
import { api, type AgeDivision, type Workout, type LeaderboardEntry, type WorkoutLevel, type WorkoutGender, type UserWorkoutPlan } from '../lib/api'
import { styleFor } from '../lib/workoutTypeStyles'
import { useAuth } from '../context/AuthContext'
import { useGym } from '../context/GymContext'
import { formatResultValue } from '../lib/format'
import MovementHistorySection from '../components/MovementHistorySection'
import ResultReactions from '../components/ResultReactions'
import WorkoutPlanModal from '../components/WorkoutPlanModal'
import { useTheme } from '../lib/theme'
import ThemedText from '../components/ThemedText'
import ThemedView from '../components/ThemedView'

type Props = StackScreenProps<RootStackParamList, 'WodDetail'>

const LEVEL_FILTERS: { label: string; value: WorkoutLevel | null }[] = [
  { label: 'All', value: null },
  { label: 'RX+', value: 'RX_PLUS' },
  { label: 'RX', value: 'RX' },
  { label: 'Scaled', value: 'SCALED' },
  { label: 'Modified', value: 'MODIFIED' },
]

const LEVEL_LABELS: Record<WorkoutLevel, string> = {
  RX_PLUS: 'RX+',
  RX: 'RX',
  SCALED: 'Scaled',
  MODIFIED: 'Modified',
}

const GENDER_FILTERS: { label: string; value: WorkoutGender | null }[] = [
  { label: 'All', value: null },
  { label: 'Women', value: 'FEMALE' },
  { label: 'Men', value: 'MALE' },
  { label: 'Open', value: 'OPEN' },
]

const GENDER_LABELS: Record<WorkoutGender, string> = {
  FEMALE: 'Women',
  MALE: 'Men',
  OPEN: 'Open',
}

const DIVISION_FILTERS: { label: string; value: AgeDivision | null }[] = [
  { label: 'All', value: null },
  ...AGE_DIVISIONS.map((d) => ({ label: d.label, value: d.value })),
]

export default function WodDetailScreen({ route, navigation }: Props) {
  const { colors } = useTheme()
  const { workoutId } = route.params
  const { user } = useAuth()
  const { activeGym } = useGym()
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [levelFilter, setLevelFilter] = useState<WorkoutLevel | null>(null)
  const [genderFilter, setGenderFilter] = useState<WorkoutGender | null>(null)
  const [divisionFilter, setDivisionFilter] = useState<AgeDivision | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Coach notes are reference material for staff during class but supplementary
  // colour for members — so the toggle defaults open for COACH/PROGRAMMER/OWNER
  // and closed for MEMBER. Same contract as web (#184). User can always toggle.
  const isStaff = activeGym?.role === 'COACH' || activeGym?.role === 'PROGRAMMER' || activeGym?.role === 'OWNER'
  const [showCoachNotes, setShowCoachNotes] = useState(isStaff)

  // Plan state
  const [myPlan, setMyPlan] = useState<UserWorkoutPlan | null>(null)
  const [memberPlans, setMemberPlans] = useState<UserWorkoutPlan[]>([])
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [planTarget, setPlanTarget] = useState<{ id: string; name: string | null; firstName: string | null; lastName: string | null; email: string } | null>(null)
  // Edit gating is server-derived now (#242 slice 2b): the workout response
  // carries `canEdit`, computed by the same logic as requireWorkoutWriteAccess
  // — covers the gym-PROGRAMMER/OWNER case slice 2a couldn't. Treat absent as
  // false so an older API build silently hides the affordance instead of
  // showing a button that always 403s.
  const canEdit = !!workout?.canEdit

  // Load workout details once.
  useEffect(() => {
    api.workouts.get(workoutId)
      .then((w) => {
        setWorkout(w)
        navigation.setOptions({ title: w.title })
      })
      .catch(() => setError('Could not load workout.'))
      .finally(() => setLoading(false))
  }, [workoutId, navigation])

  // Edit affordance in the nav bar — only renders for workouts the viewer
  // can edit (currently: their own personal-program workouts). Re-runs when
  // canEdit flips so the button appears/disappears correctly.
  useEffect(() => {
    navigation.setOptions({
      headerRight: canEdit
        ? () => (
            <TouchableOpacity
              onPress={() => navigation.navigate('WorkoutEditor', { mode: 'edit', workoutId })}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              style={styles.headerEditBtn}
              testID="edit-workout-button"
              accessibilityRole="button"
              accessibilityLabel="Edit workout"
            >
              <ThemedText style={[styles.headerEditText, { color: colors.primary }]}>Edit</ThemedText>
            </TouchableOpacity>
          )
        : undefined,
    })
  }, [canEdit, navigation, workoutId, colors])

  // Always fetch the unfiltered leaderboard and apply filters client-side.
  // This way the user's "your result" badge keeps showing their RX entry even
  // when the leaderboard list is filtered to RX+ — their own state shouldn't
  // depend on which filter chip is active.
  // useFocusEffect picks up create/edit/delete results on goBack from
  // LogResultScreen.
  const loadLeaderboard = useCallback(() => {
    api.workouts.results(workoutId)
      .then(setLeaderboard)
      .catch(() => {})
  }, [workoutId])

  useFocusEffect(useCallback(() => { loadLeaderboard() }, [loadLeaderboard]))

  // Load user's own plan when workoutId or user is available.
  useEffect(() => {
    if (!user) return
    api.plans.getForUser(workoutId, user.id).then(setMyPlan).catch(() => setMyPlan(null))
  }, [workoutId, user])

  // Staff: load all member plans for this workout.
  useEffect(() => {
    if (!isStaff) return
    api.plans.listForWorkout(workoutId).then(setMemberPlans).catch(() => {})
  }, [workoutId, isStaff])

  // Auto-detect the viewer's age division from their birthday once the
  // workout is loaded. Mirrors the web auto-detect behaviour.
  useEffect(() => {
    if (!workout || !user?.birthday) return
    const div = getAgeDivision(user.birthday, workout.scheduledAt)
    if (div) setDivisionFilter(div)
  }, [workout, user])

  const userResult = leaderboard.find((e) => e.user.id === user?.id)
  const hasLogged = !!userResult

  const visibleLeaderboard = useMemo(
    () =>
      leaderboard
        .filter((e) => !levelFilter || e.level === levelFilter)
        .filter((e) => !genderFilter || e.workoutGender === genderFilter)
        .filter((e) => {
          if (!divisionFilter || !workout) return true
          return getAgeDivision(e.user.birthday, workout.scheduledAt) === divisionFilter
        }),
    [leaderboard, levelFilter, genderFilter, divisionFilter, workout],
  )

  const emptyLeaderboardCopy = useMemo(() => {
    const parts: string[] = []
    if (levelFilter) parts.push(LEVEL_LABELS[levelFilter])
    if (genderFilter) parts.push(GENDER_LABELS[genderFilter])
    if (divisionFilter) {
      const div = AGE_DIVISIONS.find((d) => d.value === divisionFilter)
      if (div) parts.push(div.label)
    }
    if (parts.length === 0) return 'No results yet.'
    return `No ${parts.join(' / ')} results yet.`
  }, [levelFilter, genderFilter, divisionFilter])

  if (loading) {
    return (
      <ThemedView variant="screen" style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </ThemedView>
    )
  }

  if (error || !workout) {
    return (
      <ThemedView variant="screen" style={styles.center}>
        <ThemedText style={[styles.errorText, { color: colors.errorText }]}>{error ?? 'Workout not found.'}</ThemedText>
      </ThemedView>
    )
  }

  const typeStyle = styleFor(workout.type)
  const scheduledDate = new Date(workout.scheduledAt).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
  const cfUrl = workout.externalSourceId?.startsWith('crossfit-mainsite:w')
    ? `https://www.crossfit.com/workout/${workout.externalSourceId.replace('crossfit-mainsite:w', '').slice(2)}`
    : null

  // Tint used for "active filter chip" and "your result" highlights — a 20%
  // primary overlay reads as a recessed selection in both themes.
  const primaryTintBg = `${colors.primary}33`

  return (
    <>
    <ThemedView variant="screen" style={styles.container}>
    <ScrollView contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <View style={styles.typeBadgeRow}>
          <View style={[styles.typeBadge, { backgroundColor: typeStyle.bgTint }]}>
            <ThemedText style={[styles.typeText, { color: typeStyle.tint }]}>{typeStyle.label.toUpperCase()}</ThemedText>
          </View>
          <ThemedText variant="tertiary" style={styles.dateText}>{scheduledDate}</ThemedText>
        </View>
        <ThemedText style={styles.title}>{workout.title}</ThemedText>
      </View>

      {/* Coach notes — collapsible. Default state per role (#184): expanded for
          staff, collapsed for members. Hidden entirely when notes are absent. */}
      {workout.coachNotes ? (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.coachNotesHeader}
            onPress={() => setShowCoachNotes((v) => !v)}
            activeOpacity={0.7}
            testID="coach-notes-toggle"
            accessibilityRole="button"
            accessibilityState={{ expanded: showCoachNotes }}
          >
            <ThemedText variant="muted" style={styles.coachNotesLabel}>COACH NOTES</ThemedText>
            <ThemedText variant="tertiary" style={styles.coachNotesChevron}>{showCoachNotes ? '−' : '+'}</ThemedText>
          </TouchableOpacity>
          {showCoachNotes ? (
            <ThemedText variant="secondary" style={styles.coachNotesBody} testID="coach-notes-body">
              {workout.coachNotes}
            </ThemedText>
          ) : null}
        </View>
      ) : null}

      {/* Description */}
      {workout.description ? (
        <View style={styles.section}>
          <ThemedText variant="muted" style={styles.sectionLabel}>WORKOUT</ThemedText>
          <ThemedText variant="secondary" style={styles.description}>{workout.description}</ThemedText>
        </View>
      ) : null}

      {/* CrossFit source link */}
      {cfUrl ? (
        <TouchableOpacity
          style={styles.sourceLink}
          onPress={() => Linking.openURL(cfUrl)}
          activeOpacity={0.7}
        >
          <ThemedText style={[styles.sourceLinkText, { color: colors.primary }]}>View on CrossFit.com →</ThemedText>
        </TouchableOpacity>
      ) : null}

      {/* My Plan */}
      {user && (
        <View style={styles.section}>
          <View style={styles.planHeader}>
            <ThemedText variant="muted" style={styles.sectionLabel}>MY PLAN</ThemedText>
            <TouchableOpacity
              onPress={() => {
                setPlanTarget({ id: user.id, name: user.name, firstName: user.firstName, lastName: user.lastName, email: user.email })
                setShowPlanModal(true)
              }}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              accessibilityRole="button"
            >
              <ThemedText style={[styles.planEditBtn, { color: colors.primary }]}>{myPlan ? 'Edit' : 'Set Plan'}</ThemedText>
            </TouchableOpacity>
          </View>
          {myPlan ? (
            <View style={[styles.planCard, { backgroundColor: colors.borderSubtle }]}>
              {myPlan.level && (
                <View style={[styles.planLevelBadge, { backgroundColor: primaryTintBg }]}>
                  <ThemedText style={[styles.planLevelText, { color: colors.primary }]}>{LEVEL_LABELS[myPlan.level]}</ThemedText>
                </View>
              )}
              {myPlan.value?.movementResults?.map((mr) => {
                const wm = workout?.workoutMovements.find((w) => w.movement.id === mr.workoutMovementId)
                if (!wm) return null
                const label = mr.sets
                  .map((s) => [s.reps, s.load != null ? `${s.load} ${mr.loadUnit ?? 'lb'}` : null].filter(Boolean).join(' @ '))
                  .filter(Boolean)
                  .join(', ')
                return (
                  <ThemedText key={mr.workoutMovementId} variant="secondary" style={styles.planMovementRow}>
                    <ThemedText style={styles.planMovementName}>{wm.movement.name}</ThemedText>
                    {label ? <ThemedText variant="tertiary" style={styles.planMovementLabel}>  {label}</ThemedText> : null}
                  </ThemedText>
                )
              })}
              {myPlan.notes ? <ThemedText variant="tertiary" style={styles.planNotes}>{myPlan.notes}</ThemedText> : null}
            </View>
          ) : (
            <ThemedText variant="muted" style={styles.planEmpty}>No plan set yet.</ThemedText>
          )}
        </View>
      )}

      {/* Log Result CTA */}
      {hasLogged ? (
        <TouchableOpacity
          style={[styles.resultBadge, { backgroundColor: primaryTintBg }]}
          onPress={() =>
            navigation.navigate('LogResult', {
              workoutId: workout.id,
              resultId: userResult.id,
              existingResult: userResult,
            })
          }
          activeOpacity={0.8}
          testID="result-badge"
        >
          <ThemedText style={[styles.resultBadgeLabel, { color: colors.primary }]}>YOUR RESULT — TAP TO EDIT</ThemedText>
          <ThemedText style={styles.resultBadgeValue}>{formatResultValue(userResult.value)}</ThemedText>
          <ThemedText style={[styles.resultBadgeLevel, { color: colors.primary }]}>{LEVEL_LABELS[userResult.level]}</ThemedText>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.logButton, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate('LogResult', { workoutId: workout.id })}
          activeOpacity={0.8}
        >
          <ThemedText style={[styles.logButtonText, { color: colors.onPrimary }]}>Log Result</ThemedText>
        </TouchableOpacity>
      )}

      {/* Your History — hidden when arriving from movement-history or WODalytics to prevent nesting */}
      {user && route.params.from !== 'movement-history' && route.params.from !== 'wodalytics' && workout.workoutMovements.length > 0 && (
        <View style={styles.section}>
          <ThemedText variant="muted" style={styles.sectionLabel}>YOUR HISTORY</ThemedText>
          {workout.workoutMovements.map((wm) => (
            <MovementHistorySection
              key={wm.movement.id}
              movementId={wm.movement.id}
              movementName={wm.movement.name}
              navigation={navigation}
            />
          ))}
        </View>
      )}

      {/* Member Plans (staff only) */}
      {isStaff && (
        <View style={styles.section}>
          <ThemedText variant="muted" style={styles.sectionLabel}>
            MEMBER PLANS{memberPlans.length > 0 ? ` (${memberPlans.length})` : ''}
          </ThemedText>
          {memberPlans.length === 0 ? (
            <ThemedText variant="muted" style={styles.planEmpty}>No plans set yet.</ThemedText>
          ) : (
            memberPlans.map((plan) => {
              const memberName = plan.user?.firstName
                ? [plan.user.firstName, plan.user.lastName].filter(Boolean).join(' ')
                : (plan.user?.name ?? plan.user?.email ?? 'Unknown')
              return (
                <TouchableOpacity
                  key={plan.userId}
                  style={[styles.memberPlanRow, { borderBottomColor: colors.borderSubtle }]}
                  onPress={() => {
                    if (!plan.user) return
                    setPlanTarget({
                      id: plan.user.id,
                      name: plan.user.name,
                      firstName: plan.user.firstName,
                      lastName: plan.user.lastName,
                      email: plan.user.email,
                    })
                    setShowPlanModal(true)
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${memberName}'s plan`}
                >
                  <View style={styles.memberPlanInfo}>
                    <ThemedText style={styles.memberPlanName}>{memberName}</ThemedText>
                    {plan.level ? (
                      <View style={[styles.planLevelBadge, { backgroundColor: primaryTintBg }]}>
                        <ThemedText style={[styles.planLevelText, { color: colors.primary }]}>{LEVEL_LABELS[plan.level]}</ThemedText>
                      </View>
                    ) : null}
                  </View>
                  <ThemedText style={[styles.memberPlanEdit, { color: colors.primary }]}>Edit →</ThemedText>
                </TouchableOpacity>
              )
            })
          )}
        </View>
      )}

      {/* Leaderboard */}
      <View style={styles.section}>
        <ThemedText variant="muted" style={styles.sectionLabel}>LEADERBOARD</ThemedText>

        {/* Level filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterContent}
        >
          {LEVEL_FILTERS.map((f) => {
            const isActive = levelFilter === f.value
            return (
              <TouchableOpacity
                key={`level-${f.label}`}
                style={[
                  styles.chip,
                  { backgroundColor: colors.cardBg, borderColor: colors.borderInteractive },
                  isActive && { backgroundColor: primaryTintBg, borderColor: colors.primary },
                ]}
                onPress={() => setLevelFilter(f.value)}
                testID={`level-chip-${f.label}`}
              >
                <ThemedText
                  variant={isActive ? undefined : 'tertiary'}
                  style={[styles.chipText, isActive && { color: colors.primary, fontWeight: '600' }]}
                >
                  {f.label}
                </ThemedText>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* Gender filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterContent}
        >
          {GENDER_FILTERS.map((f) => {
            const isActive = genderFilter === f.value
            return (
              <TouchableOpacity
                key={`gender-${f.label}`}
                style={[
                  styles.chip,
                  { backgroundColor: colors.cardBg, borderColor: colors.borderInteractive },
                  isActive && { backgroundColor: primaryTintBg, borderColor: colors.primary },
                ]}
                onPress={() => setGenderFilter(f.value)}
                testID={`gender-chip-${f.label}`}
              >
                <ThemedText
                  variant={isActive ? undefined : 'tertiary'}
                  style={[styles.chipText, isActive && { color: colors.primary, fontWeight: '600' }]}
                >
                  {f.label}
                </ThemedText>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* Age division filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterContent}
        >
          {DIVISION_FILTERS.map((f) => {
            const isActive = divisionFilter === f.value
            return (
              <TouchableOpacity
                key={`division-${f.label}`}
                style={[
                  styles.chip,
                  { backgroundColor: colors.cardBg, borderColor: colors.borderInteractive },
                  isActive && { backgroundColor: primaryTintBg, borderColor: colors.primary },
                ]}
                onPress={() => setDivisionFilter(f.value)}
                testID={`division-chip-${f.label}`}
              >
                <ThemedText
                  variant={isActive ? undefined : 'tertiary'}
                  style={[styles.chipText, isActive && { color: colors.primary, fontWeight: '600' }]}
                >
                  {f.label}
                </ThemedText>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {visibleLeaderboard.length === 0 ? (
          <ThemedText variant="muted" style={styles.emptyLeaderboard}>{emptyLeaderboardCopy}</ThemedText>
        ) : (
          visibleLeaderboard.map((entry, idx) => (
            <TouchableOpacity
              key={entry.id}
              style={[
                styles.leaderboardRow,
                { borderBottomColor: colors.borderSubtle },
                entry.user.id === user?.id && { ...styles.leaderboardRowHighlight, backgroundColor: primaryTintBg },
              ]}
              onPress={() =>
                navigation.navigate('WodResultDetail', {
                  entry,
                  workoutTitle: workout.title,
                })
              }
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`View ${entry.user.name}'s result`}
            >
              <ThemedText variant="muted" style={styles.rank}>{idx + 1}</ThemedText>
              <View style={styles.leaderboardInfo}>
                <ThemedText style={styles.leaderboardName}>{entry.user.name}</ThemedText>
                <ThemedText variant="tertiary" style={styles.leaderboardValue}>{formatResultValue(entry.value)}</ThemedText>
                <ResultReactions
                  resultId={entry.id}
                  onCommentPress={() =>
                    navigation.navigate('WodResultDetail', {
                      entry,
                      workoutTitle: workout.title,
                    })
                  }
                />
              </View>
              <ThemedText variant="tertiary" style={styles.leaderboardLevel}>{LEVEL_LABELS[entry.level]}</ThemedText>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
    </ThemedView>

    {showPlanModal && planTarget && workout && (
      <WorkoutPlanModal
        visible={showPlanModal}
        workout={workout}
        targetUser={planTarget}
        existingPlan={
          planTarget.id === user?.id
            ? (myPlan ?? undefined)
            : (memberPlans.find((p) => p.userId === planTarget.id) ?? undefined)
        }
        onClose={() => { setShowPlanModal(false); setPlanTarget(null) }}
        onSaved={(plan) => {
          setShowPlanModal(false)
          setPlanTarget(null)
          if (plan.userId === user?.id) {
            setMyPlan(plan)
          } else {
            setMemberPlans((prev) => {
              const idx = prev.findIndex((p) => p.userId === plan.userId)
              return idx >= 0 ? prev.map((p, i) => i === idx ? plan : p) : [...prev, plan]
            })
          }
        }}
        onDeleted={() => {
          const deletedId = planTarget.id
          setShowPlanModal(false)
          setPlanTarget(null)
          if (deletedId === user?.id) {
            setMyPlan(null)
          } else {
            setMemberPlans((prev) => prev.filter((p) => p.userId !== deletedId))
          }
        }}
      />
    )}
    </>
  )
}

const styles = StyleSheet.create({
  headerEditBtn: { paddingHorizontal: 12, paddingVertical: 6, marginRight: 4 },
  headerEditText: { fontSize: 15, fontWeight: '600' },
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 15,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  typeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  typeBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dateText: {
    fontSize: 13,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
  },
  sourceLink: {
    marginHorizontal: 20,
    marginTop: 12,
  },
  sourceLinkText: {
    fontSize: 13,
  },
  coachNotesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  coachNotesLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  coachNotesChevron: {
    fontSize: 18,
    fontWeight: '600',
    paddingHorizontal: 6,
  },
  coachNotesBody: {
    fontSize: 15,
    lineHeight: 22,
  },
  logButton: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  resultBadge: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultBadgeLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  resultBadgeValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  resultBadgeLevel: {
    fontSize: 12,
  },
  filterRow: {
    marginBottom: 12,
  },
  filterContent: {
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
  },
  emptyLeaderboard: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  leaderboardRowHighlight: {
    borderRadius: 8,
    paddingHorizontal: 8,
    marginHorizontal: -8,
  },
  rank: {
    width: 28,
    fontSize: 14,
    fontWeight: '700',
  },
  leaderboardInfo: {
    flex: 1,
  },
  leaderboardName: {
    fontSize: 14,
    fontWeight: '600',
  },
  leaderboardValue: {
    fontSize: 12,
    marginTop: 1,
  },
  leaderboardLevel: {
    fontSize: 12,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  planEditBtn: {
    fontSize: 13,
  },
  planCard: {
    borderRadius: 8,
    padding: 12,
    gap: 6,
  },
  planLevelBadge: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 2,
  },
  planLevelText: {
    fontSize: 12,
    fontWeight: '600',
  },
  planMovementRow: {
    fontSize: 14,
    lineHeight: 20,
  },
  planMovementName: {
    fontWeight: '600',
  },
  planMovementLabel: {
    fontSize: 13,
  },
  planNotes: {
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 2,
  },
  planEmpty: {
    fontSize: 14,
  },
  memberPlanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  memberPlanInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  memberPlanName: {
    fontSize: 14,
    fontWeight: '600',
  },
  memberPlanEdit: {
    fontSize: 13,
  },
})
