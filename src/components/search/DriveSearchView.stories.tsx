import { useMemo, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import type { DriveChatThread } from '#/lib/ai/drive-chat-types'
import { whiteboardStateScript } from '#/lib/marble/whiteboard-document'
import { buildClientSearchIndex } from '#/lib/search'
import type {
  SearchDriveOptions,
  SearchDriveResponse,
  SearchFilterType,
} from '#/lib/search'
import type { DriveFolder, MarbleDocumentFile } from '#/lib/types'
import { DriveSearchView } from './DriveSearchView'

const DEFAULT_SHARE = {
  isPublicLinkEnabled: false,
  publicLinkUrl: 'https://xdrive.app/d/demo',
  publicPermission: 'view_only' as const,
  allowDuplication: true,
  sharedAiDailyLimit: 40,
  sharedAiUsedToday: 0,
  collaborators: [],
}

const DEMO_FOLDERS: DriveFolder[] = [
  {
    id: 'folder-papers',
    name: 'Papers',
    parentId: null,
    color: 'accent',
    createdAt: '2026-11-10T09:00:00.000Z',
    updatedAt: '2026-11-26T10:00:00.000Z',
  },
  {
    id: 'folder-surface',
    name: 'Surface Codes',
    parentId: 'folder-papers',
    color: 'default',
    createdAt: '2026-11-12T09:00:00.000Z',
    updatedAt: '2026-11-27T11:00:00.000Z',
  },
]

const DEMO_WHITEBOARD_SNAPSHOT = {
  document: {
    store: {
      'document:document': { id: 'document:document', typeName: 'document' },
      'page:page': { id: 'page:page', typeName: 'page', name: 'Page 1' },
      'shape:node-1': {
        id: 'shape:node-1',
        typeName: 'shape',
        type: 'note',
        index: 'a1',
        props: {
          richText: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Rotated surface code parity check lattice and syndrome router.',
                  },
                ],
              },
            ],
          },
        },
      },
    },
  },
  session: { version: 0 },
}

const DEMO_DOCS: MarbleDocumentFile[] = [
  {
    id: 'doc-surface-spec',
    slug: 'logical-memory-spec',
    fileName: 'logical-memory-spec.mrbl',
    title: 'Logical Memory Specification',
    description: 'Distance-7 rotated surface code threshold criteria.',
    category: 'document',
    isTemplate: false,
    source:
      '<!doctype html><html><body><article data-marble-id="doc-body"><h1>Logical Memory Specification</h1><p>Rotated surface code noise model using PyMatching decoder across distances 3, 5, and 7.</p></article></body></html>',
    nodeCount: 4,
    byteSize: 420,
    version: 2,
    syncState: 'saved',
    createdAt: '2026-11-20T09:00:00.000Z',
    updatedAt: '2026-11-27T14:00:00.000Z',
    createdBy: { name: 'You', initials: 'YO' },
    lastEditedBy: { name: 'You', initials: 'YO' },
    starred: true,
    pinned: false,
    tags: ['qec', 'threshold'],
    folder: 'Surface Codes',
    folderId: 'folder-surface',
    trashedAt: null,
    share: DEFAULT_SHARE,
    checkpoints: [],
    intentHistory: [],
  },
  {
    id: 'wb-decoder-flow',
    slug: 'decoder-flow-board',
    fileName: 'decoder-flow-board.mrbl',
    title: 'Decoder Architecture Board',
    description: 'Whiteboard sketch for syndrome matching.',
    category: 'whiteboard',
    isTemplate: false,
    source: `<!doctype html><html><body>${whiteboardStateScript(DEMO_WHITEBOARD_SNAPSHOT)}</body></html>`,
    nodeCount: 2,
    byteSize: 640,
    version: 1,
    syncState: 'saved',
    createdAt: '2026-11-22T09:00:00.000Z',
    updatedAt: '2026-11-27T16:30:00.000Z',
    createdBy: { name: 'You', initials: 'YO' },
    lastEditedBy: { name: 'You', initials: 'YO' },
    starred: false,
    pinned: false,
    tags: ['whiteboard', 'architecture'],
    folder: 'Papers',
    folderId: 'folder-papers',
    trashedAt: null,
    share: DEFAULT_SHARE,
    checkpoints: [],
    intentHistory: [],
  },
  {
    id: 'doc-trashed-ablation',
    slug: 'old-surface-ablation',
    fileName: 'old-surface-ablation.mrbl',
    title: 'Archived Surface Ablation',
    description: 'Superseded distance-5 run.',
    category: 'notebook',
    isTemplate: false,
    source:
      '<!doctype html><html><body><p data-marble-id="p1">Earlier surface code baseline with depolarizing rate 0.5%.</p></body></html>',
    nodeCount: 1,
    byteSize: 210,
    version: 1,
    syncState: 'saved',
    createdAt: '2026-11-12T09:00:00.000Z',
    updatedAt: '2026-11-18T12:00:00.000Z',
    createdBy: { name: 'You', initials: 'YO' },
    lastEditedBy: { name: 'You', initials: 'YO' },
    starred: false,
    pinned: false,
    tags: ['ablation'],
    folder: 'Papers',
    folderId: 'folder-papers',
    trashedAt: '2026-11-24T12:00:00.000Z',
    share: DEFAULT_SHARE,
    checkpoints: [],
    intentHistory: [],
  },
]

