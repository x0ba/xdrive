import React from 'react'
import {
  ChevronLeft,
  ChevronRight,
  HardDrive,
  Plus,
  X,
  Sun,
  Moon,
  Sparkles,
  Search,
  LayoutTemplate,
  Users,
  KeyRound,
  Sigma,
  FlaskConical,
  FileText,
  Presentation,
  Table2,
  Cpu,
  Blocks,
  MousePointerClick,
  BoxSelect,
  PenTool,
  Code2,
  Copy,
  Lock,
  Globe,
  ShieldAlert,
} from 'lucide-react'
import type {
  MarbleAppCategory,
  MarbleDocumentFile,
  CanvasInteractionMode,
  SharePermissionLevel,
  AISubscription,
} from '#/lib/types'
import { MarbleSyncBadge } from './DesignTokensShowcase'

export function getCategoryIcon(
  category: MarbleAppCategory,
  className = 'h-3.5 w-3.5',
) {
  switch (category) {
    case 'latex':
      return <Sigma className={className} />
    case 'notebook':
      return <FlaskConical className={className} />
    case 'document':
      return <FileText className={className} />
    case 'slides':
      return <Presentation className={className} />
    case 'matrix':
      return <Table2 className={className} />
    case 'sandbox':
      return <Cpu className={className} />
    case 'custom':
    default:
      return <Blocks className={className} />
  }
}

