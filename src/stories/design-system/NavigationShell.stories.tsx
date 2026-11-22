import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import {
  BrowserTabStrip,
  SidebarRail,
  DocumentBreadcrumbHeader,
} from '#/components/design-system'
import type {
  OpenDocumentTab,
  PrimaryNavId,
} from '#/components/design-system'
import type { CanvasInteractionMode } from '#/lib/types'

const MOCK_OPEN_TABS: OpenDocumentTab[] = [
  {
    id: 'doc-qec',
    title: 'Fault-Tolerant Floquet Surface Codes',
    fileName: 'quantum-error-correction.mrbl',
    category: 'latex',
    nodeCount: 184,
    syncState: 'saved',
  },
  {
    id: 'doc-mech-interp',
    title: 'Sparse Autoencoder Feature Circuits',
    fileName: 'mech-interp-notebook.mrbl',
    category: 'notebook',
    nodeCount: 246,
    syncState: 'proposed',
  },
  {
    id: 'doc-starship',
    title: 'Starship Block 3 Aerothermal TPS Deck',
    fileName: 'starship-aerothermal-slides.mrbl',
    category: 'slides',
    nodeCount: 112,
    syncState: 'saved',
  },
  {
    id: 'doc-scaling',
    title: 'Post-Chinchilla Compute Frontier Matrix',
    fileName: 'transformer-scaling-matrix.mrbl',
    category: 'matrix',
    nodeCount: 318,
    syncState: 'saving',
  },
]

const MOCK_PINNED_APPS = [
  {
    id: 'doc-qec',
    title: 'Floquet Surface Codes',
    fileName: 'quantum-error-correction.mrbl',
    category: 'latex' as const,
    nodeCount: 184,
  },
  {
    id: 'doc-mech-interp',
    title: 'SAE Feature Circuits',
    fileName: 'mech-interp-notebook.mrbl',
    category: 'notebook' as const,
    nodeCount: 246,
  },
  {
    id: 'doc-starship',
    title: 'Starship Aerothermal TPS',
    fileName: 'starship-aerothermal-slides.mrbl',
    category: 'slides' as const,
    nodeCount: 112,
  },
]

const MOCK_RECENT_APPS = [
  {
    id: 'doc-scaling',
    title: 'Transformer Scaling Matrix',
    fileName: 'transformer-scaling-matrix.mrbl',
    category: 'matrix' as const,
    updatedAt: '4m ago',
  },
  {
    id: 'doc-nbody',
    title: 'Relativistic N-Body Sandbox',
    fileName: 'kerr-geodesic-sandbox.mrbl',
    category: 'sandbox' as const,
    updatedAt: '2h ago',
  },
  {
    id: 'doc-grant',
    title: 'DARPA US2QC Phase II Proposal',
    fileName: 'darpa-quantum-proposal.mrbl',
    category: 'document' as const,
    updatedAt: 'Yesterday',
  },
]

