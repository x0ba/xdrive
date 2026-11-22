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
  Bot,
  LayoutTemplate,
  Users,
  KeyRound,
  Pin,
  Clock,
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
  ChevronDown,
  PanelRightOpen,
  PanelRightClose,
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
  className = 'h-3.5 w-3.5'
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
      return 'LaTeX Manuscript'
    case 'notebook':
      return 'Lab Notebook'
    case 'document':
      return 'Interactive Doc'
    case 'slides':
      return 'Research Deck'
    case 'matrix':
      return 'Literature Matrix'
    case 'sandbox':
      return 'Simulation Sandbox'
    case 'custom':
    default:
      return 'Custom .mrbl'
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
        shortLabel: 'Edit + Shared AI',
        badgeClass:
          'border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]',
      }
    case 'edit_with_ai_byok':
      return {
        label: 'Full Edit + Visitor BYOK AI',
        shortLabel: 'Edit + BYOK AI',
        badgeClass:
          'border-[var(--xd-commit)]/35 bg-[var(--xd-commit-soft)] text-[var(--xd-commit)]',
      }
    case 'edit_no_ai':
      return {
        label: 'Edit without AI',
        shortLabel: 'Edit without AI',
        badgeClass:
          'border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] text-[var(--xd-ink)]',
      }
    case 'comment_annotate':
      return {
        label: 'Sketch & Propose Only',
        shortLabel: 'Annotate & Propose',
        badgeClass:
          'border-[var(--xd-sketch)]/35 bg-[var(--xd-sketch-soft)] text-[var(--xd-sketch)]',
      }
    case 'view_only':
    default:
      return {
        label: 'View Only (Local Look)',
        shortLabel: 'View Only',
        badgeClass:
          'border-[var(--xd-border)] bg-[var(--xd-rail)] text-[var(--xd-ink-secondary)]',
      }
  }
}

