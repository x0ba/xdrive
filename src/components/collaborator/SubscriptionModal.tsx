import { useEffect, useId, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Terminal,
  X,
} from 'lucide-react'
import type { AIModelSpec, AIProviderId, AISubscription } from '#/lib/types'
import type {
  AntigravityAuthMethodId,
  AntigravityRuntimeStatus,
} from '#/lib/ai/antigravity-types'
import {
  DEFAULT_OPENCODE_GO_MODELS,
  stripOpenCodeFreeDisplaySuffix,
} from '#/lib/ai/opencode-go-types'
import type {
  OpenCodeGoRuntimeStatus,
  OpenCodeGoUsageMeter,
} from '#/lib/ai/opencode-go-types'
import {
  hasOpenCodeFreeModels,
  openCodeGoModelsToSpecs,
} from '#/lib/ai/opencode-go-client'
import { DEFAULT_GROK_BUILD_MODELS } from '#/lib/ai/grok-build-types'
import type { GrokBuildRuntimeStatus } from '#/lib/ai/grok-build-types'
import { grokBuildModelsToSpecs } from '#/lib/ai/grok-build-client'
import { Switch } from '#/components/ui/switch'
import { WorkspaceLink } from '#/components/routing/WorkspaceLink'
import { settingsProviderHref } from '#/lib/routing'
import {
  ModelPicker,
  modelPickerOptionsFromSubscriptions,
} from '#/components/model-picker'
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
    providerId: 'antigravity',
    name: 'Google Antigravity',
    tagline:
      'Official unmodified Antigravity ACP runtime (`agy acp`) with native Google AI plan OAuth.',
    planName: 'Google AI Plan',
    connected: true,
    authMethod: 'antigravity_acp',
    status: 'active',
    defaultModelId: 'antigravity/default',
    endpointUrl: 'agy acp (JSON-RPC stdio)',
    usageThisMonth: { opsGenerated: 0, appsBuilt: 0, quotaPercent: 0 },
    models: [
      model({
        id: 'antigravity/default',
        name: 'Gemini (Google AI Plan)',
        providerId: 'antigravity',
        promptLabel: 'Antigravity · Gemini (Google AI Plan)',
        role: 'implementation',
        contextWindow: '1M',
        speedTier: 'deep',
        supportsVisionSketch: true,
        recommendedFor: 'Active Gemini model from your Google AI plan',
      }),
    ],
  },
  {
    providerId: 'opencode-go',
    name: 'OpenCode Go',
    tagline:
      'Local OpenCode CLI over ACP (`opencode acp`) authenticated via `opencode auth login` — no API key stored in xDrive.',
    planName: 'OpenCode ACP',
    connected: false,
    authMethod: 'opencode_acp',
    status: 'disconnected',
    defaultModelId: 'opencode-go/glm-5.3',
    endpointUrl: 'opencode acp (JSON-RPC stdio)',
    usageThisMonth: { opsGenerated: 0, appsBuilt: 0, quotaPercent: 0 },
    models: openCodeGoModelsToSpecs(DEFAULT_OPENCODE_GO_MODELS).map((spec) => ({
      ...spec,
      promptLabel: `OpenCode Go · ${spec.name}`,
    })),
  },
  {
    providerId: 'grok-build',
    name: 'Grok Build',
    tagline:
      'Local Grok CLI over ACP (`grok --no-auto-update agent stdio`) authenticated via `grok login` or `XAI_API_KEY` — no API key stored in xDrive.',
    planName: 'Grok Build ACP',
    connected: false,
    authMethod: 'grok_build_acp',
    status: 'disconnected',
    defaultModelId: 'grok-build/grok-4.7',
    endpointUrl: 'grok --no-auto-update agent stdio',
    usageThisMonth: { opsGenerated: 0, appsBuilt: 0, quotaPercent: 0 },
    models: grokBuildModelsToSpecs(DEFAULT_GROK_BUILD_MODELS).map((spec) => ({
      ...spec,
      promptLabel: `Grok Build · ${spec.name}`,
    })),
  },
  {
    providerId: 'openai',
    name: 'OpenAI',
    tagline: 'Not yet configured on this server.',
    planName: 'API',
    connected: false,
    authMethod: 'api_key',
    status: 'disconnected',
    defaultModelId: 'gpt-5.4',
    endpointUrl: 'https://api.openai.com/v1',
    usageThisMonth: { opsGenerated: 0, appsBuilt: 0, quotaPercent: 0 },
    models: [
      model({
        id: 'gpt-5.4',
        name: 'GPT-5.4',
        providerId: 'openai',
        promptLabel: 'OpenAI · GPT-5.4',
        role: 'implementation',
        contextWindow: '400K',
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
        contextWindow: '200K',
        speedTier: 'fast',
        supportsVisionSketch: false,
        recommendedFor: 'Proofs and checks',
      }),
    ],
  },
  {
    providerId: 'claude',
    name: 'Anthropic Claude',
    tagline: 'Not yet configured on this server.',
    planName: 'API',
    connected: false,
    authMethod: 'api_key',
    status: 'disconnected',
    defaultModelId: 'claude-sonnet-5-5',
    endpointUrl: 'https://api.anthropic.com/v1',
    usageThisMonth: { opsGenerated: 0, appsBuilt: 0, quotaPercent: 0 },
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
    providerId: 'xai',
    name: 'SpaceX AI / xAI',
    tagline: 'Not yet configured on this server.',
    planName: 'API',
    connected: false,
    authMethod: 'api_key',
    status: 'disconnected',
    defaultModelId: 'xai/grok-4.7',
    endpointUrl: 'https://api.x.ai/v1',
    usageThisMonth: { opsGenerated: 0, appsBuilt: 0, quotaPercent: 0 },
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
    ],
  },
]

