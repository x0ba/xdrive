// Server-only OpenCode Go inference provider (`https://opencode.ai/inference/go`).
//
// Follows official OpenCode Go client requirements:
// - Identifies itself with a dedicated User-Agent (`xdrive/1.0`) rather than a
//   generic SDK user agent.
// - Sends a stable `x-opencode-session` header per document/conversation for
//   efficient routing and prompt caching.
// - Authenticates with an OpenCode Console personal or service-account API key
//   (`OPENCODE_API_KEY`, `OPENCODE_GO_API_KEY`, or an in-memory key connected
//   from Models & Providers — never written to repository files).
// - Fetches live Go models from `/inference/go/v1/models` and verifies account
//   entitlement and rolling/weekly/monthly usage from `/inference/go/v1/usage`.
// - Routes each model to its native Go API family (`chat-completions`,
//   `responses`, `messages`, or `generate-content`) using SSE streaming so
//   long reasoning/app-generation responses keep bytes flowing and avoid
//   intermediary idle timeouts.

import {
  DEFAULT_OPENCODE_GO_MODELS,
  OPENCODE_GO_ENDPOINT_BASE_URL,
  fromXDriveOpenCodeGoModelId,
} from './opencode-go-types'
import type {
  OpenCodeGoApiProtocol,
  OpenCodeGoKeySource,
  OpenCodeGoModelOption,
  OpenCodeGoRuntimeStatus,
  OpenCodeGoUsageMeter,
  OpenCodeGoUsageSummary,
} from './opencode-go-types'

const MODELS_URL = `${OPENCODE_GO_ENDPOINT_BASE_URL}/v1/models`
const USAGE_URL = `${OPENCODE_GO_ENDPOINT_BASE_URL}/v1/usage`
const USER_AGENT = 'xdrive/1.0'
const CATALOG_TTL_MS = 5 * 60 * 1000
const REQUEST_TIMEOUT_MS = 300_000
const STREAM_IDLE_TIMEOUT_MS = 90_000
const META_TIMEOUT_MS = 12_000

export interface OpenCodeGoPromptInput {
  prompt: string
  modelId?: string
  sessionId?: string
  imageDataUrls?: string[]
  signal?: AbortSignal
}

export interface OpenCodeGoPromptOutput {
  text: string
  thoughts: string[]
  stopReason: string
  modelId: string
  apiProtocol: OpenCodeGoApiProtocol
}

export class OpenCodeGoError extends Error {
  readonly code:
    | 'AUTH_REQUIRED'
    | 'ENTITLEMENT_REQUIRED'
    | 'RATE_LIMITED'
    | 'API_ERROR'
    | 'TIMEOUT'
  readonly httpStatus: number

  constructor(
    code: OpenCodeGoError['code'],
    message: string,
    httpStatus = 500,
  ) {
    super(message)
    this.name = 'OpenCodeGoError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

interface RawCatalogModel {
  id?: unknown
  name?: unknown
  type?: unknown
  description?: unknown
  family?: unknown
  modalities?: {
    input?: unknown
  }
  capabilities?: {
    reasoning?: { supported?: unknown; effort?: unknown } | unknown
  }
  limit?: {
    context?: unknown
    output?: unknown
  }
  recommended_api?: unknown
  api?: Partial<
    Record<
      string,
      {
        base_url?: unknown
      }
    >
  >
  go?: {
    featured?: unknown
    monthly_usage?: {
      go?: unknown
      'go-plus'?: unknown
      'go-teams'?: unknown
    }
  }
}

function maskApiKey(key: string): string {
  const trimmed = key.trim()
  if (trimmed.length <= 8) return '••••••••'
  return `${trimmed.slice(0, 4)}···${trimmed.slice(-4)}`
}

function sanitizeSessionId(raw?: string): string {
  const cleaned = (raw ?? '')
    .trim()
    .replace(/[^A-Za-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return cleaned ? `xdrive-${cleaned}` : 'xdrive-workspace'
}

function parseDataUrl(
  dataUrl: string,
): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i)
  if (!match) return null
  return { mimeType: match[1], data: match[2] }
}

function extractUpstreamErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if (record.error && typeof record.error === 'object') {
      const errObj = record.error as Record<string, unknown>
      if (typeof errObj.message === 'string' && errObj.message.trim()) {
        return errObj.message.trim()
      }
    }
    if (typeof record.error === 'string' && record.error.trim()) {
      return record.error.trim()
    }
    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message.trim()
    }
  }
  return fallback
}

function parseUsageMeter(raw: unknown): OpenCodeGoUsageMeter | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const record = raw as Record<string, unknown>
  const status = record.status === 'rate-limited' ? 'rate-limited' : 'ok'
  const percent =
    typeof record.percent === 'number' && Number.isFinite(record.percent)
      ? Math.max(0, Math.min(100, Math.round(record.percent)))
      : 0
  const resetsAt = typeof record.resetsAt === 'string' ? record.resetsAt : ''
  return { status, percent, resetsAt }
}

