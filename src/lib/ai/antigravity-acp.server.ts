// Server-only official Google Antigravity Agent Client Protocol (ACP) runtime.
//
// Compliance architecture (matches T3 Code and Google Antigravity ToS):
// - Runs ONLY the unmodified official Google Antigravity ACP binary:
//   1. User-installed official `agy` CLI (`agy acp`), OR
//   2. Official `antigravity-acp` binary downloaded from Google's release CDN
//      via the public ACP Registry manifest with SHA-256 verification.
// - Communicates strictly via standard Agent Client Protocol (JSON-RPC 2.0
//   over stdio using `@agentclientprotocol/sdk`).
// - Authentication is delegated natively to Antigravity via ACP `authenticate`
//   (`oauth-personal` for personal Google AI plans, `oauth-business` for Gemini
//   Enterprise, `gemini-api-key`, or `agent-platform`).
// - Never extracts, reads, caches, or proxies Google OAuth tokens, and never
//   wraps headless `agy -p` loops.

import { createHash } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import type { InitializeResponse } from '@agentclientprotocol/sdk/unstable'
import {
  AcpError,
  AcpProcessRuntime,
  acpCacheDir,
  acpScratchWorkspaceDir,
  isAcpAuthRequiredError,
  isExecutable,
  whichBinary,
} from './acp-runtime.server'
import type {
  AcpErrorCode,
  AcpPromptInput,
  AcpPromptOutput,
  AcpSessionDiscovery,
  ResolvedAcpBinary,
} from './acp-runtime.server'
import type {
  AntigravityAuthMethodId,
  AntigravityAuthMethodInfo,
  AntigravityBinarySource,
  AntigravityConfigOption,
  AntigravityModelOption,
  AntigravityRuntimeStatus,
} from './antigravity-types'
import { fromXDriveAntigravityModelId } from './antigravity-types'

const ACP_REGISTRY_MANIFEST_URL =
  'https://raw.githubusercontent.com/agentclientprotocol/registry/main/antigravity-acp/agent.json'
const ALLOWED_RELEASE_HOST = 'dl.google.com'

const COMPLIANCE_INFO = {
  protocol: 'ACP (JSON-RPC 2.0 over stdio)' as const,
  unmodifiedOfficialBinary: true,
  nativeAuthOnly: true,
  tokenExtraction: false as const,
}

type ResolvedBinary = ResolvedAcpBinary<AntigravityBinarySource>

interface RegistryPlatformBinary {
  archive: string
  cmd: string
  args?: string[]
  sha256: string
}

interface RegistryAgentManifest {
  id: string
  name: string
  version: string
  distribution?: {
    binary?: Record<string, RegistryPlatformBinary>
  }
}

interface InstalledRegistryMetadata {
  version: string
  platformKey: string
  commandPath: string
  args: string[]
  sha256: string
  installedAt: string
}

export type AntigravityPromptInput = AcpPromptInput
export type AntigravityPromptOutput = AcpPromptOutput

export class AntigravityAcpError extends AcpError {
  constructor(code: AcpErrorCode, message: string, httpStatus = 500) {
    super(code, message, httpStatus)
    this.name = 'AntigravityAcpError'
  }
}

function registryCacheDir(): string {
  return acpCacheDir('antigravity-acp')
}

function scratchWorkspaceDir(): string {
  return acpScratchWorkspaceDir('antigravity')
}

function registryPlatformKey(): string | null {
  const platform = process.platform
  const arch = process.arch
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-aarch64'
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x86_64'
  if (platform === 'linux' && arch === 'x64') return 'linux-x86_64'
  if (platform === 'linux' && arch === 'arm64') return 'linux-aarch64'
  if (platform === 'win32' && arch === 'x64') return 'windows-x86_64'
  if (platform === 'win32' && arch === 'arm64') return 'windows-aarch64'
  return null
}

async function readInstalledRegistryBinary(): Promise<ResolvedBinary | null> {
  const metaPath = path.join(registryCacheDir(), 'installed.json')
  try {
    const raw = await readFile(metaPath, 'utf8')
    const meta = JSON.parse(raw) as InstalledRegistryMetadata
    if (meta.commandPath && (await isExecutable(meta.commandPath))) {
      return {
        source: 'acp-registry',
        command: meta.commandPath,
        args: Array.isArray(meta.args) ? meta.args : [],
        displayPath: meta.commandPath,
      }
    }
  } catch {
    // Not installed yet.
  }
  return null
}

