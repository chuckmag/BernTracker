import { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useTheme } from '../lib/theme'
import { useAuth } from '../context/AuthContext'
import { api, type Comment } from '../lib/api'

function initials(firstName: string | null, lastName: string | null): string {
  const f = firstName?.trim()[0]?.toUpperCase() ?? ''
  const l = lastName?.trim()[0]?.toUpperCase() ?? ''
  return (f + l) || '?'
}

function displayName(user: { firstName: string | null; lastName: string | null } | null): string {
  if (!user) return 'Deleted'
  const parts = [user.firstName, user.lastName].filter(Boolean)
  return parts.join(' ') || 'User'
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

interface AvatarProps {
  user: { firstName: string | null; lastName: string | null } | null
  size?: number
}

function Avatar({ user, size = 32 }: AvatarProps) {
  const { colors } = useTheme()
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.borderInteractive,
        },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.35 }]}>
        {initials(user?.firstName ?? null, user?.lastName ?? null)}
      </Text>
    </View>
  )
}

interface CommentRowProps {
  comment: Comment
  currentUserId: string
  onEdit: (id: string, body: string) => void
  onDelete: (id: string) => void
  indent?: boolean
}

function CommentRow({ comment, currentUserId, onEdit, onDelete, indent }: CommentRowProps) {
  const { colors } = useTheme()
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(comment.body ?? '')
  const [saving, setSaving] = useState(false)
  const isOwn = comment.user?.id === currentUserId
  const isDeleted = !!comment.deletedAt

  async function saveEdit() {
    if (!editText.trim() || saving) return
    setSaving(true)
    try {
      const updated = await api.social.comments.edit(comment.id, editText.trim())
      onEdit(comment.id, updated.body ?? editText.trim())
      setEditing(false)
    } catch {
      Alert.alert('Error', 'Could not save edit. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete() {
    Alert.alert('Delete comment', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.social.comments.remove(comment.id)
            onDelete(comment.id)
          } catch {
            Alert.alert('Error', 'Could not delete comment.')
          }
        },
      },
    ])
  }

  return (
    <View style={[styles.commentRow, indent && styles.commentRowIndent]}>
      <Avatar user={isDeleted ? null : comment.user} />
      <View style={styles.commentBody}>
        <View style={styles.commentMeta}>
          <Text style={[styles.authorName, { color: colors.textPrimary }]}>
            {isDeleted ? 'Deleted' : displayName(comment.user)}
          </Text>
          <Text style={[styles.timestamp, { color: colors.textTertiary }]}>
            {timeAgo(comment.createdAt)}
          </Text>
        </View>

        {isDeleted ? (
          <Text style={[styles.deletedText, { color: colors.textTertiary }]}>[deleted]</Text>
        ) : editing ? (
          <View style={[styles.editContainer, { borderColor: colors.borderInteractive }]}>
            <TextInput
              style={[styles.editInput, { color: colors.textPrimary, backgroundColor: colors.inputBg }]}
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
            />
            <View style={styles.editActions}>
              <TouchableOpacity onPress={() => setEditing(false)}>
                <Text style={[styles.editCancel, { color: colors.textTertiary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveEdit} disabled={saving}>
                <Text style={[styles.editSave, { color: colors.primary }]}>
                  {saving ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Text style={[styles.commentText, { color: colors.textSecondary }]}>{comment.body}</Text>
        )}

        {!isDeleted && isOwn && !editing && (
          <View style={styles.ownActions}>
            <TouchableOpacity onPress={() => { setEditText(comment.body ?? ''); setEditing(true) }}>
              <Text style={[styles.actionLink, { color: colors.textTertiary }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmDelete}>
              <Text style={[styles.actionLink, { color: colors.errorText }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  )
}

interface Props {
  resultId: string
}

export default function CommentThread({ resultId }: Props) {
  const { colors } = useTheme()
  const { user } = useAuth()
  const [comments, setComments] = useState<Comment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [compose, setCompose] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const scrollRef = useRef<ScrollView>(null)

  useEffect(() => {
    api.social.comments.list(resultId, 1)
      .then((page) => {
        setComments(page.comments)
        setTotal(page.total)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [resultId])

  async function submit() {
    const body = compose.trim()
    if (!body || submitting) return
    setSubmitting(true)
    try {
      const raw = await api.social.comments.create(resultId, body)
      const comment: Comment = {
        ...raw,
        reactions: raw.reactions ?? [],
        replies: raw.replies ?? [],
        replyCount: raw.replyCount ?? 0,
        user: raw.user ?? {
          id: user?.id ?? '',
          firstName: user?.firstName ?? null,
          lastName: user?.lastName ?? null,
          avatarUrl: null,
        },
      }
      setComments((prev) => [comment, ...prev])
      setTotal((t) => t + 1)
      setCompose('')
    } catch {
      Alert.alert('Error', 'Could not post comment. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleEdit(id: string, body: string) {
    setComments((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, body }
          : {
              ...c,
              replies: c.replies.map((r) => (r.id === id ? { ...r, body } : r)),
            },
      ),
    )
  }

  function handleDelete(id: string) {
    setComments((prev) => {
      // If it's a top-level comment, soft-delete it in place so reply count is preserved
      const isTop = prev.some((c) => c.id === id)
      if (isTop) {
        return prev.map((c) =>
          c.id === id
            ? { ...c, body: null, user: null, deletedAt: new Date().toISOString() }
            : c,
        )
      }
      return prev.map((c) => ({
        ...c,
        replies: c.replies.filter((r) => r.id !== id),
      }))
    })
    setTotal((t) => t - 1)
  }

  const currentUserId = user?.id ?? ''

  return (
    <View style={styles.container}>
      {/* Header */}
      <Text style={[styles.heading, { color: colors.textPrimary }]}>
        Comments{total > 0 ? ` (${total})` : ''}
      </Text>

      {/* Compose */}
      <View style={[styles.composeRow, { borderColor: colors.borderInteractive }]}>
        <TextInput
          style={[styles.composeInput, { color: colors.textPrimary, backgroundColor: colors.inputBg }]}
          placeholder="Add a comment…"
          placeholderTextColor={colors.textPlaceholder}
          value={compose}
          onChangeText={setCompose}
          multiline
          maxLength={2000}
          testID="compose-input"
        />
        <TouchableOpacity
          style={[styles.postBtn, { backgroundColor: colors.primary }]}
          onPress={submit}
          disabled={submitting || !compose.trim()}
          activeOpacity={0.8}
          testID="post-button"
        >
          <Text style={styles.postBtnText}>{submitting ? '…' : 'Post'}</Text>
        </TouchableOpacity>
      </View>

      {/* Thread */}
      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.textTertiary} />
      ) : comments.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textTertiary }]}>
          No comments yet. Be the first!
        </Text>
      ) : (
        <View style={styles.thread}>
          {comments.map((c) => (
            <View key={c.id}>
              <CommentRow
                comment={c}
                currentUserId={currentUserId}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
              {(c.replies ?? []).map((r) => (
                <CommentRow
                  key={r.id}
                  comment={r}
                  currentUserId={currentUserId}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  indent
                />
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0,
  },
  heading: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  composeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 16,
  },
  composeInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 42,
    maxHeight: 120,
  },
  postBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'stretch',
    justifyContent: 'center',
    minWidth: 52,
  },
  postBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  loader: {
    marginVertical: 16,
  },
  empty: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },
  thread: {
    gap: 0,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
  },
  commentRowIndent: {
    paddingLeft: 42,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  commentBody: {
    flex: 1,
    gap: 3,
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  authorName: {
    fontSize: 13,
    fontWeight: '600',
  },
  timestamp: {
    fontSize: 11,
  },
  commentText: {
    fontSize: 14,
    lineHeight: 20,
  },
  deletedText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  ownActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
  },
  actionLink: {
    fontSize: 12,
    fontWeight: '500',
  },
  editContainer: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 4,
  },
  editInput: {
    padding: 8,
    fontSize: 14,
    minHeight: 60,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    padding: 8,
  },
  editCancel: {
    fontSize: 13,
  },
  editSave: {
    fontSize: 13,
    fontWeight: '600',
  },
})
