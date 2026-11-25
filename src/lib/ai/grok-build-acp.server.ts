// Server-only Grok Build (SpaceXSI's `grok` CLI) Agent Client Protocol (ACP)
// runtime for xDrive.
//
// Architecture (mirrors opencode-acp.server.ts and antigravity-acp.server.ts):
// - Spawns `grok --no-auto-update agent stdio` over standard ACP (NDJSON
//   JSON-RPC 2.0 over stdio using `@agentclientprotocol/sdk`).
// - Binary path is configurable via `XDRIVE_GROK_BIN` (or `GROK_ACP_BIN`),
//   defaulting to `grok` on PATH or standard install locations.
// - Authenticates via ACP `authenticate` (`{ methodId, _meta: { headless: true } }`),
//   preferring `cached_token` when advertised by `initialize` (user ran
//   `grok login`), else `xai.api_key` when `XAI_API_KEY` is set in env.
//   Never reads `~/.grok/auth.json` directly and never persists any secret.
// - Discovers available models from `initialize._meta.modelState` and
//   `session/new` (`models` / `configOptions`), routes model selection via
//   `session/set_config_option` / `session/set_model`, supports streaming +
//   `session/cancel`, runs sessions inside an isolated scratch workspace in
//   `os.tmpdir()`, and denies all tool/command permission requests.

import os from 'node:os'
import path from 'node:path'
import type {
  ClientConnection,
  InitializeResponse,
} from '@agentclientprotocol/sdk/unstable'
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
  AcpPromptInput,
  AcpPromptOutput,
  AcpSessionDiscovery,
  ResolvedAcpBinary,
} from './acp-runtime.server'
import {
  DEFAULT_GROK_BUILD_MODELS,
  fromXDriveGrokBuildModelId,
} from './grok-build-types'
import type {
  GrokBuildAuthMethodInfo,
  GrokBuildAuthSource,
  GrokBuildBinarySource,
  GrokBuildModelOption,
  GrokBuildRuntimeStatus,
} from './grok-build-types'

const GROK_BUILD_ACP_ARGS = ['--no-auto-update', 'agent', 'stdio']

const GROK_BUILD_ACP_COMPLIANCE = {
  protocol: 'ACP (JSON-RPC 2.0 over stdio)' as const,
  cliAuthStoreOnly: true,
  keyStoredInXDrive: false as const,
}

type ResolvedGrokBuildBinary = ResolvedAcpBinary<GrokBuildBinarySource>

export class GrokBuildAcpError extends AcpError {
  constructor(code: AcpErrorCode, message: string, httpStatus = 500) {
    super(code, message, httpStatus)
    this.name = 'GrokBuildAcpError'
  }
}

export type GrokBuildPromptInput = AcpPromptInput
export type GrokBuildPromptOutput = AcpPromptOutput

interface RawGrokReasoningEffort {
  id?: unknown
  value?: unknown
  default?: unknown
}

interface RawGrokModelEntry {
  modelId?: unknown
  id?: unknown
  name?: unknown
  description?: unknown
  _meta?: {
    totalContextTokens?: unknown
    contextWindows?: unknown
    supportsReasoningEffort?: unknown
    reasoningEffort?: unknown
    reasoningEfforts?: unknown
  }
}

interface RawGrokModelState {
  currentModelId?: unknown
  availableModels?: unknown
}

function scratchWorkspaceDir(): string {
  return acpScratchWorkspaceDir('grok-build')
}

