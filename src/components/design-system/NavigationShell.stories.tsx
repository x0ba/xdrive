import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import {
  BrowserTabStrip,
  DocumentBreadcrumbHeader,
  SidebarRail,
} from './NavigationShell'
import type { OpenDocumentTab, PrimaryNavId } from './NavigationShell'
import { NewAppButton } from './NewAppCreator'
import type { CanvasInteractionMode, DriveFolder } from '#/lib/types'

const MOCK_DRIVE_FOLDERS: DriveFolder[] = [
  {
    id: 'folder-papers',
    name: 'Papers',
    parentId: null,
    color: 'default',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-20T00:00:00.000Z',
  },
  {
    id: 'folder-papers-qec',
    name: 'Surface Codes',
    parentId: 'folder-papers',
    color: 'accent',
    createdAt: '2026-11-05T00:00:00.000Z',
    updatedAt: '2026-11-20T00:00:00.000Z',
  },
  {
    id: 'folder-lab',
    name: 'Lab',
    parentId: null,
    color: 'commit',
    createdAt: '2026-11-02T00:00:00.000Z',
    updatedAt: '2026-11-21T00:00:00.000Z',
  },
  {
    id: 'folder-talks',
    name: 'Talks',
    parentId: null,
    color: 'sketch',
    createdAt: '2026-11-03T00:00:00.000Z',
    updatedAt: '2026-11-21T00:00:00.000Z',
  },
]

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

function LeftNavigationRailDemo() {
  const [activeNav, setActiveNav] = useState<PrimaryNavId>('drive')
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [activeAppId, setActiveAppId] = useState<string | undefined>(undefined)

  return (
    <div className="flex h-[560px] bg-[var(--xd-canvas)]">
      <SidebarRail
        activeNav={activeNav}
        onSelectNav={(next) => {
          setActiveAppId(undefined)
          setActiveNav(next)
        }}
        topAction={
          <NewAppButton
            onOpenAIAgent={() => {}}
            onOpenTemplates={() => {}}
            onCreateFolder={() => {}}
          />
        }
        folders={MOCK_DRIVE_FOLDERS}
        activeFolderId={activeFolderId}
        onSelectFolder={(folderId) => {
          setActiveAppId(undefined)
          setActiveFolderId(folderId)
        }}
        onCreateFolder={() => {}}
        trashCount={2}
        pinnedApps={MOCK_PINNED_APPS}
        activeAppId={activeAppId}
        onSelectApp={setActiveAppId}
      />
      <div className="flex flex-1 items-center justify-center p-8 text-[13px] text-[var(--xd-ink-secondary)]">
        {activeAppId
          ? `Active app: ${activeAppId}`
          : activeFolderId
            ? `Folder: ${MOCK_DRIVE_FOLDERS.find((f) => f.id === activeFolderId)?.name}`
            : `View: ${activeNav}`}
      </div>
    </div>
  )
}

function DocumentToolbarDemo() {
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
}

/**
 * Top browser tab strip, left Drive navigation rail, and active document breadcrumb toolbar.
 *
 * @summary Navigation shell chrome for tabs, sidebar rail, and document header
 */
const meta = {
  title: 'xDrive Design System/Navigation Shell',
  component: BrowserTabStrip,
  subcomponents: {
    SidebarRail,
    DocumentBreadcrumbHeader,
  },
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
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof BrowserTabStrip>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Multi-tab browser chrome with history controls, role indicator, and AI sidebar toggle.
 *
 * @summary Workspace browser tab strip
 */
export const TabStrip: Story = {}

/**
 * Interactive left sidebar rail with nested Drive folder tree, pinned apps, and `+ New` button slot.
 *
 * @summary Interactive left navigation rail
 */
export const LeftNavigationRail: Story = {
  render: () => <LeftNavigationRailDemo />,
}

/**
 * Active document breadcrumb header with canvas interaction mode switcher and share indicator.
 *
 * @summary Document breadcrumb header toolbar
 */
export const DocumentToolbar: Story = {
  render: () => <DocumentToolbarDemo />,
}
