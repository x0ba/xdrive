import { describe, expect, it } from 'vitest'
import { INITIAL_AI_SUBSCRIPTIONS } from '#/lib/marble/subscriptions-seed'
import {
  buildDriveChatModels,
  normalizeReasoningEfforts,
} from './drive-chat-client'
import {
  GrokBuildAcpManager,
  extractGrokBuildModelState,
  resolveGrokBuildModelId,
  selectGrokBuildAuthMethod,
} from './grok-build-acp.server'
import {
  applyGrokBuildStatusToSubscriptions,
  grokBuildModelsToSpecs,
} from './grok-build-client'
import {
  DEFAULT_GROK_BUILD_MODELS,
  fromXDriveGrokBuildModelId,
  isGrokBuildModelId,
  toXDriveGrokBuildModelId,
} from './grok-build-types'
import type { GrokBuildRuntimeStatus } from './grok-build-types'
import type { AcpSessionDiscovery } from './acp-runtime.server'

describe('Grok Build model ID helpers', () => {
  it('prefixes and strips grok-build/ model IDs idempotently', () => {
    expect(toXDriveGrokBuildModelId('grok-4.7')).toBe('grok-build/grok-4.7')
    expect(toXDriveGrokBuildModelId('grok-build/grok-4.7')).toBe(
      'grok-build/grok-4.7',
    )
    expect(fromXDriveGrokBuildModelId('grok-build/grok-4.7-build-fast')).toBe(
      'grok-4.7-build-fast',
    )
    expect(fromXDriveGrokBuildModelId('grok-4.6')).toBe('grok-4.6')
    expect(isGrokBuildModelId('grok-build/grok-4.7')).toBe(true)
    expect(isGrokBuildModelId('xai/grok-4.7')).toBe(false)
    expect(isGrokBuildModelId('opencode-go/grok-4.7')).toBe(false)
  })

  it('routes prefixed IDs, bare IDs, display names, default/auto, and unknown IDs', () => {
    const discovered: Pick<AcpSessionDiscovery, 'models' | 'currentModelId'> = {
      currentModelId: 'grok-4.7',
      models: [
        { id: 'grok-4.7', name: 'Grok 4.7', isDefault: true },
        { id: 'grok-4.7-build-fast', name: 'Grok 4.7 Fast' },
        { id: 'grok-4.6', name: 'Grok 4.6' },
      ],
    }

    expect(
      resolveGrokBuildModelId('grok-build/grok-4.7-build-fast', discovered),
    ).toBe('grok-4.7-build-fast')
    expect(resolveGrokBuildModelId('GROK-4.6', discovered)).toBe('grok-4.6')
    expect(
      resolveGrokBuildModelId('grok-build/Grok 4.7 Fast', discovered),
    ).toBe('grok-4.7-build-fast')
    expect(resolveGrokBuildModelId('default', discovered)).toBe('grok-4.7')
    expect(resolveGrokBuildModelId('grok-build/auto', discovered)).toBe(
      'grok-4.7',
    )
    expect(
      resolveGrokBuildModelId('grok-build/grok-5-preview', discovered),
    ).toBe('grok-5-preview')
  })
})

describe('Grok Build auth method selection', () => {
  it('prefers cached_token when advertised even if XAI_API_KEY is also set', () => {
    const method = selectGrokBuildAuthMethod(
      [{ id: 'cached_token' }, { id: 'grok.com' }],
      true,
    )
    expect(method).toBe('cached_token')
  })

  it('falls back to xai.api_key when cached_token is absent and XAI_API_KEY is set', () => {
    const method = selectGrokBuildAuthMethod([{ id: 'grok.com' }], true)
    expect(method).toBe('xai.api_key')
  })

  it('returns null when neither cached_token nor XAI_API_KEY is available', () => {
    const method = selectGrokBuildAuthMethod([{ id: 'grok.com' }], false)
    expect(method).toBeNull()
  })
})

