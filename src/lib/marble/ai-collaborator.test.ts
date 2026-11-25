import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  generateMarbleCollaboration,
  MarbleCollaborationError,
} from './ai-collaborator'
import type {
  CollaborationProgress,
  CollaborationRequest,
} from './ai-collaborator'

const proposal = {
  id: 'prop-sse',
  note: 'Updated the title',
  ops: [{ type: 'setText' as const, id: 'title', text: 'Hello' }],
  targetIds: ['title'],
  modelId: 'grok-build/grok-4.7',
  providerId: 'grok-build' as const,
  createdAt: 1_700_000_000_000,
  status: 'proposed' as const,
  instruction: 'Tighten the title',
}

function request(
  onProgress?: (progress: CollaborationProgress) => void,
): CollaborationRequest {
  return {
    source: '<h1 data-marble-id="title">Old</h1>',
    instruction: 'Tighten the title',
    modelId: 'grok-build/grok-4.7',
    providerId: 'grok-build',
    timeoutMs: 5_000,
    onProgress,
  }
}

function dataLine(event: Record<string, unknown>, newline = true): string {
  const line = `data: ${JSON.stringify(event)}`
  return newline ? `${line}\n\n` : line
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  let index = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(chunks[index]))
      index += 1
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  })
}

function mockSse(chunks: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => sseResponse(chunks)),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('collaborate SSE reader', () => {
  it('reassembles an event split across chunks', async () => {
    const progress: CollaborationProgress[] = []
    const thought = dataLine({
      type: 'thought_delta',
      delta: 'Look at the title',
    })
    const splitAt = thought.indexOf('Look')
    mockSse([
      thought.slice(0, splitAt),
      thought.slice(splitAt),
      dataLine({
        type: 'done',
        source: 'grok-build-acp',
        proposal,
      }),
    ])

    const result = await generateMarbleCollaboration(
      request((update) => progress.push(update)),
    )

    expect(progress).toEqual([
      {
        phase: 'thinking',
        label: 'Thinking…',
        thoughtSnippet: 'Look at the title',
      },
    ])
    expect(result.source).toBe('grok-build-acp')
    expect(result.proposal.note).toBe('Updated the title')
    expect(result.proposal.ops).toEqual([
      { type: 'setText', id: 'title', text: 'Hello' },
    ])
  })

  it('reads status, thought, progress, and heartbeat events packed into one chunk', async () => {
    const progress: CollaborationProgress[] = []
    mockSse([
      [
        dataLine({
          type: 'status',
          phase: 'connecting',
          label: 'Connecting',
          elapsedMs: 5,
        }),
        dataLine({ type: 'thought_delta', delta: 'Drafting the edit' }),
        dataLine({
          type: 'status',
          phase: 'generating',
          label: 'Drafting',
          elapsedMs: 20,
        }),
        dataLine({ type: 'progress', elapsedMs: 40 }),
        dataLine({ type: 'heartbeat', elapsedMs: 80 }),
        dataLine({
          type: 'status',
          phase: 'parsing',
          label: 'Validating',
          elapsedMs: 90,
        }),
        dataLine({
          type: 'done',
          source: 'grok-build-acp',
          proposal,
        }),
      ].join(''),
    ])

    const result = await generateMarbleCollaboration(
      request((update) => progress.push(update)),
    )

    expect(progress).toEqual([
      {
        phase: 'connecting',
        label: 'Connecting',
        thoughtSnippet: undefined,
        elapsedMs: 5,
      },
      {
        phase: 'thinking',
        label: 'Thinking…',
        thoughtSnippet: 'Drafting the edit',
      },
      {
        phase: 'generating',
        label: 'Drafting',
        thoughtSnippet: 'Drafting the edit',
        elapsedMs: 20,
      },
      {
        phase: 'generating',
        label: 'Drafting',
        thoughtSnippet: 'Drafting the edit',
        elapsedMs: 40,
      },
      {
        phase: 'generating',
        label: 'Drafting',
        thoughtSnippet: 'Drafting the edit',
        elapsedMs: 80,
      },
      {
        phase: 'parsing',
        label: 'Validating',
        thoughtSnippet: 'Drafting the edit',
        elapsedMs: 90,
      },
    ])
    expect(result.proposal.id).toBe('prop-sse')
  })

  it('flushes a trailing event that ends without a newline', async () => {
    const progress: CollaborationProgress[] = []
    mockSse([
      dataLine({
        type: 'status',
        phase: 'parsing',
        label: 'Validating',
        elapsedMs: 12,
      }),
      dataLine(
        {
          type: 'done',
          source: 'opencode-acp',
          proposal,
        },
        false,
      ),
    ])

    const result = await generateMarbleCollaboration(
      request((update) => progress.push(update)),
    )

    expect(progress).toEqual([
      {
        phase: 'parsing',
        label: 'Validating',
        thoughtSnippet: undefined,
        elapsedMs: 12,
      },
    ])
    expect(result.source).toBe('opencode-acp')
    expect(result.proposal.ops[0]?.text).toBe('Hello')
  })

  it('turns an error event into MarbleCollaborationError', async () => {
    const errorLine = dataLine({
      type: 'error',
      code: 'RATE_LIMITED',
      error: 'Slow down',
      httpStatus: 429,
    })
    const splitAt = errorLine.indexOf('RATE_LIMITED')
    mockSse([errorLine.slice(0, splitAt), errorLine.slice(splitAt)])

    let caught: unknown
    try {
      await generateMarbleCollaboration(request())
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(MarbleCollaborationError)
    expect(caught).toMatchObject({
      code: 'RATE_LIMITED',
      message: 'Slow down',
    })
  })
})