function resolveProtocolFromCatalog(
  raw: RawCatalogModel,
): { protocol: OpenCodeGoApiProtocol; baseUrl: string } {
  const apiMap = raw.api ?? {}
  const recommended =
    typeof raw.recommended_api === 'string' ? raw.recommended_api : ''

  if (
    recommended === 'chat-completions' &&
    typeof apiMap['chat-completions']?.base_url === 'string'
  ) {
    return {
      protocol: 'chat-completions',
      baseUrl: apiMap['chat-completions'].base_url,
    }
  }
  if (
    recommended === 'responses' &&
    typeof apiMap.responses?.base_url === 'string'
  ) {
    return {
      protocol: 'responses',
      baseUrl: apiMap.responses.base_url,
    }
  }
  if (
    recommended === 'messages' &&
    typeof apiMap.messages?.base_url === 'string'
  ) {
    return {
      protocol: 'messages',
      baseUrl: apiMap.messages.base_url,
    }
  }
  if (typeof apiMap['generate-content']?.base_url === 'string') {
    return {
      protocol: 'generate-content',
      baseUrl: apiMap['generate-content'].base_url,
    }
  }
  if (typeof apiMap['chat-completions']?.base_url === 'string') {
    return {
      protocol: 'chat-completions',
      baseUrl: apiMap['chat-completions'].base_url,
    }
  }
  if (typeof apiMap.responses?.base_url === 'string') {
    return {
      protocol: 'responses',
      baseUrl: apiMap.responses.base_url,
    }
  }
  if (typeof apiMap.messages?.base_url === 'string') {
    return {
      protocol: 'messages',
      baseUrl: apiMap.messages.base_url,
    }
  }
  return {
    protocol: 'chat-completions',
    baseUrl: `${OPENCODE_GO_ENDPOINT_BASE_URL}/openai/v1`,
  }
}

function inferFallbackProtocol(
  rawModelId: string,
): { protocol: OpenCodeGoApiProtocol; baseUrl: string } {
  const id = rawModelId.toLowerCase()
  if (id.startsWith('gemini-')) {
    return {
      protocol: 'generate-content',
      baseUrl: `${OPENCODE_GO_ENDPOINT_BASE_URL}/google/v1beta`,
    }
  }
  if (
    id.startsWith('claude-') ||
    id.startsWith('qwen') ||
    id === 'minimax-m3'
  ) {
    return {
      protocol: 'messages',
      baseUrl: `${OPENCODE_GO_ENDPOINT_BASE_URL}/anthropic/v1`,
    }
  }
  if (
    id.startsWith('gpt-') ||
    id.startsWith('grok-') ||
    id.startsWith('muse-spark-')
  ) {
    return {
      protocol: 'responses',
      baseUrl: `${OPENCODE_GO_ENDPOINT_BASE_URL}/openai/v1`,
    }
  }
  return {
    protocol: 'chat-completions',
    baseUrl: `${OPENCODE_GO_ENDPOINT_BASE_URL}/openai/v1`,
  }
}

function normalizeCatalogModel(raw: RawCatalogModel): OpenCodeGoModelOption | null {
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null
  if (raw.type !== 'chat') return null

  const id = raw.id.trim()
  // OpenCode Go docs note that free-tier chat models (`*-free`, no Go monthly
  // allowance) return HTTP 403 outside OpenCode CLI, so only surface paid Go
  // subscription models in xDrive.
  const goAllowance =
    typeof raw.go?.monthly_usage?.go === 'number'
      ? raw.go.monthly_usage.go
      : undefined
  if (id.endsWith('-free') || goAllowance === undefined) {
    return null
  }

  const inputModalities = Array.isArray(raw.modalities?.input)
    ? raw.modalities.input.filter((m): m is string => typeof m === 'string')
    : []
  const supportsVision = inputModalities.some((m) => m.startsWith('image'))

  const reasoningCap = raw.capabilities?.reasoning
  const reasoning =
    typeof reasoningCap === 'boolean'
      ? reasoningCap
      : Boolean(
          reasoningCap &&
            typeof reasoningCap === 'object' &&
            (reasoningCap as { supported?: unknown }).supported,
        )
  const reasoningEfforts =
    reasoningCap &&
    typeof reasoningCap === 'object' &&
    Array.isArray((reasoningCap as { effort?: unknown }).effort)
      ? (reasoningCap as { effort: unknown[] }).effort.filter(
          (value): value is string => typeof value === 'string',
        )
      : undefined

  const { protocol, baseUrl } = resolveProtocolFromCatalog(raw)

  return {
    id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id,
    description:
      typeof raw.description === 'string' ? raw.description.trim() : null,
    family: typeof raw.family === 'string' ? raw.family : null,
    contextWindow:
      typeof raw.limit?.context === 'number' && raw.limit.context > 0
        ? raw.limit.context
        : 256_000,
    outputLimit:
      typeof raw.limit?.output === 'number' && raw.limit.output > 0
        ? raw.limit.output
        : 16_384,
    supportsVision,
    reasoning,
    reasoningEfforts,
    featured: Boolean(raw.go?.featured),
    apiProtocol: protocol,
    baseUrl,
    monthlyUsage: {
      go: goAllowance,
      goPlus:
        typeof raw.go?.monthly_usage?.['go-plus'] === 'number'
          ? raw.go.monthly_usage['go-plus']
          : undefined,
      goTeams:
        typeof raw.go?.monthly_usage?.['go-teams'] === 'number'
          ? raw.go.monthly_usage['go-teams']
          : undefined,
    },
  }
}

