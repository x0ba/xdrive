import { randomBytes } from 'node:crypto'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'

import { getDriveDir, withDriveLock } from '#/lib/marble/drive-storage.server'
import { scanDriveForBackup } from './archive.server'
import {
  getBackupConfigDir,
  readBackupConfig,
  readBackupRuntimeState,
  sanitizeBackupConfig,
  writeBackupConfig,
  writeBackupRuntimeState,
} from './config-storage.server'
import { createDefaultBackupTargetRegistry } from './provider.server'
import type { BackupTargetRegistry } from './provider.server'
import { BackupError } from './types'
import type {
  BackupConfig,
  BackupRunRecord,
  BackupRuntimeState,
  BackupSnapshot,
  BackupStatusResponse,
  BackupTrigger,
  BackupValidationState,
} from './types'

export interface BackupManagerDeps {
  getDriveDir?: () => string
  getConfigDir?: (driveDir: string) => string
  registry?: BackupTargetRegistry
  now?: () => Date
}

export interface RestoreBackupResult {
  restoredSnapshot: BackupSnapshot
  safetySnapshot: BackupSnapshot | null
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath)
    return true
  } catch {
    return false
  }
}

export class BackupManager {
  private readonly resolveDriveDir: () => string
  private readonly resolveConfigDir: (driveDir: string) => string
  private readonly registry: BackupTargetRegistry
  private readonly now: () => Date
  private activeOperation: 'backup' | 'restore' | null = null
  private onConfigChanged?: () => void

  constructor(deps?: BackupManagerDeps) {
    this.resolveDriveDir = deps?.getDriveDir ?? getDriveDir
    this.resolveConfigDir = deps?.getConfigDir ?? getBackupConfigDir
    this.registry = deps?.registry ?? createDefaultBackupTargetRegistry()
    this.now = deps?.now ?? (() => new Date())
  }

  setOnConfigChanged(callback: () => void): void {
    this.onConfigChanged = callback
  }

  isBusy(): boolean {
    return this.activeOperation !== null
  }

  getActiveOperation(): 'backup' | 'restore' | null {
    return this.activeOperation
  }

  private getPaths(): { driveDir: string; configDir: string } {
    const driveDir = this.resolveDriveDir()
    const configDir = this.resolveConfigDir(driveDir)
    return { driveDir, configDir }
  }

  async getConfigAndState(): Promise<{
    driveDir: string
    configDir: string
    config: BackupConfig
    state: BackupRuntimeState
  }> {
    const { driveDir, configDir } = this.getPaths()
    const [config, state] = await Promise.all([
      readBackupConfig(configDir),
      readBackupRuntimeState(configDir),
    ])
    return { driveDir, configDir, config, state }
  }

