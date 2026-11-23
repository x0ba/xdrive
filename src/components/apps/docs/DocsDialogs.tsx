import { useState } from 'react'
import { X } from 'lucide-react'
import type { DocsOrientation, DocsPageSetup, DocsPaperSize } from './types'

/* ============================================================================
   Find & Replace Floating Bar (Google Docs ⌘H)
   ============================================================================ */

export interface DocsFindReplaceBarProps {
  query: string
  replaceWith: string
  matchCase: boolean
  matchCount: number
  onQueryChange: (q: string) => void
  onReplaceChange: (r: string) => void
  onToggleMatchCase: () => void
  onReplaceOne: () => void
  onReplaceAll: () => void
  onClose: () => void
}

export function DocsFindReplaceBar({
  query,
  replaceWith,
  matchCase,
  matchCount,
  onQueryChange,
  onReplaceChange,
  onToggleMatchCase,
  onReplaceOne,
  onReplaceAll,
  onClose,
}: DocsFindReplaceBarProps) {
  return (
    <div
      role="dialog"
      aria-label="Find and replace"
      className="absolute top-2 right-4 z-40 w-80 rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] p-3 text-[12px] text-[var(--xd-ink)] shadow-lg"
    >
      <div className="flex items-center justify-between pb-2">
        <span className="font-medium">Find and replace</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close find and replace"
          className="text-[var(--xd-ink-muted)] hover:text-[var(--xd-ink)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-2">
        <div className="relative flex items-center">
          <input
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Find"
            aria-label="Find text"
            className="h-7 w-full rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] pr-14 pl-2 text-[12px] outline-none focus:border-[var(--xd-accent)]"
          />
          <span className="xd-tabular pointer-events-none absolute right-2 text-[11px] text-[var(--xd-ink-muted)]">
            {query ? `${matchCount} found` : ''}
          </span>
        </div>
        <input
          value={replaceWith}
          onChange={(e) => onReplaceChange(e.target.value)}
          placeholder="Replace with"
          aria-label="Replace text"
          className="h-7 w-full rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 text-[12px] outline-none focus:border-[var(--xd-accent)]"
        />
        <div className="flex items-center justify-between pt-1">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11.5px] text-[var(--xd-ink-secondary)]">
            <input
              type="checkbox"
              checked={matchCase}
              onChange={onToggleMatchCase}
              className="accent-[var(--xd-accent)]"
            />
            <span>Match case</span>
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!query || matchCount === 0}
              onClick={onReplaceOne}
              className="rounded border border-[var(--xd-border)] px-2 py-1 text-[11px] hover:bg-[var(--xd-surface-hover)] disabled:opacity-40"
            >
              Replace
            </button>
            <button
              type="button"
              disabled={!query || matchCount === 0}
              onClick={onReplaceAll}
              className="rounded bg-[var(--xd-accent)] px-2 py-1 text-[11px] font-medium text-white hover:bg-[var(--xd-accent-hover)] disabled:opacity-40"
            >
              Replace all
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
   Word Count Modal (Google Docs ⌘⇧C)
   ============================================================================ */

export interface DocsWordCountModalProps {
  open: boolean
  pages: number
  words: number
  characters: number
  charactersNoSpaces: number
  showLiveWordCount: boolean
  onToggleLiveWordCount: () => void
  onClose: () => void
}

export function DocsWordCountModal({
  open,
  pages,
  words,
  characters,
  charactersNoSpaces,
  showLiveWordCount,
  onToggleLiveWordCount,
  onClose,
}: DocsWordCountModalProps) {
  if (!open) return null
  const readingMinutes = Math.max(1, Math.ceil(words / 225))
  const rows = [
    ['Pages', String(pages)],
    ['Words', words.toLocaleString()],
    ['Characters', characters.toLocaleString()],
    ['Characters excluding spaces', charactersNoSpaces.toLocaleString()],
    ['Estimated reading time', `${readingMinutes} min`],
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-[18vh]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-label="Word count"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-xs rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] p-4 text-[12.5px] text-[var(--xd-ink)] shadow-xl"
      >
        <div className="flex items-center justify-between pb-3">
          <h3 className="text-[14px] font-semibold">Word count</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close word count"
            className="text-[var(--xd-ink-muted)] hover:text-[var(--xd-ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <dl className="divide-y divide-[var(--xd-border)] border-y border-[var(--xd-border)]">
          {rows.map(([label, val]) => (
            <div key={label} className="flex justify-between py-2">
              <dt className="text-[var(--xd-ink-secondary)]">{label}</dt>
              <dd className="xd-tabular font-medium">{val}</dd>
            </div>
          ))}
        </dl>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12px] text-[var(--xd-ink-secondary)]">
          <input
            type="checkbox"
            checked={showLiveWordCount}
            onChange={onToggleLiveWordCount}
            className="accent-[var(--xd-accent)]"
          />
          <span>Display word count while typing</span>
        </label>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-[var(--xd-accent)] px-3 py-1 text-[12px] font-medium text-white"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
   Page Setup Modal (Google Docs File → Page setup)
   ============================================================================ */

export interface DocsPageSetupModalProps {
  open: boolean
  setup: DocsPageSetup
  onSave: (next: DocsPageSetup) => void
  onClose: () => void
}

