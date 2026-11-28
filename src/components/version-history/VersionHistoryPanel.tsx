import { useEffect, useMemo, useState } from 'react'
import { BookmarkPlus, Check, History, RotateCcw, X } from 'lucide-react'
import type {
  DocumentVersionDetail,
  DocumentVersionSummary,
} from '#/lib/marble/version-history-types'
import { cn } from '#/lib/utils'
import { RestoreVersionDialog } from './RestoreVersionDialog'
import { VersionDiffPreview } from './VersionDiffPreview'
import {
  formatAbsoluteTimestamp,
  formatRelativeTimestamp,
  formatVersionBytes,
} from './format-time'

export interface VersionHistoryPanelProps {
  open?: boolean
  docId: string
  fileName: string
  title: string
  currentSource: string
  readOnly?: boolean
  versions: DocumentVersionSummary[]
  initialSelectedVersionId?: string | null
  initialLoadedVersions?: Record<string, DocumentVersionDetail>
  loadingList?: boolean
  onLoadVersion?: (
    docId: string,
    versionId: string,
  ) => Promise<DocumentVersionDetail>
  onCreateNamedVersion?: (
    label: string,
  ) => Promise<DocumentVersionSummary[] | void>
  onRestoreVersion?: (version: DocumentVersionSummary) => Promise<void>
  onVersionsChange?: (versions: DocumentVersionSummary[]) => void
  onClose: () => void
  nowMs?: number
  className?: string
}

type TimelineFilter = 'all' | 'named'

