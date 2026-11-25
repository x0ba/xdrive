import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { expect, userEvent, within } from 'storybook/test'
import {
  DriveFileIconTile,
  DriveFileListTable,
  DriveFilePreviewCard,
} from './DriveExplorer'
import {
  AgentHeroComposer,
  FilterPillBar,
  MarbleAppCard,
  MetricOverviewStrip,
  TemplateGalleryCard,
} from './FilterAndMetrics'
import type {
  DriveViewMode,
  MarbleTemplateBlueprint,
  SortOption,
} from './FilterAndMetrics'
import type { MarbleDocumentFile } from '#/lib/types'

const MOCK_RESEARCH_DOCUMENTS: MarbleDocumentFile[] = [
  {
    id: 'doc-qec-floquet',
    slug: 'quantum-error-correction',
    fileName: 'quantum-error-correction.mrbl',
    title:
      'Fault-Tolerant Logical Qubits in Planar Honeycomb Floquet Surface Codes',
    description:
      'Two-column interactive LaTeX manuscript with live syndrome graph threshold curves and collapsible theorem proofs.',
    category: 'latex',
    isTemplate: false,
    source: '<!DOCTYPE html><html><body data-marble-id="root"></body></html>',
    nodeCount: 184,
    byteSize: 42880,
    version: 14,
    syncState: 'saved',
    createdAt: '2026-11-10',
    updatedAt: '12m ago',
    createdBy: {
      name: 'Dr. Elena Vance',
      initials: 'EV',
      isAi: false,
    },
    lastEditedBy: {
      name: 'Grok 4.7',
      initials: 'GK',
      isAi: true,
      modelBadge: 'Grok 4.7',
    },
    starred: true,
    pinned: true,
    tags: ['quantum-computing', 'floquet-codes'],
    folder: 'Quantum Architecture',
    share: {
      isPublicLinkEnabled: true,
      publicLinkUrl: 'https://xdrive.app/m/quantum-error-correction.mrbl',
      publicPermission: 'edit_with_ai_shared',
      allowDuplication: true,
      sharedAiDailyLimit: 250,
      sharedAiUsedToday: 64,
      collaborators: [],
    },
    checkpoints: [],
    intentHistory: [],
  },
  {
    id: 'doc-mech-interp',
    slug: 'mech-interp-notebook',
    fileName: 'mech-interp-notebook.mrbl',
    title:
      'Mechanistic Interpretability Lab Notebook: Sparse Autoencoder Feature Circuits',
    description:
      'Empirical activation patching log tracking L14H7 induction heads across 32B residual streams with sortable ablation runs.',
    category: 'notebook',
    isTemplate: false,
    source: '<!DOCTYPE html><html><body data-marble-id="root"></body></html>',
    nodeCount: 246,
    byteSize: 64120,
    version: 29,
    syncState: 'proposed',
    createdAt: '2026-11-14',
    updatedAt: '28m ago',
    createdBy: {
      name: 'Gemini 4 Argon',
      initials: 'G4',
      isAi: true,
      modelBadge: 'Gemini 4 Argon',
    },
    lastEditedBy: {
      name: 'Marcus Chen',
      initials: 'MC',
      isAi: false,
    },
    starred: true,
    pinned: true,
    tags: ['interpretability', 'sparse-autoencoders'],
    folder: 'Alignment & Interpretability',
    share: {
      isPublicLinkEnabled: true,
      publicLinkUrl: 'https://xdrive.app/m/mech-interp-notebook.mrbl',
      publicPermission: 'edit_with_ai_byok',
      allowDuplication: true,
      sharedAiDailyLimit: 100,
      sharedAiUsedToday: 12,
      collaborators: [],
    },
    checkpoints: [],
    intentHistory: [],
  },
  {
    id: 'doc-starship-tps',
    slug: 'starship-aerothermal-slides',
    fileName: 'starship-aerothermal-slides.mrbl',
    title: 'Starship Block 3 Aerothermal Hex-Tile Peak Heating Trajectory Deck',
    description:
      'Interactive 8-slide flight telemetry presentation featuring Mach 24 plasma boundary layer simulation controls.',
    category: 'slides',
    isTemplate: false,
    source: '<!DOCTYPE html><html><body data-marble-id="root"></body></html>',
    nodeCount: 112,
    byteSize: 38450,
    version: 9,
    syncState: 'saved',
    createdAt: '2026-11-18',
    updatedAt: '2h ago',
    createdBy: {
      name: 'Dr. Aris Thorne',
      initials: 'AT',
      isAi: false,
    },
    lastEditedBy: {
      name: 'Claude Haiku 5.5',
      initials: 'CH',
      isAi: true,
      modelBadge: 'Claude Haiku 5.5',
    },
    starred: false,
    pinned: false,
    tags: ['aerothermal', 'starship'],
    folder: 'Propulsion & Entry',
    share: {
      isPublicLinkEnabled: true,
      publicLinkUrl: 'https://xdrive.app/m/starship-aerothermal-slides.mrbl',
      publicPermission: 'comment_annotate',
      allowDuplication: true,
      sharedAiDailyLimit: 150,
      sharedAiUsedToday: 40,
      collaborators: [],
    },
    checkpoints: [],
    intentHistory: [],
  },
  {
    id: 'doc-scaling-matrix',
    slug: 'transformer-scaling-matrix',
    fileName: 'transformer-scaling-matrix.mrbl',
    title:
      'Post-Chinchilla Over-Training & Inference-Optimal Scaling Literature Matrix',
    description:
      'Structured comparison table synthesizing 42 frontier pretraining papers by token-to-parameter ratio and MoE granularity.',
    category: 'matrix',
    isTemplate: false,
    source: '<!DOCTYPE html><html><body data-marble-id="root"></body></html>',
    nodeCount: 318,
    byteSize: 89200,
    version: 21,
    syncState: 'saved',
    createdAt: '2026-11-05',
    updatedAt: '5h ago',
    createdBy: {
      name: 'DeepSeek V4.1 Flash',
      initials: 'DS',
      isAi: true,
      modelBadge: 'DeepSeek V4.1 Flash',
    },
    lastEditedBy: {
      name: 'OpenAI GPT-5.4',
      initials: 'O5',
      isAi: true,
      modelBadge: 'GPT-5.4',
    },
    starred: false,
    pinned: false,
    tags: ['scaling-laws', 'literature-review'],
    folder: 'Foundation Models',
    share: {
      isPublicLinkEnabled: false,
      publicLinkUrl: 'https://xdrive.app/m/transformer-scaling-matrix.mrbl',
      publicPermission: 'view_only',
      allowDuplication: true,
      sharedAiDailyLimit: 50,
      sharedAiUsedToday: 0,
      collaborators: [],
    },
    checkpoints: [],
    intentHistory: [],
  },
]

