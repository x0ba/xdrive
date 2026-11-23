// Browser-side client helpers for Google Antigravity ACP (/api/ai).

import type { AIModelSpec, AISubscription } from '#/lib/types'
import type {
  AntigravityAuthMethodId,
  AntigravityModelOption,
  AntigravityRuntimeStatus,
} from './antigravity-types'
import { toXDriveAntigravityModelId } from './antigravity-types'

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
        : `Antigravity request failed (HTTP ${response.status})`
    throw new Error(message)
  }
  return raw as T
}

export async function fetchAntigravityStatus(): Promise<AntigravityRuntimeStatus> {
  const response = await fetch('/api/ai', {
    method: 'GET',
    headers: { accept: 'application/json' },
  })
  return await readJsonOrThrow<AntigravityRuntimeStatus>(response)
}

export async function authenticateAntigravity(
  methodId: AntigravityAuthMethodId | string,
  options?: { apiKey?: string },
): Promise<AntigravityRuntimeStatus> {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      action: 'authenticate',
      methodId,
      apiKey: options?.apiKey,
    }),
  })
  return await readJsonOrThrow<AntigravityRuntimeStatus>(response)
}

export async function logoutAntigravity(): Promise<AntigravityRuntimeStatus> {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ action: 'logout' }),
  })
  return await readJsonOrThrow<AntigravityRuntimeStatus>(response)
}

export async function installAntigravityBinary(): Promise<AntigravityRuntimeStatus> {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ action: 'install_binary' }),
  })
  return await readJsonOrThrow<AntigravityRuntimeStatus>(response)
}

function inferRole(model: AntigravityModelOption): AIModelSpec['role'] {
  const text = `${model.id} ${model.name}`.toLowerCase()
  if (text.includes('flash') || text.includes('lite')) return 'exploration'
  if (text.includes('ultra') || text.includes('thinking') || text.includes('neon')) {
    return 'reasoning'
  }
  if (text.includes('argon') || text.includes('design')) return 'design'
  return 'implementation'
}

function inferSpeedTier(model: AntigravityModelOption): AIModelSpec['speedTier'] {
  const text = `${model.id} ${model.name}`.toLowerCase()
  if (text.includes('lite')) return 'instant'
  if (text.includes('flash')) return 'fast'
  return 'deep'
}

export function antigravityModelsToSpecs(
  models: AntigravityModelOption[],
  supportsImagePrompt = true,
): AIModelSpec[] {
  return models.map((model) => ({
    id: toXDriveAntigravityModelId(model.id),
    name: model.name,
    providerId: 'antigravity',
    badge: 'Antigravity',
    role: inferRole(model),
    contextWindow: '1M',
    speedTier: inferSpeedTier(model),
    supportsVisionSketch: supportsImagePrompt,
    recommendedFor: model.description || 'Google AI plan via Antigravity ACP',
  }))
}

export function applyAntigravityStatusToSubscriptions<
  T extends AISubscription & { models: Array<AIModelSpec & { promptLabel?: string }> },
>(subscriptions: T[], status: AntigravityRuntimeStatus): T[] {
  const liveSpecs =
    status.authenticated && status.models.length > 0
      ? antigravityModelsToSpecs(status.models, status.supportsImagePrompt)
      : status.authenticated
        ? [
            {
              id: 'antigravity/default',
              name: 'Antigravity Default (Google AI Plan)',
              providerId: 'antigravity' as const,
              badge: 'Antigravity',
              role: 'implementation' as const,
              contextWindow: '1M',
              speedTier: 'deep' as const,
              supportsVisionSketch: status.supportsImagePrompt,
              recommendedFor: 'Active model from your Google AI plan',
            },
          ]
        : null

  const defaultModelId = status.currentModelId
    ? toXDriveAntigravityModelId(status.currentModelId)
    : liveSpecs?.[0]?.id

  return subscriptions.map((sub) => {
    if (sub.providerId !== 'antigravity') return sub
    const nextModels = liveSpecs
      ? liveSpecs.map((spec) => ({
          ...spec,
          promptLabel: `Antigravity · ${spec.name}`,
        }))
      : sub.models

    const planName =
      status.tier ||
      (status.activeAuthMethod === 'oauth-business'
        ? 'Gemini Enterprise'
        : status.activeAuthMethod === 'gemini-api-key'
          ? 'Gemini API Key'
          : status.activeAuthMethod === 'agent-platform'
            ? 'Vertex AI / ADC'
            : 'Google AI Plan')

    return {
      ...sub,
      connected: status.authenticated,
      status: status.authenticated ? 'active' : 'disconnected',
      planName,
      authMethod: 'antigravity_acp',
      endpointUrl: status.binaryPath || 'agy acp (JSON-RPC stdio)',
      defaultModelId: defaultModelId || sub.defaultModelId,
      models: nextModels,
    }
  })
}
