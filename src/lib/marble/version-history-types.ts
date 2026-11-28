import type { MarbleAppCategory } from '#/lib/types'

export const AUTO_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000
export const RETENTION_KEEP_ALL_MS = 24 * 60 * 60 * 1000
export const RETENTION_HOURLY_MS = 7 * 24 * 60 * 60 * 1000
export const RETENTION_DAILY_MS = 30 * 24 * 60 * 60 * 1000
export const MAX_AUTO_VERSIONS_PER_DOC = 100

export type DocumentVersionKind = 'auto' | 'named'

export type DocumentVersionTrigger = 'autosave' | 'manual' | 'pre-restore'

export interface DocumentVersionSummary {
  id: string
  docId: string
  slug: string
  title: string
  category: MarbleAppCategory
  kind: DocumentVersionKind
  trigger: DocumentVersionTrigger
  label?: string
  createdAt: string
  contentHash: string
  byteSize: number
  nodeCount: number
  author?: string
}

export interface DocumentVersionDetail extends DocumentVersionSummary {
  source: string
}

export interface VersionRetentionPolicy {
  keepAllWindowMs: number
  hourlyWindowMs: number
  dailyWindowMs: number
  maxAutoVersions: number
}

export const DEFAULT_VERSION_RETENTION_POLICY: VersionRetentionPolicy = {
  keepAllWindowMs: RETENTION_KEEP_ALL_MS,
  hourlyWindowMs: RETENTION_HOURLY_MS,
  dailyWindowMs: RETENTION_DAILY_MS,
  maxAutoVersions: MAX_AUTO_VERSIONS_PER_DOC,
}

export interface CreateVersionResult {
  created: boolean
  reason?: 'unchanged' | 'throttled'
  version: DocumentVersionSummary | null
  versions: DocumentVersionSummary[]
  prunedIds: string[]
}

export interface RestoreVersionResult {
  ok: true
  docId: string
  slug: string
  folderPath: string
  relPath: string
  source: string
  restoredVersion: DocumentVersionSummary
  preRestoreVersion: DocumentVersionSummary
  versions: DocumentVersionSummary[]
}