  async validateCandidateConfig(
    rawConfig: unknown,
  ): Promise<BackupValidationState> {
    const { driveDir, config: current } = await this.getConfigAndState()
    let candidate: BackupConfig
    try {
      candidate = sanitizeBackupConfig(rawConfig, current, { strict: true })
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Invalid backup configuration',
      }
    }
    const target = this.registry.get(candidate.activeProvider)
    return await target.validate(candidate.targets[candidate.activeProvider], {
      driveDir,
      now: this.now,
    })
  }

  async updateConfig(rawPatch: unknown): Promise<BackupConfig> {
    const {
      driveDir,
      configDir,
      config: current,
      state,
    } = await this.getConfigAndState()
    const nextConfig = sanitizeBackupConfig(rawPatch, current, { strict: true })
    const target = this.registry.get(nextConfig.activeProvider)
    const validation = await target.validate(
      nextConfig.targets[nextConfig.activeProvider],
      { driveDir, now: this.now },
    )
    if (!validation.ok) {
      throw new BackupError(
        400,
        validation.error ?? 'Backup target configuration is invalid',
        'INVALID_TARGET',
      )
    }

    await writeBackupConfig(nextConfig, configDir)

    if (!current.schedule.enabled && nextConfig.schedule.enabled) {
      await writeBackupRuntimeState(
        {
          ...state,
          scheduleAnchorAt: this.now().toISOString(),
        },
        configDir,
      )
    }

    this.onConfigChanged?.()
    return nextConfig
  }

  async runBackup(options?: {
    trigger?: BackupTrigger
    label?: string
    skipPrune?: boolean
  }): Promise<BackupRunRecord> {
    if (this.activeOperation !== null) {
      throw new BackupError(
        409,
        `Cannot start backup while a ${this.activeOperation} operation is already in progress`,
        'BACKUP_BUSY',
      )
    }

    this.activeOperation = 'backup'
    const trigger: BackupTrigger = options?.trigger ?? 'manual'
    const startedDate = this.now()
    const startedAt = startedDate.toISOString()
    const runId = `run-${randomBytes(6).toString('hex')}`

    try {
      const { driveDir, configDir, config, state } =
        await this.getConfigAndState()
      const providerId = config.activeProvider
      const target = this.registry.get(providerId)
      const targetConfig = config.targets[providerId]

      try {
        const validation = await target.validate(targetConfig, {
          driveDir,
          now: this.now,
        })
        if (!validation.ok) {
          throw new BackupError(
            400,
            validation.error ?? 'Backup target configuration is invalid',
            'INVALID_TARGET',
          )
        }

        const result = await withDriveLock(async () =>
          target.writeSnapshot(targetConfig, {
            driveDir,
            trigger,
            label: options?.label,
            skipPrune: options?.skipPrune,
            now: startedDate,
          }),
        )

        const finishedAt = this.now().toISOString()
        const durationMs = Math.max(
          0,
          Date.parse(finishedAt) - Date.parse(startedAt),
        )

        const record: BackupRunRecord = {
          id: runId,
          providerId,
          trigger,
          status: 'success',
          startedAt,
          finishedAt,
          durationMs,
          sizeBytes: result.snapshot.sizeBytes,
          fileCount: result.snapshot.fileCount,
          locationSummary: result.snapshot.locationSummary,
          snapshotId: result.snapshot.id,
          prunedCount: result.prunedCount,
        }

        await writeBackupRuntimeState(
          {
            ...state,
            lastRun: record,
            lastSuccess: record,
            lastError: null,
          },
          configDir,
        )

        return record
      } catch (error) {
        const finishedAt = this.now().toISOString()
        const durationMs = Math.max(
          0,
          Date.parse(finishedAt) - Date.parse(startedAt),
        )
        const message =
          error instanceof Error ? error.message : 'Backup execution failed'

        const failedRecord: BackupRunRecord = {
          id: runId,
          providerId,
          trigger,
          status: 'failed',
          startedAt,
          finishedAt,
          durationMs,
          sizeBytes: 0,
          fileCount: 0,
          locationSummary: targetConfig.directory || target.descriptor.name,
          error: message,
        }

        await writeBackupRuntimeState(
          {
            ...state,
            lastRun: failedRecord,
            lastError: {
              message,
              at: finishedAt,
              providerId,
            },
          },
          configDir,
        ).catch(() => {})

        throw error
      }
    } finally {
      this.activeOperation = null
    }
  }

  async restoreSnapshot(snapshotId: string): Promise<RestoreBackupResult> {
    if (this.activeOperation !== null) {
      throw new BackupError(
        409,
        `Cannot start restore while a ${this.activeOperation} operation is already in progress`,
        'BACKUP_BUSY',
      )
    }

    this.activeOperation = 'restore'
    const { driveDir, configDir, config, state } =
      await this.getConfigAndState()
    const providerId = config.activeProvider
    const target = this.registry.get(providerId)
    const targetConfig = config.targets[providerId]

    const parentDir = path.dirname(driveDir)
    const baseName = path.basename(driveDir)
    const token = randomBytes(6).toString('hex')
    const stagingDir = path.join(
      parentDir,
      `.${baseName}.restore-staging-${token}`,
    )
    const previousDir = path.join(
      parentDir,
      `.${baseName}.restore-prev-${token}`,
    )

    try {
      const validation = await target.validate(targetConfig, {
        driveDir,
        now: this.now,
      })
      if (!validation.ok) {
        throw new BackupError(
          400,
          validation.error ?? 'Backup target configuration is invalid',
          'INVALID_TARGET',
        )
      }

      return await withDriveLock(async () => {
        await mkdir(parentDir, { recursive: true })

        const restoredSnapshot = await target.restoreSnapshotToDir(
          targetConfig,
          snapshotId,
          stagingDir,
          { driveDir, now: this.now },
        )

        let safetySnapshot: BackupSnapshot | null = null
        const driveExists = await pathExists(driveDir)
        if (driveExists) {
          const currentScan = await scanDriveForBackup(driveDir)
          if (
            currentScan.files.length > 0 ||
            currentScan.directories.length > 0
          ) {
            const safetyResult = await target.writeSnapshot(targetConfig, {
              driveDir,
              trigger: 'pre-restore',
              label: `Safety snapshot before restoring ${snapshotId}`,
              skipPrune: true,
              now: this.now(),
            })
            safetySnapshot = safetyResult.snapshot
          }
        }

        if (driveExists) {
          await rename(driveDir, previousDir)
        }
        try {
          await rename(stagingDir, driveDir)
        } catch (swapError) {
          if (driveExists) {
            await rename(previousDir, driveDir).catch(() => {})
          }
          throw swapError
        }

        if (driveExists) {
          await rm(previousDir, { recursive: true, force: true }).catch(
            () => {},
          )
        }

        await writeBackupRuntimeState(
          {
            ...state,
            lastError: null,
          },
          configDir,
        ).catch(() => {})

        return {
          restoredSnapshot,
          safetySnapshot,
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Restore failed'
      await writeBackupRuntimeState(
        {
          ...state,
          lastError: {
            message: `Restore failed: ${message}`,
            at: this.now().toISOString(),
            providerId,
          },
        },
        configDir,
      ).catch(() => {})
      throw error
    } finally {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => {})
      this.activeOperation = null
    }
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    if (this.activeOperation !== null) {
      throw new BackupError(
        409,
        `Cannot delete snapshot while a ${this.activeOperation} operation is already in progress`,
        'BACKUP_BUSY',
      )
    }

    const { driveDir, config } = await this.getConfigAndState()
    const target = this.registry.get(config.activeProvider)
    if (!target.deleteSnapshot) {
      throw new BackupError(
        400,
        `${target.descriptor.name} backups do not support deleting individual snapshots`,
        'DELETE_UNSUPPORTED',
      )
    }
    await target.deleteSnapshot(
      config.targets[config.activeProvider],
      snapshotId,
      { driveDir, now: this.now },
    )
  }

  async getStatus(
    nextScheduledRunAt: string | null = null,
  ): Promise<BackupStatusResponse> {
    const { driveDir, configDir, config, state } =
      await this.getConfigAndState()
    const target = this.registry.get(config.activeProvider)
    const targetConfig = config.targets[config.activeProvider]
    const ctx = { driveDir, now: this.now }

    const validation = await target.validate(targetConfig, ctx)
    let snapshots: BackupSnapshot[] = []
    let snapshotsError: string | undefined

    if (validation.ok) {
      try {
        snapshots = await target.listSnapshots(targetConfig, ctx)
      } catch (error) {
        snapshotsError =
          error instanceof Error
            ? error.message
            : 'Unable to list backup snapshots'
      }
    }

    return {
      driveDir,
      configDir,
      config,
      providers: this.registry.listDescriptors(),
      validation,
      inProgress: this.activeOperation,
      lastRun: state.lastRun,
      lastSuccess: state.lastSuccess,
      lastError: state.lastError,
      nextScheduledRunAt,
      snapshots,
      ...(snapshotsError ? { snapshotsError } : {}),
    }
  }
}

let defaultManager: BackupManager | null = null

export function getDefaultBackupManager(): BackupManager {
  if (!defaultManager) {
    defaultManager = new BackupManager()
  }
  return defaultManager
}
