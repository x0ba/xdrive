import { createHash, randomBytes } from 'node:crypto'
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'

import type {
  AIProviderId,
  DriveFolder,
  DriveFolderColor,
  DriveRoleAssignments,
  DriveSettings,
  DriveSortPreference,
  DriveTrashState,
  DriveViewModePreference,
  EvergreenDocRef,
  MarbleAppCategory,
  MarbleCheckpoint,
  MarbleDocumentFile,
  MarbleOp,
  MarbleOpProposal,
  ShareCollaborator,
  ShareConfig,
  SharePermissionLevel,
  SketchAnnotation,
} from '../types'
import { syncDriveSearchIndexSafe } from '#/lib/search/drive-search.server'
import { updateMarbleSourceTitle } from './engine-client'
import {
  DOCUMENT_DESIGN_SYSTEM_SLUG,
  DOCUMENT_DONTS_SYSTEM_SLUG,
  PREDEFINED_MARBLE_TEMPLATES,
  TEMPLATES_FOLDER_ID,
  TEMPLATES_FOLDER_NAME,
} from './templates'

export { TEMPLATES_FOLDER_ID, TEMPLATES_FOLDER_NAME }

export const DEFAULT_TRASH_RETENTION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_CHECKPOINTS = 40
const MAX_INTENT_HISTORY = 20
export const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

const VALID_FOLDER_COLORS = new Set<DriveFolderColor>([
  'default',
  'accent',
  'commit',
  'sketch',
  'danger',
])

const VALID_CATEGORIES = new Set<MarbleAppCategory>([
  'latex',
  'notebook',
  'document',
  'slides',
  'matrix',
  'sandbox',
  'whiteboard',
  'custom',
])

const VALID_SHARE_PERMISSIONS = new Set<SharePermissionLevel>([
  'view_only',
  'comment_annotate',
  'edit_no_ai',
  'edit_with_ai_byok',
  'edit_with_ai_shared',
])

const VALID_PROVIDERS = new Set<AIProviderId>([
  'antigravity',
  'opencode-go',
  'grok-build',
  'xai',
  'claude',
  'openai',
])

const VALID_OP_TYPES = new Set<MarbleOp['type']>([
  'setText',
  'setInner',
  'setAttr',
  'insert',
  'move',
  'remove',
  'assignId',
])

const VALID_PROPOSAL_STATUSES = new Set<MarbleOpProposal['status']>([
  'proposed',
  'committed',
  'discarded',
  'thinking',
  'failed',
])

const VALID_VIEW_MODES = new Set<DriveViewModePreference>([
  'preview',
  'icon',
  'list',
])

const VALID_SORT_OPTIONS = new Set<DriveSortPreference>([
  'updated',
  'title',
  'nodes',
  'size',
])

export class DriveStorageError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'DriveStorageError'
    this.status = status
  }
}

export interface StoredFolderMeta {
  id: string
  color?: DriveFolderColor
  createdAt: string
  updatedAt: string
}

export interface StoredDocumentMeta {
  id?: string
  slug?: string
  title?: string
  description?: string
  category?: MarbleAppCategory
  isEvergreen?: boolean
  templateId?: string
  version?: number
  createdAt?: string
  updatedAt?: string
  createdBy?: MarbleDocumentFile['createdBy']
  lastEditedBy?: MarbleDocumentFile['lastEditedBy']
  starred?: boolean
  pinned?: boolean
  tags?: string[]
  share?: ShareConfig
}

export interface DriveTemplatesSeedState {
  seededIds: string[]
  seededAt: string | null
}

interface DriveMetadataFile {
  version: 2
  folders: Partial<Record<string, StoredFolderMeta>>
  documents: Partial<Record<string, StoredDocumentMeta>>
  trash: DriveTrashState
  templates: DriveTemplatesSeedState
}

interface StoredDocumentHistoryFile {
  version: 1
  docId: string
  slug: string
  updatedAt: string
  checkpoints: MarbleCheckpoint[]
  intentHistory: MarbleOpProposal[]
}

export interface TrashMetaRecord {
  version?: number
  slug: string
  docId?: string
  trashedAt: string
  purgeAt?: string
  retentionDays?: number
  originalFolderPath?: string
  meta?: StoredDocumentMeta
}

export interface DriveDocumentLocation {
  slug: string
  fileName: string
  folderPath: string
  relPath: string
  fullPath: string
}

export function getDriveDir(): string {
  const configured = process.env.XDRIVE_DRIVE_DIR?.trim()
  return path.resolve(configured || path.resolve(process.cwd(), 'marble-drive'))
}

export function getTemplatesDir(): string {
  return path.resolve(getDriveDir(), TEMPLATES_FOLDER_NAME)
}

export function isTemplatesFolderPath(
  folderPath: string | null | undefined,
): boolean {
  const normalized = normalizeFolderPath(folderPath)
  return (
    normalized === TEMPLATES_FOLDER_NAME ||
    normalized.startsWith(`${TEMPLATES_FOLDER_NAME}/`)
  )
}

export function isTemplateRelPath(relPath: string): boolean {
  return relPath.startsWith(`${TEMPLATES_FOLDER_NAME}/`)
}

export function isTemplatesRootPath(
  folderPath: string | null | undefined,
): boolean {
  return normalizeFolderPath(folderPath) === TEMPLATES_FOLDER_NAME
}

export function slugifyTitle(title: string, fallback = 'untitled'): string {
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

export function getTrashDir(): string {
  return path.resolve(getDriveDir(), '.trash')
}

export function getMetaDir(): string {
  return path.resolve(getDriveDir(), '.xdrive')
}

function getMetaFilePath(): string {
  return path.resolve(getMetaDir(), 'metadata.json')
}

function getSettingsFilePath(): string {
  return path.resolve(getMetaDir(), 'settings.json')
}

function getHistoryDir(): string {
  return path.resolve(getMetaDir(), 'history')
}

function getDocChatsDir(): string {
  return path.resolve(getMetaDir(), 'doc-chats')
}

function safeHistoryKey(docId: string): string {
  const trimmed = docId.trim()
  if (SAFE_ID_PATTERN.test(trimmed) && !trimmed.includes('..')) {
    return trimmed
  }
  return `doc-${createHash('sha256')
    .update(trimmed || 'unknown')
    .digest('hex')
    .slice(0, 16)}`
}

function historyFilePath(docId: string): string {
  const historyDir = getHistoryDir()
  const key = safeHistoryKey(docId)
  const full = path.resolve(historyDir, `${key}.json`)
  if (path.dirname(full) !== historyDir) {
    fail(400, 'Invalid document history id')
  }
  return full
}

let driveLock: Promise<void> = Promise.resolve()

export async function withDriveLock<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const previous = driveLock
  driveLock = previous.then(() => gate)
  await previous
  try {
    return await fn()
  } finally {
    release()
  }
}

async function withDriveMutation<T>(fn: () => Promise<T>): Promise<T> {
  const result = await withDriveLock(fn)
  await syncDriveSearchIndexSafe()
  return result
}

export function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

function fail(status: number, message: string): never {
  throw new DriveStorageError(status, message)
}

export function assertSlug(slug: string): string {
  if (!SLUG_PATTERN.test(slug) || slug.includes('..')) {
    fail(400, 'Invalid slug')
  }
  return slug
}

export function assertFolderSegment(segment: string): string {
  const trimmed = segment.trim()
  if (!trimmed) {
    fail(400, 'Folder name cannot be empty')
  }
  if (trimmed.length > 200) {
    fail(400, 'Folder name is too long')
  }
  if (
    trimmed === '.' ||
    trimmed === '..' ||
    trimmed.startsWith('.') ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0')
  ) {
    fail(
      400,
      'Folder name cannot start with "." or contain "/", "\\", or control characters',
    )
  }
  return trimmed
}

export function normalizeFolderPath(raw: string | null | undefined): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (!trimmed || trimmed === '/' || trimmed === '.') return ''
  if (trimmed.includes('\\') || trimmed.includes('\0')) {
    fail(400, 'Invalid folder path')
  }
  const segments = trimmed.split('/').filter((part) => part.length > 0)
  return segments.map(assertFolderSegment).join('/')
}

export function resolveDriveDirPath(folderPath: string | null | undefined): {
  folderPath: string
  fullPath: string
} {
  const driveDir = getDriveDir()
  const normalized = normalizeFolderPath(folderPath)
  if (!normalized) {
    return { folderPath: '', fullPath: driveDir }
  }
  const fullPath = path.resolve(driveDir, ...normalized.split('/'))
  if (!fullPath.startsWith(`${driveDir}${path.sep}`)) {
    fail(400, 'Folder path escapes marble-drive')
  }
  return { folderPath: normalized, fullPath }
}

export function resolveDocumentLocation(
  slug: string,
  folderPath: string | null | undefined,
): DriveDocumentLocation {
  const validSlug = assertSlug(slug)
  const fileName = `${validSlug}.mrbl`
  const resolvedDir = resolveDriveDirPath(folderPath)
  const fullPath = path.resolve(resolvedDir.fullPath, fileName)
  if (path.dirname(fullPath) !== resolvedDir.fullPath) {
    fail(400, 'Invalid document path')
  }
  const relPath = resolvedDir.folderPath
    ? `${resolvedDir.folderPath}/${fileName}`
    : fileName
  return {
    slug: validSlug,
    fileName,
    folderPath: resolvedDir.folderPath,
    relPath,
    fullPath,
  }
}

export function trashFilePath(slug: string): string {
  const trashDir = getTrashDir()
  const fileName = `${assertSlug(slug)}.mrbl`
  const full = path.resolve(trashDir, fileName)
  if (path.dirname(full) !== trashDir) {
    fail(400, 'Invalid slug')
  }
  return full
}

export function trashMetaFilePath(slug: string): string {
  const trashDir = getTrashDir()
  const full = path.resolve(trashDir, `${assertSlug(slug)}.meta.json`)
  if (path.dirname(full) !== trashDir) {
    fail(400, 'Invalid slug')
  }
  return full
}

function deterministicId(prefix: string, key: string): string {
  const digest = createHash('sha256').update(key).digest('hex').slice(0, 12)
  return `${prefix}-${digest}`
}

function trashDocumentId(slug: string, meta: TrashMetaRecord | null): string {
  const storedId = meta?.meta?.id?.trim()
  if (storedId) return storedId
  const recordedId = meta?.docId?.trim()
  if (recordedId) return recordedId
  return deterministicId('doc', `trash/${slug}`)
}

function sanitizeColor(value: unknown): DriveFolderColor {
  if (
    typeof value === 'string' &&
    VALID_FOLDER_COLORS.has(value as DriveFolderColor)
  ) {
    return value as DriveFolderColor
  }
  return 'default'
}

function sanitizeCategory(value: unknown): MarbleAppCategory | undefined {
  if (
    typeof value === 'string' &&
    VALID_CATEGORIES.has(value as MarbleAppCategory)
  ) {
    return value as MarbleAppCategory
  }
  return undefined
}