export async function resolveGrokBuildBinary(): Promise<ResolvedGrokBuildBinary | null> {
  const custom =
    process.env.XDRIVE_GROK_BIN?.trim() || process.env.GROK_ACP_BIN?.trim()
  if (custom) {
    const resolvedCustom = (await isExecutable(custom))
      ? custom
      : await whichBinary(custom)
    if (resolvedCustom) {
      return {
        source: 'custom',
        command: resolvedCustom,
        args: [...GROK_BUILD_ACP_ARGS],
        displayPath: `${resolvedCustom} ${GROK_BUILD_ACP_ARGS.join(' ')}`,
      }
    }
  }

  const fromPath = await whichBinary('grok')
  if (fromPath) {
    return {
      source: 'grok-cli',
      command: fromPath,
      args: [...GROK_BUILD_ACP_ARGS],
      displayPath: `${fromPath} ${GROK_BUILD_ACP_ARGS.join(' ')}`,
    }
  }

  const home = os.homedir()
  const exe = process.platform === 'win32' ? '.exe' : ''
  const standardCandidates = [
    path.join(home, '.local', 'bin', `grok${exe}`),
    path.join(home, '.grok', 'bin', `grok${exe}`),
    `/opt/homebrew/bin/grok${exe}`,
    `/usr/local/bin/grok${exe}`,
  ]
  for (const candidate of standardCandidates) {
    if (await isExecutable(candidate)) {
      return {
        source: 'grok-cli',
        command: candidate,
        args: [...GROK_BUILD_ACP_ARGS],
        displayPath: `${candidate} ${GROK_BUILD_ACP_ARGS.join(' ')}`,
      }
    }
  }

  return null
}

export function extractGrokBuildAuthMethods(
  init: Pick<InitializeResponse, 'authMethods'>,
): GrokBuildAuthMethodInfo[] {
  return (init.authMethods ?? []).map((method) => ({
    id: method.id,
    name: method.name,
    description: method.description ?? null,
  }))
}

// Selects the headless ACP `authenticate` method for Grok Build:
// 1. Prefer `cached_token` when advertised by `initialize` (user ran `grok login`).
// 2. Else use `xai.api_key` when `XAI_API_KEY` is configured in env.
// 3. Otherwise return null so xDrive shows a not-signed-in state guiding `grok login`.
export function selectGrokBuildAuthMethod(
  authMethods: ReadonlyArray<Pick<GrokBuildAuthMethodInfo, 'id'>>,
  hasEnvXaiApiKey: boolean,
): Exclude<GrokBuildAuthSource, 'none'> | null {
  const advertisedIds = new Set(authMethods.map((method) => method.id))
  if (advertisedIds.has('cached_token')) {
    return 'cached_token'
  }
  if (hasEnvXaiApiKey) {
    return 'xai.api_key'
  }
  return null
}

function normalizeRawGrokModel(
  raw: RawGrokModelEntry,
  currentModelId: string | null,
  supportsImages: boolean,
): GrokBuildModelOption | null {
  const rawId =
    typeof raw.modelId === 'string'
      ? raw.modelId.trim()
      : typeof raw.id === 'string'
        ? raw.id.trim()
        : ''
  if (!rawId) return null

  const meta = raw._meta
  const contextWindows = Array.isArray(meta?.contextWindows)
    ? meta.contextWindows.filter(
        (n): n is number =>
          typeof n === 'number' && Number.isFinite(n) && n > 0,
      )
    : undefined
  const contextWindow =
    typeof meta?.totalContextTokens === 'number' &&
    Number.isFinite(meta.totalContextTokens) &&
    meta.totalContextTokens > 0
      ? meta.totalContextTokens
      : (contextWindows?.[0] ?? 256_000)

  const rawEfforts = Array.isArray(meta?.reasoningEfforts)
    ? (meta.reasoningEfforts as RawGrokReasoningEffort[])
    : []
  const reasoningEfforts = rawEfforts
    .map((entry) =>
      typeof entry.value === 'string'
        ? entry.value.trim()
        : typeof entry.id === 'string'
          ? entry.id.trim()
          : '',
    )
    .filter(Boolean)

  const defaultEffortFromList = rawEfforts.find(
    (entry) => entry.default === true,
  )
  const defaultReasoningEffort =
    typeof meta?.reasoningEffort === 'string' && meta.reasoningEffort.trim()
      ? meta.reasoningEffort.trim()
      : typeof defaultEffortFromList?.value === 'string'
        ? defaultEffortFromList.value
        : null

  const reasoning =
    typeof meta?.supportsReasoningEffort === 'boolean'
      ? meta.supportsReasoningEffort
      : reasoningEfforts.length > 0 || true

  return {
    id: rawId,
    name:
      typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : rawId,
    description:
      typeof raw.description === 'string' && raw.description.trim()
        ? raw.description.trim()
        : null,
    contextWindow,
    ...(contextWindows && contextWindows.length > 0 ? { contextWindows } : {}),
    supportsVision: supportsImages,
    reasoning,
    ...(reasoningEfforts.length > 0 ? { reasoningEfforts } : {}),
    defaultReasoningEffort,
    isDefault: rawId === currentModelId,
  }
}

