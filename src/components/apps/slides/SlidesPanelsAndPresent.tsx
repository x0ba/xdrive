import { useEffect, useState } from 'react'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronLeft,
  ChevronRight,
  Monitor,
  Pause,
  Play,
  Pointer,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import { XDRIVE_EDITOR_SWATCHES } from '#/components/apps/shared'
import { cn } from '#/lib/utils'
import { SlideCanvas } from './SlidesCanvas'
import { SLIDE_THEMES } from './themes'
import type {
  SlideElement,
  SlideLayoutKind,
  SlidePage,
  SlideThemeSpec,
  SlideTransitionKind,
  SlidesInspectorTab,
} from './types'

/* ============================================================================
   SlidesInspectorPanel — Right Contextual Panel (Themes / Layouts / Bg / Motion / Format)
   ============================================================================ */

export interface SlidesInspectorPanelProps {
  tab: SlidesInspectorTab
  slide: SlidePage
  theme: SlideThemeSpec
  selectedElement: SlideElement | null
  readOnly?: boolean
  onClose: () => void
  onSelectTheme: (themeId: string) => void
  onApplyLayout: (layout: SlideLayoutKind) => void
  onChangeBackground: (color: string | undefined, applyAll?: boolean) => void
  onChangeTransition: (
    transition: SlideTransitionKind,
    ms: number,
    applyAll?: boolean,
  ) => void
  onPreviewTransition: () => void
  onUpdateElement: (id: string, patch: Partial<SlideElement>) => void
  onOrderElement: (id: string, dir: 'front' | 'back') => void
  onDeleteElement: (id: string) => void
}

const LAYOUTS: Array<{ id: SlideLayoutKind; label: string; desc: string }> = [
  { id: 'title', label: 'Title slide', desc: 'Headline and subtitle' },
  {
    id: 'title-body',
    label: 'Title & body',
    desc: 'Header with bulleted list',
  },
  { id: 'section', label: 'Section header', desc: 'Divider and section title' },
  { id: 'two-col', label: 'Two columns', desc: 'Side-by-side comparison' },
  { id: 'big-number', label: 'Big number', desc: 'KPI or single key metric' },
  { id: 'caption', label: 'Caption', desc: 'Figure stage + takeaway' },
  { id: 'blank', label: 'Blank', desc: 'Open freeform canvas' },
]

const TRANSITIONS: Array<{ id: SlideTransitionKind; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Dissolve / Fade' },
  { id: 'slide-left', label: 'Slide from right' },
  { id: 'slide-right', label: 'Slide from left' },
  { id: 'zoom', label: 'Zoom' },
]

