import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  HardDrive,
  KeyRound,
  MessageSquare,
  PanelLeft,
  Pin,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import type { DriveFolder, MarbleDocumentFile } from '#/lib/types'
import type {
  DriveChatMode,
  DriveChatModelOption,
  DriveChatThread,
  DriveContextRef,
  ReasoningEffort,
} from '#/lib/ai/drive-chat-types'
import { ChatComposer } from './ChatComposer'
import { ChatMessageItem } from './ChatMessageItem'
import { cn } from '#/lib/utils'

export interface DriveChatViewProps {
  threads: DriveChatThread[]
  activeThreadId: string
  onSelectThread: (threadId: string) => void
  onNewThread: () => void
  onDeleteThread?: (threadId: string) => void
  onTogglePinThread?: (threadId: string) => void
  onRenameThread?: (threadId: string, title: string) => void
  docs: MarbleDocumentFile[]
  trashedDocs?: MarbleDocumentFile[]
  folders: DriveFolder[]
  models: DriveChatModelOption[]
  selectedModelId: string
  onSelectModel: (modelId: string) => void
  reasoningEffort: ReasoningEffort
  onSelectReasoningEffort: (effort: ReasoningEffort) => void
  mode: DriveChatMode
  onSelectMode: (mode: DriveChatMode) => void
  isStreaming?: boolean
  onSendMessage: (input: {
    text: string
    contextRefs: DriveContextRef[]
  }) => void
  onStopStreaming?: () => void
  onRegenerate?: (messageId: string) => void
  onApplyAction?: (messageId: string, actionId: string) => void
  onApplyAllActions?: (messageId: string) => void
  onDiscardAction?: (messageId: string, actionId: string) => void
  onDiscardAllActions?: (messageId: string) => void
  onUndoAction?: (messageId: string, actionId: string) => void
  onOpenDocument?: (docId: string) => void
  onOpenFolder?: (folderId: string | null) => void
  onOpenProviders?: () => void
  defaultHistoryOpen?: boolean
  className?: string
}

function formatThreadTime(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  const minutes = Math.round((Date.now() - ms) / 60000)
  if (Math.abs(minutes) < 1) return 'now'
  if (Math.abs(minutes) < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 36) return `${hours}h`
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 28) return `${days}d`
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function buildStarterPrompts(
  docs: MarbleDocumentFile[],
  folders: DriveFolder[],
): Array<{ label: string; prompt: string }> {
  const nonEvergreen = docs.filter((doc) => !doc.isEvergreen)
  const firstDoc = nonEvergreen.at(0)
  const secondDoc = nonEvergreen.at(1)
  const firstFolder = folders.at(0)

  return [
    {
      label:
        firstDoc && secondDoc
          ? `Compare findings across ${firstDoc.title} and ${secondDoc.title}`
          : 'Summarize the key findings and open questions across my Drive',
      prompt:
        firstDoc && secondDoc
          ? `Compare the key claims, numbers, and open questions across "${firstDoc.title}" and "${secondDoc.title}", and point out any inconsistencies.`
          : 'Summarize the key findings, metrics, and open questions across all files in my Drive.',
    },
    {
      label: firstFolder
        ? `Organize files and clean up tags in ${firstFolder.name}`
        : 'Audit my Drive folders and suggest a cleaner structure',
      prompt: firstFolder
        ? `Review the files across my Drive and organize related documents with cleaner tags and folder placement around "${firstFolder.name}".`
        : 'Review every file in my Drive, propose clear folders and consistent tags, and organize them for me.',
    },
    {
      label: 'Create an executive brief synthesizing my latest research notes',
      prompt:
        'Create a new .mrbl document titled "Drive Research Brief" that synthesizes the latest results, metrics, and next steps from all files in my Drive.',
    },
  ]
}

