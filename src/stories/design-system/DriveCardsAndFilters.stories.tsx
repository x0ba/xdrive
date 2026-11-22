import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import {
  FilterPillBar,
  MetricOverviewStrip,
  MarbleAppCard,
  TemplateGalleryCard,
  AgentHeroComposer,
} from '#/components/design-system'
import type {
  MarbleTemplateBlueprint,
  SortOption,
  DriveViewMode,
} from '#/components/design-system'
import type {
  MarbleDocumentFile,
  MarbleAppCategory,
  SharePermissionLevel,
} from '#/lib/types'

const MOCK_RESEARCH_DOCUMENTS: MarbleDocumentFile[] = [
  {
    id: 'doc-qec-floquet',
    slug: 'quantum-error-correction',
    fileName: 'quantum-error-correction.mrbl',
    title:
      'Fault-Tolerant Logical Qubits in Planar Honeycomb Floquet Surface Codes',
    description:
      'Two-column interactive LaTeX manuscript with live syndrome graph threshold curves, collapsible theorem proofs, and <marble-alt> decoder comparisons.',
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
    tags: ['quantum-computing', 'floquet-codes', 'surface-threshold'],
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
      'Empirical activation patching log tracking L14H7 induction heads across 32B residual streams with sortable ablation runs and interactive logit lens heatmaps.',
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
    tags: ['interpretability', 'sparse-autoencoders', 'circuits'],
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
      'Interactive 8-slide flight telemetry presentation featuring Mach 24 plasma boundary layer simulation controls and leeward flap hinge thermal margins.',
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
    pinned: true,
    tags: ['aerothermal', 'starship', 'tps-simulation'],
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
      'Structured comparison table synthesizing 42 frontier pretraining papers by token-to-parameter ratio, MoE active granularity, and synthetic data curriculum.',
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
    starred: true,
    pinned: false,
    tags: ['scaling-laws', 'literature-review', 'moe'],
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
      'Self-contained academic manuscript with numbered theorem environments, marginalia annotations, and <marble-alt> alternative derivation branches.',
    nodeCount: 142,
    byteSize: 34200,
    affordances: [
      'data-marble-editable',
      'data-marble-sortable',
      '<marble-alt>',
      'data-marble-look',
    ],
    recommendedModel: 'Grok 4.7',
    previewHighlights: [
      'Numbered Theorem / Lemma / Proof blocks with live equations',
      'Side-by-side <marble-alt> derivation switcher',
      'BibTeX citation table with one-click row insertion',
    ],
  },
  {
    id: 'tpl-lab-notebook',
    title: 'Empirical Lab Notebook & Telemetry Canvas',
    fileName: 'template-lab-notebook.mrbl',
    category: 'notebook',
    description:
      'Chronological experiment log with draggable hypothesis cards, interactive parameter sliders, and an embedded freehand diagram canvas.',
    nodeCount: 168,
    byteSize: 41600,
    affordances: [
      'data-marble-editable',
      'data-marble-sortable',
      'data-marble-canvas',
      'data-marble-add',
    ],
    recommendedModel: 'Gemini 4 Argon',
    previewHighlights: [
      'Sortable experiment run table with tabular loss readouts',
      'Embedded SVG schematic canvas (data-marble-canvas)',
      'Instant checkpoint diffing across ablation runs',
    ],
  },
  {
    id: 'tpl-lit-matrix',
    title: 'Systematic Literature Review & Benchmark Matrix',
    fileName: 'template-literature-matrix.mrbl',
    category: 'matrix',
    description:
      'High-density comparative matrix for synthesizing papers across methodology, compute budget, dataset composition, and key limitations.',
    nodeCount: 210,
    byteSize: 48900,
    affordances: [
      'data-marble-editable',
      'data-marble-sortable',
      'data-marble-add',
      'data-marble-look',
    ],
    recommendedModel: 'DeepSeek V4.1 Flash',
    previewHighlights: [
      'Local visitor filter tabs using data-marble-look',
      'One-click paper row duplication via data-marble-add',
      'Tabular numeric columns for FLOPs & accuracy deltas',
    ],
  },
]

const meta = {
  title: 'xDrive Design System/Drive Cards, Metrics & Agent Composer',
  component: MarbleAppCard,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MarbleAppCard>

export default meta
type Story = StoryObj<typeof meta>

export const SingleMarbleAppCard: Story = {
  args: {
    doc: MOCK_RESEARCH_DOCUMENTS[0],
  },
  decorators: [
    (StoryComponent) => (
      <div className="max-w-md bg-[var(--xd-canvas)] p-6">
        <StoryComponent />
      </div>
    ),
  ],
}

export const StripeMetricAndFilterDashboard: StoryObj = {
  render: () => {
    const [category, setCategory] = useState<MarbleAppCategory | 'all'>('all')
    const [access, setAccess] = useState<SharePermissionLevel | 'all'>('all')
    const [sortBy, setSortBy] = useState<SortOption>('updated')
    const [viewMode, setViewMode] = useState<DriveViewMode>('grid')
    const [searchQuery, setSearchQuery] = useState('')
    const [docs, setDocs] = useState(MOCK_RESEARCH_DOCUMENTS)

    const filteredDocs = docs.filter((d) => {
      if (category !== 'all' && d.category !== category) return false
      if (access !== 'all' && d.share.publicPermission !== access) return false
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
          item.id === target.id ? { ...item, starred: !item.starred } : item
        )
      )
    }

    return (
      <div className="mx-auto max-w-6xl space-y-5 bg-[var(--xd-canvas)] p-6 text-[var(--xd-ink)]">
        <MetricOverviewStrip
          totalApps={18}
          addressableNodes={3482}
          committedOps={1294}
          activeSubscriptions={3}
          totalSubscriptions={4}
          totalByteSize={642800}
        />

        <FilterPillBar
          selectedCategory={category}
          onSelectCategory={setCategory}
          selectedAccess={access}
          onSelectAccess={setAccess}
          sortBy={sortBy}
          onSelectSort={setSortBy}
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
          searchQuery={searchQuery}
          onChangeSearchQuery={setSearchQuery}
          totalResults={filteredDocs.length}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filteredDocs.map((doc) => (
            <MarbleAppCard
              key={doc.id}
              doc={doc}
              onToggleStar={toggleStar}
            />
          ))}
        </div>
      </div>
    )
  },
}

export const SelfContainedTemplateGallery: StoryObj = {
  render: () => (
    <div className="mx-auto max-w-6xl space-y-4 bg-[var(--xd-canvas)] p-6 text-[var(--xd-ink)]">
      <div className="flex items-baseline justify-between border-b border-[var(--xd-border)] pb-3">
        <div>
          <h2 className="text-[16px] font-semibold text-[var(--xd-ink)]">
            Predefined Marble (.mrbl) Application Templates
          </h2>
          <p className="text-[12.5px] text-[var(--xd-ink-secondary)]">
            Every template is a self-contained HTML5 .mrbl file with embedded
            Marble runtime affordances ready to duplicate in one click.
          </p>
        </div>
        <span className="xd-mono text-[11.5px] text-[var(--xd-ink-muted)]">
          3 blueprints available
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {MOCK_TEMPLATE_BLUEPRINTS.map((tpl) => (
          <TemplateGalleryCard key={tpl.id} template={tpl} />
        ))}
      </div>
    </div>
  ),
}

export const LinearAgentStudioHeroComposer: StoryObj = {
  render: () => (
    <div className="bg-[var(--xd-canvas)] p-8 text-[var(--xd-ink)]">
      <AgentHeroComposer />
    </div>
  ),
}
