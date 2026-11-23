import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Search, X } from 'lucide-react'
import {
  BrowserTabStrip,
  DocumentBreadcrumbHeader,
  DriveBreadcrumbBar,
  DriveFileIconTile,
  DriveFileListTable,
  DriveFilePreviewCard,
  DriveFolderCard,
  DriveFolderDialog,
  DriveMoveDialog,
  DrivePermanentDeleteDialog,
  DriveTrashList,
  FilterPillBar,
  NewAppButton,
  NewAppModal,
  SidebarRail,
  TRASH_RETENTION_DAYS,
  TemplateGalleryCard,
  getDescendantFolderIds,
  getFolderAncestors,
  getFolderItemCounts,
  getFolderPathLabel,
  getPermissionMeta,
  purgeExpiredTrashedDocs,
  seedDriveFolders,
} from '#/components/design-system'
import type {
  DriveViewMode,
  MarbleTemplateBlueprint,
  NewAppMode,
  OpenDocumentTab,
  PrimaryNavId,
  SortOption,
} from '#/components/design-system'
import {
  CursorAISidebar,
  SelectionSketchOverlay,
  connectedModelsFromSubscriptions,
} from '#/components/collaborator'
import type {
  ConnectedModelOption,
  MarbleIntentKind,
  MarbleIntentRequest,
  ManagedSubscription,
  RoleAssignments,
  StageNode,
} from '#/components/collaborator'
import {
  DEFAULT_ROLE_ASSIGNMENTS,
  SubscriptionModal,
} from '#/components/collaborator/SubscriptionModal'
import { ShareModal } from '#/components/collaborator/ShareModal'
import {
  nodeToElement,
  MarbleSourceInspector,
} from '#/components/workspace/MarbleSourceInspector'
import { DocsApp, LatexApp, NotesApp, SlidesApp } from '#/components/apps'
import {
  DOCUMENT_DESIGN_SYSTEM_SLUG,
  DOCUMENT_DONTS_SYSTEM_SLUG,
  INITIAL_AI_SUBSCRIPTIONS,
  INITIAL_WORKSPACE_DOCS,
  MarbleCollaborationError,
  PREDEFINED_MARBLE_TEMPLATES,
  applyMarbleOpsClient,
  buildInteractiveMarbleIframeDoc,
  byteSizeOf,
  countMarbleNodes,
  duplicateMarbleTemplate,
  generateMarbleCollaboration,
  inspectMarbleNodes,
  resolveEvergreenDesignContext,
} from '#/lib/marble'
import type { MarbleActionKind } from '#/lib/marble'
import {
  applyAntigravityStatusToSubscriptions,
  authenticateAntigravity,
  fetchAntigravityStatus,
  installAntigravityBinary,
  logoutAntigravity,
} from '#/lib/ai/antigravity-client'
import { toXDriveAntigravityModelId } from '#/lib/ai/antigravity-types'
import type {
  AntigravityAuthMethodId,
  AntigravityRuntimeStatus,
} from '#/lib/ai/antigravity-types'
import {
  applyOpenCodeGoStatusToSubscriptions,
  authenticateOpenCodeGo,
  fetchOpenCodeGoStatus,
  logoutOpenCodeGo,
} from '#/lib/ai/opencode-go-client'
import { toXDriveOpenCodeGoModelId } from '#/lib/ai/opencode-go-types'
import type { OpenCodeGoRuntimeStatus } from '#/lib/ai/opencode-go-types'
import type {
  AIMessage,
  AIModelSpec,
  AIProviderId,
  AISubscription,
  CanvasInteractionMode,
  DriveFolder,
  DriveFolderColor,
  MarbleAppCategory,
  MarbleCheckpoint,
  MarbleDocumentFile,
  MarbleOp,
  MarbleOpProposal,
  SelectedMarbleElement,
  SharePermissionLevel,
  SketchAnnotation,
  SketchStroke,
} from '#/lib/types'
import { cn } from '#/lib/utils'

export interface XDriveWorkspaceProps {
  initialTheme?: 'dark' | 'light'
  initialNav?: PrimaryNavId
  initialActiveTabId?: 'home' | string
  initialOpenDocIds?: string[]
  initialTrashedDocIds?: string[]
  trashRetentionDays?: number
  initialMode?: CanvasInteractionMode
  initialAiSidebarOpen?: boolean
  initialSimulatedRole?: SharePermissionLevel | 'owner'
  initialSelectedIds?: string[]
}

type SimulatedRole = SharePermissionLevel | 'owner'
type Place = { tabId: 'home' | string; nav: PrimaryNavId }
type Trail = { cursor: number; places: Place[] }
type LivePreview = { docId: string; ops: MarbleOp[]; run: number }
type NamerState = { sourceId: string; title: string }
type FolderModalState =
  | { mode: 'create'; parentId: string | null }
  | { mode: 'rename'; folder: DriveFolder }
type PermanentDeleteTarget =
  | { mode: 'single'; doc: MarbleDocumentFile }
  | { mode: 'empty' }
type TrashUndoBanner = { docId: string; title: string }
type PaletteItem = { id: string; label: string; hint: string; run: () => void }

const YOU = { name: 'You', initials: 'YO' }
const DEFAULT_OPEN = [
  'ws-week-12-ablations',
  'ws-logical-memory-spec',
  'ws-group-meeting',
]

const ROLE_LABEL: Record<SimulatedRole, string> = {
  owner: 'Owner',
  view_only: 'View only',
  comment_annotate: 'Propose',
  edit_no_ai: 'Edit only',
  edit_with_ai_byok: 'BYOK AI',
  edit_with_ai_shared: 'Shared AI',
}

const SIM_ROLES: SimulatedRole[] = [
  'view_only',
  'comment_annotate',
  'edit_no_ai',
  'edit_with_ai_byok',
  'edit_with_ai_shared',
]

const MODEL_FOR: Record<MarbleAppCategory, string> = {
  latex: 'Grok 4.7',
  notebook: 'Claude Sonnet',
  document: 'Gemini 4 Argon',
  slides: 'Grok 4.7',
  matrix: 'DeepSeek Flash',
  sandbox: 'Grok 4.7 Build Fast',
  custom: 'Grok 4.7',
}

const LIGHT_VARS: CSSProperties = {
  colorScheme: 'light',
  ['--xd-canvas' as string]: '#ffffff',
  ['--xd-rail' as string]: '#f7f8fa',
  ['--xd-elevated' as string]: '#f1f3f7',
  ['--xd-surface-hover' as string]: '#eaeef4',
  ['--xd-surface-active' as string]: '#e2e7f0',
  ['--xd-glass' as string]: 'rgba(255, 255, 255, 0.86)',
  ['--xd-ink' as string]: '#0f131a',
  ['--xd-ink-secondary' as string]: '#4a5568',
  ['--xd-ink-muted' as string]: '#718096',
  ['--xd-ink-subtle' as string]: '#94a3b8',
  ['--xd-border' as string]: '#e3e8ee',
  ['--xd-border-strong' as string]: '#cbd5e1',
  ['--xd-border-subtle' as string]: '#eef1f6',
  ['--xd-accent' as string]: '#5e6ad2',
  ['--xd-accent-hover' as string]: '#4e5ac0',
  ['--xd-accent-soft' as string]: 'rgba(94, 106, 210, 0.12)',
  ['--xd-accent-border' as string]: 'rgba(94, 106, 210, 0.35)',
  ['--xd-commit' as string]: '#1f9d6b',
  ['--xd-commit-soft' as string]: 'rgba(31, 157, 107, 0.12)',
  ['--xd-sketch' as string]: '#d9822b',
  ['--xd-sketch-soft' as string]: 'rgba(217, 130, 43, 0.14)',
  ['--xd-danger' as string]: '#e5484d',
  ['--xd-danger-soft' as string]: 'rgba(229, 72, 77, 0.12)',
  ['--background' as string]: '#ffffff',
  ['--foreground' as string]: '#0f131a',
  ['--border' as string]: '#e3e8ee',
  ['--input' as string]: '#e3e8ee',
  ['--ring' as string]: '#5e6ad2',
}

const DARK_VARS: CSSProperties = {
  colorScheme: 'dark',
  ['--xd-canvas' as string]: '#0b0c0e',
  ['--xd-rail' as string]: '#101216',
  ['--xd-elevated' as string]: '#161920',
  ['--xd-surface-hover' as string]: '#1c2029',
  ['--xd-surface-active' as string]: '#232834',
  ['--xd-glass' as string]: 'rgba(16, 18, 22, 0.88)',
  ['--xd-ink' as string]: '#f3f5f8',
  ['--xd-ink-secondary' as string]: '#a2abb8',
  ['--xd-ink-muted' as string]: '#6e7785',
  ['--xd-ink-subtle' as string]: '#4c5360',
  ['--xd-border' as string]: '#22252e',
  ['--xd-border-strong' as string]: '#313644',
  ['--xd-border-subtle' as string]: '#181b22',
  ['--xd-accent' as string]: '#5e6ad2',
  ['--xd-accent-hover' as string]: '#6e7ae2',
  ['--xd-accent-soft' as string]: 'rgba(94, 106, 210, 0.16)',
  ['--xd-accent-border' as string]: 'rgba(94, 106, 210, 0.45)',
  ['--xd-commit' as string]: '#2ea071',
  ['--xd-commit-soft' as string]: 'rgba(46, 160, 113, 0.16)',
  ['--xd-sketch' as string]: '#e59934',
  ['--xd-sketch-soft' as string]: 'rgba(229, 153, 52, 0.18)',
  ['--xd-danger' as string]: '#e5484d',
  ['--xd-danger-soft' as string]: 'rgba(229, 72, 77, 0.16)',
  ['--background' as string]: '#0b0c0e',
  ['--foreground' as string]: '#f3f5f8',
  ['--border' as string]: '#22252e',
  ['--input' as string]: '#22252e',
  ['--ring' as string]: '#5e6ad2',
}

const OP_TYPES = new Set<MarbleOp['type']>([
  'setText',
  'setInner',
  'setAttr',
  'insert',
  'move',
  'remove',
  'assignId',
])

function shortSha(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  }
  return Math.random().toString(16).slice(2, 14)
}

function relativeTime(iso: string): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return iso
  const minutes = Math.round((Date.now() - then) / 60000)
  if (Math.abs(minutes) < 1) return 'just now'
  if (Math.abs(minutes) < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 36) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 28) return `${days}d ago`
  return new Date(then).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function knownDocs(): MarbleDocumentFile[] {
  return [...INITIAL_WORKSPACE_DOCS, ...PREDEFINED_MARBLE_TEMPLATES]
}

function resolveOpenIds(ids: string[] | undefined, active?: string): string[] {
  const known = new Set(knownDocs().map((doc) => doc.id))
  const picked = (ids ?? DEFAULT_OPEN).filter((id) => known.has(id))
  const open = picked.length > 0 ? picked : [...DEFAULT_OPEN]
  if (
    active &&
    active !== 'home' &&
    known.has(active) &&
    !open.includes(active)
  ) {
    return [active, ...open]
  }
  return open
}

function toManaged(subscription: AISubscription): ManagedSubscription {
  return {
    ...subscription,
    models: subscription.models.map((model) => ({
      ...model,
      promptLabel: `${subscription.name} · ${model.name}`,
    })),
  }
}

