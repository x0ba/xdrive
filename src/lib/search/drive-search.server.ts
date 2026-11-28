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

import {
  CHAT_ID_PATTERN,
  getChatsDir,
  sanitizeDriveChatThread,
} from '#/lib/ai/chat-storage.server'
import type { DriveChatThread } from '#/lib/ai/drive-chat-types'
import {
  SLUG_PATTERN,
  TEMPLATES_FOLDER_NAME,
  getDriveDir,
  getMetaDir,
  getTrashDir,
  inferCategory,
  isEnoent,
  isTemplatesFolderPath,
  normalizeFolderPath,
  readTrashMeta,
  titleOf,
  trashFilePath,
  trashMetaFilePath,
} from '#/lib/marble/drive-storage.server'
import { chatThreadHref, docHref, folderHref } from '#/lib/routing'
import type { MarbleAppCategory } from '#/lib/types'
import { extractChatMessagesText, extractMarbleDocumentText } from './extract'
import { DriveSearchIndex, resolveMarbleSearchType } from './index-engine'
import { SEARCH_ITEM_TYPES } from './types'
import type {
  IndexableItem,
  SearchDriveOptions,
  SearchDriveResponse,
  SearchItemType,
} from './types'

const CACHE_VERSION = 1
const CACHE_FILE_NAME = 'index.v1.json'
const VALID_ITEM_TYPES = new Set<string>(SEARCH_ITEM_TYPES)

interface FileStamp {
  mtimeMs: number
  size: number
  ino: number
}

interface PersistedSearchCache {
  version: 1
  updatedAt: string
  manifest: Record<string, FileStamp>
  entries: IndexableItem[]
}

interface DriveSearchState {
  index: DriveSearchIndex
  manifest: Record<string, FileStamp>
  updatedAt: string
}

interface StoredMetaDocEntry {
  id?: string
  slug?: string
  title?: string
  description?: string
  category?: MarbleAppCategory
  createdAt?: string
  updatedAt?: string
  starred?: boolean
  pinned?: boolean
  tags?: string[]
}

interface StoredMetaFolderEntry {
  id?: string
  createdAt?: string
  updatedAt?: string
}

interface ParsedDriveMetadata {
  folders: Partial<Record<string, StoredMetaFolderEntry>>
  documents: Partial<Record<string, StoredMetaDocEntry>>
}

interface VisibleDirEntry {
  relPath: string
  fullPath: string
  stamp: FileStamp
  mtimeIso: string
}

interface VisibleFileEntry {
  slug: string
  fileName: string
  folderPath: string
  relPath: string
  fullPath: string
  stamp: FileStamp
  mtimeIso: string
}

const stateByDriveDir = new Map<string, DriveSearchState>()
let searchLock: Promise<void> = Promise.resolve()

async function withSearchLock<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const previous = searchLock
  searchLock = previous.then(() => gate)
  await previous
  try {
    return await fn()
  } finally {
    release()
  }
}

export function getSearchIndexDir(): string {
  return path.resolve(getDriveDir(), '.search')
}

export function getSearchIndexFilePath(): string {
  return path.resolve(getSearchIndexDir(), CACHE_FILE_NAME)
}

/**
 * Clear in-memory search index cache (useful in tests or after manual disk swaps).
 */
export function resetDriveSearchCache(): void {
  stateByDriveDir.clear()
}

function deterministicId(prefix: string, key: string): string {
  const digest = createHash('sha256').update(key).digest('hex').slice(0, 12)
  return `${prefix}-${digest}`
}

function toFileStamp(info: {
  mtimeMs: number
  size: number
  ino: number
}): FileStamp {
  return {
    mtimeMs: Math.round(info.mtimeMs * 1000) / 1000,
    size: info.size,
    ino: Number.isFinite(info.ino) ? info.ino : 0,
  }
}

function stampsEqual(
  a: FileStamp | undefined,
  b: FileStamp | undefined,
): boolean {
  if (!a || !b) return false
  return a.mtimeMs === b.mtimeMs && a.size === b.size && a.ino === b.ino
}

