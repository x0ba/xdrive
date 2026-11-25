import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { Route } from './$providerId'

/**
 * Settings Models & Providers route (`/settings/models/$providerId`).
 *
 * @summary Settings provider route (/settings/models/$providerId)
 */
const meta = {
  title: 'xDrive Routes/Settings Provider Route',
  tags: ['!manifest'],
  parameters: {
    layout: 'fullscreen',
    tanstack: {
      router: {
        route: Route,
        params: {
          providerId: 'opencode-go',
        },
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof Route>

/**
 * Models & Providers settings page focused on OpenCode Go.
 *
 * @summary OpenCode Go provider settings route
 */
export const OpenCodeGoProvider: Story = {}

/**
 * Models & Providers settings page focused on Grok Build.
 *
 * @summary Grok Build provider settings route
 */
export const GrokBuildProvider: Story = {
  parameters: {
    tanstack: {
      router: {
        route: Route,
        params: {
          providerId: 'grok-build',
        },
      },
    },
  },
}
