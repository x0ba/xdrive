// Shared isomorphic types and helpers for Grok Build (SpaceXSI's `grok` CLI)
// Agent Client Protocol (ACP) integration in xDrive.
//
// Communicates directly with the local `grok` CLI over standard ACP
// (`grok --no-auto-update agent stdio`, JSON-RPC 2.0 over stdio using
// `@agentclientprotocol/sdk`). Authentication uses Grok Build's own credential
// store (`grok login` -> `cached_token`) or `XAI_API_KEY` (`xai.api_key`);
// xDrive never reads `~/.grok/auth.json` or stores any xAI API key.

export type GrokBuildBinarySource = 'custom' | 'grok-cli' | 'none'

export type GrokBuildAuthSource = 'cached_token' | 'xai.api_key' | 'none'

export interface GrokBuildAuthMethodInfo {
  id: string
  name: string
  description?: string | null
}

export interface GrokBuildConfigSelectChoice {
  value: string
  name: string
  description?: string | null
}

export interface GrokBuildConfigOption {
  id: string
  name: string
  description?: string | null
  category?: string | null
  currentValue: string
  options: GrokBuildConfigSelectChoice[]
}

export interface GrokBuildComplianceInfo {
  protocol: 'ACP (JSON-RPC 2.0 over stdio)'
  cliAuthStoreOnly: boolean
  keyStoredInXDrive: false
}

export interface GrokBuildModelOption {
  id: string
  name: string
  description?: string | null
  contextWindow: number
  contextWindows?: number[]
  supportsVision: boolean
  reasoning: boolean
  reasoningEfforts?: string[]
  defaultReasoningEffort?: string | null
  isDefault?: boolean
}

export interface GrokBuildRuntimeStatus {
  ok: boolean
  binaryAvailable: boolean
  binarySource: GrokBuildBinarySource
  binaryPath?: string
  agentName?: string
  agentVersion?: string
  protocolVersion?: number
  grokShell?: boolean
  authenticated: boolean
  activeAuthMethod?: string | null
  authSource: GrokBuildAuthSource
  authMethods: GrokBuildAuthMethodInfo[]
  tier?: string | null
  models: GrokBuildModelOption[]
  currentModelId?: string | null
  configOptions?: GrokBuildConfigOption[]
  supportsImagePrompt: boolean
  compliance: GrokBuildComplianceInfo
  error?: string
}

export const GROK_BUILD_MODEL_PREFIX = 'grok-build/'

export function toXDriveGrokBuildModelId(rawModelId: string): string {
  return rawModelId.startsWith(GROK_BUILD_MODEL_PREFIX)
    ? rawModelId
    : `${GROK_BUILD_MODEL_PREFIX}${rawModelId}`
}

export function fromXDriveGrokBuildModelId(modelId: string): string {
  return modelId.startsWith(GROK_BUILD_MODEL_PREFIX)
    ? modelId.slice(GROK_BUILD_MODEL_PREFIX.length)
    : modelId
}

export function isGrokBuildModelId(modelId: string): boolean {
  return modelId.startsWith(GROK_BUILD_MODEL_PREFIX)
}

// Curated fallback catalog mirroring Grok Build CLI's default `modelState`
// so the UI has accurate model metadata before live ACP discovery or offline.
export const DEFAULT_GROK_BUILD_MODELS: GrokBuildModelOption[] = [
  {
    id: 'grok-4.7',
    name: 'Grok 4.7',
    description: "SpaceXAI's latest frontier model",
    contextWindow: 256_000,
    contextWindows: [256_000, 500_000],
    supportsVision: true,
    reasoning: true,
    reasoningEfforts: ['xhigh', 'high', 'medium', 'low'],
    defaultReasoningEffort: 'high',
    isDefault: true,
  },
  {
    id: 'grok-4.7-build-fast',
    name: 'Grok 4.7 Fast',
    description: 'Fast variant for low-latency coding and edits',
    contextWindow: 256_000,
    contextWindows: [256_000, 500_000],
    supportsVision: true,
    reasoning: true,
    reasoningEfforts: ['xhigh', 'high', 'medium', 'low'],
    defaultReasoningEffort: 'high',
  },
  {
    id: 'grok-4.6',
    name: 'Grok 4.6',
    description: 'Grok Build coding and reasoning model',
    contextWindow: 256_000,
    contextWindows: [256_000, 500_000],
    supportsVision: true,
    reasoning: true,
    reasoningEfforts: ['xhigh', 'high', 'medium', 'low'],
    defaultReasoningEffort: 'high',
  },
  {
    id: 'grok-4.5',
    name: 'Grok 4.5',
    description: 'General-purpose Grok Build model',
    contextWindow: 256_000,
    contextWindows: [256_000, 500_000],
    supportsVision: true,
    reasoning: true,
    reasoningEfforts: ['high', 'medium', 'low'],
    defaultReasoningEffort: 'high',
  },
]