describe('Grok Build model discovery from initialize._meta.modelState', () => {
  const sampleInit = {
    agentCapabilities: {
      promptCapabilities: { image: true },
    },
    _meta: {
      agentVersion: '1.0.92',
      grokShell: true,
      modelState: {
        currentModelId: 'grok-4.7',
        availableModels: [
          {
            modelId: 'grok-4.7',
            name: 'Grok 4.7',
            description: "SpaceXAI's latest frontier model",
            _meta: {
              totalContextTokens: 256000,
              contextWindows: [256000, 500000],
              supportsReasoningEffort: true,
              reasoningEffort: 'high',
              reasoningEfforts: [
                { id: 'xhigh', value: 'xhigh', default: false },
                { id: 'high', value: 'high', default: true },
                { id: 'medium', value: 'medium', default: false },
                { id: 'low', value: 'low', default: false },
              ],
            },
          },
          {
            modelId: 'grok-4.7-build-fast',
            name: 'Grok 4.7 Fast',
            description: 'Fast variant. 2x the price.',
            _meta: {
              totalContextTokens: 256000,
              supportsReasoningEffort: true,
              reasoningEffort: 'high',
              reasoningEfforts: [
                { value: 'xhigh' },
                { value: 'high', default: true },
                { value: 'low' },
              ],
            },
          },
        ],
      },
    },
  }

  it('extracts models, currentModelId, grokShell, and metadata from initialize._meta.modelState', () => {
    const state = extractGrokBuildModelState(sampleInit)
    expect(state.grokShell).toBe(true)
    expect(state.agentVersion).toBe('1.0.92')
    expect(state.currentModelId).toBe('grok-4.7')
    expect(state.models).toHaveLength(2)
    expect(state.models[0]).toMatchObject({
      id: 'grok-4.7',
      name: 'Grok 4.7',
      contextWindow: 256000,
      contextWindows: [256000, 500000],
      supportsVision: true,
      reasoning: true,
      reasoningEfforts: ['xhigh', 'high', 'medium', 'low'],
      defaultReasoningEffort: 'high',
      isDefault: true,
    })
    expect(state.models[1]?.isDefault).toBe(false)
  })

  it('merges session/new discovery while preserving initialize._meta.modelState metadata', () => {
    const discovery: AcpSessionDiscovery = {
      currentModelId: 'grok-4.7-build-fast',
      modelConfigId: 'model',
      configOptions: [],
      meta: undefined,
      models: [
        { id: 'grok-4.7', name: 'Grok 4.7' },
        { id: 'grok-4.7-build-fast', name: 'Grok 4.7 Fast', isDefault: true },
        { id: 'grok-4.6', name: 'Grok 4.6' },
      ],
    }

    const state = extractGrokBuildModelState(sampleInit, discovery)
    expect(state.currentModelId).toBe('grok-4.7-build-fast')
    expect(state.models.map((m) => m.id)).toEqual([
      'grok-4.7',
      'grok-4.7-build-fast',
      'grok-4.6',
    ])
    expect(state.models[0]?.reasoningEfforts).toEqual([
      'xhigh',
      'high',
      'medium',
      'low',
    ])
    expect(state.models[1]?.isDefault).toBe(true)
    expect(state.models[2]?.contextWindow).toBe(256000)
  })
})

describe('Grok Build client subscription and Drive Chat model mapping', () => {
  it('maps Grok Build runtime status into subscriptions and Drive Chat options', () => {
    const status: GrokBuildRuntimeStatus = {
      ok: true,
      binaryAvailable: true,
      binarySource: 'grok-cli',
      binaryPath: '/home/user/.local/bin/grok --no-auto-update agent stdio',
      agentName: 'Grok Build ACP',
      agentVersion: '1.0.92',
      protocolVersion: 1,
      grokShell: true,
      authenticated: true,
      activeAuthMethod: 'cached_token',
      authSource: 'cached_token',
      authMethods: [{ id: 'cached_token', name: 'cached_token' }],
      tier: 'SuperGrok Heavy',
      models: DEFAULT_GROK_BUILD_MODELS,
      currentModelId: 'grok-4.7',
      configOptions: [],
      supportsImagePrompt: true,
      compliance: {
        protocol: 'ACP (JSON-RPC 2.0 over stdio)',
        cliAuthStoreOnly: true,
        keyStoredInXDrive: false,
      },
    }

    const specs = grokBuildModelsToSpecs(status.models, true)
    expect(specs[0]).toMatchObject({
      id: 'grok-build/grok-4.7',
      providerId: 'grok-build',
      badge: 'Grok Build',
      contextWindow: '256K',
      supportsVisionSketch: true,
    })

    const updatedSubs = applyGrokBuildStatusToSubscriptions(
      INITIAL_AI_SUBSCRIPTIONS,
      status,
    )
    const grokSub = updatedSubs.find((s) => s.providerId === 'grok-build')
    expect(grokSub).toBeDefined()
    expect(grokSub?.connected).toBe(true)
    expect(grokSub?.status).toBe('active')
    expect(grokSub?.planName).toBe('SuperGrok Heavy')
    expect(grokSub?.defaultModelId).toBe('grok-build/grok-4.7')

    const chatModels = buildDriveChatModels({
      subscriptions: updatedSubs,
      grokBuildStatus: status,
    })
    const grok47 = chatModels.find((m) => m.id === 'grok-build/grok-4.7')
    const grok45 = chatModels.find((m) => m.id === 'grok-build/grok-4.5')
    expect(grok47?.connected).toBe(true)
    expect(grok47?.reasoningEfforts).toEqual(['low', 'medium', 'high', 'max'])
    expect(grok45?.reasoningEfforts).toEqual(['low', 'medium', 'high'])
  })

  it('only includes "off" in normalizeReasoningEfforts when supported by the model', () => {
    expect(
      normalizeReasoningEfforts(['xhigh', 'high', 'medium', 'low']),
    ).toEqual(['low', 'medium', 'high', 'max'])
    expect(normalizeReasoningEfforts(['high', 'medium', 'low'])).toEqual([
      'low',
      'medium',
      'high',
    ])
    expect(normalizeReasoningEfforts(['none', 'low', 'high'])).toEqual([
      'off',
      'low',
      'high',
    ])
    expect(normalizeReasoningEfforts(['off', 'medium', 'max'])).toEqual([
      'off',
      'medium',
      'max',
    ])
    expect(normalizeReasoningEfforts(['low', 'high'], false)).toEqual(['off'])
  })
})

