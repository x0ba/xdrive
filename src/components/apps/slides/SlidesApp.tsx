import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BarChart3,
  Bold,
  Circle,
  Copy,
  Diamond,
  Download,
  EyeOff,
  Grid2x2,
  Image,
  Italic,
  LayoutGrid,
  Minus,
  MousePointer2,
  PaintBucket,
  Palette,
  Play,
  Plus,
  Presentation,
  Redo2,
  Rows3,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  Square,
  Star,
  Table2,
  Trash2,
  Type,
  Underline,
  Undo2,
} from 'lucide-react'
import {
  AppMenuBar,
  ColorPalettePopover,
  FontSizeControl,
  TableGridPicker,
  ToolbarButton,
  ToolbarDivider,
  ToolbarDropdown,
} from '#/components/apps/shared'
import type { MenuBarGroup } from '#/components/apps/shared'
import { cn } from '#/lib/utils'
import { SlideCanvas } from './SlidesCanvas'
import { SlidesFilmstrip } from './SlidesFilmstrip'
import {
  SlidesInspectorPanel,
  SlidesPresentOverlay,
} from './SlidesPanelsAndPresent'
import {
  parseSlidesFromMarbleSource,
  serializeSlidesToMarbleSource,
} from './serialization'
import {
  DEFAULT_SLIDES_DECK,
  createElementsForLayout,
  createSlideFromLayout,
  getSlideTheme,
} from './themes'
import type {
  SlideElement,
  SlideLayoutKind,
  SlideShapeKind,
  SlidesDeckState,
  SlidesInspectorTab,
} from './types'