function sanitizePermission(value: unknown): SharePermissionLevel {
  if (
    typeof value === 'string' &&
    VALID_SHARE_PERMISSIONS.has(value as SharePermissionLevel)
  ) {
    return value as SharePermissionLevel
  }
  return 'view_only'
}

function sanitizeCollaborator(raw: unknown): ShareCollaborator | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  if (typeof rec.id !== 'string' || typeof rec.email !== 'string') return null
  return {
    id: rec.id,
    name: typeof rec.name === 'string' ? rec.name : rec.email,
    email: rec.email,
    avatarInitials:
      typeof rec.avatarInitials === 'string' ? rec.avatarInitials : 'CO',
    avatarColor:
      typeof rec.avatarColor === 'string' ? rec.avatarColor : '#5e6ad2',
    permission: sanitizePermission(rec.permission),
    addedAt:
      typeof rec.addedAt === 'string' ? rec.addedAt : new Date().toISOString(),
    ...(typeof rec.lastActive === 'string'
      ? { lastActive: rec.lastActive }
      : {}),
  }
}

function sanitizeShareConfig(
  raw: unknown,
  fallbackSlug?: string,
): ShareConfig | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const rec = raw as Record<string, unknown>
  const collaborators = Array.isArray(rec.collaborators)
    ? rec.collaborators
        .map(sanitizeCollaborator)
        .filter((item): item is ShareCollaborator => item !== null)
    : []
  return {
    isPublicLinkEnabled: Boolean(rec.isPublicLinkEnabled),
    publicLinkUrl:
      typeof rec.publicLinkUrl === 'string' && rec.publicLinkUrl.trim()
        ? rec.publicLinkUrl
        : `https://xdrive.app/d/${fallbackSlug ?? 'document'}`,
    publicPermission: sanitizePermission(rec.publicPermission),
    allowDuplication:
      typeof rec.allowDuplication === 'boolean' ? rec.allowDuplication : true,
    sharedAiDailyLimit:
      typeof rec.sharedAiDailyLimit === 'number' &&
      Number.isFinite(rec.sharedAiDailyLimit) &&
      rec.sharedAiDailyLimit >= 0
        ? rec.sharedAiDailyLimit
        : 40,
    sharedAiUsedToday:
      typeof rec.sharedAiUsedToday === 'number' &&
      Number.isFinite(rec.sharedAiUsedToday) &&
      rec.sharedAiUsedToday >= 0
        ? rec.sharedAiUsedToday
        : 0,
    collaborators,
  }
}

function sanitizeAuthor(
  raw: unknown,
): MarbleDocumentFile['createdBy'] | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const rec = raw as Record<string, unknown>
  if (typeof rec.name !== 'string' || !rec.name.trim()) return undefined
  return {
    name: rec.name,
    initials: typeof rec.initials === 'string' ? rec.initials : 'YO',
    ...(typeof rec.isAi === 'boolean' ? { isAi: rec.isAi } : {}),
    ...(typeof rec.modelBadge === 'string'
      ? { modelBadge: rec.modelBadge }
      : {}),
  }
}

function sanitizeMarbleOp(raw: unknown): MarbleOp | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  if (
    typeof rec.type !== 'string' ||
    !VALID_OP_TYPES.has(rec.type as MarbleOp['type'])
  ) {
    return null
  }
  const op: MarbleOp = { type: rec.type as MarbleOp['type'] }
  if (typeof rec.id === 'string') op.id = rec.id
  if (typeof rec.text === 'string') op.text = rec.text
  if (typeof rec.html === 'string') op.html = rec.html
  if (typeof rec.name === 'string') op.name = rec.name
  if (typeof rec.value === 'string' || rec.value === null) op.value = rec.value
  if (typeof rec.parentId === 'string') op.parentId = rec.parentId
  if (typeof rec.beforeId === 'string' || rec.beforeId === null) {
    op.beforeId = rec.beforeId
  }
  if (
    Array.isArray(rec.path) &&
    rec.path.every((n) => typeof n === 'number' && Number.isFinite(n))
  ) {
    op.path = rec.path
  }
  if (typeof rec.look === 'boolean') op.look = rec.look
  return op
}

export function sanitizeCheckpoints(
  raw: unknown,
): MarbleCheckpoint[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: MarbleCheckpoint[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const rec = item as Record<string, unknown>
    if (
      typeof rec.sha !== 'string' ||
      !rec.sha.trim() ||
      typeof rec.label !== 'string' ||
      typeof rec.source !== 'string'
    ) {
      continue
    }
    if (seen.has(rec.sha)) continue
    seen.add(rec.sha)
    out.push({
      sha: rec.sha,
      label: rec.label,
      timestamp:
        typeof rec.timestamp === 'number' && Number.isFinite(rec.timestamp)
          ? rec.timestamp
          : Date.now(),
      author: typeof rec.author === 'string' ? rec.author : 'You',
      opsCount:
        typeof rec.opsCount === 'number' && Number.isFinite(rec.opsCount)
          ? rec.opsCount
          : 0,
      source: rec.source,
      ...(typeof rec.note === 'string' ? { note: rec.note } : {}),
    })
    if (out.length >= MAX_CHECKPOINTS) break
  }
  return out
}

export function sanitizeIntentHistory(
  raw: unknown,
): MarbleOpProposal[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: MarbleOpProposal[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const rec = item as Record<string, unknown>
    if (
      typeof rec.id !== 'string' ||
      !rec.id.trim() ||
      typeof rec.note !== 'string' ||
      typeof rec.instruction !== 'string'
    ) {
      continue
    }
    if (seen.has(rec.id)) continue
    seen.add(rec.id)
    const ops = Array.isArray(rec.ops)
      ? rec.ops
          .map(sanitizeMarbleOp)
          .filter((op): op is MarbleOp => op !== null)
      : []
    const inverseOps = Array.isArray(rec.inverseOps)
      ? rec.inverseOps
          .map(sanitizeMarbleOp)
          .filter((op): op is MarbleOp => op !== null)
      : undefined
    const targetIds = Array.isArray(rec.targetIds)
      ? rec.targetIds.filter((id): id is string => typeof id === 'string')
      : []
    const providerId: AIProviderId =
      typeof rec.providerId === 'string' &&
      VALID_PROVIDERS.has(rec.providerId as AIProviderId)
        ? (rec.providerId as AIProviderId)
        : 'antigravity'
    const status: MarbleOpProposal['status'] =
      typeof rec.status === 'string' &&
      VALID_PROPOSAL_STATUSES.has(rec.status as MarbleOpProposal['status'])
        ? (rec.status as MarbleOpProposal['status'])
        : 'proposed'
    const proposal: MarbleOpProposal = {
      id: rec.id,
      note: rec.note,
      ops,
      targetIds,
      modelId:
        typeof rec.modelId === 'string' ? rec.modelId : 'antigravity/default',
      providerId,
      createdAt:
        typeof rec.createdAt === 'number' && Number.isFinite(rec.createdAt)
          ? rec.createdAt
          : Date.now(),
      status,
      instruction: rec.instruction,
    }
    if (typeof rec.stage === 'string') proposal.stage = rec.stage
    if (inverseOps && inverseOps.length > 0) proposal.inverseOps = inverseOps
    if (typeof rec.sketchDataUrl === 'string') {
      proposal.sketchDataUrl = rec.sketchDataUrl
    }
    if (Array.isArray(rec.sketchAnnotations)) {
      proposal.sketchAnnotations = rec.sketchAnnotations as SketchAnnotation[]
    }
    if (Array.isArray(rec.referencedEvergreenDocs)) {
      proposal.referencedEvergreenDocs =
        rec.referencedEvergreenDocs as EvergreenDocRef[]
    }
    out.push(proposal)
    if (out.length >= MAX_INTENT_HISTORY) break
  }
  return out
}

function defaultSettings(): DriveSettings {
  return {
    version: 1,
    trashRetentionDays: DEFAULT_TRASH_RETENTION_DAYS,
  }
}

function sanitizeRoleAssignments(
  raw: unknown,
): DriveRoleAssignments | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const rec = raw as Record<string, unknown>
  if (
    typeof rec.implementation !== 'string' ||
    typeof rec.exploration !== 'string' ||
    typeof rec.review !== 'string' ||
    typeof rec.design !== 'string'
  ) {
    return undefined
  }
  return {
    implementation: rec.implementation,
    exploration: rec.exploration,
    review: rec.review,
    design: rec.design,
  }
}

function sanitizeSettingsPatch(raw: unknown): Partial<DriveSettings> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  const out: Partial<DriveSettings> = {}
  if (
    typeof rec.trashRetentionDays === 'number' &&
    Number.isFinite(rec.trashRetentionDays) &&
    rec.trashRetentionDays >= 1 &&
    rec.trashRetentionDays <= 3650
  ) {
    out.trashRetentionDays = Math.round(rec.trashRetentionDays)
  }
  if (typeof rec.defaultModelId === 'string' && rec.defaultModelId.trim()) {
    out.defaultModelId = rec.defaultModelId.trim()
  }
  if (Array.isArray(rec.favoriteModelIds)) {
    const deduped = Array.from(
      new Set(
        rec.favoriteModelIds
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    )
    out.favoriteModelIds = deduped
  }
  const roleAssignments = sanitizeRoleAssignments(rec.roleAssignments)
  if (roleAssignments) {
    out.roleAssignments = roleAssignments
  }
  if (
    typeof rec.viewMode === 'string' &&
    VALID_VIEW_MODES.has(rec.viewMode as DriveViewModePreference)
  ) {
    out.viewMode = rec.viewMode as DriveViewModePreference
  }
  if (
    typeof rec.sortBy === 'string' &&
    VALID_SORT_OPTIONS.has(rec.sortBy as DriveSortPreference)
  ) {
    out.sortBy = rec.sortBy as DriveSortPreference
  }
  return out
}

