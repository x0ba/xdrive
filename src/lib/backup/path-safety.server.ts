import { realpath } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { BackupError } from './types'

const SNAPSHOT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const GIT_BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/
const WINDOWS_DRIVE_PREFIX = /^[A-Za-z]:/
const URL_WITH_USER_PASS_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/[^/@]*:[^/@]*@/i
const HTTP_URL_WITH_USER_PATTERN = /^https?:\/\/[^/@]+@/i

export function expandUserPath(rawPath: string): string {
  if (typeof rawPath !== 'string') {
    throw new BackupError(400, 'Backup path must be a string', 'INVALID_PATH')
  }
  if (rawPath.includes('\0')) {
    throw new BackupError(
      400,
      'Backup path cannot contain null bytes',
      'INVALID_PATH',
    )
  }
  const trimmed = rawPath.trim()
  if (!trimmed) {
    throw new BackupError(400, 'Backup path cannot be empty', 'INVALID_PATH')
  }
  if (trimmed === '~') {
    return path.resolve(os.homedir())
  }
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.resolve(os.homedir(), trimmed.slice(2))
  }
  return path.resolve(trimmed)
}

export async function resolveCanonicalPath(
  targetPath: string,
): Promise<string> {
  const resolved = path.resolve(targetPath)
  const pendingSegments: string[] = []
  let current = resolved

  for (let depth = 0; depth < 4096; depth += 1) {
    try {
      const canonicalAncestor = await realpath(current)
      return path.resolve(canonicalAncestor, ...pendingSegments.reverse())
    } catch {
      const parent = path.dirname(current)
      if (parent === current) {
        return resolved
      }
      pendingSegments.push(path.basename(current))
      current = parent
    }
  }
  return resolved
}

export function isSameOrSubpath(candidate: string, base: string): boolean {
  const rel = path.relative(path.resolve(base), path.resolve(candidate))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export async function assertSafeBackupDestination(
  rawDestDir: string,
  driveDir: string,
): Promise<string> {
  const resolvedDest = expandUserPath(rawDestDir)
  const canonicalDest = await resolveCanonicalPath(resolvedDest)
  const canonicalDrive = await resolveCanonicalPath(path.resolve(driveDir))

  if (canonicalDest === path.parse(canonicalDest).root) {
    throw new BackupError(
      400,
      'Backup destination cannot be the filesystem root',
      'UNSAFE_DESTINATION',
    )
  }

  if (isSameOrSubpath(canonicalDest, canonicalDrive)) {
    throw new BackupError(
      400,
      'Backup destination cannot be inside the Drive directory',
      'RECURSIVE_DESTINATION',
    )
  }

  if (isSameOrSubpath(canonicalDrive, canonicalDest)) {
    throw new BackupError(
      400,
      'Backup destination cannot be a parent directory of the Drive directory',
      'RECURSIVE_DESTINATION',
    )
  }

  return resolvedDest
}

export function resolveSafeArchiveEntryPath(
  targetRoot: string,
  rawEntryPath: string,
): { relativePosix: string; fullPath: string } {
  if (typeof rawEntryPath !== 'string' || !rawEntryPath) {
    throw new BackupError(
      400,
      'Archive entry path must be a non-empty string',
      'UNSAFE_ARCHIVE_ENTRY',
    )
  }
  if (rawEntryPath.includes('\0')) {
    throw new BackupError(
      400,
      'Archive entry contains null bytes',
      'UNSAFE_ARCHIVE_ENTRY',
    )
  }
  if (rawEntryPath.includes('\\')) {
    throw new BackupError(
      400,
      `Archive entry uses disallowed backslash separator: ${rawEntryPath}`,
      'UNSAFE_ARCHIVE_ENTRY',
    )
  }
  if (rawEntryPath.startsWith('/') || WINDOWS_DRIVE_PREFIX.test(rawEntryPath)) {
    throw new BackupError(
      400,
      `Archive entry uses an absolute path: ${rawEntryPath}`,
      'UNSAFE_ARCHIVE_ENTRY',
    )
  }

  const stripped = rawEntryPath.endsWith('/')
    ? rawEntryPath.slice(0, -1)
    : rawEntryPath
  if (!stripped) {
    throw new BackupError(
      400,
      'Archive entry path cannot be empty',
      'UNSAFE_ARCHIVE_ENTRY',
    )
  }

  const segments = stripped.split('/')
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..') {
      throw new BackupError(
        400,
        `Archive entry contains unsafe path segment: ${rawEntryPath}`,
        'UNSAFE_ARCHIVE_ENTRY',
      )
    }
  }

  const resolvedRoot = path.resolve(targetRoot)
  const fullPath = path.resolve(resolvedRoot, ...segments)
  if (!fullPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new BackupError(
      400,
      `Archive entry escapes target directory: ${rawEntryPath}`,
      'ZIP_SLIP',
    )
  }

  return {
    relativePosix: segments.join('/'),
    fullPath,
  }
}

export function assertSafeSnapshotId(id: string): string {
  if (typeof id !== 'string') {
    throw new BackupError(400, 'Snapshot ID is required', 'INVALID_SNAPSHOT_ID')
  }
  const trimmed = id.trim()
  if (
    !trimmed ||
    !SNAPSHOT_ID_PATTERN.test(trimmed) ||
    trimmed.includes('..')
  ) {
    throw new BackupError(400, 'Invalid snapshot ID', 'INVALID_SNAPSHOT_ID')
  }
  return trimmed
}

export function assertSafeGitBranch(branch: string): string {
  if (typeof branch !== 'string') {
    throw new BackupError(400, 'Git branch must be a string', 'INVALID_BRANCH')
  }
  const trimmed = branch.trim()
  if (
    !trimmed ||
    trimmed.startsWith('-') ||
    trimmed.startsWith('/') ||
    trimmed.endsWith('/') ||
    trimmed.endsWith('.lock') ||
    trimmed.includes('..') ||
    trimmed.includes('//') ||
    trimmed.includes('@{') ||
    /[~^:?*[\\\s]/.test(trimmed) ||
    hasControlCharacters(trimmed) ||
    !GIT_BRANCH_PATTERN.test(trimmed)
  ) {
    throw new BackupError(400, 'Invalid git branch name', 'INVALID_BRANCH')
  }
  return trimmed
}

function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) {
      return true
    }
  }
  return false
}

export function assertSafeGitRemoteUrl(remoteUrl: string): string {
  if (typeof remoteUrl !== 'string') {
    throw new BackupError(
      400,
      'Git remote URL must be a string',
      'INVALID_REMOTE',
    )
  }
  const trimmed = remoteUrl.trim()
  if (!trimmed) {
    return ''
  }
  if (trimmed.includes('\0') || trimmed.startsWith('-') || /\s/.test(trimmed)) {
    throw new BackupError(
      400,
      'Invalid git remote URL or path',
      'INVALID_REMOTE',
    )
  }
  if (
    URL_WITH_USER_PASS_PATTERN.test(trimmed) ||
    HTTP_URL_WITH_USER_PATTERN.test(trimmed)
  ) {
    throw new BackupError(
      400,
      'Do not embed credentials or tokens in the remote URL. Use SSH keys or your git credential helper instead.',
      'CREDENTIALS_IN_URL',
    )
  }
  return trimmed
}