export const DEFAULT_ROLE_ASSIGNMENTS: RoleAssignments = {
  implementation: 'antigravity/default',
  exploration: 'antigravity/default',
  review: 'antigravity/default',
  design: 'antigravity/default',
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
        isFree: item.isFree,
      })),
    )
}

export interface SubscriptionModalProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  variant?: 'modal' | 'page'
  activeProviderId?: AIProviderId
  onSelectProvider?: (providerId: AIProviderId) => void
  subscriptions?: ManagedSubscription[]
  roleAssignments?: RoleAssignments
  favoriteModelIds?: string[]
  onFavoriteModelIdsChange?: (ids: string[]) => void
  onChange?: (
    subscriptions: ManagedSubscription[],
    roles: RoleAssignments,
  ) => void
  antigravityStatus?: AntigravityRuntimeStatus | null
  antigravityBusy?: string | null
  antigravityError?: string | null
  onRefreshAntigravity?: () => void
  onAuthenticateAntigravity?: (
    methodId: AntigravityAuthMethodId | string,
    options?: { apiKey?: string },
  ) => void
  onLogoutAntigravity?: () => void
  onInstallAntigravityBinary?: () => void
  openCodeGoStatus?: OpenCodeGoRuntimeStatus | null
  openCodeGoBusy?: string | null
  openCodeGoError?: string | null
  onRefreshOpenCodeGo?: () => void
  grokBuildStatus?: GrokBuildRuntimeStatus | null
  grokBuildBusy?: string | null
  grokBuildError?: string | null
  onRefreshGrokBuild?: () => void
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
  activeProviderId,
  onSelectProvider,
  subscriptions: subscriptionsProp,
  roleAssignments: rolesProp,
  favoriteModelIds,
  onFavoriteModelIdsChange,
  onChange,
  antigravityStatus = null,
  antigravityBusy = null,
  antigravityError = null,
  onRefreshAntigravity,
  onAuthenticateAntigravity,
  onLogoutAntigravity,
  onInstallAntigravityBinary,
  openCodeGoStatus = null,
  openCodeGoBusy = null,
  openCodeGoError = null,
  onRefreshOpenCodeGo,
  grokBuildStatus = null,
  grokBuildBusy = null,
  grokBuildError = null,
  onRefreshGrokBuild,
}: SubscriptionModalProps) {
  const titleId = useId()
  const [internalSubs, setInternalSubs] = useState<ManagedSubscription[]>(
    subscriptionsProp ?? DEFAULT_SUBSCRIPTIONS,
  )
  const [internalRoles, setInternalRoles] = useState<RoleAssignments>(
    rolesProp ?? DEFAULT_ROLE_ASSIGNMENTS,
  )
  const [internalActiveId, setInternalActiveId] = useState<AIProviderId>(
    activeProviderId ?? 'antigravity',
  )
  const activeId = activeProviderId ?? internalActiveId
  const selectProvider = (providerId: AIProviderId) => {
    if (activeProviderId === undefined) setInternalActiveId(providerId)
    onSelectProvider?.(providerId)
  }
  const [draftKey, setDraftKey] = useState('')
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [showGeminiKeyForm, setShowGeminiKeyForm] = useState(false)
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
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !document.querySelector('[data-xdrive-model-picker-popup]')
      ) {
        onOpenChange?.(false)
      }
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
    if (provider.providerId === 'antigravity') {
      if (connected) {
        onAuthenticateAntigravity?.('oauth-personal')
      } else {
        onLogoutAntigravity?.()
      }
      return
    }
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

  const rolePickerModels = modelPickerOptionsFromSubscriptions(subscriptions)
  const isAntigravity = active.providerId === 'antigravity'
  const isOpenCodeGo = active.providerId === 'opencode-go'
  const isGrokBuild = active.providerId === 'grok-build'
  const binaryAvailable = antigravityStatus?.binaryAvailable ?? true
  const isAuthenticated = antigravityStatus
    ? antigravityStatus.authenticated
    : active.connected
  const isOpenCodeGoConnected = openCodeGoStatus
    ? openCodeGoStatus.authenticated && openCodeGoStatus.entitled
    : active.connected
  const openCodeHasFreeModels = openCodeGoStatus
    ? hasOpenCodeFreeModels(openCodeGoStatus)
    : false
  const isOpenCodeUsableNow = isOpenCodeGoConnected || openCodeHasFreeModels
  const openCodeBinaryAvailable = openCodeGoStatus?.binaryAvailable ?? false
  const openCodeIsHttpFallback = openCodeGoStatus?.transport === 'http-fallback'
  const grokBuildBinaryAvailable = grokBuildStatus?.binaryAvailable ?? false
  const isGrokBuildConnected = grokBuildStatus
    ? grokBuildStatus.authenticated
    : active.connected
  const dedupedActiveModels = active.models.filter(
    (item, index, list) =>
      list.findIndex(
        (other) => other.id.toLowerCase() === item.id.toLowerCase(),
      ) === index,
  )
  const standardActiveModels = dedupedActiveModels.filter(
    (item) => !item.isFree,
  )
  const freeActiveModels = dedupedActiveModels.filter((item) =>
    Boolean(item.isFree),
  )
  const openCodeGoUsageRows: Array<[string, OpenCodeGoUsageMeter]> =
    openCodeGoStatus?.usage
      ? (
          [
            ['5-hour rolling', openCodeGoStatus.usage.rolling],
            ['Weekly', openCodeGoStatus.usage.weekly],
            ['Monthly', openCodeGoStatus.usage.monthly],
          ] as Array<[string, OpenCodeGoUsageMeter | undefined]>
        ).filter((entry): entry is [string, OpenCodeGoUsageMeter] =>
          Boolean(entry[1]),
        )
      : []

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

      <div className="grid min-h-0 flex-1 md:grid-cols-[210px_minmax(0,1fr)]">
        <ul className="border-b border-[var(--xd-border)] bg-[var(--xd-rail)] p-1.5 md:border-r md:border-b-0">
          {subscriptions.map((subscription) => {
            const selected = subscription.providerId === active.providerId
            return (
              <li key={subscription.providerId}>
                <WorkspaceLink
                  href={settingsProviderHref(subscription.providerId)}
                  onNavigate={() => {
                    selectProvider(subscription.providerId)
                    setDraftKey('')
                    setKeyMessage(null)
                    setBridgeMessage(null)
                  }}
                  aria-current={selected ? 'page' : undefined}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded px-2.5 py-2 text-left text-[12px] transition-colors',
                    selected
                      ? 'bg-[var(--xd-surface-active)] font-medium text-[var(--xd-ink)]'
                      : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                  )}
                >
                  <span className="truncate">{subscription.name}</span>
                  <StatusDot
                    status={
                      subscription.connected
                        ? subscription.status
                        : 'disconnected'
                    }
                  />
                </WorkspaceLink>
              </li>
            )
          })}
        </ul>

        <div className="min-h-0 space-y-4 overflow-y-auto p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[13.5px] font-semibold">{active.name}</h3>
                {isAntigravity && (
                  <span className="xd-mono rounded border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--xd-accent)]">
                    ACP
                  </span>
                )}
                {isOpenCodeGo && (
                  <span className="xd-mono rounded border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--xd-accent)]">
                    {openCodeIsHttpFallback ? 'HTTP Fallback' : 'ACP'}
                  </span>
                )}
                {isGrokBuild && (
                  <span className="xd-mono rounded border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--xd-accent)]">
                    ACP
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[12px] text-[var(--xd-ink-secondary)]">
                {active.tagline}
              </p>
            </div>
            {isAntigravity ? (
              <div className="flex items-center gap-1.5">
                {onRefreshAntigravity && (
                  <button
                    type="button"
                    disabled={Boolean(antigravityBusy)}
                    onClick={onRefreshAntigravity}
                    className="inline-flex h-7 items-center gap-1 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2 text-[11px] font-medium text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)] disabled:opacity-45"
                  >
                    <RefreshCw
                      className={cn(
                        'size-3',
                        antigravityBusy === 'refresh' && 'animate-spin',
                      )}
                    />
                    <span>Refresh</span>
                  </button>
                )}
              </div>
            ) : isOpenCodeGo ? (
              <div className="flex items-center gap-1.5">
                {onRefreshOpenCodeGo && (
                  <button
                    type="button"
                    disabled={Boolean(openCodeGoBusy)}
                    onClick={onRefreshOpenCodeGo}
                    className="inline-flex h-7 items-center gap-1 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2 text-[11px] font-medium text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)] disabled:opacity-45"
                  >
                    <RefreshCw
                      className={cn(
                        'size-3',
                        openCodeGoBusy === 'refresh' && 'animate-spin',
                      )}
                    />
                    <span>Refresh</span>
                  </button>
                )}
              </div>
            ) : isGrokBuild ? (
              <div className="flex items-center gap-1.5">
                {onRefreshGrokBuild && (
                  <button
                    type="button"
                    disabled={Boolean(grokBuildBusy)}
                    onClick={onRefreshGrokBuild}
                    className="inline-flex h-7 items-center gap-1 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2 text-[11px] font-medium text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)] disabled:opacity-45"
                  >
                    <RefreshCw
                      className={cn(
                        'size-3',
                        grokBuildBusy === 'refresh' && 'animate-spin',
                      )}
                    />
                    <span>Refresh</span>
                  </button>
                )}
              </div>
            ) : (
              <label className="inline-flex items-center gap-2 text-[12px] font-medium">
                <Switch
                  checked={active.connected}
                  onCheckedChange={setConnected}
                  aria-label={`Connect ${active.name}`}
                />
                <span>{active.connected ? 'Connected' : 'Off'}</span>
              </label>
            )}
          </div>

          {active.status === 'rate_limited' && active.connected && (
            <p className="flex items-center gap-1.5 rounded border border-[var(--xd-sketch)]/40 bg-[var(--xd-sketch-soft)] px-2.5 py-1.5 text-[11.5px] text-[var(--xd-sketch)]">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span>Rate limit reached on {active.planName}.</span>
            </p>
          )}

          {isAntigravity ? (
            <div className="space-y-3">
              {/* Compliance & official ACP runtime status */}
              <div className="rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] p-3 text-[12px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-medium text-[var(--xd-ink)]">
                    <ShieldCheck className="size-3.5 text-[var(--xd-commit)]" />
                    <span>
                      {antigravityStatus?.agentName || 'Antigravity ACP Server'}
                      {antigravityStatus?.agentVersion
                        ? ` v${antigravityStatus.agentVersion}`
                        : ''}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium',
                      isAuthenticated
                        ? 'bg-[var(--xd-commit-soft)] text-[var(--xd-commit)]'
                        : binaryAvailable
                          ? 'bg-[var(--xd-sketch-soft)] text-[var(--xd-sketch)]'
                          : 'bg-[var(--xd-danger-soft)] text-[var(--xd-danger)]',
                    )}
                  >
                    {isAuthenticated ? (
                      <>
                        <CheckCircle2 className="size-3" />
                        <span>
                          Signed in
                          {antigravityStatus?.tier
                            ? ` · ${antigravityStatus.tier}`
                            : ` · ${active.planName}`}
                        </span>
                      </>
                    ) : binaryAvailable ? (
                      <span>Sign in required</span>
                    ) : (
                      <span>ACP binary not installed</span>
                    )}
                  </span>
                </div>

                <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--xd-ink-secondary)]">
                  Follows Google Antigravity Terms of Service using the same
                  architecture as T3 Code: communicates directly with the
                  official unmodified ACP binary over JSON-RPC 2.0{' '}
                  <span className="xd-mono">stdio</span> and delegates Google AI
                  plan sign-in natively to Antigravity without extracting or
                  proxying OAuth tokens.
                </p>

                <div className="xd-mono mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-[var(--xd-ink-muted)]">
                  <span className="inline-flex items-center gap-1">
                    <Terminal className="size-3" />
                    {antigravityStatus?.binaryPath || active.endpointUrl}
                  </span>
                  {antigravityStatus?.binarySource &&
                    antigravityStatus.binarySource !== 'none' && (
                      <span>source: {antigravityStatus.binarySource}</span>
                    )}
                </div>
              </div>

              {(antigravityError || antigravityStatus?.error) && (
                <p className="flex items-start gap-1.5 rounded border border-[var(--xd-danger)]/35 bg-[var(--xd-danger-soft)] px-2.5 py-2 text-[11.5px] text-[var(--xd-danger)]">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{antigravityError || antigravityStatus?.error}</span>
                </p>
              )}

              {!binaryAvailable ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2.5 text-[12px]">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[var(--xd-ink)]">
                      Install official Google Antigravity ACP binary
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--xd-ink-secondary)]">
                      Downloads the official SHA-256 verified binary from
                      Google’s ACP Registry release channel, or install{' '}
                      <span className="xd-mono">agy</span> via Homebrew.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(antigravityBusy)}
                    onClick={() => onInstallAntigravityBinary?.()}
                    className="inline-flex h-7 items-center gap-1.5 rounded bg-[var(--xd-accent)] px-2.5 text-[11.5px] font-medium text-white hover:bg-[var(--xd-accent-hover)] disabled:opacity-45"
                  >
                    {antigravityBusy === 'install' ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Download className="size-3" />
                    )}
                    <span>Install ACP binary</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={Boolean(antigravityBusy)}
                      onClick={() =>
                        onAuthenticateAntigravity?.('oauth-personal')
                      }
                      className="inline-flex h-7 items-center gap-1.5 rounded bg-[var(--xd-accent)] px-3 text-[11.5px] font-medium text-white hover:bg-[var(--xd-accent-hover)] disabled:opacity-45"
                    >
                      {antigravityBusy === 'oauth-personal' ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <KeyRound className="size-3" />
                      )}
                      <span>
                        {antigravityBusy === 'oauth-personal'
                          ? 'Complete sign-in in browser…'
                          : isAuthenticated
                            ? 'Switch Google account'
                            : 'Sign in with Google (Google AI Plan)'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={Boolean(antigravityBusy)}
                      onClick={() =>
                        onAuthenticateAntigravity?.('oauth-business')
                      }
                      className="inline-flex h-7 items-center gap-1.5 rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-2.5 text-[11.5px] font-medium text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)] disabled:opacity-45"
                    >
                      {antigravityBusy === 'oauth-business' && (
                        <Loader2 className="size-3 animate-spin" />
                      )}
                      <span>Gemini Enterprise</span>
                    </button>

                    <button
                      type="button"
                      disabled={Boolean(antigravityBusy)}
                      onClick={() => setShowGeminiKeyForm((prev) => !prev)}
                      className="inline-flex h-7 items-center rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2.5 text-[11.5px] text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)] disabled:opacity-45"
                    >
                      Gemini API Key
                    </button>

                    <button
                      type="button"
                      disabled={Boolean(antigravityBusy)}
                      onClick={() =>
                        onAuthenticateAntigravity?.('agent-platform')
                      }
                      className="inline-flex h-7 items-center rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2.5 text-[11.5px] text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)] disabled:opacity-45"
                    >
                      Vertex AI (ADC)
                    </button>

                    {isAuthenticated && onLogoutAntigravity && (
                      <button
                        type="button"
                        disabled={Boolean(antigravityBusy)}
                        onClick={onLogoutAntigravity}
                        className="ml-auto inline-flex h-7 items-center gap-1 rounded border border-[var(--xd-border)] px-2.5 text-[11.5px] text-[var(--xd-ink-secondary)] hover:border-[var(--xd-danger)]/40 hover:text-[var(--xd-danger)] disabled:opacity-45"
                      >
                        {antigravityBusy === 'logout' ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <LogOut className="size-3" />
                        )}
                        <span>Sign out</span>
                      </button>
                    )}
                  </div>

                  {showGeminiKeyForm && (
                    <form
                      className="space-y-1.5 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] p-2.5"
                      onSubmit={(event) => {
                        event.preventDefault()
                        if (!geminiApiKey.trim()) return
                        onAuthenticateAntigravity?.('gemini-api-key', {
                          apiKey: geminiApiKey.trim(),
                        })
                        setGeminiApiKey('')
                        setShowGeminiKeyForm(false)
                      }}
                    >
                      <p className="text-[11px] text-[var(--xd-ink-secondary)]">
                        Optional: authenticate the Antigravity ACP runtime with
                        a Google AI Studio{' '}
                        <span className="xd-mono">GEMINI_API_KEY</span> (kept in
                        server memory only, never saved to repo files).
                      </p>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="password"
                          autoComplete="off"
                          aria-label="Gemini API key"
                          value={geminiApiKey}
                          onChange={(event) =>
                            setGeminiApiKey(event.target.value)
                          }
                          placeholder="AIza..."
                          className="h-7 min-w-0 flex-1 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 text-[12px] outline-none focus-visible:border-[var(--xd-accent)]"
                        />
                        <button
                          type="submit"
                          disabled={
                            !geminiApiKey.trim() || Boolean(antigravityBusy)
                          }
                          className="inline-flex h-7 items-center rounded bg-[var(--xd-accent)] px-2.5 text-[11.5px] font-medium text-white disabled:opacity-40"
                        >
                          Connect key
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          ) : isOpenCodeGo ? (
            <div className="space-y-3">
              <div className="rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] p-3 text-[12px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-medium text-[var(--xd-ink)]">
                    <ShieldCheck className="size-3.5 text-[var(--xd-commit)]" />
                    <span>
                      {openCodeGoStatus?.agentName || 'OpenCode ACP Server'}
                      {openCodeGoStatus?.agentVersion
                        ? ` v${openCodeGoStatus.agentVersion}`
                        : ''}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium',
                      isOpenCodeUsableNow && !openCodeGoStatus?.rateLimited
                        ? 'bg-[var(--xd-commit-soft)] text-[var(--xd-commit)]'
                        : openCodeGoStatus?.rateLimited
                          ? 'bg-[var(--xd-sketch-soft)] text-[var(--xd-sketch)]'
                          : openCodeGoStatus?.authenticated &&
                              !openCodeGoStatus.entitled
                            ? 'bg-[var(--xd-danger-soft)] text-[var(--xd-danger)]'
                            : openCodeBinaryAvailable
                              ? 'bg-[var(--xd-sketch-soft)] text-[var(--xd-sketch)]'
                              : 'bg-[var(--xd-danger-soft)] text-[var(--xd-danger)]',
                    )}
                  >
                    {isOpenCodeGoConnected ? (
                      <>
                        <CheckCircle2 className="size-3" />
                        <span>
                          {openCodeGoStatus?.rateLimited
                            ? 'Connected · Rate limited'
                            : openCodeIsHttpFallback
                              ? 'Connected · OPENCODE_API_KEY fallback'
                              : 'Connected · OpenCode ACP'}
                        </span>
                      </>
                    ) : openCodeHasFreeModels ? (
                      <>
                        <CheckCircle2 className="size-3" />
                        <span>Free models · OpenCode ACP</span>
                      </>
                    ) : openCodeGoStatus?.authenticated &&
                      !openCodeGoStatus.entitled ? (
                      <span>Go subscription required</span>
                    ) : openCodeBinaryAvailable ? (
                      <span>Login required</span>
                    ) : (
                      <span>OpenCode CLI not installed</span>
                    )}
                  </span>
                </div>

                <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--xd-ink-secondary)]">
                  {openCodeIsHttpFallback ? (
                    <>
                      OpenCode CLI was not found on this machine, so xDrive is
                      falling back to direct HTTP against{' '}
                      <span className="xd-mono">opencode.ai/inference/go</span>{' '}
                      using <span className="xd-mono">OPENCODE_API_KEY</span>{' '}
                      from the server environment. Install OpenCode CLI and run{' '}
                      <span className="xd-mono">opencode auth login</span> to
                      use ACP without storing an API key in xDrive.
                    </>
                  ) : (
                    <>
                      Communicates directly with the local OpenCode CLI over
                      Agent Client Protocol (
                      <span className="xd-mono">opencode acp</span>, JSON-RPC
                      2.0 <span className="xd-mono">stdio</span>) and uses
                      OpenCode’s own credential store from{' '}
                      <span className="xd-mono">opencode auth login</span>.
                      xDrive never asks for or persists an OpenCode API key.
                    </>
                  )}
                </p>

                <div className="xd-mono mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-[var(--xd-ink-muted)]">
                  <span className="inline-flex items-center gap-1">
                    <Terminal className="size-3" />
                    {openCodeGoStatus?.binaryPath ||
                      openCodeGoStatus?.endpointBaseUrl ||
                      active.endpointUrl}
                  </span>
                  {openCodeBinaryAvailable &&
                    openCodeGoStatus?.binarySource &&
                    openCodeGoStatus.binarySource !== 'none' && (
                      <span>source: {openCodeGoStatus.binarySource}</span>
                    )}
                  {openCodeGoStatus?.loggedInProviders &&
                    openCodeGoStatus.loggedInProviders.length > 0 && (
                      <span>
                        auth: {openCodeGoStatus.loggedInProviders.join(', ')}
                      </span>
                    )}
                  {openCodeIsHttpFallback && openCodeGoStatus.maskedKey && (
                    <span>
                      key: {openCodeGoStatus.maskedKey} (OPENCODE_API_KEY)
                    </span>
                  )}
                </div>

                {openCodeGoUsageRows.length > 0 && (
                  <div className="mt-3 grid gap-2 border-t border-[var(--xd-border)] pt-2.5 sm:grid-cols-3">
                    {openCodeGoUsageRows.map(([label, meter]) => (
                      <div key={label} className="space-y-1">
                        <div className="flex items-center justify-between text-[10.5px]">
                          <span className="text-[var(--xd-ink-secondary)]">
                            {label}
                          </span>
                          <span
                            className={cn(
                              'xd-mono font-medium',
                              meter.status === 'rate-limited'
                                ? 'text-[var(--xd-sketch)]'
                                : 'text-[var(--xd-ink)]',
                            )}
                          >
                            {meter.percent}%
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--xd-border)]">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              meter.status === 'rate-limited'
                                ? 'bg-[var(--xd-sketch)]'
                                : 'bg-[var(--xd-accent)]',
                            )}
                            style={{
                              width: `${Math.min(100, meter.percent)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {(openCodeGoError || openCodeGoStatus?.error) && (
                <p className="flex items-start gap-1.5 rounded border border-[var(--xd-danger)]/35 bg-[var(--xd-danger-soft)] px-2.5 py-2 text-[11.5px] text-[var(--xd-danger)]">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{openCodeGoError || openCodeGoStatus?.error}</span>
                </p>
              )}

              {!openCodeBinaryAvailable && !isOpenCodeGoConnected ? (
                <div className="space-y-2 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] p-3 text-[11.5px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-[var(--xd-ink)]">
                      Set up OpenCode CLI (ACP)
                    </p>
                    {onRefreshOpenCodeGo && (
                      <button
                        type="button"
                        disabled={Boolean(openCodeGoBusy)}
                        onClick={onRefreshOpenCodeGo}
                        className="inline-flex h-7 items-center gap-1.5 rounded bg-[var(--xd-accent)] px-2.5 text-[11.5px] font-medium text-white hover:bg-[var(--xd-accent-hover)] disabled:opacity-45"
                      >
                        <RefreshCw
                          className={cn(
                            'size-3',
                            openCodeGoBusy === 'refresh' && 'animate-spin',
                          )}
                        />
                        <span>Detect CLI</span>
                      </button>
                    )}
                  </div>
                  <ol className="list-decimal space-y-1.5 pl-4 text-[var(--xd-ink-secondary)]">
                    <li>
                      Install OpenCode CLI (or point{' '}
                      <span className="xd-mono">XDRIVE_OPENCODE_BIN</span> to
                      your binary in <span className="xd-mono">.env.local</span>
                      ):
                      <pre className="xd-mono mt-1 overflow-x-auto rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 py-1 text-[11px] text-[var(--xd-ink)]">
                        curl -fsSL https://opencode.ai/install | bash
                      </pre>
                    </li>
                    <li>
                      Sign in with your OpenCode Go subscription (stored in
                      OpenCode’s own credential store):
                      <pre className="xd-mono mt-1 overflow-x-auto rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 py-1 text-[11px] text-[var(--xd-ink)]">
                        opencode auth login
                      </pre>
                    </li>
                    <li>
                      Click{' '}
                      <span className="font-medium text-[var(--xd-ink)]">
                        Detect CLI
                      </span>{' '}
                      to connect over ACP. (If you cannot install the CLI,{' '}
                      <span className="xd-mono">OPENCODE_API_KEY</span> in{' '}
                      <span className="xd-mono">.env.local</span> works as a
                      direct-HTTP fallback.)
                    </li>
                  </ol>
                </div>
              ) : openCodeBinaryAvailable && !isOpenCodeGoConnected ? (
                <div className="space-y-2 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] p-3 text-[11.5px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-[var(--xd-ink)]">
                      {openCodeHasFreeModels
                        ? 'Free models ready — sign in for OpenCode Go'
                        : 'Sign in via OpenCode CLI'}
                    </p>
                    {onRefreshOpenCodeGo && (
                      <button
                        type="button"
                        disabled={Boolean(openCodeGoBusy)}
                        onClick={onRefreshOpenCodeGo}
                        className="inline-flex h-7 items-center gap-1.5 rounded bg-[var(--xd-accent)] px-2.5 text-[11.5px] font-medium text-white hover:bg-[var(--xd-accent-hover)] disabled:opacity-45"
                      >
                        <RefreshCw
                          className={cn(
                            'size-3',
                            openCodeGoBusy === 'refresh' && 'animate-spin',
                          )}
                        />
                        <span>Check login</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[var(--xd-ink-secondary)]">
                    {openCodeHasFreeModels ? (
                      <>
                        OpenCode free models are usable right away with no
                        login. To also unlock{' '}
                        <span className="font-medium text-[var(--xd-ink)]">
                          OpenCode Go
                        </span>{' '}
                        models, run the command below and click{' '}
                        <span className="font-medium text-[var(--xd-ink)]">
                          Check login
                        </span>
                        :
                      </>
                    ) : (
                      <>
                        OpenCode CLI was detected, but no active OpenCode Go
                        login was found. Run the command below in your terminal,
                        choose{' '}
                        <span className="font-medium text-[var(--xd-ink)]">
                          OpenCode Go
                        </span>
                        , then click{' '}
                        <span className="font-medium text-[var(--xd-ink)]">
                          Check login
                        </span>
                        :
                      </>
                    )}
                  </p>
                  <pre className="xd-mono overflow-x-auto rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2.5 py-1.5 text-[11px] text-[var(--xd-ink)]">
                    opencode auth login
                  </pre>
                </div>
              ) : (
                <div className="rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2 text-[11.5px] text-[var(--xd-ink-secondary)]">
                  {openCodeIsHttpFallback ? (
                    <>
                      Using <span className="xd-mono">OPENCODE_API_KEY</span>{' '}
                      fallback because <span className="xd-mono">opencode</span>{' '}
                      is not on PATH. Install OpenCode CLI and run{' '}
                      <span className="xd-mono">opencode auth login</span> to
                      switch to ACP automatically.
                    </>
                  ) : (
                    <>
                      Credentials are managed by OpenCode CLI. Run{' '}
                      <span className="xd-mono">opencode auth list</span> or{' '}
                      <span className="xd-mono">opencode auth logout</span> in
                      your terminal to manage accounts, then click{' '}
                      <span className="font-medium text-[var(--xd-ink)]">
                        Refresh
                      </span>
                      .
                    </>
                  )}
                </div>
              )}
            </div>
          ) : isGrokBuild ? (
            <div className="space-y-3">
              <div className="rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] p-3 text-[12px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-medium text-[var(--xd-ink)]">
                    <ShieldCheck className="size-3.5 text-[var(--xd-commit)]" />
                    <span>
                      {grokBuildStatus?.agentName || 'Grok Build ACP'}
                      {grokBuildStatus?.agentVersion
                        ? ` v${grokBuildStatus.agentVersion}`
                        : ''}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium',
                      isGrokBuildConnected
                        ? 'bg-[var(--xd-commit-soft)] text-[var(--xd-commit)]'
                        : grokBuildBinaryAvailable
                          ? 'bg-[var(--xd-sketch-soft)] text-[var(--xd-sketch)]'
                          : 'bg-[var(--xd-danger-soft)] text-[var(--xd-danger)]',
                    )}
                  >
                    {isGrokBuildConnected ? (
                      <>
                        <CheckCircle2 className="size-3" />
                        <span>
                          Connected
                          {grokBuildStatus?.tier
                            ? ` · ${grokBuildStatus.tier}`
                            : grokBuildStatus?.authSource === 'xai.api_key'
                              ? ' · xAI API Key'
                              : ' · Grok Build ACP'}
                        </span>
                      </>
                    ) : grokBuildBinaryAvailable ? (
                      <span>Sign in required</span>
                    ) : (
                      <span>Grok CLI not installed</span>
                    )}
                  </span>
                </div>

                <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--xd-ink-secondary)]">
                  Communicates directly with SpaceXSI’s local{' '}
                  <span className="xd-mono">grok</span> CLI over Agent Client
                  Protocol (
                  <span className="xd-mono">
                    grok --no-auto-update agent stdio
                  </span>
                  , JSON-RPC 2.0 <span className="xd-mono">stdio</span>) using
                  Grok’s own credential store from{' '}
                  <span className="xd-mono">grok login</span> or{' '}
                  <span className="xd-mono">XAI_API_KEY</span>. xDrive never
                  reads <span className="xd-mono">auth.json</span> or stores xAI
                  credentials.
                </p>

                <div className="xd-mono mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-[var(--xd-ink-muted)]">
                  <span className="inline-flex items-center gap-1">
                    <Terminal className="size-3" />
                    {grokBuildStatus?.binaryPath || active.endpointUrl}
                  </span>
                  {grokBuildBinaryAvailable &&
                    grokBuildStatus?.binarySource &&
                    grokBuildStatus.binarySource !== 'none' && (
                      <span>source: {grokBuildStatus.binarySource}</span>
                    )}
                  {grokBuildStatus?.authenticated &&
                    grokBuildStatus.authSource !== 'none' && (
                      <span>auth: {grokBuildStatus.authSource}</span>
                    )}
                </div>
              </div>

              {(grokBuildError || grokBuildStatus?.error) && (
                <p className="flex items-start gap-1.5 rounded border border-[var(--xd-danger)]/35 bg-[var(--xd-danger-soft)] px-2.5 py-2 text-[11.5px] text-[var(--xd-danger)]">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{grokBuildError || grokBuildStatus?.error}</span>
                </p>
              )}

              {!grokBuildBinaryAvailable ? (
                <div className="space-y-2 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] p-3 text-[11.5px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-[var(--xd-ink)]">
                      Set up Grok Build CLI (ACP)
                    </p>
                    {onRefreshGrokBuild && (
                      <button
                        type="button"
                        disabled={Boolean(grokBuildBusy)}
                        onClick={onRefreshGrokBuild}
                        className="inline-flex h-7 items-center gap-1.5 rounded bg-[var(--xd-accent)] px-2.5 text-[11.5px] font-medium text-white hover:bg-[var(--xd-accent-hover)] disabled:opacity-45"
                      >
                        <RefreshCw
                          className={cn(
                            'size-3',
                            grokBuildBusy === 'refresh' && 'animate-spin',
                          )}
                        />
                        <span>Detect CLI</span>
                      </button>
                    )}
                  </div>
                  <ol className="list-decimal space-y-1.5 pl-4 text-[var(--xd-ink-secondary)]">
                    <li>
                      Install the <span className="xd-mono">grok</span> CLI (or
                      set <span className="xd-mono">XDRIVE_GROK_BIN</span> in{' '}
                      <span className="xd-mono">.env.local</span>).
                    </li>
                    <li>
                      Sign in with your Grok account (stored in Grok’s own
                      credential store):
                      <pre className="xd-mono mt-1 overflow-x-auto rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 py-1 text-[11px] text-[var(--xd-ink)]">
                        grok login
                      </pre>
                    </li>
                    <li>
                      Click{' '}
                      <span className="font-medium text-[var(--xd-ink)]">
                        Detect CLI
                      </span>{' '}
                      to connect over ACP. You can also set{' '}
                      <span className="xd-mono">XAI_API_KEY</span> in{' '}
                      <span className="xd-mono">.env.local</span> for API key
                      authentication.
                    </li>
                  </ol>
                </div>
              ) : !isGrokBuildConnected ? (
                <div className="space-y-2 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] p-3 text-[11.5px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-[var(--xd-ink)]">
                      Sign in via Grok CLI
                    </p>
                    {onRefreshGrokBuild && (
                      <button
                        type="button"
                        disabled={Boolean(grokBuildBusy)}
                        onClick={onRefreshGrokBuild}
                        className="inline-flex h-7 items-center gap-1.5 rounded bg-[var(--xd-accent)] px-2.5 text-[11.5px] font-medium text-white hover:bg-[var(--xd-accent-hover)] disabled:opacity-45"
                      >
                        <RefreshCw
                          className={cn(
                            'size-3',
                            grokBuildBusy === 'refresh' && 'animate-spin',
                          )}
                        />
                        <span>Check login</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[var(--xd-ink-secondary)]">
                    Grok CLI was detected, but no cached sign-in or{' '}
                    <span className="xd-mono">XAI_API_KEY</span> was found. Run
                    the command below in your terminal, then click{' '}
                    <span className="font-medium text-[var(--xd-ink)]">
                      Check login
                    </span>
                    :
                  </p>
                  <pre className="xd-mono overflow-x-auto rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2.5 py-1.5 text-[11px] text-[var(--xd-ink)]">
                    grok login
                  </pre>
                </div>
              ) : (
                <div className="rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2 text-[11.5px] text-[var(--xd-ink-secondary)]">
                  Credentials are managed by the Grok CLI. Run{' '}
                  <span className="xd-mono">grok login</span> or{' '}
                  <span className="xd-mono">grok logout</span> in your terminal
                  to manage accounts, then click{' '}
                  <span className="font-medium text-[var(--xd-ink)]">
                    Refresh
                  </span>
                  .
                </div>
              )}
            </div>
          ) : (
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
                      placeholder={
                        active.maskedCredential ?? 'Paste API key...'
                      }
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
          )}

          {/* Models list */}
          <div className="space-y-3">
            {standardActiveModels.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-[11.5px] font-medium text-[var(--xd-ink-muted)]">
                  {isAntigravity && isAuthenticated
                    ? `Plan models from Antigravity ACP (${standardActiveModels.length})`
                    : isOpenCodeGo &&
                        isOpenCodeGoConnected &&
                        !openCodeIsHttpFallback
                      ? `OpenCode Go models (${standardActiveModels.length})`
                      : isOpenCodeGo
                        ? `OpenCode Go catalog (${standardActiveModels.length})`
                        : isGrokBuild && isGrokBuildConnected
                          ? `Grok Build ACP models (${standardActiveModels.length})`
                          : isGrokBuild
                            ? `Grok Build catalog (${standardActiveModels.length})`
                            : 'Available models'}
                </h4>
                <ul className="divide-y divide-[var(--xd-border)] rounded border border-[var(--xd-border)]">
                  {standardActiveModels.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[12px]"
                    >
                      <div className="min-w-0">
                        <span className="block truncate font-medium">
                          {item.name}
                        </span>
                        {item.recommendedFor && (
                          <span className="block truncate text-[10.5px] text-[var(--xd-ink-muted)]">
                            {item.recommendedFor}
                          </span>
                        )}
                      </div>
                      <span className="xd-mono shrink-0 text-[11px] text-[var(--xd-ink-muted)]">
                        {item.contextWindow} · {item.role}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {freeActiveModels.length > 0 && (
              <div data-settings-models-section="free">
                <div className="mb-1.5 flex items-center gap-2">
                  <h4 className="text-[11.5px] font-medium text-[var(--xd-ink-muted)]">
                    Free ({freeActiveModels.length})
                  </h4>
                  <span className="rounded border border-[var(--xd-commit)]/35 bg-[var(--xd-commit-soft)] px-1.5 py-px text-[10px] leading-none font-medium text-[var(--xd-commit)]">
                    No login required
                  </span>
                </div>
                <ul className="divide-y divide-[var(--xd-border)] rounded border border-[var(--xd-border)]">
                  {freeActiveModels.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[12px]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium">
                            {stripOpenCodeFreeDisplaySuffix(item.name)}
                          </span>
                          <span
                            data-model-free-badge="true"
                            className="shrink-0 rounded border border-[var(--xd-commit)]/35 bg-[var(--xd-commit-soft)] px-1 py-px text-[10px] leading-none font-medium text-[var(--xd-commit)]"
                          >
                            Free
                          </span>
                        </div>
                        {item.recommendedFor && (
                          <span className="block truncate text-[10.5px] text-[var(--xd-ink-muted)]">
                            {item.recommendedFor}
                          </span>
                        )}
                      </div>
                      <span className="xd-mono shrink-0 text-[11px] text-[var(--xd-ink-muted)]">
                        {item.contextWindow} · {item.role}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Role assignments */}
      <div className="border-t border-[var(--xd-border)] bg-[var(--xd-rail)]/40 px-4 py-3">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {ROLE_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1">
              <span className="block text-[11px] font-medium text-[var(--xd-ink-secondary)]">
                {field.label}
              </span>
              <ModelPicker
                models={rolePickerModels}
                selectedModelId={roles[field.key]}
                onSelectModel={(nextModelId) =>
                  commit(subscriptions, {
                    ...roles,
                    [field.key]: nextModelId,
                  })
                }
                favoriteModelIds={favoriteModelIds}
                onFavoriteModelIdsChange={onFavoriteModelIdsChange}
                variant="field"
                size="sm"
                side="top"
                align="start"
                ariaLabel={field.label}
              />
            </div>
          ))}
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
