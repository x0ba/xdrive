import type { Meta, StoryObj } from '@storybook/tanstack-react'
import {
  DEFAULT_OPENCODE_GO_MODELS,
  OPENCODE_GO_ENDPOINT_BASE_URL,
} from '#/lib/ai/opencode-go-types'
import { SubscriptionModal } from './SubscriptionModal'

/**
 * Model provider connections, API key / OAuth subscriptions, usage meters, and per-role model assignments.
 *
 * @summary AI model subscriptions and role routing settings panel
 */
const meta = {
  title: 'xDrive Collaborator/Models & Providers',
  component: SubscriptionModal,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof SubscriptionModal>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Full-page model provider and role routing settings layout.
 *
 * @summary Models & providers page view
 */
export const ModelsAndProviders: Story = {
  name: 'Models & Providers',
  args: {
    variant: 'page',
    antigravityStatus: {
      ok: true,
      binaryAvailable: true,
      binarySource: 'agy-cli',
      binaryPath: '/opt/homebrew/bin/agy acp',
      agentName: 'Antigravity ACP Server',
      agentVersion: '1.5.12',
      protocolVersion: 1,
      authenticated: true,
      activeAuthMethod: 'oauth-personal',
      authMethods: [
        {
          id: 'oauth-personal',
          name: 'Log in with Google',
          description: 'Log in with your Google account',
        },
        {
          id: 'oauth-business',
          name: 'Log in with Gemini Enterprise',
          description: 'Log in with your Gemini Enterprise account',
        },
        {
          id: 'gemini-api-key',
          name: 'Gemini API key',
          description: 'Use an API key with Gemini Developer API',
        },
        {
          id: 'agent-platform',
          name: 'Gemini Enterprise Agent Platform',
          description: 'Use Vertex AI with Application Default Credentials',
        },
      ],
      tier: 'Google AI Pro',
      models: [
        {
          id: 'default',
          name: 'Gemini (Google AI Plan)',
          description: 'Active Gemini model from your Google AI plan',
          isDefault: true,
        },
      ],
      currentModelId: 'default',
      supportsLogout: true,
      supportsImagePrompt: true,
      compliance: {
        protocol: 'ACP (JSON-RPC 2.0 over stdio)',
        unmodifiedOfficialBinary: true,
        nativeAuthOnly: true,
        tokenExtraction: false,
      },
    },
    openCodeGoStatus: {
      ok: true,
      authenticated: true,
      entitled: true,
      keySource: 'env',
      maskedKey: 'sk-o···9f2a',
      endpointBaseUrl: OPENCODE_GO_ENDPOINT_BASE_URL,
      models: DEFAULT_OPENCODE_GO_MODELS,
      currentModelId: 'glm-5.3',
      usage: {
        rolling: {
          status: 'ok',
          percent: 18,
          resetsAt: '2026-11-23T22:00:00.000Z',
        },
        weekly: {
          status: 'ok',
          percent: 34,
          resetsAt: '2026-11-30T00:00:00.000Z',
        },
        monthly: {
          status: 'ok',
          percent: 42,
          resetsAt: '2026-12-01T00:00:00.000Z',
        },
      },
      rateLimited: false,
    },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-[var(--xd-canvas)] p-6 text-[var(--xd-ink)]">
        <div className="mx-auto max-w-4xl">
          <Story />
        </div>
      </div>
    ),
  ],
}