const DEMO_CHATS: DriveChatThread[] = [
  {
    id: 'chat-surface-review',
    title: 'Surface Code Threshold Review',
    createdAt: '2026-11-26T08:00:00.000Z',
    updatedAt: '2026-11-27T18:00:00.000Z',
    modelId: 'antigravity/default',
    reasoningEffort: 'high',
    mode: 'review',
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'Compare the surface code threshold across distances 3 and 7.',
        createdAt: '2026-11-27T17:58:00.000Z',
      },
      {
        id: 'm2',
        role: 'assistant',
        content: 'Logical error drops below 10^-3 at distance 7.',
        createdAt: '2026-11-27T18:00:00.000Z',
      },
    ],
  },
]

const PAGED_DOCS: MarbleDocumentFile[] = Array.from(
  { length: 55 },
  (_, idx) => {
    const num = String(idx + 1).padStart(2, '0')
    const timestamp = new Date(
      Date.UTC(2026, 10, 28, 12, 0, 55 - idx),
    ).toISOString()
    return {
      id: `doc-paged-${num}`,
      slug: `paged-surface-note-${num}`,
      fileName: `paged-surface-note-${num}.mrbl`,
      title: `Paged Surface Note ${num}`,
      description: `Paginated benchmark note ${num}.`,
      category: 'document',
      isTemplate: false,
      source: `<!doctype html><html><body><p data-marble-id="p1">Uniform lattice telemetry sample ${num}.</p></body></html>`,
      nodeCount: 1,
      byteSize: 180,
      version: 1,
      syncState: 'saved',
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: { name: 'You', initials: 'YO' },
      lastEditedBy: { name: 'You', initials: 'YO' },
      starred: false,
      pinned: false,
      tags: ['lattice'],
      folder: 'My Drive',
      folderId: null,
      trashedAt: null,
      share: DEFAULT_SHARE,
      checkpoints: [],
      intentHistory: [],
    }
  },
)

function SearchStoryHarness({
  initialQuery = '',
  initialType = 'all',
  initialIncludeTrash = false,
  failMode = false,
  trimQuery = false,
  debounceMs = 0,
  docs = DEMO_DOCS,
  folders = DEMO_FOLDERS,
  chatThreads = DEMO_CHATS,
  pageSize,
  externalNavQuery,
}: {
  initialQuery?: string
  initialType?: SearchFilterType
  initialIncludeTrash?: boolean
  failMode?: boolean
  trimQuery?: boolean
  debounceMs?: number
  docs?: MarbleDocumentFile[]
  folders?: DriveFolder[]
  chatThreads?: DriveChatThread[]
  pageSize?: number
  externalNavQuery?: string
}) {
  const [query, setQuery] = useState(initialQuery)
  const [typeFilter, setTypeFilter] = useState<SearchFilterType>(initialType)
  const [includeTrash, setIncludeTrash] = useState(initialIncludeTrash)
  const [failOnce, setFailOnce] = useState(failMode)

  const index = useMemo(
    () =>
      buildClientSearchIndex({
        docs,
        folders,
        chatThreads,
      }),
    [docs, folders, chatThreads],
  )

  const searchFn = async (
    options: SearchDriveOptions,
  ): Promise<SearchDriveResponse> => {
    if (failOnce) {
      setFailOnce(false)
      throw new Error('Search index temporarily locked')
    }
    return index.search(options)
  }

  return (
    <div className="min-h-screen bg-[var(--xd-canvas)] text-[var(--xd-ink)]">
      {externalNavQuery !== undefined && (
        <div className="mx-auto flex w-full max-w-4xl justify-end px-6 pt-4">
          <button
            type="button"
            onClick={() => setQuery(externalNavQuery)}
            className="rounded border border-[var(--xd-border)] px-2.5 py-1 text-[11.5px] text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)]"
          >
            Jump to {externalNavQuery}
          </button>
        </div>
      )}
      <DriveSearchView
        query={query}
        typeFilter={typeFilter}
        includeTrash={includeTrash}
        onQueryChange={(next) => setQuery(trimQuery ? next.trim() : next)}
        onTypeFilterChange={setTypeFilter}
        onIncludeTrashChange={setIncludeTrash}
        searchFn={searchFn}
        onOpenResult={() => {}}
        debounceMs={debounceMs}
        pageSize={pageSize}
        initialIndexedCount={index.size}
      />
    </div>
  )
}

