import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import type {
  BackupProviderDescriptor,
  BackupSnapshot,
  BackupStatusResponse,
} from '#/lib/backup/types'
import { BackupSettingsPanel } from './BackupSettingsPanel'

const DEMO_PROVIDERS: BackupProviderDescriptor[] = [
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
]

const DEMO_SNAPSHOTS: BackupSnapshot[] = [
  {
    id: '2026-11-28T09-15-00-000Z-a1b2c3',
    providerId: 'local-directory',
    createdAt: '2026-11-28T09:15:00.000Z',
    trigger: 'scheduled',
    sizeBytes: 428_400,
    fileCount: 19,
    locationSummary:
      '/home/researcher/.xdrive/backups/xdrive-backup-2026-11-28T09-15-00-000Z-a1b2c3.zip',
  },
  {
    id: '2026-11-28T07-00-00-000Z-d4e5f6',
    providerId: 'local-directory',
    createdAt: '2026-11-28T07:00:00.000Z',
    trigger: 'manual',
    sizeBytes: 412_120,
    fileCount: 18,
    locationSummary:
      '/home/researcher/.xdrive/backups/xdrive-backup-2026-11-28T07-00-00-000Z-d4e5f6.zip',
    label: 'Before QEC paper refactor',
  },
  {
    id: '2026-11-27T21-40-00-000Z-998877',
    providerId: 'local-directory',
    createdAt: '2026-11-27T21:40:00.000Z',
    trigger: 'pre-restore',
    sizeBytes: 398_900,
    fileCount: 17,
    locationSummary:
      '/home/researcher/.xdrive/backups/xdrive-backup-2026-11-27T21-40-00-000Z-998877.zip',
    label: 'Safety snapshot before restore',
  },
]

function makeStatus(
  overrides: Partial<BackupStatusResponse> = {},
): BackupStatusResponse {
  return {
    driveDir: '/home/researcher/xdrive/marble-drive',
    configDir: '/home/researcher/.xdrive/backup/9a2c4f8e1b7d3c01',
    config: {
      version: 1,
      activeProvider: 'local-directory',
      schedule: {
        enabled: true,
        intervalMinutes: 60,
      },
      targets: {
        'local-directory': {
          directory: '/home/researcher/.xdrive/backups',
          retentionCount: 20,
        },
        'git-repository': {
          directory: '/home/researcher/.xdrive/backup-git',
          branch: 'main',
          remoteUrl: 'git@github.com:researcher/xdrive-backups.git',
          autoPush: true,
        },
      },
    },
    providers: DEMO_PROVIDERS,
    validation: {
      ok: true,
      resolvedTargetSummary: '/home/researcher/.xdrive/backups',
    },
    inProgress: null,
    lastRun: {
      id: 'run-healthy-1',
      providerId: 'local-directory',
      trigger: 'scheduled',
      status: 'success',
      startedAt: '2026-11-28T09:15:00.000Z',
      finishedAt: '2026-11-28T09:15:01.420Z',
      durationMs: 1420,
      sizeBytes: 428_400,
      fileCount: 19,
      locationSummary: '/home/researcher/.xdrive/backups',
      snapshotId: DEMO_SNAPSHOTS[0].id,
      prunedCount: 0,
    },
    lastSuccess: {
      id: 'run-healthy-1',
      providerId: 'local-directory',
      trigger: 'scheduled',
      status: 'success',
      startedAt: '2026-11-28T09:15:00.000Z',
      finishedAt: '2026-11-28T09:15:01.420Z',
      durationMs: 1420,
      sizeBytes: 428_400,
      fileCount: 19,
      locationSummary: '/home/researcher/.xdrive/backups',
      snapshotId: DEMO_SNAPSHOTS[0].id,
    },
    lastError: null,
    nextScheduledRunAt: '2026-11-28T10:15:00.000Z',
    snapshots: DEMO_SNAPSHOTS,
    ...overrides,
  }
}

