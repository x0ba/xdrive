import { describe, expect, it } from 'vitest'
import type { DriveChatApiRequest } from './drive-chat-types'
import { parseReasoningEffort } from './drive-chat-types'
import {
  prepareDriveChatRequest,
  reasoningEffortForModel,
  resolveReasoningEffort,
} from './drive-chat-client'
import {
  COLLABORATE_ACP_PROVIDERS,
  collaborateProviderPrompt,
} from './reasoning-effort'

const driveRequest = {
  threadId: 'thread-1',
  modelId: 'grok-build/grok-4.7',
  providerId: 'grok-build' as const,
  reasoningEffort: 'max' as const,
  mode: 'review' as const,
  messages: [{ role: 'user' as const, content: 'Summarize the draft' }],
  drive: { docs: [], trashedDocs: [], folders: [], focusedRefs: [] },
} satisfies DriveChatApiRequest

describe('reasoning effort desync', () => {
  it('keeps a supported selection exactly as chosen', () => {
    expect(resolveReasoningEffort('low', ['low', 'medium', 'high'])).toBe('low')
    expect(
      reasoningEffortForModel(
        {
          supportsReasoning: true,
          reasoningEfforts: ['off', 'low', 'high', 'max'],
        },
        'max',
      ),
    ).toBe('max')
  })

  it('sends the effort the picker displays when the selection is unsupported', () => {
    const supported = ['low', 'medium', 'high'] as const
    const shown = resolveReasoningEffort('max', supported)
    const sent = prepareDriveChatRequest(
      { ...driveRequest, reasoningEffort: 'max' },
      { supportsReasoning: true, reasoningEfforts: supported },
    ).reasoningEffort

    expect(shown).toBe('high')
    expect(sent).toBe(shown)
    expect(sent).not.toBe('max')
  })

  it('clamps a stale off selection on models that cannot disable reasoning', () => {
    const model = {
      supportsReasoning: true,
      reasoningEfforts: ['low', 'medium', 'high', 'max'] as const,
    }
    expect(reasoningEffortForModel(model, 'off')).toBe('max')
    expect(
      prepareDriveChatRequest(
        { ...driveRequest, reasoningEffort: 'off' },
        model,
      ).reasoningEffort,
    ).toBe('max')
  })

  it('sends off when the model does not support reasoning', () => {
    expect(
      reasoningEffortForModel(
        { supportsReasoning: false, reasoningEfforts: ['low', 'high'] },
        'high',
      ),
    ).toBe('off')
  })

  it('leaves the rest of the Drive Chat request unchanged', () => {
    const prepared = prepareDriveChatRequest(driveRequest, {
      supportsReasoning: true,
      reasoningEfforts: ['low', 'medium', 'high', 'max'],
    })
    expect(prepared.modelId).toBe(driveRequest.modelId)
    expect(prepared.messages).toEqual(driveRequest.messages)
    expect(prepared.reasoningEffort).toBe('max')
  })
})

describe('collaborate provider effort wiring', () => {
  it('parses provider aliases and rejects unknown levels', () => {
    expect(parseReasoningEffort(' xHigh ')).toBe('max')
    expect(parseReasoningEffort('extra-high')).toBe('max')
    expect(parseReasoningEffort('none')).toBe('off')
    expect(parseReasoningEffort('minimal')).toBe('off')
    expect(parseReasoningEffort('HIGH')).toBe('high')
    expect(parseReasoningEffort('turbo')).toBeUndefined()
    expect(parseReasoningEffort(3)).toBeUndefined()
  })

  it('forwards the chosen level to Antigravity, OpenCode, and Grok Build', () => {
    for (const providerId of COLLABORATE_ACP_PROVIDERS) {
      const call = collaborateProviderPrompt({
        providerId,
        prompt: 'Rewrite the selected theorem',
        modelId: `${providerId}/default`,
        reasoningEffort: 'low',
        sessionId: 'doc-1',
        imageDataUrls: ['data:image/png;base64,abc'],
      })
      expect(call.providerId).toBe(providerId)
      expect(call.reasoningEffort).toBe('low')
      expect(call.prompt).toBe('Rewrite the selected theorem')
      expect(call.modelId).toBe(`${providerId}/default`)
      expect(call.sessionId).toBe('doc-1')
      expect(call.imageDataUrls).toEqual(['data:image/png;base64,abc'])
    }
  })

  it('still forwards off so providers can disable extended thinking', () => {
    const call = collaborateProviderPrompt({
      providerId: 'antigravity',
      prompt: 'Rename the heading',
      modelId: 'antigravity/default',
      reasoningEffort: 'off',
    })
    expect(call.reasoningEffort).toBe('off')
  })

  it('drops an unrecognized effort instead of inventing one', () => {
    const call = collaborateProviderPrompt({
      providerId: 'grok-build',
      prompt: 'Check the citations',
      modelId: 'grok-build/grok-4.7',
      reasoningEffort: 'turbo',
    })
    expect(call.reasoningEffort).toBeUndefined()
    expect(call).not.toHaveProperty('sessionId')
  })
})
