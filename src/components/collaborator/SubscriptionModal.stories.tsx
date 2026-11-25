import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { expect, within } from 'storybook/test'
import { DEFAULT_OPENCODE_GO_MODELS } from '#/lib/ai/opencode-go-types'
import type { OpenCodeGoModelOption } from '#/lib/ai/opencode-go-types'
import { applyOpenCodeGoStatusToSubscriptions } from '#/lib/ai/opencode-go-client'
import { DEFAULT_GROK_BUILD_MODELS } from '#/lib/ai/grok-build-types'
import { applyGrokBuildStatusToSubscriptions } from '#/lib/ai/grok-build-client'
import { DEFAULT_SUBSCRIPTIONS, SubscriptionModal } from './SubscriptionModal'

const DEMO_OPENCODE_FREE_MODELS: OpenCodeGoModelOption[] = [
  {
    id: 'opencode/tidepool-alpha-free',
    acpModelId: 'opencode/tidepool-alpha-free',
    name: 'Tidepool Alpha',
    description: 'Free model via local OpenCode ACP',
    family: 'opencode',
    contextWindow: 256_000,
    outputLimit: 16_384,
    supportsVision: true,
    reasoning: true,
    featured: false,
    isFree: true,
    apiProtocol: 'acp',
    baseUrl: 'opencode acp',
  },
  {
    id: 'opencode/big-pickle',
    acpModelId: 'opencode/big-pickle',
    name: 'Big Pickle',
    description: 'Free model via local OpenCode ACP',
    family: 'opencode',
    contextWindow: 256_000,
    outputLimit: 16_384,
    supportsVision: true,
    reasoning: true,
    featured: false,
    isFree: true,
    apiProtocol: 'acp',
    baseUrl: 'opencode acp',
  },
  {
    id: 'opencode/deepseek-v4.1-flash-free',
    acpModelId: 'opencode/deepseek-v4.1-flash-free',
    name: 'DeepSeek V4.1 Flash',
    description: 'Free model via local OpenCode ACP',
    family: 'opencode',
    contextWindow: 1_000_000,
    outputLimit: 131_072,
    supportsVision: true,
    reasoning: true,
    featured: false,
    isFree: true,
    apiProtocol: 'acp',
    baseUrl: 'opencode acp',
  },
]

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

const CONNECTED_OPENCODE_STATUS = {
  ok: true,
  transport: 'acp' as const,
  binaryAvailable: true,
  binarySource: 'opencode-cli' as const,
  binaryPath: '/usr/local/bin/opencode acp',
  agentName: 'OpenCode',
  agentVersion: '1.2.0',
  protocolVersion: 1,
  authenticated: true,
  entitled: true,
  authSource: 'opencode-cli' as const,
  loggedInProviders: ['OpenCode Go'],
  keySource: 'none' as const,
  maskedKey: null,
  endpointBaseUrl: '/usr/local/bin/opencode acp',
  models: [
    ...DEFAULT_OPENCODE_GO_MODELS.map((model) => ({
      ...model,
      acpModelId: `opencode-go/${model.id}`,
      apiProtocol: 'acp' as const,
      baseUrl: 'opencode acp',
    })),
    ...DEMO_OPENCODE_FREE_MODELS,
  ],
  currentModelId: 'glm-5.3',
  configOptions: [],
  supportsImagePrompt: true,
  usage: null,
  rateLimited: false,
  compliance: {
    protocol: 'ACP (JSON-RPC 2.0 over stdio)' as const,
    cliAuthStoreOnly: true,
    keyStoredInXDrive: false as const,
  },
}

const CONNECTED_GROK_BUILD_STATUS = {
  ok: true,
  binaryAvailable: true,
  binarySource: 'grok-cli' as const,
  binaryPath: '/usr/local/bin/grok --no-auto-update agent stdio',
  agentName: 'Grok Build ACP',
  agentVersion: '1.0.92',
  protocolVersion: 1,
  grokShell: true,
  authenticated: true,
  activeAuthMethod: 'cached_token',
  authSource: 'cached_token' as const,
  authMethods: [
    {
      id: 'cached_token',
      name: 'cached_token',
      description: 'Cached token from ~/.grok/auth.json',
    },
    {
      id: 'grok.com',
      name: 'Grok',
      description: 'Sign in with Grok',
    },
  ],
  tier: 'SuperGrok Heavy',
  models: DEFAULT_GROK_BUILD_MODELS,
  currentModelId: 'grok-4.7',
  configOptions: [],
  supportsImagePrompt: true,
  compliance: {
    protocol: 'ACP (JSON-RPC 2.0 over stdio)' as const,
    cliAuthStoreOnly: true,
    keyStoredInXDrive: false as const,
  },
}

