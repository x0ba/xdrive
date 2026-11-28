import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  AtSign,
  Check,
  Eye,
  Folder,
  Globe,
  HardDrive,
  Plus,
  Search,
  ShieldCheck,
  Square,
  X,
  Zap,
} from 'lucide-react'
import { getCategoryIcon } from '#/components/design-system/NavigationShell'
import { getFolderPathLabel } from '#/components/design-system/DriveExplorer'
import { ModelPicker } from '#/components/model-picker'
import type { DriveFolder, MarbleDocumentFile } from '#/lib/types'
import { DRIVE_CHAT_MODE_META } from '#/lib/ai/drive-chat-types'
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
  favoriteModelIds?: string[]
  onFavoriteModelIdsChange?: (ids: string[]) => void
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
  showContextStrip?: boolean
  focusNonce?: number
  className?: string
}

type OpenMenu = 'context' | 'mode' | null

const COMPOSER_CONTROL_CLASS =
  'relative inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-transparent px-2 text-[12.5px] font-medium text-[var(--xd-ink-secondary)] outline-none transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--xd-accent)] disabled:pointer-events-none disabled:opacity-45'

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
  favoriteModelIds,
  onFavoriteModelIdsChange,
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
  placeholder = 'Ask anything, @ pin files, or edit across your Drive…',
  showContextStrip = true,
  focusNonce,
  className,
}: ChatComposerProps) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
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

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 210)}px`
  }, [value])

  useEffect(() => {
    if (!focusNonce) return
    const frame = window.requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      const len = el.value.length
      el.setSelectionRange(len, len)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusNonce])

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

  return (
    <div
      ref={rootRef}
      data-component="drive-chat-composer"
      className={cn('relative mx-auto w-full max-w-[46rem]', className)}
    >
      {/* T3 Code ComposerSurface.Host — rounded-2xl glass card with subtle outline */}
      <div className="relative rounded-2xl border border-[var(--xd-border-strong)]/80 bg-[var(--xd-elevated)]/92 shadow-[0_1px_2px_rgb(0_0_0/5%)] backdrop-blur-md transition-colors focus-within:border-[var(--xd-border-strong)] dark:bg-[var(--xd-elevated)]/88 dark:shadow-[inset_0_1px_0_rgb(255_255_255/4%),0_10px_28px_-18px_rgb(0_0_0/75%)]">
        {/* Attached @ context chips strip */}
        {contextRefs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-3.5 pt-3 pb-0.5">
            {contextRefs.map((ref) => {
              const key = `${ref.kind}:${ref.id}`
              return (
                <span
                  key={key}
                  className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)]/80 px-2 py-0.5 text-[11.5px] font-medium text-[var(--xd-ink)]"
                >
                  {ref.kind === 'folder' ? (
                    <Folder className="size-3 shrink-0 text-[var(--xd-ink-muted)]" />
                  ) : (
                    <span className="shrink-0 text-[var(--xd-ink-muted)]">
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
                    className="inline-flex size-3.5 shrink-0 items-center justify-center rounded text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
                  >
                    <X className="size-2.5" />
                  </button>
                </span>
              )
            })}
          </div>
        )}

        {/* Main Prompt Editor */}
        <div className="px-4 pt-3.5 pb-1.5">
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
            className="max-h-[210px] min-h-[44px] w-full resize-none bg-transparent text-[14px] leading-relaxed text-[var(--xd-ink)] outline-none placeholder:text-[var(--xd-ink-muted)] disabled:opacity-50"
          />
        </div>

        {/* Bottom Controls Bar (T3 Code ComposerControlsBar + ComposerPrimaryActions) */}
        <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-0.5">
            {/* 1. Shared T3-Code-style Model + Docked Reasoning Effort Picker */}
            <ModelPicker
              models={models}
              selectedModelId={selectedModelId}
              onSelectModel={onSelectModel}
              favoriteModelIds={favoriteModelIds}
              onFavoriteModelIdsChange={onFavoriteModelIdsChange}
              reasoningEffort={reasoningEffort}
              onSelectReasoningEffort={onSelectReasoningEffort}
              effortDisplay="both"
              onOpenProviders={onOpenProviders}
              size="sm"
              side="top"
              align="start"
              disabled={disabled}
            />

            {/* 3. Permissions / Drive Access Picker (T3 Code ComposerPermissionsSection segmented bar) */}
            <div className="relative">
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={openMenu === 'mode'}
                onClick={() =>
                  setOpenMenu((prev) => (prev === 'mode' ? null : 'mode'))
                }
                title={`Drive access: ${modeMeta.label}`}
                className={cn(
                  COMPOSER_CONTROL_CLASS,
                  openMenu === 'mode' &&
                    'bg-[var(--xd-surface-hover)] text-[var(--xd-ink)]',
                  mode === 'auto' && 'text-[var(--xd-commit)]',
                )}
              >
                <ModeIcon mode={mode} className="size-3.5" />
                <span>{modeMeta.shortLabel}</span>
              </button>

              {openMenu === 'mode' && (
                <div
                  role="dialog"
                  aria-label="Drive permissions"
                  className="absolute bottom-full left-0 z-50 mb-2 w-72 overflow-hidden rounded-xl border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] p-2.5 shadow-2xl"
                >
                  <p className="mb-2 text-[11px] font-medium text-[var(--xd-ink-muted)]">
                    Drive permissions
                  </p>
                  <div
                    role="radiogroup"
                    aria-label="Drive access mode"
                    className="grid grid-cols-3 gap-1 rounded-lg border border-[var(--xd-border)] bg-[var(--xd-rail)] p-1"
                  >
                    {(['ask', 'review', 'auto'] as DriveChatMode[]).map(
                      (item) => {
                        const meta = DRIVE_CHAT_MODE_META[item]
                        const selected = mode === item
                        return (
                          <button
                            key={item}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => {
                              onSelectMode(item)
                              setOpenMenu(null)
                            }}
                            className={cn(
                              'inline-flex h-7 items-center justify-center gap-1 rounded-md text-[11.5px] font-medium transition-colors',
                              selected
                                ? 'bg-[var(--xd-elevated)] text-[var(--xd-ink)] shadow-2xs ring-1 ring-[var(--xd-border-strong)]'
                                : 'text-[var(--xd-ink-muted)] hover:text-[var(--xd-ink)]',
                            )}
                          >
                            <ModeIcon mode={item} className="size-3" />
                            <span>{meta.shortLabel}</span>
                          </button>
                        )
                      },
                    )}
                  </div>
                  <p className="mt-2 text-[11.5px] leading-snug text-[var(--xd-ink-muted)]">
                    {modeMeta.description}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right side: Pin Context + Circular Send / Stop Button (T3 Code ComposerPrimaryActions) */}
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="relative">
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={openMenu === 'context'}
                onClick={() => {
                  setContextSearch('')
                  setOpenMenu((prev) => (prev === 'context' ? null : 'context'))
                }}
                aria-label="Pin Drive files or folders"
                title="Pin Drive files or folders (@)"
                className={cn(
                  COMPOSER_CONTROL_CLASS,
                  'size-7 px-0',
                  (openMenu === 'context' || contextRefs.length > 0) &&
                    'bg-[var(--xd-surface-hover)] text-[var(--xd-ink)]',
                )}
              >
                {contextRefs.length > 0 ? (
                  <AtSign className="size-3.5 text-[var(--xd-accent)]" />
                ) : (
                  <Plus className="size-4" />
                )}
              </button>

              {openMenu === 'context' && (
                <div
                  role="dialog"
                  aria-label="Pin Drive files or folders"
                  className="absolute right-0 bottom-full z-50 mb-2 w-72 overflow-hidden rounded-xl border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] shadow-2xl"
                >
                  <div className="flex items-center gap-2 border-b border-[var(--xd-border)] px-3 py-2">
                    <Search className="size-3.5 shrink-0 text-[var(--xd-ink-muted)]" />
                    <input
                      type="text"
                      autoFocus
                      value={contextSearch}
                      onChange={(event) => setContextSearch(event.target.value)}
                      placeholder="Pin a file or folder…"
                      className="w-full bg-transparent text-[12.5px] text-[var(--xd-ink)] outline-none placeholder:text-[var(--xd-ink-muted)]"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto p-1.5">
                    <p className="px-2 py-1 text-[11px] text-[var(--xd-ink-muted)]">
                      Entire Drive stays queryable; pinned items include full
                      source.
                    </p>

                    {filteredFolders.length > 0 && (
                      <div className="mt-1">
                        <p className="px-2 py-1 text-[11px] font-medium text-[var(--xd-ink-muted)]">
                          Folders
                        </p>
                        {filteredFolders.map((folder) => {
                          const selected = attachedKeys.has(
                            `folder:${folder.id}`,
                          )
                          const pathLabel = getFolderPathLabel(
                            folders,
                            folder.id,
                          )
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
                                'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors',
                                selected
                                  ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                                  : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                              )}
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <Folder className="size-3.5 shrink-0 text-[var(--xd-ink-muted)]" />
                                <span className="truncate">{pathLabel}</span>
                              </span>
                              {selected && (
                                <Check className="size-3.5 shrink-0 text-[var(--xd-ink)]" />
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
                                'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors',
                                selected
                                  ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
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
                                <Check className="size-3.5 shrink-0 text-[var(--xd-ink)]" />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {filteredFolders.length === 0 &&
                      filteredDocs.length === 0 && (
                        <p className="px-2 py-4 text-center text-[12px] text-[var(--xd-ink-muted)]">
                          No matching files or folders.
                        </p>
                      )}
                  </div>
                </div>
              )}
            </div>

            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop response"
                className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--xd-ink)] text-[var(--xd-canvas)] transition-opacity hover:opacity-90"
              >
                <Square className="size-3 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSend}
                aria-label="Send message"
                className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--xd-ink)] text-[var(--xd-canvas)] transition-all hover:opacity-90 active:scale-[0.96] disabled:cursor-not-allowed disabled:bg-[var(--xd-surface-active)] disabled:text-[var(--xd-ink-muted)]"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* T3 Code ComposerSurface.ContextStrip — bare metadata strip tucked underneath the glass card */}
      {showContextStrip && (
        <div
          data-slot="composer-context-strip"
          className="flex flex-wrap items-center justify-between gap-2 px-2.5 pt-2 text-[11.5px] text-[var(--xd-ink-muted)]"
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setContextSearch('')
                setOpenMenu((prev) => (prev === 'context' ? null : 'context'))
              }}
              className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:text-[var(--xd-ink)]"
            >
              {contextRefs.length > 0 ? (
                <AtSign className="size-3 text-[var(--xd-accent)]" />
              ) : (
                <Globe className="size-3" />
              )}
              <span>
                {contextRefs.length > 0
                  ? `${contextRefs.length} pinned · Entire Drive`
                  : 'Entire Drive'}
              </span>
            </button>

            <span className="xd-tabular inline-flex items-center gap-1">
              <HardDrive className="size-3" />
              <span>
                {docs.length} {docs.length === 1 ? 'file' : 'files'}
                {folders.length > 0
                  ? ` · ${folders.length} ${folders.length === 1 ? 'folder' : 'folders'}`
                  : ''}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {activeModel && (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    activeModel.status === 'active'
                      ? 'bg-[var(--xd-commit)]'
                      : activeModel.status === 'rate_limited'
                        ? 'bg-[var(--xd-sketch)]'
                        : 'bg-[var(--xd-ink-subtle)]',
                  )}
                />
                <span>{activeModel.providerName}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
