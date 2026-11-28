import type {
  BackupConfig,
  BackupRestoreResponse,
  BackupRunRecord,
  BackupStatusResponse,
  BackupTrigger,
  BackupValidationState,
} from './types'

async function postBackupApi<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/backup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = (await response.json().catch(() => null)) as
    ({ ok?: boolean; error?: string } & T) | null
  if (!response.ok || !data || data.ok === false) {
    throw new Error(data?.error ?? `Backup request failed (${response.status})`)
  }
  return data
}

export async function fetchBackupStatus(): Promise<BackupStatusResponse> {
  const response = await fetch('/api/backup', { cache: 'no-store' })
  const data = (await response.json().catch(() => null)) as
    ({ ok?: boolean; error?: string } & BackupStatusResponse) | null
  if (!response.ok || !data || data.ok === false) {
    throw new Error(
      data?.error ?? `Failed to load backup status (${response.status})`,
    )
  }
  return data
}

export async function updateBackupConfig(
  config: BackupConfig,
): Promise<BackupStatusResponse> {
  const data = await postBackupApi<{ status: BackupStatusResponse }>({
    action: 'update_config',
    config,
  })
  return data.status
}

export async function validateBackupConfig(
  config: BackupConfig,
): Promise<BackupValidationState> {
  const data = await postBackupApi<{ validation: BackupValidationState }>({
    action: 'validate',
    config,
  })
  return data.validation
}

export async function triggerBackupNow(label?: string): Promise<{
  run: BackupRunRecord
  status: BackupStatusResponse
}> {
  return await postBackupApi<{
    run: BackupRunRecord
    status: BackupStatusResponse
  }>({
    action: 'backup_now',
    ...(label ? { label } : {}),
  })
}

export async function restoreBackupSnapshot(
  snapshotId: string,
): Promise<BackupRestoreResponse> {
  return await postBackupApi<BackupRestoreResponse>({
    action: 'restore',
    snapshotId,
    confirm: true,
  })
}

export async function deleteBackupSnapshot(
  snapshotId: string,
): Promise<BackupStatusResponse> {
  const data = await postBackupApi<{ status: BackupStatusResponse }>({
    action: 'delete_snapshot',
    snapshotId,
  })
  return data.status
}

export function formatBackupBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(2)} GB`
}

export function formatBackupDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0 ms'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  const minutes = Math.floor(seconds / 60)
  const remSeconds = Math.round(seconds % 60)
  return `${minutes}m ${remSeconds}s`
}

export function formatBackupTimestamp(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return iso
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatRelativeTime(
  iso: string | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (!iso) return ''
  const targetMs = Date.parse(iso)
  if (!Number.isFinite(targetMs)) return ''
  const diffSec = Math.round((targetMs - nowMs) / 1000)
  const absSec = Math.abs(diffSec)
  if (absSec < 45) return diffSec >= 0 ? 'in moments' : 'just now'
  const absMin = Math.round(absSec / 60)
  if (absMin < 60) {
    return diffSec >= 0 ? `in ${absMin}m` : `${absMin}m ago`
  }
  const absHours = Math.round(absMin / 60)
  if (absHours < 48) {
    return diffSec >= 0 ? `in ${absHours}h` : `${absHours}h ago`
  }
  const absDays = Math.round(absHours / 24)
  return diffSec >= 0 ? `in ${absDays}d` : `${absDays}d ago`
}

export function triggerLabel(trigger: BackupTrigger): string {
  switch (trigger) {
    case 'scheduled':
      return 'Scheduled'
    case 'pre-restore':
      return 'Safety snapshot'
    case 'manual':
      return 'Manual'
  }
}
