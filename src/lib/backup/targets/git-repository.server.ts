import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  buildDriveSnapshotEntries,
  extractBackupArchiveToDir,
} from '../archive.server'
import {
  assertSafeBackupDestination,
  assertSafeGitBranch,
  assertSafeGitRemoteUrl,
} from '../path-safety.server'
import { BackupError } from '../types'
import type {
  BackupSnapshot,
  BackupTrigger,
  GitRepositoryTargetConfig,
} from '../types'
import type {
  BackupContext,
  BackupTarget,
  BackupValidationResult,
  WriteSnapshotOptions,
  WriteSnapshotResult,
} from '../provider.server'

const GIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i
const MAX_GIT_OUTPUT_BYTES = 256 * 1024 * 1024

interface GitCommitMetaTrailer {
  id?: string
  trigger?: BackupTrigger
  fileCount?: number
  sizeBytes?: number
  createdAt?: string
  label?: string
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

function runGitText(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
        },
        maxBuffer: 32 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr.trim() || error.message
          reject(
            new BackupError(500, `Git command failed: ${detail}`, 'GIT_ERROR'),
          )
          return
        }
        resolve(stdout)
      },
    )
  })
}

function runGitBuffer(args: string[], cwd: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        encoding: 'buffer',
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
        },
        maxBuffer: MAX_GIT_OUTPUT_BYTES,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail =
            Buffer.isBuffer(stderr) && stderr.byteLength > 0
              ? stderr.toString('utf8').trim()
              : error.message
          reject(
            new BackupError(500, `Git archive failed: ${detail}`, 'GIT_ERROR'),
          )
          return
        }
        resolve(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout))
      },
    )
  })
}

async function validateGitTarget(
  config: GitRepositoryTargetConfig,
  driveDir: string,
): Promise<{
  repoDir: string
  branch: string
  remoteUrl: string
  warning?: string
}> {
  const repoDir = await assertSafeBackupDestination(config.directory, driveDir)
  const branch = assertSafeGitBranch(config.branch || 'main')
  const remoteUrl = assertSafeGitRemoteUrl(config.remoteUrl)

  try {
    const info = await stat(repoDir)
    if (!info.isDirectory()) {
      throw new BackupError(
        400,
        `Git repository path exists and is not a directory: ${repoDir}`,
        'INVALID_DESTINATION',
      )
    }
  } catch (error) {
    if (error instanceof BackupError) {
      throw error
    }
    if (!isEnoent(error)) {
      throw new BackupError(
        400,
        `Git repository path is not accessible: ${error instanceof Error ? error.message : String(error)}`,
        'DESTINATION_UNREACHABLE',
      )
    }
  }

  try {
    await runGitText(['--version'], process.cwd())
  } catch {
    throw new BackupError(
      500,
      'git CLI is not installed or not available on PATH',
      'GIT_UNAVAILABLE',
    )
  }

  const warning =
    config.autoPush && !remoteUrl
      ? 'Auto-push is enabled without a remote URL; snapshots will stay local only.'
      : undefined

  return { repoDir, branch, remoteUrl, warning }
}

async function ensureGitRepoInitialized(
  repoDir: string,
  branch: string,
  remoteUrl: string,
): Promise<void> {
  await mkdir(repoDir, { recursive: true })

  let hasGitDir = false
  try {
    const info = await stat(path.join(repoDir, '.git'))
    hasGitDir = info.isDirectory() || info.isFile()
  } catch (error) {
    if (!isEnoent(error)) {
      throw error
    }
  }

  if (!hasGitDir) {
    try {
      await runGitText(['init', '-b', branch], repoDir)
    } catch {
      await runGitText(['init'], repoDir)
      await runGitText(['checkout', '-B', branch], repoDir)
    }
  }

  const userName = await runGitText(['config', 'user.name'], repoDir).catch(
    () => '',
  )
  if (!userName.trim()) {
    await runGitText(
      ['config', '--local', 'user.name', 'xDrive Backup'],
      repoDir,
    )
  }

  const userEmail = await runGitText(['config', 'user.email'], repoDir).catch(
    () => '',
  )
  if (!userEmail.trim()) {
    await runGitText(
      ['config', '--local', 'user.email', 'backup@xdrive.local'],
      repoDir,
    )
  }

  if (remoteUrl) {
    const existingOrigin = await runGitText(
      ['remote', 'get-url', 'origin'],
      repoDir,
    ).catch(() => null)
    if (existingOrigin === null) {
      await runGitText(['remote', 'add', 'origin', remoteUrl], repoDir)
    } else if (existingOrigin.trim() !== remoteUrl) {
      await runGitText(['remote', 'set-url', 'origin', remoteUrl], repoDir)
    }
  }
}

