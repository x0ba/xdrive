import { useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, Loader2, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'

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
  const checkboxId = useId()
  const checkboxRef = useRef<HTMLInputElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)
  const [confirmed, setConfirmed] = useState(false)

  if (snapshot !== null && !wasOpenRef.current) {
    previousFocusRef.current =
      typeof document !== 'undefined' &&
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
  }
  wasOpenRef.current = snapshot !== null

  useEffect(() => {
    setConfirmed(false)
  }, [snapshot?.id])

  return (
    <DialogPrimitive.Root
      open={snapshot !== null}
      onOpenChange={(open) => {
        if (!open && !busy) {
          onCancel()
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-black/60" />
        <DialogPrimitive.Content
          onEscapeKeyDown={(event) => {
            if (busy) {
              event.preventDefault()
            }
          }}
          onPointerDownOutside={(event) => {
            if (busy) {
              event.preventDefault()
            }
          }}
          onInteractOutside={(event) => {
            if (busy) {
              event.preventDefault()
            }
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            checkboxRef.current?.focus()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const target = previousFocusRef.current
            previousFocusRef.current = null
            if (target && target.isConnected) {
              target.focus()
            }
          }}
          className="fixed top-1/2 left-1/2 z-[91] w-[min(448px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] text-[var(--xd-ink)] shadow-2xl outline-none"
        >
          {snapshot && (
            <>
              <header className="flex items-center justify-between border-b border-[var(--xd-border)] px-4 py-3">
                <div className="flex items-center gap-2">
                  <RotateCcw className="size-4 text-[var(--xd-sketch)]" />
                  <DialogPrimitive.Title className="text-[13.5px] font-semibold">
                    Restore Drive from backup
                  </DialogPrimitive.Title>
                </div>
                <DialogPrimitive.Close asChild>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label="Cancel restore"
                    className="inline-flex size-6 items-center justify-center rounded text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] disabled:opacity-40"
                  >
                    <X className="size-3.5" />
                  </button>
                </DialogPrimitive.Close>
              </header>

              <div className="space-y-3 p-4 text-[12.5px]">
                <DialogPrimitive.Description className="sr-only">
                  Confirm replacing the current Drive folder with backup{' '}
                  {snapshot.id} after saving a pre-restore safety snapshot.
                </DialogPrimitive.Description>

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
                      Extracts into a staging directory and verifies every
                      SHA-256 checksum before touching your Drive.
                    </li>
                    <li>
                      Saves a pre-restore safety snapshot of your current Drive
                      first.
                    </li>
                    <li>
                      Swaps folders atomically — if any check fails, your live
                      Drive is left untouched.
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
                    ref={checkboxRef}
                    id={checkboxId}
                    type="checkbox"
                    checked={confirmed}
                    disabled={busy}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    className="mt-0.5 size-3.5 accent-[var(--xd-accent)]"
                  />
                  <span className="leading-snug text-[var(--xd-ink-secondary)]">
                    I understand this will replace my current Drive after saving
                    a safety snapshot.
                  </span>
                </label>
              </div>

              <footer className="flex items-center justify-end gap-2 border-t border-[var(--xd-border)] bg-[var(--xd-rail)]/50 px-4 py-2.5">
                <DialogPrimitive.Close asChild>
                  <button
                    type="button"
                    disabled={busy}
                    className="inline-flex h-7 items-center rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-3 text-[12px] font-medium text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] disabled:opacity-45"
                  >
                    Cancel
                  </button>
                </DialogPrimitive.Close>
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
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
