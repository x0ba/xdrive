import type { MarbleAppCategory } from '#/lib/types'

/**
 * Canonical item types indexed by xDrive Drive-wide search.
 */
export const SEARCH_ITEM_TYPES = [
  'document',
  'whiteboard',
  'folder',
  'chat',
] as const

/**
 * Type of a searchable item in xDrive.
 */
export type SearchItemType = (typeof SEARCH_ITEM_TYPES)[number]

/**
 * Filter tab / query value including `'all'` alongside concrete item types.
 */
export type SearchFilterType = 'all' | SearchItemType

/**
 * Indexed document fields that can produce a match.
 */
export type SearchMatchedField = 'title' | 'body' | 'tags' | 'path' | 'messages'

/**
 * Character range `[start, end)` in UTF-16 code units within a title or snippet
 * string where a query term matched. Ranges are sorted ascending and merged so
 * UI highlighters (both `/search` and the Cmd-K palette) can slice directly.
 */
export interface SearchMatchRange {
  start: number
  end: number
}

/**
 * Query options accepted by `searchDrive(...)`, `/api/search`, and `fetchDriveSearch(...)`.
 * Designed as a stable contract for both `/search` and the Cmd-K command palette.
 */
export interface SearchDriveOptions {
  /** User search string; empty or whitespace-only returns zero results. */
  query: string
  /** Optional subset of item types to return. Omit or pass empty to return all types. */
  types?: readonly SearchItemType[]
  /** Include items in `.trash/`. Defaults to `false`. */
  includeTrash?: boolean
  /** Maximum results to return (clamped to `1..200`, default `50`). */
  limit?: number
  /** Pagination offset (default `0`). */
  offset?: number
}

/**
 * Single ranked match returned by `searchDrive(...)` and `/api/search`.
 */
export interface SearchResultItem {
  /** Stable entity ID (`docId`, `folderId`, or `threadId`). */
  id: string
  /** Entity kind (`document`, `whiteboard`, `folder`, or `chat`). */
  type: SearchItemType
  /** Display title (document title, folder name, or chat thread title). */
  title: string
  /** Shareable canonical route path (`/d/<id>/<slug>`, `/f/<id>/<slug>`, or `/chat/<threadId>`). */
  href: string
  /** Relevance score (higher is more relevant). */
  score: number
  /** Contextual plain-text excerpt around the strongest body/message match. */
  snippet: string
  /** UTF-16 highlight ranges within `snippet`. */
  snippetMatches: SearchMatchRange[]
  /** UTF-16 highlight ranges within `title`. */
  titleMatches: SearchMatchRange[]
  /** Fields in which at least one query term matched. */
  matchedFields: SearchMatchedField[]
  /** Human-readable parent folder or container label (e.g. `My Drive`, `Papers / Surface Codes`, `Drive Chat`). */
  location: string
  /** ISO-8601 timestamp of last update. */
  updatedAt: string
  /** Whether this item currently resides in `.trash/`. */
  trashed: boolean
  /** ISO-8601 trash timestamp when `trashed` is `true`. */
  trashedAt?: string | null
  /** Marble category for `.mrbl` documents and whiteboards. */
  category?: MarbleAppCategory
  /** URL slug for `.mrbl` files. */
  slug?: string
  /** Disk file name (e.g. `surface-codes.mrbl`) for `.mrbl` items. */
  fileName?: string
  /** Metadata tags attached to a document. */
  tags?: string[]
  /** Whether the `.mrbl` file lives under `Templates/`. */
  isTemplate?: boolean
  /** Starred flag when applicable. */
  starred?: boolean
  /** Pinned flag when applicable. */
  pinned?: boolean
  /** Number of messages in a Drive Chat thread. */
  messageCount?: number
}

/**
 * Per-type match counts computed across all non-type-filtered matches for a query
 * (respecting `includeTrash`), so filter tabs can display accurate counts.
 */
export interface SearchDriveCounts {
  all: number
  document: number
  whiteboard: number
  folder: number
  chat: number
}

/**
 * Full search payload returned by `searchDrive(...)`, `/api/search`, and `fetchDriveSearch(...)`.
 */
export interface SearchDriveResponse {
  /** Original query string passed in options. */
  query: string
  /** Normalized query tokens used for matching and highlighting. */
  terms: string[]
  /** Ranked page of results matching `types` / `offset` / `limit`. */
  results: SearchResultItem[]
  /** Total matching items after applying `types` and `includeTrash` filters. */
  total: number
  /** Match distribution across all item types prior to `types` filtering. */
  counts: SearchDriveCounts
  /** Query execution duration in milliseconds. */
  tookMs: number
  /** Total entries currently present in the Drive search index. */
  indexedCount: number
}

/**
 * Normalized record stored inside `DriveSearchIndex`.
 */
export interface IndexableItem {
  /** Unique index key (`${type}:${id}`). */
  key: string
  id: string
  type: SearchItemType
  title: string
  href: string
  body: string
  description: string
  location: string
  path: string
  tags: string[]
  slug?: string
  fileName?: string
  category?: MarbleAppCategory
  isTemplate?: boolean
  starred?: boolean
  pinned?: boolean
  trashed: boolean
  trashedAt?: string | null
  updatedAt: string
  messageCount?: number
}

const SEARCH_TYPE_ALIASES: Record<string, SearchItemType> = {
  document: 'document',
  documents: 'document',
  doc: 'document',
  docs: 'document',
  whiteboard: 'whiteboard',
  whiteboards: 'whiteboard',
  board: 'whiteboard',
  boards: 'whiteboard',
  folder: 'folder',
  folders: 'folder',
  chat: 'chat',
  chats: 'chat',
  thread: 'chat',
  threads: 'chat',
}

/**
 * Normalize singular/plural search type query aliases (e.g. `documents` -> `document`).
 * Returns `undefined` for `'all'`, empty values, or unrecognized strings.
 */
export function normalizeSearchType(
  raw: string | null | undefined,
): SearchItemType | undefined {
  if (typeof raw !== 'string') return undefined
  const clean = raw.trim().toLowerCase()
  if (!clean || clean === 'all') return undefined
  return SEARCH_TYPE_ALIASES[clean]
}
