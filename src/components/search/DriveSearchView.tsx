import React, { useEffect, useRef, useState } from 'react'
import {
  Folder,
  Loader2,
  MessageSquare,
  PenLine,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import {
  getCategoryIcon,
  getCategoryLabel,
} from '#/components/design-system/NavigationShell'
import { WorkspaceLink } from '#/components/routing/WorkspaceLink'
import { searchHref } from '#/lib/routing'
import type {
  SearchDriveOptions,
  SearchDriveResponse,
  SearchFilterType,
  SearchMatchRange,
  SearchResultItem,
} from '#/lib/search/types'

export interface HighlightedTextProps {
  text: string
  matches?: readonly SearchMatchRange[]
}

/**
 * Render plain text with `<mark>` highlights at precomputed UTF-16 match ranges.
 */
export function HighlightedText({ text, matches = [] }: HighlightedTextProps) {
  if (!text || matches.length === 0) return <>{text}</>

  const valid = matches
    .filter((m) => m.start >= 0 && m.end > m.start && m.start < text.length)
    .map((m) => ({
      start: m.start,
      end: Math.min(text.length, m.end),
    }))
    .sort((a, b) => a.start - b.start)

  if (valid.length === 0) return <>{text}</>

  const parts: React.ReactNode[] = []
  let cursor = 0
  valid.forEach((range, idx) => {
    if (range.start > cursor) {
      parts.push(
        <React.Fragment key={`t-${idx}`}>
          {text.slice(cursor, range.start)}
        </React.Fragment>,
      )
    }
    const start = Math.max(cursor, range.start)
    if (range.end > start) {
      parts.push(
        <mark
          key={`m-${idx}`}
          className="rounded-[2px] bg-[var(--xd-accent-soft)] px-0.5 font-medium text-[var(--xd-ink)]"
        >
          {text.slice(start, range.end)}
        </mark>,
      )
      cursor = range.end
    }
  })

  if (cursor < text.length) {
    parts.push(<React.Fragment key="tail">{text.slice(cursor)}</React.Fragment>)
  }

  return <>{parts}</>
}

export interface DriveSearchViewProps {
  query: string
  typeFilter: SearchFilterType
  includeTrash: boolean
  onQueryChange: (query: string) => void
  onTypeFilterChange: (type: SearchFilterType) => void
  onIncludeTrashChange: (includeTrash: boolean) => void
  searchFn: (
    options: SearchDriveOptions,
    signal?: AbortSignal,
  ) => Promise<SearchDriveResponse>
  onOpenResult?: (item: SearchResultItem) => void
  debounceMs?: number
  pageSize?: number
  initialIndexedCount?: number
}

const DEFAULT_PAGE_SIZE = 50

const FILTER_TABS: Array<{ id: SearchFilterType; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'document', label: 'Documents' },
  { id: 'whiteboard', label: 'Whiteboards' },
  { id: 'folder', label: 'Folders' },
  { id: 'chat', label: 'Chats' },
]

function formatRelativeDate(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return iso
  const minutes = Math.round((Date.now() - ms) / 60_000)
  if (Math.abs(minutes) < 1) return 'just now'
  if (Math.abs(minutes) < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 36) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 28) return `${days}d ago`
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function renderItemIcon(item: SearchResultItem) {
  switch (item.type) {
    case 'whiteboard':
      return <PenLine className="h-4 w-4 text-[var(--xd-sketch)]" />
    case 'folder':
      return <Folder className="h-4 w-4 text-[var(--xd-ink-secondary)]" />
    case 'chat':
      return <MessageSquare className="h-4 w-4 text-[var(--xd-commit)]" />
    case 'document':
    default:
      return (
        <span className="text-[var(--xd-accent)]">
          {getCategoryIcon(item.category ?? 'document', 'h-4 w-4')}
        </span>
      )
  }
}

function itemTypeLabel(item: SearchResultItem): string {
  switch (item.type) {
    case 'whiteboard':
      return 'Whiteboard'
    case 'folder':
      return 'Folder'
    case 'chat':
      return 'Chat'
    case 'document':
      return getCategoryLabel(item.category ?? 'document')
  }
}

