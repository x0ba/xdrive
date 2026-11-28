import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { CornerDownLeft, Loader2, Search, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { cn } from '#/lib/utils'
import { normalizeQuery, splitHighlightRanges } from './fuzzy'
import { executeCommandSources, mergeCommandSources } from './registry'
import type { CommandQueryState, CommandSourceRegistry } from './registry'
import type { CommandContext, CommandItem, CommandSource } from './types'

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sources: readonly CommandSource[]
  /** Optional shared registry whose dynamic sources are merged with `sources`. */
  registry?: CommandSourceRegistry
  context: Omit<CommandContext, 'signal'>
  initialQuery?: string
  placeholder?: string
  emptyStateTitle?: string
  emptyStateHint?: string
  /** Optional cap per section while the search input is empty. */
  maxItemsPerSectionWhenEmpty?: number
  /** Optional portal target (defaults to `[data-component="xdrive-workspace"]` or `document.body`). */
  portalContainer?: HTMLElement | null
}

function findNextEnabledIndex(
  items: ReadonlyArray<{ item: CommandItem }>,
  startIndex: number,
  direction: 1 | -1,
): number {
  if (items.length === 0) return -1
  for (let offset = 1; offset <= items.length; offset++) {
    const idx = (startIndex + direction * offset + items.length) % items.length
    if (!items[idx]?.item.disabled) return idx
  }
  return -1
}

function findEdgeEnabledIndex(
  items: ReadonlyArray<{ item: CommandItem }>,
  edge: 'first' | 'last',
): number {
  if (items.length === 0) return -1
  if (edge === 'first') {
    return items.findIndex((entry) => !entry.item.disabled)
  }
  for (let i = items.length - 1; i >= 0; i--) {
    if (!items[i]?.item.disabled) return i
  }
  return -1
}

