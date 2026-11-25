import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { DEFAULT_OPENCODE_GO_MODELS } from '#/lib/ai/opencode-go-types'
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
      transport: 'acp',
      binaryAvailable: true,
      binarySource: 'opencode-cli',
      binaryPath: '/usr/local/bin/opencode acp',
      agentName: 'OpenCode',
      agentVersion: '1.2.0',
      protocolVersion: 1,
      authenticated: true,
      entitled: true,
      authSource: 'opencode-cli',
      loggedInProviders: ['OpenCode Go'],
      keySource: 'none',
      maskedKey: null,
      endpointBaseUrl: '/usr/local/bin/opencode acp',
      models: DEFAULT_OPENCODE_GO_MODELS.map((model) => ({
        ...model,
        acpModelId: `opencode-go/${model.id}`,
        apiProtocol: 'acp' as const,
        baseUrl: 'opencode acp',
      })),
      currentModelId: 'glm-5.3',
      configOptions: [],
      supportsImagePrompt: true,
      usage: null,
      rateLimited: false,
      compliance: {
        protocol: 'ACP (JSON-RPC 2.0 over stdio)',
        cliAuthStoreOnly: true,
        keyStoredInXDrive: false,
      },
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
