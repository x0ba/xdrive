import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { getDriveDir } from '#/lib/marble/drive-storage.server'
import {
  BACKUP_PROVIDER_IDS,
  BackupError,
  DEFAULT_INTERVAL_MINUTES,
  DEFAULT_RETENTION_COUNT,
  MAX_INTERVAL_MINUTES,
  MAX_RETENTION_COUNT,
  MIN_INTERVAL_MINUTES,
  MIN_RETENTION_COUNT,
} from './types'
import type {
  BackupConfig,
  BackupLastError,
  BackupProviderId,
  BackupRunRecord,
  BackupRuntimeState,
} from './types'

const CONFIG_FILE_NAME = 'config.json'
const STATE_FILE_NAME = 'state.json'

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

export function getDefaultLocalBackupDir(): string {
  const configured = process.env.XDRIVE_BACKUP_DIR?.trim()
  if (configured) {
    return path.resolve(configured)
  }
  return path.join(os.homedir(), '.xdrive', 'backups')
}

export function getBackupConfigDir(driveDir = getDriveDir()): string {
  const configured = process.env.XDRIVE_BACKUP_CONFIG_DIR?.trim()
  if (configured) {
    return path.resolve(configured)
  }
  const driveKey = createHash('sha256')
    .update(path.resolve(driveDir))
    .digest('hex')
    .slice(0, 16)
  return path.join(os.homedir(), '.xdrive', 'backup', driveKey)
}

export function defaultBackupConfig(): BackupConfig {
  return {
    version: 1,
    activeProvider: 'local-directory',
    schedule: {
      enabled: false,
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    },
    targets: {
      'local-directory': {
        directory: getDefaultLocalBackupDir(),
        retentionCount: DEFAULT_RETENTION_COUNT,
      },
      'git-repository': {
        directory: '',
        branch: 'main',
        remoteUrl: '',
        autoPush: false,
      },
    },
  }
}

export function defaultBackupRuntimeState(): BackupRuntimeState {
  return {
    version: 1,
    lastRun: null,
    lastSuccess: null,
    lastError: null,
    scheduleAnchorAt: null,
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isProviderId(value: unknown): value is BackupProviderId {
  return (
    typeof value === 'string' &&
    (BACKUP_PROVIDER_IDS as readonly string[]).includes(value)
  )
}

function clampInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  fieldLabel: string,
  strict: boolean,
): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    if (strict) {
      throw new BackupError(400, `${fieldLabel} must be a finite number`)
    }
    return fallback
  }
  const rounded = Math.round(value)
  if (strict && (rounded < min || rounded > max)) {
    throw new BackupError(
      400,
      `${fieldLabel} must be between ${min} and ${max}`,
    )
  }
  return Math.min(max, Math.max(min, rounded))
}

export function sanitizeBackupConfig(
  raw: unknown,
  base: BackupConfig = defaultBackupConfig(),
  options?: { strict?: boolean },
): BackupConfig {
  const strict = options?.strict ?? false
  if (!isPlainObject(raw)) {
    if (strict) {
      throw new BackupError(400, 'Backup configuration must be an object')
    }
    return base
  }

  let activeProvider = base.activeProvider
  if (raw.activeProvider !== undefined) {
    if (isProviderId(raw.activeProvider)) {
      activeProvider = raw.activeProvider
    } else if (strict) {
      throw new BackupError(400, 'Unsupported backup provider')
    }
  }

  const rawSchedule = isPlainObject(raw.schedule) ? raw.schedule : {}
  const enabled =
    typeof rawSchedule.enabled === 'boolean'
      ? rawSchedule.enabled
      : base.schedule.enabled
  const intervalMinutes = clampInt(
    rawSchedule.intervalMinutes,
    base.schedule.intervalMinutes,
    MIN_INTERVAL_MINUTES,
    MAX_INTERVAL_MINUTES,
    'Schedule interval',
    strict,
  )

  const rawTargets = isPlainObject(raw.targets) ? raw.targets : {}
  const rawLocal = isPlainObject(rawTargets['local-directory'])
    ? rawTargets['local-directory']
    : {}
  const rawGit = isPlainObject(rawTargets['git-repository'])
    ? rawTargets['git-repository']
    : {}

  const localDirectory =
    typeof rawLocal.directory === 'string'
      ? rawLocal.directory.trim()
      : base.targets['local-directory'].directory
  const retentionCount = clampInt(
    rawLocal.retentionCount,
    base.targets['local-directory'].retentionCount,
    MIN_RETENTION_COUNT,
    MAX_RETENTION_COUNT,
    'Retention count',
    strict,
  )

  const gitDirectory =
    typeof rawGit.directory === 'string'
      ? rawGit.directory.trim()
      : base.targets['git-repository'].directory
  const gitBranch =
    typeof rawGit.branch === 'string' && rawGit.branch.trim()
      ? rawGit.branch.trim()
      : base.targets['git-repository'].branch
  const gitRemoteUrl =
    typeof rawGit.remoteUrl === 'string'
      ? rawGit.remoteUrl.trim()
      : base.targets['git-repository'].remoteUrl
  const gitAutoPush =
    typeof rawGit.autoPush === 'boolean'
      ? rawGit.autoPush
      : base.targets['git-repository'].autoPush

  return {
    version: 1,
    activeProvider,
    schedule: {
      enabled,
      intervalMinutes,
    },
    targets: {
      'local-directory': {
        directory: localDirectory,
        retentionCount,
      },
      'git-repository': {
        directory: gitDirectory,
        branch: gitBranch,
        remoteUrl: gitRemoteUrl,
        autoPush: gitAutoPush,
      },
    },
  }
}

