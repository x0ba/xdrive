import { useEffect, useId, useState } from 'react'
import { AlertTriangle, KeyRound, Terminal, X } from 'lucide-react'
import type { AIModelSpec, AIProviderId, AISubscription } from '#/lib/types'
import { Switch } from '#/components/ui/switch'
import type { ConnectedModelOption } from '#/components/collaborator/FloatingPromptBar'
import { cn } from '#/lib/utils'

export interface ManagedModel extends AIModelSpec {
  promptLabel: string
}

export interface ManagedSubscription extends Omit<AISubscription, 'models'> {
  models: ManagedModel[]
}

export interface RoleAssignments {
  implementation: string
  exploration: string
  review: string
  design: string
}

export const ROLE_FIELDS: Array<{
  key: keyof RoleAssignments
  label: string
  hint: string
}> = [
  {
    key: 'implementation',
    label: 'Implementation',
    hint: 'Multi-stage .mrbl growth and semantic ops',
  },
  {
    key: 'exploration',
    label: 'Exploration',
    hint: 'Fast edits and scans',
  },
  {
    key: 'review',
    label: 'Review',
    hint: 'Diff checks before keeping ops',
  },
  {
    key: 'design',
    label: 'Design',
    hint: 'Layout, typography, and controls',
  },
]

function model(
  spec: Omit<ManagedModel, 'badge'> & { badge?: string },
): ManagedModel {
  return {
    badge: spec.promptLabel,
    ...spec,
  }
}

