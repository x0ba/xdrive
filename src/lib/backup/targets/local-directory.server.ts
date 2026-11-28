import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'

import {
  createDriveArchiveBuffer,
  extractBackupArchiveToDir,
  readArchiveManifest,
} from '../archive.server'
import {
  assertSafeBackupDestination,
  assertSafeSnapshotId,
} from '../path-safety.server'
import { BackupError, MAX_RETENTION_COUNT, MIN_RETENTION_COUNT } from '../types'
import type { BackupSnapshot, LocalDirectoryTargetConfig } from '../types'
import type {
  BackupContext,
  BackupTarget,
  BackupValidationResult,
  WriteSnapshotOptions,
  WriteSnapshotResult,
} from '../provider.server'

const ARCHIVE_FILE_PATTERN = /^xdrive-backup-([A-Za-z0-9._-]+)\.zip$/
const INDEX_FILE_NAME = '.xdrive-backup-index.json'

interface BackupIndexFile {
  version: 1
  snapshots: Partial<Record<string, BackupSnapshot>>
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

function formatSnapshotId(now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  return `${stamp}-${randomBytes(3).toString('hex')}`
}

function archiveFileName(id: string): string {
  return `xdrive-backup-${id}.zip`
}

async function writeAtomicBuffer(
  fullPath: string,
  data: Buffer | string,
): Promise<void> {
  await mkdir(path.dirname(fullPath), { recursive: true })
  const temporary = `${fullPath}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await writeFile(temporary, data)
    await rename(temporary, fullPath)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

async function checkDirectoryWritable(dirPath: string): Promise<void> {
  let current = path.resolve(dirPath)
  for (let depth = 0; depth < 4096; depth += 1) {
    try {
      const info = await stat(current)
      if (!info.isDirectory()) {
        throw new BackupError(
          400,
          `Backup path exists and is not a directory: ${current}`,
          'INVALID_DESTINATION',
        )
      }
      await access(current, constants.R_OK | constants.W_OK)
      return
    } catch (error) {
      if (error instanceof BackupError) {
        throw error
      }
      if (!isEnoent(error)) {
        throw new BackupError(
          400,
          `Backup destination is not accessible: ${error instanceof Error ? error.message : String(error)}`,
          'DESTINATION_UNREACHABLE',
        )
      }
      const parent = path.dirname(current)
      if (parent === current) {
        throw new BackupError(
          400,
          'Backup destination parent directory could not be resolved',
          'DESTINATION_UNREACHABLE',
        )
      }
      current = parent
    }
  }
  throw new BackupError(
    400,
    'Backup destination parent directory could not be resolved',
    'DESTINATION_UNREACHABLE',
  )
}

async function readIndexFile(destDir: string): Promise<BackupIndexFile> {
  try {
    const raw = await readFile(path.join(destDir, INDEX_FILE_NAME), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      (parsed as { version?: unknown }).version === 1 &&
      typeof (parsed as { snapshots?: unknown }).snapshots === 'object' &&
      (parsed as { snapshots?: unknown }).snapshots !== null
    ) {
      return {
        version: 1,
        snapshots: (parsed as BackupIndexFile).snapshots,
      }
    }
  } catch {
    // Missing or corrupt index falls back to empty and reconciles from disk.
  }
  return { version: 1, snapshots: {} }
}

async function writeIndexFile(
  destDir: string,
  index: BackupIndexFile,
): Promise<void> {
  await writeAtomicBuffer(
    path.join(destDir, INDEX_FILE_NAME),
    JSON.stringify(index, null, 2),
  )
}

function validateRetentionCount(retentionCount: number): void {
  if (
    !Number.isFinite(retentionCount) ||
    !Number.isInteger(retentionCount) ||
    retentionCount < MIN_RETENTION_COUNT ||
    retentionCount > MAX_RETENTION_COUNT
  ) {
    throw new BackupError(
      400,
      `Retention count must be an integer between ${MIN_RETENTION_COUNT} and ${MAX_RETENTION_COUNT}`,
      'INVALID_RETENTION',
    )
  }
}

function sortSnapshotsNewestFirst(
  snapshots: BackupSnapshot[],
): BackupSnapshot[] {
  return snapshots.slice().sort((a, b) => {
    const timeDiff = Date.parse(b.createdAt) - Date.parse(a.createdAt)
    if (Number.isFinite(timeDiff) && timeDiff !== 0) {
      return timeDiff
    }
    return b.id < a.id ? -1 : b.id > a.id ? 1 : 0
  })
}

async function validateLocalTarget(
  config: LocalDirectoryTargetConfig,
  driveDir: string,
): Promise<string> {
  validateRetentionCount(config.retentionCount)
  const resolvedDir = await assertSafeBackupDestination(
    config.directory,
    driveDir,
  )
  await checkDirectoryWritable(resolvedDir)
  return resolvedDir
}

export const localDirectoryBackupTarget: BackupTarget<LocalDirectoryTargetConfig> =
  {
    descriptor: {
      id: 'local-directory',
      name: 'Local Directory',
      description:
        'Writes timestamped .zip archives to a local folder or mounted external drive with configurable retention pruning.',
      supportsRetention: true,
      credentialNote:
        'No credentials required. Choose any folder outside marble-drive (such as ~/.xdrive/backups or an external drive).',
    },

    async validate(
      config: LocalDirectoryTargetConfig,
      ctx: BackupContext,
    ): Promise<BackupValidationResult> {
      try {
        const resolvedDir = await validateLocalTarget(config, ctx.driveDir)
        return {
          ok: true,
          resolvedTargetSummary: resolvedDir,
        }
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Backup destination validation failed',
        }
      }
    },

    async init(
      config: LocalDirectoryTargetConfig,
      ctx: BackupContext,
    ): Promise<void> {
      const resolvedDir = await validateLocalTarget(config, ctx.driveDir)
      await mkdir(resolvedDir, { recursive: true })
    },

    async writeSnapshot(
      config: LocalDirectoryTargetConfig,
      options: WriteSnapshotOptions,
    ): Promise<WriteSnapshotResult> {
      const now = options.now ?? new Date()
      const ctx: BackupContext = { driveDir: options.driveDir, now: () => now }
      const resolvedDir = await validateLocalTarget(config, options.driveDir)
      await mkdir(resolvedDir, { recursive: true })

      const id = formatSnapshotId(now)
      const createdAt = now.toISOString()
      const fileName = archiveFileName(id)
      const zipPath = path.resolve(resolvedDir, fileName)
      if (path.dirname(zipPath) !== resolvedDir) {
        throw new BackupError(400, 'Invalid snapshot archive path')
      }

      const { buffer, manifest } = await createDriveArchiveBuffer({
        driveDir: options.driveDir,
        id,
        createdAt,
        trigger: options.trigger,
        label: options.label,
      })

      await writeAtomicBuffer(zipPath, buffer)

      const snapshot: BackupSnapshot = {
        id,
        providerId: 'local-directory',
        createdAt,
        trigger: options.trigger,
        sizeBytes: buffer.byteLength,
        fileCount: manifest.fileCount,
        locationSummary: zipPath,
        ...(options.label ? { label: options.label } : {}),
      }

      const index = await readIndexFile(resolvedDir)
      index.snapshots[id] = snapshot

      const allSnapshots = await this.listSnapshots(config, ctx)
      let prunedCount = 0

      if (!options.skipPrune && allSnapshots.length > config.retentionCount) {
        const toDelete = allSnapshots
          .slice(config.retentionCount)
          .filter((item) => item.id !== id)

        for (const stale of toDelete) {
          const staleSafeId = assertSafeSnapshotId(stale.id)
          const staleZipPath = path.resolve(
            resolvedDir,
            archiveFileName(staleSafeId),
          )
          if (path.dirname(staleZipPath) === resolvedDir) {
            await rm(staleZipPath, { force: true })
            delete index.snapshots[staleSafeId]
            prunedCount += 1
          }
        }
      }

      await writeIndexFile(resolvedDir, index)

      return { snapshot, prunedCount }
    },

    async listSnapshots(
      config: LocalDirectoryTargetConfig,
      ctx: BackupContext,
    ): Promise<BackupSnapshot[]> {
      const resolvedDir = await validateLocalTarget(config, ctx.driveDir)
      let names: string[]
      try {
        names = await readdir(resolvedDir)
      } catch (error) {
        if (isEnoent(error)) {
          return []
        }
        throw error
      }

      const index = await readIndexFile(resolvedDir)
      const nextSnapshots: Partial<Record<string, BackupSnapshot>> = {}
      const discoveredIds = new Set<string>()
      let dirty = false

      for (const name of names) {
        const match = ARCHIVE_FILE_PATTERN.exec(name)
        if (!match) continue
        const rawId = match[1]
        let safeId: string
        try {
          safeId = assertSafeSnapshotId(rawId)
        } catch {
          continue
        }
        discoveredIds.add(safeId)

        const cached = index.snapshots[safeId]
        const fullPath = path.resolve(resolvedDir, name)
        if (cached && cached.locationSummary === fullPath) {
          nextSnapshots[safeId] = cached
          continue
        }

        try {
          const [buffer, info] = await Promise.all([
            readFile(fullPath),
            stat(fullPath),
          ])
          const manifest = await readArchiveManifest(buffer)
          nextSnapshots[safeId] = {
            id: safeId,
            providerId: 'local-directory',
            createdAt: manifest.createdAt,
            trigger: manifest.trigger,
            sizeBytes: info.size,
            fileCount: manifest.fileCount,
            locationSummary: fullPath,
            ...(manifest.label ? { label: manifest.label } : {}),
          }
          dirty = true
        } catch {
          // Ignore malformed/partial files when listing.
        }
      }

      for (const key of Object.keys(index.snapshots)) {
        if (!discoveredIds.has(key)) {
          dirty = true
          break
        }
      }

      if (dirty) {
        await writeIndexFile(resolvedDir, {
          version: 1,
          snapshots: nextSnapshots,
        }).catch(() => {})
      }

      return sortSnapshotsNewestFirst(
        Object.values(nextSnapshots).filter(
          (item): item is BackupSnapshot => item !== undefined,
        ),
      )
    },

    async restoreSnapshotToDir(
      config: LocalDirectoryTargetConfig,
      snapshotId: string,
      stagingDir: string,
      ctx: BackupContext,
    ): Promise<BackupSnapshot> {
      const resolvedDir = await validateLocalTarget(config, ctx.driveDir)
      const safeId = assertSafeSnapshotId(snapshotId)
      const zipPath = path.resolve(resolvedDir, archiveFileName(safeId))
      if (path.dirname(zipPath) !== resolvedDir) {
        throw new BackupError(400, 'Invalid snapshot archive path')
      }

      let buffer: Buffer
      let info
      try {
        ;[buffer, info] = await Promise.all([readFile(zipPath), stat(zipPath)])
      } catch (error) {
        if (isEnoent(error)) {
          throw new BackupError(
            404,
            `Backup snapshot "${safeId}" was not found`,
            'SNAPSHOT_NOT_FOUND',
          )
        }
        throw error
      }

      const manifest = await extractBackupArchiveToDir(buffer, stagingDir)
      return {
        id: safeId,
        providerId: 'local-directory',
        createdAt: manifest.createdAt,
        trigger: manifest.trigger,
        sizeBytes: info.size,
        fileCount: manifest.fileCount,
        locationSummary: zipPath,
        ...(manifest.label ? { label: manifest.label } : {}),
      }
    },

    async deleteSnapshot(
      config: LocalDirectoryTargetConfig,
      snapshotId: string,
      ctx: BackupContext,
    ): Promise<void> {
      const resolvedDir = await validateLocalTarget(config, ctx.driveDir)
      const safeId = assertSafeSnapshotId(snapshotId)
      const zipPath = path.resolve(resolvedDir, archiveFileName(safeId))
      if (path.dirname(zipPath) !== resolvedDir) {
        throw new BackupError(400, 'Invalid snapshot archive path')
      }

      try {
        await stat(zipPath)
      } catch (error) {
        if (isEnoent(error)) {
          throw new BackupError(
            404,
            `Backup snapshot "${safeId}" was not found`,
            'SNAPSHOT_NOT_FOUND',
          )
        }
        throw error
      }

      await rm(zipPath, { force: true })
      const index = await readIndexFile(resolvedDir)
      if (index.snapshots[safeId]) {
        delete index.snapshots[safeId]
        await writeIndexFile(resolvedDir, index).catch(() => {})
      }
    },
  }
