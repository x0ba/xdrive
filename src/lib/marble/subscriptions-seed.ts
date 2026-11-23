import type { AISubscription } from '../types'
import { DEFAULT_OPENCODE_GO_MODELS } from '../ai/opencode-go-types'
import { openCodeGoModelsToSpecs } from '../ai/opencode-go-client'

// Live AI providers:
// 1. Google Antigravity via the official Agent Client Protocol (ACP) runtime
//    (`agy acp` / ACP Registry binary), using native Google OAuth for personal
//    Google AI plans (Pro / Ultra / Free), Gemini Enterprise, or Gemini API key.
// 2. OpenCode Go via the official OpenCode Go inference API
//    (`https://opencode.ai/inference/go`), authenticating with OPENCODE_API_KEY
//    or a personal/service-account key entered in Models & Providers.
//
// Live connection state, usage meters, and exact available models are populated
// from GET /api/ai. Other third-party providers start honestly disconnected.
export const INITIAL_AI_SUBSCRIPTIONS: AISubscription[] = [
  {
    providerId: 'antigravity',
    name: 'Google Antigravity',
    tagline:
      'Official Antigravity ACP runtime (`agy acp`) with native Google AI plan OAuth.',
    planName: 'Google AI Plan',
    connected: false,
    authMethod: 'antigravity_acp',
    status: 'disconnected',
    defaultModelId: 'antigravity/default',
    endpointUrl: 'agy acp (JSON-RPC stdio)',
    usageThisMonth: { opsGenerated: 0, appsBuilt: 0, quotaPercent: 0 },
    models: [
      {
        id: 'antigravity/default',
        name: 'Gemini (Google AI Plan)',
        providerId: 'antigravity',
        badge: 'Antigravity',
        role: 'implementation',
        contextWindow: '1M',
        speedTier: 'deep',
        supportsVisionSketch: true,
        recommendedFor: 'Sign in via Antigravity ACP to load your plan models',
      },
    ],
  },
  {
    providerId: 'opencode-go',
    name: 'OpenCode Go',
    tagline:
      'Unified subscription routing across GLM, Kimi, DeepSeek, Gemini, Claude, GPT, and Qwen via opencode.ai/inference/go.',
    planName: 'Go Subscription',
    connected: false,
    authMethod: 'api_key',
    status: 'disconnected',
    defaultModelId: 'opencode-go/glm-5.3',
    endpointUrl: 'https://opencode.ai/inference/go',
    usageThisMonth: { opsGenerated: 0, appsBuilt: 0, quotaPercent: 0 },
    models: openCodeGoModelsToSpecs(DEFAULT_OPENCODE_GO_MODELS),
  },
  {
    providerId: 'openai',
    name: 'OpenAI',
    tagline: 'Not yet configured on this server.',
    planName: 'API',
    connected: false,
    authMethod: 'api_key',
    status: 'disconnected',
    defaultModelId: 'gpt-5.4',
    endpointUrl: 'https://api.openai.com/v1',
    usageThisMonth: { opsGenerated: 0, appsBuilt: 0, quotaPercent: 0 },
    models: [
      {
        id: 'gpt-5.4',
        name: 'GPT-5.4',
        providerId: 'openai',
        badge: 'GPT',
        role: 'implementation',
        contextWindow: '400K',
        speedTier: 'fast',
        supportsVisionSketch: true,
        recommendedFor: 'Implementation',
      },
      {
        id: 'o4-mini',
        name: 'o4-mini',
        providerId: 'openai',
        badge: 'o4',
        role: 'reasoning',
        contextWindow: '200K',
        speedTier: 'fast',
        supportsVisionSketch: false,
        recommendedFor: 'Reasoning',
      },
    ],
  },
  {
    providerId: 'claude',
    name: 'Anthropic Claude',
    tagline: 'Not yet configured on this server.',
    planName: 'API',
    connected: false,
    authMethod: 'api_key',
    status: 'disconnected',
    defaultModelId: 'claude-sonnet-5-5',
    endpointUrl: 'https://api.anthropic.com',
    usageThisMonth: { opsGenerated: 0, appsBuilt: 0, quotaPercent: 0 },
    models: [
      {
        id: 'claude-sonnet-5-5',
        name: 'Claude Sonnet 5.5',
        providerId: 'claude',
        badge: 'Sonnet',
        role: 'implementation',
        contextWindow: '400K',
        speedTier: 'fast',
        supportsVisionSketch: true,
        recommendedFor: 'Implementation',
      },
      {
        id: 'claude-opus-5-5',
        name: 'Claude Opus 5.5',
        providerId: 'claude',
        badge: 'Opus',
        role: 'reasoning',
        contextWindow: '400K',
        speedTier: 'deep',
        supportsVisionSketch: true,
        recommendedFor: 'Reasoning',
      },
    ],
  },
  {
    providerId: 'xai',
    name: 'SpaceX AI / xAI',
    tagline: 'Not yet configured on this server.',
    planName: 'API',
    connected: false,
    authMethod: 'api_key',
    status: 'disconnected',
    defaultModelId: 'xai/grok-4.7',
    endpointUrl: 'https://api.x.ai/v1',
    usageThisMonth: { opsGenerated: 0, appsBuilt: 0, quotaPercent: 0 },
    models: [
      {
        id: 'xai/grok-4.7',
        name: 'Grok 4.7',
        providerId: 'xai',
        badge: 'Grok',
        role: 'implementation',
        contextWindow: '256K',
        speedTier: 'deep',
        supportsVisionSketch: true,
        recommendedFor: 'Implementation',
      },
    ],
  },
]
