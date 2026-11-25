import { createContext, useContext } from 'react'
import { z } from 'zod'
import type {
  AIProviderId,
  CanvasInteractionMode,
  DriveFolder,
  MarbleDocumentFile,
  SharePermissionLevel,
} from '#/lib/types'
import type { PrimaryNavId } from '#/components/design-system/NavigationShell'
import type {
  DriveViewMode,
  SortOption,
} from '#/components/design-system/FilterAndMetrics'
import type { NewAppMode } from '#/components/design-system/NewAppCreator'

/* ============================================================================
   Constants & Validated Search Schemas (Zod v4)
   ============================================================================ */

export const AI_SIDEBAR_TABS = ['chat', 'ops', 'history'] as const
export type AiSidebarTab = (typeof AI_SIDEBAR_TABS)[number]

export const WORKSPACE_MODAL_IDS = [
  'new-agent',
  'new-template',
  'share',
] as const
export type WorkspaceModalId = (typeof WORKSPACE_MODAL_IDS)[number]

export const DRIVE_VIEW_MODES = ['preview', 'icon', 'list'] as const
export const DRIVE_SORT_OPTIONS = ['updated', 'title', 'size', 'nodes'] as const

export const DOC_INTERACTION_MODES = [
  'direct',
  'select',
  'sketch',
  'source',
] as const

export const SIMULATED_SHARE_ROLES = [
  'view_only',
  'comment_annotate',
  'edit_no_ai',
  'edit_with_ai_byok',
  'edit_with_ai_shared',
] as const

export const SETTINGS_PROVIDER_IDS = [
  'antigravity',
  'opencode-go',
  'openai',
  'claude',
  'xai',
] as const satisfies readonly AIProviderId[]

export function isSettingsProviderId(value: string): value is AIProviderId {
  return (SETTINGS_PROVIDER_IDS as readonly string[]).includes(value)
}

const optionalTrimmedString = z
  .string()
  .optional()
  .transform((value) => {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  })
  .catch(undefined)

/**
 * Shared search params inherited by every route under `_workspace`.
 */
export const workspaceSearchSchema = z.object({
  ai: z.enum(AI_SIDEBAR_TABS).optional().catch(undefined),
  modal: z.enum(WORKSPACE_MODAL_IDS).optional().catch(undefined),
  shareDoc: optionalTrimmedString,
})

export type WorkspaceSearch = z.infer<typeof workspaceSearchSchema>

/**
 * Search params for Drive root (`/drive`), folders (`/f/...`), and `/starred`.
 */
export const driveSearchSchema = workspaceSearchSchema.extend({
  view: z.enum(DRIVE_VIEW_MODES).optional().catch(undefined),
  sort: z.enum(DRIVE_SORT_OPTIONS).optional().catch(undefined),
  q: optionalTrimmedString,
})

export type DriveSearch = z.infer<typeof driveSearchSchema>

/**
 * Search params for `/trash`.
 */
export const trashSearchSchema = workspaceSearchSchema.extend({
  q: optionalTrimmedString,
})

export type TrashSearch = z.infer<typeof trashSearchSchema>

/**
 * Search params for `/d/$docId` and `/d/$docId/$slug`.
 */
export const docSearchSchema = workspaceSearchSchema.extend({
  mode: z.enum(DOC_INTERACTION_MODES).optional().catch(undefined),
  node: optionalTrimmedString,
  role: z.enum(SIMULATED_SHARE_ROLES).optional().catch(undefined),
})

export type DocSearch = z.infer<typeof docSearchSchema>

/**
 * Search params for `/chat` and `/chat/$threadId`.
 */
export const chatSearchSchema = workspaceSearchSchema.extend({
  history: z.enum(['0']).optional().catch(undefined),
  q: optionalTrimmedString,
  scope: optionalTrimmedString,
})

export type ChatSearch = z.infer<typeof chatSearchSchema>

/**
 * Combined loose search shape read by `XDriveWorkspace` from the active route.
 */
export interface CombinedWorkspaceSearch {
  ai?: AiSidebarTab
  modal?: WorkspaceModalId
  shareDoc?: string
  view?: DriveViewMode
  sort?: SortOption
  q?: string
  mode?: CanvasInteractionMode
  node?: string
  role?: SharePermissionLevel
  history?: '0'
  scope?: string
}

/* ============================================================================
   Slug & Canonical Path Builders
   ============================================================================ */

export function slugifySegment(value: string, fallback = 'untitled'): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.mrbl$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return normalized || fallback
}

export function folderCanonicalSlug(folder: Pick<DriveFolder, 'name'>): string {
  return slugifySegment(folder.name, 'folder')
}

