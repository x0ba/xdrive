import type { Meta, StoryObj } from '@storybook/tanstack-react'
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
