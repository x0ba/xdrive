import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { FileSearch } from 'lucide-react'
import type { DriveChatThread } from '#/lib/ai/drive-chat-types'
import { INITIAL_AI_SUBSCRIPTIONS } from '#/lib/marble/subscriptions-seed'
import {
  INITIAL_WORKSPACE_DOCS,
  PREDEFINED_MARBLE_TEMPLATES,
} from '#/lib/marble/templates'
import type { DriveFolder } from '#/lib/types'
import { XDriveWorkspace } from '#/components/workspace/XDriveWorkspace'
import { CommandPalette } from './CommandPalette'
import { CommandSourceRegistry } from './registry'
import { createBuiltinCommandSources, createNavigationSource } from './sources'
import type { CommandContext, CommandItem, CommandSource } from './types'

const DEMO_FOLDERS: DriveFolder[] = [
  {
    id: 'folder-papers',
    name: 'Papers',
    parentId: null,
    color: 'default',
    createdAt: '2026-11-01T09:00:00.000Z',
    updatedAt: '2026-11-21T10:00:00.000Z',
  },
  {
    id: 'folder-surface-codes',
    name: 'Surface Codes',
    parentId: 'folder-papers',
    color: 'accent',
    createdAt: '2026-11-04T09:00:00.000Z',
    updatedAt: '2026-11-22T15:00:00.000Z',
  },
  {
    id: 'folder-lab',
    name: 'Lab',
    parentId: null,
    color: 'commit',
    createdAt: '2026-11-02T09:00:00.000Z',
    updatedAt: '2026-11-20T11:30:00.000Z',
  },
]

const DEMO_THREADS: DriveChatThread[] = [
  {
    id: 'chat-decoder-ablation',
    title: 'Compare decoder thresholds',
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-23T09:15:00.000Z',
    modelId: 'antigravity/default',
    reasoningEffort: 'high',
    mode: 'review',
    pinned: true,
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'Summarize distance 7 logical error results.',
        createdAt: '2026-11-23T09:15:00.000Z',
      },
    ],
  },
  {
    id: 'chat-slides-prep',
    title: 'Group meeting slides outline',
    createdAt: '2026-11-19T14:00:00.000Z',
    updatedAt: '2026-11-22T16:40:00.000Z',
    modelId: 'antigravity/default',
    reasoningEffort: 'medium',
    mode: 'ask',
    messages: [
      {
        id: 'm2',
        role: 'user',
        content: 'Draft speaker notes for slide 2.',
        createdAt: '2026-11-22T16:40:00.000Z',
      },
    ],
  },
]

const DEMO_CONTEXT: Omit<CommandContext, 'signal'> = {
  pathname: '/drive',
  activeNav: 'drive',
  currentFolderId: null,
  activeDoc: null,
  theme: 'dark',
}

const LIGHT_TOKEN_VARS: CSSProperties = {
  colorScheme: 'light',
  ['--xd-canvas' as string]: '#ffffff',
  ['--xd-rail' as string]: '#f7f8fa',
  ['--xd-elevated' as string]: '#f1f3f7',
  ['--xd-surface-hover' as string]: '#eaeef4',
  ['--xd-surface-active' as string]: '#e2e7f0',
  ['--xd-ink' as string]: '#0f131a',
  ['--xd-ink-secondary' as string]: '#4a5568',
  ['--xd-ink-muted' as string]: '#718096',
  ['--xd-ink-subtle' as string]: '#94a3b8',
  ['--xd-border' as string]: '#e3e8ee',
  ['--xd-border-strong' as string]: '#cbd5e1',
  ['--xd-border-subtle' as string]: '#eef1f6',
  ['--xd-accent' as string]: '#5e6ad2',
  ['--xd-accent-hover' as string]: '#4e5ac0',
  ['--xd-accent-soft' as string]: 'rgba(94, 106, 210, 0.12)',
  ['--xd-accent-border' as string]: 'rgba(94, 106, 210, 0.35)',
}

