import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'

import JSZip from 'jszip'

import { resolveSafeArchiveEntryPath } from './path-safety.server'
import { BackupError } from './types'
import type {
  BackupArchiveFileEntry,
  BackupArchiveLimits,
  BackupArchiveManifest,
  BackupTrigger,
} from './types'

export const DEFAULT_MAX_BACKUP_FILES = 50_000
export const DEFAULT_MAX_BACKUP_BYTES = 2 * 1024 * 1024 * 1024 // 2 GiB
export const DEFAULT_MAX_MANIFEST_BYTES = 16 * 1024 * 1024 // 16 MiB
export const MAX_GIT_ARCHIVE_OUTPUT_BYTES = 256 * 1024 * 1024 // 256 MiB

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
  driveKey?: string
  label?: string
  limits?: BackupArchiveLimits
}): Promise<{
  manifest: BackupArchiveManifest
  files: Array<ScannedDriveFile & { content: Buffer; sha256: string }>
}> {
  const maxFiles = options.limits?.maxFiles ?? DEFAULT_MAX_BACKUP_FILES
  const maxTotalBytes =
    options.limits?.maxTotalBytes ?? DEFAULT_MAX_BACKUP_BYTES
  const maxManifestBytes =
    options.limits?.maxManifestBytes ?? DEFAULT_MAX_MANIFEST_BYTES

  const scan = await scanDriveForBackup(options.driveDir)
  if (scan.files.length > maxFiles) {
    throw new BackupError(
      400,
      `Drive contains ${scan.files.length} files, exceeding the ${maxFiles} file restore limit`,
      'BACKUP_LIMIT_EXCEEDED',
    )
  }

  let scannedBytes = 0
  for (const file of scan.files) {
    scannedBytes += file.size
    if (scannedBytes > maxTotalBytes) {
      throw new BackupError(
        400,
        `Drive total size exceeds the ${maxTotalBytes} byte restore limit`,
        'BACKUP_LIMIT_EXCEEDED',
      )
    }
  }

  const materializedFiles: Array<
    ScannedDriveFile & { content: Buffer; sha256: string }
  > = []
  const manifestFiles: BackupArchiveFileEntry[] = []
  let totalUncompressedBytes = 0

  for (const file of scan.files) {
    const content = await readFile(file.fullPath)
    totalUncompressedBytes += content.byteLength
    if (totalUncompressedBytes > maxTotalBytes) {
      throw new BackupError(
        400,
        `Drive total size exceeds the ${maxTotalBytes} byte restore limit`,
        'BACKUP_LIMIT_EXCEEDED',
      )
    }
    const digest = sha256Hex(content)
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
    ...(options.driveKey ? { driveKey: options.driveKey } : {}),
    ...(options.label ? { label: options.label } : {}),
    fileCount: manifestFiles.length,
    totalUncompressedBytes,
    directories: scan.directories,
    files: manifestFiles,
  }

  const manifestByteLength = Buffer.byteLength(
    JSON.stringify(manifest, null, 2),
    'utf8',
  )
  if (manifestByteLength > maxManifestBytes) {
    throw new BackupError(
      400,
      `Backup manifest exceeds the ${maxManifestBytes} byte limit`,
      'BACKUP_LIMIT_EXCEEDED',
    )
  }

  return { manifest, files: materializedFiles }
}