function manifestsEqual(
  a: Record<string, FileStamp>,
  b: Record<string, FileStamp>,
): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (!stampsEqual(a[key], b[key])) return false
  }
  return true
}

function stringArraysEqual(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function indexableItemsEqual(a: IndexableItem, b: IndexableItem): boolean {
  if (a === b) return true
  return (
    a.key === b.key &&
    a.id === b.id &&
    a.type === b.type &&
    a.title === b.title &&
    a.href === b.href &&
    a.body === b.body &&
    a.description === b.description &&
    a.location === b.location &&
    a.path === b.path &&
    stringArraysEqual(a.tags, b.tags) &&
    a.slug === b.slug &&
    a.fileName === b.fileName &&
    a.category === b.category &&
    Boolean(a.isTemplate) === Boolean(b.isTemplate) &&
    Boolean(a.starred) === Boolean(b.starred) &&
    Boolean(a.pinned) === Boolean(b.pinned) &&
    a.trashed === b.trashed &&
    (a.trashedAt ?? null) === (b.trashedAt ?? null) &&
    a.updatedAt === b.updatedAt &&
    a.messageCount === b.messageCount
  )
}

function isValidStamp(raw: unknown): raw is FileStamp {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const rec = raw as Record<string, unknown>
  return (
    typeof rec.mtimeMs === 'number' &&
    Number.isFinite(rec.mtimeMs) &&
    typeof rec.size === 'number' &&
    Number.isFinite(rec.size) &&
    typeof rec.ino === 'number' &&
    Number.isFinite(rec.ino)
  )
}

function sanitizeIndexableItem(raw: unknown): IndexableItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  if (
    typeof rec.key !== 'string' ||
    !rec.key ||
    typeof rec.id !== 'string' ||
    !rec.id ||
    typeof rec.type !== 'string' ||
    !VALID_ITEM_TYPES.has(rec.type) ||
    typeof rec.title !== 'string' ||
    typeof rec.href !== 'string' ||
    typeof rec.body !== 'string' ||
    typeof rec.description !== 'string' ||
    typeof rec.location !== 'string' ||
    typeof rec.path !== 'string' ||
    typeof rec.trashed !== 'boolean' ||
    typeof rec.updatedAt !== 'string' ||
    !Array.isArray(rec.tags)
  ) {
    return null
  }

  return {
    key: rec.key,
    id: rec.id,
    type: rec.type as SearchItemType,
    title: rec.title,
    href: rec.href,
    body: rec.body,
    description: rec.description,
    location: rec.location,
    path: rec.path,
    tags: rec.tags.filter((t): t is string => typeof t === 'string'),
    ...(typeof rec.slug === 'string' ? { slug: rec.slug } : {}),
    ...(typeof rec.fileName === 'string' ? { fileName: rec.fileName } : {}),
    ...(typeof rec.category === 'string'
      ? { category: rec.category as MarbleAppCategory }
      : {}),
    ...(typeof rec.isTemplate === 'boolean'
      ? { isTemplate: rec.isTemplate }
      : {}),
    ...(typeof rec.starred === 'boolean' ? { starred: rec.starred } : {}),
    ...(typeof rec.pinned === 'boolean' ? { pinned: rec.pinned } : {}),
    trashed: rec.trashed,
    ...(typeof rec.trashedAt === 'string' || rec.trashedAt === null
      ? { trashedAt: rec.trashedAt }
      : {}),
    updatedAt: rec.updatedAt,
    ...(typeof rec.messageCount === 'number' &&
    Number.isFinite(rec.messageCount)
      ? { messageCount: rec.messageCount }
      : {}),
  }
}

