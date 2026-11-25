import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { Route } from './$'

/**
 * Catch-all 404 route inside the persistent xDrive workspace shell.
 *
 * @summary Workspace 404 route (/$)
 */
const meta = {
  title: 'xDrive Routes/Workspace Not Found Route',
  tags: ['!manifest'],
  parameters: {
    layout: 'fullscreen',
    tanstack: {
      router: {
        route: Route,
        params: {
          _splat: 'missing/path',
        },
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/**
 * Unmatched path rendered with the in-shell 404 recovery view.
 *
 * @summary Default 404 route
 */
export const Default: Story = {}
