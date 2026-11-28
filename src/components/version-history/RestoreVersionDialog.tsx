import { useEffect } from 'react'
import { History, RotateCcw, ShieldCheck, X } from 'lucide-react'
import type { DocumentVersionSummary } from '#/lib/marble/version-history-types'
import { formatAbsoluteTimestamp, formatRelativeTimestamp } from './format-time'

export interface RestoreVersionDialogProps {
  open: boolean
  fileName: string
  version: DocumentVersionSummary | null
  busy?: boolean
  error?: string | null
  nowMs?: number
  onClose: () => void
  onConfirm: () => void
}

export function RestoreVersionDialog({
  open,
  fileName,
  version,
  busy = false,
  error = null,
  nowMs,
  onClose,
  onConfirm,
}: RestoreVersionDialogProps) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, busy, onClose])

  if (!open || !version) return null

  const versionTitle =
    version.label?.trim() ||
    (version.trigger === 'pre-restore'
      ? 'Pre-restore snapshot'
      : 'Auto-saved snapshot')

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-[16vh]"
      onMouseDown={() => {
        if (!busy) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Restore this version?"
        className="w-full max-w-md rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] p-4 text-[var(--xd-ink)] shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]">
              <RotateCcw className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-[14px] font-semibold text-[var(--xd-ink)]">
                Restore this version?
              </h2>
              <p className="xd-mono text-[11px] text-[var(--xd-ink-muted)]">
                {fileName}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Close restore confirmation"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-3 rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[12.5px] font-medium text-[var(--xd-ink)]">
              {versionTitle}
            </span>
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-medium ${
                version.kind === 'named'
                  ? 'bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]'
                  : version.trigger === 'pre-restore'
                    ? 'bg-[var(--xd-sketch-soft)] text-[var(--xd-sketch)]'
                    : 'bg-[var(--xd-elevated)] text-[var(--xd-ink-secondary)]'
              }`}
            >
              {version.kind === 'named'
                ? 'Named'
                : version.trigger === 'pre-restore'
                  ? 'Pre-restore'
                  : 'Auto'}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-[var(--xd-ink-muted)]">
            <History className="h-3 w-3 shrink-0" />
            <span>{formatRelativeTimestamp(version.createdAt, nowMs)}</span>
            <span aria-hidden>·</span>
            <span>{formatAbsoluteTimestamp(version.createdAt)}</span>
          </div>
        </div>

        <p className="mt-3 flex items-start gap-2 rounded-md border border-[var(--xd-commit)]/30 bg-[var(--xd-commit-soft)] px-2.5 py-2 text-[12px] leading-snug text-[var(--xd-ink-secondary)]">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--xd-commit)]" />
          <span>
            Your current document will be snapshotted first so this restore can
            always be undone from Version history.
          </span>
        </p>

        {error && (
          <p
            role="alert"
            className="mt-2.5 rounded border border-[var(--xd-danger)]/35 bg-[var(--xd-danger-soft)] px-2.5 py-1.5 text-[11.5px] text-[var(--xd-danger)]"
          >
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="h-7 rounded border border-[var(--xd-border)] px-3 text-[12px] text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex h-7 items-center gap-1.5 rounded bg-[var(--xd-accent)] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[var(--xd-accent-hover)] disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" />
            <span>{busy ? 'Restoring…' : 'Restore version'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
