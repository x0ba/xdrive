import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './api.ai'

const { runGrokBuildPrompt, runOpenCodePrompt, runAntigravityPrompt } =
  vi.hoisted(() => ({
    runGrokBuildPrompt: vi.fn(),
    runOpenCodePrompt: vi.fn(),
    runAntigravityPrompt: vi.fn(),
  }))

vi.mock('#/lib/ai/grok-build-acp.server', () => ({
  GrokBuildAcpError: class GrokBuildAcpError extends Error {},
  getGrokBuildStatus: vi.fn(),
  runGrokBuildPrompt,
}))

vi.mock('#/lib/ai/opencode-acp.server', () => ({
  OpenCodeAcpError: class OpenCodeAcpError extends Error {},
  getOpenCodeStatus: vi.fn(),
  runOpenCodePrompt,
}))

vi.mock('#/lib/ai/antigravity-acp.server', () => ({
  AntigravityAcpError: class AntigravityAcpError extends Error {},
  getAntigravityAcpManager: () => ({
    runPrompt: runAntigravityPrompt,
    getStatus: vi.fn(),
    installBinary: vi.fn(),
    logout: vi.fn(),
  }),
}))

const DOCUMENT_TEXT = JSON.stringify({
  note: 'Built the draft',
  newDocument: {
    title: 'Draft',
    source: '<p data-marble-id="p1">Hello</p>',
  },
})

function promptResult(modelId: string) {
  return {
    text: DOCUMENT_TEXT,
    modelId,
    thoughts: [],
    agentName: 'test-agent',
    agentVersion: '0',
    stopReason: 'end_turn',
    transport: 'acp',
    protocol: 'acp',
  }
}

function collaborateRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'collaborate',
      instruction: 'Rewrite the selected theorem',
      source: '<doc></doc>',
      ...body,
    }),
  })
}

describe('POST /api/ai collaborate reasoning effort', () => {
  beforeEach(() => {
    runGrokBuildPrompt.mockReset()
    runOpenCodePrompt.mockReset()
    runAntigravityPrompt.mockReset()
    runGrokBuildPrompt.mockResolvedValue(promptResult('grok-build/grok-4.7'))
    runOpenCodePrompt.mockResolvedValue(promptResult('opencode-go/glm-5.3'))
    runAntigravityPrompt.mockResolvedValue(promptResult('antigravity/default'))
  })

  it('passes the chosen level into each provider runner', async () => {
    const cases = [
      {
        providerId: 'grok-build',
        modelId: 'grok-build/grok-4.7',
        runner: runGrokBuildPrompt,
      },
      {
        providerId: 'opencode-go',
        modelId: 'opencode-go/glm-5.3',
        runner: runOpenCodePrompt,
      },
      {
        providerId: 'antigravity',
        modelId: 'antigravity/default',
        runner: runAntigravityPrompt,
      },
    ] as const

    for (const item of cases) {
      const response = await POST({
        request: collaborateRequest({
          providerId: item.providerId,
          modelId: item.modelId,
          reasoningEffort: 'low',
          sessionId: 'doc-1',
          sketchDataUrl: 'data:image/png;base64,abc',
        }),
      })
      expect(response.status).toBe(200)
      const payload = (await response.json()) as { ok: boolean }
      expect(payload.ok).toBe(true)
      expect(item.runner).toHaveBeenCalledTimes(1)
      expect(item.runner).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: item.modelId,
          reasoningEffort: 'low',
          imageDataUrls: ['data:image/png;base64,abc'],
          ...(item.providerId === 'opencode-go' ? { sessionId: 'doc-1' } : {}),
        }),
      )
      item.runner.mockClear()
    }
  })

  it('forwards off so a provider can disable extended thinking', async () => {
    const response = await POST({
      request: collaborateRequest({
        providerId: 'antigravity',
        modelId: 'antigravity/default',
        reasoningEffort: 'off',
      }),
    })
    expect(response.status).toBe(200)
    expect(runAntigravityPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ reasoningEffort: 'off' }),
    )
    expect(runGrokBuildPrompt).not.toHaveBeenCalled()
    expect(runOpenCodePrompt).not.toHaveBeenCalled()
  })

  it('omits an unrecognized level instead of inventing one', async () => {
    const response = await POST({
      request: collaborateRequest({
        providerId: 'grok-build',
        modelId: 'grok-build/grok-4.7',
        reasoningEffort: 'turbo',
      }),
    })
    expect(response.status).toBe(200)
    const call = runGrokBuildPrompt.mock.calls[0]?.[0] as {
      reasoningEffort?: string
    }
    expect(call.reasoningEffort).toBeUndefined()
  })
})
