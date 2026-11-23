// Browser-side client helpers for OpenCode Go (/api/ai).

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
        : `OpenCode Go request failed (HTTP ${response.status})`
    throw new Error(message)
  }
  return raw as T
}

export async function fetchOpenCodeGoStatus(): Promise<OpenCodeGoRuntimeStatus> {
  const response = await fetch('/api/ai?provider=opencode-go', {
    method: 'GET',
    headers: { accept: 'application/json' },
  })
  return await readJsonOrThrow<OpenCodeGoRuntimeStatus>(response)
}

export async function authenticateOpenCodeGo(options?: {
  apiKey?: string
}): Promise<OpenCodeGoRuntimeStatus> {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      action: 'authenticate',
      providerId: 'opencode-go',
      apiKey: options?.apiKey,
    }),
  })
  return await readJsonOrThrow<OpenCodeGoRuntimeStatus>(response)
}

export async function logoutOpenCodeGo(): Promise<OpenCodeGoRuntimeStatus> {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      action: 'logout',
      providerId: 'opencode-go',
    }),
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

function inferSpeedTier(model: OpenCodeGoModelOption): AIModelSpec['speedTier'] {
  const text = `${model.id} ${model.name}`.toLowerCase()
  if (text.includes('flash')) return 'fast'
  if (text.includes('haiku')) return 'fast'
  return 'deep'
}

export function openCodeGoModelsToSpecs(
  models: OpenCodeGoModelOption[],
): AIModelSpec[] {
  return models.map((model) => ({
    id: toXDriveOpenCodeGoModelId(model.id),
    name: model.name,
    providerId: 'opencode-go',
    badge: 'OpenCode Go',
    role: inferRole(model),
    contextWindow: formatContextWindow(model.contextWindow),
    speedTier: inferSpeedTier(model),
    supportsVisionSketch: model.supportsVision,
    recommendedFor:
      model.description ||
      `OpenCode Go (${model.apiProtocol})`,
  }))
}

export function applyOpenCodeGoStatusToSubscriptions<
  T extends AISubscription & {
    models: Array<AIModelSpec & { promptLabel?: string }>
  },
>(subscriptions: T[], status: OpenCodeGoRuntimeStatus): T[] {
  const isConnected = status.authenticated && status.entitled
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
          promptLabel: `OpenCode Go · ${spec.name}`,
        }))
      : sub.models

    const nextStatus: AISubscription['status'] = !isConnected
      ? 'disconnected'
      : status.rateLimited
        ? 'rate_limited'
        : 'active'

    return {
      ...sub,
      connected: isConnected,
      status: nextStatus,
      planName: isConnected ? 'Go' : 'Go Subscription',
      authMethod: 'api_key',
      maskedCredential: status.maskedKey ?? undefined,
      endpointUrl: status.endpointBaseUrl || sub.endpointUrl,
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
