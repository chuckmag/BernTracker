import { useState, useEffect, useRef } from 'react'
import { api, type Comment, type ReactionSummary } from '../lib/api.ts'

const ALLOWED_EMOJIS = ['👍', '❤️', '🔥', '💪', '🎉', '😂'] as const

interface CommentThreadProps {
  resultId: string
  currentUserId: string
}

export default function CommentThread({ resultId, currentUserId }: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [compose, setCompose] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setLoading(true)
    setComments([])
    setPage(1)
    api.social.comments.list(resultId, 1)
      .then((data) => {
        setComments(data.comments)
        setTotal(data.total)
        setPages(data.pages)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [resultId])

  async function loadMore() {
    const next = page + 1
    setLoadingMore(true)
    try {
      const data = await api.social.comments.list(resultId, next)
      setComments((prev) => [...prev, ...data.comments])
      setPage(next)
      setPages(data.pages)
      setTotal(data.total)
    } catch {
      // ignore
    } finally {
      setLoadingMore(false)
    }
  }

  async function submitComment() {
    const body = compose.trim()
    if (!body || submitting) return
    setSubmitting(true)
    try {
      const raw = await api.social.comments.create(resultId, body)
      const comment = { reactions: [], replies: [], replyCount: 0, ...raw }
      setComments((prev) => [comment, ...prev])
      setTotal((t) => t + 1)
      setCompose('')
    } catch {
      // ignore — user can retry
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">
          Comments
          {total > 0 && <span className="ml-1.5 font-normal normal-case tracking-normal text-slate-400 dark:text-gray-500">({total})</span>}
        </h2>
        <hr className="flex-1 border-slate-200 dark:border-gray-800" />
      </div>

      {/* Compose box */}
      <div className="flex gap-2 items-end">
        <textarea
          value={compose}
          onChange={(e) => setCompose(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submitComment()
            }
          }}
          placeholder="Add a comment…"
          rows={2}
          className="flex-1 resize-none rounded-lg border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={submitComment}
          disabled={!compose.trim() || submitting}
          className="shrink-0 px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 hover:bg-primary-hover transition-colors"
        >
          Post
        </button>
      </div>

      {/* Thread */}
      {loading && (
        <p className="text-sm text-slate-500 dark:text-gray-400">Loading…</p>
      )}
      {!loading && comments.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-gray-400">No comments yet. Be the first!</p>
      )}
      <div className="space-y-4">
        {comments.map((comment) => (
          <CommentThreadItem
            key={comment.id}
            comment={comment}
            currentUserId={currentUserId}
            onUpdate={(updated) =>
              setComments((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
            }
            onDelete={(id) => {
              setComments((prev) =>
                prev.map((c) =>
                  c.id === id ? { ...c, body: null, user: null, deletedAt: new Date().toISOString() } : c,
                ),
              )
              setTotal((t) => Math.max(0, t - 1))
            }}
          />
        ))}
      </div>
      {page < pages && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full text-sm text-primary hover:opacity-80 transition-opacity disabled:opacity-50 py-1"
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}

// ─── CommentThreadItem ─────────────────────────────────────────────────────────

interface CommentThreadItemProps {
  comment: Comment
  currentUserId: string
  onUpdate: (comment: Comment) => void
  onDelete: (id: string) => void
}

function CommentThreadItem({ comment, currentUserId, onUpdate, onDelete }: CommentThreadItemProps) {
  const [showReplyForm, setShowReplyForm] = useState(false)
  const [replies, setReplies] = useState<Comment[]>(comment.replies ?? [])

  useEffect(() => {
    setReplies(comment.replies ?? [])
  }, [comment.replies])

  async function submitReply(body: string) {
    const raw = await api.social.comments.reply(comment.id, body)
    const reply = { reactions: [], replies: [], replyCount: 0, ...raw }
    setReplies((prev) => [...prev, reply])
    setShowReplyForm(false)
  }

  return (
    <div>
      <CommentRow
        comment={comment}
        currentUserId={currentUserId}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onReplyClick={() => setShowReplyForm((o) => !o)}
        isTopLevel
      />

      {replies.length > 0 && (
        <div className="ml-9 mt-3 space-y-3 border-l-2 border-slate-100 dark:border-gray-800 pl-3">
          {replies.map((reply) => (
            <CommentRow
              key={reply.id}
              comment={reply}
              currentUserId={currentUserId}
              onUpdate={(updated) =>
                setReplies((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
              }
              onDelete={(id) =>
                setReplies((prev) =>
                  prev.map((r) =>
                    r.id === id ? { ...r, body: null, user: null, deletedAt: new Date().toISOString() } : r,
                  ),
                )
              }
              isTopLevel={false}
            />
          ))}
        </div>
      )}

      {showReplyForm && (
        <div className="ml-9 mt-2 pl-3 border-l-2 border-slate-100 dark:border-gray-800">
          <InlineComposeBox
            placeholder="Write a reply…"
            onSubmit={submitReply}
            onCancel={() => setShowReplyForm(false)}
          />
        </div>
      )}
    </div>
  )
}

// ─── CommentRow ────────────────────────────────────────────────────────────────

interface CommentRowProps {
  comment: Comment
  currentUserId: string
  onUpdate: (comment: Comment) => void
  onDelete: (id: string) => void
  onReplyClick?: () => void
  isTopLevel: boolean
}

function CommentRow({ comment, currentUserId, onUpdate, onDelete, onReplyClick, isTopLevel }: CommentRowProps) {
  const [editing, setEditing] = useState(false)
  const isDeleted = comment.deletedAt !== null
  const isOwner = comment.user?.id === currentUserId

  async function submitEdit(body: string) {
    const updated = await api.social.comments.edit(comment.id, body)
    onUpdate(updated)
    setEditing(false)
  }

  async function handleDelete() {
    await api.social.comments.remove(comment.id)
    onDelete(comment.id)
  }

  const displayName = comment.user
    ? [comment.user.firstName, comment.user.lastName].filter(Boolean).join(' ') || 'Unknown'
    : 'Deleted'

  const initials = comment.user
    ? ((comment.user.firstName?.[0] ?? '') + (comment.user.lastName?.[0] ?? '')).toUpperCase() || '?'
    : '?'

  return (
    <div className="flex gap-2">
      {/* Avatar */}
      <div className="shrink-0 w-7 h-7 rounded-full bg-slate-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-slate-600 dark:text-gray-300 overflow-hidden">
        {comment.user?.avatarUrl ? (
          <img src={comment.user.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className={`text-xs font-semibold ${isDeleted ? 'text-slate-400 dark:text-gray-500' : 'text-slate-700 dark:text-gray-200'}`}>
            {displayName}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-gray-500">
            {new Date(comment.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>

        {isDeleted ? (
          <p className="text-xs text-slate-400 dark:text-gray-500 italic">[deleted]</p>
        ) : editing ? (
          <InlineComposeBox
            initialValue={comment.body ?? ''}
            placeholder="Edit comment…"
            onSubmit={submitEdit}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <p className="text-sm text-slate-700 dark:text-gray-300 break-words">{comment.body}</p>
        )}

        {!isDeleted && !editing && (
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <CommentReactions comment={comment} currentUserId={currentUserId} onUpdate={onUpdate} />
            {isTopLevel && onReplyClick && (
              <button
                type="button"
                onClick={onReplyClick}
                className="text-[10px] text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 transition-colors"
              >
                Reply
              </button>
            )}
            {isOwner && (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-[10px] text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 transition-colors"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="text-[10px] text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 transition-colors"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CommentReactions ──────────────────────────────────────────────────────────

interface CommentReactionsProps {
  comment: Comment
  currentUserId: string
  onUpdate: (comment: Comment) => void
}

function CommentReactions({ comment, currentUserId, onUpdate }: CommentReactionsProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pickerOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [pickerOpen])

  function patchReactions(reactions: ReactionSummary[]) {
    onUpdate({ ...comment, reactions })
  }

  async function toggleReaction(emoji: string) {
    const currentReactions = comment.reactions ?? []
    const existing = currentReactions.find((r) => r.emoji === emoji)
    const meReacted = existing?.userReacted ?? false

    let updated: ReactionSummary[]
    if (meReacted) {
      updated = currentReactions
        .map((r) => r.emoji === emoji ? { ...r, count: r.count - 1, userReacted: false } : r)
        .filter((r) => r.count > 0)
    } else if (existing) {
      updated = currentReactions.map((r) => r.emoji === emoji ? { ...r, count: r.count + 1, userReacted: true } : r)
    } else {
      updated = [...currentReactions, { emoji, count: 1, userReacted: true }]
    }
    patchReactions(updated)
    setPickerOpen(false)

    try {
      if (meReacted) {
        await api.social.reactions.removeFromComment(comment.id, emoji)
      } else {
        await api.social.reactions.addToComment(comment.id, emoji)
      }
    } catch {
      patchReactions(currentReactions)
    }
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {(comment.reactions ?? []).map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => toggleReaction(r.emoji)}
          aria-pressed={r.userReacted}
          aria-label={`${r.emoji} ${r.count}`}
          className={[
            'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] border transition-colors',
            r.userReacted
              ? 'bg-primary/10 border-primary/40 text-primary dark:bg-primary/20 dark:border-primary/50'
              : 'bg-slate-100 dark:bg-gray-800 border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 hover:border-slate-300 dark:hover:border-gray-600',
          ].join(' ')}
        >
          <span>{r.emoji}</span>
          <span className="tabular-nums">{r.count}</span>
        </button>
      ))}

      <div className="relative" ref={pickerRef}>
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          aria-label="Add reaction to comment"
          aria-expanded={pickerOpen}
          className="w-5 h-5 inline-flex items-center justify-center rounded-full text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors"
        >
          <SmileIconXs />
        </button>
        {pickerOpen && (
          <div
            className="absolute bottom-full left-0 mb-1 z-10 flex gap-0.5 p-1 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg shadow-lg"
            role="listbox"
            aria-label="Emoji picker"
          >
            {ALLOWED_EMOJIS.map((emoji) => {
              const active = (comment.reactions ?? []).find((r) => r.emoji === emoji)?.userReacted ?? false
              return (
                <button
                  key={emoji}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => toggleReaction(emoji)}
                  className={[
                    'w-7 h-7 flex items-center justify-center rounded text-base transition-colors',
                    active ? 'bg-primary/15 dark:bg-primary/25' : 'hover:bg-slate-100 dark:hover:bg-gray-700',
                  ].join(' ')}
                >
                  {emoji}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── InlineComposeBox ──────────────────────────────────────────────────────────

interface InlineComposeBoxProps {
  initialValue?: string
  placeholder?: string
  onSubmit: (body: string) => Promise<void>
  onCancel: () => void
}

function InlineComposeBox({ initialValue = '', placeholder = 'Write a comment…', onSubmit, onCancel }: InlineComposeBoxProps) {
  const [value, setValue] = useState(initialValue)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    const body = value.trim()
    if (!body || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(body)
    } catch {
      // ignore
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
          }
        }}
        placeholder={placeholder}
        rows={2}
        className="w-full resize-none rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
      />
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!value.trim() || submitting}
          className="px-2.5 py-1 rounded bg-primary text-white text-xs font-medium disabled:opacity-50 hover:bg-primary-hover transition-colors"
        >
          {submitting ? '…' : 'Post'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-2.5 py-1 rounded text-xs text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function SmileIconXs() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 13s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  )
}
