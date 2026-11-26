import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { expect, waitFor, within } from 'storybook/test'
import { PREDEFINED_MARBLE_TEMPLATES } from '#/lib/marble/templates'
import { withWhiteboardSnapshot } from '#/lib/marble/whiteboard-document'
import { WhiteboardApp } from './WhiteboardApp'

const premade = PREDEFINED_MARBLE_TEMPLATES.find(
  (doc) => doc.id === 'tpl-whiteboard',
)
if (!premade) {
  throw new Error('Missing premade whiteboard template')
}
const premadeSource = premade.source

/**
 * Infinite tldraw canvas stored as a .mrbl whiteboard.
 *
 * @summary TLDraw whiteboard
 */
const meta = {
  title: 'xDrive Apps/Whiteboard',
  component: WhiteboardApp,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="h-[680px] w-full overflow-hidden">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WhiteboardApp>

export default meta
type Story = StoryObj<typeof meta>

async function expectCanvas(canvasElement: HTMLElement) {
  await waitFor(
    () => {
      expect(
        canvasElement.querySelector('[data-testid="whiteboard-canvas"]'),
      ).toBeTruthy()
    },
    { timeout: 20000 },
  )
}

/**
 * Premade blank board seeded into Templates.
 *
 * @summary Premade whiteboard template
 */
export const PremadeTemplate: Story = {
  args: {
    marbleSource: premadeSource,
    readOnly: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Whiteboard is editable', {}, { timeout: 20000 })
    await expectCanvas(canvasElement)
  },
}

/**
 * View-only and lifecycle locks reject new strokes.
 *
 * @summary Read-only whiteboard
 */
export const ReadOnly: Story = {
  args: {
    marbleSource: premadeSource,
    readOnly: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Whiteboard is read only', {}, { timeout: 20000 })
    await expectCanvas(canvasElement)
  },
}

/**
 * A snapshot this editor cannot load still opens a blank board.
 *
 * @summary Unreadable snapshot falls open blank
 */
export const UnreadableSnapshot: Story = {
  args: {
    marbleSource: withWhiteboardSnapshot(premadeSource, {
      document: { unreadable: true },
    }),
    readOnly: false,
  },
  play: async ({ canvasElement }) => {
    await expectCanvas(canvasElement)
  },
}