function makeDemoSources(
  callbacks: {
    onOpenDocument?: (docId: string) => void
    onOpenChatThread?: (threadId: string) => void
    onOpenFolder?: (folderId: string | null) => void
    onToggleTheme?: () => void
    onStartAiPrompt?: (prompt?: string) => void
    onCreateWhiteboard?: () => void
  } = {},
): CommandSource[] {
  return createBuiltinCommandSources({
    docs: INITIAL_WORKSPACE_DOCS,
    trashedDocs: [],
    folders: DEMO_FOLDERS,
    templates: PREDEFINED_MARBLE_TEMPLATES,
    chatThreads: DEMO_THREADS,
    subscriptions: INITIAL_AI_SUBSCRIPTIONS,
    trashRetentionDays: 30,
    theme: 'dark',
    activeDoc: null,
    isDocTemplate: (doc) => doc.isTemplate,
    aiSidebarOpen: false,
    onOpenDocument: callbacks.onOpenDocument ?? (() => {}),
    onOpenFolder: callbacks.onOpenFolder ?? (() => {}),
    onOpenChatThread: callbacks.onOpenChatThread ?? (() => {}),
    onOpenNav: () => {},
    onOpenRecent: () => {},
    onOpenSettingsProvider: () => {},
    onCreateBlankDocument: () => {},
    onCreateFromTemplate: () => {},
    onOpenNewTemplateModal: () => {},
    onOpenNewAiAgentModal: () => {},
    onCreateFolder: () => {},
    onCreateWhiteboard: callbacks.onCreateWhiteboard ?? (() => {}),
    onStartAiPrompt: callbacks.onStartAiPrompt ?? (() => {}),
    onToggleTheme: callbacks.onToggleTheme ?? (() => {}),
    onToggleAiSidebar: () => {},
  })
}

function PaletteStoryFrame({
  defaultOpen = true,
  initialQuery = '',
  sources,
  lightTheme = false,
  onSelectLog,
}: {
  defaultOpen?: boolean
  initialQuery?: string
  sources?: CommandSource[]
  lightTheme?: boolean
  onSelectLog?: (message: string) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [lastAction, setLastAction] = useState<string>('None yet')
  const [portalEl, setPortalEl] = useState<HTMLDivElement | null>(null)

  const resolvedSources = useMemo(
    () =>
      sources ??
      makeDemoSources({
        onOpenDocument: (docId) => {
          const msg = `Opened document ${docId}`
          setLastAction(msg)
          onSelectLog?.(msg)
        },
        onOpenChatThread: (threadId) => {
          const msg = `Opened chat ${threadId}`
          setLastAction(msg)
          onSelectLog?.(msg)
        },
        onOpenFolder: (folderId) => {
          const msg = `Opened folder ${folderId ?? 'root'}`
          setLastAction(msg)
          onSelectLog?.(msg)
        },
        onToggleTheme: () => {
          const msg = 'Toggled theme'
          setLastAction(msg)
          onSelectLog?.(msg)
        },
        onStartAiPrompt: (prompt) => {
          const msg = `Started AI prompt: ${prompt ?? ''}`
          setLastAction(msg)
          onSelectLog?.(msg)
        },
        onCreateWhiteboard: () => {
          const msg = 'Created new whiteboard'
          setLastAction(msg)
          onSelectLog?.(msg)
        },
      }),
    [sources, onSelectLog],
  )

  return (
    <div
      ref={setPortalEl}
      className={lightTheme ? 'min-h-[560px] p-6' : 'dark min-h-[560px] p-6'}
      style={
        lightTheme
          ? {
              ...LIGHT_TOKEN_VARS,
              backgroundColor: 'var(--xd-canvas)',
              color: 'var(--xd-ink)',
            }
          : {
              backgroundColor: 'var(--xd-canvas)',
              color: 'var(--xd-ink)',
            }
      }
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between rounded-lg border border-[var(--xd-border)] bg-[var(--xd-rail)] px-4 py-3">
        <div>
          <p className="text-[13px] font-medium text-[var(--xd-ink)]">
            xDrive Command Palette Demo
          </p>
          <p className="mt-0.5 text-[11.5px] text-[var(--xd-ink-muted)]">
            Last selected: <span className="xd-mono">{lastAction}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-3 text-[12px] font-medium text-[var(--xd-ink)] transition-colors hover:bg-[var(--xd-surface-hover)]"
        >
          <span>Open palette</span>
          <kbd className="xd-mono text-[10.5px] text-[var(--xd-ink-muted)]">
            ⌘K
          </kbd>
        </button>
      </div>

      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        sources={resolvedSources}
        context={{
          ...DEMO_CONTEXT,
          theme: lightTheme ? 'light' : 'dark',
        }}
        initialQuery={initialQuery}
        portalContainer={portalEl}
      />
    </div>
  )
}

/**
 * Accessible Cmd/Ctrl-K command palette with fuzzy matching, section grouping,
 * and extensible `CommandSource` registry support.
 *
 * @summary Command palette dialog states and keyboard interactions
 */
const meta = {
  title: 'xDrive Command Palette/CommandPalette',
  component: CommandPalette,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof CommandPalette>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Default empty-query state showing Recent, Navigate, Create, and Actions sections.
 *
 * @summary Empty query grouped palette view
 */
export const Empty: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    sources: [],
    context: DEMO_CONTEXT,
  },
  render: () => <PaletteStoryFrame defaultOpen initialQuery="" />,
  play: async () => {
    const body = within(document.body)
    const dialog = await body.findByRole('dialog', { name: 'Command palette' })
    const scope = within(dialog)
    await expect(scope.getByRole('group', { name: 'Recent' })).toBeVisible()
    await expect(scope.getByRole('group', { name: 'Navigate' })).toBeVisible()
    await expect(scope.getByRole('group', { name: 'Create' })).toBeVisible()
    await expect(scope.getByRole('group', { name: 'Actions' })).toBeVisible()
  },
}

