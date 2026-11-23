import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { DEFAULT_SLIDES_DECK, SlidesApp } from '#/components/apps/slides'

const meta = {
  title: 'xDrive Apps/Slides App (Google Slides)',
  component: SlidesApp,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Google Slides parity presentation editor built in the xDrive design language: full File/Edit/View/Insert/Format/Slide/Arrange menu bar, interactive 16:9 drag-and-resize slide canvas (text boxes, shapes, live charts, inline-editable tables, images, lines), miniature live-preview filmstrip with right-click slide actions, Grid Sorter view, contextual Theme / Layout / Background / Transition / Format inspector, speaker notes drawer, and Full-Screen Slideshow & Presenter View.',
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
} satisfies Meta<typeof SlidesApp>

export default meta
type Story = StoryObj<typeof meta>

export const InteractiveDeckStage: Story = {
  args: {
    initialDeck: DEFAULT_SLIDES_DECK,
    initialInspector: 'none',
    initialGridView: false,
  },
}

export const ThemeInspectorOpen: Story = {
  args: {
    initialDeck: DEFAULT_SLIDES_DECK,
    initialInspector: 'theme',
  },
}

export const TransitionMotionInspector: Story = {
  args: {
    initialDeck: {
      ...DEFAULT_SLIDES_DECK,
      activeSlideId: 'slide-bench',
    },
    initialInspector: 'transition',
  },
}

export const SlideSorterGridView: Story = {
  args: {
    initialDeck: DEFAULT_SLIDES_DECK,
    initialGridView: true,
  },
}
