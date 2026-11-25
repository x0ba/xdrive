import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { expect, within } from 'storybook/test'
import { DEMO_SHARE_CONFIG, ShareModal } from './ShareModal'
import type { ShareConfig, SharePermissionLevel } from '#/lib/types'

function ShareStoryDemo({
  variant,
  initialConfig = DEMO_SHARE_CONFIG,
  initialSimulatedPermission = 'comment_annotate',
}: {
  variant: 'modal' | 'inline'
  initialConfig?: ShareConfig
  initialSimulatedPermission?: SharePermissionLevel
}) {
  const [open, setOpen] = useState(true)
  const [config, setConfig] = useState<ShareConfig>(initialConfig)
  const [permission, setPermission] = useState<SharePermissionLevel>(
    initialSimulatedPermission,
  )
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
          config={config}
          onConfigChange={setConfig}
          simulatedPermission={permission}
          onSimulatePermission={setPermission}
        />
      </div>
    </div>
  )
}

/**
 * Public-link document sharing and visitor role preview controller supporting modal dialog and inline panel variants.
 *
 * @summary Sharing dialog with public link controls, AI quota slider, and visitor role preview
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
 * Interactive share modal overlay with public-link sharing and visitor role preview select.
 *
 * @summary Share dialog in modal overlay mode
 */
export const ShareDialog: Story = {
  name: 'Share modal',
  render: () => <ShareStoryDemo variant="modal" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const dialog = canvas.getByRole('dialog')
    await expect(
      within(dialog).queryByPlaceholderText('Invite by email...'),
    ).toBeNull()
    await expect(
      within(dialog).queryByRole('button', { name: /Invite/i }),
    ).toBeNull()
    await expect(
      within(dialog).queryByText('Enter a valid email address.'),
    ).toBeNull()
    await expect(within(dialog).queryByText('Owner')).toBeNull()
    await expect(dialog.querySelector('select')).toBeNull()
    await expect(
      within(dialog).getByRole('combobox', { name: 'Public link permission' }),
    ).toBeVisible()
    await expect(
      within(dialog).getByRole('combobox', { name: 'Preview as visitor role' }),
    ).toBeVisible()
  },
}

/**
 * Share modal configured with shared AI quota to showcase the daily op limit slider alongside public link controls.
 *
 * @summary Share dialog with shared AI quota slider
 */
export const ShareWithSharedAiQuota: Story = {
  name: 'Share modal · Shared AI quota',
  render: () => (
    <ShareStoryDemo
      variant="modal"
      initialConfig={{
        ...DEMO_SHARE_CONFIG,
        publicPermission: 'edit_with_ai_shared',
        allowDuplication: true,
      }}
      initialSimulatedPermission="edit_with_ai_shared"
    />
  ),
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
