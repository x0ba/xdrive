// Shared server-only Agent Client Protocol (ACP) runtime plumbing.
//
// Provides reusable process lifecycle, JSON-RPC 2.0 over stdio transport
// (`@agentclientprotocol/sdk`), session discovery, model/reasoning config
// selection, streaming delta forwarding, and deny-by-default permission
// handling for ACP harnesses (Google Antigravity, OpenCode, etc.).

import { execFile, spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { access, constants as fsConstants, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
import { promisify } from 'node:util'
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

const execFileAsync = promisify(execFile)

export type AcpErrorCode =
  | 'BINARY_MISSING'
  | 'AUTH_REQUIRED'
  | 'ACP_ERROR'
  | 'TIMEOUT'
  | 'INSTALL_FAILED'

export class AcpError extends Error {
  readonly code: AcpErrorCode
  readonly httpStatus: number

  constructor(code: AcpErrorCode, message: string, httpStatus = 500) {
    super(message)
    this.name = 'AcpError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

export interface ResolvedAcpBinary<TSource extends string = string> {
  source: TSource
  command: string
  args: string[]
  displayPath: string
}

export interface AcpAuthMethodInfo {
  id: string
  name: string
  description?: string | null
}

export interface AcpModelOption {
  id: string
  name: string
  description?: string | null
  isDefault?: boolean
}

export interface AcpConfigSelectChoice {
  value: string
  name: string
  description?: string | null
}

export interface AcpConfigOption {
  id: string
  name: string
  description?: string | null
  category?: string | null
  currentValue: string
  options: AcpConfigSelectChoice[]
}

export interface AcpSessionDiscovery {
  models: AcpModelOption[]
  currentModelId: string | null
  modelConfigId: string | null
  configOptions: AcpConfigOption[]
  meta: Record<string, unknown> | undefined
}

export const DEFAULT_ACP_PROMPT_IDLE_TIMEOUT_MS = 90_000
export const DEFAULT_ACP_PROMPT_MAX_DURATION_MS = 600_000

export type PromptAbortReason = 'idle_timeout' | 'max_duration' | 'client_abort'

export interface PromptTimeoutOptions {
  idleTimeoutMs: number
  maxDurationMs: number
  clientSignal?: AbortSignal
}

export interface PromptTimeoutController {
  readonly signal: AbortSignal
  /** Reset the idle timeout window (call on every session/update chunk). */
  touch: () => void
  /** Reason the signal aborted, or null if still active / cleaned up cleanly. */
  getAbortReason: () => PromptAbortReason | null
  /** Elapsed milliseconds since this controller was created. */
  getElapsedMs: () => number
  /** Clear timers and remove external signal listeners. */
  cleanup: () => void
}

export interface AcpPromptInput {
  prompt: string
  modelId?: string
  reasoningEffort?: 'off' | 'low' | 'medium' | 'high' | 'max'
  imageDataUrls?: string[]
  signal?: AbortSignal
  idleTimeoutMs?: number
  maxDurationMs?: number
  onTextDelta?: (delta: string) => void
  onThoughtDelta?: (delta: string) => void
}

export interface AcpPromptOutput {
  text: string
  thoughts: string[]
  stopReason: string
  modelId: string
  agentName: string
  agentVersion: string
}

export interface AcpRuntimeOptions<TSource extends string> {
  providerLabel: string
  defaultAgentName: string
  workspaceDir: () => string
  resolveBinary: () => Promise<ResolvedAcpBinary<TSource> | null>
  getEnv?: () => NodeJS.ProcessEnv
  missingBinaryMessage: () => string
  authRequiredMessage: () => string
  initTimeoutMs?: number
  sessionTimeoutMs?: number
  promptIdleTimeoutMs?: number
  promptMaxDurationMs?: number
  createError?: (
    code: AcpErrorCode,
    message: string,
    httpStatus?: number,
  ) => Error
}

export function acpCacheDir(providerSlug: string): string {
  return path.join(os.homedir(), '.xdrive', 'acp', providerSlug)
}

export function acpScratchWorkspaceDir(providerSlug: string): string {
  return path.join(os.tmpdir(), `xdrive-${providerSlug}-acp-workspace`)
}

export async function isExecutable(filePath: string): Promise<boolean> {
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

export async function whichBinary(cmd: string): Promise<string | null> {
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

export function normalizeAcpConfigOptions(
  rawOptions: SessionConfigOption[] | null | undefined,
): AcpConfigOption[] {
  if (!Array.isArray(rawOptions)) return []
  const result: AcpConfigOption[] = []
  for (const opt of rawOptions) {
    if (opt.type !== 'select') continue
    const choices: AcpConfigOption['options'] = []
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

export function extractAcpSessionDiscovery(
  session: NewSessionResponse,
): AcpSessionDiscovery {
  const configOptions = normalizeAcpConfigOptions(session.configOptions)
  const modelConfig =
    configOptions.find((opt) => opt.category === 'model') ??
    configOptions.find((opt) => opt.id.toLowerCase() === 'model') ??
    null

  let models: AcpModelOption[] = []
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
    // Support ACP `models` extension on NewSessionResponse (used by OpenCode and legacy ACP servers).
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

  return {
    models,
    currentModelId,
    modelConfigId: modelConfig?.id ?? null,
    configOptions,
    meta: session._meta as Record<string, unknown> | undefined,
  }
}

export function isAcpAuthRequiredError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  const message =
    error instanceof Error
      ? error.message
      : String((error as { message?: unknown }).message ?? '')
  return (
    code === -32000 ||
    /authentication required|not authenticated|unauthorized|api key.*missing|no.*credentials/i.test(
      message,
    )
  )
}

export function formatTimeoutDuration(ms: number): string {
  const safeMs = Math.max(1, Math.round(ms))
  if (safeMs % 1000 === 0) {
    return `${safeMs / 1000}s`
  }
  const seconds = safeMs / 1000
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`
}

function parsePositiveMs(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : null
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null
  }
  return null
}

export function resolvePromptTimeoutConfig(params: {
  inputIdleTimeoutMs?: number
  inputMaxDurationMs?: number
  optionIdleTimeoutMs?: number
  optionMaxDurationMs?: number
  env?: NodeJS.ProcessEnv
}): { idleTimeoutMs: number; maxDurationMs: number } {
  const env = params.env ?? process.env
  const idleTimeoutMs =
    parsePositiveMs(params.inputIdleTimeoutMs) ??
    parsePositiveMs(env.XDRIVE_ACP_IDLE_TIMEOUT_MS) ??
    parsePositiveMs(params.optionIdleTimeoutMs) ??
    DEFAULT_ACP_PROMPT_IDLE_TIMEOUT_MS

  const maxDurationMs =
    parsePositiveMs(params.inputMaxDurationMs) ??
    parsePositiveMs(env.XDRIVE_ACP_MAX_DURATION_MS) ??
    parsePositiveMs(params.optionMaxDurationMs) ??
    DEFAULT_ACP_PROMPT_MAX_DURATION_MS

  return { idleTimeoutMs, maxDurationMs }
}

export function createAcpClientAbortError(reason?: unknown): Error {
  if (isAcpClientAbortError(reason) && reason instanceof Error) {
    return reason
  }
  const err = new Error('Request cancelled by client')
  err.name = 'AbortError'
  return err
}

export function isAcpClientAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = (error as { name?: unknown }).name
  return name === 'AbortError'
}

export function isAcpTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const record = error as {
    name?: unknown
    code?: unknown
    data?: unknown
  }
  if (record.name === 'TimeoutError') return true
  if (
    record.data &&
    typeof record.data === 'object' &&
    (record.data as { name?: unknown }).name === 'TimeoutError'
  ) {
    return true
  }
  return false
}

export function createPromptTimeoutController(
  options: PromptTimeoutOptions,
): PromptTimeoutController {
  const startedAt = Date.now()
  const controller = new AbortController()
  let abortReason: PromptAbortReason | null = null
  let cleanedUp = false
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let maxTimer: ReturnType<typeof setTimeout> | null = null

  const clearTimers = () => {
    if (idleTimer !== null) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
    if (maxTimer !== null) {
      clearTimeout(maxTimer)
      maxTimer = null
    }
  }

  const abortWith = (reason: PromptAbortReason, errorReason?: unknown) => {
    if (abortReason !== null || cleanedUp) return
    abortReason = reason
    clearTimers()
    controller.abort(
      errorReason ??
        (reason === 'client_abort'
          ? createAcpClientAbortError()
          : new DOMException(
              reason === 'idle_timeout'
                ? 'ACP prompt idle timeout'
                : 'ACP prompt maximum duration exceeded',
              'TimeoutError',
            )),
    )
  }

  const armIdleTimer = () => {
    if (idleTimer !== null) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
    if (
      cleanedUp ||
      abortReason !== null ||
      !Number.isFinite(options.idleTimeoutMs) ||
      options.idleTimeoutMs <= 0
    ) {
      return
    }
    idleTimer = setTimeout(() => {
      abortWith(
        'idle_timeout',
        new DOMException('ACP prompt idle timeout', 'TimeoutError'),
      )
    }, options.idleTimeoutMs)
  }

  const onClientAbort = () => {
    abortWith(
      'client_abort',
      createAcpClientAbortError(options.clientSignal?.reason),
    )
  }

  if (options.clientSignal?.aborted) {
    onClientAbort()
  } else {
    options.clientSignal?.addEventListener('abort', onClientAbort, {
      once: true,
    })
    armIdleTimer()
    if (Number.isFinite(options.maxDurationMs) && options.maxDurationMs > 0) {
      maxTimer = setTimeout(() => {
        abortWith(
          'max_duration',
          new DOMException(
            'ACP prompt maximum duration exceeded',
            'TimeoutError',
          ),
        )
      }, options.maxDurationMs)
    }
  }

  return {
    signal: controller.signal,
    touch: () => {
      if (cleanedUp || abortReason !== null) return
      armIdleTimer()
    },
    getAbortReason: () => abortReason,
    getElapsedMs: () => Math.max(0, Date.now() - startedAt),
    cleanup: () => {
      if (cleanedUp) return
      cleanedUp = true
      clearTimers()
      options.clientSignal?.removeEventListener('abort', onClientAbort)
    },
  }
}

export function mapAcpPromptError(params: {
  error: unknown
  providerLabel: string
  abortReason: PromptAbortReason | null
  clientAborted: boolean
  idleTimeoutMs: number
  maxDurationMs: number
  authRequiredMessage: string
  makeError: (code: AcpErrorCode, message: string, httpStatus?: number) => Error
}): Error {
  const {
    error,
    providerLabel,
    abortReason,
    clientAborted,
    idleTimeoutMs,
    maxDurationMs,
    authRequiredMessage,
    makeError,
  } = params

  if (
    abortReason === 'client_abort' ||
    (clientAborted && abortReason === null)
  ) {
    return createAcpClientAbortError(error)
  }

  if (abortReason === 'idle_timeout') {
    return makeError(
      'TIMEOUT',
      `${providerLabel} timed out after ${formatTimeoutDuration(idleTimeoutMs)} with no response.`,
      504,
    )
  }

  if (abortReason === 'max_duration') {
    return makeError(
      'TIMEOUT',
      `${providerLabel} timed out (exceeded ${formatTimeoutDuration(maxDurationMs)}).`,
      504,
    )
  }

  if (isAcpAuthRequiredError(error)) {
    return makeError('AUTH_REQUIRED', authRequiredMessage, 401)
  }

  if (error instanceof AcpError) {
    return error
  }

  if (isAcpTimeoutError(error)) {
    return makeError(
      'TIMEOUT',
      `${providerLabel} timed out after ${formatTimeoutDuration(idleTimeoutMs)} with no response.`,
      504,
    )
  }

  if (isAcpClientAbortError(error)) {
    return error instanceof Error ? error : createAcpClientAbortError(error)
  }

  return makeError(
    'ACP_ERROR',
    error instanceof Error
      ? error.message
      : `${providerLabel} ACP prompt failed.`,
    502,
  )
}

export function logAcpServerError(params: {
  route: string
  action?: string
  providerId: string
  modelId?: string
  elapsedMs?: number
  clientAborted?: boolean
  error: unknown
}): void {
  if (params.clientAborted || isAcpClientAbortError(params.error)) {
    return
  }
  const code =
    params.error instanceof AcpError
      ? params.error.code
      : params.error &&
          typeof params.error === 'object' &&
          'code' in params.error &&
          typeof (params.error as { code?: unknown }).code === 'string'
        ? (params.error as { code: string }).code
        : 'UNKNOWN_ERROR'
  const httpStatus =
    params.error instanceof AcpError
      ? params.error.httpStatus
      : params.error &&
          typeof params.error === 'object' &&
          'httpStatus' in params.error &&
          typeof (params.error as { httpStatus?: unknown }).httpStatus ===
            'number'
        ? (params.error as { httpStatus: number }).httpStatus
        : undefined
  const message =
    params.error instanceof Error ? params.error.message : String(params.error)

  console.error(`[${params.route}] AI request failed`, {
    ...(params.action ? { action: params.action } : {}),
    providerId: params.providerId,
    ...(params.modelId ? { modelId: params.modelId } : {}),
    code,
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    ...(params.elapsedMs !== undefined ? { elapsedMs: params.elapsedMs } : {}),
    error: message,
  })
}

export function parseDataUrlImage(
  dataUrl: string,
): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) return null
  return { mimeType: match[1], data: match[2] }
}

export interface AcpConnectedState<TSource extends string = string> {
  connection: ClientConnection
  init: InitializeResponse
  binary: ResolvedAcpBinary<TSource>
}

interface AcpConnectionHandle<
  TSource extends string,
> extends AcpConnectedState<TSource> {
  child: ChildProcessWithoutNullStreams
  activeRequests: number
  retired: boolean
}

export class AcpProcessRuntime<TSource extends string = string> {
  private activeHandle: AcpConnectionHandle<TSource> | null = null
  private readonly retiredHandles = new Set<AcpConnectionHandle<TSource>>()
  private stderrTail: string[] = []
  private connectingPromise: Promise<AcpConnectionHandle<TSource>> | null = null
  private connectionGeneration = 0
  private readonly options: AcpRuntimeOptions<TSource>

  constructor(options: AcpRuntimeOptions<TSource>) {
    this.options = options
  }

  private makeError(
    code: AcpErrorCode,
    message: string,
    httpStatus = 500,
  ): Error {
    if (this.options.createError) {
      return this.options.createError(code, message, httpStatus)
    }
    return new AcpError(code, message, httpStatus)
  }

  private isHandleAlive(
    handle: AcpConnectionHandle<TSource> | null,
  ): handle is AcpConnectionHandle<TSource> {
    return Boolean(
      handle &&
      handle.child.exitCode === null &&
      !handle.child.killed &&
      !handle.connection.signal.aborted,
    )
  }

  private terminateHandle(handle: AcpConnectionHandle<TSource>): void {
    this.retiredHandles.delete(handle)
    if (this.activeHandle === handle) {
      this.activeHandle = null
    }
    try {
      handle.connection.close()
    } catch {
      // ignore close errors
    }
    if (handle.child.exitCode === null && !handle.child.killed) {
      handle.child.kill('SIGTERM')
    }
  }

  private releaseHandle(handle: AcpConnectionHandle<TSource>): void {
    handle.activeRequests = Math.max(0, handle.activeRequests - 1)
    if (handle.retired && handle.activeRequests === 0) {
      this.terminateHandle(handle)
    }
  }

  isAlive(): boolean {
    return this.isHandleAlive(this.activeHandle)
  }

  hasActiveRequests(): boolean {
    if ((this.activeHandle?.activeRequests ?? 0) > 0) return true
    for (const handle of this.retiredHandles) {
      if (handle.activeRequests > 0) return true
    }
    return false
  }

  getRetiredHandleCount(): number {
    return this.retiredHandles.size
  }

  getStderrSummary(maxLines = 3): string {
    return this.stderrTail.slice(-maxLines).join(' | ')
  }

  // Non-disruptively detaches the current shared connection so subsequent
  // callers spawn a fresh ACP process while any in-flight prompts finish on
  // their existing process and clean up automatically once drained.
  retireConnection(): void {
    this.connectionGeneration += 1
    this.connectingPromise = null
    const handle = this.activeHandle
    if (!handle) return
    this.activeHandle = null
    handle.retired = true
    if (handle.activeRequests === 0) {
      this.terminateHandle(handle)
    } else {
      this.retiredHandles.add(handle)
    }
  }

  async shutdown(): Promise<void> {
    this.connectionGeneration += 1
    this.connectingPromise = null
    const active = this.activeHandle
    this.activeHandle = null
    if (active) {
      active.retired = true
      this.terminateHandle(active)
    }
    for (const handle of [...this.retiredHandles]) {
      handle.retired = true
      this.terminateHandle(handle)
    }
  }

  private async ensureHandle(): Promise<AcpConnectionHandle<TSource>> {
    if (this.isHandleAlive(this.activeHandle)) {
      return this.activeHandle
    }

    if (this.connectingPromise) {
      const pending = await this.connectingPromise
      if (this.isHandleAlive(pending) && !pending.retired) {
        return pending
      }
      if (this.isHandleAlive(this.activeHandle)) {
        return this.activeHandle
      }
    }

    const generation = ++this.connectionGeneration
    const promise = this.startProcess(generation)
    this.connectingPromise = promise
    try {
      const handle = await promise
      return handle
    } finally {
      if (this.connectingPromise === promise) {
        this.connectingPromise = null
      }
    }
  }

  async ensureConnected(): Promise<AcpConnectedState<TSource>> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const handle = await this.ensureHandle()
      if (!handle.retired) {
        return {
          connection: handle.connection,
          init: handle.init,
          binary: handle.binary,
        }
      }
      // This handle was superseded by retireConnection()/shutdown() while
      // starting. Since ensureConnected() does not track activeRequests,
      // reap it immediately if unused and acquire the current connection.
      if (handle.activeRequests === 0) {
        this.terminateHandle(handle)
      }
    }
    throw this.makeError(
      'ACP_ERROR',
      `${this.options.providerLabel} ACP connection was superseded during startup.`,
      503,
    )
  }

  async withConnection<T>(
    fn: (state: AcpConnectedState<TSource>) => Promise<T>,
  ): Promise<T> {
    const handle = await this.ensureHandle()
    handle.activeRequests += 1
    try {
      return await fn({
        connection: handle.connection,
        init: handle.init,
        binary: handle.binary,
      })
    } finally {
      this.releaseHandle(handle)
    }
  }

  private async startProcess(
    generation: number,
  ): Promise<AcpConnectionHandle<TSource>> {
    if (this.activeHandle && !this.isHandleAlive(this.activeHandle)) {
      this.terminateHandle(this.activeHandle)
    }
    const binary = await this.options.resolveBinary()
    if (!binary) {
      throw this.makeError(
        'BINARY_MISSING',
        this.options.missingBinaryMessage(),
        503,
      )
    }

    const cwd = this.options.workspaceDir()
    await mkdir(cwd, { recursive: true })
    this.stderrTail = []

    const env: NodeJS.ProcessEnv = this.options.getEnv
      ? this.options.getEnv()
      : { ...process.env }

    const child = spawn(binary.command, binary.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
      env,
    })

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8').trim()
      if (!text) return
      this.stderrTail.push(text)
      if (this.stderrTail.length > 20) this.stderrTail.shift()
    })

    const output = Writable.toWeb(child.stdin) as WritableStream<Uint8Array>
    const input = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>
    const stream = ndJsonStream(output, input)

    const acpClient = createAcpClient({ name: 'xDrive' })
      // Deny arbitrary tool/command execution during Marble proposal & Drive Chat generation.
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
          cancellationSignal: AbortSignal.timeout(
            this.options.initTimeoutMs ?? 15_000,
          ),
          stopWaitingOnCancel: true,
        },
      )
      const handle: AcpConnectionHandle<TSource> = {
        child,
        connection,
        init,
        binary,
        activeRequests: 0,
        retired: false,
      }
      child.on('exit', () => {
        if (this.activeHandle === handle) {
          this.activeHandle = null
        }
        this.retiredHandles.delete(handle)
      })
      if (generation !== this.connectionGeneration) {
        // Superseded by a concurrent retireConnection() or shutdown(); mark
        // retired so the immediate caller can finish cleanly and then reap it.
        handle.retired = true
        this.retiredHandles.add(handle)
      } else {
        this.activeHandle = handle
      }
      return handle
    } catch (error) {
      try {
        connection.close()
      } catch {
        // ignore
      }
      if (child.exitCode === null && !child.killed) {
        child.kill('SIGTERM')
      }
      const stderrSummary = this.getStderrSummary()
      throw this.makeError(
        'ACP_ERROR',
        `${this.options.providerLabel} ACP handshake failed: ${
          error instanceof Error ? error.message : String(error)
        }${stderrSummary ? ` (${stderrSummary})` : ''}`,
        503,
      )
    }
  }

  async probeSessionOn(
    state: AcpConnectedState<TSource>,
    timeoutMs?: number,
  ): Promise<{
    init: InitializeResponse
    binary: ResolvedAcpBinary<TSource>
    discovery: AcpSessionDiscovery
  }> {
    const { connection, init, binary } = state
    const cwd = this.options.workspaceDir()
    await mkdir(cwd, { recursive: true })

    const session = await connection.agent.request(
      'session/new',
      {
        cwd,
        mcpServers: [],
      },
      {
        cancellationSignal: AbortSignal.timeout(
          timeoutMs ?? this.options.sessionTimeoutMs ?? 15_000,
        ),
        stopWaitingOnCancel: true,
      },
    )

    const discovery = extractAcpSessionDiscovery(session)

    // Close the probe session so we don't accumulate idle sessions.
    void connection.agent
      .request('session/close', { sessionId: session.sessionId })
      .catch(() => {})

    return { init, binary, discovery }
  }

  async probeSession(timeoutMs?: number): Promise<{
    init: InitializeResponse
    binary: ResolvedAcpBinary<TSource>
    discovery: AcpSessionDiscovery
  }> {
    return await this.withConnection((state) =>
      this.probeSessionOn(state, timeoutMs),
    )
  }

  async runPrompt(
    input: AcpPromptInput,
    runOptions?: {
      defaultModelId?: string
      cachedModelConfigId?: string | null
      beforeSession?: (state: AcpConnectedState<TSource>) => Promise<void>
      resolveRequestedModel?: (
        requestedModelId: string,
        discovered: AcpSessionDiscovery,
      ) => string | null
      onDiscovery?: (discovery: AcpSessionDiscovery) => void
    },
  ): Promise<AcpPromptOutput> {
    return await this.withConnection(async (state) => {
      if (runOptions?.beforeSession) {
        await runOptions.beforeSession(state)
      }
      const { connection, init } = state
      const cwd = this.options.workspaceDir()
      await mkdir(cwd, { recursive: true })

      const sessionTimeoutMs = this.options.sessionTimeoutMs ?? 20_000
      const sessionWatchdog = createPromptTimeoutController({
        idleTimeoutMs: sessionTimeoutMs,
        maxDurationMs: sessionTimeoutMs,
        clientSignal: input.signal,
      })
      let activeSession
      try {
        activeSession = await connection.agent
          .buildSession({ cwd, mcpServers: [] })
          .start({
            cancellationSignal: sessionWatchdog.signal,
            stopWaitingOnCancel: true,
          })
      } catch (error) {
        throw mapAcpPromptError({
          error,
          providerLabel: this.options.providerLabel,
          abortReason: sessionWatchdog.getAbortReason(),
          clientAborted: Boolean(input.signal?.aborted),
          idleTimeoutMs: sessionTimeoutMs,
          maxDurationMs: sessionTimeoutMs,
          authRequiredMessage: this.options.authRequiredMessage(),
          makeError: (code, message, httpStatus) =>
            this.makeError(code, message, httpStatus),
        })
      } finally {
        sessionWatchdog.cleanup()
      }

      const { idleTimeoutMs, maxDurationMs } = resolvePromptTimeoutConfig({
        inputIdleTimeoutMs: input.idleTimeoutMs,
        inputMaxDurationMs: input.maxDurationMs,
        optionIdleTimeoutMs: this.options.promptIdleTimeoutMs,
        optionMaxDurationMs: this.options.promptMaxDurationMs,
      })
      let promptWatchdog: PromptTimeoutController | null = null

      try {
        const discovered = extractAcpSessionDiscovery(
          activeSession.newSessionResponse,
        )
        runOptions?.onDiscovery?.(discovered)

        let activeModelId =
          discovered.currentModelId ??
          runOptions?.defaultModelId ??
          `${this.options.providerLabel.toLowerCase()}-default`

        if (input.modelId?.trim()) {
          const targetModelValue = runOptions?.resolveRequestedModel
            ? runOptions.resolveRequestedModel(input.modelId.trim(), discovered)
            : input.modelId.trim()

          if (
            targetModelValue &&
            targetModelValue !== 'auto' &&
            targetModelValue !== 'default' &&
            targetModelValue !== activeModelId
          ) {
            const configId =
              discovered.modelConfigId ??
              runOptions?.cachedModelConfigId ??
              null
            let modelSet = false
            if (configId) {
              try {
                await connection.agent.request('session/set_config_option', {
                  sessionId: activeSession.sessionId,
                  configId,
                  value: targetModelValue,
                })
                activeModelId = targetModelValue
                modelSet = true
              } catch {
                // Fall through to try session/set_model or session default.
              }
            }
            if (!modelSet) {
              try {
                await connection.agent.request('session/set_model', {
                  sessionId: activeSession.sessionId,
                  modelId: targetModelValue,
                })
                activeModelId = targetModelValue
              } catch {
                // Fall back to session's default model if unavailable.
              }
            }
          }
        }

        if (input.reasoningEffort) {
          const reasoningConfig = discovered.configOptions.find(
            (opt) =>
              opt.category === 'thought_level' ||
              opt.category === 'reasoning' ||
              /reason|think|effort/i.test(`${opt.id} ${opt.name}`),
          )
          if (reasoningConfig && reasoningConfig.options.length > 0) {
            const desired = input.reasoningEffort.toLowerCase()
            const match =
              reasoningConfig.options.find(
                (choice) =>
                  choice.value.toLowerCase() === desired ||
                  choice.name.toLowerCase() === desired,
              ) ??
              reasoningConfig.options.find((choice) =>
                `${choice.value} ${choice.name}`
                  .toLowerCase()
                  .includes(desired),
              ) ??
              (desired === 'off'
                ? reasoningConfig.options.find((choice) =>
                    /off|none|minimal|disabled/i.test(
                      `${choice.value} ${choice.name}`,
                    ),
                  )
                : desired === 'max'
                  ? (reasoningConfig.options.find((choice) =>
                      /xhigh|extra[\s_-]*high|max/i.test(
                        `${choice.value} ${choice.name}`,
                      ),
                    ) ??
                    reasoningConfig.options.find(
                      (choice) => choice.value.toLowerCase() === 'high',
                    ))
                  : undefined)
            if (match && match.value !== reasoningConfig.currentValue) {
              try {
                await connection.agent.request('session/set_config_option', {
                  sessionId: activeSession.sessionId,
                  configId: reasoningConfig.id,
                  value: match.value,
                })
              } catch {
                // Ignore if model does not support changing reasoning option.
              }
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

        promptWatchdog = createPromptTimeoutController({
          idleTimeoutMs,
          maxDurationMs,
          clientSignal: input.signal,
        })
        const sendSessionCancel = () => {
          void connection.agent
            .notify('session/cancel', { sessionId: activeSession.sessionId })
            .catch(() => {})
        }
        promptWatchdog.signal.addEventListener('abort', sendSessionCancel, {
          once: true,
        })

        const promptPromise = activeSession.prompt(blocks, {
          cancellationSignal: promptWatchdog.signal,
          stopWaitingOnCancel: true,
        })
        // Avoid unhandled rejection if the update loop exits early.
        promptPromise.catch(() => {})

        let text = ''
        let currentThought = ''
        const thoughts: string[] = []
        let stopReason = 'end_turn'

        try {
          let msg = await activeSession.nextUpdate()
          while (msg.kind !== 'stop') {
            promptWatchdog.touch()
            const update = msg.update
            if (
              update.sessionUpdate === 'agent_message_chunk' &&
              update.content.type === 'text'
            ) {
              text += update.content.text
              input.onTextDelta?.(update.content.text)
            } else if (
              update.sessionUpdate === 'agent_thought_chunk' &&
              update.content.type === 'text'
            ) {
              currentThought += update.content.text
              input.onThoughtDelta?.(update.content.text)
            }
            msg = await activeSession.nextUpdate()
          }
          stopReason = msg.stopReason

          await promptPromise
        } finally {
          promptWatchdog.signal.removeEventListener('abort', sendSessionCancel)
        }

        const postAbortReason = promptWatchdog.getAbortReason()
        if (stopReason === 'cancelled' && postAbortReason !== null) {
          throw mapAcpPromptError({
            error: new Error('Request cancelled'),
            providerLabel: this.options.providerLabel,
            abortReason: postAbortReason,
            clientAborted: Boolean(input.signal?.aborted),
            idleTimeoutMs,
            maxDurationMs,
            authRequiredMessage: this.options.authRequiredMessage(),
            makeError: (code, message, httpStatus) =>
              this.makeError(code, message, httpStatus),
          })
        }

        if (currentThought.trim()) {
          thoughts.push(currentThought.trim())
        }

        const initMeta = init._meta as Record<string, unknown> | undefined
        const metaVersion =
          typeof initMeta?.agentVersion === 'string' &&
          initMeta.agentVersion.trim()
            ? initMeta.agentVersion.trim()
            : undefined

        return {
          text: text.trim(),
          thoughts,
          stopReason,
          modelId: activeModelId,
          agentName: init.agentInfo?.name ?? this.options.defaultAgentName,
          agentVersion: init.agentInfo?.version ?? metaVersion ?? 'unknown',
        }
      } catch (error) {
        throw mapAcpPromptError({
          error,
          providerLabel: this.options.providerLabel,
          abortReason: promptWatchdog?.getAbortReason() ?? null,
          clientAborted: Boolean(input.signal?.aborted),
          idleTimeoutMs,
          maxDurationMs,
          authRequiredMessage: this.options.authRequiredMessage(),
          makeError: (code, message, httpStatus) =>
            this.makeError(code, message, httpStatus),
        })
      } finally {
        promptWatchdog?.cleanup()
        activeSession.dispose()
        void connection.agent
          .request('session/close', { sessionId: activeSession.sessionId })
          .catch(() => {})
      }
    })
  }
}
