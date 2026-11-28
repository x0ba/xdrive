import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'

import type { MarbleAppCategory } from '#/lib/types'
import { HISTORY_DIR_NAME } from './drive-hidden'
import {
  DriveStorageError,
  SLUG_PATTERN,
  assertSlug,
  byteSizeOf,
  deterministicId,
  failIfSlugInTrash,
  findDocumentByDocIdUnlocked,
  getDriveDir,
  getTrashDir,
  inferCategory,
  isEnoent,
  readMetadata,
  readTrashMeta,
  titleOf,
  withDriveLock,
  writeAtomicText,
  writeMetadata,
} from './drive-storage.server'
import type { DriveDocumentLocation } from './drive-storage.server'
import {
  AUTO_SNAPSHOT_INTERVAL_MS,
  DEFAULT_VERSION_RETENTION_POLICY,
} from './version-history-types'
import type {
  CreateVersionResult,
  DocumentVersionDetail,
  DocumentVersionKind,
  DocumentVersionSummary,
  DocumentVersionTrigger,
  RestoreVersionResult,
  VersionRetentionPolicy,
} from './version-history-types'

const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const MAX_LABEL_LENGTH = 120

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

interface StoredVersionIndexFile {
  version: 1
  docId: string
  updatedAt: string
  versions: DocumentVersionSummary[]
}

function fail(status: number, message: string): never {
  throw new DriveStorageError(status, message)
}

function countNodesForSource(source: string): number {
  return source.match(/data-marble-id\s*=\s*(?:"[^"]*"|'[^']*')/g)?.length ?? 0
}

export function getVersionHistoryRootDir(): string {
  return path.resolve(getDriveDir(), HISTORY_DIR_NAME)
}

export function safeVersionDocKey(docId: string): string {
  const trimmed = docId.trim()
  if (SAFE_ID_PATTERN.test(trimmed) && !trimmed.includes('..')) {
    return trimmed
  }
  return `doc-${createHash('sha256')
    .update(trimmed || 'unknown')
    .digest('hex')
    .slice(0, 16)}`
}

export function getDocVersionHistoryDir(docId: string): string {
  const root = getVersionHistoryRootDir()
  const key = safeVersionDocKey(docId)
  const full = path.resolve(root, key)
  if (path.dirname(full) !== root) {
    fail(400, 'Invalid document history id')
  }
  return full
}

function docHistoryIndexPath(docId: string): string {
  return path.resolve(getDocVersionHistoryDir(docId), 'index.json')
}

function docHistorySnapshotsDir(docId: string): string {
  return path.resolve(getDocVersionHistoryDir(docId), 'snapshots')
}

function snapshotFilePath(docId: string, versionId: string): string {
  const validId = versionId.trim()
  if (!SAFE_ID_PATTERN.test(validId) || validId.includes('..')) {
    fail(400, 'Invalid versionId')
  }
  const dir = docHistorySnapshotsDir(docId)
  const full = path.resolve(dir, `${validId}.mrbl`)
  if (path.dirname(full) !== dir) {
    fail(400, 'Invalid versionId')
  }
  return full
}

export function hashVersionSource(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex')
}

function sanitizeVersionSummary(raw: unknown): DocumentVersionSummary | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  if (
    typeof rec.id !== 'string' ||
    !SAFE_ID_PATTERN.test(rec.id.trim()) ||
    rec.id.includes('..') ||
    typeof rec.docId !== 'string' ||
    !rec.docId.trim() ||
    typeof rec.createdAt !== 'string' ||
    Number.isNaN(Date.parse(rec.createdAt)) ||
    typeof rec.contentHash !== 'string' ||
    !rec.contentHash.trim()
  ) {
    return null
  }
  const kind: DocumentVersionKind = rec.kind === 'named' ? 'named' : 'auto'
  const trigger: DocumentVersionTrigger =
    rec.trigger === 'manual' || rec.trigger === 'pre-restore'
      ? rec.trigger
      : kind === 'named'
        ? 'manual'
        : 'autosave'
  const category: MarbleAppCategory =
    typeof rec.category === 'string' &&
    VALID_CATEGORIES.has(rec.category as MarbleAppCategory)
      ? (rec.category as MarbleAppCategory)
      : 'document'

  const summary: DocumentVersionSummary = {
    id: rec.id.trim(),
    docId: rec.docId.trim(),
    slug: typeof rec.slug === 'string' && rec.slug.trim() ? rec.slug : 'doc',
    title:
      typeof rec.title === 'string' && rec.title.trim()
        ? rec.title
        : 'Untitled',
    category,
    kind,
    trigger,
    createdAt: rec.createdAt,
    contentHash: rec.contentHash.trim(),
    byteSize:
      typeof rec.byteSize === 'number' && Number.isFinite(rec.byteSize)
        ? rec.byteSize
        : 0,
    nodeCount:
      typeof rec.nodeCount === 'number' && Number.isFinite(rec.nodeCount)
        ? rec.nodeCount
        : 0,
  }
  if (typeof rec.label === 'string' && rec.label.trim()) {
    summary.label = rec.label.trim()
  }
  if (typeof rec.author === 'string' && rec.author.trim()) {
    summary.author = rec.author.trim()
  }
  return summary
}

