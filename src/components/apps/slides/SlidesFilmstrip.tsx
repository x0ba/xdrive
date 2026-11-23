import { useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Copy,
  EyeOff,
  LayoutGrid,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { AppContextMenu } from '#/components/apps/shared'
import type { ContextMenuItem } from '#/components/apps/shared'
import { cn } from '#/lib/utils'
import { SlideCanvas } from './SlidesCanvas'
import type { SlideLayoutKind, SlidePage, SlideThemeSpec } from './types'

export interface SlidesFilmstripProps {
  slides: SlidePage[]
  activeSlideId: string
  theme: SlideThemeSpec
  readOnly?: boolean
  onSelectSlide: (id: string) => void
  onNewSlide: (afterId?: string) => void
  onDuplicateSlide: (id: string) => void
  onDeleteSlide: (id: string) => void
  onToggleSkip: (id: string) => void
  onMoveSlide: (id: string, delta: -1 | 1) => void
  onApplyLayout: (id: string, layout: SlideLayoutKind) => void
}

const LAYOUT_LABELS: Array<{ id: SlideLayoutKind; label: string }> = [
  { id: 'title', label: 'Title slide' },
  { id: 'title-body', label: 'Title & body' },
  { id: 'section', label: 'Section header' },
  { id: 'two-col', label: 'Two columns' },
  { id: 'big-number', label: 'Big number' },
  { id: 'caption', label: 'Caption' },
  { id: 'blank', label: 'Blank' },
]

export function SlidesFilmstrip({
  slides,
  activeSlideId,
  theme,
  readOnly = false,
  onSelectSlide,
  onNewSlide,
  onDuplicateSlide,
  onDeleteSlide,
  onToggleSkip,
  onMoveSlide,
  onApplyLayout,
}: SlidesFilmstripProps) {
  const [ctx, setCtx] = useState<{
    open: boolean
    x: number
    y: number
    slideId: string | null
  }>({ open: false, x: 0, y: 0, slideId: null })

  const targetSlide = ctx.slideId
    ? (slides.find((s) => s.id === ctx.slideId) ?? null)
    : null
  const targetIdx = targetSlide
    ? slides.findIndex((s) => s.id === targetSlide.id)
    : -1

  const contextItems: ContextMenuItem[] = targetSlide
    ? [
        {
          id: 's-new',
          label: 'New slide',
          icon: <Plus className="h-3.5 w-3.5" />,
          shortcut: '⌘M',
          disabled: readOnly,
          onSelect: () => onNewSlide(targetSlide.id),
        },
        {
          id: 's-dup',
          label: 'Duplicate slide',
          icon: <Copy className="h-3.5 w-3.5" />,
          shortcut: '⌘D',
          disabled: readOnly,
          onSelect: () => onDuplicateSlide(targetSlide.id),
        },
        {
          id: 's-skip',
          label: targetSlide.skipped ? 'Unskip slide' : 'Skip slide',
          icon: <EyeOff className="h-3.5 w-3.5" />,
          disabled: readOnly,
          onSelect: () => onToggleSkip(targetSlide.id),
        },
        { id: 's-sep-1', label: '', divider: true },
        {
          id: 's-layout',
          label: 'Apply layout',
          icon: <LayoutGrid className="h-3.5 w-3.5" />,
          disabled: readOnly,
          submenu: LAYOUT_LABELS.map((l) => ({
            id: `lay-${l.id}`,
            label: l.label,
            checked: targetSlide.layout === l.id,
            onSelect: () => onApplyLayout(targetSlide.id, l.id),
          })),
        },
        {
          id: 's-up',
          label: 'Move slide up',
          icon: <ArrowUp className="h-3.5 w-3.5" />,
          disabled: readOnly || targetIdx <= 0,
          onSelect: () => onMoveSlide(targetSlide.id, -1),
        },
        {
          id: 's-down',
          label: 'Move slide down',
          icon: <ArrowDown className="h-3.5 w-3.5" />,
          disabled: readOnly || targetIdx === slides.length - 1,
          onSelect: () => onMoveSlide(targetSlide.id, 1),
        },
        { id: 's-sep-2', label: '', divider: true },
        {
          id: 's-del',
          label: 'Delete slide',
          icon: <Trash2 className="h-3.5 w-3.5" />,
          danger: true,
          disabled: readOnly || slides.length <= 1,
          onSelect: () => onDeleteSlide(targetSlide.id),
        },
      ]
    : [
        {
          id: 's-new-empty',
          label: 'New slide',
          icon: <Plus className="h-3.5 w-3.5" />,
          disabled: readOnly,
          onSelect: () => onNewSlide(),
        },
      ]

  return (
    <aside
      data-marble-id="film"
      aria-label="Slide filmstrip"
      onContextMenu={(e) => {
        e.preventDefault()
        setCtx({ open: true, x: e.clientX, y: e.clientY, slideId: null })
      }}
      className="flex h-full w-52 shrink-0 select-none flex-col border-r border-[var(--xd-border)] bg-[var(--xd-rail)]"
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        <ol data-marble-id="slide-list" className="space-y-2.5">
          {slides.map((slide, index) => {
            const active = slide.id === activeSlideId
            return (
              <li key={slide.id} data-marble-id={slide.id}>
                <button
                  type="button"
                  onClick={() => onSelectSlide(slide.id)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onSelectSlide(slide.id)
                    setCtx({
                      open: true,
                      x: e.clientX,
                      y: e.clientY,
                      slideId: slide.id,
                    })
                  }}
                  className="group flex w-full items-start gap-2 text-left"
                >
                  <div className="flex w-5 shrink-0 flex-col items-end pt-1">
                    <span
                      className={cn(
                        'xd-tabular text-[11px] font-medium',
                        active
                          ? 'text-[var(--xd-accent)]'
                          : 'text-[var(--xd-ink-muted)]',
                      )}
                    >
                      {index + 1}
                    </span>
                    {slide.transition !== 'none' && (
                      <Sparkles className="mt-1 h-2.5 w-2.5 text-[var(--xd-ink-muted)] opacity-60" />
                    )}
                  </div>

                  {/* Live miniature 16:9 scaled slide thumbnail */}
                  <div
                    className={cn(
                      'relative aspect-video w-full overflow-hidden rounded border transition-colors',
                      active
                        ? 'border-[var(--xd-accent)] ring-1 ring-[var(--xd-accent)]'
                        : 'border-[var(--xd-border)] group-hover:border-[var(--xd-border-strong)]',
                      slide.skipped && 'opacity-45',
                    )}
                  >
                    <div
                      className="pointer-events-none origin-top-left"
                      style={{
                        width: 960,
                        height: 540,
                        transform: 'scale(0.165)',
                      }}
                    >
                      <SlideCanvas slide={slide} theme={theme} />
                    </div>
                    {slide.skipped && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <EyeOff className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="border-t border-[var(--xd-border)] p-2">
        <button
          type="button"
          disabled={readOnly}
          onClick={() => onNewSlide(activeSlideId)}
          className="flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-[var(--xd-border-strong)] py-1.5 text-[11.5px] font-medium text-[var(--xd-ink-secondary)] transition-colors hover:border-[var(--xd-accent)] hover:text-[var(--xd-accent)] disabled:opacity-35"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New slide</span>
        </button>
      </div>

      <AppContextMenu
        open={ctx.open}
        x={ctx.x}
        y={ctx.y}
        items={contextItems}
        onClose={() => setCtx((s) => ({ ...s, open: false }))}
        ariaLabel="Slide actions"
      />
    </aside>
  )
}