export function VersionHistoryPanel({
  open = true,
  docId,
  fileName,
  title,
  currentSource,
  readOnly = false,
  versions: initialVersions,
  initialSelectedVersionId = null,
  initialLoadedVersions,
  loadingList = false,
  onLoadVersion,
  onCreateNamedVersion,
  onRestoreVersion,
  onVersionsChange,
  onClose,
  nowMs,
  className,
}: VersionHistoryPanelProps) {
  const [versions, setVersions] =
    useState<DocumentVersionSummary[]>(initialVersions)
  const [filter, setFilter] = useState<TimelineFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedVersionId ??
      (initialVersions.length > 0 ? initialVersions[0].id : null),
  )
  const [loadedMap, setLoadedMap] = useState<
    Record<string, DocumentVersionDetail>
  >(() => initialLoadedVersions ?? {})
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  const [namingOpen, setNamingOpen] = useState(false)
  const [labelDraft, setLabelDraft] = useState('')
  const [creatingNamed, setCreatingNamed] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  useEffect(() => {
    setVersions(initialVersions)
    setSelectedId((prev) => {
      if (prev && initialVersions.some((item) => item.id === prev)) return prev
      return initialVersions[0]?.id ?? null
    })
  }, [initialVersions])

  useEffect(() => {
    if (
      !open ||
      !selectedId ||
      Boolean(loadedMap[selectedId]) ||
      !onLoadVersion
    ) {
      return
    }
    let cancelled = false
    setLoadingDetailId(selectedId)
    setDetailError(null)
    void onLoadVersion(docId, selectedId)
      .then((detail) => {
        if (cancelled) return
        setLoadedMap((prev) => ({ ...prev, [detail.id]: detail }))
      })
      .catch((error) => {
        if (cancelled) return
        setDetailError(
          error instanceof Error
            ? error.message
            : 'Failed to load version snapshot',
        )
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingDetailId((curr) => (curr === selectedId ? null : curr))
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, docId, selectedId, loadedMap, onLoadVersion])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (restoreDialogOpen) return
      if (namingOpen) {
        event.preventDefault()
        setNamingOpen(false)
        setCreateError(null)
        return
      }
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, restoreDialogOpen, namingOpen, onClose])

  const filteredVersions = useMemo(() => {
    if (filter === 'named') {
      return versions.filter((item) => item.kind === 'named')
    }
    return versions
  }, [versions, filter])

  const namedCount = useMemo(
    () => versions.filter((item) => item.kind === 'named').length,
    [versions],
  )

  const selectedSummary = useMemo(
    () => versions.find((item) => item.id === selectedId) ?? null,
    [versions, selectedId],
  )

  const selectedDetail = selectedSummary
    ? (loadedMap[selectedSummary.id] ?? null)
    : null

  if (!open) return null

  async function handleSaveNamed(event: React.FormEvent) {
    event.preventDefault()
    const clean = labelDraft.trim()
    if (!clean) {
      setCreateError('Enter a label for this version')
      return
    }
    setCreatingNamed(true)
    setCreateError(null)
    try {
      if (onCreateNamedVersion) {
        const nextList = await onCreateNamedVersion(clean)
        if (Array.isArray(nextList)) {
          setVersions(nextList)
          onVersionsChange?.(nextList)
          if (nextList[0]) {
            setSelectedId(nextList[0].id)
          }
        }
      } else {
        const created: DocumentVersionDetail = {
          id: `v-local-${Date.now()}`,
          docId,
          slug: fileName.replace(/\.mrbl$/i, ''),
          title,
          category: selectedSummary?.category ?? 'document',
          kind: 'named',
          trigger: 'manual',
          label: clean,
          createdAt: new Date(nowMs ?? Date.now()).toISOString(),
          contentHash: `local-${Date.now()}`,
          byteSize: new TextEncoder().encode(currentSource).byteLength,
          nodeCount: selectedSummary?.nodeCount ?? 0,
          author: 'You',
          source: currentSource,
        }
        const nextList = [created, ...versions]
        setVersions(nextList)
        setLoadedMap((prev) => ({ ...prev, [created.id]: created }))
        setSelectedId(created.id)
        onVersionsChange?.(nextList)
      }
      setLabelDraft('')
      setNamingOpen(false)
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : 'Could not save named version',
      )
    } finally {
      setCreatingNamed(false)
    }
  }

  async function handleConfirmRestore() {
    if (!selectedSummary) return
    setRestoring(true)
    setRestoreError(null)
    try {
      await onRestoreVersion?.(selectedSummary)
      setRestoreDialogOpen(false)
    } catch (error) {
      setRestoreError(
        error instanceof Error ? error.message : 'Failed to restore version',
      )
    } finally {
      setRestoring(false)
    }
  }

  return (
    <section
      aria-label={`Version history for ${title}`}
      data-component="version-history-panel"
      className={cn(
        'flex h-full min-h-0 flex-col bg-[var(--xd-canvas)] text-[var(--xd-ink)]',
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--xd-border)] bg-[var(--xd-rail)] px-3.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <History className="h-4 w-4 shrink-0 text-[var(--xd-accent)]" />
          <h2 className="text-[13px] font-semibold tracking-tight text-[var(--xd-ink)]">
            Version history
          </h2>
          <span className="xd-mono truncate rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-1.5 py-0.5 text-[11px] text-[var(--xd-ink-secondary)]">
            {fileName}
          </span>
          <span className="xd-tabular text-[11.5px] text-[var(--xd-ink-muted)]">
            {versions.length} {versions.length === 1 ? 'version' : 'versions'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {namingOpen ? (
            <form
              onSubmit={(event) => void handleSaveNamed(event)}
              className="flex items-center gap-1.5"
            >
              <input
                type="text"
                autoFocus
                value={labelDraft}
                disabled={creatingNamed}
                onChange={(event) => setLabelDraft(event.target.value)}
                aria-label="Version label"
                placeholder="e.g. Before theorem rewrite"
                className="h-7 w-52 rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-2 text-[12px] text-[var(--xd-ink)] outline-none focus-visible:border-[var(--xd-accent)]"
              />
              <button
                type="submit"
                disabled={creatingNamed}
                className="inline-flex h-7 items-center gap-1 rounded bg-[var(--xd-accent)] px-2.5 text-[11.5px] font-medium text-white hover:bg-[var(--xd-accent-hover)] disabled:opacity-50"
              >
                <Check className="h-3 w-3" />
                <span>{creatingNamed ? 'Saving…' : 'Save'}</span>
              </button>
              <button
                type="button"
                disabled={creatingNamed}
                onClick={() => {
                  setNamingOpen(false)
                  setCreateError(null)
                }}
                className="h-7 rounded border border-[var(--xd-border)] px-2 text-[11.5px] text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              disabled={readOnly}
              onClick={() => {
                setNamingOpen(true)
                setCreateError(null)
              }}
              className="inline-flex h-7 items-center gap-1.5 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2.5 text-[11.5px] font-medium text-[var(--xd-ink)] transition-colors hover:border-[var(--xd-border-strong)] hover:bg-[var(--xd-surface-hover)] disabled:pointer-events-none disabled:opacity-40"
            >
              <BookmarkPlus className="h-3.5 w-3.5 text-[var(--xd-accent)]" />
              <span>Name current version</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close version history"
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-[var(--xd-border)] text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {createError && (
        <p
          role="alert"
          className="border-b border-[var(--xd-danger)]/35 bg-[var(--xd-danger-soft)] px-3.5 py-1.5 text-[11.5px] text-[var(--xd-danger)]"
        >
          {createError}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5 p-3.5">
          {selectedSummary && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[12.5px] font-medium text-[var(--xd-ink)]">
                    {selectedSummary.label ||
                      (selectedSummary.trigger === 'pre-restore'
                        ? 'Pre-restore snapshot'
                        : 'Auto-saved snapshot')}
                  </span>
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[10.5px] font-medium',
                      selectedSummary.kind === 'named'
                        ? 'bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]'
                        : selectedSummary.trigger === 'pre-restore'
                          ? 'bg-[var(--xd-sketch-soft)] text-[var(--xd-sketch)]'
                          : 'bg-[var(--xd-elevated)] text-[var(--xd-ink-secondary)]',
                    )}
                  >
                    {selectedSummary.kind === 'named'
                      ? 'Named'
                      : selectedSummary.trigger === 'pre-restore'
                        ? 'Pre-restore'
                        : 'Auto'}
                  </span>
                </div>
                <p className="mt-0.5 text-[11.5px] text-[var(--xd-ink-muted)]">
                  <span>
                    {formatRelativeTimestamp(selectedSummary.createdAt, nowMs)}
                  </span>
                  <span className="mx-1.5" aria-hidden>
                    ·
                  </span>
                  <span>
                    {formatAbsoluteTimestamp(selectedSummary.createdAt)}
                  </span>
                  {selectedSummary.author && (
                    <>
                      <span className="mx-1.5" aria-hidden>
                        ·
                      </span>
                      <span>{selectedSummary.author}</span>
                    </>
                  )}
                </p>
              </div>

              <button
                type="button"
                disabled={
                  readOnly ||
                  restoring ||
                  loadingDetailId === selectedSummary.id
                }
                onClick={() => {
                  setRestoreError(null)
                  setRestoreDialogOpen(true)
                }}
                className="inline-flex h-7 items-center gap-1.5 rounded bg-[var(--xd-accent)] px-2.5 text-[11.5px] font-medium text-white transition-colors hover:bg-[var(--xd-accent-hover)] disabled:pointer-events-none disabled:opacity-40"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Restore this version</span>
              </button>
            </div>
          )}

          <VersionDiffPreview
            key={selectedSummary?.id ?? 'none'}
            version={selectedDetail}
            currentSource={currentSource}
            loading={Boolean(
              selectedSummary &&
              loadingDetailId === selectedSummary.id &&
              !selectedDetail,
            )}
            error={detailError}
          />
        </div>

        <aside
          aria-label="Version timeline"
          className="flex min-h-0 w-full shrink-0 flex-col border-t border-[var(--xd-border)] bg-[var(--xd-rail)] md:w-[310px] md:border-t-0 md:border-l"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--xd-border)] px-3 py-2">
            <div
              role="group"
              aria-label="Filter versions"
              className="inline-flex items-center rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] p-0.5 text-[11.5px]"
            >
              <button
                type="button"
                aria-pressed={filter === 'all'}
                onClick={() => setFilter('all')}
                className={cn(
                  'xd-tabular rounded-xs px-2 py-0.5 font-medium transition-colors',
                  filter === 'all'
                    ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                    : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]',
                )}
              >
                All ({versions.length})
              </button>
              <button
                type="button"
                aria-pressed={filter === 'named'}
                onClick={() => setFilter('named')}
                className={cn(
                  'xd-tabular rounded-xs px-2 py-0.5 font-medium transition-colors',
                  filter === 'named'
                    ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                    : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]',
                )}
              >
                Named ({namedCount})
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loadingList ? (
              <p className="py-8 text-center text-[12px] text-[var(--xd-ink-muted)]">
                Loading versions…
              </p>
            ) : filteredVersions.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                <p className="text-[12.5px] font-medium text-[var(--xd-ink)]">
                  {filter === 'named'
                    ? 'No named versions yet'
                    : 'No saved versions yet'}
                </p>
                <p className="text-[11.5px] leading-relaxed text-[var(--xd-ink-muted)]">
                  {filter === 'named'
                    ? 'Named versions stay pinned permanently and are never pruned.'
                    : 'Snapshots are captured automatically as you edit, or you can save a named checkpoint now.'}
                </p>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setNamingOpen(true)}
                    className="mt-1 inline-flex h-7 items-center gap-1.5 rounded bg-[var(--xd-accent)] px-2.5 text-[11.5px] font-medium text-white hover:bg-[var(--xd-accent-hover)]"
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    <span>Name current version</span>
                  </button>
                )}
              </div>
            ) : (
              <ol className="relative space-y-1">
                {filteredVersions.map((item, idx) => {
                  const selected = item.id === selectedId
                  const primaryLabel =
                    item.label ||
                    (item.trigger === 'pre-restore'
                      ? 'Pre-restore snapshot'
                      : 'Auto-saved')
                  return (
                    <li key={item.id} className="relative">
                      {idx < filteredVersions.length - 1 && (
                        <span
                          aria-hidden
                          className="absolute top-6 bottom-0 left-[15px] w-px bg-[var(--xd-border)]"
                        />
                      )}
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setSelectedId(item.id)}
                        className={cn(
                          'flex w-full items-start gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors',
                          selected
                            ? 'border-[var(--xd-accent-border)] bg-[var(--xd-canvas)] shadow-2xs'
                            : 'border-transparent hover:bg-[var(--xd-surface-hover)]',
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border',
                            item.kind === 'named'
                              ? 'border-[var(--xd-accent)] bg-[var(--xd-accent)]'
                              : item.trigger === 'pre-restore'
                                ? 'border-[var(--xd-sketch)] bg-[var(--xd-sketch)]'
                                : 'border-[var(--xd-border-strong)] bg-[var(--xd-canvas)]',
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="truncate text-[12px] font-medium text-[var(--xd-ink)]">
                              {primaryLabel}
                            </span>
                            <span
                              className={cn(
                                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                                item.kind === 'named'
                                  ? 'bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]'
                                  : item.trigger === 'pre-restore'
                                    ? 'bg-[var(--xd-sketch-soft)] text-[var(--xd-sketch)]'
                                    : 'bg-[var(--xd-elevated)] text-[var(--xd-ink-muted)]',
                              )}
                            >
                              {item.kind === 'named'
                                ? 'Named'
                                : item.trigger === 'pre-restore'
                                  ? 'Pre-restore'
                                  : 'Auto'}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-[var(--xd-ink-muted)]">
                            <span>
                              {formatRelativeTimestamp(item.createdAt, nowMs)}
                            </span>
                            <span className="xd-tabular">
                              {formatVersionBytes(item.byteSize)}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[10.5px] text-[var(--xd-ink-subtle)]">
                            {formatAbsoluteTimestamp(item.createdAt)}
                          </div>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </aside>
      </div>

      <RestoreVersionDialog
        open={restoreDialogOpen}
        fileName={fileName}
        version={selectedSummary}
        busy={restoring}
        error={restoreError}
        nowMs={nowMs}
        onClose={() => setRestoreDialogOpen(false)}
        onConfirm={() => void handleConfirmRestore()}
      />
    </section>
  )
}
