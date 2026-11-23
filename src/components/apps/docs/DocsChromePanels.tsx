import { useState } from 'react'
import {
  Check,
  MessageSquare,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import type { DocsComment, DocsOutlineItem } from './types'

/* ============================================================================
   DocsRuler — Horizontal Inch Ruler (Google Docs parity)
   ============================================================================ */

export interface DocsRulerProps {
  pageWidthPx: number
  marginLeftIn: number
  marginRightIn: number
  onMarginsChange?: (leftIn: number, rightIn: number) => void
}

export function DocsRuler({
  pageWidthPx,
  marginLeftIn,
  marginRightIn,
  onMarginsChange,
}: DocsRulerProps) {
  const totalInches = Math.round((pageWidthPx / 96) * 10) / 10
  const wholeInches = Math.floor(totalInches)
  const leftPx = marginLeftIn * 96
  const rightPx = marginRightIn * 96

  return (
    <div
      aria-label="Document margin ruler"
      className="flex h-6 shrink-0 items-end justify-center overflow-hidden border-b border-[var(--xd-border)] bg-[var(--xd-rail)] select-none"
    >
      <div
        className="relative h-full border-x border-[var(--xd-border)] bg-[var(--xd-canvas)]"
        style={{ width: pageWidthPx }}
      >
        {/* Left shaded margin */}
        <div
          className="absolute inset-y-0 left-0 bg-[var(--xd-elevated)]"
          style={{ width: leftPx }}
        />
        {/* Right shaded margin */}
        <div
          className="absolute inset-y-0 right-0 bg-[var(--xd-elevated)]"
          style={{ width: rightPx }}
        />

        {/* Inch ticks */}
        {Array.from({ length: wholeInches * 8 + 1 }).map((_, idx) => {
          const left = idx * 12 // 96px / 8 = 12px per 1/8 inch
          if (left > pageWidthPx) return null
          const isInch = idx % 8 === 0
          const isHalf = idx % 4 === 0 && !isInch
          const inchNum = idx / 8
          return (
            <div
              key={idx}
              style={{ left }}
              className="pointer-events-none absolute bottom-0 flex flex-col items-center"
            >
              {isInch && inchNum > 0 && inchNum < wholeInches && (
                <span className="xd-tabular -translate-x-1/2 text-[9px] leading-none text-[var(--xd-ink-muted)]">
                  {inchNum}
                </span>
              )}
              <span
                className={cn(
                  'w-px bg-[var(--xd-border-strong)]',
                  isInch ? 'h-2.5' : isHalf ? 'h-2' : 'h-1',
                )}
              />
            </div>
          )
        })}

        {/* Left margin stop handle */}
        <button
          type="button"
          title={`Left margin: ${marginLeftIn.toFixed(2)}" (click to toggle narrow/standard)`}
          aria-label="Adjust left margin"
          onClick={() =>
            onMarginsChange?.(marginLeftIn < 0.75 ? 0.95 : 0.55, marginRightIn)
          }
          style={{ left: leftPx }}
          className="absolute top-0.5 h-2.5 w-2.5 -translate-x-1/2 rounded-[2px] bg-[var(--xd-accent)] transition-transform hover:scale-125"
        />

        {/* Right margin stop handle */}
        <button
          type="button"
          title={`Right margin: ${marginRightIn.toFixed(2)}" (click to toggle narrow/standard)`}
          aria-label="Adjust right margin"
          onClick={() =>
            onMarginsChange?.(marginLeftIn, marginRightIn < 0.75 ? 0.95 : 0.55)
          }
          style={{ right: rightPx }}
          className="absolute top-0.5 h-2.5 w-2.5 translate-x-1/2 rounded-[2px] bg-[var(--xd-accent)] transition-transform hover:scale-125"
        />
      </div>
    </div>
  )
}

/* ============================================================================
   DocsOutlineSidebar — Left Collapsible Outline
   ============================================================================ */

export interface DocsOutlineSidebarProps {
  items: DocsOutlineItem[]
  activeHeadingId: string | null
  onSelectHeading: (id: string) => void
  onClose: () => void
}

export function DocsOutlineSidebar({
  items,
  activeHeadingId,
  onSelectHeading,
  onClose,
}: DocsOutlineSidebarProps) {
  return (
    <aside
      aria-label="Document outline"
      className="flex h-full w-56 shrink-0 flex-col border-r border-[var(--xd-border)] bg-[var(--xd-rail)] select-none"
    >
      <div className="flex items-center justify-between border-b border-[var(--xd-border)] px-3 py-2">
        <span className="text-[12px] font-medium text-[var(--xd-ink)]">
          Document outline
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide outline"
          className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <p className="px-2 py-4 text-[11.5px] leading-relaxed text-[var(--xd-ink-muted)]">
            Headings you add to the document will appear here.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {items.map((item) => {
              const active = item.id === activeHeadingId
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelectHeading(item.id)}
                    className={cn(
                      'w-full truncate rounded px-2 py-1 text-left text-[12px] transition-colors',
                      item.level === 2 && 'pl-4',
                      item.level === 3 && 'pl-6 text-[11.5px]',
                      active
                        ? 'bg-[var(--xd-accent-soft)] font-medium text-[var(--xd-accent)]'
                        : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                    )}
                  >
                    {item.text}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}

/* ============================================================================
   DocsCommentsPanel — Right Comments & Suggestions Rail
   ============================================================================ */

export interface DocsCommentsPanelProps {
  comments: DocsComment[]
  draftQuote: string | null
  draftKind: 'comment' | 'suggestion'
  onCancelDraft: () => void
  onSubmitDraft: (body: string, suggestionReplace?: string) => void
  onReply: (commentId: string, body: string) => void
  onToggleResolve: (commentId: string) => void
  onAcceptSuggestion: (commentId: string) => void
  onDeleteComment: (commentId: string) => void
  onClose: () => void
}

export function DocsCommentsPanel({
  comments,
  draftQuote,
  draftKind,
  onCancelDraft,
  onSubmitDraft,
  onReply,
  onToggleResolve,
  onAcceptSuggestion,
  onDeleteComment,
  onClose,
}: DocsCommentsPanelProps) {
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open')
  const [draftBody, setDraftBody] = useState('')
  const [draftReplace, setDraftReplace] = useState('')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})

  const visible = comments.filter((c) => {
    if (filter === 'open') return !c.resolved
    if (filter === 'resolved') return c.resolved
    return true
  })

  return (
    <aside
      aria-label="Comments and suggestions"
      className="flex h-full w-72 shrink-0 flex-col border-l border-[var(--xd-border)] bg-[var(--xd-rail)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--xd-border)] px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--xd-ink)]">
          <MessageSquare className="h-3.5 w-3.5 text-[var(--xd-ink-muted)]" />
          <span>Comments</span>
        </span>
        <div className="flex items-center gap-1">
          <select
            aria-label="Filter comments"
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="h-6 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-1.5 text-[11px] text-[var(--xd-ink-secondary)] outline-none"
          >
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comments"
            className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {draftQuote !== null && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!draftBody.trim() && !draftReplace.trim()) return
              onSubmitDraft(
                draftBody.trim() || `Replace with “${draftReplace.trim()}”`,
                draftKind === 'suggestion' ? draftReplace.trim() : undefined,
              )
              setDraftBody('')
              setDraftReplace('')
            }}
            className="rounded-md border border-[var(--xd-accent-border)] bg-[var(--xd-canvas)] p-2.5"
          >
            <div className="text-[11px] font-medium text-[var(--xd-accent)]">
              {draftKind === 'suggestion' ? 'New suggestion' : 'New comment'}
            </div>
            {draftQuote && (
              <p className="mt-1 truncate border-l-2 border-[var(--xd-sketch)] pl-2 text-[11px] text-[var(--xd-ink-muted)]">
                “{draftQuote}”
              </p>
            )}
            {draftKind === 'suggestion' && (
              <input
                value={draftReplace}
                onChange={(e) => setDraftReplace(e.target.value)}
                placeholder="Suggested replacement text..."
                className="mt-2 h-7 w-full rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2 text-[12px] text-[var(--xd-ink)] outline-none focus:border-[var(--xd-accent)]"
              />
            )}
            <textarea
              autoFocus
              rows={2}
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              placeholder={
                draftKind === 'suggestion'
                  ? 'Optional rationale...'
                  : 'Comment or @mention...'
              }
              className="mt-2 w-full resize-none rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] p-2 text-[12px] text-[var(--xd-ink)] outline-none focus:border-[var(--xd-accent)]"
            />
            <div className="mt-2 flex justify-end gap-1.5">
              <button
                type="button"
                onClick={onCancelDraft}
                className="rounded border border-[var(--xd-border)] px-2 py-1 text-[11px] text-[var(--xd-ink-secondary)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded bg-[var(--xd-accent)] px-2.5 py-1 text-[11px] font-medium text-white"
              >
                {draftKind === 'suggestion' ? 'Suggest' : 'Comment'}
              </button>
            </div>
          </form>
        )}

        {visible.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-[var(--xd-ink-muted)]">
            No {filter === 'all' ? '' : filter} comments.
          </p>
        ) : (
          visible.map((comment) => (
            <div
              key={comment.id}
              data-marble-id={comment.id}
              className={cn(
                'rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] p-2.5 text-[12px]',
                comment.resolved && 'opacity-65',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--xd-accent-soft)] text-[10px] font-semibold text-[var(--xd-accent)]">
                    {comment.initials}
                  </span>
                  <span className="font-medium text-[var(--xd-ink)]">
                    {comment.author}
                  </span>
                </div>
                <div className="flex items-center gap-0.5">
                  {comment.kind === 'suggestion' && !comment.resolved && (
                    <button
                      type="button"
                      title="Accept suggestion"
                      onClick={() => onAcceptSuggestion(comment.id)}
                      className="inline-flex h-6 items-center gap-1 rounded bg-[var(--xd-commit-soft)] px-1.5 text-[10.5px] font-medium text-[var(--xd-commit)] hover:opacity-85"
                    >
                      <Check className="h-3 w-3" />
                      <span>Accept</span>
                    </button>
                  )}
                  <button
                    type="button"
                    title={comment.resolved ? 'Reopen' : 'Resolve'}
                    aria-label={
                      comment.resolved ? 'Reopen comment' : 'Resolve comment'
                    }
                    onClick={() => onToggleResolve(comment.id)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
                  >
                    {comment.resolved ? (
                      <RotateCcw className="h-3 w-3" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    aria-label="Delete comment"
                    onClick={() => onDeleteComment(comment.id)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--xd-ink-muted)] hover:bg-[var(--xd-danger-soft)] hover:text-[var(--xd-danger)]"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {comment.quote && (
                <p className="mt-1.5 truncate border-l-2 border-[var(--xd-sketch)] pl-2 text-[11px] text-[var(--xd-ink-muted)]">
                  “{comment.quote}”
                </p>
              )}

              {comment.kind === 'suggestion' && comment.suggestionReplace && (
                <div className="mt-1.5 flex items-center gap-1 rounded border border-[var(--xd-commit)]/30 bg-[var(--xd-commit-soft)] px-2 py-1 text-[11px] text-[var(--xd-commit)]">
                  <Sparkles className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    Replace with: {comment.suggestionReplace}
                  </span>
                </div>
              )}

              <p className="mt-1.5 leading-relaxed text-[var(--xd-ink-secondary)]">
                {comment.body}
              </p>

              {comment.replies.length > 0 && (
                <div className="mt-2 space-y-1.5 border-t border-[var(--xd-border)] pt-2">
                  {comment.replies.map((reply) => (
                    <div key={reply.id} className="text-[11.5px]">
                      <span className="font-medium text-[var(--xd-ink)]">
                        {reply.author}:{' '}
                      </span>
                      <span className="text-[var(--xd-ink-secondary)]">
                        {reply.body}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {!comment.resolved && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const text = (replyDrafts[comment.id] ?? '').trim()
                    if (!text) return
                    onReply(comment.id, text)
                    setReplyDrafts((prev) => ({ ...prev, [comment.id]: '' }))
                  }}
                  className="mt-2 flex items-center gap-1"
                >
                  <input
                    value={replyDrafts[comment.id] ?? ''}
                    onChange={(e) =>
                      setReplyDrafts((prev) => ({
                        ...prev,
                        [comment.id]: e.target.value,
                      }))
                    }
                    placeholder="Reply..."
                    aria-label="Reply to comment"
                    className="h-6 flex-1 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2 text-[11.5px] text-[var(--xd-ink)] outline-none focus:border-[var(--xd-accent)]"
                  />
                  <button
                    type="submit"
                    aria-label="Send reply"
                    className="inline-flex h-6 w-6 items-center justify-center rounded bg-[var(--xd-surface-hover)] text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]"
                  >
                    <Send className="h-3 w-3" />
                  </button>
                </form>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
