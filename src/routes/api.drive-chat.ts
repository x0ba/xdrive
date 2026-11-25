import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'
import {
  AntigravityAcpError,
  getAntigravityAcpManager,
} from '#/lib/ai/antigravity-acp.server'
import { toXDriveAntigravityModelId } from '#/lib/ai/antigravity-types'
import {
  OpenCodeAcpError,
  runOpenCodePrompt,
} from '#/lib/ai/opencode-acp.server'
import { OpenCodeGoError } from '#/lib/ai/opencode-go.server'
import {
  isOpenCodeModelId,
  toXDriveOpenCodeGoModelId,
} from '#/lib/ai/opencode-go-types'
import {
  buildDriveChatSystemPrompt,
  buildSingleTurnPromptForAcp,
  parseDriveChatResponse,
} from '#/lib/ai/drive-chat.server'
import type {
  DriveChatApiRequest,
  DriveChatStreamEvent,
} from '#/lib/ai/drive-chat-types'
import type { AIProviderId } from '#/lib/types'

function resolveProviderId(body: Partial<DriveChatApiRequest>): AIProviderId {
  if (body.providerId) return body.providerId
  const modelId = body.modelId ?? ''
  if (isOpenCodeModelId(modelId)) return 'opencode-go'
  if (modelId.startsWith('antigravity/')) return 'antigravity'
  if (modelId.startsWith('claude')) return 'claude'
  if (modelId.includes('gpt') || modelId.startsWith('o4')) {
    return 'openai'
  }
  if (modelId.startsWith('xai/') || modelId.includes('grok')) {
    return 'xai'
  }
  return 'antigravity'
}

