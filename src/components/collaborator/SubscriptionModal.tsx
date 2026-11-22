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
    label: 'Exploration & Fast Edits',
    hint: 'Low-latency restyles and scans',
  },
  {
    key: 'review',
    label: 'Code & Op Review',
    hint: 'Diff reading and idiom checks before a keep',
  },
  {
    key: 'design',
    label: 'UI Design',
    hint: 'Layout, type, and in-file controls',
  },
]

const PROVIDER_MARK: Record<AIProviderId, string> = {
  'opencode-go': 'Go',
  xai: 'xAI',
  claude: 'Cl',
  openai: 'AI',
}

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
    tagline: 'One subscription, several models, routed through the Go bridge.',
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
        recommendedFor: 'Manuscript layout and in-file UI',
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
        recommendedFor: 'Exploration and cheap scans',
      }),
      model({
        id: 'opencode-go/qwen4-max',
        name: 'Qwen4 Max',
        providerId: 'opencode-go',
        promptLabel: 'OpenCode Go · Qwen4 Max',
        role: 'reasoning',
        contextWindow: '256K',
        speedTier: 'deep',
        supportsVisionSketch: false,
        recommendedFor: 'Long derivations',
      }),
    ],
  },
  {
    providerId: 'xai',
    name: 'SpaceX AI',
    tagline: 'xAI Grok models for implementation and fast edits.',
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
        recommendedFor: 'Growing a live .mrbl page in stages',
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
        recommendedFor: 'Scale-to-restyle gestures',
      }),
      model({
        id: 'xai/grok-4.6',
        name: 'Grok 4.6',
        providerId: 'xai',
        promptLabel: 'SpaceX AI · Grok 4.6',
        role: 'reasoning',
        contextWindow: '128K',
        speedTier: 'fast',
        supportsVisionSketch: true,
        recommendedFor: 'Fallback reasoning',
      }),
    ],
  },
  {
    providerId: 'claude',
    name: 'Anthropic Claude',
    tagline: 'Claude for code review and careful op diffs.',
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
        recommendedFor: 'Reading a proposed diff',
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
        recommendedFor: 'Hard structural edits',
      }),
      model({
        id: 'claude-haiku-5-5',
        name: 'Haiku 5.5',
        providerId: 'claude',
        promptLabel: 'Claude · Haiku 5.5',
        role: 'exploration',
        contextWindow: '200K',
        speedTier: 'instant',
        supportsVisionSketch: false,
        recommendedFor: 'Short prose polishes',
      }),
    ],
  },
  {
    providerId: 'openai',
    name: 'OpenAI',
    tagline: 'GPT models on an API key or ChatGPT subscription.',
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
        recommendedFor: 'General semantic edits',
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
        recommendedFor: 'Short proofs and checks',
      }),
      model({
        id: 'gpt-4.1',
        name: 'GPT-4.1',
        providerId: 'openai',
        promptLabel: 'OpenAI · GPT-4.1',
        role: 'exploration',
        contextWindow: '128K',
        speedTier: 'fast',
        supportsVisionSketch: true,
        recommendedFor: 'Everyday edits',
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
      setKeyMessage('Enter a key or token first.')
      return
    }
    setKeyMessage(
      `Stored as ${maskSecret(draftKey)}. The raw value is not kept in the page.`,
    )
    setDraftKey('')
    patchActive({
      authMethod: 'api_key',
      maskedCredential: maskSecret(draftKey),
      connected: true,
      status: 'active',
    })
  }

  function pingBridge() {
    setBridgeMessage(
      `Bridge answered at ${provider.endpointUrl}. Local CLI is the writer.`,
    )
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
        'flex flex-col overflow-hidden border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] text-[var(--xd-ink)]',
        variant === 'modal'
          ? 'max-h-[min(860px,calc(100vh-32px))] w-[min(920px,calc(100vw-32px))] rounded-lg shadow-[0_24px_80px_rgba(0,0,0,0.35)]'
          : 'min-h-[640px] w-full rounded-lg',
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b border-[var(--xd-border)] px-4 py-3">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-[var(--xd-ink-muted)] uppercase">
            AI subscriptions
          </p>
          <h2 id={titleId} className="mt-0.5 text-[15px] font-semibold">
            Providers & default models
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--xd-ink-secondary)]">
            Connected models show up in the prompt bar and the collaborator
            sidebar.
          </p>
        </div>
        {variant === 'modal' && (
          <button
            type="button"
            onClick={() => onOpenChange?.(false)}
            className="inline-flex size-7 items-center justify-center rounded-md text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)]"
            aria-label="Close subscriptions"
          >
            <X className="size-4" />
          </button>
        )}
      </header>

      <div className="grid min-h-0 flex-1 md:grid-cols-[240px_minmax(0,1fr)]">
        <ul className="border-b border-[var(--xd-border)] bg-[var(--xd-rail)] md:border-r md:border-b-0">
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
                    'flex w-full items-center gap-2 px-3 py-2.5 text-left',
                    selected
                      ? 'bg-[var(--xd-accent-soft)]'
                      : 'hover:bg-[var(--xd-surface-hover)]',
                  )}
                  aria-pressed={selected}
                >
                  <span className="inline-flex h-7 w-9 items-center justify-center rounded bg-[var(--xd-elevated)] text-[10px] font-semibold">
                    {PROVIDER_MARK[subscription.providerId]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium">
                      {subscription.name}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--xd-ink-muted)]">
                      {subscription.planName}
                    </span>
                  </span>
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

        <div className="min-h-0 overflow-y-auto px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-[14px] font-semibold">{active.name}</h3>
              <p className="mt-0.5 max-w-xl text-[12.5px] text-[var(--xd-ink-secondary)]">
                {active.tagline}
              </p>
              <p className="xd-mono mt-1 text-[11px] text-[var(--xd-ink-muted)]">
                {active.endpointUrl}
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-[12.5px] font-medium">
              <Switch
                checked={active.connected}
                onCheckedChange={setConnected}
                aria-label={`Connect ${active.name}`}
              />
              {active.connected ? 'Connected' : 'Disconnected'}
            </label>
          </div>

          {active.status === 'rate_limited' && active.connected && (
            <p className="mt-3 flex items-start gap-1.5 rounded-md border border-[var(--xd-sketch)]/40 bg-[var(--xd-sketch-soft)] px-2.5 py-2 text-[12px] text-[var(--xd-ink)]">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--xd-sketch)]" />
              Minute cap reached on {active.planName}. Requests queue behind
              this subscription. The models stay selectable.
            </p>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Metric
              label="Ops this month"
              value={active.usageThisMonth.opsGenerated.toLocaleString()}
            />
            <Metric
              label="Apps built"
              value={String(active.usageThisMonth.appsBuilt)}
            />
            <Metric
              label="Quota used"
              value={`${active.usageThisMonth.quotaPercent}%`}
              bar={active.usageThisMonth.quotaPercent}
            />
          </div>

          <fieldset className="mt-4">
            <legend className="text-[12px] font-semibold">Auth mode</legend>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(
                [
                  ['subscription_oauth', 'Subscription OAuth'],
                  ['api_key', 'API Key'],
                  ['cli_bridge', 'Local CLI Bridge'],
                ] as const
              ).map(([method, label]) => (
                <button
                  key={method}
                  type="button"
                  aria-pressed={active.authMethod === method}
                  onClick={() => patchActive({ authMethod: method })}
                  className={cn(
                    'rounded-md border px-2 py-1 text-[12px]',
                    active.authMethod === method
                      ? 'border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)]'
                      : 'border-[var(--xd-border)] hover:bg-[var(--xd-surface-hover)]',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          {active.authMethod === 'subscription_oauth' && (
            <div className="mt-3 rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2.5">
              <p className="text-[12.5px]">
                Sign in with the {active.name} subscription. No API key is
                stored.
              </p>
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
                className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--xd-accent)] px-2.5 text-[12px] font-medium text-white"
              >
                <KeyRound className="size-3.5" />
                {active.connected
                  ? 'Reconnect OAuth'
                  : 'Connect with subscription'}
              </button>
            </div>
          )}

          {active.authMethod === 'api_key' && (
            <form
              className="mt-3 rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2.5"
              onSubmit={(event) => {
                event.preventDefault()
                saveKey()
              }}
            >
              <label
                className="block text-[12px] font-medium"
                htmlFor={`${active.providerId}-key`}
              >
                API key or token
              </label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <input
                  id={`${active.providerId}-key`}
                  type="password"
                  autoComplete="off"
                  value={draftKey}
                  onChange={(event) => setDraftKey(event.target.value)}
                  placeholder={active.maskedCredential ?? 'Paste a key'}
                  className="h-8 min-w-[200px] flex-1 rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 text-[12.5px] outline-none focus-visible:border-[var(--xd-accent)]"
                />
                <button
                  type="submit"
                  className="inline-flex h-8 items-center rounded-md border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-2.5 text-[12px] font-medium"
                >
                  Save key
                </button>
              </div>
              {active.maskedCredential && (
                <p className="xd-mono mt-1.5 text-[11px] text-[var(--xd-ink-muted)]">
                  Current credential {active.maskedCredential}
                </p>
              )}
              {keyMessage && (
                <p className="mt-1.5 text-[12px] text-[var(--xd-ink-secondary)]">
                  {keyMessage}
                </p>
              )}
            </form>
          )}

          {active.authMethod === 'cli_bridge' && (
            <div className="mt-3 rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[12.5px]">
                <Terminal className="size-3.5" />
                Local CLI bridge
              </p>
              <p className="xd-mono mt-1 text-[11.5px] text-[var(--xd-ink-secondary)]">
                marble-cli://local · {active.endpointUrl}
              </p>
              <button
                type="button"
                onClick={pingBridge}
                className="mt-2 inline-flex h-8 items-center rounded-md border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-2.5 text-[12px] font-medium"
              >
                Detect CLI
              </button>
              {bridgeMessage && (
                <p className="mt-1.5 text-[12px] text-[var(--xd-commit)]">
                  {bridgeMessage}
                </p>
              )}
            </div>
          )}

          <div className="mt-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[12px] font-semibold">Models</h4>
              <label className="flex items-center gap-2 text-[12px] text-[var(--xd-ink-secondary)]">
                Provider default
                <select
                  aria-label={`${active.name} default model`}
                  value={active.defaultModelId}
                  onChange={(event) =>
                    patchActive({ defaultModelId: event.target.value })
                  }
                  className="h-7 rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-1.5 text-[12px]"
                >
                  {active.models.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <ul className="mt-2 divide-y divide-[var(--xd-border)] rounded-md border border-[var(--xd-border)]">
              {active.models.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-2 px-2.5 py-2"
                >
                  <div className="min-w-[180px] flex-1">
                    <p className="text-[12.5px] font-medium">
                      {item.promptLabel}
                    </p>
                    <p className="xd-mono text-[10.5px] text-[var(--xd-ink-muted)]">
                      {item.id}
                    </p>
                  </div>
                  <span className="rounded border border-[var(--xd-border)] px-1.5 py-0.5 text-[10.5px] text-[var(--xd-ink-secondary)]">
                    {item.role}
                  </span>
                  <span className="xd-tabular text-[11px] text-[var(--xd-ink-muted)]">
                    {item.contextWindow} · {item.speedTier}
                  </span>
                  {item.supportsVisionSketch && (
                    <span className="text-[10.5px] text-[var(--xd-sketch)]">
                      vision
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--xd-border)] px-4 py-3">
        <h3 className="text-[12px] font-semibold">Default model per role</h3>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {ROLE_FIELDS.map((field) => {
            const selected = connectedModels.find(
              (item) => item.id === roles[field.key],
            )
            const stale = !selected
            return (
              <label
                key={field.key}
                className="rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2.5 py-2"
              >
                <span className="block text-[12px] font-medium">
                  {field.label}
                </span>
                <span className="block text-[11px] text-[var(--xd-ink-muted)]">
                  {field.hint}
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
                  className="mt-1.5 h-8 w-full rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 text-[12px]"
                >
                  {connectedModels.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                  {stale && (
                    <option value={roles[field.key]}>
                      {roles[field.key]} (disconnected)
                    </option>
                  )}
                </select>
                {stale && (
                  <span className="mt-1 block text-[11px] text-[var(--xd-sketch)]">
                    That model’s provider is disconnected.
                  </span>
                )}
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
  const label =
    status === 'active'
      ? 'Active'
      : status === 'rate_limited'
        ? 'Rate limited'
        : 'Disconnected'
  return (
    <span
      className={cn('size-2 rounded-full', color)}
      title={label}
      aria-label={label}
    />
  )
}

function Metric({
  label,
  value,
  bar,
}: {
  label: string
  value: string
  bar?: number
}) {
  return (
    <div className="rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2.5 py-2">
      <p className="text-[11px] text-[var(--xd-ink-muted)]">{label}</p>
      <p className="xd-tabular text-[16px] font-semibold">{value}</p>
      {bar !== undefined && (
        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-[var(--xd-surface-active)]">
          <span
            className="block h-full bg-[var(--xd-accent)]"
            style={{ width: `${Math.max(0, Math.min(100, bar))}%` }}
          />
        </span>
      )}
    </div>
  )
}
