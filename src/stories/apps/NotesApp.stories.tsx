import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { DEFAULT_NOTES_SEED, NotesApp } from '#/components/apps/notes'

const meta = {
  title: 'xDrive Apps/Notes App (Apple Notes)',
  component: NotesApp,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Apple Notes-inspired note-taking application with an information-rich right-click sidebar (pinned/date groups, timestamps, snippets, folder & checklist indicators, lock/pin/duplicate/move/export context actions), a clean formatting toolbar, and full Markdown support (Write, Split, and Interactive Preview modes).',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="h-[680px] w-full overflow-hidden">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NotesApp>

export default meta
type Story = StoryObj<typeof meta>

export const SplitMarkdownMode: Story = {
  args: {
    initialNotes: DEFAULT_NOTES_SEED,
    initialActiveNoteId: 'note-hypothesis',
    initialViewMode: 'split',
    readOnly: false,
  },
}

export const CleanWriteMode: Story = {
  args: {
    initialNotes: DEFAULT_NOTES_SEED,
    initialActiveNoteId: 'note-probes',
    initialViewMode: 'write',
    readOnly: false,
  },
}

export const InteractivePreviewMode: Story = {
  args: {
    initialNotes: DEFAULT_NOTES_SEED,
    initialActiveNoteId: 'note-hypothesis',
    initialViewMode: 'preview',
    readOnly: false,
  },
}

export const LockedNoteState: Story = {
  args: {
    initialNotes: DEFAULT_NOTES_SEED.map((note, idx) =>
      idx === 0 ? { ...note, locked: true } : note,
    ),
    initialActiveNoteId: 'note-hypothesis',
    initialViewMode: 'split',
  },
}
