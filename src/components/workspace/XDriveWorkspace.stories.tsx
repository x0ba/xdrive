import { useEffect, useState } from 'react'
import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import {
  INITIAL_WORKSPACE_DOCS,
  PREDEFINED_MARBLE_TEMPLATES,
  TEMPLATES_FOLDER_NAME,
  applyMarbleOpsClient,
} from '#/lib/marble'
import type { DriveChatThread } from '#/lib/ai/drive-chat-types'
import type { DriveFolder, MarbleDocumentFile, MarbleOp } from '#/lib/types'
import { XDriveWorkspace } from './XDriveWorkspace'

/**
 * Full xDrive research cloud workspace combining Drive browser, tabbed .mrbl apps, and the AI collaborator sidebar.
 *
 * @summary Full xDrive workspace shell across Drive, Notes, Docs, Slides, and .mrbl apps
 */
const meta = {
  title: 'xDrive Workspace/Workspace',
  component: XDriveWorkspace,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof XDriveWorkspace>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Default My Drive landing view in dark theme (starts empty with creation actions).
 *
 * @summary Empty Drive landing view
 */
export const DriveFiles: Story = {
  args: {
    initialTheme: 'dark',
    initialNav: 'drive',
    initialActiveTabId: 'home',
    initialAiSidebarOpen: false,
  },
}

/**
 * Full-screen Drive Chat view inside the xDrive workspace shell for querying and modifying across the Drive.
 *
 * @summary Full-screen Drive Chat view in workspace
 */
export const DriveChatWorkspace: Story = {
  name: 'Drive · AI Chat',
  args: {
    initialTheme: 'dark',
    initialNav: 'chat',
    initialActiveTabId: 'home',
    initialAiSidebarOpen: false,
  },
}

/**
 * Trash view pre-populated with recently deleted files showing 30-day retention, restore, and permanent delete.
 *
 * @summary Drive Trash view with restore and permanent delete
 */
export const TrashWorkspace: Story = {
  name: 'Drive · Trash',
  args: {
    initialTheme: 'dark',
    initialNav: 'trash',
    initialActiveTabId: 'home',
    initialDocs: INITIAL_WORKSPACE_DOCS,
    initialTrashedDocIds: ['ws-qec-threshold', 'ws-group-meeting'],
    initialAiSidebarOpen: false,
  },
}

/**
 * Workspace focused on an open Apple Notes-parity .mrbl note tab.
 *
 * @summary Open Notes app tab in workspace
 */
export const NotesAppWorkspace: Story = {
  name: 'Notes App (Apple Notes)',
  args: {
    initialTheme: 'dark',
    initialActiveTabId: 'ws-week-12-ablations',
    initialDocs: INITIAL_WORKSPACE_DOCS,
    initialOpenDocIds: [
      'ws-week-12-ablations',
      'ws-logical-memory-spec',
      'ws-group-meeting',
    ],
    initialMode: 'direct',
    initialAiSidebarOpen: false,
  },
}

/**
 * Workspace focused on an open Google Docs-parity .mrbl document tab.
 *
 * @summary Open Docs app tab in workspace
 */
export const DocsAppWorkspace: Story = {
  name: 'Docs App (Google Docs)',
  args: {
    initialTheme: 'dark',
    initialActiveTabId: 'ws-logical-memory-spec',
    initialDocs: INITIAL_WORKSPACE_DOCS,
    initialOpenDocIds: [
      'ws-week-12-ablations',
      'ws-logical-memory-spec',
      'ws-group-meeting',
    ],
    initialMode: 'direct',
    initialAiSidebarOpen: false,
  },
}

/**
 * Workspace focused on an open Google Slides-parity presentation deck tab.
 *
 * @summary Open Slides app tab in workspace
 */
export const SlidesAppWorkspace: Story = {
  name: 'Slides App (Google Slides)',
  args: {
    initialTheme: 'dark',
    initialActiveTabId: 'ws-group-meeting',
    initialDocs: INITIAL_WORKSPACE_DOCS,
    initialOpenDocIds: [
      'ws-week-12-ablations',
      'ws-logical-memory-spec',
      'ws-group-meeting',
    ],
    initialMode: 'direct',
    initialAiSidebarOpen: false,
  },
}

/**
 * Interactive two-column LaTeX manuscript rendered inside the workspace tab strip.
 *
 * @summary Interactive LaTeX manuscript view
 */
export const LiveLatexDocument: Story = {
  name: 'LaTeX Manuscript',
  args: {
    initialTheme: 'dark',
    initialActiveTabId: 'tpl-latex-studio',
    initialDocs: INITIAL_WORKSPACE_DOCS,
    initialOpenDocIds: ['tpl-latex-studio', 'ws-qec-threshold'],
    initialMode: 'direct',
    initialAiSidebarOpen: false,
  },
}

/**
 * Research notebook paired with the open AI collaborator sidebar.
 *
 * @summary Lab notebook with AI collaborator sidebar
 */
export const LiveNotebookWithCollaborator: Story = {
  name: 'Lab Notebook + AI Sidebar',
  args: {
    initialTheme: 'dark',
    initialActiveTabId: 'tpl-research-notebook',
    initialDocs: INITIAL_WORKSPACE_DOCS,
    initialOpenDocIds: ['tpl-research-notebook', 'ws-week-12-ablations'],
    initialMode: 'direct',
    initialAiSidebarOpen: true,
  },
}

/**
 * Sketch & annotate interaction mode with a selected manuscript section and AI sidebar open.
 *
 * @summary Sketch and annotate mode with selected target
 */
export const SketchAndAnnotateMode: Story = {
  name: 'Sketch & Annotate',
  args: {
    initialTheme: 'dark',
    initialActiveTabId: 'tpl-latex-studio',
    initialOpenDocIds: ['tpl-latex-studio'],
    initialMode: 'sketch',
    initialAiSidebarOpen: true,
    initialSelectedIds: ['sec-abstract'],
  },
}

/**
 * Evergreen document design system reference open alongside the AI collaborator.
 *
 * @summary Evergreen document design system view
 */
export const EvergreenDesignSystem: Story = {
  name: 'Evergreen · Document Design System',
  args: {
    initialTheme: 'dark',
    initialActiveTabId: 'ws-document-design-system',
    initialDocs: INITIAL_WORKSPACE_DOCS,
    initialOpenDocIds: [
      'ws-document-design-system',
      'ws-document-donts-system',
    ],
    initialMode: 'direct',
    initialAiSidebarOpen: true,
  },
}

/**
 * Evergreen anti-slop document guardrails open alongside the AI collaborator.
 *
 * @summary Evergreen document anti-slop guardrails view
 */
export const EvergreenDontsSystem: Story = {
  name: 'Evergreen · Document Don’ts (Anti-Slop)',
  args: {
    initialTheme: 'dark',
    initialActiveTabId: 'ws-document-donts-system',
    initialDocs: INITIAL_WORKSPACE_DOCS,
    initialOpenDocIds: [
      'ws-document-design-system',
      'ws-document-donts-system',
    ],
    initialMode: 'direct',
    initialAiSidebarOpen: true,
  },
}

const USER_TEMPLATE_STORY_DOC: MarbleDocumentFile = {
  ...PREDEFINED_MARBLE_TEMPLATES[0],
  id: 'tpl-user-quantum-bench',
  slug: 'user-quantum-bench-template',
  fileName: 'user-quantum-bench-template.mrbl',
  title: 'User Quantum Bench Template',
  description: 'Saved from an existing workspace experiment.',
  category: 'custom',
  isTemplate: true,
  starred: false,
  pinned: false,
  folder: TEMPLATES_FOLDER_NAME,
  tags: ['benchmark', 'user-template'],
}

/**
 * Workspace Templates view listing premade templates alongside user-created templates with edit, rename, duplicate, and trash actions.
 *
 * @summary Workspace Templates view with premade and user-made templates
 */
export const TemplatesWorkspace: Story = {
  name: 'Drive · Templates',
  args: {
    initialTheme: 'dark',
    initialNav: 'templates',
    initialActiveTabId: 'home',
    initialDocs: INITIAL_WORKSPACE_DOCS,
    initialTemplates: [...PREDEFINED_MARBLE_TEMPLATES, USER_TEMPLATE_STORY_DOC],
    initialAiSidebarOpen: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText('LaTeX Paper & Theorem Studio'),
    ).toBeVisible()
    await expect(canvas.getByText('User Quantum Bench Template')).toBeVisible()

    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Actions for User Quantum Bench Template',
      }),
    )
    const menu = await canvas.findByRole('menu', {
      name: 'Actions for User Quantum Bench Template',
    })
    await expect(
      within(menu).getByRole('menuitem', { name: 'Move to trash' }),
    ).toBeVisible()
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Rename' }),
    )

    const dialog = await canvas.findByRole('dialog', {
      name: 'Rename template',
    })
    const nameInput = within(dialog).getByLabelText('Document name')
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Renamed User Bench Template')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await expect(canvas.getByText('Renamed User Bench Template')).toBeVisible()
  },
}

/**
 * Verifies that renaming the Templates folder immediately drops template status for its files and recreating Templates mints a distinct folder ID.
 *
 * @summary Rename Templates folder and recreate a fresh Templates folder
 */
export const RenameTemplatesFolderAndRecreate: Story = {
  name: 'Drive · Rename Templates Folder & Recreate',
  args: {
    initialTheme: 'dark',
    initialNav: 'drive',
    initialActiveTabId: 'home',
    initialDocs: INITIAL_WORKSPACE_DOCS,
    initialTemplates: [PREDEFINED_MARBLE_TEMPLATES[0]],
    initialAiSidebarOpen: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const premadeTitle = PREDEFINED_MARBLE_TEMPLATES[0].title

    const templatesMenuBtn = await canvas.findByRole('button', {
      name: 'Actions for Templates',
    })
    await expect(canvas.queryByText(premadeTitle)).toBeNull()

    await userEvent.click(templatesMenuBtn)
    const folderMenu = await canvas.findByRole('menu', {
      name: 'Actions for Templates',
    })
    await userEvent.click(
      within(folderMenu).getByRole('menuitem', { name: 'Rename' }),
    )

    const renameDialog = await canvas.findByRole('dialog', {
      name: 'Rename folder',
    })
    const folderInput = within(renameDialog).getByLabelText('Folder name')
    await userEvent.clear(folderInput)
    await userEvent.type(folderInput, 'Archived Templates')
    await userEvent.click(
      within(renameDialog).getByRole('button', { name: 'Save name' }),
    )

    // After renaming Templates, its docs immediately appear as regular Drive files.
    await expect(await canvas.findByText(premadeTitle)).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Actions for Archived Templates' }),
    ).toBeInTheDocument()
    const sidebarNav = canvas.getByRole('navigation', {
      name: 'Primary Workspace Navigation',
    })
    await expect(
      within(sidebarNav).getByRole('link', { name: 'Archived Templates' }),
    ).toBeVisible()

    // Navigate to the Templates view via the sidebar and confirm the gallery is now empty.
    await userEvent.click(
      within(sidebarNav).getByRole('link', { name: 'Templates' }),
    )
    await expect(await canvas.findByText('No templates yet')).toBeVisible()

    // Return to My Drive and save another doc as a template to recreate Templates cleanly.
    await userEvent.click(
      canvas.getByRole('button', { name: 'Go to My Drive' }),
    )
    const docMenuBtn = await canvas.findByRole('button', {
      name: 'Actions for Scaling Bench: Argon vs Flash',
    })
    await userEvent.click(docMenuBtn)
    const docMenu = await canvas.findByRole('menu', {
      name: 'Actions for Scaling Bench: Argon vs Flash',
    })
    await userEvent.click(
      within(docMenu).getByRole('menuitem', { name: 'Save as template' }),
    )

    const saveTplDialog = await canvas.findByRole('dialog', {
      name: 'Save as template',
    })
    const tplNameInput = within(saveTplDialog).getByLabelText('Template name')
    await userEvent.clear(tplNameInput)
    await userEvent.type(tplNameInput, 'Recreated Bench Template')
    await userEvent.click(
      within(saveTplDialog).getByRole('button', { name: 'Save template' }),
    )

    // Both Archived Templates and the newly recreated Templates folder coexist cleanly.
    await expect(
      await canvas.findByRole('button', { name: 'Actions for Templates' }),
    ).toBeInTheDocument()
    await expect(
      canvas.getByRole('button', { name: 'Actions for Archived Templates' }),
    ).toBeInTheDocument()
    const archivedLink = within(sidebarNav).getByRole('link', {
      name: 'Archived Templates',
    })
    await expect(archivedLink).toBeVisible()

    const templateLinks = within(sidebarNav).getAllByRole('link', {
      name: 'Templates',
    })
    await expect(templateLinks).toHaveLength(2)
    const templatesFolderLink = templateLinks.find(
      (link) => link.getAttribute('href') !== '/templates',
    )
    const templatesNavLink = templateLinks.find(
      (link) => link.getAttribute('href') === '/templates',
    )
    expect(templatesFolderLink).toBeDefined()
    expect(templatesNavLink).toBeDefined()
    expect(templatesFolderLink?.getAttribute('href')).not.toBe(
      archivedLink.getAttribute('href'),
    )

    if (!templatesNavLink) {
      throw new Error('Expected /templates sidebar navigation link')
    }
    await userEvent.click(templatesNavLink)
    await expect(
      await canvas.findByText('Recreated Bench Template'),
    ).toBeVisible()
    await expect(canvas.queryByText(premadeTitle)).toBeNull()
  },
}

interface RecordedMarblePost {
  action?: string
  slug?: string
  folderPath?: string
  oldPath?: string
  newName?: string
  meta?: { slug?: string }
  [key: string]: unknown
}

const RENAME_RACE_DOC: MarbleDocumentFile = {
  ...INITIAL_WORKSPACE_DOCS[2],
  id: 'doc-rename-race',
  slug: 'rename-race-doc',
  fileName: 'rename-race-doc.mrbl',
  title: 'Rename Race Doc',
  category: 'document',
  isTemplate: false,
  isEvergreen: false,
  starred: false,
  pinned: true,
  folder: 'My Drive',
  folderId: null,
  trashedAt: null,
  source:
    '<!doctype html><html lang="en" data-marble="1"><head><meta charset="utf-8"><title>Rename Race Doc</title></head><body><main><h1 data-marble-id="h1" data-marble-editable>Initial Body</h1></main></body></html>',
}

let rejectFirstRename: ((reason?: unknown) => void) | null = null
let resolveSecondRename: (() => void) | null = null
let recordedRenamePosts: RecordedMarblePost[] = []