const MOCK_TEMPLATE_BLUEPRINTS: MarbleTemplateBlueprint[] = [
  {
    id: 'tpl-latex-paper',
    title: 'Two-Column LaTeX Research Paper & Proof Explorer',
    fileName: 'template-latex-paper.mrbl',
    category: 'latex',
    description:
      'Self-contained academic manuscript with numbered theorem environments and alternative derivation branches.',
    nodeCount: 142,
    byteSize: 34200,
    affordances: [
      'data-marble-editable',
      'data-marble-sortable',
      '<marble-alt>',
    ],
    recommendedModel: 'Grok 4.7',
    previewHighlights: [],
  },
  {
    id: 'tpl-lab-notebook',
    title: 'Empirical Lab Notebook & Telemetry Canvas',
    fileName: 'template-lab-notebook.mrbl',
    category: 'notebook',
    description:
      'Chronological experiment log with draggable hypothesis cards and interactive parameter sliders.',
    nodeCount: 168,
    byteSize: 41600,
    affordances: ['data-marble-editable', 'data-marble-sortable'],
    recommendedModel: 'Gemini 4 Argon',
    previewHighlights: [],
  },
  {
    id: 'tpl-lit-matrix',
    title: 'Systematic Literature Review & Benchmark Matrix',
    fileName: 'template-literature-matrix.mrbl',
    category: 'matrix',
    description:
      'Comparative matrix for synthesizing papers across methodology, compute budget, and dataset composition.',
    nodeCount: 210,
    byteSize: 48900,
    affordances: ['data-marble-editable', 'data-marble-sortable'],
    recommendedModel: 'DeepSeek V4.1 Flash',
    previewHighlights: [],
  },
]

