import { useEffect, useId, useState } from 'react'
import { Check, Copy, Eye, Globe, Lock, X } from 'lucide-react'
import type { ShareConfig, SharePermissionLevel } from '#/lib/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Slider } from '#/components/ui/slider'
import { Switch } from '#/components/ui/switch'
import { cn } from '#/lib/utils'

export type AiTier = 'off' | 'propose' | 'byok' | 'shared'

export interface PermissionSpec {
  level: SharePermissionLevel
  title: string
  summary: string
  directEdit: boolean
  look: boolean
  sketch: boolean
  ai: AiTier
  quotaLabel: string
  blockReason: string | null
}

export const PERMISSIONS: PermissionSpec[] = [
  {
    level: 'view_only',
    title: 'View only',
    summary: 'Read and switch views locally. Cannot edit or use AI.',
    directEdit: false,
    look: true,
    sketch: false,
    ai: 'off',
    quotaLabel: 'No AI',
    blockReason: 'View only. Editing and AI are disabled for this role.',
  },
  {
    level: 'comment_annotate',
    title: 'Annotate & propose',
    summary: 'Draw sketches and propose AI ops without writing to the file.',
    directEdit: false,
    look: true,
    sketch: true,
    ai: 'propose',
    quotaLabel: 'Review queue',
    blockReason: null,
  },
  {
    level: 'edit_no_ai',
    title: 'Edit without AI',
    summary: 'Direct editing enabled. AI tools are locked.',
    directEdit: true,
    look: true,
    sketch: false,
    ai: 'off',
    quotaLabel: 'No AI',
    blockReason: 'Edit without AI. AI tools are disabled for this role.',
  },
  {
    level: 'edit_with_ai_byok',
    title: 'Edit + own AI key',
    summary: 'Full editing and AI using the collaborator’s subscription.',
    directEdit: true,
    look: true,
    sketch: true,
    ai: 'byok',
    quotaLabel: 'Collaborator key',
    blockReason: null,
  },
  {
    level: 'edit_with_ai_shared',
    title: 'Edit + shared AI',
    summary: 'Full editing and AI using the owner’s shared quota.',
    directEdit: true,
    look: true,
    sketch: true,
    ai: 'shared',
    quotaLabel: 'Shared quota',
    blockReason: null,
  },
]

export function permissionByLevel(level: SharePermissionLevel): PermissionSpec {
  return PERMISSIONS.find((item) => item.level === level) ?? PERMISSIONS[0]
}

export function aiIsBlocked(level: SharePermissionLevel): boolean {
  return permissionByLevel(level).ai === 'off'
}

export const DEMO_SHARE_CONFIG: ShareConfig = {
  isPublicLinkEnabled: true,
  publicLinkUrl: 'https://xdrive.app/s/qec-floquet-7k',
  publicPermission: 'view_only',
  allowDuplication: false,
  sharedAiDailyLimit: 120,
  sharedAiUsedToday: 42,
  collaborators: [],
}

export interface ShareModalProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  variant?: 'modal' | 'inline'
  fileName: string
  title: string
  config?: ShareConfig
  simulatedPermission?: SharePermissionLevel
  onConfigChange?: (config: ShareConfig) => void
  onSimulatePermission?: (level: SharePermissionLevel) => void
}

