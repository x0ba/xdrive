import { execFile, spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  lstat,
  mkdir,
  readFile,
  readlink,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'

import {
  MAX_GIT_ARCHIVE_OUTPUT_BYTES,
  buildDriveSnapshotEntries,
  extractBackupArchiveToDir,
  verifyBackupArchiveBuffer,
} from '../archive.server'
import { computeCanonicalDriveKey } from '../config-storage.server'
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
const ATTRIBUTES_MARKER = '# xdrive-backup-preserve-bytes'
const ATTRIBUTES_BLOCK = `${ATTRIBUTES_MARKER}
drive/** -text -crlf -eol -ident -filter -export-subst -export-ignore
manifest.json -text -crlf -eol -ident -filter -export-subst -export-ignore
`

const RAW_GIT_CONFIG_ARGS = [
  '-c',
  'core.autocrlf=false',
  '-c',
  'core.safecrlf=false',
  '-c',
  'core.eol=lf',
  '-c',
  'core.attributesFile=',
  '-c',
  'core.excludesFile=',
]

interface GitCommitMetaTrailer {
  id?: string
  trigger?: BackupTrigger
  fileCount?: number
  sizeBytes?: number
  createdAt?: string
  driveKey?: string
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

function runGitBuffer(
  args: string[],
  cwd: string,
  maxBytes: number = MAX_GIT_ARCHIVE_OUTPUT_BYTES,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stdoutChunks: Buffer[] = []
    let stdoutBytes = 0
    const stderrChunks: Buffer[] = []
    let stderrBytes = 0
    let settled = false

    const failWith = (error: BackupError) => {
      if (settled) return
      settled = true
      reject(error)
    }

    child.stdout.on('data', (chunk: Buffer) => {
      if (settled) return
      stdoutBytes += chunk.byteLength
      if (stdoutBytes > maxBytes) {
        child.kill('SIGKILL')
        failWith(
          new BackupError(
            400,
            `Git backup archive exceeds the ${maxBytes} byte restore limit`,
            'BACKUP_LIMIT_EXCEEDED',
          ),
        )
        return
      }
      stdoutChunks.push(chunk)
    })

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrBytes >= 64 * 1024) return
      stderrChunks.push(chunk)
      stderrBytes += chunk.byteLength
    })

    child.on('error', (error) => {
      failWith(
        new BackupError(
          500,
          `Git archive failed: ${error.message}`,
          'GIT_ERROR',
        ),
      )
    })

    child.on('close', (code, signal) => {
      if (settled) return
      if (code !== 0) {
        const detail =
          Buffer.concat(stderrChunks).toString('utf8').trim() ||
          `exit code ${code ?? 'null'}${signal ? ` (${signal})` : ''}`
        failWith(
          new BackupError(500, `Git archive failed: ${detail}`, 'GIT_ERROR'),
        )
        return
      }
      settled = true
      resolve(Buffer.concat(stdoutChunks, stdoutBytes))
    })
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