function DriveFileIndexDemo() {
  const [sortBy, setSortBy] = useState<SortOption>('updated')
  const [viewMode, setViewMode] = useState<DriveViewMode>('preview')
  const [searchQuery, setSearchQuery] = useState('')
  const [docs, setDocs] = useState(MOCK_RESEARCH_DOCUMENTS)

  const filteredDocs = docs.filter((d) => {
    if (
      searchQuery.trim() &&
      !`${d.title} ${d.fileName} ${d.description}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    ) {
      return false
    }
    return true
  })

  const toggleStar = (target: MarbleDocumentFile) => {
    setDocs((prev) =>
      prev.map((item) =>
        item.id === target.id ? { ...item, starred: !item.starred } : item,
      ),
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 bg-[var(--xd-canvas)] p-6 text-[var(--xd-ink)]">
      <AgentHeroComposer />

      <FilterPillBar
        sortBy={sortBy}
        onSelectSort={setSortBy}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        searchQuery={searchQuery}
        onChangeSearchQuery={setSearchQuery}
      />

      {viewMode === 'list' ? (
        <DriveFileListTable
          folders={[]}
          docs={filteredDocs}
          onToggleStar={toggleStar}
        />
      ) : viewMode === 'icon' ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {filteredDocs.map((doc) => (
            <DriveFileIconTile
              key={doc.id}
              doc={doc}
              onToggleStar={toggleStar}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDocs.map((doc) => (
            <DriveFilePreviewCard
              key={doc.id}
              doc={doc}
              folderLabel={doc.folder}
              onToggleStar={toggleStar}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Drive document cards, category filter pills, hero agent composer, and template blueprint gallery cards.
 *
 * @summary Drive cards, filters, hero composer, and template gallery primitives
 */
const meta = {
  title: 'xDrive Design System/Drive Cards & Filters',
  component: MarbleAppCard,
  subcomponents: {
    AgentHeroComposer,
    FilterPillBar,
    MetricOverviewStrip,
    TemplateGalleryCard,
  },
  args: {
    doc: MOCK_RESEARCH_DOCUMENTS[0],
  },
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MarbleAppCard>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Single research manuscript card displaying category badge, sync state, and metadata.
 *
 * @summary Single Marble app card
 */
export const SingleMarbleAppCard: Story = {
  decorators: [
    (StoryComponent) => (
      <div className="max-w-md bg-[var(--xd-canvas)] p-6">
        <StoryComponent />
      </div>
    ),
  ],
}

/**
 * Interactive Drive file index combining hero composer, filter pill bar, and preview/icon/list view modes.
 *
 * @summary Interactive Drive file index with filters and view modes
 */
export const DriveFileIndex: Story = {
  render: () => <DriveFileIndexDemo />,
}

/**
 * Three-column template blueprint gallery showcasing `.mrbl` starter apps.
 *
 * @summary Starter template blueprint gallery
 */
/**
 * Hero composer prompt bar with the docked reasoning-level picker.
 *
 * @summary Agent hero composer reasoning level picker
 */
export const AgentHeroReasoningLevel: Story = {
  render: () => (
    <div className="bg-[var(--xd-canvas)] p-8">
      <AgentHeroComposer />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('button', { name: /Reasoning effort/i })
    await userEvent.click(trigger)
    const body = within(document.body)
    await expect(
      body.getByRole('radiogroup', { name: 'Reasoning effort' }),
    ).toBeVisible()
    await expect(body.getByRole('radio', { name: /High/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  },
}

export const TemplateGallery: Story = {
  render: () => (
    <div className="mx-auto max-w-5xl space-y-4 bg-[var(--xd-canvas)] p-6 text-[var(--xd-ink)]">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {MOCK_TEMPLATE_BLUEPRINTS.map((tpl) => (
          <TemplateGalleryCard key={tpl.id} template={tpl} />
        ))}
      </div>
    </div>
  ),
}
