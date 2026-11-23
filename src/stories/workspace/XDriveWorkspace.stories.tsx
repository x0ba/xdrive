import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { XDriveWorkspace } from '#/components/workspace'

const meta = {
  title: 'xDrive Workspace/Workspace',
  component: XDriveWorkspace,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof XDriveWorkspace>

export default meta
type Story = StoryObj<typeof meta>

export const DriveFiles: Story = {
  args: {
    initialTheme: 'dark',
    initialNav: 'drive',
    initialActiveTabId: 'home',
    initialAiSidebarOpen: false,
  },
}

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
