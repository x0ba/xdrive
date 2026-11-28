export const BACKUP_PROVIDER_IDS = [
  'local-directory',
  'git-repository',
] as const

export type BackupProviderId = (typeof BACKUP_PROVIDER_IDS)[number]

export type BackupTrigger = 'manual' | 'scheduled' | 'pre-restore'

export const DEFAULT_RETENTION_COUNT = 20
export const MIN_RETENTION_COUNT = 1
export const MAX_RETENTION_COUNT = 500

export const DEFAULT_INTERVAL_MINUTES = 60
export const MIN_INTERVAL_MINUTES = 5
export const MAX_INTERVAL_MINUTES = 10080

export const BACKUP_INTERVAL_PRESETS: ReadonlyArray<{
  minutes: number
  label: string
}> = [
  { minutes: 15, label: 'Every 15 minutes' },
  { minutes: 30, label: 'Every 30 minutes' },
  { minutes: 60, label: 'Hourly' },
  { minutes: 360, label: 'Every 6 hours' },
  { minutes: 720, label: 'Every 12 hours' },
  { minutes: 1440, label: 'Daily' },
]

export interface BackupProviderDescriptor {
  id: BackupProviderId
  name: string
  description: string
  supportsRetention: boolean
  credentialNote: string
}

export interface LocalDirectoryTargetConfig {
  directory: string
  retentionCount: number
}

export interface GitRepositoryTargetConfig {
  directory: string
  branch: string
  remoteUrl: string
  autoPush: boolean
}

export interface BackupScheduleConfig {
  enabled: boolean
  intervalMinutes: number
}

export interface BackupConfig {
  version: 1
  activeProvider: BackupProviderId
  schedule: BackupScheduleConfig
  targets: {
    'local-directory': LocalDirectoryTargetConfig
    'git-repository': GitRepositoryTargetConfig
  }
}

export interface BackupSnapshot {
  id: string
  providerId: BackupProviderId
  createdAt: string
  trigger: BackupTrigger
  sizeBytes: number
  fileCount: number
  locationSummary: string
  label?: string
  commitSha?: string
}

export interface BackupRunRecord {
  id: string
  providerId: BackupProviderId
  trigger: BackupTrigger
  status: 'success' | 'failed'
  startedAt: string
  finishedAt: string
  durationMs: number
  sizeBytes: number
  fileCount: number
  locationSummary: string
  snapshotId?: string
  prunedCount?: number
  error?: string
}

export interface BackupLastError {
  message: string
  at: string
  providerId: BackupProviderId
}

export interface BackupValidationState {
  ok: boolean
  error?: string
  warning?: string
  resolvedTargetSummary?: string
}

export interface BackupRuntimeState {
  version: 1
  lastRun: BackupRunRecord | null
  lastSuccess: BackupRunRecord | null
  lastError: BackupLastError | null
  scheduleAnchorAt: string | null
}

export interface BackupStatusResponse {
  driveDir: string
  configDir: string
  config: BackupConfig
  providers: BackupProviderDescriptor[]
  validation: BackupValidationState
  inProgress: 'backup' | 'restore' | null
  lastRun: BackupRunRecord | null
  lastSuccess: BackupRunRecord | null
  lastError: BackupLastError | null
  nextScheduledRunAt: string | null
  snapshots: BackupSnapshot[]
  snapshotsError?: string
}

export interface BackupRestoreResponse {
  restoredSnapshot: BackupSnapshot
  safetySnapshot: BackupSnapshot | null
  status: BackupStatusResponse
}

export interface BackupArchiveFileEntry {
  path: string
  size: number
  sha256: string
}

export interface BackupArchiveManifest {
  format: 'xdrive-backup'
  version: 1
  id: string
  createdAt: string
  trigger: BackupTrigger
  label?: string
  fileCount: number
  totalUncompressedBytes: number
  directories: string[]
  files: BackupArchiveFileEntry[]
}

export class BackupError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'BackupError'
    this.status = status
    this.code = code
  }
}
