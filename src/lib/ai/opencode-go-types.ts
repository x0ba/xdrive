// Shared isomorphic types and helpers for OpenCode Go integration in xDrive.
// Uses the official OpenCode Go inference endpoints (`https://opencode.ai/inference/go`),
// authenticating with a personal or service-account OpenCode API key
// (`OPENCODE_API_KEY` or entered in Models & Providers) and sending a stable
// `x-opencode-session` header plus custom `User-Agent` per OpenCode Go guidelines.

export type OpenCodeGoApiProtocol =
  | 'chat-completions'
  | 'responses'
  | 'messages'
  | 'generate-content'

export type OpenCodeGoKeySource = 'env' | 'runtime' | 'none'

export interface OpenCodeGoModelOption {
  id: string
  name: string
  description?: string | null
  family?: string | null
  contextWindow: number
  outputLimit?: number
  supportsVision: boolean
  reasoning: boolean
  reasoningEfforts?: string[]
  featured?: boolean
  apiProtocol: OpenCodeGoApiProtocol
  baseUrl: string
  monthlyUsage?: {
    go?: number
    goPlus?: number
    goTeams?: number
  }
}

export interface OpenCodeGoUsageMeter {
  status: 'ok' | 'rate-limited'
  percent: number
  resetsAt: string
}

export interface OpenCodeGoUsageSummary {
  rolling?: OpenCodeGoUsageMeter
  weekly?: OpenCodeGoUsageMeter
  monthly?: OpenCodeGoUsageMeter
}

export interface OpenCodeGoRuntimeStatus {
  ok: boolean
  authenticated: boolean
  entitled: boolean
  keySource: OpenCodeGoKeySource
  maskedKey?: string | null
  endpointBaseUrl: string
  models: OpenCodeGoModelOption[]
  currentModelId?: string | null
  usage?: OpenCodeGoUsageSummary | null
  rateLimited: boolean
  error?: string
}

export const OPENCODE_GO_MODEL_PREFIX = 'opencode-go/'
export const OPENCODE_GO_ENDPOINT_BASE_URL = 'https://opencode.ai/inference/go'

export function toXDriveOpenCodeGoModelId(rawModelId: string): string {
  return rawModelId.startsWith(OPENCODE_GO_MODEL_PREFIX)
    ? rawModelId
    : `${OPENCODE_GO_MODEL_PREFIX}${rawModelId}`
}

export function fromXDriveOpenCodeGoModelId(modelId: string): string {
  return modelId.startsWith(OPENCODE_GO_MODEL_PREFIX)
    ? modelId.slice(OPENCODE_GO_MODEL_PREFIX.length)
    : modelId
}

export function formatContextWindow(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return '128K'
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000
    return Number.isInteger(millions) || Math.abs(millions - 1) < 0.08
      ? `${Math.round(millions)}M`
      : `${millions.toFixed(1)}M`
  }
  return `${Math.round(tokens / 1000)}K`
}

// Curated fallback catalog matching `https://opencode.ai/inference/go/v1/models`
// so the UI has accurate model metadata before the live catalog loads or offline.
export const DEFAULT_OPENCODE_GO_MODELS: OpenCodeGoModelOption[] = [
  {
    id: 'glm-5.3',
    name: 'GLM-5.3',
    description: 'High-allowance OpenCode Go flagship for coding and editing',
    family: 'glm',
    contextWindow: 1_000_000,
    outputLimit: 131_072,
    supportsVision: false,
    reasoning: true,
    reasoningEfforts: ['low', 'high', 'max'],
    featured: true,
    apiProtocol: 'chat-completions',
    baseUrl: 'https://opencode.ai/inference/go/openai/v1',
    monthlyUsage: { go: 200, goPlus: 800, goTeams: 205 },
  },
  {
    id: 'kimi-k3.1-pro',
    name: 'Kimi K3.1 Pro',
    description: 'Multimodal frontier reasoning and agentic editing via Go',
    family: 'kimi-pro',
    contextWindow: 1_048_576,
    outputLimit: 131_072,
    supportsVision: true,
    reasoning: true,
    reasoningEfforts: ['low', 'high', 'max'],
    featured: true,
    apiProtocol: 'chat-completions',
    baseUrl: 'https://opencode.ai/inference/go/openai/v1',
    monthlyUsage: { go: 15, goPlus: 60, goTeams: 20 },
  },
  {
    id: 'deepseek-v4.1-flash',
    name: 'DeepSeek V4.1 Flash',
    description: 'Fast reasoning, coding, and visual understanding via Go',
    family: 'deepseek-flash',
    contextWindow: 1_000_000,
    outputLimit: 131_072,
    supportsVision: true,
    reasoning: true,
    reasoningEfforts: ['low', 'high', 'max'],
    featured: true,
    apiProtocol: 'chat-completions',
    baseUrl: 'https://opencode.ai/inference/go/openai/v1',
    monthlyUsage: { go: 100, goPlus: 200, goTeams: 105 },
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    description: 'Design, multimodal sketches, and structured layout via Go',
    family: 'gemini',
    contextWindow: 1_048_576,
    outputLimit: 65_536,
    supportsVision: true,
    reasoning: true,
    featured: true,
    apiProtocol: 'generate-content',
    baseUrl: 'https://opencode.ai/inference/go/google/v1beta',
    monthlyUsage: { go: 30, goPlus: 120, goTeams: 35 },
  },
  {
    id: 'claude-haiku-5-5',
    name: 'Claude Haiku 5.5',
    description: 'Fast review, prose edits, and Anthropic-native tool precision',
    family: 'claude-haiku',
    contextWindow: 1_000_000,
    outputLimit: 128_000,
    supportsVision: true,
    reasoning: true,
    featured: true,
    apiProtocol: 'messages',
    baseUrl: 'https://opencode.ai/inference/go/anthropic/v1',
    monthlyUsage: { go: 15, goPlus: 60, goTeams: 20 },
  },
  {
    id: 'gpt-6-luna',
    name: 'GPT-6 Luna',
    description: 'OpenAI Responses API model included in OpenCode Go',
    family: 'gpt-luna',
    contextWindow: 1_050_000,
    outputLimit: 128_000,
    supportsVision: true,
    reasoning: true,
    featured: true,
    apiProtocol: 'responses',
    baseUrl: 'https://opencode.ai/inference/go/openai/v1',
    monthlyUsage: { go: 15, goPlus: 60, goTeams: 20 },
  },
  {
    id: 'qwen4-max',
    name: 'Qwen4 Max',
    description: 'High-capability coding and structured generation via Go',
    family: 'qwen-max',
    contextWindow: 1_000_000,
    outputLimit: 131_072,
    supportsVision: true,
    reasoning: true,
    featured: false,
    apiProtocol: 'messages',
    baseUrl: 'https://opencode.ai/inference/go/anthropic/v1',
    monthlyUsage: { go: 15, goPlus: 60, goTeams: 20 },
  },
  {
    id: 'grok-4.7',
    name: 'Grok 4.7',
    description: 'Reasoning and staged .mrbl edits via OpenCode Go',
    family: 'grok',
    contextWindow: 500_000,
    outputLimit: 131_072,
    supportsVision: true,
    reasoning: true,
    featured: false,
    apiProtocol: 'responses',
    baseUrl: 'https://opencode.ai/inference/go/openai/v1',
    monthlyUsage: { go: 15, goPlus: 60, goTeams: 20 },
  },
]
