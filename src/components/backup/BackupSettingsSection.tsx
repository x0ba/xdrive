import { useCallback, useEffect, useState } from 'react'

import {
  deleteBackupSnapshot,
  fetchBackupStatus,
  restoreBackupSnapshot,
  triggerBackupNow,
  updateBackupConfig,
  validateBackupConfig,
} from '#/lib/backup/client'
import type {
  BackupConfig,
  BackupStatusResponse,
  BackupValidationState,
} from '#/lib/backup/types'
import { BackupSettingsPanel } from './BackupSettingsPanel'
import type {
  BackupBusyAction,
  BackupSettingsNotice,
} from './BackupSettingsPanel'

export interface BackupSettingsSectionProps {
  syncWithServer?: boolean
  onDriveRestored?: () => void | Promise<void>
}

const STATIC_DEMO_STATUS: BackupStatusResponse = {
  driveDir: './marble-drive',
  configDir: '~/.xdrive/backup/preview',
  config: {
    version: 1,
    activeProvider: 'local-directory',
    schedule: {
      enabled: true,
      intervalMinutes: 60,
    },
    targets: {
      'local-directory': {
        directory: '~/.xdrive/backups',
        retentionCount: 20,
      },
      'git-repository': {
        directory: '',
        branch: 'main',
        remoteUrl: '',
        autoPush: false,
      },
    },
  },
  providers: [
    {
      id: 'local-directory',
      name: 'Local Directory',
      description:
        'Writes timestamped .zip archives to a local folder or mounted external drive with configurable retention pruning.',
      supportsRetention: true,
      credentialNote:
        'No credentials required. Choose any folder outside marble-drive (such as ~/.xdrive/backups or an external drive).',
    },
    {
      id: 'git-repository',
      name: 'Git Repository',
      description:
        'Commits Drive snapshots to a local git repository and optionally pushes using your existing SSH or git credentials.',
      supportsRetention: false,
      credentialNote:
        'Uses your local git and SSH configuration. Never embed tokens or passwords in the remote URL.',
    },
  ],
  validation: {
    ok: true,
    resolvedTargetSummary: '~/.xdrive/backups',
  },
  inProgress: null,
  lastRun: null,
  lastSuccess: null,
  lastError: null,
  nextScheduledRunAt: null,
  snapshots: [],
}

export function BackupSettingsSection({
  syncWithServer = true,
  onDriveRestored,
}: BackupSettingsSectionProps) {
  const [status, setStatus] = useState<BackupStatusResponse | null>(() =>
    syncWithServer ? null : STATIC_DEMO_STATUS,
  )
  const [loading, setLoading] = useState(syncWithServer)
  const [busyAction, setBusyAction] = useState<BackupBusyAction>(null)
  const [validationOverride, setValidationOverride] =
    useState<BackupValidationState | null>(null)
  const [notice, setNotice] = useState<BackupSettingsNotice | null>(null)

  const loadStatus = useCallback(async () => {
    if (!syncWithServer) return
    setLoading(true)
    try {
      const next = await fetchBackupStatus()
      setStatus(next)
      setValidationOverride(null)
    } catch (error) {
      setNotice({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Unable to load Drive backup status',
      })
    } finally {
      setLoading(false)
    }
  }, [syncWithServer])

  useEffect(() => {
    if (!syncWithServer) return
    void loadStatus()
  }, [syncWithServer, loadStatus])

  useEffect(() => {
    if (!syncWithServer || !status?.inProgress) return
    const timer = window.setInterval(() => {
      void loadStatus()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [syncWithServer, status?.inProgress, loadStatus])

  async function handleSaveConfig(nextConfig: BackupConfig) {
    if (!syncWithServer) {
      setStatus((prev) =>
        prev ? { ...prev, config: nextConfig } : STATIC_DEMO_STATUS,
      )
      setNotice({ kind: 'success', message: 'Backup settings saved.' })
      return
    }
    setBusyAction('save')
    setNotice(null)
    try {
      const nextStatus = await updateBackupConfig(nextConfig)
      setStatus(nextStatus)
      setValidationOverride(null)
      setNotice({
        kind: 'success',
        message: 'Backup configuration saved.',
      })
    } catch (error) {
      setNotice({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to save backup configuration',
      })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleValidateConfig(candidate: BackupConfig) {
    if (!syncWithServer) {
      setValidationOverride({
        ok: true,
        resolvedTargetSummary:
          candidate.targets[candidate.activeProvider].directory ||
          'Preview target',
      })
      return
    }
    setBusyAction('validate')
    setNotice(null)
    try {
      const validation = await validateBackupConfig(candidate)
      setValidationOverride(validation)
    } catch (error) {
      setValidationOverride({
        ok: false,
        error:
          error instanceof Error ? error.message : 'Target validation failed',
      })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleBackupNow() {
    if (!syncWithServer) {
      setNotice({
        kind: 'success',
        message: 'Preview mode: connect the server to create real backups.',
      })
      return
    }
    setBusyAction('backup')
    setNotice(null)
    try {
      const result = await triggerBackupNow()
      setStatus(result.status)
      setValidationOverride(null)
      setNotice({
        kind: 'success',
        message: `Backup completed (${result.run.fileCount} files archived).`,
      })
    } catch (error) {
      await loadStatus()
      setNotice({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Backup failed',
      })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleRestoreSnapshot(snapshotId: string) {
    if (!syncWithServer) {
      setNotice({
        kind: 'success',
        message: `Preview restore triggered for ${snapshotId}.`,
      })
      return
    }
    setBusyAction('restore')
    setNotice(null)
    try {
      const result = await restoreBackupSnapshot(snapshotId)
      setStatus(result.status)
      setValidationOverride(null)
      await onDriveRestored?.()
      setNotice({
        kind: 'success',
        message: result.safetySnapshot
          ? `Drive restored from ${result.restoredSnapshot.id}. Safety snapshot saved as ${result.safetySnapshot.id}.`
          : `Drive restored from ${result.restoredSnapshot.id}.`,
      })
    } catch (error) {
      await loadStatus()
      throw error
    } finally {
      setBusyAction(null)
    }
  }

  async function handleDeleteSnapshot(snapshotId: string) {
    if (!syncWithServer) return
    setBusyAction('delete')
    setNotice(null)
    try {
      const nextStatus = await deleteBackupSnapshot(snapshotId)
      setStatus(nextStatus)
      setNotice({
        kind: 'success',
        message: `Deleted snapshot ${snapshotId}.`,
      })
    } catch (error) {
      setNotice({
        kind: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to delete snapshot',
      })
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <BackupSettingsPanel
      status={status}
      loading={loading}
      busyAction={busyAction}
      validationOverride={validationOverride}
      notice={notice}
      onDismissNotice={() => setNotice(null)}
      onRefresh={() => void loadStatus()}
      onSaveConfig={handleSaveConfig}
      onValidateConfig={handleValidateConfig}
      onBackupNow={handleBackupNow}
      onRestoreSnapshot={handleRestoreSnapshot}
      onDeleteSnapshot={handleDeleteSnapshot}
    />
  )
}
