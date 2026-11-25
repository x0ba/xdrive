// Server-only OpenCode Agent Client Protocol (ACP) runtime and unified
// OpenCode dispatcher (ACP primary, OPENCODE_API_KEY direct-HTTP fallback
// only when the OpenCode CLI is unavailable).
//
// Architecture (mirrors antigravity-acp.server.ts):
// - Runs the local OpenCode CLI over standard ACP (`opencode acp`, JSON-RPC 2.0
//   over stdio using `@agentclientprotocol/sdk`).
// - Binary path is configurable via `XDRIVE_OPENCODE_BIN` (or `OPENCODE_ACP_BIN`),
//   defaulting to `opencode` on PATH or standard OpenCode install locations.
// - Relies exclusively on OpenCode's own credential store (`opencode auth login`);
//   xDrive never reads `auth.json` secrets and never persists any OpenCode API key
//   to disk, the Drive folder, or server memory.
// - Runs sessions inside an isolated scratch workspace in `os.tmpdir()` and
//   denies all tool/command permission requests.

import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { InitializeResponse } from '@agentclientprotocol/sdk/unstable'
import {
  AcpError,
  AcpProcessRuntime,
  acpScratchWorkspaceDir,
  isAcpAuthRequiredError,
  isExecutable,
  whichBinary,
} from './acp-runtime.server'
import type {
  AcpConfigOption,
  AcpErrorCode,
  AcpModelOption,
  AcpPromptInput,
  AcpPromptOutput,
  AcpSessionDiscovery,
  ResolvedAcpBinary,
} from './acp-runtime.server'
import { getOpenCodeGoManager } from './opencode-go.server'
import {
  DEFAULT_OPENCODE_GO_MODELS,
  OPENCODE_GO_ENDPOINT_BASE_URL,
  OPENCODE_GO_MODEL_PREFIX,
  formatOpenCodeModelDisplayName,
  fromXDriveOpenCodeGoModelId,
  toXDriveOpenCodeGoModelId,
} from './opencode-go-types'
import type {
  OpenCodeBinarySource,
  OpenCodeGoApiProtocol,
  OpenCodeGoModelOption,
  OpenCodeGoRuntimeStatus,
} from './opencode-go-types'

const execFileAsync = promisify(execFile)

const OPENCODE_ACP_COMPLIANCE = {
  protocol: 'ACP (JSON-RPC 2.0 over stdio)' as const,
  cliAuthStoreOnly: true,
  keyStoredInXDrive: false as const,
}

type ResolvedOpenCodeBinary = ResolvedAcpBinary<OpenCodeBinarySource>

export class OpenCodeAcpError extends AcpError {
  constructor(code: AcpErrorCode, message: string, httpStatus = 500) {
    super(code, message, httpStatus)
    this.name = 'OpenCodeAcpError'
  }
}

export type OpenCodeAcpPromptInput = AcpPromptInput
export type OpenCodeAcpPromptOutput = AcpPromptOutput

export interface OpenCodeUnifiedPromptInput {
  /** Direct prompt used for HTTP fallback (and for ACP if acpPrompt is omitted). */
  prompt: string
  /** Optional single-turn prompt with history/context for ACP sessions (e.g. Drive Chat). */
  acpPrompt?: string
  systemPrompt?: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  modelId?: string
  reasoningEffort?: 'off' | 'low' | 'medium' | 'high' | 'max'
  sessionId?: string
  imageDataUrls?: string[]
  signal?: AbortSignal
  idleTimeoutMs?: number
  maxDurationMs?: number
  onTextDelta?: (delta: string) => void
  onThoughtDelta?: (delta: string) => void
}

export interface OpenCodeUnifiedPromptOutput {
  transport: 'acp' | 'http-fallback'
  text: string
  thoughts: string[]
  stopReason: string
  modelId: string
  acpModelId?: string
  agentName: string
  agentVersion: string
  protocol: OpenCodeGoApiProtocol
}

