/**
 * Shared hidden-directory exclusion helpers for `marble-drive/`.
 *
 * Kept free of Node-only imports so server storage, search indexing, backup,
 * and client code can all share one canonical exclusion contract.
 */

export const XDRIVE_META_DIR_NAME = '.xdrive'
export const TRASH_DIR_NAME = '.trash'
export const HISTORY_DIR_NAME = '.history'

export const DRIVE_HIDDEN_DIRS = [
  XDRIVE_META_DIR_NAME,
  TRASH_DIR_NAME,
  HISTORY_DIR_NAME,
] as const

export const DRIVE_HIDDEN_DIR_NAMES: ReadonlySet<string> = new Set(
  DRIVE_HIDDEN_DIRS,
)

/**
 * Returns true if a Drive entry name or relative path belongs to a hidden/internal
 * directory or dot-prefixed file (such as `.history`, `.trash`, `.xdrive`, `.DS_Store`).
 */
export function isHiddenDriveEntry(nameOrRelPath: string): boolean {
  const trimmed = nameOrRelPath.trim()
  if (!trimmed) return false
  const segments = trimmed.split(/[/\\]+/).filter((part) => part.length > 0)
  return segments.some(
    (segment) => segment.startsWith('.') || DRIVE_HIDDEN_DIR_NAMES.has(segment),
  )
}
