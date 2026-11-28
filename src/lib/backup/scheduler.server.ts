import { getDefaultBackupManager } from './manager.server'
import type { BackupManager } from './manager.server'
import type { BackupConfig, BackupRuntimeState } from './types'

const DEFAULT_GRACE_DELAY_MS = 5_000
const DEFAULT_MAX_TICK_DELAY_MS = 60_000

export interface SchedulerTimerHandle {
  unref?: () => void
}

export interface BackupSchedulerDeps {
  manager?: BackupManager
  now?: () => number
  setTimeoutFn?: (callback: () => void, delayMs: number) => SchedulerTimerHandle
  clearTimeoutFn?: (handle: SchedulerTimerHandle) => void
  graceDelayMs?: number
  maxTickDelayMs?: number
}

export function computeNextScheduledRunMs(
  config: BackupConfig,
  state: BackupRuntimeState,
  nowMs: number,
  graceDelayMs = DEFAULT_GRACE_DELAY_MS,
): { nextRunAtMs: number | null; overdue: boolean } {
  if (!config.schedule.enabled) {
    return { nextRunAtMs: null, overdue: false }
  }

  const intervalMs = Math.max(1, config.schedule.intervalMinutes) * 60_000
  const anchorIso =
    state.lastRun?.finishedAt ??
    state.lastSuccess?.finishedAt ??
    state.scheduleAnchorAt

  if (!anchorIso) {
    return { nextRunAtMs: nowMs + graceDelayMs, overdue: true }
  }

  const anchorMs = Date.parse(anchorIso)
  if (!Number.isFinite(anchorMs)) {
    return { nextRunAtMs: nowMs + graceDelayMs, overdue: true }
  }

  const dueAtMs = anchorMs + intervalMs
  if (dueAtMs <= nowMs) {
    return { nextRunAtMs: nowMs + graceDelayMs, overdue: true }
  }

  return { nextRunAtMs: dueAtMs, overdue: false }
}

export class BackupScheduler {
  private readonly manager: BackupManager
  private readonly now: () => number
  private readonly setTimeoutFn: (
    callback: () => void,
    delayMs: number,
  ) => SchedulerTimerHandle
  private readonly clearTimeoutFn: (handle: SchedulerTimerHandle) => void
  private readonly graceDelayMs: number
  private readonly maxTickDelayMs: number

  private started = false
  private timer: SchedulerTimerHandle | null = null
  private nextRunAtMs: number | null = null
  private reschedulePromise: Promise<void> | null = null
  private wakePromise: Promise<boolean> | null = null

  constructor(deps?: BackupSchedulerDeps) {
    this.manager = deps?.manager ?? getDefaultBackupManager()
    this.now = deps?.now ?? (() => Date.now())
    this.setTimeoutFn = deps?.setTimeoutFn ?? ((cb, ms) => setTimeout(cb, ms))
    this.clearTimeoutFn =
      deps?.clearTimeoutFn ??
      ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))
    this.graceDelayMs = deps?.graceDelayMs ?? DEFAULT_GRACE_DELAY_MS
    this.maxTickDelayMs = deps?.maxTickDelayMs ?? DEFAULT_MAX_TICK_DELAY_MS
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.manager.setOnConfigChanged(() => {
      void this.reschedule()
    })
    void this.reschedule()
  }

  stop(): void {
    this.started = false
    this.nextRunAtMs = null
    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer)
      this.timer = null
    }
  }

  getNextRunAt(): string | null {
    if (this.nextRunAtMs === null) return null
    return new Date(this.nextRunAtMs).toISOString()
  }

  async ensureScheduled(): Promise<void> {
    if (this.reschedulePromise) {
      await this.reschedulePromise
      return
    }
    if (this.nextRunAtMs === null) {
      await this.reschedule()
    }
  }

  async waitForIdle(): Promise<void> {
    while (this.reschedulePromise || this.wakePromise) {
      await Promise.all([
        this.reschedulePromise?.catch(() => {}),
        this.wakePromise?.catch(() => {}),
      ])
    }
  }

  async reschedule(): Promise<void> {
    if (this.reschedulePromise) {
      await this.reschedulePromise
      return
    }
    const run = (async () => {
      if (this.timer !== null) {
        this.clearTimeoutFn(this.timer)
        this.timer = null
      }

      const { config, state } = await this.manager.getConfigAndState()
      const { nextRunAtMs } = computeNextScheduledRunMs(
        config,
        state,
        this.now(),
        this.graceDelayMs,
      )
      this.nextRunAtMs = nextRunAtMs

      if (!this.started || nextRunAtMs === null) {
        return
      }

      this.armTimer(nextRunAtMs)
    })()

    this.reschedulePromise = run
    try {
      await run
    } finally {
      this.reschedulePromise = null
    }
  }

  private armTimer(targetMs: number): void {
    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer)
      this.timer = null
    }
    const remaining = Math.max(0, targetMs - this.now())
    const delay = Math.min(remaining, this.maxTickDelayMs)
    const handle = this.setTimeoutFn(() => {
      this.timer = null
      this.triggerWake()
    }, delay)
    handle.unref?.()
    this.timer = handle
  }

  private triggerWake(): void {
    if (this.wakePromise) return
    this.wakePromise = this.handleWake().finally(() => {
      this.wakePromise = null
    })
  }

  async handleWake(): Promise<boolean> {
    if (!this.started) {
      return false
    }

    const { config } = await this.manager.getConfigAndState()
    if (!config.schedule.enabled) {
      this.nextRunAtMs = null
      return false
    }

    if (this.nextRunAtMs === null) {
      await this.reschedule()
      return false
    }

    const currentMs = this.now()
    if (currentMs < this.nextRunAtMs) {
      this.armTimer(this.nextRunAtMs)
      return false
    }

    if (this.manager.isBusy()) {
      const retryAt = currentMs + this.graceDelayMs
      this.nextRunAtMs = retryAt
      this.armTimer(retryAt)
      return false
    }

    try {
      await this.manager.runBackup({ trigger: 'scheduled' })
    } catch {
      // Failure is recorded in BackupRuntimeState by BackupManager.
    }

    await this.reschedule()
    return true
  }
}

let defaultScheduler: BackupScheduler | null = null

export function getDefaultBackupScheduler(): BackupScheduler {
  if (!defaultScheduler) {
    defaultScheduler = new BackupScheduler()
  }
  return defaultScheduler
}

export function ensureBackupSchedulerStarted(): BackupScheduler {
  const scheduler = getDefaultBackupScheduler()
  scheduler.start()
  return scheduler
}

export async function syncBackupScheduler(): Promise<void> {
  const scheduler = ensureBackupSchedulerStarted()
  await scheduler.reschedule()
}