function encodeSse(event: DriveChatStreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

function extractStreamError(
  error: unknown,
  providerId: AIProviderId,
): Extract<DriveChatStreamEvent, { type: 'error' }> {
  if (error instanceof AntigravityAcpError) {
    return {
      type: 'error',
      providerId: 'antigravity',
      code: error.code,
      authRequired: error.code === 'AUTH_REQUIRED',
      error: error.message,
    }
  }
  if (error instanceof OpenCodeAcpError) {
    return {
      type: 'error',
      providerId: 'opencode-go',
      code: error.code,
      authRequired: error.code === 'AUTH_REQUIRED',
      error: error.message,
    }
  }
  if (error instanceof OpenCodeGoError) {
    return {
      type: 'error',
      providerId: 'opencode-go',
      code: error.code,
      authRequired: error.code === 'AUTH_REQUIRED',
      entitlementRequired: error.code === 'ENTITLEMENT_REQUIRED',
      rateLimited: error.code === 'RATE_LIMITED',
      error: error.message,
    }
  }
  return {
    type: 'error',
    providerId,
    code: 'DRIVE_CHAT_ERROR',
    error:
      error instanceof Error ? error.message : 'Drive Chat request failed.',
  }
}

async function runTanStackDirectProvider(params: {
  providerId: 'openai' | 'claude'
  body: DriveChatApiRequest
  systemPrompt: string
  signal: AbortSignal
  onTextDelta: (delta: string) => void
  onThoughtDelta: (delta: string) => void
}): Promise<{
  text: string
  thoughts: string[]
  modelId: string
  stopReason: string
}> {
  const {
    providerId,
    body,
    systemPrompt,
    signal,
    onTextDelta,
    onThoughtDelta,
  } = params
  if (providerId === 'openai' && !process.env.OPENAI_API_KEY?.trim()) {
    throw new Error(
      'OpenAI is not configured on this server (set OPENAI_API_KEY in .env.local or switch to Google Antigravity / OpenCode Go).',
    )
  }
  if (providerId === 'claude' && !process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error(
      'Anthropic Claude is not configured on this server (set ANTHROPIC_API_KEY in .env.local or switch to Google Antigravity / OpenCode Go).',
    )
  }

  const abortController = new AbortController()
  const onAbort = () => abortController.abort()
  signal.addEventListener('abort', onAbort, { once: true })

  try {
    const adapter =
      providerId === 'openai'
        ? openaiText(body.modelId as Parameters<typeof openaiText>[0])
        : anthropicText(body.modelId as Parameters<typeof anthropicText>[0])

    const stream = chat({
      adapter,
      threadId: body.threadId || 'drive-chat',
      messages: body.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      systemPrompts: [systemPrompt],
      abortController,
    })

    let text = ''
    let thought = ''
    for await (const chunk of stream) {
      if (chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.delta) {
        text += chunk.delta
        onTextDelta(chunk.delta)
      } else if (
        chunk.type === 'STEP_FINISHED' &&
        'delta' in chunk &&
        typeof chunk.delta === 'string' &&
        chunk.delta
      ) {
        thought += chunk.delta
        onThoughtDelta(chunk.delta)
      }
    }

    return {
      text,
      thoughts: thought.trim() ? [thought.trim()] : [],
      modelId: body.modelId,
      stopReason: 'stop',
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

export async function POST({ request }: { request: Request }) {
  let body: DriveChatApiRequest
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return Response.json(
        { ok: false, error: 'Request body must be a JSON object.' },
        { status: 400 },
      )
    }
    body = parsed as DriveChatApiRequest
  } catch {
    return Response.json(
      { ok: false, error: 'Request body must be valid JSON.' },
      { status: 400 },
    )
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json(
      { ok: false, error: 'messages must be a non-empty array.' },
      { status: 400 },
    )
  }

  const providerId = resolveProviderId(body)
  const drive = (body.drive as DriveChatApiRequest['drive'] | undefined) ?? {
    docs: [],
    trashedDocs: [],
    folders: [],
    focusedRefs: [],
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (event: DriveChatStreamEvent) => {
        if (closed || request.signal.aborted) return
        try {
          controller.enqueue(encodeSse(event))
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

      let rawAccumulated = ''
      let enteredActionsFence = false

      const handleTextDelta = (delta: string) => {
        if (!delta) return
        rawAccumulated += delta
        if (enteredActionsFence) return
        const fenceIdx = rawAccumulated.indexOf('```xdrive-actions')
        if (fenceIdx !== -1) {
          enteredActionsFence = true
          send({
            type: 'status',
            phase: 'preparing_actions',
            label: 'Preparing Drive changes…',
          })
          return
        }
        send({ type: 'text_delta', delta })
      }

      const handleThoughtDelta = (delta: string) => {
        if (!delta) return
        send({ type: 'thought_delta', delta })
      }

      try {
        send({
          type: 'status',
          phase: 'thinking',
          label: `Scanning ${drive.docs.length} Drive ${drive.docs.length === 1 ? 'file' : 'files'}…`,
        })

        const systemPrompt = buildDriveChatSystemPrompt({
          ...body,
          drive,
          providerId,
        })
        const latestMessage = body.messages.at(-1)?.content ?? ''
        const history = body.messages.slice(0, -1).slice(-12)

        let rawText = ''
        let thoughts: string[] = []
        let resolvedModelId = body.modelId
        let protocol = 'sse'
        let stopReason = 'stop'

        if (providerId === 'antigravity') {
          const acpPrompt = buildSingleTurnPromptForAcp({
            ...body,
            drive,
            providerId,
          })
          const result = await getAntigravityAcpManager().runPrompt({
            prompt: acpPrompt,
            modelId: body.modelId,
            reasoningEffort: body.reasoningEffort,
            signal: request.signal,
            onTextDelta: handleTextDelta,
            onThoughtDelta: handleThoughtDelta,
          })
          rawText = result.text
          thoughts = result.thoughts
          resolvedModelId = toXDriveAntigravityModelId(result.modelId)
          protocol = 'acp'
          stopReason = result.stopReason
        } else if (providerId === 'opencode-go') {
          const acpPrompt = buildSingleTurnPromptForAcp({
            ...body,
            drive,
            providerId,
          })
          const result = await runOpenCodePrompt({
            prompt: latestMessage,
            acpPrompt,
            systemPrompt,
            history,
            modelId: body.modelId,
            reasoningEffort: body.reasoningEffort,
            sessionId: `chat-${body.threadId}`,
            signal: request.signal,
            onTextDelta: handleTextDelta,
            onThoughtDelta: handleThoughtDelta,
          })
          rawText = result.text
          thoughts = result.thoughts
          resolvedModelId = toXDriveOpenCodeGoModelId(result.modelId)
          protocol = result.protocol
          stopReason = result.stopReason
        } else if (providerId === 'openai' || providerId === 'claude') {
          const result = await runTanStackDirectProvider({
            providerId,
            body,
            systemPrompt,
            signal: request.signal,
            onTextDelta: handleTextDelta,
            onThoughtDelta: handleThoughtDelta,
          })
          rawText = result.text
          thoughts = result.thoughts
          resolvedModelId = result.modelId
          protocol = 'tanstack-ai'
          stopReason = result.stopReason
        } else {
          send({
            type: 'error',
            providerId,
            code: 'PROVIDER_UNAVAILABLE',
            error: `Provider "${providerId}" is not configured on this server. Connect Google Antigravity or OpenCode Go in Models & Providers.`,
          })
          close()
          return
        }

        const parsed = parseDriveChatResponse(rawText, drive, body.mode)
        send({
          type: 'done',
          answer: parsed.answer,
          thoughts,
          referencedDocIds: parsed.referencedDocIds,
          actions: parsed.actions,
          runtime: {
            providerId,
            modelId: resolvedModelId,
            protocol,
            stopReason,
          },
        })
      } catch (error) {
        if (!request.signal.aborted) {
          send(extractStreamError(error, providerId))
        }
      } finally {
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

export const Route = createFileRoute('/api/drive-chat')({
  server: {
    handlers: {
      POST,
    },
  },
})
