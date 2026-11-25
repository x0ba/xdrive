import { useEffect, useState } from 'react'
import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import {
  INITIAL_WORKSPACE_DOCS,
  PREDEFINED_MARBLE_TEMPLATES,
  TEMPLATES_FOLDER_NAME,
} from '#/lib/marble'
import type { MarbleDocumentFile } from '#/lib/types'
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

let resolveInFlightRename: (() => void) | null = null

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
    '<!doctype html><html lang="en" data-marble="1"><head><meta charset="utf-8"><title>Rename Race Doc</title></head><body><main data-marble-id="root"><h1 data-marble-id="h1" data-marble-editable>Initial Body</h1></main></body></html>',
}

function RenameInFlightStoryHarness(
  args: ComponentProps<typeof XDriveWorkspace>,
) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
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
          const payload = JSON.parse(init.body) as {
            action?: string
            title?: string
            description?: string
          }
          if (payload.action === 'rename_document') {
            await new Promise<void>((resolve) => {
              resolveInFlightRename = resolve
            })
            const nextTitle = payload.title ?? 'Renamed Doc'
            const staleServerSource = RENAME_RACE_DOC.source.replace(
              '<title>Rename Race Doc</title>',
              `<title>${nextTitle}</title>`,
            )
            return new Response(
              JSON.stringify({
                ok: true,
                id: RENAME_RACE_DOC.id,
                oldSlug: RENAME_RACE_DOC.slug,
                slug: 'renamed-doc',
                fileName: 'renamed-doc.mrbl',
                folderPath: '',
                relPath: 'renamed-doc.mrbl',
                isTemplate: false,
                title: nextTitle,
                description: payload.description ?? '',
                source: staleServerSource,
                updatedAt: '2026-11-25T23:30:00.000Z',
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            )
          }
          if (payload.action === 'diff' || payload.action === 'doctor') {
            return new Response(JSON.stringify({ ok: false }), {
              status: 404,
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
      resolveInFlightRename?.()
      resolveInFlightRename = null
      window.fetch = originalFetch
    }
  }, [])

  if (!ready) return null
  return <XDriveWorkspace {...args} />
}

/**
 * Verifies that local edits made while a rename_document request is in flight are preserved when the server reply resolves.
 *
 * @summary Rename request in flight preserves newer local document edits
 */
export const RenameDocumentPreservesInFlightEdits: Story = {
  name: 'Document · Preserve Edits During In-Flight Rename',
  args: {
    initialTheme: 'dark',
    initialActiveTabId: 'doc-rename-race',
    initialDocs: [RENAME_RACE_DOC],
    initialOpenDocIds: ['doc-rename-race'],
    initialMode: 'source',
    initialAiSidebarOpen: false,
    syncWithServer: true,
  },
  render: (args) => <RenameInFlightStoryHarness {...args} />,
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

    await waitFor(() => expect(resolveInFlightRename).not.toBeNull())
    await waitFor(() =>
      expect(sourceTextarea.value).toContain('<title>Renamed Doc</title>'),
    )

    const bodyStart = sourceTextarea.value.indexOf('Initial Body')
    expect(bodyStart).toBeGreaterThan(-1)
    sourceTextarea.focus()
    await userEvent.type(sourceTextarea, 'Fresh Local Edit', {
      initialSelectionStart: bodyStart,
      initialSelectionEnd: bodyStart + 'Initial Body'.length,
    })
    await userEvent.click(canvas.getByRole('button', { name: 'Apply' }))
    await waitFor(() =>
      expect(sourceTextarea.value).toContain('Fresh Local Edit'),
    )

    // Release the delayed rename_document response containing stale Initial Body.
    resolveInFlightRename?.()
    resolveInFlightRename = null

    await expect(
      await within(sidebarContainer!).findByRole('link', {
        name: 'Renamed Doc',
      }),
    ).toBeVisible()
    await waitFor(() => {
      expect(sourceTextarea.value).toContain('Fresh Local Edit')
      expect(sourceTextarea.value).not.toContain('Initial Body')
    })
  },
}
