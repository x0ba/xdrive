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
//   `responses`, `messages`, or `generate-content`).

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
const REQUEST_TIMEOUT_MS = 120_000
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
    reasoning?: { supported?: unknown } | unknown
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

function combineSignals(
  timeoutMs: number,
  externalSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new Error(`OpenCode Go request timed out after ${timeoutMs}ms`))
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
    cleanup: () => {
      clearTimeout(timer)
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort)
      }
    },
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
    const sessionHeader = sanitizeSessionId(input.sessionId)
    const images = supportsVision
      ? (input.imageDataUrls ?? []).filter(Boolean)
      : []

    const { signal, cleanup } = combineSignals(REQUEST_TIMEOUT_MS, input.signal)
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
        })
      }
      if (protocol === 'responses') {
        return await this.callOpenAiResponses({
          apiKey: key,
          baseUrl,
          modelId: rawModelId,
          prompt: input.prompt,
          images,
          sessionHeader,
          signal,
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
        })
      }
      return await this.callOpenAiChatCompletions({
        apiKey: key,
        baseUrl,
        modelId: rawModelId,
        prompt: input.prompt,
        images,
        sessionHeader,
        signal,
      })
    } catch (error) {
      if (error instanceof OpenCodeGoError) throw error
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || /timed out/i.test(error.message))
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
    throw new OpenCodeGoError('API_ERROR', message, response.status >= 400 ? response.status : 502)
  }

  private async callOpenAiChatCompletions(params: {
    apiKey: string
    baseUrl: string
    modelId: string
    prompt: string
    images: string[]
    sessionHeader: string
    signal: AbortSignal
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

    const response = await fetch(`${params.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${params.apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': USER_AGENT,
        'x-opencode-session': params.sessionHeader,
      },
      body: JSON.stringify({
        model: params.modelId,
        messages: [{ role: 'user', content }],
        stream: false,
      }),
      signal: params.signal,
    })

    if (!response.ok) {
      await this.handleErrorStatus(response, params.modelId)
    }

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
    let text = ''
    if (typeof rawContent === 'string') {
      text = rawContent
    } else if (Array.isArray(rawContent)) {
      text = rawContent
        .map((part) => (typeof part.text === 'string' ? part.text : ''))
        .join('')
    }

    const thoughts: string[] = []
    const reasoning =
      choice?.message?.reasoning_content ?? choice?.message?.reasoning
    if (typeof reasoning === 'string' && reasoning.trim()) {
      thoughts.push(reasoning.trim())
    }

    return {
      text,
      thoughts,
      stopReason: choice?.finish_reason ?? 'stop',
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
    sessionHeader: string
    signal: AbortSignal
  }): Promise<OpenCodeGoPromptOutput> {
    const contentParts: Array<Record<string, unknown>> = [
      { type: 'input_text', text: params.prompt },
      ...params.images.map((url) => ({
        type: 'input_image',
        image_url: url,
      })),
    ]

    const response = await fetch(`${params.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${params.apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': USER_AGENT,
        'x-opencode-session': params.sessionHeader,
      },
      body: JSON.stringify({
        model: params.modelId,
        input: [{ role: 'user', content: contentParts }],
        stream: false,
      }),
      signal: params.signal,
    })

    if (!response.ok) {
      await this.handleErrorStatus(response, params.modelId)
    }

    const payload = (await response.json()) as {
      status?: string
      output_text?: string
      output?: Array<{
        type?: string
        content?: Array<{ type?: string; text?: string }>
        summary?: Array<{ type?: string; text?: string }>
      }>
    }

    let text = typeof payload.output_text === 'string' ? payload.output_text : ''
    const thoughts: string[] = []

    if (Array.isArray(payload.output)) {
      for (const item of payload.output) {
        if (item.type === 'reasoning' && Array.isArray(item.summary)) {
          for (const part of item.summary) {
            if (typeof part.text === 'string' && part.text.trim()) {
              thoughts.push(part.text.trim())
            }
          }
        }
        if (!text && Array.isArray(item.content)) {
          for (const part of item.content) {
            if (
              (part.type === 'output_text' || part.type === 'text') &&
              typeof part.text === 'string'
            ) {
              text += part.text
            }
          }
        }
      }
    }

    return {
      text,
      thoughts,
      stopReason: payload.status ?? 'completed',
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
        accept: 'application/json',
        'user-agent': USER_AGENT,
        'x-opencode-session': params.sessionHeader,
      },
      body: JSON.stringify({
        model: params.modelId,
        max_tokens: params.maxTokens,
        messages: [{ role: 'user', content: contentBlocks }],
      }),
      signal: params.signal,
    })

    if (!response.ok) {
      await this.handleErrorStatus(response, params.modelId)
    }

    const payload = (await response.json()) as {
      stop_reason?: string | null
      content?: Array<{ type?: string; text?: string; thinking?: string }>
    }

    let text = ''
    const thoughts: string[] = []
    for (const block of payload.content ?? []) {
      if (block.type === 'text' && typeof block.text === 'string') {
        text += block.text
      } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
        if (block.thinking.trim()) thoughts.push(block.thinking.trim())
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

  private async callGeminiGenerateContent(params: {
    apiKey: string
    baseUrl: string
    modelId: string
    prompt: string
    images: string[]
    sessionHeader: string
    signal: AbortSignal
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

    const url = `${params.baseUrl}/models/${encodeURIComponent(params.modelId)}:generateContent`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${params.apiKey}`,
        'x-goog-api-key': params.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
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

    const payload = (await response.json()) as {
      candidates?: Array<{
        finishReason?: string
        content?: {
          parts?: Array<{ text?: string; thought?: boolean }>
        }
      }>
    }

    const candidate = payload.candidates?.[0]
    let text = ''
    const thoughts: string[] = []
    for (const part of candidate?.content?.parts ?? []) {
      if (typeof part.text !== 'string') continue
      if (part.thought) {
        if (part.text.trim()) thoughts.push(part.text.trim())
      } else {
        text += part.text
      }
    }

    return {
      text,
      thoughts,
      stopReason: candidate?.finishReason ?? 'STOP',
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