export function DriveSearchView({
  query,
  typeFilter,
  includeTrash,
  onQueryChange,
  onTypeFilterChange,
  onIncludeTrashChange,
  searchFn,
  onOpenResult,
  debounceMs = 150,
  pageSize = DEFAULT_PAGE_SIZE,
  initialIndexedCount,
}: DriveSearchViewProps) {
  const effectivePageSize = Number.isFinite(pageSize)
    ? Math.max(1, Math.trunc(pageSize))
    : DEFAULT_PAGE_SIZE

  const [inputValue, setInputValue] = useState(query)
  const [response, setResponse] = useState<SearchDriveResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const [retryTick, setRetryTick] = useState(0)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const debounceTimerRef = useRef<number | null>(null)
  const loadMoreAbortRef = useRef<AbortController | null>(null)
  const committedQueryRef = useRef(query.trim())
  const onQueryChangeRef = useRef(onQueryChange)
  onQueryChangeRef.current = onQueryChange
  const searchFnRef = useRef(searchFn)
  searchFnRef.current = searchFn

  // Sync only genuine external navigation changes; ignore post-debounce trims
  // of the user's in-progress draft (e.g. typing a trailing space between words).
  useEffect(() => {
    const normalizedQuery = query.trim()
    if (normalizedQuery === committedQueryRef.current) {
      return
    }
    committedQueryRef.current = normalizedQuery
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    setInputValue(query)
  }, [query])

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current)
      }
      loadMoreAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    function onWindowKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      event.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('keydown', onWindowKeyDown)
    return () => window.removeEventListener('keydown', onWindowKeyDown)
  }, [])

  const trimmedQuery = query.trim()

  useEffect(() => {
    loadMoreAbortRef.current?.abort()
    loadMoreAbortRef.current = null
    setLoadingMore(false)
    setLoadMoreError(null)

    if (!trimmedQuery) {
      setLoading(false)
      setError(null)
      setResponse(null)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    searchFnRef
      .current(
        {
          query: trimmedQuery,
          types: typeFilter === 'all' ? undefined : [typeFilter],
          includeTrash,
          limit: effectivePageSize,
          offset: 0,
        },
        controller.signal,
      )
      .then((res) => {
        if (controller.signal.aborted) return
        setResponse(res)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        if (
          err &&
          typeof err === 'object' &&
          'name' in err &&
          (err as { name?: unknown }).name === 'AbortError'
        ) {
          return
        }
        setError(err instanceof Error ? err.message : 'Search failed')
        setLoading(false)
      })

    return () => {
      controller.abort()
      loadMoreAbortRef.current?.abort()
      loadMoreAbortRef.current = null
    }
  }, [trimmedQuery, typeFilter, includeTrash, retryTick, effectivePageSize])

  const emitQuery = (next: string) => {
    committedQueryRef.current = next.trim()
    onQueryChangeRef.current(next)
  }

  const commitQueryImmediate = (next: string) => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    emitQuery(next)
  }

  const handleInputChange = (next: string) => {
    setInputValue(next)
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current)
    }
    if (debounceMs <= 0) {
      emitQuery(next)
      return
    }
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null
      emitQuery(next)
    }, debounceMs)
  }

  const handleClear = () => {
    setInputValue('')
    commitQueryImmediate('')
    inputRef.current?.focus()
  }

  const handleLoadMore = () => {
    if (!trimmedQuery || loading || loadingMore || !response) return
    if (response.results.length >= response.total) return

    loadMoreAbortRef.current?.abort()
    const controller = new AbortController()
    loadMoreAbortRef.current = controller
    setLoadingMore(true)
    setLoadMoreError(null)

    searchFnRef
      .current(
        {
          query: trimmedQuery,
          types: typeFilter === 'all' ? undefined : [typeFilter],
          includeTrash,
          limit: effectivePageSize,
          offset: response.results.length,
        },
        controller.signal,
      )
      .then((nextPage) => {
        if (controller.signal.aborted) return
        setResponse((prev) => {
          if (!prev) return nextPage
          const seen = new Set(
            prev.results.map((item) => `${item.type}:${item.id}`),
          )
          const appended = nextPage.results.filter(
            (item) => !seen.has(`${item.type}:${item.id}`),
          )
          const mergedResults = [...prev.results, ...appended]
          const nextTotal =
            nextPage.results.length === 0
              ? Math.min(nextPage.total, mergedResults.length)
              : nextPage.total
          return {
            ...nextPage,
            total: nextTotal,
            results: mergedResults,
          }
        })
        setLoadingMore(false)
        if (loadMoreAbortRef.current === controller) {
          loadMoreAbortRef.current = null
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        if (
          err &&
          typeof err === 'object' &&
          'name' in err &&
          (err as { name?: unknown }).name === 'AbortError'
        ) {
          return
        }
        setLoadMoreError(
          err instanceof Error ? err.message : 'Unable to load more results',
        )
        setLoadingMore(false)
        if (loadMoreAbortRef.current === controller) {
          loadMoreAbortRef.current = null
        }
      })
  }

  const counts =
    response && response.query.trim() === trimmedQuery ? response.counts : null
  const results = response?.results ?? []
  const hasMore = Boolean(
    response && !loading && results.length < response.total,
  )
  const indexedTotal = response?.indexedCount ?? initialIndexedCount

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[16px] font-semibold tracking-tight text-[var(--xd-ink)]">
          Search
        </h1>
        {trimmedQuery && response && !loading && !error ? (
          <span className="xd-tabular text-[12px] text-[var(--xd-ink-muted)]">
            {response.total} {response.total === 1 ? 'result' : 'results'} ·{' '}
            {Math.max(0, Math.round(response.tookMs))} ms
          </span>
        ) : (
          typeof indexedTotal === 'number' &&
          indexedTotal > 0 && (
            <span className="xd-tabular text-[12px] text-[var(--xd-ink-muted)]">
              {indexedTotal} indexed items
            </span>
          )
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          commitQueryImmediate(inputValue)
        }}
        className="relative flex h-10 items-center rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-rail)]/50 transition-colors focus-within:border-[var(--xd-accent)] focus-within:bg-[var(--xd-canvas)]"
      >
        <Search className="pointer-events-none ml-3 h-4 w-4 shrink-0 text-[var(--xd-ink-muted)]" />
        <input
          ref={inputRef}
          type="search"
          value={inputValue}
          onChange={(event) => handleInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && inputValue.length > 0) {
              event.preventDefault()
              handleClear()
            }
          }}
          placeholder="Search documents, whiteboards, folders, and chats…"
          aria-label="Search Drive"
          autoFocus
          className="h-full w-full bg-transparent px-2.5 text-[13.5px] text-[var(--xd-ink)] placeholder:text-[var(--xd-ink-muted)] focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        <div className="mr-2 flex shrink-0 items-center gap-1.5">
          {loading && (
            <Loader2
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin text-[var(--xd-ink-muted)]"
            />
          )}
          {inputValue.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear query"
              className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--xd-ink-muted)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--xd-border)] pb-3">
        <div
          role="group"
          aria-label="Filter by type"
          className="flex flex-wrap items-center gap-1"
        >
          {FILTER_TABS.map((tab) => {
            const active = typeFilter === tab.id
            const count = counts ? counts[tab.id] : undefined
            const href = searchHref({
              q: trimmedQuery || undefined,
              type: tab.id,
              includeTrash,
            })
            return (
              <WorkspaceLink
                key={tab.id}
                href={href}
                onNavigate={() => onTypeFilterChange(tab.id)}
                aria-current={active ? 'true' : undefined}
                className={`inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-[12px] font-medium transition-colors ${
                  active
                    ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                    : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
                }`}
              >
                <span>{tab.label}</span>
                {typeof count === 'number' && (
                  <span
                    className={`xd-tabular rounded px-1 py-0.5 text-[10.5px] leading-none ${
                      active
                        ? 'bg-[var(--xd-canvas)] text-[var(--xd-ink)]'
                        : 'bg-[var(--xd-rail)] text-[var(--xd-ink-muted)]'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </WorkspaceLink>
            )
          })}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={includeTrash}
          onClick={() => onIncludeTrashChange(!includeTrash)}
          className={`inline-flex h-7 items-center gap-1.5 rounded border px-2.5 text-[12px] font-medium transition-colors ${
            includeTrash
              ? 'border-[var(--xd-danger)]/45 bg-[var(--xd-danger-soft)] text-[var(--xd-danger)]'
              : 'border-[var(--xd-border)] bg-[var(--xd-canvas)] text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
          }`}
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Include trash</span>
        </button>
      </div>

      {!trimmedQuery ? (
        <div className="rounded-lg border border-dashed border-[var(--xd-border-strong)] bg-[var(--xd-rail)]/35 px-6 py-12 text-center">
          <p className="text-[13.5px] font-medium text-[var(--xd-ink)]">
            Search across your local Drive
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-[var(--xd-ink-muted)]">
            Matches document titles and contents, whiteboard text, folder names,
            and Drive Chat messages. Press <kbd className="xd-mono">/</kbd> to
            focus the search box anytime.
          </p>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="flex flex-col items-center justify-center rounded-lg border border-[var(--xd-danger)]/35 bg-[var(--xd-danger-soft)]/50 px-6 py-10 text-center"
        >
          <p className="text-[13px] font-medium text-[var(--xd-ink)]">
            Unable to search Drive
          </p>
          <p className="mt-1 text-[12px] text-[var(--xd-ink-secondary)]">
            {error}
          </p>
          <button
            type="button"
            onClick={() => setRetryTick((tick) => tick + 1)}
            className="mt-4 inline-flex h-7 items-center gap-1.5 rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-3 text-[12px] font-medium text-[var(--xd-ink)] transition-colors hover:bg-[var(--xd-surface-hover)]"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Try again</span>
          </button>
        </div>
      ) : loading && !response ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-2 rounded-lg border border-[var(--xd-border)] bg-[var(--xd-rail)]/30 px-6 py-12 text-[12.5px] text-[var(--xd-ink-muted)]"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Searching Drive…</span>
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--xd-border-strong)] px-6 py-12 text-center">
          <p className="text-[13.5px] font-medium text-[var(--xd-ink)]">
            No matches for “{trimmedQuery}”
          </p>
          <p className="mt-1 text-[12px] text-[var(--xd-ink-muted)]">
            {typeFilter !== 'all'
              ? `No ${FILTER_TABS.find((t) => t.id === typeFilter)?.label.toLowerCase()} matched this query.`
              : includeTrash
                ? 'Try a shorter keyword or check your spelling.'
                : 'Try another term or include trashed items.'}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {typeFilter !== 'all' && counts && counts.all > 0 && (
              <button
                type="button"
                onClick={() => onTypeFilterChange('all')}
                className="inline-flex h-7 items-center rounded bg-[var(--xd-accent)] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[var(--xd-accent-hover)]"
              >
                Show all {counts.all} matches
              </button>
            )}
            {!includeTrash && (
              <button
                type="button"
                onClick={() => onIncludeTrashChange(true)}
                className="inline-flex h-7 items-center gap-1.5 rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-3 text-[12px] font-medium text-[var(--xd-ink)] transition-colors hover:bg-[var(--xd-surface-hover)]"
              >
                <Trash2 className="h-3 w-3 text-[var(--xd-ink-muted)]" />
                <span>Include trashed items</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex h-7 items-center rounded border border-[var(--xd-border)] px-3 text-[12px] text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
            >
              Clear search
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ul
            aria-label="Search results"
            className={`divide-y divide-[var(--xd-border)] overflow-hidden rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] transition-opacity ${
              loading ? 'opacity-70' : 'opacity-100'
            }`}
          >
            {results.map((item) => (
              <li
                key={`${item.type}:${item.id}`}
                className="group relative flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--xd-surface-hover)]/45"
              >
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--xd-border)] bg-[var(--xd-rail)]">
                  {renderItemIcon(item)}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <WorkspaceLink
                      href={item.href}
                      onNavigate={
                        onOpenResult ? () => onOpenResult(item) : undefined
                      }
                      className="truncate text-[13.5px] font-medium text-[var(--xd-ink)] transition-colors after:absolute after:inset-0 group-hover:text-[var(--xd-accent)]"
                    >
                      <HighlightedText
                        text={item.title}
                        matches={item.titleMatches}
                      />
                    </WorkspaceLink>

                    <span className="rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-1.5 py-0.5 text-[10.5px] font-medium leading-none text-[var(--xd-ink-secondary)]">
                      {itemTypeLabel(item)}
                    </span>

                    {item.isTemplate && (
                      <span className="xd-mono rounded border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] px-1.5 py-0.5 text-[10px] leading-none text-[var(--xd-accent)]">
                        Template
                      </span>
                    )}

                    {item.trashed && (
                      <span className="rounded border border-[var(--xd-danger)]/40 bg-[var(--xd-danger-soft)] px-1.5 py-0.5 text-[10.5px] font-medium leading-none text-[var(--xd-danger)]">
                        In Trash
                      </span>
                    )}
                  </div>

                  {item.snippet && (
                    <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-[var(--xd-ink-secondary)]">
                      <HighlightedText
                        text={item.snippet}
                        matches={item.snippetMatches}
                      />
                    </p>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-[var(--xd-ink-muted)]">
                    <span>{item.location}</span>
                    {item.fileName && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="xd-mono truncate">
                          {item.fileName}
                        </span>
                      </>
                    )}
                    {item.type === 'chat' &&
                      typeof item.messageCount === 'number' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="xd-tabular">
                            {item.messageCount}{' '}
                            {item.messageCount === 1 ? 'message' : 'messages'}
                          </span>
                        </>
                      )}
                    <span aria-hidden="true">·</span>
                    <span className="xd-tabular">
                      {formatRelativeDate(item.updatedAt)}
                    </span>
                    {item.tags && item.tags.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">
                          {item.tags.slice(0, 3).join(', ')}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {hasMore && response && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)]/35 px-4 py-2.5">
              <div className="flex flex-col gap-0.5">
                <span className="xd-tabular text-[12px] text-[var(--xd-ink-muted)]">
                  Showing {results.length} of {response.total} results
                </span>
                {loadMoreError && (
                  <span
                    role="alert"
                    className="text-[11.5px] text-[var(--xd-danger)]"
                  >
                    {loadMoreError}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="inline-flex h-7 items-center gap-1.5 rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-3 text-[12px] font-medium text-[var(--xd-ink)] transition-colors hover:bg-[var(--xd-surface-hover)] disabled:cursor-wait disabled:opacity-70"
              >
                {loadingMore && (
                  <Loader2
                    aria-hidden="true"
                    className="h-3.5 w-3.5 animate-spin text-[var(--xd-ink-muted)]"
                  />
                )}
                <span>{loadingMore ? 'Loading more…' : 'Load more'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
