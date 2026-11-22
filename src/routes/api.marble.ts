import { randomBytes } from 'node:crypto'
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

// @ts-expect-error @bdhmin/marble has no type declarations.
import * as marbleCollab from '@bdhmin/marble/collab'
// @ts-expect-error @bdhmin/marble has no type declarations.
import * as marbleDoctor from '@bdhmin/marble/doctor'
// @ts-expect-error @bdhmin/marble has no type declarations.
import * as marbleGuard from '@bdhmin/marble/guard'
// @ts-expect-error @bdhmin/marble has no type declarations.
import * as marblePatcher from '@bdhmin/marble/patcher'
import { createFileRoute } from '@tanstack/react-router'

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

const DRIVE_DIR = '/home/daniel/Code/personal/xdrive/marble-drive'
const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
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
  const status = error instanceof MarbleHttpError ? error.status : 400
  return json({ ok: false, error: messageOf(error) }, status)
}

function isEnoent(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

function assertSlug(slug: string) {
  if (!SLUG_PATTERN.test(slug) || slug.includes('..')) {
    fail(400, 'Invalid slug')
  }
  return slug
}

function requireSlug(value: string | null | undefined) {
  if (!value) fail(400, 'slug is required')
  return assertSlug(value)
}

function fileNameFor(slug: string) {
  return `${assertSlug(slug)}.mrbl`
}

function mrblPath(slug: string) {
  const fileName = fileNameFor(slug)
  const full = path.resolve(DRIVE_DIR, fileName)
  if (path.dirname(full) !== path.resolve(DRIVE_DIR)) {
    fail(400, 'Invalid slug')
  }
  return full
}

function titleOf(source: string, slug: string) {
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

function nodeCountOf(source: string) {
  try {
    return [...knownIds(source)].length
  } catch {
    return source.match(/data-marble-id\s*=\s*["'][^"']*["']/g)?.length ?? 0
  }
}

function byteSizeOf(source: string) {
  return new TextEncoder().encode(source).byteLength
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

async function readOptional(slug: string) {
  try {
    return await readFile(mrblPath(slug), 'utf8')
  } catch (error) {
    if (isEnoent(error)) return null
    throw error
  }
}

async function writeDocument(slug: string, source: string) {
  await mkdir(DRIVE_DIR, { recursive: true })
  const target = mrblPath(slug)
  const temporary = `${target}.${randomBytes(8).toString('hex')}.tmp`
  try {
    await writeFile(temporary, source, 'utf8')
    await rename(temporary, target)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

function savedPayload(slug: string, source: string) {
  const fileName = fileNameFor(slug)
  return {
    ok: true as const,
    slug,
    fileName,
    nodeCount: nodeCountOf(source),
    byteSize: byteSizeOf(source),
    doctor: doctorHealth(fileName, source),
  }
}

async function listDrive() {
  let names: string[]
  try {
    names = await readdir(DRIVE_DIR)
  } catch (error) {
    if (isEnoent(error)) return json({ ok: true, documents: [] })
    throw error
  }

  const documents = (
    await Promise.all(
      names
        .filter((name) => name.endsWith('.mrbl'))
        .map(async (fileName) => {
          const slug = fileName.slice(0, -'.mrbl'.length)
          if (!SLUG_PATTERN.test(slug) || slug.includes('..')) return null
          const full = mrblPath(slug)
          const [source, info] = await Promise.all([
            readFile(full, 'utf8'),
            stat(full),
          ])
          const doctor = doctorHealth(fileName, source)
          return {
            slug,
            fileName,
            title: titleOf(source, slug),
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
  ).filter((document) => document !== null)

  documents.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1))
  return json({ ok: true, documents })
}

async function readDrive(slugValue: string | null) {
  const slug = requireSlug(slugValue)
  const source = await readOptional(slug)
  if (source === null) fail(404, `No marble document for slug "${slug}"`)
  const fileName = fileNameFor(slug)
  return json({
    ok: true,
    slug,
    source,
    knownIds: [...knownIds(source)],
    doctor: examine(fileName, source),
  })
}

async function sliceDrive(slugValue: string | null, id: string | null) {
  const slug = requireSlug(slugValue)
  if (!id) fail(400, 'id is required')
  const source = await readOptional(slug)
  if (source === null) fail(404, `No marble document for slug "${slug}"`)
  return json({
    ok: true,
    slug,
    id,
    slice: sliceOf(source, id),
    outline: outlineOf(source, id),
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
  source: unknown,
  ops: unknown,
) {
  if (!Array.isArray(ops)) fail(400, 'ops must be an array')
  const clientSource = typeof source === 'string' ? source : null
  const disk = slug ? await readOptional(slug) : null
  const currentSource = clientSource ?? disk
  if (currentSource === null) {
    fail(400, 'apply_ops requires source or an existing document slug')
  }

  const applied = applyValidated(currentSource, ops)
  if (disk !== null && clientSource !== null && disk !== clientSource) {
    return mergeOps(disk, diffSources(clientSource, applied)).source
  }
  return applied
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

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url)
  try {
    const action = url.searchParams.get('action')
    if (action === 'list') return await listDrive()
    if (action === 'read') return await readDrive(url.searchParams.get('slug'))
    if (action === 'slice') {
      return await sliceDrive(
        url.searchParams.get('slug'),
        url.searchParams.get('id'),
      )
    }
    return json(
      {
        ok: false,
        error: 'Expected action=list, action=read, or action=slice',
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
      await writeDocument(slug, body.source)
      return json(savedPayload(slug, body.source))
    }
    if (action === 'apply_ops') {
      const slug =
        typeof body.slug === 'string' ? assertSlug(body.slug) : undefined
      const nextSource = await applyPostedOps(slug, body.source, body.ops)
      if (slug) await writeDocument(slug, nextSource)
      const fileName = slug ? fileNameFor(slug) : 'unsaved.mrbl'
      return json({
        ok: true,
        source: nextSource,
        nodeCount: nodeCountOf(nextSource),
        byteSize: byteSizeOf(nextSource),
        doctor: examine(fileName, nextSource),
      })
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
        error: 'Expected action save, apply_ops, doctor, or diff',
      },
      400,
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
    },
  },
})
