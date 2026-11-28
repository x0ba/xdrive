import { createFileRoute } from '@tanstack/react-router'

import { DriveStorageError } from '#/lib/marble/drive-storage.server'
import {
  createVersion,
  getVersion,
  listVersions,
  restoreVersion,
} from '#/lib/marble/version-history.server'

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

function errorResponse(error: unknown) {
  const status = error instanceof DriveStorageError ? error.status : 400
  const message =
    error instanceof Error ? error.message : 'Version history request failed'
  return json({ ok: false, error: message }, status)
}

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url)
  const docId = url.searchParams.get('docId')?.trim()
  const versionId = url.searchParams.get('versionId')?.trim()

  try {
    if (!docId) {
      return json({ ok: false, error: 'docId is required' }, 400)
    }
    if (versionId) {
      const version = await getVersion(docId, versionId)
      if (!version) {
        return json(
          { ok: false, error: `Version "${versionId}" not found` },
          404,
        )
      }
      return json({ ok: true, docId, version })
    }
    const versions = await listVersions(docId)
    return json({ ok: true, docId, versions })
  } catch (error) {
    return errorResponse(error)
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
    const action = body.action
    const docId = typeof body.docId === 'string' ? body.docId.trim() : ''
    if (!docId) {
      return json({ ok: false, error: 'docId is required' }, 400)
    }

    if (action === 'create') {
      const label = typeof body.label === 'string' ? body.label : ''
      const result = await createVersion({
        docId,
        slug: typeof body.slug === 'string' ? body.slug : undefined,
        folderPath:
          body.folderPath === null
            ? ''
            : typeof body.folderPath === 'string'
              ? body.folderPath
              : undefined,
        source: typeof body.source === 'string' ? body.source : undefined,
        kind: 'named',
        trigger: 'manual',
        label,
        author: typeof body.author === 'string' ? body.author : undefined,
        title: typeof body.title === 'string' ? body.title : undefined,
      })
      return json({ ok: true, ...result })
    }

    if (action === 'restore') {
      const versionId =
        typeof body.versionId === 'string' ? body.versionId.trim() : ''
      if (!versionId) {
        return json({ ok: false, error: 'versionId is required' }, 400)
      }
      const result = await restoreVersion({
        docId,
        versionId,
        slug: typeof body.slug === 'string' ? body.slug : undefined,
        folderPath:
          body.folderPath === null
            ? ''
            : typeof body.folderPath === 'string'
              ? body.folderPath
              : undefined,
        author: typeof body.author === 'string' ? body.author : undefined,
      })
      return json(result)
    }

    return json({ ok: false, error: 'Expected action create or restore' }, 400)
  } catch (error) {
    return errorResponse(error)
  }
}

export const Route = createFileRoute('/api/versions')({
  server: {
    handlers: {
      GET,
      POST,
    },
  },
})
