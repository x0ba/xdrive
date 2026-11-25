import type { Meta, StoryObj } from '@storybook/tanstack-react'
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
 * Default My Drive landing view in dark theme.
 *
 * @summary Drive files browser landing view
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
    initialOpenDocIds: [
      'ws-document-design-system',
      'ws-document-donts-system',
    ],
    initialMode: 'direct',
    initialAiSidebarOpen: true,
  },
}
