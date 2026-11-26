import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useCanGoBack, useRouter } from '@tanstack/react-router'
import { LayoutTemplate, Search, X } from 'lucide-react'
import { WorkspaceLink } from '#/components/routing/WorkspaceLink'
import {
  TrashedDocumentView,
  WorkspaceNotFoundView,
} from '#/components/workspace/WorkspaceRouteFallbacks'
import {
  appendQueryParams,
  buildPublicDocShareUrl,
  chatThreadHref,
  docCanonicalSlug,
  docHref,
  folderCanonicalSlug,
  folderHref,
  folderIdHref,
  modalToNewAppMode,
  navHref,
  newAppModeToModal,
  parseSelectedNodeIds,
  serializeSelectedNodeIds,
  settingsProviderHref,
  useWorkspaceRoute,
} from '#/lib/routing'
import type { AiSidebarTab, CombinedWorkspaceSearch } from '#/lib/routing'
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
  DriveRenameDocDialog,
  DriveTrashList,
  FilterPillBar,
  NewAppButton,
  NewAppModal,
  SaveAsTemplateDialog,
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
import { DriveChatView } from '#/components/chat'
import {
  buildDriveChatModels,
  buildDriveSnapshot,
  prepareDriveChatRequest,
  reasoningEffortForModel,
  streamDriveChat,
} from '#/lib/ai/drive-chat-client'
import {
  deleteDocChatHistory,
  deleteDriveChatThread,
  fetchDocChatHistories,
  fetchDriveChatThread,
  fetchDriveChatThreads,
  importDriveChatThreads,
  saveDocChatHistory,
  saveDriveChatThread,
} from '#/lib/ai/chat-history-client'
import type {
  DriveChatAction,
  DriveChatMessage,
  DriveChatMode,
  DriveChatThread,
  DriveContextRef,
  ReasoningEffort,
} from '#/lib/ai/drive-chat-types'
import {
  PREDEFINED_MARBLE_TEMPLATES,
  DOCUMENT_DESIGN_SYSTEM_SLUG,
  DOCUMENT_DONTS_SYSTEM_SLUG,
  INITIAL_AI_SUBSCRIPTIONS,
  MarbleCollaborationError,
  TEMPLATES_FOLDER_NAME,
  applyDocumentContentUpdate,
  applyMarbleOpsClient,
  buildInteractiveMarbleIframeDoc,
  byteSizeOf,
  countMarbleNodes,
  duplicateMarbleTemplate,
  generateMarbleCollaboration,
  inspectMarbleNodes,
  isTemplatesRootFolder,
  resolveEvergreenDesignContext,
  updateMarbleSourceTitle,
} from '#/lib/marble'
import {
  applyServerRenameDocumentReply,
  applyServerSaveAsTemplateReply,
  deriveDocIsTemplate,
  ensureClientTemplatesFolder,
  getTemplateFolderIds,
  mintClientFolderId,
  reconcileFolderRename,
  replayHeldDocEdits,
} from '#/components/workspace/template-workspace-helpers'
import type { HeldDocEdit } from '#/components/workspace/template-workspace-helpers'
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
  fetchOpenCodeGoStatus,
  isOpenCodeUsable,
} from '#/lib/ai/opencode-go-client'
import {
  isOpenCodeModelId,
  toXDriveOpenCodeGoModelId,
} from '#/lib/ai/opencode-go-types'
import type { OpenCodeGoRuntimeStatus } from '#/lib/ai/opencode-go-types'
import {
  applyGrokBuildStatusToSubscriptions,
  fetchGrokBuildStatus,
} from '#/lib/ai/grok-build-client'
import {
  isGrokBuildModelId,
  toXDriveGrokBuildModelId,
} from '#/lib/ai/grok-build-types'
import type { GrokBuildRuntimeStatus } from '#/lib/ai/grok-build-types'
import type {
  AIMessage,
  AIProviderId,
  AISubscription,
  CanvasInteractionMode,
  DriveFolder,
  DriveFolderColor,
  DriveSettings,
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

// Legacy localStorage key read once on first load to migrate existing Drive Chat threads to disk.
const CHAT_STORAGE_KEY = 'xdrive.drive-chat.threads.v1'
const LEGACY_FAVORITE_MODELS_STORAGE_KEY =
  'xdrive.drive-chat.favorite-models.v1'

function createBlankChatThread(
  modelId: string,
  reasoningEffort: ReasoningEffort = 'high',
  mode: DriveChatMode = 'review',
): DriveChatThread {
  const now = new Date().toISOString()
  return {
    id: `chat-${shortSha()}`,
    title: 'New chat',
    createdAt: now,
    updatedAt: now,
    modelId,
    reasoningEffort,
    mode,
    messages: [],
  }
}

function isMeaningfulChatThread(thread: DriveChatThread): boolean {
  return (
    thread.messages.length > 0 ||
    Boolean(thread.pinned) ||
    (thread.title.trim().length > 0 && thread.title.trim() !== 'New chat')
  )
}

function mergeProposalsWithThread(
  intentHistory: MarbleOpProposal[],
  messages: AIMessage[],
): MarbleOpProposal[] {
  const byId = new Map<string, MarbleOpProposal>()
  for (const proposal of intentHistory) {
    byId.set(proposal.id, proposal)
  }
  for (const msg of messages) {
    if (msg.proposal && !byId.has(msg.proposal.id)) {
      byId.set(msg.proposal.id, msg.proposal)
    }
  }
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt)
}

function loadLegacyLocalStorageChatThreads(): {
  hasKey: boolean
  threads: DriveChatThread[]
} {
  if (typeof window === 'undefined') return { hasKey: false, threads: [] }
  try {
    const raw = window.localStorage.getItem(CHAT_STORAGE_KEY)
    if (raw === null) return { hasKey: false, threads: [] }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { hasKey: true, threads: [] }
    }
    const threads = (parsed as DriveChatThread[]).map((item) => ({
      ...item,
      messages: (Array.isArray(item.messages) ? item.messages : []).map(
        (msg) => ({
          ...msg,
          isStreaming: false,
          streamingPhase: undefined,
        }),
      ),
    }))
    return { hasKey: true, threads }
  } catch {
    return { hasKey: true, threads: [] }
  }
}

export interface XDriveWorkspaceProps {
  initialTheme?: 'dark' | 'light'
  initialNav?: PrimaryNavId
  initialActiveTabId?: 'home' | string
  initialDocs?: MarbleDocumentFile[]
  initialTemplates?: MarbleDocumentFile[]
  initialOpenDocIds?: string[]
  initialTrashedDocIds?: string[]
  trashRetentionDays?: number
  initialMode?: CanvasInteractionMode
  initialAiSidebarOpen?: boolean
  initialSimulatedRole?: SharePermissionLevel | 'owner'
  initialSelectedIds?: string[]
  syncWithServer?: boolean
}

type SimulatedRole = SharePermissionLevel | 'owner'
type Place = { tabId: 'home' | string; nav: PrimaryNavId }
type Trail = { cursor: number; places: Place[] }
type LivePreview = { docId: string; ops: MarbleOp[]; run: number }
type NamerState = {
  sourceId: string
  title: string
  mode: 'duplicate' | 'use-template'
}
type FolderModalState =
  | { mode: 'create'; parentId: string | null }
  | { mode: 'rename'; folder: DriveFolder }
type PermanentDeleteTarget =
  { mode: 'single'; doc: MarbleDocumentFile } | { mode: 'empty' }
type TrashUndoBanner = { docId: string; title: string }
type PaletteItem = { id: string; label: string; hint: string; run: () => void }

const YOU = { name: 'You', initials: 'YO' }

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

function resolveOpenIds(
  availableDocs: MarbleDocumentFile[],
  ids: string[] | undefined,
  active?: string,
): string[] {
  const known = new Set(availableDocs.map((doc) => doc.id))
  const open = (ids ?? []).filter((id) => known.has(id))
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
  availableDocs: MarbleDocumentFile[],
  active: string | undefined,
  ids: string[] | undefined,
): Record<string, SelectedMarbleElement[]> {
  if (!active || active === 'home' || !ids?.length) return {}
  const doc = availableDocs.find((item) => item.id === active)
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
  if (isGrokBuildModelId(modelId)) return 'grok-build'
  if (isOpenCodeModelId(modelId)) return 'opencode-go'
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

function folderDiskPath(
  folderList: DriveFolder[],
  folderId: string | null | undefined,
): string {
  if (!folderId) return ''
  return getFolderAncestors(folderList, folderId)
    .map((folder) => folder.name)
    .join('/')
}

function normalizeSeedTemplate(tpl: MarbleDocumentFile): MarbleDocumentFile {
  return {
    ...tpl,
    isTemplate: true,
    isEvergreen: false,
    starred: false,
    pinned: false,
    folder: tpl.folder || TEMPLATES_FOLDER_NAME,
  }
}

function slugifyLocalTitle(title: string, fallback = 'untitled'): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.mrbl$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return slug || fallback
}

function uniqueSlugForDocs(
  baseTitle: string,
  docs: readonly MarbleDocumentFile[],
  excludeDocId?: string,
  fallback = 'untitled',
): string {
  const used = new Set(
    docs.filter((doc) => doc.id !== excludeDocId).map((doc) => doc.slug),
  )
  const base = slugifyLocalTitle(baseTitle, fallback)
  let candidate = base
  let suffix = 2
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  return candidate
}

function serializeDocMeta(doc: MarbleDocumentFile) {
  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    description: doc.description,
    category: doc.category,
    isEvergreen: doc.isEvergreen,
    templateId: doc.templateId,
    version: doc.version,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    createdBy: doc.createdBy,
    lastEditedBy: doc.lastEditedBy,
    starred: doc.starred,
    pinned: doc.pinned,
    tags: doc.tags,
    share: doc.share,
  }
}