export async function resolveAntigravityBinary(): Promise<ResolvedBinary | null> {
  const custom =
    process.env.XDRIVE_ANTIGRAVITY_BIN?.trim() ||
    process.env.ANTIGRAVITY_ACP_BIN?.trim()
  if (custom && (await isExecutable(custom))) {
    const base = path.basename(custom).toLowerCase()
    const isAgyCli = base === 'agy' || base === 'agy.exe'
    return {
      source: 'custom',
      command: custom,
      args: isAgyCli ? ['acp'] : [],
      displayPath: custom,
    }
  }

  const fromPath = await whichBinary('agy')
  if (fromPath) {
    return {
      source: 'agy-cli',
      command: fromPath,
      args: ['acp'],
      displayPath: `${fromPath} acp`,
    }
  }

  const home = os.homedir()
  const standardCandidates = [
    '/opt/homebrew/bin/agy',
    '/usr/local/bin/agy',
    path.join(home, '.local', 'bin', 'agy'),
    path.join(home, '.antigravity', 'bin', 'agy'),
  ]
  for (const candidate of standardCandidates) {
    if (await isExecutable(candidate)) {
      return {
        source: 'agy-cli',
        command: candidate,
        args: ['acp'],
        displayPath: `${candidate} acp`,
      }
    }
  }

  const registryBinary = await readInstalledRegistryBinary()
  if (registryBinary) return registryBinary

  return null
}

export async function installOfficialAntigravityBinary(): Promise<ResolvedBinary> {
  const platformKey = registryPlatformKey()
  if (!platformKey) {
    throw new AntigravityAcpError(
      'INSTALL_FAILED',
      `Unsupported platform ${process.platform}/${process.arch} for the official Antigravity ACP binary.`,
      400,
    )
  }

  const manifestResponse = await fetch(ACP_REGISTRY_MANIFEST_URL, {
    headers: { accept: 'application/json' },
  })
  if (!manifestResponse.ok) {
    throw new AntigravityAcpError(
      'INSTALL_FAILED',
      `Could not fetch the official ACP Registry manifest (HTTP ${manifestResponse.status}).`,
      502,
    )
  }

  const manifest = (await manifestResponse.json()) as RegistryAgentManifest
  const target = manifest.distribution?.binary?.[platformKey]
  if (!target?.archive || !target.sha256 || !target.cmd) {
    throw new AntigravityAcpError(
      'INSTALL_FAILED',
      `ACP Registry manifest for antigravity-acp has no binary entry for ${platformKey}.`,
      502,
    )
  }

  const archiveUrl = new URL(target.archive)
  if (
    archiveUrl.protocol !== 'https:' ||
    archiveUrl.hostname !== ALLOWED_RELEASE_HOST
  ) {
    throw new AntigravityAcpError(
      'INSTALL_FAILED',
      `Refused non-Google release host "${archiveUrl.hostname}" from registry manifest.`,
      502,
    )
  }

  const archiveResponse = await fetch(archiveUrl)
  if (!archiveResponse.ok) {
    throw new AntigravityAcpError(
      'INSTALL_FAILED',
      `Failed to download official Antigravity ACP archive (HTTP ${archiveResponse.status}).`,
      502,
    )
  }

  const buffer = Buffer.from(await archiveResponse.arrayBuffer())
  const actualSha = createHash('sha256').update(buffer).digest('hex')
  if (actualSha.toLowerCase() !== target.sha256.toLowerCase()) {
    throw new AntigravityAcpError(
      'INSTALL_FAILED',
      `SHA-256 verification failed for official Antigravity ACP archive (expected ${target.sha256}, got ${actualSha}).`,
      502,
    )
  }

  const versionDir = path.join(
    registryCacheDir(),
    `${manifest.version}-${platformKey}`,
  )
  await mkdir(versionDir, { recursive: true })

  const zip = await JSZip.loadAsync(buffer)
  const resolvedRoot = path.resolve(versionDir)
  for (const [entryName, entry] of Object.entries(zip.files)) {
    const normalized = path
      .normalize(entryName)
      .replace(/^(\.\.(\/|\\|$))+/, '')
    if (!normalized || normalized.startsWith(path.sep)) continue
    const dest = path.resolve(versionDir, normalized)
    if (!dest.startsWith(resolvedRoot + path.sep) && dest !== resolvedRoot) {
      continue
    }
    if (entry.dir) {
      await mkdir(dest, { recursive: true })
    } else {
      await mkdir(path.dirname(dest), { recursive: true })
      const content = await entry.async('nodebuffer')
      await writeFile(dest, content)
      if (process.platform !== 'win32') {
        const unixMode =
          typeof entry.unixPermissions === 'number'
            ? entry.unixPermissions & 0o777
            : 0o644
        if (unixMode) {
          await chmod(dest, unixMode)
        }
      }
    }
  }

  const cmdRel = target.cmd.replace(/^\.\//, '')
  const commandPath = path.resolve(versionDir, cmdRel)
  if (
    !commandPath.startsWith(resolvedRoot + path.sep) &&
    commandPath !== resolvedRoot
  ) {
    throw new AntigravityAcpError(
      'INSTALL_FAILED',
      'Invalid binary command path in registry manifest.',
      502,
    )
  }
  if (process.platform !== 'win32') {
    await chmod(commandPath, 0o755)
  }

  const installedMeta: InstalledRegistryMetadata = {
    version: manifest.version,
    platformKey,
    commandPath,
    args: target.args ?? [],
    sha256: target.sha256,
    installedAt: new Date().toISOString(),
  }
  await writeFile(
    path.join(registryCacheDir(), 'installed.json'),
    JSON.stringify(installedMeta, null, 2),
    'utf8',
  )

  return {
    source: 'acp-registry',
    command: commandPath,
    args: installedMeta.args,
    displayPath: commandPath,
  }
}

function extractAntigravityTier(
  meta: Record<string, unknown> | undefined,
): string | null {
  if (!meta) return null
  const agMeta = meta.antigravity as Record<string, unknown> | undefined
  const candidate = agMeta?.tier ?? agMeta?.plan ?? meta.tier ?? meta.planName
  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim()
  }
  if (
    candidate &&
    typeof candidate === 'object' &&
    'name' in candidate &&
    typeof (candidate as { name?: unknown }).name === 'string'
  ) {
    return (candidate as { name: string }).name
  }
  return null
}

