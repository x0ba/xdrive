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
