import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { writeBackupRuntimeState } from './config-storage.server'
import { BackupManager } from './manager.server'
import { BackupScheduler, computeNextScheduledRunMs } from './scheduler.server'

describe('backup scheduler', () => {
  let tempRoot: string
  let driveDir: string
  let configDir: string
  let backupDir: string
  let manager: BackupManager
  let scheduler: BackupScheduler

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(new Date('2026-11-28T12:00:00.000Z'))

    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'xdrive-sched-test-'))
    driveDir = path.join(tempRoot, 'marble-drive')
    configDir = path.join(tempRoot, 'backup-config')
    backupDir = path.join(tempRoot, 'backups')
    await mkdir(driveDir, { recursive: true })
    await writeFile(path.join(driveDir, 'note.mrbl'), '<h1>Sched</h1>', 'utf8')

    manager = new BackupManager({
      getDriveDir: () => driveDir,
      getConfigDir: () => configDir,
      now: () => new Date(Date.now()),
    })
    scheduler = new BackupScheduler({
      manager,
      now: () => Date.now(),
      graceDelayMs: 5_000,
      maxTickDelayMs: 60_000,
    })
  })

  afterEach(async () => {
    scheduler.stop()
    await scheduler.waitForIdle()
    vi.useRealTimers()
    await rm(tempRoot, { recursive: true, force: true })
  })

  async function advanceAndWait(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms)
    await scheduler.waitForIdle()
  }

  it('computes null next run when disabled and schedules single catch-up when overdue', async () => {
    await manager.updateConfig({
      activeProvider: 'local-directory',
      schedule: { enabled: false, intervalMinutes: 60 },
      targets: {
        'local-directory': { directory: backupDir, retentionCount: 10 },
      },
    })

    const { config: disabledCfg, state } = await manager.getConfigAndState()
    expect(computeNextScheduledRunMs(disabledCfg, state, Date.now())).toEqual({
      nextRunAtMs: null,
      overdue: false,
    })

    await manager.updateConfig({
      schedule: { enabled: true, intervalMinutes: 15 },
    })

    // Simulate last run was 3 hours ago (missed 12 intervals)
    await writeBackupRuntimeState(
      {
        version: 1,
        lastRun: {
          id: 'old-run',
          providerId: 'local-directory',
          trigger: 'scheduled',
          status: 'success',
          startedAt: '2026-11-28T09:00:00.000Z',
          finishedAt: '2026-11-28T09:00:01.000Z',
          durationMs: 1000,
          sizeBytes: 100,
          fileCount: 1,
          locationSummary: backupDir,
        },
        lastSuccess: null,
        lastError: null,
        scheduleAnchorAt: null,
      },
      configDir,
    )

    scheduler.start()
    await scheduler.reschedule()

    // Fires exactly ONE catch-up backup after 5s grace delay (no burst)
    await advanceAndWait(5_500)
    let status = await manager.getStatus(scheduler.getNextRunAt())
    expect(status.snapshots).toHaveLength(1)
    expect(status.lastRun?.trigger).toBe('scheduled')

    // Advancing 10 minutes in 1-minute heartbeats does NOT trigger another backup yet
    for (let i = 0; i < 10; i += 1) {
      await advanceAndWait(60_000)
    }
    status = await manager.getStatus(scheduler.getNextRunAt())
    expect(status.snapshots).toHaveLength(1)

    // Advancing remaining 6 minutes triggers the next scheduled backup
    for (let i = 0; i < 6; i += 1) {
      await advanceAndWait(60_000)
    }
    status = await manager.getStatus(scheduler.getNextRunAt())
    expect(status.snapshots).toHaveLength(2)
  })

  it('prevents overlapping runs when manager is already busy and waits a full interval after failure', async () => {
    await manager.updateConfig({
      activeProvider: 'local-directory',
      schedule: { enabled: true, intervalMinutes: 10 },
      targets: {
        'local-directory': { directory: backupDir, retentionCount: 10 },
      },
    })

    scheduler.start()
    await scheduler.reschedule()

    const busySpy = vi.spyOn(manager, 'isBusy').mockReturnValue(true)
    const runSpy = vi.spyOn(manager, 'runBackup')

    for (let i = 0; i < 11; i += 1) {
      await advanceAndWait(60_000)
    }
    expect(runSpy).not.toHaveBeenCalled()

    busySpy.mockRestore()
    runSpy.mockRestore()

    // Force overdue state and simulate a backup failure
    await writeBackupRuntimeState(
      {
        version: 1,
        lastRun: null,
        lastSuccess: null,
        lastError: null,
        scheduleAnchorAt: '2026-11-28T11:00:00.000Z',
      },
      configDir,
    )

    const originalRun = manager.runBackup.bind(manager)
    let calls = 0
    vi.spyOn(manager, 'runBackup').mockImplementation(async (opts) => {
      calls += 1
      if (calls === 1) {
        // Simulate BackupManager writing failed state
        await writeBackupRuntimeState(
          {
            version: 1,
            lastRun: {
              id: 'failed-1',
              providerId: 'local-directory',
              trigger: 'scheduled',
              status: 'failed',
              startedAt: new Date(Date.now()).toISOString(),
              finishedAt: new Date(Date.now()).toISOString(),
              durationMs: 5,
              sizeBytes: 0,
              fileCount: 0,
              locationSummary: backupDir,
              error: 'Disk unmounted',
            },
            lastSuccess: null,
            lastError: {
              message: 'Disk unmounted',
              at: new Date(Date.now()).toISOString(),
              providerId: 'local-directory',
            },
            scheduleAnchorAt: null,
          },
          configDir,
        )
        throw new Error('Disk unmounted')
      }
      return await originalRun(opts)
    })

    await scheduler.reschedule()
    await advanceAndWait(5_500)
    expect(calls).toBe(1)

    // Next wake must wait a full 10m interval rather than retrying every 5s
    await advanceAndWait(30_000)
    expect(calls).toBe(1)
  })
})