export function docCanonicalSlug(
  doc: Pick<MarbleDocumentFile, 'slug' | 'title'>,
): string {
  if (doc.slug && doc.slug.trim()) {
    return slugifySegment(doc.slug, 'document')
  }
  return slugifySegment(doc.title, 'document')
}

export function navHref(nav: PrimaryNavId): string {
  switch (nav) {
    case 'drive':
    case 'agent-studio':
      return '/drive'
    case 'chat':
      return '/chat'
    case 'starred':
      return '/starred'
    case 'shared':
      return '/shared'
    case 'trash':
      return '/trash'
    case 'templates':
      return '/templates'
    case 'subscriptions':
      return '/settings/models'
  }
}

export function folderHref(
  folder: Pick<DriveFolder, 'id' | 'name'> | null | undefined,
): string {
  if (!folder) return '/drive'
  return `/f/${encodeURIComponent(folder.id)}/${encodeURIComponent(folderCanonicalSlug(folder))}`
}

export function folderIdHref(
  folderId: string | null | undefined,
  folders?: DriveFolder[],
): string {
  if (!folderId) return '/drive'
  const match = folders?.find((item) => item.id === folderId)
  if (match) return folderHref(match)
  return `/f/${encodeURIComponent(folderId)}`
}

export function docHref(
  doc: Pick<MarbleDocumentFile, 'id' | 'slug' | 'title'>,
  search?: Partial<DocSearch>,
): string {
  const base = `/d/${encodeURIComponent(doc.id)}/${encodeURIComponent(docCanonicalSlug(doc))}`
  return appendQueryParams(base, search)
}

export function docIdHref(
  docId: string,
  docs?: Array<Pick<MarbleDocumentFile, 'id' | 'slug' | 'title'>>,
  search?: Partial<DocSearch>,
): string {
  const match = docs?.find((item) => item.id === docId)
  if (match) return docHref(match, search)
  return appendQueryParams(`/d/${encodeURIComponent(docId)}`, search)
}

export function chatThreadHref(threadId?: string | null): string {
  if (!threadId) return '/chat'
  return `/chat/${encodeURIComponent(threadId)}`
}

export function settingsProviderHref(providerId?: AIProviderId): string {
  if (!providerId) return '/settings/models'
  return `/settings/models/${encodeURIComponent(providerId)}`
}

export function modalToNewAppMode(
  modal: WorkspaceModalId | undefined,
): NewAppMode | null {
  if (modal === 'new-agent') return 'agent'
  if (modal === 'new-template') return 'templates'
  return null
}

export function newAppModeToModal(mode: NewAppMode): WorkspaceModalId {
  return mode === 'agent' ? 'new-agent' : 'new-template'
}

export function parseSelectedNodeIds(nodeParam: string | undefined): string[] {
  if (!nodeParam) return []
  return nodeParam
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function serializeSelectedNodeIds(ids: string[]): string | undefined {
  const cleaned = ids.map((item) => item.trim()).filter(Boolean)
  return cleaned.length > 0 ? cleaned.join(',') : undefined
}

export function appendQueryParams(
  pathname: string,
  params?: Record<string, string | undefined>,
): string {
  if (!params) return pathname
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, value)
    }
  }
  const qs = search.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

export function buildPublicDocShareUrl(
  doc: Pick<MarbleDocumentFile, 'id' | 'slug' | 'title'>,
): string {
  const path = docHref(doc)
  if (typeof window !== 'undefined' && window.location.origin) {
    return `${window.location.origin}${path}`
  }
  return `https://xdrive.app${path}`
}

/* ============================================================================
   Routed Workspace Context
   ============================================================================ */

export type WorkspaceRouteMatch =
  | { kind: 'drive' }
  | { kind: 'folder'; folderId: string; slug?: string }
  | { kind: 'doc'; docId: string; slug?: string }
  | { kind: 'starred' }
  | { kind: 'shared' }
  | { kind: 'trash' }
  | { kind: 'templates' }
  | { kind: 'chat'; threadId?: string }
  | { kind: 'settings'; providerId: AIProviderId; isExplicitProvider: boolean }
  | { kind: 'not-found'; section?: 'settings' | 'workspace'; path: string }

export interface WorkspaceRouteContextValue {
  routed: boolean
  match: WorkspaceRouteMatch
  search: CombinedWorkspaceSearch
  pathname: string
}

const WorkspaceRouteContext = createContext<WorkspaceRouteContextValue | null>(
  null,
)

export const WorkspaceRouteProvider = WorkspaceRouteContext.Provider

export function useWorkspaceRoute(): WorkspaceRouteContextValue | null {
  return useContext(WorkspaceRouteContext)
}

export function isModifiedClick(event: {
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  button?: number
}): boolean {
  return Boolean(
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    (typeof event.button === 'number' && event.button !== 0),
  )
}