interface OpenCodeAuthListInfo {
  supported: boolean
  hasCredentials: boolean
  hasOpenCodeAuth: boolean
  providers: string[]
}

function scratchWorkspaceDir(): string {
  return acpScratchWorkspaceDir('opencode')
}

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
}

function isStandaloneAcpBinary(filePath: string): boolean {
  return /^opencode-acp(\.exe)?$/i.test(path.basename(filePath))
}

export async function resolveOpenCodeBinary(): Promise<ResolvedOpenCodeBinary | null> {
  const custom =
    process.env.XDRIVE_OPENCODE_BIN?.trim() ||
    process.env.OPENCODE_ACP_BIN?.trim()
  if (custom) {
    const resolvedCustom = (await isExecutable(custom))
      ? custom
      : await whichBinary(custom)
    if (resolvedCustom) {
      const standalone = isStandaloneAcpBinary(resolvedCustom)
      return {
        source: 'custom',
        command: resolvedCustom,
        args: standalone ? [] : ['acp'],
        displayPath: standalone ? resolvedCustom : `${resolvedCustom} acp`,
      }
    }
  }

  const fromPath = await whichBinary('opencode')
  if (fromPath) {
    return {
      source: 'opencode-cli',
      command: fromPath,
      args: ['acp'],
      displayPath: `${fromPath} acp`,
    }
  }

  const home = os.homedir()
  const exe = process.platform === 'win32' ? '.exe' : ''
  const standardCandidates = [
    path.join(home, '.opencode', 'bin', `opencode${exe}`),
    `/opt/homebrew/bin/opencode${exe}`,
    `/usr/local/bin/opencode${exe}`,
    path.join(home, '.local', 'bin', `opencode${exe}`),
    path.join(home, '.bun', 'bin', `opencode${exe}`),
    path.join(home, '.npm-global', 'bin', `opencode${exe}`),
  ]
  for (const candidate of standardCandidates) {
    if (await isExecutable(candidate)) {
      return {
        source: 'opencode-cli',
        command: candidate,
        args: ['acp'],
        displayPath: `${candidate} acp`,
      }
    }
  }

  return null
}

// Inspects `opencode auth list` to see which providers OpenCode reports as
// authenticated in its own credential store. Never reads `auth.json` directly
// and never extracts any token or key.
async function inspectOpenCodeAuthList(
  binary: ResolvedOpenCodeBinary,
): Promise<OpenCodeAuthListInfo> {
  if (!binary.args.includes('acp')) {
    return {
      supported: false,
      hasCredentials: false,
      hasOpenCodeAuth: false,
      providers: [],
    }
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      binary.command,
      ['auth', 'list'],
      {
        timeout: 5000,
        env: { ...process.env, NO_COLOR: '1' },
      },
    )
    const combined = stripAnsi(`${stdout}\n${stderr}`)
    const lines = combined
      .split(/\r?\n/)
      .map((line) => line.replace(/^[│├└┌─\s●◆○•*-]+/, '').trim())
      .filter(Boolean)

    if (
      lines.some((line) =>
        /\b0\s+credentials?\b|no\s+credentials?|not\s+logged\s+in/i.test(line),
      )
    ) {
      return {
        supported: true,
        hasCredentials: false,
        hasOpenCodeAuth: false,
        providers: [],
      }
    }

    const providers: string[] = []
    for (const line of lines) {
      if (
        /^credentials\b/i.test(line) ||
        /^environment\b/i.test(line) ||
        /^~\/|^\/|^[A-Za-z]:\\/.test(line) ||
        /^\d+\s+credentials?$/i.test(line) ||
        /^\d+\s+environment\s+variables?$/i.test(line)
      ) {
        continue
      }
      // Lines in `opencode auth list` look like "OpenCode Go  api" or "opencode-go (api)".
      const cleaned = line
        .replace(/\s+\(?(api|oauth|wellknown|env|token)\)?$/i, '')
        .trim()
      if (cleaned && cleaned.length <= 64 && !providers.includes(cleaned)) {
        providers.push(cleaned)
      }
    }

    const hasOpenCodeAuth = providers.some((provider) =>
      /^opencode([-_\s]?go)?$/i.test(provider),
    )

    return {
      supported: true,
      hasCredentials: providers.length > 0,
      hasOpenCodeAuth,
      providers,
    }
  } catch {
    return {
      supported: false,
      hasCredentials: false,
      hasOpenCodeAuth: false,
      providers: [],
    }
  }
}