function sortVersionsNewestFirst(
  versions: readonly DocumentVersionSummary[],
): DocumentVersionSummary[] {
  return [...versions].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )
}

async function readVersionIndexUnlocked(
  docId: string,
): Promise<DocumentVersionSummary[]> {
  try {
    const raw = await readFile(docHistoryIndexPath(docId), 'utf8')
    const parsed = JSON.parse(raw) as Partial<StoredVersionIndexFile>
    if (!Array.isArray(parsed.versions)) return []
    const seen = new Set<string>()
    const cleaned: DocumentVersionSummary[] = []
    for (const item of parsed.versions) {
      const summary = sanitizeVersionSummary(item)
      if (!summary || seen.has(summary.id)) continue
      seen.add(summary.id)
      cleaned.push(summary)
    }
    return sortVersionsNewestFirst(cleaned)
  } catch (error) {
    if (isEnoent(error)) return []
    return []
  }
}

async function writeVersionIndexUnlocked(
  docId: string,
  versions: readonly DocumentVersionSummary[],
  nowMs: number,
): Promise<void> {
  const payload: StoredVersionIndexFile = {
    version: 1,
    docId,
    updatedAt: new Date(nowMs).toISOString(),
    versions: sortVersionsNewestFirst(versions),
  }
  await writeAtomicText(
    docHistoryIndexPath(docId),
    JSON.stringify(payload, null, 2),
  )
}

function mintVersionId(nowMs: number, existing: ReadonlySet<string>): string {
  for (let i = 0; i < 8; i += 1) {
    const candidate = `v-${nowMs}-${randomBytes(4).toString('hex')}`
    if (!existing.has(candidate)) return candidate
  }
  return `v-${nowMs}-${randomBytes(8).toString('hex')}`
}

export function shouldCreateAutoSnapshot(
  versions: readonly DocumentVersionSummary[],
  contentHash: string,
  nowMs: number,
  minAutoIntervalMs = AUTO_SNAPSHOT_INTERVAL_MS,
): { create: true } | { create: false; reason: 'unchanged' | 'throttled' } {
  const sorted = sortVersionsNewestFirst(versions)
  const latest = sorted.at(0)
  if (latest && latest.contentHash === contentHash) {
    return { create: false, reason: 'unchanged' }
  }
  const latestAutosave = sorted.find((v) => v.trigger === 'autosave')
  if (latestAutosave) {
    const elapsed = nowMs - Date.parse(latestAutosave.createdAt)
    if (elapsed < minAutoIntervalMs) {
      return { create: false, reason: 'throttled' }
    }
  }
  return { create: true }
}

/**
 * Timestamp for the pre-history baseline captured on the first tracked edit.
 * A file older than the daily retention window used to be dated with its
 * mtime and then deleted by the same save. Ancient baselines are pinned
 * inside that window, still earlier than the autosave interval, so both the
 * original content and the edit survive.
 */
