// Browser-side client helpers for OpenCode ACP / OpenCode Go (/api/ai).

import type { AIModelSpec, AISubscription } from '#/lib/types'
import {
  formatContextWindow,
  toXDriveOpenCodeGoModelId,
} from './opencode-go-types'
import type {
  OpenCodeGoModelOption,
  OpenCodeGoRuntimeStatus,
} from './opencode-go-types'

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  const raw: unknown = await response.json()
  const record =
    raw && typeof raw === 'object'
      ? (raw as { ok?: unknown; error?: unknown })
      : null
  if (!response.ok || record?.ok === false) {
    const message =
      typeof record?.error === 'string' && record.error
        ? record.error
        : `OpenCode request failed (HTTP ${response.status})`
    throw new Error(message)
  }
  return raw as T
}

export async function fetchOpenCodeGoStatus(
  refresh = false,
): Promise<OpenCodeGoRuntimeStatus> {
  const query = refresh
    ? '/api/ai?provider=opencode-go&refresh=1'
    : '/api/ai?provider=opencode-go'
  const response = await fetch(query, {
    method: 'GET',
    headers: { accept: 'application/json' },
  })
  return await readJsonOrThrow<OpenCodeGoRuntimeStatus>(response)
}

function inferRole(model: OpenCodeGoModelOption): AIModelSpec['role'] {
  const text = `${model.id} ${model.name}`.toLowerCase()
  if (text.includes('flash') || text.includes('mini')) return 'exploration'
  if (text.includes('haiku')) return 'review'
  if (text.includes('argon') || text.includes('design')) return 'design'
  if (
    text.includes('pro') ||
    text.includes('max') ||
    text.includes('grok') ||
    text.includes('gpt-6')
  ) {
    return 'reasoning'
  }
  return 'implementation'
}

function inferSpeedTier(
  model: OpenCodeGoModelOption,
): AIModelSpec['speedTier'] {
  const text = `${model.id} ${model.name}`.toLowerCase()
  if (text.includes('flash')) return 'fast'
  if (text.includes('haiku')) return 'fast'
  return 'deep'
}

export function hasOpenCodeFreeModels(
  status: OpenCodeGoRuntimeStatus,
): boolean {
  return (
    status.transport === 'acp' &&
    status.binaryAvailable &&
    status.models.some((model) => Boolean(model.isFree))
  )
}

export function isOpenCodeUsable(status: OpenCodeGoRuntimeStatus): boolean {
  return (
    (status.authenticated && status.entitled) || hasOpenCodeFreeModels(status)
  )
}

export function openCodeGoModelsToSpecs(
  models: OpenCodeGoModelOption[],
): AIModelSpec[] {
  return models.map((model) => ({
    id: toXDriveOpenCodeGoModelId(model.id),
    name: model.name,
    providerId: 'opencode-go',
    badge: model.isFree
      ? 'Free'
      : model.apiProtocol === 'acp'
        ? 'OpenCode ACP'
        : 'OpenCode Go',
    role: inferRole(model),
    contextWindow: formatContextWindow(model.contextWindow),
    speedTier: inferSpeedTier(model),
    supportsVisionSketch: model.supportsVision,
    recommendedFor:
      model.description ||
      (model.isFree
        ? 'Free model via local OpenCode ACP'
        : model.apiProtocol === 'acp'
          ? 'OpenCode Go via local OpenCode ACP'
          : `OpenCode Go (${model.apiProtocol})`),
    ...(model.isFree ? { isFree: true } : {}),
  }))
}

export function applyOpenCodeGoStatusToSubscriptions<
  T extends AISubscription & {
    models: Array<AIModelSpec & { promptLabel?: string }>
  },
>(subscriptions: T[], status: OpenCodeGoRuntimeStatus): T[] {
  const hasPaidAccess = status.authenticated && status.entitled
  const hasFreeAccess = hasOpenCodeFreeModels(status)
  const isConnected = hasPaidAccess || hasFreeAccess
  const liveSpecs =
    status.models.length > 0 ? openCodeGoModelsToSpecs(status.models) : null

  const defaultModelId = status.currentModelId
    ? toXDriveOpenCodeGoModelId(status.currentModelId)
    : liveSpecs?.[0]?.id

  return subscriptions.map((sub) => {
    if (sub.providerId !== 'opencode-go') return sub
    const nextModels = liveSpecs
      ? liveSpecs.map((spec) => ({
          ...spec,
          promptLabel: spec.isFree
            ? `OpenCode Free · ${spec.name}`
            : `OpenCode Go · ${spec.name}`,
        }))
      : sub.models

    const nextStatus: AISubscription['status'] = !isConnected
      ? 'disconnected'
      : status.rateLimited
        ? 'rate_limited'
        : 'active'

    const isHttpFallback = status.transport === 'http-fallback'
    const planName = isHttpFallback
      ? hasPaidAccess
        ? 'Go (HTTP fallback)'
        : 'Go Subscription'
      : hasPaidAccess
        ? 'OpenCode ACP'
        : hasFreeAccess
          ? 'OpenCode Free (ACP)'
          : 'OpenCode CLI'

    return {
      ...sub,
      connected: isConnected,
      status: nextStatus,
      planName,
      authMethod: isHttpFallback ? 'api_key' : 'opencode_acp',
      maskedCredential: isHttpFallback
        ? (status.maskedKey ?? undefined)
        : undefined,
      endpointUrl:
        status.binaryPath ||
        (isHttpFallback
          ? status.endpointBaseUrl
          : 'opencode acp (JSON-RPC stdio)'),
      defaultModelId: defaultModelId || sub.defaultModelId,
      usageThisMonth: {
        ...sub.usageThisMonth,
        quotaPercent:
          status.usage?.monthly?.percent ?? sub.usageThisMonth.quotaPercent,
      },
      models: nextModels,
    }
  })
}