export function isFreeOpenCodeModel(
  model: Pick<AcpModelOption, 'id' | 'name'> | string,
): boolean {
  const id = (typeof model === 'string' ? model : model.id).trim().toLowerCase()
  const slug = id.includes('/') ? id.slice(id.indexOf('/') + 1) : id
  if (id.endsWith('-free') || id.endsWith(':free') || slug === 'big-pickle') {
    return true
  }
  if (typeof model !== 'string' && model.name) {
    if (/(?:^|[\s([/-])free[\])]*$/i.test(model.name.trim())) {
      return true
    }
  }
  return false
}

function getAcpModelSlug(acpModelId: string): string {
  const lower = acpModelId.trim().toLowerCase()
  const slashIdx = lower.indexOf('/')
  return slashIdx >= 0 ? lower.slice(slashIdx + 1) : lower
}

function freeModelProviderPriority(acpModelId: string): number {
  const lower = acpModelId.trim().toLowerCase()
  if (lower.startsWith('opencode/')) return 2
  if (lower.startsWith(OPENCODE_GO_MODEL_PREFIX)) return 1
  return 0
}

function dedupeFreeAcpModels(models: AcpModelOption[]): AcpModelOption[] {
  const selected: AcpModelOption[] = []
  const bySlug = new Map<string, number>()
  const byDisplayName = new Map<string, number>()

  for (const model of models) {
    const slug = getAcpModelSlug(model.id)
    const displayKey = formatOpenCodeModelDisplayName(
      model.id,
      model.name,
      true,
    ).toLowerCase()
    const existingIndex = bySlug.get(slug) ?? byDisplayName.get(displayKey)

    if (existingIndex !== undefined) {
      const existing = selected[existingIndex]
      if (
        freeModelProviderPriority(model.id) >
        freeModelProviderPriority(existing.id)
      ) {
        selected[existingIndex] = model
        bySlug.set(slug, existingIndex)
        byDisplayName.set(displayKey, existingIndex)
      }
      continue
    }

    const index = selected.length
    selected.push(model)
    bySlug.set(slug, index)
    byDisplayName.set(displayKey, index)
  }

  return selected
}

export function selectOpenCodeAcpModels(
  discoveryModels: AcpModelOption[],
  authInfo: OpenCodeAuthListInfo,
  hasEnvOpenCodeKey: boolean,
): {
  authenticated: boolean
  selectedAcpModels: AcpModelOption[]
} {
  const paidGoModels = discoveryModels.filter(
    (item) =>
      item.id.toLowerCase().startsWith(OPENCODE_GO_MODEL_PREFIX) &&
      !isFreeOpenCodeModel(item),
  )
  const nonFreeModels = discoveryModels.filter(
    (item) => !isFreeOpenCodeModel(item),
  )
  const freeModels = dedupeFreeAcpModels(
    discoveryModels.filter((item) => isFreeOpenCodeModel(item)),
  )

  let authenticated = false
  let paidSelected: AcpModelOption[] = []

  if (paidGoModels.length > 0) {
    authenticated = true
    paidSelected = paidGoModels
  } else if (
    authInfo.hasOpenCodeAuth ||
    hasEnvOpenCodeKey ||
    (authInfo.hasCredentials && nonFreeModels.length > 0) ||
    (!authInfo.supported && nonFreeModels.length > 0)
  ) {
    authenticated = true
    paidSelected = nonFreeModels
  }

  const seenNormalizedIds = new Set<string>()
  const selectedAcpModels: AcpModelOption[] = []

  for (const model of [...paidSelected, ...freeModels]) {
    const normalizedKey = normalizeAcpModelIdForXDrive(model.id).toLowerCase()
    if (seenNormalizedIds.has(normalizedKey)) continue
    seenNormalizedIds.add(normalizedKey)
    selectedAcpModels.push(model)
  }

  return { authenticated, selectedAcpModels }
}

