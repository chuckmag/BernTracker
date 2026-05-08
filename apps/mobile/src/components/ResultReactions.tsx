import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { useTheme } from '../lib/theme'
import { api, type ReactionSummary } from '../lib/api'

// Must match ALLOWED_EMOJIS in apps/api/src/db/reactionDbManager.ts
const ALLOWED_EMOJIS = ['👍', '❤️', '🔥', '💪', '🎉', '😂']

interface Props {
  resultId: string
  onCommentPress?: () => void
  commentCount?: number
}

export default function ResultReactions({ resultId, onCommentPress, commentCount }: Props) {
  const { colors } = useTheme()
  const [reactions, setReactions] = useState<ReactionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)

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

  const activeReactions = reactions.filter((r) => r.count > 0)

  if (loading) {
    return (
      <View style={styles.row}>
        <ActivityIndicator size="small" color={colors.textTertiary} />
      </View>
    )
  }

  return (
    <View>
      <View style={styles.row}>
        {activeReactions.map(({ emoji, count, userReacted }) => (
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
            accessibilityLabel={`${emoji} ${count} reaction${count === 1 ? '' : 's'}, tap to ${userReacted ? 'remove' : 'add'}`}
            accessibilityRole="button"
            accessibilityState={{ selected: userReacted }}
          >
            <Text style={styles.emoji}>{emoji}</Text>
            <Text style={[styles.count, { color: userReacted ? colors.accent : colors.textTertiary }]}>
              {count}
            </Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[
            styles.addButton,
            {
              borderColor: colors.borderInteractive,
              backgroundColor: pickerOpen ? colors.borderInteractive + '60' : 'transparent',
            },
          ]}
          onPress={() => setPickerOpen((o) => !o)}
          activeOpacity={0.7}
          accessibilityLabel="Add reaction"
          accessibilityRole="button"
          accessibilityState={{ expanded: pickerOpen }}
        >
          <Text style={[styles.addIcon, { color: colors.textTertiary }]}>😊</Text>
        </TouchableOpacity>

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

      {pickerOpen && (
        <View style={[styles.picker, { backgroundColor: colors.cardBg, borderColor: colors.borderInteractive }]}>
          {ALLOWED_EMOJIS.map((emoji) => {
            const active = reactions.find((r) => r.emoji === emoji)?.userReacted ?? false
            return (
              <TouchableOpacity
                key={emoji}
                style={[
                  styles.pickerBtn,
                  active && { backgroundColor: colors.accent + '22' },
                ]}
                onPress={() => {
                  toggle(emoji)
                  setPickerOpen(false)
                }}
                activeOpacity={0.7}
                accessibilityLabel={`React with ${emoji}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={styles.pickerEmoji}>{emoji}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
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
  addButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIcon: {
    fontSize: 14,
  },
  picker: {
    flexDirection: 'row',
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    padding: 6,
    gap: 2,
    alignSelf: 'flex-start',
  },
  pickerBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerEmoji: {
    fontSize: 20,
  },
})
