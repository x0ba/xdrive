import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import {
  CursorAISidebar,
  DEMO_STAGE_NODES,
  FloatingPromptBar,
  SelectionSketchOverlay,
  ShareModal,
  SubscriptionModal,
  connectedModelsFromSubscriptions,
  permissionByLevel,
  toSelectedElement,
} from '#/components/collaborator'
import type {
  ManagedSubscription,
  MarbleIntentRequest,
  RoleAssignments,
} from '#/components/collaborator'
import {
  DEFAULT_ROLE_ASSIGNMENTS,
  DEFAULT_SUBSCRIPTIONS,
} from '#/components/collaborator/SubscriptionModal'
import type {
  CanvasInteractionMode,
  SharePermissionLevel,
  SketchAnnotation,
  SketchStroke,
} from '#/lib/types'

const TARGETS = DEMO_STAGE_NODES.filter((node) =>
  ['sec-abstract', 'eq-bell', 'fig-1'].includes(node.id),
).map(toSelectedElement)

const meta = {
  title: 'xDrive Collaborator/AI Collaborator',
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const PromptBar: Story = {
  name: 'Floating prompt bar',
  render: () => (
    <div className="flex min-h-screen flex-col items-center gap-6 bg-[var(--xd-canvas)] p-8 text-[var(--xd-ink)]">
      <FloatingPromptBar
        selectedElements={TARGETS}
        permission="edit_with_ai_shared"
        sketches={[
          {
            id: 'sketch-demo',
            kind: 'freehand',
            label: 'tighten this',
            color: '#e59934',
            boundingBox: { x: 0.1, y: 0.5, width: 0.3, height: 0.2 },
            coveredNodeIds: ['fig-1'],
          },
        ]}
      />
      <div className="grid w-full max-w-[560px] gap-4">
        <FloatingPromptBar selectedElements={TARGETS} permission="view_only" />
        <FloatingPromptBar selectedElements={TARGETS} permission="edit_no_ai" />
        <FloatingPromptBar
          selectedElements={TARGETS}
          permission="comment_annotate"
        />
      </div>
    </div>
  ),
}

export const SelectMode: Story = {
  name: 'Spatial select',
  render: () => (
    <div className="h-screen bg-[var(--xd-canvas)]">
      <SelectionSketchOverlay
        mode="select"
        initialSelectedIds={['sec-abstract', 'eq-bell', 'fig-1']}
        permission="edit_with_ai_shared"
      />
    </div>
  ),
}

export const SketchMode: Story = {
  name: 'Sketch overlay',
  render: () => (
    <div className="h-screen bg-[var(--xd-canvas)]">
      <SelectionSketchOverlay mode="sketch" permission="edit_with_ai_byok" />
    </div>
  ),
}

export const DirectLook: Story = {
  name: 'Direct edit pass-through',
  render: () => (
    <div className="h-screen bg-[var(--xd-canvas)]">
      <SelectionSketchOverlay mode="direct" permission="view_only" />
    </div>
  ),
}

export const LockedRoles: Story = {
  name: 'Permission locks',
  render: () => (
    <div className="grid min-h-screen gap-4 bg-[var(--xd-canvas)] p-4 lg:grid-cols-2">
      <SelectionSketchOverlay
        mode="select"
        permission="view_only"
        initialSelectedIds={['sec-abstract', 'eq-bell', 'fig-1']}
      />
      <SelectionSketchOverlay mode="sketch" permission="edit_no_ai" />
    </div>
  ),
}

export const CollaboratorDesk: Story = {
  name: 'Collaborator desk',
  render: () => <Desk />,
}

function Desk() {
  const [mode, setMode] = useState<CanvasInteractionMode>('select')
  const [permission, setPermission] = useState<SharePermissionLevel>(
    'edit_with_ai_shared',
  )
  const [modelId, setModelId] = useState('xai/grok-4.7')
  const [selectedIds, setSelectedIds] = useState([
    'sec-abstract',
    'eq-bell',
    'fig-1',
  ])
  const [sketches, setSketches] = useState<SketchAnnotation[]>([])
  const [strokes, setStrokes] = useState<SketchStroke[]>([])
  const [intent, setIntent] = useState<MarbleIntentRequest | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [subsOpen, setSubsOpen] = useState(false)
  const [subscriptions, setSubscriptions] = useState<ManagedSubscription[]>(
    DEFAULT_SUBSCRIPTIONS,
  )
  const [roles, setRoles] = useState<RoleAssignments>(DEFAULT_ROLE_ASSIGNMENTS)
  const models = connectedModelsFromSubscriptions(subscriptions)
  const elements = DEMO_STAGE_NODES.filter((node) =>
    selectedIds.includes(node.id),
  ).map(toSelectedElement)
  const spec = permissionByLevel(permission)
  const modes: CanvasInteractionMode[] = ['direct', 'select', 'sketch']

  return (
    <div className="flex h-screen min-h-[720px] flex-col bg-[var(--xd-canvas)] text-[var(--xd-ink)]">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--xd-border)] px-3 py-2">
        <div
          role="group"
          aria-label="Canvas mode"
          className="inline-flex rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] p-0.5"
        >
          {modes.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              onClick={() => setMode(item)}
              className={`rounded px-2.5 py-1 text-[12px] capitalize ${
                mode === item
                  ? 'bg-[var(--xd-elevated)] font-medium'
                  : 'text-[var(--xd-ink-secondary)]'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <span className="rounded border border-[var(--xd-border)] px-2 py-1 text-[11.5px] text-[var(--xd-ink-secondary)]">
          {spec.title}
        </span>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="ml-auto h-7 rounded-md border border-[var(--xd-border)] px-2.5 text-[12px]"
        >
          Share
        </button>
        <button
          type="button"
          onClick={() => setSubsOpen(true)}
          className="h-7 rounded-md border border-[var(--xd-border)] px-2.5 text-[12px]"
        >
          Subscriptions
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <SelectionSketchOverlay
          className="min-h-0 flex-1"
          mode={mode}
          permission={permission}
          models={models}
          modelId={modelId}
          onModelChange={setModelId}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          sketches={sketches}
          onSketchesChange={(next, nextStrokes) => {
            setSketches(next)
            setStrokes(nextStrokes)
          }}
          onIntent={setIntent}
        />
        <CursorAISidebar
          permission={permission}
          models={models}
          modelId={modelId}
          onModelChange={setModelId}
          selectedElements={elements}
          sketches={sketches}
          strokes={strokes}
          onRemoveElement={(id) =>
            setSelectedIds((ids) => ids.filter((item) => item !== id))
          }
          onRemoveSketch={(id) => {
            setSketches((items) => items.filter((item) => item.id !== id))
            setStrokes((items) => items.filter((item) => item.id !== id))
          }}
          pendingIntent={intent}
        />
      </div>
      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        fileName="quantum-error-correction.mrbl"
        title="Fault-Tolerant Floquet Surface Codes"
        simulatedPermission={permission}
        onSimulatePermission={setPermission}
      />
      <SubscriptionModal
        open={subsOpen}
        onOpenChange={setSubsOpen}
        subscriptions={subscriptions}
        roleAssignments={roles}
        onChange={(nextSubs, nextRoles) => {
          setSubscriptions(nextSubs)
          setRoles(nextRoles)
        }}
      />
    </div>
  )
}