/* ============================================================================
   1. BrowserTabStrip — Notion-Desktop-Inspired Top Multi-Tab Bar
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
  aiSidebarOpen = true,
  onToggleAiSidebar,
  pendingProposalsCount = 0,
}: BrowserTabStripProps) {
  return (
    <div className="flex h-10 w-full select-none items-center justify-between border-b border-[var(--xd-border)] bg-[var(--xd-rail)] px-2 text-[12.5px]">
      {/* Left: History navigation + Drive Home tab + Open .mrbl Document Tabs */}
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {/* Back / Forward buttons */}
        <div className="mr-1 flex items-center gap-0.5">
          <button
            type="button"
            onClick={onBack}
            disabled={!canGoBack}
            title="Navigate back"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] disabled:opacity-35"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onForward}
            disabled={!canGoForward}
            title="Navigate forward"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] disabled:opacity-35"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Drive Home Anchor Tab */}
        <button
          type="button"
          onClick={() => onSelectTab?.('home')}
          className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded px-2.5 text-[12px] font-medium transition-colors ${
            activeTabId === 'home'
              ? 'border border-[var(--xd-border)] bg-[var(--xd-canvas)] text-[var(--xd-ink)] shadow-2xs'
              : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
          }`}
        >
          <HardDrive className="h-3.5 w-3.5 text-[var(--xd-accent)]" />
          <span>Drive Home</span>
        </button>

        <span className="mx-0.5 h-4 w-[1px] bg-[var(--xd-border)]" />

        {/* Open .mrbl Application Tabs */}
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {openTabs.map((tab) => {
            const isActive = activeTabId === tab.id
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelectTab?.(tab.id)}
                className={`group inline-flex h-7 max-w-[250px] shrink-0 cursor-pointer items-center gap-2 rounded px-2.5 text-[12px] transition-colors ${
                  isActive
                    ? 'border border-[var(--xd-border)] bg-[var(--xd-canvas)] font-medium text-[var(--xd-ink)] shadow-2xs'
                    : 'border border-transparent text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
                }`}
              >
                <span
                  className={
                    isActive
                      ? 'text-[var(--xd-accent)]'
                      : 'text-[var(--xd-ink-muted)] group-hover:text-[var(--xd-ink-secondary)]'
                  }
                >
                  {getCategoryIcon(tab.category, 'h-3.5 w-3.5')}
                </span>

                <span className="truncate" title={tab.fileName}>
                  {tab.title}
                </span>

                <MarbleSyncBadge state={tab.syncState} showLabel={false} />

                <span
                  title={`${tab.nodeCount} addressable data-marble-id elements`}
                  className="xd-tabular xd-mono rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-1.5 py-0.2 text-[10.5px] text-[var(--xd-ink-muted)]"
                >
                  {tab.nodeCount}n
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseTab?.(tab.id)
                  }}
                  title={`Close ${tab.fileName}`}
                  className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-[var(--xd-ink-muted)] opacity-70 transition-colors hover:bg-[var(--xd-surface-active)] hover:text-[var(--xd-ink)] group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })}

          {/* + New Tab Button */}
          <button
            type="button"
            onClick={onNewTab}
            title="New .mrbl App or Agent Studio Tab"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Right: Role Simulator Pill, Theme Toggle, Cursor AI Collaborator Sidebar Toggle */}
      <div className="ml-2 flex shrink-0 items-center gap-2">
        {simulatedRole !== 'owner' && (
          <div className="inline-flex items-center gap-1.5 rounded border border-[var(--xd-sketch)]/45 bg-[var(--xd-sketch-soft)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--xd-sketch)]">
            <ShieldAlert className="h-3 w-3 shrink-0" />
            <span>
              Viewing as:{' '}
              <strong>{getPermissionMeta(simulatedRole).shortLabel}</strong>
            </span>
            {onClearRoleSimulation && (
              <button
                type="button"
                onClick={onClearRoleSimulation}
                title="Exit permission simulator"
                className="ml-1 rounded px-1 text-[10.5px] underline hover:text-[var(--xd-ink)]"
              >
                Reset
              </button>
            )}
          </div>
        )}

        {/* Theme Switcher */}
        <button
          type="button"
          onClick={onToggleTheme}
          title={
            theme === 'dark'
              ? 'Switch to Alabaster Lab (Light)'
              : 'Switch to Obsidian Studio (Dark)'
          }
          className="inline-flex h-7 items-center gap-1.5 rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-2 text-[11.5px] font-medium text-[var(--xd-ink-secondary)] transition-colors hover:text-[var(--xd-ink)]"
        >
          {theme === 'dark' ? (
            <>
              <Moon className="h-3 w-3 text-[var(--xd-accent)]" />
              <span className="hidden sm:inline">Obsidian</span>
            </>
          ) : (
            <>
              <Sun className="h-3 w-3 text-[var(--xd-sketch)]" />
              <span className="hidden sm:inline">Alabaster</span>
            </>
          )}
        </button>

        {/* Cursor AI Collaborator Sidebar Toggle */}
        <button
          type="button"
          onClick={onToggleAiSidebar}
          className={`inline-flex h-7 items-center gap-1.5 rounded border px-2.5 text-[12px] font-medium transition-colors ${
            aiSidebarOpen
              ? 'border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]'
              : 'border-[var(--xd-border)] bg-[var(--xd-elevated)] text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>AI Collaborator</span>
          {pendingProposalsCount > 0 && (
            <span className="xd-tabular inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--xd-sketch)] px-1 text-[10.5px] font-semibold text-black">
              {pendingProposalsCount}
            </span>
          )}
          {aiSidebarOpen ? (
            <PanelRightClose className="h-3.5 w-3.5 opacity-75" />
          ) : (
            <PanelRightOpen className="h-3.5 w-3.5 opacity-75" />
          )}
        </button>
      </div>
    </div>
  )
}

