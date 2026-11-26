import React, { useEffect, useRef, useState } from 'react'
import {
  Search,
  LayoutGrid,
  LayoutPanelTop,
  List,
  ChevronDown,
  MoreVertical,
  Pencil,
  Star,
  Copy,
  Share2,
  ArrowUp,
  Pin,
  Trash2,
} from 'lucide-react'
import { AppContextMenu } from '#/components/apps/shared'
import type { ContextMenuItem } from '#/components/apps/shared'
import type { ReasoningEffort } from '#/lib/ai/drive-chat-types'
import { reasoningEffortForModel } from '#/lib/ai/drive-chat-client'
import type {
  MarbleAppCategory,
  MarbleDocumentFile,
  SharePermissionLevel,
  AIModelSpec,
} from '#/lib/types'
import {
  getCategoryIcon,
  getCategoryLabel,
  formatBytes,
} from './NavigationShell'
import { WorkspaceLink } from '#/components/routing/WorkspaceLink'
import { docHref } from '#/lib/routing'
import { ModelPicker } from '#/components/model-picker'
import type { ModelPickerInputOption } from '#/components/model-picker'

/* ============================================================================
   1. FilterPillBar — Clean Horizontal Filter & Search Bar
   ============================================================================ */

export type SortOption = 'updated' | 'nodes' | 'size' | 'title'
export type DriveViewMode = 'list' | 'icon' | 'preview'

export interface FilterPillBarProps {
  selectedCategory?: MarbleAppCategory | 'all'
  onSelectCategory?: (category: MarbleAppCategory | 'all') => void
  selectedAccess?: SharePermissionLevel | 'all'
  onSelectAccess?: (access: SharePermissionLevel | 'all') => void
  sortBy: SortOption
  onSelectSort?: (sort: SortOption) => void
  viewMode: DriveViewMode
  onChangeViewMode?: (mode: DriveViewMode) => void
  searchQuery: string
  onChangeSearchQuery?: (query: string) => void
  totalResults?: number
}

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'updated', label: 'Recent' },
  { value: 'title', label: 'Name' },
  { value: 'size', label: 'Size' },
]

