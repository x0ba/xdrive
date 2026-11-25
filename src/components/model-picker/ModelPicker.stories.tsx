import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { expect, userEvent, within } from 'storybook/test'
import type { ReasoningEffort } from '#/lib/ai/drive-chat-types'
import { CHAT_DEMO_MODELS } from '#/components/chat/demo-fixtures'
import { ModelPicker } from './ModelPicker'
import type { ModelPickerOption } from './types'

const DEMO_MODELS: ModelPickerOption[] = [
  ...CHAT_DEMO_MODELS,
  {
    id: 'xai/grok-4.7',
    name: 'Grok 4.7',
    providerId: 'xai',
    providerName: 'SpaceX AI / xAI',
    connected: true,
    status: 'rate_limited',
    contextWindow: '256K',
    supportsReasoning: true,
    reasoningEfforts: ['off', 'low', 'medium', 'high'],
    description: 'Staged .mrbl edits (currently rate limited)',
    badge: 'xAI',
  },
]

const INITIAL_FAVORITES = [
  'antigravity/gemini-4-neon',
  'opencode-go/glm-5.3',
  'opencode-go/kimi-k3.1-pro',
]

/**
 * Shared T3-Code-style model picker used across xDrive: Drive Chat, collaborator
 * panels, New App modal, Agent Hero composer, and Models & Providers role settings.
 *
 * Features a left provider icon rail with animated indicator pill, Favorites tab,
 * instant cross-provider search, uniform model rows with star-to-favorite,
 * keyboard navigation, and an optional docked Reasoning Effort column.
 *
 * @summary T3-Code-style model and reasoning effort picker
 */
