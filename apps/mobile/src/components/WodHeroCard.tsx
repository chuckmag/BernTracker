import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { styleFor } from '../lib/workoutTypeStyles'
import { formatResultValue } from '../lib/format'
import type { DashboardToday } from '../lib/api'
import { useTheme } from '../lib/theme'
import ThemedText from './ThemedText'
import ThemedView from './ThemedView'

type Nav = StackNavigationProp<RootStackParamList>

const LEVEL_LABELS: Record<string, string> = {
  RX_PLUS: 'RX+',
  RX: 'RX',
  SCALED: 'Scaled',
  MODIFIED: 'Modified',
}

function formatCap(seconds: number): string {
  const m = Math.floor(seconds / 60)
  return `${m} min cap`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

type Props = {
  data: DashboardToday
}

export default function WodHeroCard({ data }: Props) {
  const { colors } = useTheme()
  const nav = useNavigation<Nav>()
  const { workout, myResult, leaderboard, gymMemberCount, programSubscriberCount = 0, isHeroWorkoutGymAffiliated = true } = data

  if (!workout) {
    return (
      <ThemedView variant="card" style={[styles.card, { borderColor: colors.borderSubtle }]}>
        <ThemedText variant="secondary" style={styles.emptyTitle}>No workout today</ThemedText>
        <ThemedText variant="tertiary" style={styles.emptyBody}>Your program doesn't have a workout scheduled for today.</ThemedText>
      </ThemedView>
    )
  }

  const ts = styleFor(workout.type)
  const scored = myResult ? formatResultValue(myResult.value as Parameters<typeof formatResultValue>[0]) : null
  const levelLabel = myResult ? (LEVEL_LABELS[myResult.level] ?? myResult.level) : null

  function goToWod() {
    nav.navigate('WodDetail', { workoutId: workout!.id })
  }

  return (
    <ThemedView variant="card" style={[styles.card, { borderColor: colors.borderSubtle }]}>
      {/* Accent strip */}
      <View style={[styles.accentStrip, { backgroundColor: ts.accentBar }]} />

      {/* Header */}
      <View style={styles.headerRow}>
        <ThemedText variant="tertiary" style={styles.dateLabel}>TODAY</ThemedText>
        <View style={[styles.typeBadge, { backgroundColor: ts.bgTint }]}>
          <ThemedText style={[styles.typeBadgeText, { color: ts.tint }]}>{ts.abbr}</ThemedText>
        </View>
        {workout.namedWorkout?.category === 'BENCHMARK' && (
          <View style={[styles.benchmarkBadge, { backgroundColor: `${colors.primary}33` }]}>
            <ThemedText style={[styles.benchmarkBadgeText, { color: colors.primary }]}>BENCHMARK</ThemedText>
          </View>
        )}
      </View>

      {/* Title */}
      <TouchableOpacity onPress={goToWod} activeOpacity={0.7}>
        <ThemedText style={styles.title}>{workout.title}</ThemedText>
      </TouchableOpacity>

      {workout.timeCapSeconds ? (
        <ThemedText variant="tertiary" style={styles.cap}>{formatCap(workout.timeCapSeconds)}</ThemedText>
      ) : null}

      {workout.program ? (
        <ThemedText variant="tertiary" style={styles.program}>via {workout.program.name}</ThemedText>
      ) : null}

      {/* Result or CTAs */}
      <View style={styles.resultRow}>
        {myResult ? (
          <View style={[styles.resultCard, { backgroundColor: colors.borderSubtle, borderColor: colors.borderInteractive }]}>
            <ThemedText style={[styles.loggedLabel, { color: colors.successText }]}>
              ✓ Logged · {formatTime(myResult.createdAt)}
            </ThemedText>
            <View style={styles.scoreRow}>
              <ThemedText style={styles.score}>{scored ?? '—'}</ThemedText>
              {levelLabel ? <ThemedText style={[styles.level, { color: colors.primary }]}>{levelLabel}</ThemedText> : null}
              {leaderboard?.rank ? (
                <ThemedText variant="tertiary" style={styles.rank}>#{leaderboard.rank}/{leaderboard.totalLogged}</ThemedText>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.ctaRow}>
            <TouchableOpacity
              style={[styles.ctaPrimary, { backgroundColor: colors.primary }]}
              onPress={goToWod}
              activeOpacity={0.8}
            >
              <ThemedText style={[styles.ctaPrimaryText, { color: colors.onPrimary }]}>Start workout</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ctaSecondary, { backgroundColor: colors.borderSubtle, borderColor: colors.borderInteractive }]}
              onPress={goToWod}
              activeOpacity={0.8}
            >
              <ThemedText variant="secondary" style={styles.ctaSecondaryText}>Log result</ThemedText>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Details tap-through */}
      <TouchableOpacity onPress={goToWod} activeOpacity={0.7} style={styles.detailsLink}>
        <ThemedText style={[styles.detailsLinkText, { color: colors.primary }]}>View workout details →</ThemedText>
      </TouchableOpacity>

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: colors.borderSubtle }]}>
        <ThemedText variant="tertiary" style={styles.footerText}>
          <ThemedText style={styles.footerCount}>{leaderboard?.totalLogged ?? 0}</ThemedText>
          {isHeroWorkoutGymAffiliated
            ? (gymMemberCount > 0 ? ` of ${gymMemberCount} member${gymMemberCount !== 1 ? 's' : ''}` : ' member') + ' logged today'
            : (programSubscriberCount > 0 ? ` of ${programSubscriberCount} subscriber${programSubscriberCount !== 1 ? 's' : ''}` : ' subscriber') + ' logged today'}
        </ThemedText>
        <TouchableOpacity onPress={goToWod} activeOpacity={0.7}>
          <ThemedText style={[styles.boardLink, { color: colors.primary }]}>Leaderboard →</ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 4,
  },
  accentStrip: {
    height: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    flexWrap: 'wrap',
  },
  dateLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  benchmarkBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  benchmarkBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 30,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  cap: {
    fontSize: 13,
    paddingHorizontal: 16,
    marginBottom: 2,
  },
  program: {
    fontSize: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  resultRow: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  resultCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  loggedLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  score: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  level: {
    fontSize: 12,
    fontWeight: '700',
  },
  rank: {
    fontSize: 12,
    marginLeft: 'auto',
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  ctaPrimary: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  ctaPrimaryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  ctaSecondary: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
  },
  ctaSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  detailsLink: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  detailsLinkText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  footerText: {
    fontSize: 13,
  },
  footerCount: {
    fontWeight: '600',
  },
  boardLink: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    padding: 20,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13,
    paddingHorizontal: 20,
    paddingBottom: 20,
    textAlign: 'center',
  },
})
