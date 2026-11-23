import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { DEFAULT_SLIDES_DECK, SlidesApp } from './index'

const BENCH_SLIDE_DECK = {
  ...DEFAULT_SLIDES_DECK,
  activeSlideId: 'slide-bench',
}

/**
 * Google Slides parity presentation editor with interactive 16:9 canvas, filmstrip, inspectors, and presenter mode.
 *
 * @summary Presentation deck editor with filmstrip, inspectors, and grid sorter
 */
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

/**
 * Default presentation stage with live filmstrip and closed right inspector.
 *
 * @summary Default interactive slide deck stage
 */
export const InteractiveDeckStage: Story = {
  args: {
    initialDeck: DEFAULT_SLIDES_DECK,
    initialInspector: 'none',
    initialGridView: false,
  },
}

/**
 * Slide deck with the Theme inspector panel open for live theme switching.
 *
 * @summary Theme inspector panel open
 */
export const ThemeInspectorOpen: Story = {
  args: {
    initialDeck: DEFAULT_SLIDES_DECK,
    initialInspector: 'theme',
  },
}

/**
 * Benchmark slide focused with the Transition & Motion inspector open.
 *
 * @summary Transition & motion inspector on benchmark slide
 */
export const TransitionMotionInspector: Story = {
  args: {
    initialDeck: BENCH_SLIDE_DECK,
    initialInspector: 'transition',
  },
}

/**
 * Multi-slide overview in Grid Sorter layout.
 *
 * @summary Slide sorter grid view
 */
export const SlideSorterGridView: Story = {
  args: {
    initialDeck: DEFAULT_SLIDES_DECK,
    initialGridView: true,
  },
}
