import { createFileRoute } from '@tanstack/react-router'
import {
  isAcpClientAbortError,
  logAcpServerError,
} from '#/lib/ai/acp-runtime.server'
import {
  AntigravityAcpError,
  getAntigravityAcpManager,
} from '#/lib/ai/antigravity-acp.server'
import { toXDriveAntigravityModelId } from '#/lib/ai/antigravity-types'
import {
  OpenCodeAcpError,
  getOpenCodeStatus,
  runOpenCodePrompt,
} from '#/lib/ai/opencode-acp.server'
import { OpenCodeGoError } from '#/lib/ai/opencode-go.server'
import {
  isOpenCodeModelId,
  toXDriveOpenCodeGoModelId,
} from '#/lib/ai/opencode-go-types'
import {
  GrokBuildAcpError,
  getGrokBuildStatus,
  runGrokBuildPrompt,
} from '#/lib/ai/grok-build-acp.server'
import {
  isGrokBuildModelId,
  toXDriveGrokBuildModelId,
} from '#/lib/ai/grok-build-types'
import {
  buildMarbleAcpPrompt,
  parseMarbleAcpResponse,
} from '#/lib/ai/marble-prompt.server'
import type { ServerCollaborateInput } from '#/lib/ai/marble-prompt.server'
import { parseReasoningEffort } from '#/lib/ai/drive-chat-types'
import { collaborateProviderPrompt } from '#/lib/ai/reasoning-effort'

const SSE_HEARTBEAT_INTERVAL_MS = 15_000
const SSE_PROGRESS_THROTTLE_MS = 500

interface ApiErrorPayload {
  ok: false
  providerId?: string
  code: string
  authRequired?: boolean
  entitlementRequired?: boolean
  rateLimited?: boolean
  binaryMissing?: boolean
  error: string
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

function encodeSseEvent(event: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

function toApiError(error: unknown): {
  payload: ApiErrorPayload
  httpStatus: number
} {
  if (error instanceof AntigravityAcpError) {
    return {
      payload: {
        ok: false,
        providerId: 'antigravity',
        code: error.code,
        authRequired: error.code === 'AUTH_REQUIRED',
        binaryMissing: error.code === 'BINARY_MISSING',
        error: error.message,
      },
      httpStatus: error.httpStatus,
    }
  }
  if (error instanceof OpenCodeAcpError) {
    return {
      payload: {
        ok: false,
        providerId: 'opencode-go',
        code: error.code,
        authRequired: error.code === 'AUTH_REQUIRED',
        binaryMissing: error.code === 'BINARY_MISSING',
        error: error.message,
      },
      httpStatus: error.httpStatus,
    }
  }
  if (error instanceof OpenCodeGoError) {
    return {
      payload: {
        ok: false,
        providerId: 'opencode-go',
        code: error.code,
        authRequired: error.code === 'AUTH_REQUIRED',
        entitlementRequired: error.code === 'ENTITLEMENT_REQUIRED',
        rateLimited: error.code === 'RATE_LIMITED',
        error: error.message,
      },
      httpStatus: error.httpStatus,
    }
  }
  if (error instanceof GrokBuildAcpError) {
    return {
      payload: {
        ok: false,
        providerId: 'grok-build',
        code: error.code,
        authRequired: error.code === 'AUTH_REQUIRED',
        binaryMissing: error.code === 'BINARY_MISSING',
        error: error.message,
      },
      httpStatus: error.httpStatus,
    }
  }
  const message =
    error instanceof Error ? error.message : 'AI collaborator request failed'
  return {
    payload: { ok: false, code: 'AI_ERROR', error: message },
    httpStatus: 500,
  }
}

function errorResponse(error: unknown) {
  const { payload, httpStatus } = toApiError(error)
  return json(payload, httpStatus)
}

function resolveProviderId(body: Record<string, unknown>): string {
  if (typeof body.providerId === 'string' && body.providerId.trim()) {
    return body.providerId.trim()
  }
  if (typeof body.modelId === 'string') {
    if (isGrokBuildModelId(body.modelId)) return 'grok-build'
    if (isOpenCodeModelId(body.modelId)) return 'opencode-go'
    if (body.modelId.startsWith('antigravity/')) return 'antigravity'
  }
  return 'antigravity'
}

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url)
  const provider = url.searchParams.get('provider')
  const refresh = url.searchParams.get('refresh') === '1'
  const startedAt = Date.now()