/**
 * Fuzzy search results state highlighting matching substrings and surfacing
 * the prefilled AI prompt fallback action.
 *
 * @summary Fuzzy matched results with highlighted spans
 */
export const WithResults: Story = {
  args: { ...Empty.args },
  render: () => <PaletteStoryFrame defaultOpen initialQuery="surface" />,
  play: async () => {
    const body = within(document.body)
    const dialog = await body.findByRole('dialog', { name: 'Command palette' })
    const scope = within(dialog)
    await expect(
      await scope.findByRole('option', {
        name: /Surface Codes/i,
      }),
    ).toBeVisible()
    await expect(
      scope.getByRole('option', {
        name: /Threshold of the Rotated Surface Code/i,
      }),
    ).toBeVisible()
    await expect(
      scope.getByRole('option', { name: /Ask AI: "surface"/i }),
    ).toBeVisible()
  },
}

/**
 * Explicit zero-results empty state when no source returns a match (e.g. when
 * catch-all AI prompt fallback is omitted by a custom source set).
 *
 * @summary Zero-match empty state
 */
export const NoResults: Story = {
  args: { ...Empty.args },
  render: () => {
    const navOnly = createNavigationSource({
      docs: INITIAL_WORKSPACE_DOCS,
      trashedDocs: [],
      folders: DEMO_FOLDERS,
      templates: PREDEFINED_MARBLE_TEMPLATES,
      chatThreads: DEMO_THREADS,
      subscriptions: INITIAL_AI_SUBSCRIPTIONS,
      trashRetentionDays: 30,
      theme: 'dark',
      activeDoc: null,
      isDocTemplate: (doc) => doc.isTemplate,
      aiSidebarOpen: false,
      onOpenDocument: () => {},
      onOpenFolder: () => {},
      onOpenChatThread: () => {},
      onOpenNav: () => {},
      onOpenRecent: () => {},
      onOpenSettingsProvider: () => {},
      onCreateBlankDocument: () => {},
      onCreateFromTemplate: () => {},
      onOpenNewTemplateModal: () => {},
      onOpenNewAiAgentModal: () => {},
      onCreateFolder: () => {},
      onCreateWhiteboard: () => {},
      onStartAiPrompt: () => {},
      onToggleTheme: () => {},
      onToggleAiSidebar: () => {},
    })
    return (
      <PaletteStoryFrame
        defaultOpen
        initialQuery="zzzz-not-found"
        sources={[navOnly]}
      />
    )
  },
  play: async () => {
    const body = within(document.body)
    const dialog = await body.findByRole('dialog', { name: 'Command palette' })
    const empty = await within(dialog).findByTestId('command-palette-empty')
    await expect(empty).toBeVisible()
    await expect(
      within(empty).getByText('No results for "zzzz-not-found"'),
    ).toBeVisible()
  },
}