function PermissionSelect({
  value,
  onValueChange,
  ariaLabel,
  className,
}: {
  value: SharePermissionLevel
  onValueChange: (level: SharePermissionLevel) => void
  ariaLabel: string
  className?: string
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next as SharePermissionLevel)}
    >
      <SelectTrigger
        size="sm"
        aria-label={ariaLabel}
        className={cn(
          'h-8 gap-1.5 rounded border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2.5 py-0 text-[12px] font-normal text-[var(--xd-ink)] shadow-none transition-colors hover:bg-[var(--xd-surface-hover)] focus-visible:border-[var(--xd-accent)] focus-visible:ring-0 data-[size=sm]:h-8 dark:bg-[var(--xd-canvas)] dark:hover:bg-[var(--xd-surface-hover)] [&_svg]:size-3.5 [&_svg]:text-[var(--xd-ink-muted)] [&_svg]:opacity-100',
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        position="popper"
        align="end"
        className="z-[90] border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] text-[var(--xd-ink)] shadow-xl"
      >
        {PERMISSIONS.map((spec) => (
          <SelectItem
            key={spec.level}
            value={spec.level}
            className="rounded-sm py-1.5 pr-8 pl-2.5 text-[12px] text-[var(--xd-ink)] focus:bg-[var(--xd-surface-hover)] focus:text-[var(--xd-ink)]"
          >
            {spec.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function ShareModal({
  open = true,
  onOpenChange,
  variant = 'modal',
  fileName,
  title,
  config: configProp,
  simulatedPermission: simulatedProp,
  onConfigChange,
  onSimulatePermission,
}: ShareModalProps) {
  const titleId = useId()
  const [internalConfig, setInternalConfig] = useState<ShareConfig>(
    configProp ?? DEMO_SHARE_CONFIG,
  )
  const [simulated, setSimulated] = useState<SharePermissionLevel>(
    simulatedProp ?? 'edit_with_ai_shared',
  )
  const [copied, setCopied] = useState(false)

  const config = configProp ?? internalConfig
  const activeSimulation = simulatedProp ?? simulated
  const activeSimulationSpec = permissionByLevel(activeSimulation)

  useEffect(() => {
    if (!open || variant !== 'modal') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange?.(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange, variant])

  if (variant === 'modal' && !open) return null

  function update(patch: Partial<ShareConfig>) {
    const next = { ...config, ...patch }
    if (configProp === undefined) setInternalConfig(next)
    onConfigChange?.(next)
  }

  function setSimulation(level: SharePermissionLevel) {
    if (simulatedProp === undefined) setSimulated(level)
    onSimulatePermission?.(level)
  }

  async function copyLink() {
    if (!config.isPublicLinkEnabled) return
    try {
      await navigator.clipboard.writeText(config.publicLinkUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  const panel = (
    <div
      role={variant === 'modal' ? 'dialog' : 'region'}
      aria-modal={variant === 'modal' ? true : undefined}
      aria-labelledby={titleId}
      className="flex max-h-[min(720px,calc(100vh-32px))] w-[min(540px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] text-[var(--xd-ink)] shadow-2xl"
    >
      <header className="flex items-center justify-between gap-3 border-b border-[var(--xd-border)] px-4 py-3">
        <div className="min-w-0">
          <h2 id={titleId} className="truncate text-[14px] font-semibold">
            Share {title}
          </h2>
          <p className="xd-mono truncate text-[11px] text-[var(--xd-ink-muted)]">
            {fileName}
          </p>
        </div>
        {variant === 'modal' && (
          <button
            type="button"
            onClick={() => onOpenChange?.(false)}
            className="inline-flex size-6 items-center justify-center rounded text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)]"
            aria-label="Close"
          >
            <X className="size-3.5" />
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* Public Link */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
              {config.isPublicLinkEnabled ? (
                <Globe className="size-3.5 text-[var(--xd-accent)]" />
              ) : (
                <Lock className="size-3.5 text-[var(--xd-ink-muted)]" />
              )}
              <span>Public link</span>
            </span>
            <Switch
              checked={config.isPublicLinkEnabled}
              onCheckedChange={(checked) =>
                update({ isPublicLinkEnabled: checked })
              }
              aria-label="Enable public link"
            />
          </div>

          {config.isPublicLinkEnabled ? (
            <>
              <div className="flex items-center gap-1.5">
                <input
                  readOnly
                  value={config.publicLinkUrl}
                  aria-label="Shareable link"
                  className="xd-mono h-8 min-w-0 flex-1 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2.5 text-[11.5px] text-[var(--xd-ink-secondary)] outline-none focus-visible:border-[var(--xd-accent)]"
                />
                <PermissionSelect
                  value={config.publicPermission}
                  onValueChange={(publicPermission) =>
                    update({ publicPermission })
                  }
                  ariaLabel="Public link permission"
                  className="w-[168px] shrink-0"
                />
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-2.5 text-[12px] font-medium text-[var(--xd-ink)] transition-colors hover:bg-[var(--xd-surface-hover)]"
                >
                  {copied ? (
                    <Check className="size-3.5 text-[var(--xd-commit)]" />
                  ) : (
                    <Copy className="size-3.5 text-[var(--xd-ink-secondary)]" />
                  )}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              {config.publicPermission === 'edit_with_ai_shared' && (
                <div className="rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2.5">
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="font-medium">Shared AI daily limit</span>
                    <span className="xd-tabular text-[var(--xd-ink-secondary)]">
                      {config.sharedAiUsedToday} / {config.sharedAiDailyLimit}{' '}
                      ops
                    </span>
                  </div>
                  <Slider
                    aria-label="Shared AI daily op limit"
                    className="mt-2"
                    min={20}
                    max={400}
                    step={10}
                    value={[config.sharedAiDailyLimit]}
                    onValueChange={(value) =>
                      update({
                        sharedAiDailyLimit:
                          value[0] ?? config.sharedAiDailyLimit,
                      })
                    }
                  />
                </div>
              )}

              <label className="flex items-center justify-between gap-3 pt-0.5 text-[12px] text-[var(--xd-ink-secondary)]">
                <span>Allow visitors to duplicate as template</span>
                <Switch
                  checked={config.allowDuplication}
                  onCheckedChange={(checked) =>
                    update({ allowDuplication: checked })
                  }
                  aria-label="Allow duplicating as .mrbl template"
                />
              </label>
            </>
          ) : (
            <p className="text-[11.5px] text-[var(--xd-ink-muted)]">
              Only you can open this file. Turn on public link to share it.
            </p>
          )}
        </div>

        {/* Visitor Role Preview */}
        <div className="border-t border-[var(--xd-border)] pt-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium text-[var(--xd-ink)]">
              <Eye className="size-3.5 shrink-0 text-[var(--xd-ink-muted)]" />
              <span>Preview as visitor role</span>
            </span>
            <PermissionSelect
              value={activeSimulation}
              onValueChange={setSimulation}
              ariaLabel="Preview as visitor role"
              className="w-[176px] shrink-0"
            />
          </div>
          <p className="mt-1.5 text-[11.5px] text-[var(--xd-ink-muted)]">
            {activeSimulationSpec.summary}
          </p>
        </div>
      </div>
    </div>
  )

  if (variant === 'inline') return panel

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4">
      <button
        type="button"
        aria-label="Dismiss sharing dialog"
        className="absolute inset-0 cursor-default"
        onClick={() => onOpenChange?.(false)}
      />
      <div className="relative z-[1]">{panel}</div>
    </div>
  )
}