export function baselineSnapshotTimestampMs(
  priorMtimeMs: number | undefined,
  nowMs: number,
  policy: VersionRetentionPolicy = DEFAULT_VERSION_RETENTION_POLICY,
): number {
  const latest = nowMs - 1
  const raw =
    priorMtimeMs !== undefined && Number.isFinite(priorMtimeMs)
      ? Math.floor(priorMtimeMs)
      : latest
  if (raw >= latest) return latest
  const earliest = nowMs - policy.dailyWindowMs
  if (raw >= earliest) return raw
  const safety = Math.min(DAY_MS, Math.max(0, policy.dailyWindowMs))
  let pinned = earliest + safety
  const throttleSafe = nowMs - AUTO_SNAPSHOT_INTERVAL_MS
  if (pinned > throttleSafe) pinned = throttleSafe
  if (pinned < earliest) pinned = earliest
  if (pinned > latest) pinned = latest
  return pinned
}

export function selectVersionsToPrune(
  versions: readonly DocumentVersionSummary[],
  nowMs: number,
  policy: VersionRetentionPolicy = DEFAULT_VERSION_RETENTION_POLICY,
): {
  kept: DocumentVersionSummary[]
  pruned: DocumentVersionSummary[]
} {
  const named: DocumentVersionSummary[] = []
  const auto: DocumentVersionSummary[] = []

  for (const item of sortVersionsNewestFirst(versions)) {
    if (item.kind === 'named') named.push(item)
    else auto.push(item)
  }

  const survivingAuto: DocumentVersionSummary[] = []
  const pruned: DocumentVersionSummary[] = []
  const seenHourBuckets = new Set<number>()
  const seenDayBuckets = new Set<number>()

  for (const item of auto) {
    const ts = Date.parse(item.createdAt)
    const ageMs = Number.isNaN(ts)
      ? policy.dailyWindowMs + 1
      : Math.max(0, nowMs - ts)

    if (ageMs <= policy.keepAllWindowMs) {
      survivingAuto.push(item)
      continue
    }
    if (ageMs <= policy.hourlyWindowMs) {
      const hourBucket = Math.floor(ts / HOUR_MS)
      if (seenHourBuckets.has(hourBucket)) {
        pruned.push(item)
      } else {
        seenHourBuckets.add(hourBucket)
        survivingAuto.push(item)
      }
      continue
    }
    if (ageMs <= policy.dailyWindowMs) {
      const dayBucket = Math.floor(ts / DAY_MS)
      if (seenDayBuckets.has(dayBucket)) {
        pruned.push(item)
      } else {
        seenDayBuckets.add(dayBucket)
        survivingAuto.push(item)
      }
      continue
    }
    pruned.push(item)
  }

  const maxAuto = Math.max(0, policy.maxAutoVersions)
  const cappedAuto = survivingAuto.slice(0, maxAuto)
  if (survivingAuto.length > maxAuto) {
    pruned.push(...survivingAuto.slice(maxAuto))
  }

  return {
    kept: sortVersionsNewestFirst([...named, ...cappedAuto]),
    pruned,
  }
}

async function applyRetentionPruningUnlocked(
  docId: string,
  versions: readonly DocumentVersionSummary[],
  nowMs: number,
  policy: VersionRetentionPolicy,
): Promise<{ kept: DocumentVersionSummary[]; prunedIds: string[] }> {
  const { kept, pruned } = selectVersionsToPrune(versions, nowMs, policy)
  if (pruned.length === 0) {
    return { kept, prunedIds: [] }
  }
  await Promise.all(
    pruned.map(async (item) => {
      try {
        await rm(snapshotFilePath(docId, item.id), { force: true })
      } catch {
        // Ignore missing/invalid snapshot files during pruning.
      }
    }),
  )
  return { kept, prunedIds: pruned.map((p) => p.id) }
}