export function getCategoryLabel(category: MarbleAppCategory): string {
  switch (category) {
    case 'latex':
      return 'LaTeX'
    case 'notebook':
      return 'Notebook'
    case 'document':
      return 'Document'
    case 'slides':
      return 'Slides'
    case 'matrix':
      return 'Matrix'
    case 'sandbox':
      return 'Sandbox'
    case 'custom':
    default:
      return 'App'
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  return `${kb.toFixed(1)} KB`
}

export function getPermissionMeta(permission: SharePermissionLevel): {
  label: string
  shortLabel: string
  badgeClass: string
} {
  switch (permission) {
    case 'edit_with_ai_shared':
      return {
        label: 'Full Edit + Shared AI',
        shortLabel: 'Shared AI',
        badgeClass:
          'border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]',
      }
    case 'edit_with_ai_byok':
      return {
        label: 'Full Edit + Visitor BYOK AI',
        shortLabel: 'BYOK AI',
        badgeClass:
          'border-[var(--xd-commit)]/35 bg-[var(--xd-commit-soft)] text-[var(--xd-commit)]',
      }
    case 'edit_no_ai':
      return {
        label: 'Edit without AI',
        shortLabel: 'Edit only',
        badgeClass:
          'border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] text-[var(--xd-ink)]',
      }
    case 'comment_annotate':
      return {
        label: 'Sketch & Propose Only',
        shortLabel: 'Propose',
        badgeClass:
          'border-[var(--xd-sketch)]/35 bg-[var(--xd-sketch-soft)] text-[var(--xd-sketch)]',
      }
    case 'view_only':
    default:
      return {
        label: 'View Only (Local Look)',
        shortLabel: 'View only',
        badgeClass:
          'border-[var(--xd-border)] bg-[var(--xd-rail)] text-[var(--xd-ink-secondary)]',
      }
  }
}

/* ============================================================================
   1. BrowserTabStrip — Top Multi-Tab Bar
   ============================================================================ */

export interface OpenDocumentTab {
  id: string
  title: string
  fileName: string
  category: MarbleAppCategory
  nodeCount: number
  syncState: MarbleDocumentFile['syncState']
}

export interface BrowserTabStripProps {
  openTabs: OpenDocumentTab[]
  activeTabId: 'home' | string
  onSelectTab?: (tabId: 'home' | string) => void
  onCloseTab?: (tabId: string) => void
  onNewTab?: () => void
  canGoBack?: boolean
  canGoForward?: boolean
  onBack?: () => void
  onForward?: () => void
  simulatedRole?: SharePermissionLevel | 'owner'
  onClearRoleSimulation?: () => void
  theme?: 'dark' | 'light'
  onToggleTheme?: () => void
  aiSidebarOpen?: boolean
  onToggleAiSidebar?: () => void
  pendingProposalsCount?: number
}

export function BrowserTabStrip({
  openTabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  canGoBack = true,
  canGoForward = false,
  onBack,
  onForward,
  simulatedRole = 'owner',
  onClearRoleSimulation,
  theme = 'dark',
  onToggleTheme,
  aiSidebarOpen = false,
  onToggleAiSidebar,
  pendingProposalsCount = 0,
}: BrowserTabStripProps) {
  return (
    <div className="flex h-9 w-full select-none items-center justify-between border-b border-[var(--xd-border)] bg-[var(--xd-rail)] px-2 text-[12px]">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        <div className="flex items-center">
          <button
            type="button"
            onClick={onBack}
            disabled={!canGoBack}
            aria-label="Back"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onForward}
            disabled={!canGoForward}
            aria-label="Forward"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] disabled:opacity-30"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onSelectTab?.('home')}
          className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded px-2.5 text-[12px] font-medium transition-colors ${
            activeTabId === 'home'
              ? 'bg-[var(--xd-canvas)] text-[var(--xd-ink)] shadow-2xs'
              : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
          }`}
        >
          <HardDrive className="h-3.5 w-3.5 text-[var(--xd-ink-muted)]" />
          <span>Drive</span>
        </button>

        <span className="mx-0.5 h-3.5 w-px bg-[var(--xd-border)]" />

        <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
          {openTabs.map((tab) => {
            const isActive = activeTabId === tab.id
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelectTab?.(tab.id)}
                className={`group inline-flex h-7 max-w-[210px] shrink-0 cursor-pointer items-center gap-1.5 rounded px-2.5 text-[12px] transition-colors ${
                  isActive
                    ? 'bg-[var(--xd-canvas)] font-medium text-[var(--xd-ink)] shadow-2xs'
                    : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
                }`}
              >
                <span
                  className={
                    isActive
                      ? 'text-[var(--xd-accent)]'
                      : 'text-[var(--xd-ink-muted)]'
                  }
                >
                  {getCategoryIcon(tab.category, 'h-3.5 w-3.5')}
                </span>

                <span className="truncate" title={tab.fileName}>
                  {tab.title}
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseTab?.(tab.id)
                  }}
                  aria-label={`Close ${tab.title}`}
                  className="ml-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--xd-ink-muted)] opacity-0 transition-opacity hover:bg-[var(--xd-surface-active)] hover:text-[var(--xd-ink)] group-hover:opacity-100 focus:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })}

          <button
            type="button"
            onClick={onNewTab}
            aria-label="New app"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--xd-ink-muted)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="ml-2 flex shrink-0 items-center gap-1.5">
        {simulatedRole !== 'owner' && (
          <div className="inline-flex items-center gap-1.5 rounded border border-[var(--xd-sketch)]/40 bg-[var(--xd-sketch-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--xd-sketch)]">
            <ShieldAlert className="h-3 w-3 shrink-0" />
            <span>{getPermissionMeta(simulatedRole).shortLabel}</span>
            {onClearRoleSimulation && (
              <button
                type="button"
                onClick={onClearRoleSimulation}
                className="ml-0.5 underline hover:text-[var(--xd-ink)]"
              >
                Reset
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={
            theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
          }
          className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
        >
          {theme === 'dark' ? (
            <Moon className="h-3.5 w-3.5" />
          ) : (
            <Sun className="h-3.5 w-3.5" />
          )}
        </button>

        <button
          type="button"
          onClick={onToggleAiSidebar}
          className={`inline-flex h-7 items-center gap-1.5 rounded px-2 text-[12px] font-medium transition-colors ${
            aiSidebarOpen
              ? 'bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]'
              : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>AI</span>
          {pendingProposalsCount > 0 && (
            <span className="xd-tabular inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--xd-sketch)] px-1 text-[10px] font-semibold text-black">
              {pendingProposalsCount}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

/* ============================================================================
   2. SidebarRail — Minimal Left Navigation Rail
   ============================================================================ */

export type PrimaryNavId =
  | 'drive'
  | 'agent-studio'
  | 'templates'
  | 'shared'
  | 'subscriptions'

export interface SidebarRailProps {
  activeNav: PrimaryNavId
  onSelectNav?: (nav: PrimaryNavId) => void
  onOpenCommandPalette?: () => void
  pinnedApps?: Array<{
    id: string
    title: string
    fileName: string
    category: MarbleAppCategory
    nodeCount: number
  }>
  recentApps?: Array<{
    id: string
    title: string
    fileName: string
    category: MarbleAppCategory
    updatedAt: string
  }>
  activeAppId?: string
  onSelectApp?: (appId: string) => void
  subscriptions?: Pick<
    AISubscription,
    'providerId' | 'name' | 'connected' | 'status' | 'planName'
  >[]
  onManageSubscriptions?: () => void
}

export function SidebarRail({
  activeNav,
  onSelectNav,
  onOpenCommandPalette,
  pinnedApps = [],
  activeAppId,
  onSelectApp,
}: SidebarRailProps) {
  const navItems: Array<{
    id: PrimaryNavId
    label: string
    icon: React.ReactNode
  }> = [
    {
      id: 'drive',
      label: 'Files',
      icon: <HardDrive className="h-3.5 w-3.5" />,
    },
    {
      id: 'templates',
      label: 'Templates',
      icon: <LayoutTemplate className="h-3.5 w-3.5" />,
    },
    {
      id: 'shared',
      label: 'Shared',
      icon: <Users className="h-3.5 w-3.5" />,
    },
    {
      id: 'subscriptions',
      label: 'Models',
      icon: <KeyRound className="h-3.5 w-3.5" />,
    },
  ]

  return (
    <aside className="flex h-full w-48 shrink-0 select-none flex-col border-r border-[var(--xd-border)] bg-[var(--xd-rail)] p-2 text-[12.5px]">
      <div className="flex items-center justify-between px-2 py-1">
        <div className="flex items-center gap-2">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-xs bg-[var(--xd-ink)] text-[10px] font-bold text-[var(--xd-canvas)]">
            X
          </span>
          <span className="text-[12.5px] font-semibold tracking-tight text-[var(--xd-ink)]">
            xDrive
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenCommandPalette}
          aria-label="Search (⌘K)"
          title="Search (⌘K)"
          className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-[var(--xd-ink-muted)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
        >
          <Search className="h-3 w-3" />
          <kbd className="xd-mono text-[10px]">⌘K</kbd>
        </button>
      </div>

      <nav
        className="mt-2 space-y-0.5"
        aria-label="Primary Workspace Navigation"
      >
        {navItems.map((item) => {
          const active =
            activeNav === item.id ||
            (item.id === 'drive' && activeNav === 'agent-studio')
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectNav?.(item.id)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12.5px] transition-colors ${
                active
                  ? 'bg-[var(--xd-surface-active)] font-medium text-[var(--xd-ink)]'
                  : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
              }`}
            >
              <span
                className={
                  active
                    ? 'text-[var(--xd-ink)]'
                    : 'text-[var(--xd-ink-muted)]'
                }
              >
                {item.icon}
              </span>
              <span className="truncate">{item.label}</span>
            </button>
          )
        })}
      </nav>

      {pinnedApps.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-[var(--xd-border)] pt-3">
          <div className="px-2 text-[11px] font-medium text-[var(--xd-ink-muted)]">
            Pinned
          </div>
          <div className="space-y-0.5">
            {pinnedApps.map((app) => {
              const isSelected = activeAppId === app.id
              return (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => onSelectApp?.(app.id)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] transition-colors ${
                    isSelected
                      ? 'bg-[var(--xd-surface-active)] font-medium text-[var(--xd-ink)]'
                      : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
                  }`}
                >
                  <span className="shrink-0 text-[var(--xd-ink-muted)]">
                    {getCategoryIcon(app.category, 'h-3.5 w-3.5')}
                  </span>
                  <span className="truncate">{app.title}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </aside>
  )
}

/* ============================================================================
   3. DocumentBreadcrumbHeader — Compact Document Toolbar
   ============================================================================ */

export interface DocumentBreadcrumbHeaderProps {
  folder: string
  category: MarbleAppCategory
  fileName: string
  nodeCount?: number
  byteSize?: number
  syncState: MarbleDocumentFile['syncState']
  interactionMode: CanvasInteractionMode
  onChangeInteractionMode?: (mode: CanvasInteractionMode) => void
  onDuplicate?: () => void
  onOpenShare?: () => void
  sharePermission: SharePermissionLevel
  isPublicLinkEnabled?: boolean
}

export function DocumentBreadcrumbHeader({
  folder,
  fileName,
  syncState,
  interactionMode,
  onChangeInteractionMode,
  onDuplicate,
  onOpenShare,
  isPublicLinkEnabled = true,
}: DocumentBreadcrumbHeaderProps) {
  const modeOptions: Array<{
    id: CanvasInteractionMode
    label: string
    icon: React.ReactNode
    shortcut: string
  }> = [
    {
      id: 'direct',
      label: 'Edit',
      icon: <MousePointerClick className="h-3.5 w-3.5" />,
      shortcut: '1',
    },
    {
      id: 'select',
      label: 'Select',
      icon: <BoxSelect className="h-3.5 w-3.5" />,
      shortcut: '2',
    },
    {
      id: 'sketch',
      label: 'Sketch',
      icon: <PenTool className="h-3.5 w-3.5" />,
      shortcut: '3',
    },
    {
      id: 'source',
      label: 'Source',
      icon: <Code2 className="h-3.5 w-3.5" />,
      shortcut: '4',
    },
  ]

  return (
    <header className="flex h-9 items-center justify-between gap-3 border-b border-[var(--xd-border)] bg-[var(--xd-canvas)] px-3 text-[12px]">
      <div className="flex min-w-0 items-center gap-2">
        <nav
          aria-label="Document Breadcrumb"
          className="flex items-center gap-1.5 truncate"
        >
          <span className="truncate text-[var(--xd-ink-muted)]">{folder}</span>
          <span className="text-[var(--xd-ink-subtle)]">/</span>
          <span className="xd-mono truncate font-medium text-[var(--xd-ink)]">
            {fileName}
          </span>
        </nav>
        <MarbleSyncBadge state={syncState} showLabel={false} />
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div
          role="group"
          aria-label="Canvas Interaction Mode"
          className="inline-flex items-center rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] p-0.5"
        >
          {modeOptions.map((mode) => {
            const active = interactionMode === mode.id
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => onChangeInteractionMode?.(mode.id)}
                title={`${mode.label} (${mode.shortcut})`}
                className={`inline-flex h-6 items-center gap-1 rounded-xs px-2 text-[11.5px] font-medium transition-colors ${
                  active
                    ? 'bg-[var(--xd-canvas)] text-[var(--xd-ink)] shadow-2xs'
                    : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]'
                }`}
              >
                {mode.icon}
                <span>{mode.label}</span>
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={onDuplicate}
          title="Duplicate file"
          className="inline-flex h-7 items-center gap-1 rounded border border-[var(--xd-border)] px-2 text-[11.5px] font-medium text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
        >
          <Copy className="h-3 w-3" />
          <span>Duplicate</span>
        </button>

        <button
          type="button"
          onClick={onOpenShare}
          className="inline-flex h-7 items-center gap-1 rounded border border-[var(--xd-border)] px-2 text-[11.5px] font-medium text-[var(--xd-ink)] transition-colors hover:bg-[var(--xd-surface-hover)]"
        >
          {isPublicLinkEnabled ? (
            <Globe className="h-3 w-3 text-[var(--xd-accent)]" />
          ) : (
            <Lock className="h-3 w-3 text-[var(--xd-ink-muted)]" />
          )}
          <span>Share</span>
        </button>
      </div>
    </header>
  )
}