export function extractGrokBuildModelState(
  init: Pick<InitializeResponse, '_meta' | 'agentCapabilities'>,
  discovery?: AcpSessionDiscovery | null,
): {
  models: GrokBuildModelOption[]
  currentModelId: string | null
  grokShell: boolean
  agentVersion?: string
} {
  const meta = init._meta as Record<string, unknown> | undefined
  const supportsImages = Boolean(
    init.agentCapabilities?.promptCapabilities?.image ?? true,
  )
  const grokShell = Boolean(meta?.grokShell)
  const agentVersion =
    typeof meta?.agentVersion === 'string' && meta.agentVersion.trim()
      ? meta.agentVersion.trim()
      : undefined

  const rawState =
    meta?.modelState && typeof meta.modelState === 'object'
      ? (meta.modelState as RawGrokModelState)
      : null

  const initCurrentId =
    typeof rawState?.currentModelId === 'string' &&
    rawState.currentModelId.trim()
      ? rawState.currentModelId.trim()
      : null

  const currentModelId = discovery?.currentModelId ?? initCurrentId

  const initModelsById = new Map<string, GrokBuildModelOption>()
  const orderedIds: string[] = []

  if (Array.isArray(rawState?.availableModels)) {
    for (const entry of rawState.availableModels) {
      if (!entry || typeof entry !== 'object') continue
      const normalized = normalizeRawGrokModel(
        entry as RawGrokModelEntry,
        currentModelId,
        supportsImages,
      )
      if (!normalized) continue
      const key = normalized.id.toLowerCase()
      if (!initModelsById.has(key)) {
        orderedIds.push(key)
      }
      initModelsById.set(key, normalized)
    }
  }

  // Merge any models discovered from `session/new` while preserving rich
  // `initialize._meta.modelState` metadata (context window, reasoning efforts).
  const models: GrokBuildModelOption[] = []
  const seen = new Set<string>()

  if (discovery && discovery.models.length > 0) {
    for (const item of discovery.models) {
      const key = item.id.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const enriched = initModelsById.get(key)
      if (enriched) {
        models.push({
          ...enriched,
          name: item.name && item.name !== item.id ? item.name : enriched.name,
          description: item.description ?? enriched.description,
          isDefault: item.id === currentModelId,
        })
      } else {
        models.push({
          id: item.id,
          name: item.name || item.id,
          description: item.description ?? null,
          contextWindow: 256_000,
          supportsVision: supportsImages,
          reasoning: true,
          isDefault: item.id === currentModelId,
        })
      }
    }
  } else {
    for (const key of orderedIds) {
      const entry = initModelsById.get(key)
      if (entry) models.push(entry)
    }
  }

  const effectiveCurrentId = currentModelId ?? models.at(0)?.id ?? null

  return {
    models,
    currentModelId: effectiveCurrentId,
    grokShell,
    agentVersion,
  }
}

export function resolveGrokBuildModelId(
  requestedModelId: string,
  discovered: Pick<AcpSessionDiscovery, 'models' | 'currentModelId'>,
  cachedModels: ReadonlyArray<Pick<GrokBuildModelOption, 'id' | 'name'>> = [],
): string | null {
  const raw = fromXDriveGrokBuildModelId(requestedModelId).trim()
  if (!raw || raw === 'auto' || raw === 'default') {
    return (
      discovered.currentModelId ??
      discovered.models.at(0)?.id ??
      cachedModels.at(0)?.id ??
      null
    )
  }

  const lower = raw.toLowerCase()
  const pool =
    discovered.models.length > 0
      ? discovered.models
      : cachedModels.map((m) => ({ id: m.id, name: m.name }))

  const exactId = pool.find((item) => item.id.toLowerCase() === lower)
  if (exactId) return exactId.id

  const exactName = pool.find((item) => item.name.toLowerCase() === lower)
  if (exactName) return exactName.id

  return raw
}