async function retainHistoryUnlocked(
  docId: string,
  versions: readonly DocumentVersionSummary[],
  nowMs: number,
  policy: VersionRetentionPolicy,
): Promise<{ kept: DocumentVersionSummary[]; prunedIds: string[] }> {
  const { kept, prunedIds } = await applyRetentionPruningUnlocked(
    docId,
    versions,
    nowMs,
    policy,
  )
  if (prunedIds.length > 0) {
    await writeVersionIndexUnlocked(docId, kept, nowMs)
  }
  return { kept, prunedIds }
}

async function resolveHistoryDocIdUnlocked(
  docId: string,
  slug?: string,
  folderPath?: string | null,
): Promise<string> {
  const located = await findDocumentByDocIdUnlocked(docId, slug, folderPath)
  if (!located) return docId
  const metadata = await readMetadata()
  const stored = metadata.documents[located.relPath]?.id?.trim()
  return stored || docId
}

async function persistStableDocumentIdUnlocked(
  located: DriveDocumentLocation,
  docId: string,
): Promise<string> {
  const metadata = await readMetadata()
  const existing = metadata.documents[located.relPath]
  const stored = existing?.id?.trim()
  if (stored) return stored
  metadata.documents[located.relPath] = {
    ...existing,
    id: docId,
    slug: located.slug,
    updatedAt: existing?.updatedAt ?? new Date().toISOString(),
  }
  await writeMetadata(metadata)
  return docId
}

async function appendVersionUnlocked(input: {
  docId: string
  slug: string
  title?: string
  category?: MarbleAppCategory
  source: string
  kind: DocumentVersionKind
  trigger: DocumentVersionTrigger
  label?: string
  author?: string
  nowMs: number
  existing: DocumentVersionSummary[]
}): Promise<{
  summary: DocumentVersionSummary
  versions: DocumentVersionSummary[]
}> {
  const existingIds = new Set(input.existing.map((v) => v.id))
  const id = mintVersionId(input.nowMs, existingIds)
  const createdAt = new Date(input.nowMs).toISOString()
  const contentHash = hashVersionSource(input.source)
  const summary: DocumentVersionSummary = {
    id,
    docId: input.docId,
    slug: input.slug,
    title: input.title?.trim() || titleOf(input.source, input.slug),
    category: input.category ?? inferCategory(input.source, input.slug),
    kind: input.kind,
    trigger: input.trigger,
    createdAt,
    contentHash,
    byteSize: byteSizeOf(input.source),
    nodeCount: countNodesForSource(input.source),
    ...(input.label ? { label: input.label } : {}),
    ...(input.author ? { author: input.author } : {}),
  }

  await mkdir(docHistorySnapshotsDir(input.docId), { recursive: true })
  await writeAtomicText(snapshotFilePath(input.docId, id), input.source)

  const versions = sortVersionsNewestFirst([summary, ...input.existing])
  return { summary, versions }
}

export async function listVersionsUnlocked(
  docId: string,
): Promise<DocumentVersionSummary[]> {
  const clean = docId.trim()
  if (!clean) fail(400, 'docId is required')
  const stableId = await resolveHistoryDocIdUnlocked(clean)
  const existing = await readVersionIndexUnlocked(stableId)
  const { kept } = await retainHistoryUnlocked(
    stableId,
    existing,
    Date.now(),
    DEFAULT_VERSION_RETENTION_POLICY,
  )
  return kept
}

export async function listVersions(
  docId: string,
): Promise<DocumentVersionSummary[]> {
  if (!docId.trim()) fail(400, 'docId is required')
  return withDriveLock(async () => listVersionsUnlocked(docId))
}

