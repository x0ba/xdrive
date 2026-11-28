import { useEffect, useId, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock,
  FolderArchive,
  GitBranch,
  HardDrive,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'

import { Switch } from '#/components/ui/switch'
import {
  formatBackupBytes,
  formatBackupDuration,
  formatBackupTimestamp,
  formatRelativeTime,
  triggerLabel,
} from '#/lib/backup/client'
import {
  BACKUP_INTERVAL_PRESETS,
  MAX_RETENTION_COUNT,
  MIN_RETENTION_COUNT,
} from '#/lib/backup/types'
import type {
  BackupConfig,
  BackupProviderDescriptor,
  BackupProviderId,
  BackupSnapshot,
  BackupStatusResponse,
  BackupValidationState,
} from '#/lib/backup/types'
import { cn } from '#/lib/utils'
import { RestoreConfirmDialog } from './RestoreConfirmDialog'

export type BackupBusyAction =
  'save' | 'validate' | 'backup' | 'restore' | 'delete' | null

export interface BackupSettingsNotice {
  kind: 'success' | 'error'
  message: string
}

export interface BackupSettingsPanelProps {
  status: BackupStatusResponse | null
  loading?: boolean
  busyAction?: BackupBusyAction
  validationOverride?: BackupValidationState | null
  notice?: BackupSettingsNotice | null
  onDismissNotice?: () => void
  onRefresh?: () => void
  onSaveConfig: (config: BackupConfig) => void | Promise<void>
  onValidateConfig?: (config: BackupConfig) => void | Promise<void>
  onBackupNow: () => void | Promise<void>
  onRestoreSnapshot: (snapshotId: string) => void | Promise<void>
  onDeleteSnapshot?: (snapshotId: string) => void | Promise<void>
}

function providerIcon(providerId: BackupProviderId) {
  return providerId === 'git-repository' ? (
    <GitBranch className="size-3.5 shrink-0" />
  ) : (
    <FolderArchive className="size-3.5 shrink-0" />
  )
}

function configsEqual(a: BackupConfig, b: BackupConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function BackupSettingsPanel({
  status,
  loading = false,
  busyAction = null,
  validationOverride = null,
  notice = null,
  onDismissNotice,
  onRefresh,
  onSaveConfig,
  onValidateConfig,
  onBackupNow,
  onRestoreSnapshot,
  onDeleteSnapshot,
}: BackupSettingsPanelProps) {
  const headingId = useId()
  const localDirInputId = useId()
  const retentionInputId = useId()
  const gitDirInputId = useId()
  const gitBranchInputId = useId()
  const gitRemoteInputId = useId()
  const scheduleIntervalId = useId()

  const [draft, setDraft] = useState<BackupConfig | null>(
    () => status?.config ?? null,
  )
  const [restoreTarget, setRestoreTarget] = useState<BackupSnapshot | null>(
    null,
  )
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  useEffect(() => {
    if (!status) return
    setDraft(status.config)
  }, [status])

  const activeConfig = draft ?? status?.config ?? null
  const isDirty = Boolean(
    status && activeConfig && !configsEqual(status.config, activeConfig),
  )
  const isBusy = busyAction !== null || Boolean(status?.inProgress)
  const activeValidation = validationOverride ?? status?.validation ?? null

  const providers: BackupProviderDescriptor[] = status?.providers ?? []
  const activeProviderDescriptor = activeConfig
    ? providers.find((item) => item.id === activeConfig.activeProvider)
    : undefined

  const lastRun = status?.lastRun ?? null
  const lastError = status?.lastError ?? null

  const statusBadge = (() => {
    if (status?.inProgress === 'restore') {
      return {
        label: 'Restoring…',
        tone: 'border-[var(--xd-sketch)]/40 bg-[var(--xd-sketch-soft)] text-[var(--xd-sketch)]',
      }
    }
    if (status?.inProgress === 'backup' || busyAction === 'backup') {
      return {
        label: 'Running…',
        tone: 'border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]',
      }
    }
    if (lastError) {
      return {
        label: 'Last run failed',
        tone: 'border-[var(--xd-danger)]/40 bg-[var(--xd-danger-soft)] text-[var(--xd-danger)]',
      }
    }
    if (lastRun?.status === 'success') {
      return {
        label: 'Healthy',
        tone: 'border-[var(--xd-commit)]/40 bg-[var(--xd-commit-soft)] text-[var(--xd-commit)]',
      }
    }
    return {
      label: 'No backups yet',
      tone: 'border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] text-[var(--xd-ink-secondary)]',
    }
  })()

  function updateDraft(updater: (prev: BackupConfig) => BackupConfig) {
    setDraft((prev) => {
      const base = prev ?? status?.config
      if (!base) return prev
      return updater(base)
    })
  }

  async function handleConfirmRestore(snapshotId: string) {
    setRestoreError(null)
    try {
      await onRestoreSnapshot(snapshotId)
      setRestoreTarget(null)
    } catch (error) {
      setRestoreError(
        error instanceof Error ? error.message : 'Failed to restore snapshot',
      )
    }
  }

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] p-12 text-[12.5px] text-[var(--xd-ink-secondary)]">
        <Loader2 className="mr-2 size-4 animate-spin text-[var(--xd-ink-muted)]" />
        <span>Loading Drive backup settings…</span>
      </div>
    )
  }

  if (!status || !activeConfig) {
    return (
      <div className="rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] p-6 text-[12.5px] text-[var(--xd-ink-secondary)]">
        Unable to load Drive backup status.
      </div>
    )
  }

  const isLocal = activeConfig.activeProvider === 'local-directory'
  const localCfg = activeConfig.targets['local-directory']
  const gitCfg = activeConfig.targets['git-repository']
  const intervalValue = BACKUP_INTERVAL_PRESETS.some(
    (preset) => preset.minutes === activeConfig.schedule.intervalMinutes,
  )
    ? String(activeConfig.schedule.intervalMinutes)
    : 'custom'

  return (
    <section
      aria-labelledby={headingId}
      className="flex w-full flex-col overflow-hidden rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] text-[var(--xd-ink)]"
    >
      {/* Top header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--xd-border)] px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Archive className="size-4 text-[var(--xd-accent)]" />
            <h2 id={headingId} className="text-[14px] font-semibold">
              Drive Backup
            </h2>
            <span
              className={cn(
                'inline-flex items-center rounded border px-1.5 py-0.5 text-[10.5px] font-medium',
                statusBadge.tone,
              )}
            >
              {statusBadge.label}
            </span>
          </div>
          <p className="xd-mono mt-1 flex items-center gap-1.5 truncate text-[11px] text-[var(--xd-ink-muted)]">
            <HardDrive className="size-3 shrink-0" />
            <span title={status.driveDir}>{status.driveDir}</span>
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {onRefresh && (
            <button
              type="button"
              disabled={isBusy}
              onClick={onRefresh}
              className="inline-flex h-7 items-center gap-1 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2.5 text-[11.5px] font-medium text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] disabled:opacity-45"
            >
              <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
              <span>Refresh</span>
            </button>
          )}
          <button
            type="button"
            disabled={isBusy || isDirty}
            title={
              isDirty
                ? 'Save your configuration changes before starting a backup'
                : 'Create a full Drive backup now'
            }
            onClick={() => void onBackupNow()}
            className="inline-flex h-7 items-center gap-1.5 rounded bg-[var(--xd-accent)] px-3 text-[11.5px] font-medium text-white transition-colors hover:bg-[var(--xd-accent-hover)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busyAction === 'backup' || status.inProgress === 'backup' ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                <span>Backing up…</span>
              </>
            ) : (
              <>
                <Play className="size-3" />
                <span>Back up now</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Summary metrics bar */}
      <div className="grid gap-3 border-b border-[var(--xd-border)] bg-[var(--xd-rail)]/55 px-4 py-2.5 text-[11.5px] sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <span className="block text-[10.5px] text-[var(--xd-ink-muted)]">
            Last backup
          </span>
          <span className="mt-0.5 block font-medium text-[var(--xd-ink)]">
            {lastRun
              ? `${formatBackupTimestamp(lastRun.finishedAt)} (${formatRelativeTime(lastRun.finishedAt)})`
              : 'No backups recorded'}
          </span>
        </div>
        <div>
          <span className="block text-[10.5px] text-[var(--xd-ink-muted)]">
            Size &amp; duration
          </span>
          <span className="xd-tabular mt-0.5 block font-medium text-[var(--xd-ink)]">
            {lastRun && lastRun.status === 'success'
              ? `${formatBackupBytes(lastRun.sizeBytes)} · ${lastRun.fileCount} files · ${formatBackupDuration(lastRun.durationMs)}`
              : lastRun
                ? `Failed in ${formatBackupDuration(lastRun.durationMs)}`
                : '—'}
          </span>
        </div>
        <div>
          <span className="block text-[10.5px] text-[var(--xd-ink-muted)]">
            Active target
          </span>
          <span
            className="xd-mono mt-0.5 block truncate font-medium text-[var(--xd-ink)]"
            title={
              lastRun?.locationSummary ||
              activeValidation?.resolvedTargetSummary
            }
          >
            {activeProviderDescriptor?.name ?? activeConfig.activeProvider}
          </span>
        </div>
        <div>
          <span className="block text-[10.5px] text-[var(--xd-ink-muted)]">
            Next scheduled run
          </span>
          <span className="mt-0.5 block font-medium text-[var(--xd-ink)]">
            {activeConfig.schedule.enabled
              ? status.nextScheduledRunAt
                ? `${formatBackupTimestamp(status.nextScheduledRunAt)} (${formatRelativeTime(status.nextScheduledRunAt)})`
                : `Every ${activeConfig.schedule.intervalMinutes} min`
              : 'Automatic backups off'}
          </span>
        </div>
      </div>

      {/* Notices and errors */}
      {(notice || lastError || status.snapshotsError) && (
        <div className="space-y-2 border-b border-[var(--xd-border)] px-4 py-3">
          {notice && (
            <div
              role="status"
              className={cn(
                'flex items-start justify-between gap-2 rounded border px-3 py-2 text-[12px]',
                notice.kind === 'success'
                  ? 'border-[var(--xd-commit)]/35 bg-[var(--xd-commit-soft)] text-[var(--xd-commit)]'
                  : 'border-[var(--xd-danger)]/35 bg-[var(--xd-danger-soft)] text-[var(--xd-danger)]',
              )}
            >
              <div className="flex items-start gap-2">
                {notice.kind === 'success' ? (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                )}
                <span>{notice.message}</span>
              </div>
              {onDismissNotice && (
                <button
                  type="button"
                  onClick={onDismissNotice}
                  aria-label="Dismiss notice"
                  className="rounded p-0.5 opacity-80 hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          )}

          {lastError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded border border-[var(--xd-danger)]/35 bg-[var(--xd-danger-soft)] px-3 py-2 text-[12px] text-[var(--xd-danger)]"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">
                  Last backup error ({formatBackupTimestamp(lastError.at)})
                </p>
                <p className="mt-0.5 break-words">{lastError.message}</p>
              </div>
            </div>
          )}

          {status.snapshotsError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded border border-[var(--xd-sketch)]/40 bg-[var(--xd-sketch-soft)] px-3 py-2 text-[12px] text-[var(--xd-sketch)]"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Could not read existing snapshots: {status.snapshotsError}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Two-column provider rail + main configuration & history */}
      <div className="grid min-h-0 flex-1 md:grid-cols-[210px_minmax(0,1fr)]">
        {/* Left rail: Target providers */}
        <aside className="flex flex-col justify-between border-b border-[var(--xd-border)] bg-[var(--xd-rail)] p-2 md:border-r md:border-b-0">
          <div className="space-y-1">
            <p className="px-2 py-1 text-[11px] font-medium text-[var(--xd-ink-muted)]">
              Backup target
            </p>
            <ul className="space-y-0.5">
              {providers.map((provider) => {
                const selected = activeConfig.activeProvider === provider.id
                return (
                  <li key={provider.id}>
                    <button
                      type="button"
                      disabled={isBusy}
                      aria-pressed={selected}
                      onClick={() =>
                        updateDraft((prev) => ({
                          ...prev,
                          activeProvider: provider.id,
                        }))
                      }
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded px-2.5 py-2 text-left text-[12px] transition-colors disabled:opacity-50',
                        selected
                          ? 'bg-[var(--xd-surface-active)] font-medium text-[var(--xd-ink)]'
                          : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={
                            selected
                              ? 'text-[var(--xd-accent)]'
                              : 'text-[var(--xd-ink-muted)]'
                          }
                        >
                          {providerIcon(provider.id)}
                        </span>
                        <span className="truncate">{provider.name}</span>
                      </span>
                      {status.config.activeProvider === provider.id && (
                        <span
                          aria-label="Saved active target"
                          className="size-1.5 shrink-0 rounded-full bg-[var(--xd-commit)]"
                        />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="mt-4 space-y-1.5 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] p-2.5 text-[11px] text-[var(--xd-ink-secondary)]">
            <p className="flex items-center gap-1.5 font-medium text-[var(--xd-ink)]">
              <ShieldCheck className="size-3.5 shrink-0 text-[var(--xd-commit)]" />
              <span>Isolated config</span>
            </p>
            <p className="leading-relaxed text-[var(--xd-ink-muted)]">
              Backup settings live outside{' '}
              <span className="xd-mono">marble-drive</span> and never store
              secrets or tokens.
            </p>
            <p
              className="xd-mono truncate text-[10px] text-[var(--xd-ink-subtle)]"
              title={status.configDir}
            >
              {status.configDir}
            </p>
          </div>
        </aside>

        {/* Main settings & snapshot list */}
        <div className="min-w-0 space-y-6 p-4">
          {/* 1. Target configuration */}
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void onSaveConfig(activeConfig)
            }}
          >
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[13.5px] font-semibold">
                  {activeProviderDescriptor?.name ??
                    activeConfig.activeProvider}
                </h3>
                {isDirty && (
                  <span className="rounded border border-[var(--xd-sketch)]/40 bg-[var(--xd-sketch-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--xd-sketch)]">
                    Unsaved changes
                  </span>
                )}
              </div>
              {activeProviderDescriptor && (
                <p className="mt-0.5 text-[12px] text-[var(--xd-ink-secondary)]">
                  {activeProviderDescriptor.description}
                </p>
              )}
            </div>

            {isLocal ? (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
                <div className="space-y-1">
                  <label
                    htmlFor={localDirInputId}
                    className="block text-[11.5px] font-medium text-[var(--xd-ink-secondary)]"
                  >
                    Backup directory
                  </label>
                  <input
                    id={localDirInputId}
                    type="text"
                    disabled={isBusy}
                    value={localCfg.directory}
                    onChange={(event) =>
                      updateDraft((prev) => ({
                        ...prev,
                        targets: {
                          ...prev.targets,
                          'local-directory': {
                            ...prev.targets['local-directory'],
                            directory: event.target.value,
                          },
                        },
                      }))
                    }
                    placeholder="~/.xdrive/backups"
                    className="xd-mono h-8 w-full rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-2.5 text-[12px] text-[var(--xd-ink)] outline-none focus-visible:border-[var(--xd-accent)]"
                  />
                  <p className="text-[11px] text-[var(--xd-ink-muted)]">
                    Must be outside{' '}
                    <span className="xd-mono">marble-drive</span>. Supports
                    local folders and mounted external drives.
                  </p>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor={retentionInputId}
                    className="block text-[11.5px] font-medium text-[var(--xd-ink-secondary)]"
                  >
                    Keep latest archives
                  </label>
                  <input
                    id={retentionInputId}
                    type="number"
                    min={MIN_RETENTION_COUNT}
                    max={MAX_RETENTION_COUNT}
                    disabled={isBusy}
                    value={localCfg.retentionCount}
                    onChange={(event) => {
                      const next = Number.parseInt(event.target.value, 10)
                      updateDraft((prev) => ({
                        ...prev,
                        targets: {
                          ...prev.targets,
                          'local-directory': {
                            ...prev.targets['local-directory'],
                            retentionCount: Number.isFinite(next)
                              ? next
                              : MIN_RETENTION_COUNT,
                          },
                        },
                      }))
                    }}
                    className="xd-tabular h-8 w-full rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-2.5 text-[12px] text-[var(--xd-ink)] outline-none focus-visible:border-[var(--xd-accent)]"
                  />
                  <p className="text-[11px] text-[var(--xd-ink-muted)]">
                    1–{MAX_RETENTION_COUNT} zips
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
                  <div className="space-y-1">
                    <label
                      htmlFor={gitDirInputId}
                      className="block text-[11.5px] font-medium text-[var(--xd-ink-secondary)]"
                    >
                      Git repository directory
                    </label>
                    <input
                      id={gitDirInputId}
                      type="text"
                      disabled={isBusy}
                      value={gitCfg.directory}
                      onChange={(event) =>
                        updateDraft((prev) => ({
                          ...prev,
                          targets: {
                            ...prev.targets,
                            'git-repository': {
                              ...prev.targets['git-repository'],
                              directory: event.target.value,
                            },
                          },
                        }))
                      }
                      placeholder="~/.xdrive/backup-git"
                      className="xd-mono h-8 w-full rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-2.5 text-[12px] text-[var(--xd-ink)] outline-none focus-visible:border-[var(--xd-accent)]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor={gitBranchInputId}
                      className="block text-[11.5px] font-medium text-[var(--xd-ink-secondary)]"
                    >
                      Branch
                    </label>
                    <input
                      id={gitBranchInputId}
                      type="text"
                      disabled={isBusy}
                      value={gitCfg.branch}
                      onChange={(event) =>
                        updateDraft((prev) => ({
                          ...prev,
                          targets: {
                            ...prev.targets,
                            'git-repository': {
                              ...prev.targets['git-repository'],
                              branch: event.target.value,
                            },
                          },
                        }))
                      }
                      placeholder="main"
                      className="xd-mono h-8 w-full rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-2.5 text-[12px] text-[var(--xd-ink)] outline-none focus-visible:border-[var(--xd-accent)]"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor={gitRemoteInputId}
                    className="block text-[11.5px] font-medium text-[var(--xd-ink-secondary)]"
                  >
                    Remote URL (optional)
                  </label>
                  <input
                    id={gitRemoteInputId}
                    type="text"
                    disabled={isBusy}
                    value={gitCfg.remoteUrl}
                    onChange={(event) =>
                      updateDraft((prev) => ({
                        ...prev,
                        targets: {
                          ...prev.targets,
                          'git-repository': {
                            ...prev.targets['git-repository'],
                            remoteUrl: event.target.value,
                          },
                        },
                      }))
                    }
                    placeholder="git@github.com:username/xdrive-backups.git"
                    className="xd-mono h-8 w-full rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-2.5 text-[12px] text-[var(--xd-ink)] outline-none focus-visible:border-[var(--xd-accent)]"
                  />
                  <p className="text-[11px] text-[var(--xd-ink-muted)]">
                    Uses your local SSH key or git credential helper. Never
                    include passwords or personal access tokens in the URL.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2">
                  <div>
                    <span className="block text-[12px] font-medium text-[var(--xd-ink)]">
                      Push after each backup
                    </span>
                    <span className="block text-[11px] text-[var(--xd-ink-muted)]">
                      Runs <span className="xd-mono">git push -u origin</span>{' '}
                      after committing a snapshot.
                    </span>
                  </div>
                  <Switch
                    aria-label="Push after each backup"
                    disabled={isBusy}
                    checked={gitCfg.autoPush}
                    onCheckedChange={(checked) =>
                      updateDraft((prev) => ({
                        ...prev,
                        targets: {
                          ...prev.targets,
                          'git-repository': {
                            ...prev.targets['git-repository'],
                            autoPush: checked,
                          },
                        },
                      }))
                    }
                  />
                </div>
              </div>
            )}

            {/* Schedule card */}
            <div className="space-y-3 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)]/55 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 size-3.5 shrink-0 text-[var(--xd-ink-muted)]" />
                  <div>
                    <span className="block text-[12px] font-medium text-[var(--xd-ink)]">
                      Scheduled automatic backups
                    </span>
                    <span className="block text-[11px] text-[var(--xd-ink-muted)]">
                      Runs while the xDrive server is active. Missed intervals
                      trigger one catch-up backup without overlapping.
                    </span>
                  </div>
                </div>
                <Switch
                  aria-label="Enable automatic backups"
                  disabled={isBusy}
                  checked={activeConfig.schedule.enabled}
                  onCheckedChange={(checked) =>
                    updateDraft((prev) => ({
                      ...prev,
                      schedule: {
                        ...prev.schedule,
                        enabled: checked,
                      },
                    }))
                  }
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <label
                  htmlFor={scheduleIntervalId}
                  className="text-[11.5px] text-[var(--xd-ink-secondary)]"
                >
                  Backup interval
                </label>
                <select
                  id={scheduleIntervalId}
                  disabled={isBusy || !activeConfig.schedule.enabled}
                  value={intervalValue}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10)
                    if (!Number.isFinite(parsed)) return
                    updateDraft((prev) => ({
                      ...prev,
                      schedule: {
                        ...prev.schedule,
                        intervalMinutes: parsed,
                      },
                    }))
                  }}
                  className="h-7 rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-2 text-[12px] text-[var(--xd-ink)] outline-none focus-visible:border-[var(--xd-accent)] disabled:opacity-45"
                >
                  {BACKUP_INTERVAL_PRESETS.map((preset) => (
                    <option key={preset.minutes} value={String(preset.minutes)}>
                      {preset.label}
                    </option>
                  ))}
                  {intervalValue === 'custom' && (
                    <option value="custom">
                      Every {activeConfig.schedule.intervalMinutes} minutes
                    </option>
                  )}
                </select>
              </div>
            </div>

            {/* Validation status + Save/Test controls */}
            {activeValidation && (
              <div
                role={activeValidation.ok ? undefined : 'alert'}
                className={cn(
                  'flex items-start gap-2 rounded border px-3 py-2 text-[11.5px]',
                  !activeValidation.ok
                    ? 'border-[var(--xd-danger)]/40 bg-[var(--xd-danger-soft)] text-[var(--xd-danger)]'
                    : activeValidation.warning
                      ? 'border-[var(--xd-sketch)]/40 bg-[var(--xd-sketch-soft)] text-[var(--xd-sketch)]'
                      : 'border-[var(--xd-border)] bg-[var(--xd-rail)] text-[var(--xd-ink-secondary)]',
                )}
              >
                {activeValidation.ok ? (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--xd-commit)]" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                )}
                <div className="min-w-0">
                  {!activeValidation.ok ? (
                    <span>{activeValidation.error}</span>
                  ) : activeValidation.warning ? (
                    <span>{activeValidation.warning}</span>
                  ) : (
                    <span>
                      Target verified:{' '}
                      <span className="xd-mono text-[var(--xd-ink)]">
                        {activeValidation.resolvedTargetSummary}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              {onValidateConfig && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void onValidateConfig(activeConfig)}
                  className="inline-flex h-7 items-center gap-1.5 rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-2.5 text-[11.5px] font-medium text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] disabled:opacity-45"
                >
                  {busyAction === 'validate' ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <ShieldCheck className="size-3" />
                  )}
                  <span>Test target</span>
                </button>
              )}

              {isDirty && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => setDraft(status.config)}
                  className="inline-flex h-7 items-center rounded border border-[var(--xd-border)] px-2.5 text-[11.5px] text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] disabled:opacity-45"
                >
                  Discard
                </button>
              )}

              <button
                type="submit"
                disabled={isBusy || !isDirty}
                className="inline-flex h-7 items-center gap-1.5 rounded border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] px-3 text-[11.5px] font-medium text-[var(--xd-ink)] transition-colors hover:bg-[var(--xd-surface-hover)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {busyAction === 'save' ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Save className="size-3" />
                )}
                <span>Save settings</span>
              </button>
            </div>
          </form>

          {/* 2. Existing snapshots & restore */}
          <div className="space-y-2.5 border-t border-[var(--xd-border)] pt-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-[13px] font-semibold">
                  Snapshots ({status.snapshots.length})
                </h3>
                <p className="text-[11.5px] text-[var(--xd-ink-muted)]">
                  Restoring verifies archive checksums and creates a safety
                  snapshot of your current Drive first.
                </p>
              </div>
            </div>

            {status.snapshots.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded border border-dashed border-[var(--xd-border-strong)] bg-[var(--xd-rail)]/40 px-4 py-8 text-center">
                <Archive className="size-6 text-[var(--xd-ink-subtle)]" />
                <p className="mt-2 text-[12.5px] font-medium text-[var(--xd-ink)]">
                  No backups created yet
                </p>
                <p className="mt-1 max-w-sm text-[11.5px] text-[var(--xd-ink-muted)]">
                  Create an on-demand snapshot now or enable automatic backups
                  above.
                </p>
                <button
                  type="button"
                  disabled={isBusy || isDirty}
                  onClick={() => void onBackupNow()}
                  className="mt-3 inline-flex h-7 items-center gap-1.5 rounded bg-[var(--xd-accent)] px-3 text-[11.5px] font-medium text-white hover:bg-[var(--xd-accent-hover)] disabled:opacity-45"
                >
                  <Play className="size-3" />
                  <span>Create first backup</span>
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--xd-border)] rounded border border-[var(--xd-border)]">
                {status.snapshots.map((snapshot) => {
                  const confirmDeleting = pendingDeleteId === snapshot.id
                  return (
                    <li
                      key={snapshot.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-[12px]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-[var(--xd-ink)]">
                            {formatBackupTimestamp(snapshot.createdAt)}
                          </span>
                          <span
                            className={cn(
                              'rounded border px-1.5 py-0.5 text-[10px] leading-none font-medium',
                              snapshot.trigger === 'pre-restore'
                                ? 'border-[var(--xd-sketch)]/40 bg-[var(--xd-sketch-soft)] text-[var(--xd-sketch)]'
                                : snapshot.trigger === 'scheduled'
                                  ? 'border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]'
                                  : 'border-[var(--xd-border-strong)] bg-[var(--xd-rail)] text-[var(--xd-ink-secondary)]',
                            )}
                          >
                            {triggerLabel(snapshot.trigger)}
                          </span>
                          <span className="xd-tabular text-[11px] text-[var(--xd-ink-muted)]">
                            {snapshot.fileCount} files ·{' '}
                            {formatBackupBytes(snapshot.sizeBytes)}
                          </span>
                        </div>
                        <p className="xd-mono mt-0.5 truncate text-[10.5px] text-[var(--xd-ink-muted)]">
                          {snapshot.id}
                          {snapshot.label ? ` · ${snapshot.label}` : ''}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {onDeleteSnapshot &&
                          activeProviderDescriptor?.supportsRetention &&
                          (confirmDeleting ? (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => {
                                  setPendingDeleteId(null)
                                  void onDeleteSnapshot(snapshot.id)
                                }}
                                className="inline-flex h-7 items-center rounded border border-[var(--xd-danger)]/40 bg-[var(--xd-danger-soft)] px-2 text-[11px] font-medium text-[var(--xd-danger)] hover:bg-[var(--xd-danger)] hover:text-white disabled:opacity-45"
                              >
                                Confirm delete
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setPendingDeleteId(null)}
                                className="inline-flex h-7 items-center rounded border border-[var(--xd-border)] px-2 text-[11px] text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)]"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy}
                              aria-label={`Delete backup ${snapshot.id}`}
                              onClick={() => setPendingDeleteId(snapshot.id)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded border border-[var(--xd-border)] text-[var(--xd-ink-muted)] hover:border-[var(--xd-danger)]/40 hover:bg-[var(--xd-danger-soft)] hover:text-[var(--xd-danger)] disabled:opacity-45"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          ))}

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setRestoreError(null)
                            setRestoreTarget(snapshot)
                          }}
                          className="inline-flex h-7 items-center gap-1 rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-2.5 text-[11.5px] font-medium text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)] disabled:opacity-45"
                        >
                          <RotateCcw className="size-3 text-[var(--xd-ink-muted)]" />
                          <span>Restore</span>
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <RestoreConfirmDialog
        snapshot={restoreTarget}
        busy={busyAction === 'restore' || status.inProgress === 'restore'}
        error={restoreError}
        onCancel={() => {
          setRestoreError(null)
          setRestoreTarget(null)
        }}
        onConfirm={handleConfirmRestore}
      />
    </section>
  )
}
