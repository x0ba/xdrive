import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BackupManager } from './manager.server'

const execFileAsync = promisify(execFile)

describe('git-repository backup target', () => {
  let tempRoot: string
  let driveDir: string
  let configDir: string
  let repoDir: string
  let bareRemoteDir: string
  let clockMs: number
  let manager: BackupManager

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'xdrive-git-backup-'))
    driveDir = path.join(tempRoot, 'marble-drive')
    configDir = path.join(tempRoot, 'backup-config')
    repoDir = path.join(tempRoot, 'drive-git-backup')
    bareRemoteDir = path.join(tempRoot, 'remote.git')

    await mkdir(driveDir, { recursive: true })
    await mkdir(bareRemoteDir, { recursive: true })
    await execFileAsync('git', ['init', '--bare'], { cwd: bareRemoteDir })

    clockMs = Date.parse('2026-11-28T11:00:00.000Z')
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

  it('commits snapshots, pushes to bare remote, lists commits, and restores older commits safely', async () => {
    await manager.updateConfig({
      activeProvider: 'git-repository',
      targets: {
        'git-repository': {
          directory: repoDir,
          branch: 'backups',
          remoteUrl: bareRemoteDir,
          autoPush: true,
        },
      },
    })

    await mkdir(path.join(driveDir, 'Folder', 'EmptyDir'), { recursive: true })
    await writeFile(
      path.join(driveDir, 'Folder', 'notes.mrbl'),
      '<h1>Commit 1</h1>',
      'utf8',
    )
    const run1 = await manager.runBackup({ trigger: 'manual', label: 'c1' })
    expect(run1.status).toBe('success')
    expect(run1.snapshotId).toMatch(/^[0-9a-f]{40}$/i)

    // Verify commit reached bare remote
    const { stdout: remoteRefs } = await execFileAsync(
      'git',
      ['show-ref', '--heads'],
      { cwd: bareRemoteDir },
    )
    expect(remoteRefs).toContain('refs/heads/backups')

    // Second snapshot deletes Folder/notes.mrbl and adds new.mrbl
    await rm(path.join(driveDir, 'Folder', 'notes.mrbl'))
    await writeFile(
      path.join(driveDir, 'new.mrbl'),
      '<h1>Commit 2</h1>',
      'utf8',
    )
    const run2 = await manager.runBackup({ trigger: 'manual', label: 'c2' })
    expect(run2.snapshotId).not.toBe(run1.snapshotId)

    const status = await manager.getStatus()
    expect(status.snapshots).toHaveLength(2)
    expect(status.snapshots[0]?.id).toBe(run2.snapshotId)
    expect(status.snapshots[1]?.id).toBe(run1.snapshotId)

    // Restore first commit
    const restored = await manager.restoreSnapshot(run1.snapshotId!)
    expect(restored.restoredSnapshot.id).toBe(run1.snapshotId)
    expect(
      await readFile(path.join(driveDir, 'Folder', 'notes.mrbl'), 'utf8'),
    ).toBe('<h1>Commit 1</h1>')
    expect(
      (await stat(path.join(driveDir, 'Folder', 'EmptyDir'))).isDirectory(),
    ).toBe(true)
    await expect(stat(path.join(driveDir, 'new.mrbl'))).rejects.toThrow()
  })

  it('rejects git remote URLs containing embedded credentials', async () => {
    await expect(
      manager.updateConfig({
        activeProvider: 'git-repository',
        targets: {
          'git-repository': {
            directory: repoDir,
            branch: 'main',
            remoteUrl: 'https://token123@github.com/x0ba/xdrive-backups.git',
            autoPush: false,
          },
        },
      }),
    ).rejects.toThrow(/Do not embed credentials/i)
  })
})