export async function readDriveSettingsOnDisk(): Promise<DriveSettings> {
  try {
    const raw = await readFile(getSettingsFilePath(), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    const sanitized = sanitizeSettingsPatch(parsed)
    return {
      ...defaultSettings(),
      ...sanitized,
      version: 1,
    }
  } catch (error) {
    if (isEnoent(error)) return defaultSettings()
    return defaultSettings()
  }
}

export async function updateDriveSettingsOnDisk(
  rawPatch: unknown,
): Promise<DriveSettings> {
  const patch = sanitizeSettingsPatch(rawPatch)
  if (!patch) {
    fail(400, 'settings object is required')
  }
  return await withDriveLock(async () => {
    const current = await readDriveSettingsOnDisk()
    const next: DriveSettings = {
      ...current,
      ...patch,
      version: 1,
    }
    await writeAtomicText(getSettingsFilePath(), JSON.stringify(next, null, 2))
    if (patch.trashRetentionDays !== undefined) {
      const { meta } = await readMetadataWithMigration()
      if (meta.trash.retentionDays !== next.trashRetentionDays) {
        meta.trash = {
          ...meta.trash,
          retentionDays: next.trashRetentionDays,
        }
        await writeMetadata(meta)
      }
    }
    return next
  })
}

function defaultTrashState(
  retentionDays = DEFAULT_TRASH_RETENTION_DAYS,
): DriveTrashState {
  return {
    retentionDays,
    lastPurgedAt: null,
  }
}

function defaultTemplatesSeedState(): DriveTemplatesSeedState {
  return {
    seededIds: [],
    seededAt: null,
  }
}

function sanitizeTemplatesSeedState(raw: unknown): DriveTemplatesSeedState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaultTemplatesSeedState()
  }
  const rec = raw as Record<string, unknown>
  const seededIds = Array.isArray(rec.seededIds)
    ? Array.from(
        new Set(
          rec.seededIds
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      )
    : []
  const seededAt =
    typeof rec.seededAt === 'string' && !Number.isNaN(Date.parse(rec.seededAt))
      ? rec.seededAt
      : null
  return { seededIds, seededAt }
}

function emptyMetadata(
  retentionDays = DEFAULT_TRASH_RETENTION_DAYS,
): DriveMetadataFile {
  return {
    version: 2,
    folders: {},
    documents: {},
    trash: defaultTrashState(retentionDays),
    templates: defaultTemplatesSeedState(),
  }
}

function sanitizeTrashState(raw: unknown): DriveTrashState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaultTrashState()
  }
  const rec = raw as Record<string, unknown>
  const retentionDays =
    typeof rec.retentionDays === 'number' &&
    Number.isFinite(rec.retentionDays) &&
    rec.retentionDays >= 1
      ? Math.round(rec.retentionDays)
      : DEFAULT_TRASH_RETENTION_DAYS
  const lastPurgedAt =
    typeof rec.lastPurgedAt === 'string' &&
    !Number.isNaN(Date.parse(rec.lastPurgedAt))
      ? rec.lastPurgedAt
      : null
  const lastPurgedSlugs = Array.isArray(rec.lastPurgedSlugs)
    ? rec.lastPurgedSlugs.filter(
        (slug): slug is string => typeof slug === 'string',
      )
    : undefined
  return {
    retentionDays,
    lastPurgedAt,
    ...(lastPurgedSlugs && lastPurgedSlugs.length > 0
      ? { lastPurgedSlugs }
      : {}),
  }
}

async function readMetadataWithMigration(): Promise<{
  meta: DriveMetadataFile
  migrated: boolean
}> {
  try {
    const raw = await readFile(getMetaFilePath(), 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const wasOldVersion = parsed.version !== 2 || !parsed.trash

    const folders: Partial<Record<string, StoredFolderMeta>> = {}
    if (
      parsed.folders &&
      typeof parsed.folders === 'object' &&
      !Array.isArray(parsed.folders)
    ) {
      for (const [key, value] of Object.entries(
        parsed.folders as Record<string, unknown>,
      )) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          continue
        }
        const rec = value as Record<string, unknown>
        const now = new Date().toISOString()
        folders[key] = {
          id:
            typeof rec.id === 'string' && rec.id.trim()
              ? rec.id.trim()
              : deterministicId('folder', key),
          color: sanitizeColor(rec.color),
          createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : now,
          updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : now,
        }
      }
    }

    const documents: Partial<Record<string, StoredDocumentMeta>> = {}
    if (
      parsed.documents &&
      typeof parsed.documents === 'object' &&
      !Array.isArray(parsed.documents)
    ) {
      for (const [key, value] of Object.entries(
        parsed.documents as Record<string, unknown>,
      )) {
        const sanitized = sanitizeMetaPatch(value)
        if (!sanitized) continue
        if (!sanitized.id) {
          sanitized.id = deterministicId('doc', key)
        }
        documents[key] = sanitized
      }
    }

    return {
      meta: {
        version: 2,
        folders,
        documents,
        trash: sanitizeTrashState(parsed.trash),
        templates: sanitizeTemplatesSeedState(parsed.templates),
      },
      migrated: wasOldVersion,
    }
  } catch (error) {
    if (isEnoent(error)) return { meta: emptyMetadata(), migrated: false }
    return { meta: emptyMetadata(), migrated: false }
  }
}

async function readMetadata(): Promise<DriveMetadataFile> {
  const { meta } = await readMetadataWithMigration()
  return meta
}

async function writeMetadata(meta: DriveMetadataFile): Promise<void> {
  const metaDir = getMetaDir()
  const target = getMetaFilePath()
  await mkdir(metaDir, { recursive: true })
  const temporary = `${target}.${randomBytes(8).toString('hex')}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(meta, null, 2), 'utf8')
    await rename(temporary, target)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

async function readDocumentHistory(docId: string): Promise<{
  checkpoints: MarbleCheckpoint[]
  intentHistory: MarbleOpProposal[]
}> {
  try {
    const raw = await readFile(historyFilePath(docId), 'utf8')
    const parsed = JSON.parse(raw) as Partial<StoredDocumentHistoryFile>
    return {
      checkpoints: sanitizeCheckpoints(parsed.checkpoints) ?? [],
      intentHistory: sanitizeIntentHistory(parsed.intentHistory) ?? [],
    }
  } catch (error) {
    if (isEnoent(error)) {
      return { checkpoints: [], intentHistory: [] }
    }
    return { checkpoints: [], intentHistory: [] }
  }
}

async function writeDocumentHistory(
  docId: string,
  slug: string,
  patch: {
    checkpoints?: MarbleCheckpoint[]
    intentHistory?: MarbleOpProposal[]
  },
): Promise<void> {
  if (patch.checkpoints === undefined && patch.intentHistory === undefined) {
    return
  }
  const existing = await readDocumentHistory(docId)
  const record: StoredDocumentHistoryFile = {
    version: 1,
    docId,
    slug,
    updatedAt: new Date().toISOString(),
    checkpoints: patch.checkpoints ?? existing.checkpoints,
    intentHistory: patch.intentHistory ?? existing.intentHistory,
  }
  await writeAtomicText(historyFilePath(docId), JSON.stringify(record, null, 2))
}

async function deleteDocumentHistory(docId: string | undefined): Promise<void> {
  if (!docId) return
  try {
    await rm(historyFilePath(docId), { force: true })
  } catch {
    // Ignore invalid ids or missing files during cleanup.
  }
  const trimmed = docId.trim()
  if (SAFE_ID_PATTERN.test(trimmed) && !trimmed.includes('..')) {
    const docChatsDir = getDocChatsDir()
    const docChatFile = path.resolve(docChatsDir, `${trimmed}.json`)
    if (path.dirname(docChatFile) === docChatsDir) {
      try {
        await rm(docChatFile, { force: true })
      } catch {
        // Ignore missing doc-chat files during cleanup.
      }
    }
  }
}

async function slugIsInTrash(slug: string): Promise<boolean> {
  if (await readTrashMeta(slug)) return true
  return pathExists(trashFilePath(slug))
}

async function failIfSlugInTrash(slug: string, verb: string): Promise<void> {
  if (await slugIsInTrash(slug)) {
    fail(409, `Cannot ${verb} "${slug}" while it is in Trash`)
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target)
    return true
  } catch (error) {
    if (isEnoent(error)) return false
    throw error
  }
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    const info = await stat(target)
    return info.isDirectory()
  } catch (error) {
    if (isEnoent(error)) return false
    throw error
  }
}

export function titleOf(source: string, slug: string): string {
  const titled = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const text = titled?.replace(/\s+/g, ' ').trim()
  if (text && text !== '__TITLE__') {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  }
  return slug
}

export function byteSizeOf(source: string): number {
  return new TextEncoder().encode(source).byteLength
}

export function inferCategory(source: string, slug: string): MarbleAppCategory {
  if (/data-marble-whiteboard-state\s*=/.test(source)) return 'whiteboard'
  if (
    /data-marble-notes-state\s*=/.test(source) ||
    /id=["']notebook-shell["']/.test(source)
  ) {
    return 'notebook'
  }
  if (
    /data-marble-slides-state\s*=/.test(source) ||
    /data-marble-slide\b/.test(source)
  ) {
    return 'slides'
  }
  if (
    /data-marble-latex-state\s*=/.test(source) ||
    /\\begin\{document\}/.test(source)
  ) {
    return 'latex'
  }
  if (/data-marble-docs-state\s*=/.test(source)) {
    return 'document'
  }
  if (/matrix-grid|data-marble-matrix/.test(source)) {
    return 'matrix'
  }
  if (/data-marble-canvas/.test(source)) {
    return 'sandbox'
  }
  if (slug.includes('slide') || slug.includes('deck')) return 'slides'
  if (slug.includes('notebook') || slug.includes('note')) return 'notebook'
  if (slug.includes('latex') || slug.includes('paper')) return 'latex'
  if (slug.includes('whiteboard')) return 'whiteboard'
  return 'document'
}

function defaultShareConfig(slug: string): ShareConfig {
  return {
    isPublicLinkEnabled: false,
    publicLinkUrl: `https://xdrive.app/d/${slug}`,
    publicPermission: 'view_only',
    allowDuplication: true,
    sharedAiDailyLimit: 40,
    sharedAiUsedToday: 0,
    collaborators: [],
  }
}

function sanitizeMetaPatch(raw: unknown): StoredDocumentMeta | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const record = raw as Record<string, unknown>
  const out: StoredDocumentMeta = {}
  if (typeof record.id === 'string' && record.id.trim()) {
    out.id = record.id.trim()
  }
  if (typeof record.slug === 'string' && record.slug.trim()) {
    out.slug = record.slug.trim()
  }
  if (typeof record.title === 'string') out.title = record.title
  if (typeof record.description === 'string') {
    out.description = record.description
  }
  const category = sanitizeCategory(record.category)
  if (category) out.category = category
  if (typeof record.isEvergreen === 'boolean') {
    out.isEvergreen = record.isEvergreen
  }
  if (typeof record.templateId === 'string') out.templateId = record.templateId
  if (typeof record.version === 'number' && Number.isFinite(record.version)) {
    out.version = record.version
  }
  if (typeof record.createdAt === 'string') out.createdAt = record.createdAt
  if (typeof record.updatedAt === 'string') out.updatedAt = record.updatedAt
  const createdBy = sanitizeAuthor(record.createdBy)
  if (createdBy) out.createdBy = createdBy
  const lastEditedBy = sanitizeAuthor(record.lastEditedBy)
  if (lastEditedBy) out.lastEditedBy = lastEditedBy
  if (typeof record.starred === 'boolean') out.starred = record.starred
  if (typeof record.pinned === 'boolean') out.pinned = record.pinned
  if (Array.isArray(record.tags)) {
    out.tags = record.tags.filter(
      (item): item is string => typeof item === 'string',
    )
  }
  const share = sanitizeShareConfig(record.share, out.slug)
  if (share) out.share = share
  return out
}

