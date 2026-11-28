import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BackupManager } from './manager.server'
import { BackupTargetRegistry } from './provider.server'
import { localDirectoryBackupTarget } from './targets/local-directory.server'
import type { BackupError } from './types'

describe('local-directory backup target and safe restore', () => {
  let tempRoot: string
  let driveDir: string
  let configDir: string
  let backupDir: string
  let clockMs: number
  let manager: BackupManager

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'xdrive-local-backup-'))
    driveDir = path.join(tempRoot, 'marble-drive')
    configDir = path.join(tempRoot, 'backup-config')
    backupDir = path.join(tempRoot, 'backups')
    await mkdir(driveDir, { recursive: true })
    clockMs = Date.parse('2026-11-28T10:00:00.000Z')

    manager = new BackupManager({
      getDriveDir: () => driveDir,
      getConfigDir: () => configDir,
      now: () => {
        clockMs += 1_000
        return new Date(clockMs)
      },
    })
  })

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('creates snapshots, discovers backups without index, prunes by retention, and preserves pre-restore safety snapshots', async () => {
    await manager.updateConfig({
      activeProvider: 'local-directory',
      targets: {
        'local-directory': {
          directory: backupDir,
          retentionCount: 2,
        },
      },
    })

    await writeFile(path.join(driveDir, 'doc.mrbl'), '<h1>v1</h1>', 'utf8')
    const run1 = await manager.runBackup({ trigger: 'manual', label: 'v1' })
    await writeFile(path.join(driveDir, 'doc.mrbl'), '<h1>v2</h1>', 'utf8')
    const run2 = await manager.runBackup({ trigger: 'manual', label: 'v2' })
    await writeFile(path.join(driveDir, 'doc.mrbl'), '<h1>v3</h1>', 'utf8')
    const run3 = await manager.runBackup({ trigger: 'manual', label: 'v3' })

    expect(run1.status).toBe('success')
    expect(run3.prunedCount).toBe(1)

    const statusBeforeDelete = await manager.getStatus()
    expect(statusBeforeDelete.snapshots.map((s) => s.id)).toEqual([
      run3.snapshotId,
      run2.snapshotId,
    ])

    // Remove index cache to verify archive discovery from disk alone
    await rm(path.join(backupDir, '.xdrive-backup-index.json'), { force: true })
    const discovered = await localDirectoryBackupTarget.listSnapshots(
      { directory: backupDir, retentionCount: 2 },
      { driveDir, now: () => new Date(clockMs) },
    )
    expect(discovered.map((s) => s.id)).toEqual([
      run3.snapshotId,
      run2.snapshotId,
    ])

    // Edit current drive to v4, then restore v2
    await writeFile(path.join(driveDir, 'doc.mrbl'), '<h1>v4-live</h1>', 'utf8')
    await writeFile(path.join(driveDir, 'extra.mrbl'), '<h1>extra</h1>', 'utf8')

    const restoreResult = await manager.restoreSnapshot(run2.snapshotId!)
    expect(restoreResult.restoredSnapshot.id).toBe(run2.snapshotId)
    expect(restoreResult.safetySnapshot?.trigger).toBe('pre-restore')

    // Drive now matches v2
    expect(await readFile(path.join(driveDir, 'doc.mrbl'), 'utf8')).toBe(
      '<h1>v2</h1>',
    )
    await expect(stat(path.join(driveDir, 'extra.mrbl'))).rejects.toThrow()

    // Safety snapshot preserves v4-live and was not pruned
    const afterRestore = await manager.getStatus()
    expect(
      afterRestore.snapshots.some(
        (s) => s.id === restoreResult.safetySnapshot?.id,
      ),
    ).toBe(true)

    await manager.restoreSnapshot(restoreResult.safetySnapshot!.id)
    expect(await readFile(path.join(driveDir, 'doc.mrbl'), 'utf8')).toBe(
      '<h1>v4-live</h1>',
    )
    expect(await readFile(path.join(driveDir, 'extra.mrbl'), 'utf8')).toBe(
      '<h1>extra</h1>',
    )
  })

  it('never partially overwrites marble-drive when restore fails on a corrupted or missing snapshot', async () => {
    await manager.updateConfig({
      activeProvider: 'local-directory',
      targets: {
        'local-directory': {
          directory: backupDir,
          retentionCount: 5,
        },
      },
    })

    await writeFile(
      path.join(driveDir, 'important.mrbl'),
      '<h1>Safe</h1>',
      'utf8',
    )
    const run = await manager.runBackup({ trigger: 'manual' })

    // Corrupt the zip file on disk
    const zipPath = path.join(backupDir, `xdrive-backup-${run.snapshotId}.zip`)
    const loaded = await JSZip.loadAsync(await readFile(zipPath))
    loaded.file('drive/important.mrbl', 'CORRUPTED_BYTES')
    await writeFile(zipPath, await loaded.generateAsync({ type: 'nodebuffer' }))

    // Modify live Drive after backup
    await writeFile(
      path.join(driveDir, 'important.mrbl'),
      '<h1>Live Unbroken</h1>',
      'utf8',
    )

    await expect(manager.restoreSnapshot(run.snapshotId!)).rejects.toThrow(
      /Integrity verification failed/i,
    )

    // Live Drive must remain untouched and no leftover staging directories remain
    expect(await readFile(path.join(driveDir, 'important.mrbl'), 'utf8')).toBe(
      '<h1>Live Unbroken</h1>',
    )
    const parentEntries = await readdir(tempRoot)
    expect(
      parentEntries.some((name) => name.includes('.restore-staging-')),
    ).toBe(false)

    // Deleting snapshot works cleanly
    await manager.deleteSnapshot(run.snapshotId!)
    const status = await manager.getStatus()
    expect(status.snapshots).toHaveLength(0)
  })

  it('rejects overlapping backup operations with 409 BackupError', async () => {
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let enteredFirst!: () => void
    const enteredPromise = new Promise<void>((resolve) => {
      enteredFirst = resolve
    })

    const slowRegistry = new BackupTargetRegistry()
    slowRegistry.register({
      ...localDirectoryBackupTarget,
      async writeSnapshot(cfg, opts) {
        enteredFirst()
        await firstGate
        return await localDirectoryBackupTarget.writeSnapshot(cfg, opts)
      },
    })

    const concurrentManager = new BackupManager({
      getDriveDir: () => driveDir,
      getConfigDir: () => configDir,
      registry: slowRegistry,
      now: () => new Date(clockMs),
    })

    await concurrentManager.updateConfig({
      activeProvider: 'local-directory',
      targets: {
        'local-directory': { directory: backupDir, retentionCount: 5 },
      },
    })

    const firstRun = concurrentManager.runBackup({ trigger: 'manual' })
    await enteredPromise

    await expect(
      concurrentManager.runBackup({ trigger: 'manual' }),
    ).rejects.toMatchObject({
      status: 409,
      name: 'BackupError',
    } satisfies Partial<BackupError>)

    releaseFirst()
    await expect(firstRun).resolves.toMatchObject({ status: 'success' })
  })
})