export async function createDriveArchiveBuffer(options: {
  driveDir: string
  id: string
  createdAt: string
  trigger: BackupTrigger
  driveKey?: string
  label?: string
  limits?: BackupArchiveLimits
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

  if (
    options.limits?.maxArchiveBytes !== undefined &&
    buffer.byteLength > options.limits.maxArchiveBytes
  ) {
    throw new BackupError(
      400,
      `Backup archive size (${buffer.byteLength} bytes) exceeds limit (${options.limits.maxArchiveBytes} bytes)`,
      'BACKUP_LIMIT_EXCEEDED',
    )
  }

  return { buffer, manifest }
}

function destroyStreamSafely(stream: NodeJS.ReadableStream): void {
  stream.pause()
  const destroyable = stream as NodeJS.ReadableStream & {
    destroy?: () => void
  }
  destroyable.destroy?.()
}

async function readZipEntryBounded(
  entry: JSZip.JSZipObject,
  maxBytes: number,
  errorMessage: string,
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const stream = entry.nodeStream('nodebuffer')
    const chunks: Buffer[] = []
    let bytesRead = 0
    let settled = false

    stream.on('data', (chunk: Buffer | Uint8Array | string) => {
      if (settled) return
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytesRead += buf.byteLength
      if (bytesRead > maxBytes) {
        settled = true
        destroyStreamSafely(stream)
        reject(new BackupError(400, errorMessage, 'ARCHIVE_TOO_LARGE'))
        return
      }
      chunks.push(buf)
    })

    stream.on('end', () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks, bytesRead))
    })

    stream.on('error', (error: unknown) => {
      if (settled) return
      settled = true
      reject(error instanceof Error ? error : new Error(String(error)))
    })
  })
}

async function streamZipEntryToFileBounded(
  entry: JSZip.JSZipObject,
  fullPath: string,
  remainingBudget: number,
): Promise<{ size: number; sha256: string }> {
  await mkdir(path.dirname(fullPath), { recursive: true })
  return await new Promise<{ size: number; sha256: string }>(
    (resolve, reject) => {
      const readStream = entry.nodeStream('nodebuffer')
      const writeStream = createWriteStream(fullPath)
      const hash = createHash('sha256')
      let bytesWritten = 0
      let writeEnded = false
      let settled = false

      const fail = (error: unknown) => {
        if (settled) return
        settled = true
        destroyStreamSafely(readStream)
        writeStream.destroy()
        void rm(fullPath, { force: true })
          .catch(() => {})
          .finally(() => {
            reject(error instanceof Error ? error : new Error(String(error)))
          })
      }

      readStream.on('data', (chunk: Buffer | Uint8Array | string) => {
        if (settled) return
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        bytesWritten += buf.byteLength
        if (bytesWritten > remainingBudget) {
          fail(
            new BackupError(
              400,
              'Backup archive exceeds maximum uncompressed size limit',
              'ARCHIVE_TOO_LARGE',
            ),
          )
          return
        }
        hash.update(buf)
        if (!writeStream.write(buf)) {
          readStream.pause()
        }
      })

      writeStream.on('drain', () => {
        if (!settled) {
          readStream.resume()
        }
      })

      readStream.on('end', () => {
        if (!settled) {
          writeEnded = true
          writeStream.end()
        }
      })

      writeStream.on('close', () => {
        if (settled) return
        if (!writeEnded) {
          fail(new Error('Archive write stream closed prematurely'))
          return
        }
        settled = true
        resolve({
          size: bytesWritten,
          sha256: hash.digest('hex'),
        })
      })

      readStream.on('error', fail)
      writeStream.on('error', fail)
    },
  )
}

async function verifyZipEntryBounded(
  entry: JSZip.JSZipObject,
  remainingBudget: number,
): Promise<{ size: number; sha256: string }> {
  return await new Promise<{ size: number; sha256: string }>(
    (resolve, reject) => {
      const stream = entry.nodeStream('nodebuffer')
      const hash = createHash('sha256')
      let bytesRead = 0
      let settled = false

      stream.on('data', (chunk: Buffer | Uint8Array | string) => {
        if (settled) return
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        bytesRead += buf.byteLength
        if (bytesRead > remainingBudget) {
          settled = true
          destroyStreamSafely(stream)
          reject(
            new BackupError(
              400,
              'Backup archive exceeds maximum uncompressed size limit',
              'ARCHIVE_TOO_LARGE',
            ),
          )
          return
        }
        hash.update(buf)
      })

      stream.on('end', () => {
        if (settled) return
        settled = true
        resolve({
          size: bytesRead,
          sha256: hash.digest('hex'),
        })
      })

      stream.on('error', (error: unknown) => {
        if (settled) return
        settled = true
        reject(error instanceof Error ? error : new Error(String(error)))
      })
    },
  )
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
    ...(typeof rec.driveKey === 'string' && rec.driveKey.trim()
      ? { driveKey: rec.driveKey.trim() }
      : {}),
    ...(typeof rec.label === 'string' ? { label: rec.label } : {}),
    fileCount: files.length,
    totalUncompressedBytes,
    directories,
    files,
  }
}

