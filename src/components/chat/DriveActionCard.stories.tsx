import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type { DriveChatAction } from '#/lib/ai/drive-chat-types'
import { DriveActionCard } from './DriveActionCard'
import { CHAT_DEMO_ACTIONS } from './demo-fixtures'

/**
 * Collapsible inline Drive action card showing proposed, applied, discarded, undone,
 * or failed Drive mutations with diff inspection and Apply / Discard / Undo / Open controls.
 *
 * @summary Inline Drive mutation review card
 */
const meta = {
  title: 'xDrive Chat/DriveActionCard',
  component: DriveActionCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DriveActionCard>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Pending document edit with Marble op diff preview expanded.
 *
 * @summary Proposed document edit card with Marble op diff
 */
export const ProposedEdit: Story = {
  args: {
    action: CHAT_DEMO_ACTIONS[0],
    defaultExpanded: true,
    onApply: () => {},
    onDiscard: () => {},
    onOpenDocument: () => {},
  },
}

/**
 * Interactive lifecycle demo allowing Apply, Undo, and Discard transitions.
 *
 * @summary Interactive action status transitions
 */
export const InteractiveLifecycle: Story = {
  args: {
    action: CHAT_DEMO_ACTIONS[0],
  },
  render: () => {
    const [actions, setActions] = useState<DriveChatAction[]>(CHAT_DEMO_ACTIONS)
    const updateStatus = (id: string, status: DriveChatAction['status']) => {
      setActions((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status } : item)),
      )
    }
    return (
      <div className="mx-auto max-w-2xl space-y-2.5">
        {actions.map((action) => (
          <DriveActionCard
            key={action.id}
            action={action}
            defaultExpanded={action.id === CHAT_DEMO_ACTIONS[0].id}
            onApply={(id) => updateStatus(id, 'applied')}
            onDiscard={(id) => updateStatus(id, 'discarded')}
            onUndo={(id) => updateStatus(id, 'undone')}
            onOpenDocument={() => {}}
            onOpenFolder={() => {}}
          />
        ))}
      </div>
    )
  },
}
