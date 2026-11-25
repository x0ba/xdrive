import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { expect, within } from 'storybook/test'
import type {
  DriveChatAction,
  DriveChatMode,
  DriveChatThread,
  ReasoningEffort,
} from '#/lib/ai/drive-chat-types'
import { DriveChatView } from './DriveChatView'
import {
  CHAT_DEMO_DOCS,
  CHAT_DEMO_FOLDERS,
  CHAT_DEMO_MODELS,
  CHAT_DEMO_THREADS,
} from './demo-fixtures'

/**
 * Full-screen conversational Drive Chat view with collapsible thread history,
 * reasoning trace disclosure, Streamdown Markdown, inline Drive mutation cards,
 * and T3-Code-inspired model/reasoning/mode pickers.
 *
 * @summary Full-screen xDrive AI Chat workspace
 */
const meta = {
  title: 'xDrive Chat/DriveChatView',
  component: DriveChatView,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DriveChatView>

export default meta
type Story = StoryObj<typeof meta>

function InteractiveDriveChat({
  initialThreads,
  initialActiveId,
  streaming = false,
  disconnected = false,
}: {
  initialThreads: DriveChatThread[]
  initialActiveId: string
  streaming?: boolean
  disconnected?: boolean
}) {
  const [threads, setThreads] = useState<DriveChatThread[]>(initialThreads)
  const [activeId, setActiveId] = useState(initialActiveId)
  const [modelId, setModelId] = useState(CHAT_DEMO_MODELS[0].id)
  const [effort, setEffort] = useState<ReasoningEffort>('high')
  const [mode, setMode] = useState<DriveChatMode>('review')

  const models = disconnected
    ? CHAT_DEMO_MODELS.map((m) => ({
        ...m,
        connected: false,
        status: 'disconnected' as const,
      }))
    : CHAT_DEMO_MODELS

  function updateActionStatus(
    messageId: string,
    actionId: string | 'all',
    status: DriveChatAction['status'],
  ) {
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id !== activeId
          ? thread
          : {
              ...thread,
              messages: thread.messages.map((msg) =>
                msg.id !== messageId || !msg.actions
                  ? msg
                  : {
                      ...msg,
                      actions: msg.actions.map((act) =>
                        actionId === 'all'
                          ? act.status === 'proposed'
                            ? { ...act, status }
                            : act
                          : act.id === actionId
                            ? { ...act, status }
                            : act,
                      ),
                    },
              ),
            },
      ),
    )
  }

  return (
    <div className="h-screen w-full">
      <DriveChatView
        threads={threads}
        activeThreadId={activeId}
        onSelectThread={setActiveId}
        onNewThread={() => {
          const next: DriveChatThread = {
            id: `thread-${Date.now().toString(36)}`,
            title: 'New chat',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            modelId,
            reasoningEffort: effort,
            mode,
            messages: [],
          }
          setThreads((prev) => [next, ...prev])
          setActiveId(next.id)
        }}
        onDeleteThread={(id) => {
          setThreads((prev) => {
            const next = prev.filter((t) => t.id !== id)
            if (activeId === id && next[0]) setActiveId(next[0].id)
            return next
          })
        }}
        onTogglePinThread={(id) =>
          setThreads((prev) =>
            prev.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)),
          )
        }
        onRenameThread={(id, title) =>
          setThreads((prev) =>
            prev.map((t) => (t.id === id ? { ...t, title } : t)),
          )
        }
        docs={CHAT_DEMO_DOCS}
        folders={CHAT_DEMO_FOLDERS}
        models={models}
        selectedModelId={modelId}
        onSelectModel={setModelId}
        reasoningEffort={effort}
        onSelectReasoningEffort={setEffort}
        mode={mode}
        onSelectMode={setMode}
        isStreaming={streaming}
        onSendMessage={({ text, contextRefs }) => {
          const now = new Date().toISOString()
          setThreads((prev) =>
            prev.map((thread) =>
              thread.id !== activeId
                ? thread
                : {
                    ...thread,
                    title:
                      thread.messages.length === 0
                        ? text.slice(0, 48)
                        : thread.title,
                    updatedAt: now,
                    messages: [
                      ...thread.messages,
                      {
                        id: `u-${Date.now()}`,
                        role: 'user',
                        content: text,
                        createdAt: now,
                        contextRefs,
                      },
                      {
                        id: `a-${Date.now() + 1}`,
                        role: 'assistant',
                        content: `Checked **${CHAT_DEMO_DOCS.length} files** in your Drive for "${text}". Connect a live provider on the server to run real queries and edits.`,
                        createdAt: now,
                        modelId,
                        modelName:
                          models.find((m) => m.id === modelId)?.name ?? modelId,
                        reasoningEffort: effort,
                        mode,
                        referencedDocIds: [CHAT_DEMO_DOCS[0].id],
                      },
                    ],
                  },
            ),
          )
        }}
        onApplyAction={(msgId, actId) =>
          updateActionStatus(msgId, actId, 'applied')
        }
        onApplyAllActions={(msgId) =>
          updateActionStatus(msgId, 'all', 'applied')
        }
        onDiscardAction={(msgId, actId) =>
          updateActionStatus(msgId, actId, 'discarded')
        }
        onDiscardAllActions={(msgId) =>
          updateActionStatus(msgId, 'all', 'discarded')
        }
        onUndoAction={(msgId, actId) =>
          updateActionStatus(msgId, actId, 'undone')
        }
        onOpenDocument={() => {}}
        onOpenFolder={() => {}}
        onOpenProviders={() => {}}
      />
    </div>
  )
}