interface ScannedEntry {
  directories: Array<{ relPath: string; fullPath: string }>
  files: Array<DriveDocumentLocation>
}

async function scanDriveTree(baseDir?: string): Promise<ScannedEntry> {
  const driveDir = getDriveDir()
  const root = baseDir ?? driveDir
  const directories: Array<{ relPath: string; fullPath: string }> = []
  const files: Array<DriveDocumentLocation> = []

  async function walk(currentFull: string, currentRel: string) {
    let entries
    try {
      entries = await readdir(currentFull, { withFileTypes: true })
    } catch (error) {
      if (isEnoent(error)) return
      throw error
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const entryFull = path.resolve(currentFull, entry.name)
      if (!entryFull.startsWith(`${driveDir}${path.sep}`)) continue
      const entryRel = currentRel ? `${currentRel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        directories.push({ relPath: entryRel, fullPath: entryFull })
        await walk(entryFull, entryRel)
      } else if (entry.isFile() && entry.name.endsWith('.mrbl')) {
        const slug = entry.name.slice(0, -'.mrbl'.length)
        if (!SLUG_PATTERN.test(slug) || slug.includes('..')) continue
        files.push({
          slug,
          fileName: entry.name,
          folderPath: currentRel,
          relPath: entryRel,
          fullPath: entryFull,
        })
      }
    }
  }

  const initialRel =
    root === driveDir
      ? ''
      : path.relative(driveDir, root).split(path.sep).join('/')
  await walk(root, initialRel)
  return { directories, files }
}

export async function findDocumentBySlug(
  slug: string,
  preferredFolderPath?: string | null,
): Promise<DriveDocumentLocation | null> {
  const validSlug = assertSlug(slug)
  if (preferredFolderPath !== undefined) {
    const candidate = resolveDocumentLocation(validSlug, preferredFolderPath)
    if (await pathExists(candidate.fullPath)) return candidate
  }
  const atRoot = resolveDocumentLocation(validSlug, '')
  if (await pathExists(atRoot.fullPath)) return atRoot
  const { files } = await scanDriveTree()
  return files.find((item) => item.slug === validSlug) ?? null
}

async function writeAtomicText(
  fullPath: string,
  content: string,
): Promise<void> {
  await mkdir(path.dirname(fullPath), { recursive: true })
  const temporary = `${fullPath}.${randomBytes(8).toString('hex')}.tmp`
  try {
    await writeFile(temporary, content, 'utf8')
    await rename(temporary, fullPath)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

export async function readDocumentOptional(
  slug: string,
  folderPath?: string | null,
): Promise<{ source: string; location: DriveDocumentLocation } | null> {
  const located = await findDocumentBySlug(slug, folderPath)
  if (!located) return null
  try {
    const source = await readFile(located.fullPath, 'utf8')
    return { source, location: located }
  } catch (error) {
    if (isEnoent(error)) return null
    throw error
  }
}

export async function saveDocumentToDisk(input: {
  slug: string
  source: string
  folderPath?: string | null
  meta?: unknown
  checkpoints?: unknown
  intentHistory?: unknown
}): Promise<DriveDocumentLocation> {
  return await withDriveMutation(async () => {
    const validSlug = assertSlug(input.slug)
    await failIfSlugInTrash(validSlug, 'save')
    let target: DriveDocumentLocation
    if (input.folderPath !== undefined) {
      target = resolveDocumentLocation(validSlug, input.folderPath)
    } else {
      const existing = await findDocumentBySlug(validSlug)
      target = existing ?? resolveDocumentLocation(validSlug, '')
    }
    await writeAtomicText(target.fullPath, input.source)

    const metadata = await readMetadata()
    const patch = sanitizeMetaPatch(input.meta)
    const previous = metadata.documents[target.relPath] ?? {}
    const now = new Date().toISOString()
    const docId =
      patch?.id ?? previous.id ?? deterministicId('doc', target.relPath)
    metadata.documents[target.relPath] = {
      ...previous,
      ...patch,
      id: docId,
      slug: validSlug,
      title: patch?.title ?? previous.title ?? titleOf(input.source, validSlug),
      category:
        patch?.category ??
        previous.category ??
        inferCategory(input.source, validSlug),
      createdAt: patch?.createdAt ?? previous.createdAt ?? now,
      updatedAt: patch?.updatedAt ?? now,
    }
    await writeMetadata(metadata)

    const checkpoints = sanitizeCheckpoints(input.checkpoints)
    const intentHistory = sanitizeIntentHistory(input.intentHistory)
    if (checkpoints !== undefined || intentHistory !== undefined) {
      await writeDocumentHistory(docId, validSlug, {
        checkpoints,
        intentHistory,
      })
    }

    return target
  })
}

export async function updateDocumentMetaOnDisk(input: {
  slug: string
  folderPath?: string | null
  meta?: unknown
  checkpoints?: unknown
  intentHistory?: unknown
}): Promise<{ ok: true; slug: string; relPath: string }> {
  return await withDriveMutation(async () => {
    const validSlug = assertSlug(input.slug)
    const patch = sanitizeMetaPatch(input.meta)
    const checkpoints = sanitizeCheckpoints(input.checkpoints)
    const intentHistory = sanitizeIntentHistory(input.intentHistory)
    if (!patch && checkpoints === undefined && intentHistory === undefined) {
      fail(400, 'meta, checkpoints, or intentHistory is required')
    }
    const found = await findDocumentBySlug(validSlug, input.folderPath)
    if (!found) await failIfSlugInTrash(validSlug, 'update')
    const located =
      found ?? resolveDocumentLocation(validSlug, input.folderPath ?? '')
    const metadata = await readMetadata()
    const previous = metadata.documents[located.relPath] ?? {}
    const docId =
      patch?.id ?? previous.id ?? deterministicId('doc', located.relPath)

    if (patch || !metadata.documents[located.relPath]) {
      metadata.documents[located.relPath] = {
        ...previous,
        ...patch,
        id: docId,
        slug: validSlug,
        updatedAt:
          patch?.updatedAt ?? previous.updatedAt ?? new Date().toISOString(),
      }
      await writeMetadata(metadata)
    }

    if (checkpoints !== undefined || intentHistory !== undefined) {
      await writeDocumentHistory(docId, validSlug, {
        checkpoints,
        intentHistory,
      })
    }

    return { ok: true, slug: validSlug, relPath: located.relPath }
  })
}

export async function moveDocumentOnDisk(input: {
  slug: string
  fromFolderPath?: string | null
  toFolderPath: string | null
  source?: string
  meta?: unknown
}): Promise<{
  ok: true
  slug: string
  fromPath: string
  toPath: string
  folderPath: string
  isTemplate: boolean
}> {
  return await withDriveMutation(async () => {
    const validSlug = assertSlug(input.slug)
    const fromLoc =
      (await findDocumentBySlug(validSlug, input.fromFolderPath)) ??
      resolveDocumentLocation(validSlug, input.fromFolderPath ?? '')
    const toLoc = resolveDocumentLocation(validSlug, input.toFolderPath ?? '')

    await mkdir(path.dirname(toLoc.fullPath), { recursive: true })
    const fromExists = await pathExists(fromLoc.fullPath)
    if (!fromExists) await failIfSlugInTrash(validSlug, 'move')
    if (fromLoc.fullPath !== toLoc.fullPath) {
      if (fromExists) {
        if (await pathExists(toLoc.fullPath)) {
          fail(
            409,
            `A file named "${toLoc.fileName}" already exists in "${toLoc.folderPath || 'My Drive'}"`,
          )
        }
        await rename(fromLoc.fullPath, toLoc.fullPath)
      } else if (typeof input.source === 'string') {
        await writeAtomicText(toLoc.fullPath, input.source)
      }
    }

    const metadata = await readMetadata()
    const prevMeta = metadata.documents[fromLoc.relPath] ?? {}
    if (fromLoc.relPath !== toLoc.relPath) {
      delete metadata.documents[fromLoc.relPath]
    }
    const patch = sanitizeMetaPatch(input.meta)
    metadata.documents[toLoc.relPath] = {
      ...prevMeta,
      ...patch,
      id: patch?.id ?? prevMeta.id ?? deterministicId('doc', toLoc.relPath),
      slug: validSlug,
      updatedAt: patch?.updatedAt ?? new Date().toISOString(),
    }
    await writeMetadata(metadata)

    return {
      ok: true,
      slug: validSlug,
      fromPath: fromLoc.relPath,
      toPath: toLoc.relPath,
      folderPath: toLoc.folderPath,
      isTemplate: isTemplatesFolderPath(toLoc.folderPath),
    }
  })
}

export async function createFolderOnDisk(input: {
  id?: string
  name: string
  parentPath?: string | null
  color?: DriveFolderColor
  createdAt?: string
  updatedAt?: string
}): Promise<{ ok: true; folder: DriveFolder; path: string }> {
  return await withDriveMutation(async () => {
    const cleanName = assertFolderSegment(input.name)
    const parent = resolveDriveDirPath(input.parentPath)
    const relPath = parent.folderPath
      ? `${parent.folderPath}/${cleanName}`
      : cleanName
    const target = resolveDriveDirPath(relPath)

    if (await pathExists(target.fullPath)) {
      fail(
        409,
        `A folder named "${cleanName}" already exists in "${parent.folderPath || 'My Drive'}"`,
      )
    }

    await mkdir(target.fullPath, { recursive: true })

    const metadata = await readMetadata()
    const now = new Date().toISOString()
    const createdAt = input.createdAt ?? now
    const updatedAt = input.updatedAt ?? now
    const color = sanitizeColor(input.color)
    const id = mintUnusedFolderId(
      metadata,
      input.id?.trim() || deterministicId('folder', relPath),
    )

    const parentMeta = parent.folderPath
      ? metadata.folders[parent.folderPath]
      : undefined
    const parentId = parent.folderPath
      ? (parentMeta?.id ?? deterministicId('folder', parent.folderPath))
      : null

    metadata.folders[relPath] = {
      id,
      color,
      createdAt,
      updatedAt,
    }
    await writeMetadata(metadata)

    return {
      ok: true,
      path: relPath,
      folder: {
        id,
        name: cleanName,
        parentId,
        color,
        isTemplatesFolder: isTemplatesRootPath(relPath),
        createdAt,
        updatedAt,
      },
    }
  })
}

async function rewriteTrashOriginalFolderPaths(
  oldPrefix: string,
  newPrefix: string,
): Promise<void> {
  const trashDir = getTrashDir()
  let names: string[]
  try {
    names = await readdir(trashDir)
  } catch (error) {
    if (isEnoent(error)) return
    throw error
  }
  for (const name of names) {
    if (!name.endsWith('.meta.json')) continue
    const full = path.resolve(trashDir, name)
    try {
      const raw = await readFile(full, 'utf8')
      const parsed = JSON.parse(raw) as TrashMetaRecord
      if (!parsed.originalFolderPath) continue
      if (
        parsed.originalFolderPath === oldPrefix ||
        parsed.originalFolderPath.startsWith(`${oldPrefix}/`)
      ) {
        parsed.originalFolderPath =
          parsed.originalFolderPath === oldPrefix
            ? newPrefix
            : `${newPrefix}${parsed.originalFolderPath.slice(oldPrefix.length)}`
        await writeAtomicText(full, JSON.stringify(parsed, null, 2))
      }
    } catch {
      // Ignore malformed trash metadata files.
    }
  }
}

export async function renameFolderOnDisk(input: {
  oldPath: string
  newName: string
  color?: DriveFolderColor
  updatedAt?: string
}): Promise<{
  ok: true
  oldPath: string
  newPath: string
  folder: DriveFolder
}> {
  return await withDriveMutation(async () => {
    const normalizedOld = normalizeFolderPath(input.oldPath)
    if (!normalizedOld) {
      fail(400, 'oldPath is required')
    }
    const cleanNewName = assertFolderSegment(input.newName)
    const parentPath = path.posix.dirname(normalizedOld)
    const normalizedParent = parentPath === '.' ? '' : parentPath
    const normalizedNew = normalizedParent
      ? `${normalizedParent}/${cleanNewName}`
      : cleanNewName

    const oldDir = resolveDriveDirPath(normalizedOld)
    const newDir = resolveDriveDirPath(normalizedNew)

    if (!(await isDirectory(oldDir.fullPath))) {
      fail(404, `Folder "${normalizedOld}" not found`)
    }

    if (normalizedOld !== normalizedNew) {
      if (await pathExists(newDir.fullPath)) {
        fail(
          409,
          `A folder named "${cleanNewName}" already exists in "${normalizedParent || 'My Drive'}"`,
        )
      }
      await rename(oldDir.fullPath, newDir.fullPath)
    }

    const metadata = await readMetadata()
    const now = input.updatedAt ?? new Date().toISOString()

    if (normalizedOld !== normalizedNew) {
      const nextFolders: Partial<Record<string, StoredFolderMeta>> = {}
      for (const [key, value] of Object.entries(metadata.folders)) {
        if (!value) continue
        if (key === normalizedOld) {
          nextFolders[normalizedNew] = value
        } else if (key.startsWith(`${normalizedOld}/`)) {
          nextFolders[`${normalizedNew}${key.slice(normalizedOld.length)}`] =
            value
        } else {
          nextFolders[key] = value
        }
      }
      metadata.folders = nextFolders

      const nextDocs: Partial<Record<string, StoredDocumentMeta>> = {}
      for (const [key, value] of Object.entries(metadata.documents)) {
        if (!value) continue
        if (key.startsWith(`${normalizedOld}/`)) {
          nextDocs[`${normalizedNew}${key.slice(normalizedOld.length)}`] = value
        } else {
          nextDocs[key] = value
        }
      }
      metadata.documents = nextDocs
    }

    const existingMeta = metadata.folders[normalizedNew]
    const updatedMeta: StoredFolderMeta = {
      id:
        existingMeta?.id ??
        mintUnusedFolderId(metadata, deterministicId('folder', normalizedNew)),
      color:
        input.color !== undefined
          ? sanitizeColor(input.color)
          : (existingMeta?.color ?? 'default'),
      createdAt: existingMeta?.createdAt ?? now,
      updatedAt: now,
    }
    metadata.folders[normalizedNew] = updatedMeta
    await writeMetadata(metadata)

    if (normalizedOld !== normalizedNew) {
      await rewriteTrashOriginalFolderPaths(normalizedOld, normalizedNew)
    }

    const parentMeta = normalizedParent
      ? metadata.folders[normalizedParent]
      : undefined
    const parentId = normalizedParent
      ? (parentMeta?.id ?? deterministicId('folder', normalizedParent))
      : null

    return {
      ok: true,
      oldPath: normalizedOld,
      newPath: normalizedNew,
      folder: {
        id: updatedMeta.id,
        name: cleanNewName,
        parentId,
        color: updatedMeta.color,
        isTemplatesFolder: isTemplatesRootPath(normalizedNew),
        createdAt: updatedMeta.createdAt,
        updatedAt: updatedMeta.updatedAt,
      },
    }
  })
}

export async function deleteFolderOnDisk(input: {
  folderPath: string
}): Promise<{
  ok: true
  deletedPath: string
  parentPath: string
  movedFiles: Array<{ from: string; to: string; slug: string }>
}> {
  return await withDriveMutation(async () => {
    const normalized = normalizeFolderPath(input.folderPath)
    if (!normalized) {
      fail(400, 'folderPath is required')
    }
    const targetDir = resolveDriveDirPath(normalized)
    const rawParent = path.posix.dirname(normalized)
    const parentPath = rawParent === '.' ? '' : rawParent
    const parentDir = resolveDriveDirPath(parentPath)

    const metadata = await readMetadata()
    const movedFiles: Array<{ from: string; to: string; slug: string }> = []

    if (await isDirectory(targetDir.fullPath)) {
      const { files } = await scanDriveTree(targetDir.fullPath)
      await mkdir(parentDir.fullPath, { recursive: true })
      for (const file of files) {
        let nextSlug = file.slug
        let candidate = resolveDocumentLocation(nextSlug, parentPath)
        let suffix = 2
        while (await pathExists(candidate.fullPath)) {
          nextSlug = `${file.slug}-${suffix}`
          candidate = resolveDocumentLocation(nextSlug, parentPath)
          suffix += 1
        }
        await rename(file.fullPath, candidate.fullPath)
        const docMeta = metadata.documents[file.relPath]
        if (docMeta) {
          delete metadata.documents[file.relPath]
          metadata.documents[candidate.relPath] = {
            ...docMeta,
            slug: nextSlug,
          }
        }
        movedFiles.push({
          from: file.relPath,
          to: candidate.relPath,
          slug: nextSlug,
        })
      }
      await rm(targetDir.fullPath, { recursive: true, force: true })
    }

    for (const key of Object.keys(metadata.folders)) {
      if (key === normalized || key.startsWith(`${normalized}/`)) {
        delete metadata.folders[key]
      }
    }
    await writeMetadata(metadata)

    return {
      ok: true,
      deletedPath: normalized,
      parentPath,
      movedFiles,
    }
  })
}

export async function readTrashMeta(
  slug: string,
): Promise<TrashMetaRecord | null> {
  try {
    const raw = await readFile(trashMetaFilePath(slug), 'utf8')
    const parsed = JSON.parse(raw) as Partial<TrashMetaRecord>
    if (
      typeof parsed.trashedAt === 'string' &&
      !Number.isNaN(Date.parse(parsed.trashedAt))
    ) {
      const sanitizedMeta = sanitizeMetaPatch(parsed.meta)
      const retentionDays =
        typeof parsed.retentionDays === 'number' &&
        Number.isFinite(parsed.retentionDays) &&
        parsed.retentionDays > 0
          ? Math.round(parsed.retentionDays)
          : undefined
      const purgeAt =
        typeof parsed.purgeAt === 'string' &&
        !Number.isNaN(Date.parse(parsed.purgeAt))
          ? parsed.purgeAt
          : undefined
      return {
        version: typeof parsed.version === 'number' ? parsed.version : 1,
        slug: typeof parsed.slug === 'string' ? parsed.slug : slug,
        docId:
          typeof parsed.docId === 'string' && parsed.docId.trim()
            ? parsed.docId.trim()
            : sanitizedMeta?.id,
        trashedAt: parsed.trashedAt,
        purgeAt,
        retentionDays,
        originalFolderPath:
          typeof parsed.originalFolderPath === 'string'
            ? parsed.originalFolderPath
            : undefined,
        meta: sanitizedMeta,
      }
    }
    return null
  } catch (error) {
    if (isEnoent(error)) return null
    return null
  }
}

async function purgeExpiredTrashUnlocked(options?: {
  retentionDays?: number
  recordTimestamp?: boolean
}): Promise<{ purged: string[]; lastPurgedAt: string | null }> {
  const settings = await readDriveSettingsOnDisk()
  const explicitRetention =
    options?.retentionDays !== undefined &&
    Number.isFinite(options.retentionDays) &&
    options.retentionDays > 0
      ? options.retentionDays
      : undefined
  const effectiveRetention = explicitRetention ?? settings.trashRetentionDays

  const trashDir = getTrashDir()
  let names: string[]
  try {
    names = await readdir(trashDir)
  } catch (error) {
    if (isEnoent(error)) {
      if (options?.recordTimestamp) {
        const nowIso = new Date().toISOString()
        const metadata = await readMetadata()
        metadata.trash = {
          ...metadata.trash,
          retentionDays: effectiveRetention,
          lastPurgedAt: nowIso,
        }
        await writeMetadata(metadata)
        return { purged: [], lastPurgedAt: nowIso }
      }
      return { purged: [], lastPurgedAt: null }
    }
    throw error
  }

  const now = Date.now()
  const cutoffMs = effectiveRetention * DAY_MS
  const purged: string[] = []
  const purgedDocIds: string[] = []

  for (const fileName of names) {
    if (!fileName.endsWith('.mrbl')) continue
    const slug = fileName.slice(0, -'.mrbl'.length)
    if (!SLUG_PATTERN.test(slug) || slug.includes('..')) continue
    const full = trashFilePath(slug)
    const meta = await readTrashMeta(slug)
    let trashedMs = meta ? Date.parse(meta.trashedAt) : Number.NaN
    if (Number.isNaN(trashedMs)) {
      try {
        const info = await stat(full)
        trashedMs = info.mtimeMs
      } catch (error) {
        if (isEnoent(error)) continue
        throw error
      }
    }
    const parsedPurgeMs = meta?.purgeAt ? Date.parse(meta.purgeAt) : Number.NaN
    const expiresMs = !Number.isNaN(parsedPurgeMs)
      ? parsedPurgeMs
      : trashedMs + cutoffMs
    if (now >= expiresMs) {
      await Promise.all([
        rm(full, { force: true }),
        rm(trashMetaFilePath(slug), { force: true }),
      ])
      purged.push(slug)
      const docId = meta?.docId ?? meta?.meta?.id
      if (docId) purgedDocIds.push(docId)
    }
  }

  for (const docId of purgedDocIds) {
    await deleteDocumentHistory(docId)
  }

  const hasTrashFiles = names.some((name) => name.endsWith('.mrbl'))
  if (purged.length > 0 || options?.recordTimestamp || hasTrashFiles) {
    const nowIso = new Date(now).toISOString()
    const metadata = await readMetadata()
    metadata.trash = {
      retentionDays: effectiveRetention,
      lastPurgedAt: nowIso,
      ...(purged.length > 0
        ? { lastPurgedSlugs: purged }
        : metadata.trash.lastPurgedSlugs
          ? { lastPurgedSlugs: metadata.trash.lastPurgedSlugs }
          : {}),
    }
    await writeMetadata(metadata)
    return { purged, lastPurgedAt: nowIso }
  }

  return { purged, lastPurgedAt: null }
}

export async function purgeExpiredTrashOnDisk(
  retentionDays?: number,
  options?: { recordTimestamp?: boolean },
): Promise<string[]> {
  const purged = await withDriveLock(async () => {
    const result = await purgeExpiredTrashUnlocked({
      retentionDays,
      recordTimestamp: options?.recordTimestamp,
    })
    return result.purged
  })
  if (purged.length > 0) {
    await syncDriveSearchIndexSafe()
  }
  return purged
}

export async function trashDocumentOnDisk(input: {
  slug: string
  folderPath?: string | null
  trashedAt?: string
  retentionDays?: number
  meta?: unknown
  checkpoints?: unknown
  intentHistory?: unknown
}): Promise<{
  ok: true
  slug: string
  trashedAt: string
  purgeAt: string
  existedOnDisk: boolean
  retentionDays: number
}> {
  return await withDriveMutation(async () => {
    const validSlug = assertSlug(input.slug)
    const trashedAt =
      input.trashedAt && !Number.isNaN(Date.parse(input.trashedAt))
        ? input.trashedAt
        : new Date().toISOString()
    const settings = await readDriveSettingsOnDisk()
    const retentionDays =
      typeof input.retentionDays === 'number' &&
      Number.isFinite(input.retentionDays) &&
      input.retentionDays > 0
        ? Math.round(input.retentionDays)
        : settings.trashRetentionDays
    const purgeAt = new Date(
      Date.parse(trashedAt) + retentionDays * DAY_MS,
    ).toISOString()

    await mkdir(getTrashDir(), { recursive: true })

    const located =
      (await findDocumentBySlug(validSlug, input.folderPath)) ??
      resolveDocumentLocation(validSlug, input.folderPath ?? '')
    const dst = trashFilePath(validSlug)

    let existedOnDisk = false
    try {
      await rename(located.fullPath, dst)
      existedOnDisk = true
    } catch (error) {
      if (!isEnoent(error)) throw error
    }

    const metadata = await readMetadata()
    const existingDocMeta = metadata.documents[located.relPath]
    if (existingDocMeta) {
      delete metadata.documents[located.relPath]
      await writeMetadata(metadata)
    }

    const patch = sanitizeMetaPatch(input.meta)
    const docId =
      patch?.id ??
      existingDocMeta?.id ??
      deterministicId('doc', located.relPath)
    const mergedMeta: StoredDocumentMeta = {
      ...existingDocMeta,
      ...patch,
      id: docId,
      slug: validSlug,
    }

    const checkpoints = sanitizeCheckpoints(input.checkpoints)
    const intentHistory = sanitizeIntentHistory(input.intentHistory)
    if (checkpoints !== undefined || intentHistory !== undefined) {
      await writeDocumentHistory(docId, validSlug, {
        checkpoints,
        intentHistory,
      })
    }

    if (existedOnDisk) {
      const record: TrashMetaRecord = {
        version: 2,
        slug: validSlug,
        docId,
        trashedAt,
        purgeAt,
        retentionDays,
        originalFolderPath: located.folderPath,
        meta: mergedMeta,
      }
      await writeAtomicText(
        trashMetaFilePath(validSlug),
        JSON.stringify(record, null, 2),
      )
    }

    return {
      ok: true,
      slug: validSlug,
      trashedAt,
      purgeAt,
      existedOnDisk,
      retentionDays,
    }
  })
}

export async function restoreDocumentOnDisk(input: {
  slug: string
  targetFolderPath?: string | null
}): Promise<{
  ok: true
  slug: string
  restoredOnDisk: boolean
  folderPath: string
}> {
  return await withDriveMutation(async () => {
    const validSlug = assertSlug(input.slug)
    const src = trashFilePath(validSlug)
    const trashMeta = await readTrashMeta(validSlug)

    let destFolderPath = ''
    const requested =
      input.targetFolderPath !== undefined
        ? normalizeFolderPath(input.targetFolderPath)
        : normalizeFolderPath(trashMeta?.originalFolderPath)
    if (requested) {
      const resolved = resolveDriveDirPath(requested)
      if (await isDirectory(resolved.fullPath)) {
        destFolderPath = resolved.folderPath
      }
    }

    const dst = resolveDocumentLocation(validSlug, destFolderPath)
    let restoredOnDisk = false
    try {
      await mkdir(path.dirname(dst.fullPath), { recursive: true })
      await rename(src, dst.fullPath)
      restoredOnDisk = true
    } catch (error) {
      if (!isEnoent(error)) throw error
    }
    await rm(trashMetaFilePath(validSlug), { force: true })

    if (restoredOnDisk && (trashMeta?.meta || trashMeta?.docId)) {
      const metadata = await readMetadata()
      metadata.documents[dst.relPath] = {
        ...trashMeta.meta,
        id:
          trashMeta.meta?.id ??
          trashMeta.docId ??
          deterministicId('doc', dst.relPath),
        slug: validSlug,
      }
      await writeMetadata(metadata)
    }

    return {
      ok: true,
      slug: validSlug,
      restoredOnDisk,
      folderPath: destFolderPath,
    }
  })
}

export async function deleteDocumentPermanentlyOnDisk(input: {
  slug: string
  folderPath?: string | null
}): Promise<{ ok: true; slug: string; deleted: true }> {
  return await withDriveMutation(async () => {
    const validSlug = assertSlug(input.slug)
    const located = await findDocumentBySlug(validSlug, input.folderPath)
    const trashMeta = await readTrashMeta(validSlug)
    const metadata = await readMetadata()

    const docIdsToDelete = new Set<string>()
    if (trashMeta?.docId) docIdsToDelete.add(trashMeta.docId)
    if (trashMeta?.meta?.id) docIdsToDelete.add(trashMeta.meta.id)
    if (located && metadata.documents[located.relPath]?.id) {
      docIdsToDelete.add(metadata.documents[located.relPath]!.id!)
    }

    const targets = [
      rm(trashFilePath(validSlug), { force: true }),
      rm(trashMetaFilePath(validSlug), { force: true }),
    ]
    if (located) {
      targets.push(rm(located.fullPath, { force: true }))
    }
    await Promise.all(targets)

    let changed = false
    if (located && metadata.documents[located.relPath]) {
      delete metadata.documents[located.relPath]
      changed = true
    }
    for (const [key, value] of Object.entries(metadata.documents)) {
      if (
        value?.slug === validSlug &&
        (key === `${validSlug}.mrbl` || key.endsWith(`/${validSlug}.mrbl`))
      ) {
        const candidate = path.resolve(getDriveDir(), ...key.split('/'))
        if (!(await pathExists(candidate))) {
          if (value.id) docIdsToDelete.add(value.id)
          delete metadata.documents[key]
          changed = true
        }
      }
    }
    if (changed) {
      await writeMetadata(metadata)
    }

    for (const docId of docIdsToDelete) {
      await deleteDocumentHistory(docId)
    }

    return { ok: true, slug: validSlug, deleted: true }
  })
}

export async function emptyTrashOnDisk(ids: readonly string[]): Promise<{
  ok: true
  deletedCount: number
  deletedIds: string[]
}> {
  const wanted = new Set(
    ids.map((id) => id.trim()).filter((id) => id.length > 0),
  )
  const result = await withDriveLock(async () => {
    if (wanted.size === 0) {
      return { ok: true as const, deletedCount: 0, deletedIds: [] as string[] }
    }
    const trashDir = getTrashDir()
    let names: string[]
    try {
      names = await readdir(trashDir)
    } catch (error) {
      if (isEnoent(error)) {
        return {
          ok: true as const,
          deletedCount: 0,
          deletedIds: [] as string[],
        }
      }
      throw error
    }

    const docIdsToDelete = new Set<string>()
    const purgedSlugs: string[] = []
    for (const name of names) {
      if (!name.endsWith('.mrbl')) continue
      const slug = name.slice(0, -'.mrbl'.length)
      if (!SLUG_PATTERN.test(slug) || slug.includes('..')) continue
      const meta = await readTrashMeta(slug)
      const docId = trashDocumentId(slug, meta)
      if (!wanted.has(docId)) continue
      docIdsToDelete.add(docId)
      purgedSlugs.push(slug)
      await rm(path.resolve(trashDir, name), { force: true })
      await rm(trashMetaFilePath(slug), { force: true })
    }

    for (const docId of docIdsToDelete) {
      await deleteDocumentHistory(docId)
    }

    if (purgedSlugs.length > 0) {
      const metadata = await readMetadata()
      metadata.trash = {
        ...metadata.trash,
        lastPurgedAt: new Date().toISOString(),
        lastPurgedSlugs: purgedSlugs,
      }
      await writeMetadata(metadata)
    }

    return {
      ok: true as const,
      deletedCount: purgedSlugs.length,
      deletedIds: [...docIdsToDelete],
    }
  })
  if (result.deletedCount > 0) {
    await syncDriveSearchIndexSafe()
  }
  return result
}

function countNodesFallback(source: string): number {
  const re = /data-marble-id\s*=\s*(?:"[^"]*"|'[^']*')/g
  let count = 0
  while (re.exec(source)) count += 1
  return count
}

async function collectUsedSlugs(
  excludeFullPath?: string,
): Promise<Set<string>> {
  const used = new Set<string>()
  const { files } = await scanDriveTree()
  for (const file of files) {
    if (excludeFullPath && file.fullPath === excludeFullPath) continue
    used.add(file.slug)
  }
  try {
    const trashNames = await readdir(getTrashDir())
    for (const fileName of trashNames) {
      if (!fileName.endsWith('.mrbl')) continue
      const slug = fileName.slice(0, -'.mrbl'.length)
      if (SLUG_PATTERN.test(slug) && !slug.includes('..')) {
        used.add(slug)
      }
    }
  } catch (error) {
    if (!isEnoent(error)) throw error
  }
  return used
}

function dedupeValidSlug(validSlug: string, used: Set<string>): string {
  if (!used.has(validSlug)) return validSlug
  let candidate = validSlug
  let suffix = 2
  while (used.has(candidate)) {
    const suffixStr = `-${suffix}`
    const trimmedBase = validSlug.slice(0, Math.max(1, 128 - suffixStr.length))
    candidate = `${trimmedBase}${suffixStr}`
    suffix += 1
  }
  return candidate
}

function dedupeSlug(base: string, used: Set<string>): string {
  return dedupeValidSlug(slugifyTitle(base), used)
}

function collectUsedFolderIds(
  metadata: DriveMetadataFile,
  extraIds?: Iterable<string>,
): Set<string> {
  const used = new Set<string>()
  for (const entry of Object.values(metadata.folders)) {
    if (entry?.id) used.add(entry.id)
  }
  if (extraIds) {
    for (const id of extraIds) {
      if (id) used.add(id)
    }
  }
  return used
}

function mintUnusedFolderId(
  metadata: DriveMetadataFile,
  preferredId?: string,
  extraIds?: Iterable<string>,
): string {
  const used = collectUsedFolderIds(metadata, extraIds)
  const candidate = preferredId?.trim()
  if (candidate && !used.has(candidate)) {
    return candidate
  }
  let minted = `folder-${randomBytes(6).toString('hex')}`
  while (used.has(minted)) {
    minted = `folder-${randomBytes(6).toString('hex')}`
  }
  return minted
}

function ensureTemplatesFolderMeta(
  metadata: DriveMetadataFile,
  now: string,
  preferredId?: string,
): StoredFolderMeta {
  const existing = metadata.folders[TEMPLATES_FOLDER_NAME]
  if (existing) return existing
  const created: StoredFolderMeta = {
    id: mintUnusedFolderId(metadata, preferredId ?? TEMPLATES_FOLDER_ID),
    color: 'accent',
    createdAt: now,
    updatedAt: now,
  }
  metadata.folders[TEMPLATES_FOLDER_NAME] = created
  return created
}

async function collectExistingDocIds(
  metadata: DriveMetadataFile,
): Promise<Set<string>> {
  const ids = new Set<string>()
  for (const entry of Object.values(metadata.documents)) {
    if (entry?.id) ids.add(entry.id)
  }
  try {
    const trashNames = await readdir(getTrashDir())
    for (const fileName of trashNames) {
      if (!fileName.endsWith('.mrbl')) continue
      const slug = fileName.slice(0, -'.mrbl'.length)
      if (!SLUG_PATTERN.test(slug) || slug.includes('..')) continue
      const trashMeta = await readTrashMeta(slug)
      if (trashMeta?.docId) ids.add(trashMeta.docId)
      if (trashMeta?.meta?.id) ids.add(trashMeta.meta.id)
    }
  } catch (error) {
    if (!isEnoent(error)) throw error
  }
  return ids
}

export async function seedPremadeTemplatesOnDisk(
  premadeTemplates: readonly MarbleDocumentFile[] = PREDEFINED_MARBLE_TEMPLATES,
): Promise<{ seededSlugs: string[]; skippedIds: string[] }> {
  const result = await withDriveLock(async () => {
    const metadata = await readMetadata()
    const seededSet = new Set(metadata.templates.seededIds)
    const unseeded = premadeTemplates.filter((tpl) => !seededSet.has(tpl.id))

    if (unseeded.length === 0) {
      return {
        seededSlugs: [] as string[],
        skippedIds: premadeTemplates.map((tpl) => tpl.id),
      }
    }

    const templatesDir = resolveDriveDirPath(TEMPLATES_FOLDER_NAME)
    await mkdir(templatesDir.fullPath, { recursive: true })
    const now = new Date().toISOString()
    ensureTemplatesFolderMeta(metadata, now)

    const [existingDocIds, usedSlugs] = await Promise.all([
      collectExistingDocIds(metadata),
      collectUsedSlugs(),
    ])
    const seededSlugs: string[] = []
    const skippedIds: string[] = premadeTemplates
      .filter((tpl) => seededSet.has(tpl.id))
      .map((tpl) => tpl.id)

    for (const tpl of unseeded) {
      const desiredSlug = assertSlug(tpl.slug)
      const defaultTarget = resolveDocumentLocation(
        desiredSlug,
        TEMPLATES_FOLDER_NAME,
      )
      const [existsInTemplates, knownById] = await Promise.all([
        pathExists(defaultTarget.fullPath),
        Promise.resolve(existingDocIds.has(tpl.id)),
      ])

      if (!existsInTemplates && !knownById) {
        const chosenSlug = dedupeValidSlug(desiredSlug, usedSlugs)
        const target = resolveDocumentLocation(
          chosenSlug,
          TEMPLATES_FOLDER_NAME,
        )
        await writeAtomicText(target.fullPath, tpl.source)
        const baseShare =
          sanitizeShareConfig(tpl.share, chosenSlug) ??
          defaultShareConfig(chosenSlug)
        metadata.documents[target.relPath] = {
          id: tpl.id,
          slug: chosenSlug,
          title: tpl.title,
          description: tpl.description,
          category: tpl.category,
          isEvergreen: false,
          version: 1,
          createdAt: tpl.createdAt || now,
          updatedAt: tpl.updatedAt || now,
          createdBy: tpl.createdBy,
          lastEditedBy: tpl.lastEditedBy,
          starred: false,
          pinned: false,
          tags: [...tpl.tags],
          share:
            chosenSlug !== desiredSlug
              ? {
                  ...baseShare,
                  publicLinkUrl: `https://xdrive.app/d/${chosenSlug}`,
                }
              : baseShare,
        }
        usedSlugs.add(chosenSlug)
        existingDocIds.add(tpl.id)
        seededSlugs.push(chosenSlug)
      } else {
        skippedIds.push(tpl.id)
      }
      seededSet.add(tpl.id)
    }

    metadata.templates = {
      seededIds: Array.from(seededSet),
      seededAt: now,
    }
    await writeMetadata(metadata)

    return { seededSlugs, skippedIds }
  })
  if (result.seededSlugs.length > 0) {
    await syncDriveSearchIndexSafe()
  }
  return result
}