function extractSubscriptionTier(authResponse: unknown): string | null {
  if (!authResponse || typeof authResponse !== 'object') return null
  const meta = (authResponse as { _meta?: unknown })._meta
  if (!meta || typeof meta !== 'object') return null
  const rec = meta as Record<string, unknown>
  const candidate = rec.subscription_tier ?? rec.tier ?? rec.plan
  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim()
  }
  return null
}

export class GrokBuildAcpManager {
  private readonly runtime: AcpProcessRuntime<GrokBuildBinarySource>
  private readonly resolveBinaryFn: () => Promise<ResolvedGrokBuildBinary | null>
  private readonly authByConn = new WeakMap<
    ClientConnection,
    {
      authSource: Exclude<GrokBuildAuthSource, 'none'>
      tier: string | null
    }
  >()
  private cachedTier: string | null = null
  private cachedModels: GrokBuildModelOption[] = []
  private cachedCurrentModelId: string | null = null
  private cachedModelConfigId: string | null = null
  private cachedConfigOptions: AcpConfigOption[] = []

  constructor(options?: {
    resolveBinary?: () => Promise<ResolvedGrokBuildBinary | null>
    workspaceDir?: () => string
  }) {
    this.resolveBinaryFn = options?.resolveBinary ?? resolveGrokBuildBinary
    this.runtime = new AcpProcessRuntime<GrokBuildBinarySource>({
      providerLabel: 'Grok Build',
      defaultAgentName: 'Grok Build ACP',
      workspaceDir: options?.workspaceDir ?? scratchWorkspaceDir,
      resolveBinary: this.resolveBinaryFn,
      missingBinaryMessage: () => {
        const custom =
          process.env.XDRIVE_GROK_BIN?.trim() ||
          process.env.GROK_ACP_BIN?.trim()
        if (custom) {
          return `Grok Build CLI was not found at XDRIVE_GROK_BIN ("${custom}") or on PATH. Install Grok CLI and run \`grok login\`, or fix XDRIVE_GROK_BIN.`
        }
        return 'Grok Build CLI (`grok`) is not installed. Install Grok CLI and run `grok login`, or set `XDRIVE_GROK_BIN` in `.env.local`.'
      },
      authRequiredMessage: () =>
        'Grok Build CLI is not signed in. Run `grok login` in your terminal (or set `XAI_API_KEY` in `.env.local`), then click Refresh in Models & Providers.',
      createError: (code, message, httpStatus) =>
        new GrokBuildAcpError(code, message, httpStatus),
    })
  }

  async shutdown(): Promise<void> {
    this.cachedTier = null
    await this.runtime.shutdown()
  }

  private async ensureAuthenticated(
    connection: ClientConnection,
    init: InitializeResponse,
  ): Promise<{
    authenticated: boolean
    authSource: GrokBuildAuthSource
    tier: string | null
    error?: string
  }> {
    const existing = this.authByConn.get(connection)
    if (existing) {
      return {
        authenticated: true,
        authSource: existing.authSource,
        tier: existing.tier,
      }
    }

    const authMethods = extractGrokBuildAuthMethods(init)
    const hasEnvXaiApiKey = Boolean(process.env.XAI_API_KEY?.trim())
    const chosenMethod = selectGrokBuildAuthMethod(authMethods, hasEnvXaiApiKey)

    if (!chosenMethod) {
      this.authByConn.delete(connection)
      this.cachedTier = null
      return {
        authenticated: false,
        authSource: 'none',
        tier: null,
      }
    }

    try {
      const authResponse = await connection.agent.request(
        'authenticate',
        {
          methodId: chosenMethod,
          _meta: { headless: true },
        },
        {
          cancellationSignal: AbortSignal.timeout(15_000),
          stopWaitingOnCancel: true,
        },
      )
      const tier = extractSubscriptionTier(authResponse)
      this.authByConn.set(connection, { authSource: chosenMethod, tier })
      this.cachedTier = tier
      return {
        authenticated: true,
        authSource: chosenMethod,
        tier,
      }
    } catch (error) {
      this.authByConn.delete(connection)
      this.cachedTier = null
      return {
        authenticated: false,
        authSource: 'none',
        tier: null,
        error:
          error instanceof Error
            ? error.message
            : 'Grok Build ACP authentication failed.',
      }
    }
  }

