import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import JSZip from 'jszip'

import { resolveSafeArchiveEntryPath } from './path-safety.server'
import { BackupError } from './types'
import type {
  BackupArchiveFileEntry,
  BackupArchiveManifest,
  BackupTrigger,
} from './types'

const DEFAULT_MAX_FILES = 50_000
const DEFAULT_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024 // 2 GiB
const SYMLINK_TYPE_MASK = 0o170000
const SYMLINK_TYPE_VALUE = 0o120000

const EXCLUDED_EXACT_NAMES = new Set([
  '.DS_Store',
  'Thumbs.db',
  '.xdrive-backup.lock',
])

export interface ScannedDriveFile {
  relPosix: string
  fullPath: string
  size: number
}

export interface DriveBackupScanResult {
  directories: string[]
  files: ScannedDriveFile[]
}

export function sha256Hex(data: Buffer | Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex')
}

export function shouldExcludeDriveEntry(
  relPosixPath: string,
  name: string,
): boolean {
  if (EXCLUDED_EXACT_NAMES.has(name)) {
    return true
  }
  if (
    relPosixPath === '.xdrive-backup' ||
    relPosixPath.startsWith('.xdrive-backup/')
  ) {
    return true
  }
  if (name.endsWith('.tmp') || name.endsWith('.lock')) {
    return true
  }
  return false
}

export async function scanDriveForBackup(
  driveDir: string,
): Promise<DriveBackupScanResult> {
  const directories: string[] = []
  const files: ScannedDriveFile[] = []

  async function walk(currentDir: string, relPrefix: string): Promise<void> {
    let entries
    try {
      entries = await readdir(currentDir, { withFileTypes: true })
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'ENOENT'
      ) {
        return
      }
      throw error
    }

    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue
      }
      const relPosix = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
      if (shouldExcludeDriveEntry(relPosix, entry.name)) {
        continue
      }

      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        directories.push(relPosix)
        await walk(fullPath, relPosix)
      } else if (entry.isFile()) {
        const info = await stat(fullPath)
        files.push({
          relPosix,
          fullPath,
          size: info.size,
        })
      }
    }
  }

  await walk(path.resolve(driveDir), '')
  directories.sort()
  files.sort((a, b) =>
    a.relPosix < b.relPosix ? -1 : a.relPosix > b.relPosix ? 1 : 0,
  )
  return { directories, files }
}

export async function buildDriveSnapshotEntries(options: {
  driveDir: string
  id: string
  createdAt: string
  trigger: BackupTrigger
  label?: string
}): Promise<{
  manifest: BackupArchiveManifest
  files: Array<ScannedDriveFile & { content: Buffer; sha256: string }>
}> {
  const scan = await scanDriveForBackup(options.driveDir)
  const materializedFiles: Array<
    ScannedDriveFile & { content: Buffer; sha256: string }
  > = []
  const manifestFiles: BackupArchiveFileEntry[] = []
  let totalUncompressedBytes = 0

  for (const file of scan.files) {
    const content = await readFile(file.fullPath)
    const digest = sha256Hex(content)
    totalUncompressedBytes += content.byteLength
    materializedFiles.push({
      ...file,
      size: content.byteLength,
      content,
      sha256: digest,
    })
    manifestFiles.push({
      path: file.relPosix,
      size: content.byteLength,
      sha256: digest,
    })
  }

  const manifest: BackupArchiveManifest = {
    format: 'xdrive-backup',
    version: 1,
    id: options.id,
    createdAt: options.createdAt,
    trigger: options.trigger,
    ...(options.label ? { label: options.label } : {}),
    fileCount: manifestFiles.length,
    totalUncompressedBytes,
    directories: scan.directories,
    files: manifestFiles,
  }

  return { manifest, files: materializedFiles }
}

export async function createDriveArchiveBuffer(options: {
  driveDir: string
  id: string
  createdAt: string
  trigger: BackupTrigger
  label?: string
}): Promise<{ buffer: Buffer; manifest: BackupArchiveManifest }> {
  const { manifest, files } = await buildDriveSnapshotEntries(options)
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  zip.folder('drive')

  for (const dir of manifest.directories) {
    zip.folder(`drive/${dir}`)
  }

  for (const file of files) {
    zip.file(`drive/${file.relPosix}`, file.content)
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  return { buffer, manifest }
}

function parseManifest(rawText: string): BackupArchiveManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new BackupError(
      400,
      'Backup archive manifest.json is not valid JSON',
      'INVALID_MANIFEST',
    )
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BackupError(
      400,
      'Backup archive manifest.json must be an object',
      'INVALID_MANIFEST',
    )
  }
  const rec = parsed as Record<string, unknown>
  if (rec.format !== 'xdrive-backup' || rec.version !== 1) {
    throw new BackupError(
      400,
      'Unsupported backup archive manifest format or version',
      'INVALID_MANIFEST',
    )
  }
  if (
    typeof rec.id !== 'string' ||
    !rec.id.trim() ||
    typeof rec.createdAt !== 'string' ||
    !Array.isArray(rec.directories) ||
    !Array.isArray(rec.files)
  ) {
    throw new BackupError(
      400,
      'Backup archive manifest.json is missing required fields',
      'INVALID_MANIFEST',
    )
  }

  const trigger =
    rec.trigger === 'manual' ||
    rec.trigger === 'scheduled' ||
    rec.trigger === 'pre-restore'
      ? rec.trigger
      : 'manual'

  const directories: string[] = []
  for (const dir of rec.directories) {
    if (typeof dir !== 'string' || !dir.trim()) {
      throw new BackupError(
        400,
        'Backup manifest contains an invalid directory entry',
        'INVALID_MANIFEST',
      )
    }
    directories.push(dir)
  }

  const files: BackupArchiveFileEntry[] = []
  for (const entry of rec.files) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new BackupError(
        400,
        'Backup manifest contains an invalid file entry',
        'INVALID_MANIFEST',
      )
    }
    const item = entry as Record<string, unknown>
    if (
      typeof item.path !== 'string' ||
      typeof item.size !== 'number' ||
      !Number.isFinite(item.size) ||
      item.size < 0 ||
      typeof item.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(item.sha256)
    ) {
      throw new BackupError(
        400,
        'Backup manifest contains malformed file metadata',
        'INVALID_MANIFEST',
      )
    }
    files.push({
      path: item.path,
      size: item.size,
      sha256: item.sha256.toLowerCase(),
    })
  }

  const totalUncompressedBytes =
    typeof rec.totalUncompressedBytes === 'number' &&
    Number.isFinite(rec.totalUncompressedBytes)
      ? rec.totalUncompressedBytes
      : files.reduce((sum, item) => sum + item.size, 0)

  return {
    format: 'xdrive-backup',
    version: 1,
    id: rec.id,
    createdAt: rec.createdAt,
    trigger,
    ...(typeof rec.label === 'string' ? { label: rec.label } : {}),
    fileCount: files.length,
    totalUncompressedBytes,
    directories,
    files,
  }
}