export async function listTemplatesOnDisk(
  nodeCountOf: (source: string) => number,
): Promise<MarbleDocumentFile[]> {
  const workspace = await loadDriveWorkspace(nodeCountOf)
  return workspace.docs.filter((doc) => !doc.trashedAt && doc.isTemplate)
}

export async function saveAsTemplateOnDisk(input: {
  sourceSlug?: string
  sourceFolderPath?: string | null
  source?: string
  title: string
  description?: string
  category?: MarbleAppCategory
  tags?: string[]
  id?: string
  folderId?: string
  slug?: string
  createdBy?: MarbleDocumentFile['createdBy']
  nodeCountOf?: (source: string) => number
}): Promise<{ ok: true; folder: DriveFolder; doc: MarbleDocumentFile }> {
  return await withDriveMutation(async () => {
    const cleanTitle = input.title.trim()
    if (!cleanTitle) {
      fail(400, 'title is required')
    }

    const metadata = await readMetadata()
    let sourceMeta: StoredDocumentMeta | undefined
    let rawSource = typeof input.source === 'string' ? input.source : ''

    if (input.sourceSlug) {
      const validSourceSlug = assertSlug(input.sourceSlug)
      const located = await findDocumentBySlug(
        validSourceSlug,
        input.sourceFolderPath,
      )
      if (located) {
        sourceMeta = metadata.documents[located.relPath]
        if (!rawSource) {
          rawSource = await readFile(located.fullPath, 'utf8')
        }
      } else if (!rawSource) {
        fail(404, `No marble document for slug "${validSourceSlug}"`)
      }
    }

    if (!rawSource.trim()) {
      fail(400, 'source or sourceSlug is required')
    }

    const templatesDir = resolveDriveDirPath(TEMPLATES_FOLDER_NAME)
    await mkdir(templatesDir.fullPath, { recursive: true })
    const now = new Date().toISOString()
    const folderMeta = ensureTemplatesFolderMeta(metadata, now, input.folderId)

    const usedSlugs = await collectUsedSlugs()
    const desiredSlug = input.slug?.trim()
      ? slugifyTitle(input.slug.trim(), 'template')
      : slugifyTitle(cleanTitle, 'template')
    const uniqueSlug = dedupeSlug(desiredSlug, usedSlugs)
    const target = resolveDocumentLocation(uniqueSlug, TEMPLATES_FOLDER_NAME)
    const nextSource = updateMarbleSourceTitle(rawSource, cleanTitle)

    await writeAtomicText(target.fullPath, nextSource)

    const tplId = input.id?.trim() || `tpl-${randomBytes(6).toString('hex')}`
    const category =
      sanitizeCategory(input.category) ??
      sourceMeta?.category ??
      inferCategory(nextSource, uniqueSlug)
    const description =
      typeof input.description === 'string'
        ? input.description.trim()
        : (sourceMeta?.description ?? '')
    const tags = Array.isArray(input.tags)
      ? input.tags.filter((item): item is string => typeof item === 'string')
      : sourceMeta?.tags
        ? [...sourceMeta.tags]
        : [category]
    const author = sanitizeAuthor(input.createdBy) ?? {
      name: 'You',
      initials: 'YO',
    }
    const share = defaultShareConfig(uniqueSlug)

    metadata.documents[target.relPath] = {
      id: tplId,
      slug: uniqueSlug,
      title: cleanTitle,
      description,
      category,
      isEvergreen: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: author,
      lastEditedBy: author,
      starred: false,
      pinned: false,
      tags,
      share,
    }
    await writeMetadata(metadata)

    const folder: DriveFolder = {
      id: folderMeta.id,
      name: TEMPLATES_FOLDER_NAME,
      parentId: null,
      color: sanitizeColor(folderMeta.color),
      isTemplatesFolder: true,
      createdAt: folderMeta.createdAt,
      updatedAt: folderMeta.updatedAt,
    }

    const doc: MarbleDocumentFile = {
      id: tplId,
      slug: uniqueSlug,
      fileName: target.fileName,
      title: cleanTitle,
      description,
      category,
      isTemplate: true,
      isEvergreen: false,
      source: nextSource,
      nodeCount: (input.nodeCountOf ?? countNodesFallback)(nextSource),
      byteSize: byteSizeOf(nextSource),
      version: 1,
      syncState: 'saved',
      createdAt: now,
      updatedAt: now,
      createdBy: author,
      lastEditedBy: author,
      starred: false,
      pinned: false,
      tags,
      folder: TEMPLATES_FOLDER_NAME,
      folderId: folder.id,
      trashedAt: null,
      share,
      checkpoints: [],
      intentHistory: [],
    }

    return { ok: true, folder, doc }
  })
}

