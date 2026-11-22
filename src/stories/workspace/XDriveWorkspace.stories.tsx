import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { XDriveWorkspace } from '#/components/workspace'

const meta = {
  title: 'xDrive Workspace/Research Workspace',
  component: XDriveWorkspace,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof XDriveWorkspace>

export default meta
type Story = StoryObj<typeof meta>

export const DriveHomeDefault: Story = {
  name: 'Drive Home · Obsidian Studio',
  args: {
    initialTheme: 'dark',
    initialNav: 'drive',
    initialActiveTabId: 'home',
    initialAiSidebarOpen: false,
  },
}

export const LiveLatexStudioApp: Story = {
  name: 'Live LaTeX Paper & Theorem Studio',
  args: {
    initialTheme: 'dark',
    initialActiveTabId: 'tpl-latex-studio',
    initialOpenDocIds: ['tpl-latex-studio', 'ws-qec-threshold'],
    initialMode: 'direct',
    initialAiSidebarOpen: true,
  },
}

export const LiveMultiNoteNotebookApp: Story = {
  name: 'Live Multi-Note Lab Notebook',
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
    initialOpenDocIds: ['tpl-latex-studio', 'tpl-research-notebook'],
    initialMode: 'sketch',
    initialAiSidebarOpen: true,
    initialSelectedIds: ['sec-abstract'],
  },
}