  try {
    if (provider === 'grok-build') {
      const status = await getGrokBuildStatus(refresh)
      return json(status)
    }
    if (provider === 'opencode-go') {
      const status = await getOpenCodeStatus(refresh)
      return json(status)
    }
    if (provider === 'antigravity') {
      const status = await getAntigravityAcpManager().getStatus()
      return json(status)
    }

    const [antigravityStatus, openCodeGoStatus, grokBuildStatus] =
      await Promise.all([
        getAntigravityAcpManager().getStatus(),
        getOpenCodeStatus(refresh),
        getGrokBuildStatus(refresh),
      ])
    return json({
      ...antigravityStatus,
      providers: {
        antigravity: antigravityStatus,
        'opencode-go': openCodeGoStatus,
        'grok-build': grokBuildStatus,
      },
    })
  } catch (error) {
    logAcpServerError({
      route: '/api/ai',
      action: 'status',
      providerId: provider ?? 'all',
      elapsedMs: Date.now() - startedAt,
      clientAborted: request.signal.aborted,
      error,
    })
    return errorResponse(error)
  }
}

async function runCollaborateExecution(params: {
  providerId: 'antigravity' | 'opencode-go' | 'grok-build'
  collaborateInput: ServerCollaborateInput
  prompt: string
  sessionId?: string
  imageDataUrls?: string[]
  signal: AbortSignal
  onTextDelta?: (delta: string) => void
  onThoughtDelta?: (delta: string) => void
  onBeforeParse?: () => void
}) {
  const {
    providerId,
    collaborateInput,
    prompt,
    sessionId,
    imageDataUrls,
    signal,
    onTextDelta,
    onThoughtDelta,
    onBeforeParse,
  } = params

  const call = collaborateProviderPrompt({
    providerId,
    prompt,
    modelId: collaborateInput.modelId,
    reasoningEffort: collaborateInput.reasoningEffort,
    sessionId,
    imageDataUrls,
  })

  if (providerId === 'grok-build') {
    const grokResult = await runGrokBuildPrompt({
      prompt: call.prompt,
      modelId: call.modelId,
      reasoningEffort: call.reasoningEffort,
      imageDataUrls: call.imageDataUrls,
      signal,
      onTextDelta,
      onThoughtDelta,
    })

    onBeforeParse?.()
    const resolvedModelId = toXDriveGrokBuildModelId(grokResult.modelId)
    const parsed = parseMarbleAcpResponse(
      grokResult.text,
      collaborateInput,
      resolvedModelId,
    )

    return {
      ok: true as const,
      source: 'grok-build-acp' as const,
      proposal: parsed.proposal,
      stages: parsed.stages,
      newDocument: parsed.newDocument,
      thoughts: grokResult.thoughts,
      runtime: {
        protocol: 'acp',
        agentName: grokResult.agentName,
        agentVersion: grokResult.agentVersion,
        modelId: resolvedModelId,
        acpModelId: grokResult.modelId,
        stopReason: grokResult.stopReason,
      },
    }
  }

  if (providerId === 'opencode-go') {
    const openCodeResult = await runOpenCodePrompt({
      prompt: call.prompt,
      modelId: call.modelId,
      reasoningEffort: call.reasoningEffort,
      sessionId: call.sessionId,
      imageDataUrls: call.imageDataUrls,
      signal,
      onTextDelta,
      onThoughtDelta,
    })

    onBeforeParse?.()
    const resolvedModelId = toXDriveOpenCodeGoModelId(openCodeResult.modelId)
    const parsed = parseMarbleAcpResponse(
      openCodeResult.text,
      collaborateInput,
      resolvedModelId,
    )

    return {
      ok: true as const,
      source:
        openCodeResult.transport === 'acp'
          ? ('opencode-acp' as const)
          : ('opencode-go' as const),
      proposal: parsed.proposal,
      stages: parsed.stages,
      newDocument: parsed.newDocument,
      thoughts: openCodeResult.thoughts,
      runtime: {
        protocol: openCodeResult.protocol,
        agentName: openCodeResult.agentName,
        agentVersion: openCodeResult.agentVersion,
        modelId: resolvedModelId,
        ...(openCodeResult.acpModelId
          ? { acpModelId: openCodeResult.acpModelId }
          : {}),
        stopReason: openCodeResult.stopReason,
      },
    }
  }

  const antigravity = getAntigravityAcpManager()
  const acpResult = await antigravity.runPrompt({
    prompt: call.prompt,
    modelId: call.modelId,
    reasoningEffort: call.reasoningEffort,
    imageDataUrls: call.imageDataUrls,
    signal,
    onTextDelta,
    onThoughtDelta,
  })

  onBeforeParse?.()
  const resolvedModelId = toXDriveAntigravityModelId(acpResult.modelId)
  const parsed = parseMarbleAcpResponse(
    acpResult.text,
    collaborateInput,
    resolvedModelId,
  )

  return {
    ok: true as const,
    source: 'antigravity-acp' as const,
    proposal: parsed.proposal,
    stages: parsed.stages,
    newDocument: parsed.newDocument,
    thoughts: acpResult.thoughts,
    runtime: {
      protocol: 'acp',
      agentName: acpResult.agentName,
      agentVersion: acpResult.agentVersion,
      modelId: resolvedModelId,
      acpModelId: acpResult.modelId,
      stopReason: acpResult.stopReason,
    },
  }
}

