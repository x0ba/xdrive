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
type Story = StoryObj<typeof meta>

/**
 * Models & Providers settings page focused on OpenCode Go.
 *
 * @summary OpenCode Go provider settings route
 */
export const OpenCodeGoProvider: Story = {}