function RenameFailureStoryHarness(
  args: ComponentProps<typeof XDriveWorkspace>,
) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    recordedRenamePosts = []
    let renameAttempt = 0
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input)
      if (url.includes('/api/marble')) {
        const method = (init?.method ?? 'GET').toUpperCase()
        if (method === 'GET' && url.includes('action=workspace')) {
          return new Response(
            JSON.stringify({
              ok: true,
              folders: [],
              docs: [RENAME_RACE_DOC],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        if (method === 'POST' && typeof init?.body === 'string') {
          const payload = JSON.parse(init.body) as RecordedMarblePost
          if (payload.action === 'diff' || payload.action === 'doctor') {
            return new Response(JSON.stringify({ ok: false }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            })
          }
          recordedRenamePosts.push(payload)
          if (payload.action === 'rename_document') {
            renameAttempt += 1
            if (renameAttempt === 1) {
              await new Promise<void>((_resolve, reject) => {
                rejectFirstRename = reject
              })
            }
            await new Promise<void>((resolve) => {
              resolveSecondRename = resolve
            })
            const nextTitle =
              typeof payload.title === 'string' ? payload.title : 'Renamed Doc'
            const serverSource = RENAME_RACE_DOC.source.replace(
              '<title>Rename Race Doc</title>',
              `<title>${nextTitle}</title>`,
            )
            return new Response(
              JSON.stringify({
                ok: true,
                id: RENAME_RACE_DOC.id,
                oldSlug: RENAME_RACE_DOC.slug,
                slug: 'renamed-doc-2',
                fileName: 'renamed-doc-2.mrbl',
                folderPath: '',
                relPath: 'renamed-doc-2.mrbl',
                isTemplate: false,
                title: nextTitle,
                description:
                  typeof payload.description === 'string'
                    ? payload.description
                    : '',
                source: serverSource,
                updatedAt: '2026-11-26T00:05:00.000Z',
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            )
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
      }
      return originalFetch(input, init)
    }
    setReady(true)
    return () => {
      rejectFirstRename?.(new Error('unmounted'))
      rejectFirstRename = null
      resolveSecondRename?.()
      resolveSecondRename = null
      window.fetch = originalFetch
    }
  }, [])

  if (!ready) return null
  return <XDriveWorkspace {...args} />
}

/**
 * Verifies that thrown/failed rename requests discard held edits cleanly without saving to a stale path, while confirmed renames replay held edits onto the server-deduped slug.
 *
 * @summary Thrown rename failure discards pending edits; confirmed rename replays on server-deduped slug
 */
export const RenameFailureDiscardsPendingEdits: Story = {
  name: 'Document · Failed Rename Discards Pending Edits',
  args: {
    initialTheme: 'dark',
    initialActiveTabId: 'doc-rename-race',
    initialDocs: [RENAME_RACE_DOC],
    initialOpenDocIds: ['doc-rename-race'],
    initialMode: 'source',
    initialAiSidebarOpen: false,
    syncWithServer: true,
  },
  render: (args) => <RenameFailureStoryHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sourceTextarea = await canvas.findByLabelText<HTMLTextAreaElement>(
      'Marble HTML5 source',
    )
    await waitFor(() => expect(sourceTextarea.value).toContain('Initial Body'))

    const sidebarNav = canvas.getByRole('navigation', {
      name: 'Primary Workspace Navigation',
    })
    const sidebarContainer = sidebarNav.parentElement
    expect(sidebarContainer).not.toBeNull()

    const triggerRename = async () => {
      const pinnedLink = await within(sidebarContainer!).findByRole('link', {
        name: 'Rename Race Doc',
      })
      await userEvent.pointer({ keys: '[MouseRight]', target: pinnedLink })
      const pinnedMenu = await canvas.findByRole('menu', {
        name: 'Actions for Rename Race Doc',
      })
      await userEvent.click(
        within(pinnedMenu).getByRole('menuitem', { name: 'Rename' }),
      )
      const renameDialog = await canvas.findByRole('dialog', {
        name: 'Rename file',
      })
      const nameInput = within(renameDialog).getByLabelText('Document name')
      await userEvent.clear(nameInput)
      await userEvent.type(nameInput, 'Renamed Doc')
      await userEvent.click(
        within(renameDialog).getByRole('button', { name: 'Save' }),
      )
    }

    // Attempt 1: trigger rename and hold an edit while the request is pending.
    await triggerRename()
    await waitFor(() => expect(rejectFirstRename).not.toBeNull())
    expect(await canvas.findByText('Renaming "Rename Race Doc"…')).toBeVisible()

    const bodyStart = sourceTextarea.value.indexOf('Initial Body')
    expect(bodyStart).toBeGreaterThan(-1)
    sourceTextarea.focus()
    await userEvent.type(sourceTextarea, 'Held Unconfirmed Edit', {
      initialSelectionStart: bodyStart,
      initialSelectionEnd: bodyStart + 'Initial Body'.length,
    })
    await userEvent.click(canvas.getByRole('button', { name: 'Apply' }))
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Apply' })).toBeDisabled(),
    )
    expect(
      recordedRenamePosts.filter(
        (post) => post.action === 'save' || post.action === 'apply_ops',
      ),
    ).toHaveLength(0)

    // Throw inside fetch -> pending edit must be discarded and zero save POSTs fired.
    rejectFirstRename?.(new TypeError('Network error'))
    rejectFirstRename = null

    await waitFor(() => {
      expect(sourceTextarea.value).toContain('Initial Body')
      expect(sourceTextarea.value).not.toContain('Held Unconfirmed Edit')
    })
    expect(
      await canvas.findByText(/pending edits were discarded/i),
    ).toBeVisible()
    expect(
      recordedRenamePosts.filter(
        (post) => post.action === 'save' || post.action === 'apply_ops',
      ),
    ).toHaveLength(0)

    // Attempt 2: rename succeeds with server-deduped slug; held edit replays onto renamed-doc-2.
    await triggerRename()
    await waitFor(() => expect(resolveSecondRename).not.toBeNull())

    const secondStart = sourceTextarea.value.indexOf('Initial Body')
    expect(secondStart).toBeGreaterThan(-1)
    sourceTextarea.focus()
    await userEvent.type(sourceTextarea, 'Replayed Held Edit', {
      initialSelectionStart: secondStart,
      initialSelectionEnd: secondStart + 'Initial Body'.length,
    })
    await userEvent.click(canvas.getByRole('button', { name: 'Apply' }))
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Apply' })).toBeDisabled(),
    )
    expect(
      recordedRenamePosts.filter(
        (post) => post.action === 'save' || post.action === 'apply_ops',
      ),
    ).toHaveLength(0)

    resolveSecondRename?.()
    resolveSecondRename = null

    await expect(
      await within(sidebarContainer!).findByRole('link', {
        name: 'Renamed Doc',
      }),
    ).toBeVisible()
    await waitFor(() =>
      expect(
        canvas.getAllByText('renamed-doc-2.mrbl').length,
      ).toBeGreaterThanOrEqual(1),
    )
    await waitFor(() => {
      const savePosts = recordedRenamePosts.filter(
        (post) => post.action === 'save' || post.action === 'apply_ops',
      )
      expect(savePosts).toHaveLength(1)
      expect(savePosts[0]?.slug).toBe('renamed-doc-2')
      expect(savePosts[0]?.meta?.slug).toBe('renamed-doc-2')
    })
    expect(sourceTextarea.value).toContain('<title>Renamed Doc</title>')
    expect(sourceTextarea.value).toContain('Replayed Held Edit')
  },
}

const TEMPLATE_RACE_SOURCE_DOC: MarbleDocumentFile = {
  ...INITIAL_WORKSPACE_DOCS[2],
  id: 'doc-template-race-src',
  slug: 'source-bench-note',
  fileName: 'source-bench-note.mrbl',
  title: 'Source Bench Note',
  category: 'document',
  isTemplate: false,
  isEvergreen: false,
  starred: false,
  pinned: false,
  folder: 'My Drive',
  folderId: null,
  trashedAt: null,
  source:
    '<!doctype html><html lang="en" data-marble="1"><head><meta charset="utf-8"><title>Source Bench Note</title></head><body><main><h1 data-marble-id="h1" data-marble-editable>Initial Body</h1></main></body></html>',
}

let resolveInFlightSaveTemplateDedupe: (() => void) | null = null
let recordedSaveDedupePosts: RecordedMarblePost[] = []

function SaveAsTemplateDedupeAndReclaimHarness(
  args: ComponentProps<typeof XDriveWorkspace>,
) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    recordedSaveDedupePosts = []
    let latestServerSource = TEMPLATE_RACE_SOURCE_DOC.source
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input)
      if (url.includes('/api/marble')) {
        const method = (init?.method ?? 'GET').toUpperCase()
        if (method === 'GET' && url.includes('action=workspace')) {
          return new Response(
            JSON.stringify({
              ok: true,
              folders: [],
              docs: [TEMPLATE_RACE_SOURCE_DOC],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        if (method === 'POST' && typeof init?.body === 'string') {
          const payload = JSON.parse(init.body) as RecordedMarblePost
          if (payload.action === 'diff' || payload.action === 'doctor') {
            return new Response(JSON.stringify({ ok: false }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            })
          }
          recordedSaveDedupePosts.push(payload)
          if (payload.action === 'save_as_template') {
            await new Promise<void>((resolve) => {
              resolveInFlightSaveTemplateDedupe = resolve
            })
            const now = '2026-11-26T00:05:00.000Z'
            const folder: DriveFolder = {
              id: 'folder-templates-srv',
              name: TEMPLATES_FOLDER_NAME,
              parentId: null,
              color: 'accent',
              isTemplatesFolder: true,
              createdAt: now,
              updatedAt: now,
            }
            const title =
              typeof payload.title === 'string'
                ? payload.title
                : 'Bench Template'
            latestServerSource = TEMPLATE_RACE_SOURCE_DOC.source.replace(
              '<title>Source Bench Note</title>',
              `<title>${title}</title>`,
            )
            const dedupedDoc: MarbleDocumentFile = {
              ...TEMPLATE_RACE_SOURCE_DOC,
              id:
                typeof payload.id === 'string' ? payload.id : 'tpl-deduped-id',
              slug: 'bench-template-2',
              fileName: 'bench-template-2.mrbl',
              title,
              description:
                typeof payload.description === 'string'
                  ? payload.description
                  : '',
              isTemplate: true,
              folderId: folder.id,
              folder: TEMPLATES_FOLDER_NAME,
              source: latestServerSource,
              version: 1,
              syncState: 'saved',
              createdAt: now,
              updatedAt: now,
            }
            return new Response(
              JSON.stringify({ ok: true, folder, doc: dedupedDoc }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            )
          }
          if (
            (payload.action === 'save' || payload.action === 'apply_ops') &&
            typeof payload.meta === 'object'
          ) {
            const nextTextMatch = Array.isArray(payload.ops)
              ? (payload.ops[0] as { text?: string } | undefined)?.text
              : undefined
            if (nextTextMatch) {
              latestServerSource = latestServerSource.replace(
                />[^<]+<\/h1>/,
                `>${nextTextMatch}</h1>`,
              )
            }
            return new Response(
              JSON.stringify({
                ok: true,
                slug: payload.slug,
                source: latestServerSource,
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            )
          }
          if (payload.action === 'rename_document') {
            const title =
              typeof payload.title === 'string'
                ? payload.title
                : 'Bench Template'
            return new Response(
              JSON.stringify({
                ok: true,
                id: 'tpl-deduped-id',
                oldSlug: payload.slug,
                slug: 'bench-template',
                fileName: 'bench-template.mrbl',
                folderPath: TEMPLATES_FOLDER_NAME,
                relPath: `${TEMPLATES_FOLDER_NAME}/bench-template.mrbl`,
                isTemplate: true,
                title,
                description:
                  typeof payload.description === 'string'
                    ? payload.description
                    : '',
                source: latestServerSource,
                updatedAt: '2026-11-26T00:06:00.000Z',
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            )
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
      }
      return originalFetch(input, init)
    }
    setReady(true)
    return () => {
      resolveInFlightSaveTemplateDedupe?.()
      resolveInFlightSaveTemplateDedupe = null
      window.fetch = originalFetch
    }
  }, [])

  if (!ready) return null
  return <XDriveWorkspace {...args} />
}

/**
 * Verifies server-confirmed template creation with deduped slug usage on edits, followed by reclaiming the base slug via rename.
 *
 * @summary Server-confirmed deduped template slug for edits and slug reclaim via rename
 */
export const SaveAsTemplateDedupedSlugAndReclaim: Story = {
  name: 'Template · Deduped Slug & Reclaim Rename',
  args: {
    initialTheme: 'dark',
    initialNav: 'drive',
    initialActiveTabId: 'home',
    initialDocs: [TEMPLATE_RACE_SOURCE_DOC],
    initialAiSidebarOpen: false,
    syncWithServer: true,
  },
  render: (args) => <SaveAsTemplateDedupeAndReclaimHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const docMenuBtn = await canvas.findByRole('button', {
      name: 'Actions for Source Bench Note',
    })
    await userEvent.click(docMenuBtn)
    const docMenu = await canvas.findByRole('menu', {
      name: 'Actions for Source Bench Note',
    })
    await userEvent.click(
      within(docMenu).getByRole('menuitem', { name: 'Save as template' }),
    )

    const saveTplDialog = await canvas.findByRole('dialog', {
      name: 'Save as template',
    })
    const tplNameInput = within(saveTplDialog).getByLabelText('Template name')
    await userEvent.clear(tplNameInput)
    await userEvent.type(tplNameInput, 'Bench Template')
    await userEvent.click(
      within(saveTplDialog).getByRole('button', { name: 'Save template' }),
    )

    await waitFor(() =>
      expect(resolveInFlightSaveTemplateDedupe).not.toBeNull(),
    )
    expect(
      await canvas.findByText('Saving "Bench Template" to Templates…'),
    ).toBeVisible()
    // Pessimistic creation waits for server reply before adding the Templates item.
    expect(canvas.queryByText('Bench Template')).toBeNull()

    resolveInFlightSaveTemplateDedupe?.()
    resolveInFlightSaveTemplateDedupe = null

    await expect(
      await canvas.findByText('Saved "Bench Template" to Templates'),
    ).toBeVisible()

    const sidebarNav = canvas.getByRole('navigation', {
      name: 'Primary Workspace Navigation',
    })
    const clickTemplatesNav = async () => {
      const link = within(sidebarNav)
        .getAllByRole('link', { name: TEMPLATES_FOLDER_NAME })
        .find((el) => el.getAttribute('href') === '/templates')
      expect(link).toBeDefined()
      await userEvent.click(link!)
    }

    await clickTemplatesNav()

    const tplMenuBtn = await canvas.findByRole('button', {
      name: 'Actions for Bench Template',
    })
    await userEvent.click(tplMenuBtn)
    const tplMenu = await canvas.findByRole('menu', {
      name: 'Actions for Bench Template',
    })
    await userEvent.click(
      within(tplMenu).getByRole('menuitem', { name: 'Edit template' }),
    )

    await waitFor(() =>
      expect(
        canvas.getAllByText('bench-template-2.mrbl').length,
      ).toBeGreaterThanOrEqual(1),
    )
    await userEvent.click(await canvas.findByTitle('Source (4)'))
    const sourceTextarea = await canvas.findByLabelText<HTMLTextAreaElement>(
      'Marble HTML5 source',
    )
    await waitFor(() => expect(sourceTextarea.value).toContain('Initial Body'))

    const firstStart = sourceTextarea.value.indexOf('Initial Body')
    expect(firstStart).toBeGreaterThan(-1)
    sourceTextarea.focus()
    await userEvent.type(sourceTextarea, 'Saved On Deduped', {
      initialSelectionStart: firstStart,
      initialSelectionEnd: firstStart + 'Initial Body'.length,
    })
    await userEvent.click(canvas.getByRole('button', { name: 'Apply' }))
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Apply' })).toBeDisabled(),
    )

    await waitFor(() => {
      const savePosts = recordedSaveDedupePosts.filter(
        (post) => post.action === 'save' || post.action === 'apply_ops',
      )
      expect(savePosts).toHaveLength(1)
      expect(savePosts[0]?.slug).toBe('bench-template-2')
      expect(savePosts[0]?.meta?.slug).toBe('bench-template-2')
    })

    // Rename template to reclaim 'bench-template' and verify later saves use it.
    await clickTemplatesNav()
    await userEvent.click(
      await canvas.findByRole('button', {
        name: 'Actions for Bench Template',
      }),
    )
    const reclaimMenu = await canvas.findByRole('menu', {
      name: 'Actions for Bench Template',
    })
    await userEvent.click(
      within(reclaimMenu).getByRole('menuitem', { name: 'Rename' }),
    )
    const reclaimDialog = await canvas.findByRole('dialog', {
      name: 'Rename template',
    })
    await userEvent.click(
      within(reclaimDialog).getByRole('button', { name: 'Save' }),
    )

    await expect(
      await canvas.findByText('Renamed to "Bench Template"'),
    ).toBeVisible()

    await userEvent.click(
      await canvas.findByRole('button', {
        name: 'Actions for Bench Template',
      }),
    )
    const editAgainMenu = await canvas.findByRole('menu', {
      name: 'Actions for Bench Template',
    })
    await userEvent.click(
      within(editAgainMenu).getByRole('menuitem', { name: 'Edit template' }),
    )

    await waitFor(() =>
      expect(
        canvas.getAllByText('bench-template.mrbl').length,
      ).toBeGreaterThanOrEqual(1),
    )
    const reclaimedTextarea = await canvas.findByLabelText<HTMLTextAreaElement>(
      'Marble HTML5 source',
    )
    await waitFor(() =>
      expect(reclaimedTextarea.value).toContain('Saved On Deduped'),
    )
    const secondStart = reclaimedTextarea.value.indexOf('Saved On Deduped')
    expect(secondStart).toBeGreaterThan(-1)
    reclaimedTextarea.focus()
    await userEvent.type(reclaimedTextarea, 'Saved On Reclaimed', {
      initialSelectionStart: secondStart,
      initialSelectionEnd: secondStart + 'Saved On Deduped'.length,
    })
    await userEvent.click(canvas.getByRole('button', { name: 'Apply' }))
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Apply' })).toBeDisabled(),
    )

    await waitFor(() => {
      const savePosts = recordedSaveDedupePosts.filter(
        (post) => post.action === 'save' || post.action === 'apply_ops',
      )
      expect(savePosts).toHaveLength(2)
      expect(savePosts[1]?.slug).toBe('bench-template')
      expect(savePosts[1]?.meta?.slug).toBe('bench-template')
    })
  },
}

let resolveInFlightSaveFolderRace: (() => void) | null = null
let recordedFolderRacePosts: RecordedMarblePost[] = []

function SaveAsTemplateFolderRenameHarness(
  args: ComponentProps<typeof XDriveWorkspace>,
) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    recordedFolderRacePosts = []
    const originalFetch = window.fetch.bind(window)
    const initialTemplatesFolder: DriveFolder = {
      id: 'folder-templates',
      name: TEMPLATES_FOLDER_NAME,
      parentId: null,
      color: 'accent',
      isTemplatesFolder: true,
      createdAt: '2026-11-26T00:00:00.000Z',
      updatedAt: '2026-11-26T00:00:00.000Z',
    }
    window.fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input)
      if (url.includes('/api/marble')) {
        const method = (init?.method ?? 'GET').toUpperCase()
        if (method === 'GET' && url.includes('action=workspace')) {
          return new Response(
            JSON.stringify({
              ok: true,
              folders: [initialTemplatesFolder],
              docs: [TEMPLATE_RACE_SOURCE_DOC],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        if (method === 'POST' && typeof init?.body === 'string') {
          const payload = JSON.parse(init.body) as RecordedMarblePost
          if (payload.action === 'diff' || payload.action === 'doctor') {
            return new Response(JSON.stringify({ ok: false }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            })
          }
          recordedFolderRacePosts.push(payload)
          if (payload.action === 'save_as_template') {
            await new Promise<void>((resolve) => {
              resolveInFlightSaveFolderRace = resolve
            })
            const now = '2026-11-26T00:05:00.000Z'
            const title =
              typeof payload.title === 'string'
                ? payload.title
                : 'Race Template'
            const serverDoc: MarbleDocumentFile = {
              ...TEMPLATE_RACE_SOURCE_DOC,
              id:
                typeof payload.id === 'string' ? payload.id : 'tpl-folder-race',
              slug: 'race-template',
              fileName: 'race-template.mrbl',
              title,
              isTemplate: true,
              folderId: initialTemplatesFolder.id,
              folder: TEMPLATES_FOLDER_NAME,
              source: TEMPLATE_RACE_SOURCE_DOC.source.replace(
                '<title>Source Bench Note</title>',
                `<title>${title}</title>`,
              ),
              version: 1,
              syncState: 'saved',
              createdAt: now,
              updatedAt: now,
            }
            return new Response(
              JSON.stringify({
                ok: true,
                folder: initialTemplatesFolder,
                doc: serverDoc,
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            )
          }
          if (payload.action === 'rename_folder') {
            return new Response(
              JSON.stringify({
                ok: true,
                oldPath: payload.oldPath,
                newPath: payload.newName,
                folder: {
                  ...initialTemplatesFolder,
                  name:
                    typeof payload.newName === 'string'
                      ? payload.newName
                      : 'Archived Templates',
                  isTemplatesFolder: false,
                  updatedAt: '2026-11-26T00:06:00.000Z',
                },
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            )
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
      }
      return originalFetch(input, init)
    }
    setReady(true)
    return () => {
      resolveInFlightSaveFolderRace?.()
      resolveInFlightSaveFolderRace = null
      window.fetch = originalFetch
    }
  }, [])

  if (!ready) return null
  return <XDriveWorkspace {...args} />
}

/**
 * Verifies that renaming the Templates folder while save_as_template is in flight preserves the renamed folder and routes later edits into it.
 *
 * @summary Folder rename during pending save_as_template is preserved
 */
export const SaveAsTemplateReplyPreservesFolderRename: Story = {
  name: 'Template · Folder Rename During Pending Save',
  args: {
    initialTheme: 'dark',
    initialNav: 'drive',
    initialActiveTabId: 'home',
    initialDocs: [TEMPLATE_RACE_SOURCE_DOC],
    initialAiSidebarOpen: false,
    syncWithServer: true,
  },
  render: (args) => <SaveAsTemplateFolderRenameHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByRole('button', { name: 'Actions for Templates' }),
    ).toBeInTheDocument()

    const docMenuBtn = await canvas.findByRole('button', {
      name: 'Actions for Source Bench Note',
    })
    await userEvent.click(docMenuBtn)
    const docMenu = await canvas.findByRole('menu', {
      name: 'Actions for Source Bench Note',
    })
    await userEvent.click(
      within(docMenu).getByRole('menuitem', { name: 'Save as template' }),
    )

    const saveTplDialog = await canvas.findByRole('dialog', {
      name: 'Save as template',
    })
    const tplNameInput = within(saveTplDialog).getByLabelText('Template name')
    await userEvent.clear(tplNameInput)
    await userEvent.type(tplNameInput, 'Race Template')
    await userEvent.click(
      within(saveTplDialog).getByRole('button', { name: 'Save template' }),
    )

    await waitFor(() => expect(resolveInFlightSaveFolderRace).not.toBeNull())

    // Rename Templates -> Archived Templates while save_as_template is still pending.
    await userEvent.click(
      canvas.getByRole('button', { name: 'Actions for Templates' }),
    )
    const folderMenu = await canvas.findByRole('menu', {
      name: 'Actions for Templates',
    })
    await userEvent.click(
      within(folderMenu).getByRole('menuitem', { name: 'Rename' }),
    )

    const renameDialog = await canvas.findByRole('dialog', {
      name: 'Rename folder',
    })
    const folderInput = within(renameDialog).getByLabelText('Folder name')
    await userEvent.clear(folderInput)
    await userEvent.type(folderInput, 'Archived Templates')
    await userEvent.click(
      within(renameDialog).getByRole('button', { name: 'Save name' }),
    )

    resolveInFlightSaveFolderRace?.()
    resolveInFlightSaveFolderRace = null

    await waitFor(() =>
      expect(
        recordedFolderRacePosts.some((post) => post.action === 'rename_folder'),
      ).toBe(true),
    )

    await expect(
      await canvas.findByRole('button', {
        name: 'Actions for Archived Templates',
      }),
    ).toBeInTheDocument()
    expect(
      canvas.queryByRole('button', { name: 'Actions for Templates' }),
    ).toBeNull()

    const sidebarNav = canvas.getByRole('navigation', {
      name: 'Primary Workspace Navigation',
    })
    const templatesNavLink = within(sidebarNav)
      .getAllByRole('link', { name: TEMPLATES_FOLDER_NAME })
      .find((link) => link.getAttribute('href') === '/templates')
    expect(templatesNavLink).toBeDefined()
    await userEvent.click(templatesNavLink!)
    await expect(await canvas.findByText('No templates yet')).toBeVisible()

    // Open Archived Templates -> open Race Template -> edit -> ensure save goes to Archived Templates.
    await userEvent.click(
      within(sidebarNav).getByRole('link', { name: 'Archived Templates' }),
    )
    const raceTplMenuBtn = await canvas.findByRole('button', {
      name: 'Actions for Race Template',
    })
    await userEvent.click(raceTplMenuBtn)
    const raceTplMenu = await canvas.findByRole('menu', {
      name: 'Actions for Race Template',
    })
    await userEvent.click(
      within(raceTplMenu).getByRole('menuitem', { name: 'Open' }),
    )

    await userEvent.click(await canvas.findByTitle('Source (4)'))
    const sourceTextarea = await canvas.findByLabelText<HTMLTextAreaElement>(
      'Marble HTML5 source',
    )
    await waitFor(() => expect(sourceTextarea.value).toContain('Initial Body'))
    const bodyStart = sourceTextarea.value.indexOf('Initial Body')
    expect(bodyStart).toBeGreaterThan(-1)
    sourceTextarea.focus()
    await userEvent.type(sourceTextarea, 'Saved In Renamed Folder', {
      initialSelectionStart: bodyStart,
      initialSelectionEnd: bodyStart + 'Initial Body'.length,
    })
    await userEvent.click(canvas.getByRole('button', { name: 'Apply' }))
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Apply' })).toBeDisabled(),
    )

    await waitFor(() => {
      const savePosts = recordedFolderRacePosts.filter(
        (post) => post.action === 'save' || post.action === 'apply_ops',
      )
      expect(savePosts).toHaveLength(1)
      expect(savePosts[0]?.slug).toBe('race-template')
      expect(savePosts[0]?.folderPath).toBe('Archived Templates')
    })
  },
}

const MOVE_RACE_DOC: MarbleDocumentFile = {
  ...INITIAL_WORKSPACE_DOCS[2],
  id: 'doc-move-race',
  slug: 'move-race-doc',
  fileName: 'move-race-doc.mrbl',
  title: 'Move Race Doc',
  category: 'document',
  isTemplate: false,
  isEvergreen: false,
  starred: false,
  pinned: true,
  folder: 'My Drive',
  folderId: null,
  trashedAt: null,
  source:
    '<!doctype html><html lang="en" data-marble="1"><head><meta charset="utf-8"><title>Move Race Doc</title></head><body><main><h1 data-marble-id="h1" data-marble-editable>Initial Body</h1></main></body></html>',
}

const MOVE_RACE_ARCHIVE_FOLDER: DriveFolder = {
  id: 'folder-archive',
  name: 'Archive',
  parentId: null,
  color: 'default',
  createdAt: '2026-11-26T00:00:00.000Z',
  updatedAt: '2026-11-26T00:00:00.000Z',
}

const MOVE_RACE_BLOCKED_FOLDER: DriveFolder = {
  id: 'folder-blocked',
  name: 'Blocked',
  parentId: null,
  color: 'sketch',
  createdAt: '2026-11-26T00:00:00.000Z',
  updatedAt: '2026-11-26T00:00:00.000Z',
}

let resolveFirstMoveRaceSave: (() => void) | null = null
let recordedMoveRacePosts: RecordedMarblePost[] = []

function QueuedEditBeforeMoveHarness(
  args: ComponentProps<typeof XDriveWorkspace>,
) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    recordedMoveRacePosts = []
    let saveAttempt = 0
    let serverDoc: MarbleDocumentFile = { ...MOVE_RACE_DOC }
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input)
      if (url.includes('/api/marble')) {
        const method = (init?.method ?? 'GET').toUpperCase()
        if (method === 'GET' && url.includes('action=workspace')) {
          return new Response(
            JSON.stringify({
              ok: true,
              folders: [MOVE_RACE_ARCHIVE_FOLDER, MOVE_RACE_BLOCKED_FOLDER],
              docs: [serverDoc],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        if (method === 'POST' && typeof init?.body === 'string') {
          const payload = JSON.parse(init.body) as RecordedMarblePost
          if (payload.action === 'diff' || payload.action === 'doctor') {
            return new Response(JSON.stringify({ ok: false }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            })
          }
          recordedMoveRacePosts.push(payload)
          if (payload.action === 'save' || payload.action === 'apply_ops') {
            saveAttempt += 1
            if (saveAttempt === 1) {
              await new Promise<void>((resolve) => {
                resolveFirstMoveRaceSave = resolve
              })
            }
            const nextSource =
              payload.action === 'apply_ops' &&
              typeof payload.source === 'string' &&
              Array.isArray(payload.ops)
                ? applyMarbleOpsClient(
                    payload.source,
                    payload.ops as MarbleOp[],
                  ).source
                : typeof payload.source === 'string'
                  ? payload.source
                  : serverDoc.source
            serverDoc = { ...serverDoc, source: nextSource }
            return new Response(
              JSON.stringify({
                ok: true,
                slug: payload.slug,
                folderPath: payload.folderPath ?? '',
                source: nextSource,
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            )
          }
          if (payload.action === 'move_document') {
            if (payload.toFolderPath === 'Blocked') {
              return new Response(
                JSON.stringify({
                  ok: false,
                  error: 'Blocked folder conflict',
                }),
                {
                  status: 409,
                  headers: { 'content-type': 'application/json' },
                },
              )
            }
            serverDoc = {
              ...serverDoc,
              source:
                typeof payload.source === 'string'
                  ? payload.source
                  : serverDoc.source,
              folderId: MOVE_RACE_ARCHIVE_FOLDER.id,
              folder: MOVE_RACE_ARCHIVE_FOLDER.name,
            }
            return new Response(
              JSON.stringify({
                ok: true,
                slug: payload.slug,
                fromPath: `${payload.slug}.mrbl`,
                toPath: `${String(payload.toFolderPath ?? '')}/${payload.slug}.mrbl`,
                folderPath: payload.toFolderPath ?? '',
                isTemplate: false,
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            )
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
      }
      return originalFetch(input, init)
    }
    setReady(true)
    return () => {
      resolveFirstMoveRaceSave?.()
      resolveFirstMoveRaceSave = null
      window.fetch = originalFetch
    }
  }, [])

  if (!ready) return null
  return <XDriveWorkspace {...args} />
}

/**
 * Verifies that edits queued before a move target the pre-move confirmed folder, while edits after a confirmed move target the destination and failed moves preserve the confirmed folder.
 *
 * @summary Server-confirmed move keeps queued writes bound to confirmed folders
 */
export const QueuedEditBeforeMoveUsesConfirmedFolder: Story = {
  name: 'Document · Queued Edit Targets Confirmed Folder Before Move',
  args: {
    initialTheme: 'dark',
    initialActiveTabId: 'doc-move-race',
    initialDocs: [MOVE_RACE_DOC],
    initialOpenDocIds: ['doc-move-race'],
    initialMode: 'source',
    initialAiSidebarOpen: false,
    syncWithServer: true,
  },
  render: (args) => <QueuedEditBeforeMoveHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sourceTextarea = await canvas.findByLabelText<HTMLTextAreaElement>(
      'Marble HTML5 source',
    )
    await waitFor(() => expect(sourceTextarea.value).toContain('Initial Body'))

    const sidebarNav = canvas.getByRole('navigation', {
      name: 'Primary Workspace Navigation',
    })
    const sidebarContainer = sidebarNav.parentElement
    expect(sidebarContainer).not.toBeNull()
    await expect(
      await within(sidebarContainer!).findByRole('link', { name: 'Archive' }),
    ).toBeVisible()

    const replaceBodyText = async (currentText: string, nextText: string) => {
      const start = sourceTextarea.value.indexOf(currentText)
      expect(start).toBeGreaterThan(-1)
      sourceTextarea.focus()
      await userEvent.type(sourceTextarea, nextText, {
        initialSelectionStart: start,
        initialSelectionEnd: start + currentText.length,
      })
      await userEvent.click(canvas.getByRole('button', { name: 'Apply' }))
      await waitFor(() =>
        expect(canvas.getByRole('button', { name: 'Apply' })).toBeDisabled(),
      )
    }

    const triggerMoveTo = async (folderName: string) => {
      const pinnedLink = await within(sidebarContainer!).findByRole('link', {
        name: 'Move Race Doc',
      })
      await userEvent.pointer({ keys: '[MouseRight]', target: pinnedLink })
      const menu = await canvas.findByRole('menu', {
        name: 'Actions for Move Race Doc',
      })
      await userEvent.click(
        within(menu).getByRole('menuitem', { name: 'Move to folder…' }),
      )
      const dialog = await canvas.findByRole('dialog', {
        name: 'Move file to folder',
      })
      await userEvent.click(
        within(dialog).getByRole('button', { name: folderName }),
      )
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Move here' }),
      )
    }

    // Edit 1 holds the queue; Edit 2 and Move -> Archive queue behind it.
    await replaceBodyText('Initial Body', 'First Edit Body')
    await waitFor(() => expect(resolveFirstMoveRaceSave).not.toBeNull())

    await replaceBodyText('First Edit Body', 'Second Edit Body')
    await triggerMoveTo('Archive')
    expect(
      await canvas.findByText('Moving "Move Race Doc" to Archive…'),
    ).toBeVisible()

    resolveFirstMoveRaceSave?.()
    resolveFirstMoveRaceSave = null

    await expect(
      await canvas.findByText('Moved "Move Race Doc" to Archive'),
    ).toBeVisible()

    await waitFor(() => expect(recordedMoveRacePosts).toHaveLength(3))
    expect(['save', 'apply_ops']).toContain(recordedMoveRacePosts[0]?.action)
    expect(recordedMoveRacePosts[0]?.folderPath).toBe('')
    expect(['save', 'apply_ops']).toContain(recordedMoveRacePosts[1]?.action)
    expect(recordedMoveRacePosts[1]?.folderPath).toBe('')
    expect(recordedMoveRacePosts[2]?.action).toBe('move_document')
    expect(recordedMoveRacePosts[2]?.fromFolderPath).toBe('')
    expect(recordedMoveRacePosts[2]?.toFolderPath).toBe('Archive')

    // Edit 3 after confirmed move targets Archive.
    await replaceBodyText('Second Edit Body', 'Third Edit Body')
    await waitFor(() => expect(recordedMoveRacePosts).toHaveLength(4))
    expect(['save', 'apply_ops']).toContain(recordedMoveRacePosts[3]?.action)
    expect(recordedMoveRacePosts[3]?.folderPath).toBe('Archive')

    // Failed move to Blocked keeps confirmed Archive location for Edit 4.
    await triggerMoveTo('Blocked')
    expect(await canvas.findByText('Blocked folder conflict')).toBeVisible()

    await replaceBodyText('Third Edit Body', 'Fourth Edit Body')
    await waitFor(() => expect(recordedMoveRacePosts).toHaveLength(6))
    expect(recordedMoveRacePosts[4]?.action).toBe('move_document')
    expect(recordedMoveRacePosts[4]?.toFolderPath).toBe('Blocked')
    expect(['save', 'apply_ops']).toContain(recordedMoveRacePosts[5]?.action)
    expect(recordedMoveRacePosts[5]?.folderPath).toBe('Archive')
  },
}

const TEMP_RELOAD_FOLDER: DriveFolder = {
  id: 'folder-temp',
  name: 'Temp Folder',
  parentId: null,
  color: 'default',
  createdAt: '2026-11-26T00:00:00.000Z',
  updatedAt: '2026-11-26T00:00:00.000Z',
}

let resolveInFlightDeleteFolder: (() => void) | null = null
let recordedReloadRenamePosts: RecordedMarblePost[] = []
let reloadWorkspaceGetCount = 0

function ReloadDuringQueuedRenameHarness(
  args: ComponentProps<typeof XDriveWorkspace>,
) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    recordedReloadRenamePosts = []
    reloadWorkspaceGetCount = 0
    let folderDeleted = false
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input)
      if (url.includes('/api/marble')) {
        const method = (init?.method ?? 'GET').toUpperCase()
        if (method === 'GET' && url.includes('action=workspace')) {
          reloadWorkspaceGetCount += 1
          return new Response(
            JSON.stringify({
              ok: true,
              folders: folderDeleted ? [] : [TEMP_RELOAD_FOLDER],
              docs: [RENAME_RACE_DOC],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        if (method === 'POST' && typeof init?.body === 'string') {
          const payload = JSON.parse(init.body) as RecordedMarblePost
          if (payload.action === 'diff' || payload.action === 'doctor') {
            return new Response(JSON.stringify({ ok: false }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            })
          }
          recordedReloadRenamePosts.push(payload)
          if (payload.action === 'delete_folder') {
            await new Promise<void>((resolve) => {
              resolveInFlightDeleteFolder = resolve
            })
            folderDeleted = true
            return new Response(
              JSON.stringify({
                ok: true,
                movedFiles: [
                  { from: 'Temp Folder/dup.mrbl', to: 'dup-2.mrbl' },
                ],
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            )
          }
          if (payload.action === 'rename_document') {
            const nextTitle =
              typeof payload.title === 'string'
                ? payload.title
                : 'Renamed After Reload'
            const serverSource = RENAME_RACE_DOC.source.replace(
              '<title>Rename Race Doc</title>',
              `<title>${nextTitle}</title>`,
            )
            return new Response(
              JSON.stringify({
                ok: true,
                id: RENAME_RACE_DOC.id,
                oldSlug: payload.slug,
                slug: 'renamed-after-reload',
                fileName: 'renamed-after-reload.mrbl',
                folderPath: '',
                relPath: 'renamed-after-reload.mrbl',
                isTemplate: false,
                title: nextTitle,
                description:
                  typeof payload.description === 'string'
                    ? payload.description
                    : '',
                source: serverSource,
                updatedAt: '2026-11-26T00:08:00.000Z',
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            )
          }
          return new Response(
            JSON.stringify({
              ok: true,
              slug: payload.slug,
              source: payload.source,
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
      }
      return originalFetch(input, init)
    }
    setReady(true)
    return () => {
      resolveInFlightDeleteFolder?.()
      resolveInFlightDeleteFolder = null
      window.fetch = originalFetch
    }
  }, [])

  if (!ready) return null
  return <XDriveWorkspace {...args} />
}

/**
 * Verifies that an unrelated reloadWorkspaceFromServer running ahead of a queued rename preserves held edits so they replay against the confirmed slug.
 *
 * @summary Unrelated workspace reload preserves held edits for queued rename
 */
export const ReloadDuringQueuedRenamePreservesHeldEdits: Story = {
  name: 'Document · Reload During Queued Rename Preserves Held Edits',
  args: {
    initialTheme: 'dark',
    initialActiveTabId: 'doc-rename-race',
    initialDocs: [RENAME_RACE_DOC],
    initialOpenDocIds: ['doc-rename-race'],
    initialMode: 'source',
    initialAiSidebarOpen: false,
    syncWithServer: true,
  },
  render: (args) => <ReloadDuringQueuedRenameHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sourceTextarea = await canvas.findByLabelText<HTMLTextAreaElement>(
      'Marble HTML5 source',
    )
    await waitFor(() => expect(sourceTextarea.value).toContain('Initial Body'))

    const sidebarNav = canvas.getByRole('navigation', {
      name: 'Primary Workspace Navigation',
    })
    const sidebarContainer = sidebarNav.parentElement
    expect(sidebarContainer).not.toBeNull()

    // Start delete_folder on Temp Folder to hold the queue and trigger a reload on completion.
    const tempFolderLink = await within(sidebarContainer!).findByRole('link', {
      name: 'Temp Folder',
    })
    await userEvent.pointer({ keys: '[MouseRight]', target: tempFolderLink })
    const folderMenu = await canvas.findByRole('menu', {
      name: 'Actions for Temp Folder',
    })
    await userEvent.click(
      within(folderMenu).getByRole('menuitem', { name: 'Delete folder' }),
    )
    await waitFor(() => expect(resolveInFlightDeleteFolder).not.toBeNull())

    // Queue rename_document behind delete_folder and edit while waiting.
    const pinnedLink = await within(sidebarContainer!).findByRole('link', {
      name: 'Rename Race Doc',
    })
    await userEvent.pointer({ keys: '[MouseRight]', target: pinnedLink })
    const pinnedMenu = await canvas.findByRole('menu', {
      name: 'Actions for Rename Race Doc',
    })
    await userEvent.click(
      within(pinnedMenu).getByRole('menuitem', { name: 'Rename' }),
    )
    const renameDialog = await canvas.findByRole('dialog', {
      name: 'Rename file',
    })
    const nameInput = within(renameDialog).getByLabelText('Document name')
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Renamed After Reload')
    await userEvent.click(
      within(renameDialog).getByRole('button', { name: 'Save' }),
    )
    expect(await canvas.findByText('Renaming "Rename Race Doc"…')).toBeVisible()

    const bodyStart = sourceTextarea.value.indexOf('Initial Body')
    expect(bodyStart).toBeGreaterThan(-1)
    sourceTextarea.focus()
    await userEvent.type(sourceTextarea, 'Survived Reload Edit', {
      initialSelectionStart: bodyStart,
      initialSelectionEnd: bodyStart + 'Initial Body'.length,
    })
    await userEvent.click(canvas.getByRole('button', { name: 'Apply' }))
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Apply' })).toBeDisabled(),
    )
    expect(
      recordedReloadRenamePosts.filter(
        (post) => post.action === 'save' || post.action === 'apply_ops',
      ),
    ).toHaveLength(0)

    // Complete delete_folder -> reloadWorkspaceFromServer runs -> rename_document confirms -> held edit replays.
    resolveInFlightDeleteFolder?.()
    resolveInFlightDeleteFolder = null

    await expect(
      await within(sidebarContainer!).findByRole('link', {
        name: 'Renamed After Reload',
      }),
    ).toBeVisible()
    await waitFor(() =>
      expect(reloadWorkspaceGetCount).toBeGreaterThanOrEqual(2),
    )

    await waitFor(() => {
      const savePosts = recordedReloadRenamePosts.filter(
        (post) => post.action === 'save' || post.action === 'apply_ops',
      )
      expect(savePosts).toHaveLength(1)
      expect(savePosts[0]?.slug).toBe('renamed-after-reload')
      expect(savePosts[0]?.meta?.slug).toBe('renamed-after-reload')
      const serialized = JSON.stringify(savePosts[0])
      expect(serialized).toContain('Survived Reload Edit')
    })
    expect(sourceTextarea.value).toContain(
      '<title>Renamed After Reload</title>',
    )
    expect(sourceTextarea.value).toContain('Survived Reload Edit')
  },
}

const CHAT_RENAME_FOLDER: DriveFolder = {
  id: 'folder-notes',
  name: 'Research Notes',
  parentId: null,
  color: 'accent',
  createdAt: '2026-11-26T00:00:00.000Z',
  updatedAt: '2026-11-26T00:00:00.000Z',
}

const CHAT_RENAME_THREAD: DriveChatThread = {
  id: 'chat-thread-rename',
  title: 'Rename folder thread',
  createdAt: '2026-11-26T00:00:00.000Z',
  updatedAt: '2026-11-26T00:05:00.000Z',
  modelId: 'claude-sonnet-4-6',
  reasoningEffort: 'medium',
  mode: 'review',
  messages: [
    {
      id: 'msg-user-1',
      role: 'user',
      content: 'Rename Research Notes to Archived Notes',
      createdAt: '2026-11-26T00:04:00.000Z',
    },
    {
      id: 'msg-assistant-1',
      role: 'assistant',
      content: 'Proposed renaming the folder.',
      createdAt: '2026-11-26T00:05:00.000Z',
      actions: [
        {
          id: 'act-rename-folder-1',
          kind: 'rename_folder',
          label: 'Rename folder',
          summary: 'Rename Research Notes to Archived Notes',
          status: 'proposed',
          folderId: 'folder-notes',
          folderName: 'Research Notes',
          nextName: 'Archived Notes',
        },
      ],
    },
  ],
}

let resolveChatForwardRename: (() => void) | null = null
let resolveChatUndoRename: (() => void) | null = null
let recordedChatFolderPosts: RecordedMarblePost[] = []

function DriveChatFolderRenameHarness(
  args: ComponentProps<typeof XDriveWorkspace>,
) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    recordedChatFolderPosts = []
    try {
      window.localStorage.removeItem('xdrive-drive-chat-threads')
    } catch {
      // ignore storage errors
    }
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input)
      const method = (init?.method ?? 'GET').toUpperCase()
      if (url.includes('/api/drive-chat/threads')) {
        if (method === 'GET') {
          return new Response(
            JSON.stringify({ ok: true, threads: [CHAT_RENAME_THREAD] }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.includes('/api/marble')) {
        if (method === 'GET' && url.includes('action=workspace')) {
          return new Response(
            JSON.stringify({
              ok: true,
              folders: [CHAT_RENAME_FOLDER],
              docs: [RENAME_RACE_DOC],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        if (method === 'POST' && typeof init?.body === 'string') {
          const payload = JSON.parse(init.body) as RecordedMarblePost
          if (payload.action === 'diff' || payload.action === 'doctor') {
            return new Response(JSON.stringify({ ok: false }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            })
          }
          recordedChatFolderPosts.push(payload)
          if (payload.action === 'rename_folder') {
            if (payload.newName === 'Archived Notes') {
              await new Promise<void>((resolve) => {
                resolveChatForwardRename = resolve
              })
              return new Response(
                JSON.stringify({
                  ok: true,
                  oldPath: payload.oldPath,
                  newPath: 'Archived Notes',
                  folder: {
                    ...CHAT_RENAME_FOLDER,
                    id: 'folder-notes-srv',
                    name: 'Archived Notes',
                    updatedAt: '2026-11-26T00:06:00.000Z',
                  },
                }),
                {
                  status: 200,
                  headers: { 'content-type': 'application/json' },
                },
              )
            }
            await new Promise<void>((resolve) => {
              resolveChatUndoRename = resolve
            })
            return new Response(
              JSON.stringify({
                ok: true,
                oldPath: payload.oldPath,
                newPath: 'Research Notes',
                folder: {
                  ...CHAT_RENAME_FOLDER,
                  id: 'folder-notes-srv',
                  name: 'Research Notes',
                  updatedAt: '2026-11-26T00:07:00.000Z',
                },
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            )
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
      }
      return originalFetch(input, init)
    }
    setReady(true)
    return () => {
      resolveChatForwardRename?.()
      resolveChatForwardRename = null
      resolveChatUndoRename?.()
      resolveChatUndoRename = null
      window.fetch = originalFetch
    }
  }, [])

  if (!ready) return null
  return <XDriveWorkspace {...args} />
}

/**
 * Verifies that Drive Chat folder rename waits for server confirmation before marking Applied and exposing Undo, and Undo waits for confirmation before marking Undone.
 *
 * @summary Drive Chat folder rename confirms before offering Undo
 */
export const DriveChatFolderRenameConfirmsBeforeUndo: Story = {
  name: 'Drive Chat · Folder Rename Confirms Before Undo',
  args: {
    initialTheme: 'dark',
    initialNav: 'chat',
    initialActiveTabId: 'home',
    initialAiSidebarOpen: false,
    syncWithServer: true,
  },
  render: (args) => <DriveChatFolderRenameHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sidebarNav = canvas.getByRole('navigation', {
      name: 'Primary Workspace Navigation',
    })
    await expect(
      await within(sidebarNav).findByRole('link', { name: 'Research Notes' }),
    ).toBeVisible()

    const applyBtn = await canvas.findByRole('button', { name: 'Apply' })
    await userEvent.click(applyBtn)

    await waitFor(() => expect(resolveChatForwardRename).not.toBeNull())

    // While server confirmation is pending, Undo is unavailable and card stays Pending.
    expect(canvas.queryByRole('button', { name: 'Undo' })).toBeNull()
    expect(canvas.getByText('Pending')).toBeVisible()

    // Duplicate Apply clicks while in flight are ignored cleanly.
    await userEvent.click(canvas.getByRole('button', { name: 'Apply' }))
    expect(
      recordedChatFolderPosts.filter((p) => p.action === 'rename_folder'),
    ).toHaveLength(1)
    expect(canvas.queryByText('Failed')).toBeNull()

    // Confirm forward rename on server.
    resolveChatForwardRename?.()
    resolveChatForwardRename = null

    await expect(await canvas.findByText('Applied')).toBeVisible()
    const undoBtn = await canvas.findByRole('button', { name: 'Undo' })
    await expect(
      await within(sidebarNav).findByRole('link', { name: 'Archived Notes' }),
    ).toBeVisible()

    // Click Undo -> card must wait for reverse rename confirmation before marking Undone.
    await userEvent.click(undoBtn)
    await waitFor(() => expect(resolveChatUndoRename).not.toBeNull())

    const renamePostsDuringUndo = recordedChatFolderPosts.filter(
      (p) => p.action === 'rename_folder',
    )
    expect(renamePostsDuringUndo).toHaveLength(2)
    expect(renamePostsDuringUndo[1]?.oldPath).toBe('Archived Notes')
    expect(renamePostsDuringUndo[1]?.newName).toBe('Research Notes')
    expect(canvas.queryByText('Undone')).toBeNull()

    resolveChatUndoRename?.()
    resolveChatUndoRename = null

    await expect(await canvas.findByText('Undone')).toBeVisible()
    await expect(
      await within(sidebarNav).findByRole('link', { name: 'Research Notes' }),
    ).toBeVisible()
  },
}

let rejectLostMoveResponse: ((reason?: unknown) => void) | null = null
let resolveReloadAfterLostMove: (() => void) | null = null
let recordedLostMovePosts: RecordedMarblePost[] = []

function MoveLostResponseHarness(args: ComponentProps<typeof XDriveWorkspace>) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    recordedLostMovePosts = []
    let serverDoc: MarbleDocumentFile = { ...MOVE_RACE_DOC }
    let moveCommittedOnServer = false
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input)
      if (url.includes('/api/marble')) {
        const method = (init?.method ?? 'GET').toUpperCase()
        if (method === 'GET' && url.includes('action=workspace')) {
          if (moveCommittedOnServer) {
            await new Promise<void>((resolve) => {
              resolveReloadAfterLostMove = resolve
            })
          }
          return new Response(
            JSON.stringify({
              ok: true,
              folders: [MOVE_RACE_ARCHIVE_FOLDER],
              docs: [serverDoc],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        if (method === 'POST' && typeof init?.body === 'string') {
          const payload = JSON.parse(init.body) as RecordedMarblePost
          if (payload.action === 'diff' || payload.action === 'doctor') {
            return new Response(JSON.stringify({ ok: false }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            })
          }
          recordedLostMovePosts.push(payload)
          if (payload.action === 'move_document') {
            serverDoc = {
              ...serverDoc,
              folderId: MOVE_RACE_ARCHIVE_FOLDER.id,
              folder: MOVE_RACE_ARCHIVE_FOLDER.name,
            }
            moveCommittedOnServer = true
            await new Promise<void>((_resolve, reject) => {
              rejectLostMoveResponse = reject
            })
          }
          return new Response(
            JSON.stringify({
              ok: true,
              slug: payload.slug,
              folderPath: payload.folderPath ?? '',
              source: payload.source,
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
      }
      return originalFetch(input, init)
    }
    setReady(true)
    return () => {
      rejectLostMoveResponse?.(new Error('unmounted'))
      rejectLostMoveResponse = null
      resolveReloadAfterLostMove?.()
      resolveReloadAfterLostMove = null
      window.fetch = originalFetch
    }
  }, [])

  if (!ready) return null
  return <XDriveWorkspace {...args} />
}

/**
 * Verifies that if move_document succeeds on disk before its HTTP response is lost, reloadWorkspaceFromServer finishes before queued edits continue so they save to the confirmed destination.
 *
 * @summary Lost move response reloads actual folder before queued writes continue
 */
export const MoveLostResponseReloadsActualFolder: Story = {
  name: 'Document · Lost Move Response Reloads Confirmed Folder',
  args: {
    initialTheme: 'dark',
    initialActiveTabId: 'doc-move-race',
    initialDocs: [MOVE_RACE_DOC],
    initialOpenDocIds: ['doc-move-race'],
    initialMode: 'source',
    initialAiSidebarOpen: false,
    syncWithServer: true,
  },
  render: (args) => <MoveLostResponseHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sourceTextarea = await canvas.findByLabelText<HTMLTextAreaElement>(
      'Marble HTML5 source',
    )
    await waitFor(() => expect(sourceTextarea.value).toContain('Initial Body'))

    const sidebarNav = canvas.getByRole('navigation', {
      name: 'Primary Workspace Navigation',
    })
    const sidebarContainer = sidebarNav.parentElement
    expect(sidebarContainer).not.toBeNull()
    await expect(
      await within(sidebarContainer!).findByRole('link', { name: 'Archive' }),
    ).toBeVisible()

    // Start Move -> Archive, then queue an edit while the move response is pending.
    const pinnedLink = await within(sidebarContainer!).findByRole('link', {
      name: 'Move Race Doc',
    })
    await userEvent.pointer({ keys: '[MouseRight]', target: pinnedLink })
    const menu = await canvas.findByRole('menu', {
      name: 'Actions for Move Race Doc',
    })
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Move to folder…' }),
    )
    const dialog = await canvas.findByRole('dialog', {
      name: 'Move file to folder',
    })
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Archive' }),
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Move here' }),
    )
    await waitFor(() => expect(rejectLostMoveResponse).not.toBeNull())

    const replaceBodyText = async (currentText: string, nextText: string) => {
      const start = sourceTextarea.value.indexOf(currentText)
      expect(start).toBeGreaterThan(-1)
      sourceTextarea.focus()
      await userEvent.type(sourceTextarea, nextText, {
        initialSelectionStart: start,
        initialSelectionEnd: start + currentText.length,
      })
      await userEvent.click(canvas.getByRole('button', { name: 'Apply' }))
      await waitFor(() =>
        expect(canvas.getByRole('button', { name: 'Apply' })).toBeDisabled(),
      )
    }

    await replaceBodyText('Initial Body', 'Edited During Lost Move')
    expect(
      recordedLostMovePosts.filter(
        (post) => post.action === 'save' || post.action === 'apply_ops',
      ),
    ).toHaveLength(0)

    // Drop the move response -> reload starts and blocks queued writes until reload resolves.
    rejectLostMoveResponse?.(new TypeError('Failed to fetch'))
    rejectLostMoveResponse = null
    await waitFor(() => expect(resolveReloadAfterLostMove).not.toBeNull())
    expect(
      recordedLostMovePosts.filter(
        (post) => post.action === 'save' || post.action === 'apply_ops',
      ),
    ).toHaveLength(0)

    resolveReloadAfterLostMove?.()
    resolveReloadAfterLostMove = null

    await waitFor(() => {
      const savePosts = recordedLostMovePosts.filter(
        (post) => post.action === 'save' || post.action === 'apply_ops',
      )
      expect(savePosts).toHaveLength(1)
      expect(savePosts[0]?.folderPath).toBe('Archive')
      expect(JSON.stringify(savePosts[0])).toContain('Edited During Lost Move')
    })
    expect(sourceTextarea.value).toContain('Edited During Lost Move')

    await replaceBodyText('Edited During Lost Move', 'Second Edit After Reload')
    await waitFor(() => {
      const savePosts = recordedLostMovePosts.filter(
        (post) => post.action === 'save' || post.action === 'apply_ops',
      )
      expect(savePosts).toHaveLength(2)
      expect(savePosts[1]?.folderPath).toBe('Archive')
    })
  },
}

let rejectRenameDuringReload: ((reason?: unknown) => void) | null = null
let resolveRenameErrorReload: (() => void) | null = null
let recordedRenameReloadPosts: RecordedMarblePost[] = []

function RenameFailureDuringReloadHarness(
  args: ComponentProps<typeof XDriveWorkspace>,
) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    recordedRenameReloadPosts = []
    let holdRenameReload = false
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input)
      if (url.includes('/api/marble')) {
        const method = (init?.method ?? 'GET').toUpperCase()
        if (method === 'GET' && url.includes('action=workspace')) {
          if (holdRenameReload) {
            holdRenameReload = false
            await new Promise<void>((resolve) => {
              resolveRenameErrorReload = resolve
            })
          }
          return new Response(
            JSON.stringify({
              ok: true,
              folders: [],
              docs: [{ ...RENAME_RACE_DOC, syncState: 'saved' }],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        if (method === 'POST' && typeof init?.body === 'string') {
          const payload = JSON.parse(init.body) as RecordedMarblePost
          if (payload.action === 'diff' || payload.action === 'doctor') {
            return new Response(JSON.stringify({ ok: false }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            })
          }
          recordedRenameReloadPosts.push(payload)
          if (payload.action === 'rename_document') {
            holdRenameReload = true
            await new Promise<void>((_resolve, reject) => {
              rejectRenameDuringReload = reject
            })
          }
          return new Response(
            JSON.stringify({ ok: true, slug: payload.slug }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
      }
      return originalFetch(input, init)
    }
    setReady(true)
    return () => {
      rejectRenameDuringReload?.(new Error('unmounted'))
      rejectRenameDuringReload = null
      resolveRenameErrorReload?.()
      resolveRenameErrorReload = null
      window.fetch = originalFetch
    }
  }, [])

  if (!ready) return null
  return <XDriveWorkspace {...args} />
}

/**
 * Verifies that edits applied while a failed rename is reloading are discarded with the displayed source, and the document is marked saved only once it matches the server.
 *
 * @summary Failed rename reload reverts unwritten edits before marking saved
 */
export const RenameFailureDuringReloadRevertsUnwrittenEdits: Story = {
  name: 'Document · Failed Rename Reload Reverts Unwritten Edits',
  args: {
    initialTheme: 'dark',
    initialActiveTabId: 'doc-rename-race',
    initialDocs: [RENAME_RACE_DOC],
    initialOpenDocIds: ['doc-rename-race'],
    initialMode: 'source',
    initialAiSidebarOpen: false,
    syncWithServer: true,
  },
  render: (args) => <RenameFailureDuringReloadHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sourceTextarea = await canvas.findByLabelText<HTMLTextAreaElement>(
      'Marble HTML5 source',
    )
    await waitFor(() => expect(sourceTextarea.value).toContain('Initial Body'))

    const sidebarNav = canvas.getByRole('navigation', {
      name: 'Primary Workspace Navigation',
    })
    const sidebarContainer = sidebarNav.parentElement
    expect(sidebarContainer).not.toBeNull()
    const pinnedLink = await within(sidebarContainer!).findByRole('link', {
      name: 'Rename Race Doc',
    })
    await userEvent.pointer({ keys: '[MouseRight]', target: pinnedLink })
    const pinnedMenu = await canvas.findByRole('menu', {
      name: 'Actions for Rename Race Doc',
    })
    await userEvent.click(
      within(pinnedMenu).getByRole('menuitem', { name: 'Rename' }),
    )
    const renameDialog = await canvas.findByRole('dialog', {
      name: 'Rename file',
    })
    const nameInput = within(renameDialog).getByLabelText('Document name')
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Renamed Doc')
    await userEvent.click(
      within(renameDialog).getByRole('button', { name: 'Save' }),
    )
    await waitFor(() => expect(rejectRenameDuringReload).not.toBeNull())

    rejectRenameDuringReload?.(new TypeError('Failed to fetch'))
    rejectRenameDuringReload = null
    await waitFor(() => expect(resolveRenameErrorReload).not.toBeNull())

    const bodyStart = sourceTextarea.value.indexOf('Initial Body')
    expect(bodyStart).toBeGreaterThan(-1)
    sourceTextarea.focus()
    await userEvent.type(sourceTextarea, 'Edited During Failed Reload', {
      initialSelectionStart: bodyStart,
      initialSelectionEnd: bodyStart + 'Initial Body'.length,
    })
    await userEvent.click(canvas.getByRole('button', { name: 'Apply' }))
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Apply' })).toBeDisabled(),
    )
    expect(sourceTextarea.value).toContain('Edited During Failed Reload')
    expect(canvas.getByTitle('Saving')).toBeVisible()
    expect(canvas.queryByTitle('Saved')).toBeNull()
    expect(
      recordedRenameReloadPosts.filter(
        (post) => post.action === 'save' || post.action === 'apply_ops',
      ),
    ).toHaveLength(0)

    resolveRenameErrorReload?.()
    resolveRenameErrorReload = null

    await waitFor(() => {
      expect(sourceTextarea.value).toContain('Initial Body')
      expect(sourceTextarea.value).not.toContain('Edited During Failed Reload')
    })
    expect(canvas.getByTitle('Saved')).toBeVisible()
    expect(canvas.queryByTitle('Saving')).toBeNull()
    expect(
      recordedRenameReloadPosts.filter(
        (post) => post.action === 'save' || post.action === 'apply_ops',
      ),
    ).toHaveLength(0)
    expect(
      await canvas.findByText(/pending edits were discarded/i),
    ).toBeVisible()
  },
}

const STENCIL_TEMPLATE_FOLDER: DriveFolder = {
  id: 'folder-templates-stencil',
  name: TEMPLATES_FOLDER_NAME,
  parentId: null,
  color: 'accent',
  isTemplatesFolder: true,
  createdAt: '2026-11-26T00:00:00.000Z',
  updatedAt: '2026-11-26T00:00:00.000Z',
}

const STENCIL_TEMPLATE_DOC: MarbleDocumentFile = {
  ...INITIAL_WORKSPACE_DOCS[2],
  id: 'tpl-stencil',
  slug: 'stencil-template',
  fileName: 'stencil-template.mrbl',
  title: 'Stencil Note',
  category: 'document',
  isTemplate: true,
  isEvergreen: false,
  starred: false,
  pinned: false,
  folder: TEMPLATES_FOLDER_NAME,
  folderId: STENCIL_TEMPLATE_FOLDER.id,
  trashedAt: null,
  syncState: 'saved',
  source:
    '<!doctype html><html lang="en" data-marble="1"><head><meta charset="utf-8"><title>Stencil Note</title></head><body><main><h1 data-marble-id="h1" data-marble-editable>Stencil Body</h1></main></body></html>',
}

let rejectCopyMove: ((reason?: unknown) => void) | null = null
let resolveCopyReload: (() => void) | null = null
let resolveCopySave: (() => void) | null = null
let recordedCopyPosts: RecordedMarblePost[] = []

function PendingFirstSaveReloadHarness(
  args: ComponentProps<typeof XDriveWorkspace>,
) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    recordedCopyPosts = []
    let holdCopyReload = false
    let serverMoveDoc: MarbleDocumentFile = { ...MOVE_RACE_DOC }
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input)
      if (url.includes('/api/marble')) {
        const method = (init?.method ?? 'GET').toUpperCase()
        if (method === 'GET' && url.includes('action=workspace')) {
          if (holdCopyReload) {
            holdCopyReload = false
            await new Promise<void>((resolve) => {
              resolveCopyReload = resolve
            })
          }
          return new Response(
            JSON.stringify({
              ok: true,
              folders: [STENCIL_TEMPLATE_FOLDER, MOVE_RACE_ARCHIVE_FOLDER],
              docs: [serverMoveDoc, STENCIL_TEMPLATE_DOC],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        if (method === 'POST' && typeof init?.body === 'string') {
          const payload = JSON.parse(init.body) as RecordedMarblePost
          if (payload.action === 'diff' || payload.action === 'doctor') {
            return new Response(JSON.stringify({ ok: false }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            })
          }
          recordedCopyPosts.push(payload)
          if (payload.action === 'move_document') {
            serverMoveDoc = {
              ...serverMoveDoc,
              folderId: MOVE_RACE_ARCHIVE_FOLDER.id,
              folder: MOVE_RACE_ARCHIVE_FOLDER.name,
            }
            holdCopyReload = true
            await new Promise<void>((_resolve, reject) => {
              rejectCopyMove = reject
            })
          }
          if (payload.action === 'save' || payload.action === 'apply_ops') {
            await new Promise<void>((resolve) => {
              resolveCopySave = resolve
            })
          }
          return new Response(
            JSON.stringify({
              ok: true,
              slug: payload.slug,
              folderPath: payload.folderPath ?? '',
              source: payload.source,
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
      }
      return originalFetch(input, init)
    }
    setReady(true)
    return () => {
      rejectCopyMove?.(new Error('unmounted'))
      rejectCopyMove = null
      resolveCopyReload?.()
      resolveCopyReload = null
      resolveCopySave?.()
      resolveCopySave = null
      window.fetch = originalFetch
    }
  }, [])

  if (!ready) return null
  return <XDriveWorkspace {...args} />
}

/**
 * Verifies that a template copy created while a move is pending survives the move's error reload, stays visible before its first save finishes, and is marked saved only after that save.
 *
 * @summary Pending first save survives reload and upserts on completion
 */
export const PendingFirstSaveSurvivesReload: Story = {
  name: 'Document · Pending First Save Survives Reload',
  args: {
    initialTheme: 'dark',
    initialNav: 'drive',
    initialActiveTabId: 'home',
    initialDocs: [MOVE_RACE_DOC, STENCIL_TEMPLATE_DOC],
    initialAiSidebarOpen: false,
    syncWithServer: true,
  },
  render: (args) => <PendingFirstSaveReloadHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sidebarNav = canvas.getByRole('navigation', {
      name: 'Primary Workspace Navigation',
    })
    const sidebarContainer = sidebarNav.parentElement
    expect(sidebarContainer).not.toBeNull()
    await expect(
      await within(sidebarContainer!).findByRole('link', { name: 'Archive' }),
    ).toBeVisible()

    const pinnedLink = await within(sidebarContainer!).findByRole('link', {
      name: 'Move Race Doc',
    })
    await userEvent.pointer({ keys: '[MouseRight]', target: pinnedLink })
    const menu = await canvas.findByRole('menu', {
      name: 'Actions for Move Race Doc',
    })
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Move to folder…' }),
    )
    const dialog = await canvas.findByRole('dialog', {
      name: 'Move file to folder',
    })
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Archive' }),
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Move here' }),
    )
    await waitFor(() => expect(rejectCopyMove).not.toBeNull())

    await userEvent.click(canvas.getByRole('button', { name: 'New' }))
    const createMenu = await canvas.findByRole('menu', {
      name: 'Create new app or folder',
    })
    await userEvent.click(
      within(createMenu).getByRole('menuitem', { name: 'Stencil Note' }),
    )
    await expect(await canvas.findByText('stencil-note.mrbl')).toBeVisible()
    expect(
      recordedCopyPosts.filter(
        (post) => post.action === 'save' || post.action === 'apply_ops',
      ),
    ).toHaveLength(0)

    rejectCopyMove?.(new TypeError('Failed to fetch'))
    rejectCopyMove = null
    await waitFor(() => expect(resolveCopyReload).not.toBeNull())
    expect(canvas.getByText('stencil-note.mrbl')).toBeVisible()

    resolveCopyReload?.()
    resolveCopyReload = null
    await waitFor(() => expect(resolveCopySave).not.toBeNull())
    expect(canvas.getByText('stencil-note.mrbl')).toBeVisible()
    expect(canvas.getByTitle('Saving')).toBeVisible()
    expect(canvas.queryByTitle('Saved')).toBeNull()

    resolveCopySave?.()
    resolveCopySave = null

    await waitFor(() => expect(canvas.getByTitle('Saved')).toBeVisible())
    expect(canvas.getByText('stencil-note.mrbl')).toBeVisible()
    const savePosts = recordedCopyPosts.filter(
      (post) => post.action === 'save' || post.action === 'apply_ops',
    )
    expect(savePosts).toHaveLength(1)
    expect(savePosts[0]?.slug).toBe('stencil-note')
    expect(JSON.stringify(savePosts[0])).toContain('Stencil Note')
  },
}

const TRASH_RELOAD_DOC: MarbleDocumentFile = {
  ...INITIAL_WORKSPACE_DOCS[2],
  id: 'doc-trash-reload',
  slug: 'trash-reload-doc',
  fileName: 'trash-reload-doc.mrbl',
  title: 'Trash Reload Doc',
  category: 'document',
  isTemplate: false,
  isEvergreen: false,
  starred: false,
  pinned: true,
  folder: 'My Drive',
  folderId: null,
  trashedAt: null,
  syncState: 'saved',
}

let trashReloadFailAction: 'trash' | 'restore' | 'delete' | null = 'trash'
let resolveTrashErrorReload: (() => void) | null = null
let recordedTrashPosts: RecordedMarblePost[] = []

function TrashRestoreDeleteReloadHarness(
  args: ComponentProps<typeof XDriveWorkspace>,
) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    recordedTrashPosts = []
    trashReloadFailAction = 'trash'
    let holdTrashReload = false
    let trashed = false
    let deleted = false
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input)
      if (url.includes('/api/marble')) {
        const method = (init?.method ?? 'GET').toUpperCase()
        if (method === 'GET' && url.includes('action=workspace')) {
          if (holdTrashReload) {
            holdTrashReload = false
            await new Promise<void>((resolve) => {
              resolveTrashErrorReload = resolve
            })
          }
          const docs = deleted
            ? []
            : [
                {
                  ...TRASH_RELOAD_DOC,
                  trashedAt: trashed ? '2026-11-26T00:04:00.000Z' : null,
                },
              ]
          return new Response(JSON.stringify({ ok: true, folders: [], docs }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        if (method === 'POST' && typeof init?.body === 'string') {
          const payload = JSON.parse(init.body) as RecordedMarblePost
          if (payload.action === 'diff' || payload.action === 'doctor') {
            return new Response(JSON.stringify({ ok: false }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            })
          }
          recordedTrashPosts.push(payload)
          const action = payload.action
          if (
            action === 'trash' ||
            action === 'restore' ||
            action === 'delete'
          ) {
            if (trashReloadFailAction === action) {
              trashReloadFailAction = null
              holdTrashReload = true
              throw new TypeError('Failed to fetch')
            }
            if (action === 'trash') trashed = true
            if (action === 'restore') trashed = false
            if (action === 'delete') deleted = true
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
      }
      return originalFetch(input, init)
    }
    setReady(true)
    return () => {
      resolveTrashErrorReload?.()
      resolveTrashErrorReload = null
      window.fetch = originalFetch
    }
  }, [])

  if (!ready) return null
  return <XDriveWorkspace {...args} />
}

async function releaseTrashErrorReload() {
  await waitFor(() => expect(resolveTrashErrorReload).not.toBeNull())
  const release = resolveTrashErrorReload
  resolveTrashErrorReload = null
  release?.()
}

/**
 * Verifies that a lost trash, restore, or delete response reloads server truth instead of keeping a change the server rejected.
 *
 * @summary Trash, restore, and delete reload after a lost response
 */
export const TrashRestoreDeleteReloadOnError: Story = {
  name: 'Drive · Trash Restore Delete Reload On Error',
  args: {
    initialTheme: 'dark',
    initialNav: 'drive',
    initialActiveTabId: 'home',
    initialDocs: [TRASH_RELOAD_DOC],
    initialAiSidebarOpen: false,
    syncWithServer: true,
  },
  render: (args) => <TrashRestoreDeleteReloadHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sidebarNav = canvas.getByRole('navigation', {
      name: 'Primary Workspace Navigation',
    })
    const sidebarContainer = sidebarNav.parentElement
    expect(sidebarContainer).not.toBeNull()

    const trashFromSidebar = async () => {
      const pinnedLink = await within(sidebarContainer!).findByRole('link', {
        name: 'Trash Reload Doc',
      })
      await userEvent.pointer({ keys: '[MouseRight]', target: pinnedLink })
      const pinnedMenu = await canvas.findByRole('menu', {
        name: 'Actions for Trash Reload Doc',
      })
      await userEvent.click(
        within(pinnedMenu).getByRole('menuitem', { name: 'Move to trash' }),
      )
    }

    await trashFromSidebar()
    await releaseTrashErrorReload()
    await expect(
      await within(sidebarContainer!).findByRole('link', {
        name: 'Trash Reload Doc',
      }),
    ).toBeVisible()
    expect(recordedTrashPosts.some((post) => post.action === 'trash')).toBe(
      true,
    )

    trashReloadFailAction = null
    await trashFromSidebar()
    await waitFor(() =>
      expect(
        within(sidebarContainer!).queryByRole('link', {
          name: 'Trash Reload Doc',
        }),
      ).toBeNull(),
    )

    await userEvent.click(
      within(sidebarNav).getByRole('link', { name: /^Trash/ }),
    )
    await expect(await canvas.findByText('trash-reload-doc.mrbl')).toBeVisible()

    trashReloadFailAction = 'restore'
    await userEvent.click(
      canvas.getByRole('button', { name: 'Restore Trash Reload Doc' }),
    )
    await releaseTrashErrorReload()
    await expect(await canvas.findByText('trash-reload-doc.mrbl')).toBeVisible()
    expect(
      within(sidebarContainer!).queryByRole('link', {
        name: 'Trash Reload Doc',
      }),
    ).toBeNull()

    trashReloadFailAction = 'delete'
    await userEvent.click(
      canvas.getByRole('button', { name: 'Delete Trash Reload Doc forever' }),
    )
    const deleteDialog = await canvas.findByRole('dialog', {
      name: 'Delete file forever?',
    })
    await userEvent.click(
      within(deleteDialog).getByRole('button', { name: 'Delete forever' }),
    )
    await releaseTrashErrorReload()
    await expect(await canvas.findByText('trash-reload-doc.mrbl')).toBeVisible()
    expect(recordedTrashPosts.some((post) => post.action === 'delete')).toBe(
      true,
    )
    expect(recordedTrashPosts.some((post) => post.action === 'restore')).toBe(
      true,
    )
  },
}

const LOST_TRASH_UNDO_DOC: MarbleDocumentFile = {
  ...TRASH_RELOAD_DOC,
  id: 'doc-lost-trash-undo',
  slug: 'lost-trash-undo',
  fileName: 'lost-trash-undo.mrbl',
  title: 'Lost Trash Undo',
}

let resolveLostTrashReload: (() => void) | null = null
let resolveLostTrashRestore: (() => void) | null = null
let recordedLostTrashPosts: RecordedMarblePost[] = []

function LostTrashUndoHarness(args: ComponentProps<typeof XDriveWorkspace>) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    recordedLostTrashPosts = []
    let trashed = false
    let holdReload = false
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input)
      if (url.includes('/api/marble')) {
        const method = (init?.method ?? 'GET').toUpperCase()
        if (method === 'GET' && url.includes('action=workspace')) {
          if (holdReload) {
            holdReload = false
            await new Promise<void>((resolve) => {
              resolveLostTrashReload = resolve
            })
          }
          return new Response(
            JSON.stringify({
              ok: true,
              folders: [],
              docs: [
                {
                  ...LOST_TRASH_UNDO_DOC,
                  trashedAt: trashed ? '2026-11-26T00:04:00.000Z' : null,
                },
              ],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        if (method === 'POST' && typeof init?.body === 'string') {
          const payload = JSON.parse(init.body) as RecordedMarblePost
          if (payload.action === 'diff' || payload.action === 'doctor') {
            return new Response(JSON.stringify({ ok: false }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            })
          }
          recordedLostTrashPosts.push(payload)
          if (payload.action === 'trash') {
            trashed = true
            holdReload = true
            throw new TypeError('Failed to fetch')
          }
          if (payload.action === 'restore') {
            await new Promise<void>((resolve) => {
              resolveLostTrashRestore = resolve
            })
            trashed = false
            return new Response(
              JSON.stringify({
                ok: true,
                slug: payload.slug,
                restoredOnDisk: true,
                folderPath: '',
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            )
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
      }
      return originalFetch(input, init)
    }
    setReady(true)
    return () => {
      resolveLostTrashReload?.()
      resolveLostTrashReload = null
      resolveLostTrashRestore?.()
      resolveLostTrashRestore = null
      window.fetch = originalFetch
    }
  }, [])

  if (!ready) return null
  return <XDriveWorkspace {...args} />
}

/**
 * Verifies that Undo during a lost trash response still leaves Trash after the queued restore is confirmed, and that Delete forever stays blocked while that restore is pending.
 *
 * @summary Undo after a lost trash response restores the file
 */
export const UndoDuringLostTrashReload: Story = {
  name: 'Drive · Undo During Lost Trash Reload',
  args: {
    initialTheme: 'dark',
    initialNav: 'drive',
    initialActiveTabId: 'home',
    initialDocs: [LOST_TRASH_UNDO_DOC],
    initialAiSidebarOpen: false,
    syncWithServer: true,
  },
  render: (args) => <LostTrashUndoHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sidebarNav = canvas.getByRole('navigation', {
      name: 'Primary Workspace Navigation',
    })
    const sidebarContainer = sidebarNav.parentElement
    expect(sidebarContainer).not.toBeNull()

    const pinnedLink = await within(sidebarContainer!).findByRole('link', {
      name: 'Lost Trash Undo',
    })
    await userEvent.pointer({ keys: '[MouseRight]', target: pinnedLink })
    const pinnedMenu = await canvas.findByRole('menu', {
      name: 'Actions for Lost Trash Undo',
    })
    await userEvent.click(
      within(pinnedMenu).getByRole('menuitem', { name: 'Move to trash' }),
    )

    await userEvent.click(await canvas.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(resolveLostTrashReload).not.toBeNull())
    const releaseReload = resolveLostTrashReload
    resolveLostTrashReload = null
    releaseReload?.()

    await userEvent.click(
      within(sidebarNav).getByRole('link', { name: /^Trash/ }),
    )
    await expect(await canvas.findByText('lost-trash-undo.mrbl')).toBeVisible()
    expect(
      canvas.getByRole('button', { name: 'Delete Lost Trash Undo forever' }),
    ).toBeDisabled()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Trash actions for Lost Trash Undo' }),
    )
    const trashMenu = await canvas.findByRole('menu', {
      name: 'Trash actions for Lost Trash Undo',
    })
    expect(
      within(trashMenu).queryByRole('menuitem', { name: 'Delete forever' }),
    ).toBeNull()
    expect(
      within(trashMenu).getByRole('menuitem', { name: 'Restore' }),
    ).toBeVisible()
    expect(
      recordedLostTrashPosts.some((post) => post.action === 'delete'),
    ).toBe(false)

    await waitFor(() => expect(resolveLostTrashRestore).not.toBeNull())
    const releaseRestore = resolveLostTrashRestore
    resolveLostTrashRestore = null
    releaseRestore?.()

    await waitFor(() =>
      expect(canvas.queryByText('lost-trash-undo.mrbl')).toBeNull(),
    )
    await expect(
      await within(sidebarContainer!).findByRole('link', {
        name: 'Lost Trash Undo',
      }),
    ).toBeVisible()
    expect(
      recordedLostTrashPosts
        .map((post) => post.action)
        .filter(
          (action) =>
            action === 'trash' || action === 'restore' || action === 'delete',
        ),
    ).toEqual(['trash', 'restore'])
    expect(
      canvas.queryByRole('button', { name: 'Delete Lost Trash Undo forever' }),
    ).toBeNull()
  },
}

const LIFECYCLE_GATE_SOURCE =
  '<!doctype html><html lang="en" data-marble="1"><head><meta charset="utf-8"><title>Lifecycle Gate</title></head><body><main><h1 data-marble-id="h1" data-marble-editable>Gate Body</h1></main></body></html>'

const LIFECYCLE_GATE_DOC: MarbleDocumentFile = {
  ...TRASH_RELOAD_DOC,
  id: 'doc-lifecycle-gate',
  slug: 'lifecycle-gate',
  fileName: 'lifecycle-gate.mrbl',
  title: 'Lifecycle Gate',
  source: LIFECYCLE_GATE_SOURCE,
}

const PENDING_RESTORE_DOC: MarbleDocumentFile = {
  ...TRASH_RELOAD_DOC,
  id: 'doc-pending-restore',
  slug: 'pending-restore',
  fileName: 'pending-restore.mrbl',
  title: 'Pending Restore',
  source: LIFECYCLE_GATE_SOURCE,
  trashedAt: '2026-11-26T00:04:00.000Z',
}

const IDLE_TRASH_DOC: MarbleDocumentFile = {
  ...TRASH_RELOAD_DOC,
  id: 'doc-idle-trash',
  slug: 'idle-trash',
  fileName: 'idle-trash.mrbl',
  title: 'Idle Trash',
  source: LIFECYCLE_GATE_SOURCE,
  trashedAt: '2026-11-26T00:04:00.000Z',
}

let resolveLifecycleTrash: (() => void) | null = null
let recordedLifecycleTrashPosts: RecordedMarblePost[] = []

function PendingTrashBlocksSaveHarness(
  args: ComponentProps<typeof XDriveWorkspace>,
) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    recordedLifecycleTrashPosts = []
    let trashed = false
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input)
      if (url.includes('/api/marble')) {
        const method = (init?.method ?? 'GET').toUpperCase()
        if (method === 'GET' && url.includes('action=workspace')) {
          return new Response(
            JSON.stringify({
              ok: true,
              folders: [],
              docs: [
                {
                  ...LIFECYCLE_GATE_DOC,
                  trashedAt: trashed ? '2026-11-26T00:05:00.000Z' : null,
                },
              ],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        if (method === 'POST' && typeof init?.body === 'string') {
          const payload = JSON.parse(init.body) as RecordedMarblePost
          if (payload.action === 'diff' || payload.action === 'doctor') {
            return new Response(JSON.stringify({ ok: false }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            })
          }
          recordedLifecycleTrashPosts.push(payload)
          if (payload.action === 'trash') {
            await new Promise<void>((resolve) => {
              resolveLifecycleTrash = resolve
            })
            trashed = true
            return new Response(
              JSON.stringify({
                ok: true,
                slug: payload.slug,
                trashedAt: '2026-11-26T00:05:00.000Z',
                purgeAt: '2026-12-26T00:05:00.000Z',
                existedOnDisk: true,
                retentionDays: 30,
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            )
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
      }
      return originalFetch(input, init)
    }
    setReady(true)
    return () => {
      resolveLifecycleTrash?.()
      resolveLifecycleTrash = null
      window.fetch = originalFetch
    }
  }, [])

  if (!ready) return null
  return <XDriveWorkspace {...args} />
}

/**
 * Verifies that a save queued behind a pending trash is not sent, so the server cannot recreate the file at the old path.
 *
 * @summary Pending trash blocks edits and queued saves
 */
export const PendingTrashBlocksQueuedSave: Story = {
  name: 'Drive · Pending Trash Blocks Queued Save',
  args: {
    initialTheme: 'dark',
    initialNav: 'drive',
    initialActiveTabId: 'doc-lifecycle-gate',
    initialOpenDocIds: ['doc-lifecycle-gate'],
    initialDocs: [LIFECYCLE_GATE_DOC],
    initialMode: 'source',
    initialAiSidebarOpen: false,
    syncWithServer: true,
  },
  render: (args) => <PendingTrashBlocksSaveHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sourceTextarea = await canvas.findByLabelText<HTMLTextAreaElement>(
      'Marble HTML5 source',
    )
    await waitFor(() => expect(sourceTextarea.value).toContain('Gate Body'))

    await userEvent.click(canvas.getByRole('button', { name: 'Move to trash' }))
    await waitFor(() => expect(resolveLifecycleTrash).not.toBeNull())

    const start = sourceTextarea.value.indexOf('Gate Body')
    expect(start).toBeGreaterThan(-1)
    sourceTextarea.focus()
    await userEvent.type(sourceTextarea, 'Queued Save Body', {
      initialSelectionStart: start,
      initialSelectionEnd: start + 'Gate Body'.length,
    })
    await userEvent.click(canvas.getByRole('button', { name: 'Apply' }))
    await expect(
      await canvas.findByText(
        'Wait for trash to finish before editing this file.',
      ),
    ).toBeVisible()
    expect(
      recordedLifecycleTrashPosts.filter(
        (post) => post.action === 'save' || post.action === 'apply_ops',
      ),
    ).toEqual([])
    expect(
      recordedLifecycleTrashPosts.filter((post) => post.action === 'trash'),
    ).toHaveLength(1)

    const releaseTrash = resolveLifecycleTrash
    resolveLifecycleTrash = null
    releaseTrash?.()

    const sidebarNav = canvas.getByRole('navigation', {
      name: 'Primary Workspace Navigation',
    })
    await userEvent.click(
      within(sidebarNav).getByRole('link', { name: /^Trash/ }),
    )
    await expect(await canvas.findByText('lifecycle-gate.mrbl')).toBeVisible()
    expect(canvas.queryAllByText('lifecycle-gate.mrbl')).toHaveLength(1)
    expect(
      recordedLifecycleTrashPosts.filter(
        (post) => post.action === 'save' || post.action === 'apply_ops',
      ),
    ).toEqual([])
  },
}

let resolveLifecycleRestore: (() => void) | null = null
let recordedLifecycleEmptyPosts: RecordedMarblePost[] = []

function PendingRestoreBlocksEmptyHarness(
  args: ComponentProps<typeof XDriveWorkspace>,
) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    recordedLifecycleEmptyPosts = []
    let restored = false
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input)
      if (url.includes('/api/marble')) {
        const method = (init?.method ?? 'GET').toUpperCase()
        if (method === 'GET' && url.includes('action=workspace')) {
          return new Response(
            JSON.stringify({
              ok: true,
              folders: [],
              docs: [
                {
                  ...PENDING_RESTORE_DOC,
                  trashedAt: restored ? null : PENDING_RESTORE_DOC.trashedAt,
                },
                IDLE_TRASH_DOC,
              ],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        if (method === 'POST' && typeof init?.body === 'string') {
          const payload = JSON.parse(init.body) as RecordedMarblePost
          if (payload.action === 'diff' || payload.action === 'doctor') {
            return new Response(JSON.stringify({ ok: false }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            })
          }
          recordedLifecycleEmptyPosts.push(payload)
          if (payload.action === 'restore') {
            await new Promise<void>((resolve) => {
              resolveLifecycleRestore = resolve
            })
            restored = true
            return new Response(
              JSON.stringify({
                ok: true,
                slug: payload.slug,
                restoredOnDisk: true,
                folderPath: '',
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            )
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
      }
      return originalFetch(input, init)
    }
    setReady(true)
    return () => {
      resolveLifecycleRestore?.()
      resolveLifecycleRestore = null
      window.fetch = originalFetch
    }
  }, [])

  if (!ready) return null
  return <XDriveWorkspace {...args} />
}

/**
 * Verifies that Empty Trash stays blocked for the whole bin while a restore is pending, including a file the page still shows.
 *
 * @summary Pending restore blocks emptying Trash
 */
export const PendingRestoreBlocksEmptyTrash: Story = {
  name: 'Drive · Pending Restore Blocks Empty Trash',
  args: {
    initialTheme: 'dark',
    initialNav: 'trash',
    initialActiveTabId: 'home',
    initialDocs: [PENDING_RESTORE_DOC, IDLE_TRASH_DOC],
    initialTrashedDocIds: ['doc-pending-restore', 'doc-idle-trash'],
    initialAiSidebarOpen: false,
    syncWithServer: true,
  },
  render: (args) => <PendingRestoreBlocksEmptyHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Restore Pending Restore' }),
    )
    await waitFor(() => expect(resolveLifecycleRestore).not.toBeNull())

    expect(canvas.getByRole('button', { name: 'Empty trash' })).toBeDisabled()
    expect(
      canvas.getByRole('button', { name: 'Delete Pending Restore forever' }),
    ).toBeDisabled()
    expect(
      canvas.getByRole('button', { name: 'Delete Idle Trash forever' }),
    ).toBeEnabled()
    expect(
      recordedLifecycleEmptyPosts.some((post) => post.action === 'empty_trash'),
    ).toBe(false)
    expect(
      recordedLifecycleEmptyPosts.filter((post) => post.action === 'restore'),
    ).toHaveLength(1)

    const releaseRestore = resolveLifecycleRestore
    resolveLifecycleRestore = null
    releaseRestore?.()
    await waitFor(() =>
      expect(canvas.queryByText('pending-restore.mrbl')).toBeNull(),
    )
    expect(canvas.getByRole('button', { name: 'Empty trash' })).toBeEnabled()
    expect(canvas.getByText('idle-trash.mrbl')).toBeVisible()
  },
}

const CHAT_UNDO_EDITED_SOURCE = LIFECYCLE_GATE_SOURCE.replace(
  'Gate Body',
  'Chat Edit Body',
)

const CHAT_UNDO_GATE_DOC: MarbleDocumentFile = {
  ...LIFECYCLE_GATE_DOC,
  id: 'doc-chat-undo-gate',
  slug: 'chat-undo-gate',
  fileName: 'chat-undo-gate.mrbl',
  title: 'Chat Undo Gate',
}

const CHAT_UNDO_THREAD: DriveChatThread = {
  id: 'chat-thread-undo-gate',
  title: 'Edit undo thread',
  createdAt: '2026-11-26T00:00:00.000Z',
  updatedAt: '2026-11-26T00:05:00.000Z',
  modelId: 'claude-sonnet-4-6',
  reasoningEffort: 'medium',
  mode: 'review',
  messages: [
    {
      id: 'msg-undo-user',
      role: 'user',
      content: 'Edit the gate document',
      createdAt: '2026-11-26T00:04:00.000Z',
    },
    {
      id: 'msg-undo-assistant',
      role: 'assistant',
      content: 'Proposed an edit.',
      createdAt: '2026-11-26T00:05:00.000Z',
      actions: [
        {
          id: 'act-edit-undo-gate',
          kind: 'edit_document',
          label: 'Edit document',
          summary: 'Replace the gate body',
          status: 'proposed',
          docId: CHAT_UNDO_GATE_DOC.id,
          docTitle: CHAT_UNDO_GATE_DOC.title,
          fileName: CHAT_UNDO_GATE_DOC.fileName,
          ops: [],
          replacementSource: CHAT_UNDO_EDITED_SOURCE,
        },
      ],
    },
  ],
}

let resolveChatUndoTemplate: (() => void) | null = null
let recordedChatUndoPosts: RecordedMarblePost[] = []

function ChatUndoDuringTemplateHarness(
  args: ComponentProps<typeof XDriveWorkspace>,
) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    recordedChatUndoPosts = []
    try {
      window.localStorage.removeItem('xdrive.drive-chat.threads.v1')
      window.localStorage.removeItem('xdrive-drive-chat-threads')
    } catch {
      // ignore storage errors
    }
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input)
      const method = (init?.method ?? 'GET').toUpperCase()
      if (url.includes('/api/drive-chat/threads')) {
        if (method === 'GET' && !url.includes('/api/drive-chat/threads/')) {
          return new Response(
            JSON.stringify({ ok: true, threads: [CHAT_UNDO_THREAD] }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.includes('/api/marble')) {
        if (method === 'GET' && url.includes('action=workspace')) {
          return new Response(
            JSON.stringify({
              ok: true,
              folders: [],
              docs: [CHAT_UNDO_GATE_DOC],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        if (method === 'POST' && typeof init?.body === 'string') {
          const payload = JSON.parse(init.body) as RecordedMarblePost
          if (payload.action === 'diff' || payload.action === 'doctor') {
            return new Response(JSON.stringify({ ok: false }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            })
          }
          recordedChatUndoPosts.push(payload)
          if (payload.action === 'save_as_template') {
            await new Promise<void>((resolve) => {
              resolveChatUndoTemplate = resolve
            })
            return new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            })
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
      }
      return originalFetch(input, init)
    }
    setReady(true)
    return () => {
      resolveChatUndoTemplate?.()
      resolveChatUndoTemplate = null
      window.fetch = originalFetch
    }
  }, [])

  if (!ready) return null
  return <XDriveWorkspace {...args} />
}

/**
 * Verifies that Drive Chat edit Undo leaves the source unchanged and stays available while save-as-template is pending.
 *
 * @summary Chat edit Undo waits while save-as-template is pending
 */
export const ChatUndoWaitsDuringSaveAsTemplate: Story = {
  name: 'Drive Chat · Undo Waits During Save As Template',
  args: {
    initialTheme: 'dark',
    initialNav: 'drive',
    initialActiveTabId: 'doc-chat-undo-gate',
    initialOpenDocIds: ['doc-chat-undo-gate'],
    initialDocs: [CHAT_UNDO_GATE_DOC],
    initialMode: 'source',
    initialAiSidebarOpen: false,
    syncWithServer: true,
  },
  render: (args) => <ChatUndoDuringTemplateHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const openChat = async () => {
      await userEvent.click(canvas.getAllByRole('link', { name: 'Chat' })[0])
    }
    const openDoc = async () => {
      await userEvent.click(canvas.getAllByRole('link', { name: 'Drive' })[0])
      const docLinks = await canvas.findAllByRole('link', {
        name: 'Chat Undo Gate',
      })
      await userEvent.click(docLinks[0])
    }

    const sourceTextarea = await canvas.findByLabelText<HTMLTextAreaElement>(
      'Marble HTML5 source',
    )
    await waitFor(() => expect(sourceTextarea.value).toContain('Gate Body'))

    await openChat()
    await userEvent.click(await canvas.findByRole('button', { name: 'Apply' }))
    await waitFor(() =>
      expect(
        recordedChatUndoPosts.filter(
          (post) => post.action === 'save' || post.action === 'apply_ops',
        ),
      ).toHaveLength(1),
    )
    await expect(
      await canvas.findByRole('button', { name: 'Undo' }),
    ).toBeVisible()

    await openDoc()
    const editedTextarea = await canvas.findByLabelText<HTMLTextAreaElement>(
      'Marble HTML5 source',
    )
    await waitFor(() =>
      expect(editedTextarea.value).toContain('Chat Edit Body'),
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Save as template' }),
    )
    const saveTplDialog = await canvas.findByRole('dialog', {
      name: 'Save as template',
    })
    const tplNameInput = within(saveTplDialog).getByLabelText('Template name')
    await userEvent.clear(tplNameInput)
    await userEvent.type(tplNameInput, 'Held Gate Template')
    await userEvent.click(
      within(saveTplDialog).getByRole('button', { name: 'Save template' }),
    )
    await waitFor(() => expect(resolveChatUndoTemplate).not.toBeNull())

    await openChat()
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }))
    expect(canvas.getByRole('button', { name: 'Undo' })).toBeVisible()
    expect(canvas.queryByText('Undone')).toBeNull()
    expect(
      recordedChatUndoPosts.filter(
        (post) => post.action === 'save' || post.action === 'apply_ops',
      ),
    ).toHaveLength(1)

    await openDoc()
    const unchangedTextarea = await canvas.findByLabelText<HTMLTextAreaElement>(
      'Marble HTML5 source',
    )
    await waitFor(() =>
      expect(unchangedTextarea.value).toContain('Chat Edit Body'),
    )
    expect(unchangedTextarea.value).not.toContain('Gate Body')
    await expect(
      await canvas.findByText(
        'Wait for save as template to finish before editing this file.',
      ),
    ).toBeVisible()

    const releaseTemplate = resolveChatUndoTemplate
    resolveChatUndoTemplate = null
    releaseTemplate?.()
    await waitFor(() =>
      expect(unchangedTextarea.value).toContain('Chat Edit Body'),
    )
    expect(
      recordedChatUndoPosts.filter(
        (post) => post.action === 'save' || post.action === 'apply_ops',
      ),
    ).toHaveLength(1)
  },
}

const EMPTY_LOCK_DOC: MarbleDocumentFile = {
  ...IDLE_TRASH_DOC,
  id: 'doc-empty-lock',
  slug: 'empty-lock',
  fileName: 'empty-lock.mrbl',
  title: 'Empty Lock',
}

let resolveEmptyLock: (() => void) | null = null
let recordedEmptyLockPosts: RecordedMarblePost[] = []

function EmptyTrashLockHarness(args: ComponentProps<typeof XDriveWorkspace>) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    recordedEmptyLockPosts = []
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input)
      if (url.includes('/api/marble')) {
        const method = (init?.method ?? 'GET').toUpperCase()
        if (method === 'GET' && url.includes('action=workspace')) {
          return new Response(
            JSON.stringify({
              ok: true,
              folders: [],
              docs: [EMPTY_LOCK_DOC],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        if (method === 'POST' && typeof init?.body === 'string') {
          const payload = JSON.parse(init.body) as RecordedMarblePost
          if (payload.action === 'diff' || payload.action === 'doctor') {
            return new Response(JSON.stringify({ ok: false }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            })
          }
          recordedEmptyLockPosts.push(payload)
          if (payload.action === 'empty_trash') {
            await new Promise<void>((resolve) => {
              resolveEmptyLock = resolve
            })
            return new Response(
              JSON.stringify({ ok: true, deletedCount: 0, deletedIds: [] }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            )
          }
          if (payload.action === 'restore') {
            return new Response(
              JSON.stringify({
                ok: true,
                slug: payload.slug,
                restoredOnDisk: false,
                folderPath: '',
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            )
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
      }
      return originalFetch(input, init)
    }
    setReady(true)
    return () => {
      resolveEmptyLock?.()
      resolveEmptyLock = null
      window.fetch = originalFetch
    }
  }, [])

  if (!ready) return null
  return <XDriveWorkspace {...args} />
}

/**
 * Verifies that Empty Trash locks Restore until the server replies, and that a restore which did not land on disk stays in Trash.
 *
 * @summary Empty Trash blocks Restore until the deletion finishes
 */
export const EmptyTrashBlocksRestoreUntilReply: Story = {
  name: 'Drive · Empty Trash Blocks Restore Until Reply',
  args: {
    initialTheme: 'dark',
    initialNav: 'trash',
    initialActiveTabId: 'home',
    initialDocs: [EMPTY_LOCK_DOC],
    initialTrashedDocIds: ['doc-empty-lock'],
    initialAiSidebarOpen: false,
    syncWithServer: true,
  },
  render: (args) => <EmptyTrashLockHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('empty-lock.mrbl')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Empty trash' }))
    const emptyDialog = await canvas.findByRole('dialog', {
      name: 'Empty trash forever?',
    })
    await userEvent.click(
      within(emptyDialog).getByRole('button', { name: 'Empty trash' }),
    )
    await waitFor(() =>
      expect(
        canvas.getByRole('button', { name: 'Restore Empty Lock' }),
      ).toBeDisabled(),
    )
    expect(
      recordedEmptyLockPosts.some((post) => post.action === 'restore'),
    ).toBe(false)

    const releaseEmpty = resolveEmptyLock
    resolveEmptyLock = null
    releaseEmpty?.()
    await waitFor(() =>
      expect(
        canvas.getByRole('button', { name: 'Restore Empty Lock' }),
      ).toBeEnabled(),
    )
    expect(canvas.getByText('empty-lock.mrbl')).toBeVisible()
    await expect(
      await canvas.findByText('Nothing in Trash was deleted.'),
    ).toBeVisible()

    await userEvent.click(
      canvas.getByRole('button', { name: 'Restore Empty Lock' }),
    )
    await expect(
      await canvas.findByText('Could not restore "Empty Lock".'),
    ).toBeVisible()
    expect(canvas.getByText('empty-lock.mrbl')).toBeVisible()
    expect(canvas.queryByText(/Restored "Empty Lock"/)).toBeNull()
  },
}

/**
 * Verifies that Empty Trash removes the listed files immediately when the workspace is not syncing to the server.
 *
 * @summary Empty Trash removes local rows when sync is off
 */
export const EmptyTrashWithoutSyncRemovesRows: Story = {
  name: 'Drive · Empty Trash Without Sync',
  args: {
    initialTheme: 'dark',
    initialNav: 'trash',
    initialActiveTabId: 'home',
    initialDocs: [IDLE_TRASH_DOC],
    initialTrashedDocIds: ['doc-idle-trash'],
    initialAiSidebarOpen: false,
    syncWithServer: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('idle-trash.mrbl')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Empty trash' }))
    const emptyDialog = await canvas.findByRole('dialog', {
      name: 'Empty trash forever?',
    })
    await userEvent.click(
      within(emptyDialog).getByRole('button', { name: 'Empty trash' }),
    )
    await waitFor(() =>
      expect(canvas.queryByText('idle-trash.mrbl')).toBeNull(),
    )
    await expect(await canvas.findByText('Trash is empty')).toBeVisible()
  },
}

const TEMPLATE_ERROR_DISK_SOURCE = LIFECYCLE_GATE_SOURCE.replace(
  'Gate Body',
  'Disk Body',
)
const TEMPLATE_ERROR_LOCAL_SOURCE = LIFECYCLE_GATE_SOURCE.replace(
  'Gate Body',
  'Local Body',
)

const TEMPLATE_ERROR_DOC: MarbleDocumentFile = {
  ...LIFECYCLE_GATE_DOC,
  id: 'doc-template-error',
  slug: 'template-error',
  fileName: 'template-error.mrbl',
  title: 'Template Error',
  source: TEMPLATE_ERROR_LOCAL_SOURCE,
}

function TemplateSaveErrorHarness(
  args: ComponentProps<typeof XDriveWorkspace>,
) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let failed = false
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input)
      if (url.includes('/api/marble')) {
        const method = (init?.method ?? 'GET').toUpperCase()
        if (method === 'GET' && url.includes('action=workspace')) {
          return new Response(
            JSON.stringify({
              ok: true,
              folders: [],
              docs: [
                {
                  ...TEMPLATE_ERROR_DOC,
                  source: failed
                    ? TEMPLATE_ERROR_DISK_SOURCE
                    : TEMPLATE_ERROR_LOCAL_SOURCE,
                  syncState: 'saved',
                },
              ],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        if (method === 'POST' && typeof init?.body === 'string') {
          const payload = JSON.parse(init.body) as RecordedMarblePost
          if (payload.action === 'diff' || payload.action === 'doctor') {
            return new Response(JSON.stringify({ ok: false }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            })
          }
          if (payload.action === 'save_as_template') {
            failed = true
            return new Response(
              JSON.stringify({ ok: false, error: 'Template save failed' }),
              {
                status: 500,
                headers: { 'content-type': 'application/json' },
              },
            )
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
      }
      return originalFetch(input, init)
    }
    setReady(true)
    return () => {
      window.fetch = originalFetch
    }
  }, [])

  if (!ready) return null
  return <XDriveWorkspace {...args} />
}

/**
 * Verifies that a failed save-as-template clears Saving once the recovered disk source is back on screen.
 *
 * @summary Failed save-as-template settles against the recovered source
 */
export const TemplateSaveErrorSettlesRecoveredSource: Story = {
  name: 'Drive · Failed Save As Template Settles Recovered Source',
  args: {
    initialTheme: 'dark',
    initialNav: 'drive',
    initialActiveTabId: 'doc-template-error',
    initialOpenDocIds: ['doc-template-error'],
    initialDocs: [TEMPLATE_ERROR_DOC],
    initialMode: 'source',
    initialAiSidebarOpen: false,
    syncWithServer: true,
  },
  render: (args) => <TemplateSaveErrorHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sourceTextarea = await canvas.findByLabelText<HTMLTextAreaElement>(
      'Marble HTML5 source',
    )
    await waitFor(() => expect(sourceTextarea.value).toContain('Local Body'))

    await userEvent.click(
      canvas.getByRole('button', { name: 'Save as template' }),
    )
    const saveTplDialog = await canvas.findByRole('dialog', {
      name: 'Save as template',
    })
    const tplNameInput = within(saveTplDialog).getByLabelText('Template name')
    await userEvent.clear(tplNameInput)
    await userEvent.type(tplNameInput, 'Failed Gate Template')
    await userEvent.click(
      within(saveTplDialog).getByRole('button', { name: 'Save template' }),
    )

    const recoveredTextarea = await canvas.findByLabelText<HTMLTextAreaElement>(
      'Marble HTML5 source',
    )
    await waitFor(() => expect(recoveredTextarea.value).toContain('Disk Body'))
    await waitFor(() => expect(canvas.getByTitle('Saved')).toBeVisible())
    expect(canvas.queryByTitle('Saving')).toBeNull()
    expect(recoveredTextarea.value).not.toContain('Local Body')
  },
}

const LOCAL_NAMED_VERSION_DOC: MarbleDocumentFile = {
  ...LIFECYCLE_GATE_DOC,
  id: 'doc-local-history',
  slug: 'local-history',
  fileName: 'local-history.mrbl',
  title: 'Local History',
  source: LIFECYCLE_GATE_SOURCE,
}

/**
 * Naming a version while the workspace is offline stores it in the local timeline.
 *
 * @summary Local mode can name the current version
 */
export const LocalNamedVersion: Story = {
  name: 'Drive · Local Named Version',
  args: {
    initialTheme: 'dark',
    initialNav: 'drive',
    initialActiveTabId: 'doc-local-history',
    initialDocs: [LOCAL_NAMED_VERSION_DOC],
    initialOpenDocIds: ['doc-local-history'],
    initialMode: 'source',
    initialAiSidebarOpen: false,
    syncWithServer: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: 'History' }),
    )
    const history = await canvas.findByRole('region', {
      name: 'Version history for Local History',
    })
    const panel = within(history)
    const nameButtons = panel.getAllByRole('button', {
      name: 'Name current version',
    })
    await userEvent.click(nameButtons[0])
    await userEvent.type(
      panel.getByLabelText('Version label'),
      'Local checkpoint',
    )
    await userEvent.click(panel.getByRole('button', { name: 'Save' }))
    await panel.findByText('Named (1)')
    const labels = panel.getAllByText('Local checkpoint')
    expect(labels.length).toBeGreaterThanOrEqual(1)
    expect(labels[0]).toBeVisible()
  },
}