function clip(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1)}…`
}

function isMarbleOp(value: unknown): value is MarbleOp {
  if (!value || typeof value !== 'object') return false
  const type = (value as { type?: unknown }).type
  return typeof type === 'string' && OP_TYPES.has(type as MarbleOp['type'])
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/["\\]/g, '\\$&')
}

function elementsFromSource(
  source: string,
  ids: string[],
): SelectedMarbleElement[] {
  let nodes: ReturnType<typeof inspectMarbleNodes> = []
  try {
    nodes = inspectMarbleNodes(source)
  } catch {
    return []
  }
  const byId = new Map(nodes.map((node) => [node.id, nodeToElement(node)]))
  return ids
    .map((id) => byId.get(id))
    .filter((item): item is SelectedMarbleElement => Boolean(item))
}

function fallbackNodes(source: string): StageNode[] {
  let records: ReturnType<typeof inspectMarbleNodes> = []
  try {
    records = inspectMarbleNodes(source)
  } catch {
    return []
  }
  const picked = records
    .filter((node) => node.affordances.length > 0)
    .slice(0, 14)
  const list = picked.length > 0 ? picked : records.slice(0, 8)
  return list.map((node, index) => ({
    id: node.id,
    tagName: node.tagName,
    textPreview: clip(node.text, 80),
    sourceSlice: node.sourceSlice.slice(0, 200),
    affordances: node.affordances,
    rect: { left: 4, top: 4 + index * 6.4, width: 92, height: 5.6 },
  }))
}

function measureNodes(
  frame: HTMLIFrameElement,
  source: string,
  selectedIds: string[],
): StageNode[] {
  const doc = frame.contentDocument
  const host = frame.getBoundingClientRect()
  if (!doc || host.width < 20 || host.height < 20) return fallbackNodes(source)
  let records: ReturnType<typeof inspectMarbleNodes> = []
  try {
    records = inspectMarbleNodes(source)
  } catch {
    return []
  }
  const measured: StageNode[] = []
  for (const record of records) {
    const el = doc.querySelector(`[data-marble-id="${cssEscape(record.id)}"]`)
    if (!el) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 8 || rect.height < 8) continue
    const box = {
      left: ((rect.left - host.left) / host.width) * 100,
      top: ((rect.top - host.top) / host.height) * 100,
      width: (rect.width / host.width) * 100,
      height: (rect.height / host.height) * 100,
    }
    if (box.top > 100 || box.left > 100 || box.top + box.height < 0) continue
    measured.push({
      id: record.id,
      tagName: record.tagName,
      textPreview: clip(record.text, 80),
      sourceSlice: record.sourceSlice.slice(0, 200),
      affordances: record.affordances,
      rect: box,
    })
  }
  const ranked = measured
    .filter(
      (node) =>
        node.rect.width * node.rect.height > 16 ||
        selectedIds.includes(node.id),
    )
    .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)
    .slice(0, 24)
  return ranked.length > 0 ? ranked : fallbackNodes(source)
}

function seedSelection(
  active: string | undefined,
  ids: string[] | undefined,
): Record<string, SelectedMarbleElement[]> {
  if (!active || active === 'home' || !ids?.length) return {}
  const doc = knownDocs().find((item) => item.id === active)
  if (!doc) return {}
  const elements = elementsFromSource(doc.source, ids)
  if (!elements.length) return {}
  return { [doc.id]: elements }
}

function modeFromShortcut(key: string): CanvasInteractionMode | null {
  if (key === '1') return 'direct'
  if (key === '2') return 'select'
  if (key === '3') return 'sketch'
  if (key === '4') return 'source'
  return null
}

function actionForIntent(kind: MarbleIntentKind): MarbleActionKind | undefined {
  if (kind === 'scale') return 'scale'
  if (kind === 'factory') return 'factory'
  if (kind === 'fork-alt') return 'fork_alt'
  if (kind === 'dtrt' || kind === 'polish') return 'dtrt'
  return undefined
}

function providerFor(
  modelId: string,
  models: ConnectedModelOption[],
): AIProviderId {
  const match = models.find((model) => model.id === modelId)
  if (match) return match.providerId
  if (modelId.startsWith('opencode-go/')) return 'opencode-go'
  if (modelId.startsWith('antigravity/') || modelId.startsWith('gemini')) {
    return 'antigravity'
  }
  if (modelId.startsWith('claude')) return 'claude'
  if (modelId.includes('gpt') || modelId.includes('openai')) return 'openai'
  if (modelId.includes('grok') || modelId.startsWith('xai/')) return 'xai'
  return 'antigravity'
}

function cleanStageNote(note: string): string {
  return note.replace(/^Stage\s+\d+\s+of\s+\d+:\s*/i, '')
}

function messageId(prefix: string): string {
  return `${prefix}-${shortSha()}`
}

function canCommit(role: SimulatedRole): boolean {
  return (
    role === 'owner' ||
    role === 'edit_with_ai_byok' ||
    role === 'edit_with_ai_shared'
  )
}

function effectivePermission(role: SimulatedRole): SharePermissionLevel {
  if (role === 'owner') return 'edit_with_ai_shared'
  return role
}

function matchesQuery(doc: MarbleDocumentFile, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = [
    doc.title,
    doc.fileName,
    doc.description,
    doc.folder,
    doc.tags.join(' '),
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(needle)
}

function compareDocs(
  a: MarbleDocumentFile,
  b: MarbleDocumentFile,
  sort: SortOption,
): number {
  if (Boolean(a.isEvergreen) !== Boolean(b.isEvergreen)) {
    return a.isEvergreen ? -1 : 1
  }
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  if (sort === 'nodes') return b.nodeCount - a.nodeCount
  if (sort === 'size') return b.byteSize - a.byteSize
  if (sort === 'title') return a.title.localeCompare(b.title)
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
}

function forCard(doc: MarbleDocumentFile): MarbleDocumentFile {
  return { ...doc, updatedAt: relativeTime(doc.updatedAt) }
}

function toBlueprint(doc: MarbleDocumentFile): MarbleTemplateBlueprint {
  return {
    id: doc.id,
    title: doc.title,
    fileName: doc.fileName,
    category: doc.category,
    description: doc.description,
    nodeCount: doc.nodeCount,
    byteSize: doc.byteSize,
    affordances: [],
    recommendedModel: MODEL_FOR[doc.category],
    previewHighlights: [],
  }
}

function adoptDocument(
  doc: MarbleDocumentFile,
  existing: MarbleDocumentFile[],
): MarbleDocumentFile {
  const slugs = new Set(existing.map((item) => item.slug))
  const ids = new Set(existing.map((item) => item.id))
  let id = doc.id
  if (ids.has(id)) id = `doc-${shortSha()}`
  let slug = doc.slug || 'app'
  let n = 2
  const base = slug
  while (slugs.has(slug)) {
    slug = `${base}-${n}`
    n += 1
  }
  return {
    ...doc,
    id,
    slug,
    fileName: `${slug}.mrbl`,
    isTemplate: false,
    folder: doc.folder || 'Workspace',
  }
}

function coalesceCheckpoint(
  existing: MarbleCheckpoint[],
  next: MarbleCheckpoint,
  op: MarbleOp,
): MarbleCheckpoint[] {
  const tip = existing.at(0)
  if (
    op.type === 'setText' &&
    tip &&
    tip.label === next.label &&
    Date.now() - tip.timestamp < 1200
  ) {
    return [
      { ...tip, timestamp: next.timestamp, source: next.source },
      ...existing.slice(1),
    ]
  }
  return [next, ...existing].slice(0, 40)
}

function isShared(doc: MarbleDocumentFile): boolean {
  return doc.share.isPublicLinkEnabled || doc.share.collaborators.length > 0
}

export function XDriveWorkspace({
  initialTheme = 'dark',
  initialNav = 'drive',
  initialActiveTabId = 'home',
  initialOpenDocIds,
  initialTrashedDocIds,
  trashRetentionDays = TRASH_RETENTION_DAYS,
  initialMode = 'direct',
  initialAiSidebarOpen = false,
  initialSimulatedRole = 'owner',
  initialSelectedIds,
}: XDriveWorkspaceProps) {
  const initialTrashedSet = useMemo(
    () => new Set(initialTrashedDocIds ?? []),
    [initialTrashedDocIds],
  )
  const [theme, setTheme] = useState(initialTheme)
  const [nav, setNav] = useState<PrimaryNavId>(initialNav)
  const [activeTabId, setActiveTabId] = useState<'home' | string>(() =>
    initialActiveTabId !== 'home' && initialTrashedSet.has(initialActiveTabId)
      ? 'home'
      : initialActiveTabId,
  )
  const [openTabIds, setOpenTabIds] = useState<string[]>(() =>
    resolveOpenIds(initialOpenDocIds, initialActiveTabId).filter(
      (id) => !initialTrashedSet.has(id),
    ),
  )
  const initialDrive = useMemo(() => {
    const nowMs = Date.now()
    const seeded = seedDriveFolders(
      INITIAL_WORKSPACE_DOCS.map((doc) => {
        if (!initialTrashedSet.has(doc.id)) return { ...doc }
        const index = (initialTrashedDocIds ?? []).indexOf(doc.id)
        const daysAgo = index <= 0 ? 2 : Math.min(26, 2 + index * 9)
        return {
          ...doc,
          trashedAt: new Date(
            nowMs - daysAgo * 24 * 60 * 60 * 1000,
          ).toISOString(),
        }
      }),
    )
    const { docs: prunedDocs } = purgeExpiredTrashedDocs(
      seeded.docs,
      nowMs,
      trashRetentionDays,
    )
    return { folders: seeded.folders, docs: prunedDocs }
  }, [initialTrashedDocIds, initialTrashedSet, trashRetentionDays])
  const [folders, setFolders] = useState<DriveFolder[]>(
    () => initialDrive.folders,
  )
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [folderModal, setFolderModal] = useState<FolderModalState | null>(null)
  const [moveDocId, setMoveDocId] = useState<string | null>(null)
  const [permanentDeleteTarget, setPermanentDeleteTarget] =
    useState<PermanentDeleteTarget | null>(null)
  const [trashUndo, setTrashUndo] = useState<TrashUndoBanner | null>(null)
  const [newAppModalMode, setNewAppModalMode] = useState<NewAppMode | null>(
    null,
  )
  const [docs, setDocs] = useState<MarbleDocumentFile[]>(
    () => initialDrive.docs,
  )
  const [templates, setTemplates] = useState<MarbleDocumentFile[]>(() =>
    PREDEFINED_MARBLE_TEMPLATES.map((doc) => ({ ...doc })),
  )
  const [trail, setTrail] = useState<Trail>({
    cursor: 0,
    places: [{ tabId: initialActiveTabId, nav: initialNav }],
  })
  const [aiSidebarOpen, setAiSidebarOpen] = useState(initialAiSidebarOpen)
  const [simulatedRole, setSimulatedRole] =
    useState<SimulatedRole>(initialSimulatedRole)
  const [modes, setModes] = useState<Record<string, CanvasInteractionMode>>(
    () => {
      if (!initialActiveTabId || initialActiveTabId === 'home') return {}
      return { [initialActiveTabId]: initialMode }
    },
  )
  const [selection, setSelection] = useState<
    Record<string, SelectedMarbleElement[]>
  >(() => seedSelection(initialActiveTabId, initialSelectedIds))
  const [sketches, setSketches] = useState<Record<string, SketchAnnotation[]>>(
    {},
  )
  const [strokes, setStrokes] = useState<Record<string, SketchStroke[]>>({})
  const [stageNodes, setStageNodes] = useState<StageNode[]>([])
  const [threads, setThreads] = useState<Partial<Record<string, AIMessage[]>>>(
    {},
  )
  const [livePreview, setLivePreview] = useState<LivePreview | null>(null)
  const [subscriptions, setSubscriptions] = useState<ManagedSubscription[]>(
    () => INITIAL_AI_SUBSCRIPTIONS.map(toManaged),
  )
  const [roles, setRoles] = useState<RoleAssignments>(DEFAULT_ROLE_ASSIGNMENTS)
  const [modelId, setModelId] = useState('antigravity/default')
  const [antigravityStatus, setAntigravityStatus] =
    useState<AntigravityRuntimeStatus | null>(null)
  const [antigravityBusy, setAntigravityBusy] = useState<string | null>(null)
  const [antigravityError, setAntigravityError] = useState<string | null>(null)
  const [openCodeGoStatus, setOpenCodeGoStatus] =
    useState<OpenCodeGoRuntimeStatus | null>(null)
  const [openCodeGoBusy, setOpenCodeGoBusy] = useState<string | null>(null)
  const [openCodeGoError, setOpenCodeGoError] = useState<string | null>(null)
  const [thinkingState, setThinkingState] = useState<{
    threadId: string
    label: string
  } | null>(null)
  const [category, setCategory] = useState<MarbleAppCategory | 'all'>('all')
  const [sortBy, setSortBy] = useState<SortOption>('updated')
  const [viewMode, setViewMode] = useState<DriveViewMode>('preview')
  const [searchQuery, setSearchQuery] = useState('')
  const [shareId, setShareId] = useState<string | null>(null)
  const [namer, setNamer] = useState<NamerState | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [paletteIndex, setPaletteIndex] = useState(0)
  const [agentStatus, setAgentStatus] = useState<string | null>(null)
  const [frameDoc, setFrameDoc] = useState('')

  const activeTabRef = useRef(activeTabId)
  activeTabRef.current = activeTabId
  const libraryRef = useRef<MarbleDocumentFile[]>([])
  const allDocsRef = useRef<MarbleDocumentFile[]>([])
  const sourceRef = useRef(new Map<string, string>())
  const previewRun = useRef(0)
  const shownSourceRef = useRef<string | null>(null)
  const shownSigRef = useRef('')
  const saveTokens = useRef(new Map<string, number>())
  const timers = useRef<number[]>([])
  const hostOpRef = useRef<
    (op: MarbleOp, options?: { look?: boolean }) => void
  >(() => {})
  const selectRef = useRef<(element: SelectedMarbleElement) => void>(() => {})
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const richStageRef = useRef<HTMLDivElement | null>(null)

  const activeDocs = useMemo(
    () => docs.filter((doc) => !doc.trashedAt),
    [docs],
  )
  const trashedDocs = useMemo(
    () =>
      docs
        .filter((doc) => Boolean(doc.trashedAt))
        .slice()
        .sort(
          (a, b) =>
            Date.parse(b.trashedAt ?? b.updatedAt) -
            Date.parse(a.trashedAt ?? a.updatedAt),
        ),
    [docs],
  )
  const filteredTrashedDocs = useMemo(
    () => trashedDocs.filter((doc) => matchesQuery(doc, searchQuery)),
    [trashedDocs, searchQuery],
  )

  const library = useMemo(
    () => [...activeDocs, ...templates],
    [activeDocs, templates],
  )
  libraryRef.current = library
  allDocsRef.current = [...docs, ...templates]
  for (const doc of library) sourceRef.current.set(doc.id, doc.source)

  const findDoc = (id: string | null | undefined) =>
    library.find((doc) => doc.id === id) ?? null
  const activeDoc = activeTabId === 'home' ? null : findDoc(activeTabId)
  const mode: CanvasInteractionMode = activeDoc
    ? (modes[activeDoc.id] ?? 'direct')
    : 'direct'
  const selected = activeDoc ? (selection[activeDoc.id] ?? []) : []
  const selectedIds = selected.map((element) => element.id)
  const docSketches = activeDoc ? (sketches[activeDoc.id] ?? []) : []
  const docStrokes = activeDoc ? (strokes[activeDoc.id] ?? []) : []
  const permission = effectivePermission(simulatedRole)
  const driveThread = threads.drive
  const thread = activeDoc ? (threads[activeDoc.id] ?? []) : (driveThread ?? [])
  const previewOps =
    activeDoc && livePreview?.docId === activeDoc.id ? livePreview.ops : null

  const previewSource = useMemo(() => {
    if (!activeDoc || !previewOps?.length) return null
    try {
      return applyMarbleOpsClient(activeDoc.source, previewOps).source
    } catch {
      return null
    }
  }, [activeDoc, previewOps])

  const connectedModels = useMemo(() => {
    const live = connectedModelsFromSubscriptions(subscriptions)
    return live.length > 0 ? live : []
  }, [subscriptions])

  const composerModels = useMemo<
    Pick<AIModelSpec, 'id' | 'name' | 'providerId' | 'badge' | 'role'>[]
  >(() => {
    const connected = subscriptions.filter(
      (subscription) =>
        subscription.connected && subscription.status !== 'disconnected',
    )
    const source = connected.length > 0 ? connected : subscriptions
    return source.flatMap((subscription) =>
      subscription.models.map((model) => ({
        id: model.id,
        name: `${model.name} (${subscription.name})`,
        providerId: model.providerId,
        badge: subscription.name,
        role: model.role,
      })),
    )
  }, [subscriptions])

  const folderAncestors = useMemo(
    () => getFolderAncestors(folders, currentFolderId),
    [folders, currentFolderId],
  )

  const folderItemCounts = useMemo(
    () => getFolderItemCounts(folders, activeDocs),
    [folders, activeDocs],
  )

  const visibleFolders = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase()
    return folders
      .filter((folder) => folder.parentId === currentFolderId)
      .filter(
        (folder) => !needle || folder.name.toLowerCase().includes(needle),
      )
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [folders, currentFolderId, searchQuery])

  const filteredDocs = useMemo(() => {
    const scoped =
      currentFolderId === null
        ? activeDocs
        : activeDocs.filter((doc) => doc.folderId === currentFolderId)
    return scoped
      .filter((doc) => category === 'all' || doc.category === category)
      .filter((doc) => matchesQuery(doc, searchQuery))
      .slice()
      .sort((a, b) => compareDocs(a, b, sortBy))
  }, [activeDocs, currentFolderId, category, searchQuery, sortBy])

  const starredDocs = useMemo(() => {
    return activeDocs
      .filter((doc) => doc.starred)
      .filter((doc) => category === 'all' || doc.category === category)
      .filter((doc) => matchesQuery(doc, searchQuery))
      .slice()
      .sort((a, b) => compareDocs(a, b, sortBy))
  }, [activeDocs, category, searchQuery, sortBy])

  const sharedDocs = useMemo(() => activeDocs.filter(isShared), [activeDocs])
  const blueprints = useMemo(() => templates.map(toBlueprint), [templates])
  const evergreenDocs = useMemo(
    () =>
      activeDocs.filter(
        (doc) =>
          doc.isEvergreen ||
          doc.slug === DOCUMENT_DESIGN_SYSTEM_SLUG ||
          doc.slug === DOCUMENT_DONTS_SYSTEM_SLUG,
      ),
    [activeDocs],
  )
  const evergreenRefs = useMemo(
    () => resolveEvergreenDesignContext(evergreenDocs).refs,
    [evergreenDocs],
  )

  const recentProposals = useMemo(() => {
    return library
      .flatMap((doc) =>
        doc.intentHistory.map((proposal) => ({ proposal, doc })),
      )
      .sort((a, b) => b.proposal.createdAt - a.proposal.createdAt)
      .slice(0, 8)
  }, [library])

  const pendingProposals = useMemo(() => {
    return Object.values(threads)
      .flatMap((messages) => messages ?? [])
      .filter(
        (message) =>
          message.proposal?.status === 'proposed' ||
          message.proposal?.status === 'thinking',
      ).length
  }, [threads])

  const openTabs: OpenDocumentTab[] = openTabIds
    .map((id) => findDoc(id))
    .filter((doc): doc is MarbleDocumentFile => Boolean(doc))
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      fileName: doc.fileName,
      category: doc.category,
      nodeCount: doc.nodeCount,
      syncState: doc.syncState,
    }))

  const pinnedApps = activeDocs
    .filter((doc) => doc.pinned)
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      fileName: doc.fileName,
      category: doc.category,
      nodeCount: doc.nodeCount,
    }))

  const sidebarKey = activeDoc?.id ?? 'drive'

  function applyLiveAntigravityStatus(status: AntigravityRuntimeStatus) {
    setAntigravityStatus(status)
    setSubscriptions((prev) =>
      applyAntigravityStatusToSubscriptions(prev, status),
    )
    if (status.authenticated) {
      const preferred = status.currentModelId
        ? toXDriveAntigravityModelId(status.currentModelId)
        : status.models[0]
          ? toXDriveAntigravityModelId(status.models[0].id)
          : 'antigravity/default'
      setModelId((current) =>
        current === 'antigravity/default' ||
        (!current.startsWith('antigravity/') &&
          !current.startsWith('opencode-go/'))
          ? preferred
          : current,
      )
      setRoles((prev) => ({
        implementation:
          prev.implementation === 'antigravity/default'
            ? preferred
            : prev.implementation,
        exploration:
          prev.exploration === 'antigravity/default'
            ? preferred
            : prev.exploration,
        review: prev.review === 'antigravity/default' ? preferred : prev.review,
        design: prev.design === 'antigravity/default' ? preferred : prev.design,
      }))
    }
  }

  function applyLiveOpenCodeGoStatus(status: OpenCodeGoRuntimeStatus) {
    setOpenCodeGoStatus(status)
    setSubscriptions((prev) =>
      applyOpenCodeGoStatusToSubscriptions(prev, status),
    )
    if (status.authenticated && status.entitled) {
      const preferred = status.currentModelId
        ? toXDriveOpenCodeGoModelId(status.currentModelId)
        : status.models[0]
          ? toXDriveOpenCodeGoModelId(status.models[0].id)
          : 'opencode-go/glm-5.3'
      setModelId((current) =>
        current === 'antigravity/default' ? preferred : current,
      )
      setRoles((prev) => ({
        implementation:
          prev.implementation === 'antigravity/default'
            ? preferred
            : prev.implementation,
        exploration:
          prev.exploration === 'antigravity/default'
            ? preferred
            : prev.exploration,
        review: prev.review === 'antigravity/default' ? preferred : prev.review,
        design: prev.design === 'antigravity/default' ? preferred : prev.design,
      }))
    }
  }

  async function refreshOpenCodeGo() {
    setOpenCodeGoBusy('refresh')
    setOpenCodeGoError(null)
    try {
      const status = await fetchOpenCodeGoStatus()
      applyLiveOpenCodeGoStatus(status)
    } catch (error) {
      setOpenCodeGoError(
        error instanceof Error
          ? error.message
          : 'Could not reach OpenCode Go backend.',
      )
    } finally {
      setOpenCodeGoBusy(null)
    }
  }

  async function handleAuthenticateOpenCodeGo(options?: { apiKey?: string }) {
    setOpenCodeGoBusy('authenticate')
    setOpenCodeGoError(null)
    try {
      const status = await authenticateOpenCodeGo(options)
      applyLiveOpenCodeGoStatus(status)
      if (status.authenticated && status.entitled) {
        setAgentStatus(
          `Connected OpenCode Go with ${status.models.length} model${status.models.length === 1 ? '' : 's'}.`,
        )
      }
    } catch (error) {
      setOpenCodeGoError(
        error instanceof Error
          ? error.message
          : 'OpenCode Go connection failed.',
      )
    } finally {
      setOpenCodeGoBusy(null)
    }
  }

  async function handleLogoutOpenCodeGo() {
    setOpenCodeGoBusy('logout')
    setOpenCodeGoError(null)
    try {
      const status = await logoutOpenCodeGo()
      applyLiveOpenCodeGoStatus(status)
      setAgentStatus('Disconnected OpenCode Go.')
    } catch (error) {
      setOpenCodeGoError(
        error instanceof Error ? error.message : 'Disconnect failed.',
      )
    } finally {
      setOpenCodeGoBusy(null)
    }
  }

  async function refreshAntigravity() {
    setAntigravityBusy('refresh')
    setAntigravityError(null)
    try {
      const status = await fetchAntigravityStatus()
      applyLiveAntigravityStatus(status)
    } catch (error) {
      setAntigravityError(
        error instanceof Error
          ? error.message
          : 'Could not reach Antigravity ACP backend.',
      )
    } finally {
      setAntigravityBusy(null)
    }
  }

  async function handleAuthenticateAntigravity(
    methodId: AntigravityAuthMethodId | string,
    options?: { apiKey?: string },
  ) {
    setAntigravityBusy(methodId)
    setAntigravityError(null)
    try {
      const status = await authenticateAntigravity(methodId, options)
      applyLiveAntigravityStatus(status)
      if (status.authenticated) {
        setAgentStatus(
          `Connected Google Antigravity (${status.tier || 'Google AI Plan'}) with ${status.models.length || 1} model${status.models.length === 1 ? '' : 's'}.`,
        )
      }
    } catch (error) {
      setAntigravityError(
        error instanceof Error
          ? error.message
          : 'Google Antigravity sign-in failed.',
      )
    } finally {
      setAntigravityBusy(null)
    }
  }

  async function handleLogoutAntigravity() {
    setAntigravityBusy('logout')
    setAntigravityError(null)
    try {
      const status = await logoutAntigravity()
      applyLiveAntigravityStatus(status)
      setAgentStatus('Signed out of Google Antigravity.')
    } catch (error) {
      setAntigravityError(
        error instanceof Error ? error.message : 'Sign-out failed.',
      )
    } finally {
      setAntigravityBusy(null)
    }
  }

  async function handleInstallAntigravityBinary() {
    setAntigravityBusy('install')
    setAntigravityError(null)
    try {
      const status = await installAntigravityBinary()
      applyLiveAntigravityStatus(status)
      setAgentStatus(
        'Installed official Google Antigravity ACP binary from the ACP Registry.',
      )
    } catch (error) {
      setAntigravityError(
        error instanceof Error
          ? error.message
          : 'Failed to install official Antigravity ACP binary.',
      )
    } finally {
      setAntigravityBusy(null)
    }
  }

  useEffect(() => {
    let active = true
    void fetchAntigravityStatus()
      .then((status) => {
        if (!active) return
        applyLiveAntigravityStatus(status)
      })
      .catch(() => {
        // Static/Storybook environments do not expose /api/ai.
      })
    void fetchOpenCodeGoStatus()
      .then((status) => {
        if (!active) return
        applyLiveOpenCodeGoStatus(status)
      })
      .catch(() => {
        // Static/Storybook environments do not expose /api/ai.
      })
    return () => {
      active = false
    }
  }, [])

  function patchFile(
    id: string,
    updater: (doc: MarbleDocumentFile) => MarbleDocumentFile,
  ) {
    setDocs((prev) =>
      prev.some((doc) => doc.id === id)
        ? prev.map((doc) => (doc.id === id ? updater(doc) : doc))
        : prev,
    )
    setTemplates((prev) =>
      prev.some((doc) => doc.id === id)
        ? prev.map((doc) => (doc.id === id ? updater(doc) : doc))
        : prev,
    )
  }

  function visit(tabId: 'home' | string, nextNav: PrimaryNavId) {
    setActiveTabId(tabId)
    setNav(nextNav)
    setTrail((prev) => {
      const trimmed = prev.places.slice(0, prev.cursor + 1)
      const last = trimmed.at(-1)
      if (last && last.tabId === tabId && last.nav === nextNav) return prev
      const places = [...trimmed, { tabId, nav: nextNav }]
      return { cursor: places.length - 1, places }
    })
  }

  function go(delta: -1 | 1) {
    const cursor = trail.cursor + delta
    const place = trail.places.at(cursor)
    if (!place) return
    setTrail({ ...trail, cursor })
    setActiveTabId(place.tabId)
    setNav(place.nav)
  }

  function openDocument(id: string) {
    setOpenTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    visit(id, nav)
  }

  function closeTab(id: string) {
    setOpenTabIds((prev) => prev.filter((tabId) => tabId !== id))
    if (activeTabRef.current !== id) return
    const remaining = openTabIds.filter((tabId) => tabId !== id)
    visit(remaining[remaining.length - 1] ?? 'home', nav)
  }

  function setMode(id: string, next: CanvasInteractionMode) {
    setModes((prev) => ({ ...prev, [id]: next }))
  }

  function setDocSelection(id: string, elements: SelectedMarbleElement[]) {
    setSelection((prev) => ({ ...prev, [id]: elements }))
  }

  function persist(
    id: string,
    slug: string,
    prior: string,
    ops: MarbleOp[],
    nextSource: string,
  ) {
    const token = (saveTokens.current.get(id) ?? 0) + 1
    saveTokens.current.set(id, token)
    const body =
      ops.length > 0
        ? { action: 'apply_ops', slug, source: prior, ops }
        : { action: 'save', slug, source: nextSource }
    void fetch('/api/marble', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((response) => {
        if (!response.ok) throw new Error('Marble save failed')
        if (saveTokens.current.get(id) !== token) return
        patchFile(id, (doc) =>
          doc.syncState === 'saving' ? { ...doc, syncState: 'saved' } : doc,
        )
      })
      .catch(() => {
        if (saveTokens.current.get(id) !== token) return
        patchFile(id, (doc) => ({ ...doc, syncState: 'retrying' }))
      })
  }

  function rememberProposal(id: string, proposal: MarbleOpProposal) {
    patchFile(id, (doc) => ({
      ...doc,
      intentHistory: [
        proposal,
        ...doc.intentHistory.filter((item) => item.id !== proposal.id),
      ].slice(0, 20),
    }))
  }

  function upsertThreadMessage(docId: string, message: AIMessage) {
    setThreads((prev) => {
      const current = prev[docId] ?? []
      const exists = current.some((item) => item.id === message.id)
      const next = exists
        ? current.map((item) => (item.id === message.id ? message : item))
        : [...current, message]
      return { ...prev, [docId]: next }
    })
  }

  hostOpRef.current = (op, options) => {
    const id = activeTabRef.current
    if (!id || id === 'home' || !isMarbleOp(op)) return
    const prior = sourceRef.current.get(id)
    const meta = libraryRef.current.find((doc) => doc.id === id)
    if (!prior || !meta) return
    let applied: { source: string }
    try {
      applied = applyMarbleOpsClient(prior, [op])
    } catch {
      patchFile(id, (doc) => ({ ...doc, syncState: 'retrying' }))
      return
    }
    sourceRef.current.set(id, applied.source)
    if (livePreview?.docId === id) {
      previewRun.current += 1
      setLivePreview(null)
    } else {
      shownSourceRef.current = applied.source
    }
    const label = `${options?.look ? 'Look · ' : ''}${op.type}${op.id ? ` #${op.id}` : ''}`
    const checkpoint: MarbleCheckpoint = {
      sha: shortSha(),
      label,
      timestamp: Date.now(),
      author: YOU.name,
      opsCount: 1,
      source: applied.source,
      note: options?.look ? 'Look gesture persisted with the file.' : undefined,
    }
    patchFile(id, (doc) => ({
      ...doc,
      source: applied.source,
      nodeCount: countMarbleNodes(applied.source),
      byteSize: byteSizeOf(applied.source),
      version: doc.version + 1,
      updatedAt: new Date().toISOString(),
      syncState: 'saving',
      lastEditedBy: YOU,
      checkpoints: coalesceCheckpoint(doc.checkpoints, checkpoint, op),
    }))
    persist(id, meta.slug, prior, [op], applied.source)
  }

  selectRef.current = (element) => {
    const id = activeTabRef.current
    if (!id || id === 'home') return
    setDocSelection(id, [element])
    setAiSidebarOpen(true)
  }

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data
      if (!data || typeof data !== 'object') return
      const type = (data as { type?: unknown }).type
      if (type === 'marble:op' && isMarbleOp((data as { op?: unknown }).op)) {
        const options = (data as { options?: { look?: boolean } }).options
        hostOpRef.current((data as { op: MarbleOp }).op, options)
      }
      if (type === 'marble:select-node') {
        const element = (data as { element?: SelectedMarbleElement }).element
        if (element?.id) selectRef.current(element)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
        return
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false)
        return
      }
      const target = event.target
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return
      const id = activeTabRef.current
      if (!id || id === 'home') return
      const modeKey = modeFromShortcut(event.key)
      if (!modeKey) return
      event.preventDefault()
      setModes((prev) => ({ ...prev, [id]: modeKey }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    return () => {
      for (const timer of timers.current) window.clearTimeout(timer)
    }
  }, [])

  const activeDocId = activeDoc?.id ?? null
  useEffect(() => {
    if (!activeDocId) return
    const doc = libraryRef.current.find((item) => item.id === activeDocId)
    if (!doc) return
    setStageNodes(fallbackNodes(doc.source))
  }, [activeDocId])

  const proposedKey =
    previewOps?.map((op) => `${op.type}:${op.id ?? ''}`).join(',') ?? ''
  const frameSelectedKey = (mode === 'source' ? selectedIds : []).join('|')

  useEffect(() => {
    if (!activeDocId) return
    const doc = libraryRef.current.find((item) => item.id === activeDocId)
    if (!doc) return
    const display = previewSource ?? sourceRef.current.get(doc.id) ?? doc.source
    const sig = `${doc.id}|${mode}|${permission}|${theme}|${frameSelectedKey}|${proposedKey}`
    if (shownSourceRef.current === display && shownSigRef.current === sig)
      return
    shownSourceRef.current = display
    shownSigRef.current = sig
    const frameSelected = frameSelectedKey ? frameSelectedKey.split('|') : []
    setFrameDoc(
      buildInteractiveMarbleIframeDoc(display, {
        appSlug: doc.slug,
        mode,
        permission,
        theme,
        selectedIds: frameSelected,
        proposedIds: previewOps
          ? frameSelected.concat(
              previewOps
                .map((op) => op.id)
                .filter((id): id is string => Boolean(id)),
            )
          : [],
      }),
    )
  }, [
    activeDocId,
    previewSource,
    mode,
    permission,
    theme,
    frameSelectedKey,
    proposedKey,
    previewOps,
  ])

  function measureFrame(frame: HTMLIFrameElement) {
    frameRef.current = frame
    const id = activeTabRef.current
    const doc = libraryRef.current.find((item) => item.id === id)
    if (!doc) return
    const ids = (selection[doc.id] ?? []).map((element) => element.id)
    setStageNodes(
      measureNodes(frame, sourceRef.current.get(doc.id) ?? doc.source, ids),
    )
  }

  function playStages(
    docId: string,
    assistant: AIMessage,
    fullOps: MarbleOp[],
  ) {
    const stages = assistant.stages ?? []
    const run = ++previewRun.current
    const total = Math.max(stages.length, 1)
    for (let index = 0; index < total; index += 1) {
      const timer = window.setTimeout(
        () => {
          if (previewRun.current !== run) return
          const done = index === total - 1
          setThreads((prev) => {
            const current = prev[docId] ?? []
            return {
              ...prev,
              [docId]: current.map((message) => {
                if (
                  message.id !== assistant.id ||
                  !message.proposal ||
                  !message.stages
                ) {
                  return message
                }
                if (
                  message.proposal.status === 'committed' ||
                  message.proposal.status === 'discarded'
                ) {
                  return message
                }
                const nextStages = message.stages.map((stage, stageIndex) =>
                  stageIndex <= index ? { ...stage, completed: true } : stage,
                )
                const currentStage = nextStages.at(index)
                const note = currentStage
                  ? `Stage ${index + 1} of ${total}: ${currentStage.note}`
                  : message.proposal.note
                const proposal: MarbleOpProposal = {
                  ...message.proposal,
                  status: done ? 'proposed' : 'thinking',
                  stage: `Stage ${index + 1} of ${total}`,
                  note,
                }
                return { ...message, stages: nextStages, proposal }
              }),
            }
          })
          const completedOps = stages
            .slice(0, index + 1)
            .flatMap((stage) => stage.ops)
          setLivePreview({
            docId,
            run,
            ops: done ? fullOps : completedOps,
          })
          if (done) {
            const proposal = assistant.proposal
            if (proposal) {
              rememberProposal(docId, {
                ...proposal,
                status: 'proposed',
                stage: `Stage ${total} of ${total}`,
              })
            }
          }
        },
        420 * (index + 1),
      )
      timers.current.push(timer)
    }
  }

  async function collaborate(input: {
    doc: MarbleDocumentFile | null
    instruction: string
    model: string
    providerId: AIProviderId
    action?: MarbleActionKind
    selectedElements?: SelectedMarbleElement[]
    sketchAnnotations?: SketchAnnotation[]
    targetFolderId?: string | null
  }) {
    const instruction = input.instruction.trim()
    if (!instruction) return
    setAgentStatus(null)
    setAiSidebarOpen(true)
    const user: AIMessage = {
      id: messageId('user'),
      role: 'user',
      content: instruction,
      timestamp: new Date().toISOString(),
      modelId: input.model,
      providerId: input.providerId,
      attachedElements: input.selectedElements,
      attachedSketches: input.sketchAnnotations,
    }
    const threadId = input.doc?.id ?? 'drive'
    upsertThreadMessage(threadId, user)
    setThinkingState({
      threadId,
      label:
        input.providerId === 'opencode-go'
          ? `Running OpenCode Go (${input.model.replace(/^opencode-go\//, '')})…`
          : `Running Google Antigravity ACP (${input.model.replace(/^antigravity\//, '')})…`,
    })
    try {
      const liveEvergreen = libraryRef.current.filter(
        (item) =>
          item.isEvergreen ||
          item.slug === DOCUMENT_DESIGN_SYSTEM_SLUG ||
          item.slug === DOCUMENT_DONTS_SYSTEM_SLUG,
      )
      const result = await generateMarbleCollaboration({
        source: input.doc?.source ?? '',
        instruction,
        modelId: input.model,
        providerId: input.providerId,
        sessionId: input.doc?.slug ?? threadId,
        action: input.action,
        selectedElements: input.selectedElements,
        sketchAnnotations: input.sketchAnnotations,
        evergreenDocs: liveEvergreen,
      })
      if (result.newDocument) {
        const adopted = adoptDocument(result.newDocument, allDocsRef.current)
        const resolvedFolderId =
          input.targetFolderId !== undefined
            ? input.targetFolderId
            : currentFolderId
        const targetFolder = resolvedFolderId
          ? folders.find((f) => f.id === resolvedFolderId)
          : null
        const created: MarbleDocumentFile = {
          ...adopted,
          folderId: targetFolder ? targetFolder.id : null,
          folder: targetFolder ? targetFolder.name : 'My Drive',
        }
        setDocs((prev) => [created, ...prev])
        setOpenTabIds((prev) =>
          prev.includes(created.id) ? prev : [...prev, created.id],
        )
        visit(created.id, 'drive')
        const assistant: AIMessage = {
          id: messageId('assistant'),
          role: 'assistant',
          content: result.proposal.note,
          timestamp: new Date().toISOString(),
          modelId: result.runtime?.modelId ?? input.model,
          providerId: input.providerId,
          runtimeSource: result.source,
          thoughts: result.thoughts,
          proposal: { ...result.proposal, status: 'committed' },
          stages: result.stages.map((stage) => ({ ...stage, completed: true })),
        }
        setThreads((prev) => ({
          ...prev,
          [created.id]: [user, assistant],
        }))
        rememberProposal(created.id, {
          ...result.proposal,
          status: 'committed',
        })
        persist(created.id, created.slug, created.source, [], created.source)
        setAgentStatus(`Opened ${created.fileName}`)
        return
      }
      if (!input.doc) {
        setAgentStatus('Name a document, or ask for a new .mrbl app.')
        return
      }
      const stages = (
        result.stages.length > 0
          ? result.stages
          : [
              {
                stageNumber: 1,
                totalStages: 1,
                note: result.proposal.note,
                ops: result.proposal.ops,
                completed: false,
              },
            ]
      ).map((stage, index, all) => ({
        ...stage,
        stageNumber: index + 1,
        totalStages: all.length,
        note: cleanStageNote(stage.note),
        completed: false,
      }))
      let inverse = result.proposal.inverseOps
      if (
        (!inverse || inverse.length === 0) &&
        result.proposal.ops.length > 0
      ) {
        try {
          inverse = applyMarbleOpsClient(
            input.doc.source,
            result.proposal.ops,
          ).inverseOps
        } catch {
          inverse = result.proposal.inverseOps
        }
      }
      const proposal: MarbleOpProposal = {
        ...result.proposal,
        inverseOps: inverse,
        status: 'thinking',
        stage: `Stage 1 of ${stages.length}`,
        note: `Stage 1 of ${stages.length}: ${stages[0]?.note ?? result.proposal.note}`,
      }
      const assistant: AIMessage = {
        id: messageId('assistant'),
        role: 'assistant',
        content: result.proposal.note,
        timestamp: new Date().toISOString(),
        modelId: result.runtime?.modelId ?? input.model,
        providerId: input.providerId,
        runtimeSource: result.source,
        thoughts: result.thoughts,
        stages,
        proposal,
      }
      upsertThreadMessage(input.doc.id, assistant)
      rememberProposal(input.doc.id, proposal)
      playStages(input.doc.id, assistant, proposal.ops)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The collaborator failed'
      if (error instanceof MarbleCollaborationError) {
        if (
          input.providerId === 'opencode-go' &&
          (error.code === 'AUTH_REQUIRED' ||
            error.code === 'ENTITLEMENT_REQUIRED' ||
            error.code === 'RATE_LIMITED')
        ) {
          void refreshOpenCodeGo()
        } else if (
          error.code === 'AUTH_REQUIRED' ||
          error.code === 'BINARY_MISSING'
        ) {
          void refreshAntigravity()
        }
      }
      setAgentStatus(message)
      upsertThreadMessage(threadId, {
        id: messageId('system'),
        role: 'system',
        content: message,
        timestamp: new Date().toISOString(),
      })
    } finally {
      setThinkingState((current) =>
        current?.threadId === threadId ? null : current,
      )
    }
  }

  function buildApp(
    prompt: string,
    nextModelId: string,
    targetFolderId?: string | null,
  ) {
    setModelId(nextModelId)
    void collaborate({
      doc: null,
      instruction: prompt,
      model: nextModelId,
      providerId: providerFor(nextModelId, connectedModels),
      action: 'new_app',
      targetFolderId,
    })
  }

  function createAppFromTemplate(input: {
    template: MarbleDocumentFile
    title: string
    folderId: string | null
  }) {
    const copy = duplicateMarbleTemplate(
      input.template,
      input.title.trim() || input.template.title,
      YOU.name,
    )
    const targetFolder = input.folderId
      ? folders.find((f) => f.id === input.folderId)
      : null
    const adopted = adoptDocument(copy, allDocsRef.current)
    const placed: MarbleDocumentFile = {
      ...adopted,
      folderId: targetFolder ? targetFolder.id : null,
      folder: targetFolder ? targetFolder.name : 'My Drive',
    }
    setDocs((prev) => [placed, ...prev])
    setOpenTabIds((prev) => [...prev, placed.id])
    visit(placed.id, 'drive')
    persist(placed.id, placed.slug, placed.source, [], placed.source)
    setAgentStatus(`Created ${placed.fileName} from ${input.template.title}`)
  }

  function onIntent(request: MarbleIntentRequest) {
    if (!activeDoc) return
    const elements = elementsFromSource(activeDoc.source, request.targetIds)
    const fromStage = new Map(selected.map((element) => [element.id, element]))
    const attached = request.targetIds
      .map(
        (id) =>
          fromStage.get(id) ?? elements.find((element) => element.id === id),
      )
      .filter((item): item is SelectedMarbleElement => Boolean(item))
    void collaborate({
      doc: activeDoc,
      instruction: request.instruction,
      model: request.modelId,
      providerId: request.providerId,
      action: actionForIntent(request.kind),
      selectedElements: attached.length > 0 ? attached : selected,
      sketchAnnotations: request.sketches ?? docSketches,
    })
  }

  function keepProposal(proposalId: string) {
    if (!activeDoc || !canCommit(simulatedRole)) return
    const message = (threads[activeDoc.id] ?? []).find(
      (item) => item.proposal?.id === proposalId,
    )
    const proposal = message?.proposal
    if (
      !proposal ||
      proposal.status === 'committed' ||
      proposal.status === 'discarded'
    ) {
      return
    }
    previewRun.current += 1
    let applied: { source: string; inverseOps: MarbleOp[] }
    try {
      applied = applyMarbleOpsClient(activeDoc.source, proposal.ops)
    } catch (error) {
      setAgentStatus(
        error instanceof Error ? error.message : 'Could not apply ops',
      )
      return
    }
    const committed: MarbleOpProposal = {
      ...proposal,
      status: 'committed',
      inverseOps: proposal.inverseOps ?? applied.inverseOps,
    }
    const checkpoint: MarbleCheckpoint = {
      sha: shortSha(),
      label: committed.note,
      timestamp: Date.now(),
      author: YOU.name,
      opsCount: committed.ops.length,
      source: applied.source,
      note: committed.instruction,
    }
    sourceRef.current.set(activeDoc.id, applied.source)
    setLivePreview(null)
    patchFile(activeDoc.id, (doc) => ({
      ...doc,
      source: applied.source,
      nodeCount: countMarbleNodes(applied.source),
      byteSize: byteSizeOf(applied.source),
      version: doc.version + 1,
      updatedAt: new Date().toISOString(),
      syncState: 'saving',
      lastEditedBy: {
        name: committed.modelId,
        initials: 'AI',
        isAi: true,
        modelBadge: committed.modelId,
      },
      checkpoints: [checkpoint, ...doc.checkpoints].slice(0, 40),
      intentHistory: doc.intentHistory.map((item) =>
        item.id === committed.id ? committed : item,
      ),
    }))
    setThreads((prev) => ({
      ...prev,
      [activeDoc.id]: (prev[activeDoc.id] ?? []).map((item) =>
        item.proposal?.id === committed.id
          ? { ...item, proposal: committed }
          : item,
      ),
    }))
    persist(
      activeDoc.id,
      activeDoc.slug,
      activeDoc.source,
      committed.ops,
      applied.source,
    )
  }

  function discardProposal(proposalId: string) {
    if (!activeDoc) return
    previewRun.current += 1
    setLivePreview(null)
    const discardedAt = (threads[activeDoc.id] ?? []).find(
      (item) => item.proposal?.id === proposalId,
    )?.proposal
    if (!discardedAt) return
    const discarded: MarbleOpProposal = { ...discardedAt, status: 'discarded' }
    setThreads((prev) => ({
      ...prev,
      [activeDoc.id]: (prev[activeDoc.id] ?? []).map((item) =>
        item.proposal?.id === proposalId
          ? { ...item, proposal: discarded }
          : item,
      ),
    }))
    rememberProposal(activeDoc.id, discarded)
  }

  function commitDuplicate(title: string) {
    if (!namer) return
    const sourceDoc = findDoc(namer.sourceId)
    if (!sourceDoc) {
      setNamer(null)
      return
    }
    const copy = duplicateMarbleTemplate(
      sourceDoc,
      title.trim() || `${sourceDoc.title} copy`,
      YOU.name,
    )
    const targetFolderId = sourceDoc.isTemplate
      ? currentFolderId
      : (sourceDoc.folderId ?? currentFolderId)
    const targetFolder = targetFolderId
      ? folders.find((f) => f.id === targetFolderId)
      : null
    const adopted = adoptDocument(copy, allDocsRef.current)
    const placed: MarbleDocumentFile = {
      ...adopted,
      folderId: targetFolder ? targetFolder.id : null,
      folder: targetFolder ? targetFolder.name : 'My Drive',
    }
    setDocs((prev) => [placed, ...prev])
    setOpenTabIds((prev) => [...prev, placed.id])
    setNamer(null)
    visit(placed.id, 'drive')
    persist(placed.id, placed.slug, placed.source, [], placed.source)
  }

  function navigateToFolder(folderId: string | null) {
    setCurrentFolderId(folderId)
    visit('home', 'drive')
  }

  function submitFolderModal(name: string, color: DriveFolderColor) {
    if (!folderModal) return
    const now = new Date().toISOString()
    if (folderModal.mode === 'create') {
      const created: DriveFolder = {
        id: `folder-${shortSha()}`,
        name,
        parentId: folderModal.parentId,
        color,
        createdAt: now,
        updatedAt: now,
      }
      setFolders((prev) => [...prev, created])
    } else {
      setFolders((prev) =>
        prev.map((folder) =>
          folder.id === folderModal.folder.id
            ? { ...folder, name, color, updatedAt: now }
            : folder,
        ),
      )
      setDocs((prev) =>
        prev.map((doc) =>
          doc.folderId === folderModal.folder.id
            ? { ...doc, folder: name }
            : doc,
        ),
      )
    }
    setFolderModal(null)
  }

  function deleteFolder(folder: DriveFolder) {
    const removed = getDescendantFolderIds(folders, folder.id)
    const parentName = folder.parentId
      ? (folders.find((f) => f.id === folder.parentId)?.name ?? 'My Drive')
      : 'My Drive'
    setFolders((prev) => prev.filter((item) => !removed.has(item.id)))
    setDocs((prev) =>
      prev.map((doc) =>
        doc.folderId && removed.has(doc.folderId)
          ? { ...doc, folderId: folder.parentId, folder: parentName }
          : doc,
      ),
    )
    if (currentFolderId && removed.has(currentFolderId)) {
      setCurrentFolderId(folder.parentId)
    }
  }

  function moveDocumentToFolder(docId: string, targetFolderId: string | null) {
    const targetFolder = targetFolderId
      ? folders.find((f) => f.id === targetFolderId)
      : null
    const folderName = targetFolder ? targetFolder.name : 'My Drive'
    patchFile(docId, (doc) => ({
      ...doc,
      folderId: targetFolder ? targetFolder.id : null,
      folder: folderName,
      updatedAt: new Date().toISOString(),
    }))
    setMoveDocId(null)
  }

  function toggleFlag(id: string, flag: 'starred' | 'pinned') {
    patchFile(id, (doc) => ({ ...doc, [flag]: !doc[flag] }))
  }

  function syncTrashApi(body: Record<string, unknown>) {
    void fetch('/api/marble', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {
      // Static/Storybook environments do not expose /api/marble.
    })
  }

  function cleanupRemovedDocIds(removedIds: Set<string>) {
    if (removedIds.size === 0) return
    setOpenTabIds((prev) => prev.filter((id) => !removedIds.has(id)))
    if (activeTabRef.current !== 'home' && removedIds.has(activeTabRef.current)) {
      const remaining = openTabIds.filter((id) => !removedIds.has(id))
      visit(remaining[remaining.length - 1] ?? 'home', nav)
    }
    setSelection((prev) => {
      const next = { ...prev }
      for (const id of removedIds) delete next[id]
      return next
    })
    setSketches((prev) => {
      const next = { ...prev }
      for (const id of removedIds) delete next[id]
      return next
    })
    setStrokes((prev) => {
      const next = { ...prev }
      for (const id of removedIds) delete next[id]
      return next
    })
    setModes((prev) => {
      const next = { ...prev }
      for (const id of removedIds) delete next[id]
      return next
    })
    setThreads((prev) => {
      const next = { ...prev }
      for (const id of removedIds) delete next[id]
      return next
    })
    for (const id of removedIds) sourceRef.current.delete(id)
    setLivePreview((prev) =>
      prev && removedIds.has(prev.docId) ? null : prev,
    )
    setShareId((prev) => (prev && removedIds.has(prev) ? null : prev))
    setMoveDocId((prev) => (prev && removedIds.has(prev) ? null : prev))
    setTrashUndo((prev) => (prev && removedIds.has(prev.docId) ? null : prev))
  }

  function moveDocumentToTrash(docId: string) {
    const target = docs.find((doc) => doc.id === docId)
    if (!target || target.trashedAt || target.isTemplate) return
    const trashedAt = new Date().toISOString()
    setDocs((prev) =>
      prev.map((doc) => (doc.id === docId ? { ...doc, trashedAt } : doc)),
    )
    if (openTabIds.includes(docId)) {
      closeTab(docId)
    }
    if (livePreview?.docId === docId) setLivePreview(null)
    if (shareId === docId) setShareId(null)
    if (moveDocId === docId) setMoveDocId(null)
    setTrashUndo({ docId: target.id, title: target.title })
    syncTrashApi({ action: 'trash', slug: target.slug, trashedAt })
  }

  function restoreDocumentFromTrash(docId: string) {
    const target = docs.find((doc) => doc.id === docId)
    if (!target || !target.trashedAt) return
    const parentFolder = target.folderId
      ? folders.find((folder) => folder.id === target.folderId)
      : null
    const restoredFolderId = parentFolder ? parentFolder.id : null
    const restoredFolderName = parentFolder ? parentFolder.name : 'My Drive'
    setDocs((prev) =>
      prev.map((doc) =>
        doc.id === docId
          ? {
              ...doc,
              trashedAt: null,
              folderId: restoredFolderId,
              folder: restoredFolderName,
            }
          : doc,
      ),
    )
    setTrashUndo((prev) => (prev?.docId === docId ? null : prev))
    setAgentStatus(`Restored "${target.title}" to ${restoredFolderName}`)
    syncTrashApi({ action: 'restore', slug: target.slug })
  }

  function permanentlyDeleteDocument(docId: string) {
    const target = docs.find((doc) => doc.id === docId)
    if (!target) {
      setPermanentDeleteTarget(null)
      return
    }
    setDocs((prev) => prev.filter((doc) => doc.id !== docId))
    cleanupRemovedDocIds(new Set([docId]))
    setPermanentDeleteTarget(null)
    setAgentStatus(`Permanently deleted "${target.title}"`)
    syncTrashApi({ action: 'delete', slug: target.slug })
  }

  function emptyTrash() {
    if (trashedDocs.length === 0) {
      setPermanentDeleteTarget(null)
      return
    }
    const removedIds = new Set(trashedDocs.map((doc) => doc.id))
    const count = trashedDocs.length
    setDocs((prev) => prev.filter((doc) => !removedIds.has(doc.id)))
    cleanupRemovedDocIds(removedIds)
    setPermanentDeleteTarget(null)
    setAgentStatus(
      `Permanently deleted ${count} ${count === 1 ? 'file' : 'files'} from Trash`,
    )
    syncTrashApi({ action: 'empty_trash' })
  }

  useEffect(() => {
    const purgeNow = () => {
      let purgedDocs: MarbleDocumentFile[] = []
      setDocs((prev) => {
        const result = purgeExpiredTrashedDocs(
          prev,
          Date.now(),
          trashRetentionDays,
        )
        if (result.purged.length === 0) return prev
        purgedDocs = result.purged
        return result.docs
      })
      if (purgedDocs.length > 0) {
        syncTrashApi({
          action: 'purge_expired',
          retentionDays: trashRetentionDays,
        })
      }
    }
    purgeNow()
    const timer = window.setInterval(purgeNow, 60 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [trashRetentionDays])

  const paletteItems: PaletteItem[] = (() => {
    const needle = paletteQuery.trim().toLowerCase()
    const views: PaletteItem[] = [
      {
        id: 'action-new-ai',
        label: 'New app with AI agent',
        hint: 'Build a .mrbl app from a prompt',
        run: () => setNewAppModalMode('agent'),
      },
      {
        id: 'action-new-template',
        label: 'New app from template',
        hint: 'Choose from your templates',
        run: () => setNewAppModalMode('templates'),
      },
      {
        id: 'nav-drive',
        label: 'My Drive',
        hint: 'Browse folders and .mrbl apps',
        run: () => navigateToFolder(null),
      },
      {
        id: 'nav-starred',
        label: 'Starred',
        hint: 'Starred files',
        run: () => visit('home', 'starred'),
      },
      {
        id: 'nav-trash',
        label: 'Trash',
        hint:
          trashedDocs.length > 0
            ? `${trashedDocs.length} trashed · clears after ${trashRetentionDays}d`
            : `Auto-clears after ${trashRetentionDays} days`,
        run: () => visit('home', 'trash'),
      },
      {
        id: 'nav-templates',
        label: 'Templates',
        hint: 'Predefined .mrbl templates',
        run: () => visit('home', 'templates'),
      },
      {
        id: 'nav-shared',
        label: 'Shared',
        hint: 'Permissions and visitor roles',
        run: () => visit('home', 'shared'),
      },
      {
        id: 'nav-subs',
        label: 'Models',
        hint: 'Connected providers',
        run: () => visit('home', 'subscriptions'),
      },
    ]
    const folderItems: PaletteItem[] = folders.map((folder) => ({
      id: folder.id,
      label: folder.name,
      hint: `Folder · ${getFolderPathLabel(folders, folder.parentId)}`,
      run: () => navigateToFolder(folder.id),
    }))
    const files: PaletteItem[] = library.map((doc) => ({
      id: doc.id,
      label: doc.title,
      hint: doc.fileName,
      run: () => openDocument(doc.id),
    }))
    return [...views, ...folderItems, ...files]
      .filter((item) => {
        if (!needle) return true
        return `${item.label} ${item.hint}`.toLowerCase().includes(needle)
      })
      .slice(0, 12)
  })()

  useEffect(() => {
    setPaletteIndex(0)
  }, [paletteQuery, paletteOpen])

  const shareDoc = findDoc(shareId)
  const frameTitle = activeDoc ? `${activeDoc.title} .mrbl app` : 'Marble app'
  const richAppKind = activeDoc
    ? activeDoc.category === 'notebook'
      ? 'notes'
      : activeDoc.category === 'slides'
        ? 'slides'
        : activeDoc.category === 'latex'
          ? 'latex'
          : activeDoc.category === 'document' && !activeDoc.isEvergreen
            ? 'docs'
            : null
    : null

  const appDisplaySource = activeDoc ? (previewSource ?? activeDoc.source) : ''
  const appReadOnly =
    permission === 'view_only' || permission === 'comment_annotate'

  function handleRichAppSourceChange(nextSource: string, label: string) {
    if (!activeDoc) return
    const id = activeDoc.id
    const prior = sourceRef.current.get(id) ?? activeDoc.source
    if (prior === nextSource) return
    sourceRef.current.set(id, nextSource)
    shownSourceRef.current = nextSource
    const checkpoint: MarbleCheckpoint = {
      sha: shortSha(),
      label,
      timestamp: Date.now(),
      author: YOU.name,
      opsCount: 1,
      source: nextSource,
    }
    patchFile(id, (doc) => ({
      ...doc,
      source: nextSource,
      nodeCount: countMarbleNodes(nextSource),
      byteSize: byteSizeOf(nextSource),
      version: doc.version + 1,
      updatedAt: new Date().toISOString(),
      syncState: 'saving',
      lastEditedBy: YOU,
      checkpoints: coalesceCheckpoint(doc.checkpoints, checkpoint, {
        type: 'setText',
      }),
    }))
    persist(id, activeDoc.slug, prior, [], nextSource)
  }

  useEffect(() => {
    if (!richAppKind || !activeDoc) return
    const hostEl = richStageRef.current
    if (!hostEl) return
    const host = hostEl.getBoundingClientRect()
    if (host.width < 20 || host.height < 20) return
    const els = Array.from(hostEl.querySelectorAll('[data-marble-id]'))
    const measured: StageNode[] = []
    for (const el of els) {
      const id = el.getAttribute('data-marble-id')
      if (!id) continue
      const rect = el.getBoundingClientRect()
      if (rect.width < 8 || rect.height < 8) continue
      const box = {
        left: ((rect.left - host.left) / host.width) * 100,
        top: ((rect.top - host.top) / host.height) * 100,
        width: (rect.width / host.width) * 100,
        height: (rect.height / host.height) * 100,
      }
      if (box.top > 100 || box.left > 100 || box.top + box.height < 0) continue
      measured.push({
        id,
        tagName: el.tagName.toLowerCase(),
        textPreview: clip(el.textContent || '', 80),
        sourceSlice: `<${el.tagName.toLowerCase()} data-marble-id="${id}">`,
        affordances: ['editable'],
        rect: box,
      })
    }
    if (measured.length > 0) setStageNodes(measured.slice(0, 24))
  }, [richAppKind, activeDoc, mode])

  const frame =
    richAppKind === 'notes' && activeDoc ? (
      <div ref={richStageRef} className="h-full w-full min-h-0">
        <NotesApp
          key={activeDoc.id}
          marbleSource={appDisplaySource}
          onMarbleSourceChange={handleRichAppSourceChange}
          readOnly={appReadOnly}
        />
      </div>
    ) : richAppKind === 'docs' && activeDoc ? (
      <div ref={richStageRef} className="h-full w-full min-h-0">
        <DocsApp
          key={activeDoc.id}
          marbleSource={appDisplaySource}
          onMarbleSourceChange={handleRichAppSourceChange}
          readOnly={appReadOnly}
        />
      </div>
    ) : richAppKind === 'slides' && activeDoc ? (
      <div ref={richStageRef} className="h-full w-full min-h-0">
        <SlidesApp
          key={activeDoc.id}
          marbleSource={appDisplaySource}
          onMarbleSourceChange={handleRichAppSourceChange}
          readOnly={appReadOnly}
        />
      </div>
    ) : richAppKind === 'latex' && activeDoc ? (
      <div ref={richStageRef} className="h-full w-full min-h-0">
        <LatexApp
          key={activeDoc.id}
          marbleSource={appDisplaySource}
          onMarbleSourceChange={handleRichAppSourceChange}
          readOnly={appReadOnly}
        />
      </div>
    ) : (
      <iframe
        title={frameTitle}
        srcDoc={frameDoc}
        onLoad={(event) => measureFrame(event.currentTarget)}
        className="block h-full w-full border-0 bg-[var(--xd-canvas)]"
      />
    )

  return (
    <div
      data-component="xdrive-workspace"
      className={cn(
        'flex h-screen min-h-0 w-full flex-col overflow-hidden bg-[var(--xd-canvas)] text-[var(--xd-ink)]',
        theme === 'dark' && 'dark',
      )}
      style={theme === 'dark' ? DARK_VARS : LIGHT_VARS}
    >
      <BrowserTabStrip
        openTabs={openTabs}
        activeTabId={activeDoc ? activeDoc.id : 'home'}
        onSelectTab={(tabId) => visit(tabId, nav)}
        onCloseTab={closeTab}
        onNewTab={() => visit('home', 'drive')}
        canGoBack={trail.cursor > 0}
        canGoForward={trail.cursor < trail.places.length - 1}
        onBack={() => go(-1)}
        onForward={() => go(1)}
        simulatedRole={simulatedRole}
        onClearRoleSimulation={() => setSimulatedRole('owner')}
        theme={theme}
        onToggleTheme={() =>
          setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
        }
        aiSidebarOpen={aiSidebarOpen}
        onToggleAiSidebar={() => setAiSidebarOpen((open) => !open)}
        pendingProposalsCount={pendingProposals}
      />
      <div className="flex min-h-0 flex-1">
        <SidebarRail
          activeNav={nav}
          onSelectNav={(next) => visit('home', next)}
          onOpenCommandPalette={() => setPaletteOpen(true)}
          topAction={
            <NewAppButton
              templates={templates}
              onOpenAIAgent={() => setNewAppModalMode('agent')}
              onOpenTemplates={() => setNewAppModalMode('templates')}
              onQuickCreateTemplate={(tpl) =>
                createAppFromTemplate({
                  template: tpl,
                  title: tpl.title,
                  folderId: currentFolderId,
                })
              }
              onCreateFolder={() =>
                setFolderModal({ mode: 'create', parentId: currentFolderId })
              }
            />
          }
          folders={folders}
          activeFolderId={currentFolderId}
          onSelectFolder={(folderId) => navigateToFolder(folderId)}
          onCreateFolder={(parentId) =>
            setFolderModal({ mode: 'create', parentId })
          }
          onDropDocOnFolder={moveDocumentToFolder}
          trashCount={trashedDocs.length}
          onDropDocOnTrash={moveDocumentToTrash}
          pinnedApps={pinnedApps}
          activeAppId={activeDoc?.id}
          onSelectApp={openDocument}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {activeDoc ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <DocumentBreadcrumbHeader
                folder={getFolderPathLabel(
                  folders,
                  activeDoc.folderId,
                  activeDoc.folder,
                )}
                onClickFolder={() =>
                  navigateToFolder(activeDoc.folderId ?? null)
                }
                category={activeDoc.category}
                fileName={activeDoc.fileName}
                syncState={activeDoc.syncState}
                interactionMode={mode}
                onChangeInteractionMode={(next) => setMode(activeDoc.id, next)}
                onDuplicate={() =>
                  setNamer({
                    sourceId: activeDoc.id,
                    title: `${activeDoc.title} copy`,
                  })
                }
                onOpenShare={() => setShareId(activeDoc.id)}
                onMoveToTrash={
                  !activeDoc.isTemplate
                    ? () => moveDocumentToTrash(activeDoc.id)
                    : undefined
                }
                sharePermission={
                  simulatedRole === 'owner'
                    ? activeDoc.share.publicPermission
                    : simulatedRole
                }
                isPublicLinkEnabled={activeDoc.share.isPublicLinkEnabled}
              />
              <div className="min-h-0 flex-1">
                {mode === 'source' ? (
                  <div className="flex h-full min-h-0">
                    <div className="min-w-0 flex-1">{frame}</div>
                    <MarbleSourceInspector
                      fileName={activeDoc.fileName}
                      source={activeDoc.source}
                      selectedId={selectedIds[0] ?? null}
                      onSelectNode={(element) => {
                        setDocSelection(activeDoc.id, [element])
                        setAiSidebarOpen(true)
                      }}
                      onApplySource={(nextSource, ops) => {
                        const prior = activeDoc.source
                        sourceRef.current.set(activeDoc.id, nextSource)
                        const checkpoint: MarbleCheckpoint = {
                          sha: shortSha(),
                          label: 'Source diff',
                          timestamp: Date.now(),
                          author: YOU.name,
                          opsCount: ops.length,
                          source: nextSource,
                          note: 'Applied from the source inspector.',
                        }
                        patchFile(activeDoc.id, (doc) => ({
                          ...doc,
                          source: nextSource,
                          nodeCount: countMarbleNodes(nextSource),
                          byteSize: byteSizeOf(nextSource),
                          version: doc.version + 1,
                          updatedAt: new Date().toISOString(),
                          syncState: 'saving',
                          lastEditedBy: YOU,
                          checkpoints: [checkpoint, ...doc.checkpoints].slice(
                            0,
                            40,
                          ),
                        }))
                        persist(
                          activeDoc.id,
                          activeDoc.slug,
                          prior,
                          ops,
                          nextSource,
                        )
                      }}
                    />
                  </div>
                ) : (
                  <SelectionSketchOverlay
                    mode={mode}
                    nodes={stageNodes}
                    permission={permission}
                    models={connectedModels}
                    modelId={modelId}
                    onModelChange={setModelId}
                    selectedIds={selectedIds}
                    onSelectedIdsChange={(ids) => {
                      const fromStage = new Map(
                        stageNodes.map((node) => [
                          node.id,
                          {
                            id: node.id,
                            tagName: node.tagName,
                            textPreview: node.textPreview,
                            sourceSlice: node.sourceSlice,
                            affordances: node.affordances,
                            rect: node.rect,
                          } satisfies SelectedMarbleElement,
                        ]),
                      )
                      const resolved = ids.map(
                        (id) =>
                          fromStage.get(id) ??
                          elementsFromSource(activeDoc.source, [id])[0],
                      )
                      setDocSelection(
                        activeDoc.id,
                        resolved.filter((item): item is SelectedMarbleElement =>
                          Boolean(item),
                        ),
                      )
                    }}
                    sketches={docSketches}
                    onSketchesChange={(nextSketches, nextStrokes) => {
                      setSketches((prev) => ({
                        ...prev,
                        [activeDoc.id]: nextSketches,
                      }))
                      setStrokes((prev) => ({
                        ...prev,
                        [activeDoc.id]: nextStrokes,
                      }))
                    }}
                    onIntent={onIntent}
                    fileName={activeDoc.fileName}
                    className="h-full min-h-0"
                  >
                    {frame}
                  </SelectionSketchOverlay>
                )}
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {(nav === 'drive' || nav === 'agent-studio') && (
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-6">
                  <DriveBreadcrumbBar
                    ancestors={folderAncestors}
                    folderCount={visibleFolders.length}
                    itemCount={filteredDocs.length}
                    onNavigateFolder={navigateToFolder}
                    onCreateFolder={() =>
                      setFolderModal({
                        mode: 'create',
                        parentId: currentFolderId,
                      })
                    }
                    onDropDocOnFolder={moveDocumentToFolder}
                  />

                  {agentStatus && (
                    <div className="flex items-center justify-between rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2 text-[12px] text-[var(--xd-ink-secondary)]">
                      <span>{agentStatus}</span>
                      <button
                        type="button"
                        onClick={() => setAgentStatus(null)}
                        aria-label="Dismiss status"
                        className="text-[var(--xd-ink-muted)] hover:text-[var(--xd-ink)]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  <FilterPillBar
                    selectedCategory={category}
                    onSelectCategory={setCategory}
                    sortBy={sortBy}
                    onSelectSort={setSortBy}
                    viewMode={viewMode}
                    onChangeViewMode={setViewMode}
                    searchQuery={searchQuery}
                    onChangeSearchQuery={setSearchQuery}
                  />

                  {visibleFolders.length === 0 && filteredDocs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--xd-border-strong)] py-14 text-center">
                      <p className="text-[13px] font-medium text-[var(--xd-ink)]">
                        {currentFolderId
                          ? 'This folder is empty'
                          : 'No matching files or folders'}
                      </p>
                      <p className="mt-1 text-[12px] text-[var(--xd-ink-muted)]">
                        {currentFolderId
                          ? 'Create a subfolder or drag files here from My Drive.'
                          : 'Try clearing your search or category filter.'}
                      </p>
                      {currentFolderId && (
                        <button
                          type="button"
                          onClick={() =>
                            setFolderModal({
                              mode: 'create',
                              parentId: currentFolderId,
                            })
                          }
                          className="mt-3 rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-3 py-1.5 text-[12px] font-medium text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)]"
                        >
                          Create subfolder
                        </button>
                      )}
                    </div>
                  ) : viewMode === 'list' ? (
                    <DriveFileListTable
                      folders={visibleFolders}
                      folderCounts={folderItemCounts}
                      docs={filteredDocs.map(forCard)}
                      resolveFolderLabel={(doc) =>
                        getFolderPathLabel(folders, doc.folderId, doc.folder)
                      }
                      onOpenFolder={(folder) => navigateToFolder(folder.id)}
                      onCreateSubfolder={(folder) =>
                        setFolderModal({ mode: 'create', parentId: folder.id })
                      }
                      onRenameFolder={(folder) =>
                        setFolderModal({ mode: 'rename', folder })
                      }
                      onDeleteFolder={deleteFolder}
                      onDropDocOnFolder={moveDocumentToFolder}
                      onOpenDoc={(doc) => openDocument(doc.id)}
                      onMoveDoc={(doc) => setMoveDocId(doc.id)}
                      onDuplicateDoc={(doc) =>
                        setNamer({
                          sourceId: doc.id,
                          title: `${doc.title} copy`,
                        })
                      }
                      onShareDoc={(doc) => setShareId(doc.id)}
                      onToggleStar={(doc) => toggleFlag(doc.id, 'starred')}
                      onTogglePin={(doc) => toggleFlag(doc.id, 'pinned')}
                      onDeleteDoc={(doc) => moveDocumentToTrash(doc.id)}
                    />
                  ) : (
                    <div className="space-y-6">
                      {visibleFolders.length > 0 && (
                        <section className="space-y-2.5">
                          <h2 className="text-[12px] font-medium text-[var(--xd-ink-secondary)]">
                            Folders
                          </h2>
                          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                            {visibleFolders.map((folder) => (
                              <DriveFolderCard
                                key={folder.id}
                                folder={folder}
                                itemCount={
                                  folderItemCounts.get(folder.id)?.total ?? 0
                                }
                                onOpen={(target) => navigateToFolder(target.id)}
                                onCreateSubfolder={(target) =>
                                  setFolderModal({
                                    mode: 'create',
                                    parentId: target.id,
                                  })
                                }
                                onRename={(target) =>
                                  setFolderModal({
                                    mode: 'rename',
                                    folder: target,
                                  })
                                }
                                onDelete={deleteFolder}
                                onDropDoc={moveDocumentToFolder}
                              />
                            ))}
                          </div>
                        </section>
                      )}

                      {filteredDocs.length > 0 && (
                        <section className="space-y-2.5">
                          <h2 className="text-[12px] font-medium text-[var(--xd-ink-secondary)]">
                            Files
                          </h2>
                          {viewMode === 'preview' ? (
                            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                              {filteredDocs.map((doc) => (
                                <DriveFilePreviewCard
                                  key={doc.id}
                                  doc={forCard(doc)}
                                  folderLabel={getFolderPathLabel(
                                    folders,
                                    doc.folderId,
                                    doc.folder,
                                  )}
                                  onOpen={() => openDocument(doc.id)}
                                  onMove={() => setMoveDocId(doc.id)}
                                  onDuplicate={() =>
                                    setNamer({
                                      sourceId: doc.id,
                                      title: `${doc.title} copy`,
                                    })
                                  }
                                  onShare={() => setShareId(doc.id)}
                                  onToggleStar={() =>
                                    toggleFlag(doc.id, 'starred')
                                  }
                                  onTogglePin={() =>
                                    toggleFlag(doc.id, 'pinned')
                                  }
                                  onDelete={() => moveDocumentToTrash(doc.id)}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                              {filteredDocs.map((doc) => (
                                <DriveFileIconTile
                                  key={doc.id}
                                  doc={forCard(doc)}
                                  onOpen={() => openDocument(doc.id)}
                                  onMove={() => setMoveDocId(doc.id)}
                                  onDuplicate={() =>
                                    setNamer({
                                      sourceId: doc.id,
                                      title: `${doc.title} copy`,
                                    })
                                  }
                                  onShare={() => setShareId(doc.id)}
                                  onToggleStar={() =>
                                    toggleFlag(doc.id, 'starred')
                                  }
                                  onTogglePin={() =>
                                    toggleFlag(doc.id, 'pinned')
                                  }
                                  onDelete={() => moveDocumentToTrash(doc.id)}
                                />
                              ))}
                            </div>
                          )}
                        </section>
                      )}
                    </div>
                  )}
                </div>
              )}

              {nav === 'starred' && (
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-6">
                  <div className="flex items-center justify-between">
                    <h1 className="text-[16px] font-semibold tracking-tight">
                      Starred
                    </h1>
                    <span className="xd-tabular text-[12px] text-[var(--xd-ink-muted)]">
                      {starredDocs.length}{' '}
                      {starredDocs.length === 1 ? 'file' : 'files'}
                    </span>
                  </div>

                  <FilterPillBar
                    selectedCategory={category}
                    onSelectCategory={setCategory}
                    sortBy={sortBy}
                    onSelectSort={setSortBy}
                    viewMode={viewMode}
                    onChangeViewMode={setViewMode}
                    searchQuery={searchQuery}
                    onChangeSearchQuery={setSearchQuery}
                  />

                  {starredDocs.length === 0 ? (
                    <p className="py-12 text-center text-[13px] text-[var(--xd-ink-muted)]">
                      Star files in My Drive to keep them here.
                    </p>
                  ) : viewMode === 'list' ? (
                    <DriveFileListTable
                      folders={[]}
                      docs={starredDocs.map(forCard)}
                      resolveFolderLabel={(doc) =>
                        getFolderPathLabel(folders, doc.folderId, doc.folder)
                      }
                      onOpenDoc={(doc) => openDocument(doc.id)}
                      onMoveDoc={(doc) => setMoveDocId(doc.id)}
                      onDuplicateDoc={(doc) =>
                        setNamer({
                          sourceId: doc.id,
                          title: `${doc.title} copy`,
                        })
                      }
                      onShareDoc={(doc) => setShareId(doc.id)}
                      onToggleStar={(doc) => toggleFlag(doc.id, 'starred')}
                      onTogglePin={(doc) => toggleFlag(doc.id, 'pinned')}
                      onDeleteDoc={(doc) => moveDocumentToTrash(doc.id)}
                    />
                  ) : viewMode === 'icon' ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                      {starredDocs.map((doc) => (
                        <DriveFileIconTile
                          key={doc.id}
                          doc={forCard(doc)}
                          onOpen={() => openDocument(doc.id)}
                          onMove={() => setMoveDocId(doc.id)}
                          onDuplicate={() =>
                            setNamer({
                              sourceId: doc.id,
                              title: `${doc.title} copy`,
                            })
                          }
                          onShare={() => setShareId(doc.id)}
                          onToggleStar={() => toggleFlag(doc.id, 'starred')}
                          onTogglePin={() => toggleFlag(doc.id, 'pinned')}
                          onDelete={() => moveDocumentToTrash(doc.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                      {starredDocs.map((doc) => (
                        <DriveFilePreviewCard
                          key={doc.id}
                          doc={forCard(doc)}
                          folderLabel={getFolderPathLabel(
                            folders,
                            doc.folderId,
                            doc.folder,
                          )}
                          onOpen={() => openDocument(doc.id)}
                          onMove={() => setMoveDocId(doc.id)}
                          onDuplicate={() =>
                            setNamer({
                              sourceId: doc.id,
                              title: `${doc.title} copy`,
                            })
                          }
                          onShare={() => setShareId(doc.id)}
                          onToggleStar={() => toggleFlag(doc.id, 'starred')}
                          onTogglePin={() => toggleFlag(doc.id, 'pinned')}
                          onDelete={() => moveDocumentToTrash(doc.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {nav === 'trash' && (
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <h1 className="text-[16px] font-semibold tracking-tight">
                        Trash
                      </h1>
                      <span className="xd-tabular text-[12px] text-[var(--xd-ink-muted)]">
                        {trashedDocs.length}{' '}
                        {trashedDocs.length === 1 ? 'file' : 'files'}
                      </span>
                    </div>

                    {trashedDocs.length > 0 && (
                      <div className="relative w-full max-w-xs">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--xd-ink-muted)]" />
                        <input
                          type="search"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search in Trash…"
                          aria-label="Search in Trash"
                          className="h-7 w-full rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] pl-8 pr-2.5 text-[12px] text-[var(--xd-ink)] placeholder:text-[var(--xd-ink-muted)] focus:border-[var(--xd-accent)] focus:outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {agentStatus && (
                    <div className="flex items-center justify-between rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2 text-[12px] text-[var(--xd-ink-secondary)]">
                      <span>{agentStatus}</span>
                      <button
                        type="button"
                        onClick={() => setAgentStatus(null)}
                        aria-label="Dismiss status"
                        className="text-[var(--xd-ink-muted)] hover:text-[var(--xd-ink)]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  <DriveTrashList
                    docs={filteredTrashedDocs}
                    totalCount={trashedDocs.length}
                    retentionDays={trashRetentionDays}
                    resolveFolderLabel={(doc) =>
                      getFolderPathLabel(folders, doc.folderId, doc.folder)
                    }
                    formatTrashedAt={relativeTime}
                    onRestoreDoc={(doc) => restoreDocumentFromTrash(doc.id)}
                    onDeleteForeverDoc={(doc) =>
                      setPermanentDeleteTarget({ mode: 'single', doc })
                    }
                    onEmptyTrash={() =>
                      setPermanentDeleteTarget({ mode: 'empty' })
                    }
                  />
                </div>
              )}

              {nav === 'templates' && (
                <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-6">
                  <h1 className="text-[16px] font-semibold tracking-tight">
                    Templates
                  </h1>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {blueprints.map((template) => (
                      <TemplateGalleryCard
                        key={template.id}
                        template={template}
                        onPreviewTemplate={() => openDocument(template.id)}
                        onDuplicateTemplate={() =>
                          setNamer({
                            sourceId: template.id,
                            title: `${template.title} copy`,
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {nav === 'shared' && (
                <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-6">
                  <h1 className="text-[16px] font-semibold tracking-tight">
                    Shared
                  </h1>
                  {sharedDocs.length === 0 ? (
                    <p className="py-12 text-center text-[13px] text-[var(--xd-ink-muted)]">
                      No shared files.
                    </p>
                  ) : (
                    <ul className="divide-y divide-[var(--xd-border)] rounded-md border border-[var(--xd-border)]">
                      {sharedDocs.map((doc) => (
                        <li
                          key={doc.id}
                          className="flex flex-wrap items-center justify-between gap-3 bg-[var(--xd-canvas)] px-4 py-3"
                        >
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => openDocument(doc.id)}
                              className="truncate text-left text-[13.5px] font-medium hover:text-[var(--xd-accent)]"
                            >
                              {doc.title}
                            </button>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--xd-ink-muted)]">
                              <span className="xd-mono">{doc.fileName}</span>
                              <span>·</span>
                              <span>
                                {
                                  getPermissionMeta(doc.share.publicPermission)
                                    .shortLabel
                                }
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1">
                            {SIM_ROLES.map((role) => (
                              <button
                                key={role}
                                type="button"
                                onClick={() => {
                                  setSimulatedRole(role)
                                  openDocument(doc.id)
                                }}
                                className="rounded border border-[var(--xd-border)] px-2 py-0.5 text-[11px] text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]"
                              >
                                {ROLE_LABEL[role]}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setShareId(doc.id)}
                              className="ml-1 rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-2.5 py-0.5 text-[11.5px] font-medium"
                            >
                              Share
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {nav === 'subscriptions' && (
                <div className="mx-auto w-full max-w-4xl px-6 py-6">
                  <SubscriptionModal
                    variant="page"
                    subscriptions={subscriptions}
                    roleAssignments={roles}
                    onChange={(nextSubscriptions, nextRoles) => {
                      setSubscriptions(nextSubscriptions)
                      setRoles(nextRoles)
                    }}
                    antigravityStatus={antigravityStatus}
                    antigravityBusy={antigravityBusy}
                    antigravityError={antigravityError}
                    onRefreshAntigravity={() => void refreshAntigravity()}
                    onAuthenticateAntigravity={(methodId, options) =>
                      void handleAuthenticateAntigravity(methodId, options)
                    }
                    onLogoutAntigravity={() => void handleLogoutAntigravity()}
                    onInstallAntigravityBinary={() =>
                      void handleInstallAntigravityBinary()
                    }
                    openCodeGoStatus={openCodeGoStatus}
                    openCodeGoBusy={openCodeGoBusy}
                    openCodeGoError={openCodeGoError}
                    onRefreshOpenCodeGo={() => void refreshOpenCodeGo()}
                    onAuthenticateOpenCodeGo={(options) =>
                      void handleAuthenticateOpenCodeGo(options)
                    }
                    onLogoutOpenCodeGo={() => void handleLogoutOpenCodeGo()}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        {aiSidebarOpen && (
          <CursorAISidebar
            key={sidebarKey}
            fileName={activeDoc?.fileName ?? 'xdrive.mrbl'}
            messages={thread}
            checkpoints={activeDoc?.checkpoints ?? []}
            proposals={
              activeDoc?.intentHistory ??
              recentProposals.map((item) => item.proposal)
            }
            selectedElements={selected}
            sketches={docSketches}
            strokes={docStrokes}
            models={connectedModels}
            modelId={modelId}
            onModelChange={setModelId}
            permission={permission}
            evergreenRefs={evergreenRefs}
            onOpenEvergreenDoc={(slug) => {
              const target = libraryRef.current.find(
                (item) => item.slug === slug,
              )
              if (target) openDocument(target.id)
            }}
            onRemoveElement={(id) => {
              if (!activeDoc) return
              setDocSelection(
                activeDoc.id,
                selected.filter((element) => element.id !== id),
              )
            }}
            onRemoveSketch={(id) => {
              if (!activeDoc) return
              setSketches((prev) => ({
                ...prev,
                [activeDoc.id]: (prev[activeDoc.id] ?? []).filter(
                  (sketch) => sketch.id !== id,
                ),
              }))
            }}
            onSend={(text) => {
              if (!activeDoc) {
                buildApp(text, modelId)
                return
              }
              void collaborate({
                doc: activeDoc,
                instruction: text,
                model: modelId,
                providerId: providerFor(modelId, connectedModels),
                selectedElements: selected,
                sketchAnnotations: docSketches,
              })
            }}
            onKeep={keepProposal}
            onDiscard={discardProposal}
            onOpenProviders={() => visit('home', 'subscriptions')}
            isThinking={thinkingState?.threadId === (activeDoc?.id ?? 'drive')}
            thinkingLabel={thinkingState?.label}
            antigravityConnected={
              antigravityStatus ? antigravityStatus.authenticated : undefined
            }
            hasConnectedProvider={
              antigravityStatus || openCodeGoStatus
                ? Boolean(
                    antigravityStatus?.authenticated ||
                      (openCodeGoStatus?.authenticated &&
                        openCodeGoStatus.entitled),
                  )
                : undefined
            }
          />
        )}
      </div>
      <NewAppModal
        open={newAppModalMode !== null}
        initialMode={newAppModalMode ?? 'agent'}
        templates={templates}
        folders={folders}
        initialFolderId={currentFolderId}
        models={composerModels}
        selectedModelId={modelId}
        onSelectModel={setModelId}
        onClose={() => setNewAppModalMode(null)}
        onBuildWithAgent={({ prompt, modelId: chosenModel, folderId }) =>
          buildApp(prompt, chosenModel, folderId)
        }
        onCreateFromTemplate={createAppFromTemplate}
        onPreviewTemplate={(tpl) => openDocument(tpl.id)}
      />
      <DriveFolderDialog
        open={folderModal !== null}
        mode={folderModal?.mode ?? 'create'}
        initialName={
          folderModal?.mode === 'rename' ? folderModal.folder.name : ''
        }
        initialColor={
          folderModal?.mode === 'rename'
            ? (folderModal.folder.color ?? 'default')
            : 'default'
        }
        parentPathLabel={
          folderModal?.mode === 'create'
            ? getFolderPathLabel(folders, folderModal.parentId)
            : 'My Drive'
        }
        onClose={() => setFolderModal(null)}
        onSubmit={submitFolderModal}
      />
      {moveDocId && (
        <DriveMoveDialog
          open
          fileName={findDoc(moveDocId)?.fileName ?? ''}
          currentFolderId={findDoc(moveDocId)?.folderId ?? null}
          folders={folders}
          onClose={() => setMoveDocId(null)}
          onMove={(targetFolderId) =>
            moveDocumentToFolder(moveDocId, targetFolderId)
          }
        />
      )}
      <DrivePermanentDeleteDialog
        open={permanentDeleteTarget !== null}
        mode={permanentDeleteTarget?.mode ?? 'single'}
        fileName={
          permanentDeleteTarget?.mode === 'single'
            ? permanentDeleteTarget.doc.title
            : undefined
        }
        itemCount={trashedDocs.length}
        onClose={() => setPermanentDeleteTarget(null)}
        onConfirm={() => {
          if (!permanentDeleteTarget) return
          if (permanentDeleteTarget.mode === 'empty') {
            emptyTrash()
          } else {
            permanentlyDeleteDocument(permanentDeleteTarget.doc.id)
          }
        }}
      />
      {trashUndo && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] px-3.5 py-2 text-[12px] text-[var(--xd-ink)] shadow-xl"
        >
          <span className="max-w-[260px] truncate">
            Moved <strong className="font-medium">{trashUndo.title}</strong> to
            Trash
          </span>
          <button
            type="button"
            onClick={() => restoreDocumentFromTrash(trashUndo.docId)}
            className="font-medium text-[var(--xd-accent)] transition-colors hover:underline"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => {
              setTrashUndo(null)
              visit('home', 'trash')
            }}
            className="text-[var(--xd-ink-secondary)] transition-colors hover:text-[var(--xd-ink)]"
          >
            View trash
          </button>
          <button
            type="button"
            onClick={() => setTrashUndo(null)}
            aria-label="Dismiss notification"
            className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {shareDoc && (
        <ShareModal
          open
          onOpenChange={(open) => {
            if (!open) setShareId(null)
          }}
          fileName={shareDoc.fileName}
          title={shareDoc.title}
          config={shareDoc.share}
          simulatedPermission={
            simulatedRole === 'owner' ? undefined : simulatedRole
          }
          onConfigChange={(config) =>
            patchFile(shareDoc.id, (doc) => ({ ...doc, share: config }))
          }
          onSimulatePermission={(level) => {
            setSimulatedRole(level)
            openDocument(shareDoc.id)
          }}
        />
      )}
      {namer && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-[18vh]">
          <form
            role="dialog"
            aria-label="Name the duplicated .mrbl app"
            className="w-full max-w-sm rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] p-4 shadow-xl"
            onSubmit={(event) => {
              event.preventDefault()
              commitDuplicate(namer.title)
            }}
          >
            <h2 className="text-[13.5px] font-semibold">Duplicate file</h2>
            <input
              autoFocus
              aria-label="App name"
              value={namer.title}
              onChange={(event) =>
                setNamer({ ...namer, title: event.target.value })
              }
              className="mt-2.5 h-8 w-full rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2.5 text-[12.5px] outline-none focus-visible:border-[var(--xd-accent)]"
            />
            <div className="mt-3 flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setNamer(null)}
                className="rounded border border-[var(--xd-border)] px-2.5 py-1 text-[12px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded bg-[var(--xd-accent)] px-2.5 py-1 text-[12px] text-white"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}
      {paletteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-[14vh]"
          onMouseDown={() => setPaletteOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Command palette"
            className="w-full max-w-md overflow-hidden rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--xd-border)] px-3">
              <Search className="size-3.5 text-[var(--xd-ink-muted)]" />
              <input
                autoFocus
                value={paletteQuery}
                onChange={(event) => setPaletteQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setPaletteIndex((index) =>
                      Math.min(paletteItems.length - 1, index + 1),
                    )
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setPaletteIndex((index) => Math.max(0, index - 1))
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    const item = paletteItems.at(paletteIndex)
                    if (!item) return
                    setPaletteOpen(false)
                    setPaletteQuery('')
                    item.run()
                  }
                }}
                placeholder="Jump to file or view..."
                aria-label="Quick search"
                className="h-9 w-full bg-transparent text-[12.5px] outline-none"
              />
              <button
                type="button"
                aria-label="Close command palette"
                onClick={() => setPaletteOpen(false)}
                className="text-[var(--xd-ink-muted)]"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <ul className="max-h-72 overflow-y-auto py-1">
              {paletteItems.length === 0 && (
                <li className="px-3 py-3 text-[12px] text-[var(--xd-ink-muted)]">
                  No matches.
                </li>
              )}
              {paletteItems.map((item, index) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setPaletteIndex(index)}
                    onClick={() => {
                      setPaletteOpen(false)
                      setPaletteQuery('')
                      item.run()
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left',
                      index === paletteIndex && 'bg-[var(--xd-surface-hover)]',
                    )}
                  >
                    <span className="truncate text-[12.5px]">{item.label}</span>
                    <span className="xd-mono shrink-0 text-[10.5px] text-[var(--xd-ink-muted)]">
                      {item.hint}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
