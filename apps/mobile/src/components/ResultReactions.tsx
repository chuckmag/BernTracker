import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { useTheme } from '../lib/theme'
import { api, type ReactionSummary } from '../lib/api'

const ALLOWED_EMOJIS = ['🔥', '💪', '👏', '🎉', '😂', '❤️']

interface Props {
  resultId: string
  onCommentPress?: () => void
  commentCount?: number
}

export default function ResultReactions({ resultId, onCommentPress, commentCount }: Props) {
  const { colors } = useTheme()
  const [reactions, setReactions] = useState<ReactionSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.social.reactions.listForResult(resultId)
      .then(setReactions)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [resultId])

  async function toggle(emoji: string) {
    const existing = reactions.find((r) => r.emoji === emoji)
    const userReacted = existing?.userReacted ?? false

    setReactions((prev) => {
      const idx = prev.findIndex((r) => r.emoji === emoji)
      if (userReacted) {
        if (idx === -1) return prev
        const updated = [...prev]
        const cur = updated[idx]
        updated[idx] = { ...cur, count: cur.count - 1, userReacted: false }
        return updated
      }
      if (idx === -1) return [...prev, { emoji, count: 1, userReacted: true }]
      const updated = [...prev]
      const cur = updated[idx]
      updated[idx] = { ...cur, count: cur.count + 1, userReacted: true }
      return updated
    })

    try {
      if (userReacted) {
        await api.social.reactions.removeFromResult(resultId, emoji)
      } else {
        await api.social.reactions.addToResult(resultId, emoji)
      }
    } catch {
      api.social.reactions.listForResult(resultId).then(setReactions).catch(() => {})
    }
  }

  const pillData = ALLOWED_EMOJIS.map((emoji) => {
    const found = reactions.find((r) => r.emoji === emoji)
    return { emoji, count: found?.count ?? 0, userReacted: found?.userReacted ?? false }
  })

  if (loading) {
    return (
      <View style={styles.row}>
        <ActivityIndicator size="small" color={colors.textTertiary} />
      </View>
    )
  }

  return (
    <View style={styles.row}>
      {pillData.map(({ emoji, count, userReacted }) => (
        <TouchableOpacity
          key={emoji}
          style={[
            styles.pill,
            {
              borderColor: userReacted ? colors.accent : colors.borderInteractive,
              backgroundColor: userReacted ? colors.accent + '22' : colors.cardBg,
            },
          ]}
          onPress={() => toggle(emoji)}
          activeOpacity={0.7}
          accessibilityLabel={`React with ${emoji}, ${count} reaction${count === 1 ? '' : 's'}`}
          accessibilityRole="button"
          accessibilityState={{ selected: userReacted }}
        >
          <Text style={styles.emoji}>{emoji}</Text>
          {count > 0 && (
            <Text style={[styles.count, { color: userReacted ? colors.accent : colors.textTertiary }]}>
              {count}
            </Text>
          )}
        </TouchableOpacity>
      ))}
      {onCommentPress !== undefined && (
        <TouchableOpacity
          style={[styles.pill, { borderColor: colors.borderInteractive, backgroundColor: colors.cardBg }]}
          onPress={onCommentPress}
          activeOpacity={0.7}
          accessibilityLabel={`${commentCount ?? 0} comment${(commentCount ?? 0) === 1 ? '' : 's'}, tap to view`}
          accessibilityRole="button"
        >
          <Text style={styles.emoji}>💬</Text>
          {(commentCount ?? 0) > 0 && (
            <Text style={[styles.count, { color: colors.textTertiary }]}>{commentCount}</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 6,
    minHeight: 34,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  emoji: {
    fontSize: 14,
  },
  count: {
    fontSize: 12,
    fontWeight: '600',
  },
})
