import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { styleFor } from '../lib/workoutTypeStyles'
import { formatResultValue } from '../lib/format'
import type { DashboardToday } from '../lib/api'

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
  const nav = useNavigation<Nav>()
  const { workout, myResult, leaderboard, gymMemberCount, programSubscriberCount = 0, isHeroWorkoutGymAffiliated = true } = data

  if (!workout) {
    return (
      <View style={styles.card}>
        <Text style={styles.emptyTitle}>No workout today</Text>
        <Text style={styles.emptyBody}>Your program doesn't have a workout scheduled for today.</Text>
      </View>
    )
  }

  const ts = styleFor(workout.type)
  const scored = myResult ? formatResultValue(myResult.value as Parameters<typeof formatResultValue>[0]) : null
  const levelLabel = myResult ? (LEVEL_LABELS[myResult.level] ?? myResult.level) : null

  function goToWod() {
    nav.navigate('WodDetail', { workoutId: workout!.id })
  }

  return (
    <View style={styles.card}>
      {/* Accent strip */}
      <View style={[styles.accentStrip, { backgroundColor: ts.accentBar }]} />

      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.dateLabel}>TODAY</Text>
        <View style={[styles.typeBadge, { backgroundColor: ts.bgTint }]}>
          <Text style={[styles.typeBadgeText, { color: ts.tint }]}>{ts.abbr}</Text>
        </View>
        {workout.namedWorkout?.category === 'BENCHMARK' && (
          <View style={styles.benchmarkBadge}>
            <Text style={styles.benchmarkBadgeText}>BENCHMARK</Text>
          </View>
        )}
      </View>

      {/* Title */}
      <TouchableOpacity onPress={goToWod} activeOpacity={0.7}>
        <Text style={styles.title}>{workout.title}</Text>
      </TouchableOpacity>

      {workout.timeCapSeconds ? (
        <Text style={styles.cap}>{formatCap(workout.timeCapSeconds)}</Text>
      ) : null}

      {workout.program ? (
        <Text style={styles.program}>via {workout.program.name}</Text>
      ) : null}

      {/* Result or CTAs */}
      <View style={styles.resultRow}>
        {myResult ? (
          <View style={styles.resultCard}>
            <Text style={styles.loggedLabel}>✓ Logged · {formatTime(myResult.createdAt)}</Text>
            <View style={styles.scoreRow}>
              <Text style={styles.score}>{scored ?? '—'}</Text>
              {levelLabel ? <Text style={styles.level}>{levelLabel}</Text> : null}
              {leaderboard?.rank ? (
                <Text style={styles.rank}>#{leaderboard.rank}/{leaderboard.totalLogged}</Text>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.ctaRow}>
            <TouchableOpacity style={styles.ctaPrimary} onPress={goToWod} activeOpacity={0.8}>
              <Text style={styles.ctaPrimaryText}>Start workout</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ctaSecondary} onPress={goToWod} activeOpacity={0.8}>
              <Text style={styles.ctaSecondaryText}>Log result</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Details tap-through */}
      <TouchableOpacity onPress={goToWod} activeOpacity={0.7} style={styles.detailsLink}>
        <Text style={styles.detailsLinkText}>View workout details →</Text>
      </TouchableOpacity>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          <Text style={styles.footerCount}>{leaderboard?.totalLogged ?? 0}</Text>
          {isHeroWorkoutGymAffiliated
            ? (gymMemberCount > 0 ? ` of ${gymMemberCount} member${gymMemberCount !== 1 ? 's' : ''}` : ' member') + ' logged today'
            : (programSubscriberCount > 0 ? ` of ${programSubscriberCount} subscriber${programSubscriberCount !== 1 ? 's' : ''}` : ' subscriber') + ' logged today'}
        </Text>
        <TouchableOpacity onPress={goToWod} activeOpacity={0.7}>
          <Text style={styles.boardLink}>Leaderboard →</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
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
    color: '#6b7280',
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
    backgroundColor: 'rgba(99,102,241,0.15)',
  },
  benchmarkBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#a5b4fc',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.5,
    lineHeight: 30,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  cap: {
    fontSize: 13,
    color: '#9ca3af',
    paddingHorizontal: 16,
    marginBottom: 2,
  },
  program: {
    fontSize: 12,
    color: '#6b7280',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  resultRow: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  resultCard: {
    backgroundColor: 'rgba(55,65,81,0.5)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    padding: 12,
  },
  loggedLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#34d399',
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
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  level: {
    fontSize: 12,
    fontWeight: '700',
    color: '#818cf8',
  },
  rank: {
    fontSize: 12,
    color: '#9ca3af',
    marginLeft: 'auto',
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  ctaPrimary: {
    flex: 1,
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  ctaPrimaryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  ctaSecondary: {
    flex: 1,
    backgroundColor: '#1f2937',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  ctaSecondaryText: {
    color: '#d1d5db',
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
    color: '#818cf8',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  footerText: {
    fontSize: 13,
    color: '#6b7280',
  },
  footerCount: {
    color: '#ffffff',
    fontWeight: '600',
  },
  boardLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#818cf8',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#d1d5db',
    padding: 20,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13,
    color: '#6b7280',
    paddingHorizontal: 20,
    paddingBottom: 20,
    textAlign: 'center',
  },
})