function HighlightedLabel({
  text,
  ranges,
}: {
  text: string
  ranges: ReadonlyArray<[number, number]>
}) {
  const segments = useMemo(
    () => splitHighlightRanges(text, ranges),
    [text, ranges],
  )
  return (
    <>
      {segments.map((segment, index) =>
        segment.matched ? (
          <span key={index} className="font-semibold text-[var(--xd-accent)]">
            {segment.text}
          </span>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  )
}

export function CommandPalette({
  open,
  onOpenChange,
  sources,
  registry,
  context,
  initialQuery = '',
  placeholder = 'Jump to document, folder, chat, or run a command…',
  emptyStateTitle,
  emptyStateHint = 'Try a document title, folder name, chat thread, or command.',
  maxItemsPerSectionWhenEmpty = 6,
  portalContainer,
}: CommandPaletteProps) {
  const [query, setQuery] = useState(initialQuery)
  const [activeIndex, setActiveIndex] = useState(0)
  const [registryVersion, setRegistryVersion] = useState(0)
  const [queryState, setQueryState] = useState<CommandQueryState>({
    groups: [],
    items: [],
    pendingSourceIds: [],
    errors: [],
  })
  const [workspacePortalTarget, setWorkspacePortalTarget] =
    useState<HTMLElement | null>(null)

  const listboxId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef(new Map<number, HTMLButtonElement>())
  const skipRestoreFocusRef = useRef(false)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (!registry) return
    return registry.subscribe(() => {
      setRegistryVersion((v) => v + 1)
    })
  }, [registry])

  useEffect(() => {
    if (portalContainer !== undefined || typeof document === 'undefined') return
    if (!open) return
    setWorkspacePortalTarget(
      document.querySelector<HTMLElement>(
        '[data-component="xdrive-workspace"]',
      ),
    )
  }, [portalContainer, open])

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current
    wasOpenRef.current = open
    if (justOpened) {
      skipRestoreFocusRef.current = false
      setQuery(initialQuery)
      setActiveIndex(0)
    } else if (!open) {
      setQueryState({
        groups: [],
        items: [],
        pendingSourceIds: [],
        errors: [],
      })
    }
  }, [open, initialQuery])

  const effectiveSources = useMemo(() => {
    const dynamicSources = registry ? registry.getSources() : []
    return mergeCommandSources(sources, dynamicSources)
    // `registryVersion` tracks dynamic external registrations.
  }, [sources, registry, registryVersion])

  const stableContext = useMemo(
    () => ({
      pathname: context.pathname,
      activeNav: context.activeNav,
      currentFolderId: context.currentFolderId,
      activeDoc: context.activeDoc,
      theme: context.theme,
    }),
    [
      context.pathname,
      context.activeNav,
      context.currentFolderId,
      context.activeDoc,
      context.theme,
    ],
  )

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const fullContext: CommandContext = {
      ...stableContext,
      signal: controller.signal,
    }

    void executeCommandSources(effectiveSources, query, fullContext, {
      onUpdate: (nextState) => {
        if (!controller.signal.aborted) {
          setQueryState(nextState)
        }
      },
    })

    return () => {
      controller.abort()
    }
  }, [open, query, effectiveSources, stableContext])

  const normalizedQuery = normalizeQuery(query)
  const isEmptyQuery = normalizedQuery.length === 0
  const isLoading = queryState.pendingSourceIds.length > 0

  const visibleGroups = useMemo(() => {
    if (!isEmptyQuery || maxItemsPerSectionWhenEmpty <= 0) {
      return queryState.groups
    }
    return queryState.groups
      .map((group) => ({
        ...group,
        items: group.items.slice(0, maxItemsPerSectionWhenEmpty),
      }))
      .filter((group) => group.items.length > 0)
  }, [queryState.groups, isEmptyQuery, maxItemsPerSectionWhenEmpty])

  const flatItems = useMemo(
    () => visibleGroups.flatMap((group) => group.items),
    [visibleGroups],
  )

  useEffect(() => {
    setActiveIndex(findEdgeEnabledIndex(flatItems, 'first'))
  }, [query, open])

  useEffect(() => {
    if (flatItems.length === 0) {
      if (activeIndex !== -1) setActiveIndex(-1)
      return
    }
    if (
      activeIndex < 0 ||
      activeIndex >= flatItems.length ||
      flatItems[activeIndex]?.item.disabled
    ) {
      setActiveIndex(findEdgeEnabledIndex(flatItems, 'first'))
    }
  }, [flatItems, activeIndex])

  useEffect(() => {
    if (activeIndex < 0) return
    const el = optionRefs.current.get(activeIndex)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex, flatItems.length])

  const runItem = useCallback(
    (item: CommandItem) => {
      if (item.disabled) return
      skipRestoreFocusRef.current = true
      onOpenChange(false)
      void item.onSelect()
    },
    [onOpenChange],
  )

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((prev) => findNextEnabledIndex(flatItems, prev, 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((prev) =>
        findNextEnabledIndex(
          flatItems,
          prev <= 0 ? flatItems.length : prev,
          -1,
        ),
      )
      return
    }
    if (event.key === 'Home') {
      if (flatItems.length > 0) {
        event.preventDefault()
        setActiveIndex(findEdgeEnabledIndex(flatItems, 'first'))
      }
      return
    }
    if (event.key === 'End') {
      if (flatItems.length > 0) {
        event.preventDefault()
        setActiveIndex(findEdgeEnabledIndex(flatItems, 'last'))
      }
      return
    }
    if (event.key === 'Enter') {
      const selected = activeIndex >= 0 ? flatItems[activeIndex] : undefined
      if (selected && !selected.item.disabled) {
        event.preventDefault()
        runItem(selected.item)
      }
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onOpenChange(false)
    }
  }

  const activeOptionId =
    activeIndex >= 0 && flatItems[activeIndex]
      ? `${listboxId}-opt-${activeIndex}`
      : undefined

  const resolvedPortalContainer =
    portalContainer !== undefined
      ? (portalContainer ?? undefined)
      : (workspacePortalTarget ?? undefined)

  let globalOptionIndex = 0

  const liveAnnouncement = isLoading
    ? 'Searching workspace…'
    : flatItems.length === 0
      ? normalizedQuery
        ? `No results for ${normalizedQuery}`
        : 'No commands available'
      : `${flatItems.length} result${flatItems.length === 1 ? '' : 's'} available`

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal container={resolvedPortalContainer}>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          data-command-palette-dialog="true"
          aria-label="Command palette"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            inputRef.current?.focus({ preventScroll: true })
          }}
          onCloseAutoFocus={(event) => {
            if (skipRestoreFocusRef.current) {
              skipRestoreFocusRef.current = false
              event.preventDefault()
            }
          }}
          className="fixed top-[13vh] left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-[580px] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] text-[var(--xd-ink)] shadow-2xl outline-none"
        >
          <DialogPrimitive.Title className="sr-only">
            Command palette
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search documents, folders, chat threads, settings, or run workspace
            commands using arrow keys and Enter.
          </DialogPrimitive.Description>

          <div className="flex h-11 items-center gap-2.5 border-b border-[var(--xd-border)] px-3.5">
            <Search
              aria-hidden="true"
              className="size-4 shrink-0 text-[var(--xd-ink-muted)]"
            />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={true}
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
              aria-label="Search commands and workspace items"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={placeholder}
              spellCheck={false}
              autoComplete="off"
              className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-[var(--xd-ink)] placeholder:text-[var(--xd-ink-muted)] outline-none"
            />
            {isLoading && (
              <Loader2
                aria-label="Loading search results"
                className="size-3.5 shrink-0 animate-spin text-[var(--xd-accent)]"
              />
            )}
            {query.length > 0 && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('')
                  inputRef.current?.focus({ preventScroll: true })
                }}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded text-[var(--xd-ink-muted)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
              >
                <X className="size-3.5" />
              </button>
            )}
            <button
              type="button"
              aria-label="Close command palette"
              onClick={() => onOpenChange(false)}
              className="xd-mono hidden h-5 shrink-0 items-center rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-1.5 text-[10px] text-[var(--xd-ink-muted)] transition-colors hover:border-[var(--xd-border-strong)] hover:text-[var(--xd-ink)] sm:inline-flex"
            >
              Esc
            </button>
          </div>

          <div role="status" aria-live="polite" className="sr-only">
            {liveAnnouncement}
          </div>

          <div
            id={listboxId}
            role="listbox"
            aria-label="Command results"
            className="max-h-[min(420px,56vh)] overflow-y-auto py-1.5"
          >
            {isLoading && flatItems.length === 0 ? (
              <div
                data-testid="command-palette-loading"
                className="space-y-1.5 px-3 py-3"
              >
                <div className="flex items-center gap-2 text-[12px] text-[var(--xd-ink-muted)]">
                  <Loader2 className="size-3.5 animate-spin text-[var(--xd-accent)]" />
                  <span>Searching workspace…</span>
                </div>
                {[0, 1, 2].map((skeleton) => (
                  <div
                    key={skeleton}
                    aria-hidden="true"
                    className="flex h-10 items-center gap-2.5 rounded-md border border-[var(--xd-border-subtle)] bg-[var(--xd-rail)] px-2.5"
                  >
                    <div className="size-6 rounded bg-[var(--xd-elevated)]" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 w-2/5 rounded bg-[var(--xd-elevated)]" />
                      <div className="h-2 w-3/5 rounded bg-[var(--xd-surface-hover)]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : flatItems.length === 0 ? (
              <div
                data-testid="command-palette-empty"
                className="flex flex-col items-center justify-center px-6 py-10 text-center"
              >
                <div className="flex size-9 items-center justify-center rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] text-[var(--xd-ink-muted)]">
                  <Search className="size-4" />
                </div>
                <p className="mt-3 text-[13px] font-medium text-[var(--xd-ink)]">
                  {emptyStateTitle ??
                    (normalizedQuery
                      ? `No results for "${normalizedQuery}"`
                      : 'No commands available')}
                </p>
                <p className="mt-1 max-w-xs text-[12px] text-[var(--xd-ink-muted)]">
                  {emptyStateHint}
                </p>
                {normalizedQuery.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('')
                      inputRef.current?.focus({ preventScroll: true })
                    }}
                    className="mt-3 inline-flex h-7 items-center rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2.5 text-[11.5px] font-medium text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              visibleGroups.map((group) => {
                const groupHeadingId = `${listboxId}-group-${group.id}`
                return (
                  <div
                    key={group.id}
                    role="group"
                    aria-labelledby={groupHeadingId}
                    className="pb-1 last:pb-0"
                  >
                    <div
                      id={groupHeadingId}
                      className="px-3.5 pt-2 pb-1 text-[11px] font-medium text-[var(--xd-ink-muted)]"
                    >
                      {group.label}
                    </div>
                    {group.items.map((entry) => {
                      const optionIndex = globalOptionIndex
                      globalOptionIndex += 1
                      const optionId = `${listboxId}-opt-${optionIndex}`
                      const isActive = optionIndex === activeIndex
                      const { item } = entry

                      return (
                        <button
                          key={item.id}
                          ref={(node) => {
                            if (node) {
                              optionRefs.current.set(optionIndex, node)
                            } else {
                              optionRefs.current.delete(optionIndex)
                            }
                          }}
                          id={optionId}
                          type="button"
                          role="option"
                          tabIndex={-1}
                          aria-label={[item.label, item.subtitle, item.badge]
                            .filter(Boolean)
                            .join(', ')}
                          aria-selected={isActive}
                          aria-disabled={item.disabled || undefined}
                          disabled={item.disabled}
                          onMouseMove={() => {
                            if (!item.disabled && activeIndex !== optionIndex) {
                              setActiveIndex(optionIndex)
                            }
                          }}
                          onClick={() => runItem(item)}
                          className={cn(
                            'mx-1.5 flex w-[calc(100%-0.75rem)] items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors outline-none',
                            isActive
                              ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                              : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                            item.disabled && 'cursor-not-allowed opacity-45',
                          )}
                        >
                          <span
                            className={cn(
                              'flex size-7 shrink-0 items-center justify-center rounded border transition-colors',
                              isActive
                                ? 'border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]'
                                : 'border-[var(--xd-border)] bg-[var(--xd-rail)] text-[var(--xd-ink-muted)]',
                            )}
                          >
                            {item.icon ?? <Search className="h-3.5 w-3.5" />}
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-medium text-[var(--xd-ink)]">
                              <HighlightedLabel
                                text={item.label}
                                ranges={entry.labelRanges}
                              />
                            </span>
                            {item.subtitle && (
                              <span className="block truncate text-[11px] text-[var(--xd-ink-muted)]">
                                {item.subtitle}
                              </span>
                            )}
                          </span>

                          <span className="flex shrink-0 items-center gap-1.5">
                            {item.badge && (
                              <span className="rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--xd-ink-secondary)]">
                                {item.badge}
                              </span>
                            )}
                            {item.shortcut && item.shortcut.length > 0 ? (
                              <span className="inline-flex items-center gap-0.5">
                                {item.shortcut.map((key, keyIdx) => (
                                  <kbd
                                    key={keyIdx}
                                    className="xd-mono inline-flex h-5 min-w-5 items-center justify-center rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-1 text-[10px] text-[var(--xd-ink-muted)]"
                                  >
                                    {key}
                                  </kbd>
                                ))}
                              </span>
                            ) : (
                              isActive && (
                                <CornerDownLeft
                                  aria-hidden="true"
                                  className="size-3.5 text-[var(--xd-ink-muted)]"
                                />
                              )
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )
              })
            )}

            {isLoading && flatItems.length > 0 && (
              <div
                data-testid="command-palette-async-pending"
                className="mx-1.5 mt-1 flex items-center gap-2 rounded-md border border-[var(--xd-border-subtle)] bg-[var(--xd-rail)] px-2.5 py-1.5 text-[11.5px] text-[var(--xd-ink-muted)]"
              >
                <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--xd-accent)]" />
                <span>Searching additional sources…</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--xd-border)] bg-[var(--xd-rail)] px-3.5 py-2 text-[11px] text-[var(--xd-ink-muted)]">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <kbd className="xd-mono rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-1 py-0.2 text-[10px]">
                  ↑↓
                </kbd>
                <span>Navigate</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="xd-mono rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-1 py-0.2 text-[10px]">
                  ↵
                </kbd>
                <span>Select</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="xd-mono rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-1 py-0.2 text-[10px]">
                  Esc
                </kbd>
                <span>Close</span>
              </span>
            </div>

            <span className="xd-tabular">
              {isLoading
                ? 'Searching…'
                : queryState.errors.length > 0
                  ? `${flatItems.length} result${flatItems.length === 1 ? '' : 's'} · source warning`
                  : `${flatItems.length} result${flatItems.length === 1 ? '' : 's'}`}
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
