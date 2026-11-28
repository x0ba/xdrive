import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GET, POST } from '#/routes/api.backup'
import type { BackupStatusResponse } from '#/lib/backup/types'

function postRequest(payload: unknown): Request {
  return new Request('http://localhost/api/backup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

describe('/api/backup route handlers', () => {
  let tempRoot: string
  let driveDir: string
  let configDir: string
  let backupDir: string
  let prevDriveDir: string | undefined
  let prevConfigDir: string | undefined
  let prevBackupDir: string | undefined

  beforeEach(async () => {
    prevDriveDir = process.env.XDRIVE_DRIVE_DIR
    prevConfigDir = process.env.XDRIVE_BACKUP_CONFIG_DIR
    prevBackupDir = process.env.XDRIVE_BACKUP_DIR

    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'xdrive-api-backup-'))
    driveDir = path.join(tempRoot, 'marble-drive')
    configDir = path.join(tempRoot, 'backup-config')
    backupDir = path.join(tempRoot, 'backups')

    await mkdir(driveDir, { recursive: true })
    process.env.XDRIVE_DRIVE_DIR = driveDir
    process.env.XDRIVE_BACKUP_CONFIG_DIR = configDir
    process.env.XDRIVE_BACKUP_DIR = backupDir
  })

  afterEach(async () => {
    if (prevDriveDir === undefined) delete process.env.XDRIVE_DRIVE_DIR
    else process.env.XDRIVE_DRIVE_DIR = prevDriveDir

    if (prevConfigDir === undefined) delete process.env.XDRIVE_BACKUP_CONFIG_DIR
    else process.env.XDRIVE_BACKUP_CONFIG_DIR = prevConfigDir

    if (prevBackupDir === undefined) delete process.env.XDRIVE_BACKUP_DIR
    else process.env.XDRIVE_BACKUP_DIR = prevBackupDir

    await rm(tempRoot, { recursive: true, force: true })
  })

  it('supports GET status, config validation, manual backup, confirmed restore, and snapshot deletion', async () => {
    const initialRes = await GET()
    expect(initialRes.status).toBe(200)
    const initialBody = (await initialRes.json()) as {
      ok: boolean
    } & BackupStatusResponse
    expect(initialBody.ok).toBe(true)
    expect(initialBody.config.activeProvider).toBe('local-directory')
    expect(initialBody.snapshots).toEqual([])

    // Reject recursive backup destination inside marble-drive
    const unsafeRes = await POST({
      request: postRequest({
        action: 'update_config',
        config: {
          activeProvider: 'local-directory',
          targets: {
            'local-directory': {
              directory: path.join(driveDir, 'nested-backups'),
              retentionCount: 10,
            },
          },
        },
      }),
    })
    expect(unsafeRes.status).toBe(400)
    const unsafeBody = (await unsafeRes.json()) as {
      ok: boolean
      error: string
    }
    expect(unsafeBody.ok).toBe(false)
    expect(unsafeBody.error).toMatch(/inside the Drive directory/i)

    // Save valid config
    const saveRes = await POST({
      request: postRequest({
        action: 'update_config',
        config: {
          activeProvider: 'local-directory',
          schedule: { enabled: false, intervalMinutes: 30 },
          targets: {
            'local-directory': {
              directory: backupDir,
              retentionCount: 10,
            },
          },
        },
      }),
    })
    expect(saveRes.status).toBe(200)

    await writeFile(
      path.join(driveDir, 'alpha.mrbl'),
      '<h1>Alpha v1</h1>',
      'utf8',
    )
    const backupRes = await POST({
      request: postRequest({ action: 'backup_now', label: 'Initial' }),
    })
    expect(backupRes.status).toBe(200)
    const backupBody = (await backupRes.json()) as {
      ok: boolean
      run: { status: string; snapshotId: string; fileCount: number }
      status: BackupStatusResponse
    }
    expect(backupBody.ok).toBe(true)
    expect(backupBody.run.status).toBe('success')
    expect(backupBody.run.fileCount).toBe(1)
    expect(backupBody.status.snapshots).toHaveLength(1)

    // Restore without confirm=true is rejected
    const unconfirmedRestore = await POST({
      request: postRequest({
        action: 'restore',
        snapshotId: backupBody.run.snapshotId,
      }),
    })
    expect(unconfirmedRestore.status).toBe(400)

    // Mutate Drive and confirm restore
    await writeFile(
      path.join(driveDir, 'alpha.mrbl'),
      '<h1>Alpha v2</h1>',
      'utf8',
    )
    const confirmedRestore = await POST({
      request: postRequest({
        action: 'restore',
        snapshotId: backupBody.run.snapshotId,
        confirm: true,
      }),
    })
    expect(confirmedRestore.status).toBe(200)
    const restoreBody = (await confirmedRestore.json()) as {
      ok: boolean
      safetySnapshot: { id: string } | null
    }
    expect(restoreBody.ok).toBe(true)
    expect(restoreBody.safetySnapshot?.id).toBeTruthy()
    expect(await readFile(path.join(driveDir, 'alpha.mrbl'), 'utf8')).toBe(
      '<h1>Alpha v1</h1>',
    )

    // Delete original snapshot
    const deleteRes = await POST({
      request: postRequest({
        action: 'delete_snapshot',
        snapshotId: backupBody.run.snapshotId,
      }),
    })
    expect(deleteRes.status).toBe(200)
    const deleteBody = (await deleteRes.json()) as {
      ok: boolean
      status: BackupStatusResponse
    }
    expect(
      deleteBody.status.snapshots.some(
        (s) => s.id === backupBody.run.snapshotId,
      ),
    ).toBe(false)
  })
})
