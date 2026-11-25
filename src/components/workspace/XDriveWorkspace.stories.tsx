import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { expect, userEvent, within } from 'storybook/test'
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
