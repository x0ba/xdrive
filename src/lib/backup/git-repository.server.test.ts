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

  it('supports pre-existing repos with README.md, bypasses gitignore/excludes, preserves raw CRLF/clean-filter bytes, and enforces archive limits', async () => {
    await mkdir(repoDir, { recursive: true })
    await execFileAsync('git', ['init', '-b', 'backups'], { cwd: repoDir })
    await execFileAsync('git', ['config', 'user.name', 'Test'], {
      cwd: repoDir,
    })
    await execFileAsync('git', ['config', 'user.email', 'test@local'], {
      cwd: repoDir,
    })

    // Existing tracked file outside drive/
    await writeFile(
      path.join(repoDir, 'README.md'),
      '# Existing Repo\n',
      'utf8',
    )
    await execFileAsync('git', ['add', 'README.md'], { cwd: repoDir })
    await execFileAsync(
      'git',
      ['-c', 'commit.gpgsign=false', 'commit', '-m', 'Initial README'],
      { cwd: repoDir },
    )

    // Hostile git settings: repo exclude, global excludesFile, autocrlf=true, clean filter
    const globalExcludes = path.join(tempRoot, 'global-excludes')
    await writeFile(globalExcludes, '*.json\n', 'utf8')
    await writeFile(
      path.join(repoDir, '.git', 'info', 'exclude'),
      '*.mrbl\n',
      'utf8',
    )
    await mkdir(path.join(repoDir, '.git', 'info'), { recursive: true })
    await writeFile(
      path.join(repoDir, '.git', 'info', 'attributes'),
      '* filter=shout\n',
      'utf8',
    )
    await execFileAsync(
      'git',
      ['config', '--local', 'core.excludesFile', globalExcludes],
      { cwd: repoDir },
    )
    await execFileAsync('git', ['config', '--local', 'core.autocrlf', 'true'], {
      cwd: repoDir,
    })
    await execFileAsync(
      'git',
      ['config', '--local', 'filter.shout.clean', 'tr a-z A-Z'],
      { cwd: repoDir },
    )

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

    await mkdir(path.join(driveDir, '.xdrive'), { recursive: true })
    const crlfSource = 'line one\r\nlowercase content\r\n'
    await writeFile(path.join(driveDir, 'crlf.mrbl'), crlfSource, 'utf8')
    await writeFile(
      path.join(driveDir, '.xdrive', 'metadata.json'),
      '{"version":2}',
      'utf8',
    )

    const run1 = await manager.runBackup({ trigger: 'manual' })
    expect(run1.status).toBe('success')
    expect(run1.fileCount).toBe(2)

    // Pre-existing README.md remains intact in repoDir
    expect(await readFile(path.join(repoDir, 'README.md'), 'utf8')).toBe(
      '# Existing Repo\n',
    )

    // Delete live files and restore from git commit
    await rm(path.join(driveDir, 'crlf.mrbl'))
    await rm(path.join(driveDir, '.xdrive', 'metadata.json'))
    await manager.restoreSnapshot(run1.snapshotId!)

    expect(await readFile(path.join(driveDir, 'crlf.mrbl'), 'utf8')).toBe(
      crlfSource,
    )
    expect(
      await readFile(path.join(driveDir, '.xdrive', 'metadata.json'), 'utf8'),
    ).toBe('{"version":2}')

    // Exceeding maxArchiveBytes rolls back commit and does not push to bare remote
    const { stdout: headBeforeFail } = await execFileAsync(
      'git',
      ['rev-parse', 'HEAD'],
      { cwd: repoDir },
    )
    const { stdout: remoteBeforeFail } = await execFileAsync(
      'git',
      ['rev-parse', 'refs/heads/backups'],
      { cwd: bareRemoteDir },
    )

    await writeFile(
      path.join(driveDir, 'large.mrbl'),
      'a'.repeat(10_000),
      'utf8',
    )
    await expect(
      manager.runBackup({
        trigger: 'manual',
        limits: { maxArchiveBytes: 200 },
      }),
    ).rejects.toMatchObject({ code: 'BACKUP_LIMIT_EXCEEDED' })

    const { stdout: headAfterFail } = await execFileAsync(
      'git',
      ['rev-parse', 'HEAD'],
      { cwd: repoDir },
    )
    const { stdout: remoteAfterFail } = await execFileAsync(
      'git',
      ['rev-parse', 'refs/heads/backups'],
      { cwd: bareRemoteDir },
    )
    expect(headAfterFail.trim()).toBe(headBeforeFail.trim())
    expect(remoteAfterFail.trim()).toBe(remoteBeforeFail.trim())
  })
})