async function ensureRawByteGitAttributes(repoDir: string): Promise<void> {
  const relAttrPath = (
    await runGitText(['rev-parse', '--git-path', 'info/attributes'], repoDir)
  ).trim()
  const attrPath = path.resolve(repoDir, relAttrPath)
  await mkdir(path.dirname(attrPath), { recursive: true })

  let existing = ''
  try {
    existing = await readFile(attrPath, 'utf8')
  } catch (error) {
    if (!isEnoent(error)) {
      throw error
    }
  }

  if (existing.includes(ATTRIBUTES_MARKER)) {
    return
  }

  const prefix =
    existing.length > 0 && !existing.endsWith('\n') ? `${existing}\n` : existing
  await writeFile(attrPath, `${prefix}${ATTRIBUTES_BLOCK}`, 'utf8')
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

  await ensureRawByteGitAttributes(repoDir)

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

function pendingGitChangesError(): BackupError {
  return new BackupError(
    409,
    'Git backup repository has uncommitted tracked changes. Commit or stash them before backing up so a failed backup cannot discard them.',
    'GIT_PENDING_CHANGES',
  )
}

async function assertNoPendingTrackedChanges(repoDir: string): Promise<void> {
  // `status` treats clean/smudge filters and autocrlf as modifications even
  // when the worktree bytes match the index. Compare the index to HEAD, then
  // raw worktree bytes to the index, so only changes `reset --hard` would
  // discard block the backup.
  const head = await runGitText(
    ['rev-parse', '--verify', '--quiet', 'HEAD'],
    repoDir,
  ).catch(() => '')
  const listed = await runGitText(['ls-files', '-s', '-z'], repoDir)
  if (!head.trim()) {
    if (listed.length > 0) throw pendingGitChangesError()
    return
  }

  const staged = await runGitText(
    ['diff-index', '--cached', '--name-only', 'HEAD'],
    repoDir,
  )
  if (staged.trim().length > 0) throw pendingGitChangesError()
  const root = path.resolve(repoDir)
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`
  for (const record of listed.split('\0')) {
    if (!record) continue
    const tab = record.indexOf('\t')
    if (tab < 0) throw pendingGitChangesError()
    const meta = record.slice(0, tab).split(' ')
    const mode = meta[0]
    const oid = meta[1]
    const stage = meta[2]
    const relativePath = record.slice(tab + 1)
    if (!mode || !oid || stage !== '0') throw pendingGitChangesError()
    if (mode === '160000') continue

    const absolute = path.resolve(repoDir, relativePath)
    if (absolute !== root && !absolute.startsWith(rootPrefix)) {
      throw pendingGitChangesError()
    }
    const info = await lstat(absolute).catch(() => null)
    if (!info || !trackedWorktreeModeMatches(mode, info)) {
      throw pendingGitChangesError()
    }

    const algorithm = oid.length === 64 ? 'sha256' : 'sha1'
    const worktreeOid =
      mode === '120000'
        ? gitBlobOid(Buffer.from(await readlink(absolute)), algorithm)
        : await hashWorktreeBlob(absolute, info.size, algorithm)
    if (worktreeOid !== oid) throw pendingGitChangesError()
  }
}

function trackedWorktreeModeMatches(
  mode: string,
  info: { mode: number; isSymbolicLink: () => boolean },
): boolean {
  if (mode === '120000') return info.isSymbolicLink()
  if (info.isSymbolicLink()) return false
  const executable = (info.mode & 0o111) !== 0
  if (mode === '100755') return executable
  if (mode === '100644') return !executable
  return false
}

function gitBlobOid(content: Buffer, algorithm: 'sha1' | 'sha256'): string {
  return createHash(algorithm)
    .update(`blob ${content.byteLength}\0`)
    .update(content)
    .digest('hex')
}

function hashWorktreeBlob(
  filePath: string,
  size: number,
  algorithm: 'sha1' | 'sha256',
): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm)
    hash.update(`blob ${size}\0`)
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => {
      hash.update(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => {
      resolve(hash.digest('hex'))
    })
  })
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
          ...(typeof rec.driveKey === 'string'
            ? { driveKey: rec.driveKey }
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

async function verifyCommittedTreeMatchesManifest(
  repoDir: string,
  commitSha: string,
  expectedPaths: ReadonlyArray<string>,
): Promise<void> {
  if (expectedPaths.length === 0) {
    return
  }

  const rawTree = await runGitText(
    [
      ...RAW_GIT_CONFIG_ARGS,
      'ls-tree',
      '-r',
      '-z',
      '--name-only',
      commitSha,
      '--',
      'drive',
    ],
    repoDir,
  )

  const committed = rawTree
    .split('\0')
    .filter((entry) => entry.length > 0)
    .map((entry) => (entry.startsWith('drive/') ? entry.slice(6) : entry))
    .sort()

  const expected = expectedPaths.slice().sort()
  if (committed.length !== expected.length) {
    throw new BackupError(
      500,
      `Git commit file count (${committed.length}) does not match Drive manifest (${expected.length})`,
      'GIT_VERIFY_FAILED',
    )
  }

  for (let i = 0; i < expected.length; i += 1) {
    if (committed[i] !== expected[i]) {
      throw new BackupError(
        500,
        `Git commit omitted or altered file path: ${expected[i]}`,
        'GIT_VERIFY_FAILED',
      )
    }
  }
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
      await assertNoPendingTrackedChanges(repoDir)

      const snapshotId = `${now.toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`
      const createdAt = now.toISOString()
      const driveKey = await computeCanonicalDriveKey(options.driveDir)

      // Check file count, uncompressed size, and manifest limits BEFORE mutating repo state.
      const { manifest, files } = await buildDriveSnapshotEntries({
        driveDir: options.driveDir,
        id: snapshotId,
        createdAt,
        trigger: options.trigger,
        driveKey,
        label: options.label,
        limits: options.limits,
      })

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

      const prevHead = await runGitText(
        ['rev-parse', '--verify', 'HEAD'],
        repoDir,
      )
        .then((sha) => sha.trim())
        .catch(() => null)

      const repoDriveDir = path.join(repoDir, 'drive')
      await rm(repoDriveDir, { recursive: true, force: true })
      await runGitText(
        [
          ...RAW_GIT_CONFIG_ARGS,
          'rm',
          '--cached',
          '-r',
          '-f',
          '--ignore-unmatch',
          '--',
          'drive',
        ],
        repoDir,
      )
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

      await runGitText(
        [...RAW_GIT_CONFIG_ARGS, 'add', '-f', '--', 'manifest.json'],
        repoDir,
      )
      if (files.length > 0) {
        await runGitText(
          [...RAW_GIT_CONFIG_ARGS, 'add', '-f', '--', 'drive'],
          repoDir,
        )
      }

      const metaPayload: GitCommitMetaTrailer = {
        id: snapshotId,
        trigger: options.trigger,
        fileCount: manifest.fileCount,
        sizeBytes: manifest.totalUncompressedBytes,
        createdAt,
        driveKey,
        ...(options.label ? { label: options.label } : {}),
      }

      await runGitText(
        [
          ...RAW_GIT_CONFIG_ARGS,
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

      try {
        await verifyCommittedTreeMatchesManifest(
          repoDir,
          commitSha,
          manifest.files.map((item) => item.path),
        )

        const hasDriveTree = await runGitText(
          ['cat-file', '-e', `${commitSha}:drive`],
          repoDir,
        )
          .then(() => true)
          .catch(() => false)

        const archiveArgs = hasDriveTree
          ? [
              'archive',
              '--format=zip',
              commitSha,
              '--',
              'manifest.json',
              'drive',
            ]
          : ['archive', '--format=zip', commitSha, '--', 'manifest.json']

        const maxArchiveBytes =
          options.limits?.maxArchiveBytes ?? MAX_GIT_ARCHIVE_OUTPUT_BYTES
        const zipBuffer = await runGitBuffer(
          [...RAW_GIT_CONFIG_ARGS, ...archiveArgs],
          repoDir,
          maxArchiveBytes,
        )

        await verifyBackupArchiveBuffer(zipBuffer, {
          ...options.limits,
          ignoreEntriesOutsideDrive: true,
        })
      } catch (verifyError) {
        if (prevHead) {
          await runGitText(['reset', '--hard', prevHead], repoDir).catch(
            () => {},
          )
        } else {
          await runGitText(
            ['update-ref', '-d', `refs/heads/${branch}`],
            repoDir,
          ).catch(() => {})
          await runGitText(
            [
              ...RAW_GIT_CONFIG_ARGS,
              'rm',
              '--cached',
              '-r',
              '-f',
              '--ignore-unmatch',
              '--',
              'manifest.json',
              'drive',
            ],
            repoDir,
          ).catch(() => {})
        }
        throw verifyError
      }

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
          driveKey,
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
          ...(meta?.driveKey ? { driveKey: meta.driveKey } : {}),
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

      const hasDriveTree = await runGitText(
        ['cat-file', '-e', `${trimmedSha}:drive`],
        repoDir,
      )
        .then(() => true)
        .catch(() => false)

      const archiveArgs = hasDriveTree
        ? [
            'archive',
            '--format=zip',
            trimmedSha,
            '--',
            'manifest.json',
            'drive',
          ]
        : ['archive', '--format=zip', trimmedSha, '--', 'manifest.json']

      const zipBuffer = await runGitBuffer(
        [...RAW_GIT_CONFIG_ARGS, ...archiveArgs],
        repoDir,
        MAX_GIT_ARCHIVE_OUTPUT_BYTES,
      )

      const manifest = await extractBackupArchiveToDir(zipBuffer, stagingDir, {
        ignoreEntriesOutsideDrive: true,
      })
      return {
        id: trimmedSha,
        providerId: 'git-repository',
        createdAt: manifest.createdAt,
        trigger: manifest.trigger,
        sizeBytes: manifest.totalUncompressedBytes,
        fileCount: manifest.fileCount,
        locationSummary: locationLabel(repoDir, branch, remoteUrl),
        ...(manifest.driveKey ? { driveKey: manifest.driveKey } : {}),
        ...(manifest.label ? { label: manifest.label } : {}),
        commitSha: trimmedSha,
      }
    },
  }