/**
 * Drive backup & safe-restore settings panel supporting local zip archives and git repository targets.
 *
 * @summary Drive Backup settings panel
 */
const meta = {
  title: 'xDrive Settings/Drive Backup',
  component: BackupSettingsPanel,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  args: {
    status: makeStatus(),
    onSaveConfig: fn(),
    onValidateConfig: fn(),
    onBackupNow: fn(),
    onRestoreSnapshot: fn(),
    onDeleteSnapshot: fn(),
    onRefresh: fn(),
  },
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-4xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BackupSettingsPanel>

export default meta
type Story = StoryObj<typeof meta>

function InteractiveRestoreHarness() {
  const [notice, setNotice] = useState<{
    kind: 'success' | 'error'
    message: string
  } | null>(null)
  const [status, setStatus] = useState<BackupStatusResponse>(() => makeStatus())

  return (
    <BackupSettingsPanel
      status={status}
      notice={notice}
      onDismissNotice={() => setNotice(null)}
      onSaveConfig={async (nextConfig) => {
        setStatus((prev) => ({ ...prev, config: nextConfig }))
        setNotice({ kind: 'success', message: 'Backup settings saved.' })
      }}
      onValidateConfig={async () => {}}
      onBackupNow={async () => {
        setNotice({ kind: 'success', message: 'Manual backup completed.' })
      }}
      onRestoreSnapshot={async (snapshotId) => {
        setNotice({
          kind: 'success',
          message: `Restored Drive from ${snapshotId}. Saved safety snapshot first.`,
        })
      }}
      onDeleteSnapshot={async (snapshotId) => {
        setStatus((prev) => ({
          ...prev,
          snapshots: prev.snapshots.filter((s) => s.id !== snapshotId),
        }))
      }}
      onRefresh={() => {}}
    />
  )
}

/**
 * Healthy local zip-archive backup state with scheduled backups enabled and interactive restore confirmation.
 *
 * @summary Healthy local directory backup state
 */
export const HealthyLocalDirectory: Story = {
  render: () => <InteractiveRestoreHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Healthy')).toBeVisible()
    await expect(canvas.getByText('418.4 KB · 19 files · 1.4 s')).toBeVisible()
    await expect(canvas.getByText('Snapshots (3)')).toBeVisible()

    const restoreButtons = canvas.getAllByRole('button', { name: 'Restore' })
    await userEvent.click(restoreButtons[0])

    const dialog = within(document.body).getByRole('dialog')
    const dialogScope = within(dialog)
    await expect(dialog.contains(document.activeElement)).toBe(true)
    const confirmButton = dialogScope.getByRole('button', {
      name: /Restore Drive/i,
    })
    await expect(confirmButton).toBeDisabled()

    const checkbox = dialogScope.getByRole('checkbox')
    await userEvent.click(checkbox)
    await expect(confirmButton).toBeEnabled()
    await userEvent.click(confirmButton)

    await expect(
      canvas.getByText(/Restored Drive from 2026-11-28T09-15-00-000Z-a1b2c3/i),
    ).toBeVisible()
  },
}

/**
 * Git repository target with SSH remote, branch configuration, auto-push enabled, and commit history snapshots.
 *
 * @summary Git repository backup target
 */
export const GitRepositoryTarget: Story = {
  args: {
    status: makeStatus({
      config: {
        version: 1,
        activeProvider: 'git-repository',
        schedule: {
          enabled: true,
          intervalMinutes: 360,
        },
        targets: {
          'local-directory': {
            directory: '/home/researcher/.xdrive/backups',
            retentionCount: 20,
          },
          'git-repository': {
            directory: '/home/researcher/.xdrive/backup-git',
            branch: 'backups/main',
            remoteUrl: 'git@github.com:researcher/xdrive-backups.git',
            autoPush: true,
          },
        },
      },
      validation: {
        ok: true,
        resolvedTargetSummary:
          '/home/researcher/.xdrive/backup-git (backups/main -> origin)',
      },
      snapshots: [
        {
          id: '9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d',
          commitSha: '9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d',
          providerId: 'git-repository',
          createdAt: '2026-11-28T08:00:00.000Z',
          trigger: 'scheduled',
          sizeBytes: 428_400,
          fileCount: 19,
          locationSummary:
            '/home/researcher/.xdrive/backup-git (backups/main -> origin)',
          label: 'xdrive-backup: scheduled',
        },
      ],
    }),
  },
}

