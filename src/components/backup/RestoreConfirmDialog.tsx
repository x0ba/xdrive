import { useEffect, useId, useState } from 'react'
import { AlertTriangle, Loader2, RotateCcw, ShieldCheck, X } from 'lucide-react'

import {
  formatBackupBytes,
  formatBackupTimestamp,
  triggerLabel,
} from '#/lib/backup/client'
import type { BackupSnapshot } from '#/lib/backup/types'

export interface RestoreConfirmDialogProps {
  snapshot: BackupSnapshot | null
  busy?: boolean
  error?: string | null
  onCancel: () => void
  onConfirm: (snapshotId: string) => void | Promise<void>
}

export function RestoreConfirmDialog({
  snapshot,
  busy = false,
  error = null,
  onCancel,
  onConfirm,
}: RestoreConfirmDialogProps) {
  const titleId = useId()
  const checkboxId = useId()
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    setConfirmed(false)
  }, [snapshot?.id])

  useEffect(() => {
    if (!snapshot) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [snapshot, busy, onCancel])

  if (!snapshot) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
      <button
        type="button"
        aria-label="Close restore dialog"
        disabled={busy}
        onClick={onCancel}
        className="absolute inset-0 cursor-default"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[1] w-full max-w-md overflow-hidden rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] text-[var(--xd-ink)] shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-[var(--xd-border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <RotateCcw className="size-4 text-[var(--xd-sketch)]" />
            <h3 id={titleId} className="text-[13.5px] font-semibold">
              Restore Drive from backup
            </h3>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            aria-label="Cancel restore"
            className="inline-flex size-6 items-center justify-center rounded text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] disabled:opacity-40"
          >
            <X className="size-3.5" />
          </button>
        </header>

        <div className="space-y-3 p-4 text-[12.5px]">
          <div className="rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-[var(--xd-ink)]">
                {formatBackupTimestamp(snapshot.createdAt)}
              </span>
              <span className="rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-1.5 py-0.5 text-[10.5px] text-[var(--xd-ink-secondary)]">
                {triggerLabel(snapshot.trigger)}
              </span>
            </div>
            <p className="xd-mono mt-1 truncate text-[11px] text-[var(--xd-ink-muted)]">
              {snapshot.id}
            </p>
            <p className="xd-tabular mt-1.5 text-[11.5px] text-[var(--xd-ink-secondary)]">
              {snapshot.fileCount} files ·{' '}
              {formatBackupBytes(snapshot.sizeBytes)}
            </p>
            {snapshot.label && (
              <p className="mt-1 text-[11.5px] text-[var(--xd-ink-secondary)]">
                {snapshot.label}
              </p>
            )}
          </div>

          <div className="space-y-1.5 rounded border border-[var(--xd-commit)]/30 bg-[var(--xd-commit-soft)]/50 p-3 text-[11.5px] text-[var(--xd-ink-secondary)]">
            <p className="flex items-center gap-1.5 font-medium text-[var(--xd-commit)]">
              <ShieldCheck className="size-3.5 shrink-0" />
              <span>Safe atomic restore</span>
            </p>
            <ul className="list-disc space-y-1 pl-4">
              <li>
                Extracts into a staging directory and verifies every SHA-256
                checksum before touching your Drive.
              </li>
              <li>
                Saves a pre-restore safety snapshot of your current Drive first.
              </li>
              <li>
                Swaps folders atomically — if any check fails, your live Drive
                is left untouched.
              </li>
            </ul>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded border border-[var(--xd-danger)]/40 bg-[var(--xd-danger-soft)] px-3 py-2 text-[11.5px] text-[var(--xd-danger)]">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <label
            htmlFor={checkboxId}
            className="flex cursor-pointer items-start gap-2 rounded border border-[var(--xd-border)] px-3 py-2.5 text-[12px] hover:bg-[var(--xd-rail)]"
          >
            <input
              id={checkboxId}
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-0.5 size-3.5 accent-[var(--xd-accent)]"
            />
            <span className="leading-snug text-[var(--xd-ink-secondary)]">
              I understand this will replace my current Drive after saving a
              safety snapshot.
            </span>
          </label>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--xd-border)] bg-[var(--xd-rail)]/50 px-4 py-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="inline-flex h-7 items-center rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-3 text-[12px] font-medium text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] disabled:opacity-45"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!confirmed || busy}
            onClick={() => void onConfirm(snapshot.id)}
            className="inline-flex h-7 items-center gap-1.5 rounded bg-[var(--xd-accent)] px-3 text-[12px] font-medium text-white hover:bg-[var(--xd-accent-hover)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Restoring Drive…</span>
              </>
            ) : (
              <>
                <RotateCcw className="size-3.5" />
                <span>Restore Drive</span>
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  )
}