async function loadPersistedCache(
  cacheFile: string,
): Promise<PersistedSearchCache | null> {
  try {
    const raw = await readFile(cacheFile, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    const rec = parsed as Record<string, unknown>
    if (
      rec.version !== CACHE_VERSION ||
      typeof rec.updatedAt !== 'string' ||
      !rec.manifest ||
      typeof rec.manifest !== 'object' ||
      Array.isArray(rec.manifest) ||
      !Array.isArray(rec.entries)
    ) {
      return null
    }

    const manifest: Record<string, FileStamp> = {}
    for (const [k, v] of Object.entries(
      rec.manifest as Record<string, unknown>,
    )) {
      if (!isValidStamp(v)) return null
      manifest[k] = v
    }

    const entries: IndexableItem[] = []
    for (const rawEntry of rec.entries) {
      const entry = sanitizeIndexableItem(rawEntry)
      if (!entry) return null
      entries.push(entry)
    }

    return {
      version: CACHE_VERSION,
      updatedAt: rec.updatedAt,
      manifest,
      entries,
    }
  } catch {
    return null
  }
}

async function writePersistedCacheSafe(
  cacheFile: string,
  state: DriveSearchState,
): Promise<void> {
  const payload: PersistedSearchCache = {
    version: CACHE_VERSION,
    updatedAt: state.updatedAt,
    manifest: state.manifest,
    entries: state.index.getAllEntries(),
  }
  const temporary = `${cacheFile}.${randomBytes(8).toString('hex')}.tmp`
  try {
    await mkdir(path.dirname(cacheFile), { recursive: true })
    await writeFile(temporary, JSON.stringify(payload), 'utf8')
    await rename(temporary, cacheFile)
  } catch {
    try {
      await rm(temporary, { force: true })
    } catch {
      // Ignore cleanup failures.
    }
  }
}

async function statOptional(fullPath: string): Promise<FileStamp | null> {
  try {
    const info = await stat(fullPath)
    return toFileStamp(info)
  } catch (error) {
    if (isEnoent(error)) return null
    return null
  }
}

async function readDriveMetadataSafe(
  metaFilePath: string,
): Promise<ParsedDriveMetadata> {
  try {
    const raw = await readFile(metaFilePath, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const folders: Record<string, StoredMetaFolderEntry> = {}
    const documents: Record<string, StoredMetaDocEntry> = {}

    if (
      parsed.folders &&
      typeof parsed.folders === 'object' &&
      !Array.isArray(parsed.folders)
    ) {
      for (const [k, v] of Object.entries(
        parsed.folders as Record<string, unknown>,
      )) {
        if (!v || typeof v !== 'object' || Array.isArray(v)) continue
        const rec = v as Record<string, unknown>
        folders[k] = {
          ...(typeof rec.id === 'string' ? { id: rec.id.trim() } : {}),
          ...(typeof rec.createdAt === 'string'
            ? { createdAt: rec.createdAt }
            : {}),
          ...(typeof rec.updatedAt === 'string'
            ? { updatedAt: rec.updatedAt }
            : {}),
        }
      }
    }

    if (
      parsed.documents &&
      typeof parsed.documents === 'object' &&
      !Array.isArray(parsed.documents)
    ) {
      for (const [k, v] of Object.entries(
        parsed.documents as Record<string, unknown>,
      )) {
        if (!v || typeof v !== 'object' || Array.isArray(v)) continue
        const rec = v as Record<string, unknown>
        documents[k] = {
          ...(typeof rec.id === 'string' ? { id: rec.id.trim() } : {}),
          ...(typeof rec.slug === 'string' ? { slug: rec.slug.trim() } : {}),
          ...(typeof rec.title === 'string' ? { title: rec.title } : {}),
          ...(typeof rec.description === 'string'
            ? { description: rec.description }
            : {}),
          ...(typeof rec.category === 'string'
            ? { category: rec.category as MarbleAppCategory }
            : {}),
          ...(typeof rec.createdAt === 'string'
            ? { createdAt: rec.createdAt }
            : {}),
          ...(typeof rec.updatedAt === 'string'
            ? { updatedAt: rec.updatedAt }
            : {}),
          ...(typeof rec.starred === 'boolean' ? { starred: rec.starred } : {}),
          ...(typeof rec.pinned === 'boolean' ? { pinned: rec.pinned } : {}),
          ...(Array.isArray(rec.tags)
            ? {
                tags: rec.tags.filter(
                  (t): t is string => typeof t === 'string',
                ),
              }
            : {}),
        }
      }
    }

    return { folders, documents }
  } catch {
    return { folders: {}, documents: {} }
  }
}

async function scanVisibleDriveTree(driveDir: string): Promise<{
  directories: VisibleDirEntry[]
  files: VisibleFileEntry[]
}> {
  const directories: VisibleDirEntry[] = []
  const files: VisibleFileEntry[] = []

  async function walk(currentFull: string, currentRel: string): Promise<void> {
    let entries
    try {
      entries = await readdir(currentFull, { withFileTypes: true })
    } catch (error) {
      if (isEnoent(error)) return
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      // Strictly skip all hidden / dot-prefixed entries (.xdrive, .trash, .search, .history, .backup, .git, etc.)
      if (entry.name.startsWith('.')) continue
      const entryFull = path.resolve(currentFull, entry.name)
      if (!entryFull.startsWith(`${driveDir}${path.sep}`)) continue
      const entryRel = currentRel ? `${currentRel}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        try {
          const info = await stat(entryFull)
          directories.push({
            relPath: entryRel,
            fullPath: entryFull,
            stamp: toFileStamp(info),
            mtimeIso: info.mtime.toISOString(),
          })
          await walk(entryFull, entryRel)
        } catch {
          // Ignore disappeared directories mid-scan.
        }
      } else if (entry.isFile() && entry.name.endsWith('.mrbl')) {
        const slug = entry.name.slice(0, -'.mrbl'.length)
        if (!SLUG_PATTERN.test(slug) || slug.includes('..')) continue
        try {
          const info = await stat(entryFull)
          files.push({
            slug,
            fileName: entry.name,
            folderPath: currentRel,
            relPath: entryRel,
            fullPath: entryFull,
            stamp: toFileStamp(info),
            mtimeIso: info.mtime.toISOString(),
          })
        } catch {
          // Ignore disappeared files mid-scan.
        }
      }
    }
  }

  await walk(driveDir, '')
  return { directories, files }
}

function buildFolderMaps(
  directories: readonly VisibleDirEntry[],
  meta: ParsedDriveMetadata,
  prevByEntryKey?: ReadonlyMap<string, IndexableItem>,
): {
  folderItems: IndexableItem[]
  locationByRelPath: Map<string, string>
} {
  const usedFolderIds = new Set<string>()
  for (const stored of Object.values(meta.folders)) {
    if (stored?.id) usedFolderIds.add(stored.id)
  }

  const locationByRelPath = new Map<string, string>()
  const folderItems: IndexableItem[] = []

  for (const dir of directories) {
    const stored = meta.folders[dir.relPath]
    let id = stored?.id?.trim() || deterministicId('folder', dir.relPath)
    if (!stored?.id && usedFolderIds.has(id)) {
      id = deterministicId('folder', `${dir.relPath}:${usedFolderIds.size}`)
    }
    usedFolderIds.add(id)

    const name = path.posix.basename(dir.relPath)
    const rawParent = path.posix.dirname(dir.relPath)
    const parentRel = rawParent === '.' ? '' : rawParent
    const parentLocation = parentRel
      ? (locationByRelPath.get(parentRel) ?? parentRel.split('/').join(' / '))
      : 'My Drive'
    const displayPath = dir.relPath.split('/').join(' / ')
    locationByRelPath.set(dir.relPath, displayPath)

    const candidate: IndexableItem = {
      key: `folder:${id}`,
      id,
      type: 'folder',
      title: name,
      href: folderHref({ id, name }),
      body: '',
      description: '',
      location: parentLocation,
      path: dir.relPath,
      tags: [],
      trashed: false,
      updatedAt: stored?.updatedAt ?? dir.mtimeIso,
    }
    const prev = prevByEntryKey?.get(candidate.key)
    folderItems.push(
      prev && indexableItemsEqual(prev, candidate) ? prev : candidate,
    )
  }

  return { folderItems, locationByRelPath }
}

function resolveDocUpdatedAt(
  storedUpdatedAt: string | undefined,
  fileStamp: FileStamp,
  mtimeIso: string,
): string {
  if (storedUpdatedAt && Date.parse(storedUpdatedAt) > fileStamp.mtimeMs) {
    return storedUpdatedAt
  }
  return mtimeIso
}

function chatThreadToIndexableItem(thread: DriveChatThread): IndexableItem {
  return {
    key: `chat:${thread.id}`,
    id: thread.id,
    type: 'chat',
    title: thread.title,
    href: chatThreadHref(thread.id),
    body: extractChatMessagesText(thread.messages),
    description: '',
    location: 'Drive Chat',
    path: `Drive Chat/${thread.title}`,
    tags: [],
    pinned: Boolean(thread.pinned),
    trashed: false,
    updatedAt: thread.updatedAt,
    messageCount: thread.messages.length,
  }
}

async function syncIndexWithDisk(options?: {
  forceRebuild?: boolean
}): Promise<DriveSearchState> {
  const driveDir = getDriveDir()
  const cacheFile = getSearchIndexFilePath()
  let state = options?.forceRebuild ? undefined : stateByDriveDir.get(driveDir)

  if (!state && !options?.forceRebuild) {
    const persisted = await loadPersistedCache(cacheFile)
    if (persisted) {
      const index = new DriveSearchIndex()
      for (const entry of persisted.entries) {
        index.upsert(entry)
      }
      state = {
        index,
        manifest: persisted.manifest,
        updatedAt: persisted.updatedAt,
      }
    }
  }

  const prevManifest = state?.manifest ?? {}
  const prevByManifestKey = new Map<string, IndexableItem>()
  const prevByEntryKey = new Map<string, IndexableItem>()
  if (state) {
    for (const entry of state.index.getAllEntries()) {
      prevByEntryKey.set(entry.key, entry)
      if (entry.type === 'chat') {
        prevByManifestKey.set(`chat:${entry.id}.json`, entry)
      } else if (entry.type === 'folder') {
        prevByManifestKey.set(`folder:${entry.path}`, entry)
      } else if (entry.trashed && entry.slug) {
        prevByManifestKey.set(`trash:${entry.slug}.mrbl`, entry)
      } else if (!entry.trashed) {
        prevByManifestKey.set(`doc:${entry.path}`, entry)
      }
    }
  }

  const nextManifest: Record<string, FileStamp> = {}
  const nextEntries: IndexableItem[] = []

  const metaFilePath = path.resolve(getMetaDir(), 'metadata.json')
  const metaStamp = await statOptional(metaFilePath)
  if (metaStamp) {
    nextManifest['meta:.xdrive/metadata.json'] = metaStamp
  }
  const metaChanged = !stampsEqual(
    metaStamp ?? undefined,
    prevManifest['meta:.xdrive/metadata.json'],
  )

  const [{ directories, files }, metadata] = await Promise.all([
    scanVisibleDriveTree(driveDir),
    readDriveMetadataSafe(metaFilePath),
  ])

  // 1. Folders
  const { folderItems, locationByRelPath } = buildFolderMaps(
    directories,
    metadata,
    prevByEntryKey,
  )
  for (const dir of directories) {
    nextManifest[`folder:${dir.relPath}`] = dir.stamp
  }
  nextEntries.push(...folderItems)

  // 2. Active .mrbl documents & whiteboards
  const activeRelPaths = new Set(files.map((f) => f.relPath))
  for (const file of files) {
    const manifestKey = `doc:${file.relPath}`
    nextManifest[manifestKey] = file.stamp

    let stored = metadata.documents[file.relPath]
    if (!stored) {
      const movedKey = Object.keys(metadata.documents).find(
        (key) =>
          !activeRelPaths.has(key) &&
          metadata.documents[key]?.slug === file.slug,
      )
      if (movedKey) {
        stored = metadata.documents[movedKey]
      }
    }

    const cached = prevByManifestKey.get(manifestKey)
    const fileUnchanged =
      !options?.forceRebuild &&
      cached &&
      stampsEqual(file.stamp, prevManifest[manifestKey])

    const location = file.folderPath
      ? (locationByRelPath.get(file.folderPath) ??
        file.folderPath.split('/').join(' / '))
      : 'My Drive'

    if (fileUnchanged) {
      if (!metaChanged && cached.location === location) {
        nextEntries.push(cached)
        continue
      }
      const id = stored?.id ?? cached.id
      const title = stored?.title ?? cached.title
      const category = stored?.category ?? cached.category ?? 'document'
      const type: SearchItemType =
        cached.type === 'whiteboard' || category === 'whiteboard'
          ? 'whiteboard'
          : 'document'
      nextEntries.push({
        ...cached,
        key: `${type}:${id}`,
        id,
        type,
        title,
        href: docHref({ id, slug: file.slug, title }),
        description: stored?.description ?? cached.description,
        location,
        path: file.relPath,
        tags: stored?.tags ?? cached.tags,
        category,
        isTemplate: isTemplatesFolderPath(file.folderPath),
        starred: stored?.starred ?? cached.starred,
        pinned: stored?.pinned ?? cached.pinned,
        updatedAt: resolveDocUpdatedAt(
          stored?.updatedAt,
          file.stamp,
          file.mtimeIso,
        ),
      })
      continue
    }

    let source = ''
    try {
      source = await readFile(file.fullPath, 'utf8')
    } catch {
      continue
    }

    const id = stored?.id ?? deterministicId('doc', file.relPath)
    const title = stored?.title ?? titleOf(source, file.slug)
    const category = stored?.category ?? inferCategory(source, file.slug)
    const type = resolveMarbleSearchType(category, source)

    nextEntries.push({
      key: `${type}:${id}`,
      id,
      type,
      title,
      href: docHref({ id, slug: file.slug, title }),
      body: extractMarbleDocumentText(source),
      description: stored?.description ?? '',
      location,
      path: file.relPath,
      tags: stored?.tags ?? [],
      slug: file.slug,
      fileName: file.fileName,
      category,
      isTemplate: isTemplatesFolderPath(file.folderPath),
      starred: stored?.starred ?? false,
      pinned: stored?.pinned ?? false,
      trashed: false,
      trashedAt: null,
      updatedAt: resolveDocUpdatedAt(
        stored?.updatedAt,
        file.stamp,
        file.mtimeIso,
      ),
    })
  }

  // 3. Trashed .mrbl documents & whiteboards in .trash/
  const trashDir = getTrashDir()
  let trashNames: string[] = []
  try {
    trashNames = await readdir(trashDir)
  } catch (error) {
    if (!isEnoent(error)) trashNames = []
  }
  trashNames.sort((a, b) => a.localeCompare(b))

  for (const fileName of trashNames) {
    if (!fileName.endsWith('.mrbl')) continue
    const slug = fileName.slice(0, -'.mrbl'.length)
    if (!SLUG_PATTERN.test(slug) || slug.includes('..')) continue

    const full = trashFilePath(slug)
    const fileStamp = await statOptional(full)
    if (!fileStamp) continue

    const metaFull = trashMetaFilePath(slug)
    const trashMetaStamp = await statOptional(metaFull)

    const fileManifestKey = `trash:${slug}.mrbl`
    const metaManifestKey = `trashmeta:${slug}.meta.json`
    nextManifest[fileManifestKey] = fileStamp
    if (trashMetaStamp) {
      nextManifest[metaManifestKey] = trashMetaStamp
    }

    const cached = prevByManifestKey.get(fileManifestKey)
    const fileUnchanged =
      !options?.forceRebuild &&
      cached &&
      stampsEqual(fileStamp, prevManifest[fileManifestKey])
    const trashMetaUnchanged = stampsEqual(
      trashMetaStamp ?? undefined,
      prevManifest[metaManifestKey],
    )

    if (fileUnchanged && trashMetaUnchanged) {
      nextEntries.push(cached)
      continue
    }

    const trashMeta = await readTrashMeta(slug)
    const stored = trashMeta?.meta
    const origNorm = trashMeta?.originalFolderPath
      ? normalizeFolderPath(trashMeta.originalFolderPath)
      : ''
    const origLocation = origNorm
      ? origNorm === TEMPLATES_FOLDER_NAME
        ? TEMPLATES_FOLDER_NAME
        : origNorm.split('/').join(' / ')
      : 'My Drive'
    const trashedAt =
      trashMeta?.trashedAt ?? new Date(fileStamp.mtimeMs).toISOString()

    if (fileUnchanged) {
      const id =
        stored?.id?.trim() ||
        trashMeta?.docId?.trim() ||
        cached.id ||
        deterministicId('doc', `trash/${slug}`)
      const title = stored?.title ?? cached.title
      const category = stored?.category ?? cached.category ?? 'document'
      const type: SearchItemType =
        cached.type === 'whiteboard' || category === 'whiteboard'
          ? 'whiteboard'
          : 'document'
      nextEntries.push({
        ...cached,
        key: `${type}:${id}`,
        id,
        type,
        title,
        href: docHref({ id, slug, title }),
        description: stored?.description ?? cached.description,
        location: origLocation,
        tags: stored?.tags ?? cached.tags,
        category,
        isTemplate: isTemplatesFolderPath(origNorm),
        starred: stored?.starred ?? cached.starred,
        pinned: stored?.pinned ?? cached.pinned,
        trashed: true,
        trashedAt,
        updatedAt: stored?.updatedAt ?? trashedAt,
      })
      continue
    }

    let source = ''
    try {
      source = await readFile(full, 'utf8')
    } catch {
      continue
    }

    const id =
      stored?.id?.trim() ||
      trashMeta?.docId?.trim() ||
      deterministicId('doc', `trash/${slug}`)
    const title = stored?.title ?? titleOf(source, slug)
    const category = stored?.category ?? inferCategory(source, slug)
    const type = resolveMarbleSearchType(category, source)

    nextEntries.push({
      key: `${type}:${id}`,
      id,
      type,
      title,
      href: docHref({ id, slug, title }),
      body: extractMarbleDocumentText(source),
      description: stored?.description ?? '',
      location: origLocation,
      path: `.trash/${fileName}`,
      tags: stored?.tags ?? [],
      slug,
      fileName,
      category,
      isTemplate: isTemplatesFolderPath(origNorm),
      starred: stored?.starred ?? false,
      pinned: stored?.pinned ?? false,
      trashed: true,
      trashedAt,
      updatedAt: stored?.updatedAt ?? trashedAt,
    })
  }

  // 4. Persisted Drive Chat threads in .xdrive/chats/
  const chatsDir = getChatsDir()
  let chatFiles: string[] = []
  try {
    chatFiles = await readdir(chatsDir)
  } catch (error) {
    if (!isEnoent(error)) chatFiles = []
  }
  chatFiles.sort((a, b) => a.localeCompare(b))

  for (const fileName of chatFiles) {
    if (!fileName.endsWith('.json') || fileName.startsWith('.')) continue
    const threadId = fileName.slice(0, -'.json'.length)
    if (!CHAT_ID_PATTERN.test(threadId) || threadId.includes('..')) continue

    const fullPath = path.resolve(chatsDir, fileName)
    if (path.dirname(fullPath) !== chatsDir) continue
    const chatStamp = await statOptional(fullPath)
    if (!chatStamp) continue

    const manifestKey = `chat:${threadId}.json`
    nextManifest[manifestKey] = chatStamp

    const cached =
      prevByManifestKey.get(manifestKey) ??
      prevByEntryKey.get(`chat:${threadId}`)
    if (
      !options?.forceRebuild &&
      cached &&
      stampsEqual(chatStamp, prevManifest[manifestKey])
    ) {
      nextEntries.push(cached)
      continue
    }

    try {
      const raw = await readFile(fullPath, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      const thread = sanitizeDriveChatThread(parsed, { forcedId: threadId })
      nextEntries.push(chatThreadToIndexableItem(thread))
    } catch {
      // Ignore corrupt or partial chat thread files gracefully.
    }
  }

  const index = state?.index ?? new DriveSearchIndex()
  const nextKeys = new Set(nextEntries.map((entry) => entry.key))
  const existingKeys = new Set(index.getAllEntries().map((entry) => entry.key))
  let mutated = Boolean(options?.forceRebuild) || !state

  for (const existingKey of existingKeys) {
    if (!nextKeys.has(existingKey)) {
      index.remove(existingKey)
      mutated = true
    }
  }

  for (const entry of nextEntries) {
    const prevEntry = prevByEntryKey.get(entry.key)
    if (!prevEntry || !indexableItemsEqual(prevEntry, entry)) {
      index.upsert(entry)
      mutated = true
    }
  }

  if (!manifestsEqual(prevManifest, nextManifest)) {
    mutated = true
  }

  const nextState: DriveSearchState = {
    index,
    manifest: nextManifest,
    updatedAt: mutated || !state ? new Date().toISOString() : state.updatedAt,
  }
  stateByDriveDir.set(driveDir, nextState)

  if (mutated) {
    await writePersistedCacheSafe(cacheFile, nextState)
  }

  return nextState
}

/**
 * Search across all Drive documents, tldraw whiteboards, folders, and chat
 * threads using the local inverted index (syncing incrementally with disk).
 */
export async function searchDrive(
  options: SearchDriveOptions,
): Promise<SearchDriveResponse> {
  const state = await withSearchLock(() => syncIndexWithDisk())
  return state.index.search(options)
}

/**
 * Force a full rebuild of the Drive search index and persist `.search/index.v1.json`.
 */
export async function rebuildDriveSearchIndex(): Promise<{
  indexedCount: number
  updatedAt: string
}> {
  const state = await withSearchLock(() =>
    syncIndexWithDisk({ forceRebuild: true }),
  )
  return {
    indexedCount: state.index.size,
    updatedAt: state.updatedAt,
  }
}

/**
 * Incrementally sync the Drive search index after a Drive mutation.
 * Never throws so indexing issues cannot break normal Drive reads/writes.
 */
export async function syncDriveSearchIndexSafe(): Promise<void> {
  try {
    await withSearchLock(() => syncIndexWithDisk())
  } catch {
    // Never let search index failures break normal Drive mutations.
  }
}

/**
 * Incrementally upsert a single Drive Chat thread into the search index.
 * Never throws so chat persistence cannot fail due to indexing.
 */
export async function upsertChatThreadInSearchIndexSafe(
  thread: DriveChatThread,
): Promise<void> {
  try {
    await withSearchLock(async () => {
      const driveDir = getDriveDir()
      const state = stateByDriveDir.get(driveDir)
      if (!state) {
        await syncIndexWithDisk()
        return
      }
      const chatsDir = getChatsDir()
      const fullPath = path.resolve(chatsDir, `${thread.id}.json`)
      const stamp = await statOptional(fullPath)
      if (stamp) {
        state.manifest[`chat:${thread.id}.json`] = stamp
      }
      state.index.upsert(chatThreadToIndexableItem(thread))
      state.updatedAt = new Date().toISOString()
      await writePersistedCacheSafe(getSearchIndexFilePath(), state)
    })
  } catch {
    // Never let search index failures break chat writes.
  }
}

/**
 * Incrementally remove a deleted Drive Chat thread from the search index.
 * Never throws so chat deletions cannot fail due to indexing.
 */
export async function removeChatThreadFromSearchIndexSafe(
  threadId: string,
): Promise<void> {
  try {
    await withSearchLock(async () => {
      const driveDir = getDriveDir()
      const state = stateByDriveDir.get(driveDir)
      if (!state) {
        await syncIndexWithDisk()
        return
      }
      delete state.manifest[`chat:${threadId}.json`]
      state.index.remove(`chat:${threadId}`)
      state.updatedAt = new Date().toISOString()
      await writePersistedCacheSafe(getSearchIndexFilePath(), state)
    })
  } catch {
    // Never let search index failures break chat deletes.
  }
}
