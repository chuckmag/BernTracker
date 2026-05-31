import { ScrollView, View, Text, StyleSheet } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { useTheme } from '../lib/theme'
import { formatResultValue, describeSet } from '../lib/format'
import ResultReactions from '../components/ResultReactions'
import CommentThread from '../components/CommentThread'
import MarkdownText from '../components/MarkdownText'
const LEVEL_LABELS: Record<string, string> = {
  RX_PLUS: 'RX+',
  RX: 'RX',
  SCALED: 'Scaled',
  MODIFIED: 'Modified',
}

type Props = StackScreenProps<RootStackParamList, 'WodResultDetail'>

export default function WodResultDetailScreen({ route }: Props) {
  const { entry } = route.params
  const { colors } = useTheme()
  const movementResults = (entry.value.movementResults ?? []).filter(
    (mr) => (mr.sets?.length ?? 0) > 0,
  )

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.screenBg }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Result card */}
      <View style={[styles.resultCard, { backgroundColor: colors.cardBg, borderColor: colors.borderSubtle }]}>
        <Text style={[styles.athleteName, { color: colors.textPrimary }]}>{entry.user.name}</Text>
        <View style={styles.scoreRow}>
          <Text style={[styles.score, { color: colors.textPrimary }]}>
            {formatResultValue(entry.value)}
          </Text>
          <View style={[styles.levelBadge, { backgroundColor: colors.borderInteractive }]}>
            <Text style={[styles.levelText, { color: colors.textSecondary }]}>
              {LEVEL_LABELS[entry.level] ?? entry.level}
            </Text>
          </View>
        </View>

        {movementResults.length > 0 && (
          <View style={styles.movementsSection}>
            {movementResults.map((mr, mIdx) => (
              <View key={mr.workoutMovementId ?? mIdx} style={styles.movementBlock}>
                <Text style={[styles.movementLabel, { color: colors.textTertiary }]}>
                  {`Movement ${mIdx + 1}`}
                </Text>
                {(mr.sets ?? []).map((set, sIdx) => (
                  <View key={sIdx} style={styles.setRow}>
                    <Text style={[styles.setIndex, { color: colors.textTertiary }]}>
                      {`Set ${sIdx + 1}`}
                    </Text>
                    <Text style={[styles.setDetail, { color: colors.textPrimary }]}>
                      {describeSet(set, mr.loadUnit, mr.distanceUnit)}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {entry.notes ? (
          <View style={styles.notes}>
            <MarkdownText source={entry.notes} variant="tertiary" />
          </View>
        ) : null}

        {/* Reactions inline on the result card */}
        <ResultReactions resultId={entry.id} />
      </View>

      {/* Comment thread */}
      <View style={[styles.commentSection, { backgroundColor: colors.cardBg, borderColor: colors.borderSubtle }]}>
        <CommentThread resultId={entry.id} />
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  resultCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  athleteName: {
    fontSize: 18,
    fontWeight: '700',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  score: {
    fontSize: 24,
    fontWeight: '700',
  },
  levelBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  levelText: {
    fontSize: 12,
    fontWeight: '600',
  },
  movementsSection: {
    marginTop: 4,
    gap: 10,
  },
  movementBlock: {
    gap: 4,
  },
  movementLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  setIndex: {
    fontSize: 12,
    fontFamily: 'monospace',
    width: 42,
  },
  setDetail: {
    fontSize: 14,
    fontFamily: 'monospace',
    flex: 1,
  },
  notes: {
    marginTop: 4,
  },
  commentSection: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
})
