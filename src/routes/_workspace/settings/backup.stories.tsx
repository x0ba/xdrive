import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { Route } from './backup'

/**
 * Settings Drive Backup route (`/settings/backup`).
 *
 * @summary Settings backup route (/settings/backup)
 */
const meta = {
  title: 'xDrive Routes/Settings Backup Route',
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
type Story = StoryObj<typeof Route>

/**
 * Drive Backup settings page inside the workspace shell.
 *
 * @summary Drive Backup settings route
 */
export const Default: Story = {}