class AntigravityAcpManager {
  private readonly runtime: AcpProcessRuntime<AntigravityBinarySource>
  private activeAuthMethod: string | null = null
  private ephemeralApiKey: string | null = null
  private cachedModels: AntigravityModelOption[] = []
  private cachedCurrentModelId: string | null = null
  private cachedModelConfigId: string | null = null
  private cachedConfigOptions: AntigravityConfigOption[] = []
  private cachedTier: string | null = null
  private authLock: Promise<AntigravityRuntimeStatus> | null = null

  constructor() {
    this.runtime = new AcpProcessRuntime<AntigravityBinarySource>({
      providerLabel: 'Antigravity',
      defaultAgentName: 'Antigravity ACP Server',
      workspaceDir: scratchWorkspaceDir,
      resolveBinary: resolveAntigravityBinary,
      getEnv: () => {
        const env: NodeJS.ProcessEnv = { ...process.env }
        if (this.ephemeralApiKey) {
          env.GEMINI_API_KEY = this.ephemeralApiKey
        }
        return env
      },
      missingBinaryMessage: () =>
        'Google Antigravity ACP binary (`agy`) is not installed. Install Antigravity CLI or download the official ACP Registry binary from Models & Providers.',
      authRequiredMessage: () =>
        'Google Antigravity is not signed in. Open Models & Providers to sign in with your Google AI plan.',
      createError: (code, message, httpStatus) =>
        new AntigravityAcpError(code, message, httpStatus),
    })
  }

  async shutdown(): Promise<void> {
    await this.runtime.shutdown()
  }

  private cacheDiscovery(discovery: AcpSessionDiscovery): void {
    this.cachedModels = discovery.models
    this.cachedCurrentModelId = discovery.currentModelId
    this.cachedModelConfigId = discovery.modelConfigId
    this.cachedConfigOptions = discovery.configOptions
    this.cachedTier = extractAntigravityTier(discovery.meta)
  }

  private buildStatus(
    init: InitializeResponse,
    binary: ResolvedBinary,
    authenticated: boolean,
    error?: string,
  ): AntigravityRuntimeStatus {
    const authMethods: AntigravityAuthMethodInfo[] = (
      init.authMethods ?? []
    ).map((method) => ({
      id: method.id,
      name: method.name,
      description: method.description ?? null,
    }))

    const capabilities = init.agentCapabilities

    return {
      ok: true,
      binaryAvailable: true,
      binarySource: binary.source,
      binaryPath: binary.displayPath,
      agentName: init.agentInfo?.name ?? 'Antigravity ACP Server',
      agentVersion: init.agentInfo?.version ?? undefined,
      protocolVersion: init.protocolVersion,
      authenticated,
      activeAuthMethod: authenticated
        ? (this.activeAuthMethod ??
          (this.ephemeralApiKey ? 'gemini-api-key' : 'oauth-personal'))
        : null,
      authMethods,
      tier: authenticated ? this.cachedTier : null,
      models: authenticated ? this.cachedModels : [],
      currentModelId: authenticated ? this.cachedCurrentModelId : null,
      configOptions: authenticated ? this.cachedConfigOptions : [],
      supportsLogout: Boolean(capabilities?.auth?.logout),
      supportsImagePrompt: Boolean(capabilities?.promptCapabilities?.image),
      compliance: COMPLIANCE_INFO,
      error,
    }
  }