  private buildStatus(
    init: InitializeResponse,
    binary: ResolvedGrokBuildBinary,
    authenticated: boolean,
    authSource: GrokBuildAuthSource,
    models: GrokBuildModelOption[],
    currentModelId: string | null,
    grokShell: boolean,
    agentVersion?: string,
    error?: string,
  ): GrokBuildRuntimeStatus {
    const authMethods = extractGrokBuildAuthMethods(init)
    const supportsImagePrompt = Boolean(
      init.agentCapabilities?.promptCapabilities?.image,
    )
    const effectiveModels =
      models.length > 0 ? models : DEFAULT_GROK_BUILD_MODELS

    return {
      ok: true,
      binaryAvailable: true,
      binarySource: binary.source,
      binaryPath: binary.displayPath,
      agentName: init.agentInfo?.name ?? 'Grok Build ACP',
      agentVersion: init.agentInfo?.version ?? agentVersion,
      protocolVersion: init.protocolVersion,
      grokShell,
      authenticated,
      activeAuthMethod: authenticated ? authSource : null,
      authSource,
      authMethods,
      tier: authenticated ? this.cachedTier : null,
      models: effectiveModels,
      currentModelId: currentModelId ?? effectiveModels.at(0)?.id ?? null,
      configOptions: authenticated ? this.cachedConfigOptions : [],
      supportsImagePrompt,
      compliance: GROK_BUILD_ACP_COMPLIANCE,
      error,
    }
  }

  async getStatus(forceRefresh = false): Promise<GrokBuildRuntimeStatus> {
    if (forceRefresh) {
      // Retire the shared connection non-disruptively so any in-flight chat or
      // Marble prompts finish on their existing process while this refresh
      // initializes a fresh CLI process to pick up `grok login` / model changes.
      this.runtime.retireConnection()
    }

    try {
      return await this.runtime.withConnection(async (state) => {
        const { connection, init, binary } = state
        const initState = extractGrokBuildModelState(init)

        const authResult = await this.ensureAuthenticated(connection, init)
        if (!authResult.authenticated) {
          this.cachedModels = initState.models
          this.cachedCurrentModelId = initState.currentModelId
          this.cachedConfigOptions = []
          return this.buildStatus(
            init,
            binary,
            false,
            'none',
            initState.models,
            initState.currentModelId,
            initState.grokShell,
            initState.agentVersion,
            authResult.error ??
              'Grok CLI was found, but no active sign-in was detected. Run `grok login` in your terminal (or set `XAI_API_KEY` in `.env.local`), then click Refresh.',
          )
        }

        try {
          const { discovery } = await this.runtime.probeSessionOn(state, 15_000)
          const merged = extractGrokBuildModelState(init, discovery)
          this.cachedModels = merged.models
          this.cachedCurrentModelId = merged.currentModelId
          this.cachedModelConfigId = discovery.modelConfigId
          this.cachedConfigOptions = discovery.configOptions
          return this.buildStatus(
            init,
            binary,
            true,
            authResult.authSource,
            merged.models,
            merged.currentModelId,
            merged.grokShell,
            merged.agentVersion,
          )
        } catch (error) {
          if (isAcpAuthRequiredError(error)) {
            this.authByConn.delete(connection)
            this.cachedConfigOptions = []
            return this.buildStatus(
              init,
              binary,
              false,
              'none',
              initState.models,
              initState.currentModelId,
              initState.grokShell,
              initState.agentVersion,
              'Grok Build CLI requires sign-in. Run `grok login` in your terminal and click Refresh.',
            )
          }
          // If initialize already succeeded and authenticated, still surface models from modelState.
          this.cachedModels = initState.models
          this.cachedCurrentModelId = initState.currentModelId
          return this.buildStatus(
            init,
            binary,
            true,
            authResult.authSource,
            initState.models,
            initState.currentModelId,
            initState.grokShell,
            initState.agentVersion,
            error instanceof Error ? error.message : String(error),
          )
        }
      })
    } catch (error) {
      if (
        error instanceof GrokBuildAcpError &&
        error.code === 'BINARY_MISSING'
      ) {
        return {
          ok: true,
          binaryAvailable: false,
          binarySource: 'none',
          authenticated: false,
          activeAuthMethod: null,
          authSource: 'none',
          authMethods: [],
          tier: null,
          models: DEFAULT_GROK_BUILD_MODELS,
          currentModelId: DEFAULT_GROK_BUILD_MODELS[0].id,
          configOptions: [],
          supportsImagePrompt: true,
          compliance: GROK_BUILD_ACP_COMPLIANCE,
        }
      }
      const binary = await this.resolveBinaryFn().catch(() => null)
      return {
        ok: true,
        binaryAvailable: Boolean(binary),
        binarySource: binary?.source ?? 'none',
        binaryPath: binary?.displayPath,
        authenticated: false,
        activeAuthMethod: null,
        authSource: 'none',
        authMethods: [],
        tier: null,
        models: DEFAULT_GROK_BUILD_MODELS,
        currentModelId: DEFAULT_GROK_BUILD_MODELS[0].id,
        configOptions: [],
        supportsImagePrompt: false,
        compliance: GROK_BUILD_ACP_COMPLIANCE,
        error:
          error instanceof Error
            ? error.message
            : 'Grok Build ACP runtime unavailable.',
      }
    }
  }