export function normalizeAcpModelIdForXDrive(acpModelId: string): string {
  if (acpModelId.startsWith(OPENCODE_GO_MODEL_PREFIX)) {
    return acpModelId.slice(OPENCODE_GO_MODEL_PREFIX.length)
  }
  return acpModelId
}

export function resolveOpenCodeAcpModelId(
  requestedModelId: string,
  discovered: AcpSessionDiscovery,
  cachedAcpModelIdMap: ReadonlyMap<string, string>,
): string | null {
  const raw = fromXDriveOpenCodeGoModelId(requestedModelId).trim()
  if (!raw || raw === 'auto' || raw === 'default') {
    const firstPaidGo = discovered.models.find(
      (item) =>
        item.id.toLowerCase().startsWith(OPENCODE_GO_MODEL_PREFIX) &&
        !isFreeOpenCodeModel(item),
    )
    return (
      firstPaidGo?.id ??
      discovered.currentModelId ??
      discovered.models.at(0)?.id ??
      null
    )
  }

  const cachedExact =
    cachedAcpModelIdMap.get(requestedModelId) ?? cachedAcpModelIdMap.get(raw)
  if (
    cachedExact &&
    discovered.models.some((item) => item.id === cachedExact)
  ) {
    return cachedExact
  }

  const candidates = raw.includes('/')
    ? [raw, requestedModelId, `${OPENCODE_GO_MODEL_PREFIX}${raw}`]
    : [
        requestedModelId,
        `${OPENCODE_GO_MODEL_PREFIX}${raw}`,
        raw,
        `opencode/${raw}`,
      ]

  for (const candidate of candidates) {
    const match = discovered.models.find(
      (item) => item.id.toLowerCase() === candidate.toLowerCase(),
    )
    if (match) return match.id
  }

  const byName = discovered.models.find((item) => {
    const lowerRaw = raw.toLowerCase()
    if (item.name.toLowerCase() === lowerRaw) return true
    const cleaned = formatOpenCodeModelDisplayName(
      item.id,
      item.name,
      isFreeOpenCodeModel(item),
    ).toLowerCase()
    return cleaned === lowerRaw
  })
  if (byName) return byName.id

  return raw.includes('/') ? raw : `${OPENCODE_GO_MODEL_PREFIX}${raw}`
}

