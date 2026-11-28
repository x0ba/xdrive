import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { Route } from './search'

/**
 * Full-page Drive search route (`/search`).
 *
 * @summary Drive search route (/search)
 */
const meta = {
  title: 'xDrive Routes/Search Route',
  tags: ['!manifest'],
  parameters: {
    layout: 'fullscreen',
    tanstack: {
      router: {
        route: Route,
        query: {
          q: 'surface',
        },
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/**
 * Default `/search` route inside the persistent workspace shell.
 *
 * @summary Default /search route
 */
export const Default: Story = {}
