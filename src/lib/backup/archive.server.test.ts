import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createDriveArchiveBuffer,
  extractBackupArchiveToDir,
  scanDriveForBackup,
  sha256Hex,
} from './archive.server'
import { BackupError } from './types'

describe('drive backup archive and extraction', () => {
  let tempRoot: string
  let driveDir: string
  let externalDir: string

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'xdrive-archive-test-'))
    driveDir = path.join(tempRoot, 'marble-drive')
    externalDir = path.join(tempRoot, 'outside')
    await mkdir(driveDir, { recursive: true })
    await mkdir(externalDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('archives entire Drive including hidden version-history folders, empty folders, .trash, and .xdrive while excluding temp/lock files and symlinks', async () => {
    await mkdir(path.join(driveDir, 'Research', 'EmptySubfolder'), {
      recursive: true,
    })
    await mkdir(path.join(driveDir, 'Templates'), { recursive: true })
    await mkdir(path.join(driveDir, '.trash'), { recursive: true })
    await mkdir(path.join(driveDir, '.xdrive', 'chats'), { recursive: true })
    await mkdir(path.join(driveDir, '.xdrive', 'versions', 'doc-1'), {
      recursive: true,
    })
    await mkdir(path.join(driveDir, '.history'), { recursive: true })
    await mkdir(path.join(driveDir, '.xdrive-backup'), { recursive: true })

    await writeFile(path.join(driveDir, 'root.mrbl'), '<h1>Root</h1>', 'utf8')
    await writeFile(
      path.join(driveDir, 'Research', 'notes.mrbl'),
      '<h1>Notes</h1>',
      'utf8',
    )
    await writeFile(
      path.join(driveDir, 'Templates', 'custom.mrbl'),
      '<h1>Tpl</h1>',
      'utf8',
    )
    await writeFile(
      path.join(driveDir, '.trash', 'deleted.mrbl'),
      '<h1>Trash</h1>',
      'utf8',
    )
    await writeFile(
      path.join(driveDir, '.xdrive', 'metadata.json'),
      '{"version":2}',
      'utf8',
    )
    await writeFile(
      path.join(driveDir, '.xdrive', 'chats', 'chat-1.json'),
      '{"id":"chat-1"}',
      'utf8',
    )
    await writeFile(
      path.join(driveDir, '.xdrive', 'versions', 'doc-1', 'v1.mrbl'),
      '<h1>v1</h1>',
      'utf8',
    )
    await writeFile(
      path.join(driveDir, '.history', 'snapshot.mrbl'),
      '<h1>hist</h1>',
      'utf8',
    )

    // Excluded artifacts
    await writeFile(path.join(driveDir, '.DS_Store'), 'junk', 'utf8')
    await writeFile(path.join(driveDir, 'Research', 'write.tmp'), 'tmp', 'utf8')
    await writeFile(path.join(driveDir, '.xdrive', 'db.lock'), 'lock', 'utf8')
    await writeFile(
      path.join(driveDir, '.xdrive-backup', 'secret.json'),
      'skip',
      'utf8',
    )

    await writeFile(path.join(externalDir, 'secret.txt'), 'outside', 'utf8')
    await symlink(
      path.join(externalDir, 'secret.txt'),
      path.join(driveDir, 'escape-link.txt'),
    )

    const scan = await scanDriveForBackup(driveDir)
    const filePaths = scan.files.map((f) => f.relPosix)
    expect(filePaths).toEqual([
      '.history/snapshot.mrbl',
      '.trash/deleted.mrbl',
      '.xdrive/chats/chat-1.json',
      '.xdrive/metadata.json',
      '.xdrive/versions/doc-1/v1.mrbl',
      'Research/notes.mrbl',
      'Templates/custom.mrbl',
      'root.mrbl',
    ])
    expect(scan.directories).toContain('Research/EmptySubfolder')

    const { buffer, manifest } = await createDriveArchiveBuffer({
      driveDir,
      id: 'snap-1',
      createdAt: '2026-11-28T09:00:00.000Z',
      trigger: 'manual',
    })
    expect(manifest.fileCount).toBe(8)

    const restoreDir = path.join(tempRoot, 'restored')
    const extractedManifest = await extractBackupArchiveToDir(
      buffer,
      restoreDir,
    )
    expect(extractedManifest.fileCount).toBe(8)

    expect(await readFile(path.join(restoreDir, 'root.mrbl'), 'utf8')).toBe(
      '<h1>Root</h1>',
    )
    expect(
      await readFile(
        path.join(restoreDir, '.xdrive', 'versions', 'doc-1', 'v1.mrbl'),
        'utf8',
      ),
    ).toBe('<h1>v1</h1>')
    expect(
      await readFile(
        path.join(restoreDir, '.history', 'snapshot.mrbl'),
        'utf8',
      ),
    ).toBe('<h1>hist</h1>')
    const emptyFolderStat = await stat(
      path.join(restoreDir, 'Research', 'EmptySubfolder'),
    )
    expect(emptyFolderStat.isDirectory()).toBe(true)
    await expect(
      stat(path.join(restoreDir, 'escape-link.txt')),
    ).rejects.toThrow()
  })

  it('rejects zip-slip entries, symlinks in archives, tampered checksums, and zip-bomb limits', async () => {
    const zipSlip = new JSZip()
    zipSlip.file(
      'manifest.json',
      JSON.stringify({
        format: 'xdrive-backup',
        version: 1,
        id: 'evil',
        createdAt: '2026-11-28T09:00:00.000Z',
        trigger: 'manual',
        fileCount: 1,
        totalUncompressedBytes: 4,
        directories: [],
        files: [
          { path: '../../pwned.txt', size: 4, sha256: sha256Hex('evil') },
        ],
      }),
    )
    zipSlip.file('drive/../../pwned.txt', 'evil')
    const slipBuffer = await zipSlip.generateAsync({ type: 'nodebuffer' })

    await expect(
      extractBackupArchiveToDir(slipBuffer, path.join(tempRoot, 'out-1')),
    ).rejects.toThrow(BackupError)

    const symlinkZip = new JSZip()
    symlinkZip.file(
      'manifest.json',
      JSON.stringify({
        format: 'xdrive-backup',
        version: 1,
        id: 'sym',
        createdAt: '2026-11-28T09:00:00.000Z',
        trigger: 'manual',
        fileCount: 1,
        totalUncompressedBytes: 4,
        directories: [],
        files: [{ path: 'link.txt', size: 4, sha256: sha256Hex('/etc') }],
      }),
    )
    symlinkZip.file('drive/link.txt', '/etc', { unixPermissions: 0o120777 })
    const symBuffer = await symlinkZip.generateAsync({
      type: 'nodebuffer',
      platform: 'UNIX',
    })

    await expect(
      extractBackupArchiveToDir(symBuffer, path.join(tempRoot, 'out-2')),
    ).rejects.toThrow(/symbolic link/i)

    const { buffer: validBuffer } = await createDriveArchiveBuffer({
      driveDir,
      id: 'snap-2',
      createdAt: '2026-11-28T09:00:00.000Z',
      trigger: 'manual',
    })
    const loaded = await JSZip.loadAsync(validBuffer)
    loaded.file('drive/injected.mrbl', 'tampered')
    const tamperedBuffer = await loaded.generateAsync({ type: 'nodebuffer' })

    await expect(
      extractBackupArchiveToDir(tamperedBuffer, path.join(tempRoot, 'out-3')),
    ).rejects.toThrow(/manifest/i)

    await writeFile(path.join(driveDir, 'a.mrbl'), '1234567890', 'utf8')
    const { buffer: sizedBuffer } = await createDriveArchiveBuffer({
      driveDir,
      id: 'snap-3',
      createdAt: '2026-11-28T09:00:00.000Z',
      trigger: 'manual',
    })
    await expect(
      extractBackupArchiveToDir(sizedBuffer, path.join(tempRoot, 'out-4'), {
        maxTotalBytes: 5,
      }),
    ).rejects.toThrow(/exceeds maximum/i)
  })
})