const SIGNED_OUT_GROK_BUILD_STATUS = {
  ...CONNECTED_GROK_BUILD_STATUS,
  authenticated: false,
  activeAuthMethod: null,
  authSource: 'none' as const,
  authMethods: [
    {
      id: 'grok.com',
      name: 'Grok',
      description: 'Sign in with Grok',
    },
  ],
  tier: null,
  error:
    'Grok CLI was found, but no active sign-in was detected. Run `grok login` in your terminal (or set `XAI_API_KEY` in `.env.local`), then click Refresh.',
}

/**
 * Full-page model provider and role routing settings layout.
 *
 * @summary Models & providers page view
 */
export const ModelsAndProviders: Story = {
  name: 'Models & Providers',
  args: {
    variant: 'page',
    subscriptions: applyGrokBuildStatusToSubscriptions(
      applyOpenCodeGoStatusToSubscriptions(
        DEFAULT_SUBSCRIPTIONS,
        CONNECTED_OPENCODE_STATUS,
      ),
      CONNECTED_GROK_BUILD_STATUS,
    ),
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
    openCodeGoStatus: CONNECTED_OPENCODE_STATUS,
    grokBuildStatus: CONNECTED_GROK_BUILD_STATUS,
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const openCodeLink = canvas.getByRole('link', { name: /OpenCode Go/i })
    await expect(openCodeLink).toHaveAttribute(
      'href',
      '/settings/models/opencode-go',
    )
    const grokBuildLink = canvas.getByRole('link', { name: /Grok Build/i })
    await expect(grokBuildLink).toHaveAttribute(
      'href',
      '/settings/models/grok-build',
    )
  },
}

const FREE_ONLY_STATUS = {
  ok: true,
  transport: 'acp' as const,
  binaryAvailable: true,
  binarySource: 'opencode-cli' as const,
  binaryPath: '/usr/local/bin/opencode acp',
  agentName: 'OpenCode',
  agentVersion: '2.4.1',
  protocolVersion: 1,
  authenticated: false,
  entitled: false,
  authSource: 'none' as const,
  loggedInProviders: [],
  keySource: 'none' as const,
  maskedKey: null,
  endpointBaseUrl: '/usr/local/bin/opencode acp',
  models: DEMO_OPENCODE_FREE_MODELS,
  currentModelId: 'opencode/big-pickle',
  configOptions: [],
  supportsImagePrompt: true,
  usage: null,
  rateLimited: false,
  compliance: {
    protocol: 'ACP (JSON-RPC 2.0 over stdio)' as const,
    cliAuthStoreOnly: true,
    keyStoredInXDrive: false as const,
  },
}

/**
 * OpenCode provider view when only the OpenCode CLI is installed (no OpenCode Go login):
 * free models are immediately usable under the Free section.
 *
 * @summary OpenCode Free models without login
 */
export const OpenCodeFreeOnly: Story = {
  args: {
    variant: 'page',
    activeProviderId: 'opencode-go',
    openCodeGoStatus: FREE_ONLY_STATUS,
    subscriptions: applyOpenCodeGoStatusToSubscriptions(
      DEFAULT_SUBSCRIPTIONS,
      FREE_ONLY_STATUS,
    ),
  },
  decorators: ModelsAndProviders.decorators,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Tidepool Alpha')).toBeVisible()
    await expect(canvas.getByText('Big Pickle')).toBeVisible()
    await expect(canvas.getByText(/Free models · OpenCode ACP/i)).toBeVisible()
  },
}

/**
 * Grok Build provider view when the local `grok` CLI is installed and authenticated
 * via `grok login` (`cached_token`).
 *
 * @summary Grok Build ACP connected state
 */
export const GrokBuildConnected: Story = {
  args: {
    variant: 'page',
    activeProviderId: 'grok-build',
    grokBuildStatus: CONNECTED_GROK_BUILD_STATUS,
    subscriptions: applyGrokBuildStatusToSubscriptions(
      DEFAULT_SUBSCRIPTIONS,
      CONNECTED_GROK_BUILD_STATUS,
    ),
  },
  decorators: ModelsAndProviders.decorators,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Connected · SuperGrok Heavy/i)).toBeVisible()
    await expect(canvas.getByText('Grok 4.7')).toBeVisible()
    await expect(canvas.getByText('Grok 4.7 Fast')).toBeVisible()
  },
}

/**
 * Grok Build provider view when the local `grok` CLI is installed but not signed in,
 * guiding the user to run `grok login` or set `XAI_API_KEY`.
 *
 * @summary Grok Build ACP sign-in required state
 */
export const GrokBuildSignedOut: Story = {
  args: {
    variant: 'page',
    activeProviderId: 'grok-build',
    grokBuildStatus: SIGNED_OUT_GROK_BUILD_STATUS,
    subscriptions: applyGrokBuildStatusToSubscriptions(
      DEFAULT_SUBSCRIPTIONS,
      SIGNED_OUT_GROK_BUILD_STATUS,
    ),
  },
  decorators: ModelsAndProviders.decorators,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Sign in required/i)).toBeVisible()
    await expect(canvas.getByText('grok login')).toBeVisible()
  },
}