function enrichAcpModels(
  acpModels: AcpModelOption[],
  catalogModels: OpenCodeGoModelOption[],
  supportsImages: boolean,
): OpenCodeGoModelOption[] {
  const catalogByRawId = new Map<string, OpenCodeGoModelOption>()
  for (const item of catalogModels) {
    catalogByRawId.set(item.id.toLowerCase(), item)
  }

  return acpModels.map((model) => {
    const isFree = isFreeOpenCodeModel(model)
    const normalizedId = normalizeAcpModelIdForXDrive(model.id)
    const strippedProvider = normalizedId.includes('/')
      ? normalizedId.slice(normalizedId.indexOf('/') + 1)
      : normalizedId
    const baseSlug = isFree
      ? strippedProvider.replace(/[:-]free$/i, '')
      : strippedProvider
    const catalog =
      catalogByRawId.get(normalizedId.toLowerCase()) ??
      catalogByRawId.get(strippedProvider.toLowerCase()) ??
      (isFree ? catalogByRawId.get(baseSlug.toLowerCase()) : undefined)

    const rawDisplayName =
      model.name && model.name !== model.id
        ? model.name
        : (catalog?.name ?? (model.name || normalizedId))
    const displayName = formatOpenCodeModelDisplayName(
      model.id,
      rawDisplayName,
      isFree,
    )

    if (catalog) {
      return {
        ...catalog,
        id: normalizedId,
        acpModelId: model.id,
        name: displayName,
        description:
          model.description ||
          (isFree ? 'Free model via local OpenCode ACP' : catalog.description),
        supportsVision: supportsImages && catalog.supportsVision,
        featured: !isFree && Boolean(catalog.featured),
        ...(isFree ? { isFree: true, monthlyUsage: undefined } : {}),
        apiProtocol: 'acp',
        baseUrl: 'opencode acp',
      }
    }

    return {
      id: normalizedId,
      acpModelId: model.id,
      name: displayName,
      description:
        model.description ??
        (isFree
          ? 'Free model via local OpenCode ACP'
          : 'Model exposed by local OpenCode ACP'),
      family: normalizedId.includes('/')
        ? normalizedId.slice(0, normalizedId.indexOf('/'))
        : null,
      contextWindow: 256_000,
      outputLimit: 16_384,
      supportsVision: supportsImages,
      reasoning: true,
      featured:
        !isFree && model.id.toLowerCase().startsWith(OPENCODE_GO_MODEL_PREFIX),
      ...(isFree ? { isFree: true } : {}),
      apiProtocol: 'acp',
      baseUrl: 'opencode acp',
    }
  })
}

class OpenCodeAcpManager {
  private readonly runtime: AcpProcessRuntime<OpenCodeBinarySource>
  private cachedModels: OpenCodeGoModelOption[] = []
  private cachedCurrentModelId: string | null = null
  private cachedModelConfigId: string | null = null
  private cachedConfigOptions: AcpConfigOption[] = []
  private cachedAcpModelIdMap = new Map<string, string>()

  constructor() {
    this.runtime = new AcpProcessRuntime<OpenCodeBinarySource>({
      providerLabel: 'OpenCode',
      defaultAgentName: 'OpenCode ACP Server',
      workspaceDir: scratchWorkspaceDir,
      resolveBinary: resolveOpenCodeBinary,
      missingBinaryMessage: () => {
        const custom =
          process.env.XDRIVE_OPENCODE_BIN?.trim() ||
          process.env.OPENCODE_ACP_BIN?.trim()
        if (custom) {
          return `OpenCode CLI was not found at XDRIVE_OPENCODE_BIN ("${custom}") or on PATH. Install OpenCode and run \`opencode auth login\`, or fix XDRIVE_OPENCODE_BIN.`
        }
        return 'OpenCode CLI (`opencode`) is not installed. Install OpenCode and run `opencode auth login` (select OpenCode Go), or set `XDRIVE_OPENCODE_BIN` in `.env.local`.'
      },
      authRequiredMessage: () =>
        'OpenCode CLI is not signed in to OpenCode Go. Run `opencode auth login` in your terminal, select OpenCode Go, and click Refresh in Models & Providers.',
      createError: (code, message, httpStatus) =>
        new OpenCodeAcpError(code, message, httpStatus),
    })
  }

  async shutdown(): Promise<void> {
    await this.runtime.shutdown()
  }

