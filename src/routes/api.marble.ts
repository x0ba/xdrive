import { readdir, readFile, stat } from 'node:fs/promises'

// @ts-expect-error @bdhmin/marble has no type declarations.
import * as marbleCollab from '@bdhmin/marble/collab'
// @ts-expect-error @bdhmin/marble has no type declarations.
import * as marbleDoctor from '@bdhmin/marble/doctor'
// @ts-expect-error @bdhmin/marble has no type declarations.
import * as marbleGuard from '@bdhmin/marble/guard'
// @ts-expect-error @bdhmin/marble has no type declarations.
import * as marblePatcher from '@bdhmin/marble/patcher'
import { createFileRoute } from '@tanstack/react-router'

import { isHiddenDriveEntry } from '#/lib/marble/drive-hidden'
import {
  DEFAULT_TRASH_RETENTION_DAYS,
  DriveStorageError,
  SLUG_PATTERN,
  assertSlug,
  byteSizeOf,
  createFolderOnDisk,
  deleteDocumentPermanentlyOnDisk,
  deleteFolderOnDisk,
  emptyTrashOnDisk,
  getTrashDir,
  isEnoent,
  listDriveSummary,
  listTemplatesOnDisk,
  loadDriveWorkspace,
  moveDocumentOnDisk,
  purgeExpiredTrashOnDisk,
  readDocumentOptional,
  readDriveSettingsOnDisk,
  readTrashMeta,
  renameDocumentOnDisk,
  renameFolderOnDisk,
  restoreDocumentOnDisk,
  saveAsTemplateOnDisk,
  saveDocumentToDisk,
  titleOf,
  trashDocumentOnDisk,
  trashFilePath,
  updateDocumentMetaOnDisk,
  updateDriveSettingsOnDisk,
} from '#/lib/marble/drive-storage.server'
import type {
  DriveFolderColor,
  MarbleAppCategory,
  MarbleDocumentFile,
} from '#/lib/types'

type MarbleFinding = { level: string; line: number; message: string }
type MarbleSlice = { id: string; tag: string; html: string }

const diffSources = marbleCollab.diffSources as (
  prior: string,
  incoming: string,
) => unknown[]
const mergeOps = marbleCollab.mergeOps as (
  prior: string,
  ops: readonly unknown[],
) => { source: string; ops: unknown[]; forks: unknown[] }
const examine = marbleDoctor.examine as (
  file: string,
  source: string,
) => Array<MarbleFinding>
const checkShapes = marbleGuard.checkShapes as (ops: readonly unknown[]) => void
const guardOps = marbleGuard.guardOps as (
  source: string,
  ops: readonly unknown[],
) => string
const applyOps = marblePatcher.applyOps as (
  source: string,
  ops: readonly unknown[],
) => string
const knownIds = marblePatcher.knownIds as (source: string) => Iterable<string>
const outlineOf = marblePatcher.outlineOf as (
  source: string,
  id: string,
) => string
const sliceOf = marblePatcher.sliceOf as (
  source: string,
  id: string,
) => MarbleSlice

const DAY_MS = 24 * 60 * 60 * 1000
const GUARDED_TYPES = new Set([
  'setText',
  'setInner',
  'setAttr',
  'insert',
  'move',
  'remove',
])

class MarbleHttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'MarbleHttpError'
    this.status = status
  }
}