const onAsyncSelectionLog = fn()

function AsyncSourceDemoHarness({
  onSelectItem,
}: {
  onSelectItem?: (id: string) => void
}) {
  const [open, setOpen] = useState(true)
  const [portalEl, setPortalEl] = useState<HTMLDivElement | null>(null)

  const sources = useMemo(
    () =>
      makeDemoSources({
        onOpenChatThread: (threadId) => onSelectItem?.(`chat:${threadId}`),
        onOpenDocument: (docId) => onSelectItem?.(`doc:${docId}`),
      }),
    [onSelectItem],
  )
  const registry = useMemo(() => {
    const reg = new CommandSourceRegistry()
    const asyncSearchSource: CommandSource = {
      id: 'external:drive-search',
      label: 'Search Results',
      priority: 95,
      minQueryLength: 2,
      getItems: (query, ctx) =>
        new Promise<CommandItem[]>((resolve) => {
          const timer = window.setTimeout(() => {
            resolve([
              {
                id: 'search:content-hit-1',
                label: 'Decoder Freeze Notes (body match)',
                subtitle: `Matched full-text query "${query}" in Lab/week-12.mrbl`,
                section: 'drive-search',
                sectionLabel: 'Search Results',
                icon: <FileSearch className="h-3.5 w-3.5" />,
                alwaysMatch: true,
                score: 6000,
                badge: 'Content',
                onSelect: () => onSelectItem?.('search:content-hit-1'),
              },
            ])
          }, 550)
          ctx.signal.addEventListener(
            'abort',
            () => {
              window.clearTimeout(timer)
              resolve([])
            },
            { once: true },
          )
        }),
    }
    reg.register(asyncSearchSource)
    return reg
  }, [onSelectItem])

  return (
    <div
      ref={setPortalEl}
      className="dark min-h-[560px] p-6"
      style={{
        backgroundColor: 'var(--xd-canvas)',
        color: 'var(--xd-ink)',
      }}
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between rounded-lg border border-[var(--xd-border)] bg-[var(--xd-rail)] px-4 py-3">
        <span className="text-[12.5px] text-[var(--xd-ink-secondary)]">
          External async `CommandSource` simulation
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-7 items-center rounded bg-[var(--xd-accent)] px-2.5 text-[12px] font-medium text-white"
        >
          Open palette
        </button>
      </div>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        sources={sources}
        registry={registry}
        context={DEMO_CONTEXT}
        initialQuery="decoder"
        portalContainer={portalEl}
      />
    </div>
  )
}

/**
 * Combines instant built-in sources with a pending async external `CommandSource`,
 * displaying the loading indicator until the async source resolves and keeping the
 * active selection locked by item ID when higher-ranked async results insert above it.
 *
 * @summary Progressive loading with stable selection across async updates
 */
export const LoadingAsyncSource: Story = {
  args: { ...Empty.args },
  render: () => <AsyncSourceDemoHarness onSelectItem={onAsyncSelectionLog} />,
  play: async () => {
    onAsyncSelectionLog.mockClear()
    const body = within(document.body)
    const dialog = await body.findByRole('dialog', { name: 'Command palette' })
    const scope = within(dialog)

    await expect(
      await scope.findByTestId('command-palette-async-pending'),
    ).toBeVisible()
    const syncOption = scope.getByRole('option', {
      name: /Compare decoder thresholds/i,
    })
    await expect(syncOption).toBeVisible()
    await expect(syncOption).toHaveAttribute('aria-selected', 'true')

    await waitFor(
      () => {
        expect(scope.queryByTestId('command-palette-async-pending')).toBeNull()
        const asyncHit = scope.getByRole('option', {
          name: /Decoder Freeze Notes \(body match\)/i,
        })
        expect(asyncHit).toBeVisible()
        expect(asyncHit).toHaveAttribute('aria-selected', 'false')
        expect(
          scope.getByRole('option', { name: /Compare decoder thresholds/i }),
        ).toHaveAttribute('aria-selected', 'true')
      },
      { timeout: 3000 },
    )

    await userEvent.keyboard('{Enter}')
    await waitFor(() => {
      expect(onAsyncSelectionLog).toHaveBeenCalledTimes(1)
      expect(onAsyncSelectionLog).toHaveBeenCalledWith(
        'chat:chat-decoder-ablation',
      )
    })
  },
}