export const DEFAULT_SUBSCRIPTIONS: ManagedSubscription[] = [
  {
    providerId: 'opencode-go',
    name: 'OpenCode Go',
    tagline: 'Unified subscription routing across Gemini, Grok, Claude, and DeepSeek.',
    planName: 'Go',
    connected: true,
    authMethod: 'subscription_oauth',
    status: 'active',
    defaultModelId: 'opencode-go/gemini-4-argon',
    endpointUrl: 'https://opencode.ai/zen/go',
    usageThisMonth: { opsGenerated: 1284, appsBuilt: 17, quotaPercent: 46 },
    models: [
      model({
        id: 'opencode-go/gemini-4-argon',
        name: 'Gemini 4 Argon',
        providerId: 'opencode-go',
        promptLabel: 'OpenCode Go · Gemini 4 Argon',
        role: 'design',
        contextWindow: '1M',
        speedTier: 'deep',
        supportsVisionSketch: true,
        recommendedFor: 'Manuscript layout and UI',
      }),
      model({
        id: 'opencode-go/grok-4.7',
        name: 'Grok 4.7',
        providerId: 'opencode-go',
        promptLabel: 'Grok · Grok 4.7',
        role: 'implementation',
        contextWindow: '256K',
        speedTier: 'deep',
        supportsVisionSketch: true,
        recommendedFor: 'Semantic ops over a selection',
      }),
      model({
        id: 'opencode-go/claude-haiku-5-5',
        name: 'Claude Haiku 5.5',
        providerId: 'opencode-go',
        promptLabel: 'OpenCode Go · Claude Haiku 5.5',
        role: 'review',
        contextWindow: '200K',
        speedTier: 'fast',
        supportsVisionSketch: false,
        recommendedFor: 'Fast op review',
      }),
      model({
        id: 'opencode-go/deepseek-v4.1-flash',
        name: 'DeepSeek V4.1 Flash',
        providerId: 'opencode-go',
        promptLabel: 'OpenCode Go · DeepSeek V4.1 Flash',
        role: 'exploration',
        contextWindow: '128K',
        speedTier: 'instant',
        supportsVisionSketch: false,
        recommendedFor: 'Fast exploration',
      }),
    ],
  },
  {
    providerId: 'xai',
    name: 'SpaceX AI',
    tagline: 'Grok models for implementation and fast edits.',
    planName: 'SuperGrok',
    connected: true,
    authMethod: 'api_key',
    maskedCredential: 'xai-···7k2q',
    status: 'active',
    defaultModelId: 'xai/grok-4.7',
    endpointUrl: 'https://api.x.ai/v1',
    usageThisMonth: { opsGenerated: 860, appsBuilt: 11, quotaPercent: 38 },
    models: [
      model({
        id: 'xai/grok-4.7',
        name: 'Grok 4.7',
        providerId: 'xai',
        promptLabel: 'SpaceX AI · Grok 4.7',
        role: 'implementation',
        contextWindow: '256K',
        speedTier: 'deep',
        supportsVisionSketch: true,
        recommendedFor: 'Staged .mrbl edits',
      }),
      model({
        id: 'xai/grok-4.7-build-fast',
        name: 'Grok 4.7 Build Fast',
        providerId: 'xai',
        promptLabel: 'SpaceX AI · Grok 4.7 Build Fast',
        role: 'exploration',
        contextWindow: '256K',
        speedTier: 'instant',
        supportsVisionSketch: true,
        recommendedFor: 'Scale gestures',
      }),
    ],
  },
  {
    providerId: 'claude',
    name: 'Anthropic Claude',
    tagline: 'Claude models for code review and op diffs.',
    planName: 'Pro',
    connected: true,
    authMethod: 'subscription_oauth',
    status: 'rate_limited',
    defaultModelId: 'claude-sonnet-5-5',
    endpointUrl: 'https://api.anthropic.com/v1',
    usageThisMonth: { opsGenerated: 2100, appsBuilt: 9, quotaPercent: 100 },
    models: [
      model({
        id: 'claude-sonnet-5-5',
        name: 'Sonnet 5.5',
        providerId: 'claude',
        promptLabel: 'Claude · Sonnet 5.5',
        role: 'review',
        contextWindow: '200K',
        speedTier: 'fast',
        supportsVisionSketch: true,
        recommendedFor: 'Diff review',
      }),
      model({
        id: 'claude-opus-5-5',
        name: 'Opus 5.5',
        providerId: 'claude',
        promptLabel: 'Claude · Opus 5.5',
        role: 'implementation',
        contextWindow: '200K',
        speedTier: 'deep',
        supportsVisionSketch: true,
        recommendedFor: 'Structural edits',
      }),
    ],
  },
  {
    providerId: 'openai',
    name: 'OpenAI',
    tagline: 'GPT models via API key or subscription.',
    planName: 'Plus',
    connected: true,
    authMethod: 'api_key',
    maskedCredential: 'sk-···4f2a',
    status: 'active',
    defaultModelId: 'gpt-5.4',
    endpointUrl: 'https://api.openai.com/v1',
    usageThisMonth: { opsGenerated: 640, appsBuilt: 6, quotaPercent: 22 },
    models: [
      model({
        id: 'gpt-5.4',
        name: 'GPT-5.4',
        providerId: 'openai',
        promptLabel: 'OpenAI · GPT-5.4',
        role: 'implementation',
        contextWindow: '256K',
        speedTier: 'deep',
        supportsVisionSketch: true,
        recommendedFor: 'General edits',
      }),
      model({
        id: 'o4-mini',
        name: 'o4-mini',
        providerId: 'openai',
        promptLabel: 'OpenAI · o4-mini',
        role: 'reasoning',
        contextWindow: '128K',
        speedTier: 'fast',
        supportsVisionSketch: false,
        recommendedFor: 'Proofs and checks',
      }),
    ],
  },
]

export const DEFAULT_ROLE_ASSIGNMENTS: RoleAssignments = {
  implementation: 'xai/grok-4.7',
  exploration: 'opencode-go/deepseek-v4.1-flash',
  review: 'claude-sonnet-5-5',
  design: 'opencode-go/gemini-4-argon',
}

