import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import {
  ShareModal,
  SubscriptionModal,
} from '#/components/collaborator'
import type { SharePermissionLevel } from '#/lib/types'

const meta = {
  title: 'xDrive Collaborator/Sharing & Models',
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ShareDialog: Story = {
  name: 'Share modal',
  render: () => <ShareStory variant="modal" />,
}

export const ShareInline: Story = {
  name: 'Share inline',
  render: () => <ShareStory variant="inline" />,
}

export const ModelsAndProviders: Story = {
  name: 'Models & Providers',
  render: () => (
    <div className="min-h-screen bg-[var(--xd-canvas)] p-6 text-[var(--xd-ink)]">
      <div className="mx-auto max-w-4xl">
        <SubscriptionModal variant="page" />
      </div>
    </div>
  ),
}

function ShareStory({ variant }: { variant: 'modal' | 'inline' }) {
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