export function FilterPillBar({
  sortBy,
  onSelectSort,
  viewMode,
  onChangeViewMode,
  searchQuery,
  onChangeSearchQuery,
}: FilterPillBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--xd-border)] pb-3 text-[12px]">
      <div className="relative flex min-w-0 flex-1 items-center sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[var(--xd-ink-muted)]" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onChangeSearchQuery?.(e.target.value)}
          placeholder="Filter files..."
          aria-label="Filter files"
          className="h-7 w-full rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] pr-2.5 pl-8 text-[12px] text-[var(--xd-ink)] placeholder:text-[var(--xd-ink-muted)] focus:border-[var(--xd-accent)] focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex items-center">
          <select
            aria-label="Sort files"
            value={sortBy}
            onChange={(e) => onSelectSort?.(e.target.value as SortOption)}
            className="h-7 appearance-none rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] pr-6 pl-2 text-[12px] text-[var(--xd-ink-secondary)] focus:border-[var(--xd-accent)] focus:outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option
                key={opt.value}
                value={opt.value}
                className="bg-[var(--xd-canvas)] text-[var(--xd-ink)]"
              >
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-[var(--xd-ink-muted)]" />
        </div>

        <div
          role="group"
          aria-label="View Mode"
          className="inline-flex items-center rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] p-0.5"
        >
          <button
            type="button"
            title="List view"
            aria-label="List view"
            aria-pressed={viewMode === 'list'}
            onClick={() => onChangeViewMode?.('list')}
            className={`inline-flex h-6 items-center gap-1 rounded-xs px-1.5 text-[11px] transition-colors ${
              viewMode === 'list'
                ? 'bg-[var(--xd-canvas)] font-medium text-[var(--xd-ink)] shadow-2xs'
                : 'text-[var(--xd-ink-muted)] hover:text-[var(--xd-ink)]'
            }`}
          >
            <List className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">List</span>
          </button>
          <button
            type="button"
            title="Icon view"
            aria-label="Icon view"
            aria-pressed={viewMode === 'icon'}
            onClick={() => onChangeViewMode?.('icon')}
            className={`inline-flex h-6 items-center gap-1 rounded-xs px-1.5 text-[11px] transition-colors ${
              viewMode === 'icon'
                ? 'bg-[var(--xd-canvas)] font-medium text-[var(--xd-ink)] shadow-2xs'
                : 'text-[var(--xd-ink-muted)] hover:text-[var(--xd-ink)]'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Icons</span>
          </button>
          <button
            type="button"
            title="Preview card view"
            aria-label="Preview card view"
            aria-pressed={viewMode === 'preview'}
            onClick={() => onChangeViewMode?.('preview')}
            className={`inline-flex h-6 items-center gap-1 rounded-xs px-1.5 text-[11px] transition-colors ${
              viewMode === 'preview'
                ? 'bg-[var(--xd-canvas)] font-medium text-[var(--xd-ink)] shadow-2xs'
                : 'text-[var(--xd-ink-muted)] hover:text-[var(--xd-ink)]'
            }`}
          >
            <LayoutPanelTop className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Cards</span>
          </button>
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
   2. MetricOverviewStrip — Quiet Single-Line Workspace Summary
   ============================================================================ */

export interface MetricOverviewStripProps {
  totalApps: number
  addressableNodes: number
  committedOps: number
  activeSubscriptions: number
  totalSubscriptions?: number
  totalByteSize?: number
}

export function MetricOverviewStrip({
  totalApps,
  addressableNodes,
  totalByteSize = 0,
}: MetricOverviewStripProps) {
  return (
    <div className="xd-tabular flex flex-wrap items-center gap-3 text-[12px] text-[var(--xd-ink-muted)]">
      <span>{totalApps} files</span>
      <span>·</span>
      <span>{addressableNodes.toLocaleString()} nodes</span>
      {totalByteSize > 0 && (
        <>
          <span>·</span>
          <span>{formatBytes(totalByteSize)}</span>
        </>
      )}
    </div>
  )
}

/* ============================================================================
   3. MarbleAppCard — Quiet Document Card
   ============================================================================ */

export interface MarbleAppCardProps {
  doc: MarbleDocumentFile
  onOpen?: (doc: MarbleDocumentFile) => void
  onDuplicate?: (doc: MarbleDocumentFile) => void
  onShare?: (doc: MarbleDocumentFile) => void
  onToggleStar?: (doc: MarbleDocumentFile) => void
  onTogglePin?: (doc: MarbleDocumentFile) => void
}

export function MarbleAppCard({
  doc,
  onOpen,
  onDuplicate,
  onShare,
  onToggleStar,
  onTogglePin,
}: MarbleAppCardProps) {
  const isEditorial = doc.category === 'latex' || doc.category === 'document'

  return (
    <article className="group relative flex cursor-pointer flex-col justify-between rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] p-4 transition-colors hover:border-[var(--xd-border-strong)]">
      <div>
        <div className="flex items-center justify-between gap-2 text-[11.5px] text-[var(--xd-ink-muted)]">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-[var(--xd-accent)]">
              {getCategoryIcon(doc.category, 'h-3.5 w-3.5')}
            </span>
            <span className="xd-mono truncate">{doc.fileName}</span>
            {doc.isEvergreen && (
              <span className="xd-mono shrink-0 rounded border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium leading-none text-[var(--xd-accent)]">
                Evergreen · AI Ref
              </span>
            )}
          </div>

          <div
            className="relative z-10 flex shrink-0 items-center gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            {onTogglePin && (
              <button
                type="button"
                onClick={() => onTogglePin(doc)}
                aria-label={doc.pinned ? 'Unpin' : 'Pin'}
                aria-pressed={doc.pinned}
                className={`inline-flex h-6 w-6 items-center justify-center rounded transition-colors ${
                  doc.pinned
                    ? 'text-[var(--xd-accent)]'
                    : 'text-[var(--xd-ink-muted)] opacity-0 group-hover:opacity-100 hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
                }`}
              >
                <Pin
                  className={`h-3 w-3 ${doc.pinned ? 'fill-current' : ''}`}
                />
              </button>
            )}
            <button
              type="button"
              onClick={() => onToggleStar?.(doc)}
              aria-label={doc.starred ? 'Remove star' : 'Star file'}
              aria-pressed={doc.starred}
              className={`inline-flex h-6 w-6 items-center justify-center rounded transition-colors ${
                doc.starred
                  ? 'text-[var(--xd-sketch)]'
                  : 'text-[var(--xd-ink-muted)] opacity-0 group-hover:opacity-100 hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
              }`}
            >
              <Star
                className={`h-3.5 w-3.5 ${doc.starred ? 'fill-current' : ''}`}
              />
            </button>
          </div>
        </div>

        <h3
          className={`mt-2 font-medium text-[var(--xd-ink)] transition-colors group-hover:text-[var(--xd-accent)] ${
            isEditorial
              ? 'xd-serif text-[17px] leading-snug'
              : 'text-[14.5px] leading-snug tracking-tight'
          }`}
        >
          <WorkspaceLink
            href={docHref(doc)}
            onNavigate={onOpen ? () => onOpen(doc) : undefined}
            className="after:absolute after:inset-0"
          >
            {doc.title}
          </WorkspaceLink>
        </h3>

        <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-[var(--xd-ink-secondary)]">
          {doc.description}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 pt-2 text-[11.5px] text-[var(--xd-ink-muted)]">
        <span className="xd-tabular">{doc.updatedAt}</span>

        <div
          className="relative z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => onDuplicate?.(doc)}
            className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
          >
            <Copy className="h-3 w-3" />
            <span>Duplicate</span>
          </button>
          <button
            type="button"
            onClick={() => onShare?.(doc)}
            className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
          >
            <Share2 className="h-3 w-3" />
            <span>Share</span>
          </button>
        </div>
      </div>
    </article>
  )
}

/* ============================================================================
   4. TemplateGalleryCard — Clean Template Card
   ============================================================================ */

export interface MarbleTemplateBlueprint {
  id: string
  title: string
  fileName: string
  category: MarbleAppCategory
  description: string
  nodeCount: number
  byteSize: number
  affordances: Array<
    | 'data-marble-editable'
    | 'data-marble-sortable'
    | '<marble-alt>'
    | 'data-marble-canvas'
    | 'data-marble-add'
    | 'data-marble-look'
  >
  recommendedModel: string
  previewHighlights: string[]
}

export interface TemplateGalleryCardProps {
  template: MarbleTemplateBlueprint
  onDuplicateTemplate?: (template: MarbleTemplateBlueprint) => void
  onPreviewTemplate?: (template: MarbleTemplateBlueprint) => void
  onEditTemplate?: (template: MarbleTemplateBlueprint) => void
  onRenameTemplate?: (template: MarbleTemplateBlueprint) => void
  onDuplicateAsTemplate?: (template: MarbleTemplateBlueprint) => void
  onDeleteTemplate?: (template: MarbleTemplateBlueprint) => void
}

export function TemplateGalleryCard({
  template,
  onDuplicateTemplate,
  onPreviewTemplate,
  onEditTemplate,
  onRenameTemplate,
  onDuplicateAsTemplate,
  onDeleteTemplate,
}: TemplateGalleryCardProps) {
  const isEditorial =
    template.category === 'latex' || template.category === 'document'
  const [menuOpen, setMenuOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0 })
  const menuContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: MouseEvent) {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const editHandler = onEditTemplate ?? onPreviewTemplate
  const editLabel = onEditTemplate ? 'Edit' : 'Preview'
  const hasManagementActions = Boolean(
    onRenameTemplate || onDuplicateAsTemplate || onDeleteTemplate,
  )

  const menuItems: ContextMenuItem[] = [
    ...(onDuplicateTemplate
      ? [
          {
            id: 'use-template',
            label: 'Use template',
            icon: <Copy className="h-3.5 w-3.5" />,
            onSelect: () => onDuplicateTemplate(template),
          },
        ]
      : []),
    ...(editHandler
      ? [
          {
            id: 'edit-template',
            label: onEditTemplate ? 'Edit template' : 'Preview template',
            icon: <Pencil className="h-3.5 w-3.5" />,
            onSelect: () => editHandler(template),
          },
        ]
      : []),
    ...(onRenameTemplate
      ? [
          {
            id: 'rename-template',
            label: 'Rename',
            icon: <Pencil className="h-3.5 w-3.5" />,
            onSelect: () => onRenameTemplate(template),
          },
        ]
      : []),
    ...(onDuplicateAsTemplate
      ? [
          {
            id: 'duplicate-template',
            label: 'Duplicate template',
            icon: <Copy className="h-3.5 w-3.5" />,
            onSelect: () => onDuplicateAsTemplate(template),
          },
        ]
      : []),
    ...(onDeleteTemplate
      ? [
          { id: 'sep-delete-template', label: '', divider: true },
          {
            id: 'delete-template',
            label: 'Move to trash',
            icon: <Trash2 className="h-3.5 w-3.5" />,
            danger: true,
            onSelect: () => onDeleteTemplate(template),
          },
        ]
      : []),
  ]

  return (
    <>
      <article
        onContextMenu={(event) => {
          if (!hasManagementActions) return
          event.preventDefault()
          event.stopPropagation()
          setContextMenu({ open: true, x: event.clientX, y: event.clientY })
        }}
        className="flex flex-col justify-between rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] p-4 transition-colors hover:border-[var(--xd-border-strong)]"
      >
        <div>
          <div className="flex items-center justify-between gap-2 text-[11.5px] text-[var(--xd-ink-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-[var(--xd-accent)]">
                {getCategoryIcon(template.category, 'h-3.5 w-3.5')}
              </span>
              <span>{getCategoryLabel(template.category)}</span>
            </span>

            <div className="flex min-w-0 items-center gap-1">
              <span className="xd-mono truncate">{template.fileName}</span>
              {hasManagementActions && (
                <div ref={menuContainerRef} className="relative">
                  <button
                    type="button"
                    aria-label={`Actions for ${template.title}`}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((prev) => !prev)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--xd-ink-muted)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>

                  {menuOpen && (
                    <div
                      role="menu"
                      aria-label={`Actions for ${template.title}`}
                      className="absolute right-0 top-7 z-30 min-w-[172px] overflow-hidden rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] py-1 shadow-lg"
                    >
                      {menuItems.map((item) =>
                        item.divider ? (
                          <div
                            key={item.id}
                            role="separator"
                            className="my-1 h-px bg-[var(--xd-border)]"
                          />
                        ) : (
                          <button
                            key={item.id}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuOpen(false)
                              item.onSelect?.()
                            }}
                            className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                              item.danger
                                ? 'text-[var(--xd-danger)] hover:bg-[var(--xd-danger-soft)]'
                                : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
                            }`}
                          >
                            <span className="shrink-0 opacity-80">
                              {item.icon}
                            </span>
                            <span className="truncate">{item.label}</span>
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <h3
            className={`mt-2 font-medium text-[var(--xd-ink)] ${
              isEditorial
                ? 'xd-serif text-[17px] leading-snug'
                : 'text-[14.5px] leading-snug tracking-tight'
            }`}
          >
            {template.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-[var(--xd-ink-secondary)]">
            {template.description ||
              `${getCategoryLabel(template.category)} template`}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-end gap-1.5 pt-2">
          {editHandler && (
            <WorkspaceLink
              href={docHref({
                id: template.id,
                slug: template.fileName,
                title: template.title,
              })}
              onNavigate={() => editHandler(template)}
              className="inline-flex h-7 items-center rounded border border-[var(--xd-border)] px-2.5 text-[11.5px] font-medium text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
            >
              {editLabel}
            </WorkspaceLink>
          )}
          <button
            type="button"
            onClick={() => onDuplicateTemplate?.(template)}
            className="inline-flex h-7 items-center gap-1 rounded bg-[var(--xd-ink)] px-2.5 text-[11.5px] font-medium text-[var(--xd-canvas)] transition-opacity hover:opacity-90"
          >
            <Copy className="h-3 w-3" />
            <span>Use template</span>
          </button>
        </div>
      </article>

      {hasManagementActions && (
        <AppContextMenu
          open={contextMenu.open}
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={() => setContextMenu((prev) => ({ ...prev, open: false }))}
          ariaLabel={`Actions for ${template.title}`}
        />
      )}
    </>
  )
}

