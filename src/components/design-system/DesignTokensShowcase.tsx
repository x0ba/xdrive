import React, { useState } from 'react'
import {
  CheckCircle2,
  Loader2,
  Sparkles,
  RefreshCw,
  WifiOff,
  FileCode2,
  Layers,
  Terminal,
  Sun,
  Moon,
  GitCommit,
  PenTool,
  AlertTriangle,
} from 'lucide-react'
import type { MarbleOpType, MarbleDocumentFile } from '#/lib/types'

export interface ColorTokenSpec {
  variable: string
  role: string
  darkHex: string
  lightHex: string
  usage: string
}

export const XDRIVE_COLOR_TOKENS: ColorTokenSpec[] = [
  {
    variable: '--xd-canvas',
    role: 'Primary Workspace Canvas',
    darkHex: '#0B0C0E',
    lightHex: '#FFFFFF',
    usage: 'Main document stage, Drive index background, active editor surface',
  },
  {
    variable: '--xd-rail',
    role: 'Navigation Rail & Tab Bar',
    darkHex: '#101216',
    lightHex: '#F7F8FA',
    usage: '232px left navigation rail, desktop tab strip, recessed toolbars',
  },
  {
    variable: '--xd-elevated',
    role: 'Elevated Card & Inspector',
    darkHex: '#161920',
    lightHex: '#F1F3F7',
    usage: 'Interactive controls, segmented switchers, modal headers, code trays',
  },
  {
    variable: '--xd-ink',
    role: 'Primary Ink',
    darkHex: '#F3F5F8',
    lightHex: '#0F131A',
    usage: 'Document titles, active tab labels, primary metric numerals',
  },
  {
    variable: '--xd-ink-secondary',
    role: 'Secondary Metadata Ink',
    darkHex: '#A2ABB8',
    lightHex: '#4A5568',
    usage: 'Table values, descriptions, inactive tabs, breadcrumb parents',
  },
  {
    variable: '--xd-ink-muted',
    role: 'Muted Technical Ink',
    darkHex: '#6E7785',
    lightHex: '#718096',
    usage: 'Byte counts, timestamps, keyboard shortcuts, subtle node indices',
  },
  {
    variable: '--xd-border',
    role: '1px Structural Hairline',
    darkHex: '#22252E',
    lightHex: '#E3E8EE',
    usage: 'All structural pane dividers, card outlines, table cell rules',
  },
  {
    variable: '--xd-accent',
    role: 'Linear Indigo Accent',
    darkHex: '#5E6AD2',
    lightHex: '#5E6AD2',
    usage: 'Active AI agent collaboration, selected nodes, primary actions',
  },
  {
    variable: '--xd-commit',
    role: 'Marble Op Committed',
    darkHex: '#2EA071',
    lightHex: '#1F9D6B',
    usage: 'Byte-accurate DOM persistence, active provider dots, insert ops',
  },
  {
    variable: '--xd-sketch',
    role: 'Sketch & Proposal Amber',
    darkHex: '#E59934',
    lightHex: '#D9822B',
    usage: 'Pending MarbleOp proposals, freehand sketch overlays, review trays',
  },
  {
    variable: '--xd-danger',
    role: 'Destructive / Remove Op',
    darkHex: '#E5484D',
    lightHex: '#E5484D',
    usage: 'DOM node removal ops, rate-limit warnings, revoke access actions',
  },
]

export interface MarbleSyncBadgeProps {
  state: MarbleDocumentFile['syncState']
  showLabel?: boolean
  size?: 'sm' | 'md'
}

