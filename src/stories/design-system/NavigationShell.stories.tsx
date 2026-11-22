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
]

const meta = {
  title: 'xDrive Design System/Navigation Shell',
  component: BrowserTabStrip,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof BrowserTabStrip>

export default meta
type Story = StoryObj<typeof meta>

export const TabStrip: Story = {
  args: {
    openTabs: MOCK_OPEN_TABS,
    activeTabId: 'doc-qec',
    canGoBack: true,
    canGoForward: false,
    simulatedRole: 'owner',
    theme: 'dark',
    aiSidebarOpen: false,
    pendingProposalsCount: 0,
  },
}

export const LeftNavigationRail: StoryObj = {
  render: () => {
    const [activeNav, setActiveNav] = useState<PrimaryNavId>('drive')
    const [activeAppId, setActiveAppId] = useState<string>('doc-qec')

    return (
      <div className="flex h-[560px] bg-[var(--xd-canvas)]">
        <SidebarRail
          activeNav={activeNav}
          onSelectNav={setActiveNav}
          pinnedApps={MOCK_PINNED_APPS}
          activeAppId={activeAppId}
          onSelectApp={setActiveAppId}
        />
        <div className="flex flex-1 items-center justify-center p-8 text-[13px] text-[var(--xd-ink-secondary)]">
          Navigation rail
        </div>
      </div>
    )
  },
}

export const DocumentToolbar: StoryObj = {
  render: () => {
    const [mode, setMode] = useState<CanvasInteractionMode>('direct')

    return (
      <div className="bg-[var(--xd-canvas)] p-6">
        <div className="overflow-hidden rounded-md border border-[var(--xd-border)]">
          <DocumentBreadcrumbHeader
            folder="Quantum Architecture"
            category="latex"
            fileName="quantum-error-correction.mrbl"
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