/**
 * Full-page Drive search view with type filters, trash toggle, and highlighted snippets.
 *
 * @summary Drive-wide search results page
 */
const meta = {
  title: 'xDrive Search/DriveSearchView',
  component: DriveSearchView,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DriveSearchView>

export default meta
type Story = StoryObj<typeof meta>

export const WithResults: Story = {
  args: {
    query: 'surface',
    typeFilter: 'all',
    includeTrash: false,
    onQueryChange: () => {},
    onTypeFilterChange: () => {},
    onIncludeTrashChange: () => {},
    searchFn: async () =>
      buildClientSearchIndex({
        docs: DEMO_DOCS,
        folders: DEMO_FOLDERS,
        chatThreads: DEMO_CHATS,
      }).search({ query: 'surface' }),
  },
  render: () => <SearchStoryHarness initialQuery="surface" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => {
      expect(
        canvas.getByRole('link', { name: /Logical Memory Specification/i }),
      ).toHaveAttribute('href', '/d/doc-surface-spec/logical-memory-spec')
    })
    await expect(
      canvas.getByRole('link', { name: /Decoder Architecture Board/i }),
    ).toHaveAttribute('href', '/d/wb-decoder-flow/decoder-flow-board')
    await expect(
      canvas.getByRole('link', { name: /Surface Codes/i }),
    ).toHaveAttribute('href', '/f/folder-surface/surface-codes')
    await expect(
      canvas.getByRole('link', { name: /Surface Code Threshold Review/i }),
    ).toHaveAttribute('href', '/chat/chat-surface-review')
    await expect(canvasElement.querySelectorAll('mark').length).toBeGreaterThan(
      0,
    )
  },
}

export const FilterByType: Story = {
  args: {
    ...WithResults.args,
  },
  render: () => <SearchStoryHarness initialQuery="surface" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => {
      expect(
        canvas.getByRole('link', { name: /Decoder Architecture Board/i }),
      ).toBeVisible()
    })

    const whiteboardsTab = canvas.getByRole('link', { name: /Whiteboards/i })
    await expect(whiteboardsTab).toHaveAttribute(
      'href',
      '/search?q=surface&type=whiteboard',
    )
    await userEvent.click(whiteboardsTab)

    await waitFor(() => {
      expect(
        canvas.queryByRole('link', { name: /Logical Memory Specification/i }),
      ).toBeNull()
    })
    await expect(
      canvas.getByRole('link', { name: /Decoder Architecture Board/i }),
    ).toBeVisible()

    await userEvent.click(canvas.getByRole('link', { name: /Chats/i }))
    await waitFor(() => {
      expect(
        canvas.getByRole('link', { name: /Surface Code Threshold Review/i }),
      ).toBeVisible()
    })
  },
}