const meta = {
  title: 'xDrive Design System/Navigation Shell & Multi-Tab Chrome',
  component: BrowserTabStrip,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof BrowserTabStrip>

export default meta
type Story = StoryObj<typeof meta>

export const MultiTabStripDefault: Story = {
  args: {
    openTabs: MOCK_OPEN_TABS,
    activeTabId: 'doc-qec',
    canGoBack: true,
    canGoForward: false,
    simulatedRole: 'owner',
    theme: 'dark',
    aiSidebarOpen: true,
    pendingProposalsCount: 2,
  },
}

export const MultiTabStripRoleSimulation: Story = {
  args: {
    openTabs: MOCK_OPEN_TABS,
    activeTabId: 'doc-mech-interp',
    canGoBack: true,
    canGoForward: true,
    simulatedRole: 'comment_annotate',
    theme: 'dark',
    aiSidebarOpen: true,
    pendingProposalsCount: 3,
  },
}

export const LeftNavigationRail: StoryObj = {
  render: () => {
    const [activeNav, setActiveNav] = useState<PrimaryNavId>('drive')
    const [activeAppId, setActiveAppId] = useState<string>('doc-qec')

    return (
      <div className="flex h-[680px] bg-[var(--xd-canvas)]">
        <SidebarRail
          activeNav={activeNav}
          onSelectNav={setActiveNav}
          pinnedApps={MOCK_PINNED_APPS}
          recentApps={MOCK_RECENT_APPS}
          activeAppId={activeAppId}
          onSelectApp={setActiveAppId}
        />
        <div className="flex flex-1 items-center justify-center p-8 text-[13px] text-[var(--xd-ink-secondary)]">
          232px Left Navigation Rail with live AI Subscription status card
        </div>
      </div>
    )
  },
}

export const DocumentTopBreadcrumbBar: StoryObj = {
  render: () => {
    const [mode, setMode] = useState<CanvasInteractionMode>('direct')

    return (
      <div className="bg-[var(--xd-canvas)] p-6">
        <div className="overflow-hidden rounded-md border border-[var(--xd-border)]">
          <DocumentBreadcrumbHeader
            folder="Quantum Architecture"
            category="latex"
            fileName="quantum-error-correction.mrbl"
            nodeCount={184}
            byteSize={42880}
            syncState="saved"
            interactionMode={mode}
            onChangeInteractionMode={setMode}
            sharePermission="edit_with_ai_shared"
            isPublicLinkEnabled={true}
          />
        </div>
      </div>
    )
  },
}

export const IntegratedDesktopWorkspaceFrame: StoryObj = {
  render: () => {
    const [activeTabId, setActiveTabId] = useState<string>('doc-qec')
    const [activeNav, setActiveNav] = useState<PrimaryNavId>('drive')
    const [mode, setMode] = useState<CanvasInteractionMode>('sketch')
    const [aiOpen, setAiOpen] = useState(true)
    const [theme, setTheme] = useState<'dark' | 'light'>('dark')

    return (
      <div className={theme === 'dark' ? 'dark' : ''}>
        <div className="flex h-[720px] w-full flex-col bg-[var(--xd-canvas)] text-[var(--xd-ink)]">
          <BrowserTabStrip
            openTabs={MOCK_OPEN_TABS}
            activeTabId={activeTabId}
            onSelectTab={setActiveTabId}
            theme={theme}
            onToggleTheme={() =>
              setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
            }
            aiSidebarOpen={aiOpen}
            onToggleAiSidebar={() => setAiOpen((prev) => !prev)}
            pendingProposalsCount={2}
          />

          <div className="flex min-h-0 flex-1">
            <SidebarRail
              activeNav={activeNav}
              onSelectNav={setActiveNav}
              pinnedApps={MOCK_PINNED_APPS}
              recentApps={MOCK_RECENT_APPS}
              activeAppId={activeTabId}
              onSelectApp={setActiveTabId}
            />

            <div className="flex min-w-0 flex-1 flex-col">
              <DocumentBreadcrumbHeader
                folder="Quantum Architecture"
                category="latex"
                fileName="quantum-error-correction.mrbl"
                nodeCount={184}
                byteSize={42880}
                syncState="proposed"
                interactionMode={mode}
                onChangeInteractionMode={setMode}
                sharePermission="edit_with_ai_shared"
                isPublicLinkEnabled={true}
              />

              <main className="flex flex-1 items-center justify-center bg-[var(--xd-canvas)] p-8">
                <div className="max-w-xl rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)]/40 p-6">
                  <div className="xd-mono text-[11px] text-[var(--xd-accent)]">
                    data-marble-id=&quot;thm-floquet-threshold&quot;
                  </div>
                  <h2 className="xd-serif mt-2 text-[22px] font-medium text-[var(--xd-ink)]">
                    Fault-Tolerant Logical Qubits in Planar Honeycomb Floquet Codes
                  </h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--xd-ink-secondary)]">
                    Active Canvas Mode:{' '}
                    <strong className="xd-mono text-[var(--xd-ink)]">
                      {mode}
                    </strong>
                    . Switch modes in the document header to test Direct Edit,
                    Select Area, Sketch & Annotate, or Source & Ops inspection.
                  </p>
                </div>
              </main>
            </div>
          </div>
        </div>
      </div>
    )
  },
}