function parseMetaTrailer(body: string): GitCommitMetaTrailer | null {
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('XDrive-Meta:')) continue
    const rawJson = line.slice('XDrive-Meta:'.length).trim()
    try {
      const parsed: unknown = JSON.parse(rawJson)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const rec = parsed as Record<string, unknown>
        const trigger =
          rec.trigger === 'scheduled' ||
          rec.trigger === 'pre-restore' ||
          rec.trigger === 'manual'
            ? rec.trigger
            : undefined
        return {
          ...(typeof rec.id === 'string' ? { id: rec.id } : {}),
          ...(trigger ? { trigger } : {}),
          ...(typeof rec.fileCount === 'number'
            ? { fileCount: rec.fileCount }
            : {}),
          ...(typeof rec.sizeBytes === 'number'
            ? { sizeBytes: rec.sizeBytes }
            : {}),
          ...(typeof rec.createdAt === 'string'
            ? { createdAt: rec.createdAt }
            : {}),
          ...(typeof rec.label === 'string' ? { label: rec.label } : {}),
        }
      }
    } catch {
      return null
    }
  }
  return null
}

function locationLabel(repoDir: string, branch: string, remoteUrl: string) {
  return remoteUrl
    ? `${repoDir} (${branch} -> origin)`
    : `${repoDir} (${branch})`
}

