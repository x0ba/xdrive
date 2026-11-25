import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { Route as DriveRoute } from './_workspace/drive'

/**
 * Canonical `/drive` TanStack Start route rendered via `@storybook/tanstack-react`'s
 * built-in in-memory router.
 *
 * @summary Canonical My Drive route (/drive)
 */
const meta = {
  title: 'xDrive Routes/Drive Route',
  tags: ['!manifest'],
  parameters: {
    layout: 'fullscreen',
    tanstack: {
      router: {
        route: DriveRoute,
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/**
 * Default `/drive` route rendering My Drive inside the persistent xDrive workspace shell.
 *
 * @summary Default /drive route
 */
export const Default: Story = {}

/**
 * `/drive` with validated search params (`view=list`, `sort=title`, `ai=chat`).
 *
 * @summary /drive with list view and AI sidebar search params
 */
export const ListViewWithAiSidebar: Story = {
  parameters: {
    tanstack: {
      router: {
        route: DriveRoute,
        query: {
          view: 'list',
          sort: 'title',
          ai: 'chat',
        },
      },
    },
  },
}