/* ============================================================================
   2. SidebarRail — Linear + Notion 232px Left Navigation Rail
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

const DEFAULT_SUBSCRIPTION_STATUS: Pick<
  AISubscription,
  'providerId' | 'name' | 'connected' | 'status' | 'planName'
>[] = [
  {
    providerId: 'opencode-go',
    name: 'OpenCode Go',
    connected: true,
    status: 'active',
    planName: 'Argon Team',
  },
  {
    providerId: 'xai',
    name: 'SpaceX AI (xAI)',
    connected: true,
    status: 'active',
    planName: 'Grok 4.7 Research',
  },
  {
    providerId: 'claude',
    name: 'Claude',
    connected: true,
    status: 'active',
    planName: 'Max Subscription',
  },
  {
    providerId: 'openai',
    name: 'OpenAI',
    connected: false,
    status: 'disconnected',
    planName: 'BYOK Key',
  },
]

export function SidebarRail({
  activeNav,
  onSelectNav,
  onOpenCommandPalette,
  pinnedApps = [],
  recentApps = [],
  activeAppId,
  onSelectApp,
  subscriptions = DEFAULT_SUBSCRIPTION_STATUS,
  onManageSubscriptions,
}: SidebarRailProps) {
  const navItems: Array<{
    id: PrimaryNavId
    label: string
    icon: React.ReactNode
    badge?: string
  }> = [
    {
      id: 'drive',
      label: 'Drive Home',
      icon: <HardDrive className="h-3.5 w-3.5" />,
    },
    {
      id: 'agent-studio',
      label: 'Agent Studio',
      icon: <Bot className="h-3.5 w-3.5" />,
      badge: 'New .mrbl',
    },
    {
      id: 'templates',
      label: 'Templates (.mrbl)',
      icon: <LayoutTemplate className="h-3.5 w-3.5" />,
    },
    {
      id: 'shared',
      label: 'Shared with Me',
      icon: <Users className="h-3.5 w-3.5" />,
    },
    {
      id: 'subscriptions',
      label: 'AI Subscriptions',
      icon: <KeyRound className="h-3.5 w-3.5" />,
    },
  ]

  return (
    <aside className="flex h-full w-[232px] shrink-0 select-none flex-col justify-between border-r border-[var(--xd-border)] bg-[var(--xd-rail)] text-[12.5px]">
      {/* Top Section: Workspace Switcher + Cmd+K Search + Primary Nav */}
      <div className="flex flex-col gap-3 p-2.5">
        {/* Workspace Header */}
        <div className="flex items-center justify-between rounded px-2 py-1.5 transition-colors hover:bg-[var(--xd-surface-hover)]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--xd-accent)] text-[11px] font-bold text-white">
              X
            </span>
            <div className="truncate">
              <div className="truncate text-[12.5px] font-semibold leading-tight text-[var(--xd-ink)]">
                xDrive Research Lab
              </div>
              <div className="xd-mono truncate text-[10.5px] text-[var(--xd-ink-muted)]">
                marble-v0.2.6
              </div>
            </div>
          </div>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--xd-ink-muted)]" />
        </div>

        {/* Quick Search or Ask... Cmd+K */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex w-full items-center justify-between rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2.5 py-1.5 text-[12px] text-[var(--xd-ink-secondary)] transition-colors hover:border-[var(--xd-border-strong)] hover:text-[var(--xd-ink)]"
        >
          <span className="flex items-center gap-2 truncate">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--xd-ink-muted)]" />
            <span className="truncate">Search or ask...</span>
          </span>
          <kbd className="xd-mono rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--xd-ink-muted)]">
            ⌘K
          </kbd>
        </button>

        {/* Primary Navigation Links */}
        <nav className="space-y-0.5" aria-label="Primary Workspace Navigation">
          {navItems.map((item) => {
            const active = activeNav === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectNav?.(item.id)}
                className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
                  active
                    ? 'bg-[var(--xd-surface-active)] font-medium text-[var(--xd-ink)]'
                    : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <span
                    className={
                      active
                        ? 'text-[var(--xd-accent)]'
                        : 'text-[var(--xd-ink-muted)]'
                    }
                  >
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge && (
                  <span className="xd-mono rounded border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] px-1.5 py-0.2 text-[10px] font-medium text-[var(--xd-accent)]">
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Pinned .mrbl Apps Section */}
        {pinnedApps.length > 0 && (
          <div className="mt-1 space-y-1 border-t border-[var(--xd-border)] pt-3">
            <div className="flex items-center justify-between px-2 text-[11px] font-medium text-[var(--xd-ink-muted)]">
              <span className="flex items-center gap-1.5">
                <Pin className="h-3 w-3" />
                <span>Pinned .mrbl Apps</span>
              </span>
              <span className="xd-tabular">{pinnedApps.length}</span>
            </div>
            <div className="space-y-0.5">
              {pinnedApps.map((app) => {
                const isSelected = activeAppId === app.id
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => onSelectApp?.(app.id)}
                    className={`group flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[12px] transition-colors ${
                      isSelected
                        ? 'bg-[var(--xd-surface-active)] font-medium text-[var(--xd-ink)]'
                        : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 text-[var(--xd-accent)]">
                        {getCategoryIcon(app.category, 'h-3.5 w-3.5')}
                      </span>
                      <span className="truncate">{app.title}</span>
                    </span>
                    <span className="xd-tabular xd-mono ml-1.5 shrink-0 text-[10.5px] text-[var(--xd-ink-muted)]">
                      {app.nodeCount}n
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Recent Apps Section */}
        {recentApps.length > 0 && (
          <div className="mt-1 space-y-1 border-t border-[var(--xd-border)] pt-3">
            <div className="flex items-center justify-between px-2 text-[11px] font-medium text-[var(--xd-ink-muted)]">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                <span>Recent Apps</span>
              </span>
            </div>
            <div className="space-y-0.5">
              {recentApps.map((app) => {
                const isSelected = activeAppId === app.id
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => onSelectApp?.(app.id)}
                    className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-[12px] transition-colors ${
                      isSelected
                        ? 'bg-[var(--xd-surface-active)] font-medium text-[var(--xd-ink)]'
                        : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 text-[var(--xd-ink-muted)]">
                        {getCategoryIcon(app.category, 'h-3 w-3')}
                      </span>
                      <span className="truncate">{app.title}</span>
                    </span>
                    <span className="xd-tabular ml-1.5 shrink-0 text-[10.5px] text-[var(--xd-ink-muted)]">
                      {app.updatedAt}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Card: Connected AI Subscriptions Status */}
      <div className="border-t border-[var(--xd-border)] p-2.5">
        <div className="rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-semibold text-[var(--xd-ink)]">
              Connected AI Subscriptions
            </span>
            <button
              type="button"
              onClick={
                onManageSubscriptions ?? (() => onSelectNav?.('subscriptions'))
              }
              className="text-[11px] font-medium text-[var(--xd-accent)] hover:underline"
            >
              Configure
            </button>
          </div>
          <div className="mt-2 space-y-1.5">
            {subscriptions.map((sub) => {
              const dotClass =
                sub.status === 'active'
                  ? 'bg-[var(--xd-commit)]'
                  : sub.status === 'rate_limited'
                    ? 'bg-[var(--xd-sketch)]'
                    : 'bg-[var(--xd-ink-subtle)]'

              return (
                <div
                  key={sub.providerId}
                  className="flex items-center justify-between text-[11.5px]"
                >
                  <span className="flex items-center gap-1.5 truncate text-[var(--xd-ink-secondary)]">
                    <span
                      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`}
                    />
                    <span className="truncate">{sub.name}</span>
                  </span>
                  <span className="xd-mono truncate text-[10.5px] text-[var(--xd-ink-muted)]">
                    {sub.connected ? sub.planName : 'Not linked'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </aside>
  )
}

/* ============================================================================
   3. DocumentBreadcrumbHeader — Notion-Inspired Document Top Bar
   ============================================================================ */

export interface DocumentBreadcrumbHeaderProps {
  folder: string
  category: MarbleAppCategory
  fileName: string
  nodeCount: number
  byteSize: number
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
  category,
  fileName,
  nodeCount,
  byteSize,
  syncState,
  interactionMode,
  onChangeInteractionMode,
  onDuplicate,
  onOpenShare,
  sharePermission,
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
      label: 'Direct Edit',
      icon: <MousePointerClick className="h-3.5 w-3.5" />,
      shortcut: '1',
    },
    {
      id: 'select',
      label: 'Select Area',
      icon: <BoxSelect className="h-3.5 w-3.5" />,
      shortcut: '2',
    },
    {
      id: 'sketch',
      label: 'Sketch & Annotate',
      icon: <PenTool className="h-3.5 w-3.5" />,
      shortcut: '3',
    },
    {
      id: 'source',
      label: 'Source & Ops',
      icon: <Code2 className="h-3.5 w-3.5" />,
      shortcut: '4',
    },
  ]

  const permMeta = getPermissionMeta(sharePermission)

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--xd-border)] bg-[var(--xd-canvas)] px-4 py-2 text-[12.5px]">
      {/* Left: Breadcrumb + Managed by Marble v0.2.6 + Node/Byte Telemetry */}
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <nav
          aria-label="Document Breadcrumb"
          className="flex items-center gap-1.5 truncate text-[12.5px]"
        >
          <span className="text-[var(--xd-ink-secondary)]">{folder}</span>
          <span className="text-[var(--xd-ink-muted)]">/</span>
          <span className="inline-flex items-center gap-1 text-[var(--xd-ink-secondary)]">
            {getCategoryIcon(category, 'h-3.5 w-3.5 text-[var(--xd-accent)]')}
            <span>{getCategoryLabel(category)}</span>
          </span>
          <span className="text-[var(--xd-ink-muted)]">/</span>
          <span className="xd-mono font-medium text-[var(--xd-ink)]">
            {fileName}
          </span>
        </nav>

        <span className="xd-mono inline-flex items-center rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-1.5 py-0.5 text-[11px] text-[var(--xd-ink-secondary)]">
          Managed by Marble v0.2.6
        </span>

        <div className="xd-tabular flex items-center gap-2 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2 py-0.5 text-[11.5px] text-[var(--xd-ink-secondary)]">
          <span>
            <strong className="font-semibold text-[var(--xd-ink)]">
              {nodeCount}
            </strong>{' '}
            <code className="xd-mono text-[10.5px] text-[var(--xd-ink-muted)]">
              data-marble-id
            </code>
          </span>
          <span className="text-[var(--xd-border-strong)]">|</span>
          <span className="xd-mono text-[11px]">{formatBytes(byteSize)}</span>
        </div>

        <MarbleSyncBadge state={syncState} size="sm" />
      </div>

      {/* Center / Right: Interaction Mode Segmented Switcher + Duplicate + Share */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Canvas Interaction Mode Switcher */}
        <div
          role="group"
          aria-label="Canvas Interaction Mode"
          className="inline-flex items-center rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] p-0.5"
        >
          {modeOptions.map((mode) => {
            const active = interactionMode === mode.id
            const isSketch = mode.id === 'sketch'
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => onChangeInteractionMode?.(mode.id)}
                title={`${mode.label} (Press ${mode.shortcut})`}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  active
                    ? isSketch
                      ? 'bg-[var(--xd-sketch-soft)] text-[var(--xd-sketch)] border border-[var(--xd-sketch)]/40'
                      : 'bg-[var(--xd-elevated)] text-[var(--xd-ink)] shadow-2xs'
                    : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]'
                }`}
              >
                {mode.icon}
                <span>{mode.label}</span>
              </button>
            )
          })}
        </div>

        {/* Duplicate .mrbl Button */}
        <button
          type="button"
          onClick={onDuplicate}
          className="inline-flex h-7 items-center gap-1.5 rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-2.5 text-[12px] font-medium text-[var(--xd-ink)] transition-colors hover:bg-[var(--xd-surface-hover)]"
        >
          <Copy className="h-3.5 w-3.5 text-[var(--xd-ink-secondary)]" />
          <span>Duplicate .mrbl</span>
        </button>

        {/* Share Button with Permission Lock Icon */}
        <button
          type="button"
          onClick={onOpenShare}
          className={`inline-flex h-7 items-center gap-1.5 rounded border px-2.5 text-[12px] font-medium transition-colors ${permMeta.badgeClass}`}
        >
          {isPublicLinkEnabled ? (
            <Globe className="h-3.5 w-3.5" />
          ) : (
            <Lock className="h-3.5 w-3.5" />
          )}
          <span>Share</span>
          <span className="opacity-75">· {permMeta.shortLabel}</span>
        </button>
      </div>
    </header>
  )
}