const onActionSelected = fn()

/**
 * Full keyboard-first flow verifying ArrowDown, ArrowUp, Enter execution, and Escape closing.
 *
 * @summary Keyboard navigation, selection, and Escape handling
 */
export const KeyboardNavigation: Story = {
  args: { ...Empty.args },
  render: () => (
    <PaletteStoryFrame
      defaultOpen
      initialQuery=""
      onSelectLog={onActionSelected}
    />
  ),
  play: async ({ canvasElement }) => {
    onActionSelected.mockClear()
    const canvas = within(canvasElement)
    const body = within(document.body)
    const dialog = await body.findByRole('dialog', { name: 'Command palette' })
    const combobox = within(dialog).getByRole('combobox')

    const initialActive = combobox.getAttribute('aria-activedescendant')
    await expect(initialActive).toBeTruthy()

    await userEvent.keyboard('{ArrowDown}')
    const secondActive = combobox.getAttribute('aria-activedescendant')
    await expect(secondActive).toBeTruthy()
    await expect(secondActive).not.toBe(initialActive)

    await userEvent.keyboard('{ArrowUp}')
    await expect(combobox.getAttribute('aria-activedescendant')).toBe(
      initialActive,
    )

    await userEvent.keyboard('{Enter}')
    await waitFor(() => {
      expect(onActionSelected).toHaveBeenCalledTimes(1)
      expect(body.queryByRole('dialog', { name: 'Command palette' })).toBeNull()
    })

    // Reopen via trigger button and close with Escape
    await userEvent.click(canvas.getByRole('button', { name: /Open palette/i }))
    await expect(
      await body.findByRole('dialog', { name: 'Command palette' }),
    ).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => {
      expect(body.queryByRole('dialog', { name: 'Command palette' })).toBeNull()
    })
  },
}

/**
 * Alabaster Lab light-theme rendering verifying token contrast and border clarity.
 *
 * @summary Light theme palette showcase
 */
export const LightTheme: Story = {
  args: { ...Empty.args },
  render: () => (
    <PaletteStoryFrame defaultOpen initialQuery="whiteboard" lightTheme />
  ),
}

/**
 * Full workspace integration verifying global Cmd/Ctrl-K open/close,
 * document navigation, theme toggling, AI prompt prefill, and editor shortcut preservation.
 *
 * @summary Full workspace Cmd/Ctrl-K integration
 */