/* ============================================================================
   5. AgentHeroComposer — Compact Prompt Bar for Creating .mrbl Apps
   ============================================================================ */

export interface AgentHeroComposerProps {
  models?: ModelPickerInputOption[]
  selectedModelId?: string
  onSelectModel?: (modelId: string) => void
  favoriteModelIds?: string[]
  onFavoriteModelIdsChange?: (ids: string[]) => void
  onOpenProviders?: () => void
  onSubmitPrompt?: (
    prompt: string,
    modelId: string,
    reasoningEffort: ReasoningEffort,
  ) => void
  reasoningEffort?: ReasoningEffort
  onSelectReasoningEffort?: (effort: ReasoningEffort) => void
  onTriggerSketchMode?: () => void
  onTriggerAttachNode?: () => void
  onQuickStartTemplate?: (category: MarbleAppCategory, prompt: string) => void
}

export const DEFAULT_COMPOSER_MODELS: Pick<
  AIModelSpec,
  'id' | 'name' | 'providerId' | 'badge' | 'role'
>[] = [
  {
    id: 'antigravity/default',
    name: 'Gemini (Google AI Plan)',
    providerId: 'antigravity',
    badge: 'Antigravity',
    role: 'implementation',
  },
  {
    id: 'grok-4.7',
    name: 'Grok 4.7',
    providerId: 'xai',
    badge: 'xAI',
    role: 'reasoning',
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    providerId: 'opencode-go',
    badge: 'OpenCode Go',
    role: 'design',
  },
  {
    id: 'claude-haiku-5.5',
    name: 'Claude Haiku 5.5',
    providerId: 'claude',
    badge: 'Claude',
    role: 'review',
  },
  {
    id: 'deepseek-v4.1-flash',
    name: 'DeepSeek V4.1 Flash',
    providerId: 'opencode-go',
    badge: 'OpenCode Go',
    role: 'exploration',
  },
  {
    id: 'openai-gpt-5.4',
    name: 'GPT-5.4',
    providerId: 'openai',
    badge: 'OpenAI',
    role: 'implementation',
  },
]

