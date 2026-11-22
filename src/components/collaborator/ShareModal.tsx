import { useEffect, useId, useState } from 'react'
import { Check, Copy, Globe, Lock, Trash2, UserPlus, X } from 'lucide-react'
import type {
  ShareCollaborator,
  ShareConfig,
  SharePermissionLevel,
} from '#/lib/types'
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

const AVATAR_COLORS = ['#5e6ad2', '#2ea071', '#e59934', '#e5484d', '#7c6af7']

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
  collaborators: [
    {
      id: 'col-mira',
      name: 'Mira Chen',
      email: 'mira@lab.example',
      avatarInitials: 'MC',
      avatarColor: '#5e6ad2',
      permission: 'edit_with_ai_byok',
      addedAt: '2026-11-02T15:04:00.000Z',
      lastActive: '12m ago',
    },
    {
      id: 'col-jonah',
      name: 'Jonah Adler',
      email: 'jonah@observatory.example',
      avatarInitials: 'JA',
      avatarColor: '#e59934',
      permission: 'comment_annotate',
      addedAt: '2026-11-08T18:22:00.000Z',
      lastActive: 'Yesterday',
    },
  ],
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

let shareSeq = 0

function nextId(prefix: string): string {
  shareSeq += 1
  return `${prefix}-${shareSeq.toString(36)}`
}

function charAt(value: string | undefined, index: number): string {
  if (!value || index < 0 || index >= value.length) return ''
  return value.charAt(index)
}

function initialsFromEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const parts = local.split(/[._+-]+/).filter((part) => part.length > 0)
  const first = charAt(parts[0], 0) || '?'
  const second = charAt(parts[1], 0) || charAt(parts[0], 1)
  return `${first}${second}`.toUpperCase()
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email
  return local
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
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
  const emailId = useId()
  const [internalConfig, setInternalConfig] = useState<ShareConfig>(
    configProp ?? DEMO_SHARE_CONFIG,
  )
  const [simulated, setSimulated] = useState<SharePermissionLevel>(
    simulatedProp ?? 'edit_with_ai_shared',
  )
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLevel, setInviteLevel] =
    useState<SharePermissionLevel>('comment_annotate')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const config = configProp ?? internalConfig
  const activeSimulation = simulatedProp ?? simulated

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

  function updateCollaborator(id: string, permission: SharePermissionLevel) {
    update({
      collaborators: config.collaborators.map((person) =>
        person.id === id ? { ...person, permission } : person,
      ),
    })
  }

  function removeCollaborator(id: string) {
    update({
      collaborators: config.collaborators.filter((person) => person.id !== id),
    })
  }

  function invite() {
    const email = inviteEmail.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteError('Enter a valid email address.')
      return
    }
    if (config.collaborators.some((person) => person.email === email)) {
      setInviteError('Already has access.')
      return
    }
    const collaborator: ShareCollaborator = {
      id: nextId('col'),
      name: nameFromEmail(email),
      email,
      avatarInitials: initialsFromEmail(email),
      avatarColor:
        AVATAR_COLORS[config.collaborators.length % AVATAR_COLORS.length],
      permission: inviteLevel,
      addedAt: new Date().toISOString(),
      lastActive: 'Just now',
    }
    update({ collaborators: [...config.collaborators, collaborator] })
    setInviteEmail('')
    setInviteError(null)
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
        {/* Invite + People */}
        <div>
          <form
            className="flex items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault()
              invite()
            }}
          >
            <label className="sr-only" htmlFor={emailId}>
              Email
            </label>
            <input
              id={emailId}
              type="email"
              value={inviteEmail}
              onChange={(event) => {
                setInviteEmail(event.target.value)
                setInviteError(null)
              }}
              placeholder="Invite by email..."
              className="h-8 min-w-0 flex-1 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2.5 text-[12px] outline-none focus-visible:border-[var(--xd-accent)]"
            />
            <select
              aria-label="Permission level"
              value={inviteLevel}
              onChange={(event) =>
                setInviteLevel(event.target.value as SharePermissionLevel)
              }
              className="h-8 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 text-[12px]"
            >
              {PERMISSIONS.map((spec) => (
                <option key={spec.level} value={spec.level}>
                  {spec.title}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="inline-flex h-8 items-center gap-1 rounded bg-[var(--xd-accent)] px-2.5 text-[12px] font-medium text-white hover:bg-[var(--xd-accent-hover)]"
            >
              <UserPlus className="size-3.5" />
              <span>Invite</span>
            </button>
          </form>
          {inviteError && (
            <p
              className="mt-1 text-[11.5px] text-[var(--xd-danger)]"
              role="alert"
            >
              {inviteError}
            </p>
          )}

          <ul className="mt-3 divide-y divide-[var(--xd-border)] rounded border border-[var(--xd-border)]">
            <li className="flex items-center gap-2.5 px-2.5 py-2">
              <Avatar initials="YO" color="#5e6ad2" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium">You</p>
              </div>
              <span className="text-[11px] text-[var(--xd-ink-muted)]">
                Owner
              </span>
            </li>
            {config.collaborators.map((person) => (
              <li
                key={person.id}
                className="flex items-center gap-2.5 px-2.5 py-2"
              >
                <Avatar
                  initials={person.avatarInitials}
                  color={person.avatarColor}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium">
                    {person.name}
                  </p>
                  <p className="xd-mono truncate text-[10.5px] text-[var(--xd-ink-muted)]">
                    {person.email}
                  </p>
                </div>
                <select
                  aria-label={`Permission for ${person.name}`}
                  value={person.permission}
                  onChange={(event) =>
                    updateCollaborator(
                      person.id,
                      event.target.value as SharePermissionLevel,
                    )
                  }
                  className="h-7 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-1.5 text-[11.5px]"
                >
                  {PERMISSIONS.map((spec) => (
                    <option key={spec.level} value={spec.level}>
                      {spec.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeCollaborator(person.id)}
                  className="inline-flex size-6 items-center justify-center rounded text-[var(--xd-ink-muted)] hover:bg-[var(--xd-danger-soft)] hover:text-[var(--xd-danger)]"
                  aria-label={`Remove ${person.name}`}
                >
                  <Trash2 className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Public Link */}
        <div className="space-y-2.5 border-t border-[var(--xd-border)] pt-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[12px] font-medium">
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

          {config.isPublicLinkEnabled && (
            <>
              <div className="flex items-center gap-1.5">
                <input
                  readOnly
                  value={config.publicLinkUrl}
                  aria-label="Shareable link"
                  className="xd-mono h-7 min-w-0 flex-1 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2 text-[11px] text-[var(--xd-ink-secondary)]"
                />
                <select
                  aria-label="Public link permission"
                  value={config.publicPermission}
                  onChange={(event) =>
                    update({
                      publicPermission:
                        event.target.value as SharePermissionLevel,
                    })
                  }
                  className="h-7 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 text-[11.5px]"
                >
                  {PERMISSIONS.map((spec) => (
                    <option key={spec.level} value={spec.level}>
                      {spec.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  className="inline-flex h-7 items-center gap-1 rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-2 text-[11.5px] font-medium"
                >
                  {copied ? (
                    <Check className="size-3" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              {config.publicPermission === 'edit_with_ai_shared' && (
                <div className="rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2.5 py-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium">Shared AI daily limit</span>
                    <span className="xd-tabular text-[var(--xd-ink-secondary)]">
                      {config.sharedAiUsedToday} / {config.sharedAiDailyLimit}{' '}
                      ops
                    </span>
                  </div>
                  <Slider
                    aria-label="Shared AI daily op limit"
                    className="mt-1.5"
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

              <label className="flex items-center justify-between text-[12px] text-[var(--xd-ink-secondary)]">
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
          )}
        </div>

        {/* Compact Role Preview Simulator */}
        <div className="border-t border-[var(--xd-border)] pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] text-[var(--xd-ink-secondary)]">
              Preview as visitor role
            </span>
            <div
              role="radiogroup"
              aria-label="Simulate visitor role"
              className="flex flex-wrap gap-1"
            >
              {PERMISSIONS.map((spec) => {
                const active = spec.level === activeSimulation
                return (
                  <button
                    key={spec.level}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSimulation(spec.level)}
                    className={cn(
                      'rounded border px-2 py-0.5 text-[11px] transition-colors',
                      active
                        ? 'border-[var(--xd-sketch)] bg-[var(--xd-sketch-soft)] font-medium text-[var(--xd-sketch)]'
                        : 'border-[var(--xd-border)] text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]',
                    )}
                  >
                    {spec.title}
                  </button>
                )
              })}
            </div>
          </div>
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

function Avatar({ initials, color }: { initials: string; color: string }) {
  return (
    <span
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold text-white"
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {initials}
    </span>
  )
}