export async function renameDocumentOnDisk(input: {
  slug: string
  folderPath?: string | null
  title: string
  description?: string
  nextSlug?: string
}): Promise<{
  ok: true
  id: string
  oldSlug: string
  slug: string
  fileName: string
  folderPath: string
  relPath: string
  isTemplate: boolean
  title: string
  description: string
  source: string
  updatedAt: string
}> {
  return await withDriveMutation(async () => {
    const validSlug = assertSlug(input.slug)
    const cleanTitle = input.title.trim()
    if (!cleanTitle) {
      fail(400, 'title is required')
    }

    const located = await findDocumentBySlug(validSlug, input.folderPath)
    if (!located) {
      fail(404, `No marble document for slug "${validSlug}"`)
    }

    const rawSource = await readFile(located.fullPath, 'utf8')
    const nextSource = updateMarbleSourceTitle(rawSource, cleanTitle)
    const metadata = await readMetadata()
    const prevMeta = metadata.documents[located.relPath] ?? {}
    const docId = prevMeta.id ?? deterministicId('doc', located.relPath)

    const isEvergreen =
      Boolean(prevMeta.isEvergreen) ||
      located.slug === DOCUMENT_DESIGN_SYSTEM_SLUG ||
      located.slug === DOCUMENT_DONTS_SYSTEM_SLUG

    let targetSlug = located.slug
    if (!isEvergreen) {
      const usedSlugs = await collectUsedSlugs(located.fullPath)
      const desired = input.nextSlug?.trim()
        ? slugifyTitle(input.nextSlug.trim(), located.slug)
        : slugifyTitle(cleanTitle, located.slug)
      targetSlug = dedupeSlug(desired, usedSlugs)
    }

    const targetLoc = resolveDocumentLocation(targetSlug, located.folderPath)
    await writeAtomicText(targetLoc.fullPath, nextSource)
    if (targetLoc.fullPath !== located.fullPath) {
      await rm(located.fullPath, { force: true })
      delete metadata.documents[located.relPath]
    }

    const now = new Date().toISOString()
    const nextDescription =
      typeof input.description === 'string'
        ? input.description.trim()
        : (prevMeta.description ?? '')

    metadata.documents[targetLoc.relPath] = {
      ...prevMeta,
      id: docId,
      slug: targetSlug,
      title: cleanTitle,
      description: nextDescription,
      updatedAt: now,
    }
    await writeMetadata(metadata)

    return {
      ok: true,
      id: docId,
      oldSlug: located.slug,
      slug: targetSlug,
      fileName: targetLoc.fileName,
      folderPath: targetLoc.folderPath,
      relPath: targetLoc.relPath,
      isTemplate: isTemplatesFolderPath(targetLoc.folderPath),
      title: cleanTitle,
      description: nextDescription,
      source: nextSource,
      updatedAt: now,
    }
  })
}