export async function POST({ request }: { request: Request }) {
  const startedAt = Date.now()
  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json(
        { ok: false, error: 'Request body must be a JSON object' },
        400,
      )
    }
    body = parsed as Record<string, unknown>
  } catch {
    return json({ ok: false, error: 'Request body must be valid JSON' }, 400)
  }

  const action = typeof body.action === 'string' ? body.action : 'collaborate'
  const providerId = resolveProviderId(body)
  const requestedModelId =
    typeof body.modelId === 'string' && body.modelId.trim()
      ? body.modelId.trim()
      : undefined
  const antigravity = getAntigravityAcpManager()

  try {
    if (action === 'status') {
      if (providerId === 'grok-build') {
        const status = await getGrokBuildStatus(Boolean(body.refresh))
        return json(status)
      }
      if (providerId === 'opencode-go') {
        const status = await getOpenCodeStatus(Boolean(body.refresh))
        return json(status)
      }
      const status = await antigravity.getStatus()
      return json(status)
    }

    if (action === 'install_binary') {
      const status = await antigravity.installBinary()
      return json(status)
    }

    if (action === 'authenticate') {
      const apiKey = typeof body.apiKey === 'string' ? body.apiKey : undefined
      if (providerId === 'grok-build') {
        return json(
          {
            ok: false,
            providerId: 'grok-build',
            code: 'AUTH_REQUIRED',
            authRequired: true,
            error:
              'xDrive uses the local Grok CLI over ACP and does not accept or store xAI API keys. Run `grok login` in your terminal (or set `XAI_API_KEY` in `.env.local`), then refresh status.',
          },
          400,
        )
      }
      if (providerId === 'opencode-go') {
        return json(
          {
            ok: false,
            providerId: 'opencode-go',
            code: 'AUTH_REQUIRED',
            authRequired: true,
            error:
              'xDrive uses the local OpenCode CLI over ACP and does not accept or store OpenCode API keys. Run `opencode auth login` in your terminal (select OpenCode Go), then refresh status.',
          },
          400,
        )
      }
      const methodId =
        typeof body.methodId === 'string' && body.methodId.trim()
          ? body.methodId.trim()
          : 'oauth-personal'
      const status = await antigravity.authenticate(methodId, { apiKey })
      return json(status)
    }

    if (action === 'logout') {
      if (providerId === 'grok-build') {
        return json(
          {
            ok: false,
            providerId: 'grok-build',
            code: 'AUTH_REQUIRED',
            error:
              'Manage Grok Build credentials directly with `grok logout` in your terminal, then refresh status.',
          },
          400,
        )
      }
      if (providerId === 'opencode-go') {
        return json(
          {
            ok: false,
            providerId: 'opencode-go',
            code: 'AUTH_REQUIRED',
            error:
              'Manage OpenCode credentials directly with `opencode auth logout` in your terminal, then refresh status.',
          },
          400,
        )
      }
      const status = await antigravity.logout()
      return json(status)
    }

    if (action === 'collaborate') {
      const instruction =
        typeof body.instruction === 'string' ? body.instruction.trim() : ''
      if (!instruction) {
        return json({ ok: false, error: 'instruction is required' }, 400)
      }

      if (
        providerId !== 'antigravity' &&
        providerId !== 'opencode-go' &&
        providerId !== 'grok-build'
      ) {
        return json(
          {
            ok: false,
            code: 'PROVIDER_UNAVAILABLE',
            error: `Provider "${providerId}" is not integrated on this server. Select a Google Antigravity, OpenCode Go, or Grok Build model in Models & Providers.`,
          },
          400,
        )
      }

      const defaultModel =
        providerId === 'grok-build'
          ? 'grok-build/grok-4.7'
          : providerId === 'opencode-go'
            ? 'opencode-go/glm-5.3'
            : 'antigravity/default'

      const collaborateInput: ServerCollaborateInput = {
        source: typeof body.source === 'string' ? body.source : '',
        instruction,
        modelId: requestedModelId ?? defaultModel,
        providerId,
        action:
          typeof body.actionKind === 'string'
            ? (body.actionKind as ServerCollaborateInput['action'])
            : undefined,
        selectedElements: Array.isArray(body.selectedElements)
          ? (body.selectedElements as ServerCollaborateInput['selectedElements'])
          : undefined,
        sketchAnnotations: Array.isArray(body.sketchAnnotations)
          ? (body.sketchAnnotations as ServerCollaborateInput['sketchAnnotations'])
          : undefined,
        evergreenRefs: Array.isArray(body.evergreenRefs)
          ? (body.evergreenRefs as ServerCollaborateInput['evergreenRefs'])
          : undefined,
        designContracts: Array.isArray(body.designContracts)
          ? (body.designContracts as string[])
          : undefined,
        dontsGuardrails: Array.isArray(body.dontsGuardrails)
          ? (body.dontsGuardrails as string[])
          : undefined,
        reasoningEffort: parseReasoningEffort(body.reasoningEffort),
      }

      const prompt = buildMarbleAcpPrompt(collaborateInput)
      const imageDataUrls =
        typeof body.sketchDataUrl === 'string' && body.sketchDataUrl
          ? [body.sketchDataUrl]
          : undefined
      const sessionId =
        typeof body.sessionId === 'string' && body.sessionId.trim()
          ? body.sessionId.trim()
          : undefined

      const acceptHeader = request.headers.get('accept') ?? ''
      const wantsSse =
        body.stream === true ||
        acceptHeader.toLowerCase().includes('text/event-stream')

      if (!wantsSse) {
        const result = await runCollaborateExecution({
          providerId,
          collaborateInput,
          prompt,
          sessionId,
          imageDataUrls,
          signal: request.signal,
        })
        return json(result)
      }

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          let closed = false
          const send = (event: Record<string, unknown>) => {
            if (closed || request.signal.aborted) return
            try {
              controller.enqueue(encodeSseEvent(event))
            } catch {
              closed = true
            }
          }

          const close = () => {
            if (closed) return
            closed = true
            try {
              controller.close()
            } catch {
              // ignore
            }
          }

          const heartbeat = setInterval(() => {
            send({
              type: 'heartbeat',
              elapsedMs: Date.now() - startedAt,
            })
          }, SSE_HEARTBEAT_INTERVAL_MS)

          let receivedChars = 0
          let announcedGenerating = false
          let lastProgressAt = 0

          try {
            send({
              type: 'status',
              phase: 'thinking',
              label: 'Thinking…',
              elapsedMs: 0,
            })

            const result = await runCollaborateExecution({
              providerId,
              collaborateInput,
              prompt,
              sessionId,
              imageDataUrls,
              signal: request.signal,
              onThoughtDelta: (delta) => {
                if (!delta) return
                send({ type: 'thought_delta', delta })
              },
              onTextDelta: (delta) => {
                if (!delta) return
                receivedChars += delta.length
                const now = Date.now()
                if (!announcedGenerating) {
                  announcedGenerating = true
                  send({
                    type: 'status',
                    phase: 'generating',
                    label: 'Drafting Marble edits…',
                    elapsedMs: now - startedAt,
                  })
                }
                if (now - lastProgressAt >= SSE_PROGRESS_THROTTLE_MS) {
                  lastProgressAt = now
                  send({
                    type: 'progress',
                    chars: receivedChars,
                    elapsedMs: now - startedAt,
                  })
                }
              },
              onBeforeParse: () => {
                send({
                  type: 'status',
                  phase: 'parsing',
                  label: 'Validating Marble proposal…',
                  elapsedMs: Date.now() - startedAt,
                })
              },
            })

            send({
              type: 'done',
              ...result,
            })
          } catch (error) {
            if (request.signal.aborted || isAcpClientAbortError(error)) {
              return
            }
            logAcpServerError({
              route: '/api/ai',
              action: 'collaborate',
              providerId,
              modelId: collaborateInput.modelId,
              elapsedMs: Date.now() - startedAt,
              clientAborted: request.signal.aborted,
              error,
            })
            const { payload, httpStatus } = toApiError(error)
            send({
              type: 'error',
              ...payload,
              httpStatus,
            })
          } finally {
            clearInterval(heartbeat)
            close()
          }
        },
      })

      return new Response(stream, {
        status: 200,
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
        },
      })
    }

    return json(
      {
        ok: false,
        error:
          'Expected action status, authenticate, logout, install_binary, or collaborate',
      },
      400,
    )
  } catch (error) {
    if (request.signal.aborted || isAcpClientAbortError(error)) {
      return new Response(null, { status: 499 })
    }
    logAcpServerError({
      route: '/api/ai',
      action,
      providerId,
      modelId: requestedModelId,
      elapsedMs: Date.now() - startedAt,
      clientAborted: request.signal.aborted,
      error,
    })
    return errorResponse(error)
  }
}

export const Route = createFileRoute('/api/ai')({
  server: {
    handlers: {
      GET,
      POST,
    },
  },
})