function fail(status: number, message: string): never {
  throw new MarbleHttpError(status, message)
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Marble request failed'
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

function errorResponse(error: unknown) {
  const status =
    error instanceof MarbleHttpError || error instanceof DriveStorageError
      ? error.status
      : 400
  return json({ ok: false, error: messageOf(error) }, status)
}

function requireSlug(value: string | null | undefined) {
  if (!value) fail(400, 'slug is required')
  return assertSlug(value)
}

function fileNameFor(slug: string) {
  return `${assertSlug(slug)}.mrbl`
}

function nodeCountOf(source: string) {
  try {
    return [...knownIds(source)].length
  } catch {
    return source.match(/data-marble-id\s*=\s*["'][^"']*["']/g)?.length ?? 0
  }
}

function findingsOf(fileName: string, source: string) {
  try {
    return examine(fileName, source)
  } catch (error) {
    return [{ level: 'error', line: 0, message: messageOf(error) }]
  }
}

function doctorHealth(fileName: string, source: string) {
  const findings = findingsOf(fileName, source)
  let errors = 0
  let warnings = 0
  for (const finding of findings) {
    if (finding.level === 'error') errors += 1
    else warnings += 1
  }
  return { errors, warnings, findings }
}

function savedPayload(
  slug: string,
  source: string,
  location: { folderPath: string; relPath: string },
) {
  const fileName = fileNameFor(slug)
  return {
    ok: true as const,
    slug,
    fileName,
    folderPath: location.folderPath,
    relPath: location.relPath,
    nodeCount: nodeCountOf(source),
    byteSize: byteSizeOf(source),
    doctor: doctorHealth(fileName, source),
  }
}

async function listTrash(retentionDaysParam?: number) {
  const settings = await readDriveSettingsOnDisk()
  const retentionDays =
    retentionDaysParam && retentionDaysParam > 0
      ? retentionDaysParam
      : settings.trashRetentionDays
  const purged = await purgeExpiredTrashOnDisk(retentionDays)
  let names: string[]
  try {
    names = await readdir(getTrashDir())
  } catch (error) {
    if (isEnoent(error)) {
      return json({
        ok: true,
        retentionDays,
        purged,
        documents: [],
      })
    }
    throw error
  }

  const now = Date.now()
  const documents = (
    await Promise.all(
      names
        .filter((name) => !isHiddenDriveEntry(name) && name.endsWith('.mrbl'))
        .map(async (fileName) => {
          const slug = fileName.slice(0, -'.mrbl'.length)
          if (!SLUG_PATTERN.test(slug) || slug.includes('..')) return null
          const full = trashFilePath(slug)
          const [source, info, meta] = await Promise.all([
            readFile(full, 'utf8'),
            stat(full),
            readTrashMeta(slug),
          ])
          const trashedAt = meta?.trashedAt ?? info.mtime.toISOString()
          const trashedMs = Date.parse(trashedAt)
          const expiresMs = meta?.purgeAt
            ? Date.parse(meta.purgeAt)
            : trashedMs + retentionDays * DAY_MS
          const expiresAt = new Date(expiresMs).toISOString()
          const daysRemaining = Math.max(
            0,
            Math.ceil((expiresMs - now) / DAY_MS),
          )
          return {
            slug,
            fileName,
            title: meta?.meta?.title ?? titleOf(source, slug),
            originalFolderPath: meta?.originalFolderPath ?? '',
            nodeCount: nodeCountOf(source),
            byteSize: byteSizeOf(source),
            trashedAt,
            expiresAt,
            daysRemaining,
          }
        }),
    )
  ).filter((document) => document !== null)

  documents.sort((a, b) => (a.trashedAt < b.trashedAt ? 1 : -1))
  return json({ ok: true, retentionDays, purged, documents })
}

async function listDrive() {
  const summary = await listDriveSummary(nodeCountOf, doctorHealth)
  return json({ ok: true, ...summary })
}

async function readWorkspace(retentionDaysParam: string | null) {
  const parsed = retentionDaysParam ? Number(retentionDaysParam) : Number.NaN
  const retentionDays =
    Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
  const workspace = await loadDriveWorkspace(nodeCountOf, retentionDays)
  return json({ ok: true, ...workspace })
}

async function readDrive(slugValue: string | null, folderPath: string | null) {
  const slug = requireSlug(slugValue)
  const record = await readDocumentOptional(slug, folderPath ?? undefined)
  if (record === null) fail(404, `No marble document for slug "${slug}"`)
  const fileName = fileNameFor(slug)
  return json({
    ok: true,
    slug,
    folderPath: record.location.folderPath,
    relPath: record.location.relPath,
    source: record.source,
    knownIds: [...knownIds(record.source)],
    doctor: examine(fileName, record.source),
  })
}

async function sliceDrive(
  slugValue: string | null,
  id: string | null,
  folderPath: string | null,
) {
  const slug = requireSlug(slugValue)
  if (!id) fail(400, 'id is required')
  const record = await readDocumentOptional(slug, folderPath ?? undefined)
  if (record === null) fail(404, `No marble document for slug "${slug}"`)
  return json({
    ok: true,
    slug,
    folderPath: record.location.folderPath,
    id,
    slice: sliceOf(record.source, id),
    outline: outlineOf(record.source, id),
  })
}

function opType(op: unknown) {
  if (!op || typeof op !== 'object' || !('type' in op)) return ''
  return String((op as { type?: unknown }).type ?? '')
}

function needsPatcher(ops: unknown[]) {
  return ops.some((op) => {
    const type = opType(op)
    return type === 'assignId' || !GUARDED_TYPES.has(type)
  })
}

// Guarded ops are checked, then applied. assignId and custom ops try the guard
// first; a shape or unknown-type refusal falls back to the patcher. Integrity
// refusals still fail the write.
function applyValidated(currentSource: string, ops: unknown[]) {
  if (!needsPatcher(ops)) {
    checkShapes(ops)
    return guardOps(currentSource, ops)
  }
  try {
    return guardOps(currentSource, ops)
  } catch (error) {
    const message = messageOf(error)
    const shapeRefusal =
      /unknown type|assignId|missing "|is not an id|must be a string|not an attribute name|element indexes/i.test(
        message,
      )
    if (!shapeRefusal) throw error
    try {
      return applyOps(currentSource, ops)
    } catch {
      throw error
    }
  }
}

