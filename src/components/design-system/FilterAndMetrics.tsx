import React, { useState } from 'react'
import {
  Search,
  LayoutGrid,
  List,
  ChevronDown,
  Star,
  Copy,
  Share2,
  ExternalLink,
  Sparkles,
  Bot,
  PenTool,
  Paperclip,
  ArrowUpRight,
  GitCommit,
  FileCode2,
  Activity,
  KeyRound,
  Layers,
  Check,
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
  getPermissionMeta,
} from './NavigationShell'
import { MarbleSyncBadge } from './DesignTokensShowcase'

/* ============================================================================
   1. FilterPillBar — Stripe-Inspired Segmented Key-Value Filter Bar
   ============================================================================ */

export type SortOption = 'updated' | 'nodes' | 'size' | 'title'
export type DriveViewMode = 'grid' | 'table'

export interface FilterPillBarProps {
  selectedCategory: MarbleAppCategory | 'all'
  onSelectCategory?: (category: MarbleAppCategory | 'all') => void
  selectedAccess: SharePermissionLevel | 'all'
  onSelectAccess?: (access: SharePermissionLevel | 'all') => void
  sortBy: SortOption
  onSelectSort?: (sort: SortOption) => void
  viewMode: DriveViewMode
  onChangeViewMode?: (mode: DriveViewMode) => void
  searchQuery: string
  onChangeSearchQuery?: (query: string) => void
  totalResults?: number
}

const CATEGORY_OPTIONS: Array<{
  value: MarbleAppCategory | 'all'
  label: string
}> = [
  { value: 'all', label: 'All .mrbl Apps' },
  { value: 'latex', label: 'LaTeX Manuscripts' },
  { value: 'notebook', label: 'Lab Notebooks' },
  { value: 'document', label: 'Interactive Docs' },
  { value: 'slides', label: 'Research Decks' },
  { value: 'matrix', label: 'Literature Matrices' },
  { value: 'sandbox', label: 'Simulation Sandboxes' },
]

const ACCESS_OPTIONS: Array<{
  value: SharePermissionLevel | 'all'
  label: string
}> = [
  { value: 'all', label: 'All levels' },
  { value: 'edit_with_ai_shared', label: 'Full Edit + Shared AI' },
  { value: 'edit_with_ai_byok', label: 'Full Edit + BYOK AI' },
  { value: 'edit_no_ai', label: 'Edit without AI' },
  { value: 'comment_annotate', label: 'Sketch & Propose' },
  { value: 'view_only', label: 'View Only' },
]

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'updated', label: 'Last edited' },
  { value: 'nodes', label: 'Addressable nodes' },
  { value: 'size', label: 'Byte size' },
  { value: 'title', label: 'Alphabetical' },
]

