import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { expect, fn, userEvent, within } from 'storybook/test'
import type {
  DocumentVersionDetail,
  DocumentVersionSummary,
} from '#/lib/marble/version-history-types'
import { VersionHistoryPanel } from './VersionHistoryPanel'

const NOW_MS = Date.parse('2026-11-28T11:00:00.000Z')

const SRC_V1 = `<!doctype html>
<html lang="en" data-marble="1">
<head><meta charset="utf-8"><title>Lab Notes</title></head>
<body>
  <script type="application/json" data-marble-notes-state="1">${JSON.stringify({
    notebookTitle: 'Lab Notes',
    activeNoteId: 'note-1',
    notes: [
      {
        id: 'note-1',
        title: 'Ablation Sweep',
        folder: 'Lab',
        body: 'Seed list: 4\nDecoder: MWPM v1\nStatus: Baseline run',
      },
    ],
  })}</script>
</body>
</html>`

const SRC_V2 = `<!doctype html>
<html lang="en" data-marble="1">
<head><meta charset="utf-8"><title>Lab Notes</title></head>
<body>
  <script type="application/json" data-marble-notes-state="1">${JSON.stringify({
    notebookTitle: 'Lab Notes',
    activeNoteId: 'note-1',
    notes: [
      {
        id: 'note-1',
        title: 'Ablation Sweep',
        folder: 'Lab',
        body: 'Seed list: 8\nDecoder: MWPM v1\nStatus: Expanded sweep',
      },
    ],
  })}</script>
</body>
</html>`

const SRC_CURRENT = `<!doctype html>
<html lang="en" data-marble="1">
<head><meta charset="utf-8"><title>Lab Notes</title></head>
<body>
  <script type="application/json" data-marble-notes-state="1">${JSON.stringify({
    notebookTitle: 'Lab Notes',
    activeNoteId: 'note-1',
    notes: [
      {
        id: 'note-1',
        title: 'Ablation Sweep',
        folder: 'Lab',
        body: 'Seed list: 8\nDecoder: Sparse Blossom v2\nStatus: Ready for paper',
      },
    ],
  })}</script>
</body>
</html>`

const VERSIONS: DocumentVersionSummary[] = [
  {
    id: 'v-3',
    docId: 'doc-lab-notes',
    slug: 'lab-notes',
    title: 'Lab Notes',
    category: 'notebook',
    kind: 'auto',
    trigger: 'pre-restore',
    label: 'Before restoring "Initial baseline"',
    createdAt: '2026-11-28T10:45:00.000Z',
    contentHash: 'h3',
    byteSize: SRC_V2.length,
    nodeCount: 3,
    author: 'You',
  },
  {
    id: 'v-2',
    docId: 'doc-lab-notes',
    slug: 'lab-notes',
    title: 'Lab Notes',
    category: 'notebook',
    kind: 'named',
    trigger: 'manual',
    label: 'Expanded seed list',
    createdAt: '2026-11-28T09:50:00.000Z',
    contentHash: 'h2',
    byteSize: SRC_V2.length,
    nodeCount: 3,
    author: 'You',
  },
  {
    id: 'v-1',
    docId: 'doc-lab-notes',
    slug: 'lab-notes',
    title: 'Lab Notes',
    category: 'notebook',
    kind: 'auto',
    trigger: 'autosave',
    createdAt: '2026-11-28T08:15:00.000Z',
    contentHash: 'h1',
    byteSize: SRC_V1.length,
    nodeCount: 3,
    author: 'You',
  },
]

const LOADED: Record<string, DocumentVersionDetail> = {
  'v-3': { ...VERSIONS[0], source: SRC_V2 },
  'v-2': { ...VERSIONS[1], source: SRC_V2 },
  'v-1': { ...VERSIONS[2], source: SRC_V1 },
}

/**
 * Full split-pane version history panel with timeline filtering, diff preview, named snapshot creation, and restore flow.
 *
 * @summary Per-document version history panel
 */
const meta = {
  title: 'xDrive Version History/Version History Panel',
  component: VersionHistoryPanel,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="h-[620px] w-full bg-[var(--xd-canvas)]">
        <Story />
      </div>
    ),
  ],
  args: {
    docId: 'doc-lab-notes',
    fileName: 'lab-notes.mrbl',
    title: 'Lab Notes',
    currentSource: SRC_CURRENT,
    versions: VERSIONS,
    initialSelectedVersionId: 'v-1',
    initialLoadedVersions: LOADED,
    nowMs: NOW_MS,
    onClose: fn(),
  },
} satisfies Meta<typeof VersionHistoryPanel>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Populated timeline showing auto, named, and pre-restore entries plus filtering and naming workflow.
 *
 * @summary Timeline with mixed versions
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('All (3)')
    await canvas.findByText('Named (1)')

    // Switch to Named filter
    await userEvent.click(canvas.getByRole('button', { name: 'Named (1)' }))
    await canvas.findByText('Expanded seed list')

    // Switch back to All and create a new named version locally
    await userEvent.click(canvas.getByRole('button', { name: 'All (3)' }))
    await userEvent.click(
      canvas.getByRole('button', { name: 'Name current version' }),
    )
    const input = canvas.getByLabelText('Version label')
    await userEvent.type(input, 'Pre-submission freeze')
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))

    await canvas.findByText('All (4)')
    await canvas.findByText('Named (2)')
    const namedMatches = await canvas.findAllByText('Pre-submission freeze')
    expect(namedMatches.length).toBeGreaterThanOrEqual(1)
  },
}

/**
 * Clicking Restore opens the confirmation dialog and delegates to onRestoreVersion.
 *
 * @summary Restore flow confirmation
 */
export const RestoreFlow: Story = {
  args: {
    onRestoreVersion: fn(async () => {}),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Restore this version' }),
    )
    await canvas.findByRole('dialog', { name: 'Restore this version?' })
    await userEvent.click(
      canvas.getByRole('button', { name: 'Restore version' }),
    )
    expect(args.onRestoreVersion).toHaveBeenCalledTimes(1)
  },
}

/**
 * Empty state before any auto or named snapshot has been captured.
 *
 * @summary Empty history state
 */
export const Empty: Story = {
  args: {
    versions: [],
    initialSelectedVersionId: null,
    initialLoadedVersions: {},
  },
}