  async runPrompt(input: GrokBuildPromptInput): Promise<GrokBuildPromptOutput> {
    let sessionInit: InitializeResponse | null = null

    return await this.runtime.runPrompt(input, {
      defaultModelId:
        this.cachedCurrentModelId ?? DEFAULT_GROK_BUILD_MODELS[0].id,
      cachedModelConfigId: this.cachedModelConfigId,
      beforeSession: async ({ connection, init }) => {
        sessionInit = init
        const authResult = await this.ensureAuthenticated(connection, init)
        if (!authResult.authenticated) {
          throw new GrokBuildAcpError(
            'AUTH_REQUIRED',
            authResult.error ??
              'Grok Build CLI is not signed in. Run `grok login` in your terminal (or set `XAI_API_KEY` in `.env.local`), then click Refresh in Models & Providers.',
            401,
          )
        }
        const initState = extractGrokBuildModelState(init)
        if (this.cachedModels.length === 0 && initState.models.length > 0) {
          this.cachedModels = initState.models
          this.cachedCurrentModelId = initState.currentModelId
        }
      },
      onDiscovery: (discovered) => {
        if (sessionInit) {
          const merged = extractGrokBuildModelState(sessionInit, discovered)
          if (merged.models.length > 0) {
            this.cachedModels = merged.models
            this.cachedCurrentModelId = merged.currentModelId
          }
        }
        this.cachedModelConfigId = discovered.modelConfigId
        this.cachedConfigOptions = discovered.configOptions
      },
      resolveRequestedModel: (requestedModelId, discovered) =>
        resolveGrokBuildModelId(
          requestedModelId,
          discovered,
          this.cachedModels,
        ),
    })
  }
}

const globalKey = '__xdriveGrokBuildAcpManager__'
const globalHolder = globalThis as typeof globalThis & {
  [globalKey]?: GrokBuildAcpManager
}

export function getGrokBuildAcpManager(): GrokBuildAcpManager {
  if (!globalHolder[globalKey]) {
    globalHolder[globalKey] = new GrokBuildAcpManager()
  }
  return globalHolder[globalKey]
}

export async function getGrokBuildStatus(
  forceRefresh = false,
): Promise<GrokBuildRuntimeStatus> {
  return await getGrokBuildAcpManager().getStatus(forceRefresh)
}

export async function runGrokBuildPrompt(
  input: GrokBuildPromptInput,
): Promise<GrokBuildPromptOutput> {
  return await getGrokBuildAcpManager().runPrompt(input)
}
