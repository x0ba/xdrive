import { useState } from 'react'
import {
  AlertTriangle,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileSearch,
  Folder,
  KeyRound,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { Streamdown } from 'streamdown'
import { getCategoryIcon } from '#/components/design-system/NavigationShell'
import type { MarbleDocumentFile } from '#/lib/types'
import { REASONING_EFFORT_META } from '#/lib/ai/drive-chat-types'
import type { DriveChatMessage } from '#/lib/ai/drive-chat-types'
import { DriveActionCard } from './DriveActionCard'
import { cn } from '#/lib/utils'

export interface ChatMessageItemProps {
  message: DriveChatMessage
  docsById: Map<string, MarbleDocumentFile>
  onOpenDocument?: (docId: string) => void
  onOpenFolder?: (folderId: string | null) => void
  onApplyAction?: (messageId: string, actionId: string) => void
  onApplyAllActions?: (messageId: string) => void
  onDiscardAction?: (messageId: string, actionId: string) => void
  onDiscardAllActions?: (messageId: string) => void
  onUndoAction?: (messageId: string, actionId: string) => void
  onRegenerate?: (messageId: string) => void
  onOpenProviders?: () => void
}

function formatDuration(ms?: number): string {
  if (!ms || ms < 500) return 'a moment'
  const seconds = ms / 1000
  if (seconds < 10) return `${seconds.toFixed(1)}s`
  return `${Math.round(seconds)}s`
}

function formatClock(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function ChatMessageItem({
  message,
  docsById,
  onOpenDocument,
  onOpenFolder,
  onApplyAction,
  onApplyAllActions,
  onDiscardAction,
  onDiscardAllActions,
  onUndoAction,
  onRegenerate,
  onOpenProviders,
}: ChatMessageItemProps) {
  const [thoughtsOpen, setThoughtsOpen] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!message.content.trim()) return
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // ignore clipboard restrictions
    }
  }

  // T3 Code TimelineUserMessageRow — soft borderless rounded-2xl right-aligned bubble
  if (message.role === 'user') {
    return (
      <div
        data-component="chat-message-user"
        className="group flex flex-col items-end gap-1.5"
      >
        {message.contextRefs && message.contextRefs.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-1">
            {message.contextRefs.map((ref) => (
              <button
                key={`${ref.kind}:${ref.id}`}
                type="button"
                onClick={() => {
                  if (ref.kind === 'doc') onOpenDocument?.(ref.id)
                  else onOpenFolder?.(ref.id)
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--xd-elevated)] px-2 py-0.5 text-[11.5px] text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
              >
                {ref.kind === 'folder' ? (
                  <Folder className="size-3 text-[var(--xd-ink-muted)]" />
                ) : (
                  <span className="text-[var(--xd-ink-muted)]">
                    {getCategoryIcon(ref.category, 'size-3')}
                  </span>
                )}
                <span className="max-w-[180px] truncate">
                  {ref.kind === 'folder' ? ref.name : ref.title}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="max-w-[80%] rounded-2xl bg-[var(--xd-elevated)] px-4 py-2.5 text-[14px] leading-relaxed text-[var(--xd-ink)] whitespace-pre-wrap">
          {message.content}
        </div>

        <div className="flex items-center gap-1.5 pr-1 text-[11px] text-[var(--xd-ink-muted)] opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <span>{formatClock(message.createdAt)}</span>
          <button
            type="button"
            onClick={() => void handleCopy()}
            aria-label="Copy message"
            className="inline-flex size-5 items-center justify-center rounded hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
          >
            {copied ? (
              <Check className="size-3 text-[var(--xd-commit)]" />
            ) : (
              <Copy className="size-3" />
            )}
          </button>
        </div>
      </div>
    )
  }

  if (message.role === 'system') {
    return (
      <div
        data-component="chat-message-system"
        className="flex items-start justify-between gap-3 rounded-xl border border-[var(--xd-danger)]/35 bg-[var(--xd-danger-soft)] px-3.5 py-2.5 text-[12.5px] text-[var(--xd-danger)]"
      >
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p className="leading-relaxed">{message.content}</p>
        </div>
        {onOpenProviders && (
          <button
            type="button"
            onClick={onOpenProviders}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--xd-danger)]/40 bg-[var(--xd-canvas)] px-2.5 text-[11.5px] font-medium text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)]"
          >
            <KeyRound className="size-3" />
            <span>Models</span>
          </button>
        )}
      </div>
    )
  }

  const thoughtsText = (message.thoughts ?? []).join('\n\n').trim()
  const hasThoughts = thoughtsText.length > 0
  const isThinkingPhase =
    message.isStreaming &&
    (!message.content.trim() || message.streamingPhase === 'thinking')
  const isPreparingActions =
    message.isStreaming && message.streamingPhase === 'preparing_actions'

  const actions = message.actions ?? []
  const proposedActions = actions.filter((a) => a.status === 'proposed')
  const referencedDocs = (message.referencedDocIds ?? [])
    .map((id) => docsById.get(id))
    .filter((doc): doc is MarbleDocumentFile => Boolean(doc))

  return (
    <article
      data-component="chat-message-assistant"
      className="group space-y-2.5"
    >
      {/* 1. T3 Code WorkLog-style quiet single-line activity rows (Reasoning + Drive Sources) */}
      {(hasThoughts || isThinkingPhase || referencedDocs.length > 0) && (
        <div className="space-y-0.5">
          {(hasThoughts || isThinkingPhase) && (
            <div>
              <button
                type="button"
                disabled={!hasThoughts}
                onClick={() => setThoughtsOpen((prev) => !prev)}
                className="group/row flex w-full items-center justify-between gap-2 rounded-md px-0.5 py-0.5 text-left text-[12.5px] text-[var(--xd-ink-muted)] transition-colors hover:text-[var(--xd-ink-secondary)] disabled:cursor-default"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex size-5 shrink-0 items-center justify-center">
                    {isThinkingPhase ? (
                      <Loader2 className="size-3.5 animate-spin text-[var(--xd-ink-secondary)]" />
                    ) : (
                      <Brain className="size-3.5 text-[var(--xd-ink-muted)]" />
                    )}
                  </span>
                  <span className="truncate">
                    {isThinkingPhase
                      ? 'Thinking across your Drive…'
                      : `Thought for ${formatDuration(message.thinkingDurationMs)}`}
                  </span>
                  {hasThoughts &&
                    (thoughtsOpen ? (
                      <ChevronDown className="size-3 shrink-0 opacity-60" />
                    ) : (
                      <ChevronRight className="size-3 shrink-0 opacity-0 transition-opacity group-hover/row:opacity-70" />
                    ))}
                </span>
              </button>

              {hasThoughts && thoughtsOpen && (
                <div className="ms-7 my-1 border-l border-[var(--xd-border-strong)] pl-3 text-[12.5px] leading-relaxed text-[var(--xd-ink-muted)] whitespace-pre-wrap">
                  {thoughtsText}
                </div>
              )}
            </div>
          )}

          {referencedDocs.length > 0 && !message.isStreaming && (
            <div>
              <button
                type="button"
                onClick={() => setSourcesOpen((prev) => !prev)}
                className="group/row flex w-full items-center justify-between gap-2 rounded-md px-0.5 py-0.5 text-left text-[12.5px] text-[var(--xd-ink-muted)] transition-colors hover:text-[var(--xd-ink-secondary)]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex size-5 shrink-0 items-center justify-center">
                    <FileSearch className="size-3.5 text-[var(--xd-ink-muted)]" />
                  </span>
                  <span className="truncate">
                    Read {referencedDocs.length}{' '}
                    {referencedDocs.length === 1 ? 'Drive file' : 'Drive files'}
                  </span>
                  {sourcesOpen ? (
                    <ChevronDown className="size-3 shrink-0 opacity-60" />
                  ) : (
                    <ChevronRight className="size-3 shrink-0 opacity-0 transition-opacity group-hover/row:opacity-70" />
                  )}
                </span>
              </button>

              {sourcesOpen && (
                <div className="ms-7 my-1.5 flex flex-wrap gap-1.5">
                  {referencedDocs.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => onOpenDocument?.(doc.id)}
                      title={`Open ${doc.fileName}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2 py-0.5 text-[11.5px] text-[var(--xd-ink-secondary)] transition-colors hover:border-[var(--xd-border-strong)] hover:text-[var(--xd-ink)]"
                    >
                      <span className="text-[var(--xd-ink-muted)]">
                        {getCategoryIcon(doc.category, 'size-3')}
                      </span>
                      <span className="max-w-[200px] truncate">{doc.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2. Markdown answer via Streamdown (T3 Code editorial reading column) */}
      {message.content.trim().length > 0 && (
        <div
          className={cn(
            'prose prose-sm max-w-none text-[14px] leading-[1.68] text-[var(--xd-ink)] dark:prose-invert',
            'prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-[var(--xd-ink)]',
            'prose-p:my-2.5 prose-p:text-[var(--xd-ink)]',
            'prose-strong:font-semibold prose-strong:text-[var(--xd-ink)]',
            'prose-code:rounded-md prose-code:bg-[var(--xd-elevated)] prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-[12.5px] prose-code:font-normal prose-code:text-[var(--xd-ink)] prose-code:before:content-none prose-code:after:content-none',
            'prose-pre:rounded-xl prose-pre:border prose-pre:border-[var(--xd-border)] prose-pre:bg-[var(--xd-rail)]',
            'prose-a:text-[var(--xd-accent)] prose-a:no-underline hover:prose-a:underline',
            'prose-blockquote:border-l-[var(--xd-border-strong)] prose-blockquote:text-[var(--xd-ink-secondary)]',
            'prose-th:border-[var(--xd-border)] prose-td:border-[var(--xd-border)]',
          )}
        >
          <Streamdown isAnimating={Boolean(message.isStreaming)}>
            {message.content}
          </Streamdown>
        </div>
      )}

      {/* Streaming actions indicator */}
      {isPreparingActions && (
        <div className="inline-flex items-center gap-2 rounded-lg px-0.5 py-1 text-[12.5px] text-[var(--xd-ink-muted)]">
          <Loader2 className="size-3.5 animate-spin" />
          <span>Preparing Drive changes…</span>
        </div>
      )}

      {/* 3. Inline Drive Action Cards */}
      {actions.length > 0 && (
        <div className="space-y-2 pt-1">
          {proposedActions.length > 1 && (
            <div className="flex items-center justify-between rounded-xl border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2 text-[12px]">
              <span className="font-medium text-[var(--xd-ink-secondary)]">
                {proposedActions.length} Drive changes pending approval
              </span>
              <div className="flex items-center gap-1.5">
                {onApplyAllActions && (
                  <button
                    type="button"
                    onClick={() => onApplyAllActions(message.id)}
                    className="inline-flex h-6 items-center gap-1 rounded-md bg-[var(--xd-ink)] px-2.5 text-[11.5px] font-medium text-[var(--xd-canvas)] hover:opacity-90"
                  >
                    <Check className="size-3" />
                    <span>Apply all</span>
                  </button>
                )}
                {onDiscardAllActions && (
                  <button
                    type="button"
                    onClick={() => onDiscardAllActions(message.id)}
                    className="inline-flex h-6 items-center rounded-md px-2 text-[11.5px] text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
                  >
                    Discard all
                  </button>
                )}
              </div>
            </div>
          )}

          {actions.map((action) => (
            <DriveActionCard
              key={action.id}
              action={action}
              onApply={
                onApplyAction
                  ? (actionId) => onApplyAction(message.id, actionId)
                  : undefined
              }
              onDiscard={
                onDiscardAction
                  ? (actionId) => onDiscardAction(message.id, actionId)
                  : undefined
              }
              onUndo={
                onUndoAction
                  ? (actionId) => onUndoAction(message.id, actionId)
                  : undefined
              }
              onOpenDocument={onOpenDocument}
              onOpenFolder={onOpenFolder}
            />
          ))}
        </div>
      )}

      {/* 4. Error banner */}
      {message.error && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-[var(--xd-danger)]/35 bg-[var(--xd-danger-soft)] px-3.5 py-2.5 text-[12.5px] text-[var(--xd-danger)]">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{message.error}</span>
          </div>
          {onOpenProviders && (
            <button
              type="button"
              onClick={onOpenProviders}
              className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-[var(--xd-danger)]/35 bg-[var(--xd-canvas)] px-2 text-[11px] font-medium text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)]"
            >
              <KeyRound className="size-3" />
              <span>Providers</span>
            </button>
          )}
        </div>
      )}

      {/* 5. Quiet T3 Code assistant footer */}
      {!message.isStreaming && message.content.trim().length > 0 && (
        <div className="flex items-center gap-2 pt-0.5 text-[11.5px] text-[var(--xd-ink-muted)]">
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              onClick={() => void handleCopy()}
              aria-label="Copy response"
              className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
            >
              {copied ? (
                <>
                  <Check className="size-3 text-[var(--xd-commit)]" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="size-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
            {onRegenerate && (
              <button
                type="button"
                onClick={() => onRegenerate(message.id)}
                aria-label="Regenerate response"
                className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
              >
                <RefreshCw className="size-3" />
                <span>Retry</span>
              </button>
            )}
          </div>
          <span className="ml-auto flex items-center gap-2 text-[11px] text-[var(--xd-ink-muted)]/80">
            {message.modelName && <span>{message.modelName}</span>}
            {message.reasoningEffort && message.reasoningEffort !== 'off' && (
              <span>
                {REASONING_EFFORT_META[message.reasoningEffort].label}
              </span>
            )}
            <span>{formatClock(message.createdAt)}</span>
          </span>
        </div>
      )}
    </article>
  )
}