export async function readArchiveManifest(
  buffer: Buffer,
  limits?: BackupArchiveLimits,
): Promise<BackupArchiveManifest> {
  const maxManifestBytes =
    limits?.maxManifestBytes ?? DEFAULT_MAX_MANIFEST_BYTES
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
  const manifestBuffer = await readZipEntryBounded(
    manifestFile,
    maxManifestBytes,
    `Backup archive manifest.json exceeds ${maxManifestBytes} byte size limit`,
  )
  return parseManifest(manifestBuffer.toString('utf8'))
}

export interface ExtractBackupOptions extends BackupArchiveLimits {
  ignoreEntriesOutsideDrive?: boolean
}

async function processArchiveEntries(
  buffer: Buffer,
  targetDir: string | null,
  options?: ExtractBackupOptions,
): Promise<BackupArchiveManifest> {
  const maxFiles = options?.maxFiles ?? DEFAULT_MAX_BACKUP_FILES
  const maxTotalBytes = options?.maxTotalBytes ?? DEFAULT_MAX_BACKUP_BYTES
  const maxManifestBytes =
    options?.maxManifestBytes ?? DEFAULT_MAX_MANIFEST_BYTES
  const ignoreEntriesOutsideDrive = options?.ignoreEntriesOutsideDrive ?? false
  const validationRoot = targetDir ?? '/xdrive-verify-root'

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
  const manifestBuffer = await readZipEntryBounded(
    manifestEntry,
    maxManifestBytes,
    `Backup archive manifest.json exceeds ${maxManifestBytes} byte size limit`,
  )
  const manifest = parseManifest(manifestBuffer.toString('utf8'))

  if (manifest.files.length > maxFiles) {
    throw new BackupError(
      400,
      `Backup archive manifest exceeds file limit (${maxFiles})`,
      'ARCHIVE_TOO_LARGE',
    )
  }

  if (targetDir !== null) {
    await mkdir(targetDir, { recursive: true })
  }

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
      if (ignoreEntriesOutsideDrive) {
        continue
      }
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
    const safeTarget = resolveSafeArchiveEntryPath(validationRoot, innerPath)

    if (entry.dir) {
      if (targetDir !== null) {
        await mkdir(safeTarget.fullPath, { recursive: true })
      }
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

    const remainingBudget = maxTotalBytes - totalBytes
    const result =
      targetDir !== null
        ? await streamZipEntryToFileBounded(
            entry,
            safeTarget.fullPath,
            remainingBudget,
          )
        : await verifyZipEntryBounded(entry, remainingBudget)

    totalBytes += result.size
    extractedHashes.set(safeTarget.relativePosix, result.sha256)
    extractedSizes.set(safeTarget.relativePosix, result.size)
  }

  for (const dirPath of manifest.directories) {
    const safeDir = resolveSafeArchiveEntryPath(validationRoot, dirPath)
    if (targetDir !== null) {
      await mkdir(safeDir.fullPath, { recursive: true })
    }
  }

  if (extractedHashes.size !== manifest.files.length) {
    throw new BackupError(
      400,
      `Archive file count (${extractedHashes.size}) does not match manifest (${manifest.files.length})`,
      'CHECKSUM_MISMATCH',
    )
  }

  for (const expected of manifest.files) {
    const safeExpected = resolveSafeArchiveEntryPath(
      validationRoot,
      expected.path,
    )
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

export async function extractBackupArchiveToDir(
  buffer: Buffer,
  stagingDir: string,
  options?: ExtractBackupOptions,
): Promise<BackupArchiveManifest> {
  return await processArchiveEntries(buffer, stagingDir, options)
}

export async function verifyBackupArchiveBuffer(
  buffer: Buffer,
  options?: ExtractBackupOptions,
): Promise<BackupArchiveManifest> {
  return await processArchiveEntries(buffer, null, options)
}