const meta = {
  title: 'xDrive Model Picker/ModelPicker',
  component: ModelPicker,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ModelPicker>

export default meta
type Story = StoryObj<typeof meta>

function InteractiveStandardPicker({
  defaultOpen = false,
  defaultSearchQuery = '',
  defaultTab,
  initialModelId = DEMO_MODELS[0].id,
  initialFavorites = INITIAL_FAVORITES,
  variant = 'ghost',
  size = 'sm',
}: {
  defaultOpen?: boolean
  defaultSearchQuery?: string
  defaultTab?:
    'favorites' | 'antigravity' | 'opencode-go' | 'claude' | 'openai' | 'xai'
  initialModelId?: string
  initialFavorites?: string[]
  variant?: 'ghost' | 'field'
  size?: 'sm' | 'xs'
}) {
  const [modelId, setModelId] = useState(initialModelId)
  const [favorites, setFavorites] = useState<string[]>(initialFavorites)

  return (
    <div className="flex min-h-[420px] items-start justify-center p-6">
      <div className={variant === 'field' ? 'w-64' : undefined}>
        <ModelPicker
          models={DEMO_MODELS}
          selectedModelId={modelId}
          onSelectModel={setModelId}
          favoriteModelIds={favorites}
          onFavoriteModelIdsChange={setFavorites}
          onOpenProviders={() => {}}
          variant={variant}
          size={size}
          side="bottom"
          align="start"
          defaultOpen={defaultOpen}
          defaultSearchQuery={defaultSearchQuery}
          defaultTab={defaultTab}
        />
      </div>
    </div>
  )
}

function InteractiveDockedPicker({
  defaultOpen = true,
  initialEffort = 'high',
}: {
  defaultOpen?: boolean
  initialEffort?: ReasoningEffort
}) {
  const [modelId, setModelId] = useState(DEMO_MODELS[0].id)
  const [favorites, setFavorites] = useState<string[]>(INITIAL_FAVORITES)
  const [effort, setEffort] = useState<ReasoningEffort>(initialEffort)

  return (
    <div className="flex min-h-[440px] items-end justify-center p-6 pb-8">
      <div className="rounded-xl border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] px-2.5 py-2 shadow-sm">
        <ModelPicker
          models={DEMO_MODELS}
          selectedModelId={modelId}
          onSelectModel={setModelId}
          favoriteModelIds={favorites}
          onFavoriteModelIdsChange={setFavorites}
          reasoningEffort={effort}
          onSelectReasoningEffort={setEffort}
          effortDisplay="both"
          onOpenProviders={() => {}}
          side="top"
          align="start"
          defaultOpen={defaultOpen}
        />
      </div>
    </div>
  )
}

/**
 * Compact ghost trigger button in closed state; click to browse providers, favorites, or search.
 *
 * @summary Default closed composer trigger
 */
export const Default: Story = {
  args: {
    models: DEMO_MODELS,
    selectedModelId: DEMO_MODELS[0].id,
    onSelectModel: () => {},
  },
  render: () => <InteractiveStandardPicker />,
}

/**
 * Open two-pane popover showing the Favorites tab, animated vertical provider rail indicator,
 * search bar, and star-to-favorite model rows.
 *
 * @summary Open two-pane popover on Favorites tab
 */
export const OpenFavorites: Story = {
  args: { ...Default.args },
  render: () => (
    <InteractiveStandardPicker defaultOpen defaultTab="favorites" />
  ),
  play: async () => {
    const body = within(document.body)
    const search = await body.findByPlaceholderText('Search models...')
    await expect(search).toBeVisible()
    await expect(body.getByText('GLM-5.3')).toBeVisible()
    const firstActiveId = search.getAttribute('aria-activedescendant')
    await expect(firstActiveId).toBeTruthy()
    await userEvent.keyboard('{ArrowDown}')
    const secondActiveId = search.getAttribute('aria-activedescendant')
    await expect(secondActiveId).toBeTruthy()
    await expect(secondActiveId).not.toBe(firstActiveId)
  },
}

/**
 * Open popover filtered to a specific provider tab (OpenCode Go), demonstrating provider
 * grouping, context window metadata, and favorite sorting.
 *
 * @summary Open popover on a provider tab
 */
export const ProviderTab: Story = {
  args: { ...Default.args },
  render: () => (
    <InteractiveStandardPicker defaultOpen defaultTab="opencode-go" />
  ),
}

/**
 * T3-Code signature docked composer layout with the right-hand Reasoning Effort column,
 * aligned search/effort header rule, effort bars in the trigger, and keyboard flow.
 *
 * @summary Docked model picker with right-hand Reasoning Effort column
 */
export const DockedWithEffortColumn: Story = {
  args: { ...Default.args },
  render: () => <InteractiveDockedPicker defaultOpen initialEffort="high" />,
  play: async () => {
    const body = within(document.body)
    const effortGroup = await body.findByRole('radiogroup', {
      name: 'Reasoning effort',
    })
    const maxOption = within(effortGroup).getByRole('radio', { name: 'Max' })
    await userEvent.click(maxOption)
    await expect(maxOption).toHaveAttribute('aria-checked', 'true')
  },
}

/**
 * Active cross-provider search hides the left provider rail and ranks matches across
 * connected and disconnected providers.
 *
 * @summary Cross-provider search results state
 */
export const SearchActive: Story = {
  args: { ...Default.args },
  render: () => (
    <InteractiveStandardPicker defaultOpen defaultSearchQuery="gemini" />
  ),
}

/**
 * Disconnected provider tab showing `Off` badges and the inline provider setup callout.
 *
 * @summary Disconnected provider with setup notice
 */
export const DisconnectedProvider: Story = {
  args: { ...Default.args },
  render: () => (
    <InteractiveStandardPicker
      defaultOpen
      defaultTab="claude"
      initialModelId="claude-opus-5-5"
    />
  ),
}

/**
 * Empty favorites state when no models have been starred yet.
 *
 * @summary Empty favorites state
 */
export const EmptyFavorites: Story = {
  args: { ...Default.args },
  render: () => (
    <InteractiveStandardPicker
      defaultOpen
      defaultTab="favorites"
      initialFavorites={[]}
    />
  ),
}

/**
 * Form field trigger variant used inside settings panels (Models & Providers role routing).
 *
 * @summary Field trigger variant for settings forms
 */
export const FieldVariant: Story = {
  args: { ...Default.args },
  render: () => (
    <InteractiveStandardPicker defaultOpen variant="field" size="sm" />
  ),
}

/**
 * Side-by-side matrix of trigger densities, variants, reasoning badges, disconnected,
 * disabled, and empty states.
 *
 * @summary Trigger variants and edge states showcase
 */
export const TriggerVariants: Story = {
  args: { ...Default.args },
  render: () => (
    <div className="mx-auto grid max-w-2xl gap-4 p-6">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--xd-border)] bg-[var(--xd-rail)] p-4">
        <ModelPicker
          models={DEMO_MODELS}
          selectedModelId="antigravity/gemini-4-neon"
          onSelectModel={() => {}}
          reasoningEffort="high"
          onSelectReasoningEffort={() => {}}
          effortDisplay="both"
          size="sm"
        />
        <ModelPicker
          models={DEMO_MODELS}
          selectedModelId="opencode-go/glm-5.3"
          onSelectModel={() => {}}
          size="xs"
        />
        <ModelPicker
          models={DEMO_MODELS}
          selectedModelId="claude-opus-5-5"
          onSelectModel={() => {}}
          size="sm"
        />
        <ModelPicker
          models={DEMO_MODELS}
          selectedModelId="antigravity/gemini-4-neon"
          onSelectModel={() => {}}
          size="xs"
          disabled
        />
        <ModelPicker
          models={[]}
          selectedModelId=""
          onSelectModel={() => {}}
          placeholder="No model"
          size="xs"
        />
      </div>

      <div className="grid gap-3 rounded-lg border border-[var(--xd-border)] bg-[var(--xd-rail)] p-4 sm:grid-cols-3">
        <div className="space-y-1">
          <span className="block text-[11px] font-medium text-[var(--xd-ink-secondary)]">
            Implementation (field)
          </span>
          <ModelPicker
            models={DEMO_MODELS}
            selectedModelId="antigravity/gemini-4-neon"
            onSelectModel={() => {}}
            variant="field"
          />
        </div>
        <div className="space-y-1">
          <span className="block text-[11px] font-medium text-[var(--xd-ink-secondary)]">
            Review (field · disconnected)
          </span>
          <ModelPicker
            models={DEMO_MODELS}
            selectedModelId="claude-opus-5-5"
            onSelectModel={() => {}}
            variant="field"
          />
        </div>
        <div className="space-y-1">
          <span className="block text-[11px] font-medium text-[var(--xd-ink-secondary)]">
            Design (field · missing model)
          </span>
          <ModelPicker
            models={DEMO_MODELS}
            selectedModelId="legacy/removed-model"
            onSelectModel={() => {}}
            variant="field"
          />
        </div>
      </div>
    </div>
  ),
}
