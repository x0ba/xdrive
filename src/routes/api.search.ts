import { createFileRoute } from '@tanstack/react-router'

import {
  rebuildDriveSearchIndex,
  searchDrive,
} from '#/lib/search/drive-search.server'
import { normalizeSearchType } from '#/lib/search/types'
import type { SearchItemType } from '#/lib/search/types'

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

function parseTypesFromParams(
  params: URLSearchParams,
): SearchItemType[] | undefined {
  const rawValues = [...params.getAll('type'), ...params.getAll('types')]
  if (rawValues.length === 0) return undefined

  const picked = new Set<SearchItemType>()
  for (const chunk of rawValues) {
    for (const part of chunk.split(',')) {
      const normalized = normalizeSearchType(part)
      if (normalized) picked.add(normalized)
    }
  }
  return picked.size > 0 ? [...picked] : undefined
}

function parseTypesFromUnknown(raw: unknown): SearchItemType[] | undefined {
  if (typeof raw === 'string') {
    const picked = new Set<SearchItemType>()
    for (const part of raw.split(',')) {
      const normalized = normalizeSearchType(part)
      if (normalized) picked.add(normalized)
    }
    return picked.size > 0 ? [...picked] : undefined
  }
  if (Array.isArray(raw)) {
    const picked = new Set<SearchItemType>()
    for (const item of raw) {
      if (typeof item !== 'string') continue
      const normalized = normalizeSearchType(item)
      if (normalized) picked.add(normalized)
    }
    return picked.size > 0 ? [...picked] : undefined
  }
  return undefined
}

function parseBoolFlag(raw: string | null): boolean {
  if (!raw) return false
  const clean = raw.trim().toLowerCase()
  return clean === '1' || clean === 'true' || clean === 'yes'
}

function parseOptionalInt(raw: string | null): number | undefined {
  if (!raw) return undefined
  const num = Number(raw)
  return Number.isFinite(num) ? Math.trunc(num) : undefined
}

export async function GET({ request }: { request: Request }) {
  try {
    const url = new URL(request.url)
    const query = url.searchParams.get('q') ?? ''
    const types = parseTypesFromParams(url.searchParams)
    const includeTrash =
      parseBoolFlag(url.searchParams.get('includeTrash')) ||
      parseBoolFlag(url.searchParams.get('trash'))
    const limit = parseOptionalInt(url.searchParams.get('limit'))
    const offset = parseOptionalInt(url.searchParams.get('offset'))

    const result = await searchDrive({
      query,
      types,
      includeTrash,
      limit,
      offset,
    })

    return json({ ok: true, ...result })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Drive search request failed'
    return json({ ok: false, error: message }, 500)
  }
}

export async function POST({ request }: { request: Request }) {
  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json(
        { ok: false, error: 'Request body must be a JSON object' },
        400,
      )
    }
    body = parsed as Record<string, unknown>
  } catch {
    return json({ ok: false, error: 'Request body must be valid JSON' }, 400)
  }

  try {
    if (body.action === 'rebuild') {
      const rebuilt = await rebuildDriveSearchIndex()
      return json({ ok: true, ...rebuilt })
    }

    const query =
      typeof body.query === 'string'
        ? body.query
        : typeof body.q === 'string'
          ? body.q
          : ''
    const types = parseTypesFromUnknown(body.types ?? body.type)
    const includeTrash =
      body.includeTrash === true ||
      body.trash === true ||
      body.trash === '1' ||
      body.includeTrash === '1'
    const limit =
      typeof body.limit === 'number' && Number.isFinite(body.limit)
        ? Math.trunc(body.limit)
        : undefined
    const offset =
      typeof body.offset === 'number' && Number.isFinite(body.offset)
        ? Math.trunc(body.offset)
        : undefined

    const result = await searchDrive({
      query,
      types,
      includeTrash,
      limit,
      offset,
    })

    return json({ ok: true, ...result })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Drive search request failed'
    return json({ ok: false, error: message }, 500)
  }
}

export const Route = createFileRoute('/api/search')({
  server: {
    handlers: {
      GET,
      POST,
    },
  },
})
