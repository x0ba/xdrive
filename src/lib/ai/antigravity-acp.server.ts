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
import { execFile, spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import {
  access,
  chmod,
  constants as fsConstants,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
import { promisify } from 'node:util'
import JSZip from 'jszip'
import {
  PROTOCOL_VERSION,
  client as createAcpClient,
  ndJsonStream,
} from '@agentclientprotocol/sdk/unstable'
import type {
  ClientConnection,
  ContentBlock,
  InitializeResponse,
  NewSessionResponse,
  SessionConfigOption,
} from '@agentclientprotocol/sdk/unstable'
import type {
  AntigravityAuthMethodId,
  AntigravityAuthMethodInfo,
  AntigravityBinarySource,
  AntigravityConfigOption,
  AntigravityModelOption,
  AntigravityRuntimeStatus,
} from './antigravity-types'
import { fromXDriveAntigravityModelId } from './antigravity-types'

const execFileAsync = promisify(execFile)

const ACP_REGISTRY_MANIFEST_URL =
  'https://raw.githubusercontent.com/agentclientprotocol/registry/main/antigravity-acp/agent.json'
const ALLOWED_RELEASE_HOST = 'dl.google.com'

const COMPLIANCE_INFO = {
  protocol: 'ACP (JSON-RPC 2.0 over stdio)' as const,
  unmodifiedOfficialBinary: true,
  nativeAuthOnly: true,
  tokenExtraction: false as const,
}

interface ResolvedBinary {
  source: AntigravityBinarySource
  command: string
  args: string[]
  displayPath: string
}

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

export interface AntigravityPromptInput {
  prompt: string
  modelId?: string
  imageDataUrls?: string[]
  signal?: AbortSignal
}

export interface AntigravityPromptOutput {
  text: string
  thoughts: string[]
  stopReason: string
  modelId: string
  agentName: string
  agentVersion: string
}

export class AntigravityAcpError extends Error {
  readonly code:
    | 'BINARY_MISSING'
    | 'AUTH_REQUIRED'
    | 'ACP_ERROR'
    | 'TIMEOUT'
    | 'INSTALL_FAILED'
  readonly httpStatus: number

  constructor(
    code: AntigravityAcpError['code'],
    message: string,
    httpStatus = 500,
  ) {
    super(message)
    this.name = 'AntigravityAcpError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

function registryCacheDir(): string {
  return path.join(os.homedir(), '.xdrive', 'acp', 'antigravity-acp')
}

function scratchWorkspaceDir(): string {
  return path.join(os.tmpdir(), 'xdrive-antigravity-acp-workspace')
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

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(
      filePath,
      process.platform === 'win32' ? fsConstants.F_OK : fsConstants.X_OK,
    )
    return true
  } catch {
    return false
  }
}

async function whichBinary(cmd: string): Promise<string | null> {
  try {
    const tool = process.platform === 'win32' ? 'where' : 'which'
    const { stdout } = await execFileAsync(tool, [cmd], { timeout: 2500 })
    const first = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
    if (first && (await isExecutable(first))) return first
  } catch {
    // Ignore PATH lookup failure and fall through to known install locations.
  }
  return null
}

async function readInstalledRegistryBinary(): Promise<ResolvedBinary | null> {
  const metaPath = path.join(registryCacheDir(), 'installed.json')
  try {
    const raw = await readFile(metaPath, 'utf8')
    const meta = JSON.parse(raw) as InstalledRegistryMetadata
    if (
      meta.commandPath &&
      (await isExecutable(meta.commandPath))
    ) {
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
    const normalized = path.normalize(entryName).replace(/^(\.\.(\/|\\|$))+/, '')
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

function normalizeConfigOptions(
  rawOptions: SessionConfigOption[] | null | undefined,
): AntigravityConfigOption[] {
  if (!Array.isArray(rawOptions)) return []
  const result: AntigravityConfigOption[] = []
  for (const opt of rawOptions) {
    if (opt.type !== 'select') continue
    const choices: AntigravityConfigOption['options'] = []
    if (Array.isArray(opt.options)) {
      for (const entry of opt.options) {
        if ('options' in entry && Array.isArray(entry.options)) {
          for (const nested of entry.options) {
            choices.push({
              value: nested.value,
              name: nested.name,
              description: nested.description ?? null,
            })
          }
        } else if ('value' in entry) {
          choices.push({
            value: entry.value,
            name: entry.name,
            description: entry.description ?? null,
          })
        }
      }
    }
    result.push({
      id: opt.id,
      name: opt.name,
      description: opt.description ?? null,
      category: opt.category ?? null,
      currentValue: opt.currentValue,
      options: choices,
    })
  }
  return result
}

function extractModelsFromSession(session: NewSessionResponse): {
  models: AntigravityModelOption[]
  currentModelId: string | null
  modelConfigId: string | null
  configOptions: AntigravityConfigOption[]
  tier: string | null
} {
  const configOptions = normalizeConfigOptions(session.configOptions)
  const modelConfig =
    configOptions.find((opt) => opt.category === 'model') ??
    configOptions.find((opt) => opt.id.toLowerCase() === 'model') ??
    null

  let models: AntigravityModelOption[] = []
  let currentModelId: string | null = null

  if (modelConfig && modelConfig.options.length > 0) {
    currentModelId = modelConfig.currentValue || modelConfig.options[0].value
    models = modelConfig.options.map((choice) => ({
      id: choice.value,
      name: choice.name,
      description: choice.description ?? null,
      isDefault: choice.value === currentModelId,
    }))
  } else {
    // Support legacy ACP `models` extension on NewSessionResponse if returned.
    const legacy = (
      session as NewSessionResponse & {
        models?: {
          currentModelId?: string
          availableModels?: Array<{
            modelId?: string
            id?: string
            name?: string
            description?: string
          }>
        }
      }
    ).models
    if (legacy && Array.isArray(legacy.availableModels)) {
      currentModelId = legacy.currentModelId ?? null
      models = legacy.availableModels
        .map((item) => {
          const id = item.modelId ?? item.id ?? ''
          if (!id) return null
          return {
            id,
            name: item.name || id,
            description: item.description ?? null,
            isDefault: id === currentModelId,
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    }
  }

  let tier: string | null = null
  const meta = session._meta as Record<string, unknown> | undefined
  if (meta) {
    const agMeta = meta.antigravity as Record<string, unknown> | undefined
    const candidate =
      agMeta?.tier ?? agMeta?.plan ?? meta.tier ?? meta.planName
    if (typeof candidate === 'string' && candidate.trim()) {
      tier = candidate.trim()
    } else if (
      candidate &&
      typeof candidate === 'object' &&
      'name' in candidate &&
      typeof (candidate as { name?: unknown }).name === 'string'
    ) {
      tier = (candidate as { name: string }).name
    }
  }

  return {
    models,
    currentModelId,
    modelConfigId: modelConfig?.id ?? null,
    configOptions,
    tier,
  }
}

function isAuthRequiredError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  const message =
    error instanceof Error
      ? error.message
      : String((error as { message?: unknown }).message ?? '')
  return code === -32000 || /authentication required|not authenticated/i.test(message)
}

function parseDataUrlImage(
  dataUrl: string,
): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) return null
  return { mimeType: match[1], data: match[2] }
}

class AntigravityAcpManager {
  private child: ChildProcessWithoutNullStreams | null = null
  private connection: ClientConnection | null = null
  private initResponse: InitializeResponse | null = null
  private resolvedBinary: ResolvedBinary | null = null
  private stderrTail: string[] = []
  private activeAuthMethod: string | null = null
  private ephemeralApiKey: string | null = null
  private cachedModels: AntigravityModelOption[] = []
  private cachedCurrentModelId: string | null = null
  private cachedModelConfigId: string | null = null
  private cachedConfigOptions: AntigravityConfigOption[] = []
  private cachedTier: string | null = null
  private connectingPromise: Promise<void> | null = null
  private authLock: Promise<AntigravityRuntimeStatus> | null = null

  private isAlive(): boolean {
    return Boolean(
      this.child &&
        this.connection &&
        this.initResponse &&
        this.child.exitCode === null &&
        !this.child.killed &&
        !this.connection.signal.aborted,
    )
  }

  async shutdown(): Promise<void> {
    const conn = this.connection
    const proc = this.child
    this.connection = null
    this.child = null
    this.initResponse = null
    this.connectingPromise = null
    try {
      conn?.close()
    } catch {
      // ignore close errors
    }
    if (proc && proc.exitCode === null && !proc.killed) {
      proc.kill('SIGTERM')
    }
  }

  private async ensureConnected(): Promise<{
    connection: ClientConnection
    init: InitializeResponse
    binary: ResolvedBinary
  }> {
    if (this.isAlive() && this.connection && this.initResponse && this.resolvedBinary) {
      return {
        connection: this.connection,
        init: this.initResponse,
        binary: this.resolvedBinary,
      }
    }

    if (this.connectingPromise) {
      await this.connectingPromise
      if (this.connection && this.initResponse && this.resolvedBinary) {
        return {
          connection: this.connection,
          init: this.initResponse,
          binary: this.resolvedBinary,
        }
      }
    }

    this.connectingPromise = this.startProcess()
    try {
      await this.connectingPromise
    } finally {
      this.connectingPromise = null
    }

    if (!this.connection || !this.initResponse || !this.resolvedBinary) {
      throw new AntigravityAcpError(
        'ACP_ERROR',
        'Failed to initialize Antigravity ACP runtime.',
        503,
      )
    }

    return {
      connection: this.connection,
      init: this.initResponse,
      binary: this.resolvedBinary,
    }
  }

  private async startProcess(): Promise<void> {
    await this.shutdown()
    const binary = await resolveAntigravityBinary()
    if (!binary) {
      this.resolvedBinary = null
      throw new AntigravityAcpError(
        'BINARY_MISSING',
        'Google Antigravity ACP binary (`agy`) is not installed. Install Antigravity CLI or download the official ACP Registry binary from Models & Providers.',
        503,
      )
    }

    await mkdir(scratchWorkspaceDir(), { recursive: true })
    this.stderrTail = []

    const env: NodeJS.ProcessEnv = { ...process.env }
    if (this.ephemeralApiKey) {
      env.GEMINI_API_KEY = this.ephemeralApiKey
    }

    const child = spawn(binary.command, binary.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: scratchWorkspaceDir(),
      env,
    })

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8').trim()
      if (!text) return
      this.stderrTail.push(text)
      if (this.stderrTail.length > 20) this.stderrTail.shift()
    })

    child.on('exit', () => {
      if (this.child === child) {
        this.child = null
        this.connection = null
        this.initResponse = null
      }
    })

    const output = Writable.toWeb(child.stdin) as WritableStream<Uint8Array>
    const input = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>
    const stream = ndJsonStream(output, input)

    const acpClient = createAcpClient({ name: 'xDrive' })
      // Deny arbitrary tool/command execution during Marble proposal generation.
      .onRequest('session/request_permission', () => ({
        outcome: { outcome: 'cancelled' },
      }))

    const connection = acpClient.connect(stream)

    try {
      const init = await connection.agent.request(
        'initialize',
        {
          protocolVersion: PROTOCOL_VERSION,
          clientCapabilities: {},
          clientInfo: {
            name: 'xDrive',
            version: '0.1.0',
          },
        },
        {
          cancellationSignal: AbortSignal.timeout(15_000),
          stopWaitingOnCancel: true,
        },
      )
      this.child = child
      this.connection = connection
      this.initResponse = init
      this.resolvedBinary = binary
    } catch (error) {
      try {
        connection.close()
      } catch {
        // ignore
      }
      if (child.exitCode === null && !child.killed) {
        child.kill('SIGTERM')
      }
      const stderrSummary = this.stderrTail.slice(-3).join(' | ')
      throw new AntigravityAcpError(
        'ACP_ERROR',
        `Antigravity ACP handshake failed: ${
          error instanceof Error ? error.message : String(error)
        }${stderrSummary ? ` (${stderrSummary})` : ''}`,
        503,
      )
    }
  }

  private buildStatus(
    init: InitializeResponse,
    binary: ResolvedBinary,
    authenticated: boolean,
    error?: string,
  ): AntigravityRuntimeStatus {
    const authMethods: AntigravityAuthMethodInfo[] = (init.authMethods ?? []).map(
      (method) => ({
        id: method.id,
        name: method.name,
        description: method.description ?? null,
      }),
    )

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
    let connState: Awaited<ReturnType<AntigravityAcpManager['ensureConnected']>>
    try {
      connState = await this.ensureConnected()
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

    const { connection, init, binary } = connState
    try {
      const session = await connection.agent.request(
        'session/new',
        {
          cwd: scratchWorkspaceDir(),
          mcpServers: [],
        },
        {
          cancellationSignal: AbortSignal.timeout(15_000),
          stopWaitingOnCancel: true,
        },
      )
      const discovered = extractModelsFromSession(session)
      this.cachedModels = discovered.models
      this.cachedCurrentModelId = discovered.currentModelId
      this.cachedModelConfigId = discovered.modelConfigId
      this.cachedConfigOptions = discovered.configOptions
      this.cachedTier = discovered.tier

      // Close the probe session so we don't accumulate idle sessions.
      void connection.agent
        .request('session/close', { sessionId: session.sessionId })
        .catch(() => {})

      return this.buildStatus(init, binary, true)
    } catch (error) {
      if (isAuthRequiredError(error)) {
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
          await this.shutdown()
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
        await this.shutdown()
      }

      const { connection } = await this.ensureConnected()
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
      const { connection } = await this.ensureConnected()
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
    const { connection, init } = await this.ensureConnected()
    const cwd = scratchWorkspaceDir()
    await mkdir(cwd, { recursive: true })

    let activeSession
    try {
      activeSession = await connection.agent
        .buildSession({ cwd, mcpServers: [] })
        .start({
          cancellationSignal: input.signal
            ? AbortSignal.any([input.signal, AbortSignal.timeout(20_000)])
            : AbortSignal.timeout(20_000),
          stopWaitingOnCancel: true,
        })
    } catch (error) {
      if (isAuthRequiredError(error)) {
        throw new AntigravityAcpError(
          'AUTH_REQUIRED',
          'Google Antigravity is not signed in. Open Models & Providers to sign in with your Google AI plan.',
          401,
        )
      }
      throw new AntigravityAcpError(
        'ACP_ERROR',
        error instanceof Error
          ? error.message
          : 'Failed to create Antigravity ACP session.',
        502,
      )
    }

    try {
      const discovered = extractModelsFromSession(
        activeSession.newSessionResponse,
      )
      if (discovered.models.length > 0) {
        this.cachedModels = discovered.models
        this.cachedCurrentModelId = discovered.currentModelId
        this.cachedModelConfigId = discovered.modelConfigId
        this.cachedConfigOptions = discovered.configOptions
        this.cachedTier = discovered.tier
      }

      let activeModelId =
        discovered.currentModelId ??
        this.cachedCurrentModelId ??
        'antigravity-default'

      const requestedModel = input.modelId
        ? fromXDriveAntigravityModelId(input.modelId).trim()
        : ''
      if (
        requestedModel &&
        requestedModel !== 'auto' &&
        requestedModel !== 'default' &&
        requestedModel !== activeModelId
      ) {
        const configId = discovered.modelConfigId ?? this.cachedModelConfigId
        const matchingOption = discovered.models.find(
          (item) =>
            item.id === requestedModel ||
            item.name.toLowerCase() === requestedModel.toLowerCase(),
        )
        const targetModelValue = matchingOption?.id ?? requestedModel
        if (configId) {
          try {
            await connection.agent.request('session/set_config_option', {
              sessionId: activeSession.sessionId,
              configId,
              value: targetModelValue,
            })
            activeModelId = targetModelValue
          } catch {
            // Fall back to session's default model if the requested model is unavailable on this tier.
          }
        } else {
          try {
            await connection.agent.request('session/set_model', {
              sessionId: activeSession.sessionId,
              modelId: targetModelValue,
            })
            activeModelId = targetModelValue
          } catch {
            // Fall back to default model.
          }
        }
      }

      const blocks: ContentBlock[] = [{ type: 'text', text: input.prompt }]
      const supportsImages = Boolean(
        init.agentCapabilities?.promptCapabilities?.image,
      )
      if (supportsImages && input.imageDataUrls?.length) {
        for (const dataUrl of input.imageDataUrls.slice(0, 3)) {
          const parsed = parseDataUrlImage(dataUrl)
          if (parsed) {
            blocks.push({
              type: 'image',
              mimeType: parsed.mimeType,
              data: parsed.data,
            })
          }
        }
      }

      const promptPromise = activeSession.prompt(blocks, {
        cancellationSignal: input.signal
          ? AbortSignal.any([input.signal, AbortSignal.timeout(120_000)])
          : AbortSignal.timeout(120_000),
        stopWaitingOnCancel: true,
      })
      // Avoid unhandled rejection if the update loop exits early.
      promptPromise.catch(() => {})

      let text = ''
      let currentThought = ''
      const thoughts: string[] = []
      let stopReason = 'end_turn'

      let msg = await activeSession.nextUpdate()
      while (msg.kind !== 'stop') {
        const update = msg.update
        if (
          update.sessionUpdate === 'agent_message_chunk' &&
          update.content.type === 'text'
        ) {
          text += update.content.text
        } else if (
          update.sessionUpdate === 'agent_thought_chunk' &&
          update.content.type === 'text'
        ) {
          currentThought += update.content.text
        }
        msg = await activeSession.nextUpdate()
      }
      stopReason = msg.stopReason

      await promptPromise

      if (currentThought.trim()) {
        thoughts.push(currentThought.trim())
      }

      return {
        text: text.trim(),
        thoughts,
        stopReason,
        modelId: activeModelId,
        agentName: init.agentInfo?.name ?? 'Antigravity ACP Server',
        agentVersion: init.agentInfo?.version ?? 'unknown',
      }
    } finally {
      activeSession.dispose()
      void connection.agent
        .request('session/close', { sessionId: activeSession.sessionId })
        .catch(() => {})
    }
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
