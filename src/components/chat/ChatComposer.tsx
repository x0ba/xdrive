import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  ArrowUp,
  AtSign,
  Brain,
  Check,
  ChevronDown,
  Eye,
  Folder,
  Globe,
  KeyRound,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  X,
  Zap,
} from 'lucide-react'
import { getCategoryIcon } from '#/components/design-system/NavigationShell'
import { getFolderPathLabel } from '#/components/design-system/DriveExplorer'
import type { DriveFolder, MarbleDocumentFile } from '#/lib/types'
import {
  DRIVE_CHAT_MODE_META,
  REASONING_EFFORT_META,
} from '#/lib/ai/drive-chat-types'
import type {
  DriveChatMode,
  DriveChatModelOption,
  DriveContextRef,
  ReasoningEffort,
} from '#/lib/ai/drive-chat-types'
import { cn } from '#/lib/utils'

export interface ChatComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onStop?: () => void
  isStreaming?: boolean
  disabled?: boolean
  models: DriveChatModelOption[]
  selectedModelId: string
  onSelectModel: (modelId: string) => void
  reasoningEffort: ReasoningEffort
  onSelectReasoningEffort: (effort: ReasoningEffort) => void
  mode: DriveChatMode
  onSelectMode: (mode: DriveChatMode) => void
  docs: MarbleDocumentFile[]
  folders: DriveFolder[]
  contextRefs: DriveContextRef[]
  onAddContextRef: (ref: DriveContextRef) => void
  onRemoveContextRef: (ref: DriveContextRef) => void
  onOpenProviders?: () => void
  placeholder?: string
  className?: string
}

type OpenMenu = 'context' | 'model' | 'reasoning' | 'mode' | null

function SignalBars({
  bars,
  className,
}: {
  bars: number
  className?: string
}) {
  return (
    <span
      className={cn('inline-flex items-end gap-[2px]', className)}
      aria-hidden="true"
    >
      {[1, 2, 3, 4].map((level) => {
      const active = level <= bars
      const heights = ['h-1.5', 'h-2', 'h-2.5', 'h-3']
      return (
        <span
          key={level}
          className={cn(
            'w-[2.5px] rounded-[1px] transition-colors',
            heights[level - 1],
            active
              ? 'bg-[var(--xd-accent)]'
              : 'bg-[var(--xd-ink-subtle)]/45',
          )}
        />
      )
      })}
    </span>
  )
}

function ProviderStatusDot({
  status,
}: {
  status: DriveChatModelOption['status']
}) {
  if (status === 'active') {
    return (
      <span
        className="size-1.5 shrink-0 rounded-full bg-[var(--xd-commit)]"
        aria-label="Connected"
      />
    )
  }
  if (status === 'rate_limited') {
    return (
      <span
        className="size-1.5 shrink-0 rounded-full bg-[var(--xd-sketch)]"
        aria-label="Rate limited"
      />
    )
  }
  return (
    <span
      className="size-1.5 shrink-0 rounded-full bg-[var(--xd-ink-subtle)]"
      aria-label="Disconnected"
    />
  )
}