export function FilterPillBar({
  selectedCategory,
  onSelectCategory,
  selectedAccess,
  onSelectAccess,
  sortBy,
  onSelectSort,
  viewMode,
  onChangeViewMode,
  searchQuery,
  onChangeSearchQuery,
  totalResults,
}: FilterPillBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2 text-[12px]">
      {/* Left: Segmented Key | Value Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Category | All .mrbl Apps */}
        <label className="inline-flex items-center overflow-hidden rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)]">
          <span className="border-r border-[var(--xd-border)] bg-[var(--xd-elevated)] px-2 py-1 text-[11.5px] font-medium text-[var(--xd-ink-secondary)]">
            Category
          </span>
          <div className="relative flex items-center">
            <select
              aria-label="Filter by Category"
              value={selectedCategory}
              onChange={(e) =>
                onSelectCategory?.(
                  e.target.value as MarbleAppCategory | 'all'
                )
              }
              className="appearance-none bg-transparent py-1 pr-6 pl-2 text-[12px] font-medium text-[var(--xd-ink)] focus:outline-none"
            >
              {CATEGORY_OPTIONS.map((opt) => (
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
        </label>

        {/* Access | All levels */}
        <label className="inline-flex items-center overflow-hidden rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)]">
          <span className="border-r border-[var(--xd-border)] bg-[var(--xd-elevated)] px-2 py-1 text-[11.5px] font-medium text-[var(--xd-ink-secondary)]">
            Access
          </span>
          <div className="relative flex items-center">
            <select
              aria-label="Filter by Access Level"
              value={selectedAccess}
              onChange={(e) =>
                onSelectAccess?.(
                  e.target.value as SharePermissionLevel | 'all'
                )
              }
              className="appearance-none bg-transparent py-1 pr-6 pl-2 text-[12px] font-medium text-[var(--xd-ink)] focus:outline-none"
            >
              {ACCESS_OPTIONS.map((opt) => (
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
        </label>

        {/* Sort | Last edited */}
        <label className="inline-flex items-center overflow-hidden rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)]">
          <span className="border-r border-[var(--xd-border)] bg-[var(--xd-elevated)] px-2 py-1 text-[11.5px] font-medium text-[var(--xd-ink-secondary)]">
            Sort
          </span>
          <div className="relative flex items-center">
            <select
              aria-label="Sort .mrbl applications"
              value={sortBy}
              onChange={(e) => onSelectSort?.(e.target.value as SortOption)}
              className="appearance-none bg-transparent py-1 pr-6 pl-2 text-[12px] font-medium text-[var(--xd-ink)] focus:outline-none"
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
        </label>

        {typeof totalResults === 'number' && (
          <span className="xd-tabular ml-1 text-[11.5px] text-[var(--xd-ink-muted)]">
            {totalResults} {totalResults === 1 ? 'app' : 'apps'}
          </span>
        )}
      </div>

      {/* Right: Search Filter Input + View Mode Toggle (Grid / Table) */}
      <div className="flex items-center gap-2">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[var(--xd-ink-muted)]" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onChangeSearchQuery?.(e.target.value)}
            placeholder="Filter by title, .mrbl or node ID..."
            className="h-7 w-56 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] pr-2.5 pl-8 text-[12px] text-[var(--xd-ink)] placeholder:text-[var(--xd-ink-muted)] focus:border-[var(--xd-accent)] focus:outline-none"
          />
        </div>

        <div
          role="group"
          aria-label="View Mode"
          className="inline-flex items-center rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] p-0.5"
        >
          <button
            type="button"
            onClick={() => onChangeViewMode?.('grid')}
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11.5px] font-medium transition-colors ${
              viewMode === 'grid'
                ? 'bg-[var(--xd-elevated)] text-[var(--xd-ink)]'
                : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]'
            }`}
          >
            <LayoutGrid className="h-3 w-3" />
            <span>Grid</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode?.('table')}
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11.5px] font-medium transition-colors ${
              viewMode === 'table'
                ? 'bg-[var(--xd-elevated)] text-[var(--xd-ink)]'
                : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]'
            }`}
          >
            <List className="h-3 w-3" />
            <span>Table</span>
          </button>
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
   2. MetricOverviewStrip — Stripe-Inspired Compact Metric Overview Strip
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
  committedOps,
  activeSubscriptions,
  totalSubscriptions = 4,
  totalByteSize = 318400,
}: MetricOverviewStripProps) {
  const sparkBars = [35, 52, 48, 70, 64, 88, 95, 82, 100]

  return (
    <div className="grid grid-cols-1 divide-y divide-[var(--xd-border)] overflow-hidden rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
      {/* Metric 1: Total .mrbl Apps */}
      <div className="flex flex-col justify-between p-3.5">
        <div className="flex items-center justify-between text-[12px] text-[var(--xd-ink-secondary)]">
          <span className="font-medium">Total .mrbl Apps</span>
          <FileCode2 className="h-3.5 w-3.5 text-[var(--xd-accent)]" />
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="xd-tabular text-[22px] font-semibold tracking-tight text-[var(--xd-ink)]">
            {totalApps}
          </span>
          <span className="xd-mono text-[11px] text-[var(--xd-ink-muted)]">
            {formatBytes(totalByteSize)} total HTML5
          </span>
        </div>
      </div>

      {/* Metric 2: Addressable Nodes */}
      <div className="flex flex-col justify-between p-3.5">
        <div className="flex items-center justify-between text-[12px] text-[var(--xd-ink-secondary)]">
          <span className="font-medium">Addressable Nodes</span>
          <Layers className="h-3.5 w-3.5 text-[var(--xd-accent)]" />
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="xd-tabular text-[22px] font-semibold tracking-tight text-[var(--xd-ink)]">
            {addressableNodes.toLocaleString()}
          </span>
          <span className="xd-mono rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-1.5 py-0.5 text-[10.5px] text-[var(--xd-ink-secondary)]">
            data-marble-id
          </span>
        </div>
      </div>

      {/* Metric 3: Committed Marble Ops */}
      <div className="flex flex-col justify-between p-3.5">
        <div className="flex items-center justify-between text-[12px] text-[var(--xd-ink-secondary)]">
          <span className="font-medium">Committed Marble Ops</span>
          <GitCommit className="h-3.5 w-3.5 text-[var(--xd-commit)]" />
        </div>
        <div className="mt-2 flex items-end justify-between">
          <div className="flex items-baseline gap-2">
            <span className="xd-tabular text-[22px] font-semibold tracking-tight text-[var(--xd-ink)]">
              {committedOps.toLocaleString()}
            </span>
            <span className="text-[11px] font-medium text-[var(--xd-commit)]">
              100% reversible
            </span>
          </div>
          {/* Subtle 9-bar activity sparkline */}
          <div
            aria-hidden="true"
            className="flex h-5 items-end gap-0.5 pb-0.5"
          >
            {sparkBars.map((height, idx) => (
              <span
                key={idx}
                style={{ height: `${height}%` }}
                className={`w-1 rounded-xs ${
                  idx >= sparkBars.length - 2
                    ? 'bg-[var(--xd-commit)]'
                    : 'bg-[var(--xd-accent)]/50'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Metric 4: Active AI Subscriptions */}
      <div className="flex flex-col justify-between p-3.5">
        <div className="flex items-center justify-between text-[12px] text-[var(--xd-ink-secondary)]">
          <span className="font-medium">Active AI Subscriptions</span>
          <KeyRound className="h-3.5 w-3.5 text-[var(--xd-commit)]" />
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="xd-tabular text-[22px] font-semibold tracking-tight text-[var(--xd-ink)]">
              {activeSubscriptions}
            </span>
            <span className="xd-tabular text-[13px] text-[var(--xd-ink-muted)]">
              / {totalSubscriptions}
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--xd-commit)]">
            <Activity className="h-3 w-3" />
            <span>Multi-provider live</span>
          </span>
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
   3. MarbleAppCard — High-Density Card for a MarbleDocumentFile
   ============================================================================ */

export interface MarbleAppCardProps {
  doc: MarbleDocumentFile
  onOpen?: (doc: MarbleDocumentFile) => void
  onDuplicate?: (doc: MarbleDocumentFile) => void
  onShare?: (doc: MarbleDocumentFile) => void
  onToggleStar?: (doc: MarbleDocumentFile) => void
}

export function MarbleAppCard({
  doc,
  onOpen,
  onDuplicate,
  onShare,
  onToggleStar,
}: MarbleAppCardProps) {
  const permMeta = getPermissionMeta(doc.share.publicPermission)
  const isEditorialCategory =
    doc.category === 'latex' || doc.category === 'document'

  return (
    <article className="group flex flex-col justify-between rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] transition-colors hover:border-[var(--xd-border-strong)]">
      {/* Top Section: Category Badge, Filename Chip, Star Toggle, Title & Description */}
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--xd-ink)]">
              <span className="text-[var(--xd-accent)]">
                {getCategoryIcon(doc.category, 'h-3.5 w-3.5')}
              </span>
              <span>{getCategoryLabel(doc.category)}</span>
            </span>

            <span className="xd-mono rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-1.5 py-0.5 text-[11px] text-[var(--xd-ink-secondary)]">
              {doc.fileName}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <MarbleSyncBadge state={doc.syncState} showLabel={false} />
            <button
              type="button"
              onClick={() => onToggleStar?.(doc)}
              aria-label={
                doc.starred ? 'Remove from starred' : 'Star .mrbl app'
              }
              className={`inline-flex h-6 w-6 items-center justify-center rounded transition-colors ${
                doc.starred
                  ? 'text-[var(--xd-sketch)]'
                  : 'text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
              }`}
            >
              <Star
                className={`h-3.5 w-3.5 ${doc.starred ? 'fill-current' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Title (Editorial serif for LaTeX/research papers, crisp Inter for interactive decks/notebooks) */}
        <h3
          onClick={() => onOpen?.(doc)}
          className={`mt-3 cursor-pointer font-semibold text-[var(--xd-ink)] group-hover:text-[var(--xd-accent)] ${
            isEditorialCategory
              ? 'xd-serif text-[17px] leading-snug'
              : 'text-[15px] leading-snug tracking-tight'
          }`}
        >
          {doc.title}
        </h3>

        <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-[var(--xd-ink-secondary)]">
          {doc.description}
        </p>
      </div>

      {/* Middle Metadata Table: Last edited, Created by (with AI/human badge), Nodes, Size */}
      <div className="border-t border-[var(--xd-border)] bg-[var(--xd-rail)]/40 px-4 py-2.5 text-[11.5px]">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[var(--xd-ink-muted)]">Last edited</span>
            <span className="xd-tabular font-medium text-[var(--xd-ink-secondary)]">
              {doc.updatedAt}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[var(--xd-ink-muted)]">Nodes / Size</span>
            <span className="xd-tabular xd-mono font-medium text-[var(--xd-ink)]">
              {doc.nodeCount}n · {formatBytes(doc.byteSize)}
            </span>
          </div>

          <div className="col-span-2 flex items-center justify-between border-t border-[var(--xd-border)]/60 pt-1.5">
            <span className="text-[var(--xd-ink-muted)]">Created by</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-[var(--xd-ink)]">
              {doc.createdBy.isAi ? (
                <span className="inline-flex items-center gap-1 rounded border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] px-1.5 py-0.2 text-[10.5px] text-[var(--xd-accent)]">
                  <Bot className="h-3 w-3" />
                  <span>{doc.createdBy.modelBadge || doc.createdBy.name}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--xd-ink-secondary)]">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--xd-elevated)] text-[9.5px] font-semibold text-[var(--xd-ink)]">
                    {doc.createdBy.initials}
                  </span>
                  <span>{doc.createdBy.name}</span>
                  {doc.lastEditedBy.isAi && doc.lastEditedBy.modelBadge && (
                    <span className="xd-mono rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-1 py-0.2 text-[10px] text-[var(--xd-accent)]">
                      +{doc.lastEditedBy.modelBadge}
                    </span>
                  )}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Footer: Sharing Level Badge + Action Buttons (Open App, Duplicate, Share) */}
      <div className="flex items-center justify-between gap-2 border-t border-[var(--xd-border)] px-4 py-2.5">
        <span
          className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${permMeta.badgeClass}`}
        >
          {permMeta.shortLabel}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onDuplicate?.(doc)}
            title="Duplicate self-contained .mrbl file"
            className="inline-flex h-7 items-center gap-1 rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-2 text-[11.5px] font-medium text-[var(--xd-ink-secondary)] transition-colors hover:text-[var(--xd-ink)]"
          >
            <Copy className="h-3 w-3" />
            <span>Duplicate</span>
          </button>

          <button
            type="button"
            onClick={() => onShare?.(doc)}
            title="Configure sharing permissions & AI quota"
            className="inline-flex h-7 items-center gap-1 rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-2 text-[11.5px] font-medium text-[var(--xd-ink-secondary)] transition-colors hover:text-[var(--xd-ink)]"
          >
            <Share2 className="h-3 w-3" />
            <span>Share</span>
          </button>

          <button
            type="button"
            onClick={() => onOpen?.(doc)}
            className="inline-flex h-7 items-center gap-1 rounded bg-[var(--xd-accent)] px-2.5 text-[11.5px] font-medium text-white transition-colors hover:bg-[var(--xd-accent-hover)]"
          >
            <span>Open App</span>
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </div>
    </article>
  )
}

/* ============================================================================
   4. TemplateGalleryCard — Self-Contained .mrbl Template Blueprint Card
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
  return (
    <article className="flex flex-col justify-between rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] p-4 transition-colors hover:border-[var(--xd-accent-border)]">
      <div>
        {/* Header: Category + Self-contained .mrbl filename */}
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--xd-accent)]">
            {getCategoryIcon(template.category, 'h-3.5 w-3.5')}
            <span>{getCategoryLabel(template.category)}</span>
          </span>
          <span className="xd-mono rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-1.5 py-0.5 text-[11px] text-[var(--xd-ink-secondary)]">
            {template.fileName}
          </span>
        </div>

        {/* Title & Description */}
        <h3 className="mt-3 text-[15px] font-semibold tracking-tight text-[var(--xd-ink)]">
          {template.title}
        </h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--xd-ink-secondary)]">
          {template.description}
        </p>

        {/* Included Marble DOM Affordances */}
        <div className="mt-3.5 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-medium text-[var(--xd-ink-muted)]">
            <span>Included Marble Affordances</span>
            <span className="xd-tabular xd-mono">
              {template.nodeCount} nodes · {formatBytes(template.byteSize)}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {template.affordances.map((aff) => (
              <code
                key={aff}
                className="xd-mono rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-1.5 py-0.5 text-[11px] text-[var(--xd-ink)]"
              >
                {aff}
              </code>
            ))}
          </div>
        </div>

        {/* Structural Features List */}
        {template.previewHighlights.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-[var(--xd-border)] pt-2.5 text-[11.5px] text-[var(--xd-ink-secondary)]">
            {template.previewHighlights.map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <Check className="h-3 w-3 shrink-0 text-[var(--xd-commit)]" />
                <span className="truncate">{item}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer Actions: Preview + Duplicate .mrbl */}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--xd-border)] pt-3">
        <span className="xd-mono text-[11px] text-[var(--xd-ink-muted)]">
          Best with {template.recommendedModel}
        </span>

        <div className="flex items-center gap-1.5">
          {onPreviewTemplate && (
            <button
              type="button"
              onClick={() => onPreviewTemplate(template)}
              className="inline-flex h-7 items-center gap-1 rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-2.5 text-[11.5px] font-medium text-[var(--xd-ink-secondary)] transition-colors hover:text-[var(--xd-ink)]"
            >
              <span>Inspect</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onDuplicateTemplate?.(template)}
            className="inline-flex h-7 items-center gap-1.5 rounded bg-[var(--xd-accent)] px-2.5 text-[11.5px] font-medium text-white transition-colors hover:bg-[var(--xd-accent-hover)]"
          >
            <Copy className="h-3 w-3" />
            <span>Duplicate .mrbl</span>
          </button>
        </div>
      </div>
    </article>
  )
}

/* ============================================================================
   5. AgentHeroComposer — Linear-Inspired Centered Agent Studio Composer
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
    badge: 'SpaceX AI · Reasoning',
    role: 'reasoning',
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    providerId: 'opencode-go',
    badge: 'OpenCode Go · Design',
    role: 'design',
  },
  {
    id: 'claude-haiku-5.5',
    name: 'Claude Haiku 5.5',
    providerId: 'claude',
    badge: 'Anthropic · Review',
    role: 'review',
  },
  {
    id: 'deepseek-v4.1-flash',
    name: 'DeepSeek V4.1 Flash',
    providerId: 'opencode-go',
    badge: 'OpenCode Go · Fast Scan',
    role: 'exploration',
  },
  {
    id: 'openai-gpt-5.4',
    name: 'OpenAI GPT-5.4',
    providerId: 'openai',
    badge: 'OpenAI · Synthesis',
    role: 'implementation',
  },
]

const QUICK_STARTERS: Array<{
  category: MarbleAppCategory
  label: string
  fileName: string
  prompt: string
}> = [
  {
    category: 'latex',
    label: 'LaTeX Research Paper',
    fileName: 'paper-manuscript.mrbl',
    prompt:
      'Build a two-column LaTeX-styled quantum error correction manuscript (.mrbl) with interactive theorem proofs and <marble-alt> derivation branches.',
  },
  {
    category: 'notebook',
    label: 'Empirical Lab Notebook',
    fileName: 'experiment-log.mrbl',
    prompt:
      'Create an interactive mechanistic interpretability lab notebook (.mrbl) with sortable activation patching runs and live SVG telemetry plots.',
  },
  {
    category: 'slides',
    label: 'Technical Slide Deck',
    fileName: 'review-deck.mrbl',
    prompt:
      'Generate a 6-slide Starship aerothermal heatshield review deck (.mrbl) with interactive trajectory parameter sliders.',
  },
  {
    category: 'matrix',
    label: 'Literature Comparison Matrix',
    fileName: 'literature-matrix.mrbl',
    prompt:
      'Synthesize a sortable transformer scaling law comparison matrix (.mrbl) with filterable compute-optimal frontier rows.',
  },
]

export function AgentHeroComposer({
  models = DEFAULT_COMPOSER_MODELS,
  selectedModelId = 'grok-4.7',
  onSelectModel,
  onSubmitPrompt,
  onTriggerSketchMode,
  onTriggerAttachNode,
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
  }

  return (
    <div className="xd-agent-watermark mx-auto w-full max-w-3xl rounded-lg border border-[var(--xd-border)] bg-[var(--xd-rail)]/60 p-5">
      {/* Header Prompt Context */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <h2 className="text-[14.5px] font-semibold tracking-tight text-[var(--xd-ink)]">
            xDrive Agent Studio
          </h2>
          <span className="xd-mono rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-1.5 py-0.5 text-[11px] text-[var(--xd-ink-secondary)]">
            Self-contained .mrbl generator
          </span>
        </div>

        <span className="text-[11.5px] text-[var(--xd-ink-muted)]">
          Every output is a byte-accurate interactive HTML5{' '}
          <code className="xd-mono text-[var(--xd-ink-secondary)]">.mrbl</code>{' '}
          app
        </span>
      </div>

      {/* Main Composer Card */}
      <form
        onSubmit={handleSubmit}
        className="overflow-hidden rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] focus-within:border-[var(--xd-accent)]"
      >
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask xDrive Agent to build or edit a .mrbl app... (e.g. 'Create an interactive surface code threshold simulator with sortable syndrome tables')"
          className="w-full resize-none bg-transparent px-3.5 pt-3 pb-2 text-[13.5px] leading-relaxed text-[var(--xd-ink)] placeholder:text-[var(--xd-ink-muted)] focus:outline-none"
        />

        {/* Composer Bottom Toolbar: Model Selector Pill, Sketch/Attach Triggers, Submit */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--xd-border)] bg-[var(--xd-rail)]/50 px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Model Selector Pill */}
            <div className="relative inline-flex items-center">
              <Bot className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-[var(--xd-accent)]" />
              <select
                aria-label="Select AI Collaborator Model"
                value={currentModelId}
                onChange={(e) => handleModelChange(e.target.value)}
                className="h-7 appearance-none rounded border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] pr-6 pl-7 text-[11.5px] font-medium text-[var(--xd-ink)] focus:outline-none"
              >
                {models.map((m) => (
                  <option
                    key={m.id}
                    value={m.id}
                    className="bg-[var(--xd-canvas)] text-[var(--xd-ink)]"
                  >
                    {m.name} ({m.badge})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-[var(--xd-ink-secondary)]" />
            </div>

            {/* Attach DOM Node Context Trigger */}
            <button
              type="button"
              onClick={onTriggerAttachNode}
              className="inline-flex h-7 items-center gap-1.5 rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-2 text-[11.5px] font-medium text-[var(--xd-ink-secondary)] transition-colors hover:text-[var(--xd-ink)]"
            >
              <Paperclip className="h-3 w-3" />
              <span>Target Node</span>
            </button>

            {/* Sketch & Annotate Trigger */}
            <button
              type="button"
              onClick={onTriggerSketchMode}
              className="inline-flex h-7 items-center gap-1.5 rounded border border-[var(--xd-sketch)]/35 bg-[var(--xd-sketch-soft)] px-2 text-[11.5px] font-medium text-[var(--xd-sketch)] transition-colors hover:border-[var(--xd-sketch)]"
            >
              <PenTool className="h-3 w-3" />
              <span>Sketch Instruction</span>
            </button>
          </div>

          <button
            type="submit"
            className="inline-flex h-7 items-center gap-1.5 rounded bg-[var(--xd-accent)] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[var(--xd-accent-hover)]"
          >
            <span>Generate .mrbl</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>

      {/* Quick-Starters Underneath */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11.5px] font-medium text-[var(--xd-ink-muted)]">
          Quick-start blueprint:
        </span>
        {QUICK_STARTERS.map((starter) => (
          <button
            key={starter.fileName}
            type="button"
            onClick={() => {
              setPrompt(starter.prompt)
              onQuickStartTemplate?.(starter.category, starter.prompt)
            }}
            className="inline-flex items-center gap-1.5 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 py-1 text-[11.5px] text-[var(--xd-ink-secondary)] transition-colors hover:border-[var(--xd-border-strong)] hover:text-[var(--xd-ink)]"
          >
            <span className="text-[var(--xd-accent)]">
              {getCategoryIcon(starter.category, 'h-3 w-3')}
            </span>
            <span>{starter.label}</span>
            <span className="xd-mono text-[10.5px] text-[var(--xd-ink-muted)]">
              {starter.fileName}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