/**
 * Active Drive conversation with reasoning trace, cross-file comparison table,
 * source citations, and reviewable Drive edit/move/folder action cards.
 *
 * @summary Active Drive Chat thread with reasoning and Drive actions
 */
export const ActiveConversation: Story = {
  args: {
    threads: CHAT_DEMO_THREADS,
    activeThreadId: CHAT_DEMO_THREADS[0].id,
    onSelectThread: () => {},
    onNewThread: () => {},
    docs: CHAT_DEMO_DOCS,
    folders: CHAT_DEMO_FOLDERS,
    models: CHAT_DEMO_MODELS,
    selectedModelId: CHAT_DEMO_MODELS[0].id,
    onSelectModel: () => {},
    reasoningEffort: 'high',
    onSelectReasoningEffort: () => {},
    mode: 'review',
    onSelectMode: () => {},
    onSendMessage: () => {},
  },
  render: () => (
    <InteractiveDriveChat
      initialThreads={CHAT_DEMO_THREADS}
      initialActiveId={CHAT_DEMO_THREADS[0].id}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const firstThreadLink = canvas.getByRole('link', {
      name: new RegExp(CHAT_DEMO_THREADS[0].title, 'i'),
    })
    await expect(firstThreadLink).toHaveAttribute(
      'href',
      `/chat/${CHAT_DEMO_THREADS[0].id}`,
    )
  },
}

/**
 * Clean centered empty state with Newsreader greeting, real Drive starter prompts,
 * and integrated T3-Code-inspired composer dock.
 *
 * @summary Empty Drive Chat landing state
 */
export const EmptyState: Story = {
  args: {
    ...ActiveConversation.args,
  },
  render: () => {
    const emptyThread: DriveChatThread = {
      id: 'thread-empty',
      title: 'New chat',
      createdAt: '2026-11-23T18:50:00.000Z',
      updatedAt: '2026-11-23T18:50:00.000Z',
      modelId: CHAT_DEMO_MODELS[0].id,
      reasoningEffort: 'high',
      mode: 'review',
      messages: [],
    }
    return (
      <InteractiveDriveChat
        initialThreads={[emptyThread, ...CHAT_DEMO_THREADS]}
        initialActiveId={emptyThread.id}
      />
    )
  },
}

/**
 * Live streaming state showing thinking indicator and partial markdown response.
 *
 * @summary Streaming Drive Chat response
 */
export const StreamingResponse: Story = {
  args: {
    ...ActiveConversation.args,
    isStreaming: true,
  },
  render: () => {
    const streamingThread: DriveChatThread = {
      id: 'thread-streaming',
      title: 'Reorganize Lab & Papers folders',
      createdAt: '2026-11-23T18:55:00.000Z',
      updatedAt: '2026-11-23T18:55:00.000Z',
      modelId: CHAT_DEMO_MODELS[0].id,
      reasoningEffort: 'max',
      mode: 'review',
      messages: [
        {
          id: 's-u-1',
          role: 'user',
          content:
            'Group all my QEC manuscripts and ablation notes into a dedicated QEC 2026 folder and summarize open action items.',
          createdAt: '2026-11-23T18:55:00.000Z',
        },
        {
          id: 's-a-1',
          role: 'assistant',
          content:
            'Scanning your **Lab**, **Papers**, and **Specs** folders to identify every quantum error correction artifact…',
          createdAt: '2026-11-23T18:55:02.000Z',
          modelId: CHAT_DEMO_MODELS[0].id,
          modelName: 'Gemini 4 Neon',
          reasoningEffort: 'max',
          isStreaming: true,
          streamingPhase: 'preparing_actions',
          thoughts: [
            'Found 4 QEC-related .mrbl files across Lab, Papers, and Specs. Preparing create_folder and move_document actions.',
          ],
        },
      ],
    }
    return (
      <InteractiveDriveChat
        initialThreads={[streamingThread, ...CHAT_DEMO_THREADS]}
        initialActiveId={streamingThread.id}
        streaming
      />
    )
  },
}

/**
 * Disconnected providers state prompting user to connect Google Antigravity or OpenCode Go.
 *
 * @summary Disconnected provider banner state
 */
export const DisconnectedProviders: Story = {
  args: {
    ...ActiveConversation.args,
  },
  render: () => {
    const emptyThread: DriveChatThread = {
      id: 'thread-disconnected',
      title: 'New chat',
      createdAt: '2026-11-23T18:50:00.000Z',
      updatedAt: '2026-11-23T18:50:00.000Z',
      modelId: CHAT_DEMO_MODELS[0].id,
      reasoningEffort: 'medium',
      mode: 'ask',
      messages: [],
    }
    return (
      <InteractiveDriveChat
        initialThreads={[emptyThread]}
        initialActiveId={emptyThread.id}
        disconnected
      />
    )
  },
}
