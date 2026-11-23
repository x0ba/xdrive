import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { DEFAULT_NOTES_SEED, NotesApp } from './index'

const LOCKED_NOTES_SEED = DEFAULT_NOTES_SEED.map((note, idx) =>
  idx === 0 ? { ...note, locked: true } : note,
)

/**
 * Apple Notes-inspired note-taking application with Markdown write, split, and preview modes.
 *
 * @summary Markdown notes workspace with grouped sidebar and formatting toolbar
 */
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

/**
 * Side-by-side Markdown editor and live rendered preview.
 *
 * @summary Split Markdown write and preview view
 */
export const SplitMarkdownMode: Story = {
  args: {
    initialNotes: DEFAULT_NOTES_SEED,
    initialActiveNoteId: 'note-hypothesis',
    initialViewMode: 'split',
    readOnly: false,
  },
}

/**
 * Distraction-free Markdown authoring view.
 *
 * @summary Focused Markdown writing mode
 */
export const CleanWriteMode: Story = {
  args: {
    initialNotes: DEFAULT_NOTES_SEED,
    initialActiveNoteId: 'note-probes',
    initialViewMode: 'write',
    readOnly: false,
  },
}

/**
 * Interactive rendered preview with checkable task lists and styled Markdown blocks.
 *
 * @summary Interactive Markdown preview mode
 */
export const InteractivePreviewMode: Story = {
  args: {
    initialNotes: DEFAULT_NOTES_SEED,
    initialActiveNoteId: 'note-hypothesis',
    initialViewMode: 'preview',
    readOnly: false,
  },
}

/**
 * Locked note state demonstrating access guard UI in the active editor pane.
 *
 * @summary Locked note state
 */
export const LockedNoteState: Story = {
  args: {
    initialNotes: LOCKED_NOTES_SEED,
    initialActiveNoteId: 'note-hypothesis',
    initialViewMode: 'split',
  },
}
