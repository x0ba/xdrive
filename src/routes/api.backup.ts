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
      const run = await manager.runBackup({ trigger: 'manual', label })
      if (!process.env.VITEST) {
        await syncBackupScheduler()
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