function ModeIcon({
  mode,
  className = 'size-3.5',
}: {
  mode: DriveChatMode
  className?: string
}) {
  if (mode === 'ask') return <Eye className={className} />
  if (mode === 'auto') return <Zap className={className} />
  return <ShieldCheck className={className} />
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming = false,
  disabled = false,
  models,
  selectedModelId,
  onSelectModel,
  reasoningEffort,
  onSelectReasoningEffort,
  mode,
  onSelectMode,
  docs,
  folders,
  contextRefs,
  onAddContextRef,
  onRemoveContextRef,
  onOpenProviders,
  placeholder = 'Ask anything across your Drive, or describe edits to make…',
  className,
}: ChatComposerProps) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
  const [modelSearch, setModelSearch] = useState('')
  const [contextSearch, setContextSearch] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const textareaId = useId()

  const activeModel = useMemo(
    () =>
      models.find((m) => m.id === selectedModelId) ??
      models.find((m) => m.connected) ??
      models.at(0) ??
      null,
    [models, selectedModelId],
  )

  const supportedEfforts: ReasoningEffort[] =
    activeModel && activeModel.reasoningEfforts.length > 0
      ? activeModel.reasoningEfforts
      : ['off', 'low', 'medium', 'high', 'max']

  const effectiveEffort: ReasoningEffort = supportedEfforts.includes(
    reasoningEffort,
  )
    ? reasoningEffort
    : (supportedEfforts.at(-1) ?? 'off')

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [value])

  useEffect(() => {
    if (!openMenu) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenMenu(null)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [openMenu])

  const groupedModels = useMemo(() => {
    const needle = modelSearch.trim().toLowerCase()
    const filtered = needle
      ? models.filter((model) =>
          `${model.name} ${model.providerName} ${model.id} ${model.description ?? ''}`
            .toLowerCase()
            .includes(needle),
        )
      : models
    const groups: Array<{
      providerId: string
      providerName: string
      connected: boolean
      models: DriveChatModelOption[]
    }> = []
    for (const model of filtered) {
      let group = groups.find((g) => g.providerId === model.providerId)
      if (!group) {
        group = {
          providerId: model.providerId,
          providerName: model.providerName,
          connected: model.connected,
          models: [],
        }
        groups.push(group)
      }
      group.models.push(model)
    }
    groups.sort((a, b) => Number(b.connected) - Number(a.connected))
    return groups
  }, [models, modelSearch])

  const attachedKeys = useMemo(
    () => new Set(contextRefs.map((ref) => `${ref.kind}:${ref.id}`)),
    [contextRefs],
  )

  const filteredFolders = useMemo(() => {
    const needle = contextSearch.trim().toLowerCase()
    return folders.filter((folder) =>
      needle
        ? getFolderPathLabel(folders, folder.id).toLowerCase().includes(needle)
        : true,
    )
  }, [folders, contextSearch])

  const filteredDocs = useMemo(() => {
    const needle = contextSearch.trim().toLowerCase()
    return docs.filter((doc) =>
      needle
        ? `${doc.title} ${doc.fileName} ${doc.folder} ${doc.tags.join(' ')}`
            .toLowerCase()
            .includes(needle)
        : true,
    )
  }, [docs, contextSearch])

  const canSend = !disabled && !isStreaming && value.trim().length > 0

  function handleTextareaChange(next: string) {
    onChange(next)
    // Open inline @ context picker when user types "@" at start or after whitespace.
    if (/(?:^|\s)@$/.test(next)) {
      setContextSearch('')
      setOpenMenu('context')
    }
  }

  function pickContext(ref: DriveContextRef) {
    const key = `${ref.kind}:${ref.id}`
    if (attachedKeys.has(key)) {
      onRemoveContextRef(ref)
    } else {
      onAddContextRef(ref)
      if (/(?:^|\s)@$/.test(value)) {
        onChange(value.replace(/@$/, ''))
      }
    }
    setOpenMenu(null)
    textareaRef.current?.focus()
  }

  const modeMeta = DRIVE_CHAT_MODE_META[mode]
  const effortMeta = REASONING_EFFORT_META[effectiveEffort]

  return (
    <div
      ref={rootRef}
      data-component="drive-chat-composer"
      className={cn(
        'relative rounded-xl border border-[var(--xd-border-strong)] bg-[var(--xd-rail)] transition-colors focus-within:border-[var(--xd-accent)]/70',
        className,
      )}
    >
      {/* Attached @ context chips */}
      {contextRefs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--xd-border)] px-3 pt-2.5 pb-2">
          {contextRefs.map((ref) => {
            const key = `${ref.kind}:${ref.id}`
            return (
              <span
                key={key}
                className="inline-flex max-w-[220px] items-center gap-1.5 rounded-md border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--xd-ink)]"
              >
                {ref.kind === 'folder' ? (
                  <Folder className="size-3 shrink-0 text-[var(--xd-accent)]" />
                ) : (
                  <span className="shrink-0 text-[var(--xd-accent)]">
                    {getCategoryIcon(ref.category, 'size-3')}
                  </span>
                )}
                <span className="truncate">
                  {ref.kind === 'folder' ? ref.name : ref.title}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveContextRef(ref)}
                  aria-label={`Remove ${ref.kind === 'folder' ? ref.name : ref.title}`}
                  className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-active)] hover:text-[var(--xd-ink)]"
                >
                  <X className="size-2.5" />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* Main Prompt Input */}
      <div className="px-3.5 pt-3 pb-1.5">
        <label htmlFor={textareaId} className="sr-only">
          Message xDrive Assistant
        </label>
        <textarea
          ref={textareaRef}
          id={textareaId}
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(event) => handleTextareaChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              if (canSend) onSubmit()
            }
          }}
          placeholder={placeholder}
          className="max-h-[200px] min-h-[42px] w-full resize-none bg-transparent text-[14px] leading-relaxed text-[var(--xd-ink)] outline-none placeholder:text-[var(--xd-ink-muted)] disabled:opacity-50"
        />
      </div>

      {/* Bottom T3-Code-Style Picker & Send Dock */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
        <div className="flex flex-wrap items-center gap-1">
          {/* 1. @ Context Scope Picker */}
          <div className="relative">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={openMenu === 'context'}
              onClick={() => {
                setContextSearch('')
                setOpenMenu((prev) => (prev === 'context' ? null : 'context'))
              }}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-colors',
                openMenu === 'context' || contextRefs.length > 0
                  ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                  : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
              )}
            >
              {contextRefs.length > 0 ? (
                <AtSign className="size-3.5 text-[var(--xd-accent)]" />
              ) : (
                <Globe className="size-3.5 text-[var(--xd-ink-muted)]" />
              )}
              <span>
                {contextRefs.length > 0
                  ? `${contextRefs.length} pinned`
                  : 'Entire Drive'}
              </span>
            </button>

            {openMenu === 'context' && (
              <div
                role="dialog"
                aria-label="Pin Drive files or folders"
                className="absolute bottom-full left-0 z-40 mb-2 w-72 overflow-hidden rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] shadow-xl"
              >
                <div className="flex items-center gap-2 border-b border-[var(--xd-border)] px-2.5 py-2">
                  <Search className="size-3.5 shrink-0 text-[var(--xd-ink-muted)]" />
                  <input
                    type="text"
                    autoFocus
                    value={contextSearch}
                    onChange={(event) => setContextSearch(event.target.value)}
                    placeholder="Pin a file or folder…"
                    className="w-full bg-transparent text-[12px] text-[var(--xd-ink)] outline-none placeholder:text-[var(--xd-ink-muted)]"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto p-1.5">
                  <p className="px-2 py-1 text-[11px] text-[var(--xd-ink-muted)]">
                    All Drive files stay searchable; pinned items include full
                    source.
                  </p>

                  {filteredFolders.length > 0 && (
                    <div className="mt-1">
                      <p className="px-2 py-1 text-[11px] font-medium text-[var(--xd-ink-muted)]">
                        Folders
                      </p>
                      {filteredFolders.map((folder) => {
                        const selected = attachedKeys.has(`folder:${folder.id}`)
                        const pathLabel = getFolderPathLabel(folders, folder.id)
                        return (
                          <button
                            key={folder.id}
                            type="button"
                            onClick={() =>
                              pickContext({
                                kind: 'folder',
                                id: folder.id,
                                name: pathLabel,
                              })
                            }
                            className={cn(
                              'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors',
                              selected
                                ? 'bg-[var(--xd-accent-soft)] text-[var(--xd-ink)]'
                                : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <Folder className="size-3.5 shrink-0 text-[var(--xd-ink-muted)]" />
                              <span className="truncate">{pathLabel}</span>
                            </span>
                            {selected && (
                              <Check className="size-3.5 shrink-0 text-[var(--xd-accent)]" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {filteredDocs.length > 0 && (
                    <div className="mt-1">
                      <p className="px-2 py-1 text-[11px] font-medium text-[var(--xd-ink-muted)]">
                        Files
                      </p>
                      {filteredDocs.map((doc) => {
                        const selected = attachedKeys.has(`doc:${doc.id}`)
                        return (
                          <button
                            key={doc.id}
                            type="button"
                            onClick={() =>
                              pickContext({
                                kind: 'doc',
                                id: doc.id,
                                title: doc.title,
                                fileName: doc.fileName,
                                category: doc.category,
                              })
                            }
                            className={cn(
                              'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors',
                              selected
                                ? 'bg-[var(--xd-accent-soft)] text-[var(--xd-ink)]'
                                : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="shrink-0 text-[var(--xd-ink-muted)]">
                                {getCategoryIcon(doc.category, 'size-3.5')}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate font-medium text-[var(--xd-ink)]">
                                  {doc.title}
                                </span>
                                <span className="xd-mono block truncate text-[10.5px] text-[var(--xd-ink-muted)]">
                                  {doc.fileName}
                                </span>
                              </span>
                            </span>
                            {selected && (
                              <Check className="size-3.5 shrink-0 text-[var(--xd-accent)]" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {filteredFolders.length === 0 && filteredDocs.length === 0 && (
                    <p className="px-2 py-4 text-center text-[12px] text-[var(--xd-ink-muted)]">
                      No matching files or folders.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <span className="h-3.5 w-px bg-[var(--xd-border)]" aria-hidden="true" />

          {/* 2. Provider + Model Picker */}
          <div className="relative">
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={openMenu === 'model'}
              onClick={() => {
                setModelSearch('')
                setOpenMenu((prev) => (prev === 'model' ? null : 'model'))
              }}
              className={cn(
                'inline-flex h-7 max-w-[220px] items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-colors',
                openMenu === 'model'
                  ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                  : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
              )}
            >
            {activeModel ? (
              <ProviderStatusDot status={activeModel.status} />
            ) : (
              <Sparkles className="size-3.5 text-[var(--xd-ink-muted)]" />
            )}
            <span className="truncate">
              {activeModel ? activeModel.name : 'Select model'}
            </span>
              <ChevronDown className="size-3 shrink-0 text-[var(--xd-ink-muted)]" />
            </button>

            {openMenu === 'model' && (
              <div
                role="listbox"
                aria-label="Select AI provider and model"
                className="absolute bottom-full left-0 z-40 mb-2 w-80 overflow-hidden rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] shadow-xl"
              >
                <div className="flex items-center gap-2 border-b border-[var(--xd-border)] px-2.5 py-2">
                  <Search className="size-3.5 shrink-0 text-[var(--xd-ink-muted)]" />
                  <input
                    type="text"
                    autoFocus
                    value={modelSearch}
                    onChange={(event) => setModelSearch(event.target.value)}
                    placeholder="Filter models or providers…"
                    className="w-full bg-transparent text-[12px] text-[var(--xd-ink)] outline-none placeholder:text-[var(--xd-ink-muted)]"
                  />
                </div>

                <div className="max-h-72 overflow-y-auto p-1.5">
                  {groupedModels.map((group) => (
                    <div key={group.providerId} className="mb-2 last:mb-0">
                      <div className="flex items-center justify-between px-2 py-1">
                        <span className="text-[11px] font-medium text-[var(--xd-ink-muted)]">
                          {group.providerName}
                        </span>
                        <span
                          className={cn(
                            'text-[10.5px]',
                            group.connected
                              ? 'text-[var(--xd-commit)]'
                              : 'text-[var(--xd-ink-subtle)]',
                          )}
                        >
                          {group.connected ? 'Connected' : 'Disconnected'}
                        </span>
                      </div>

                      {group.models.map((model) => {
                        const isSelected = activeModel?.id === model.id
                        return (
                          <button
                            key={model.id}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              onSelectModel(model.id)
                              setOpenMenu(null)
                            }}
                            className={cn(
                              'flex w-full items-start justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                              isSelected
                                ? 'bg-[var(--xd-accent-soft)] text-[var(--xd-ink)]'
                                : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <ProviderStatusDot status={model.status} />
                                <span className="truncate text-[12px] font-medium text-[var(--xd-ink)]">
                                  {model.name}
                                </span>
                                {model.supportsReasoning && (
                                  <Brain
                                    className="size-3 shrink-0 text-[var(--xd-ink-muted)]"
                                    aria-label="Supports reasoning"
                                  />
                                )}
                              </div>
                              {model.description && (
                                <p className="mt-0.5 truncate pl-3 text-[11px] text-[var(--xd-ink-muted)]">
                                  {model.description}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                              <span className="xd-mono text-[10.5px] text-[var(--xd-ink-muted)]">
                                {model.contextWindow}
                              </span>
                              {isSelected && (
                                <Check className="size-3.5 text-[var(--xd-accent)]" />
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ))}

                  {groupedModels.length === 0 && (
                    <p className="px-2 py-4 text-center text-[12px] text-[var(--xd-ink-muted)]">
                      No matching models.
                    </p>
                  )}
                </div>

                {onOpenProviders && (
                  <div className="border-t border-[var(--xd-border)] bg-[var(--xd-rail)] p-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenu(null)
                        onOpenProviders()
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] font-medium text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
                    >
                      <KeyRound className="size-3.5 text-[var(--xd-ink-muted)]" />
                      <span>Manage providers &amp; plans</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Reasoning Effort Picker */}
          <div className="relative">
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={openMenu === 'reasoning'}
              disabled={!activeModel?.supportsReasoning}
              onClick={() =>
                setOpenMenu((prev) =>
                  prev === 'reasoning' ? null : 'reasoning',
                )
              }
              title={
                activeModel?.supportsReasoning
                  ? `Reasoning effort: ${effortMeta.label}`
                  : 'Selected model does not expose reasoning controls'
              }
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                openMenu === 'reasoning'
                  ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                  : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
              )}
            >
              <SignalBars bars={effortMeta.bars} />
              <span>{effortMeta.label}</span>
              <ChevronDown className="size-3 shrink-0 text-[var(--xd-ink-muted)]" />
            </button>

            {openMenu === 'reasoning' && (
              <div
                role="listbox"
                aria-label="Select reasoning effort"
                className="absolute bottom-full left-0 z-40 mb-2 w-64 overflow-hidden rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] p-1.5 shadow-xl"
              >
                <p className="px-2 py-1 text-[11px] font-medium text-[var(--xd-ink-muted)]">
                  Reasoning effort
                </p>
                {supportedEfforts.map((effort) => {
                  const meta = REASONING_EFFORT_META[effort]
                  const selected = effectiveEffort === effort
                  return (
                    <button
                      key={effort}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onSelectReasoningEffort(effort)
                        setOpenMenu(null)
                      }}
                      className={cn(
                        'flex w-full items-start justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                        selected
                          ? 'bg-[var(--xd-accent-soft)] text-[var(--xd-ink)]'
                          : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <SignalBars bars={meta.bars} className="mt-1" />
                        <div>
                          <div className="text-[12px] font-medium text-[var(--xd-ink)]">
                            {meta.label}
                          </div>
                          <div className="text-[11px] text-[var(--xd-ink-muted)]">
                            {meta.description}
                          </div>
                        </div>
                      </div>
                      {selected && (
                        <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--xd-accent)]" />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 4. Drive Permission / Execution Mode Picker */}
          <div className="relative">
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={openMenu === 'mode'}
              onClick={() =>
                setOpenMenu((prev) => (prev === 'mode' ? null : 'mode'))
              }
              title={modeMeta.description}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-colors',
                openMenu === 'mode'
                  ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                  : mode === 'auto'
                    ? 'text-[var(--xd-commit)] hover:bg-[var(--xd-surface-hover)]'
                    : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
              )}
            >
              <ModeIcon mode={mode} className="size-3.5" />
              <span>{modeMeta.shortLabel}</span>
              <ChevronDown className="size-3 shrink-0 text-[var(--xd-ink-muted)]" />
            </button>

            {openMenu === 'mode' && (
              <div
                role="listbox"
                aria-label="Drive modification mode"
                className="absolute bottom-full left-0 z-40 mb-2 w-72 overflow-hidden rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] p-1.5 shadow-xl"
              >
                <p className="px-2 py-1 text-[11px] font-medium text-[var(--xd-ink-muted)]">
                  Drive access
                </p>
                {(['ask', 'review', 'auto'] as DriveChatMode[]).map((item) => {
                  const meta = DRIVE_CHAT_MODE_META[item]
                  const selected = mode === item
                  return (
                    <button
                      key={item}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onSelectMode(item)
                        setOpenMenu(null)
                      }}
                      className={cn(
                        'flex w-full items-start justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                        selected
                          ? 'bg-[var(--xd-accent-soft)] text-[var(--xd-ink)]'
                          : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <ModeIcon
                          mode={item}
                          className={cn(
                            'mt-0.5 size-3.5 shrink-0',
                            item === 'auto'
                              ? 'text-[var(--xd-commit)]'
                              : item === 'review'
                                ? 'text-[var(--xd-accent)]'
                                : 'text-[var(--xd-ink-muted)]',
                          )}
                        />
                        <div>
                          <div className="text-[12px] font-medium text-[var(--xd-ink)]">
                            {meta.label}
                          </div>
                          <div className="text-[11px] leading-snug text-[var(--xd-ink-muted)]">
                            {meta.description}
                          </div>
                        </div>
                      </div>
                      {selected && (
                        <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--xd-accent)]" />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Send or Stop button */}
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop response"
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] px-2.5 text-[12px] font-medium text-[var(--xd-ink)] transition-colors hover:bg-[var(--xd-surface-hover)]"
            >
              <Square className="size-3 fill-current" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSend}
              aria-label="Send message"
              className="inline-flex size-7 items-center justify-center rounded-md bg-[var(--xd-accent)] text-white transition-colors hover:bg-[var(--xd-accent-hover)] disabled:cursor-not-allowed disabled:bg-[var(--xd-surface-active)] disabled:text-[var(--xd-ink-muted)]"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
