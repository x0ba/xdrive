import { describe, expect, it, vi } from 'vitest'
import { INITIAL_AI_SUBSCRIPTIONS } from '#/lib/marble/subscriptions-seed'
import {
  INITIAL_WORKSPACE_DOCS,
  PREDEFINED_MARBLE_TEMPLATES,
} from '#/lib/marble/templates'
import type { DriveChatThread } from '#/lib/ai/drive-chat-types'
import type { DriveFolder } from '#/lib/types'
import { executeCommandSources } from './registry'
import { createBuiltinCommandSources } from './sources'
import type { WorkspaceCommandSourceDeps } from './sources'
import type { CommandContext } from './types'

const SAMPLE_FOLDERS: DriveFolder[] = [
  {
    id: 'folder-papers',
    name: 'Papers',
    parentId: null,
    color: 'default',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-20T00:00:00.000Z',
  },
  {
    id: 'folder-qec',
    name: 'Surface Codes',
    parentId: 'folder-papers',
    color: 'accent',
    createdAt: '2026-11-02T00:00:00.000Z',
    updatedAt: '2026-11-21T00:00:00.000Z',
  },
]

const SAMPLE_THREADS: DriveChatThread[] = [
  {
    id: 'chat-ablation-1',
    title: 'Compare decoder thresholds',
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-22T12:00:00.000Z',
    modelId: 'antigravity/default',
    reasoningEffort: 'high',
    mode: 'review',
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'Summarize the distance 7 threshold plot.',
        createdAt: '2026-11-22T12:00:00.000Z',
      },
    ],
  },
  {
    id: 'chat-empty',
    title: 'New chat',
    createdAt: '2026-11-23T10:00:00.000Z',
    updatedAt: '2026-11-23T10:00:00.000Z',
    modelId: 'antigravity/default',
    reasoningEffort: 'high',
    mode: 'review',
    messages: [],
  },
]

function makeDeps(
  overrides: Partial<WorkspaceCommandSourceDeps> = {},
): WorkspaceCommandSourceDeps {
  return {
    docs: INITIAL_WORKSPACE_DOCS,
    trashedDocs: [],
    folders: SAMPLE_FOLDERS,
    templates: PREDEFINED_MARBLE_TEMPLATES,
    chatThreads: SAMPLE_THREADS,
    subscriptions: INITIAL_AI_SUBSCRIPTIONS,
    trashRetentionDays: 30,
    theme: 'dark',
    activeDoc: null,
    isDocTemplate: (doc) => doc.isTemplate,
    aiSidebarOpen: false,
    onOpenDocument: vi.fn(),
    onOpenFolder: vi.fn(),
    onOpenChatThread: vi.fn(),
    onOpenNav: vi.fn(),
    onOpenRecent: vi.fn(),
    onOpenSettingsProvider: vi.fn(),
    onCreateBlankDocument: vi.fn(),
    onCreateFromTemplate: vi.fn(),
    onOpenNewTemplateModal: vi.fn(),
    onOpenNewAiAgentModal: vi.fn(),
    onCreateFolder: vi.fn(),
    onCreateWhiteboard: vi.fn(),
    onStartAiPrompt: vi.fn(),
    onToggleTheme: vi.fn(),
    onToggleAiSidebar: vi.fn(),
    ...overrides,
  }
}

function makeCtx(): CommandContext {
  return {
    pathname: '/drive',
    activeNav: 'drive',
    currentFolderId: null,
    activeDoc: null,
    theme: 'dark',
    signal: new AbortController().signal,
  }
}

describe('createBuiltinCommandSources', () => {
  it('groups into Recent, Navigate, Create, and Actions on empty query with canonical URLs', async () => {
    const deps = makeDeps()
    const sources = createBuiltinCommandSources(deps)
    const state = await executeCommandSources(sources, '', makeCtx(), {
      onUpdate: () => {},
    })

    expect(state.groups.map((g) => g.id)).toEqual([
      'recent',
      'navigate',
      'create',
      'actions',
    ])

    const recentIds = new Set(
      state.groups
        .find((g) => g.id === 'recent')!
        .items.map((entry) => entry.item.href),
    )
    expect(recentIds.has('/chat/chat-ablation-1')).toBe(true)

    const navItems = state.groups.find((g) => g.id === 'navigate')!.items
    const folderHit = navItems.find(
      (entry) => entry.item.id === 'nav:folder:folder-qec',
    )
    expect(folderHit?.item.href).toBe('/f/folder-qec/surface-codes')

    const settingsHit = navItems.find(
      (entry) => entry.item.id === 'nav:settings:provider:opencode-go',
    )
    expect(settingsHit?.item.href).toBe('/settings/models/opencode-go')
  })

  it('includes document routes, fallback template starters, and dynamic AI prompt prefill when typing', async () => {
    const onStartAiPrompt = vi.fn()
    const onOpenDocument = vi.fn()
    const onToggleTheme = vi.fn()
    const deps = makeDeps({
      templates: [], // verify fallback to PREDEFINED_MARBLE_TEMPLATES
      theme: 'light',
      onStartAiPrompt,
      onOpenDocument,
      onToggleTheme,
    })
    const sources = createBuiltinCommandSources(deps)

    const docQuery = await executeCommandSources(
      sources,
      'rotated surface',
      makeCtx(),
      { onUpdate: () => {} },
    )
    const docItem = docQuery.items.find(
      (entry) => entry.item.id === 'nav:doc:ws-qec-threshold',
    )
    expect(docItem?.item.href).toBe(
      '/d/ws-qec-threshold/threshold-rotated-surface-code',
    )
    await docItem!.item.onSelect()
    expect(onOpenDocument).toHaveBeenCalledWith('ws-qec-threshold')

    // Dynamic Ask AI action captures the query text and prefills Drive Chat
    const promptItem = docQuery.items.find(
      (entry) => entry.item.id === 'action:ai-prompt-prefill',
    )
    expect(promptItem?.item.label).toBe('Ask AI: "rotated surface"')
    await promptItem!.item.onSelect()
    expect(onStartAiPrompt).toHaveBeenCalledWith('rotated surface')

    // Create starters fall back to predefined templates
    const createQuery = await executeCommandSources(
      sources,
      'whiteboard',
      makeCtx(),
      { onUpdate: () => {} },
    )
    expect(
      createQuery.items.some((entry) => entry.item.id === 'create:whiteboard'),
    ).toBe(true)

    // Light theme shows switch to dark theme
    const themeQuery = await executeCommandSources(
      sources,
      'theme',
      makeCtx(),
      { onUpdate: () => {} },
    )
    const themeItem = themeQuery.items.find(
      (entry) => entry.item.id === 'action:toggle-theme',
    )
    expect(themeItem?.item.label).toBe('Switch to dark theme')
    await themeItem!.item.onSelect()
    expect(onToggleTheme).toHaveBeenCalledTimes(1)
  })
})
