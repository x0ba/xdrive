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
  name: 'Drive Files',
  args: {
    initialTheme: 'dark',
    initialNav: 'drive',
    initialActiveTabId: 'home',
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
