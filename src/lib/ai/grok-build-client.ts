// Browser-side client helpers for Grok Build ACP (/api/ai?provider=grok-build).

import type { AIModelSpec, AISubscription } from '#/lib/types'
import { formatContextWindow } from './opencode-go-types'
import { toXDriveGrokBuildModelId } from './grok-build-types'
import type {
  GrokBuildModelOption,
  GrokBuildRuntimeStatus,
} from './grok-build-types'

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
        : `Grok Build request failed (HTTP ${response.status})`
    throw new Error(message)
  }
  return raw as T
}

export async function fetchGrokBuildStatus(
  refresh = false,
): Promise<GrokBuildRuntimeStatus> {
  const query = refresh
    ? '/api/ai?provider=grok-build&refresh=1'
    : '/api/ai?provider=grok-build'
  const response = await fetch(query, {
    method: 'GET',
    headers: { accept: 'application/json' },
  })
  return await readJsonOrThrow<GrokBuildRuntimeStatus>(response)
}

function inferRole(model: GrokBuildModelOption): AIModelSpec['role'] {
  const text = `${model.id} ${model.name}`.toLowerCase()
  if (text.includes('fast') || text.includes('mini')) return 'exploration'
  if (text.includes('4.7')) return 'reasoning'
  return 'implementation'
}

function inferSpeedTier(model: GrokBuildModelOption): AIModelSpec['speedTier'] {
  const text = `${model.id} ${model.name}`.toLowerCase()
  if (text.includes('fast') || text.includes('mini')) return 'fast'
  return 'deep'
}

export function grokBuildModelsToSpecs(
  models: GrokBuildModelOption[],
  supportsImagePrompt = true,
): AIModelSpec[] {
  return models.map((model) => ({
    id: toXDriveGrokBuildModelId(model.id),
    name: model.name,
    providerId: 'grok-build',
    badge: 'Grok Build',
    role: inferRole(model),
    contextWindow: formatContextWindow(model.contextWindow),
    speedTier: inferSpeedTier(model),
    supportsVisionSketch: supportsImagePrompt && model.supportsVision,
    recommendedFor: model.description || 'Grok Build via local Grok CLI ACP',
  }))
}

export function applyGrokBuildStatusToSubscriptions<
  T extends AISubscription & {
    models: Array<AIModelSpec & { promptLabel?: string }>
  },
>(subscriptions: T[], status: GrokBuildRuntimeStatus): T[] {
  const liveSpecs =
    status.models.length > 0
      ? grokBuildModelsToSpecs(status.models, status.supportsImagePrompt)
      : null

  const defaultModelId = status.currentModelId
    ? toXDriveGrokBuildModelId(status.currentModelId)
    : liveSpecs?.[0]?.id

  return subscriptions.map((sub) => {
    if (sub.providerId !== 'grok-build') return sub
    const nextModels = liveSpecs
      ? liveSpecs.map((spec) => ({
          ...spec,
          promptLabel: `Grok Build · ${spec.name}`,
        }))
      : sub.models

    const planName =
      status.tier ||
      (status.authSource === 'xai.api_key'
        ? 'xAI API Key'
        : status.authenticated
          ? 'Grok Build ACP'
          : 'Grok CLI')

    return {
      ...sub,
      connected: status.authenticated,
      status: status.authenticated ? 'active' : 'disconnected',
      planName,
      authMethod: 'grok_build_acp',
      endpointUrl: status.binaryPath || 'grok --no-auto-update agent stdio',
      defaultModelId: defaultModelId || sub.defaultModelId,
      models: nextModels,
    }
  })
}
