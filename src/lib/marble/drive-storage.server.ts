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
  DriveFolder,
  DriveFolderColor,
  MarbleAppCategory,
  MarbleDocumentFile,
  ShareConfig,
} from '../types'

export const DEFAULT_TRASH_RETENTION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
export const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

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
  'custom',
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

interface DriveMetadataFile {
  version: 1
  folders: Partial<Record<string, StoredFolderMeta>>
  documents: Partial<Record<string, StoredDocumentMeta>>
}

interface TrashMetaRecord {
  slug: string
  trashedAt: string
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

export function getTrashDir(): string {
  return path.resolve(getDriveDir(), '.trash')
}

function getMetaDir(): string {
  return path.resolve(getDriveDir(), '.xdrive')
}

function getMetaFilePath(): string {
  return path.resolve(getMetaDir(), 'metadata.json')
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

function emptyMetadata(): DriveMetadataFile {
  return { version: 1, folders: {}, documents: {} }
}

async function readMetadata(): Promise<DriveMetadataFile> {
  try {
    const raw = await readFile(getMetaFilePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<DriveMetadataFile>
    return {
      version: 1,
      folders:
        parsed.folders && typeof parsed.folders === 'object'
          ? { ...parsed.folders }
          : {},
      documents:
        parsed.documents && typeof parsed.documents === 'object'
          ? { ...parsed.documents }
          : {},
    }
  } catch (error) {
    if (isEnoent(error)) return emptyMetadata()
    return emptyMetadata()
  }
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

export function inferCategory(
  source: string,
  slug: string,
): MarbleAppCategory {
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
  if (typeof record.id === 'string' && record.id.trim()) out.id = record.id.trim()
  if (typeof record.slug === 'string' && record.slug.trim()) {
    out.slug = record.slug.trim()
  }
  if (typeof record.title === 'string') out.title = record.title
  if (typeof record.description === 'string') out.description = record.description
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
  if (record.createdBy && typeof record.createdBy === 'object') {
    out.createdBy = record.createdBy as MarbleDocumentFile['createdBy']
  }
  if (record.lastEditedBy && typeof record.lastEditedBy === 'object') {
    out.lastEditedBy = record.lastEditedBy as MarbleDocumentFile['lastEditedBy']
  }
  if (typeof record.starred === 'boolean') out.starred = record.starred
  if (typeof record.pinned === 'boolean') out.pinned = record.pinned
  if (Array.isArray(record.tags)) {
    out.tags = record.tags.filter((item): item is string => typeof item === 'string')
  }
  if (record.share && typeof record.share === 'object') {
    out.share = record.share as ShareConfig
  }
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

async function writeAtomicText(fullPath: string, content: string): Promise<void> {
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
}): Promise<DriveDocumentLocation> {
  return await withDriveLock(async () => {
    const validSlug = assertSlug(input.slug)
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
    metadata.documents[target.relPath] = {
      ...previous,
      ...patch,
      id: patch?.id ?? previous.id ?? deterministicId('doc', target.relPath),
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
    return target
  })
}

export async function updateDocumentMetaOnDisk(input: {
  slug: string
  folderPath?: string | null
  meta: unknown
}): Promise<{ ok: true; slug: string; relPath: string }> {
  return await withDriveLock(async () => {
    const validSlug = assertSlug(input.slug)
    const patch = sanitizeMetaPatch(input.meta)
    if (!patch) {
      fail(400, 'meta object is required')
    }
    const located =
      (await findDocumentBySlug(validSlug, input.folderPath)) ??
      resolveDocumentLocation(validSlug, input.folderPath ?? '')
    const metadata = await readMetadata()
    const previous = metadata.documents[located.relPath] ?? {}
    metadata.documents[located.relPath] = {
      ...previous,
      ...patch,
      id: patch.id ?? previous.id ?? deterministicId('doc', located.relPath),
      slug: validSlug,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    }
    await writeMetadata(metadata)
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
}> {
  return await withDriveLock(async () => {
    const validSlug = assertSlug(input.slug)
    const fromLoc =
      (await findDocumentBySlug(validSlug, input.fromFolderPath)) ??
      resolveDocumentLocation(validSlug, input.fromFolderPath ?? '')
    const toLoc = resolveDocumentLocation(validSlug, input.toFolderPath ?? '')

    await mkdir(path.dirname(toLoc.fullPath), { recursive: true })
    if (fromLoc.fullPath !== toLoc.fullPath) {
      if (await pathExists(fromLoc.fullPath)) {
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
  return await withDriveLock(async () => {
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
    const id = input.id?.trim() || deterministicId('folder', relPath)

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
  return await withDriveLock(async () => {
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
      id: existingMeta?.id ?? deterministicId('folder', normalizedNew),
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
  return await withDriveLock(async () => {
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
      return {
        slug: typeof parsed.slug === 'string' ? parsed.slug : slug,
        trashedAt: parsed.trashedAt,
        originalFolderPath:
          typeof parsed.originalFolderPath === 'string'
            ? parsed.originalFolderPath
            : undefined,
        meta: sanitizeMetaPatch(parsed.meta),
      }
    }
    return null
  } catch (error) {
    if (isEnoent(error)) return null
    return null
  }
}

export async function purgeExpiredTrashOnDisk(
  retentionDays = DEFAULT_TRASH_RETENTION_DAYS,
): Promise<string[]> {
  const trashDir = getTrashDir()
  let names: string[]
  try {
    names = await readdir(trashDir)
  } catch (error) {
    if (isEnoent(error)) return []
    throw error
  }

  const now = Date.now()
  const cutoffMs = retentionDays * DAY_MS
  const purged: string[] = []

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
    if (now - trashedMs >= cutoffMs) {
      await Promise.all([
        rm(full, { force: true }),
        rm(trashMetaFilePath(slug), { force: true }),
      ])
      purged.push(slug)
    }
  }

  return purged
}

export async function trashDocumentOnDisk(input: {
  slug: string
  folderPath?: string | null
  trashedAt?: string
  meta?: unknown
}): Promise<{
  ok: true
  slug: string
  trashedAt: string
  existedOnDisk: boolean
  retentionDays: number
}> {
  return await withDriveLock(async () => {
    const validSlug = assertSlug(input.slug)
    const trashedAt =
      input.trashedAt && !Number.isNaN(Date.parse(input.trashedAt))
        ? input.trashedAt
        : new Date().toISOString()
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

    const mergedMeta: StoredDocumentMeta = {
      ...existingDocMeta,
      ...sanitizeMetaPatch(input.meta),
      slug: validSlug,
    }

    if (existedOnDisk) {
      const record: TrashMetaRecord = {
        slug: validSlug,
        trashedAt,
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
      existedOnDisk,
      retentionDays: DEFAULT_TRASH_RETENTION_DAYS,
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
  return await withDriveLock(async () => {
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

    if (restoredOnDisk && trashMeta?.meta) {
      const metadata = await readMetadata()
      metadata.documents[dst.relPath] = {
        ...trashMeta.meta,
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
  return await withDriveLock(async () => {
    const validSlug = assertSlug(input.slug)
    const located = await findDocumentBySlug(validSlug, input.folderPath)
    const targets = [
      rm(trashFilePath(validSlug), { force: true }),
      rm(trashMetaFilePath(validSlug), { force: true }),
    ]
    if (located) {
      targets.push(rm(located.fullPath, { force: true }))
    }
    await Promise.all(targets)

    const metadata = await readMetadata()
    let changed = false
    if (located && metadata.documents[located.relPath]) {
      delete metadata.documents[located.relPath]
      changed = true
    }
    for (const [key, value] of Object.entries(metadata.documents)) {
      if (value?.slug === validSlug && key.endsWith(`/${validSlug}.mrbl`)) {
        const candidate = path.resolve(getDriveDir(), ...key.split('/'))
        if (!(await pathExists(candidate))) {
          delete metadata.documents[key]
          changed = true
        }
      }
    }
    if (changed) {
      await writeMetadata(metadata)
    }

    return { ok: true, slug: validSlug, deleted: true }
  })
}

export async function emptyTrashOnDisk(): Promise<{
  ok: true
  deletedCount: number
}> {
  return await withDriveLock(async () => {
    const trashDir = getTrashDir()
    let names: string[]
    try {
      names = await readdir(trashDir)
    } catch (error) {
      if (isEnoent(error)) return { ok: true, deletedCount: 0 }
      throw error
    }
    let deletedCount = 0
    for (const name of names) {
      if (!name.endsWith('.mrbl') && !name.endsWith('.meta.json')) continue
      await rm(path.resolve(trashDir, name), { force: true })
      if (name.endsWith('.mrbl')) deletedCount += 1
    }
    return { ok: true, deletedCount }
  })
}

export async function loadDriveWorkspace(
  nodeCountOf: (source: string) => number,
  retentionDays = DEFAULT_TRASH_RETENTION_DAYS,
): Promise<{
  folders: DriveFolder[]
  docs: MarbleDocumentFile[]
  purged: string[]
}> {
  const purged = await purgeExpiredTrashOnDisk(retentionDays)
  const metadata = await readMetadata()
  const { directories, files } = await scanDriveTree()

  const folderByPath = new Map<string, DriveFolder>()
  const folders: DriveFolder[] = []
  let metaDirty = false

  for (const dir of directories) {
    const info = await stat(dir.fullPath)
    const stored = metadata.folders[dir.relPath]
    const rawParent = path.posix.dirname(dir.relPath)
    const parentPath = rawParent === '.' ? '' : rawParent
    const parent = parentPath ? folderByPath.get(parentPath) : undefined
    const name = path.posix.basename(dir.relPath)
    const createdAt = stored?.createdAt ?? info.birthtime.toISOString()
    const updatedAt = stored?.updatedAt ?? info.mtime.toISOString()
    const id = stored?.id ?? deterministicId('folder', dir.relPath)
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

      return {
        id,
        slug: file.slug,
        fileName: file.fileName,
        title,
        description: stored?.description ?? '',
        category,
        isTemplate: false,
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
        checkpoints: [],
        intentHistory: [],
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
      trashedDocs.push({
        id: stored?.id ?? deterministicId('doc', `trash/${slug}`),
        slug,
        fileName,
        title: stored?.title ?? titleOf(source, slug),
        description: stored?.description ?? '',
        category: stored?.category ?? inferCategory(source, slug),
        isTemplate: false,
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
        checkpoints: [],
        intentHistory: [],
      })
    }
  } catch (error) {
    if (!isEnoent(error)) throw error
  }

  if (metaDirty) {
    await withDriveLock(async () => {
      const latest = await readMetadata()
      for (const [key, value] of Object.entries(metadata.folders)) {
        if (!latest.folders[key]) latest.folders[key] = value
      }
      for (const [key, value] of Object.entries(metadata.documents)) {
        if (!latest.documents[key]) latest.documents[key] = value
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
  }
}

export async function listDriveSummary(
  nodeCountOf: (source: string) => number,
  doctorHealth: (fileName: string, source: string) => {
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
