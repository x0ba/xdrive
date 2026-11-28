import { createFileRoute } from '@tanstack/react-router'

import { getDefaultBackupManager } from '#/lib/backup/manager.server'
import {
  ensureBackupSchedulerStarted,
  getDefaultBackupScheduler,
  syncBackupScheduler,
} from '#/lib/backup/scheduler.server'
import { BackupError } from '#/lib/backup/types'

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

function errorResponse(error: unknown) {
  const status = error instanceof BackupError ? error.status : 400
  const message =
    error instanceof Error ? error.message : 'Backup request failed'
  return json({ ok: false, error: message }, status)
}

function collectAllowedOrigins(request: Request): Set<string> {
  const allowed = new Set<string>()
  const reqUrl = new URL(request.url)
  allowed.add(reqUrl.origin)

  const host = request.headers.get('host')?.trim()
  if (host) {
    try {
      allowed.add(new URL(`${reqUrl.protocol}//${host}`).origin)
    } catch {
      // Ignore malformed Host header.
    }
  }

  const forwardedHost = request.headers
    .get('x-forwarded-host')
    ?.split(',')[0]
    ?.trim()
  if (forwardedHost) {
    const forwardedProto = request.headers
      .get('x-forwarded-proto')
      ?.split(',')[0]
      ?.trim()
    const proto = forwardedProto
      ? forwardedProto.endsWith(':')
        ? forwardedProto
        : `${forwardedProto}:`
      : reqUrl.protocol
    try {
      allowed.add(new URL(`${proto}//${forwardedHost}`).origin)
    } catch {
      // Ignore malformed forwarded headers.
    }
  }

  return allowed
}

export function assertSameOriginJsonPost(request: Request): void {
  const rawContentType = request.headers.get('content-type') ?? ''
  const mediaType = rawContentType.split(';', 1)[0].trim().toLowerCase()
  if (mediaType !== 'application/json') {
    throw new BackupError(
      415,
      'Content-Type must be application/json',
      'UNSUPPORTED_MEDIA_TYPE',
    )
  }

  const secFetchMode = request.headers
    .get('sec-fetch-mode')
    ?.trim()
    .toLowerCase()
  if (secFetchMode === 'no-cors') {
    throw new BackupError(
      403,
      'Cross-origin requests are not allowed',
      'CSRF_REJECTED',
    )
  }

  const secFetchSite = request.headers
    .get('sec-fetch-site')
    ?.trim()
    .toLowerCase()
  if (
    secFetchSite &&
    secFetchSite !== 'same-origin' &&
    secFetchSite !== 'none'
  ) {
    throw new BackupError(
      403,
      'Cross-origin requests are not allowed',
      'CSRF_REJECTED',
    )
  }

  const allowedOrigins = collectAllowedOrigins(request)
  const originHeader = request.headers.get('origin')?.trim()
  if (originHeader) {
    if (originHeader === 'null' || !allowedOrigins.has(originHeader)) {
      throw new BackupError(
        403,
        'Cross-origin requests are not allowed',
        'CSRF_REJECTED',
      )
    }
    return
  }

  const refererHeader = request.headers.get('referer')?.trim()
  if (refererHeader) {
    let refererOrigin: string
    try {
      refererOrigin = new URL(refererHeader).origin
    } catch {
      throw new BackupError(
        403,
        'Cross-origin requests are not allowed',
        'CSRF_REJECTED',
      )
    }
    if (!allowedOrigins.has(refererOrigin)) {
      throw new BackupError(
        403,
        'Cross-origin requests are not allowed',
        'CSRF_REJECTED',
      )
    }
  }
}

export async function GET() {
  try {
    const scheduler = !process.env.VITEST
      ? ensureBackupSchedulerStarted()
      : getDefaultBackupScheduler()
    if (!process.env.VITEST) {
      await scheduler.ensureScheduled()
    }
    const status = await getDefaultBackupManager().getStatus(
      scheduler.getNextRunAt(),
    )
    return json({ ok: true, ...status })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST({ request }: { request: Request }) {
  try {
    assertSameOriginJsonPost(request)
  } catch (error) {
    return errorResponse(error)
  }

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

  const manager = getDefaultBackupManager()
  const scheduler = !process.env.VITEST
    ? ensureBackupSchedulerStarted()
    : getDefaultBackupScheduler()

  try {
    const action = body.action

    if (action === 'update_config') {
      await manager.updateConfig(body.config ?? body)
      if (!process.env.VITEST) {
        await syncBackupScheduler()
      }
      const status = await manager.getStatus(scheduler.getNextRunAt())
      return json({ ok: true, status })
    }

    if (action === 'validate') {
      const validation = await manager.validateCandidateConfig(body.config)
      return json({ ok: true, validation })
    }

    if (action === 'backup_now') {
      const label =
        typeof body.label === 'string' && body.label.trim()
          ? body.label.trim()
          : undefined
      let run
      try {
        run = await manager.runBackup({ trigger: 'manual', label })
      } finally {
        if (!process.env.VITEST) {
          await syncBackupScheduler().catch(() => {})
        }
      }
      const status = await manager.getStatus(scheduler.getNextRunAt())
      return json({ ok: true, run, status })
    }

    if (action === 'restore') {
      if (body.confirm !== true) {
        return json(
          {
            ok: false,
            error: 'Restore requires explicit confirmation (confirm: true)',
          },
          400,
        )
      }
      if (typeof body.snapshotId !== 'string' || !body.snapshotId.trim()) {
        return json({ ok: false, error: 'snapshotId is required' }, 400)
      }
      const result = await manager.restoreSnapshot(body.snapshotId.trim())
      const status = await manager.getStatus(scheduler.getNextRunAt())
      return json({
        ok: true,
        restoredSnapshot: result.restoredSnapshot,
        safetySnapshot: result.safetySnapshot,
        status,
      })
    }

    if (action === 'delete_snapshot') {
      if (typeof body.snapshotId !== 'string' || !body.snapshotId.trim()) {
        return json({ ok: false, error: 'snapshotId is required' }, 400)
      }
      const snapshotId = body.snapshotId.trim()
      await manager.deleteSnapshot(snapshotId)
      const status = await manager.getStatus(scheduler.getNextRunAt())
      return json({ ok: true, deletedId: snapshotId, status })
    }

    return json(
      {
        ok: false,
        error:
          'Expected action update_config, validate, backup_now, restore, or delete_snapshot',
      },
      400,
    )
  } catch (error) {
    return errorResponse(error)
  }
}

export const Route = createFileRoute('/api/backup')({
  server: {
    handlers: {
      GET,
      POST,
    },
  },
})