async function applyPostedOps(
  slug: string | undefined,
  folderPath: string | undefined,
  source: unknown,
  ops: unknown,
) {
  if (!Array.isArray(ops)) fail(400, 'ops must be an array')
  const clientSource = typeof source === 'string' ? source : null
  const diskRecord = slug ? await readDocumentOptional(slug, folderPath) : null
  const disk = diskRecord?.source ?? null
  const currentSource = clientSource ?? disk
  if (currentSource === null) {
    fail(400, 'apply_ops requires source or an existing document slug')
  }

  const applied = applyValidated(currentSource, ops)
  if (disk !== null && clientSource !== null && disk !== clientSource) {
    return {
      source: mergeOps(disk, diffSources(clientSource, applied)).source,
      folderPath: folderPath ?? diskRecord?.location.folderPath,
    }
  }
  return {
    source: applied,
    folderPath: folderPath ?? diskRecord?.location.folderPath,
  }
}

async function readBody(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    fail(400, 'Request body must be JSON')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    fail(400, 'Request body must be a JSON object')
  }
  return body as Record<string, unknown>
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function requireIdList(value: unknown): string[] {
  if (!Array.isArray(value)) fail(400, 'empty_trash requires an ids array')
  const ids: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || item.trim().length === 0) {
      fail(400, 'empty_trash ids must be non-empty strings')
    }
    ids.push(item.trim())
  }
  return ids
}

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url)
  try {
    const action = url.searchParams.get('action')
    if (action === 'workspace') {
      return await readWorkspace(url.searchParams.get('retentionDays'))
    }
    if (action === 'settings') {
      return json({ ok: true, settings: await readDriveSettingsOnDisk() })
    }
    if (action === 'list') return await listDrive()
    if (action === 'templates') {
      return json({
        ok: true,
        templates: await listTemplatesOnDisk(nodeCountOf),
      })
    }
    if (action === 'trash') return await listTrash()
    if (action === 'read') {
      return await readDrive(
        url.searchParams.get('slug'),
        url.searchParams.get('folderPath'),
      )
    }
    if (action === 'slice') {
      return await sliceDrive(
        url.searchParams.get('slug'),
        url.searchParams.get('id'),
        url.searchParams.get('folderPath'),
      )
    }
    return json(
      {
        ok: false,
        error:
          'Expected action=workspace, action=settings, action=list, action=templates, action=trash, action=read, or action=slice',
      },
      400,
    )
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST({ request }: { request: Request }) {
  try {
    const body = await readBody(request)
    const action = body.action
    if (action === 'save') {
      if (typeof body.slug !== 'string' || typeof body.source !== 'string') {
        fail(400, 'save requires slug and source strings')
      }
      const slug = assertSlug(body.slug)
      const folderPath =
        body.folderPath === null ? '' : optionalString(body.folderPath)
      const location = await saveDocumentToDisk({
        slug,
        source: body.source,
        folderPath,
        meta: body.meta,
        checkpoints: body.checkpoints,
        intentHistory: body.intentHistory,
      })
      return json(savedPayload(slug, body.source, location))
    }
    if (action === 'apply_ops') {
      const slug =
        typeof body.slug === 'string' ? assertSlug(body.slug) : undefined
      const folderPath =
        body.folderPath === null ? '' : optionalString(body.folderPath)
      const applied = await applyPostedOps(
        slug,
        folderPath,
        body.source,
        body.ops,
      )
      let savedLocation: { folderPath: string; relPath: string } | null = null
      if (slug) {
        const location = await saveDocumentToDisk({
          slug,
          source: applied.source,
          folderPath: applied.folderPath,
          meta: body.meta,
          checkpoints: body.checkpoints,
          intentHistory: body.intentHistory,
        })
        savedLocation = {
          folderPath: location.folderPath,
          relPath: location.relPath,
        }
      }
      const fileName = slug ? fileNameFor(slug) : 'unsaved.mrbl'
      return json({
        ok: true,
        source: applied.source,
        folderPath: savedLocation?.folderPath ?? applied.folderPath ?? '',
        relPath: savedLocation?.relPath,
        nodeCount: nodeCountOf(applied.source),
        byteSize: byteSizeOf(applied.source),
        doctor: examine(fileName, applied.source),
      })
    }
    if (action === 'create_folder') {
      if (typeof body.name !== 'string') {
        fail(400, 'create_folder requires a name string')
      }
      return json(
        await createFolderOnDisk({
          id: optionalString(body.id),
          name: body.name,
          parentPath:
            body.parentPath === null ? '' : optionalString(body.parentPath),
          color: optionalString(body.color) as DriveFolderColor | undefined,
          createdAt: optionalString(body.createdAt),
          updatedAt: optionalString(body.updatedAt),
        }),
      )
    }
    if (action === 'rename_folder') {
      if (
        typeof body.oldPath !== 'string' ||
        typeof body.newName !== 'string'
      ) {
        fail(400, 'rename_folder requires oldPath and newName strings')
      }
      return json(
        await renameFolderOnDisk({
          oldPath: body.oldPath,
          newName: body.newName,
          color: optionalString(body.color) as DriveFolderColor | undefined,
          updatedAt: optionalString(body.updatedAt),
        }),
      )
    }
    if (action === 'delete_folder') {
      if (typeof body.folderPath !== 'string') {
        fail(400, 'delete_folder requires a folderPath string')
      }
      return json(await deleteFolderOnDisk({ folderPath: body.folderPath }))
    }
    if (action === 'move_document') {
      if (typeof body.slug !== 'string') {
        fail(400, 'move_document requires a slug string')
      }
      const toFolderPath =
        body.toFolderPath === null || body.toFolderPath === undefined
          ? ''
          : typeof body.toFolderPath === 'string'
            ? body.toFolderPath
            : fail(400, 'toFolderPath must be a string or null')
      return json(
        await moveDocumentOnDisk({
          slug: body.slug,
          fromFolderPath:
            body.fromFolderPath === null
              ? ''
              : optionalString(body.fromFolderPath),
          toFolderPath,
          source: optionalString(body.source),
          meta: body.meta,
        }),
      )
    }
    if (action === 'update_document_meta') {
      if (typeof body.slug !== 'string') {
        fail(400, 'update_document_meta requires a slug string')
      }
      return json(
        await updateDocumentMetaOnDisk({
          slug: body.slug,
          folderPath:
            body.folderPath === null ? '' : optionalString(body.folderPath),
          meta: body.meta,
          checkpoints: body.checkpoints,
          intentHistory: body.intentHistory,
        }),
      )
    }
    if (action === 'save_as_template') {
      if (typeof body.title !== 'string') {
        fail(400, 'save_as_template requires a title string')
      }
      const sourceFolderPath =
        body.sourceFolderPath === null
          ? ''
          : optionalString(body.sourceFolderPath)
      return json(
        await saveAsTemplateOnDisk({
          sourceSlug: optionalString(body.sourceSlug),
          sourceFolderPath,
          source: optionalString(body.source),
          title: body.title,
          description: optionalString(body.description),
          category: optionalString(body.category) as
            MarbleAppCategory | undefined,
          tags: Array.isArray(body.tags)
            ? body.tags.filter((t): t is string => typeof t === 'string')
            : undefined,
          id: optionalString(body.id),
          folderId: optionalString(body.folderId),
          slug: optionalString(body.slug),
          createdBy: body.createdBy as
            MarbleDocumentFile['createdBy'] | undefined,
          nodeCountOf,
        }),
      )
    }
    if (action === 'rename_document') {
      if (typeof body.slug !== 'string' || typeof body.title !== 'string') {
        fail(400, 'rename_document requires slug and title strings')
      }
      const folderPath =
        body.folderPath === null ? '' : optionalString(body.folderPath)
      return json(
        await renameDocumentOnDisk({
          slug: body.slug,
          folderPath,
          title: body.title,
          description: optionalString(body.description),
          nextSlug: optionalString(body.nextSlug),
        }),
      )
    }
    if (action === 'update_settings') {
      return json({
        ok: true,
        settings: await updateDriveSettingsOnDisk(body.settings),
      })
    }
    if (action === 'trash') {
      if (typeof body.slug !== 'string') {
        fail(400, 'trash requires a slug string')
      }
      const retentionDays =
        typeof body.retentionDays === 'number' && body.retentionDays > 0
          ? body.retentionDays
          : undefined
      return json(
        await trashDocumentOnDisk({
          slug: body.slug,
          folderPath:
            body.folderPath === null ? '' : optionalString(body.folderPath),
          trashedAt: optionalString(body.trashedAt),
          retentionDays,
          meta: body.meta,
          checkpoints: body.checkpoints,
          intentHistory: body.intentHistory,
        }),
      )
    }
    if (action === 'restore') {
      if (typeof body.slug !== 'string') {
        fail(400, 'restore requires a slug string')
      }
      return json(
        await restoreDocumentOnDisk({
          slug: body.slug,
          targetFolderPath:
            body.targetFolderPath === null
              ? ''
              : optionalString(body.targetFolderPath),
        }),
      )
    }
    if (action === 'delete') {
      if (typeof body.slug !== 'string') {
        fail(400, 'delete requires a slug string')
      }
      return json(
        await deleteDocumentPermanentlyOnDisk({
          slug: body.slug,
          folderPath:
            body.folderPath === null ? '' : optionalString(body.folderPath),
        }),
      )
    }
    if (action === 'empty_trash') {
      return json(await emptyTrashOnDisk(requireIdList(body.ids)))
    }
    if (action === 'purge_expired') {
      const settings = await readDriveSettingsOnDisk()
      const retentionDays =
        typeof body.retentionDays === 'number' && body.retentionDays > 0
          ? body.retentionDays
          : settings.trashRetentionDays || DEFAULT_TRASH_RETENTION_DAYS
      const purged = await purgeExpiredTrashOnDisk(retentionDays, {
        recordTimestamp: true,
      })
      return json({ ok: true, retentionDays, purged })
    }
    if (action === 'doctor') {
      if (
        typeof body.fileName !== 'string' ||
        typeof body.source !== 'string'
      ) {
        fail(400, 'doctor requires fileName and source strings')
      }
      return json({ ok: true, findings: examine(body.fileName, body.source) })
    }
    if (action === 'diff') {
      if (typeof body.prior !== 'string' || typeof body.incoming !== 'string') {
        fail(400, 'diff requires prior and incoming strings')
      }
      return json({ ok: true, ops: diffSources(body.prior, body.incoming) })
    }
    return json(
      {
        ok: false,
        error:
          'Expected action save, apply_ops, create_folder, rename_folder, delete_folder, move_document, update_document_meta, save_as_template, rename_document, update_settings, trash, restore, delete, empty_trash, purge_expired, doctor, or diff',
      },
      400,
    )
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE({ request }: { request: Request }) {
  const url = new URL(request.url)
  try {
    if (url.searchParams.get('empty') === '1') {
      if (!url.searchParams.has('ids')) {
        fail(400, 'empty requires an ids list')
      }
      const ids = (url.searchParams.get('ids') ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
      return json(await emptyTrashOnDisk(ids))
    }
    const slug = requireSlug(url.searchParams.get('slug'))
    const folderPath = url.searchParams.get('folderPath')
    return json(
      await deleteDocumentPermanentlyOnDisk({
        slug,
        folderPath: folderPath ?? undefined,
      }),
    )
  } catch (error) {
    return errorResponse(error)
  }
}

export const Route = createFileRoute('/api/marble')({
  server: {
    handlers: {
      GET,
      POST,
      DELETE,
    },
  },
})
