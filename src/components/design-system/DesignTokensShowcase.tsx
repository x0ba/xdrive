import React, { useState } from 'react'
import {
  CheckCircle2,
  Loader2,
  Sparkles,
  RefreshCw,
  WifiOff,
  Sun,
  Moon,
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
    role: 'Canvas',
    darkHex: '#0B0C0E',
    lightHex: '#FFFFFF',
    usage: 'Document stage and file list background',
  },
  {
    variable: '--xd-rail',
    role: 'Rail',
    darkHex: '#101216',
    lightHex: '#F7F8FA',
    usage: 'Navigation rail, tab strip, toolbars',
  },
  {
    variable: '--xd-elevated',
    role: 'Elevated',
    darkHex: '#161920',
    lightHex: '#F1F3F7',
    usage: 'Controls, switchers, code trays',
  },
  {
    variable: '--xd-ink',
    role: 'Primary Ink',
    darkHex: '#F3F5F8',
    lightHex: '#0F131A',
    usage: 'Titles and active labels',
  },
  {
    variable: '--xd-ink-secondary',
    role: 'Secondary Ink',
    darkHex: '#A2ABB8',
    lightHex: '#4A5568',
    usage: 'Descriptions and inactive tabs',
  },
  {
    variable: '--xd-ink-muted',
    role: 'Muted Ink',
    darkHex: '#6E7785',
    lightHex: '#718096',
    usage: 'Timestamps, shortcuts, node IDs',
  },
  {
    variable: '--xd-border',
    role: 'Hairline',
    darkHex: '#22252E',
    lightHex: '#E3E8EE',
    usage: '1px structural dividers and outlines',
  },
  {
    variable: '--xd-accent',
    role: 'Accent',
    darkHex: '#5E6AD2',
    lightHex: '#5E6AD2',
    usage: 'Active selection and primary actions',
  },
  {
    variable: '--xd-commit',
    role: 'Committed',
    darkHex: '#2EA071',
    lightHex: '#1F9D6B',
    usage: 'Saved state and insert ops',
  },
  {
    variable: '--xd-sketch',
    role: 'Proposal',
    darkHex: '#E59934',
    lightHex: '#D9822B',
    usage: 'Pending op proposals and sketch annotations',
  },
  {
    variable: '--xd-danger',
    role: 'Destructive',
    darkHex: '#E5484D',
    lightHex: '#E5484D',
    usage: 'Remove ops and errors',
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
      label: 'Saved',
      dotColor: 'bg-[var(--xd-commit)]',
      textColor: 'text-[var(--xd-commit)]',
      bgColor: 'bg-[var(--xd-commit-soft)]',
      borderColor: 'border-[var(--xd-commit)]/30',
      icon: <CheckCircle2 className="h-3 w-3 shrink-0" />,
    },
    saving: {
      label: 'Saving',
      dotColor: 'bg-[var(--xd-accent)] animate-pulse',
      textColor: 'text-[var(--xd-accent)]',
      bgColor: 'bg-[var(--xd-accent-soft)]',
      borderColor: 'border-[var(--xd-accent-border)]',
      icon: <Loader2 className="h-3 w-3 shrink-0 animate-spin" />,
    },
    proposed: {
      label: 'Proposed',
      dotColor: 'bg-[var(--xd-sketch)]',
      textColor: 'text-[var(--xd-sketch)]',
      bgColor: 'bg-[var(--xd-sketch-soft)]',
      borderColor: 'border-[var(--xd-sketch)]/35',
      icon: <Sparkles className="h-3 w-3 shrink-0" />,
    },
    retrying: {
      label: 'Retrying',
      dotColor: 'bg-[var(--xd-sketch)] animate-ping',
      textColor: 'text-[var(--xd-sketch)]',
      bgColor: 'bg-[var(--xd-sketch-soft)]',
      borderColor: 'border-[var(--xd-sketch)]/35',
      icon: <RefreshCw className="h-3 w-3 shrink-0 animate-spin" />,
    },
    offline: {
      label: 'Offline',
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
        className={`inline-block h-1.5 w-1.5 rounded-full ${item.dotColor}`}
      />
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border ${item.borderColor} ${item.bgColor} ${item.textColor} ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-[11.5px]'
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
      signature: 'textContent',
    },
    setInner: {
      badgeBg: 'bg-[var(--xd-accent-soft)]',
      badgeText: 'text-[var(--xd-accent)]',
      badgeBorder: 'border-[var(--xd-accent-border)]',
      signature: 'innerHTML',
    },
    setAttr: {
      badgeBg: 'bg-[var(--xd-sketch-soft)]',
      badgeText: 'text-[var(--xd-sketch)]',
      badgeBorder: 'border-[var(--xd-sketch)]/35',
      signature: 'setAttribute',
    },
    insert: {
      badgeBg: 'bg-[var(--xd-commit-soft)]',
      badgeText: 'text-[var(--xd-commit)]',
      badgeBorder: 'border-[var(--xd-commit)]/35',
      signature: 'insertBefore',
    },
    move: {
      badgeBg: 'bg-[var(--xd-sketch-soft)]',
      badgeText: 'text-[var(--xd-sketch)]',
      badgeBorder: 'border-[var(--xd-sketch)]/35',
      signature: 'moveBefore',
    },
    remove: {
      badgeBg: 'bg-[var(--xd-danger-soft)]',
      badgeText: 'text-[var(--xd-danger)]',
      badgeBorder: 'border-[var(--xd-danger)]/35',
      signature: 'remove',
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
    <div className="inline-flex items-center gap-2 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 py-1 text-[11.5px]">
      <span
        className={`xd-mono inline-flex items-center rounded border px-1.5 py-0.5 text-[10.5px] font-medium leading-none ${spec.badgeBg} ${spec.badgeText} ${spec.badgeBorder}`}
      >
        {opType}
      </span>
      {targetId && (
        <span className="xd-mono text-[var(--xd-ink)]">#{targetId}</span>
      )}
      <span className="xd-mono text-[var(--xd-ink-muted)]">
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
    initialTheme,
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
      summary: '"p_th = 1.04%"',
    },
    {
      type: 'setInner',
      targetId: 'eq-lindblad-master',
      summary: '<math>L[ρ]</math>',
    },
    {
      type: 'setAttr',
      targetId: 'sim-circuit-grid',
      summary: 'data-distance="11"',
    },
    {
      type: 'insert',
      targetId: 'sec-decoder-benchmarks',
      summary: 'before #sec-discussion',
    },
    {
      type: 'move',
      targetId: 'fig-syndrome-graph',
      summary: 'into #col-right',
    },
    {
      type: 'remove',
      targetId: 'draft-legacy-lemma',
      summary: 'removed node',
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
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <header className="flex items-center justify-between border-b border-[var(--xd-border)] pb-4">
          <h1 className="text-[16px] font-semibold tracking-tight text-[var(--xd-ink)]">
            xDrive Tokens
          </h1>

          <div className="flex items-center gap-1 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] p-0.5">
            <button
              type="button"
              onClick={() => handleToggle('dark')}
              className={`inline-flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-[12px] font-medium transition-colors ${
                previewTheme === 'dark'
                  ? 'bg-[var(--xd-canvas)] text-[var(--xd-ink)] shadow-2xs'
                  : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]'
              }`}
            >
              <Moon className="h-3.5 w-3.5" />
              <span>Dark</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggle('light')}
              className={`inline-flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-[12px] font-medium transition-colors ${
                previewTheme === 'light'
                  ? 'bg-[var(--xd-canvas)] text-[var(--xd-ink)] shadow-2xs'
                  : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]'
              }`}
            >
              <Sun className="h-3.5 w-3.5" />
              <span>Light</span>
            </button>
          </div>
        </header>

        <section className="overflow-hidden rounded-md border border-[var(--xd-border)]">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-[var(--xd-border)] bg-[var(--xd-rail)] text-[11px] font-medium text-[var(--xd-ink-secondary)]">
                <th className="px-3 py-2">Swatch</th>
                <th className="px-3 py-2">Token</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Dark</th>
                <th className="px-3 py-2">Light</th>
                <th className="px-3 py-2">Usage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--xd-border)]">
              {XDRIVE_COLOR_TOKENS.map((token) => (
                <tr key={token.variable}>
                  <td className="px-3 py-2">
                    <span
                      className="inline-block h-4 w-6 rounded-xs border border-[var(--xd-border-strong)]"
                      style={{ backgroundColor: `var(${token.variable})` }}
                    />
                  </td>
                  <td className="xd-mono px-3 py-2 font-medium text-[var(--xd-ink)]">
                    {token.variable}
                  </td>
                  <td className="px-3 py-2 text-[var(--xd-ink)]">
                    {token.role}
                  </td>
                  <td className="xd-mono px-3 py-2 text-[var(--xd-ink-secondary)]">
                    {token.darkHex}
                  </td>
                  <td className="xd-mono px-3 py-2 text-[var(--xd-ink-secondary)]">
                    {token.lightHex}
                  </td>
                  <td className="px-3 py-2 text-[var(--xd-ink-secondary)]">
                    {token.usage}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2 rounded-md border border-[var(--xd-border)] p-4">
            <h2 className="text-[12.5px] font-semibold">Sync states</h2>
            <div className="flex flex-wrap gap-2">
              {syncStates.map((st) => (
                <MarbleSyncBadge key={st} state={st} />
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-[var(--xd-border)] p-4">
            <h2 className="text-[12.5px] font-semibold">DOM operations</h2>
            <div className="flex flex-wrap gap-1.5">
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
