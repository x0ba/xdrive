import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  resetDriveSearchCache,
  searchDrive,
} from '#/lib/search/drive-search.server'
import type * as DriveSearchServer from '#/lib/search/drive-search.server'
import { BackupManager } from './manager.server'

const resetDriveSearchCacheSpy = vi.hoisted(() => vi.fn())

vi.mock('#/lib/search/drive-search.server', async () => {
  const actual = await vi.importActual<typeof DriveSearchServer>(
    '#/lib/search/drive-search.server',
  )
  return {
    ...actual,
    resetDriveSearchCache: () => {
      resetDriveSearchCacheSpy()
      actual.resetDriveSearchCache()
    },
  }
})

function marbleDoc(text: string): string {
  return `<!doctype html>
<html lang="en" data-marble="1">
<head><meta charset="utf-8"><title>Notes</title></head>
<body><main data-marble-id="root"><p data-marble-id="p1">${text}</p></main></body>
</html>`
}

describe('BackupManager restore drops the Drive search cache', () => {
  let tempRoot: string
  let driveDir: string
  let configDir: string
  let backupDir: string
  let previousDriveDir: string | undefined
  let clockMs: number
  let manager: BackupManager

  beforeEach(async () => {
    resetDriveSearchCacheSpy.mockClear()
    resetDriveSearchCache()
    previousDriveDir = process.env.XDRIVE_DRIVE_DIR
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'xdrive-backup-search-'))
    driveDir = path.join(tempRoot, 'marble-drive')
    configDir = path.join(tempRoot, 'backup-config')
    backupDir = path.join(tempRoot, 'backups')
    await mkdir(driveDir, { recursive: true })
    process.env.XDRIVE_DRIVE_DIR = driveDir
    clockMs = Date.parse('2026-11-28T12:00:00.000Z')
    manager = new BackupManager({
      getDriveDir: () => driveDir,
      getConfigDir: () => configDir,
      now: () => {
        clockMs += 1_000
        return new Date(clockMs)
      },
    })
    await manager.updateConfig({
      activeProvider: 'local-directory',
      targets: {
        'local-directory': {
          directory: backupDir,
          retentionCount: 5,
        },
      },
    })
    resetDriveSearchCacheSpy.mockClear()
  })

  afterEach(async () => {
    resetDriveSearchCache()
    if (previousDriveDir === undefined) {
      delete process.env.XDRIVE_DRIVE_DIR
    } else {
      process.env.XDRIVE_DRIVE_DIR = previousDriveDir
    }
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('does not clear the search cache when restore fails before the directory swap', async () => {
    await expect(manager.restoreSnapshot('missing-snapshot')).rejects.toThrow()
    expect(resetDriveSearchCacheSpy).not.toHaveBeenCalled()
  })

  it('clears the search cache after a restore swap so results match the restored Drive', async () => {
    const docPath = path.join(driveDir, 'notes.mrbl')
    await writeFile(docPath, marbleDoc('snapshotzephyrtoken'), 'utf8')
    const run = await manager.runBackup({ trigger: 'manual', label: 'v1' })
    expect(run.snapshotId).toBeTruthy()

    await writeFile(docPath, marbleDoc('livezephyrtoken'), 'utf8')
    expect((await searchDrive({ query: 'livezephyrtoken' })).total).toBe(1)
    expect((await searchDrive({ query: 'snapshotzephyrtoken' })).total).toBe(0)
    expect(resetDriveSearchCacheSpy).not.toHaveBeenCalled()

    await manager.restoreSnapshot(run.snapshotId!)

    expect(resetDriveSearchCacheSpy).toHaveBeenCalledTimes(1)
    expect((await searchDrive({ query: 'snapshotzephyrtoken' })).total).toBe(1)
    expect((await searchDrive({ query: 'livezephyrtoken' })).total).toBe(0)
  })
})