export const IncludeTrashToggle: Story = {
  args: {
    ...WithResults.args,
  },
  render: () => <SearchStoryHarness initialQuery="surface" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => {
      expect(
        canvas.getByRole('link', { name: /Logical Memory Specification/i }),
      ).toBeVisible()
    })
    expect(
      canvas.queryByRole('link', { name: /Archived Surface Ablation/i }),
    ).toBeNull()

    const trashSwitch = canvas.getByRole('switch', { name: /Include trash/i })
    await userEvent.click(trashSwitch)

    await waitFor(() => {
      expect(
        canvas.getByRole('link', { name: /Archived Surface Ablation/i }),
      ).toBeVisible()
    })
    await expect(canvas.getByText('In Trash')).toBeVisible()
  },
}

export const EmptyPrompt: Story = {
  args: {
    ...WithResults.args,
    query: '',
  },
  render: () => <SearchStoryHarness initialQuery="" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Search across your local Drive'),
    ).toBeVisible()
    const input = canvas.getByRole('searchbox', { name: /Search Drive/i })
    await userEvent.type(input, 'PyMatching')
    await waitFor(() => {
      expect(
        canvas.getByRole('link', { name: /Logical Memory Specification/i }),
      ).toBeVisible()
    })
  },
}

export const NoMatches: Story = {
  args: {
    ...WithResults.args,
    query: 'nonexistent-quantum-term',
  },
  render: () => <SearchStoryHarness initialQuery="nonexistent-quantum-term" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => {
      expect(
        canvas.getByText(/No matches for “nonexistent-quantum-term”/i),
      ).toBeVisible()
    })
    await expect(
      canvas.getByRole('button', { name: /Include trashed items/i }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: /Clear search/i }),
    ).toBeVisible()
  },
}

export const ErrorState: Story = {
  args: {
    ...WithResults.args,
    query: 'surface',
  },
  render: () => <SearchStoryHarness initialQuery="surface" failMode={true} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => {
      expect(canvas.getByText('Unable to search Drive')).toBeVisible()
    })
    await userEvent.click(canvas.getByRole('button', { name: /Try again/i }))
    await waitFor(() => {
      expect(
        canvas.getByRole('link', { name: /Logical Memory Specification/i }),
      ).toBeVisible()
    })
  },
}

export const PreservesTrailingSpaceAcrossDebounce: Story = {
  args: {
    ...WithResults.args,
    query: '',
  },
  render: () => (
    <SearchStoryHarness
      initialQuery=""
      trimQuery={true}
      debounceMs={40}
      externalNavQuery="PyMatching"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByRole('searchbox', { name: /Search Drive/i })

    await userEvent.type(input, 'surface ')

    // Wait for debounce + host trim echo to settle results while keeping the trailing space.
    await waitFor(() => {
      expect(
        canvas.getByRole('link', { name: /Logical Memory Specification/i }),
      ).toBeVisible()
    })
    await expect(input).toHaveValue('surface ')

    await userEvent.type(input, 'code')
    await expect(input).toHaveValue('surface code')

    // External navigation should still sync the input value and rerun results.
    await userEvent.click(
      canvas.getByRole('button', { name: /Jump to PyMatching/i }),
    )
    await expect(input).toHaveValue('PyMatching')
    await waitFor(() => {
      expect(
        canvas.queryByRole('link', { name: /Decoder Architecture Board/i }),
      ).toBeNull()
    })
    await expect(
      canvas.getByRole('link', { name: /Logical Memory Specification/i }),
    ).toBeVisible()
  },
}

export const PaginationLoadMore: Story = {
  args: {
    ...WithResults.args,
    query: 'lattice',
  },
  render: () => (
    <SearchStoryHarness
      initialQuery="lattice"
      docs={PAGED_DOCS}
      folders={[]}
      chatThreads={[]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => {
      expect(canvas.getByText('Showing 50 of 55 results')).toBeVisible()
    })

    const list = canvas.getByRole('list', { name: 'Search results' })
    await expect(within(list).getAllByRole('listitem')).toHaveLength(50)
    expect(
      canvas.queryByRole('link', { name: /Paged Surface Note 55/i }),
    ).toBeNull()

    await userEvent.click(canvas.getByRole('button', { name: /Load more/i }))

    await waitFor(() => {
      expect(
        canvas.getByRole('link', { name: /Paged Surface Note 55/i }),
      ).toBeVisible()
    })
    await expect(within(list).getAllByRole('listitem')).toHaveLength(55)
    await expect(canvas.getByText(/55 results/i)).toBeVisible()
    expect(canvas.queryByRole('button', { name: /Load more/i })).toBeNull()
  },
}
