import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { expect, userEvent, within } from 'storybook/test'
import { FloatingPromptBar } from './FloatingPromptBar'
import { DEMO_STAGE_NODES, toSelectedElement } from './SelectionSketchOverlay'

const TARGETS = DEMO_STAGE_NODES.filter((node) =>
  ['sec-abstract', 'eq-bell', 'fig-1'].includes(node.id),
).map(toSelectedElement)

/**
 * Contextual floating AI prompt bar anchored to selected `.mrbl` elements and sketch annotations.
 *
 * @summary Floating AI prompt bar with target chips, model selector, and permission states
 */
const meta = {
  title: 'xDrive Collaborator/Floating Prompt Bar',
  component: FloatingPromptBar,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof FloatingPromptBar>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Full-edit shared-quota prompt bar targeting three selected manuscript nodes.
 *
 * @summary Shared AI editing permission state
 */
export const SharedEditing: Story = {
  args: {
    selectedElements: TARGETS,
    permission: 'edit_with_ai_shared',
  },
}

/**
 * Annotate & propose permission mode where AI outputs route through the review queue.
 *
 * @summary Comment and propose permission state
 */
export const AnnotateAndPropose: Story = {
  args: {
    selectedElements: TARGETS,
    permission: 'comment_annotate',
  },
}

/**
 * Locked view-only state showing the permission guardrail banner.
 *
 * @summary View-only locked prompt bar state
 */
/**
 * Model trigger opens the docked reasoning-level column on the floating prompt bar.
 *
 * @summary Floating prompt bar reasoning level picker
 */
export const ReasoningLevel: Story = {
  args: {
    selectedElements: TARGETS,
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
    await expect(body.getByRole('radio', { name: /High/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  },
}

export const ViewOnlyLocked: Story = {
  args: {
    selectedElements: TARGETS,
    permission: 'view_only',
  },
}

/**
 * Stacked comparison of all three key permission tiers side-by-side.
 *
 * @summary Comparison across shared edit, propose, and view-only tiers
 */
export const PermissionComparison: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className="flex min-h-screen flex-col items-center gap-4 bg-[var(--xd-canvas)] p-8 text-[var(--xd-ink)]">
      <FloatingPromptBar
        selectedElements={TARGETS}
        permission="edit_with_ai_shared"
      />
      <FloatingPromptBar
        selectedElements={TARGETS}
        permission="comment_annotate"
      />
      <FloatingPromptBar selectedElements={TARGETS} permission="view_only" />
    </div>
  ),
}
