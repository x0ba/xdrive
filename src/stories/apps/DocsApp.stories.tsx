import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { DEFAULT_DOCS_SEED, DocsApp } from '#/components/apps/docs'

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

export const PaginatedResearchDocument: Story = {
  args: {
    initialState: DEFAULT_DOCS_SEED,
    initialEditMode: 'editing',
    initialShowOutline: true,
    initialShowComments: true,
  },
}

export const SuggestingModeReview: Story = {
  args: {
    initialState: DEFAULT_DOCS_SEED,
    initialEditMode: 'suggesting',
    initialShowOutline: false,
    initialShowComments: true,
  },
}

export const PagelessWithFindAndReplace: Story = {
  args: {
    initialState: {
      ...DEFAULT_DOCS_SEED,
      pageSetup: { ...DEFAULT_DOCS_SEED.pageSetup, pageless: true },
    },
    initialEditMode: 'editing',
    initialShowOutline: true,
    initialShowComments: false,
    initialShowFindReplace: true,
  },
}

export const ViewingMode: Story = {
  args: {
    initialState: DEFAULT_DOCS_SEED,
    initialEditMode: 'viewing',
    initialShowOutline: true,
    initialShowComments: true,
    readOnly: true,
  },
}
