import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { RestoreVersionDialog } from './RestoreVersionDialog'

const NOW_MS = Date.parse('2026-11-28T10:30:00.000Z')

const NAMED_VERSION = {
  id: 'v-named-1',
  docId: 'doc-spec',
  slug: 'logical-memory-spec',
  title: 'Logical Memory Specification',
  category: 'document' as const,
  kind: 'named' as const,
  trigger: 'manual' as const,
  label: 'Before decoder sweep',
  createdAt: '2026-11-28T09:15:00.000Z',
  contentHash: 'abc123',
  byteSize: 4820,
  nodeCount: 14,
  author: 'You',
}

/**
 * Confirmation modal shown before restoring a historical document snapshot.
 *
 * @summary Restore confirmation modal
 */
const meta = {
  title: 'xDrive Version History/Restore Version Dialog',
  component: RestoreVersionDialog,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    open: true,
    fileName: 'logical-memory-spec.mrbl',
    version: NAMED_VERSION,
    nowMs: NOW_MS,
    onClose: fn(),
    onConfirm: fn(),
  },
} satisfies Meta<typeof RestoreVersionDialog>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Confirming restoration of a named version, highlighting the pre-restore safety snapshot.
 *
 * @summary Restore named version dialog
 */
export const NamedVersion: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('dialog', { name: 'Restore this version?' })
    await canvas.findByText('Before decoder sweep')
    await canvas.findByText(/snapshotted first/i)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Restore version' }),
    )
    expect(args.onConfirm).toHaveBeenCalledTimes(1)
  },
}

/**
 * Restoring while showing a server error and busy disabled state.
 *
 * @summary Busy and error state
 */
export const WithError: Story = {
  args: {
    version: {
      ...NAMED_VERSION,
      id: 'v-auto-2',
      kind: 'auto',
      trigger: 'autosave',
      label: undefined,
    },
    error: 'Cannot restore version while document is in Trash',
  },
}