export async function readArchiveManifest(
  buffer: Buffer,
): Promise<BackupArchiveManifest> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new BackupError(
      400,
      'Backup file is not a valid zip archive',
      'INVALID_ARCHIVE',
    )
  }
  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) {
    throw new BackupError(
      400,
      'Backup archive is missing manifest.json',
      'INVALID_MANIFEST',
    )
  }
  const text = await manifestFile.async('string')
  return parseManifest(text)
}

export async function extractBackupArchiveToDir(
  buffer: Buffer,
  stagingDir: string,
  limits?: { maxFiles?: number; maxTotalBytes?: number },
): Promise<BackupArchiveManifest> {
  const maxFiles = limits?.maxFiles ?? DEFAULT_MAX_FILES
  const maxTotalBytes = limits?.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new BackupError(
      400,
      'Backup file is not a valid zip archive',
      'INVALID_ARCHIVE',
    )
  }

  const manifestEntry = zip.file('manifest.json')
  if (!manifestEntry) {
    throw new BackupError(
      400,
      'Backup archive is missing manifest.json',
      'INVALID_MANIFEST',
    )
  }
  const manifest = parseManifest(await manifestEntry.async('string'))

  await mkdir(stagingDir, { recursive: true })

  let extractedFiles = 0
  let totalBytes = 0
  const extractedHashes = new Map<string, string>()
  const extractedSizes = new Map<string, number>()

  const entries = Object.values(zip.files)
  for (const entry of entries) {
    if (entry.name === 'manifest.json') {
      continue
    }
    if (entry.name === 'drive' || entry.name === 'drive/') {
      continue
    }
    if (!entry.name.startsWith('drive/')) {
      throw new BackupError(
        400,
        `Unexpected archive entry outside drive/: ${entry.name}`,
        'UNSAFE_ARCHIVE_ENTRY',
      )
    }

    if (
      typeof entry.unixPermissions === 'number' &&
      (entry.unixPermissions & SYMLINK_TYPE_MASK) === SYMLINK_TYPE_VALUE
    ) {
      throw new BackupError(
        400,
        `Archive contains a disallowed symbolic link: ${entry.name}`,
        'SYMLINK_REJECTED',
      )
    }

    const innerPath = entry.name.slice('drive/'.length)
    const safeTarget = resolveSafeArchiveEntryPath(stagingDir, innerPath)

    if (entry.dir) {
      await mkdir(safeTarget.fullPath, { recursive: true })
      continue
    }

    extractedFiles += 1
    if (extractedFiles > maxFiles) {
      throw new BackupError(
        400,
        `Backup archive exceeds file limit (${maxFiles})`,
        'ARCHIVE_TOO_LARGE',
      )
    }

    const content = await entry.async('nodebuffer')
    totalBytes += content.byteLength
    if (totalBytes > maxTotalBytes) {
      throw new BackupError(
        400,
        'Backup archive exceeds maximum uncompressed size limit',
        'ARCHIVE_TOO_LARGE',
      )
    }

    await mkdir(path.dirname(safeTarget.fullPath), { recursive: true })
    await writeFile(safeTarget.fullPath, content)
    extractedHashes.set(safeTarget.relativePosix, sha256Hex(content))
    extractedSizes.set(safeTarget.relativePosix, content.byteLength)
  }

  for (const dirPath of manifest.directories) {
    const safeDir = resolveSafeArchiveEntryPath(stagingDir, dirPath)
    await mkdir(safeDir.fullPath, { recursive: true })
  }

  if (extractedHashes.size !== manifest.files.length) {
    throw new BackupError(
      400,
      `Archive file count (${extractedHashes.size}) does not match manifest (${manifest.files.length})`,
      'CHECKSUM_MISMATCH',
    )
  }

  for (const expected of manifest.files) {
    const safeExpected = resolveSafeArchiveEntryPath(stagingDir, expected.path)
    const actualHash = extractedHashes.get(safeExpected.relativePosix)
    const actualSize = extractedSizes.get(safeExpected.relativePosix)
    if (
      actualHash === undefined ||
      actualSize === undefined ||
      actualHash !== expected.sha256 ||
      actualSize !== expected.size
    ) {
      throw new BackupError(
        400,
        `Integrity verification failed for ${expected.path}`,
        'CHECKSUM_MISMATCH',
      )
    }
  }

  return manifest
}
