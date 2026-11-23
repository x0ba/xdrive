import React, { useState } from 'react'
import {
  Search,
  LayoutGrid,
  LayoutPanelTop,
  List,
  ChevronDown,
  Star,
  Copy,
  Share2,
  ArrowUp,
  Pin,
} from 'lucide-react'
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

/* ============================================================================
   1. FilterPillBar — Clean Horizontal Filter & Search Bar
   ============================================================================ */

export type SortOption = 'updated' | 'nodes' | 'size' | 'title'
export type DriveViewMode = 'list' | 'icon' | 'preview'

export interface FilterPillBarProps {
  selectedCategory: MarbleAppCategory | 'all'
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

const CATEGORY_TABS: Array<{
  value: MarbleAppCategory | 'all'
  label: string
}> = [
  { value: 'all', label: 'All' },
  { value: 'latex', label: 'LaTeX' },
  { value: 'notebook', label: 'Notebooks' },
  { value: 'document', label: 'Docs' },
  { value: 'slides', label: 'Slides' },
  { value: 'matrix', label: 'Matrices' },
  { value: 'sandbox', label: 'Sandbox' },
]

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'updated', label: 'Recent' },
  { value: 'title', label: 'Name' },
  { value: 'size', label: 'Size' },
]

export function FilterPillBar({
  selectedCategory,
  onSelectCategory,
  sortBy,
  onSelectSort,
  viewMode,
  onChangeViewMode,
  searchQuery,
  onChangeSearchQuery,
}: FilterPillBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--xd-border)] pb-3 text-[12px]">
      <div
        role="tablist"
        aria-label="Filter by category"
        className="flex flex-wrap items-center gap-1"
      >
        {CATEGORY_TABS.map((tab) => {
          const active = selectedCategory === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelectCategory?.(tab.value)}
              className={`rounded px-2.5 py-1 text-[12px] transition-colors ${
                active
                  ? 'bg-[var(--xd-surface-active)] font-medium text-[var(--xd-ink)]'
                  : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[var(--xd-ink-muted)]" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onChangeSearchQuery?.(e.target.value)}
            placeholder="Filter files..."
            aria-label="Filter files"
            className="h-7 w-44 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] pr-2.5 pl-8 text-[12px] text-[var(--xd-ink)] placeholder:text-[var(--xd-ink-muted)] focus:border-[var(--xd-accent)] focus:outline-none"
          />
        </div>

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
    <article
      onClick={() => onOpen?.(doc)}
      className="group flex cursor-pointer flex-col justify-between rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] p-4 transition-colors hover:border-[var(--xd-border-strong)]"
    >
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
            className="flex shrink-0 items-center gap-0.5"
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
          {doc.title}
        </h3>

        <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-[var(--xd-ink-secondary)]">
          {doc.description}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 pt-2 text-[11.5px] text-[var(--xd-ink-muted)]">
        <span className="xd-tabular">{doc.updatedAt}</span>

        <div
          className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
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
}

export function TemplateGalleryCard({
  template,
  onDuplicateTemplate,
  onPreviewTemplate,
}: TemplateGalleryCardProps) {
  const isEditorial =
    template.category === 'latex' || template.category === 'document'

  return (
    <article className="flex flex-col justify-between rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] p-4 transition-colors hover:border-[var(--xd-border-strong)]">
      <div>
        <div className="flex items-center justify-between gap-2 text-[11.5px] text-[var(--xd-ink-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-[var(--xd-accent)]">
              {getCategoryIcon(template.category, 'h-3.5 w-3.5')}
            </span>
            <span>{getCategoryLabel(template.category)}</span>
          </span>
          <span className="xd-mono">{template.fileName}</span>
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
          {template.description}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-end gap-1.5 pt-2">
        {onPreviewTemplate && (
          <button
            type="button"
            onClick={() => onPreviewTemplate(template)}
            className="inline-flex h-7 items-center rounded border border-[var(--xd-border)] px-2.5 text-[11.5px] font-medium text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
          >
            Preview
          </button>
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
  )
}

/* ============================================================================
   5. AgentHeroComposer — Compact Prompt Bar for Creating .mrbl Apps
   ============================================================================ */

export interface AgentHeroComposerProps {
  models?: Pick<
    AIModelSpec,
    'id' | 'name' | 'providerId' | 'badge' | 'role'
  >[]
  selectedModelId?: string
  onSelectModel?: (modelId: string) => void
  onSubmitPrompt?: (prompt: string, modelId: string) => void
  onTriggerSketchMode?: () => void
  onTriggerAttachNode?: () => void
  onQuickStartTemplate?: (category: MarbleAppCategory, prompt: string) => void
}

export const DEFAULT_COMPOSER_MODELS: Pick<
  AIModelSpec,
  'id' | 'name' | 'providerId' | 'badge' | 'role'
>[] = [
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

const QUICK_STARTERS: Array<{
  category: MarbleAppCategory
  label: string
  prompt: string
}> = [
  {
    category: 'latex',
    label: 'LaTeX paper',
    prompt:
      'Build a two-column LaTeX quantum error correction manuscript with interactive theorem proofs.',
  },
  {
    category: 'notebook',
    label: 'Lab notebook',
    prompt:
      'Create an interactive mechanistic interpretability lab notebook with sortable activation runs.',
  },
  {
    category: 'slides',
    label: 'Slide deck',
    prompt:
      'Generate a 6-slide aerothermal heatshield review deck with trajectory sliders.',
  },
  {
    category: 'matrix',
    label: 'Literature matrix',
    prompt:
      'Synthesize a sortable transformer scaling law comparison matrix.',
  },
]

export function AgentHeroComposer({
  models = DEFAULT_COMPOSER_MODELS,
  selectedModelId = 'grok-4.7',
  onSelectModel,
  onSubmitPrompt,
  onQuickStartTemplate,
}: AgentHeroComposerProps) {
  const [prompt, setPrompt] = useState('')
  const [currentModelId, setCurrentModelId] = useState(selectedModelId)

  const handleModelChange = (nextId: string) => {
    setCurrentModelId(nextId)
    onSelectModel?.(nextId)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim()) return
    onSubmitPrompt?.(prompt.trim(), currentModelId)
    setPrompt('')
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
              if (prompt.trim()) {
                onSubmitPrompt?.(prompt.trim(), currentModelId)
                setPrompt('')
              }
            }
          }}
          placeholder="Describe a new .mrbl document or app to build..."
          aria-label="Describe a new .mrbl document or app to build"
          className="w-full resize-none bg-transparent px-3.5 pt-2.5 pb-1.5 text-[13px] leading-relaxed text-[var(--xd-ink)] placeholder:text-[var(--xd-ink-muted)] focus:outline-none"
        />

        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-2">
          <div className="flex flex-wrap items-center gap-1">
            {QUICK_STARTERS.map((starter) => (
              <button
                key={starter.label}
                type="button"
                onClick={() => {
                  setPrompt(starter.prompt)
                  onQuickStartTemplate?.(starter.category, starter.prompt)
                }}
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11.5px] text-[var(--xd-ink-muted)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
              >
                {getCategoryIcon(starter.category, 'h-3 w-3')}
                <span>{starter.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <div className="relative inline-flex items-center">
              <select
                aria-label="Select model"
                value={currentModelId}
                onChange={(e) => handleModelChange(e.target.value)}
                className="h-6 appearance-none rounded bg-transparent pr-5 pl-2 text-[11.5px] font-medium text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)] focus:outline-none"
              >
                {models.map((m) => (
                  <option
                    key={m.id}
                    value={m.id}
                    className="bg-[var(--xd-canvas)] text-[var(--xd-ink)]"
                  >
                    {m.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1 h-3 w-3 text-[var(--xd-ink-muted)]" />
            </div>

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
