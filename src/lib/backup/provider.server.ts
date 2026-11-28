import { gitRepositoryBackupTarget } from './targets/git-repository.server'
import { localDirectoryBackupTarget } from './targets/local-directory.server'
import { BackupError } from './types'
import type {
  BackupProviderDescriptor,
  BackupProviderId,
  BackupSnapshot,
  BackupTrigger,
  BackupValidationState,
} from './types'

export interface BackupContext {
  driveDir: string
  now: () => Date
}

export type BackupValidationResult = BackupValidationState

export interface WriteSnapshotOptions {
  driveDir: string
  trigger: BackupTrigger
  label?: string
  skipPrune?: boolean
  now?: Date
}

export interface WriteSnapshotResult {
  snapshot: BackupSnapshot
  prunedCount: number
}

export interface BackupTarget<TConfig = unknown> {
  readonly descriptor: BackupProviderDescriptor
  validate: (
    config: TConfig,
    ctx: BackupContext,
  ) => Promise<BackupValidationResult>
  init: (config: TConfig, ctx: BackupContext) => Promise<void>
  writeSnapshot: (
    config: TConfig,
    options: WriteSnapshotOptions,
  ) => Promise<WriteSnapshotResult>
  listSnapshots: (
    config: TConfig,
    ctx: BackupContext,
  ) => Promise<BackupSnapshot[]>
  restoreSnapshotToDir: (
    config: TConfig,
    snapshotId: string,
    stagingDir: string,
    ctx: BackupContext,
  ) => Promise<BackupSnapshot>
  deleteSnapshot?: (
    config: TConfig,
    snapshotId: string,
    ctx: BackupContext,
  ) => Promise<void>
}

export class BackupTargetRegistry {
  private readonly targets = new Map<BackupProviderId, BackupTarget>()

  register<TConfig>(target: BackupTarget<TConfig>): void {
    this.targets.set(target.descriptor.id, target as BackupTarget)
  }

  get(id: BackupProviderId): BackupTarget {
    const target = this.targets.get(id)
    if (!target) {
      throw new BackupError(
        400,
        `Unknown backup target provider: ${id}`,
        'UNKNOWN_PROVIDER',
      )
    }
    return target
  }

  listDescriptors(): BackupProviderDescriptor[] {
    return Array.from(this.targets.values(), (target) => target.descriptor)
  }
}

export function createDefaultBackupTargetRegistry(): BackupTargetRegistry {
  const registry = new BackupTargetRegistry()
  registry.register(localDirectoryBackupTarget)
  registry.register(gitRepositoryBackupTarget)
  return registry
}
