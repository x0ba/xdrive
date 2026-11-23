// Shared isomorphic types for Google Antigravity (ACP) integration in xDrive.
// Uses the official Agent Client Protocol (JSON-RPC 2.0 over stdio) with the
// unmodified official Antigravity ACP runtime (`agy acp` or ACP Registry binary)
// and native Google OAuth / Gemini Enterprise / API Key authentication.

export type AntigravityAuthMethodId =
  | 'oauth-personal'
  | 'oauth-business'
  | 'gemini-api-key'
  | 'agent-platform'

export interface AntigravityAuthMethodInfo {
  id: string
  name: string
  description?: string | null
}

export interface AntigravityModelOption {
  id: string
  name: string
  description?: string | null
  isDefault?: boolean
}

export interface AntigravityConfigSelectChoice {
  value: string
  name: string
  description?: string | null
}

export interface AntigravityConfigOption {
  id: string
  name: string
  description?: string | null
  category?: string | null
  currentValue: string
  options: AntigravityConfigSelectChoice[]
}

export type AntigravityBinarySource =
  | 'custom'
  | 'agy-cli'
  | 'acp-registry'
  | 'none'

export interface AntigravityComplianceInfo {
  protocol: 'ACP (JSON-RPC 2.0 over stdio)'
  unmodifiedOfficialBinary: boolean
  nativeAuthOnly: boolean
  tokenExtraction: false
}

export interface AntigravityRuntimeStatus {
  ok: boolean
  binaryAvailable: boolean
  binarySource: AntigravityBinarySource
  binaryPath?: string
  agentName?: string
  agentVersion?: string
  protocolVersion?: number
  authenticated: boolean
  activeAuthMethod?: string | null
  authMethods: AntigravityAuthMethodInfo[]
  tier?: string | null
  models: AntigravityModelOption[]
  currentModelId?: string | null
  configOptions?: AntigravityConfigOption[]
  supportsLogout: boolean
  supportsImagePrompt: boolean
  compliance: AntigravityComplianceInfo
  error?: string
}

export const ANTIGRAVITY_MODEL_PREFIX = 'antigravity/'

export function toXDriveAntigravityModelId(acpModelId: string): string {
  return acpModelId.startsWith(ANTIGRAVITY_MODEL_PREFIX)
    ? acpModelId
    : `${ANTIGRAVITY_MODEL_PREFIX}${acpModelId}`
}

export function fromXDriveAntigravityModelId(modelId: string): string {
  return modelId.startsWith(ANTIGRAVITY_MODEL_PREFIX)
    ? modelId.slice(ANTIGRAVITY_MODEL_PREFIX.length)
    : modelId
}
