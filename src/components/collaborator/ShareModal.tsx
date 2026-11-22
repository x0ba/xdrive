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
    title: 'View & Look Only',
    summary:
      'Can view the document and switch tabs, slides, and notes locally via data-marble-look. Cannot edit content or use AI.',
    directEdit: false,
    look: true,
    sketch: false,
    ai: 'off',
    quotaLabel: 'No AI quota',
    blockReason:
      'View & Look only. This role can read the .mrbl app and switch tabs, slides, and notes locally via data-marble-look. Content edits, sketch-to-AI, and the prompt bar are off.',
  },
  {
    level: 'comment_annotate',
    title: 'Annotate & Propose Only',
    summary:
      'Can add margin notes, draw sketch annotations, and propose AI ops to the review queue without modifying the file directly.',
    directEdit: false,
    look: true,
    sketch: true,
    ai: 'propose',
    quotaLabel: 'Review queue · no file write',
    blockReason: null,
  },
  {
    level: 'edit_no_ai',
    title: 'Edit App (No AI)',
    summary:
      'Full direct manipulation of data-marble-editable, data-marble-sortable, data-marble-add, and data-marble-removable. The AI prompt bar, sketch-to-AI, and AI sidebar are locked.',
    directEdit: true,
    look: true,
    sketch: false,
    ai: 'off',
    quotaLabel: 'No AI quota',
    blockReason:
      'Edit App (No AI). Direct manipulation of editable, sortable, add, and removable nodes is allowed. The AI prompt bar, sketch-to-AI, and AI sidebar are locked.',
  },
  {
    level: 'edit_with_ai_byok',
    title: "Edit + AI (Collaborator's Subscription)",
    summary:
      'Full direct manipulation plus AI collaboration using the recipient’s own connected OpenCode Go, SpaceX AI, Claude, or OpenAI subscription.',
    directEdit: true,
    look: true,
    sketch: true,
    ai: 'byok',
    quotaLabel: "Collaborator's subscription",
    blockReason: null,
  },
  {
    level: 'edit_with_ai_shared',
    title: "Edit + AI (Owner's Shared AI Quota)",
    summary:
      'Full direct manipulation plus AI collaboration powered by the owner’s subscription, with a configurable daily op limit.',
    directEdit: true,
    look: true,
    sketch: true,
    ai: 'shared',
    quotaLabel: "Owner's shared AI quota",
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
    {
      id: 'col-priya',
      name: 'Priya Raman',
      email: 'priya@xdrive.example',
      avatarInitials: 'PR',
      avatarColor: '#2ea071',
      permission: 'view_only',
      addedAt: '2026-11-14T09:10:00.000Z',
      lastActive: '3d ago',
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
  const [copyError, setCopyError] = useState(false)

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
      setInviteError('Enter a full email address.')
      return
    }
    if (config.collaborators.some((person) => person.email === email)) {
      setInviteError('That person already has access.')
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
      setCopyError(false)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopyError(true)
      setCopied(false)
    }
  }

  const simulation = permissionByLevel(activeSimulation)
  const quotaPct = Math.min(
    100,
    Math.round(
      (config.sharedAiUsedToday / Math.max(1, config.sharedAiDailyLimit)) * 100,
    ),
  )

  const panel = (
    <div
      role={variant === 'modal' ? 'dialog' : 'region'}
      aria-modal={variant === 'modal' ? true : undefined}
      aria-labelledby={titleId}
      className="flex max-h-[min(880px,calc(100vh-32px))] w-[min(760px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] text-[var(--xd-ink)] shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
    >
      <header className="flex items-start justify-between gap-3 border-b border-[var(--xd-border)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wide text-[var(--xd-ink-muted)] uppercase">
            Granular sharing
          </p>
          <h2
            id={titleId}
            className="mt-0.5 truncate text-[15px] font-semibold"
          >
            Share {title}
          </h2>
          <p className="xd-mono mt-0.5 truncate text-[11.5px] text-[var(--xd-ink-secondary)]">
            {fileName}
          </p>
        </div>
        {variant === 'modal' && (
          <button
            type="button"
            onClick={() => onOpenChange?.(false)}
            className="inline-flex size-7 items-center justify-center rounded-md text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)]"
            aria-label="Close sharing dialog"
          >
            <X className="size-4" />
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-[var(--xd-sketch)]/35 bg-[var(--xd-sketch-soft)] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-[var(--xd-sketch)]">
              Simulate visitor role
            </p>
            <p className="text-[11px] text-[var(--xd-ink-secondary)]">
              Local to this tab. Collaborators stay as invited.
            </p>
          </div>
          <div
            role="radiogroup"
            aria-label="Simulate visitor role"
            className="mt-2 flex flex-wrap gap-1"
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
                    'rounded-md border px-2 py-1 text-[11.5px] font-medium transition-colors',
                    active
                      ? 'border-[var(--xd-sketch)] bg-[var(--xd-canvas)] text-[var(--xd-ink)]'
                      : 'border-transparent text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-canvas)]/70',
                  )}
                >
                  {spec.title}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[12px] leading-snug text-[var(--xd-ink)]">
            Previewing <strong>{simulation.title}</strong>. {simulation.summary}
          </p>
          <CapabilityBadges spec={simulation} />
        </div>

        <div className="space-y-2 px-4 py-3">
          <h3 className="text-[12px] font-semibold">
            Permission for new invites
          </h3>
          <div
            role="radiogroup"
            aria-label="Invite permission"
            className="space-y-1.5"
          >
            {PERMISSIONS.map((spec) => {
              const selected = inviteLevel === spec.level
              return (
                <div
                  key={spec.level}
                  role="radio"
                  aria-checked={selected}
                  tabIndex={0}
                  onClick={() => setInviteLevel(spec.level)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setInviteLevel(spec.level)
                    }
                  }}
                  className={cn(
                    'w-full rounded-md border px-3 py-2 text-left transition-colors',
                    selected
                      ? 'border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)]'
                      : 'border-[var(--xd-border)] bg-[var(--xd-rail)] hover:bg-[var(--xd-surface-hover)]',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold">
                      {spec.title}
                    </span>
                    <span className="xd-mono text-[10.5px] text-[var(--xd-ink-muted)]">
                      {spec.level}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-[var(--xd-ink-secondary)]">
                    {spec.summary}
                  </span>
                  <CapabilityBadges spec={spec} />
                  {spec.level === 'edit_with_ai_shared' && (
                    <span
                      className="mt-2 block"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <span className="flex items-center justify-between text-[11.5px]">
                        <span className="font-medium">Daily op limit</span>
                        <span className="xd-tabular text-[var(--xd-ink-secondary)]">
                          {config.sharedAiUsedToday} /{' '}
                          {config.sharedAiDailyLimit} used today · {quotaPct}%
                        </span>
                      </span>
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
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="border-t border-[var(--xd-border)] px-4 py-3">
          <h3 className="text-[12px] font-semibold">Invite a collaborator</h3>
          <form
            className="mt-2 flex flex-wrap items-center gap-2"
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
              placeholder="name@lab.example"
              className="h-8 min-w-[220px] flex-1 rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2.5 text-[12.5px] outline-none focus-visible:border-[var(--xd-accent)] focus-visible:ring-2 focus-visible:ring-[var(--xd-accent)]/30"
            />
            <select
              aria-label="Permission level"
              value={inviteLevel}
              onChange={(event) =>
                setInviteLevel(event.target.value as SharePermissionLevel)
              }
              className="h-8 rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 text-[12px]"
            >
              {PERMISSIONS.map((spec) => (
                <option key={spec.level} value={spec.level}>
                  {spec.title}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--xd-accent)] px-2.5 text-[12px] font-medium text-white hover:bg-[var(--xd-accent-hover)]"
            >
              <UserPlus className="size-3.5" />
              Invite
            </button>
          </form>
          {inviteError && (
            <p
              className="mt-1.5 text-[12px] text-[var(--xd-danger)]"
              role="alert"
            >
              {inviteError}
            </p>
          )}

          <ul className="mt-3 divide-y divide-[var(--xd-border)] rounded-md border border-[var(--xd-border)]">
            <li className="flex items-center gap-2 px-2.5 py-2">
              <Avatar initials="YO" color="#5e6ad2" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium">
                  You · owner
                </p>
                <p className="text-[11px] text-[var(--xd-ink-muted)]">
                  Quota source for shared AI
                </p>
              </div>
              <span className="rounded border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] px-1.5 py-0.5 text-[11px] text-[var(--xd-accent)]">
                Owner
              </span>
            </li>
            {config.collaborators.map((person) => (
              <li
                key={person.id}
                className="flex items-center gap-2 px-2.5 py-2"
              >
                <Avatar
                  initials={person.avatarInitials}
                  color={person.avatarColor}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium">
                    {person.name}
                  </p>
                  <p className="xd-mono truncate text-[11px] text-[var(--xd-ink-muted)]">
                    {person.email}
                    {person.lastActive ? ` · ${person.lastActive}` : ''}
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
                  className="h-7 max-w-[210px] rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-1.5 text-[11.5px]"
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
                  className="inline-flex size-7 items-center justify-center rounded-md text-[var(--xd-ink-muted)] hover:bg-[var(--xd-danger-soft)] hover:text-[var(--xd-danger)]"
                  aria-label={`Remove ${person.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
            {config.collaborators.length === 0 && (
              <li className="px-2.5 py-3 text-[12px] text-[var(--xd-ink-muted)]">
                No collaborators yet. Invites appear in this list.
              </li>
            )}
          </ul>
        </div>

        <div className="border-t border-[var(--xd-border)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[12px] font-semibold">Shareable link</h3>
            <label className="inline-flex items-center gap-2 text-[12px]">
              <Switch
                checked={config.isPublicLinkEnabled}
                onCheckedChange={(checked) =>
                  update({ isPublicLinkEnabled: checked })
                }
                aria-label="Enable public link"
              />
              Public link
            </label>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex size-8 items-center justify-center rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)]">
              {config.isPublicLinkEnabled ? (
                <Globe className="size-3.5 text-[var(--xd-accent)]" />
              ) : (
                <Lock className="size-3.5 text-[var(--xd-ink-muted)]" />
              )}
            </span>
            <input
              readOnly
              value={config.publicLinkUrl}
              aria-label="Shareable link"
              className="xd-mono h-8 min-w-[220px] flex-1 rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2 text-[11.5px] text-[var(--xd-ink-secondary)]"
            />
            <button
              type="button"
              onClick={() => void copyLink()}
              disabled={!config.isPublicLinkEnabled}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-2.5 text-[12px] font-medium disabled:opacity-45"
            >
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
          {copyError && (
            <p
              className="mt-1.5 text-[12px] text-[var(--xd-danger)]"
              role="alert"
            >
              Clipboard is unavailable in this context. Select the link and copy
              it manually.
            </p>
          )}
          {!config.isPublicLinkEnabled && (
            <p className="mt-1.5 text-[12px] text-[var(--xd-ink-muted)]">
              The link is off. Turn it on to let people open this .mrbl app.
            </p>
          )}
          <label className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="text-[var(--xd-ink-secondary)]">
              Public permission
            </span>
            <select
              aria-label="Public link permission"
              value={config.publicPermission}
              onChange={(event) =>
                update({
                  publicPermission: event.target.value as SharePermissionLevel,
                })
              }
              disabled={!config.isPublicLinkEnabled}
              className="h-8 rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 text-[12px] disabled:opacity-45"
            >
              {PERMISSIONS.map((spec) => (
                <option key={spec.level} value={spec.level}>
                  {spec.title}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 flex items-center justify-between gap-3 rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2">
            <span>
              <span className="block text-[12.5px] font-medium">
                Allow duplicating as .mrbl template
              </span>
              <span className="block text-[11.5px] text-[var(--xd-ink-muted)]">
                Visitors with the link can fork a template copy. The original
                file stays put.
              </span>
            </span>
            <Switch
              checked={config.allowDuplication}
              onCheckedChange={(checked) =>
                update({ allowDuplication: checked })
              }
              aria-label="Allow duplicating as .mrbl template"
            />
          </label>
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

function CapabilityBadges({ spec }: { spec: PermissionSpec }) {
  const items = [
    {
      label: 'Direct Edit',
      on: spec.directEdit,
      detail: spec.directEdit
        ? 'Editable, sortable, add, remove'
        : 'No file writes',
    },
    {
      label: 'Look / View Switch',
      on: spec.look,
      detail: 'data-marble-look stays in this tab',
    },
    {
      label: 'AI Prompt & Sketch',
      on: spec.ai !== 'off',
      detail:
        spec.ai === 'off'
          ? 'Locked'
          : spec.ai === 'propose'
            ? 'Propose to the review queue'
            : 'Prompt, sketch, and sidebar',
    },
    {
      label: 'Quota Source',
      on: spec.ai === 'byok' || spec.ai === 'shared',
      detail: spec.quotaLabel,
    },
  ]
  return (
    <ul className="mt-2 flex flex-wrap gap-1">
      {items.map((item) => (
        <li
          key={item.label}
          className={cn(
            'rounded border px-1.5 py-0.5 text-[10.5px] leading-tight',
            item.on
              ? 'border-[var(--xd-commit)]/35 bg-[var(--xd-commit-soft)] text-[var(--xd-commit)]'
              : 'border-[var(--xd-border)] bg-[var(--xd-elevated)] text-[var(--xd-ink-muted)]',
          )}
          title={item.detail}
        >
          <span className="font-medium">{item.label}</span>
          <span className="mx-1 opacity-50">·</span>
          <span>{item.detail}</span>
        </li>
      ))}
    </ul>
  )
}

function Avatar({ initials, color }: { initials: string; color: string }) {
  return (
    <span
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {initials}
    </span>
  )
}