export function XDriveWorkspace({
  initialTheme = 'dark',
  initialNav = 'drive',
  initialActiveTabId = 'home',
  initialDocs = [],
  initialTemplates,
  initialOpenDocIds,
  initialTrashedDocIds,
  trashRetentionDays = TRASH_RETENTION_DAYS,
  initialMode = 'direct',
  initialAiSidebarOpen = false,
  initialSimulatedRole = 'owner',
  initialSelectedIds,
  syncWithServer = false,
}: XDriveWorkspaceProps) {
  const workspaceRoute = useWorkspaceRoute()
  const router = useRouter()
  const routerCanGoBack = useCanGoBack()
  const isRouted = Boolean(workspaceRoute?.routed)
  const routeMatch = workspaceRoute?.match
  const routeSearch: CombinedWorkspaceSearch = workspaceRoute?.search ?? {}
  const [routerCanGoForward, setRouterCanGoForward] = useState(false)
  const maxHistoryIndexRef = useRef<number>(
    router.history.location.state.__TSR_index,
  )
  const [chatsLoaded, setChatsLoaded] = useState(!syncWithServer)
  const [localAiSidebarTab, setLocalAiSidebarTab] =
    useState<AiSidebarTab>('chat')
  const [localSettingsProviderId, setLocalSettingsProviderId] =
    useState<AIProviderId>('antigravity')

  const initialTrashedSet = useMemo(
    () => new Set(initialTrashedDocIds ?? []),
    [initialTrashedDocIds],
  )
  const seededTemplateList = useMemo(
    () =>
      (initialTemplates ?? PREDEFINED_MARBLE_TEMPLATES).map(
        normalizeSeedTemplate,
      ),
    [initialTemplates],
  )
  const initialAvailableDocs = useMemo(() => {
    const existingIds = new Set(initialDocs.map((doc) => doc.id))
    return [
      ...initialDocs,
      ...seededTemplateList.filter((tpl) => !existingIds.has(tpl.id)),
    ]
  }, [initialDocs, seededTemplateList])
  const [theme, setTheme] = useState(initialTheme)
  const [localNav, setLocalNav] = useState<PrimaryNavId>(initialNav)
  const [localActiveTabId, setLocalActiveTabId] = useState<'home' | string>(
    () =>
      initialActiveTabId !== 'home' && initialTrashedSet.has(initialActiveTabId)
        ? 'home'
        : initialActiveTabId,
  )
  const [openTabIds, setOpenTabIds] = useState<string[]>(() =>
    resolveOpenIds(
      initialAvailableDocs,
      initialOpenDocIds,
      initialActiveTabId,
    ).filter((id) => !initialTrashedSet.has(id)),
  )
  const initialDrive = useMemo(() => {
    if (syncWithServer) {
      return { folders: [] as DriveFolder[], docs: [] as MarbleDocumentFile[] }
    }
    const nowMs = Date.now()
    const seeded = seedDriveFolders(
      initialAvailableDocs.map((doc) => {
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
  }, [
    syncWithServer,
    initialAvailableDocs,
    initialTrashedDocIds,
    initialTrashedSet,
    trashRetentionDays,
  ])
  const [folders, setFolders] = useState<DriveFolder[]>(
    () => initialDrive.folders,
  )
  const [localCurrentFolderId, setLocalCurrentFolderId] = useState<
    string | null
  >(null)
  const [folderModal, setFolderModal] = useState<FolderModalState | null>(null)
  const [moveDocId, setMoveDocId] = useState<string | null>(null)
  const [renameDocTarget, setRenameDocTarget] =
    useState<MarbleDocumentFile | null>(null)
  const [saveTemplateTarget, setSaveTemplateTarget] =
    useState<MarbleDocumentFile | null>(null)
  const [templateSearchQuery, setTemplateSearchQuery] = useState('')
  const [permanentDeleteTarget, setPermanentDeleteTarget] =
    useState<PermanentDeleteTarget | null>(null)
  const [trashUndo, setTrashUndo] = useState<TrashUndoBanner | null>(null)
  const [localNewAppModalMode, setLocalNewAppModalMode] =
    useState<NewAppMode | null>(null)
  const [docs, setDocs] = useState<MarbleDocumentFile[]>(
    () => initialDrive.docs,
  )
  const [trail, setTrail] = useState<Trail>({
    cursor: 0,
    places: [{ tabId: initialActiveTabId, nav: initialNav }],
  })
  const [localAiSidebarOpen, setLocalAiSidebarOpen] =
    useState(initialAiSidebarOpen)
  const [localSimulatedRole, setLocalSimulatedRole] =
    useState<SimulatedRole>(initialSimulatedRole)
  const [modes, setModes] = useState<Record<string, CanvasInteractionMode>>(
    () => {
      if (!initialActiveTabId || initialActiveTabId === 'home') return {}
      return { [initialActiveTabId]: initialMode }
    },
  )
  const [selection, setSelection] = useState<
    Record<string, SelectedMarbleElement[]>
  >(() =>
    seedSelection(initialAvailableDocs, initialActiveTabId, initialSelectedIds),
  )
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
  const [grokBuildStatus, setGrokBuildStatus] =
    useState<GrokBuildRuntimeStatus | null>(null)
  const [grokBuildBusy, setGrokBuildBusy] = useState<string | null>(null)
  const [grokBuildError, setGrokBuildError] = useState<string | null>(null)
  const [thinkingState, setThinkingState] = useState<{
    threadId: string
    phase: 'connecting' | 'thinking' | 'generating' | 'parsing'
    label: string
    detail?: string
    elapsedMs: number
  } | null>(null)
  const [localSortBy, setLocalSortBy] = useState<SortOption>('updated')
  const [localViewMode, setLocalViewMode] = useState<DriveViewMode>('preview')
  const [effectiveTrashRetentionDays, setEffectiveTrashRetentionDays] =
    useState(trashRetentionDays)
  const [favoriteModelIds, setFavoriteModelIds] = useState<
    string[] | undefined
  >(undefined)
  const [localSearchQuery, setLocalSearchQuery] = useState('')
  const [localShareId, setLocalShareId] = useState<string | null>(null)
  const [namer, setNamer] = useState<NamerState | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [paletteIndex, setPaletteIndex] = useState(0)
  const [agentStatus, setAgentStatus] = useState<string | null>(null)
  const [frameDoc, setFrameDoc] = useState('')
  const [chatReasoningEffort, setChatReasoningEffort] =
    useState<ReasoningEffort>('high')
  const [chatMode, setChatMode] = useState<DriveChatMode>('review')
  const [chatThreads, setChatThreads] = useState<DriveChatThread[]>(() => [
    createBlankChatThread('antigravity/default', 'high', 'review'),
  ])
  const [localActiveChatThreadId, setLocalActiveChatThreadId] =
    useState<string>(() => chatThreads[0]?.id ?? '')
  const [chatStreamingThreadId, setChatStreamingThreadId] = useState<
    string | null
  >(null)
  const [driveLoading, setDriveLoading] = useState(syncWithServer)

  const nav: PrimaryNavId = useMemo(() => {
    if (!isRouted || !routeMatch) return localNav
    switch (routeMatch.kind) {
      case 'drive':
      case 'folder':
        return 'drive'
      case 'starred':
        return 'starred'
      case 'shared':
        return 'shared'
      case 'trash':
        return 'trash'
      case 'templates':
        return 'templates'
      case 'chat':
        return 'chat'
      case 'settings':
        return 'subscriptions'
      case 'doc':
      case 'not-found':
        return localNav
    }
  }, [isRouted, routeMatch, localNav])

  const currentFolderId: string | null =
    isRouted && routeMatch
      ? routeMatch.kind === 'folder'
        ? routeMatch.folderId
        : routeMatch.kind === 'drive'
          ? null
          : localCurrentFolderId
      : localCurrentFolderId

  const aiSidebarOpen = isRouted ? Boolean(routeSearch.ai) : localAiSidebarOpen
  const aiSidebarTab: AiSidebarTab = isRouted
    ? (routeSearch.ai ?? 'chat')
    : localAiSidebarTab
  const newAppModalMode: NewAppMode | null = isRouted
    ? modalToNewAppMode(routeSearch.modal)
    : localNewAppModalMode
  const sortBy: SortOption = isRouted
    ? (routeSearch.sort ?? localSortBy)
    : localSortBy
  const viewMode: DriveViewMode = isRouted
    ? (routeSearch.view ?? localViewMode)
    : localViewMode
  const searchQuery: string = isRouted
    ? (routeSearch.q ?? '')
    : localSearchQuery
  const activeSettingsProviderId: AIProviderId =
    isRouted && routeMatch?.kind === 'settings'
      ? routeMatch.providerId
      : localSettingsProviderId

  const activeTabRef = useRef<'home' | string>(localActiveTabId)
  const libraryRef = useRef<MarbleDocumentFile[]>([])
  const allDocsRef = useRef<MarbleDocumentFile[]>([])
  const foldersRef = useRef<DriveFolder[]>([])
  const driveSyncQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const chatAbortRef = useRef<AbortController | null>(null)
  const chatUndoMapRef = useRef(new Map<string, () => void>())
  const chatThreadsRef = useRef<DriveChatThread[]>(chatThreads)
  chatThreadsRef.current = chatThreads
  const activeChatThreadIdRef = useRef<string>(localActiveChatThreadId)
  const docThreadsRef = useRef<Partial<Record<string, AIMessage[]>>>(threads)
  docThreadsRef.current = threads
  const chatSyncQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const pendingChatSaveIdsRef = useRef<Set<string>>(new Set())
  const persistedChatIdsRef = useRef<Set<string>>(new Set())
  const docChatSyncQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const pendingDocChatSaveIdsRef = useRef<Set<string>>(new Set())
  const sourceRef = useRef(new Map<string, string>())
  const previewRun = useRef(0)
  const shownSourceRef = useRef<string | null>(null)
  const shownSigRef = useRef('')
  const saveTokens = useRef(new Map<string, number>())
  const pendingRenameDocIdsRef = useRef(new Set<string>())
  const [pendingRenameDocIds, setPendingRenameDocIds] = useState<Set<string>>(
    () => new Set(),
  )
  const heldDocEditsRef = useRef(new Map<string, HeldDocEdit[]>())
  const pendingFolderIdsRef = useRef(new Set<string>())
  const [pendingFolderIds, setPendingFolderIds] = useState<Set<string>>(
    () => new Set(),
  )
  const timers = useRef<number[]>([])

  function setDocRenamePending(docId: string, pending: boolean): void {
    if (pending) pendingRenameDocIdsRef.current.add(docId)
    else pendingRenameDocIdsRef.current.delete(docId)
    setPendingRenameDocIds(new Set(pendingRenameDocIdsRef.current))
  }

  function setFoldersPending(ids: Iterable<string>, pending: boolean): void {
    for (const id of ids) {
      if (pending) pendingFolderIdsRef.current.add(id)
      else pendingFolderIdsRef.current.delete(id)
    }
    setPendingFolderIds(new Set(pendingFolderIdsRef.current))
  }

  function isFolderOrAncestorPending(
    folderId: string | null | undefined,
  ): boolean {
    if (!folderId) return false
    return getFolderAncestors(foldersRef.current, folderId).some((f) =>
      pendingFolderIdsRef.current.has(f.id),
    )
  }
  const hostOpRef = useRef<
    (op: MarbleOp, options?: { look?: boolean }) => void
  >(() => {})
  const selectRef = useRef<(element: SelectedMarbleElement) => void>(() => {})
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const richStageRef = useRef<HTMLDivElement | null>(null)

  const activeDocs = useMemo(() => docs.filter((doc) => !doc.trashedAt), [docs])
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

  const templatesFolder = useMemo(
    () => folders.find(isTemplatesRootFolder) ?? null,
    [folders],
  )
  const templateFolderIds = useMemo(
    () => getTemplateFolderIds(folders),
    [folders],
  )

  const isDocTemplate = (doc: MarbleDocumentFile): boolean =>
    deriveDocIsTemplate(doc, folders, templateFolderIds)

  const templates = useMemo(
    () => activeDocs.filter(isDocTemplate),
    [activeDocs, folders, templateFolderIds],
  )
  const defaultCreateFolderId =
    currentFolderId && templateFolderIds.has(currentFolderId)
      ? null
      : currentFolderId

  const library = activeDocs
  libraryRef.current = library
  allDocsRef.current = docs
  foldersRef.current = folders
  for (const doc of library) sourceRef.current.set(doc.id, doc.source)

  function updateChatThreads(
    updater: (prev: DriveChatThread[]) => DriveChatThread[],
  ) {
    const next = updater(chatThreadsRef.current)
    chatThreadsRef.current = next
    setChatThreads(next)
    return next
  }

  function updateDocThreads(
    updater: (
      prev: Partial<Record<string, AIMessage[]>>,
    ) => Partial<Record<string, AIMessage[]>>,
  ) {
    const next = updater(docThreadsRef.current)
    docThreadsRef.current = next
    setThreads(next)
    return next
  }

  function scheduleChatThreadSave(threadId: string) {
    if (!syncWithServer || !threadId) return
    if (pendingChatSaveIdsRef.current.has(threadId)) return
    pendingChatSaveIdsRef.current.add(threadId)
    queueMicrotask(() => {
      if (!pendingChatSaveIdsRef.current.delete(threadId)) return
      const latest = chatThreadsRef.current.find((t) => t.id === threadId)
      if (
        !latest ||
        (!isMeaningfulChatThread(latest) &&
          !persistedChatIdsRef.current.has(threadId))
      ) {
        return
      }
      persistedChatIdsRef.current.add(threadId)
      chatSyncQueueRef.current = chatSyncQueueRef.current
        .then(() => saveDriveChatThread(latest))
        .catch(() => null)
    })
  }

  function queueChatThreadDelete(threadId: string) {
    if (!syncWithServer || !threadId) return
    pendingChatSaveIdsRef.current.delete(threadId)
    persistedChatIdsRef.current.delete(threadId)
    chatSyncQueueRef.current = chatSyncQueueRef.current
      .then(() => deleteDriveChatThread(threadId))
      .catch(() => false)
  }

  function scheduleDocChatSave(docId: string) {
    if (!syncWithServer || !docId) return
    if (pendingDocChatSaveIdsRef.current.has(docId)) return
    pendingDocChatSaveIdsRef.current.add(docId)
    queueMicrotask(() => {
      if (!pendingDocChatSaveIdsRef.current.delete(docId)) return
      const latest = docThreadsRef.current[docId]
      if (!latest) return
      docChatSyncQueueRef.current = docChatSyncQueueRef.current
        .then(() => saveDocChatHistory(docId, latest))
        .catch(() => false)
    })
  }

  function queueDocChatDelete(docId: string) {
    if (!syncWithServer || !docId) return
    pendingDocChatSaveIdsRef.current.delete(docId)
    docChatSyncQueueRef.current = docChatSyncQueueRef.current
      .then(() => deleteDocChatHistory(docId))
      .catch(() => false)
  }

  useEffect(() => {
    if (!syncWithServer) return
    let cancelled = false

    async function hydrateChatsFromServer() {
      const legacy = loadLegacyLocalStorageChatThreads()
      const meaningfulLegacy = legacy.threads.filter(isMeaningfulChatThread)
      let serverThreads: DriveChatThread[] | null = null

      if (meaningfulLegacy.length > 0) {
        const imported = await importDriveChatThreads(meaningfulLegacy)
        if (imported) {
          serverThreads = imported.threads
          try {
            window.localStorage.removeItem(CHAT_STORAGE_KEY)
          } catch {
            // ignore storage errors
          }
        }
      } else {
        serverThreads = await fetchDriveChatThreads()
        if (serverThreads !== null && legacy.hasKey) {
          try {
            window.localStorage.removeItem(CHAT_STORAGE_KEY)
          } catch {
            // ignore storage errors
          }
        }
      }

      if (cancelled) return
      if (!serverThreads) {
        setChatsLoaded(true)
        return
      }

      if (serverThreads.length > 0) {
        for (const item of serverThreads) {
          persistedChatIdsRef.current.add(item.id)
        }
        const current = chatThreadsRef.current
        const serverIds = new Set(serverThreads.map((item) => item.id))
        const unsyncedLocal = current.filter(
          (item) => !serverIds.has(item.id) && isMeaningfulChatThread(item),
        )
        const blankLocal = current.filter(
          (item) => !serverIds.has(item.id) && !isMeaningfulChatThread(item),
        )
        const merged = [
          ...(blankLocal.length > 0 ? [blankLocal[0]] : []),
          ...unsyncedLocal,
          ...serverThreads,
        ]
        chatThreadsRef.current = merged
        setChatThreads(merged)

        const currentActive = current.find(
          (item) => item.id === activeChatThreadIdRef.current,
        )
        if (!currentActive || !isMeaningfulChatThread(currentActive)) {
          const fallbackId = serverThreads[0]?.id ?? merged[0].id
          activeChatThreadIdRef.current = fallbackId
          setLocalActiveChatThreadId(fallbackId)
        }
      }
      setChatsLoaded(true)
    }

    async function hydrateDocChatsFromServer() {
      const serverDocThreads = await fetchDocChatHistories()
      if (cancelled || !serverDocThreads) return
      updateDocThreads((prev) => {
        const merged: Partial<Record<string, AIMessage[]>> = {
          ...serverDocThreads,
        }
        for (const [docId, messages] of Object.entries(prev)) {
          if (messages && messages.length > 0) {
            merged[docId] = messages
          }
        }
        return merged
      })
    }

    void hydrateChatsFromServer()
    void hydrateDocChatsFromServer()

    return () => {
      cancelled = true
    }
  }, [syncWithServer])

  useEffect(() => {
    return () => {
      chatAbortRef.current?.abort()
    }
  }, [])

  function populateFallbackTemplatesIfEmpty() {
    if (foldersRef.current.length > 0 || allDocsRef.current.length > 0) return
    const fallback = seedDriveFolders(seededTemplateList)
    foldersRef.current = fallback.folders
    allDocsRef.current = fallback.docs
    setFolders(fallback.folders)
    setDocs(fallback.docs)
  }

  async function reloadWorkspaceFromServer() {
    if (!syncWithServer) return
    try {
      const response = await fetch('/api/marble?action=workspace', {
        cache: 'no-store',
      })
      if (!response.ok) {
        populateFallbackTemplatesIfEmpty()
        return
      }
      const data = (await response.json()) as {
        ok?: boolean
        folders?: DriveFolder[]
        docs?: MarbleDocumentFile[]
        settings?: DriveSettings
      }
      if (
        !data.ok ||
        !Array.isArray(data.folders) ||
        !Array.isArray(data.docs)
      ) {
        populateFallbackTemplatesIfEmpty()
        return
      }
      pendingRenameDocIdsRef.current.clear()
      setPendingRenameDocIds(new Set())
      heldDocEditsRef.current.clear()
      pendingFolderIdsRef.current.clear()
      setPendingFolderIds(new Set())
      foldersRef.current = data.folders
      allDocsRef.current = data.docs
      setFolders(data.folders)
      setDocs(data.docs)

      if (data.settings) {
        if (
          typeof data.settings.trashRetentionDays === 'number' &&
          data.settings.trashRetentionDays > 0
        ) {
          setEffectiveTrashRetentionDays(data.settings.trashRetentionDays)
        }
        if (data.settings.defaultModelId) {
          setModelId(data.settings.defaultModelId)
        }
        if (data.settings.roleAssignments) {
          setRoles(data.settings.roleAssignments)
        }
        if (data.settings.viewMode) {
          setLocalViewMode(data.settings.viewMode)
        }
        if (data.settings.sortBy) {
          setLocalSortBy(data.settings.sortBy)
        }
        if (Array.isArray(data.settings.favoriteModelIds)) {
          setFavoriteModelIds(data.settings.favoriteModelIds)
        } else if (typeof window !== 'undefined') {
          try {
            const rawLegacy = window.localStorage.getItem(
              LEGACY_FAVORITE_MODELS_STORAGE_KEY,
            )
            if (rawLegacy) {
              const parsed: unknown = JSON.parse(rawLegacy)
              if (Array.isArray(parsed)) {
                const migrated = parsed.filter(
                  (item): item is string => typeof item === 'string',
                )
                setFavoriteModelIds(migrated)
                const saved = await syncDriveApi({
                  action: 'update_settings',
                  settings: { favoriteModelIds: migrated },
                })
                if (saved) {
                  window.localStorage.removeItem(
                    LEGACY_FAVORITE_MODELS_STORAGE_KEY,
                  )
                }
              } else {
                window.localStorage.removeItem(
                  LEGACY_FAVORITE_MODELS_STORAGE_KEY,
                )
              }
            }
          } catch {
            // Ignore legacy localStorage migration failures.
          }
        }
      }
    } catch {
      // Static/Storybook environments do not expose /api/marble.
      populateFallbackTemplatesIfEmpty()
    } finally {
      setDriveLoading(false)
    }
  }

  useEffect(() => {
    if (!syncWithServer) return
    void reloadWorkspaceFromServer()
  }, [syncWithServer])

  const findDoc = (id: string | null | undefined) =>
    library.find((doc) => doc.id === id) ?? null
  const findDocByIdOrSlug = (key: string | null | undefined) => {
    if (!key) return null
    return (
      library.find((doc) => doc.id === key) ??
      library.find((doc) => doc.slug === key) ??
      null
    )
  }
  const findTrashedDocByIdOrSlug = (key: string | null | undefined) => {
    if (!key) return null
    return (
      trashedDocs.find((doc) => doc.id === key) ??
      trashedDocs.find((doc) => doc.slug === key) ??
      null
    )
  }

  const routedDoc =
    isRouted && routeMatch?.kind === 'doc'
      ? findDocByIdOrSlug(routeMatch.docId)
      : null
  const trashedRouteDoc =
    isRouted && routeMatch?.kind === 'doc' && !routedDoc
      ? findTrashedDocByIdOrSlug(routeMatch.docId)
      : null
  const missingDocId =
    isRouted &&
    routeMatch?.kind === 'doc' &&
    !routedDoc &&
    !trashedRouteDoc &&
    !driveLoading
      ? routeMatch.docId
      : null

  const routedFolder =
    isRouted && routeMatch?.kind === 'folder'
      ? (folders.find((folder) => folder.id === routeMatch.folderId) ?? null)
      : null
  const missingFolderId =
    isRouted && routeMatch?.kind === 'folder' && !routedFolder && !driveLoading
      ? routeMatch.folderId
      : null

  const activeDoc = isRouted
    ? routedDoc
    : localActiveTabId === 'home'
      ? null
      : findDoc(localActiveTabId)
  const activeTabId: 'home' | string = activeDoc ? activeDoc.id : 'home'
  activeTabRef.current = activeTabId

  const blankChatThread = useMemo(
    () => chatThreads.find((t) => !isMeaningfulChatThread(t)) ?? null,
    [chatThreads],
  )
  const matchedChatThread =
    isRouted && routeMatch?.kind === 'chat' && routeMatch.threadId
      ? (chatThreads.find((t) => t.id === routeMatch.threadId) ?? null)
      : null
  const missingChatThreadId =
    isRouted &&
    routeMatch?.kind === 'chat' &&
    Boolean(routeMatch.threadId) &&
    !matchedChatThread &&
    chatsLoaded
      ? routeMatch.threadId
      : null
  const activeChatThreadId: string = isRouted
    ? routeMatch?.kind === 'chat'
      ? routeMatch.threadId
        ? (matchedChatThread?.id ?? routeMatch.threadId)
        : (blankChatThread?.id ?? localActiveChatThreadId)
      : localActiveChatThreadId
    : localActiveChatThreadId
  activeChatThreadIdRef.current = activeChatThreadId

  const shareId: string | null = isRouted
    ? routeSearch.modal === 'share'
      ? (routeSearch.shareDoc ?? activeDoc?.id ?? null)
      : null
    : localShareId

  const simulatedRole: SimulatedRole =
    isRouted && routeMatch?.kind === 'doc'
      ? (routeSearch.role ?? 'owner')
      : localSimulatedRole

  const mode: CanvasInteractionMode = activeDoc
    ? isRouted
      ? (routeSearch.mode ?? 'direct')
      : (modes[activeDoc.id] ?? 'direct')
    : 'direct'

  const urlNodeIds = useMemo(
    () => (isRouted ? parseSelectedNodeIds(routeSearch.node) : []),
    [isRouted, routeSearch.node],
  )
  const selected = useMemo(() => {
    if (!activeDoc) return []
    const localSelected = selection[activeDoc.id] ?? []
    if (!isRouted) return localSelected
    if (urlNodeIds.length === 0) return []
    const localIds = localSelected.map((el) => el.id)
    if (
      localIds.length === urlNodeIds.length &&
      localIds.every((id, idx) => id === urlNodeIds[idx])
    ) {
      return localSelected
    }
    return elementsFromSource(activeDoc.source, urlNodeIds)
  }, [activeDoc, selection, isRouted, urlNodeIds])
  const selectedIds = selected.map((element) => element.id)
  const docSketches = activeDoc ? (sketches[activeDoc.id] ?? []) : []
  const docStrokes = activeDoc ? (strokes[activeDoc.id] ?? []) : []
  const permission = effectivePermission(simulatedRole)
  const driveThread = threads.drive
  const thread = activeDoc ? (threads[activeDoc.id] ?? []) : (driveThread ?? [])
  const previewOps =
    activeDoc && livePreview?.docId === activeDoc.id ? livePreview.ops : null

  const cleanRouteSearch = (
    raw: Record<string, unknown>,
  ): Record<string, string> => {
    const cleaned: Record<string, string> = {}
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'string' && value.trim().length > 0) {
        cleaned[key] = value
      }
    }
    return cleaned
  }

  const latestLocationRef = useRef<{
    pathname: string
    search: CombinedWorkspaceSearch
  }>({
    pathname: workspaceRoute?.pathname ?? '/drive',
    search: routeSearch,
  })
  latestLocationRef.current = {
    pathname: workspaceRoute?.pathname ?? '/drive',
    search: routeSearch,
  }

  useEffect(() => {
    if (!isRouted) return
    const initialIndex = router.history.location.state.__TSR_index
    if (initialIndex > maxHistoryIndexRef.current) {
      maxHistoryIndexRef.current = initialIndex
    }
    setRouterCanGoForward(maxHistoryIndexRef.current > initialIndex)

    return router.history.subscribe(({ location, action }) => {
      const idx = location.state.__TSR_index
      if (action.type === 'PUSH') {
        maxHistoryIndexRef.current = idx
      } else if (idx > maxHistoryIndexRef.current) {
        maxHistoryIndexRef.current = idx
      }
      setRouterCanGoForward(maxHistoryIndexRef.current > idx)
    })
  }, [isRouted, router])

  function updateRouteSearch(
    updater: (prev: CombinedWorkspaceSearch) => CombinedWorkspaceSearch,
    options?: { replace?: boolean },
  ) {
    if (!isRouted) return
    const current = latestLocationRef.current
    const prevCleaned = cleanRouteSearch(
      current.search as Record<string, unknown>,
    )
    const nextCleaned = cleanRouteSearch(
      updater(current.search) as Record<string, unknown>,
    )
    const prevHref = appendQueryParams(current.pathname, prevCleaned)
    const nextHref = appendQueryParams(current.pathname, nextCleaned)
    if (nextHref === prevHref) return
    latestLocationRef.current = {
      pathname: current.pathname,
      search: nextCleaned,
    }
    void router.navigate({
      href: nextHref,
      replace: options?.replace ?? false,
    })
  }

  function buildCurrentHrefWithSearch(
    patch: Partial<Record<keyof CombinedWorkspaceSearch, string | undefined>>,
  ): string {
    const pathname = workspaceRoute?.pathname ?? '/drive'
    const merged: Record<string, string | undefined> = {
      ...(routeSearch as Record<string, string | undefined>),
      ...patch,
    }
    return appendQueryParams(pathname, merged)
  }

  function setAiSidebarOpen(next: boolean | ((prev: boolean) => boolean)) {
    const resolved = typeof next === 'function' ? next(aiSidebarOpen) : next
    if (!isRouted) {
      setLocalAiSidebarOpen(resolved)
      return
    }
    updateRouteSearch((prev) => ({
      ...prev,
      ai: resolved ? (prev.ai ?? 'chat') : undefined,
    }))
  }

  function setAiSidebarTab(next: AiSidebarTab) {
    if (!isRouted) {
      setLocalAiSidebarTab(next)
      return
    }
    updateRouteSearch((prev) => ({ ...prev, ai: next }))
  }

  function setNewAppModalMode(next: NewAppMode | null) {
    if (!isRouted) {
      setLocalNewAppModalMode(next)
      return
    }
    updateRouteSearch((prev) => ({
      ...prev,
      modal: next ? newAppModeToModal(next) : undefined,
      shareDoc: next ? undefined : prev.shareDoc,
    }))
  }

  function setShareId(
    next: string | null | ((prev: string | null) => string | null),
  ) {
    const resolved = typeof next === 'function' ? next(shareId) : next
    if (!isRouted) {
      setLocalShareId(resolved)
      return
    }
    updateRouteSearch((prev) => ({
      ...prev,
      modal: resolved
        ? 'share'
        : prev.modal === 'share'
          ? undefined
          : prev.modal,
      shareDoc:
        resolved && (!activeDoc || resolved !== activeDoc.id)
          ? resolved
          : undefined,
    }))
  }

  function setSimulatedRole(next: SimulatedRole) {
    if (!isRouted) {
      setLocalSimulatedRole(next)
      return
    }
    setLocalSimulatedRole(next)
    if (routeMatch?.kind === 'doc') {
      updateRouteSearch(
        (prev) => ({
          ...prev,
          role: next === 'owner' ? undefined : next,
        }),
        { replace: true },
      )
    }
  }

  function setSearchQuery(next: string) {
    setLocalSearchQuery(next)
    if (!isRouted) return
    updateRouteSearch(
      (prev) => ({
        ...prev,
        q: next.trim() ? next : undefined,
      }),
      { replace: true },
    )
  }

  // Canonicalize folder & document slugs, track open tabs, and keep document.title fresh
  useEffect(() => {
    if (!isRouted || !routeMatch) return
    if (routeMatch.kind === 'folder' && routedFolder) {
      setLocalCurrentFolderId(routedFolder.id)
      const canonical = folderCanonicalSlug(routedFolder)
      if (routeMatch.slug !== canonical) {
        void router.navigate({
          href: appendQueryParams(
            folderHref(routedFolder),
            cleanRouteSearch(routeSearch as Record<string, unknown>),
          ),
          replace: true,
        })
      }
      if (typeof document !== 'undefined') {
        document.title = `${routedFolder.name} · My Drive · xDrive`
      }
      return
    }
    if (routeMatch.kind === 'drive') {
      setLocalCurrentFolderId(null)
      if (typeof document !== 'undefined') {
        document.title = 'My Drive · xDrive'
      }
      return
    }
    if (routeMatch.kind === 'doc' && routedDoc) {
      setOpenTabIds((prev) =>
        prev.includes(routedDoc.id) ? prev : [...prev, routedDoc.id],
      )
      const canonical = docCanonicalSlug(routedDoc)
      if (routeMatch.docId !== routedDoc.id || routeMatch.slug !== canonical) {
        void router.navigate({
          href: appendQueryParams(
            docHref(routedDoc),
            cleanRouteSearch(routeSearch as Record<string, unknown>),
          ),
          replace: true,
        })
      }
      if (typeof document !== 'undefined') {
        document.title = `${routedDoc.title} · xDrive`
      }
      return
    }
    if (routeMatch.kind === 'chat') {
      if (routeMatch.threadId) {
        setLocalActiveChatThreadId(routeMatch.threadId)
        if (matchedChatThread && typeof document !== 'undefined') {
          document.title = `${matchedChatThread.title} · Drive Chat · xDrive`
        }
      } else {
        // Ensure a blank draft thread exists for `/chat`
        if (!blankChatThread) {
          const blank = createBlankChatThread(
            modelId,
            chatReasoningEffort,
            chatMode,
          )
          updateChatThreads((prev) => [blank, ...prev])
          setLocalActiveChatThreadId(blank.id)
        } else {
          setLocalActiveChatThreadId(blankChatThread.id)
        }
        if (typeof document !== 'undefined') {
          document.title = 'Drive Chat · xDrive'
        }
      }
    }
  }, [
    isRouted,
    routeMatch,
    routedFolder,
    routedDoc,
    matchedChatThread,
    blankChatThread,
    router,
    routeSearch,
    modelId,
    chatReasoningEffort,
    chatMode,
  ])

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

  const driveChatModels = useMemo(
    () =>
      buildDriveChatModels({
        subscriptions,
        antigravityStatus,
        openCodeGoStatus,
        grokBuildStatus,
      }),
    [subscriptions, antigravityStatus, openCodeGoStatus, grokBuildStatus],
  )

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
      .filter((folder) => !needle || folder.name.toLowerCase().includes(needle))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [folders, currentFolderId, searchQuery])

  const filteredDocs = useMemo(() => {
    const scoped =
      currentFolderId === null
        ? activeDocs.filter((doc) => !isDocTemplate(doc))
        : activeDocs.filter((doc) => doc.folderId === currentFolderId)
    return scoped
      .filter((doc) => matchesQuery(doc, searchQuery))
      .slice()
      .sort((a, b) => compareDocs(a, b, sortBy))
  }, [
    activeDocs,
    currentFolderId,
    folders,
    searchQuery,
    sortBy,
    templateFolderIds,
  ])

  const starredDocs = useMemo(() => {
    return activeDocs
      .filter((doc) => doc.starred)
      .filter((doc) => matchesQuery(doc, searchQuery))
      .slice()
      .sort((a, b) => compareDocs(a, b, sortBy))
  }, [activeDocs, searchQuery, sortBy])

  const sharedDocs = useMemo(() => activeDocs.filter(isShared), [activeDocs])
  const filteredTemplates = useMemo(
    () =>
      templates
        .filter((tpl) => matchesQuery(tpl, templateSearchQuery))
        .slice()
        .sort((a, b) => compareDocs(a, b, sortBy)),
    [templates, templateSearchQuery, sortBy],
  )
  const filteredBlueprints = useMemo(
    () => filteredTemplates.map(toBlueprint),
    [filteredTemplates],
  )
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
      slug: doc.slug,
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
      slug: doc.slug,
      title: doc.title,
      fileName: doc.fileName,
      category: doc.category,
      nodeCount: doc.nodeCount,
      starred: doc.starred,
      isTemplate: isDocTemplate(doc),
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
          !isOpenCodeModelId(current) &&
          !isGrokBuildModelId(current))
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
    if (isOpenCodeUsable(status)) {
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

  function applyLiveGrokBuildStatus(status: GrokBuildRuntimeStatus) {
    setGrokBuildStatus(status)
    setSubscriptions((prev) =>
      applyGrokBuildStatusToSubscriptions(prev, status),
    )
    if (status.authenticated) {
      const preferred = status.currentModelId
        ? toXDriveGrokBuildModelId(status.currentModelId)
        : status.models[0]
          ? toXDriveGrokBuildModelId(status.models[0].id)
          : 'grok-build/grok-4.7'
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

  async function refreshGrokBuild(forceRefresh = true) {
    setGrokBuildBusy('refresh')
    setGrokBuildError(null)
    try {
      const status = await fetchGrokBuildStatus(forceRefresh)
      applyLiveGrokBuildStatus(status)
    } catch (error) {
      setGrokBuildError(
        error instanceof Error
          ? error.message
          : 'Could not reach Grok Build ACP backend.',
      )
    } finally {
      setGrokBuildBusy(null)
    }
  }

  async function refreshOpenCodeGo(forceRefresh = true) {
    setOpenCodeGoBusy('refresh')
    setOpenCodeGoError(null)
    try {
      const status = await fetchOpenCodeGoStatus(forceRefresh)
      applyLiveOpenCodeGoStatus(status)
    } catch (error) {
      setOpenCodeGoError(
        error instanceof Error
          ? error.message
          : 'Could not reach OpenCode backend.',
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
    void fetchGrokBuildStatus()
      .then((status) => {
        if (!active) return
        applyLiveGrokBuildStatus(status)
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
    allDocsRef.current = allDocsRef.current.map((doc) =>
      doc.id === id ? updater(doc) : doc,
    )
    setDocs((prev) =>
      prev.some((doc) => doc.id === id)
        ? prev.map((doc) => (doc.id === id ? updater(doc) : doc))
        : prev,
    )
  }

  function navigateWithGlobalSearch(
    pathname: string,
    extraSearch?: Record<string, string | undefined>,
    options?: { replace?: boolean },
  ) {
    const currentAi = latestLocationRef.current.search.ai
    const nextSearch = cleanRouteSearch({
      ...(currentAi ? { ai: currentAi } : {}),
      ...extraSearch,
    })
    latestLocationRef.current = {
      pathname,
      search: nextSearch,
    }
    void router.navigate({
      href: appendQueryParams(pathname, nextSearch),
      replace: options?.replace ?? false,
    })
  }

  function visit(
    tabId: 'home' | string,
    nextNav: PrimaryNavId,
    options?: { role?: SharePermissionLevel; replace?: boolean },
  ) {
    setLocalActiveTabId(tabId)
    setLocalNav(nextNav)
    setTrail((prev) => {
      const trimmed = prev.places.slice(0, prev.cursor + 1)
      const last = trimmed.at(-1)
      if (last && last.tabId === tabId && last.nav === nextNav) return prev
      const places = [...trimmed, { tabId, nav: nextNav }]
      return { cursor: places.length - 1, places }
    })
    if (!isRouted) return
    if (tabId !== 'home') {
      const targetDoc =
        allDocsRef.current.find((doc) => doc.id === tabId) ?? findDoc(tabId)
      const targetPath = targetDoc
        ? docHref(targetDoc)
        : `/d/${encodeURIComponent(tabId)}`
      navigateWithGlobalSearch(
        targetPath,
        options?.role ? { role: options.role } : undefined,
        { replace: options?.replace },
      )
      return
    }
    if (nextNav === 'drive' && currentFolderId) {
      navigateWithGlobalSearch(
        folderIdHref(currentFolderId, foldersRef.current),
        undefined,
        { replace: options?.replace },
      )
      return
    }
    if (nextNav === 'chat') {
      const activeThread = chatThreadsRef.current.find(
        (t) => t.id === activeChatThreadIdRef.current,
      )
      const targetChatPath =
        activeThread && isMeaningfulChatThread(activeThread)
          ? chatThreadHref(activeThread.id)
          : '/chat'
      navigateWithGlobalSearch(targetChatPath, undefined, {
        replace: options?.replace,
      })
      return
    }
    navigateWithGlobalSearch(navHref(nextNav), undefined, {
      replace: options?.replace,
    })
  }

  function go(delta: -1 | 1) {
    if (isRouted) {
      if (delta === -1) {
        router.history.back()
      } else {
        router.history.forward()
      }
      return
    }
    const cursor = trail.cursor + delta
    const place = trail.places.at(cursor)
    if (!place) return
    setTrail({ ...trail, cursor })
    setLocalActiveTabId(place.tabId)
    setLocalNav(place.nav)
  }

  function openDocument(
    id: string,
    options?: { role?: SharePermissionLevel; doc?: MarbleDocumentFile },
  ) {
    setOpenTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    if (options?.role) {
      setLocalSimulatedRole(options.role)
    }
    if (isRouted) {
      const targetDoc =
        options?.doc ??
        allDocsRef.current.find((doc) => doc.id === id) ??
        findDoc(id)
      const targetPath = targetDoc
        ? docHref(targetDoc)
        : `/d/${encodeURIComponent(id)}`
      navigateWithGlobalSearch(
        targetPath,
        options?.role ? { role: options.role } : undefined,
      )
      return
    }
    visit(id, nav, { role: options?.role })
  }

  function closeTab(id: string) {
    setOpenTabIds((prev) => prev.filter((tabId) => tabId !== id))
    if (activeTabRef.current !== id) return
    const remaining = openTabIds.filter((tabId) => tabId !== id)
    const fallbackId = remaining[remaining.length - 1]
    if (fallbackId) {
      visit(fallbackId, nav)
    } else if (isRouted) {
      navigateWithGlobalSearch('/drive')
    } else {
      visit('home', nav)
    }
  }

  function setMode(id: string, next: CanvasInteractionMode) {
    setModes((prev) => ({ ...prev, [id]: next }))
    if (isRouted && activeTabRef.current === id) {
      updateRouteSearch((prev) => ({
        ...prev,
        mode: next === 'direct' ? undefined : next,
      }))
    }
  }

  function setDocSelection(id: string, elements: SelectedMarbleElement[]) {
    setSelection((prev) => ({ ...prev, [id]: elements }))
    if (isRouted && activeTabRef.current === id) {
      updateRouteSearch(
        (prev) => ({
          ...prev,
          node: serializeSelectedNodeIds(elements.map((el) => el.id)),
        }),
        { replace: true },
      )
    }
  }

  function enqueueDriveMutation<T>(task: () => Promise<T>): Promise<T> {
    const next = driveSyncQueueRef.current.then(task, task)
    driveSyncQueueRef.current = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  function syncDriveApi(
    bodyOrFactory:
      Record<string, unknown> | (() => Record<string, unknown> | null),
    options?: {
      reloadOnError?: boolean
      onSuccess?: (data: Record<string, unknown>) => void
      onError?: (message: string) => void
    },
  ) {
    return enqueueDriveMutation(async () => {
      try {
        const body =
          typeof bodyOrFactory === 'function' ? bodyOrFactory() : bodyOrFactory
        if (body === null) {
          return null
        }
        const response = await fetch('/api/marble', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = (await response.json().catch(() => null)) as {
          ok?: boolean
          error?: string
          [key: string]: unknown
        } | null
        if (!response.ok || !data || data.ok === false) {
          const message =
            data?.error ?? `Drive sync failed (${response.status})`
          if (syncWithServer) {
            setAgentStatus(message)
          }
          options?.onError?.(message)
          if (syncWithServer && options?.reloadOnError) {
            await reloadWorkspaceFromServer()
          }
          return null
        }
        options?.onSuccess?.(data)
        return data
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Drive sync failed'
        if (syncWithServer) {
          setAgentStatus(message)
        }
        options?.onError?.(message)
        if (syncWithServer && options?.reloadOnError) {
          await reloadWorkspaceFromServer()
        }
        return null
      }
    })
  }

  function persistDriveSettings(patch: Partial<DriveSettings>) {
    if (!syncWithServer) return
    void syncDriveApi({
      action: 'update_settings',
      settings: patch,
    })
  }

  function handleSelectModel(nextModelId: string) {
    setModelId(nextModelId)
    persistDriveSettings({ defaultModelId: nextModelId })
  }

  function handleSelectSort(nextSort: SortOption) {
    setLocalSortBy(nextSort)
    persistDriveSettings({ sortBy: nextSort })
    if (isRouted) {
      updateRouteSearch(
        (prev) => ({
          ...prev,
          sort: nextSort,
        }),
        { replace: true },
      )
    }
  }

  function handleChangeViewMode(nextViewMode: DriveViewMode) {
    setLocalViewMode(nextViewMode)
    persistDriveSettings({ viewMode: nextViewMode })
    if (isRouted) {
      updateRouteSearch(
        (prev) => ({
          ...prev,
          view: nextViewMode,
        }),
        { replace: true },
      )
    }
  }

  function handleFavoriteModelIdsChange(nextIds: string[]) {
    setFavoriteModelIds(nextIds)
    persistDriveSettings({ favoriteModelIds: nextIds })
  }

  function persist(
    id: string,
    slug: string,
    prior: string,
    ops: MarbleOp[],
    nextSource: string,
    docOverride?: MarbleDocumentFile,
  ) {
    if (pendingRenameDocIdsRef.current.has(id)) {
      const held = heldDocEditsRef.current.get(id) ?? []
      held.push({
        ops: [...ops],
        nextSource,
        checkpoint: docOverride?.checkpoints.at(0),
        lastEditedBy: docOverride?.lastEditedBy ?? YOU,
        updatedAt: docOverride?.updatedAt ?? new Date().toISOString(),
        intentHistory: docOverride?.intentHistory,
      })
      heldDocEditsRef.current.set(id, held)
      setAgentStatus('Rename in progress — holding edits until confirmed…')
      return
    }

    const doc = docOverride ?? allDocsRef.current.find((item) => item.id === id)
    const token = (saveTokens.current.get(id) ?? 0) + 1
    saveTokens.current.set(id, token)
    const targetFolderId = doc?.folderId ?? null
    const meta = doc
      ? serializeDocMeta({
          ...doc,
          source: nextSource,
          nodeCount: countMarbleNodes(nextSource),
          byteSize: byteSizeOf(nextSource),
        })
      : undefined
    const checkpoints = doc?.checkpoints
    const intentHistory = doc?.intentHistory
    void enqueueDriveMutation(async () => {
      const liveDoc = allDocsRef.current.find((item) => item.id === id)
      const confirmedSlug = liveDoc?.slug ?? slug
      const folderPath = folderDiskPath(
        foldersRef.current,
        liveDoc ? (liveDoc.folderId ?? null) : targetFolderId,
      )
      const resolvedMeta = meta ? { ...meta, slug: confirmedSlug } : undefined
      const body =
        ops.length > 0
          ? {
              action: 'apply_ops',
              slug: confirmedSlug,
              folderPath,
              source: prior,
              ops,
              meta: resolvedMeta,
              checkpoints,
              intentHistory,
            }
          : {
              action: 'save',
              slug: confirmedSlug,
              folderPath,
              source: nextSource,
              meta: resolvedMeta,
              checkpoints,
              intentHistory,
            }
      const response = await fetch('/api/marble', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error('Marble save failed')
    })
      .then(() => {
        if (
          saveTokens.current.get(id) !== token ||
          pendingRenameDocIdsRef.current.has(id)
        ) {
          return
        }
        patchFile(id, (item) =>
          item.syncState === 'saving' ? { ...item, syncState: 'saved' } : item,
        )
      })
      .catch(() => {
        if (saveTokens.current.get(id) !== token) return
        patchFile(id, (item) => ({ ...item, syncState: 'retrying' }))
      })
  }

  function rememberProposal(id: string, proposal: MarbleOpProposal) {
    if (pendingRenameDocIdsRef.current.has(id)) {
      setAgentStatus('Wait for rename to finish before updating proposals.')
      return
    }
    const targetDoc = allDocsRef.current.find((doc) => doc.id === id)
    const nextHistory = targetDoc
      ? [
          proposal,
          ...targetDoc.intentHistory.filter((item) => item.id !== proposal.id),
        ].slice(0, 20)
      : [proposal]
    patchFile(id, (doc) => ({
      ...doc,
      intentHistory: [
        proposal,
        ...doc.intentHistory.filter((item) => item.id !== proposal.id),
      ].slice(0, 20),
    }))
    if (targetDoc) {
      void syncDriveApi(() => {
        const live =
          allDocsRef.current.find((doc) => doc.id === id) ?? targetDoc
        return {
          action: 'update_document_meta',
          slug: live.slug,
          folderPath: folderDiskPath(foldersRef.current, live.folderId),
          intentHistory: nextHistory,
        }
      })
    }
  }

  function upsertThreadMessage(docId: string, message: AIMessage) {
    updateDocThreads((prev) => {
      const current = prev[docId] ?? []
      const exists = current.some((item) => item.id === message.id)
      const next = exists
        ? current.map((item) => (item.id === message.id ? message : item))
        : [...current, message]
      return { ...prev, [docId]: next }
    })
    scheduleDocChatSave(docId)
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
    const nextDoc: MarbleDocumentFile = {
      ...meta,
      source: applied.source,
      nodeCount: countMarbleNodes(applied.source),
      byteSize: byteSizeOf(applied.source),
      version: meta.version + 1,
      updatedAt: new Date().toISOString(),
      syncState: 'saving',
      lastEditedBy: YOU,
      checkpoints: coalesceCheckpoint(meta.checkpoints, checkpoint, op),
    }
    patchFile(id, () => nextDoc)
    persist(id, meta.slug, prior, [op], applied.source, nextDoc)
  }

  function selectNodeAndOpenAi(id: string, element: SelectedMarbleElement) {
    setSelection((prev) => ({ ...prev, [id]: [element] }))
    if (!isRouted) {
      setLocalAiSidebarOpen(true)
      return
    }
    if (activeTabRef.current === id) {
      updateRouteSearch((prev) => ({
        ...prev,
        node: serializeSelectedNodeIds([element.id]),
        ai: prev.ai ?? 'chat',
      }))
    }
  }

  selectRef.current = (element) => {
    const id = activeTabRef.current
    if (!id || id === 'home') return
    selectNodeAndOpenAi(id, element)
  }

  const setModeRef = useRef(setMode)
  setModeRef.current = setMode

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
      setModeRef.current(id, modeKey)
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
          updateDocThreads((prev) => {
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
            scheduleDocChatSave(docId)
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
    reasoningEffort?: ReasoningEffort
  }) {
    const instruction = input.instruction.trim()
    if (!instruction) return
    const selectedChatModel =
      driveChatModels.find((item) => item.id === input.model) ??
      driveChatModels.find((item) => item.connected) ??
      driveChatModels.at(0)
    const reasoningEffort = reasoningEffortForModel(
      selectedChatModel,
      input.reasoningEffort ?? chatReasoningEffort,
    )
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
    const providerTag =
      input.providerId === 'grok-build'
        ? `Grok Build ACP (${input.model.replace(/^grok-build\//, '')})`
        : input.providerId === 'opencode-go'
          ? `${openCodeGoStatus?.transport === 'http-fallback' ? 'OpenCode Go' : 'OpenCode ACP'} (${input.model.replace(/^opencode-go\/(?:opencode\/)?/, '')})`
          : `Antigravity ACP (${input.model.replace(/^antigravity\//, '')})`
    const startedAt = Date.now()
    upsertThreadMessage(threadId, user)
    setThinkingState({
      threadId,
      phase: 'thinking',
      label: `Thinking… · ${providerTag}`,
      elapsedMs: 0,
    })
    const elapsedTicker = window.setInterval(() => {
      setThinkingState((current) =>
        current?.threadId === threadId
          ? { ...current, elapsedMs: Date.now() - startedAt }
          : current,
      )
    }, 1000)
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
        reasoningEffort,
        sessionId: input.doc?.slug ?? threadId,
        action: input.action,
        selectedElements: input.selectedElements,
        sketchAnnotations: input.sketchAnnotations,
        evergreenDocs: liveEvergreen,
        onProgress: (progress) => {
          setThinkingState((current) => {
            if (current && current.threadId !== threadId) return current
            return {
              threadId,
              phase: progress.phase,
              label: `${progress.label} · ${providerTag}`,
              detail: progress.thoughtSnippet ?? current?.detail,
              elapsedMs: progress.elapsedMs ?? Date.now() - startedAt,
            }
          })
        },
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
        const committedProposal: MarbleOpProposal = {
          ...result.proposal,
          status: 'committed',
        }
        const created: MarbleDocumentFile = {
          ...adopted,
          folderId: targetFolder ? targetFolder.id : null,
          folder: targetFolder ? targetFolder.name : 'My Drive',
          intentHistory: [committedProposal],
        }
        allDocsRef.current = [created, ...allDocsRef.current]
        setDocs((prev) => [created, ...prev])
        openDocument(created.id, { doc: created })
        const assistant: AIMessage = {
          id: messageId('assistant'),
          role: 'assistant',
          content: result.proposal.note,
          timestamp: new Date().toISOString(),
          modelId: result.runtime?.modelId ?? input.model,
          providerId: input.providerId,
          runtimeSource: result.source,
          thoughts: result.thoughts,
          proposal: committedProposal,
          stages: result.stages.map((stage) => ({ ...stage, completed: true })),
        }
        updateDocThreads((prev) => ({
          ...prev,
          [created.id]: [user, assistant],
        }))
        scheduleDocChatSave(created.id)
        persist(
          created.id,
          created.slug,
          created.source,
          [],
          created.source,
          created,
        )
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
          input.providerId === 'grok-build' &&
          (error.code === 'AUTH_REQUIRED' || error.code === 'BINARY_MISSING')
        ) {
          void refreshGrokBuild(true)
        } else if (
          input.providerId === 'opencode-go' &&
          (error.code === 'AUTH_REQUIRED' ||
            error.code === 'BINARY_MISSING' ||
            error.code === 'ENTITLEMENT_REQUIRED' ||
            error.code === 'RATE_LIMITED')
        ) {
          void refreshOpenCodeGo(true)
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
      window.clearInterval(elapsedTicker)
      setThinkingState((current) =>
        current?.threadId === threadId ? null : current,
      )
    }
  }

  function buildApp(
    prompt: string,
    nextModelId: string,
    targetFolderId?: string | null,
    reasoningEffort?: ReasoningEffort,
  ) {
    setModelId(nextModelId)
    void collaborate({
      doc: null,
      instruction: prompt,
      model: nextModelId,
      providerId: providerFor(nextModelId, connectedModels),
      action: 'new_app',
      targetFolderId,
      reasoningEffort,
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
      ? foldersRef.current.find((f) => f.id === input.folderId)
      : null
    const adopted = adoptDocument(copy, allDocsRef.current)
    const placed: MarbleDocumentFile = {
      ...adopted,
      folderId: targetFolder ? targetFolder.id : null,
      folder: targetFolder ? targetFolder.name : 'My Drive',
    }
    allDocsRef.current = [placed, ...allDocsRef.current]
    setDocs((prev) => [placed, ...prev])
    openDocument(placed.id, { doc: placed })
    persist(placed.id, placed.slug, placed.source, [], placed.source, placed)
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
      reasoningEffort: request.reasoningEffort,
      action: actionForIntent(request.kind),
      selectedElements: attached.length > 0 ? attached : selected,
      sketchAnnotations: request.sketches ?? docSketches,
    })
  }

  function keepProposal(proposalId: string) {
    if (!activeDoc || !canCommit(simulatedRole)) return
    if (pendingRenameDocIdsRef.current.has(activeDoc.id)) {
      setAgentStatus('Wait for rename to finish before applying proposals.')
      return
    }
    const message = (threads[activeDoc.id] ?? []).find(
      (item) => item.proposal?.id === proposalId,
    )
    const proposal =
      message?.proposal ??
      activeDoc.intentHistory.find((item) => item.id === proposalId)
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
    const nextIntentHistory = activeDoc.intentHistory.some(
      (item) => item.id === committed.id,
    )
      ? activeDoc.intentHistory.map((item) =>
          item.id === committed.id ? committed : item,
        )
      : [committed, ...activeDoc.intentHistory].slice(0, 20)
    const updatedDoc: MarbleDocumentFile = {
      ...activeDoc,
      source: applied.source,
      nodeCount: countMarbleNodes(applied.source),
      byteSize: byteSizeOf(applied.source),
      version: activeDoc.version + 1,
      updatedAt: new Date().toISOString(),
      syncState: 'saving',
      lastEditedBy: {
        name: committed.modelId,
        initials: 'AI',
        isAi: true,
        modelBadge: committed.modelId,
      },
      checkpoints: [checkpoint, ...activeDoc.checkpoints].slice(0, 40),
      intentHistory: nextIntentHistory,
    }
    patchFile(activeDoc.id, () => updatedDoc)
    updateDocThreads((prev) => ({
      ...prev,
      [activeDoc.id]: (prev[activeDoc.id] ?? []).map((item) =>
        item.proposal?.id === committed.id
          ? { ...item, proposal: committed }
          : item,
      ),
    }))
    scheduleDocChatSave(activeDoc.id)
    persist(
      activeDoc.id,
      activeDoc.slug,
      activeDoc.source,
      committed.ops,
      applied.source,
      updatedDoc,
    )
  }

  function discardProposal(proposalId: string) {
    if (!activeDoc) return
    if (pendingRenameDocIdsRef.current.has(activeDoc.id)) {
      setAgentStatus('Wait for rename to finish before discarding proposals.')
      return
    }
    previewRun.current += 1
    setLivePreview(null)
    const discardedAt =
      (threads[activeDoc.id] ?? []).find(
        (item) => item.proposal?.id === proposalId,
      )?.proposal ??
      activeDoc.intentHistory.find((item) => item.id === proposalId)
    if (!discardedAt) return
    const discarded: MarbleOpProposal = { ...discardedAt, status: 'discarded' }
    updateDocThreads((prev) => ({
      ...prev,
      [activeDoc.id]: (prev[activeDoc.id] ?? []).map((item) =>
        item.proposal?.id === proposalId
          ? { ...item, proposal: discarded }
          : item,
      ),
    }))
    scheduleDocChatSave(activeDoc.id)
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
    const targetFolderId =
      namer.mode === 'use-template'
        ? defaultCreateFolderId
        : sourceDoc.folderId !== undefined
          ? sourceDoc.folderId
          : defaultCreateFolderId
    const targetFolder = targetFolderId
      ? foldersRef.current.find((f) => f.id === targetFolderId)
      : null
    const isTemplateCopy =
      namer.mode === 'duplicate' &&
      (isDocTemplate(sourceDoc) ||
        (targetFolder ? templateFolderIds.has(targetFolder.id) : false))
    const adopted = adoptDocument(copy, allDocsRef.current)
    const placed: MarbleDocumentFile = {
      ...adopted,
      ...(isTemplateCopy ? { id: `tpl-${shortSha()}` } : {}),
      isTemplate: isTemplateCopy,
      folderId: targetFolder ? targetFolder.id : null,
      folder: targetFolder ? targetFolder.name : 'My Drive',
    }
    allDocsRef.current = [placed, ...allDocsRef.current]
    setDocs((prev) => [placed, ...prev])
    setNamer(null)
    openDocument(placed.id, { doc: placed })
    persist(placed.id, placed.slug, placed.source, [], placed.source, placed)
  }

  function saveDocumentAsTemplate(
    sourceDoc: MarbleDocumentFile,
    input: { title: string; description: string },
  ) {
    const cleanTitle = input.title.trim()
    if (!cleanTitle) return
    const liveSourceDoc =
      allDocsRef.current.find((doc) => doc.id === sourceDoc.id) ?? sourceDoc
    if (pendingRenameDocIdsRef.current.has(liveSourceDoc.id)) {
      setAgentStatus('Wait for rename to finish before saving as a template.')
      return
    }
    const cleanDescription = input.description.trim()
    const liveSource =
      sourceRef.current.get(liveSourceDoc.id) ?? liveSourceDoc.source
    const tags =
      liveSourceDoc.tags.length > 0
        ? [...liveSourceDoc.tags]
        : [liveSourceDoc.category]
    setSaveTemplateTarget(null)

    if (!syncWithServer) {
      const now = new Date().toISOString()
      const ensured = ensureClientTemplatesFolder(
        foldersRef.current,
        now,
        shortSha,
      )
      if (ensured.created) {
        foldersRef.current = ensured.folders
        setFolders(ensured.folders)
      }
      const nextSource = updateMarbleSourceTitle(liveSource, cleanTitle)
      const nextSlug = uniqueSlugForDocs(
        cleanTitle,
        allDocsRef.current,
        undefined,
        'template',
      )
      const tplDoc: MarbleDocumentFile = {
        ...liveSourceDoc,
        id: `tpl-${shortSha()}`,
        slug: nextSlug,
        fileName: `${nextSlug}.mrbl`,
        title: cleanTitle,
        description: cleanDescription,
        isTemplate: true,
        isEvergreen: false,
        source: nextSource,
        nodeCount: countMarbleNodes(nextSource),
        byteSize: byteSizeOf(nextSource),
        version: 1,
        syncState: 'saved',
        createdAt: now,
        updatedAt: now,
        createdBy: YOU,
        lastEditedBy: YOU,
        starred: false,
        pinned: false,
        tags,
        folder: ensured.folder.name,
        folderId: ensured.folder.id,
        trashedAt: null,
        share: {
          isPublicLinkEnabled: false,
          publicLinkUrl: `https://xdrive.app/d/${nextSlug}`,
          publicPermission: 'view_only',
          allowDuplication: true,
          sharedAiDailyLimit: 40,
          sharedAiUsedToday: 0,
          collaborators: [],
        },
        checkpoints: [],
        intentHistory: [],
      }
      sourceRef.current.set(tplDoc.id, tplDoc.source)
      allDocsRef.current = [tplDoc, ...allDocsRef.current]
      setDocs((prev) => [tplDoc, ...prev])
      setAgentStatus(`Saved "${tplDoc.title}" to ${TEMPLATES_FOLDER_NAME}`)
      return
    }

    const tplId = `tpl-${shortSha()}`
    setAgentStatus(`Saving "${cleanTitle}" to ${TEMPLATES_FOLDER_NAME}…`)
    void syncDriveApi(
      () => {
        const currentSourceDoc =
          allDocsRef.current.find((doc) => doc.id === liveSourceDoc.id) ??
          liveSourceDoc
        const desiredSlug = uniqueSlugForDocs(
          cleanTitle,
          allDocsRef.current,
          undefined,
          'template',
        )
        return {
          action: 'save_as_template',
          sourceSlug: currentSourceDoc.slug,
          sourceFolderPath: folderDiskPath(
            foldersRef.current,
            currentSourceDoc.folderId,
          ),
          source: liveSource,
          title: cleanTitle,
          description: cleanDescription,
          category: liveSourceDoc.category,
          tags,
          id: tplId,
          slug: desiredSlug,
          createdBy: YOU,
        }
      },
      {
        onSuccess: (res) => {
          const applied = applyServerSaveAsTemplateReply(
            foldersRef.current,
            allDocsRef.current,
            {
              folder: res.folder as DriveFolder | undefined,
              doc: res.doc as MarbleDocumentFile | undefined,
            },
          )
          foldersRef.current = applied.folders
          setFolders(applied.folders)
          allDocsRef.current = applied.docs
          setDocs(applied.docs)
          if (applied.doc) {
            sourceRef.current.set(applied.doc.id, applied.doc.source)
          }
          setAgentStatus(
            `Saved "${applied.doc?.title ?? cleanTitle}" to ${TEMPLATES_FOLDER_NAME}`,
          )
        },
      },
    )
  }

  function renameDocument(
    targetDoc: MarbleDocumentFile,
    input: { title: string; description: string },
  ) {
    const cleanTitle = input.title.trim()
    if (!cleanTitle) return
    const liveDoc =
      allDocsRef.current.find((doc) => doc.id === targetDoc.id) ?? targetDoc
    if (pendingRenameDocIdsRef.current.has(liveDoc.id)) {
      setAgentStatus('Rename already in progress.')
      return
    }
    const nextDescription = input.description.trim()
    const currentSource = sourceRef.current.get(liveDoc.id) ?? liveDoc.source
    const isEvergreen =
      Boolean(liveDoc.isEvergreen) ||
      liveDoc.slug === DOCUMENT_DESIGN_SYSTEM_SLUG ||
      liveDoc.slug === DOCUMENT_DONTS_SYSTEM_SLUG
    const nextSlug = isEvergreen
      ? liveDoc.slug
      : uniqueSlugForDocs(
          cleanTitle,
          allDocsRef.current,
          liveDoc.id,
          liveDoc.slug,
        )

    setRenameDocTarget(null)

    if (!syncWithServer) {
      const nextSource = updateMarbleSourceTitle(currentSource, cleanTitle)
      sourceRef.current.set(liveDoc.id, nextSource)
      patchFile(liveDoc.id, (doc) => ({
        ...doc,
        title: cleanTitle,
        description: nextDescription,
        slug: nextSlug,
        fileName: `${nextSlug}.mrbl`,
        source: nextSource,
        nodeCount: countMarbleNodes(nextSource),
        byteSize: byteSizeOf(nextSource),
        version: doc.version + 1,
        updatedAt: new Date().toISOString(),
      }))
      setAgentStatus(`Renamed to "${cleanTitle}"`)
      return
    }

    const confirmedSnapshot: MarbleDocumentFile = {
      ...liveDoc,
      source: currentSource,
      nodeCount: countMarbleNodes(currentSource),
      byteSize: byteSizeOf(currentSource),
    }
    setDocRenamePending(liveDoc.id, true)
    patchFile(liveDoc.id, (doc) => ({ ...doc, syncState: 'saving' }))
    setAgentStatus(`Renaming "${liveDoc.title}"…`)

    void syncDriveApi(
      () => {
        const current =
          allDocsRef.current.find((doc) => doc.id === liveDoc.id) ?? liveDoc
        return {
          action: 'rename_document',
          slug: current.slug,
          folderPath: folderDiskPath(foldersRef.current, current.folderId),
          title: cleanTitle,
          description: nextDescription,
          nextSlug,
        }
      },
      {
        onError: (message) => {
          setDocRenamePending(liveDoc.id, false)
          const hadHeld =
            (heldDocEditsRef.current.get(liveDoc.id)?.length ?? 0) > 0
          heldDocEditsRef.current.delete(liveDoc.id)
          sourceRef.current.set(liveDoc.id, confirmedSnapshot.source)
          if (activeTabRef.current === liveDoc.id) {
            shownSourceRef.current = confirmedSnapshot.source
          }
          patchFile(liveDoc.id, () => ({
            ...confirmedSnapshot,
            syncState: 'saved',
          }))
          if (hadHeld) {
            setAgentStatus(
              `Rename failed (${message}); pending edits were discarded.`,
            )
          }
        },
        onSuccess: (res) => {
          setDocRenamePending(liveDoc.id, false)
          const held = heldDocEditsRef.current.get(liveDoc.id) ?? []
          heldDocEditsRef.current.delete(liveDoc.id)
          if (typeof res.slug !== 'string') return
          const latestDoc = allDocsRef.current.find(
            (doc) => doc.id === liveDoc.id,
          )
          if (!latestDoc) return

          const confirmedDoc = applyServerRenameDocumentReply({
            currentDoc: {
              ...latestDoc,
              source: confirmedSnapshot.source,
              version: confirmedSnapshot.version,
              checkpoints: confirmedSnapshot.checkpoints,
              intentHistory: confirmedSnapshot.intentHistory,
            },
            serverReply: {
              slug: res.slug,
              fileName: res.fileName,
              title: res.title,
              description: res.description,
              source: res.source,
              updatedAt: res.updatedAt,
            },
            fallbackTitle: cleanTitle,
            fallbackDescription: nextDescription,
            folders: foldersRef.current,
            countNodes: countMarbleNodes,
            byteSize: byteSizeOf,
          })

          if (held.length === 0) {
            sourceRef.current.set(liveDoc.id, confirmedDoc.source)
            if (activeTabRef.current === liveDoc.id) {
              shownSourceRef.current = confirmedDoc.source
            }
            patchFile(liveDoc.id, () => confirmedDoc)
            setAgentStatus(`Renamed to "${confirmedDoc.title}"`)
            return
          }

          const replayed = replayHeldDocEdits(
            confirmedDoc.source,
            confirmedDoc.title,
            held,
            applyMarbleOpsClient,
            updateMarbleSourceTitle,
          )
          const heldCheckpoints = held
            .map((edit) => edit.checkpoint)
            .filter((cp): cp is MarbleCheckpoint => Boolean(cp))
            .reverse()
          const lastHeld = held.at(-1)
          const finalDoc: MarbleDocumentFile = {
            ...confirmedDoc,
            source: replayed.source,
            nodeCount: countMarbleNodes(replayed.source),
            byteSize: byteSizeOf(replayed.source),
            version: confirmedDoc.version + held.length,
            syncState: 'saving',
            updatedAt: lastHeld?.updatedAt ?? confirmedDoc.updatedAt,
            lastEditedBy: lastHeld?.lastEditedBy ?? confirmedDoc.lastEditedBy,
            checkpoints: [
              ...heldCheckpoints,
              ...confirmedDoc.checkpoints,
            ].slice(0, 40),
            intentHistory:
              lastHeld?.intentHistory ?? confirmedDoc.intentHistory,
          }
          sourceRef.current.set(liveDoc.id, finalDoc.source)
          if (activeTabRef.current === liveDoc.id) {
            shownSourceRef.current = finalDoc.source
          }
          patchFile(liveDoc.id, () => finalDoc)
          setAgentStatus(`Renamed to "${finalDoc.title}"`)
          persist(
            liveDoc.id,
            confirmedDoc.slug,
            confirmedDoc.source,
            replayed.ops,
            finalDoc.source,
            finalDoc,
          )
        },
      },
    )
  }

  function navigateToFolder(folderId: string | null) {
    setLocalCurrentFolderId(folderId)
    if (isRouted) {
      navigateWithGlobalSearch(folderIdHref(folderId, foldersRef.current))
      return
    }
    visit('home', 'drive')
  }

  function renameFolderById(
    folderId: string,
    name: string,
    color: DriveFolderColor,
  ) {
    const target = foldersRef.current.find((f) => f.id === folderId)
    if (!target) return
    if (pendingFolderIdsRef.current.has(folderId)) {
      setAgentStatus('Wait for folder update to finish.')
      return
    }
    const now = new Date().toISOString()

    if (!syncWithServer) {
      const reconciled = reconcileFolderRename(
        foldersRef.current,
        allDocsRef.current,
        {
          folderId,
          name,
          color,
          updatedAt: now,
        },
      )
      foldersRef.current = reconciled.folders
      setFolders(reconciled.folders)
      allDocsRef.current = reconciled.docs
      setDocs(reconciled.docs)
      setAgentStatus(`Renamed folder to "${name}"`)
      return
    }

    setFoldersPending([folderId], true)
    setAgentStatus(`Renaming folder "${target.name}"…`)
    void syncDriveApi(
      () => {
        const oldPath = folderDiskPath(foldersRef.current, folderId)
        if (!oldPath) return null
        return {
          action: 'rename_folder',
          oldPath,
          newName: name,
          color,
          updatedAt: now,
        }
      },
      {
        onError: () => {
          setFoldersPending([folderId], false)
        },
        onSuccess: (res) => {
          setFoldersPending([folderId], false)
          const serverFolder = res.folder as DriveFolder | undefined
          const reconciled = reconcileFolderRename(
            foldersRef.current,
            allDocsRef.current,
            {
              folderId,
              nextFolderId: serverFolder?.id,
              name: serverFolder?.name ?? name,
              color: serverFolder?.color ?? color,
              updatedAt: serverFolder?.updatedAt ?? now,
            },
          )
          foldersRef.current = reconciled.folders
          setFolders(reconciled.folders)
          allDocsRef.current = reconciled.docs
          setDocs(reconciled.docs)
          if (
            reconciled.resolvedFolderId !== folderId &&
            currentFolderId === folderId
          ) {
            setLocalCurrentFolderId(reconciled.resolvedFolderId)
            if (isRouted) {
              navigateWithGlobalSearch(
                folderIdHref(reconciled.resolvedFolderId, reconciled.folders),
                undefined,
                { replace: true },
              )
            }
          }
          setAgentStatus(`Renamed folder to "${serverFolder?.name ?? name}"`)
        },
      },
    )
  }

  function submitFolderModal(name: string, color: DriveFolderColor) {
    if (!folderModal) return
    const now = new Date().toISOString()
    if (folderModal.mode === 'create') {
      const parentId = folderModal.parentId
      setFolderModal(null)
      if (!syncWithServer) {
        const created: DriveFolder = {
          id: mintClientFolderId(foldersRef.current, undefined, shortSha),
          name,
          parentId,
          color,
          isTemplatesFolder:
            parentId === null && name === TEMPLATES_FOLDER_NAME,
          createdAt: now,
          updatedAt: now,
        }
        foldersRef.current = [...foldersRef.current, created]
        setFolders(foldersRef.current)
        return
      }
      setAgentStatus(`Creating folder "${name}"…`)
      void syncDriveApi(
        () => ({
          action: 'create_folder',
          name,
          parentPath: folderDiskPath(foldersRef.current, parentId),
          color,
          createdAt: now,
          updatedAt: now,
        }),
        {
          onSuccess: (res) => {
            const serverFolder = res.folder as DriveFolder | undefined
            if (!serverFolder) return
            const normalized: DriveFolder = {
              ...serverFolder,
              isTemplatesFolder:
                serverFolder.parentId === null &&
                serverFolder.name === TEMPLATES_FOLDER_NAME,
            }
            const nextFolders = foldersRef.current.some(
              (f) => f.id === normalized.id,
            )
              ? foldersRef.current.map((f) =>
                  f.id === normalized.id ? normalized : f,
                )
              : [...foldersRef.current, normalized]
            foldersRef.current = nextFolders
            setFolders(nextFolders)
            setAgentStatus(`Created folder "${normalized.name}"`)
          },
        },
      )
      return
    }
    const targetFolderId = folderModal.folder.id
    setFolderModal(null)
    renameFolderById(targetFolderId, name, color)
  }

  function deleteFolder(folder: DriveFolder) {
    const removed = getDescendantFolderIds(foldersRef.current, folder.id)
    for (const id of removed) {
      if (pendingFolderIdsRef.current.has(id)) {
        setAgentStatus('Wait for folder update to finish.')
        return
      }
    }

    const applyLocalDelete = () => {
      const parentName = folder.parentId
        ? (foldersRef.current.find((f) => f.id === folder.parentId)?.name ??
          'My Drive')
        : 'My Drive'
      const nextFolders = foldersRef.current.filter(
        (item) => !removed.has(item.id),
      )
      const nextTemplateIds = getTemplateFolderIds(nextFolders)
      foldersRef.current = nextFolders
      setFolders(nextFolders)
      const nextDocs = allDocsRef.current.map((doc) =>
        doc.folderId && removed.has(doc.folderId)
          ? {
              ...doc,
              folderId: folder.parentId,
              folder: parentName,
              isTemplate: folder.parentId
                ? nextTemplateIds.has(folder.parentId)
                : false,
            }
          : doc,
      )
      allDocsRef.current = nextDocs
      setDocs(nextDocs)
      if (currentFolderId && removed.has(currentFolderId)) {
        setLocalCurrentFolderId(folder.parentId)
        if (isRouted) {
          navigateWithGlobalSearch(
            folderIdHref(folder.parentId, nextFolders),
            undefined,
            { replace: true },
          )
        }
      }
    }

    if (!syncWithServer) {
      applyLocalDelete()
      return
    }

    setFoldersPending(removed, true)
    setAgentStatus(`Deleting folder "${folder.name}"…`)
    void syncDriveApi(
      () => {
        const folderPath = folderDiskPath(foldersRef.current, folder.id)
        if (!folderPath) return null
        return { action: 'delete_folder', folderPath }
      },
      {
        onError: () => {
          setFoldersPending(removed, false)
        },
        onSuccess: (result) => {
          setFoldersPending(removed, false)
          applyLocalDelete()
          const moved = result.movedFiles
          if (
            Array.isArray(moved) &&
            moved.some((item) => {
              const rec = item as { from?: string; to?: string }
              return rec.from?.split('/').pop() !== rec.to?.split('/').pop()
            })
          ) {
            void reloadWorkspaceFromServer()
          }
          setAgentStatus(`Deleted folder "${folder.name}"`)
        },
      },
    )
  }

  function moveDocumentToFolder(docId: string, targetFolderId: string | null) {
    if (pendingRenameDocIdsRef.current.has(docId)) {
      setAgentStatus('Wait for rename to finish before moving this file.')
      setMoveDocId(null)
      return
    }
    const targetDoc = allDocsRef.current.find((doc) => doc.id === docId)
    if (
      isFolderOrAncestorPending(targetDoc?.folderId) ||
      isFolderOrAncestorPending(targetFolderId)
    ) {
      setAgentStatus('Wait for folder update to finish.')
      setMoveDocId(null)
      return
    }
    const targetFolder = targetFolderId
      ? foldersRef.current.find((f) => f.id === targetFolderId)
      : null
    const folderName = targetFolder ? targetFolder.name : 'My Drive'
    const nextTemplateIds = getTemplateFolderIds(foldersRef.current)
    const nextIsTemplate = targetFolder
      ? nextTemplateIds.has(targetFolder.id)
      : false
    const now = new Date().toISOString()
    patchFile(docId, (doc) => ({
      ...doc,
      folderId: targetFolder ? targetFolder.id : null,
      folder: folderName,
      isTemplate: nextIsTemplate,
      updatedAt: now,
    }))
    if (targetDoc) {
      const fromFolderId = targetDoc.folderId ?? null
      const toFolderId = targetFolder ? targetFolder.id : null
      const nextDoc: MarbleDocumentFile = {
        ...targetDoc,
        folderId: toFolderId,
        folder: folderName,
        isTemplate: nextIsTemplate,
        updatedAt: now,
      }
      const capturedSource =
        sourceRef.current.get(targetDoc.id) ?? targetDoc.source
      const capturedMeta = serializeDocMeta(nextDoc)
      void syncDriveApi(
        () => ({
          action: 'move_document',
          slug: (allDocsRef.current.find((d) => d.id === docId) ?? targetDoc)
            .slug,
          fromFolderPath: folderDiskPath(foldersRef.current, fromFolderId),
          toFolderPath: folderDiskPath(foldersRef.current, toFolderId),
          source: capturedSource,
          meta: capturedMeta,
        }),
        { reloadOnError: true },
      )
    }
    setMoveDocId(null)
  }

  function toggleFlag(id: string, flag: 'starred' | 'pinned') {
    if (pendingRenameDocIdsRef.current.has(id)) {
      setAgentStatus('Wait for rename to finish before modifying this file.')
      return
    }
    const targetDoc = allDocsRef.current.find((doc) => doc.id === id)
    patchFile(id, (doc) => ({ ...doc, [flag]: !doc[flag] }))
    if (targetDoc) {
      const nextDoc = { ...targetDoc, [flag]: !targetDoc[flag] }
      const capturedMeta = serializeDocMeta(nextDoc)
      void syncDriveApi(() => {
        const live = allDocsRef.current.find((d) => d.id === id) ?? targetDoc
        return {
          action: 'update_document_meta',
          slug: live.slug,
          folderPath: folderDiskPath(foldersRef.current, live.folderId),
          meta: { ...capturedMeta, slug: live.slug },
        }
      })
    }
  }

  function syncTrashApi(
    bodyOrFactory:
      Record<string, unknown> | (() => Record<string, unknown> | null),
  ) {
    void syncDriveApi(bodyOrFactory)
  }

  function cleanupRemovedDocIds(removedIds: Set<string>) {
    if (removedIds.size === 0) return
    setOpenTabIds((prev) => prev.filter((id) => !removedIds.has(id)))
    if (
      activeTabRef.current !== 'home' &&
      removedIds.has(activeTabRef.current)
    ) {
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
    updateDocThreads((prev) => {
      const next = { ...prev }
      for (const id of removedIds) delete next[id]
      return next
    })
    for (const id of removedIds) {
      queueDocChatDelete(id)
    }
    for (const id of removedIds) sourceRef.current.delete(id)
    setLivePreview((prev) => (prev && removedIds.has(prev.docId) ? null : prev))
    setShareId((prev) => (prev && removedIds.has(prev) ? null : prev))
    setMoveDocId((prev) => (prev && removedIds.has(prev) ? null : prev))
    setTrashUndo((prev) => (prev && removedIds.has(prev.docId) ? null : prev))
  }

  function moveDocumentToTrash(docId: string) {
    if (pendingRenameDocIdsRef.current.has(docId)) {
      setAgentStatus('Wait for rename to finish before trashing this file.')
      return
    }
    const target = allDocsRef.current.find((doc) => doc.id === docId)
    if (!target || target.trashedAt) return
    const trashedAt = new Date().toISOString()
    patchFile(docId, (doc) => ({ ...doc, trashedAt }))
    if (openTabIds.includes(docId)) {
      closeTab(docId)
    }
    if (livePreview?.docId === docId) setLivePreview(null)
    if (shareId === docId) setShareId(null)
    if (moveDocId === docId) setMoveDocId(null)
    setTrashUndo({ docId: target.id, title: target.title })
    syncTrashApi(() => {
      const live = allDocsRef.current.find((doc) => doc.id === docId) ?? target
      return {
        action: 'trash',
        slug: live.slug,
        folderPath: folderDiskPath(foldersRef.current, live.folderId),
        trashedAt,
        retentionDays: effectiveTrashRetentionDays,
        meta: serializeDocMeta(live),
        checkpoints: live.checkpoints,
        intentHistory: live.intentHistory,
      }
    })
  }

  function restoreDocumentFromTrash(docId: string) {
    const target = allDocsRef.current.find((doc) => doc.id === docId)
    if (!target || !target.trashedAt) return
    const parentFolder = target.folderId
      ? foldersRef.current.find((folder) => folder.id === target.folderId)
      : null
    const restoredFolderId = parentFolder ? parentFolder.id : null
    const restoredFolderName = parentFolder ? parentFolder.name : 'My Drive'
    const nextIsTemplate = deriveDocIsTemplate(
      { ...target, folderId: restoredFolderId, folder: restoredFolderName },
      foldersRef.current,
      getTemplateFolderIds(foldersRef.current),
    )
    patchFile(docId, (doc) => ({
      ...doc,
      trashedAt: null,
      folderId: restoredFolderId,
      folder: restoredFolderName,
      isTemplate: nextIsTemplate,
    }))
    setTrashUndo((prev) => (prev?.docId === docId ? null : prev))
    setAgentStatus(`Restored "${target.title}" to ${restoredFolderName}`)
    syncTrashApi({
      action: 'restore',
      slug: target.slug,
      targetFolderPath: folderDiskPath(foldersRef.current, restoredFolderId),
    })
  }

  function permanentlyDeleteDocument(docId: string) {
    if (pendingRenameDocIdsRef.current.has(docId)) {
      setPermanentDeleteTarget(null)
      setAgentStatus('Wait for rename to finish before deleting this file.')
      return
    }
    const target = allDocsRef.current.find((doc) => doc.id === docId)
    if (!target) {
      setPermanentDeleteTarget(null)
      return
    }
    allDocsRef.current = allDocsRef.current.filter((doc) => doc.id !== docId)
    setDocs((prev) => prev.filter((doc) => doc.id !== docId))
    cleanupRemovedDocIds(new Set([docId]))
    setPermanentDeleteTarget(null)
    setAgentStatus(`Permanently deleted "${target.title}"`)
    syncTrashApi({
      action: 'delete',
      slug: target.slug,
      folderPath: folderDiskPath(foldersRef.current, target.folderId),
    })
  }

  function emptyTrash() {
    if (trashedDocs.length === 0) {
      setPermanentDeleteTarget(null)
      return
    }
    const removedIds = new Set(trashedDocs.map((doc) => doc.id))
    const count = trashedDocs.length
    allDocsRef.current = allDocsRef.current.filter(
      (doc) => !removedIds.has(doc.id),
    )
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
          effectiveTrashRetentionDays,
        )
        if (result.purged.length === 0) return prev
        purgedDocs = result.purged
        return result.docs
      })
      if (purgedDocs.length > 0) {
        syncTrashApi({
          action: 'purge_expired',
          retentionDays: effectiveTrashRetentionDays,
        })
      }
    }
    purgeNow()
    const timer = window.setInterval(purgeNow, 60 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [effectiveTrashRetentionDays])

  function updateChatMessage(
    threadId: string,
    msgId: string,
    updater: (msg: DriveChatMessage) => DriveChatMessage,
    options?: { persist?: boolean },
  ) {
    updateChatThreads((prev) =>
      prev.map((item) =>
        item.id !== threadId
          ? item
          : {
              ...item,
              updatedAt: new Date().toISOString(),
              messages: item.messages.map((msg) =>
                msg.id === msgId ? updater(msg) : msg,
              ),
            },
      ),
    )
    if (options?.persist) {
      scheduleChatThreadSave(threadId)
    }
  }

  function updateChatAction(
    threadId: string,
    msgId: string,
    actionId: string,
    updater: (action: DriveChatAction) => DriveChatAction,
  ) {
    updateChatMessage(
      threadId,
      msgId,
      (msg) => ({
        ...msg,
        actions: (msg.actions ?? []).map((act) =>
          act.id === actionId ? updater(act) : act,
        ),
      }),
      { persist: true },
    )
  }

  function executeDriveChatAction(
    threadId: string,
    msgId: string,
    action: DriveChatAction,
  ) {
    const now = new Date().toISOString()
    try {
      if (action.kind === 'edit_document') {
        const target = allDocsRef.current.find((d) => d.id === action.docId)
        if (!target) {
          throw new Error(`Document "${action.docTitle}" was not found.`)
        }
        const priorSource = sourceRef.current.get(target.id) ?? target.source
        let nextSource = priorSource
        if (action.replacementSource) {
          nextSource = action.replacementSource
        } else if (action.ops.length > 0) {
          nextSource = applyMarbleOpsClient(priorSource, action.ops).source
        }
        sourceRef.current.set(target.id, nextSource)
        if (activeTabRef.current === target.id) {
          shownSourceRef.current = nextSource
        }
        const checkpoint: MarbleCheckpoint = {
          sha: shortSha(),
          label: `Chat · ${action.summary}`,
          timestamp: Date.now(),
          author: 'Drive Chat',
          opsCount: Math.max(action.ops.length, 1),
          source: nextSource,
        }
        patchFile(target.id, (doc) =>
          applyDocumentContentUpdate(doc, {
            source: nextSource,
            updatedAt: now,
            lastEditedBy: { name: 'Drive Chat', initials: 'AI', isAi: true },
            checkpoint,
          }),
        )
        const updatedDoc = allDocsRef.current.find((d) => d.id === target.id)
        persist(
          target.id,
          updatedDoc?.slug ?? target.slug,
          priorSource,
          action.ops,
          nextSource,
          updatedDoc,
        )
        chatUndoMapRef.current.set(action.id, () => {
          const current = allDocsRef.current.find((d) => d.id === target.id)
          if (!current) return
          const currentSource =
            sourceRef.current.get(target.id) ?? current.source
          sourceRef.current.set(target.id, priorSource)
          if (activeTabRef.current === target.id) {
            shownSourceRef.current = priorSource
          }
          const undoCheckpoint: MarbleCheckpoint = {
            sha: shortSha(),
            label: `Undo · ${action.summary}`,
            timestamp: Date.now(),
            author: YOU.name,
            opsCount: 1,
            source: priorSource,
          }
          const revertedAt = new Date().toISOString()
          patchFile(target.id, (doc) =>
            applyDocumentContentUpdate(doc, {
              source: priorSource,
              updatedAt: revertedAt,
              lastEditedBy: YOU,
              checkpoint: undoCheckpoint,
            }),
          )
          const revertedDoc = allDocsRef.current.find((d) => d.id === target.id)
          if (revertedDoc) {
            persist(
              revertedDoc.id,
              revertedDoc.slug,
              currentSource,
              [],
              priorSource,
              revertedDoc,
            )
          }
        })
        updateChatAction(threadId, msgId, action.id, (act) => ({
          ...act,
          status: 'applied',
          error: undefined,
        }))
        return
      }

      if (action.kind === 'create_document') {
        const matchedFolder =
          (action.folderId
            ? foldersRef.current.find((f) => f.id === action.folderId)
            : null) ??
          foldersRef.current.find(
            (f) => f.name.toLowerCase() === action.folderName.toLowerCase(),
          ) ??
          null
        const nodeCount = countMarbleNodes(action.source)
        const byteSize = byteSizeOf(action.source)
        const draftDoc: MarbleDocumentFile = {
          id: `doc-${shortSha()}`,
          slug: action.slug,
          fileName: `${action.slug}.mrbl`,
          title: action.title,
          description: action.description,
          category: action.category,
          isTemplate: false,
          source: action.source,
          nodeCount,
          byteSize,
          version: 1,
          syncState: 'saved',
          createdAt: now,
          updatedAt: now,
          createdBy: { name: 'Drive Chat', initials: 'AI', isAi: true },
          lastEditedBy: { name: 'Drive Chat', initials: 'AI', isAi: true },
          starred: false,
          pinned: false,
          tags: action.tags,
          folder: matchedFolder ? matchedFolder.name : 'My Drive',
          folderId: matchedFolder ? matchedFolder.id : null,
          share: {
            isPublicLinkEnabled: false,
            publicLinkUrl: `https://xdrive.app/d/${action.slug}`,
            publicPermission: 'view_only',
            allowDuplication: true,
            sharedAiDailyLimit: 40,
            sharedAiUsedToday: 0,
            collaborators: [],
          },
          checkpoints: [
            {
              sha: shortSha(),
              label: 'Created via Drive Chat',
              timestamp: Date.now(),
              author: 'Drive Chat',
              opsCount: nodeCount,
              source: action.source,
            },
          ],
          intentHistory: [],
        }
        const adopted = adoptDocument(draftDoc, allDocsRef.current)
        const created: MarbleDocumentFile = {
          ...adopted,
          isTemplate: matchedFolder
            ? templateFolderIds.has(matchedFolder.id)
            : false,
          folder: matchedFolder ? matchedFolder.name : 'My Drive',
          folderId: matchedFolder ? matchedFolder.id : null,
        }
        allDocsRef.current = [created, ...allDocsRef.current]
        setDocs((prev) => [created, ...prev])
        persist(
          created.id,
          created.slug,
          created.source,
          [],
          created.source,
          created,
        )
        chatUndoMapRef.current.set(action.id, () => {
          allDocsRef.current = allDocsRef.current.filter(
            (d) => d.id !== created.id,
          )
          setDocs((prev) => prev.filter((d) => d.id !== created.id))
          cleanupRemovedDocIds(new Set([created.id]))
          syncTrashApi({
            action: 'delete',
            slug: created.slug,
            folderPath: folderDiskPath(foldersRef.current, created.folderId),
          })
        })
        updateChatAction(threadId, msgId, action.id, (act) =>
          act.kind === 'create_document'
            ? {
                ...act,
                status: 'applied',
                createdDocId: created.id,
                error: undefined,
              }
            : act,
        )
        return
      }

      if (action.kind === 'rename_document') {
        const target = allDocsRef.current.find((d) => d.id === action.docId)
        if (!target) {
          throw new Error(`Document "${action.docTitle}" was not found.`)
        }
        if (pendingRenameDocIdsRef.current.has(target.id)) {
          throw new Error('Document rename is already in progress.')
        }
        const prevTitle = target.title
        const prevDescription = target.description
        const prevTags = target.tags
        patchFile(target.id, (doc) => ({
          ...doc,
          title: action.nextTitle,
          description: action.nextDescription ?? doc.description,
          tags: action.nextTags ?? doc.tags,
          updatedAt: now,
        }))
        const renamedDoc = allDocsRef.current.find((d) => d.id === target.id)
        if (renamedDoc) {
          void syncDriveApi({
            action: 'update_document_meta',
            slug: renamedDoc.slug,
            folderPath: folderDiskPath(foldersRef.current, renamedDoc.folderId),
            meta: serializeDocMeta(renamedDoc),
          })
        }
        chatUndoMapRef.current.set(action.id, () => {
          const revertedAt = new Date().toISOString()
          patchFile(target.id, (doc) => ({
            ...doc,
            title: prevTitle,
            description: prevDescription,
            tags: prevTags,
            updatedAt: revertedAt,
          }))
          const revertedDoc = allDocsRef.current.find((d) => d.id === target.id)
          if (revertedDoc) {
            void syncDriveApi({
              action: 'update_document_meta',
              slug: revertedDoc.slug,
              folderPath: folderDiskPath(
                foldersRef.current,
                revertedDoc.folderId,
              ),
              meta: serializeDocMeta(revertedDoc),
            })
          }
        })
        updateChatAction(threadId, msgId, action.id, (act) => ({
          ...act,
          status: 'applied',
          error: undefined,
        }))
        return
      }

      if (action.kind === 'move_document') {
        const target = allDocsRef.current.find((d) => d.id === action.docId)
        if (!target) {
          throw new Error(`Document "${action.docTitle}" was not found.`)
        }
        if (pendingRenameDocIdsRef.current.has(target.id)) {
          throw new Error('Wait for rename to finish before moving this file.')
        }
        const prevFolderId = target.folderId ?? null
        const prevFolder = target.folder
        const resolvedFolder =
          (action.targetFolderId
            ? foldersRef.current.find((f) => f.id === action.targetFolderId)
            : null) ??
          foldersRef.current.find(
            (f) =>
              f.name.toLowerCase() === action.targetFolderName.toLowerCase(),
          ) ??
          null
        const nextFolderId = resolvedFolder ? resolvedFolder.id : null
        if (
          isFolderOrAncestorPending(prevFolderId) ||
          isFolderOrAncestorPending(nextFolderId)
        ) {
          throw new Error('Wait for folder update to finish.')
        }
        const nextFolderName = resolvedFolder ? resolvedFolder.name : 'My Drive'
        const fromFolderPath = folderDiskPath(foldersRef.current, prevFolderId)
        const toFolderPath = folderDiskPath(foldersRef.current, nextFolderId)
        patchFile(target.id, (doc) => ({
          ...doc,
          folderId: nextFolderId,
          folder: nextFolderName,
          isTemplate: nextFolderId
            ? templateFolderIds.has(nextFolderId)
            : false,
          updatedAt: now,
        }))
        const movedDoc = allDocsRef.current.find((d) => d.id === target.id)
        void syncDriveApi(
          {
            action: 'move_document',
            slug: movedDoc?.slug ?? target.slug,
            fromFolderPath,
            toFolderPath,
            source: sourceRef.current.get(target.id) ?? target.source,
            meta: serializeDocMeta(
              movedDoc ?? {
                ...target,
                folderId: nextFolderId,
                folder: nextFolderName,
                updatedAt: now,
              },
            ),
          },
          { reloadOnError: true },
        )
        chatUndoMapRef.current.set(action.id, () => {
          const current = allDocsRef.current.find((d) => d.id === target.id)
          if (!current) return
          const currentFromPath = folderDiskPath(
            foldersRef.current,
            current.folderId ?? null,
          )
          const revertedAt = new Date().toISOString()
          patchFile(target.id, (doc) => ({
            ...doc,
            folderId: prevFolderId,
            folder: prevFolder,
            isTemplate: deriveDocIsTemplate(
              { ...doc, folderId: prevFolderId, folder: prevFolder },
              foldersRef.current,
              getTemplateFolderIds(foldersRef.current),
            ),
            updatedAt: revertedAt,
          }))
          const revertedDoc = allDocsRef.current.find((d) => d.id === target.id)
          if (revertedDoc) {
            void syncDriveApi(
              {
                action: 'move_document',
                slug: revertedDoc.slug,
                fromFolderPath: currentFromPath,
                toFolderPath: folderDiskPath(foldersRef.current, prevFolderId),
                source:
                  sourceRef.current.get(revertedDoc.id) ?? revertedDoc.source,
                meta: serializeDocMeta(revertedDoc),
              },
              { reloadOnError: true },
            )
          }
        })
        updateChatAction(threadId, msgId, action.id, (act) =>
          act.kind === 'move_document'
            ? {
                ...act,
                targetFolderId: nextFolderId,
                targetFolderName: nextFolderName,
                status: 'applied',
                error: undefined,
              }
            : act,
        )
        return
      }

      if (action.kind === 'update_document_meta') {
        const target = allDocsRef.current.find((d) => d.id === action.docId)
        if (!target) {
          throw new Error(`Document "${action.docTitle}" was not found.`)
        }
        if (pendingRenameDocIdsRef.current.has(target.id)) {
          throw new Error(
            'Wait for rename to finish before modifying metadata.',
          )
        }
        const prevStarred = target.starred
        const prevPinned = target.pinned
        const prevTags = target.tags
        const prevDescription = target.description
        patchFile(target.id, (doc) => ({
          ...doc,
          starred: action.starred ?? doc.starred,
          pinned: action.pinned ?? doc.pinned,
          tags: action.tags ?? doc.tags,
          description: action.description ?? doc.description,
          updatedAt: now,
        }))
        const updatedMetaDoc = allDocsRef.current.find(
          (d) => d.id === target.id,
        )
        if (updatedMetaDoc) {
          void syncDriveApi({
            action: 'update_document_meta',
            slug: updatedMetaDoc.slug,
            folderPath: folderDiskPath(
              foldersRef.current,
              updatedMetaDoc.folderId,
            ),
            meta: serializeDocMeta(updatedMetaDoc),
          })
        }
        chatUndoMapRef.current.set(action.id, () => {
          const revertedAt = new Date().toISOString()
          patchFile(target.id, (doc) => ({
            ...doc,
            starred: prevStarred,
            pinned: prevPinned,
            tags: prevTags,
            description: prevDescription,
            updatedAt: revertedAt,
          }))
          const revertedDoc = allDocsRef.current.find((d) => d.id === target.id)
          if (revertedDoc) {
            void syncDriveApi({
              action: 'update_document_meta',
              slug: revertedDoc.slug,
              folderPath: folderDiskPath(
                foldersRef.current,
                revertedDoc.folderId,
              ),
              meta: serializeDocMeta(revertedDoc),
            })
          }
        })
        updateChatAction(threadId, msgId, action.id, (act) => ({
          ...act,
          status: 'applied',
          error: undefined,
        }))
        return
      }

      if (action.kind === 'trash_document') {
        moveDocumentToTrash(action.docId)
        chatUndoMapRef.current.set(action.id, () => {
          restoreDocumentFromTrash(action.docId)
        })
        updateChatAction(threadId, msgId, action.id, (act) => ({
          ...act,
          status: 'applied',
          error: undefined,
        }))
        return
      }

      if (action.kind === 'restore_document') {
        restoreDocumentFromTrash(action.docId)
        chatUndoMapRef.current.set(action.id, () => {
          moveDocumentToTrash(action.docId)
        })
        updateChatAction(threadId, msgId, action.id, (act) => ({
          ...act,
          status: 'applied',
          error: undefined,
        }))
        return
      }

      if (action.kind === 'create_folder') {
        const parentId = action.parentId
        if (!syncWithServer) {
          const created: DriveFolder = {
            id: mintClientFolderId(foldersRef.current, undefined, shortSha),
            name: action.name,
            parentId,
            color: action.color,
            isTemplatesFolder:
              parentId === null && action.name === TEMPLATES_FOLDER_NAME,
            createdAt: now,
            updatedAt: now,
          }
          foldersRef.current = [...foldersRef.current, created]
          setFolders(foldersRef.current)
          chatUndoMapRef.current.set(action.id, () => {
            deleteFolder(created)
          })
          updateChatAction(threadId, msgId, action.id, (act) =>
            act.kind === 'create_folder'
              ? {
                  ...act,
                  status: 'applied',
                  createdFolderId: created.id,
                  error: undefined,
                }
              : act,
          )
          return
        }

        void syncDriveApi(
          () => ({
            action: 'create_folder',
            name: action.name,
            parentPath: folderDiskPath(foldersRef.current, parentId),
            color: action.color,
            createdAt: now,
            updatedAt: now,
          }),
          {
            onError: (message) => {
              updateChatAction(threadId, msgId, action.id, (act) => ({
                ...act,
                status: 'failed',
                error: message,
              }))
            },
            onSuccess: (res) => {
              const serverFolder = res.folder as DriveFolder | undefined
              if (!serverFolder) return
              const created: DriveFolder = {
                ...serverFolder,
                isTemplatesFolder:
                  serverFolder.parentId === null &&
                  serverFolder.name === TEMPLATES_FOLDER_NAME,
              }
              const nextFolders = foldersRef.current.some(
                (f) => f.id === created.id,
              )
                ? foldersRef.current.map((f) =>
                    f.id === created.id ? created : f,
                  )
                : [...foldersRef.current, created]
              foldersRef.current = nextFolders
              setFolders(nextFolders)
              chatUndoMapRef.current.set(action.id, () => {
                deleteFolder(created)
              })
              updateChatAction(threadId, msgId, action.id, (act) =>
                act.kind === 'create_folder'
                  ? {
                      ...act,
                      status: 'applied',
                      createdFolderId: created.id,
                      error: undefined,
                    }
                  : act,
              )
            },
          },
        )
        return
      }

      if (action.kind === 'rename_folder') {
        const target = foldersRef.current.find((f) => f.id === action.folderId)
        if (!target) {
          throw new Error(`Folder "${action.folderName}" was not found.`)
        }
        if (pendingFolderIdsRef.current.has(target.id)) {
          throw new Error('Wait for folder update to finish.')
        }
        const prevName = target.name
        const prevColor = target.color ?? 'default'
        const nextColor = action.nextColor ?? prevColor
        renameFolderById(target.id, action.nextName, nextColor)
        chatUndoMapRef.current.set(action.id, () => {
          renameFolderById(target.id, prevName, prevColor)
        })
        updateChatAction(threadId, msgId, action.id, (act) => ({
          ...act,
          status: 'applied',
          error: undefined,
        }))
        return
      }

      {
        const target = foldersRef.current.find((f) => f.id === action.folderId)
        if (!target) {
          throw new Error(`Folder "${action.folderName}" was not found.`)
        }
        const snapshotFolders = [...foldersRef.current]
        const removedIds = getDescendantFolderIds(snapshotFolders, target.id)
        const deletedFoldersOrdered = snapshotFolders
          .filter((f) => removedIds.has(f.id))
          .sort(
            (a, b) =>
              getFolderAncestors(snapshotFolders, a.id).length -
              getFolderAncestors(snapshotFolders, b.id).length,
          )
        const affectedDocs = allDocsRef.current
          .filter((d) => d.folderId && removedIds.has(d.folderId))
          .map((d) => ({
            id: d.id,
            slug: d.slug,
            folderId: d.folderId ?? null,
            folder: d.folder,
            isTemplate: d.isTemplate,
            doc: d,
          }))
        const parentPath = folderDiskPath(snapshotFolders, target.parentId)
        deleteFolder(target)
        chatUndoMapRef.current.set(action.id, () => {
          foldersRef.current = snapshotFolders
          setFolders(snapshotFolders)
          const nextDocs = allDocsRef.current.map((d) => {
            const restored = affectedDocs.find((item) => item.id === d.id)
            return restored
              ? {
                  ...d,
                  folderId: restored.folderId,
                  folder: restored.folder,
                  isTemplate: restored.isTemplate,
                }
              : d
          })
          allDocsRef.current = nextDocs
          setDocs(nextDocs)
          for (const folder of deletedFoldersOrdered) {
            void syncDriveApi({
              action: 'create_folder',
              id: folder.id,
              name: folder.name,
              parentPath: folderDiskPath(snapshotFolders, folder.parentId),
              color: folder.color,
              createdAt: folder.createdAt,
              updatedAt: folder.updatedAt,
            })
          }
          for (const item of affectedDocs) {
            void syncDriveApi({
              action: 'move_document',
              slug: item.slug,
              fromFolderPath: parentPath,
              toFolderPath: folderDiskPath(snapshotFolders, item.folderId),
              meta: serializeDocMeta(item.doc),
            })
          }
        })
        updateChatAction(threadId, msgId, action.id, (act) => ({
          ...act,
          status: 'applied',
          error: undefined,
        }))
      }
    } catch (error) {
      updateChatAction(threadId, msgId, action.id, (act) => ({
        ...act,
        status: 'failed',
        error:
          error instanceof Error ? error.message : 'Failed to apply action.',
      }))
    }
  }

  function handleApplyDriveChatAction(msgId: string, actionId: string) {
    const chatThread = chatThreads.find((t) => t.id === activeChatThreadId)
    const msg = chatThread?.messages.find((m) => m.id === msgId)
    const action = msg?.actions?.find((a) => a.id === actionId)
    if (!chatThread || !action || action.status !== 'proposed') return
    executeDriveChatAction(chatThread.id, msgId, action)
  }

  function handleApplyAllDriveChatActions(msgId: string) {
    const chatThread = chatThreads.find((t) => t.id === activeChatThreadId)
    const msg = chatThread?.messages.find((m) => m.id === msgId)
    if (!chatThread || !msg?.actions) return
    for (const action of msg.actions) {
      if (action.status === 'proposed') {
        executeDriveChatAction(chatThread.id, msgId, action)
      }
    }
  }

  function handleDiscardDriveChatAction(msgId: string, actionId: string) {
    updateChatAction(activeChatThreadId, msgId, actionId, (act) =>
      act.status === 'proposed' ? { ...act, status: 'discarded' } : act,
    )
  }

  function handleDiscardAllDriveChatActions(msgId: string) {
    updateChatMessage(
      activeChatThreadId,
      msgId,
      (msg) => ({
        ...msg,
        actions: (msg.actions ?? []).map((act) =>
          act.status === 'proposed' ? { ...act, status: 'discarded' } : act,
        ),
      }),
      { persist: true },
    )
  }

  function handleUndoDriveChatAction(msgId: string, actionId: string) {
    const undo = chatUndoMapRef.current.get(actionId)
    if (!undo) return
    undo()
    chatUndoMapRef.current.delete(actionId)
    updateChatAction(activeChatThreadId, msgId, actionId, (act) => ({
      ...act,
      status: 'undone',
    }))
  }

  function handleSelectChatThread(threadId: string) {
    activeChatThreadIdRef.current = threadId
    setLocalActiveChatThreadId(threadId)
    if (isRouted) {
      const target = chatThreadsRef.current.find((item) => item.id === threadId)
      const href =
        target && !isMeaningfulChatThread(target)
          ? '/chat'
          : chatThreadHref(threadId)
      navigateWithGlobalSearch(href)
    }
    if (!syncWithServer || chatStreamingThreadId === threadId) return
    void chatSyncQueueRef.current
      .then(() => fetchDriveChatThread(threadId))
      .then((fresh) => {
        if (!fresh || pendingChatSaveIdsRef.current.has(threadId)) return
        updateChatThreads((prev) =>
          prev.map((item) => {
            if (item.id !== fresh.id) return item
            if (item.messages.some((m) => m.isStreaming)) return item
            return Date.parse(fresh.updatedAt) >= Date.parse(item.updatedAt)
              ? fresh
              : item
          }),
        )
      })
  }

  function handleNewChatThread() {
    const existingBlank = chatThreadsRef.current.find(
      (item) => !isMeaningfulChatThread(item),
    )
    if (existingBlank) {
      activeChatThreadIdRef.current = existingBlank.id
      setLocalActiveChatThreadId(existingBlank.id)
      if (isRouted) {
        navigateWithGlobalSearch('/chat')
      }
      return
    }
    const next = createBlankChatThread(modelId, chatReasoningEffort, chatMode)
    updateChatThreads((prev) => [next, ...prev])
    activeChatThreadIdRef.current = next.id
    setLocalActiveChatThreadId(next.id)
    if (isRouted) {
      navigateWithGlobalSearch('/chat')
    }
  }

  function handleStopDriveChat() {
    chatAbortRef.current?.abort()
    chatAbortRef.current = null
    if (chatStreamingThreadId) {
      const stoppedThreadId = chatStreamingThreadId
      updateChatThreads((prev) =>
        prev.map((item) =>
          item.id !== stoppedThreadId
            ? item
            : {
                ...item,
                messages: item.messages.map((msg) =>
                  msg.isStreaming
                    ? { ...msg, isStreaming: false, streamingPhase: undefined }
                    : msg,
                ),
              },
        ),
      )
      scheduleChatThreadSave(stoppedThreadId)
    }
    setChatStreamingThreadId(null)
  }

  async function runDriveChatTurn(params: {
    threadId: string
    historyMessages: Array<{ role: 'user' | 'assistant'; content: string }>
    userPrompt: string
    contextRefs: DriveContextRef[]
    assistantMsgId: string
  }) {
    const {
      threadId,
      historyMessages,
      userPrompt,
      contextRefs,
      assistantMsgId,
    } = params

    chatAbortRef.current?.abort()
    const abortController = new AbortController()
    chatAbortRef.current = abortController
    setChatStreamingThreadId(threadId)

    const selectedModel =
      driveChatModels.find((m) => m.id === modelId) ??
      driveChatModels.find((m) => m.connected) ??
      driveChatModels.at(0)
    const resolvedModelId = selectedModel ? selectedModel.id : modelId
    const resolvedProviderId = selectedModel
      ? selectedModel.providerId
      : providerFor(resolvedModelId, connectedModels)
    const startedAt = Date.now()
    let thinkingEndedAt: number | null = null

    const snapshot = buildDriveSnapshot({
      docs: activeDocs,
      trashedDocs,
      folders,
      focusedRefs: contextRefs,
      query: userPrompt,
    })

    const request = prepareDriveChatRequest(
      {
        threadId,
        modelId: resolvedModelId,
        providerId: resolvedProviderId,
        reasoningEffort: chatReasoningEffort,
        mode: chatMode,
        messages: historyMessages,
        drive: snapshot,
      },
      selectedModel,
    )

    try {
      await streamDriveChat(
        request,
        (event) => {
          if (event.type === 'status') {
            updateChatMessage(threadId, assistantMsgId, (msg) => ({
              ...msg,
              streamingPhase: event.phase,
            }))
            return
          }
          if (event.type === 'thought_delta') {
            updateChatMessage(threadId, assistantMsgId, (msg) => {
              const prevThoughts = msg.thoughts ?? []
              const merged =
                prevThoughts.length > 0
                  ? [
                      ...prevThoughts.slice(0, -1),
                      `${prevThoughts[prevThoughts.length - 1]}${event.delta}`,
                    ]
                  : [event.delta]
              return {
                ...msg,
                streamingPhase: 'thinking',
                thoughts: merged,
              }
            })
            return
          }
          if (event.type === 'text_delta') {
            if (thinkingEndedAt === null) thinkingEndedAt = Date.now()
            updateChatMessage(threadId, assistantMsgId, (msg) => ({
              ...msg,
              streamingPhase: 'answering',
              thinkingDurationMs:
                msg.thinkingDurationMs ?? thinkingEndedAt! - startedAt,
              content: `${msg.content}${event.delta}`,
            }))
            return
          }
          if (event.type === 'done') {
            const durationMs =
              thinkingEndedAt !== null
                ? thinkingEndedAt - startedAt
                : Date.now() - startedAt
            const resolvedName =
              driveChatModels.find((m) => m.id === event.runtime.modelId)
                ?.name ??
              (selectedModel ? selectedModel.name : event.runtime.modelId)
            updateChatMessage(
              threadId,
              assistantMsgId,
              (msg) => ({
                ...msg,
                content: event.answer,
                modelId: event.runtime.modelId,
                modelName: resolvedName,
                providerId: event.runtime.providerId,
                thoughts:
                  event.thoughts.length > 0 ? event.thoughts : msg.thoughts,
                thinkingDurationMs: durationMs,
                referencedDocIds: event.referencedDocIds,
                actions: event.actions,
                isStreaming: false,
                streamingPhase: undefined,
              }),
              { persist: true },
            )
            if (chatMode === 'auto' && event.actions.length > 0) {
              for (const action of event.actions) {
                executeDriveChatAction(threadId, assistantMsgId, action)
              }
            }
            return
          }
          if (event.providerId === 'grok-build' && event.authRequired) {
            void refreshGrokBuild(true)
          } else if (
            event.providerId === 'opencode-go' &&
            (event.authRequired ||
              event.entitlementRequired ||
              event.rateLimited)
          ) {
            void refreshOpenCodeGo()
          } else if (event.authRequired) {
            void refreshAntigravity()
          }
          updateChatMessage(
            threadId,
            assistantMsgId,
            (msg) => ({
              ...msg,
              isStreaming: false,
              streamingPhase: undefined,
              error: event.error,
            }),
            { persist: true },
          )
        },
        abortController.signal,
      )
    } catch (error) {
      if (!abortController.signal.aborted) {
        updateChatMessage(
          threadId,
          assistantMsgId,
          (msg) => ({
            ...msg,
            isStreaming: false,
            streamingPhase: undefined,
            error:
              error instanceof Error
                ? error.message
                : 'Drive Chat request failed.',
          }),
          { persist: true },
        )
      }
    } finally {
      if (chatAbortRef.current === abortController) {
        chatAbortRef.current = null
      }
      setChatStreamingThreadId((current) =>
        current === threadId ? null : current,
      )
      const wasStreaming = Boolean(
        chatThreadsRef.current
          .find((t) => t.id === threadId)
          ?.messages.some((m) => m.id === assistantMsgId && m.isStreaming),
      )
      if (wasStreaming) {
        updateChatMessage(
          threadId,
          assistantMsgId,
          (msg) =>
            msg.isStreaming
              ? { ...msg, isStreaming: false, streamingPhase: undefined }
              : msg,
          { persist: true },
        )
      }
    }
  }

  function handleSendDriveChatMessage(input: {
    text: string
    contextRefs: DriveContextRef[]
  }) {
    const text = input.text.trim()
    if (!text) return
    const currentThread =
      chatThreads.find((t) => t.id === activeChatThreadId) ?? chatThreads.at(0)
    if (!currentThread) return

    const selectedModel =
      driveChatModels.find((m) => m.id === modelId) ??
      driveChatModels.find((m) => m.connected) ??
      driveChatModels.at(0)
    const now = new Date().toISOString()

    const userMsg: DriveChatMessage = {
      id: messageId('chat-u'),
      role: 'user',
      content: text,
      createdAt: now,
      contextRefs: input.contextRefs.length > 0 ? input.contextRefs : undefined,
    }
    const assistantMsg: DriveChatMessage = {
      id: messageId('chat-a'),
      role: 'assistant',
      content: '',
      createdAt: now,
      modelId: selectedModel ? selectedModel.id : modelId,
      modelName: selectedModel ? selectedModel.name : modelId,
      providerId: selectedModel ? selectedModel.providerId : undefined,
      reasoningEffort: reasoningEffortForModel(
        selectedModel,
        chatReasoningEffort,
      ),
      mode: chatMode,
      isStreaming: true,
      streamingPhase: 'thinking',
    }

    const nextTitle =
      currentThread.messages.length === 0
        ? text.replace(/\s+/g, ' ').slice(0, 52)
        : currentThread.title

    const historyMessages = [
      ...currentThread.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .filter((m) => m.content.trim().length > 0)
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      { role: 'user' as const, content: text },
    ]

    updateChatThreads((prev) =>
      prev.map((item) =>
        item.id !== currentThread.id
          ? item
          : {
              ...item,
              title: nextTitle,
              updatedAt: now,
              modelId: selectedModel ? selectedModel.id : modelId,
              reasoningEffort: reasoningEffortForModel(
                selectedModel,
                chatReasoningEffort,
              ),
              mode: chatMode,
              messages: [...item.messages, userMsg, assistantMsg],
            },
      ),
    )
    scheduleChatThreadSave(currentThread.id)
    if (
      isRouted &&
      routeMatch?.kind === 'chat' &&
      routeMatch.threadId !== currentThread.id
    ) {
      navigateWithGlobalSearch(chatThreadHref(currentThread.id), undefined, {
        replace: true,
      })
    }

    void runDriveChatTurn({
      threadId: currentThread.id,
      historyMessages,
      userPrompt: text,
      contextRefs: input.contextRefs,
      assistantMsgId: assistantMsg.id,
    })
  }

  function handleRegenerateDriveChatMessage(assistantId: string) {
    const targetThread = chatThreads.find((t) => t.id === activeChatThreadId)
    if (!targetThread) return
    const idx = targetThread.messages.findIndex((m) => m.id === assistantId)
    if (idx <= 0) return
    const priorMessages = targetThread.messages.slice(0, idx)
    const lastUser = [...priorMessages].reverse().find((m) => m.role === 'user')
    if (!lastUser) return

    const selectedModel =
      driveChatModels.find((m) => m.id === modelId) ??
      driveChatModels.find((m) => m.connected) ??
      driveChatModels.at(0)
    const now = new Date().toISOString()
    const freshAssistant: DriveChatMessage = {
      id: messageId('chat-a'),
      role: 'assistant',
      content: '',
      createdAt: now,
      modelId: selectedModel ? selectedModel.id : modelId,
      modelName: selectedModel ? selectedModel.name : modelId,
      providerId: selectedModel ? selectedModel.providerId : undefined,
      reasoningEffort: reasoningEffortForModel(
        selectedModel,
        chatReasoningEffort,
      ),
      mode: chatMode,
      isStreaming: true,
      streamingPhase: 'thinking',
    }

    updateChatThreads((prev) =>
      prev.map((item) =>
        item.id !== targetThread.id
          ? item
          : {
              ...item,
              updatedAt: now,
              messages: [...priorMessages, freshAssistant],
            },
      ),
    )
    scheduleChatThreadSave(targetThread.id)

    const historyMessages = priorMessages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

    void runDriveChatTurn({
      threadId: targetThread.id,
      historyMessages,
      userPrompt: lastUser.content,
      contextRefs: lastUser.contextRefs ?? [],
      assistantMsgId: freshAssistant.id,
    })
  }

  const paletteItems: PaletteItem[] = (() => {
    const needle = paletteQuery.trim().toLowerCase()
    const views: PaletteItem[] = [
      {
        id: 'nav-chat',
        label: 'Drive Chat',
        hint: 'Query and modify across your entire Drive with AI',
        run: () => visit('home', 'chat'),
      },
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
            ? `${trashedDocs.length} trashed · clears after ${effectiveTrashRetentionDays}d`
            : `Auto-clears after ${effectiveTrashRetentionDays} days`,
        run: () => visit('home', 'trash'),
      },
      {
        id: 'nav-templates',
        label: 'Templates',
        hint: 'Saved & premade .mrbl templates',
        run: () => visit('home', 'templates'),
      },
      ...(activeDoc && !isDocTemplate(activeDoc)
        ? [
            {
              id: 'action-save-as-template',
              label: 'Save current file as template',
              hint: `Save a copy into ${TEMPLATES_FOLDER_NAME}`,
              run: () => setSaveTemplateTarget(activeDoc),
            },
          ]
        : []),
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
    const updatedDoc: MarbleDocumentFile = {
      ...activeDoc,
      source: nextSource,
      nodeCount: countMarbleNodes(nextSource),
      byteSize: byteSizeOf(nextSource),
      version: activeDoc.version + 1,
      updatedAt: new Date().toISOString(),
      syncState: 'saving',
      lastEditedBy: YOU,
      checkpoints: coalesceCheckpoint(activeDoc.checkpoints, checkpoint, {
        type: 'setText',
      }),
    }
    patchFile(id, () => updatedDoc)
    persist(id, activeDoc.slug, prior, [], nextSource, updatedDoc)
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

  const currentDriveHref = currentFolderId
    ? folderIdHref(currentFolderId, folders)
    : '/drive'
  const currentChatHref =
    activeChatThreadId &&
    chatThreads.some(
      (t) => t.id === activeChatThreadId && isMeaningfulChatThread(t),
    )
      ? chatThreadHref(activeChatThreadId)
      : '/chat'
  const aiToggleHref = buildCurrentHrefWithSearch({
    ai: aiSidebarOpen ? undefined : aiSidebarTab,
  })
  const newAgentHref = buildCurrentHrefWithSearch({
    modal: 'new-agent',
    shareDoc: undefined,
  })
  const newTemplateHref = buildCurrentHrefWithSearch({
    modal: 'new-template',
    shareDoc: undefined,
  })
  const evergreenHrefs = useMemo(() => {
    const map: Record<string, string> = {}
    for (const ref of evergreenRefs) {
      const target = library.find((item) => item.slug === ref.slug)
      map[ref.slug] = target ? docHref(target) : `/d/${ref.slug}`
    }
    return map
  }, [evergreenRefs, library])
  const docModeHrefs = useMemo(() => {
    if (!activeDoc) return undefined
    return {
      direct: buildCurrentHrefWithSearch({ mode: undefined }),
      select: buildCurrentHrefWithSearch({ mode: 'select' }),
      sketch: buildCurrentHrefWithSearch({ mode: 'sketch' }),
      source: buildCurrentHrefWithSearch({ mode: 'source' }),
    }
  }, [activeDoc, workspaceRoute?.pathname, routeSearch])
  const aiTabHrefs = useMemo(
    () => ({
      chat: buildCurrentHrefWithSearch({ ai: 'chat' }),
      ops: buildCurrentHrefWithSearch({ ai: 'ops' }),
      history: buildCurrentHrefWithSearch({ ai: 'history' }),
    }),
    [workspaceRoute?.pathname, routeSearch],
  )
  const activeDocShareHref = activeDoc
    ? buildCurrentHrefWithSearch({ modal: 'share', shareDoc: undefined })
    : undefined

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
        activeNav={nav}
        driveHref={currentDriveHref}
        chatHref={currentChatHref}
        newTabHref="/drive"
        aiToggleHref={aiToggleHref}
        onSelectTab={(tabId) => visit(tabId, tabId === 'home' ? 'drive' : nav)}
        onSelectChat={() => visit('home', 'chat')}
        onCloseTab={closeTab}
        onNewTab={() => navigateToFolder(null)}
        canGoBack={isRouted ? routerCanGoBack : trail.cursor > 0}
        canGoForward={
          isRouted ? routerCanGoForward : trail.cursor < trail.places.length - 1
        }
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
          chatHref={currentChatHref}
          onSelectNav={(next) => visit('home', next)}
          onOpenCommandPalette={() => setPaletteOpen(true)}
          topAction={
            <NewAppButton
              templates={templates}
              aiAgentHref={newAgentHref}
              templatesHref={newTemplateHref}
              onOpenAIAgent={() => setNewAppModalMode('agent')}
              onOpenTemplates={() => setNewAppModalMode('templates')}
              onQuickCreateTemplate={(tpl) =>
                createAppFromTemplate({
                  template: tpl,
                  title: tpl.title,
                  folderId: defaultCreateFolderId,
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
          onRenameFolder={(folder) =>
            setFolderModal({ mode: 'rename', folder })
          }
          onDeleteFolder={deleteFolder}
          onDropDocOnFolder={moveDocumentToFolder}
          trashCount={trashedDocs.length}
          onDropDocOnTrash={moveDocumentToTrash}
          pinnedApps={pinnedApps}
          activeAppId={activeDoc?.id}
          onSelectApp={openDocument}
          onRenameApp={(appId) => {
            const doc = findDoc(appId)
            if (doc) setRenameDocTarget(doc)
          }}
          onSaveAsTemplateApp={(appId) => {
            const doc = findDoc(appId)
            if (doc) setSaveTemplateTarget(doc)
          }}
          onMoveApp={(appId) => setMoveDocId(appId)}
          onDuplicateApp={(appId) => {
            const doc = findDoc(appId)
            if (doc) {
              setNamer({
                sourceId: doc.id,
                title: `${doc.title} copy`,
                mode: 'duplicate',
              })
            }
          }}
          onShareApp={(appId) => setShareId(appId)}
          onToggleStarApp={(appId) => toggleFlag(appId, 'starred')}
          onUnpinApp={(appId) => toggleFlag(appId, 'pinned')}
          onDeleteApp={(appId) => moveDocumentToTrash(appId)}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {isRouted && routeMatch?.kind === 'not-found' ? (
            <WorkspaceNotFoundView
              kind={routeMatch.section === 'settings' ? 'settings' : 'route'}
              targetId={routeMatch.path}
              onGoDrive={() => navigateToFolder(null)}
              onGoSettings={() => visit('home', 'subscriptions')}
            />
          ) : trashedRouteDoc ? (
            <TrashedDocumentView
              doc={trashedRouteDoc}
              folderLabel={getFolderPathLabel(
                folders,
                trashedRouteDoc.folderId,
                trashedRouteDoc.folder,
              )}
              retentionDays={effectiveTrashRetentionDays}
              onRestoreAndOpen={() => {
                restoreDocumentFromTrash(trashedRouteDoc.id)
                openDocument(trashedRouteDoc.id, {
                  doc: { ...trashedRouteDoc, trashedAt: null },
                })
              }}
              onGoTrash={() => visit('home', 'trash')}
              onGoDrive={() => navigateToFolder(null)}
            />
          ) : missingDocId ? (
            <WorkspaceNotFoundView
              kind="doc"
              targetId={missingDocId}
              onGoDrive={() => navigateToFolder(null)}
              onGoTrash={() => visit('home', 'trash')}
            />
          ) : missingFolderId ? (
            <WorkspaceNotFoundView
              kind="folder"
              targetId={missingFolderId}
              onGoDrive={() => navigateToFolder(null)}
            />
          ) : missingChatThreadId ? (
            <WorkspaceNotFoundView
              kind="chat"
              targetId={missingChatThreadId}
              onGoDrive={() => navigateToFolder(null)}
              onGoChat={handleNewChatThread}
            />
          ) : isRouted && routeMatch?.kind === 'doc' && !activeDoc ? (
            <div className="flex flex-1 items-center justify-center p-6 text-[13px] text-[var(--xd-ink-muted)]">
              Loading document…
            </div>
          ) : activeDoc ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <DocumentBreadcrumbHeader
                folder={getFolderPathLabel(
                  folders,
                  activeDoc.folderId,
                  activeDoc.folder,
                )}
                folderHref={folderIdHref(activeDoc.folderId ?? null, folders)}
                onClickFolder={() =>
                  navigateToFolder(activeDoc.folderId ?? null)
                }
                category={activeDoc.category}
                fileName={activeDoc.fileName}
                isTemplate={isDocTemplate(activeDoc)}
                syncState={activeDoc.syncState}
                interactionMode={mode}
                modeHrefs={docModeHrefs}
                onChangeInteractionMode={(next) => setMode(activeDoc.id, next)}
                onSaveAsTemplate={
                  !isDocTemplate(activeDoc)
                    ? () => setSaveTemplateTarget(activeDoc)
                    : undefined
                }
                onUseTemplate={
                  isDocTemplate(activeDoc)
                    ? () =>
                        setNamer({
                          sourceId: activeDoc.id,
                          title: `${activeDoc.title} copy`,
                          mode: 'use-template',
                        })
                    : undefined
                }
                onDuplicate={() =>
                  setNamer({
                    sourceId: activeDoc.id,
                    title: `${activeDoc.title} copy`,
                    mode: 'duplicate',
                  })
                }
                shareHref={activeDocShareHref}
                onOpenShare={() => setShareId(activeDoc.id)}
                onMoveToTrash={() => moveDocumentToTrash(activeDoc.id)}
                sharePermission={
                  simulatedRole === 'owner'
                    ? activeDoc.share.publicPermission
                    : simulatedRole
                }
                isPublicLinkEnabled={activeDoc.share.isPublicLinkEnabled}
              />
              {(agentStatus || pendingRenameDocIds.has(activeDoc.id)) && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center justify-between border-b border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-1.5 text-[12px] text-[var(--xd-ink-secondary)]"
                >
                  <span>
                    {agentStatus ??
                      'Rename in progress — holding edits until confirmed…'}
                  </span>
                  {agentStatus && !pendingRenameDocIds.has(activeDoc.id) && (
                    <button
                      type="button"
                      onClick={() => setAgentStatus(null)}
                      aria-label="Dismiss status"
                      className="text-[var(--xd-ink-muted)] hover:text-[var(--xd-ink)]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
              <div className="min-h-0 flex-1">
                {mode === 'source' ? (
                  <div className="flex h-full min-h-0">
                    <div className="min-w-0 flex-1">{frame}</div>
                    <MarbleSourceInspector
                      fileName={activeDoc.fileName}
                      source={activeDoc.source}
                      selectedId={selectedIds[0] ?? null}
                      onSelectNode={(element) => {
                        selectNodeAndOpenAi(activeDoc.id, element)
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
                        const updatedDoc: MarbleDocumentFile = {
                          ...activeDoc,
                          source: nextSource,
                          nodeCount: countMarbleNodes(nextSource),
                          byteSize: byteSizeOf(nextSource),
                          version: activeDoc.version + 1,
                          updatedAt: new Date().toISOString(),
                          syncState: 'saving',
                          lastEditedBy: YOU,
                          checkpoints: [
                            checkpoint,
                            ...activeDoc.checkpoints,
                          ].slice(0, 40),
                        }
                        patchFile(activeDoc.id, () => updatedDoc)
                        persist(
                          activeDoc.id,
                          activeDoc.slug,
                          prior,
                          ops,
                          nextSource,
                          updatedDoc,
                        )
                      }}
                    />
                  </div>
                ) : (
                  <SelectionSketchOverlay
                    mode={mode}
                    nodes={stageNodes}
                    permission={permission}
                    models={driveChatModels}
                    modelId={modelId}
                    onModelChange={handleSelectModel}
                    reasoningEffort={chatReasoningEffort}
                    onSelectReasoningEffort={setChatReasoningEffort}
                    favoriteModelIds={favoriteModelIds}
                    onFavoriteModelIdsChange={
                      syncWithServer ? handleFavoriteModelIdsChange : undefined
                    }
                    onOpenProviders={() => visit('home', 'subscriptions')}
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
          ) : nav === 'chat' ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <DriveChatView
                threads={chatThreads}
                activeThreadId={activeChatThreadId}
                onSelectThread={handleSelectChatThread}
                onNewThread={handleNewChatThread}
                onDeleteThread={(threadId) => {
                  const next = updateChatThreads((prev) => {
                    const filtered = prev.filter((t) => t.id !== threadId)
                    if (filtered.length === 0) {
                      const blank = createBlankChatThread(
                        modelId,
                        chatReasoningEffort,
                        chatMode,
                      )
                      return [blank]
                    }
                    return filtered
                  })
                  if (activeChatThreadIdRef.current === threadId) {
                    activeChatThreadIdRef.current = next[0].id
                    setLocalActiveChatThreadId(next[0].id)
                    if (isRouted) {
                      const nextHref = isMeaningfulChatThread(next[0])
                        ? chatThreadHref(next[0].id)
                        : '/chat'
                      navigateWithGlobalSearch(nextHref, undefined, {
                        replace: true,
                      })
                    }
                  }
                  queueChatThreadDelete(threadId)
                }}
                onTogglePinThread={(threadId) => {
                  updateChatThreads((prev) =>
                    prev.map((t) =>
                      t.id === threadId
                        ? {
                            ...t,
                            pinned: !t.pinned,
                            updatedAt: new Date().toISOString(),
                          }
                        : t,
                    ),
                  )
                  scheduleChatThreadSave(threadId)
                }}
                onRenameThread={(threadId, title) => {
                  updateChatThreads((prev) =>
                    prev.map((t) =>
                      t.id === threadId
                        ? {
                            ...t,
                            title,
                            updatedAt: new Date().toISOString(),
                          }
                        : t,
                    ),
                  )
                  scheduleChatThreadSave(threadId)
                }}
                docs={activeDocs}
                trashedDocs={trashedDocs}
                folders={folders}
                models={driveChatModels}
                selectedModelId={modelId}
                onSelectModel={handleSelectModel}
                favoriteModelIds={favoriteModelIds}
                onFavoriteModelIdsChange={
                  syncWithServer ? handleFavoriteModelIdsChange : undefined
                }
                reasoningEffort={chatReasoningEffort}
                onSelectReasoningEffort={setChatReasoningEffort}
                mode={chatMode}
                onSelectMode={setChatMode}
                isStreaming={chatStreamingThreadId === activeChatThreadId}
                onSendMessage={handleSendDriveChatMessage}
                onStopStreaming={handleStopDriveChat}
                onRegenerate={handleRegenerateDriveChatMessage}
                onApplyAction={handleApplyDriveChatAction}
                onApplyAllActions={handleApplyAllDriveChatActions}
                onDiscardAction={handleDiscardDriveChatAction}
                onDiscardAllActions={handleDiscardAllDriveChatActions}
                onUndoAction={handleUndoDriveChatAction}
                onOpenDocument={openDocument}
                onOpenFolder={(folderId) => navigateToFolder(folderId)}
                onOpenProviders={() => visit('home', 'subscriptions')}
                historyOpen={isRouted ? routeSearch.history !== '0' : undefined}
                onHistoryOpenChange={
                  isRouted
                    ? (open) =>
                        updateRouteSearch(
                          (prev) => ({
                            ...prev,
                            history: open ? undefined : '0',
                          }),
                          { replace: true },
                        )
                    : undefined
                }
                threadSearch={isRouted ? (routeSearch.q ?? '') : undefined}
                onThreadSearchChange={
                  isRouted
                    ? (q) =>
                        updateRouteSearch(
                          (prev) => ({
                            ...prev,
                            q: q.trim() ? q : undefined,
                          }),
                          { replace: true },
                        )
                    : undefined
                }
                initialScopeFolderId={
                  isRouted ? (routeSearch.scope ?? null) : undefined
                }
                onScopeFolderChange={
                  isRouted
                    ? (folderId) =>
                        updateRouteSearch(
                          (prev) => ({
                            ...prev,
                            scope: folderId ?? undefined,
                          }),
                          { replace: true },
                        )
                    : undefined
                }
              />
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

                  {(agentStatus || pendingFolderIds.size > 0) && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="flex items-center justify-between rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2 text-[12px] text-[var(--xd-ink-secondary)]"
                    >
                      <span>{agentStatus ?? 'Updating folder…'}</span>
                      {agentStatus && pendingFolderIds.size === 0 && (
                        <button
                          type="button"
                          onClick={() => setAgentStatus(null)}
                          aria-label="Dismiss status"
                          className="text-[var(--xd-ink-muted)] hover:text-[var(--xd-ink)]"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  <FilterPillBar
                    sortBy={sortBy}
                    onSelectSort={handleSelectSort}
                    viewMode={viewMode}
                    onChangeViewMode={handleChangeViewMode}
                    searchQuery={searchQuery}
                    onChangeSearchQuery={setSearchQuery}
                  />

                  {driveLoading &&
                  visibleFolders.length === 0 &&
                  filteredDocs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--xd-border-strong)] px-6 py-16 text-center">
                      <p className="text-[13px] text-[var(--xd-ink-muted)]">
                        Loading Drive…
                      </p>
                    </div>
                  ) : visibleFolders.length === 0 &&
                    filteredDocs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--xd-border-strong)] px-6 py-16 text-center">
                      {searchQuery.trim() ? (
                        <>
                          <p className="text-[13px] font-medium text-[var(--xd-ink)]">
                            No matching files or folders
                          </p>
                          <p className="mt-1 text-[12px] text-[var(--xd-ink-muted)]">
                            Try a different search query or clear the filter.
                          </p>
                          <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="mt-3.5 rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-3 py-1.5 text-[12px] font-medium text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)]"
                          >
                            Clear search
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-[13.5px] font-medium text-[var(--xd-ink)]">
                            {currentFolderId
                              ? 'This folder is empty'
                              : 'Your Drive is empty'}
                          </p>
                          <p className="mt-1 max-w-sm text-[12px] text-[var(--xd-ink-muted)]">
                            {currentFolderId
                              ? 'Create a new file, add a subfolder, or drag files here from My Drive.'
                              : 'Create a file with AI, start from a template, or organize with a folder.'}
                          </p>
                          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                            <WorkspaceLink
                              href={newAgentHref}
                              onNavigate={() => setNewAppModalMode('agent')}
                              className="rounded bg-[var(--xd-accent)] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[var(--xd-accent-hover)]"
                            >
                              New with AI
                            </WorkspaceLink>
                            <WorkspaceLink
                              href={newTemplateHref}
                              onNavigate={() => setNewAppModalMode('templates')}
                              className="rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-3 py-1.5 text-[12px] font-medium text-[var(--xd-ink)] transition-colors hover:bg-[var(--xd-surface-hover)]"
                            >
                              From template
                            </WorkspaceLink>
                            <button
                              type="button"
                              onClick={() =>
                                setFolderModal({
                                  mode: 'create',
                                  parentId: currentFolderId,
                                })
                              }
                              className="rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-3 py-1.5 text-[12px] font-medium text-[var(--xd-ink)] transition-colors hover:bg-[var(--xd-surface-hover)]"
                            >
                              {currentFolderId ? 'New subfolder' : 'New folder'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : viewMode === 'list' ? (
                    <DriveFileListTable
                      folders={visibleFolders}
                      folderCounts={folderItemCounts}
                      docs={filteredDocs.map((doc) => ({
                        ...forCard(doc),
                        isTemplate: isDocTemplate(doc),
                      }))}
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
                      onRenameDoc={(doc) => {
                        const live = findDoc(doc.id)
                        if (live) setRenameDocTarget(live)
                      }}
                      onSaveAsTemplateDoc={(doc) => {
                        const live = findDoc(doc.id)
                        if (live) setSaveTemplateTarget(live)
                      }}
                      onMoveDoc={(doc) => setMoveDocId(doc.id)}
                      onDuplicateDoc={(doc) =>
                        setNamer({
                          sourceId: doc.id,
                          title: `${doc.title} copy`,
                          mode: 'duplicate',
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
                                  doc={{
                                    ...forCard(doc),
                                    isTemplate: isDocTemplate(doc),
                                  }}
                                  folderLabel={getFolderPathLabel(
                                    folders,
                                    doc.folderId,
                                    doc.folder,
                                  )}
                                  onOpen={() => openDocument(doc.id)}
                                  onRename={() => setRenameDocTarget(doc)}
                                  onSaveAsTemplate={() =>
                                    setSaveTemplateTarget(doc)
                                  }
                                  onMove={() => setMoveDocId(doc.id)}
                                  onDuplicate={() =>
                                    setNamer({
                                      sourceId: doc.id,
                                      title: `${doc.title} copy`,
                                      mode: 'duplicate',
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
                                  doc={{
                                    ...forCard(doc),
                                    isTemplate: isDocTemplate(doc),
                                  }}
                                  onOpen={() => openDocument(doc.id)}
                                  onRename={() => setRenameDocTarget(doc)}
                                  onSaveAsTemplate={() =>
                                    setSaveTemplateTarget(doc)
                                  }
                                  onMove={() => setMoveDocId(doc.id)}
                                  onDuplicate={() =>
                                    setNamer({
                                      sourceId: doc.id,
                                      title: `${doc.title} copy`,
                                      mode: 'duplicate',
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
                    sortBy={sortBy}
                    onSelectSort={handleSelectSort}
                    viewMode={viewMode}
                    onChangeViewMode={handleChangeViewMode}
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
                      docs={starredDocs.map((doc) => ({
                        ...forCard(doc),
                        isTemplate: isDocTemplate(doc),
                      }))}
                      resolveFolderLabel={(doc) =>
                        getFolderPathLabel(folders, doc.folderId, doc.folder)
                      }
                      onOpenDoc={(doc) => openDocument(doc.id)}
                      onRenameDoc={(doc) => {
                        const live = findDoc(doc.id)
                        if (live) setRenameDocTarget(live)
                      }}
                      onSaveAsTemplateDoc={(doc) => {
                        const live = findDoc(doc.id)
                        if (live) setSaveTemplateTarget(live)
                      }}
                      onMoveDoc={(doc) => setMoveDocId(doc.id)}
                      onDuplicateDoc={(doc) =>
                        setNamer({
                          sourceId: doc.id,
                          title: `${doc.title} copy`,
                          mode: 'duplicate',
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
                          doc={{
                            ...forCard(doc),
                            isTemplate: isDocTemplate(doc),
                          }}
                          onOpen={() => openDocument(doc.id)}
                          onRename={() => setRenameDocTarget(doc)}
                          onSaveAsTemplate={() => setSaveTemplateTarget(doc)}
                          onMove={() => setMoveDocId(doc.id)}
                          onDuplicate={() =>
                            setNamer({
                              sourceId: doc.id,
                              title: `${doc.title} copy`,
                              mode: 'duplicate',
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
                          doc={{
                            ...forCard(doc),
                            isTemplate: isDocTemplate(doc),
                          }}
                          folderLabel={getFolderPathLabel(
                            folders,
                            doc.folderId,
                            doc.folder,
                          )}
                          onOpen={() => openDocument(doc.id)}
                          onRename={() => setRenameDocTarget(doc)}
                          onSaveAsTemplate={() => setSaveTemplateTarget(doc)}
                          onMove={() => setMoveDocId(doc.id)}
                          onDuplicate={() =>
                            setNamer({
                              sourceId: doc.id,
                              title: `${doc.title} copy`,
                              mode: 'duplicate',
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

                  {(agentStatus || pendingFolderIds.size > 0) && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="flex items-center justify-between rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2 text-[12px] text-[var(--xd-ink-secondary)]"
                    >
                      <span>{agentStatus ?? 'Updating folder…'}</span>
                      {agentStatus && pendingFolderIds.size === 0 && (
                        <button
                          type="button"
                          onClick={() => setAgentStatus(null)}
                          aria-label="Dismiss status"
                          className="text-[var(--xd-ink-muted)] hover:text-[var(--xd-ink)]"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  <DriveTrashList
                    docs={filteredTrashedDocs}
                    totalCount={trashedDocs.length}
                    retentionDays={effectiveTrashRetentionDays}
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
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <h1 className="text-[16px] font-semibold tracking-tight">
                        Templates
                      </h1>
                      <span className="xd-tabular text-[12px] text-[var(--xd-ink-muted)]">
                        {templates.length}{' '}
                        {templates.length === 1 ? 'template' : 'templates'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative flex items-center">
                        <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[var(--xd-ink-muted)]" />
                        <input
                          type="search"
                          value={templateSearchQuery}
                          onChange={(e) =>
                            setTemplateSearchQuery(e.target.value)
                          }
                          placeholder="Filter templates..."
                          aria-label="Filter templates"
                          className="h-7 w-48 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] pl-8 pr-2.5 text-[12px] text-[var(--xd-ink)] placeholder:text-[var(--xd-ink-muted)] focus:border-[var(--xd-accent)] focus:outline-none"
                        />
                      </div>

                      {templatesFolder && (
                        <WorkspaceLink
                          href={folderHref(templatesFolder)}
                          onNavigate={() =>
                            navigateToFolder(templatesFolder.id)
                          }
                          className="inline-flex h-7 items-center gap-1.5 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2.5 text-[12px] font-medium text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
                        >
                          <LayoutTemplate className="h-3.5 w-3.5 text-[var(--xd-accent)]" />
                          <span>Open folder</span>
                        </WorkspaceLink>
                      )}
                    </div>
                  </div>

                  {(agentStatus || pendingFolderIds.size > 0) && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="flex items-center justify-between rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2 text-[12px] text-[var(--xd-ink-secondary)]"
                    >
                      <span>{agentStatus ?? 'Updating folder…'}</span>
                      {agentStatus && pendingFolderIds.size === 0 && (
                        <button
                          type="button"
                          onClick={() => setAgentStatus(null)}
                          aria-label="Dismiss status"
                          className="text-[var(--xd-ink-muted)] hover:text-[var(--xd-ink)]"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {templates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--xd-border-strong)] px-6 py-14 text-center">
                      <p className="text-[13.5px] font-medium text-[var(--xd-ink)]">
                        No templates yet
                      </p>
                      <p className="mt-1 max-w-sm text-[12px] text-[var(--xd-ink-muted)]">
                        Templates are stored in your {TEMPLATES_FOLDER_NAME}{' '}
                        folder. Open any file’s menu and choose “Save as
                        template” to add one.
                      </p>
                      <button
                        type="button"
                        onClick={() => navigateToFolder(null)}
                        className="mt-4 rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-3 py-1.5 text-[12px] font-medium text-[var(--xd-ink)] transition-colors hover:bg-[var(--xd-surface-hover)]"
                      >
                        Go to My Drive
                      </button>
                    </div>
                  ) : filteredBlueprints.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--xd-border-strong)] px-6 py-12 text-center">
                      <p className="text-[13px] font-medium text-[var(--xd-ink)]">
                        No templates match this filter
                      </p>
                      <button
                        type="button"
                        onClick={() => setTemplateSearchQuery('')}
                        className="mt-3 rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-3 py-1.5 text-[12px] font-medium text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)]"
                      >
                        Clear search
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {filteredBlueprints.map((template) => (
                        <TemplateGalleryCard
                          key={template.id}
                          template={template}
                          onEditTemplate={() => openDocument(template.id)}
                          onDuplicateTemplate={() =>
                            setNamer({
                              sourceId: template.id,
                              title: `${template.title} copy`,
                              mode: 'use-template',
                            })
                          }
                          onRenameTemplate={() => {
                            const doc = findDoc(template.id)
                            if (doc) setRenameDocTarget(doc)
                          }}
                          onDuplicateAsTemplate={() =>
                            setNamer({
                              sourceId: template.id,
                              title: `${template.title} copy`,
                              mode: 'duplicate',
                            })
                          }
                          onDeleteTemplate={() =>
                            moveDocumentToTrash(template.id)
                          }
                        />
                      ))}
                    </div>
                  )}
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
                            <WorkspaceLink
                              href={docHref(doc)}
                              onNavigate={() => openDocument(doc.id)}
                              className="block truncate text-left text-[13.5px] font-medium hover:text-[var(--xd-accent)]"
                            >
                              {doc.title}
                            </WorkspaceLink>
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
                              <WorkspaceLink
                                key={role}
                                href={docHref(doc, {
                                  role: role === 'owner' ? undefined : role,
                                })}
                                onNavigate={() => {
                                  if (role !== 'owner') {
                                    openDocument(doc.id, { role })
                                  } else {
                                    openDocument(doc.id)
                                  }
                                }}
                                className="rounded border border-[var(--xd-border)] px-2 py-0.5 text-[11px] text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]"
                              >
                                {ROLE_LABEL[role]}
                              </WorkspaceLink>
                            ))}
                            <WorkspaceLink
                              href={buildCurrentHrefWithSearch({
                                modal: 'share',
                                shareDoc: doc.id,
                              })}
                              onNavigate={() => setShareId(doc.id)}
                              className="ml-1 rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-2.5 py-0.5 text-[11.5px] font-medium"
                            >
                              Share
                            </WorkspaceLink>
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
                    activeProviderId={activeSettingsProviderId}
                    onSelectProvider={(providerId) => {
                      setLocalSettingsProviderId(providerId)
                      if (isRouted) {
                        navigateWithGlobalSearch(
                          settingsProviderHref(providerId),
                        )
                      }
                    }}
                    subscriptions={subscriptions}
                    roleAssignments={roles}
                    favoriteModelIds={favoriteModelIds}
                    onFavoriteModelIdsChange={
                      syncWithServer ? handleFavoriteModelIdsChange : undefined
                    }
                    onChange={(nextSubscriptions, nextRoles) => {
                      setSubscriptions(nextSubscriptions)
                      setRoles(nextRoles)
                      persistDriveSettings({ roleAssignments: nextRoles })
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
                    onRefreshOpenCodeGo={() => void refreshOpenCodeGo(true)}
                    grokBuildStatus={grokBuildStatus}
                    grokBuildBusy={grokBuildBusy}
                    grokBuildError={grokBuildError}
                    onRefreshGrokBuild={() => void refreshGrokBuild(true)}
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
            activeTab={aiSidebarTab}
            onTabChange={setAiSidebarTab}
            tabHrefs={aiTabHrefs}
            evergreenHrefs={evergreenHrefs}
            messages={thread}
            checkpoints={activeDoc?.checkpoints ?? []}
            proposals={
              activeDoc
                ? mergeProposalsWithThread(activeDoc.intentHistory, thread)
                : recentProposals.map((item) => item.proposal)
            }
            selectedElements={selected}
            sketches={docSketches}
            strokes={docStrokes}
            models={driveChatModels}
            modelId={modelId}
            onModelChange={handleSelectModel}
            reasoningEffort={chatReasoningEffort}
            onSelectReasoningEffort={setChatReasoningEffort}
            favoriteModelIds={favoriteModelIds}
            onFavoriteModelIdsChange={
              syncWithServer ? handleFavoriteModelIdsChange : undefined
            }
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
            onSend={(text, context) => {
              const chosenModel = context.modelId
              const chosenProvider = context.providerId
              if (!activeDoc) {
                buildApp(text, chosenModel, undefined, context.reasoningEffort)
                return
              }
              void collaborate({
                doc: activeDoc,
                instruction: text,
                model: chosenModel,
                providerId: chosenProvider,
                reasoningEffort: context.reasoningEffort,
                selectedElements: selected,
                sketchAnnotations: docSketches,
              })
            }}
            onKeep={keepProposal}
            onDiscard={discardProposal}
            onOpenProviders={() => visit('home', 'subscriptions')}
            isThinking={thinkingState?.threadId === (activeDoc?.id ?? 'drive')}
            thinkingPhase={
              thinkingState?.threadId === (activeDoc?.id ?? 'drive')
                ? thinkingState.phase
                : undefined
            }
            thinkingLabel={
              thinkingState?.threadId === (activeDoc?.id ?? 'drive')
                ? thinkingState.label
                : undefined
            }
            thinkingDetail={
              thinkingState?.threadId === (activeDoc?.id ?? 'drive')
                ? thinkingState.detail
                : undefined
            }
            thinkingElapsedMs={
              thinkingState?.threadId === (activeDoc?.id ?? 'drive')
                ? thinkingState.elapsedMs
                : undefined
            }
            antigravityConnected={
              antigravityStatus ? antigravityStatus.authenticated : undefined
            }
            hasConnectedProvider={
              antigravityStatus || openCodeGoStatus || grokBuildStatus
                ? Boolean(
                    antigravityStatus?.authenticated ||
                    (openCodeGoStatus && isOpenCodeUsable(openCodeGoStatus)) ||
                    grokBuildStatus?.authenticated,
                  )
                : undefined
            }
          />
        )}
      </div>
      <NewAppModal
        open={newAppModalMode !== null}
        initialMode={newAppModalMode ?? 'agent'}
        onModeChange={(nextMode) => setNewAppModalMode(nextMode)}
        modeHrefs={{ agent: newAgentHref, templates: newTemplateHref }}
        templates={templates}
        folders={folders}
        initialFolderId={defaultCreateFolderId}
        models={driveChatModels}
        selectedModelId={modelId}
        onSelectModel={handleSelectModel}
        reasoningEffort={chatReasoningEffort}
        onSelectReasoningEffort={setChatReasoningEffort}
        favoriteModelIds={favoriteModelIds}
        onFavoriteModelIdsChange={
          syncWithServer ? handleFavoriteModelIdsChange : undefined
        }
        onOpenProviders={() => visit('home', 'subscriptions')}
        onClose={() => setNewAppModalMode(null)}
        onBuildWithAgent={({
          prompt,
          modelId: chosenModel,
          folderId,
          reasoningEffort,
        }) => buildApp(prompt, chosenModel, folderId, reasoningEffort)}
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
          <WorkspaceLink
            href="/trash"
            onNavigate={() => {
              setTrashUndo(null)
              visit('home', 'trash')
            }}
            className="text-[var(--xd-ink-secondary)] transition-colors hover:text-[var(--xd-ink)]"
          >
            View trash
          </WorkspaceLink>
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
          config={{
            ...shareDoc.share,
            publicLinkUrl: buildPublicDocShareUrl(shareDoc),
          }}
          simulatedPermission={
            simulatedRole === 'owner' ? undefined : simulatedRole
          }
          onConfigChange={(config) => {
            if (pendingRenameDocIdsRef.current.has(shareDoc.id)) {
              setAgentStatus(
                'Wait for rename to finish before updating share settings.',
              )
              return
            }
            patchFile(shareDoc.id, (doc) => ({ ...doc, share: config }))
            void syncDriveApi({
              action: 'update_document_meta',
              slug: shareDoc.slug,
              folderPath: folderDiskPath(foldersRef.current, shareDoc.folderId),
              meta: serializeDocMeta({ ...shareDoc, share: config }),
            })
          }}
          onSimulatePermission={(level) => {
            setSimulatedRole(level)
            openDocument(shareDoc.id, { role: level })
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
            <h2 className="text-[13.5px] font-semibold">
              {namer.mode === 'use-template'
                ? 'New from template'
                : 'Duplicate file'}
            </h2>
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
      {saveTemplateTarget && (
        <SaveAsTemplateDialog
          open
          sourceTitle={saveTemplateTarget.title}
          initialDescription={saveTemplateTarget.description}
          onClose={() => setSaveTemplateTarget(null)}
          onSubmit={(input) =>
            saveDocumentAsTemplate(saveTemplateTarget, input)
          }
        />
      )}
      {renameDocTarget && (
        <DriveRenameDocDialog
          open
          isTemplate={isDocTemplate(renameDocTarget)}
          initialTitle={renameDocTarget.title}
          initialDescription={renameDocTarget.description}
          onClose={() => setRenameDocTarget(null)}
          onSubmit={(input) => renameDocument(renameDocTarget, input)}
        />
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
