import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  assertSafeBackupConfigDir,
  defaultBackupRuntimeState,
  readBackupConfig,
  readBackupRuntimeState,
  writeBackupConfig,
  writeBackupRuntimeState,
} from './config-storage.server'
import {
  assertSafeBackupDestination,
  assertSafeGitBranch,
  assertSafeGitRemoteUrl,
  assertSafeSnapshotId,
  expandUserPath,
  resolveSafeArchiveEntryPath,
} from './path-safety.server'
import { BackupError } from './types'

describe('backup path safety guards', () => {
  let tempRoot: string
  let driveDir: string

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'xdrive-path-safety-'))
    driveDir = path.join(tempRoot, 'marble-drive')
    await mkdir(driveDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('rejects destinations equal to, inside, or parent of marble-drive, and filesystem root', async () => {
    await expect(
      assertSafeBackupDestination(driveDir, driveDir),
    ).rejects.toThrow(BackupError)

    await expect(
      assertSafeBackupDestination(path.join(driveDir, 'backups'), driveDir),
    ).rejects.toThrow(/inside the Drive directory/i)

    await expect(
      assertSafeBackupDestination(
        path.join(driveDir, 'nested', 'new-backups'),
        driveDir,
      ),
    ).rejects.toThrow(/inside the Drive directory/i)

    await expect(
      assertSafeBackupDestination(tempRoot, driveDir),
    ).rejects.toThrow(/parent directory/i)

    await expect(assertSafeBackupDestination('/', driveDir)).rejects.toThrow(
      /filesystem root/i,
    )
  })

  it('rejects symlinks pointing inside marble-drive', async () => {
    const insideTarget = path.join(driveDir, 'hidden-target')
    await mkdir(insideTarget, { recursive: true })
    const symlinkPath = path.join(tempRoot, 'backup-link')
    await symlink(insideTarget, symlinkPath)

    await expect(
      assertSafeBackupDestination(symlinkPath, driveDir),
    ).rejects.toThrow(/inside the Drive directory/i)

    await expect(
      assertSafeBackupDestination(path.join(symlinkPath, 'sub'), driveDir),
    ).rejects.toThrow(/inside the Drive directory/i)
  })

  it('allows safe sibling and non-existent nested backup directories', async () => {
    const siblingDir = path.join(tempRoot, 'backups', 'daily')
    const resolved = await assertSafeBackupDestination(siblingDir, driveDir)
    expect(resolved).toBe(path.resolve(siblingDir))

    const homeExpanded = expandUserPath('~/xdrive-test-backups')
    expect(homeExpanded).toBe(path.join(os.homedir(), 'xdrive-test-backups'))
  })

  it('rejects path traversal and zip-slip entry paths while allowing valid nested Drive entries', () => {
    const stagingRoot = path.join(tempRoot, 'staging')

    for (const malicious of [
      '../secret.txt',
      'a/../../escape.txt',
      '/etc/passwd',
      'C:\\evil.txt',
      'folder\\nested.mrbl',
      'folder/\0bad.mrbl',
      './doc.mrbl',
      'a/./b.mrbl',
      '',
    ]) {
      expect(() => resolveSafeArchiveEntryPath(stagingRoot, malicious)).toThrow(
        BackupError,
      )
    }

    const versionEntry = resolveSafeArchiveEntryPath(
      stagingRoot,
      '.xdrive/versions/doc-1/v1.mrbl',
    )
    expect(versionEntry.relativePosix).toBe('.xdrive/versions/doc-1/v1.mrbl')
    expect(versionEntry.fullPath).toBe(
      path.join(stagingRoot, '.xdrive', 'versions', 'doc-1', 'v1.mrbl'),
    )

    const trashEntry = resolveSafeArchiveEntryPath(
      stagingRoot,
      '.trash/doc.mrbl',
    )
    expect(trashEntry.relativePosix).toBe('.trash/doc.mrbl')
  })

  it('validates snapshot IDs, git branch names, and git remote URLs without embedded credentials', () => {
    expect(assertSafeSnapshotId('2026-11-28T09-30-00-000Z-a1b2c3')).toBe(
      '2026-11-28T09-30-00-000Z-a1b2c3',
    )
    expect(() => assertSafeSnapshotId('../evil')).toThrow(BackupError)
    expect(() => assertSafeSnapshotId('foo/bar')).toThrow(BackupError)

    expect(assertSafeGitBranch('backup/main')).toBe('backup/main')
    expect(() => assertSafeGitBranch('--upload-pack=evil')).toThrow(BackupError)
    expect(() => assertSafeGitBranch('main..other')).toThrow(BackupError)

    expect(assertSafeGitRemoteUrl('git@github.com:x0ba/xdrive.git')).toBe(
      'git@github.com:x0ba/xdrive.git',
    )
    expect(assertSafeGitRemoteUrl('https://github.com/x0ba/xdrive.git')).toBe(
      'https://github.com/x0ba/xdrive.git',
    )
    expect(() =>
      assertSafeGitRemoteUrl('https://user:secret@github.com/x0ba/xdrive.git'),
    ).toThrow(/Do not embed credentials/i)
    expect(() =>
      assertSafeGitRemoteUrl(
        'https://ghp_secretToken@github.com/x0ba/xdrive.git',
      ),
    ).toThrow(/Do not embed credentials/i)
    expect(() => assertSafeGitRemoteUrl('--config=evil')).toThrow(BackupError)
  })

  it('rejects backup config directories inside marble-drive (directly or via symlink)', async () => {
    const insideConfig = path.join(driveDir, '.xdrive', 'backup')
    await expect(
      assertSafeBackupConfigDir(insideConfig, driveDir),
    ).rejects.toThrow(/configuration directory cannot be inside/i)

    const insideTarget = path.join(driveDir, 'nested-cfg')
    await mkdir(insideTarget, { recursive: true })
    const linkConfig = path.join(tempRoot, 'cfg-link')
    await symlink(insideTarget, linkConfig)

    await expect(
      assertSafeBackupConfigDir(linkConfig, driveDir),
    ).rejects.toThrow(/configuration directory cannot be inside/i)

    await expect(readBackupConfig(insideConfig, driveDir)).rejects.toThrow(
      BackupError,
    )
    await expect(readBackupRuntimeState(linkConfig, driveDir)).rejects.toThrow(
      BackupError,
    )
    await expect(
      writeBackupRuntimeState(
        defaultBackupRuntimeState(),
        insideConfig,
        driveDir,
      ),
    ).rejects.toThrow(BackupError)

    const safeConfigDir = path.join(tempRoot, 'safe-config')
    const cfg = await readBackupConfig(safeConfigDir, driveDir)
    await expect(
      writeBackupConfig(cfg, insideConfig, driveDir),
    ).rejects.toThrow(BackupError)
  })
})