function pickBalancedReasoningEffort(efforts?: string[]): string | undefined {
  if (!efforts || efforts.length === 0) return undefined
  // Prefer 'low' over 'max' so full .mrbl app generations stay responsive
  // without burning several minutes on extended thinking before emitting JSON.
  if (efforts.includes('low')) return 'low'
  if (efforts.includes('medium')) return 'medium'
  return undefined
}

function combineSignals(
  timeoutMs: number,
  externalSignal?: AbortSignal,
): { signal: AbortSignal; controller: AbortController; cleanup: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(
      new Error(`OpenCode Go request timed out after ${timeoutMs}ms`),
    )
  }, timeoutMs)

  const onExternalAbort = () => {
    controller.abort(externalSignal?.reason ?? new Error('Request aborted'))
  }

  if (externalSignal) {
    if (externalSignal.aborted) {
      onExternalAbort()
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true })
    }
  }

  return {
    signal: controller.signal,
    controller,
    cleanup: () => {
      clearTimeout(timer)
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort)
      }
    },
  }
}

function isEventStream(response: Response): boolean {
  const contentType = response.headers.get('content-type') ?? ''
  return contentType.toLowerCase().includes('text/event-stream')
}

async function readSseEvents(
  response: Response,
  controller: AbortController,
  onData: (payload: unknown, eventName: string | null) => void,
): Promise<void> {
  const body = response.body
  if (!body) return

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent: string | null = null
  let dataLines: string[] = []
  const armIdleTimer = () =>
    setTimeout(() => {
      controller.abort(
        new Error(
          `OpenCode Go stream was idle for ${Math.round(STREAM_IDLE_TIMEOUT_MS / 1000)}s`,
        ),
      )
    }, STREAM_IDLE_TIMEOUT_MS)

  let idleTimer: ReturnType<typeof setTimeout> = armIdleTimer()

  const resetIdleTimer = () => {
    clearTimeout(idleTimer)
    idleTimer = armIdleTimer()
  }

  const flushEvent = () => {
    if (dataLines.length === 0) {
      currentEvent = null
      return
    }
    const rawData = dataLines.join('\n').trim()
    const eventName = currentEvent
    dataLines = []
    currentEvent = null
    if (!rawData || rawData === '[DONE]') return

    let parsed: unknown
    try {
      parsed = JSON.parse(rawData)
    } catch {
      return
    }
    onData(parsed, eventName)
  }

  const processLine = (line: string) => {
    const clean = line.endsWith('\r') ? line.slice(0, -1) : line
    if (clean === '') {
      flushEvent()
      return
    }
    if (clean.startsWith(':')) return
    if (clean.startsWith('event:')) {
      currentEvent = clean.slice('event:'.length).trim()
      return
    }
    if (clean.startsWith('data:')) {
      dataLines.push(clean.slice('data:'.length).trimStart())
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      resetIdleTimer()
      buffer += decoder.decode(value, { stream: true })
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        processLine(buffer.slice(0, newlineIndex))
        buffer = buffer.slice(newlineIndex + 1)
        newlineIndex = buffer.indexOf('\n')
      }
    }
    buffer += decoder.decode()
    if (buffer.length > 0) {
      for (const line of buffer.split('\n')) {
        processLine(line)
      }
    }
    flushEvent()
  } finally {
    clearTimeout(idleTimer)
    try {
      reader.releaseLock()
    } catch {
      // Ignore lock release errors on aborted streams.
    }
  }
}

class OpenCodeGoManager {
  private runtimeApiKey: string | null = null
  private envKeySuppressed = false
  private cachedModels: OpenCodeGoModelOption[] | null = null
  private catalogFetchedAt = 0

  private resolveKey(): { key: string | null; source: OpenCodeGoKeySource } {
    if (this.runtimeApiKey) {
      return { key: this.runtimeApiKey, source: 'runtime' }
    }
    if (!this.envKeySuppressed) {
      const fromEnv =
        process.env.OPENCODE_API_KEY?.trim() ||
        process.env.OPENCODE_GO_API_KEY?.trim() ||
        ''
      if (fromEnv) {
        return { key: fromEnv, source: 'env' }
      }
    }
    return { key: null, source: 'none' }
  }

