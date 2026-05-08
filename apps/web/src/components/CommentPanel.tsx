import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext.tsx'
import { api, type Comment, type ReactionSummary } from '../lib/api.ts'

const ALLOWED_EMOJIS = ['👍', '❤️', '🔥', '💪', '🎉', '😂'] as const

interface CommentPanelProps {
  resultId: string
  onClose: () => void
}

export default function CommentPanel({ resultId, onClose }: CommentPanelProps) {
  const { user } = useAuth()
  const [comments, setComments] = useState<Comment[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [compose, setCompose] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const composeRef = useRef<HTMLTextAreaElement>(null)

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

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

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
      const comment = await api.social.comments.create(resultId, body)
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
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      <div
        className="relative z-10 w-full max-w-md bg-white dark:bg-gray-900 flex flex-col shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Comments"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-gray-800 shrink-0">
          <h2 className="text-sm font-semibold text-slate-950 dark:text-white">
            Comments
            {total > 0 && <span className="ml-2 text-xs font-normal text-slate-500 dark:text-gray-400">({total})</span>}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-950 dark:text-gray-500 dark:hover:text-white text-xl leading-none transition-colors -my-1 -mr-1.5 w-7 h-7 inline-flex items-center justify-center"
            aria-label="Close comments"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading && (
            <p className="text-sm text-slate-500 dark:text-gray-400">Loading…</p>
          )}
          {!loading && comments.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-gray-400">No comments yet. Be the first!</p>
          )}
          {comments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              currentUserId={user?.id ?? ''}
              resultId={resultId}
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

        {/* Compose box */}
        <div className="shrink-0 px-5 py-4 border-t border-slate-200 dark:border-gray-800">
          <div className="flex gap-2 items-end">
            <textarea
              ref={composeRef}
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
              className="flex-1 resize-none rounded-lg border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary dark:focus:border-primary"
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
        </div>
      </div>
    </div>
  )
}

// ─── CommentThread ─────────────────────────────────────────────────────────────

interface CommentThreadProps {
  comment: Comment
  currentUserId: string
  resultId: string
  onUpdate: (comment: Comment) => void
  onDelete: (id: string) => void
}

function CommentThread({ comment, currentUserId, resultId, onUpdate, onDelete }: CommentThreadProps) {
  const [showReplyForm, setShowReplyForm] = useState(false)
  const [replies, setReplies] = useState<Comment[]>(comment.replies ?? [])

  // Sync replies when parent comment updates (e.g. pagination / refresh)
  useEffect(() => {
    setReplies(comment.replies ?? [])
  }, [comment.replies])

  async function submitReply(body: string) {
    const reply = await api.social.comments.reply(comment.id, body)
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

      {/* Replies */}
      {replies.length > 0 && (
        <div className="ml-9 mt-2 space-y-2 border-l-2 border-slate-100 dark:border-gray-800 pl-3">
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
      {/* Avatar circle */}
      <div className="shrink-0 w-7 h-7 rounded-full bg-slate-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-slate-600 dark:text-gray-300 overflow-hidden">
        {comment.user?.avatarUrl ? (
          <img src={comment.user.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </div>

      <div className="flex-1 min-w-0">
        {/* Name + timestamp */}
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className={`text-xs font-semibold ${isDeleted ? 'text-slate-400 dark:text-gray-500' : 'text-slate-700 dark:text-gray-200'}`}>
            {displayName}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-gray-500">
            {new Date(comment.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>

        {/* Body */}
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

        {/* Reactions + actions */}
        {!isDeleted && !editing && (
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <CommentReactions
              comment={comment}
              currentUserId={currentUserId}
              onUpdate={onUpdate}
            />
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
    const existing = comment.reactions.find((r) => r.emoji === emoji)
    const meReacted = existing?.userReacted ?? false

    // Optimistic update
    let updated: ReactionSummary[]
    if (meReacted) {
      updated = comment.reactions
        .map((r) => r.emoji === emoji ? { ...r, count: r.count - 1, userReacted: false } : r)
        .filter((r) => r.count > 0)
    } else if (existing) {
      updated = comment.reactions.map((r) => r.emoji === emoji ? { ...r, count: r.count + 1, userReacted: true } : r)
    } else {
      updated = [...comment.reactions, { emoji, count: 1, userReacted: true }]
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
      // Rollback to pre-update state
      patchReactions(comment.reactions)
    }
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {comment.reactions.map((r) => (
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
          className="w-5 h-5 inline-flex items-center justify-center rounded-full text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors text-xs"
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
              const active = comment.reactions.find((r) => r.emoji === emoji)?.userReacted ?? false
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
      // ignore — let the caller decide
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
