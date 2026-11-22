import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import {
  CursorAISidebar,
  DEMO_STAGE_NODES,
  SelectionSketchOverlay,
  ShareModal,
  SubscriptionModal,
  permissionByLevel,
  toSelectedElement,
} from '#/components/collaborator'
import type {
  ManagedSubscription,
  RoleAssignments,
} from '#/components/collaborator'
import {
  DEFAULT_ROLE_ASSIGNMENTS,
  DEFAULT_SUBSCRIPTIONS,
} from '#/components/collaborator/SubscriptionModal'
import type { SharePermissionLevel } from '#/lib/types'

const meta = {
  title: 'xDrive Collaborator/Sharing and Subscriptions',
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ShareDialog: Story = {
  name: 'Sharing modal',
  render: () => <ShareStory variant="modal" />,
}

export const ShareInline: Story = {
  name: 'Sharing inline',
  render: () => <ShareStory variant="inline" />,
}

export const SubscriptionPage: Story = {
  name: 'Subscription manager',
  render: () => (
    <div className="min-h-screen bg-[var(--xd-canvas)] p-6 text-[var(--xd-ink)]">
      <SubscriptionModal variant="page" />
    </div>
  ),
}

function SubscriptionDialogHarness() {
  const [open, setOpen] = useState(true)
  return (
    <div className="min-h-screen bg-[var(--xd-canvas)] p-6 text-[var(--xd-ink)]">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-8 rounded-md bg-[var(--xd-accent)] px-3 text-[12.5px] font-medium text-white"
      >
        Open subscriptions
      </button>
      <SubscriptionModal open={open} onOpenChange={setOpen} />
    </div>
  )
}

export const SubscriptionDialog: Story = {
  name: 'Subscription modal',
  render: () => <SubscriptionDialogHarness />,
}

export const LiveGranularity: Story = {
  name: 'Simulate visitor role',
  render: () => <GranularityLab />,
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
          className="h-8 rounded-md border border-[var(--xd-border)] px-3 text-[12.5px]"
        >
          Open share dialog
        </button>
      )}
      <div
        className={variant === 'inline' ? 'mx-auto max-w-[760px]' : undefined}
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
      <p className="mx-auto mt-4 max-w-[760px] text-[12.5px] text-[var(--xd-ink-secondary)]">
        Simulated role: {permissionByLevel(permission).title}
      </p>
    </div>
  )
}

function GranularityLab() {
  const [permission, setPermission] =
    useState<SharePermissionLevel>('view_only')
  const [subscriptions, setSubscriptions] = useState<ManagedSubscription[]>(
    DEFAULT_SUBSCRIPTIONS,
  )
  const [roles, setRoles] = useState<RoleAssignments>(DEFAULT_ROLE_ASSIGNMENTS)
  const elements = DEMO_STAGE_NODES.filter((node) =>
    ['sec-abstract', 'fig-1'].includes(node.id),
  ).map(toSelectedElement)
  const spec = permissionByLevel(permission)

  return (
    <div className="flex h-screen min-h-[720px] flex-col bg-[var(--xd-canvas)] text-[var(--xd-ink)]">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--xd-border)] px-3 py-2">
        <p className="text-[12.5px] font-medium">Live role: {spec.title}</p>
        <div
          role="radiogroup"
          aria-label="Simulate visitor role"
          className="flex flex-wrap gap-1"
        >
          {(
            [
              'view_only',
              'comment_annotate',
              'edit_no_ai',
              'edit_with_ai_byok',
              'edit_with_ai_shared',
            ] as const
          ).map((level) => (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={permission === level}
              onClick={() => setPermission(level)}
              className={`rounded-md border px-2 py-1 text-[11px] ${
                permission === level
                  ? 'border-[var(--xd-sketch)] bg-[var(--xd-sketch-soft)]'
                  : 'border-[var(--xd-border)]'
              }`}
            >
              {permissionByLevel(level).title}
            </button>
          ))}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <SelectionSketchOverlay
          className="min-h-0 flex-1"
          mode={spec.sketch ? 'sketch' : 'select'}
          permission={permission}
          initialSelectedIds={['sec-abstract', 'fig-1']}
        />
        <CursorAISidebar
          permission={permission}
          selectedElements={elements}
          width={360}
        />
      </div>
      <div className="max-h-[320px] overflow-auto border-t border-[var(--xd-border)]">
        <SubscriptionModal
          variant="page"
          subscriptions={subscriptions}
          roleAssignments={roles}
          onChange={(nextSubs, nextRoles) => {
            setSubscriptions(nextSubs)
            setRoles(nextRoles)
          }}
        />
      </div>
    </div>
  )
}
