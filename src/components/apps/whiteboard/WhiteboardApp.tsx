import { lazy, Suspense } from 'react'
import { ClientOnly } from '@tanstack/react-router'
import { cn } from '#/lib/utils'
import { whiteboardStateScript } from '#/lib/marble/whiteboard-document'

const WhiteboardCanvas = lazy(() => import('./WhiteboardCanvas'))

export interface WhiteboardAppProps {
  /** .mrbl source. The tldraw snapshot lives in one JSON script tag. */
  marbleSource?: string
  onMarbleSourceChange?: (nextSource: string, label: string) => boolean | void
  /** Called when the canvas has strokes that are not in the file yet. */
  onDraft?: () => void
  /** Called when those strokes matched the file and no longer need a write. */
  onDraftClear?: () => void
  readOnly?: boolean
  className?: string
}

function WhiteboardFallback() {
  return (
    <div
      role="status"
      className="flex h-full items-center justify-center text-[13px] text-[var(--xd-ink-muted)]"
    >
      Loading whiteboard…
    </div>
  )
}

function fallbackSource(): string {
  return `<!doctype html><html lang="en" data-marble="1"><head><title>Whiteboard</title></head><body><h1 data-marble-id="whiteboard-title" data-marble-editable>Whiteboard</h1>${whiteboardStateScript(null)}</body></html>`
}

/**
 * tldraw is client-only. The server renders the fallback; the editor chunk
 * loads after hydration.
 */
export function WhiteboardApp({
  marbleSource,
  onMarbleSourceChange,
  onDraft,
  onDraftClear,
  readOnly = false,
  className,
}: WhiteboardAppProps) {
  const source =
    marbleSource && marbleSource.trim() ? marbleSource : fallbackSource()

  return (
    <div
      className={cn('relative flex h-full min-h-0 w-full flex-col', className)}
    >
      <p className="sr-only">
        {readOnly ? 'Whiteboard is read only' : 'Whiteboard is editable'}
      </p>
      <ClientOnly fallback={<WhiteboardFallback />}>
        <Suspense fallback={<WhiteboardFallback />}>
          <WhiteboardCanvas
            marbleSource={source}
            readOnly={readOnly}
            onDraft={() => onDraft?.()}
            onDraftClear={() => onDraftClear?.()}
            onCommit={(nextSource, label) =>
              onMarbleSourceChange?.(nextSource, label) !== false
            }
          />
        </Suspense>
      </ClientOnly>
    </div>
  )
}