export function DriveChatView({
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onDeleteThread,
  onTogglePinThread,
  onRenameThread,
  docs,
  trashedDocs = [],
  folders,
  models,
  selectedModelId,
  onSelectModel,
  reasoningEffort,
  onSelectReasoningEffort,
  mode,
  onSelectMode,
  isStreaming = false,
  onSendMessage,
  onStopStreaming,
  onRegenerate,
  onApplyAction,
  onApplyAllActions,
  onDiscardAction,
  onDiscardAllActions,
  onUndoAction,
  onOpenDocument,
  onOpenFolder,
  onOpenProviders,
  defaultHistoryOpen = true,
  className,
}: DriveChatViewProps) {
  const [historyOpen, setHistoryOpen] = useState(defaultHistoryOpen)
  const [threadSearch, setThreadSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [contextRefs, setContextRefs] = useState<DriveContextRef[]>([])
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [showScrollBottom, setShowScrollBottom] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? threads.at(0) ?? null,
    [threads, activeThreadId],
  )

  const docsById = useMemo(() => {
    const map = new Map<string, MarbleDocumentFile>()
    for (const doc of docs) map.set(doc.id, doc)
    for (const doc of trashedDocs) map.set(doc.id, doc)
    return map
  }, [docs, trashedDocs])

  const hasConnectedProvider = useMemo(
    () => models.some((model) => model.connected),
    [models],
  )

  const filteredThreads = useMemo(() => {
    const needle = threadSearch.trim().toLowerCase()
    return threads
      .filter((thread) =>
        needle
          ? thread.title.toLowerCase().includes(needle) ||
            thread.messages.some((m) =>
              m.content.toLowerCase().includes(needle),
            )
          : true,
      )
      .slice()
      .sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) {
          return a.pinned ? -1 : 1
        }
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
      })
  }, [threads, threadSearch])

  const starterPrompts = useMemo(
    () => buildStarterPrompts(docs, folders),
    [docs, folders],
  )

  const messages = activeThread?.messages ?? []
  const lastMessage = messages.at(-1)
  const lastMessageContentLen = lastMessage ? lastMessage.content.length : 0
  const lastMessageActionsLen = lastMessage?.actions?.length ?? 0

  useEffect(() => {
    if (!stickToBottomRef.current) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [activeThreadId, messages.length, lastMessageContentLen, lastMessageActionsLen])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = distance < 72
    stickToBottomRef.current = nearBottom
    setShowScrollBottom(!nearBottom && messages.length > 0)
  }

  function scrollToBottom() {
    const el = scrollRef.current
    if (!el) return
    stickToBottomRef.current = true
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  function handleSubmit() {
    const text = draft.trim()
    if (!text || isStreaming) return
    stickToBottomRef.current = true
    onSendMessage({ text, contextRefs })
    setDraft('')
  }

  function handleAddContextRef(ref: DriveContextRef) {
    setContextRefs((prev) =>
      prev.some((item) => item.kind === ref.kind && item.id === ref.id)
        ? prev
        : [...prev, ref],
    )
  }

  function handleRemoveContextRef(ref: DriveContextRef) {
    setContextRefs((prev) =>
      prev.filter((item) => !(item.kind === ref.kind && item.id === ref.id)),
    )
  }

  const isEmpty = messages.length === 0

  return (
    <div
      data-component="drive-chat-view"
      className={cn(
        'flex h-full min-h-0 w-full overflow-hidden bg-[var(--xd-canvas)] text-[var(--xd-ink)]',
        className,
      )}
    >
      {/* Collapsible Thread History Rail */}
      {historyOpen && (
        <aside
          aria-label="Chat history"
          className="flex h-full w-60 shrink-0 flex-col border-r border-[var(--xd-border)] bg-[var(--xd-rail)]"
        >
          <div className="flex items-center justify-between gap-2 px-2.5 pt-2.5 pb-2">
            <button
              type="button"
              onClick={() => {
                setContextRefs([])
                onNewThread()
              }}
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-2.5 text-[12px] font-medium text-[var(--xd-ink)] transition-colors hover:bg-[var(--xd-surface-hover)]"
            >
              <Plus className="size-3.5" />
              <span>New chat</span>
            </button>
          </div>

          <div className="px-2.5 pb-2">
            <div className="flex items-center gap-1.5 rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 py-1">
              <Search className="size-3 shrink-0 text-[var(--xd-ink-muted)]" />
              <input
                type="search"
                value={threadSearch}
                onChange={(event) => setThreadSearch(event.target.value)}
                placeholder="Search threads…"
                aria-label="Search chat threads"
                className="w-full bg-transparent text-[11.5px] text-[var(--xd-ink)] outline-none placeholder:text-[var(--xd-ink-muted)]"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
            {filteredThreads.length === 0 ? (
              <p className="px-2.5 py-6 text-center text-[11.5px] text-[var(--xd-ink-muted)]">
                No matching chats.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {filteredThreads.map((thread) => {
                  const selected = thread.id === activeThread?.id
                  const appliedCount = thread.messages.reduce(
                    (count, m) =>
                      count +
                      (m.actions?.filter((a) => a.status === 'applied')
                        .length ?? 0),
                    0,
                  )
                  return (
                    <li key={thread.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => onSelectThread(thread.id)}
                        className={cn(
                          'flex w-full items-start justify-between gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
                          selected
                            ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                            : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {thread.pinned && (
                              <Pin className="size-3 shrink-0 text-[var(--xd-accent)]" />
                            )}
                            <span className="truncate text-[12px] font-medium">
                              {thread.title}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-[var(--xd-ink-muted)]">
                            <span>{formatThreadTime(thread.updatedAt)}</span>
                            {appliedCount > 0 && (
                              <span className="text-[var(--xd-commit)]">
                                {appliedCount} edited
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      {(onTogglePinThread || onDeleteThread) && (
                        <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded bg-[var(--xd-rail)]/90 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          {onTogglePinThread && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                onTogglePinThread(thread.id)
                              }}
                              aria-label={
                                thread.pinned ? 'Unpin chat' : 'Pin chat'
                              }
                              className="inline-flex size-5 items-center justify-center rounded text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
                            >
                              <Pin className="size-3" />
                            </button>
                          )}
                          {onDeleteThread && threads.length > 1 && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                onDeleteThread(thread.id)
                              }}
                              aria-label={`Delete ${thread.title}`}
                              className="inline-flex size-5 items-center justify-center rounded text-[var(--xd-ink-muted)] hover:bg-[var(--xd-danger-soft)] hover:text-[var(--xd-danger)]"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>
      )}

      {/* Main Conversational Column */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Slim Thread Header Bar */}
        <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-[var(--xd-border)] px-3.5">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setHistoryOpen((prev) => !prev)}
              aria-label={historyOpen ? 'Hide chat history' : 'Show chat history'}
              title={historyOpen ? 'Hide chat history' : 'Show chat history'}
              className="inline-flex size-7 items-center justify-center rounded-md text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
            >
              <PanelLeft className="size-4" />
            </button>

            {!historyOpen && (
              <button
                type="button"
                onClick={() => {
                  setContextRefs([])
                  onNewThread()
                }}
                aria-label="New chat"
                title="New chat"
                className="inline-flex size-7 items-center justify-center rounded-md text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
              >
                <Plus className="size-4" />
              </button>
            )}

            {editingTitle && activeThread && onRenameThread ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  const trimmed = titleDraft.trim()
                  if (trimmed) onRenameThread(activeThread.id, trimmed)
                  setEditingTitle(false)
                }}
                className="min-w-0"
              >
                <input
                  type="text"
                  autoFocus
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onBlur={() => {
                    const trimmed = titleDraft.trim()
                    if (trimmed) onRenameThread(activeThread.id, trimmed)
                    setEditingTitle(false)
                  }}
                  className="h-7 rounded border border-[var(--xd-accent)] bg-[var(--xd-rail)] px-2 text-[13px] font-medium text-[var(--xd-ink)] outline-none"
                />
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (!activeThread || !onRenameThread) return
                  setTitleDraft(activeThread.title)
                  setEditingTitle(true)
                }}
                title={onRenameThread ? 'Click to rename thread' : undefined}
                className="flex min-w-0 items-center gap-2 rounded px-1.5 py-0.5 text-left hover:bg-[var(--xd-surface-hover)]"
              >
                <MessageSquare className="size-3.5 shrink-0 text-[var(--xd-ink-muted)]" />
                <span className="truncate text-[13px] font-medium text-[var(--xd-ink)]">
                  {activeThread?.title || 'New chat'}
                </span>
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2 text-[11.5px] text-[var(--xd-ink-muted)]">
            <span className="xd-tabular inline-flex items-center gap-1.5 rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2 py-1">
              <HardDrive className="size-3 text-[var(--xd-ink-muted)]" />
              <span>
                {docs.length} {docs.length === 1 ? 'file' : 'files'}
                {folders.length > 0
                  ? `, ${folders.length} ${folders.length === 1 ? 'folder' : 'folders'}`
                  : ''}
              </span>
            </span>

            {!hasConnectedProvider && onOpenProviders && (
              <button
                type="button"
                onClick={onOpenProviders}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] px-2.5 text-[11.5px] font-medium text-[var(--xd-accent)] transition-colors hover:bg-[var(--xd-accent)] hover:text-white"
              >
                <KeyRound className="size-3" />
                <span>Connect provider</span>
              </button>
            )}
          </div>
        </header>

        {/* Scrollable Conversation or Centered Empty State */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {isEmpty ? (
            <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center px-6 py-10">
              <div className="space-y-2.5">
                <h1 className="xd-serif text-[28px] font-medium tracking-[-0.024em] text-[var(--xd-ink)] sm:text-[32px]">
                  What do you want to work on across your Drive?
                </h1>
                <p className="max-w-[58ch] text-[13.5px] leading-relaxed text-[var(--xd-ink-secondary)]">
                  Ask questions across all {docs.length} documents, compare
                  results, reorganize folders, or edit and create{' '}
                  <span className="xd-mono text-[12px]">.mrbl</span> files in
                  place.
                </p>
              </div>

              <div className="mt-7">
                <ChatComposer
                  value={draft}
                  onChange={setDraft}
                  onSubmit={handleSubmit}
                  onStop={onStopStreaming}
                  isStreaming={isStreaming}
                  models={models}
                  selectedModelId={selectedModelId}
                  onSelectModel={onSelectModel}
                  reasoningEffort={reasoningEffort}
                  onSelectReasoningEffort={onSelectReasoningEffort}
                  mode={mode}
                  onSelectMode={onSelectMode}
                  docs={docs}
                  folders={folders}
                  contextRefs={contextRefs}
                  onAddContextRef={handleAddContextRef}
                  onRemoveContextRef={handleRemoveContextRef}
                  onOpenProviders={onOpenProviders}
                />
              </div>

              {/* Quiet, real-drive starter prompts (no generic card grid) */}
              <div className="mt-6 divide-y divide-[var(--xd-border)] border-t border-[var(--xd-border)]">
                {starterPrompts.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setDraft(item.prompt)
                    }}
                    className="flex w-full items-center justify-between gap-4 py-2.5 text-left text-[12.5px] text-[var(--xd-ink-secondary)] transition-colors hover:text-[var(--xd-ink)]"
                  >
                    <span className="truncate">{item.label}</span>
                    <span className="shrink-0 text-[11px] text-[var(--xd-ink-muted)]">
                      Use prompt
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-6 pt-7 pb-10">
              {messages.map((message) => (
                <ChatMessageItem
                  key={message.id}
                  message={message}
                  docsById={docsById}
                  onOpenDocument={onOpenDocument}
                  onOpenFolder={onOpenFolder}
                  onApplyAction={onApplyAction}
                  onApplyAllActions={onApplyAllActions}
                  onDiscardAction={onDiscardAction}
                  onDiscardAllActions={onDiscardAllActions}
                  onUndoAction={onUndoAction}
                  onRegenerate={onRegenerate}
                  onOpenProviders={onOpenProviders}
                />
              ))}
            </div>
          )}
        </div>

        {/* Scroll to latest pill */}
        {showScrollBottom && !isEmpty && (
          <div className="pointer-events-none absolute right-0 bottom-36 left-0 flex justify-center">
            <button
              type="button"
              onClick={scrollToBottom}
              className="pointer-events-auto inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] px-3 text-[11.5px] font-medium text-[var(--xd-ink)] shadow-md transition-colors hover:bg-[var(--xd-surface-hover)]"
            >
              <ArrowDown className="size-3" />
              <span>Latest</span>
            </button>
          </div>
        )}

        {/* Bottom Docked Composer when conversation is active */}
        {!isEmpty && (
          <div className="shrink-0 px-4 pt-2 pb-4">
            <div className="mx-auto w-full max-w-3xl">
              <ChatComposer
                value={draft}
                onChange={setDraft}
                onSubmit={handleSubmit}
                onStop={onStopStreaming}
                isStreaming={isStreaming}
                models={models}
                selectedModelId={selectedModelId}
                onSelectModel={onSelectModel}
                reasoningEffort={reasoningEffort}
                onSelectReasoningEffort={onSelectReasoningEffort}
                mode={mode}
                onSelectMode={onSelectMode}
                docs={docs}
                folders={folders}
                contextRefs={contextRefs}
                onAddContextRef={handleAddContextRef}
                onRemoveContextRef={handleRemoveContextRef}
                onOpenProviders={onOpenProviders}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
