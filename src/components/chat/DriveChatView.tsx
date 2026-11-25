import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  Check,
  ChevronDown,
  Folder,
  Globe,
  KeyRound,
  PanelLeft,
  Pin,
  Search,
  SquarePen,
  Trash2,
} from 'lucide-react'
import { getFolderPathLabel } from '#/components/design-system/DriveExplorer'
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
  favoriteModelIds?: string[]
  onFavoriteModelIdsChange?: (ids: string[]) => void
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

  if (nonEvergreen.length === 0) {
    return [
      {
        label: 'Create a new document',
        prompt:
          'Create a new .mrbl document titled "Project Notes" with an overview, key questions, and next steps.',
      },
      {
        label: 'Set up Drive folders',
        prompt:
          'Create a clean starter folder structure in my Drive for Notes, Docs, and Slides.',
      },
      {
        label: 'Draft a slide deck',
        prompt:
          'Create a new 5-slide .mrbl presentation outlining a project proposal and timeline.',
      },
    ]
  }

  return [
    {
      label:
        firstDoc && secondDoc
          ? `Compare ${firstDoc.title} & ${secondDoc.title}`
          : 'Summarize findings across my Drive',
      prompt:
        firstDoc && secondDoc
          ? `Compare the key claims, numbers, and open questions across "${firstDoc.title}" and "${secondDoc.title}", and flag any inconsistencies.`
          : 'Summarize the key findings, metrics, and open questions across all files in my Drive.',
    },
    {
      label: firstFolder
        ? `Organize ${firstFolder.name} & tags`
        : 'Organize Drive folders & tags',
      prompt: firstFolder
        ? `Review the files across my Drive and organize related documents with cleaner tags and folder placement around "${firstFolder.name}".`
        : 'Review every file in my Drive, propose clear folders and consistent tags, and organize them for me.',
    },
    {
      label: 'Create an executive brief',
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
  favoriteModelIds,
  onFavoriteModelIdsChange,
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
  const [searchVisible, setSearchVisible] = useState(false)
  const [threadSearch, setThreadSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [contextRefs, setContextRefs] = useState<DriveContextRef[]>([])
  const [heroScopeOpen, setHeroScopeOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [showScrollBottom, setShowScrollBottom] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const heroScopeRef = useRef<HTMLDivElement>(null)
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
  }, [
    activeThreadId,
    messages.length,
    lastMessageContentLen,
    lastMessageActionsLen,
  ])

  useEffect(() => {
    if (!heroScopeOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!heroScopeRef.current?.contains(event.target as Node)) {
        setHeroScopeOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHeroScopeOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [heroScopeOpen])

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

  const pinnedFolderRef = contextRefs.find((ref) => ref.kind === 'folder')
  const heroScopeLabel = pinnedFolderRef ? pinnedFolderRef.name : 'My Drive'
  const isEmpty = messages.length === 0

  return (
    <div
      data-component="drive-chat-view"
      className={cn(
        'flex h-full min-h-0 w-full overflow-hidden bg-[var(--xd-canvas)] text-[var(--xd-ink)]',
        className,
      )}
    >
      {/* T3 Code Compact Thread Sidebar */}
      {historyOpen && (
        <aside
          aria-label="Chat threads"
          className="flex h-full w-[252px] shrink-0 flex-col border-r border-[var(--xd-border)] bg-[var(--xd-rail)]"
        >
          <div className="flex h-[52px] shrink-0 items-center justify-between gap-1 px-3">
            <span className="text-[12.5px] font-medium text-[var(--xd-ink-secondary)]">
              Threads
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => {
                  setSearchVisible((prev) => !prev)
                  if (searchVisible) setThreadSearch('')
                }}
                aria-label="Search threads"
                title="Search threads"
                className={cn(
                  'inline-flex size-7 items-center justify-center rounded-lg text-[var(--xd-ink-muted)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                  searchVisible &&
                    'bg-[var(--xd-surface-hover)] text-[var(--xd-ink)]',
                )}
              >
                <Search className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setContextRefs([])
                  onNewThread()
                }}
                aria-label="New thread"
                title="New thread"
                className="inline-flex size-7 items-center justify-center rounded-lg text-[var(--xd-ink-muted)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
              >
                <SquarePen className="size-3.5" />
              </button>
            </div>
          </div>

          {searchVisible && (
            <div className="px-2.5 pb-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2.5 py-1.5">
                <Search className="size-3 shrink-0 text-[var(--xd-ink-muted)]" />
                <input
                  type="search"
                  autoFocus
                  value={threadSearch}
                  onChange={(event) => setThreadSearch(event.target.value)}
                  placeholder="Filter threads…"
                  aria-label="Filter chat threads"
                  className="w-full bg-transparent text-[12px] text-[var(--xd-ink)] outline-none placeholder:text-[var(--xd-ink-muted)]"
                />
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {filteredThreads.length === 0 ? (
              <p className="px-2.5 py-6 text-center text-[12px] text-[var(--xd-ink-muted)]">
                No matching threads.
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
                  const threadStreaming = thread.messages.some(
                    (m) => m.isStreaming,
                  )
                  return (
                    <li key={thread.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => onSelectThread(thread.id)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors',
                          selected
                            ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                            : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                        )}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          {threadStreaming ? (
                            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-[var(--xd-accent)]" />
                          ) : thread.pinned ? (
                            <Pin className="size-3 shrink-0 text-[var(--xd-ink-muted)]" />
                          ) : appliedCount > 0 ? (
                            <span className="size-1.5 shrink-0 rounded-full bg-[var(--xd-commit)]" />
                          ) : null}
                          <span className="truncate text-[12.5px] font-medium">
                            {thread.title}
                          </span>
                        </span>

                        <span className="xd-tabular shrink-0 text-[11px] text-[var(--xd-ink-muted)] transition-opacity group-hover:opacity-0">
                          {formatThreadTime(thread.updatedAt)}
                        </span>
                      </button>

                      {(onTogglePinThread || onDeleteThread) && (
                        <div className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
                          {onTogglePinThread && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                onTogglePinThread(thread.id)
                              }}
                              aria-label={
                                thread.pinned ? 'Unpin thread' : 'Pin thread'
                              }
                              className="inline-flex size-6 items-center justify-center rounded-md text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
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
                              className="inline-flex size-6 items-center justify-center rounded-md text-[var(--xd-ink-muted)] hover:bg-[var(--xd-danger-soft)] hover:text-[var(--xd-danger)]"
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

      {/* Main Chat Canvas */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {/* T3 Code 52px Slim Breadcrumb Header */}
        <header className="flex h-[52px] shrink-0 items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setHistoryOpen((prev) => !prev)}
              aria-label={historyOpen ? 'Hide threads' : 'Show threads'}
              title={historyOpen ? 'Hide threads' : 'Show threads'}
              className="inline-flex size-7 items-center justify-center rounded-lg text-[var(--xd-ink-muted)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
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
                aria-label="New thread"
                title="New thread"
                className="inline-flex size-7 items-center justify-center rounded-lg text-[var(--xd-ink-muted)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
              >
                <SquarePen className="size-4" />
              </button>
            )}

            {!isEmpty && (
              <div className="ml-1 flex min-w-0 items-center gap-1.5 text-[13.5px]">
                <span className="shrink-0 text-[var(--xd-ink-muted)]">
                  Drive
                </span>
                <span className="shrink-0 text-[var(--xd-ink-subtle)]">/</span>

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
                      className="h-7 rounded-md bg-transparent px-1.5 text-[13.5px] font-medium text-[var(--xd-ink)] outline-none ring-1 ring-inset ring-[var(--xd-accent)]"
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
                    title={onRenameThread ? 'Rename thread' : undefined}
                    className="group/title inline-flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left font-medium text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)]"
                  >
                    <span className="truncate">
                      {activeThread?.title || 'New thread'}
                    </span>
                    {onRenameThread && (
                      <ChevronDown className="size-3.5 shrink-0 text-[var(--xd-ink-muted)] opacity-0 transition-opacity group-hover/title:opacity-100" />
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!hasConnectedProvider && onOpenProviders && (
              <button
                type="button"
                onClick={onOpenProviders}
                className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] px-2.5 text-[12px] font-medium text-[var(--xd-ink)] transition-colors hover:bg-[var(--xd-surface-hover)]"
              >
                <KeyRound className="size-3.5 text-[var(--xd-ink-muted)]" />
                <span>Connect provider</span>
              </button>
            )}
          </div>
        </header>

        {/* Scrollable Timeline OR Centered T3 Code Draft Hero */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {isEmpty ? (
            <div className="mx-auto flex min-h-full w-full max-w-[46rem] flex-col items-center justify-center px-5 pb-16">
              {/* T3 Code DraftHeroProjectHeading — centered sans-serif headline with inline Drive/Folder scope picker */}
              <div className="mb-7 flex w-full flex-col items-center text-center">
                <h1 className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 text-[24px] font-normal tracking-tight text-[var(--xd-ink)] sm:text-[30px]">
                  <span>What should we work on in</span>
                  <span ref={heroScopeRef} className="relative inline-flex">
                    <button
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={heroScopeOpen}
                      onClick={() => setHeroScopeOpen((prev) => !prev)}
                      className="inline-flex items-baseline gap-1 rounded-lg px-1.5 py-0.5 font-medium text-[var(--xd-ink)] transition-colors hover:bg-[var(--xd-surface-hover)]"
                    >
                      <span>{heroScopeLabel}</span>
                      <ChevronDown className="size-4 self-center text-[var(--xd-ink-muted)]" />
                    </button>

                    {heroScopeOpen && (
                      <div
                        role="listbox"
                        aria-label="Choose Drive scope"
                        className="absolute top-full left-1/2 z-40 mt-1.5 w-60 -translate-x-1/2 overflow-hidden rounded-xl border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] p-1.5 text-left shadow-2xl"
                      >
                        <button
                          type="button"
                          role="option"
                          aria-selected={!pinnedFolderRef}
                          onClick={() => {
                            setContextRefs((prev) =>
                              prev.filter((item) => item.kind !== 'folder'),
                            )
                            setHeroScopeOpen(false)
                          }}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors',
                            !pinnedFolderRef
                              ? 'bg-[var(--xd-surface-active)] font-medium text-[var(--xd-ink)]'
                              : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <Globe className="size-3.5 text-[var(--xd-ink-muted)]" />
                            <span>My Drive (All files)</span>
                          </span>
                          {!pinnedFolderRef && (
                            <Check className="size-3.5 text-[var(--xd-ink)]" />
                          )}
                        </button>

                        {folders.length > 0 && (
                          <div className="mt-1 border-t border-[var(--xd-border)] pt-1">
                            {folders.map((folder) => {
                              const pathLabel = getFolderPathLabel(
                                folders,
                                folder.id,
                              )
                              const selected = pinnedFolderRef?.id === folder.id
                              return (
                                <button
                                  key={folder.id}
                                  type="button"
                                  role="option"
                                  aria-selected={selected}
                                  onClick={() => {
                                    setContextRefs((prev) => [
                                      ...prev.filter(
                                        (item) => item.kind !== 'folder',
                                      ),
                                      {
                                        kind: 'folder',
                                        id: folder.id,
                                        name: pathLabel,
                                      },
                                    ])
                                    setHeroScopeOpen(false)
                                  }}
                                  className={cn(
                                    'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors',
                                    selected
                                      ? 'bg-[var(--xd-surface-active)] font-medium text-[var(--xd-ink)]'
                                      : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                                  )}
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    <Folder className="size-3.5 shrink-0 text-[var(--xd-ink-muted)]" />
                                    <span className="truncate">
                                      {pathLabel}
                                    </span>
                                  </span>
                                  {selected && (
                                    <Check className="size-3.5 shrink-0 text-[var(--xd-ink)]" />
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </span>
                  <span>?</span>
                </h1>
              </div>

              <ChatComposer
                value={draft}
                onChange={setDraft}
                onSubmit={handleSubmit}
                onStop={onStopStreaming}
                isStreaming={isStreaming}
                models={models}
                selectedModelId={selectedModelId}
                onSelectModel={onSelectModel}
                favoriteModelIds={favoriteModelIds}
                onFavoriteModelIdsChange={onFavoriteModelIdsChange}
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

              {/* Compact quiet prompt pills underneath the ContextStrip */}
              <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
                {starterPrompts.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setDraft(item.prompt)}
                    className="rounded-full border border-[var(--xd-border)] bg-[var(--xd-rail)]/60 px-3 py-1 text-[12px] text-[var(--xd-ink-secondary)] transition-colors hover:border-[var(--xd-border-strong)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-6 px-5 pt-4 pb-10">
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
          <div className="pointer-events-none absolute right-0 bottom-40 left-0 z-20 flex justify-center">
            <button
              type="button"
              onClick={scrollToBottom}
              className="pointer-events-auto inline-flex size-8 items-center justify-center rounded-full border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] text-[var(--xd-ink)] shadow-lg transition-colors hover:bg-[var(--xd-surface-hover)]"
              aria-label="Scroll to latest message"
            >
              <ArrowDown className="size-3.5" />
            </button>
          </div>
        )}

        {/* Floating Bottom Composer Dock when conversation is active */}
        {!isEmpty && (
          <div className="shrink-0 px-5 pt-1 pb-3">
            <ChatComposer
              value={draft}
              onChange={setDraft}
              onSubmit={handleSubmit}
              onStop={onStopStreaming}
              isStreaming={isStreaming}
              models={models}
              selectedModelId={selectedModelId}
              onSelectModel={onSelectModel}
              favoriteModelIds={favoriteModelIds}
              onFavoriteModelIdsChange={onFavoriteModelIdsChange}
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
        )}
      </div>
    </div>
  )
}
