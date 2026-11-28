import type { ReactNode } from 'react'
import type { PrimaryNavId } from '#/components/design-system/NavigationShell'
import type { MarbleDocumentFile } from '#/lib/types'

export type CommandSectionId =
  'recent' | 'navigate' | 'create' | 'actions' | (string & {})

export const BUILTIN_SECTION_ORDER: readonly CommandSectionId[] = [
  'recent',
  'navigate',
  'create',
  'actions',
]

export const BUILTIN_SECTION_LABELS: Record<string, string | undefined> = {
  recent: 'Recent',
  navigate: 'Navigate',
  create: 'Create',
  actions: 'Actions',
}

export interface CommandItem {
  id: string
  label: string
  subtitle?: string
  section: CommandSectionId
  /** Optional custom heading when `section` is not one of the built-in sections. */
  sectionLabel?: string
  icon?: ReactNode
  shortcut?: string[]
  keywords?: string[]
  /** Canonical route path (e.g. `/d/<id>/<slug>`, `/f/<id>/<slug>`, `/chat/<threadId>`, `/settings/models`). */
  href?: string
  /** ISO timestamp or epoch ms used as secondary sort key after match quality. */
  updatedAt?: number | string
  badge?: string
  /** Optional external relevance score supplied by specialized sources (e.g. Drive-wide search). */
  score?: number
  /** Bypass fuzzy text filtering so dynamic/full-text search items stay visible for non-empty queries. */
  alwaysMatch?: boolean
  disabled?: boolean
  onSelect: () => void | Promise<void>
}

export interface CommandContext {
  pathname: string
  activeNav: PrimaryNavId
  currentFolderId: string | null
  activeDoc: MarbleDocumentFile | null
  theme: 'dark' | 'light'
  signal: AbortSignal
}

export interface CommandSource {
  id: string
  label: string
  /** Higher priority sources run/rank ahead of lower priority sources on tie. */
  priority: number
  /** Skip calling `getItems` until trimmed query reaches this length. */
  minQueryLength?: number
  /** Optional debounce delay in milliseconds before invoking an async source. */
  debounceMs?: number
  getItems: (
    query: string,
    ctx: CommandContext,
  ) => CommandItem[] | Promise<CommandItem[]>
}

export interface FuzzyMatchResult {
  score: number
  /** Half-open character index spans `[start, end)` inside the target string. */
  ranges: Array<[number, number]>
}

export interface RankedCommandItem {
  item: CommandItem
  sourceId: string
  sourcePriority: number
  matchScore: number
  recencyMs: number
  labelRanges: Array<[number, number]>
}

export interface CommandSectionGroup {
  id: CommandSectionId
  label: string
  items: RankedCommandItem[]
}