export const gitRepositoryBackupTarget: BackupTarget<GitRepositoryTargetConfig> =
  {
    descriptor: {
      id: 'git-repository',
      name: 'Git Repository',
      description:
        'Commits Drive snapshots to a local git repository and optionally pushes using your existing SSH or git credentials.',
      supportsRetention: false,
      credentialNote:
        'Uses your local git and SSH configuration. Never embed tokens or passwords in the remote URL.',
    },

    async validate(
      config: GitRepositoryTargetConfig,
      ctx: BackupContext,
    ): Promise<BackupValidationResult> {
      try {
        const { repoDir, branch, remoteUrl, warning } = await validateGitTarget(
          config,
          ctx.driveDir,
        )
        return {
          ok: true,
          ...(warning ? { warning } : {}),
          resolvedTargetSummary: locationLabel(repoDir, branch, remoteUrl),
        }
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Git repository validation failed',
        }
      }
    },

    async init(
      config: GitRepositoryTargetConfig,
      ctx: BackupContext,
    ): Promise<void> {
      const { repoDir, branch, remoteUrl } = await validateGitTarget(
        config,
        ctx.driveDir,
      )
      await ensureGitRepoInitialized(repoDir, branch, remoteUrl)
    },

    async writeSnapshot(
      config: GitRepositoryTargetConfig,
      options: WriteSnapshotOptions,
    ): Promise<WriteSnapshotResult> {
      const now = options.now ?? new Date()
      const { repoDir, branch, remoteUrl } = await validateGitTarget(
        config,
        options.driveDir,
      )
      await ensureGitRepoInitialized(repoDir, branch, remoteUrl)

      const branchExists = await runGitText(
        ['rev-parse', '--verify', `refs/heads/${branch}`],
        repoDir,
      )
        .then(() => true)
        .catch(() => false)
      await runGitText(
        branchExists ? ['checkout', branch] : ['checkout', '-B', branch],
        repoDir,
      )

      const snapshotId = `${now.toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`
      const createdAt = now.toISOString()

      const { manifest, files } = await buildDriveSnapshotEntries({
        driveDir: options.driveDir,
        id: snapshotId,
        createdAt,
        trigger: options.trigger,
        label: options.label,
      })

      const repoDriveDir = path.join(repoDir, 'drive')
      await rm(repoDriveDir, { recursive: true, force: true })
      await mkdir(repoDriveDir, { recursive: true })

      for (const dir of manifest.directories) {
        await mkdir(path.join(repoDriveDir, ...dir.split('/')), {
          recursive: true,
        })
      }

      for (const file of files) {
        const destFile = path.join(repoDriveDir, ...file.relPosix.split('/'))
        await mkdir(path.dirname(destFile), { recursive: true })
        await writeFile(destFile, file.content)
      }

      await writeFile(
        path.join(repoDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf8',
      )

      await runGitText(['add', '-A'], repoDir)

      const metaPayload: GitCommitMetaTrailer = {
        id: snapshotId,
        trigger: options.trigger,
        fileCount: manifest.fileCount,
        sizeBytes: manifest.totalUncompressedBytes,
        createdAt,
        ...(options.label ? { label: options.label } : {}),
      }

      await runGitText(
        [
          '-c',
          'commit.gpgsign=false',
          'commit',
          '--allow-empty',
          '-m',
          `xdrive-backup: ${options.trigger} ${snapshotId}`,
          '-m',
          `XDrive-Meta: ${JSON.stringify(metaPayload)}`,
        ],
        repoDir,
      )

      const commitSha = (
        await runGitText(['rev-parse', 'HEAD'], repoDir)
      ).trim()

      if (config.autoPush && remoteUrl) {
        await runGitText(['push', '-u', 'origin', branch], repoDir)
      }

      return {
        snapshot: {
          id: commitSha,
          providerId: 'git-repository',
          createdAt,
          trigger: options.trigger,
          sizeBytes: manifest.totalUncompressedBytes,
          fileCount: manifest.fileCount,
          locationSummary: locationLabel(repoDir, branch, remoteUrl),
          ...(options.label ? { label: options.label } : {}),
          commitSha,
        },
        prunedCount: 0,
      }
    },

    async listSnapshots(
      config: GitRepositoryTargetConfig,
      ctx: BackupContext,
    ): Promise<BackupSnapshot[]> {
      const { repoDir, branch, remoteUrl } = await validateGitTarget(
        config,
        ctx.driveDir,
      )

      try {
        await stat(path.join(repoDir, '.git'))
      } catch (error) {
        if (isEnoent(error)) {
          return []
        }
        throw error
      }

      const hasBranch = await runGitText(
        ['rev-parse', '--verify', `refs/heads/${branch}`],
        repoDir,
      )
        .then(() => true)
        .catch(() => false)

      if (!hasBranch) {
        return []
      }

      const output = await runGitText(
        ['log', branch, '-n', '50', '--format=%H%x1f%cI%x1f%s%x1f%b%x1e'],
        repoDir,
      )

      const summary = locationLabel(repoDir, branch, remoteUrl)
      const snapshots: BackupSnapshot[] = []

      for (const record of output.split('\x1e')) {
        const trimmedRecord = record.trim()
        if (!trimmedRecord) continue
        const [sha = '', committedAt = '', subject = '', body = ''] =
          trimmedRecord.split('\x1f')
        const cleanSha = sha.trim()
        if (!GIT_SHA_PATTERN.test(cleanSha)) continue

        const meta = parseMetaTrailer(body)
        const trigger: BackupTrigger =
          meta?.trigger === 'scheduled' ||
          meta?.trigger === 'pre-restore' ||
          meta?.trigger === 'manual'
            ? meta.trigger
            : 'manual'

        snapshots.push({
          id: cleanSha,
          providerId: 'git-repository',
          createdAt: meta?.createdAt ?? committedAt.trim(),
          trigger,
          sizeBytes:
            typeof meta?.sizeBytes === 'number' &&
            Number.isFinite(meta.sizeBytes)
              ? meta.sizeBytes
              : 0,
          fileCount:
            typeof meta?.fileCount === 'number' &&
            Number.isFinite(meta.fileCount)
              ? meta.fileCount
              : 0,
          locationSummary: summary,
          label: meta?.label ?? subject.trim(),
          commitSha: cleanSha,
        })
      }

      return snapshots
    },

    async restoreSnapshotToDir(
      config: GitRepositoryTargetConfig,
      snapshotId: string,
      stagingDir: string,
      ctx: BackupContext,
    ): Promise<BackupSnapshot> {
      const { repoDir, branch, remoteUrl } = await validateGitTarget(
        config,
        ctx.driveDir,
      )
      const trimmedSha = snapshotId.trim()
      if (!GIT_SHA_PATTERN.test(trimmedSha)) {
        throw new BackupError(
          400,
          'Invalid git commit snapshot ID',
          'INVALID_SNAPSHOT_ID',
        )
      }

      await runGitText(
        ['cat-file', '-e', `${trimmedSha}^{commit}`],
        repoDir,
      ).catch(() => {
        throw new BackupError(
          404,
          `Git snapshot commit "${trimmedSha}" was not found`,
          'SNAPSHOT_NOT_FOUND',
        )
      })

      const zipBuffer = await runGitBuffer(
        ['archive', '--format=zip', trimmedSha],
        repoDir,
      )

      const manifest = await extractBackupArchiveToDir(zipBuffer, stagingDir)
      return {
        id: trimmedSha,
        providerId: 'git-repository',
        createdAt: manifest.createdAt,
        trigger: manifest.trigger,
        sizeBytes: manifest.totalUncompressedBytes,
        fileCount: manifest.fileCount,
        locationSummary: locationLabel(repoDir, branch, remoteUrl),
        ...(manifest.label ? { label: manifest.label } : {}),
        commitSha: trimmedSha,
      }
    },
  }