export const WorkspaceIntegration: Story = {
  args: { ...Empty.args },
  render: () => (
    <XDriveWorkspace
      initialTheme="dark"
      initialNav="drive"
      initialActiveTabId="home"
      initialDocs={INITIAL_WORKSPACE_DOCS}
      initialTemplates={PREDEFINED_MARBLE_TEMPLATES}
      initialAiSidebarOpen={false}
    />
  ),
  play: async ({ canvasElement }) => {
    // Default user-event delay is 0, which inserts a setTimeout between
    // keystrokes. Under a full parallel Storybook run those timers starve
    // and this workspace flow exceeds the 15s test timeout. `delay: null`
    // keeps the same keyboard sequence without yielding between keys.
    const user = userEvent.setup({ delay: null })
    const body = within(document.body)
    const workspace = canvasElement.querySelector<HTMLElement>(
      '[data-component="xdrive-workspace"]',
    )
    expect(workspace).not.toBeNull()
    await expect(workspace!.classList.contains('dark')).toBe(true)

    // 1. Open palette via global Ctrl-K and jump to a document
    await user.keyboard('{Control>}k{/Control}')
    const dialog1 = await body.findByRole('dialog', { name: 'Command palette' })
    const combobox1 = within(dialog1).getByRole('combobox')
    await user.type(combobox1, 'threshold rotated')
    await expect(
      await within(dialog1).findByRole('option', {
        name: /Threshold of the Rotated Surface Code/i,
      }),
    ).toBeVisible()
    await user.keyboard('{Enter}')

    await expect(
      await within(workspace!).findByText(
        'threshold-rotated-surface-code.mrbl',
      ),
    ).toBeVisible()

    // 2. Reopen palette and toggle theme to light
    await user.keyboard('{Control>}k{/Control}')
    const dialog2 = await body.findByRole('dialog', { name: 'Command palette' })
    await user.type(within(dialog2).getByRole('combobox'), 'light theme')
    await expect(
      await within(dialog2).findByRole('option', {
        name: /Switch to light theme/i,
      }),
    ).toBeVisible()
    await user.keyboard('{Enter}')
    await waitFor(() => {
      expect(workspace!.classList.contains('dark')).toBe(false)
    })

    // 3. Create a truly blank document (not copied from a populated template)
    await user.keyboard('{Control>}k{/Control}')
    const dialogBlank = await body.findByRole('dialog', {
      name: 'Command palette',
    })
    await user.type(
      within(dialogBlank).getByRole('combobox'),
      'New blank document',
    )
    const blankOption = await within(dialogBlank).findByRole('option', {
      name: /^New blank document,/i,
    })
    await user.click(blankOption)

    const blankDocBody = await within(workspace!).findByRole('textbox', {
      name: 'Document body',
    })
    await waitFor(() => {
      expect(blankDocBody.textContent.trim()).toBe('')
    })

    // 4. Start AI prompt prefilled from palette query
    await user.keyboard('{Control>}k{/Control}')
    const dialog3 = await body.findByRole('dialog', { name: 'Command palette' })
    await user.type(
      within(dialog3).getByRole('combobox'),
      'summarize recent ablations',
    )
    const askAiOption = await within(dialog3).findByRole('option', {
      name: /Ask AI: "summarize recent ablations"/i,
    })
    await user.click(askAiOption)

    const chatComposer = await within(
      workspace!,
    ).findByLabelText<HTMLTextAreaElement>('Message xDrive Assistant')
    await waitFor(() => {
      expect(chatComposer.value).toBe('summarize recent ablations')
    })

    // Clear the prefilled draft so returning to chat later must keep it cleared
    await user.clear(chatComposer)
    await expect(chatComposer.value).toBe('')

    // 5. Open NotesApp and confirm Cmd/Ctrl-K inserts a link instead of opening palette
    await user.keyboard('{Control>}k{/Control}')
    const dialog4 = await body.findByRole('dialog', { name: 'Command palette' })
    await user.type(within(dialog4).getByRole('combobox'), 'week 12 head')
    await expect(
      await within(dialog4).findByRole('option', {
        name: /Week 12: Head Ablations/i,
      }),
    ).toBeVisible()
    await user.keyboard('{Enter}')

    const notesEditor = await within(
      workspace!,
    ).findByLabelText<HTMLTextAreaElement>('Note markdown editor')
    await user.click(notesEditor)
    await user.keyboard('{Control>}k{/Control}')
    await waitFor(() => {
      expect(notesEditor.value).toContain('[link text](https://)')
      expect(body.queryByRole('dialog', { name: 'Command palette' })).toBeNull()
    })

    // 6. Remount Drive Chat and verify the consumed prefill prompt does not return
    const sidebarNav = within(workspace!).getByRole('navigation', {
      name: 'Primary Workspace Navigation',
    })
    const chatLink = within(sidebarNav).getByRole('link', { name: 'Chat' })
    await user.click(chatLink)
    const remountedComposer = await within(
      workspace!,
    ).findByLabelText<HTMLTextAreaElement>('Message xDrive Assistant')
    await expect(remountedComposer.value).toBe('')
  },
}