export interface SlidesAppProps {
  /** Standalone initial deck state (Storybook) */
  initialDeck?: SlidesDeckState
  /** Optional initial inspector panel */
  initialInspector?: SlidesInspectorTab
  /** Open slide sorter grid view initially */
  initialGridView?: boolean
  /** Launch slideshow overlay initially */
  initialPresenting?: boolean
  /** Bidirectional .mrbl HTML5 source */
  marbleSource?: string
  onMarbleSourceChange?: (nextSource: string, label: string) => void
  readOnly?: boolean
  className?: string
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

export function SlidesApp({
  initialDeck,
  initialInspector = 'none',
  initialGridView = false,
  initialPresenting = false,
  marbleSource,
  onMarbleSourceChange,
  readOnly = false,
  className,
}: SlidesAppProps) {
  const seeded = useMemo(
    () =>
      initialDeck ??
      (marbleSource
        ? parseSlidesFromMarbleSource(marbleSource)
        : structuredClone(DEFAULT_SLIDES_DECK)),
    [initialDeck, marbleSource],
  )

  const [deck, setDeck] = useState<SlidesDeckState>(seeded)
  const [selectedElId, setSelectedElId] = useState<string | null>(null)
  const [inspector, setInspector] =
    useState<SlidesInspectorTab>(initialInspector)
  const [gridView, setGridView] = useState(initialGridView)
  const [showNotes, setShowNotes] = useState(true)
  const [showGrid, setShowGrid] = useState(false)
  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const [presentState, setPresentState] = useState<{
    open: boolean
    startIndex: number
    presenter: boolean
  }>({ open: initialPresenting, startIndex: 0, presenter: false })
  const [animKey, setAnimKey] = useState(0)
  const [toast, setToast] = useState<string | null>(null)

  const historyRef = useRef<SlidesDeckState[]>([seeded])
  const historyIdxRef = useRef(0)
  const lastEmittedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!marbleSource || marbleSource === lastEmittedRef.current) return
    setDeck(parseSlidesFromMarbleSource(marbleSource))
  }, [marbleSource])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr))
    }, 2000)
  }, [])

  const commitDeck = useCallback(
    (next: SlidesDeckState, label: string, pushHistory = true) => {
      setDeck(next)
      if (pushHistory) {
        historyRef.current = historyRef.current
          .slice(0, historyIdxRef.current + 1)
          .concat(next)
          .slice(-40)
        historyIdxRef.current = historyRef.current.length - 1
      }
      if (onMarbleSourceChange) {
        const serialized = serializeSlidesToMarbleSource(next)
        lastEmittedRef.current = serialized
        onMarbleSourceChange(serialized, label)
      }
    },
    [onMarbleSourceChange],
  )

  const undo = useCallback(() => {
    if (readOnly || historyIdxRef.current <= 0) return
    historyIdxRef.current -= 1
    commitDeck(historyRef.current[historyIdxRef.current], 'Undo', false)
  }, [commitDeck, readOnly])

  const redo = useCallback(() => {
    if (readOnly || historyIdxRef.current >= historyRef.current.length - 1)
      return
    historyIdxRef.current += 1
    commitDeck(historyRef.current[historyIdxRef.current], 'Redo', false)
  }, [commitDeck, readOnly])

  const theme = getSlideTheme(deck.themeId)
  const activeSlideIndex = Math.max(
    0,
    deck.slides.findIndex((s) => s.id === deck.activeSlideId),
  )
  const activeSlide = deck.slides[activeSlideIndex] ?? deck.slides[0]
  const selectedEl =
    activeSlide.elements.find((e) => e.id === selectedElId) ?? null

  const updateActiveSlide = useCallback(
    (
      updater: (slide: typeof activeSlide) => typeof activeSlide,
      label: string,
    ) => {
      const nextSlides = deck.slides.map((s) =>
        s.id === activeSlide.id ? updater(s) : s,
      )
      commitDeck({ ...deck, slides: nextSlides }, label)
    },
    [activeSlide.id, commitDeck, deck],
  )

  const updateElement = useCallback(
    (id: string, patch: Partial<SlideElement>) => {
      if (readOnly) return
      updateActiveSlide(
        (s) => ({
          ...s,
          elements: s.elements.map((e) =>
            e.id === id ? { ...e, ...patch } : e,
          ),
        }),
        'Update slide element',
      )
    },
    [readOnly, updateActiveSlide],
  )

  const deleteElement = useCallback(
    (id: string) => {
      if (readOnly) return
      setSelectedElId(null)
      updateActiveSlide(
        (s) => ({ ...s, elements: s.elements.filter((e) => e.id !== id) }),
        'Delete element',
      )
    },
    [readOnly, updateActiveSlide],
  )

  const addElement = (el: SlideElement, label: string) => {
    if (readOnly) return
    updateActiveSlide((s) => ({ ...s, elements: [...s.elements, el] }), label)
    setSelectedElId(el.id)
  }

  const addTextBox = () =>
    addElement(
      {
        id: uid('txt'),
        kind: 'text',
        x: 16,
        y: 36,
        w: 44,
        h: 16,
        text: 'Double-click to edit text',
        fontSize: 20,
      },
      'Insert text box',
    )

  const addShape = (shapeKind: SlideShapeKind) =>
    addElement(
      {
        id: uid('shp'),
        kind: 'shape',
        shapeKind,
        x: 34,
        y: 32,
        w: 28,
        h: 28,
        text: shapeKind === 'callout' ? 'Callout note' : '',
        fontSize: 15,
        align: 'center',
        borderWidth: 1.5,
        borderColor: theme.accent,
        borderRadius: 8,
      },
      `Insert ${shapeKind}`,
    )

  const addLine = () =>
    addElement(
      {
        id: uid('ln'),
        kind: 'line',
        x: 14,
        y: 50,
        w: 72,
        h: 2,
        borderWidth: 2,
        borderColor: theme.accent,
      },
      'Insert line',
    )

  const addTable = (rows: number, cols: number) =>
    addElement(
      {
        id: uid('tbl'),
        kind: 'table',
        x: 12,
        y: 26,
        w: 76,
        h: 44,
        tableData: Array.from({ length: rows }).map((_, r) =>
          Array.from({ length: cols }).map((__, c) =>
            r === 0 ? `Header ${c + 1}` : '—',
          ),
        ),
      },
      `Insert ${rows}×${cols} table`,
    )

  const addChart = () =>
    addElement(
      {
        id: uid('cht'),
        kind: 'chart',
        x: 14,
        y: 24,
        w: 72,
        h: 50,
        chartData: [
          { label: 'Run A', value: 42 },
          { label: 'Run B', value: 68 },
          { label: 'Run C', value: 89, highlight: true },
        ],
      },
      'Insert chart',
    )

  const addImage = () =>
    addElement(
      {
        id: uid('img'),
        kind: 'image',
        x: 24,
        y: 22,
        w: 52,
        h: 48,
        text: 'Research figure',
      },
      'Insert image',
    )

  const newSlide = useCallback(
    (afterId?: string, layout: SlideLayoutKind = 'title-body') => {
      if (readOnly) return
      const created = createSlideFromLayout(
        layout,
        `Slide ${deck.slides.length + 1}`,
      )
      const idx = afterId
        ? deck.slides.findIndex((s) => s.id === afterId)
        : deck.slides.length - 1
      const insertAt = idx >= 0 ? idx + 1 : deck.slides.length
      const nextSlides = [
        ...deck.slides.slice(0, insertAt),
        created,
        ...deck.slides.slice(insertAt),
      ]
      setSelectedElId(null)
      commitDeck(
        { ...deck, slides: nextSlides, activeSlideId: created.id },
        'New slide',
      )
    },
    [commitDeck, deck, readOnly],
  )

  const duplicateSlide = (id: string) => {
    if (readOnly) return
    const idx = deck.slides.findIndex((s) => s.id === id)
    if (idx < 0) return
    const copy = structuredClone(deck.slides[idx])
    copy.id = uid('slide')
    copy.title = `${copy.title} (copy)`
    copy.elements = copy.elements.map((e) => ({ ...e, id: uid('el') }))
    const nextSlides = [
      ...deck.slides.slice(0, idx + 1),
      copy,
      ...deck.slides.slice(idx + 1),
    ]
    commitDeck(
      { ...deck, slides: nextSlides, activeSlideId: copy.id },
      'Duplicate slide',
    )
  }

  const deleteSlide = (id: string) => {
    if (readOnly || deck.slides.length <= 1) return
    const idx = deck.slides.findIndex((s) => s.id === id)
    const nextSlides = deck.slides.filter((s) => s.id !== id)
    const nextActive =
      deck.activeSlideId === id
        ? (nextSlides[Math.max(0, idx - 1)]?.id ?? nextSlides[0].id)
        : deck.activeSlideId
    setSelectedElId(null)
    commitDeck(
      { ...deck, slides: nextSlides, activeSlideId: nextActive },
      'Delete slide',
    )
  }

  const moveSlide = (id: string, delta: -1 | 1) => {
    if (readOnly) return
    const idx = deck.slides.findIndex((s) => s.id === id)
    const target = idx + delta
    if (idx < 0 || target < 0 || target >= deck.slides.length) return
    const nextSlides = deck.slides.slice()
    const [moved] = nextSlides.splice(idx, 1)
    nextSlides.splice(target, 0, moved)
    commitDeck({ ...deck, slides: nextSlides }, 'Reorder slide')
  }

  const applyLayoutToSlide = (id: string, layout: SlideLayoutKind) => {
    if (readOnly) return
    const nextSlides = deck.slides.map((s) =>
      s.id === id
        ? { ...s, layout, elements: createElementsForLayout(layout, s.title) }
        : s,
    )
    setSelectedElId(null)
    commitDeck({ ...deck, slides: nextSlides }, `Apply layout ${layout}`)
  }

  const orderElement = (id: string, dir: 'front' | 'back') => {
    if (readOnly) return
    updateActiveSlide((s) => {
      const target = s.elements.find((e) => e.id === id)
      if (!target) return s
      const rest = s.elements.filter((e) => e.id !== id)
      return {
        ...s,
        elements: dir === 'front' ? [...rest, target] : [target, ...rest],
      }
    }, `Send element to ${dir}`)
  }

  // Keyboard shortcuts (Delete, Duplicate, Arrow nudge, Undo/Redo, New Slide)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (presentState.open) return
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      if (typing) return

      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (meta && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        redo()
      } else if (meta && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        newSlide(activeSlide.id)
      } else if (meta && e.key.toLowerCase() === 'd' && selectedEl) {
        e.preventDefault()
        addElement(
          {
            ...structuredClone(selectedEl),
            id: uid('el'),
            x: Math.min(85, selectedEl.x + 3),
            y: Math.min(85, selectedEl.y + 3),
          },
          'Duplicate element',
        )
      } else if (
        (e.key === 'Backspace' || e.key === 'Delete') &&
        selectedEl &&
        !readOnly
      ) {
        e.preventDefault()
        deleteElement(selectedEl.id)
      } else if (
        selectedEl &&
        !readOnly &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
      ) {
        e.preventDefault()
        const step = e.shiftKey ? 5 : 1
        const dx =
          e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy =
          e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        updateElement(selectedEl.id, {
          x: Math.max(0, Math.min(96 - selectedEl.w, selectedEl.x + dx)),
          y: Math.max(0, Math.min(96 - selectedEl.h, selectedEl.y + dy)),
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const exportNotes = () => {
    const md = deck.slides
      .map(
        (s, i) =>
          `## Slide ${i + 1}: ${s.title}\n\n${s.speakerNotes || '(No speaker notes)'}`,
      )
      .join('\n\n---\n\n')
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${deck.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'deck'}-notes.md`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Exported speaker notes (.md)')
  }

  const menus: MenuBarGroup[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        {
          id: 'f-new',
          label: 'New blank slide',
          icon: <Plus className="h-3.5 w-3.5" />,
          shortcut: '⌘M',
          disabled: readOnly,
          onSelect: () => newSlide(activeSlide.id, 'blank'),
        },
        {
          id: 'f-export-html',
          label: 'Download HTML deck (.html)',
          icon: <Download className="h-3.5 w-3.5" />,
          onSelect: () => {
            const blob = new Blob([serializeSlidesToMarbleSource(deck)], {
              type: 'text/html;charset=utf-8',
            })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${deck.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'deck'}.html`
            a.click()
            URL.revokeObjectURL(url)
            showToast('Exported HTML deck')
          },
        },
        {
          id: 'f-export-notes',
          label: 'Download speaker notes (.md)',
          icon: <Download className="h-3.5 w-3.5" />,
          onSelect: exportNotes,
        },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        {
          id: 'e-undo',
          label: 'Undo',
          icon: <Undo2 className="h-3.5 w-3.5" />,
          shortcut: '⌘Z',
          disabled: readOnly,
          onSelect: undo,
        },
        {
          id: 'e-redo',
          label: 'Redo',
          icon: <Redo2 className="h-3.5 w-3.5" />,
          shortcut: '⌘⇧Z',
          disabled: readOnly,
          onSelect: redo,
        },
        { id: 'e-sep', label: '', divider: true },
        {
          id: 'e-dup',
          label: 'Duplicate selected',
          icon: <Copy className="h-3.5 w-3.5" />,
          shortcut: '⌘D',
          disabled: readOnly || !selectedEl,
          onSelect: () =>
            selectedEl &&
            addElement(
              {
                ...structuredClone(selectedEl),
                id: uid('el'),
                x: Math.min(85, selectedEl.x + 3),
                y: Math.min(85, selectedEl.y + 3),
              },
              'Duplicate element',
            ),
        },
        {
          id: 'e-del',
          label: 'Delete selected',
          icon: <Trash2 className="h-3.5 w-3.5" />,
          danger: true,
          disabled: readOnly || !selectedEl,
          onSelect: () => selectedEl && deleteElement(selectedEl.id),
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'v-present',
          label: 'Slideshow',
          icon: <Play className="h-3.5 w-3.5" />,
          onSelect: () =>
            setPresentState({
              open: true,
              startIndex: activeSlideIndex,
              presenter: false,
            }),
        },
        {
          id: 'v-presenter',
          label: 'Presenter view',
          onSelect: () =>
            setPresentState({
              open: true,
              startIndex: activeSlideIndex,
              presenter: true,
            }),
        },
        { id: 'v-sep', label: '', divider: true },
        {
          id: 'v-grid-view',
          label: 'Grid view',
          checked: gridView,
          onSelect: () => setGridView((v) => !v),
        },
        {
          id: 'v-notes',
          label: 'Show speaker notes',
          checked: showNotes,
          onSelect: () => setShowNotes((v) => !v),
        },
        {
          id: 'v-guides',
          label: 'Show snap grid',
          checked: showGrid,
          onSelect: () => setShowGrid((v) => !v),
        },
      ],
    },
    {
      id: 'insert',
      label: 'Insert',
      items: [
        {
          id: 'i-txt',
          label: 'Text box',
          icon: <Type className="h-3.5 w-3.5" />,
          disabled: readOnly,
          onSelect: addTextBox,
        },
        {
          id: 'i-img',
          label: 'Image placeholder',
          icon: <Image className="h-3.5 w-3.5" />,
          disabled: readOnly,
          onSelect: addImage,
        },
        {
          id: 'i-rect',
          label: 'Rounded shape',
          icon: <Square className="h-3.5 w-3.5" />,
          disabled: readOnly,
          onSelect: () => addShape('rounded'),
        },
        {
          id: 'i-line',
          label: 'Line divider',
          icon: <Minus className="h-3.5 w-3.5" />,
          disabled: readOnly,
          onSelect: addLine,
        },
        {
          id: 'i-tbl',
          label: 'Table (3 × 3)',
          icon: <Table2 className="h-3.5 w-3.5" />,
          disabled: readOnly,
          onSelect: () => addTable(3, 3),
        },
        {
          id: 'i-cht',
          label: 'Bar chart',
          icon: <BarChart3 className="h-3.5 w-3.5" />,
          disabled: readOnly,
          onSelect: addChart,
        },
      ],
    },
    {
      id: 'slide',
      label: 'Slide',
      items: [
        {
          id: 'sl-new',
          label: 'New slide',
          icon: <Plus className="h-3.5 w-3.5" />,
          shortcut: '⌘M',
          disabled: readOnly,
          onSelect: () => newSlide(activeSlide.id),
        },
        {
          id: 'sl-dup',
          label: 'Duplicate slide',
          icon: <Copy className="h-3.5 w-3.5" />,
          disabled: readOnly,
          onSelect: () => duplicateSlide(activeSlide.id),
        },
        {
          id: 'sl-skip',
          label: activeSlide.skipped ? 'Unskip slide' : 'Skip slide',
          icon: <EyeOff className="h-3.5 w-3.5" />,
          disabled: readOnly,
          onSelect: () =>
            updateActiveSlide(
              (s) => ({ ...s, skipped: !s.skipped }),
              'Skip slide',
            ),
        },
        { id: 'sl-sep', label: '', divider: true },
        {
          id: 'sl-bg',
          label: 'Change background…',
          icon: <PaintBucket className="h-3.5 w-3.5" />,
          onSelect: () => setInspector('background'),
        },
        {
          id: 'sl-lay',
          label: 'Apply layout…',
          icon: <LayoutGrid className="h-3.5 w-3.5" />,
          onSelect: () => setInspector('layout'),
        },
        {
          id: 'sl-trans',
          label: 'Transition…',
          icon: <Sparkles className="h-3.5 w-3.5" />,
          onSelect: () => setInspector('transition'),
        },
        {
          id: 'sl-theme',
          label: 'Change theme…',
          icon: <Palette className="h-3.5 w-3.5" />,
          onSelect: () => setInspector('theme'),
        },
      ],
    },
    {
      id: 'arrange',
      label: 'Arrange',
      items: [
        {
          id: 'ar-front',
          label: 'Bring to front',
          disabled: readOnly || !selectedEl,
          onSelect: () => selectedEl && orderElement(selectedEl.id, 'front'),
        },
        {
          id: 'ar-back',
          label: 'Send to back',
          disabled: readOnly || !selectedEl,
          onSelect: () => selectedEl && orderElement(selectedEl.id, 'back'),
        },
        { id: 'ar-sep', label: '', divider: true },
        {
          id: 'ar-ch',
          label: 'Center horizontally',
          disabled: readOnly || !selectedEl,
          onSelect: () =>
            selectedEl &&
            updateElement(selectedEl.id, {
              x: Math.round((100 - selectedEl.w) / 2),
            }),
        },
        {
          id: 'ar-cv',
          label: 'Center vertically',
          disabled: readOnly || !selectedEl,
          onSelect: () =>
            selectedEl &&
            updateElement(selectedEl.id, {
              y: Math.round((100 - selectedEl.h) / 2),
            }),
        },
      ],
    },
  ]

  return (
    <div
      data-component="slides-app"
      data-marble-id="deck"
      className={cn(
        'relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--xd-canvas)] text-[var(--xd-ink)]',
        className,
      )}
    >
      {/* Google Slides Top Header: Title + Menu Bar + Slideshow Button */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--xd-border)] bg-[var(--xd-canvas)] px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--xd-sketch)]/40 bg-[var(--xd-sketch-soft)] text-[var(--xd-sketch)]">
            <Presentation className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={deck.title}
                readOnly={readOnly}
                aria-label="Presentation title"
                onChange={(e) =>
                  commitDeck({ ...deck, title: e.target.value }, 'Rename deck')
                }
                className="min-w-[140px] rounded px-1 py-0.5 text-[14px] font-medium tracking-tight text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)] focus:bg-[var(--xd-rail)] focus:outline-none"
              />
              <button
                type="button"
                aria-label={deck.starred ? 'Remove star' : 'Star deck'}
                aria-pressed={deck.starred}
                onClick={() =>
                  commitDeck({ ...deck, starred: !deck.starred }, 'Toggle star')
                }
                className={cn(
                  'inline-flex h-6 w-6 items-center justify-center rounded transition-colors',
                  deck.starred
                    ? 'text-[var(--xd-sketch)]'
                    : 'text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)]',
                )}
              >
                <Star
                  className={cn('h-3.5 w-3.5', deck.starred && 'fill-current')}
                />
              </button>
            </div>
            <AppMenuBar menus={menus} className="-ml-1 mt-0.5" />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              setPresentState({
                open: true,
                startIndex: activeSlideIndex,
                presenter: true,
              })
            }
            className="inline-flex h-7 items-center gap-1.5 rounded border border-[var(--xd-border)] px-2.5 text-[12px] font-medium text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
          >
            <span>Presenter view</span>
          </button>
          <button
            type="button"
            onClick={() =>
              setPresentState({
                open: true,
                startIndex: activeSlideIndex,
                presenter: false,
              })
            }
            className="inline-flex h-7 items-center gap-1.5 rounded bg-[var(--xd-accent)] px-3 text-[12px] font-medium text-white hover:bg-[var(--xd-accent-hover)]"
          >
            <Play className="h-3 w-3 fill-current" />
            <span>Slideshow</span>
          </button>
        </div>
      </header>

      {/* Google Slides Formatting & Insert Toolbar */}
      <div
        role="toolbar"
        aria-label="Slide tools"
        className="flex flex-wrap items-center gap-0.5 border-b border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-1 select-none"
      >
        <ToolbarButton
          title="New slide (⌘M)"
          disabled={readOnly}
          onClick={() => newSlide(activeSlide.id)}
        >
          <Plus className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Undo (⌘Z)" disabled={readOnly} onClick={undo}>
          <Undo2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Redo (⌘⇧Z)" disabled={readOnly} onClick={redo}>
          <Redo2 className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarDropdown
          title="Zoom"
          trigger={
            <span className="xd-tabular text-[11.5px]">
              {zoom === 'fit' ? 'Fit' : `${zoom}%`}
            </span>
          }
          panelClassName="w-24"
        >
          {(close) => (
            <div className="space-y-0.5">
              {(['fit', 50, 75, 100, 125] as const).map((z) => (
                <button
                  key={String(z)}
                  type="button"
                  onClick={() => {
                    setZoom(z)
                    close()
                  }}
                  className={cn(
                    'xd-tabular flex w-full rounded-xs px-2 py-1 text-left text-[12px] hover:bg-[var(--xd-surface-hover)]',
                    zoom === z &&
                      'bg-[var(--xd-accent-soft)] font-medium text-[var(--xd-accent)]',
                  )}
                >
                  {z === 'fit' ? 'Fit' : `${z}%`}
                </button>
              ))}
            </div>
          )}
        </ToolbarDropdown>

        <ToolbarDivider />

        <ToolbarButton
          title="Select"
          active={!selectedEl}
          onClick={() => setSelectedElId(null)}
        >
          <MousePointer2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Insert text box"
          disabled={readOnly}
          onClick={addTextBox}
        >
          <Type className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Insert image"
          disabled={readOnly}
          onClick={addImage}
        >
          <Image className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarDropdown
          title="Insert shape"
          disabled={readOnly}
          trigger={<Shapes className="h-3.5 w-3.5" />}
          panelClassName="w-40"
        >
          {(close) => (
            <div className="space-y-0.5">
              {(
                [
                  {
                    id: 'rect',
                    label: 'Rectangle',
                    icon: <Square className="h-3.5 w-3.5" />,
                  },
                  {
                    id: 'rounded',
                    label: 'Rounded card',
                    icon: <Square className="h-3.5 w-3.5" />,
                  },
                  {
                    id: 'ellipse',
                    label: 'Circle / Oval',
                    icon: <Circle className="h-3.5 w-3.5" />,
                  },
                  {
                    id: 'diamond',
                    label: 'Diamond',
                    icon: <Diamond className="h-3.5 w-3.5" />,
                  },
                  {
                    id: 'arrow',
                    label: 'Arrow',
                    icon: <Play className="h-3.5 w-3.5" />,
                  },
                  {
                    id: 'callout',
                    label: 'Callout box',
                    icon: <Square className="h-3.5 w-3.5" />,
                  },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    addShape(s.id)
                    close()
                  }}
                  className="flex w-full items-center gap-2 rounded-xs px-2 py-1 text-left text-[12px] hover:bg-[var(--xd-surface-hover)]"
                >
                  {s.icon}
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          )}
        </ToolbarDropdown>
        <ToolbarButton
          title="Insert line"
          disabled={readOnly}
          onClick={addLine}
        >
          <Minus className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarDropdown
          title="Insert table"
          disabled={readOnly}
          trigger={<Table2 className="h-3.5 w-3.5" />}
        >
          {(close) => (
            <TableGridPicker
              onSelect={(r, c) => {
                addTable(r, c)
                close()
              }}
            />
          )}
        </ToolbarDropdown>
        <ToolbarButton
          title="Insert chart"
          disabled={readOnly}
          onClick={addChart}
        >
          <BarChart3 className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Contextual selected-element styling controls */}
        {selectedEl ? (
          <>
            <ColorPalettePopover
              title="Fill color"
              value={selectedEl.fill || theme.card}
              disabled={readOnly}
              onChange={(color) =>
                updateElement(selectedEl.id, {
                  fill: color === 'transparent' ? 'transparent' : color,
                })
              }
              icon={<PaintBucket className="h-3.5 w-3.5" />}
            />
            <ColorPalettePopover
              title="Text color"
              value={selectedEl.color || theme.ink}
              disabled={readOnly}
              onChange={(color) =>
                updateElement(selectedEl.id, {
                  color: color === 'transparent' ? undefined : color,
                })
              }
              icon={<Type className="h-3.5 w-3.5" />}
            />
            <FontSizeControl
              value={selectedEl.fontSize ?? 18}
              min={10}
              max={96}
              disabled={readOnly}
              onChange={(size) =>
                updateElement(selectedEl.id, { fontSize: size })
              }
            />
            <ToolbarButton
              title="Bold"
              active={selectedEl.fontWeight === 'bold'}
              disabled={readOnly}
              onClick={() =>
                updateElement(selectedEl.id, {
                  fontWeight:
                    selectedEl.fontWeight === 'bold' ? 'normal' : 'bold',
                })
              }
            >
              <Bold className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title="Italic"
              active={Boolean(selectedEl.italic)}
              disabled={readOnly}
              onClick={() =>
                updateElement(selectedEl.id, { italic: !selectedEl.italic })
              }
            >
              <Italic className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title="Underline"
              active={Boolean(selectedEl.underline)}
              disabled={readOnly}
              onClick={() =>
                updateElement(selectedEl.id, {
                  underline: !selectedEl.underline,
                })
              }
            >
              <Underline className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title="Align left"
              active={(selectedEl.align ?? 'left') === 'left'}
              disabled={readOnly}
              onClick={() => updateElement(selectedEl.id, { align: 'left' })}
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title="Align center"
              active={selectedEl.align === 'center'}
              disabled={readOnly}
              onClick={() => updateElement(selectedEl.id, { align: 'center' })}
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title="Align right"
              active={selectedEl.align === 'right'}
              disabled={readOnly}
              onClick={() => updateElement(selectedEl.id, { align: 'right' })}
            >
              <AlignRight className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title="Format options"
              active={inspector === 'format'}
              onClick={() =>
                setInspector((t) => (t === 'format' ? 'none' : 'format'))
              }
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="text-[11.5px]">Format</span>
            </ToolbarButton>
          </>
        ) : (
          /* Slide-level quick triggers (Google Slides signature buttons) */
          <>
            <ToolbarButton
              title="Background"
              active={inspector === 'background'}
              onClick={() =>
                setInspector((t) =>
                  t === 'background' ? 'none' : 'background',
                )
              }
            >
              <span>Background</span>
            </ToolbarButton>
            <ToolbarButton
              title="Layout"
              active={inspector === 'layout'}
              onClick={() =>
                setInspector((t) => (t === 'layout' ? 'none' : 'layout'))
              }
            >
              <span>Layout</span>
            </ToolbarButton>
            <ToolbarButton
              title="Theme"
              active={inspector === 'theme'}
              onClick={() =>
                setInspector((t) => (t === 'theme' ? 'none' : 'theme'))
              }
            >
              <span>Theme</span>
            </ToolbarButton>
            <ToolbarButton
              title="Transition"
              active={inspector === 'transition'}
              onClick={() =>
                setInspector((t) =>
                  t === 'transition' ? 'none' : 'transition',
                )
              }
            >
              <span>Transition</span>
            </ToolbarButton>
          </>
        )}
      </div>

      {/* Main Slides Workspace: Filmstrip / Grid + 16:9 Stage + Speaker Notes + Inspector */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {!gridView && (
          <SlidesFilmstrip
            slides={deck.slides}
            activeSlideId={activeSlide.id}
            theme={theme}
            readOnly={readOnly}
            onSelectSlide={(id) => {
              setSelectedElId(null)
              setDeck((d) => ({ ...d, activeSlideId: id }))
            }}
            onNewSlide={(afterId) => newSlide(afterId)}
            onDuplicateSlide={duplicateSlide}
            onDeleteSlide={deleteSlide}
            onToggleSkip={(id) => {
              const nextSlides = deck.slides.map((s) =>
                s.id === id ? { ...s, skipped: !s.skipped } : s,
              )
              commitDeck({ ...deck, slides: nextSlides }, 'Toggle skip slide')
            }}
            onMoveSlide={moveSlide}
            onApplyLayout={applyLayoutToSlide}
          />
        )}

        {/* Center Stage or Slide Sorter Grid */}
        <div
          data-marble-id="slide-stage"
          className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--xd-elevated)]"
        >
          {gridView ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {deck.slides.map((slide, idx) => {
                  const active = slide.id === activeSlide.id
                  return (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => {
                        setDeck((d) => ({ ...d, activeSlideId: slide.id }))
                        setGridView(false)
                      }}
                      className={cn(
                        'flex flex-col rounded-md border p-2 text-left transition-colors',
                        active
                          ? 'border-[var(--xd-accent)] bg-[var(--xd-accent-soft)]'
                          : 'border-[var(--xd-border)] bg-[var(--xd-canvas)] hover:border-[var(--xd-border-strong)]',
                      )}
                    >
                      <div className="relative aspect-video w-full overflow-hidden rounded border border-[var(--xd-border)]">
                        <div
                          className="pointer-events-none origin-top-left"
                          style={{
                            width: 960,
                            height: 540,
                            transform: 'scale(0.28)',
                          }}
                        >
                          <SlideCanvas slide={slide} theme={theme} />
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11.5px]">
                        <span className="truncate font-medium">
                          {idx + 1}. {slide.title}
                        </span>
                        {slide.skipped && (
                          <span className="text-[10.5px] text-[var(--xd-ink-muted)]">
                            Skipped
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <>
              {/* 16:9 Interactive Canvas Well */}
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
                <div
                  key={`${activeSlide.id}-${animKey}`}
                  style={{
                    width:
                      zoom === 'fit'
                        ? 'min(100%, 880px)'
                        : `${Math.round((880 * zoom) / 100)}px`,
                    animationDuration: `${activeSlide.transitionMs}ms`,
                  }}
                  className={cn(
                    'aspect-video shrink-0 overflow-hidden rounded-[4px] border border-[var(--xd-border-strong)]',
                    animKey > 0 &&
                      activeSlide.transition === 'fade' &&
                      'animate-in fade-in',
                    animKey > 0 &&
                      activeSlide.transition === 'slide-left' &&
                      'animate-in slide-in-from-right-6 fade-in',
                    animKey > 0 &&
                      activeSlide.transition === 'slide-right' &&
                      'animate-in slide-in-from-left-6 fade-in',
                    animKey > 0 &&
                      activeSlide.transition === 'zoom' &&
                      'animate-in zoom-in-95 fade-in',
                  )}
                >
                  <SlideCanvas
                    slide={activeSlide}
                    theme={theme}
                    interactive
                    readOnly={readOnly}
                    showGrid={showGrid}
                    selectedElementId={selectedElId}
                    onSelectElement={(id) => {
                      setSelectedElId(id)
                      if (id && inspector === 'none') {
                        // keep workspace calm; user can click Format anytime
                      }
                    }}
                    onUpdateElement={updateElement}
                  />
                </div>
              </div>

              {/* Bottom Speaker Notes Drawer */}
              {showNotes && (
                <div className="h-24 shrink-0 border-t border-[var(--xd-border)] bg-[var(--xd-canvas)] px-4 py-2">
                  <textarea
                    value={activeSlide.speakerNotes}
                    readOnly={readOnly}
                    aria-label="Speaker notes"
                    placeholder="Click to add speaker notes..."
                    onChange={(e) =>
                      updateActiveSlide(
                        (s) => ({ ...s, speakerNotes: e.target.value }),
                        'Edit speaker notes',
                      )
                    }
                    className="h-full w-full resize-none bg-transparent text-[12.5px] leading-relaxed text-[var(--xd-ink-secondary)] placeholder:text-[var(--xd-ink-muted)] outline-none focus:text-[var(--xd-ink)]"
                  />
                </div>
              )}
            </>
          )}

          {/* Bottom Status Bar with Filmstrip / Grid Switcher */}
          <footer className="flex h-7 shrink-0 items-center justify-between border-t border-[var(--xd-border)] bg-[var(--xd-canvas)] px-3 text-[11px] text-[var(--xd-ink-muted)] select-none">
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] p-0.5">
                <button
                  type="button"
                  title="Filmstrip view"
                  aria-label="Filmstrip view"
                  aria-pressed={!gridView}
                  onClick={() => setGridView(false)}
                  className={cn(
                    'inline-flex h-5 w-5 items-center justify-center rounded-xs',
                    !gridView
                      ? 'bg-[var(--xd-canvas)] text-[var(--xd-ink)]'
                      : 'text-[var(--xd-ink-muted)]',
                  )}
                >
                  <Rows3 className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  title="Grid view"
                  aria-label="Grid view"
                  aria-pressed={gridView}
                  onClick={() => setGridView(true)}
                  className={cn(
                    'inline-flex h-5 w-5 items-center justify-center rounded-xs',
                    gridView
                      ? 'bg-[var(--xd-canvas)] text-[var(--xd-ink)]'
                      : 'text-[var(--xd-ink-muted)]',
                  )}
                >
                  <Grid2x2 className="h-3 w-3" />
                </button>
              </div>
              <span className="xd-tabular">
                Slide {activeSlideIndex + 1} of {deck.slides.length}
              </span>
              <span>·</span>
              <span>{theme.name}</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowNotes((v) => !v)}
                className="hover:text-[var(--xd-ink)]"
              >
                {showNotes ? 'Hide notes' : 'Show notes'}
              </button>
              <span className="xd-tabular">{deck.aspectRatio}</span>
            </div>
          </footer>
        </div>

        <SlidesInspectorPanel
          tab={inspector}
          slide={activeSlide}
          theme={theme}
          selectedElement={selectedEl}
          readOnly={readOnly}
          onClose={() => setInspector('none')}
          onSelectTheme={(themeId) =>
            commitDeck({ ...deck, themeId }, `Change theme to ${themeId}`)
          }
          onApplyLayout={(layout) => applyLayoutToSlide(activeSlide.id, layout)}
          onChangeBackground={(color, applyAll) => {
            const nextSlides = deck.slides.map((s) =>
              applyAll || s.id === activeSlide.id
                ? { ...s, background: color }
                : s,
            )
            commitDeck(
              { ...deck, slides: nextSlides },
              'Change slide background',
            )
          }}
          onChangeTransition={(transition, ms, applyAll) => {
            const nextSlides = deck.slides.map((s) =>
              applyAll || s.id === activeSlide.id
                ? { ...s, transition, transitionMs: ms }
                : s,
            )
            commitDeck({ ...deck, slides: nextSlides }, 'Change transition')
          }}
          onPreviewTransition={() => setAnimKey((k) => k + 1)}
          onUpdateElement={updateElement}
          onOrderElement={orderElement}
          onDeleteElement={deleteElement}
        />
      </div>

      {presentState.open && (
        <SlidesPresentOverlay
          slides={deck.slides}
          startIndex={presentState.startIndex}
          theme={theme}
          presenterMode={presentState.presenter}
          onClose={() => setPresentState((s) => ({ ...s, open: false }))}
        />
      )}

      {toast && (
        <div
          role="status"
          className="pointer-events-none fixed right-5 bottom-9 z-50 rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] px-3 py-1.5 text-[12px] font-medium text-[var(--xd-ink)] shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  )
}
