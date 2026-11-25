import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { expect, userEvent, within } from 'storybook/test'
import { SelectionSketchOverlay } from './SelectionSketchOverlay'

/**
 * Interactive stage overlay enabling marquee element selection, freehand sketching, callouts, and corner-drag restyling over `.mrbl` documents.
 *
 * @summary Interactive selection and freehand sketch overlay for .mrbl stages
 */
const meta = {
  title: 'xDrive Collaborator/Selection & Sketch Overlay',
  component: SelectionSketchOverlay,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="h-screen bg-[var(--xd-canvas)]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SelectionSketchOverlay>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Marquee and click selection mode with two manuscript nodes pre-selected.
 *
 * @summary Select mode with pre-selected elements
 */
export const SelectMode: Story = {
  args: {
    mode: 'select',
    initialSelectedIds: ['sec-abstract', 'eq-bell'],
    permission: 'edit_with_ai_shared',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('button', { name: /Reasoning effort/i })
    await userEvent.click(trigger)
    const body = within(document.body)
    await expect(
      body.getByRole('radiogroup', { name: 'Reasoning effort' }),
    ).toBeVisible()
  },
}

/**
 * Freehand vision-sketch mode with collaborator BYOK permissions enabled.
 *
 * @summary Freehand sketch mode with BYOK AI permission
 */
export const SketchMode: Story = {
  args: {
    mode: 'sketch',
    permission: 'edit_with_ai_byok',
  },
}