  private cacheDiscovery(
    discovery: AcpSessionDiscovery,
    enrichedModels: OpenCodeGoModelOption[],
  ): void {
    this.cachedModels = enrichedModels
    this.cachedModelConfigId = discovery.modelConfigId
    this.cachedConfigOptions = discovery.configOptions
    this.cachedAcpModelIdMap.clear()
    for (const model of enrichedModels) {
      if (model.acpModelId) {
        this.cachedAcpModelIdMap.set(model.id, model.acpModelId)
        this.cachedAcpModelIdMap.set(
          toXDriveOpenCodeGoModelId(model.id),
          model.acpModelId,
        )
        this.cachedAcpModelIdMap.set(model.acpModelId, model.acpModelId)
      }
    }

    const matchedDefault = discovery.currentModelId
      ? (enrichedModels.find((m) => m.acpModelId === discovery.currentModelId)
          ?.id ??
        (isFreeOpenCodeModel(discovery.currentModelId)
          ? enrichedModels.find(
              (m) =>
                m.isFree &&
                m.acpModelId &&
                getAcpModelSlug(m.acpModelId) ===
                  getAcpModelSlug(discovery.currentModelId!),
            )?.id
          : undefined))
      : undefined
    const preferredFallback =
      enrichedModels.find((m) => !m.isFree)?.id ??
      (enrichedModels.length > 0 ? enrichedModels[0].id : null)
    this.cachedCurrentModelId = matchedDefault ?? preferredFallback
  }

  private buildAcpStatus(
    init: InitializeResponse,
    binary: ResolvedOpenCodeBinary,
    authenticated: boolean,
    authInfo: OpenCodeAuthListInfo,
    fallbackCatalog: OpenCodeGoModelOption[],
    error?: string,
  ): OpenCodeGoRuntimeStatus {
    const supportsImagePrompt = Boolean(
      init.agentCapabilities?.promptCapabilities?.image,
    )
    const hasCachedModels = this.cachedModels.length > 0
    const models = hasCachedModels ? this.cachedModels : fallbackCatalog
    const firstModelId = models.length > 0 ? models[0].id : null

    return {
      ok: true,
      transport: 'acp',
      binaryAvailable: true,
      binarySource: binary.source,
      binaryPath: binary.displayPath,
      agentName: init.agentInfo?.name ?? 'OpenCode ACP Server',
      agentVersion: init.agentInfo?.version ?? undefined,
      protocolVersion: init.protocolVersion,
      authenticated,
      entitled: authenticated,
      authSource: authenticated ? 'opencode-cli' : 'none',
      loggedInProviders: authInfo.providers,
      keySource: 'none',
      maskedKey: null,
      endpointBaseUrl: binary.displayPath,
      models,
      currentModelId: hasCachedModels
        ? (this.cachedCurrentModelId ?? firstModelId)
        : firstModelId,
      configOptions: hasCachedModels ? this.cachedConfigOptions : [],
      supportsImagePrompt,
      usage: null,
      rateLimited: false,
      compliance: OPENCODE_ACP_COMPLIANCE,
      error,
    }
  }

