import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { DEFAULT_DOCS_SEED, DocsApp } from './index'

const PAGELESS_DOCS_SEED = {
  ...DEFAULT_DOCS_SEED,
  pageSetup: { ...DEFAULT_DOCS_SEED.pageSetup, pageless: true },
}

/**
 * Google Docs parity rich-text word processor built in the xDrive design language.
 *
 * @summary Rich-text word processor with paginated/pageless modes, outline, and comments
 */
const meta = {
  title: 'xDrive Apps/Docs App (Google Docs)',
  component: DocsApp,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Google Docs parity rich-text word processor built in the xDrive design language: full File/Edit/View/Insert/Format/Tools menu bar, formatting toolbar (styles, fonts, sizes, colors, highlights, tables, links, images, alignment, spacing, checklists, paint format), horizontal inch ruler, live document outline, paginated & pageless layouts, find & replace, word count modal, and threaded comments & suggestions.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="h-[740px] w-full overflow-hidden">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DocsApp>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Standard paginated editing layout with document outline and comment rail open.
 *
 * @summary Paginated editing view with outline and comments
 */
export const PaginatedResearchDocument: Story = {
  args: {
    initialState: DEFAULT_DOCS_SEED,
    initialEditMode: 'editing',
    initialShowOutline: true,
    initialShowComments: true,
  },
}

/**
 * Review workflow with suggesting mode active and comments rail visible.
 *
 * @summary Suggesting mode with review comments
 */
export const SuggestingModeReview: Story = {
  args: {
    initialState: DEFAULT_DOCS_SEED,
    initialEditMode: 'suggesting',
    initialShowOutline: false,
    initialShowComments: true,
  },
}

/**
 * Continuous pageless layout with the Find & Replace dialog open.
 *
 * @summary Pageless layout with Find & Replace open
 */
export const PagelessWithFindAndReplace: Story = {
  args: {
    initialState: PAGELESS_DOCS_SEED,
    initialEditMode: 'editing',
    initialShowOutline: true,
    initialShowComments: false,
    initialShowFindReplace: true,
  },
}

/**
 * Read-only viewing mode preserving outline navigation and comment inspection.
 *
 * @summary Read-only document viewing mode
 */
export const ViewingMode: Story = {
  args: {
    initialState: DEFAULT_DOCS_SEED,
    initialEditMode: 'viewing',
    initialShowOutline: true,
    initialShowComments: true,
    readOnly: true,
  },
}