export function connectedModelsFromSubscriptions(
  subscriptions: ManagedSubscription[],
): ConnectedModelOption[] {
  return subscriptions
    .filter(
      (subscription) =>
        subscription.connected && subscription.status !== 'disconnected',
    )
    .flatMap((subscription) =>
      subscription.models.map((item) => ({
        id: item.id,
        providerId: item.providerId,
        group:
          subscription.name === 'Anthropic Claude'
            ? 'Claude'
            : subscription.name,
        label: item.promptLabel,
        modelName: item.name,
        rateLimited: subscription.status === 'rate_limited',
        supportsVisionSketch: item.supportsVisionSketch,
      })),
    )
}

export interface SubscriptionModalProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  variant?: 'modal' | 'page'
  subscriptions?: ManagedSubscription[]
  roleAssignments?: RoleAssignments
  onChange?: (
    subscriptions: ManagedSubscription[],
    roles: RoleAssignments,
  ) => void
}

function maskSecret(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length <= 4) return '••••'
  return `${trimmed.slice(0, 3)}···${trimmed.slice(-4)}`
}

export function SubscriptionModal({
  open = true,
  onOpenChange,
  variant = 'modal',
  subscriptions: subscriptionsProp,
  roleAssignments: rolesProp,
  onChange,
}: SubscriptionModalProps) {
  const titleId = useId()
  const [internalSubs, setInternalSubs] = useState<ManagedSubscription[]>(
    subscriptionsProp ?? DEFAULT_SUBSCRIPTIONS,
  )
  const [internalRoles, setInternalRoles] = useState<RoleAssignments>(
    rolesProp ?? DEFAULT_ROLE_ASSIGNMENTS,
  )
  const [activeId, setActiveId] = useState<AIProviderId>('opencode-go')
  const [draftKey, setDraftKey] = useState('')
  const [keyMessage, setKeyMessage] = useState<string | null>(null)
  const [bridgeMessage, setBridgeMessage] = useState<string | null>(null)

  const subscriptions = subscriptionsProp ?? internalSubs
  const roles = rolesProp ?? internalRoles
  const active =
    subscriptions.find((item) => item.providerId === activeId) ??
    (subscriptions.length > 0 ? subscriptions[0] : null)

  useEffect(() => {
    if (!open || variant !== 'modal') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange?.(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange, variant])

  if (active === null) return null
  if (variant === 'modal' && !open) return null
  const provider = active

  function commit(
    nextSubs: ManagedSubscription[],
    nextRoles: RoleAssignments = roles,
  ) {
    if (subscriptionsProp === undefined) setInternalSubs(nextSubs)
    if (rolesProp === undefined) setInternalRoles(nextRoles)
    onChange?.(nextSubs, nextRoles)
  }

  function patchActive(patch: Partial<ManagedSubscription>) {
    commit(
      subscriptions.map((item) =>
        item.providerId === provider.providerId ? { ...item, ...patch } : item,
      ),
    )
  }

  function setConnected(connected: boolean) {
    if (
      connected &&
      provider.authMethod === 'api_key' &&
      !provider.maskedCredential &&
      !draftKey.trim()
    ) {
      setKeyMessage('Save an API key before connecting.')
      patchActive({ connected: false, status: 'disconnected' })
      return
    }
    setKeyMessage(null)
    patchActive({
      connected,
      status: connected ? 'active' : 'disconnected',
    })
  }

  function saveKey() {
    if (!draftKey.trim()) {
      setKeyMessage('Enter a key first.')
      return
    }
    setKeyMessage(`Saved ${maskSecret(draftKey)}.`)
    setDraftKey('')
    patchActive({
      authMethod: 'api_key',
      maskedCredential: maskSecret(draftKey),
      connected: true,
      status: 'active',
    })
  }

  function pingBridge() {
    setBridgeMessage(`Connected to ${provider.endpointUrl}.`)
    patchActive({
      authMethod: 'cli_bridge',
      connected: true,
      status: 'active',
      maskedCredential: undefined,
    })
  }

  const connectedModels = connectedModelsFromSubscriptions(subscriptions)

  const panel = (
    <div
      role={variant === 'modal' ? 'dialog' : 'region'}
      aria-modal={variant === 'modal' ? true : undefined}
      aria-labelledby={titleId}
      className={cn(
        'flex flex-col overflow-hidden border border-[var(--xd-border)] bg-[var(--xd-canvas)] text-[var(--xd-ink)]',
        variant === 'modal'
          ? 'max-h-[min(760px,calc(100vh-32px))] w-[min(780px,calc(100vw-32px))] rounded-lg shadow-2xl'
          : 'w-full rounded-md',
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-[var(--xd-border)] px-4 py-3">
        <h2 id={titleId} className="text-[14px] font-semibold">
          Models & Providers
        </h2>
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

      <div className="grid min-h-0 flex-1 md:grid-cols-[200px_minmax(0,1fr)]">
        <ul className="border-b border-[var(--xd-border)] bg-[var(--xd-rail)] p-1.5 md:border-r md:border-b-0">
          {subscriptions.map((subscription) => {
            const selected = subscription.providerId === active.providerId
            return (
              <li key={subscription.providerId}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(subscription.providerId)
                    setDraftKey('')
                    setKeyMessage(null)
                    setBridgeMessage(null)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded px-2.5 py-2 text-left text-[12px] transition-colors',
                    selected
                      ? 'bg-[var(--xd-surface-active)] font-medium text-[var(--xd-ink)]'
                      : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                  )}
                  aria-pressed={selected}
                >
                  <span className="truncate">{subscription.name}</span>
                  <StatusDot
                    status={
                      subscription.connected
                        ? subscription.status
                        : 'disconnected'
                    }
                  />
                </button>
              </li>
            )
          })}
        </ul>

        <div className="min-h-0 space-y-4 overflow-y-auto p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[13.5px] font-semibold">{active.name}</h3>
              <p className="mt-0.5 text-[12px] text-[var(--xd-ink-secondary)]">
                {active.tagline}
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-[12px] font-medium">
              <Switch
                checked={active.connected}
                onCheckedChange={setConnected}
                aria-label={`Connect ${active.name}`}
              />
              <span>{active.connected ? 'Connected' : 'Off'}</span>
            </label>
          </div>

          {active.status === 'rate_limited' && active.connected && (
            <p className="flex items-center gap-1.5 rounded border border-[var(--xd-sketch)]/40 bg-[var(--xd-sketch-soft)] px-2.5 py-1.5 text-[11.5px] text-[var(--xd-sketch)]">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span>Rate limit reached on {active.planName}.</span>
            </p>
          )}

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  ['subscription_oauth', 'OAuth'],
                  ['api_key', 'API Key'],
                  ['cli_bridge', 'CLI Bridge'],
                ] as const
              ).map(([method, label]) => (
                <button
                  key={method}
                  type="button"
                  aria-pressed={active.authMethod === method}
                  onClick={() => patchActive({ authMethod: method })}
                  className={cn(
                    'rounded border px-2.5 py-1 text-[11.5px] transition-colors',
                    active.authMethod === method
                      ? 'border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] font-medium text-[var(--xd-accent)]'
                      : 'border-[var(--xd-border)] text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)]',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {active.authMethod === 'subscription_oauth' && (
              <div className="flex items-center justify-between rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2 text-[12px]">
                <span className="text-[var(--xd-ink-secondary)]">
                  Authenticate with your {active.name} account
                </span>
                <button
                  type="button"
                  onClick={() =>
                    patchActive({
                      connected: true,
                      status: 'active',
                      authMethod: 'subscription_oauth',
                      maskedCredential: undefined,
                    })
                  }
                  className="inline-flex h-7 items-center gap-1.5 rounded bg-[var(--xd-accent)] px-2.5 text-[11.5px] font-medium text-white"
                >
                  <KeyRound className="size-3" />
                  <span>{active.connected ? 'Reconnect' : 'Connect'}</span>
                </button>
              </div>
            )}

            {active.authMethod === 'api_key' && (
              <form
                className="space-y-1.5 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] p-2.5"
                onSubmit={(event) => {
                  event.preventDefault()
                  saveKey()
                }}
              >
                <div className="flex items-center gap-1.5">
                  <input
                    id={`${active.providerId}-key`}
                    type="password"
                    autoComplete="off"
                    aria-label="API key or token"
                    value={draftKey}
                    onChange={(event) => setDraftKey(event.target.value)}
                    placeholder={active.maskedCredential ?? 'Paste API key...'}
                    className="h-7 min-w-0 flex-1 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 text-[12px] outline-none focus-visible:border-[var(--xd-accent)]"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-7 items-center rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-2.5 text-[11.5px] font-medium"
                  >
                    Save
                  </button>
                </div>
                {keyMessage && (
                  <p className="text-[11px] text-[var(--xd-ink-secondary)]">
                    {keyMessage}
                  </p>
                )}
              </form>
            )}

            {active.authMethod === 'cli_bridge' && (
              <div className="flex items-center justify-between rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2 text-[12px]">
                <span className="xd-mono flex items-center gap-1.5 text-[11.5px] text-[var(--xd-ink-secondary)]">
                  <Terminal className="size-3.5" />
                  <span>{active.endpointUrl}</span>
                </span>
                <button
                  type="button"
                  onClick={pingBridge}
                  className="inline-flex h-7 items-center rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-2.5 text-[11.5px] font-medium"
                >
                  Detect CLI
                </button>
              </div>
            )}
            {bridgeMessage && (
              <p className="text-[11px] text-[var(--xd-commit)]">
                {bridgeMessage}
              </p>
            )}
          </div>

          {/* Models list */}
          <div>
            <h4 className="mb-1.5 text-[11.5px] font-medium text-[var(--xd-ink-muted)]">
              Available models
            </h4>
            <ul className="divide-y divide-[var(--xd-border)] rounded border border-[var(--xd-border)]">
              {active.models.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[12px]"
                >
                  <span className="font-medium">{item.name}</span>
                  <span className="xd-mono text-[11px] text-[var(--xd-ink-muted)]">
                    {item.contextWindow} · {item.role}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Role assignments */}
      <div className="border-t border-[var(--xd-border)] bg-[var(--xd-rail)]/40 px-4 py-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ROLE_FIELDS.map((field) => {
            const selected = connectedModels.find(
              (item) => item.id === roles[field.key],
            )
            return (
              <label key={field.key} className="block">
                <span className="block text-[11px] font-medium text-[var(--xd-ink-secondary)]">
                  {field.label}
                </span>
                <select
                  aria-label={field.label}
                  value={roles[field.key]}
                  onChange={(event) =>
                    commit(subscriptions, {
                      ...roles,
                      [field.key]: event.target.value,
                    })
                  }
                  className="mt-1 h-7 w-full rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-1.5 text-[11.5px]"
                >
                  {connectedModels.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.modelName}
                    </option>
                  ))}
                  {!selected && (
                    <option value={roles[field.key]}>
                      {roles[field.key]} (off)
                    </option>
                  )}
                </select>
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )

  if (variant === 'page') return panel

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4">
      <button
        type="button"
        aria-label="Dismiss subscriptions"
        className="absolute inset-0 cursor-default"
        onClick={() => onOpenChange?.(false)}
      />
      <div className="relative z-[1]">{panel}</div>
    </div>
  )
}

function StatusDot({ status }: { status: AISubscription['status'] }) {
  const color =
    status === 'active'
      ? 'bg-[var(--xd-commit)]'
      : status === 'rate_limited'
        ? 'bg-[var(--xd-sketch)]'
        : 'bg-[var(--xd-ink-subtle)]'
  return <span className={cn('size-1.5 rounded-full', color)} aria-hidden />
}
