import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import {
  CursorAISidebar,
  DEMO_STAGE_NODES,
  FloatingPromptBar,
  SelectionSketchOverlay,
  connectedModelsFromSubscriptions,
  toSelectedElement,
} from '#/components/collaborator'
import type { MarbleIntentRequest } from '#/components/collaborator'
import { DEFAULT_SUBSCRIPTIONS } from '#/components/collaborator/SubscriptionModal'
import type {
  CanvasInteractionMode,
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

export const SelectMode: Story = {
  name: 'Select mode',
  render: () => (
    <div className="h-screen bg-[var(--xd-canvas)]">
      <SelectionSketchOverlay
        mode="select"
        initialSelectedIds={['sec-abstract', 'eq-bell']}
        permission="edit_with_ai_shared"
      />
    </div>
  ),
}

export const SketchMode: Story = {
  name: 'Sketch mode',
  render: () => (
    <div className="h-screen bg-[var(--xd-canvas)]">
      <SelectionSketchOverlay mode="sketch" permission="edit_with_ai_byok" />
    </div>
  ),
}

export const CollaboratorDesk: Story = {
  name: 'Stage + Collaborator Sidebar',
  render: () => <Desk />,
}

function Desk() {
  const [mode, setMode] = useState<CanvasInteractionMode>('select')
  const [modelId, setModelId] = useState('xai/grok-4.7')
  const [selectedIds, setSelectedIds] = useState(['sec-abstract', 'eq-bell'])
  const [sketches, setSketches] = useState<SketchAnnotation[]>([])
  const [strokes, setStrokes] = useState<SketchStroke[]>([])
  const [intent, setIntent] = useState<MarbleIntentRequest | null>(null)
  const models = connectedModelsFromSubscriptions(DEFAULT_SUBSCRIPTIONS)
  const elements = DEMO_STAGE_NODES.filter((node) =>
    selectedIds.includes(node.id),
  ).map(toSelectedElement)
  const modes: CanvasInteractionMode[] = ['direct', 'select', 'sketch']

  return (
    <div className="flex h-screen min-h-[640px] flex-col bg-[var(--xd-canvas)] text-[var(--xd-ink)]">
      <header className="flex h-9 items-center gap-2 border-b border-[var(--xd-border)] px-3">
        <div
          role="group"
          aria-label="Canvas mode"
          className="inline-flex rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] p-0.5"
        >
          {modes.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              onClick={() => setMode(item)}
              className={`rounded-xs px-2 py-0.5 text-[11.5px] capitalize ${
                mode === item
                  ? 'bg-[var(--xd-canvas)] font-medium text-[var(--xd-ink)]'
                  : 'text-[var(--xd-ink-secondary)]'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <SelectionSketchOverlay
          className="min-h-0 flex-1"
          mode={mode}
          permission="edit_with_ai_shared"
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
          permission="edit_with_ai_shared"
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
    </div>
  )
}
