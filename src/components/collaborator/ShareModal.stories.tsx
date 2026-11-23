import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { ShareModal } from './ShareModal'
import type { SharePermissionLevel } from '#/lib/types'

function ShareStoryDemo({ variant }: { variant: 'modal' | 'inline' }) {
  const [open, setOpen] = useState(true)
  const [permission, setPermission] =
    useState<SharePermissionLevel>('comment_annotate')
  return (
    <div className="min-h-screen bg-[var(--xd-canvas)] p-6 text-[var(--xd-ink)]">
      {variant === 'modal' && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-7 rounded border border-[var(--xd-border)] px-2.5 text-[12px]"
        >
          Open share dialog
        </button>
      )}
      <div
        className={variant === 'inline' ? 'mx-auto max-w-[540px]' : undefined}
      >
        <ShareModal
          variant={variant}
          open={open}
          onOpenChange={setOpen}
          fileName="quantum-error-correction.mrbl"
          title="Fault-Tolerant Floquet Surface Codes"
          simulatedPermission={permission}
          onSimulatePermission={setPermission}
        />
      </div>
    </div>
  )
}

/**
 * Document sharing and AI-quota permission controller supporting modal dialog and inline panel variants.
 *
 * @summary Sharing dialog with collaborator invite list, public link controls, and AI quota tiers
 */
const meta = {
  title: 'xDrive Collaborator/Share Modal',
  component: ShareModal,
  args: {
    fileName: 'quantum-error-correction.mrbl',
    title: 'Fault-Tolerant Floquet Surface Codes',
    open: true,
    variant: 'modal',
  },
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof ShareModal>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Interactive share modal overlay with simulated collaborator role switcher.
 *
 * @summary Share dialog in modal overlay mode
 */
export const ShareDialog: Story = {
  name: 'Share modal',
  render: () => <ShareStoryDemo variant="modal" />,
}

/**
 * Inline share card layout for embedding inside workspace settings or drawers.
 *
 * @summary Share controls in inline card mode
 */
export const ShareInline: Story = {
  name: 'Share inline',
  render: () => <ShareStoryDemo variant="inline" />,
}
