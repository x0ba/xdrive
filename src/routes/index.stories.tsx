import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { Route } from './index'

/**
 * Root `/` TanStack Start route rendered via `@storybook/tanstack-react`'s built-in in-memory router.
 *
 * @summary Root workspace index route
 */
const meta = {
  title: 'xDrive Routes/Home Route',
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
 * Default `/` route rendering the full xDrive workspace without manual router decorators.
 *
 * @summary Default Home route
 */
export const Default: Story = {}