export function AgentHeroComposer({
  models = DEFAULT_COMPOSER_MODELS,
  selectedModelId = 'grok-4.7',
  onSelectModel,
  favoriteModelIds,
  onFavoriteModelIdsChange,
  onOpenProviders,
  onSubmitPrompt,
  reasoningEffort: reasoningEffortProp,
  onSelectReasoningEffort,
}: AgentHeroComposerProps) {
  const [prompt, setPrompt] = useState('')
  const [currentModelId, setCurrentModelId] = useState(selectedModelId)
  const [internalEffort, setInternalEffort] = useState<ReasoningEffort>(
    () => reasoningEffortProp ?? 'high',
  )
  const reasoningEffort = reasoningEffortProp ?? internalEffort

  const handleModelChange = (nextId: string) => {
    setCurrentModelId(nextId)
    onSelectModel?.(nextId)
  }

  const setEffort = (next: ReasoningEffort) => {
    if (reasoningEffortProp === undefined) setInternalEffort(next)
    onSelectReasoningEffort?.(next)
  }

  const submitPrompt = () => {
    const trimmed = prompt.trim()
    if (!trimmed) return
    const model =
      models.find((item) => item.id === currentModelId) ?? models.at(0)
    onSubmitPrompt?.(
      trimmed,
      currentModelId,
      reasoningEffortForModel(model, reasoningEffort),
    )
    setPrompt('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    submitPrompt()
  }

  return (
    <div className="w-full">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col overflow-hidden rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-rail)]/40 transition-colors focus-within:border-[var(--xd-accent)] focus-within:bg-[var(--xd-canvas)]"
      >
        <textarea
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              submitPrompt()
            }
          }}
          placeholder="Describe a new .mrbl document or app to build..."
          aria-label="Describe a new .mrbl document or app to build"
          className="w-full resize-none bg-transparent px-3.5 pt-2.5 pb-1.5 text-[13px] leading-relaxed text-[var(--xd-ink)] placeholder:text-[var(--xd-ink-muted)] focus:outline-none"
        />

        <div className="flex flex-wrap items-center justify-end gap-2 px-3 pb-2">
          <div className="flex items-center gap-1.5">
            <ModelPicker
              models={models}
              selectedModelId={currentModelId}
              onSelectModel={handleModelChange}
              reasoningEffort={reasoningEffort}
              onSelectReasoningEffort={setEffort}
              effortDisplay="both"
              favoriteModelIds={favoriteModelIds}
              onFavoriteModelIdsChange={onFavoriteModelIdsChange}
              onOpenProviders={onOpenProviders}
              size="xs"
              side="bottom"
              align="end"
              ariaLabel="Select model"
            />

            <button
              type="submit"
              disabled={!prompt.trim()}
              aria-label="Create .mrbl app"
              className="inline-flex h-6 items-center gap-1 rounded bg-[var(--xd-accent)] px-2.5 text-[11.5px] font-medium text-white transition-colors hover:bg-[var(--xd-accent-hover)] disabled:opacity-35"
            >
              <span>Create</span>
              <ArrowUp className="h-3 w-3" />
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
