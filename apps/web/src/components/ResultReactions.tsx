import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type ReactionSummary } from '../lib/api.ts'

const ALLOWED_EMOJIS = ['👍', '❤️', '🔥', '💪', '🎉', '😂'] as const

interface ResultReactionsProps {
  resultId: string
  currentUserId: string
  /**
   * When provided the comment icon becomes a link to the result detail page,
   * showing the loaded comment count. Omit on the result detail page itself
   * (the comment thread is inline below and no link is needed).
   */
  workoutId?: string
}

export default function ResultReactions({ resultId, currentUserId, workoutId }: ResultReactionsProps) {
  const navigate = useNavigate()
  const [reactions, setReactions] = useState<ReactionSummary[]>([])
  const [commentCount, setCommentCount] = useState<number | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.social.reactions.listForResult(resultId).then(setReactions).catch(() => {})
  }, [resultId])

  useEffect(() => {
    if (!workoutId) return
    api.social.comments.list(resultId, 1)
      .then((data) => setCommentCount(data.total))
      .catch(() => {})
  }, [resultId, workoutId])

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

  async function toggleReaction(emoji: string) {
    const existing = reactions.find((r) => r.emoji === emoji)
    const meReacted = existing?.userReacted ?? false

    // Optimistic update
    setReactions((prev) => {
      if (meReacted) {
        return prev
          .map((r) => r.emoji === emoji ? { ...r, count: r.count - 1, userReacted: false } : r)
          .filter((r) => r.count > 0)
      }
      if (existing) {
        return prev.map((r) => r.emoji === emoji ? { ...r, count: r.count + 1, userReacted: true } : r)
      }
      return [...prev, { emoji, count: 1, userReacted: true }]
    })
    setPickerOpen(false)

    try {
      if (meReacted) {
        await api.social.reactions.removeFromResult(resultId, emoji)
      } else {
        await api.social.reactions.addToResult(resultId, emoji)
      }
    } catch {
      // Rollback
      api.social.reactions.listForResult(resultId).then(setReactions).catch(() => {})
    }
  }

  return (
    <div
      className="flex items-center gap-1.5 flex-wrap"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {/* Existing reaction pills */}
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => toggleReaction(r.emoji)}
          aria-pressed={r.userReacted}
          aria-label={`${r.emoji} ${r.count} reaction${r.count !== 1 ? 's' : ''}${r.userReacted ? ', remove' : ', add'}`}
          className={[
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors',
            r.userReacted
              ? 'bg-primary/10 border-primary/40 text-primary dark:bg-primary/20 dark:border-primary/50'
              : 'bg-slate-100 dark:bg-gray-800 border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400 hover:border-slate-300 dark:hover:border-gray-600',
          ].join(' ')}
        >
          <span>{r.emoji}</span>
          <span className="font-medium tabular-nums">{r.count}</span>
        </button>
      ))}

      {/* Add reaction button */}
      <div className="relative" ref={pickerRef}>
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          aria-label="Add reaction"
          aria-expanded={pickerOpen}
          className="inline-flex items-center justify-center w-6 h-6 rounded-full text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors text-sm"
        >
          <SmileIcon />
        </button>

        {pickerOpen && (
          <div
            className="absolute bottom-full left-0 mb-1 z-10 flex gap-1 p-1.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg shadow-lg"
            role="listbox"
            aria-label="Emoji picker"
          >
            {ALLOWED_EMOJIS.map((emoji) => {
              const active = reactions.find((r) => r.emoji === emoji)?.userReacted ?? false
              return (
                <button
                  key={emoji}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => toggleReaction(emoji)}
                  className={[
                    'w-8 h-8 flex items-center justify-center rounded text-lg transition-colors',
                    active
                      ? 'bg-primary/15 dark:bg-primary/25'
                      : 'hover:bg-slate-100 dark:hover:bg-gray-700',
                  ].join(' ')}
                >
                  {emoji}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Comment count — only rendered when workoutId is provided (leaderboard / summary context) */}
      {workoutId && (
        <button
          type="button"
          onClick={() => navigate(`/workouts/${workoutId}/results/${resultId}`)}
          aria-label={commentCount !== null ? `${commentCount} comment${commentCount !== 1 ? 's' : ''}, view result` : 'View comments'}
          className="inline-flex items-center gap-1 text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 transition-colors text-xs"
        >
          <CommentIcon />
          {commentCount !== null && commentCount > 0 && (
            <span className="tabular-nums">{commentCount}</span>
          )}
        </button>
      )}
    </div>
  )
}

function SmileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 13s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  )
}

function CommentIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