  async getModels(forceRefresh = false): Promise<OpenCodeGoModelOption[]> {
    const now = Date.now()
    if (
      !forceRefresh &&
      this.cachedModels &&
      this.cachedModels.length > 0 &&
      now - this.catalogFetchedAt < CATALOG_TTL_MS
    ) {
      return this.cachedModels
    }

    const { signal, cleanup } = combineSignals(META_TIMEOUT_MS)
    try {
      const response = await fetch(MODELS_URL, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'user-agent': USER_AGENT,
        },
        signal,
      })
      if (!response.ok) {
        return this.cachedModels ?? DEFAULT_OPENCODE_GO_MODELS
      }
      const payload = (await response.json()) as { data?: RawCatalogModel[] }
      const models = (payload.data ?? [])
        .map(normalizeCatalogModel)
        .filter((item): item is OpenCodeGoModelOption => item !== null)
        .sort((a, b) => {
          if (Boolean(a.featured) !== Boolean(b.featured)) {
            return a.featured ? -1 : 1
          }
          const allowanceDiff =
            (b.monthlyUsage?.go ?? 0) - (a.monthlyUsage?.go ?? 0)
          if (allowanceDiff !== 0) return allowanceDiff
          return a.name.localeCompare(b.name)
        })

      if (models.length > 0) {
        this.cachedModels = models
        this.catalogFetchedAt = now
        return models
      }
    } catch {
      // Offline or transient network error — keep fallback catalog.
    } finally {
      cleanup()
    }
    return this.cachedModels ?? DEFAULT_OPENCODE_GO_MODELS
  }

  private async verifyKeyAndFetchUsage(apiKey: string): Promise<{
    authenticated: boolean
    entitled: boolean
    usage: OpenCodeGoUsageSummary | null
    rateLimited: boolean
    error?: string
  }> {
    const { signal, cleanup } = combineSignals(META_TIMEOUT_MS)
    try {
      const response = await fetch(USAGE_URL, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: 'application/json',
          'user-agent': USER_AGENT,
        },
        signal,
      })

      const payload: unknown = await response.json().catch(() => null)

      if (response.status === 401) {
        return {
          authenticated: false,
          entitled: false,
          usage: null,
          rateLimited: false,
          error: extractUpstreamErrorMessage(
            payload,
            'OpenCode API key was rejected (HTTP 401). Check your key in the OpenCode Console.',
          ),
        }
      }

      if (response.status === 403) {
        return {
          authenticated: true,
          entitled: false,
          usage: null,
          rateLimited: false,
          error: extractUpstreamErrorMessage(
            payload,
            'This OpenCode API key does not have an active OpenCode Go subscription.',
          ),
        }
      }

      if (!response.ok) {
        return {
          authenticated: false,
          entitled: false,
          usage: null,
          rateLimited: false,
          error: extractUpstreamErrorMessage(
            payload,
            `OpenCode Go verification failed (HTTP ${response.status}).`,
          ),
        }
      }

      const rawUsage =
        payload && typeof payload === 'object' && 'usage' in payload
          ? ((payload as { usage?: Record<string, unknown> }).usage ?? null)
          : null

      const rolling = parseUsageMeter(rawUsage?.rolling)
      const weekly = parseUsageMeter(rawUsage?.weekly)
      const monthly = parseUsageMeter(rawUsage?.monthly)
      const usage: OpenCodeGoUsageSummary | null =
        rolling || weekly || monthly ? { rolling, weekly, monthly } : null
      const rateLimited = Boolean(
        rolling?.status === 'rate-limited' ||
          weekly?.status === 'rate-limited' ||
          monthly?.status === 'rate-limited',
      )

      return {
        authenticated: true,
        entitled: true,
        usage,
        rateLimited,
      }
    } catch (error) {
      return {
        authenticated: false,
        entitled: false,
        usage: null,
        rateLimited: false,
        error:
          error instanceof Error
            ? `Could not reach OpenCode Go (${error.message}).`
            : 'Could not reach OpenCode Go.',
      }
    } finally {
      cleanup()
    }
  }

  async getStatus(forceRefresh = false): Promise<OpenCodeGoRuntimeStatus> {
    const models = await this.getModels(forceRefresh)
    const { key, source } = this.resolveKey()
    const currentModelId = models[0]?.id ?? DEFAULT_OPENCODE_GO_MODELS[0].id

    if (!key) {
      return {
        ok: true,
        authenticated: false,
        entitled: false,
        keySource: 'none',
        maskedKey: null,
        endpointBaseUrl: OPENCODE_GO_ENDPOINT_BASE_URL,
        models,
        currentModelId,
        usage: null,
        rateLimited: false,
      }
    }

    const check = await this.verifyKeyAndFetchUsage(key)
    return {
      ok: true,
      authenticated: check.authenticated,
      entitled: check.entitled,
      keySource: source,
      maskedKey: maskApiKey(key),
      endpointBaseUrl: OPENCODE_GO_ENDPOINT_BASE_URL,
      models,
      currentModelId,
      usage: check.usage,
      rateLimited: check.rateLimited,
      error: check.error,
    }
  }

  async authenticate(apiKey?: string): Promise<OpenCodeGoRuntimeStatus> {
    const trimmed = apiKey?.trim()
    let candidate = trimmed || ''
    let nextSource: OpenCodeGoKeySource = 'runtime'

    if (!candidate) {
      const envKey =
        process.env.OPENCODE_API_KEY?.trim() ||
        process.env.OPENCODE_GO_API_KEY?.trim() ||
        ''
      if (!envKey) {
        throw new OpenCodeGoError(
          'AUTH_REQUIRED',
          'Paste your OpenCode Console API key or set OPENCODE_API_KEY in .env.local to connect OpenCode Go.',
          401,
        )
      }
      candidate = envKey
      nextSource = 'env'
    }

    const check = await this.verifyKeyAndFetchUsage(candidate)
    if (!check.authenticated) {
      throw new OpenCodeGoError(
        'AUTH_REQUIRED',
        check.error || 'OpenCode API key is invalid.',
        401,
      )
    }
    if (!check.entitled) {
      throw new OpenCodeGoError(
        'ENTITLEMENT_REQUIRED',
        check.error || 'OpenCode Go subscription required for this API key.',
        403,
      )
    }

    if (nextSource === 'runtime') {
      this.runtimeApiKey = candidate
      this.envKeySuppressed = false
    } else {
      this.runtimeApiKey = null
      this.envKeySuppressed = false
    }

    const models = await this.getModels(true)
    return {
      ok: true,
      authenticated: true,
      entitled: true,
      keySource: nextSource,
      maskedKey: maskApiKey(candidate),
      endpointBaseUrl: OPENCODE_GO_ENDPOINT_BASE_URL,
      models,
      currentModelId: models[0]?.id ?? DEFAULT_OPENCODE_GO_MODELS[0].id,
      usage: check.usage,
      rateLimited: check.rateLimited,
    }
  }

  async logout(): Promise<OpenCodeGoRuntimeStatus> {
    this.runtimeApiKey = null
    this.envKeySuppressed = Boolean(
      process.env.OPENCODE_API_KEY?.trim() ||
        process.env.OPENCODE_GO_API_KEY?.trim(),
    )
    return await this.getStatus(false)
  }

  async runPrompt(
    input: OpenCodeGoPromptInput,
  ): Promise<OpenCodeGoPromptOutput> {
    const { key } = this.resolveKey()
    if (!key) {
      throw new OpenCodeGoError(
        'AUTH_REQUIRED',
        'OpenCode Go is not connected. Add your OpenCode API key in Models & Providers or set OPENCODE_API_KEY in .env.local.',
        401,
      )
    }

    const models = await this.getModels(false)
    const requestedRaw = fromXDriveOpenCodeGoModelId(input.modelId ?? '').trim()
    const rawModelId =
      !requestedRaw || requestedRaw === 'default'
        ? (models[0]?.id ?? DEFAULT_OPENCODE_GO_MODELS[0].id)
        : requestedRaw

    const catalogEntry = models.find((m) => m.id === rawModelId)
    const fallbackProto = inferFallbackProtocol(rawModelId)
    const protocol: OpenCodeGoApiProtocol =
      catalogEntry?.apiProtocol ?? fallbackProto.protocol
    const baseUrl = (catalogEntry?.baseUrl ?? fallbackProto.baseUrl).replace(
      /\/+$/,
      '',
    )
    const supportsVision = catalogEntry?.supportsVision ?? true
    const maxTokens = Math.min(catalogEntry?.outputLimit ?? 16_384, 16_384)
    const reasoningEffort = pickBalancedReasoningEffort(
      catalogEntry?.reasoningEfforts,
    )
    const sessionHeader = sanitizeSessionId(input.sessionId)
    const images = supportsVision
      ? (input.imageDataUrls ?? []).filter(Boolean)
      : []

    const { signal, controller, cleanup } = combineSignals(
      REQUEST_TIMEOUT_MS,
      input.signal,
    )
    try {
      if (protocol === 'messages') {
        return await this.callAnthropicMessages({
          apiKey: key,
          baseUrl,
          modelId: rawModelId,
          prompt: input.prompt,
          images,
          maxTokens,
          sessionHeader,
          signal,
          controller,
        })
      }
      if (protocol === 'responses') {
        return await this.callOpenAiResponses({
          apiKey: key,
          baseUrl,
          modelId: rawModelId,
          prompt: input.prompt,
          images,
          reasoningEffort,
          sessionHeader,
          signal,
          controller,
        })
      }
      if (protocol === 'generate-content') {
        return await this.callGeminiGenerateContent({
          apiKey: key,
          baseUrl,
          modelId: rawModelId,
          prompt: input.prompt,
          images,
          sessionHeader,
          signal,
          controller,
        })
      }
      return await this.callOpenAiChatCompletions({
        apiKey: key,
        baseUrl,
        modelId: rawModelId,
        prompt: input.prompt,
        images,
        reasoningEffort,
        sessionHeader,
        signal,
        controller,
      })
    } catch (error) {
      if (error instanceof OpenCodeGoError) throw error
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || /timed out|idle/i.test(error.message))
      ) {
        throw new OpenCodeGoError(
          'TIMEOUT',
          'OpenCode Go request timed out before returning a Marble proposal.',
          504,
        )
      }
      throw new OpenCodeGoError(
        'API_ERROR',
        error instanceof Error
          ? error.message
          : 'OpenCode Go inference request failed.',
        502,
      )
    } finally {
      cleanup()
    }
  }

  private async handleErrorStatus(
    response: Response,
    modelId: string,
  ): Promise<never> {
    const payload: unknown = await response.json().catch(() => null)
    const message = extractUpstreamErrorMessage(
      payload,
      `OpenCode Go request for "${modelId}" failed (HTTP ${response.status}).`,
    )
    if (response.status === 401) {
      throw new OpenCodeGoError('AUTH_REQUIRED', message, 401)
    }
    if (response.status === 403) {
      throw new OpenCodeGoError('ENTITLEMENT_REQUIRED', message, 403)
    }
    if (response.status === 429) {
      throw new OpenCodeGoError('RATE_LIMITED', message, 429)
    }
    throw new OpenCodeGoError(
      'API_ERROR',
      message,
      response.status >= 400 ? response.status : 502,
    )
  }

  private async callOpenAiChatCompletions(params: {
    apiKey: string
    baseUrl: string
    modelId: string
    prompt: string
    images: string[]
    reasoningEffort?: string
    sessionHeader: string
    signal: AbortSignal
    controller: AbortController
  }): Promise<OpenCodeGoPromptOutput> {
    const content =
      params.images.length > 0
        ? [
            { type: 'text', text: params.prompt },
            ...params.images.map((url) => ({
              type: 'image_url',
              image_url: { url },
            })),
          ]
        : params.prompt

    const body: Record<string, unknown> = {
      model: params.modelId,
      messages: [{ role: 'user', content }],
      stream: true,
    }
    if (params.reasoningEffort) {
      body.reasoning_effort = params.reasoningEffort
    }

    const response = await fetch(`${params.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${params.apiKey}`,
        'content-type': 'application/json',
        accept: 'text/event-stream, application/json',
        'user-agent': USER_AGENT,
        'x-opencode-session': params.sessionHeader,
      },
      body: JSON.stringify(body),
      signal: params.signal,
    })

    if (!response.ok) {
      await this.handleErrorStatus(response, params.modelId)
    }

    if (!isEventStream(response)) {
      const payload = (await response.json()) as {
        choices?: Array<{
          finish_reason?: string | null
          message?: {
            content?:
              | string
              | Array<{ type?: string; text?: string }>
              | null
            reasoning_content?: string | null
            reasoning?: string | null
          }
        }>
      }
      const choice = payload.choices?.[0]
      const rawContent = choice?.message?.content
      const text =
        typeof rawContent === 'string'
          ? rawContent
          : Array.isArray(rawContent)
            ? rawContent
                .map((part) => (typeof part.text === 'string' ? part.text : ''))
                .join('')
            : ''
      const reasoning =
        choice?.message?.reasoning_content ?? choice?.message?.reasoning
      return {
        text,
        thoughts:
          typeof reasoning === 'string' && reasoning.trim()
            ? [reasoning.trim()]
            : [],
        stopReason: choice?.finish_reason ?? 'stop',
        modelId: params.modelId,
        apiProtocol: 'chat-completions',
      }
    }

    let text = ''
    let reasoningText = ''
    let stopReason = 'stop'

    await readSseEvents(response, params.controller, (chunk) => {
      if (!chunk || typeof chunk !== 'object') return
      const record = chunk as {
        error?: unknown
        choices?: Array<{
          finish_reason?: string | null
          delta?: {
            content?: string | Array<{ type?: string; text?: string }> | null
            reasoning_content?: string | null
            reasoning?: string | null
          }
        }>
      }
      if (record.error) {
        throw new OpenCodeGoError(
          'API_ERROR',
          extractUpstreamErrorMessage(
            record,
            `OpenCode Go stream error for "${params.modelId}".`,
          ),
          502,
        )
      }
      const choice = record.choices?.[0]
      if (!choice) return
      if (typeof choice.finish_reason === 'string' && choice.finish_reason) {
        stopReason = choice.finish_reason
      }
      const delta = choice.delta
      if (!delta) return
      if (typeof delta.content === 'string') {
        text += delta.content
      } else if (Array.isArray(delta.content)) {
        for (const part of delta.content) {
          if (typeof part.text === 'string') text += part.text
        }
      }
      const reasoningDelta = delta.reasoning_content ?? delta.reasoning
      if (typeof reasoningDelta === 'string') {
        reasoningText += reasoningDelta
      }
    })

    return {
      text,
      thoughts: reasoningText.trim() ? [reasoningText.trim()] : [],
      stopReason,
      modelId: params.modelId,
      apiProtocol: 'chat-completions',
    }
  }

  private async callOpenAiResponses(params: {
    apiKey: string
    baseUrl: string
    modelId: string
    prompt: string
    images: string[]
    reasoningEffort?: string
    sessionHeader: string
    signal: AbortSignal
    controller: AbortController
  }): Promise<OpenCodeGoPromptOutput> {
    const contentParts: Array<Record<string, unknown>> = [
      { type: 'input_text', text: params.prompt },
      ...params.images.map((url) => ({
        type: 'input_image',
        image_url: url,
      })),
    ]

    const body: Record<string, unknown> = {
      model: params.modelId,
      input: [{ role: 'user', content: contentParts }],
      stream: true,
    }
    if (params.reasoningEffort) {
      body.reasoning = { effort: params.reasoningEffort }
    }

    const response = await fetch(`${params.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${params.apiKey}`,
        'content-type': 'application/json',
        accept: 'text/event-stream, application/json',
        'user-agent': USER_AGENT,
        'x-opencode-session': params.sessionHeader,
      },
      body: JSON.stringify(body),
      signal: params.signal,
    })

    if (!response.ok) {
      await this.handleErrorStatus(response, params.modelId)
    }

    const extractResponseObject = (payload: {
      status?: string
      output_text?: string
      output?: Array<{
        type?: string
        content?: Array<{ type?: string; text?: string }>
        summary?: Array<{ type?: string; text?: string }>
      }>
    }) => {
      let outText =
        typeof payload.output_text === 'string' ? payload.output_text : ''
      const outThoughts: string[] = []
      for (const item of payload.output ?? []) {
        if (item.type === 'reasoning' && Array.isArray(item.summary)) {
          for (const part of item.summary) {
            if (typeof part.text === 'string' && part.text.trim()) {
              outThoughts.push(part.text.trim())
            }
          }
        }
        if (!outText && Array.isArray(item.content)) {
          for (const part of item.content) {
            if (
              (part.type === 'output_text' || part.type === 'text') &&
              typeof part.text === 'string'
            ) {
              outText += part.text
            }
          }
        }
      }
      return {
        text: outText,
        thoughts: outThoughts,
        stopReason: payload.status ?? 'completed',
      }
    }

    if (!isEventStream(response)) {
      const payload = (await response.json()) as Parameters<
        typeof extractResponseObject
      >[0]
      const extracted = extractResponseObject(payload)
      return {
        ...extracted,
        modelId: params.modelId,
        apiProtocol: 'responses',
      }
    }

    let text = ''
    let reasoningText = ''
    let stopReason = 'completed'

    await readSseEvents(response, params.controller, (chunk, eventName) => {
      if (!chunk || typeof chunk !== 'object') return
      const record = chunk as {
        type?: string
        delta?: string
        error?: unknown
        response?: Parameters<typeof extractResponseObject>[0] & {
          error?: unknown
        }
      }
      const kind = record.type ?? eventName ?? ''
      if (kind === 'error' || kind === 'response.failed' || record.error) {
        throw new OpenCodeGoError(
          'API_ERROR',
          extractUpstreamErrorMessage(
            record.response?.error ? record.response : record,
            `OpenCode Go stream error for "${params.modelId}".`,
          ),
          502,
        )
      }
      if (
        kind === 'response.output_text.delta' &&
        typeof record.delta === 'string'
      ) {
        text += record.delta
      } else if (
        (kind === 'response.reasoning_summary_text.delta' ||
          kind === 'response.reasoning_text.delta') &&
        typeof record.delta === 'string'
      ) {
        reasoningText += record.delta
      } else if (
        (kind === 'response.completed' || kind === 'response.incomplete') &&
        record.response
      ) {
        const extracted = extractResponseObject(record.response)
        if (!text && extracted.text) text = extracted.text
        if (!reasoningText && extracted.thoughts.length > 0) {
          reasoningText = extracted.thoughts.join('\n')
        }
        stopReason = extracted.stopReason
      }
    })

    return {
      text,
      thoughts: reasoningText.trim() ? [reasoningText.trim()] : [],
      stopReason,
      modelId: params.modelId,
      apiProtocol: 'responses',
    }
  }

  private async callAnthropicMessages(params: {
    apiKey: string
    baseUrl: string
    modelId: string
    prompt: string
    images: string[]
    maxTokens: number
    sessionHeader: string
    signal: AbortSignal
    controller: AbortController
  }): Promise<OpenCodeGoPromptOutput> {
    const contentBlocks: Array<Record<string, unknown>> = [
      { type: 'text', text: params.prompt },
    ]
    for (const dataUrl of params.images) {
      const parsed = parseDataUrl(dataUrl)
      if (parsed) {
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: parsed.mimeType,
            data: parsed.data,
          },
        })
      }
    }

    const response = await fetch(`${params.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${params.apiKey}`,
        'x-api-key': params.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        accept: 'text/event-stream, application/json',
        'user-agent': USER_AGENT,
        'x-opencode-session': params.sessionHeader,
      },
      body: JSON.stringify({
        model: params.modelId,
        max_tokens: params.maxTokens,
        messages: [{ role: 'user', content: contentBlocks }],
        stream: true,
      }),
      signal: params.signal,
    })

    if (!response.ok) {
      await this.handleErrorStatus(response, params.modelId)
    }

    if (!isEventStream(response)) {
      const payload = (await response.json()) as {
        stop_reason?: string | null
        content?: Array<{ type?: string; text?: string; thinking?: string }>
      }
      let text = ''
      const thoughts: string[] = []
      for (const block of payload.content ?? []) {
        if (block.type === 'text' && typeof block.text === 'string') {
          text += block.text
        } else if (
          block.type === 'thinking' &&
          typeof block.thinking === 'string' &&
          block.thinking.trim()
        ) {
          thoughts.push(block.thinking.trim())
        }
      }
      return {
        text,
        thoughts,
        stopReason: payload.stop_reason ?? 'end_turn',
        modelId: params.modelId,
        apiProtocol: 'messages',
      }
    }

    let text = ''
    let reasoningText = ''
    let stopReason = 'end_turn'

    await readSseEvents(response, params.controller, (chunk, eventName) => {
      if (!chunk || typeof chunk !== 'object') return
      const record = chunk as {
        type?: string
        error?: unknown
        delta?: {
          type?: string
          text?: string
          thinking?: string
          stop_reason?: string | null
        }
      }
      const kind = record.type ?? eventName ?? ''
      if (kind === 'error' || record.error) {
        throw new OpenCodeGoError(
          'API_ERROR',
          extractUpstreamErrorMessage(
            record,
            `OpenCode Go stream error for "${params.modelId}".`,
          ),
          502,
        )
      }
      if (kind === 'content_block_delta' && record.delta) {
        if (
          record.delta.type === 'text_delta' &&
          typeof record.delta.text === 'string'
        ) {
          text += record.delta.text
        } else if (
          record.delta.type === 'thinking_delta' &&
          typeof record.delta.thinking === 'string'
        ) {
          reasoningText += record.delta.thinking
        }
      } else if (
        kind === 'message_delta' &&
        typeof record.delta?.stop_reason === 'string' &&
        record.delta.stop_reason
      ) {
        stopReason = record.delta.stop_reason
      }
    })

    return {
      text,
      thoughts: reasoningText.trim() ? [reasoningText.trim()] : [],
      stopReason,
      modelId: params.modelId,
      apiProtocol: 'messages',
    }
  }

  private async callGeminiGenerateContent(params: {
    apiKey: string
    baseUrl: string
    modelId: string
    prompt: string
    images: string[]
    sessionHeader: string
    signal: AbortSignal
    controller: AbortController
  }): Promise<OpenCodeGoPromptOutput> {
    const parts: Array<Record<string, unknown>> = [{ text: params.prompt }]
    for (const dataUrl of params.images) {
      const parsed = parseDataUrl(dataUrl)
      if (parsed) {
        parts.push({
          inlineData: {
            mimeType: parsed.mimeType,
            data: parsed.data,
          },
        })
      }
    }

    const url = `${params.baseUrl}/models/${encodeURIComponent(params.modelId)}:streamGenerateContent?alt=sse`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${params.apiKey}`,
        'x-goog-api-key': params.apiKey,
        'content-type': 'application/json',
        accept: 'text/event-stream, application/json',
        'user-agent': USER_AGENT,
        'x-opencode-session': params.sessionHeader,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
      }),
      signal: params.signal,
    })

    if (!response.ok) {
      await this.handleErrorStatus(response, params.modelId)
    }

    let text = ''
    let reasoningText = ''
    let stopReason = 'STOP'

    const consumeCandidateChunk = (chunk: unknown) => {
      if (!chunk || typeof chunk !== 'object') return
      const record = chunk as {
        error?: unknown
        candidates?: Array<{
          finishReason?: string
          content?: {
            parts?: Array<{ text?: string; thought?: boolean }>
          }
        }>
      }
      if (record.error) {
        throw new OpenCodeGoError(
          'API_ERROR',
          extractUpstreamErrorMessage(
            record,
            `OpenCode Go stream error for "${params.modelId}".`,
          ),
          502,
        )
      }
      const candidate = record.candidates?.[0]
      if (!candidate) return
      if (candidate.finishReason) stopReason = candidate.finishReason
      for (const part of candidate.content?.parts ?? []) {
        if (typeof part.text !== 'string') continue
        if (part.thought) {
          reasoningText += part.text
        } else {
          text += part.text
        }
      }
    }

    if (!isEventStream(response)) {
      const payload: unknown = await response.json()
      if (Array.isArray(payload)) {
        for (const item of payload) consumeCandidateChunk(item)
      } else {
        consumeCandidateChunk(payload)
      }
    } else {
      await readSseEvents(response, params.controller, (chunk) => {
        consumeCandidateChunk(chunk)
      })
    }

    return {
      text,
      thoughts: reasoningText.trim() ? [reasoningText.trim()] : [],
      stopReason,
      modelId: params.modelId,
      apiProtocol: 'generate-content',
    }
  }
}

declare global {
  var __xdriveOpenCodeGoManager: OpenCodeGoManager | undefined
}

export function getOpenCodeGoManager(): OpenCodeGoManager {
  if (!globalThis.__xdriveOpenCodeGoManager) {
    globalThis.__xdriveOpenCodeGoManager = new OpenCodeGoManager()
  }
  return globalThis.__xdriveOpenCodeGoManager
}