export async function getVersionUnlocked(
  docId: string,
  versionId: string,
): Promise<DocumentVersionDetail | null> {
  const cleanDocId = docId.trim()
  const cleanVersionId = versionId.trim()
  if (!cleanDocId) fail(400, 'docId is required')
  if (!cleanVersionId) fail(400, 'versionId is required')

  const stableId = await resolveHistoryDocIdUnlocked(cleanDocId)
  const existing = await readVersionIndexUnlocked(stableId)
  const { kept } = await retainHistoryUnlocked(
    stableId,
    existing,
    Date.now(),
    DEFAULT_VERSION_RETENTION_POLICY,
  )
  const summary = kept.find((v) => v.id === cleanVersionId)
  if (!summary) return null

  try {
    const source = await readFile(
      snapshotFilePath(stableId, cleanVersionId),
      'utf8',
    )
    return { ...summary, source }
  } catch (error) {
    if (isEnoent(error)) return null
    throw error
  }
}

export async function getVersion(
  docId: string,
  versionId: string,
): Promise<DocumentVersionDetail | null> {
  if (!docId.trim()) fail(400, 'docId is required')
  if (!versionId.trim()) fail(400, 'versionId is required')
  return withDriveLock(async () => getVersionUnlocked(docId, versionId))
}

export interface CreateVersionInput {
  docId: string
  slug?: string
  folderPath?: string | null
  source?: string
  kind?: DocumentVersionKind
  trigger?: DocumentVersionTrigger
  label?: string
  author?: string
  title?: string
  category?: MarbleAppCategory
  nowMs?: number
  minAutoIntervalMs?: number
  policy?: VersionRetentionPolicy
  bypassThrottle?: boolean
  bypassDedupe?: boolean
}

export async function createVersionUnlocked(
  input: CreateVersionInput,
): Promise<CreateVersionResult> {
  const docId = input.docId.trim()
  if (!docId) fail(400, 'docId is required')

  const kind: DocumentVersionKind = input.kind ?? 'named'
  const trigger: DocumentVersionTrigger =
    input.trigger ?? (kind === 'named' ? 'manual' : 'autosave')
  const nowMs = input.nowMs ?? Date.now()
  const policy = input.policy ?? DEFAULT_VERSION_RETENTION_POLICY

  let label = typeof input.label === 'string' ? input.label.trim() : undefined
  if (kind === 'named') {
    if (!label) {
      fail(400, 'Named versions require a non-empty label')
    }
    label = label.slice(0, MAX_LABEL_LENGTH)
  } else if (label) {
    label = label.slice(0, MAX_LABEL_LENGTH)
  } else {
    label = undefined
  }

  let resolvedSlug = input.slug ? assertSlug(input.slug) : undefined
  let resolvedSource = typeof input.source === 'string' ? input.source : null

  const located = await findDocumentByDocIdUnlocked(
    docId,
    resolvedSlug,
    input.folderPath,
  )
  let stableDocId = docId
  if (located) {
    if (!resolvedSlug) resolvedSlug = located.slug
    if (resolvedSource === null) {
      resolvedSource = await readFile(located.fullPath, 'utf8')
    }
    stableDocId = await persistStableDocumentIdUnlocked(located, docId)
  }

  if (resolvedSource === null) {
    fail(404, `No active document found for "${docId}"`)
  }
  const slug = resolvedSlug ?? 'document'

  let existing = await readVersionIndexUnlocked(stableDocId)
  const contentHash = hashVersionSource(resolvedSource)

  if (kind === 'auto' && !input.bypassDedupe) {
    const check = shouldCreateAutoSnapshot(
      existing,
      contentHash,
      nowMs,
      input.bypassThrottle ? 0 : input.minAutoIntervalMs,
    )
    if (!check.create) {
      const retained = await retainHistoryUnlocked(
        stableDocId,
        existing,
        nowMs,
        policy,
      )
      return {
        created: false,
        reason: check.reason,
        version: null,
        versions: retained.kept,
        prunedIds: retained.prunedIds,
      }
    }
  }

  const appended = await appendVersionUnlocked({
    docId: stableDocId,
    slug,
    title: input.title,
    category: input.category,
    source: resolvedSource,
    kind,
    trigger,
    label,
    author: input.author,
    nowMs,
    existing,
  })
  existing = appended.versions

  const { kept, prunedIds } = await applyRetentionPruningUnlocked(
    stableDocId,
    existing,
    nowMs,
    policy,
  )
  await writeVersionIndexUnlocked(stableDocId, kept, nowMs)

  return {
    created: true,
    version: appended.summary,
    versions: kept,
    prunedIds,
  }
}