describe('GrokBuildAcpManager non-disruptive refresh', () => {
  it('completes an in-flight prompt when getStatus(true) refreshes on a new connection', async () => {
    const fakeAcpScript = `
      const readline = require('node:readline');
      const rl = readline.createInterface({ input: process.stdin });
      const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\\n');
      let seq = 0;
      rl.on('line', (line) => {
        if (!line.trim()) return;
        const req = JSON.parse(line);
        if (req.method === 'initialize') {
          send({
            jsonrpc: '2.0',
            id: req.id,
            result: {
              protocolVersion: 1,
              agentCapabilities: { promptCapabilities: { image: true } },
              authMethods: [{ id: 'cached_token', name: 'cached_token' }],
              _meta: {
                agentVersion: 'pid-' + process.pid,
                grokShell: true,
                modelState: {
                  currentModelId: 'grok-4.7',
                  availableModels: [{ modelId: 'grok-4.7', name: 'Grok 4.7' }],
                },
              },
            },
          });
        } else if (req.method === 'authenticate') {
          send({
            jsonrpc: '2.0',
            id: req.id,
            result: { _meta: { subscription_tier: 'SuperGrok' } },
          });
        } else if (req.method === 'session/new') {
          send({
            jsonrpc: '2.0',
            id: req.id,
            result: {
              sessionId: 'sess-' + (++seq) + '-' + process.pid,
              models: {
                currentModelId: 'grok-4.7',
                availableModels: [{ modelId: 'grok-4.7', name: 'Grok 4.7' }],
              },
              configOptions: [],
            },
          });
        } else if (req.method === 'session/prompt') {
          const sid = req.params.sessionId;
          send({
            jsonrpc: '2.0',
            method: 'session/update',
            params: {
              sessionId: sid,
              update: {
                sessionUpdate: 'agent_message_chunk',
                content: { type: 'text', text: 'part1:' + process.pid + ':' },
              },
            },
          });
          setTimeout(() => {
            send({
              jsonrpc: '2.0',
              method: 'session/update',
              params: {
                sessionId: sid,
                update: {
                  sessionUpdate: 'agent_message_chunk',
                  content: { type: 'text', text: 'part2' },
                },
              },
            });
            send({
              jsonrpc: '2.0',
              id: req.id,
              result: { stopReason: 'end_turn' },
            });
          }, 220);
        } else if (req.method === 'session/close') {
          send({ jsonrpc: '2.0', id: req.id, result: {} });
        }
      });
    `

    const manager = new GrokBuildAcpManager({
      resolveBinary: async () => ({
        source: 'custom',
        command: process.execPath,
        args: ['-e', fakeAcpScript],
        displayPath: 'fake-grok-acp',
      }),
    })

    try {
      let resolveFirstDelta!: () => void
      const firstDeltaSeen = new Promise<void>((resolve) => {
        resolveFirstDelta = resolve
      })

      const inFlightPrompt = manager.runPrompt({
        prompt: 'hello',
        onTextDelta: () => resolveFirstDelta(),
      })

      // Wait until prompt #1 is actively streaming on Process #1.
      await firstDeltaSeen

      // Trigger a force refresh (Settings -> Refresh) while prompt #1 is in-flight.
      const refreshedStatus = await manager.getStatus(true)
      expect(refreshedStatus.authenticated).toBe(true)
      expect(refreshedStatus.agentVersion).toMatch(/^pid-\d+$/)

      // In-flight prompt must finish uninterrupted on its original process.
      const firstResult = await inFlightPrompt
      expect(firstResult.stopReason).toBe('end_turn')
      expect(firstResult.text).toMatch(/^part1:\d+:part2$/)
      expect(firstResult.agentVersion).not.toBe(refreshedStatus.agentVersion)

      // Subsequent prompts route to the refreshed process.
      const secondResult = await manager.runPrompt({ prompt: 'follow-up' })
      expect(secondResult.agentVersion).toBe(refreshedStatus.agentVersion)
      expect(secondResult.text).toContain(
        refreshedStatus.agentVersion!.replace('pid-', ''),
      )
    } finally {
      await manager.shutdown()
    }
  })
})
