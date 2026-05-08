import { ScrollView, View, Text, StyleSheet } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { useTheme } from '../lib/theme'
import { formatResultValue } from '../lib/format'
import ResultReactions from '../components/ResultReactions'
import CommentThread from '../components/CommentThread'
import { useAuth } from '../context/AuthContext'

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
  const { user } = useAuth()
  const currentUserId = user?.id ?? ''

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
        {entry.notes ? (
          <Text style={[styles.notes, { color: colors.textTertiary }]}>{entry.notes}</Text>
        ) : null}

        {/* Reactions inline on the result card */}
        <ResultReactions
          resultId={entry.id}
          currentUserId={currentUserId}
        />
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
  notes: {
    fontSize: 14,
    lineHeight: 20,
  },
  commentSection: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
})
