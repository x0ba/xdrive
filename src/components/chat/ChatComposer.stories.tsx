import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type {
  DriveChatMode,
  DriveContextRef,
  ReasoningEffort,
} from '#/lib/ai/drive-chat-types'
import { ChatComposer } from './ChatComposer'
import {
  CHAT_DEMO_DOCS,
  CHAT_DEMO_FOLDERS,
  CHAT_DEMO_MODELS,
} from './demo-fixtures'

/**
 * T3-Code-inspired Drive Chat composer with provider/model selector, reasoning effort picker,
 * Drive access mode picker (Ask / Review / Auto-apply), and inline `@` file/folder context pinning.
 *
 * @summary Drive Chat composer with model, reasoning, mode, and @ context pickers
 */
const meta = {
  title: 'xDrive Chat/ChatComposer',
  component: ChatComposer,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ChatComposer>

export default meta
type Story = StoryObj<typeof meta>

function InteractiveComposer({
  initialValue = '',
  initialEffort = 'high',
  initialMode = 'review',
  initialContextRefs = [],
  isStreaming = false,
}: {
  initialValue?: string
  initialEffort?: ReasoningEffort
  initialMode?: DriveChatMode
  initialContextRefs?: DriveContextRef[]
  isStreaming?: boolean
}) {
  const [value, setValue] = useState(initialValue)
  const [modelId, setModelId] = useState(CHAT_DEMO_MODELS[0].id)
  const [effort, setEffort] = useState<ReasoningEffort>(initialEffort)
  const [mode, setMode] = useState<DriveChatMode>(initialMode)
  const [contextRefs, setContextRefs] =
    useState<DriveContextRef[]>(initialContextRefs)

  return (
    <div className="mx-auto max-w-3xl pt-72">
      <ChatComposer
        value={value}
        onChange={setValue}
        onSubmit={() => setValue('')}
        onStop={() => {}}
        isStreaming={isStreaming}
        models={CHAT_DEMO_MODELS}
        selectedModelId={modelId}
        onSelectModel={setModelId}
        reasoningEffort={effort}
        onSelectReasoningEffort={setEffort}
        mode={mode}
        onSelectMode={setMode}
        docs={CHAT_DEMO_DOCS}
        folders={CHAT_DEMO_FOLDERS}
        contextRefs={contextRefs}
        onAddContextRef={(ref) =>
          setContextRefs((prev) =>
            prev.some((i) => i.kind === ref.kind && i.id === ref.id)
              ? prev
              : [...prev, ref],
          )
        }
        onRemoveContextRef={(ref) =>
          setContextRefs((prev) =>
            prev.filter((i) => !(i.kind === ref.kind && i.id === ref.id)),
          )
        }
        onOpenProviders={() => {}}
      />
    </div>
  )
}

/**
 * Default composer with Entire Drive scope, Gemini 4 Neon, High reasoning, and Review mode.
 *
 * @summary Default Drive Chat composer
 */
export const Default: Story = {
  args: {
    value: '',
    onChange: () => {},
    onSubmit: () => {},
    models: CHAT_DEMO_MODELS,
    selectedModelId: CHAT_DEMO_MODELS[0].id,
    onSelectModel: () => {},
    reasoningEffort: 'high',
    onSelectReasoningEffort: () => {},
    mode: 'review',
    onSelectMode: () => {},
    docs: CHAT_DEMO_DOCS,
    folders: CHAT_DEMO_FOLDERS,
    contextRefs: [],
    onAddContextRef: () => {},
    onRemoveContextRef: () => {},
  },
  render: () => <InteractiveComposer />,
}

/**
 * Composer with pinned Drive files and Auto-apply mode enabled.
 *
 * @summary Composer with pinned @ context chips and Auto-apply mode
 */
export const WithPinnedContext: Story = {
  args: {
    ...Default.args,
  },
  render: () => (
    <InteractiveComposer
      initialValue="Sync the threshold numbers from Week 12 Ablation Notes into the group meeting slides and tag both as qec-v2."
      initialEffort="max"
      initialMode="auto"
      initialContextRefs={[
        {
          kind: 'doc',
          id: CHAT_DEMO_DOCS[0].id,
          title: CHAT_DEMO_DOCS[0].title,
          fileName: CHAT_DEMO_DOCS[0].fileName,
          category: CHAT_DEMO_DOCS[0].category,
        },
        {
          kind: 'folder',
          id: CHAT_DEMO_FOLDERS[0].id,
          name: CHAT_DEMO_FOLDERS[0].name,
        },
      ]}
    />
  ),
}

/**
 * Streaming composer state showing the Stop control.
 *
 * @summary Active streaming state with Stop button
 */
export const Streaming: Story = {
  args: {
    ...Default.args,
    isStreaming: true,
  },
  render: () => <InteractiveComposer isStreaming />,
}