  async getStatus(): Promise<AntigravityRuntimeStatus> {
    let connState: Awaited<
      ReturnType<AcpProcessRuntime<AntigravityBinarySource>['ensureConnected']>
    >
    try {
      connState = await this.runtime.ensureConnected()
    } catch (error) {
      const missing =
        error instanceof AntigravityAcpError && error.code === 'BINARY_MISSING'
      return {
        ok: true,
        binaryAvailable: !missing,
        binarySource: 'none',
        authenticated: false,
        activeAuthMethod: null,
        authMethods: [],
        tier: null,
        models: [],
        currentModelId: null,
        configOptions: [],
        supportsLogout: false,
        supportsImagePrompt: false,
        compliance: COMPLIANCE_INFO,
        error:
          error instanceof Error
            ? error.message
            : 'Antigravity ACP runtime unavailable',
      }
    }

    const { init, binary } = connState
    try {
      const { discovery } = await this.runtime.probeSession(15_000)
      this.cacheDiscovery(discovery)
      return this.buildStatus(init, binary, true)
    } catch (error) {
      if (isAcpAuthRequiredError(error)) {
        this.cachedModels = []
        this.cachedCurrentModelId = null
        this.cachedConfigOptions = []
        this.cachedTier = null
        return this.buildStatus(init, binary, false)
      }
      return this.buildStatus(
        init,
        binary,
        false,
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  async authenticate(
    methodId: AntigravityAuthMethodId | string,
    options?: { apiKey?: string },
  ): Promise<AntigravityRuntimeStatus> {
    if (this.authLock) return this.authLock

    const run = (async (): Promise<AntigravityRuntimeStatus> => {
      if (methodId === 'gemini-api-key') {
        const key = options?.apiKey?.trim()
        if (key) {
          this.ephemeralApiKey = key
          this.runtime.retireConnection()
        } else if (!this.ephemeralApiKey && !process.env.GEMINI_API_KEY) {
          throw new AntigravityAcpError(
            'AUTH_REQUIRED',
            'Enter a Gemini Developer API key (from Google AI Studio) to authenticate with gemini-api-key.',
            400,
          )
        }
      } else if (this.ephemeralApiKey) {
        // Clear any temporary API key override when signing in with Google OAuth / Enterprise.
        this.ephemeralApiKey = null
        this.runtime.retireConnection()
      }

      const { connection } = await this.runtime.ensureConnected()
      await connection.agent.request(
        'authenticate',
        { methodId },
        {
          cancellationSignal: AbortSignal.timeout(5 * 60_000),
          stopWaitingOnCancel: true,
        },
      )
      this.activeAuthMethod = methodId
      return await this.getStatus()
    })()

    this.authLock = run
    try {
      return await run
    } finally {
      this.authLock = null
    }
  }

  async logout(): Promise<AntigravityRuntimeStatus> {
    this.ephemeralApiKey = null
    this.activeAuthMethod = null
    this.cachedModels = []
    this.cachedCurrentModelId = null
    this.cachedConfigOptions = []
    this.cachedTier = null

    try {
      const { connection } = await this.runtime.ensureConnected()
      await connection.agent.request(
        'logout',
        {},
        {
          cancellationSignal: AbortSignal.timeout(10_000),
          stopWaitingOnCancel: true,
        },
      )
    } catch {
      // Ignore if logout is already cleared or connection was down.
    }

    await this.shutdown()
    return await this.getStatus()
  }

  async installBinary(): Promise<AntigravityRuntimeStatus> {
    await this.shutdown()
    await installOfficialAntigravityBinary()
    return await this.getStatus()
  }

  async runPrompt(
    input: AntigravityPromptInput,
  ): Promise<AntigravityPromptOutput> {
    return await this.runtime.runPrompt(input, {
      defaultModelId: this.cachedCurrentModelId ?? 'antigravity-default',
      cachedModelConfigId: this.cachedModelConfigId,
      onDiscovery: (discovered) => {
        if (discovered.models.length > 0) {
          this.cacheDiscovery(discovered)
        }
      },
      resolveRequestedModel: (requestedModelId, discovered) => {
        const requested = fromXDriveAntigravityModelId(requestedModelId).trim()
        if (!requested || requested === 'auto' || requested === 'default') {
          return null
        }
        const match = discovered.models.find(
          (item) =>
            item.id === requested ||
            item.name.toLowerCase() === requested.toLowerCase(),
        )
        return match?.id ?? requested
      },
    })
  }
}

const globalKey = '__xdriveAntigravityAcpManager__'
const globalHolder = globalThis as typeof globalThis & {
  [globalKey]?: AntigravityAcpManager
}

export function getAntigravityAcpManager(): AntigravityAcpManager {
  if (!globalHolder[globalKey]) {
    globalHolder[globalKey] = new AntigravityAcpManager()
  }
  return globalHolder[globalKey]
}