export function DocsPageSetupModal({
  open,
  setup,
  onSave,
  onClose,
}: DocsPageSetupModalProps) {
  const [draft, setDraft] = useState<DocsPageSetup>(setup)
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-[14vh]"
      onMouseDown={onClose}
    >
      <form
        role="dialog"
        aria-label="Page setup"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          onSave(draft)
          onClose()
        }}
        className="w-full max-w-sm rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] p-4 text-[12.5px] text-[var(--xd-ink)] shadow-xl"
      >
        <div className="flex items-center justify-between pb-3">
          <h3 className="text-[14px] font-semibold">Page setup</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close page setup"
            className="text-[var(--xd-ink-muted)] hover:text-[var(--xd-ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] p-0.5 text-[12px]">
          <button
            type="button"
            onClick={() => setDraft({ ...draft, pageless: false })}
            className={`rounded-xs py-1 font-medium ${!draft.pageless ? 'bg-[var(--xd-canvas)] text-[var(--xd-ink)]' : 'text-[var(--xd-ink-secondary)]'}`}
          >
            Pages
          </button>
          <button
            type="button"
            onClick={() => setDraft({ ...draft, pageless: true })}
            className={`rounded-xs py-1 font-medium ${draft.pageless ? 'bg-[var(--xd-canvas)] text-[var(--xd-ink)]' : 'text-[var(--xd-ink-secondary)]'}`}
          >
            Pageless
          </button>
        </div>

        {!draft.pageless && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[11px] text-[var(--xd-ink-muted)]">
                  Orientation
                </span>
                <select
                  value={draft.orientation}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      orientation: e.target.value as DocsOrientation,
                    })
                  }
                  className="h-8 w-full rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2 text-[12px]"
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-[var(--xd-ink-muted)]">
                  Paper size
                </span>
                <select
                  value={draft.paperSize}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      paperSize: e.target.value as DocsPaperSize,
                    })
                  }
                  className="h-8 w-full rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2 text-[12px]"
                >
                  <option value="letter">Letter (8.5 × 11&quot;)</option>
                  <option value="a4">A4 (8.27 × 11.69&quot;)</option>
                  <option value="legal">Legal (8.5 × 14&quot;)</option>
                </select>
              </label>
            </div>

            <div>
              <div className="mb-1 text-[11px] text-[var(--xd-ink-muted)]">
                Margins (inches)
              </div>
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    ['Top', 'marginTop'],
                    ['Bottom', 'marginBottom'],
                    ['Left', 'marginLeft'],
                    ['Right', 'marginRight'],
                  ] as const
                ).map(([label, key]) => (
                  <label key={key} className="space-y-1">
                    <span className="text-[10.5px] text-[var(--xd-ink-muted)]">
                      {label}
                    </span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.25"
                      max="2.5"
                      value={draft[key]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          [key]: Number(e.target.value) || 0.5,
                        })
                      }
                      className="xd-tabular h-7 w-full rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-1.5 text-[12px]"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12px] text-[var(--xd-ink-secondary)]">
          <input
            type="checkbox"
            checked={draft.showHeaderFooter}
            onChange={(e) =>
              setDraft({ ...draft, showHeaderFooter: e.target.checked })
            }
            className="accent-[var(--xd-accent)]"
          />
          <span>Show running header &amp; footer</span>
        </label>

        <div className="mt-4 flex justify-end gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[var(--xd-border)] px-3 py-1 text-[12px]"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded bg-[var(--xd-accent)] px-3 py-1 text-[12px] font-medium text-white"
          >
            Apply
          </button>
        </div>
      </form>
    </div>
  )
}

/* ============================================================================
   Insert Link / Insert Image Prompt Dialog
   ============================================================================ */

export interface DocsInsertDialogProps {
  kind: 'link' | 'image' | null
  initialLabel?: string
  onSubmit: (url: string, label: string) => void
  onClose: () => void
}

export function DocsInsertDialog({
  kind,
  initialLabel = '',
  onSubmit,
  onClose,
}: DocsInsertDialogProps) {
  const [url, setUrl] = useState(kind === 'link' ? 'https://' : '')
  const [label, setLabel] = useState(initialLabel)
  if (!kind) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-[18vh]"
      onMouseDown={onClose}
    >
      <form
        role="dialog"
        aria-label={kind === 'link' ? 'Insert link' : 'Insert image'}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(
            url.trim(),
            label.trim() || (kind === 'link' ? url.trim() : 'Figure'),
          )
          onClose()
        }}
        className="w-full max-w-sm rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] p-4 text-[12.5px] text-[var(--xd-ink)] shadow-xl"
      >
        <h3 className="text-[13.5px] font-semibold">
          {kind === 'link' ? 'Insert link' : 'Insert image'}
        </h3>
        <div className="mt-3 space-y-2.5">
          <label className="block space-y-1">
            <span className="text-[11px] text-[var(--xd-ink-muted)]">
              {kind === 'link' ? 'Link text' : 'Alt text / caption'}
            </span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={
                kind === 'link'
                  ? 'Surface code paper'
                  : 'Threshold collapse plot'
              }
              className="h-8 w-full rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2.5 text-[12px] outline-none focus:border-[var(--xd-accent)]"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-[var(--xd-ink-muted)]">
              {kind === 'link'
                ? 'URL'
                : 'Image URL (leave empty for research diagram placeholder)'}
            </span>
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="h-8 w-full rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2.5 text-[12px] outline-none focus:border-[var(--xd-accent)]"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[var(--xd-border)] px-3 py-1 text-[12px]"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded bg-[var(--xd-accent)] px-3 py-1 text-[12px] font-medium text-white"
          >
            Insert
          </button>
        </div>
      </form>
    </div>
  )
}
