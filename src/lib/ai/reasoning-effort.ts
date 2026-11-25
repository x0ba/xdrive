// Shared collaborate payload so Antigravity, OpenCode, and Grok Build
// receive the same reasoningEffort the prompt bar selected.

import type { ReasoningEffort } from './drive-chat-types'
import { parseReasoningEffort } from './drive-chat-types'

export const COLLABORATE_ACP_PROVIDERS = [
  'antigravity',
  'opencode-go',
  'grok-build',
] as const

export type CollaborateAcpProvider = (typeof COLLABORATE_ACP_PROVIDERS)[number]

export interface CollaborateProviderPrompt {
  providerId: CollaborateAcpProvider
  prompt: string
  modelId: string
  reasoningEffort?: ReasoningEffort
  sessionId?: string
  imageDataUrls?: string[]
}

export function collaborateProviderPrompt(input: {
  providerId: CollaborateAcpProvider
  prompt: string
  modelId: string
  reasoningEffort?: unknown
  sessionId?: string
  imageDataUrls?: string[]
}): CollaborateProviderPrompt {
  const reasoningEffort = parseReasoningEffort(input.reasoningEffort)
  return {
    providerId: input.providerId,
    prompt: input.prompt,
    modelId: input.modelId,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.imageDataUrls && input.imageDataUrls.length > 0
      ? { imageDataUrls: input.imageDataUrls }
      : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
  }
}