export function MarbleSyncBadge({
  state,
  showLabel = true,
  size = 'md',
}: MarbleSyncBadgeProps) {
  const config: Record<
    MarbleDocumentFile['syncState'],
    {
      label: string
      dotColor: string
      textColor: string
      bgColor: string
      borderColor: string
      icon: React.ReactNode
    }
  > = {
    saved: {
      label: 'Saved to .mrbl',
      dotColor: 'bg-[var(--xd-commit)]',
      textColor: 'text-[var(--xd-commit)]',
      bgColor: 'bg-[var(--xd-commit-soft)]',
      borderColor: 'border-[var(--xd-commit)]/30',
      icon: <CheckCircle2 className="h-3 w-3 shrink-0" />,
    },
    saving: {
      label: 'Serializing HTML5',
      dotColor: 'bg-[var(--xd-accent)] animate-pulse',
      textColor: 'text-[var(--xd-accent)]',
      bgColor: 'bg-[var(--xd-accent-soft)]',
      borderColor: 'border-[var(--xd-accent-border)]',
      icon: <Loader2 className="h-3 w-3 shrink-0 animate-spin" />,
    },
    proposed: {
      label: 'Pending Op Proposal',
      dotColor: 'bg-[var(--xd-sketch)]',
      textColor: 'text-[var(--xd-sketch)]',
      bgColor: 'bg-[var(--xd-sketch-soft)]',
      borderColor: 'border-[var(--xd-sketch)]/35',
      icon: <Sparkles className="h-3 w-3 shrink-0" />,
    },
    retrying: {
      label: 'Reconciling DOM',
      dotColor: 'bg-[var(--xd-sketch)] animate-ping',
      textColor: 'text-[var(--xd-sketch)]',
      bgColor: 'bg-[var(--xd-sketch-soft)]',
      borderColor: 'border-[var(--xd-sketch)]/35',
      icon: <RefreshCw className="h-3 w-3 shrink-0 animate-spin" />,
    },
    offline: {
      label: 'Local Sandbox Only',
      dotColor: 'bg-[var(--xd-danger)]',
      textColor: 'text-[var(--xd-danger)]',
      bgColor: 'bg-[var(--xd-danger-soft)]',
      borderColor: 'border-[var(--xd-danger)]/35',
      icon: <WifiOff className="h-3 w-3 shrink-0" />,
    },
  }

  const item = config[state]

  if (!showLabel) {
    return (
      <span
        title={item.label}
        className={`inline-block h-2 w-2 rounded-full ${item.dotColor}`}
      />
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border ${item.borderColor} ${item.bgColor} ${item.textColor} ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-[12px]'
      } font-medium leading-none`}
    >
      {item.icon}
      <span>{item.label}</span>
    </span>
  )
}

export interface MarbleOpBadgeProps {
  opType: MarbleOpType
  targetId?: string
  summary?: string
}

export function MarbleOpBadge({
  opType,
  targetId,
  summary,
}: MarbleOpBadgeProps) {
  const styles: Record<
    MarbleOpType,
    {
      badgeBg: string
      badgeText: string
      badgeBorder: string
      signature: string
    }
  > = {
    setText: {
      badgeBg: 'bg-[var(--xd-accent-soft)]',
      badgeText: 'text-[var(--xd-accent)]',
      badgeBorder: 'border-[var(--xd-accent-border)]',
      signature: 'node.textContent',
    },
    setInner: {
      badgeBg: 'bg-[var(--xd-accent-soft)]',
      badgeText: 'text-[var(--xd-accent)]',
      badgeBorder: 'border-[var(--xd-accent-border)]',
      signature: 'node.innerHTML',
    },
    setAttr: {
      badgeBg: 'bg-[var(--xd-sketch-soft)]',
      badgeText: 'text-[var(--xd-sketch)]',
      badgeBorder: 'border-[var(--xd-sketch)]/35',
      signature: 'node.setAttribute(k, v)',
    },
    insert: {
      badgeBg: 'bg-[var(--xd-commit-soft)]',
      badgeText: 'text-[var(--xd-commit)]',
      badgeBorder: 'border-[var(--xd-commit)]/35',
      signature: 'parent.insertBefore(el, ref)',
    },
    move: {
      badgeBg: 'bg-[var(--xd-sketch-soft)]',
      badgeText: 'text-[var(--xd-sketch)]',
      badgeBorder: 'border-[var(--xd-sketch)]/35',
      signature: 'parent.moveBefore(id, ref)',
    },
    remove: {
      badgeBg: 'bg-[var(--xd-danger-soft)]',
      badgeText: 'text-[var(--xd-danger)]',
      badgeBorder: 'border-[var(--xd-danger)]/35',
      signature: 'node.remove()',
    },
    assignId: {
      badgeBg: 'bg-[var(--xd-elevated)]',
      badgeText: 'text-[var(--xd-ink-secondary)]',
      badgeBorder: 'border-[var(--xd-border-strong)]',
      signature: 'data-marble-id',
    },
  }

  const spec = styles[opType]

  return (
    <div className="inline-flex items-center gap-2 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 py-1 text-[12px]">
      <span
        className={`xd-mono inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none ${spec.badgeBg} ${spec.badgeText} ${spec.badgeBorder}`}
      >
        {opType}
      </span>
      {targetId && (
        <span className="xd-mono text-[11.5px] text-[var(--xd-ink)]">
          #{targetId}
        </span>
      )}
      <span className="xd-mono text-[11px] text-[var(--xd-ink-muted)]">
        {summary || spec.signature}
      </span>
    </div>
  )
}

export interface DesignTokensShowcaseProps {
  initialTheme?: 'dark' | 'light'
  onThemeChange?: (theme: 'dark' | 'light') => void
}

export function DesignTokensShowcase({
  initialTheme = 'dark',
  onThemeChange,
}: DesignTokensShowcaseProps) {
  const [previewTheme, setPreviewTheme] = useState<'dark' | 'light'>(
    initialTheme
  )

  const handleToggle = (next: 'dark' | 'light') => {
    setPreviewTheme(next)
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', next === 'dark')
    }
    onThemeChange?.(next)
  }

  const allOps: Array<{
    type: MarbleOpType
    targetId: string
    summary: string
  }> = [
    {
      type: 'setText',
      targetId: 'thm-threshold-bound',
      summary: '"Fault-tolerant surface code threshold p_th = 1.04%"',
    },
    {
      type: 'setInner',
      targetId: 'eq-lindblad-master',
      summary: '<math display="block">\\mathcal{L}[\\rho]</math>',
    },
    {
      type: 'setAttr',
      targetId: 'sim-circuit-grid',
      summary: 'data-qubit-distance="11"',
    },
    {
      type: 'insert',
      targetId: 'sec-decoder-benchmarks',
      summary: 'before #sec-discussion (4 nodes)',
    },
    {
      type: 'move',
      targetId: 'fig-syndrome-graph',
      summary: 'into #col-right-panel',
    },
    {
      type: 'remove',
      targetId: 'draft-legacy-lemma',
      summary: 'pruned obsolete appendix block',
    },
    {
      type: 'assignId',
      targetId: 'tbl-logical-error-rates',
      summary: 'path [0, 2, 4, 1]',
    },
  ]

  const syncStates: MarbleDocumentFile['syncState'][] = [
    'saved',
    'saving',
    'proposed',
    'retrying',
    'offline',
  ]

  return (
    <div
      className={previewTheme === 'dark' ? 'dark' : ''}
      style={{
        backgroundColor: 'var(--xd-canvas)',
        color: 'var(--xd-ink)',
      }}
    >
      <div className="mx-auto max-w-6xl space-y-8 p-6">
        {/* Top Specification Header Bar */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--xd-border)] pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]">
                <Layers className="h-3.5 w-3.5" />
              </span>
              <h1 className="text-[18px] font-semibold tracking-tight text-[var(--xd-ink)]">
                xDrive Design System & Marble (.mrbl) Token Architecture
              </h1>
              <span className="xd-mono rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-2 py-0.5 text-[11px] text-[var(--xd-ink-secondary)]">
                @bdhmin/marble v0.2.6
              </span>
            </div>
            <p className="mt-1 text-[13px] text-[var(--xd-ink-secondary)]">
              Dual-mode workspace specification grounded in Obsidian Studio
              (Linear/Notion dark precision) and Alabaster Lab (Stripe high-clarity light).
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] p-1">
            <button
              type="button"
              onClick={() => handleToggle('dark')}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-medium transition-colors ${
                previewTheme === 'dark'
                  ? 'bg-[var(--xd-elevated)] text-[var(--xd-ink)] shadow-2xs'
                  : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]'
              }`}
            >
              <Moon className="h-3.5 w-3.5" />
              <span>Obsidian Studio</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggle('light')}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-medium transition-colors ${
                previewTheme === 'light'
                  ? 'bg-[var(--xd-canvas)] text-[var(--xd-ink)] shadow-2xs'
                  : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]'
              }`}
            >
              <Sun className="h-3.5 w-3.5" />
              <span>Alabaster Lab</span>
            </button>
          </div>
        </header>

        {/* Section 1: Surface Elevations */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[14px] font-semibold text-[var(--xd-ink)]">
              Surface Elevation Hierarchy & 1px Structural Hairlines
            </h2>
            <span className="xd-mono text-[11.5px] text-[var(--xd-ink-muted)]">
              border: 1px solid var(--xd-border)
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] p-4">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-medium text-[var(--xd-ink)]">
                  Canvas Surface
                </span>
                <span className="xd-mono text-[11px] text-[var(--xd-ink-muted)]">
                  --xd-canvas
                </span>
              </div>
              <p className="mt-2 text-[12px] text-[var(--xd-ink-secondary)]">
                Primary `.mrbl` interactive stage and document index viewport.
              </p>
              <div className="xd-mono mt-3 text-[11px] text-[var(--xd-ink-muted)]">
                {previewTheme === 'dark' ? '#0B0C0E' : '#FFFFFF'}
              </div>
            </div>

            <div className="rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] p-4">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-medium text-[var(--xd-ink)]">
                  Navigation Rail
                </span>
                <span className="xd-mono text-[11px] text-[var(--xd-ink-muted)]">
                  --xd-rail
                </span>
              </div>
              <p className="mt-2 text-[12px] text-[var(--xd-ink-secondary)]">
                Recessed 232px sidebar rail, multi-tab strip, and status footers.
              </p>
              <div className="xd-mono mt-3 text-[11px] text-[var(--xd-ink-muted)]">
                {previewTheme === 'dark' ? '#101216' : '#F7F8FA'}
              </div>
            </div>

            <div className="rounded-md border border-[var(--xd-border)] bg-[var(--xd-elevated)] p-4">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-medium text-[var(--xd-ink)]">
                  Elevated Control
                </span>
                <span className="xd-mono text-[11px] text-[var(--xd-ink-muted)]">
                  --xd-elevated
                </span>
              </div>
              <p className="mt-2 text-[12px] text-[var(--xd-ink-secondary)]">
                Segmented mode switchers, code inspector drawers, and active pills.
              </p>
              <div className="xd-mono mt-3 text-[11px] text-[var(--xd-ink-muted)]">
                {previewTheme === 'dark' ? '#161920' : '#F1F3F7'}
              </div>
            </div>

            <div className="xd-glass-bar rounded-md border border-[var(--xd-accent-border)] p-4">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-medium text-[var(--xd-ink)]">
                  Floating Glass Bar
                </span>
                <span className="xd-mono text-[11px] text-[var(--xd-accent)]">
                  --xd-glass
                </span>
              </div>
              <p className="mt-2 text-[12px] text-[var(--xd-ink-secondary)]">
                Translucent command palette and floating sketch annotation HUD.
              </p>
              <div className="xd-mono mt-3 text-[11px] text-[var(--xd-ink-muted)]">
                backdrop-filter: blur(12px)
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Dual-Theme Color Palette Table */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[14px] font-semibold text-[var(--xd-ink)]">
              Dual-Theme Semantic Color Tokens
            </h2>
            <span className="text-[12px] text-[var(--xd-ink-secondary)]">
              Live CSS variables alongside Obsidian Studio & Alabaster Lab reference hexes
            </span>
          </div>

          <div className="overflow-hidden rounded-md border border-[var(--xd-border)]">
            <table className="w-full border-collapse text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-[var(--xd-border)] bg-[var(--xd-rail)] text-[11.5px] font-medium text-[var(--xd-ink-secondary)]">
                  <th className="px-3.5 py-2.5">Live Swatch</th>
                  <th className="px-3.5 py-2.5">Token Variable</th>
                  <th className="px-3.5 py-2.5">Semantic Role</th>
                  <th className="px-3.5 py-2.5">Obsidian Dark</th>
                  <th className="px-3.5 py-2.5">Alabaster Light</th>
                  <th className="px-3.5 py-2.5">Workspace Application</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--xd-border)]">
                {XDRIVE_COLOR_TOKENS.map((token) => (
                  <tr
                    key={token.variable}
                    className="transition-colors hover:bg-[var(--xd-rail)]/60"
                  >
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-5 w-8 rounded border border-[var(--xd-border-strong)]"
                          style={{ backgroundColor: `var(${token.variable})` }}
                        />
                      </div>
                    </td>
                    <td className="xd-mono px-3.5 py-2.5 text-[12px] font-medium text-[var(--xd-ink)]">
                      {token.variable}
                    </td>
                    <td className="px-3.5 py-2.5 font-medium text-[var(--xd-ink)]">
                      {token.role}
                    </td>
                    <td className="xd-mono px-3.5 py-2.5 text-[11.5px] text-[var(--xd-ink-secondary)]">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full border border-white/20"
                          style={{ backgroundColor: token.darkHex }}
                        />
                        {token.darkHex}
                      </span>
                    </td>
                    <td className="xd-mono px-3.5 py-2.5 text-[11.5px] text-[var(--xd-ink-secondary)]">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full border border-black/20"
                          style={{ backgroundColor: token.lightHex }}
                        />
                        {token.lightHex}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-[12px] text-[var(--xd-ink-secondary)]">
                      {token.usage}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 3: Typography Scale */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[14px] font-semibold text-[var(--xd-ink)]">
              Tri-Modal Typography System
            </h2>
            <span className="text-[12px] text-[var(--xd-ink-secondary)]">
              Inter UI Sans, Newsreader Editorial Serif, and JetBrains Mono for DOM/Op data
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Inter UI Sans */}
            <div className="flex flex-col justify-between rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)]/40 p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--xd-border)] pb-2">
                  <span className="text-[12px] font-semibold text-[var(--xd-ink)]">
                    Inter — Workspace UI & Tabular Metrics
                  </span>
                  <span className="xd-mono text-[11px] text-[var(--xd-ink-muted)]">
                    --font-sans
                  </span>
                </div>
                <div className="space-y-2">
                  <p className="text-[16px] font-semibold tracking-tight text-[var(--xd-ink)]">
                    Multi-Agent Research Drive
                  </p>
                  <p className="text-[13px] text-[var(--xd-ink-secondary)]">
                    High-density 12px/13px navigation chrome with strict tabular
                    numerals for real-time node telemetry.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between border-t border-[var(--xd-border)] pt-3">
                <span className="text-[11.5px] text-[var(--xd-ink-muted)]">
                  Tabular Telemetry (.xd-tabular)
                </span>
                <span className="xd-tabular text-[15px] font-semibold text-[var(--xd-ink)]">
                  1,428 nodes · 48.6 KB · 14ms
                </span>
              </div>
            </div>

            {/* Newsreader Editorial Serif */}
            <div className="flex flex-col justify-between rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)]/40 p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--xd-border)] pb-2">
                  <span className="text-[12px] font-semibold text-[var(--xd-ink)]">
                    Newsreader — Editorial & LaTeX Headings
                  </span>
                  <span className="xd-mono text-[11px] text-[var(--xd-ink-muted)]">
                    .xd-serif
                  </span>
                </div>
                <div className="space-y-2">
                  <p className="xd-serif text-[21px] font-medium leading-snug text-[var(--xd-ink)]">
                    Fault-Tolerant Logical Qubits in Floquet Surface Codes
                  </p>
                  <p className="xd-serif text-[14px] italic text-[var(--xd-ink-secondary)]">
                    §2.4 Asymptotic syndrome decoding under non-Markovian dephasing noise
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between border-t border-[var(--xd-border)] pt-3">
                <span className="text-[11.5px] text-[var(--xd-ink-muted)]">
                  Used inside .mrbl manuscripts
                </span>
                <span className="xd-serif text-[13px] text-[var(--xd-ink)]">
                  Theorem 4.2 · Corollary 1.1
                </span>
              </div>
            </div>

            {/* JetBrains Mono */}
            <div className="flex flex-col justify-between rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)]/40 p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--xd-border)] pb-2">
                  <span className="text-[12px] font-semibold text-[var(--xd-ink)]">
                    JetBrains Mono — Technical & DOM Data
                  </span>
                  <span className="xd-mono text-[11px] text-[var(--xd-ink-muted)]">
                    .xd-mono
                  </span>
                </div>
                <div className="xd-mono space-y-1.5 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] p-2.5 text-[11.5px]">
                  <div className="text-[var(--xd-accent)]">
                    quantum-error-correction.mrbl
                  </div>
                  <div className="text-[var(--xd-ink-secondary)]">
                    data-marble-id=&quot;fig-threshold-curve&quot;
                  </div>
                  <div className="text-[var(--xd-commit)]">
                    op: setAttr(id, &quot;data-scale&quot;, &quot;1.25&quot;)
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between border-t border-[var(--xd-border)] pt-3">
                <span className="text-[11.5px] text-[var(--xd-ink-muted)]">
                  Reserved strictly for technical identifiers
                </span>
                <span className="xd-mono text-[11.5px] text-[var(--xd-ink)]">
                  sha: 9c4e1a2
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: Semantic Marble Op & Sync Status Badges */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="space-y-3 rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)]/30 p-4 lg:col-span-5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--xd-ink)]">
                <FileCode2 className="h-3.5 w-3.5 text-[var(--xd-accent)]" />
                <span>Document Sync States</span>
              </h3>
              <span className="xd-mono text-[11px] text-[var(--xd-ink-muted)]">
                MarbleDocumentFile.syncState
              </span>
            </div>
            <p className="text-[12px] text-[var(--xd-ink-secondary)]">
              Every `.mrbl` application serializes live DOM changes back to self-contained HTML5 source.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {syncStates.map((st) => (
                <MarbleSyncBadge key={st} state={st} />
              ))}
            </div>
            <div className="mt-4 border-t border-[var(--xd-border)] pt-3">
              <div className="text-[11.5px] font-medium text-[var(--xd-ink-secondary)]">
                Semantic Permission & Mode Pills
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--xd-accent)]">
                  <GitCommit className="h-3 w-3" />
                  Full Edit + Shared AI
                </span>
                <span className="inline-flex items-center gap-1.5 rounded border border-[var(--xd-sketch)]/35 bg-[var(--xd-sketch-soft)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--xd-sketch)]">
                  <PenTool className="h-3 w-3" />
                  Sketch & Propose Only
                </span>
                <span className="inline-flex items-center gap-1.5 rounded border border-[var(--xd-danger)]/35 bg-[var(--xd-danger-soft)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--xd-danger)]">
                  <AlertTriangle className="h-3 w-3" />
                  Quota Rate Limited
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)]/30 p-4 lg:col-span-7">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--xd-ink)]">
                <Terminal className="h-3.5 w-3.5 text-[var(--xd-commit)]" />
                <span>Atomic Marble DOM Operations (MarbleOpType)</span>
              </h3>
              <span className="xd-mono text-[11px] text-[var(--xd-ink-muted)]">
                window.Marble.applyOps(ops)
              </span>
            </div>
            <p className="text-[12px] text-[var(--xd-ink-secondary)]">
              AI Collaborators propose structured atomic DOM mutations targeting elements by{' '}
              <code className="xd-mono text-[11.5px] text-[var(--xd-ink)]">
                data-marble-id
              </code>
              .
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {allOps.map((op) => (
                <MarbleOpBadge
                  key={op.type}
                  opType={op.type}
                  targetId={op.targetId}
                  summary={op.summary}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