export async function createVersion(
  input: CreateVersionInput,
): Promise<CreateVersionResult> {
  return withDriveLock(async () => createVersionUnlocked(input))
}

export async function recordAutoVersionUnlocked(input: {
  docId: string
  slug: string
  title?: string
  category?: MarbleAppCategory
  source: string
  priorSource: string | null
  priorMtimeMs?: number
  author?: string
  nowMs?: number
  minAutoIntervalMs?: number
  policy?: VersionRetentionPolicy
}): Promise<CreateVersionResult> {
  const docId = input.docId.trim()
  if (!docId) fail(400, 'docId is required')
  const nowMs = input.nowMs ?? Date.now()
  const policy = input.policy ?? DEFAULT_VERSION_RETENTION_POLICY
  const minAutoIntervalMs = input.minAutoIntervalMs ?? AUTO_SNAPSHOT_INTERVAL_MS

  let existing = await readVersionIndexUnlocked(docId)

  // If this document existed before version history started tracking it and its
  // content is about to change, capture the prior state first so history starts
  // with the original content rather than losing it on first edit.
  if (
    existing.length === 0 &&
    input.priorSource !== null &&
    input.priorSource !== input.source
  ) {
    const baselineMs = baselineSnapshotTimestampMs(
      input.priorMtimeMs,
      nowMs,
      policy,
    )
    const baseline = await appendVersionUnlocked({
      docId,
      slug: input.slug,
      title: input.title,
      category: input.category,
      source: input.priorSource,
      kind: 'auto',
      trigger: 'autosave',
      author: input.author,
      nowMs: baselineMs,
      existing,
    })
    existing = baseline.versions
    await writeVersionIndexUnlocked(docId, existing, baselineMs)
  }

  const contentHash = hashVersionSource(input.source)
  const check = shouldCreateAutoSnapshot(
    existing,
    contentHash,
    nowMs,
    minAutoIntervalMs,
  )
  if (!check.create) {
    const retained = await retainHistoryUnlocked(docId, existing, nowMs, policy)
    return {
      created: false,
      reason: check.reason,
      version: null,
      versions: retained.kept,
      prunedIds: retained.prunedIds,
    }
  }

  const appended = await appendVersionUnlocked({
    docId,
    slug: input.slug,
    title: input.title,
    category: input.category,
    source: input.source,
    kind: 'auto',
    trigger: 'autosave',
    author: input.author,
    nowMs,
    existing,
  })
  const { kept, prunedIds } = await applyRetentionPruningUnlocked(
    docId,
    appended.versions,
    nowMs,
    policy,
  )
  await writeVersionIndexUnlocked(docId, kept, nowMs)

  return {
    created: true,
    version: appended.summary,
    versions: kept,
    prunedIds,
  }
}

async function isDocIdTrashedUnlocked(docId: string): Promise<boolean> {
  const trashDir = getTrashDir()
  let names: string[]
  try {
    names = await readdir(trashDir)
  } catch (error) {
    if (isEnoent(error)) return false
    throw error
  }
  for (const name of names) {
    if (!name.endsWith('.mrbl')) continue
    const slug = name.slice(0, -'.mrbl'.length)
    if (!SLUG_PATTERN.test(slug) || slug.includes('..')) continue
    const meta = await readTrashMeta(slug)
    const trashId =
      meta?.meta?.id?.trim() ||
      meta?.docId?.trim() ||
      deterministicId('doc', `trash/${slug}`)
    if (trashId === docId) return true
  }
  return false
}

