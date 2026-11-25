import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { Route } from './index'

/**
 * Drive Chat landing route (`/chat`).
 *
 * @summary Drive Chat route (/chat)
 */
const meta = {
  title: 'xDrive Routes/Chat Route',
  tags: ['!manifest'],
  parameters: {
    layout: 'fullscreen',
    tanstack: {
      router: {
        route: Route,
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/**
 * Default `/chat` route inside the persistent workspace shell.
 *
 * @summary Default /chat route
 */
export const Default: Story = {}
