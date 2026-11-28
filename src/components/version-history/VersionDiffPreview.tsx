import { useMemo, useState } from 'react'
import { Code2, Eye, FileDiff, Layers, Loader2, PenLine } from 'lucide-react'
import { WhiteboardApp } from '#/components/apps/whiteboard'
import {
  diffMarbleDocuments,
  diffWhiteboardSnapshots,
} from '#/lib/marble/version-diff'
import type { DocumentVersionDetail } from '#/lib/marble/version-history-types'
import { isWhiteboardMarbleSource } from '#/lib/marble/whiteboard-document'
import { cn } from '#/lib/utils'

export type VersionDiffTab = 'changes' | 'source' | 'preview'
export type WhiteboardCompareView = 'version' | 'current'

export interface VersionDiffPreviewProps {
  version: DocumentVersionDetail | null
  currentSource: string
  loading?: boolean
  error?: string | null
  initialTab?: VersionDiffTab
  initialWhiteboardView?: WhiteboardCompareView
  className?: string
}

export function VersionDiffPreview({
  version,
  currentSource,
  loading = false,
  error = null,
  initialTab = 'changes',
  initialWhiteboardView = 'version',
  className,
}: VersionDiffPreviewProps) {
  const [tab, setTab] = useState<VersionDiffTab>(initialTab)
  const [boardView, setBoardView] = useState<WhiteboardCompareView>(
    initialWhiteboardView,
  )

  const isWhiteboard = useMemo(() => {
    if (!version) return isWhiteboardMarbleSource(currentSource)
    return (
      version.category === 'whiteboard' ||
      isWhiteboardMarbleSource(version.source) ||
      isWhiteboardMarbleSource(currentSource)
    )
  }, [version, currentSource])

  const marbleDiff = useMemo(() => {
    if (!version || isWhiteboard) return null
    return diffMarbleDocuments(version.source, currentSource)
  }, [version, currentSource, isWhiteboard])

  const whiteboardSummary = useMemo(() => {
    if (!version || !isWhiteboard) return null
    return diffWhiteboardSnapshots(version.source, currentSource)
  }, [version, currentSource, isWhiteboard])

  if (loading) {
    return (
      <div
        role="status"
        className={cn(
          'flex min-h-[260px] flex-1 items-center justify-center gap-2 rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] text-[12.5px] text-[var(--xd-ink-muted)]',
          className,
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin text-[var(--xd-accent)]" />
        <span>Loading version snapshot…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div
        role="alert"
        className={cn(
          'flex min-h-[260px] flex-1 items-center justify-center rounded-md border border-[var(--xd-danger)]/35 bg-[var(--xd-danger-soft)] p-6 text-center text-[12.5px] text-[var(--xd-danger)]',
          className,
        )}
      >
        {error}
      </div>
    )
  }

  if (!version) {
    return (
      <div
        className={cn(
          'flex min-h-[260px] flex-1 items-center justify-center rounded-md border border-dashed border-[var(--xd-border)] bg-[var(--xd-rail)] p-6 text-center text-[12.5px] text-[var(--xd-ink-muted)]',
          className,
        )}
      >
        Select a version from the timeline to compare it with the current
        document.
      </div>
    )
  }

  if (isWhiteboard && whiteboardSummary) {
    const displayedSource =
      boardView === 'version' ? version.source : currentSource
    return (
      <div
        data-component="whiteboard-version-preview"
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)]',
          className,
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
            <span className="inline-flex items-center gap-1 font-medium text-[var(--xd-ink)]">
              <PenLine className="h-3.5 w-3.5 text-[var(--xd-accent)]" />
              <span>Whiteboard comparison</span>
            </span>
            <span className="xd-tabular rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-1.5 py-0.5 text-[11px] text-[var(--xd-ink-secondary)]">
              Version: {whiteboardSummary.pastShapeCount}{' '}
              {whiteboardSummary.pastShapeCount === 1 ? 'shape' : 'shapes'}
            </span>
            <span className="xd-tabular rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-1.5 py-0.5 text-[11px] text-[var(--xd-ink-secondary)]">
              Current: {whiteboardSummary.currentShapeCount}{' '}
              {whiteboardSummary.currentShapeCount === 1 ? 'shape' : 'shapes'}
            </span>
            {whiteboardSummary.addedCount > 0 && (
              <span className="xd-tabular rounded bg-[var(--xd-commit-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--xd-commit)]">
                +{whiteboardSummary.addedCount} added
              </span>
            )}
            {whiteboardSummary.modifiedCount > 0 && (
              <span className="xd-tabular rounded bg-[var(--xd-sketch-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--xd-sketch)]">
                ~{whiteboardSummary.modifiedCount} modified
              </span>
            )}
            {whiteboardSummary.removedCount > 0 && (
              <span className="xd-tabular rounded bg-[var(--xd-danger-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--xd-danger)]">
                -{whiteboardSummary.removedCount} removed
              </span>
            )}
          </div>

          <div
            role="group"
            aria-label="Whiteboard preview target"
            className="inline-flex items-center rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] p-0.5 text-[11.5px]"
          >
            <button
              type="button"
              aria-pressed={boardView === 'version'}
              onClick={() => setBoardView('version')}
              className={cn(
                'rounded-xs px-2 py-1 font-medium transition-colors',
                boardView === 'version'
                  ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                  : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]',
              )}
            >
              Selected version
            </button>
            <button
              type="button"
              aria-pressed={boardView === 'current'}
              onClick={() => setBoardView('current')}
              className={cn(
                'rounded-xs px-2 py-1 font-medium transition-colors',
                boardView === 'current'
                  ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                  : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]',
              )}
            >
              Current board
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--xd-border)] bg-[var(--xd-canvas)] px-3 py-1.5 text-[11.5px] text-[var(--xd-ink-secondary)]">
          <span className="inline-flex items-center gap-1 text-[var(--xd-ink-muted)]">
            <Layers className="h-3 w-3" />
            <span>Delta:</span>
          </span>
          {whiteboardSummary.summaryLines.map((line) => (
            <span key={line} className="text-[var(--xd-ink-secondary)]">
              {line}
            </span>
          ))}
        </div>

        <div className="relative min-h-[320px] flex-1 bg-[var(--xd-canvas)]">
          <WhiteboardApp
            key={`${version.id}-${boardView}`}
            marbleSource={displayedSource}
            readOnly
            className="h-full w-full"
          />
        </div>
      </div>
    )
  }

  const activeDiff =
    tab === 'source' ? marbleDiff?.sourceDiff : marbleDiff?.structuredDiff
  const visibleNodes = marbleDiff?.nodeChanges.slice(0, 12) ?? []
  const hiddenNodeCount = Math.max(
    0,
    (marbleDiff?.nodeChanges.length ?? 0) - visibleNodes.length,
  )

  return (
    <div
      data-component="marble-version-diff-preview"
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)]',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-1.5">
        <div
          role="tablist"
          aria-label="Version comparison view"
          className="inline-flex items-center rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] p-0.5 text-[11.5px]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'changes'}
            onClick={() => setTab('changes')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xs px-2 py-1 font-medium transition-colors',
              tab === 'changes'
                ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]',
            )}
          >
            <FileDiff className="h-3.5 w-3.5" />
            <span>Changes</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'source'}
            onClick={() => setTab('source')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xs px-2 py-1 font-medium transition-colors',
              tab === 'source'
                ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]',
            )}
          >
            <Code2 className="h-3.5 w-3.5" />
            <span>Source</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'preview'}
            onClick={() => setTab('preview')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xs px-2 py-1 font-medium transition-colors',
              tab === 'preview'
                ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]',
            )}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Preview</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11.5px]">
          <span className="text-[var(--xd-ink-muted)]">
            Selected version → Current
          </span>
          {activeDiff && (
            <span className="xd-tabular inline-flex items-center gap-1.5 font-medium">
              <span className="rounded bg-[var(--xd-commit-soft)] px-1.5 py-0.5 text-[var(--xd-commit)]">
                +{activeDiff.addedLines}
              </span>
              <span className="rounded bg-[var(--xd-danger-soft)] px-1.5 py-0.5 text-[var(--xd-danger)]">
                -{activeDiff.removedLines}
              </span>
            </span>
          )}
        </div>
      </div>

      {tab === 'changes' && visibleNodes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--xd-border)] bg-[var(--xd-canvas)] px-3 py-1.5 text-[11px]">
          <span className="text-[var(--xd-ink-muted)]">Nodes:</span>
          {visibleNodes.map((node) => (
            <span
              key={`${node.status}-${node.id}`}
              className={cn(
                'xd-mono rounded border px-1.5 py-0.5',
                node.status === 'added' &&
                  'border-[var(--xd-commit)]/35 bg-[var(--xd-commit-soft)] text-[var(--xd-commit)]',
                node.status === 'removed' &&
                  'border-[var(--xd-danger)]/35 bg-[var(--xd-danger-soft)] text-[var(--xd-danger)]',
                node.status === 'modified' &&
                  'border-[var(--xd-sketch)]/35 bg-[var(--xd-sketch-soft)] text-[var(--xd-sketch)]',
              )}
            >
              {node.status === 'added'
                ? '+'
                : node.status === 'removed'
                  ? '-'
                  : '~'}{' '}
              #{node.id}
            </span>
          ))}
          {hiddenNodeCount > 0 && (
            <span className="text-[var(--xd-ink-muted)]">
              +{hiddenNodeCount} more
            </span>
          )}
        </div>
      )}

      {tab === 'preview' ? (
        <div className="min-h-[340px] flex-1 bg-white">
          <iframe
            title={`Preview of ${version.title}`}
            sandbox=""
            srcDoc={version.source}
            className="block h-full w-full border-0"
          />
        </div>
      ) : activeDiff && !marbleDiff?.hasChanges ? (
        <div className="flex min-h-[240px] flex-1 items-center justify-center p-6 text-center text-[12.5px] text-[var(--xd-ink-muted)]">
          This snapshot matches the current document byte-for-byte.
        </div>
      ) : activeDiff && activeDiff.hunks.length === 0 ? (
        <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-[12.5px] text-[var(--xd-ink-muted)]">
          <p>Only document markup or styling changed in this snapshot.</p>
          <button
            type="button"
            onClick={() => setTab('source')}
            className="rounded border border-[var(--xd-border)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
          >
            View raw source diff
          </button>
        </div>
      ) : (
        <div className="xd-mono min-h-[260px] flex-1 overflow-auto text-[11.5px] leading-[1.6]">
          {activeDiff?.hunks.map((hunk, hunkIdx) => (
            <div key={`${hunk.oldStart}-${hunk.newStart}-${hunkIdx}`}>
              {hunk.skippedBefore > 0 && (
                <div className="border-y border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-1 text-[10.5px] text-[var(--xd-ink-muted)]">
                  ··· {hunk.skippedBefore} unchanged{' '}
                  {hunk.skippedBefore === 1 ? 'line' : 'lines'} ···
                </div>
              )}
              <table className="w-full border-collapse">
                <tbody>
                  {hunk.lines.map((line, lineIdx) => (
                    <tr
                      key={`${hunkIdx}-${lineIdx}`}
                      className={cn(
                        line.kind === 'added' && 'bg-[var(--xd-commit-soft)]',
                        line.kind === 'removed' && 'bg-[var(--xd-danger-soft)]',
                      )}
                    >
                      <td className="xd-tabular w-11 select-none border-r border-[var(--xd-border-subtle)] px-2 py-0.5 text-right text-[10.5px] text-[var(--xd-ink-subtle)]">
                        {line.oldLine ?? ''}
                      </td>
                      <td className="xd-tabular w-11 select-none border-r border-[var(--xd-border-subtle)] px-2 py-0.5 text-right text-[10.5px] text-[var(--xd-ink-subtle)]">
                        {line.newLine ?? ''}
                      </td>
                      <td
                        className={cn(
                          'w-5 select-none px-1.5 py-0.5 text-center font-semibold',
                          line.kind === 'added' && 'text-[var(--xd-commit)]',
                          line.kind === 'removed' && 'text-[var(--xd-danger)]',
                          line.kind === 'context' &&
                            'text-[var(--xd-ink-subtle)]',
                        )}
                      >
                        {line.kind === 'added'
                          ? '+'
                          : line.kind === 'removed'
                            ? '-'
                            : ' '}
                      </td>
                      <td className="px-2 py-0.5 whitespace-pre-wrap break-words text-[var(--xd-ink)]">
                        {line.text || ' '}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