  async getStatus(forceRefresh = false): Promise<OpenCodeGoRuntimeStatus> {
    const binary = await resolveOpenCodeBinary()
    const catalogModels = await getOpenCodeGoManager()
      .getModels(forceRefresh)
      .catch(() => DEFAULT_OPENCODE_GO_MODELS)

    if (!binary) {
      return {
        ok: true,
        transport: 'none',
        binaryAvailable: false,
        binarySource: 'none',
        authenticated: false,
        entitled: false,
        authSource: 'none',
        loggedInProviders: [],
        keySource: 'none',
        maskedKey: null,
        endpointBaseUrl: 'opencode acp (JSON-RPC stdio)',
        models: catalogModels,
        currentModelId:
          catalogModels[0]?.id ?? DEFAULT_OPENCODE_GO_MODELS[0].id,
        configOptions: [],
        supportsImagePrompt: false,
        usage: null,
        rateLimited: false,
        compliance: OPENCODE_ACP_COMPLIANCE,
      }
    }

    const authInfo = await inspectOpenCodeAuthList(binary)

    let connState: Awaited<
      ReturnType<AcpProcessRuntime<OpenCodeBinarySource>['ensureConnected']>
    >
    try {
      connState = await this.runtime.ensureConnected()
    } catch (error) {
      return {
        ok: true,
        transport: 'acp',
        binaryAvailable: true,
        binarySource: binary.source,
        binaryPath: binary.displayPath,
        authenticated: false,
        entitled: false,
        authSource: 'none',
        loggedInProviders: authInfo.providers,
        keySource: 'none',
        maskedKey: null,
        endpointBaseUrl: binary.displayPath,
        models: catalogModels,
        currentModelId:
          catalogModels[0]?.id ?? DEFAULT_OPENCODE_GO_MODELS[0].id,
        configOptions: [],
        supportsImagePrompt: false,
        usage: null,
        rateLimited: false,
        compliance: OPENCODE_ACP_COMPLIANCE,
        error:
          error instanceof Error
            ? error.message
            : 'OpenCode ACP runtime unavailable.',
      }
    }

    const { init } = connState
    const supportsImages = Boolean(
      init.agentCapabilities?.promptCapabilities?.image,
    )

    try {
      const { discovery } = await this.runtime.probeSession(15_000)
      const hasEnvOpenCodeKey = Boolean(
        process.env.OPENCODE_API_KEY?.trim() ||
        process.env.OPENCODE_GO_API_KEY?.trim(),
      )

      const { authenticated, selectedAcpModels } = selectOpenCodeAcpModels(
        discovery.models,
        authInfo,
        hasEnvOpenCodeKey,
      )

      if (!authenticated && selectedAcpModels.length === 0) {
        this.cachedModels = []
        this.cachedCurrentModelId = null
        this.cachedConfigOptions = []
        return this.buildAcpStatus(
          init,
          binary,
          false,
          authInfo,
          catalogModels,
          'OpenCode CLI was found, but no OpenCode Go login was detected. Run `opencode auth login` in your terminal and select OpenCode Go, then click Refresh.',
        )
      }

      const enriched = enrichAcpModels(
        selectedAcpModels,
        catalogModels,
        supportsImages,
      )
      this.cacheDiscovery(discovery, enriched)
      return this.buildAcpStatus(
        init,
        binary,
        authenticated,
        authInfo,
        catalogModels,
      )
    } catch (error) {
      if (isAcpAuthRequiredError(error)) {
        this.cachedModels = []
        this.cachedCurrentModelId = null
        this.cachedConfigOptions = []
        return this.buildAcpStatus(init, binary, false, authInfo, catalogModels)
      }
      return this.buildAcpStatus(
        init,
        binary,
        false,
        authInfo,
        catalogModels,
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  async runPrompt(
    input: OpenCodeAcpPromptInput,
  ): Promise<OpenCodeAcpPromptOutput> {
    const defaultAcpModelId =
      (this.cachedCurrentModelId
        ? (this.cachedAcpModelIdMap.get(this.cachedCurrentModelId) ??
          this.cachedCurrentModelId)
        : null) ??
      `${OPENCODE_GO_MODEL_PREFIX}${DEFAULT_OPENCODE_GO_MODELS[0].id}`

    const result = await this.runtime.runPrompt(input, {
      defaultModelId: defaultAcpModelId,
      cachedModelConfigId: this.cachedModelConfigId,
      resolveRequestedModel: (requestedModelId, discovered) =>
        resolveOpenCodeAcpModelId(
          requestedModelId,
          discovered,
          this.cachedAcpModelIdMap,
        ),
    })

    return result
  }
}

const globalKey = '__xdriveOpenCodeAcpManager__'
const globalHolder = globalThis as typeof globalThis & {
  [globalKey]?: OpenCodeAcpManager
}

export function getOpenCodeAcpManager(): OpenCodeAcpManager {
  if (!globalHolder[globalKey]) {
    globalHolder[globalKey] = new OpenCodeAcpManager()
  }
  return globalHolder[globalKey]
}

// Unified OpenCode runtime status:
// 1. If the OpenCode CLI is available -> use OpenCode ACP exclusively.
// 2. If the OpenCode CLI is NOT installed AND OPENCODE_API_KEY /
//    OPENCODE_GO_API_KEY is set in env -> fall back to direct HTTP Go API.
// 3. Otherwise -> report CLI missing with setup guidance (`opencode auth login`).
export async function getOpenCodeStatus(
  forceRefresh = false,
): Promise<OpenCodeGoRuntimeStatus> {
  const binary = await resolveOpenCodeBinary()
  if (binary) {
    return await getOpenCodeAcpManager().getStatus(forceRefresh)
  }

  const goFallback = getOpenCodeGoManager()
  if (goFallback.hasEnvApiKey()) {
    return await goFallback.getStatus(forceRefresh)
  }

  const models = await goFallback
    .getModels(forceRefresh)
    .catch(() => DEFAULT_OPENCODE_GO_MODELS)

  return {
    ok: true,
    transport: 'none',
    binaryAvailable: false,
    binarySource: 'none',
    authenticated: false,
    entitled: false,
    authSource: 'none',
    loggedInProviders: [],
    keySource: 'none',
    maskedKey: null,
    endpointBaseUrl: OPENCODE_GO_ENDPOINT_BASE_URL,
    models,
    currentModelId: models[0]?.id ?? DEFAULT_OPENCODE_GO_MODELS[0].id,
    configOptions: [],
    supportsImagePrompt: false,
    usage: null,
    rateLimited: false,
    compliance: OPENCODE_ACP_COMPLIANCE,
  }
}

// Unified OpenCode prompt runner used by `/api/ai` collaborate and `/api/drive-chat`:
// Uses OpenCode ACP whenever the CLI is installed, and falls back to the direct
// OPENCODE_API_KEY HTTP client only when the CLI is not available.
export async function runOpenCodePrompt(
  input: OpenCodeUnifiedPromptInput,
): Promise<OpenCodeUnifiedPromptOutput> {
  const binary = await resolveOpenCodeBinary()
  if (binary) {
    const acpResult = await getOpenCodeAcpManager().runPrompt({
      prompt: input.acpPrompt ?? input.prompt,
      modelId: input.modelId,
      reasoningEffort: input.reasoningEffort,
      imageDataUrls: input.imageDataUrls,
      signal: input.signal,
      idleTimeoutMs: input.idleTimeoutMs,
      maxDurationMs: input.maxDurationMs,
      onTextDelta: input.onTextDelta,
      onThoughtDelta: input.onThoughtDelta,
    })

    return {
      transport: 'acp',
      text: acpResult.text,
      thoughts: acpResult.thoughts,
      stopReason: acpResult.stopReason,
      modelId: normalizeAcpModelIdForXDrive(acpResult.modelId),
      acpModelId: acpResult.modelId,
      agentName: acpResult.agentName,
      agentVersion: acpResult.agentVersion,
      protocol: 'acp',
    }
  }

  const goFallback = getOpenCodeGoManager()
  if (goFallback.hasEnvApiKey()) {
    const goResult = await goFallback.runPrompt({
      prompt: input.prompt,
      systemPrompt: input.systemPrompt,
      history: input.history,
      modelId: input.modelId,
      reasoningEffort: input.reasoningEffort,
      sessionId: input.sessionId,
      imageDataUrls: input.imageDataUrls,
      signal: input.signal,
      onTextDelta: input.onTextDelta,
      onThoughtDelta: input.onThoughtDelta,
    })

    return {
      transport: 'http-fallback',
      text: goResult.text,
      thoughts: goResult.thoughts,
      stopReason: goResult.stopReason,
      modelId: goResult.modelId,
      agentName: 'OpenCode Go (HTTP fallback)',
      agentVersion: 'v1',
      protocol: goResult.apiProtocol,
    }
  }

  throw new OpenCodeAcpError(
    'BINARY_MISSING',
    'OpenCode CLI (`opencode`) is not installed. Install OpenCode and run `opencode auth login` (select OpenCode Go), set `XDRIVE_OPENCODE_BIN`, or set `OPENCODE_API_KEY` as a direct-HTTP fallback.',
    503,
  )
}