function sanitizeRunRecord(raw: unknown): BackupRunRecord | null {
  if (!isPlainObject(raw)) return null
  if (
    typeof raw.id !== 'string' ||
    !isProviderId(raw.providerId) ||
    (raw.status !== 'success' && raw.status !== 'failed') ||
    typeof raw.startedAt !== 'string' ||
    typeof raw.finishedAt !== 'string'
  ) {
    return null
  }
  const trigger =
    raw.trigger === 'scheduled' ||
    raw.trigger === 'pre-restore' ||
    raw.trigger === 'manual'
      ? raw.trigger
      : 'manual'
  return {
    id: raw.id,
    providerId: raw.providerId,
    trigger,
    status: raw.status,
    startedAt: raw.startedAt,
    finishedAt: raw.finishedAt,
    durationMs:
      typeof raw.durationMs === 'number' && Number.isFinite(raw.durationMs)
        ? raw.durationMs
        : 0,
    sizeBytes:
      typeof raw.sizeBytes === 'number' && Number.isFinite(raw.sizeBytes)
        ? raw.sizeBytes
        : 0,
    fileCount:
      typeof raw.fileCount === 'number' && Number.isFinite(raw.fileCount)
        ? raw.fileCount
        : 0,
    locationSummary:
      typeof raw.locationSummary === 'string' ? raw.locationSummary : '',
    ...(typeof raw.snapshotId === 'string'
      ? { snapshotId: raw.snapshotId }
      : {}),
    ...(typeof raw.prunedCount === 'number'
      ? { prunedCount: raw.prunedCount }
      : {}),
    ...(typeof raw.error === 'string' ? { error: raw.error } : {}),
  }
}

function sanitizeLastError(raw: unknown): BackupLastError | null {
  if (!isPlainObject(raw)) return null
  if (
    typeof raw.message !== 'string' ||
    typeof raw.at !== 'string' ||
    !isProviderId(raw.providerId)
  ) {
    return null
  }
  return {
    message: raw.message,
    at: raw.at,
    providerId: raw.providerId,
  }
}

function sanitizeRuntimeState(raw: unknown): BackupRuntimeState {
  if (!isPlainObject(raw)) {
    return defaultBackupRuntimeState()
  }
  return {
    version: 1,
    lastRun: sanitizeRunRecord(raw.lastRun),
    lastSuccess: sanitizeRunRecord(raw.lastSuccess),
    lastError: sanitizeLastError(raw.lastError),
    scheduleAnchorAt:
      typeof raw.scheduleAnchorAt === 'string' &&
      !Number.isNaN(Date.parse(raw.scheduleAnchorAt))
        ? raw.scheduleAnchorAt
        : null,
  }
}

async function writeAtomicJson(fullPath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(fullPath), { recursive: true })
  const temporary = `${fullPath}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(data, null, 2), 'utf8')
    await rename(temporary, fullPath)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

export async function readBackupConfig(
  configDir: string = getBackupConfigDir(),
): Promise<BackupConfig> {
  try {
    const raw = await readFile(path.join(configDir, CONFIG_FILE_NAME), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    return sanitizeBackupConfig(parsed, defaultBackupConfig(), {
      strict: false,
    })
  } catch (error) {
    if (isEnoent(error)) {
      return defaultBackupConfig()
    }
    return defaultBackupConfig()
  }
}

export async function writeBackupConfig(
  config: BackupConfig,
  configDir: string = getBackupConfigDir(),
): Promise<BackupConfig> {
  const sanitized = sanitizeBackupConfig(config, defaultBackupConfig(), {
    strict: true,
  })
  await writeAtomicJson(path.join(configDir, CONFIG_FILE_NAME), sanitized)
  return sanitized
}

export async function readBackupRuntimeState(
  configDir: string = getBackupConfigDir(),
): Promise<BackupRuntimeState> {
  try {
    const raw = await readFile(path.join(configDir, STATE_FILE_NAME), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    return sanitizeRuntimeState(parsed)
  } catch (error) {
    if (isEnoent(error)) {
      return defaultBackupRuntimeState()
    }
    return defaultBackupRuntimeState()
  }
}

export async function writeBackupRuntimeState(
  state: BackupRuntimeState,
  configDir: string = getBackupConfigDir(),
): Promise<BackupRuntimeState> {
  const sanitized = sanitizeRuntimeState(state)
  await writeAtomicJson(path.join(configDir, STATE_FILE_NAME), sanitized)
  return sanitized
}