export function SlidesInspectorPanel({
  tab,
  slide,
  theme,
  selectedElement,
  readOnly = false,
  onClose,
  onSelectTheme,
  onApplyLayout,
  onChangeBackground,
  onChangeTransition,
  onPreviewTransition,
  onUpdateElement,
  onOrderElement,
  onDeleteElement,
}: SlidesInspectorPanelProps) {
  if (tab === 'none') return null

  const titleMap: Record<Exclude<SlidesInspectorTab, 'none'>, string> = {
    theme: 'Themes',
    layout: 'Layouts',
    background: 'Background',
    transition: 'Motion & Transitions',
    format: 'Format options',
  }

  return (
    <aside
      aria-label={titleMap[tab]}
      className="flex h-full w-64 shrink-0 flex-col border-l border-[var(--xd-border)] bg-[var(--xd-rail)] text-[12px] text-[var(--xd-ink)] select-none"
    >
      <div className="flex items-center justify-between border-b border-[var(--xd-border)] px-3 py-2">
        <span className="font-medium">{titleMap[tab]}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="text-[var(--xd-ink-muted)] hover:text-[var(--xd-ink)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {tab === 'theme' && (
          <div className="space-y-2">
            {SLIDE_THEMES.map((t) => {
              const active = t.id === theme.id
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={readOnly}
                  onClick={() => onSelectTheme(t.id)}
                  className={cn(
                    'flex w-full flex-col rounded-md border p-2.5 text-left transition-colors',
                    active
                      ? 'border-[var(--xd-accent)] bg-[var(--xd-accent-soft)]'
                      : 'border-[var(--xd-border)] bg-[var(--xd-canvas)] hover:border-[var(--xd-border-strong)]',
                  )}
                >
                  <div
                    style={{
                      backgroundColor: t.surface,
                      borderColor: t.border,
                      color: t.ink,
                    }}
                    className="flex h-14 w-full flex-col justify-between rounded border p-2"
                  >
                    <span
                      style={{ fontFamily: t.headingFont }}
                      className="text-[12px] font-medium"
                    >
                      {t.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <span
                        className="h-2 w-6 rounded-xs"
                        style={{ backgroundColor: t.accent }}
                      />
                      <span
                        className="h-2 w-4 rounded-xs"
                        style={{ backgroundColor: t.good }}
                      />
                      <span
                        className="h-2 w-4 rounded-xs"
                        style={{ backgroundColor: t.muted }}
                      />
                    </div>
                  </div>
                  <span className="mt-1.5 text-[11px] text-[var(--xd-ink-muted)]">
                    {t.description}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {tab === 'layout' && (
          <div className="grid grid-cols-1 gap-2">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                type="button"
                disabled={readOnly}
                onClick={() => onApplyLayout(l.id)}
                className={cn(
                  'rounded-md border p-2.5 text-left transition-colors',
                  slide.layout === l.id
                    ? 'border-[var(--xd-accent)] bg-[var(--xd-accent-soft)]'
                    : 'border-[var(--xd-border)] bg-[var(--xd-canvas)] hover:border-[var(--xd-border-strong)]',
                )}
              >
                <div className="font-medium text-[var(--xd-ink)]">
                  {l.label}
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--xd-ink-muted)]">
                  {l.desc}
                </div>
              </button>
            ))}
          </div>
        )}

        {tab === 'background' && (
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 text-[11px] text-[var(--xd-ink-muted)]">
                Slide fill color
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {XDRIVE_EDITOR_SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    disabled={readOnly}
                    aria-label={`Background ${hex}`}
                    onClick={() => onChangeBackground(hex, false)}
                    style={{ backgroundColor: hex }}
                    className={cn(
                      'h-6 w-6 rounded-xs border',
                      slide.background === hex
                        ? 'border-[var(--xd-accent)] ring-1 ring-[var(--xd-accent)]'
                        : 'border-[var(--xd-border-strong)]',
                    )}
                  />
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5 pt-2">
              <button
                type="button"
                disabled={readOnly}
                onClick={() =>
                  onChangeBackground(slide.background || theme.surface, true)
                }
                className="w-full rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] py-1.5 text-[11.5px] font-medium hover:bg-[var(--xd-surface-hover)]"
              >
                Apply to all slides
              </button>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => onChangeBackground(undefined, false)}
                className="w-full rounded border border-[var(--xd-border)] py-1.5 text-[11.5px] text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)]"
              >
                Reset to theme
              </button>
            </div>
          </div>
        )}

        {tab === 'transition' && (
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[11px] text-[var(--xd-ink-muted)]">
                Slide transition
              </span>
              <select
                disabled={readOnly}
                value={slide.transition}
                onChange={(e) =>
                  onChangeTransition(
                    e.target.value as SlideTransitionKind,
                    slide.transitionMs,
                    false,
                  )
                }
                className="h-8 w-full rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 text-[12px]"
              >
                {TRANSITIONS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <div className="flex justify-between text-[11px] text-[var(--xd-ink-muted)]">
                <span>Duration</span>
                <span className="xd-tabular">{slide.transitionMs} ms</span>
              </div>
              <input
                type="range"
                min={150}
                max={900}
                step={50}
                disabled={readOnly || slide.transition === 'none'}
                value={slide.transitionMs}
                onChange={(e) =>
                  onChangeTransition(
                    slide.transition,
                    Number(e.target.value),
                    false,
                  )
                }
                className="w-full accent-[var(--xd-accent)]"
              />
            </label>

            <div className="flex gap-1.5 pt-1">
              <button
                type="button"
                onClick={onPreviewTransition}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded bg-[var(--xd-accent)] py-1.5 text-[11.5px] font-medium text-white"
              >
                <Play className="h-3 w-3" />
                <span>Play</span>
              </button>
              <button
                type="button"
                disabled={readOnly}
                onClick={() =>
                  onChangeTransition(slide.transition, slide.transitionMs, true)
                }
                className="flex-1 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] py-1.5 text-[11.5px] font-medium hover:bg-[var(--xd-surface-hover)]"
              >
                Apply to all
              </button>
            </div>
          </div>
        )}

        {tab === 'format' && (
          <>
            {!selectedElement ? (
              <p className="py-6 text-center text-[11.5px] text-[var(--xd-ink-muted)]">
                Select any element on the slide to adjust position, size, and
                style.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['X %', 'x'],
                      ['Y %', 'y'],
                      ['W %', 'w'],
                      ['H %', 'h'],
                    ] as const
                  ).map(([label, key]) => (
                    <label key={key} className="space-y-1">
                      <span className="text-[10.5px] text-[var(--xd-ink-muted)]">
                        {label}
                      </span>
                      <input
                        type="number"
                        disabled={readOnly}
                        value={Math.round(selectedElement[key])}
                        onChange={(e) =>
                          onUpdateElement(selectedElement.id, {
                            [key]: Number(e.target.value) || 0,
                          })
                        }
                        className="xd-tabular h-7 w-full rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 text-[12px]"
                      />
                    </label>
                  ))}
                </div>

                <label className="block space-y-1">
                  <div className="flex justify-between text-[11px] text-[var(--xd-ink-muted)]">
                    <span>Opacity</span>
                    <span className="xd-tabular">
                      {Math.round((selectedElement.opacity ?? 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.15}
                    max={1}
                    step={0.05}
                    disabled={readOnly}
                    value={selectedElement.opacity ?? 1}
                    onChange={(e) =>
                      onUpdateElement(selectedElement.id, {
                        opacity: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[var(--xd-accent)]"
                  />
                </label>

                <div className="space-y-1.5">
                  <div className="text-[11px] text-[var(--xd-ink-muted)]">
                    Arrange &amp; align
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() =>
                        onOrderElement(selectedElement.id, 'front')
                      }
                      className="inline-flex items-center justify-center gap-1 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] py-1 text-[11px] hover:bg-[var(--xd-surface-hover)]"
                    >
                      <ArrowUpToLine className="h-3 w-3" />
                      <span>To front</span>
                    </button>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => onOrderElement(selectedElement.id, 'back')}
                      className="inline-flex items-center justify-center gap-1 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] py-1 text-[11px] hover:bg-[var(--xd-surface-hover)]"
                    >
                      <ArrowDownToLine className="h-3 w-3" />
                      <span>To back</span>
                    </button>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() =>
                        onUpdateElement(selectedElement.id, {
                          x: Math.round((100 - selectedElement.w) / 2),
                        })
                      }
                      className="inline-flex items-center justify-center gap-1 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] py-1 text-[11px] hover:bg-[var(--xd-surface-hover)]"
                    >
                      <AlignCenterHorizontal className="h-3 w-3" />
                      <span>Center H</span>
                    </button>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() =>
                        onUpdateElement(selectedElement.id, {
                          y: Math.round((100 - selectedElement.h) / 2),
                        })
                      }
                      className="inline-flex items-center justify-center gap-1 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] py-1 text-[11px] hover:bg-[var(--xd-surface-hover)]"
                    >
                      <AlignCenterVertical className="h-3 w-3" />
                      <span>Center V</span>
                    </button>
                  </div>
                </div>

                {selectedElement.kind === 'chart' &&
                  selectedElement.chartData && (
                    <div className="space-y-1.5 border-t border-[var(--xd-border)] pt-2.5">
                      <div className="text-[11px] font-medium text-[var(--xd-ink-secondary)]">
                        Chart series data
                      </div>
                      {selectedElement.chartData.map((d, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <input
                            value={d.label}
                            disabled={readOnly}
                            onChange={(e) => {
                              const next = (
                                selectedElement.chartData ?? []
                              ).map((item, i) =>
                                i === idx
                                  ? { ...item, label: e.target.value }
                                  : item,
                              )
                              onUpdateElement(selectedElement.id, {
                                chartData: next,
                              })
                            }}
                            className="h-7 min-w-0 flex-1 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-1.5 text-[11.5px]"
                          />
                          <input
                            type="number"
                            value={d.value}
                            disabled={readOnly}
                            onChange={(e) => {
                              const next = (
                                selectedElement.chartData ?? []
                              ).map((item, i) =>
                                i === idx
                                  ? {
                                      ...item,
                                      value: Number(e.target.value) || 0,
                                    }
                                  : item,
                              )
                              onUpdateElement(selectedElement.id, {
                                chartData: next,
                              })
                            }}
                            className="xd-tabular h-7 w-16 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-1.5 text-[11.5px]"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                {selectedElement.kind === 'image' && (
                  <label className="block space-y-1 border-t border-[var(--xd-border)] pt-2.5">
                    <span className="text-[11px] text-[var(--xd-ink-muted)]">
                      Image URL
                    </span>
                    <input
                      value={selectedElement.imageUrl ?? ''}
                      disabled={readOnly}
                      placeholder="https://..."
                      onChange={(e) =>
                        onUpdateElement(selectedElement.id, {
                          imageUrl: e.target.value,
                        })
                      }
                      className="h-7 w-full rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 text-[11.5px]"
                    />
                  </label>
                )}

                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => onDeleteElement(selectedElement.id)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-[var(--xd-danger)]/40 bg-[var(--xd-danger-soft)] py-1.5 text-[11.5px] font-medium text-[var(--xd-danger)] hover:opacity-90"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete element</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  )
}

/* ============================================================================
   SlidesPresentOverlay — Full-Screen Slideshow & Presenter View
   ============================================================================ */

export interface SlidesPresentOverlayProps {
  slides: SlidePage[]
  startIndex: number
  theme: SlideThemeSpec
  presenterMode?: boolean
  onClose: () => void
}

export function SlidesPresentOverlay({
  slides,
  startIndex,
  theme,
  presenterMode: initialPresenter = false,
  onClose,
}: SlidesPresentOverlayProps) {
  const playable = slides.filter((s) => !s.skipped)
  const list = playable.length > 0 ? playable : slides
  const [index, setIndex] = useState(
    Math.max(0, Math.min(startIndex, list.length - 1)),
  )
  const [presenterView, setPresenterView] = useState(initialPresenter)
  const [laser, setLaser] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [running, setRunning] = useState(true)

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(timer)
  }, [running])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (
        e.key === 'ArrowRight' ||
        e.key === ' ' ||
        e.key === 'PageDown'
      ) {
        e.preventDefault()
        setIndex((i) => Math.min(list.length - 1, i + 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        setIndex((i) => Math.max(0, i - 1))
      } else if (e.key === 'Home') {
        setIndex(0)
      } else if (e.key === 'End') {
        setIndex(list.length - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [list.length, onClose])

  const current = list[index]
  const next = list.at(index + 1) ?? null
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <div
      role="dialog"
      aria-label="Slideshow presentation"
      className={cn(
        'fixed inset-0 z-50 flex flex-col bg-[#08090c] text-[#f3f5f8]',
        laser && 'cursor-crosshair',
      )}
    >
      <div
        className={cn(
          'flex min-h-0 flex-1 items-center justify-center p-6',
          presenterView && 'grid grid-cols-[1.55fr_1fr] items-stretch gap-5',
        )}
      >
        {/* Main Active Slide */}
        <div className="flex items-center justify-center">
          <div
            key={current.id}
            style={{
              animationDuration: `${current.transitionMs}ms`,
            }}
            className={cn(
              'aspect-video w-full max-w-[1100px] overflow-hidden rounded border border-white/10 shadow-2xl',
              current.transition === 'fade' && 'animate-in fade-in',
              current.transition === 'slide-left' &&
                'animate-in slide-in-from-right-8 fade-in',
              current.transition === 'slide-right' &&
                'animate-in slide-in-from-left-8 fade-in',
              current.transition === 'zoom' && 'animate-in zoom-in-95 fade-in',
            )}
          >
            <SlideCanvas slide={current} theme={theme} />
          </div>
        </div>

        {/* Presenter View Right Column: Timer + Next Slide + Speaker Notes */}
        {presenterView && (
          <div className="flex min-h-0 flex-col gap-4 rounded-md border border-white/10 bg-[#101216] p-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <div className="text-[11px] text-[#8b95a5]">Elapsed time</div>
                <div className="xd-mono xd-tabular text-[22px] font-semibold">
                  {mm}:{ss}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setRunning((r) => !r)}
                  className="inline-flex h-7 items-center gap-1 rounded border border-white/15 px-2.5 text-[11.5px] hover:bg-white/10"
                >
                  {running ? (
                    <Pause className="h-3 w-3" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                  <span>{running ? 'Pause' : 'Resume'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSeconds(0)}
                  aria-label="Reset timer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded border border-white/15 hover:bg-white/10"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[11px] text-[#8b95a5]">
                Next slide
              </div>
              {next ? (
                <div className="aspect-video w-56 overflow-hidden rounded border border-white/10">
                  <div
                    className="pointer-events-none origin-top-left"
                    style={{
                      width: 960,
                      height: 540,
                      transform: 'scale(0.233)',
                    }}
                  >
                    <SlideCanvas slide={next} theme={theme} />
                  </div>
                </div>
              ) : (
                <div className="flex aspect-video w-56 items-center justify-center rounded border border-white/10 text-[12px] text-[#8b95a5]">
                  End of deck
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/10 pt-3">
              <div className="mb-1 text-[11px] text-[#8b95a5]">
                Speaker notes
              </div>
              <p className="text-[14px] leading-relaxed text-[#e5e9f0] whitespace-pre-wrap">
                {current.speakerNotes || 'No speaker notes for this slide.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Floating Presentation Controls */}
      <div className="flex h-12 shrink-0 items-center justify-between border-t border-white/10 bg-[#101216] px-4 text-[12px]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={index <= 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            aria-label="Previous slide"
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-white/15 hover:bg-white/10 disabled:opacity-35"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="xd-tabular px-2 font-medium">
            Slide {index + 1} / {list.length}
          </span>
          <button
            type="button"
            disabled={index >= list.length - 1}
            onClick={() => setIndex((i) => Math.min(list.length - 1, i + 1))}
            aria-label="Next slide"
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-white/15 hover:bg-white/10 disabled:opacity-35"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLaser((v) => !v)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded border px-2.5 text-[11.5px]',
              laser
                ? 'border-[#e5484d] bg-[#e5484d]/20 text-[#ff8589]'
                : 'border-white/15 hover:bg-white/10',
            )}
          >
            <Pointer className="h-3.5 w-3.5" />
            <span>Laser</span>
          </button>
          <button
            type="button"
            onClick={() => setPresenterView((v) => !v)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded border px-2.5 text-[11.5px]',
              presenterView
                ? 'border-[#5e6ad2] bg-[#5e6ad2]/25 text-[#b5beff]'
                : 'border-white/15 hover:bg-white/10',
            )}
          >
            <Monitor className="h-3.5 w-3.5" />
            <span>Presenter view</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 items-center gap-1 rounded border border-white/15 px-2.5 text-[11.5px] hover:bg-white/10"
          >
            <X className="h-3.5 w-3.5" />
            <span>Exit (Esc)</span>
          </button>
        </div>
      </div>
    </div>
  )
}