export async function restoreVersionUnlocked(input: {
  docId: string
  versionId: string
  slug?: string
  folderPath?: string | null
  author?: string
  nowMs?: number
  policy?: VersionRetentionPolicy
}): Promise<RestoreVersionResult> {
  const docId = input.docId.trim()
  const versionId = input.versionId.trim()
  if (!docId) fail(400, 'docId is required')
  if (!versionId) fail(400, 'versionId is required')

  const target = await getVersionUnlocked(docId, versionId)
  if (!target) {
    fail(404, `Version "${versionId}" not found for document "${docId}"`)
  }

  const located = await findDocumentByDocIdUnlocked(
    docId,
    input.slug ? assertSlug(input.slug) : undefined,
    input.folderPath,
  )
  if (!located) {
    if (await isDocIdTrashedUnlocked(docId)) {
      fail(409, 'Cannot restore version while document is in Trash')
    }
    if (input.slug) {
      await failIfSlugInTrash(assertSlug(input.slug), 'restore version for')
    }
    fail(404, `Document "${docId}" not found`)
  }
  await failIfSlugInTrash(located.slug, 'restore version for')

  const nowMs = input.nowMs ?? Date.now()
  const nowIso = new Date(nowMs).toISOString()
  const currentSource = await readFile(located.fullPath, 'utf8')
  const metadata = await readMetadata()
  const prevMeta = metadata.documents[located.relPath] ?? {}

  const preRestoreLabel = target.label
    ? `Before restoring "${target.label}"`.slice(0, MAX_LABEL_LENGTH)
    : 'Before restore'

  const preRestoreResult = await createVersionUnlocked({
    docId,
    slug: located.slug,
    folderPath: located.folderPath,
    source: currentSource,
    kind: 'auto',
    trigger: 'pre-restore',
    label: preRestoreLabel,
    author: input.author ?? prevMeta.lastEditedBy?.name ?? 'You',
    title: prevMeta.title ?? titleOf(currentSource, located.slug),
    category: prevMeta.category ?? inferCategory(currentSource, located.slug),
    nowMs,
    policy: input.policy,
    bypassThrottle: true,
    bypassDedupe: true,
  })

  if (!preRestoreResult.version) {
    fail(500, 'Failed to snapshot current state before restoring')
  }

  await writeAtomicText(located.fullPath, target.source)

  metadata.documents[located.relPath] = {
    ...prevMeta,
    id: prevMeta.id ?? docId,
    slug: located.slug,
    title: prevMeta.title ?? titleOf(target.source, located.slug),
    category: prevMeta.category ?? inferCategory(target.source, located.slug),
    createdAt: prevMeta.createdAt ?? nowIso,
    updatedAt: nowIso,
    version: (prevMeta.version ?? 1) + 1,
  }
  await writeMetadata(metadata)

  return {
    ok: true,
    docId,
    slug: located.slug,
    folderPath: located.folderPath,
    relPath: located.relPath,
    source: target.source,
    restoredVersion: {
      id: target.id,
      docId: target.docId,
      slug: target.slug,
      title: target.title,
      category: target.category,
      kind: target.kind,
      trigger: target.trigger,
      createdAt: target.createdAt,
      contentHash: target.contentHash,
      byteSize: target.byteSize,
      nodeCount: target.nodeCount,
      ...(target.label ? { label: target.label } : {}),
      ...(target.author ? { author: target.author } : {}),
    },
    preRestoreVersion: preRestoreResult.version,
    versions: preRestoreResult.versions,
  }
}

export async function restoreVersion(input: {
  docId: string
  versionId: string
  slug?: string
  folderPath?: string | null
  author?: string
  nowMs?: number
  policy?: VersionRetentionPolicy
}): Promise<RestoreVersionResult> {
  return withDriveLock(async () => restoreVersionUnlocked(input))
}

export async function deleteDocumentVersionHistoryUnlocked(
  docId: string | undefined,
): Promise<void> {
  if (!docId || !docId.trim()) return
  try {
    await rm(getDocVersionHistoryDir(docId), {
      recursive: true,
      force: true,
    })
  } catch {
    // Ignore invalid ids or missing directories during cleanup.
  }
}

export async function deleteDocumentVersionHistory(
  docId: string | undefined,
): Promise<void> {
  if (!docId || !docId.trim()) return
  await withDriveLock(async () => deleteDocumentVersionHistoryUnlocked(docId))
}