/**
 * Surfaces the most recent backup failure and error message while keeping previous healthy snapshots restorable.
 *
 * @summary Failed backup with error alert
 */
export const FailedBackupWithError: Story = {
  args: {
    status: makeStatus({
      lastRun: {
        id: 'run-fail-2',
        providerId: 'git-repository',
        trigger: 'scheduled',
        status: 'failed',
        startedAt: '2026-11-28T09:30:00.000Z',
        finishedAt: '2026-11-28T09:30:02.100Z',
        durationMs: 2100,
        sizeBytes: 0,
        fileCount: 0,
        locationSummary: '/home/researcher/.xdrive/backup-git',
        error:
          'Git command failed: Permission denied (publickey). Could not read from remote repository.',
      },
      lastError: {
        message:
          'Git command failed: Permission denied (publickey). Could not read from remote repository.',
        at: '2026-11-28T09:30:02.100Z',
        providerId: 'git-repository',
      },
    }),
  },
}

/**
 * First-time empty state before any backup snapshot has been created.
 *
 * @summary Empty first-time setup
 */
export const EmptyFirstTimeSetup: Story = {
  args: {
    status: makeStatus({
      config: {
        version: 1,
        activeProvider: 'local-directory',
        schedule: {
          enabled: false,
          intervalMinutes: 60,
        },
        targets: {
          'local-directory': {
            directory: '/home/researcher/.xdrive/backups',
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
      lastRun: null,
      lastSuccess: null,
      lastError: null,
      nextScheduledRunAt: null,
      snapshots: [],
    }),
  },
}

/**
 * Active backup running state disabling overlapping backup or restore triggers.
 *
 * @summary Backup in progress
 */
export const BackupInProgress: Story = {
  args: {
    busyAction: 'backup',
    status: makeStatus({
      inProgress: 'backup',
    }),
  },
}

/**
 * Validation error state when the configured backup directory points inside marble-drive.
 *
 * @summary Invalid recursive destination error
 */
export const InvalidDestinationError: Story = {
  args: {
    status: makeStatus({
      config: {
        version: 1,
        activeProvider: 'local-directory',
        schedule: { enabled: false, intervalMinutes: 60 },
        targets: {
          'local-directory': {
            directory: '/home/researcher/xdrive/marble-drive/backups',
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
      validation: {
        ok: false,
        error: 'Backup destination cannot be inside the Drive directory',
      },
      snapshots: [],
    }),
  },
}

/**
 * Verifies Radix modal focus management: initial focus inside dialog, Tab/Shift+Tab trapping, and Escape focus restoration.
 *
 * @summary Restore confirmation focus trap and restoration
 */
export const RestoreDialogFocusTrap: Story = {
  render: () => <InteractiveRestoreHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const restoreButtons = canvas.getAllByRole('button', { name: 'Restore' })
    const triggerButton = restoreButtons[0]
    triggerButton.focus()
    await userEvent.click(triggerButton)

    const dialog = within(document.body).getByRole('dialog')
    await expect(dialog.contains(document.activeElement)).toBe(true)

    for (let i = 0; i < 5; i += 1) {
      await userEvent.tab()
      await expect(dialog.contains(document.activeElement)).toBe(true)
    }

    for (let i = 0; i < 2; i += 1) {
      await userEvent.tab({ shift: true })
      await expect(dialog.contains(document.activeElement)).toBe(true)
    }

    await userEvent.keyboard('{Escape}')
    await expect(within(document.body).queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(triggerButton))
  },
}
