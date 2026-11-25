import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { expect, within } from 'storybook/test'
import { CursorAISidebar } from './CursorAISidebar'
import type { MarbleIntentRequest } from './FloatingPromptBar'
import {
  DEMO_STAGE_NODES,
  SelectionSketchOverlay,
  toSelectedElement,
} from './SelectionSketchOverlay'
import {
  DEFAULT_SUBSCRIPTIONS,
  connectedModelsFromSubscriptions,
} from './SubscriptionModal'
import type {
  CanvasInteractionMode,
  SketchAnnotation,
  SketchStroke,
} from '#/lib/types'

const DEFAULT_SELECTED_ELEMENTS = DEMO_STAGE_NODES.filter((node) =>
  ['sec-abstract', 'eq-bell'].includes(node.id),
).map(toSelectedElement)

function CollaboratorDeskDemo() {
  const [mode, setMode] = useState<CanvasInteractionMode>('select')
  const [modelId, setModelId] = useState('antigravity/default')
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

/**
 * Right-hand AI collaborator rail showing staged `.mrbl` operation proposals, checkpoints, attached selections, and evergreen design-system rules.
 *
 * @summary AI collaborator sidebar with staged op proposals and checkpoint timeline
 */
const meta = {
  title: 'xDrive Collaborator/Cursor AI Sidebar',
  component: CursorAISidebar,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof CursorAISidebar>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Standalone collaborator sidebar with two attached manuscript selections and active proposals.
 *
 * @summary Standalone AI collaborator sidebar
 */
export const Default: Story = {
  args: {
    permission: 'edit_with_ai_shared',
    selectedElements: DEFAULT_SELECTED_ELEMENTS,
  },
  decorators: [
    (Story) => (
      <div className="flex h-[680px] justify-end bg-[var(--xd-canvas)]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const opsTab = canvas.getByRole('tab', { name: 'Diff' })
    await expect(opsTab).toHaveAttribute('href', '?ai=ops')
  },
}

/**
 * End-to-end interactive stage paired with the collaborator sidebar, live selection chips, and sketch routing.
 *
 * @summary Stage paired with live collaborator sidebar
 */
export const CollaboratorDesk: Story = {
  name: 'Stage + Collaborator Sidebar',
  render: () => <CollaboratorDeskDemo />,
}