export async function loadDriveWorkspace(
  nodeCountOf: (source: string) => number,
  retentionDays?: number,
): Promise<{
  folders: DriveFolder[]
  docs: MarbleDocumentFile[]
  purged: string[]
  settings: DriveSettings
  trash: DriveTrashState
}> {
  const settings = await readDriveSettingsOnDisk()
  const effectiveRetention =
    retentionDays !== undefined &&
    Number.isFinite(retentionDays) &&
    retentionDays > 0
      ? retentionDays
      : settings.trashRetentionDays

  const purged = await purgeExpiredTrashOnDisk(effectiveRetention)
  await seedPremadeTemplatesOnDisk()
  const { meta: metadata, migrated } = await readMetadataWithMigration()
  const { directories, files } = await scanDriveTree()

  const folderByPath = new Map<string, DriveFolder>()
  const folders: DriveFolder[] = []
  const usedFolderIds = collectUsedFolderIds(metadata)
  let metaDirty = migrated

  for (const dir of directories) {
    const info = await stat(dir.fullPath)
    const stored = metadata.folders[dir.relPath]
    const rawParent = path.posix.dirname(dir.relPath)
    const parentPath = rawParent === '.' ? '' : rawParent
    const parent = parentPath ? folderByPath.get(parentPath) : undefined
    const name = path.posix.basename(dir.relPath)
    const createdAt = stored?.createdAt ?? info.birthtime.toISOString()
    const updatedAt = stored?.updatedAt ?? info.mtime.toISOString()
    const id = stored?.id
      ? stored.id
      : mintUnusedFolderId(
          metadata,
          deterministicId('folder', dir.relPath),
          usedFolderIds,
        )
    usedFolderIds.add(id)
    const color = sanitizeColor(stored?.color)
    if (!stored) {
      metadata.folders[dir.relPath] = { id, color, createdAt, updatedAt }
      metaDirty = true
    }
    const folder: DriveFolder = {
      id,
      name,
      parentId: parent ? parent.id : null,
      color,
      isTemplatesFolder: isTemplatesRootPath(dir.relPath),
      createdAt,
      updatedAt,
    }
    folderByPath.set(dir.relPath, folder)
    folders.push(folder)
  }

  const activeRelPaths = new Set(files.map((item) => item.relPath))
  const defaultAuthor = { name: 'You', initials: 'YO' }

  const activeDocs: MarbleDocumentFile[] = await Promise.all(
    files.map(async (file) => {
      const [source, info] = await Promise.all([
        readFile(file.fullPath, 'utf8'),
        stat(file.fullPath),
      ])

      let stored = metadata.documents[file.relPath]
      if (!stored) {
        // Recover metadata if the user manually moved the .mrbl file between folders on disk.
        const movedKey = Object.keys(metadata.documents).find(
          (key) =>
            !activeRelPaths.has(key) &&
            metadata.documents[key]?.slug === file.slug,
        )
        if (movedKey) {
          stored = metadata.documents[movedKey]
          delete metadata.documents[movedKey]
          metadata.documents[file.relPath] = stored
          metaDirty = true
        }
      }

      const folder = file.folderPath
        ? folderByPath.get(file.folderPath)
        : undefined
      const diskMtimeIso = info.mtime.toISOString()
      const updatedAt =
        stored?.updatedAt && Date.parse(stored.updatedAt) > info.mtimeMs
          ? stored.updatedAt
          : diskMtimeIso
      const createdAt = stored?.createdAt ?? info.birthtime.toISOString()
      const id = stored?.id ?? deterministicId('doc', file.relPath)
      const category = stored?.category ?? inferCategory(source, file.slug)
      const title = stored?.title ?? titleOf(source, file.slug)
      const history = await readDocumentHistory(id)

      return {
        id,
        slug: file.slug,
        fileName: file.fileName,
        title,
        description: stored?.description ?? '',
        category,
        isTemplate: isTemplatesFolderPath(file.folderPath),
        isEvergreen: stored?.isEvergreen,
        templateId: stored?.templateId,
        source,
        nodeCount: nodeCountOf(source),
        byteSize: byteSizeOf(source),
        version: stored?.version ?? 1,
        syncState: 'saved',
        createdAt,
        updatedAt,
        createdBy: stored?.createdBy ?? defaultAuthor,
        lastEditedBy: stored?.lastEditedBy ?? defaultAuthor,
        starred: stored?.starred ?? false,
        pinned: stored?.pinned ?? false,
        tags: stored?.tags ?? [],
        folder: folder ? folder.name : 'My Drive',
        folderId: folder ? folder.id : null,
        trashedAt: null,
        share: stored?.share ?? defaultShareConfig(file.slug),
        checkpoints: history.checkpoints,
        intentHistory: history.intentHistory,
      }
    }),
  )

  const trashedDocs: MarbleDocumentFile[] = []
  try {
    const trashNames = await readdir(getTrashDir())
    for (const fileName of trashNames) {
      if (!fileName.endsWith('.mrbl')) continue
      const slug = fileName.slice(0, -'.mrbl'.length)
      if (!SLUG_PATTERN.test(slug) || slug.includes('..')) continue
      const full = trashFilePath(slug)
      const [source, info, trashMeta] = await Promise.all([
        readFile(full, 'utf8'),
        stat(full),
        readTrashMeta(slug),
      ])
      const stored = trashMeta?.meta
      const origFolder = trashMeta?.originalFolderPath
        ? folderByPath.get(normalizeFolderPath(trashMeta.originalFolderPath))
        : undefined
      const trashedAt = trashMeta?.trashedAt ?? info.mtime.toISOString()
      const id = trashDocumentId(slug, trashMeta)
      const history = await readDocumentHistory(id)
      trashedDocs.push({
        id,
        slug,
        fileName,
        title: stored?.title ?? titleOf(source, slug),
        description: stored?.description ?? '',
        category: stored?.category ?? inferCategory(source, slug),
        isTemplate: isTemplatesFolderPath(trashMeta?.originalFolderPath),
        isEvergreen: stored?.isEvergreen,
        templateId: stored?.templateId,
        source,
        nodeCount: nodeCountOf(source),
        byteSize: byteSizeOf(source),
        version: stored?.version ?? 1,
        syncState: 'saved',
        createdAt: stored?.createdAt ?? info.birthtime.toISOString(),
        updatedAt: stored?.updatedAt ?? info.mtime.toISOString(),
        createdBy: stored?.createdBy ?? defaultAuthor,
        lastEditedBy: stored?.lastEditedBy ?? defaultAuthor,
        starred: stored?.starred ?? false,
        pinned: stored?.pinned ?? false,
        tags: stored?.tags ?? [],
        folder: origFolder ? origFolder.name : 'My Drive',
        folderId: origFolder ? origFolder.id : null,
        trashedAt,
        share: stored?.share ?? defaultShareConfig(slug),
        checkpoints: history.checkpoints,
        intentHistory: history.intentHistory,
      })
    }
  } catch (error) {
    if (!isEnoent(error)) throw error
  }

  if (metaDirty) {
    await withDriveLock(async () => {
      const { meta: latest } = await readMetadataWithMigration()
      for (const [key, value] of Object.entries(metadata.folders)) {
        if (!latest.folders[key]) latest.folders[key] = value
      }
      for (const [key, value] of Object.entries(metadata.documents)) {
        if (!latest.documents[key]) latest.documents[key] = value
      }
      const mergedSeededIds = Array.from(
        new Set([
          ...metadata.templates.seededIds,
          ...latest.templates.seededIds,
        ]),
      )
      latest.templates = {
        seededIds: mergedSeededIds,
        seededAt: latest.templates.seededAt ?? metadata.templates.seededAt,
      }
      latest.trash = {
        ...metadata.trash,
        ...latest.trash,
        retentionDays: effectiveRetention,
      }
      await writeMetadata(latest)
    })
  }

  activeDocs.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  trashedDocs.sort(
    (a, b) =>
      Date.parse(b.trashedAt ?? b.updatedAt) -
      Date.parse(a.trashedAt ?? a.updatedAt),
  )

  return {
    folders,
    docs: [...activeDocs, ...trashedDocs],
    purged,
    settings,
    trash: {
      ...metadata.trash,
      retentionDays: effectiveRetention,
    },
  }
}

export async function listDriveSummary(
  nodeCountOf: (source: string) => number,
  doctorHealth: (
    fileName: string,
    source: string,
  ) => {
    errors: number
    warnings: number
    findings: Array<{ level: string; line: number; message: string }>
  },
) {
  await purgeExpiredTrashOnDisk()
  const { directories, files } = await scanDriveTree()

  const documents = await Promise.all(
    files.map(async (file) => {
      const [source, info] = await Promise.all([
        readFile(file.fullPath, 'utf8'),
        stat(file.fullPath),
      ])
      const doctor = doctorHealth(file.fileName, source)
      return {
        slug: file.slug,
        fileName: file.fileName,
        folderPath: file.folderPath,
        relPath: file.relPath,
        title: titleOf(source, file.slug),
        nodeCount: nodeCountOf(source),
        byteSize: byteSizeOf(source),
        modifiedAt: info.mtime.toISOString(),
        doctor: {
          errors: doctor.errors,
          warnings: doctor.warnings,
          findings: doctor.findings,
        },
      }
    }),
  )

  documents.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1))
  return {
    folders: directories.map((d) => d.relPath),
    documents,
  }
}
