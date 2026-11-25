import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { Route } from './$slug'

/**
 * Deep-linked `.mrbl` document route (`/d/$docId/$slug`) rendered via
 * `@storybook/tanstack-react`'s built-in in-memory router.
 *
 * @summary Document deep-link route (/d/$docId/$slug)
 */
const meta = {
  title: 'xDrive Routes/Document Route',
  tags: ['!manifest'],
  parameters: {
    layout: 'fullscreen',
    tanstack: {
      router: {
        route: Route,
        params: {
          docId: 'tpl-latex-studio',
          slug: 'latex-studio',
        },
        query: {
          mode: 'source',
          ai: 'ops',
        },
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/**
 * LaTeX template opened directly in Source mode with the AI Diff tab active.
 *
 * @summary Document deep link with mode and AI sidebar tab
 */
export const SourceModeWithAiOps: Story = {}
