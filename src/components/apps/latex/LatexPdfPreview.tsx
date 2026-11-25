import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileWarning,
  Loader2,
  Moon,
  RefreshCw,
  Sun,
  Terminal,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { ToolbarButton, ToolbarDropdown } from '#/components/apps/shared'
import { cn } from '#/lib/utils'
import './latex-paper.css'
import type {
  LatexCompileResult,
  LatexCompilerEngine,
  LatexDiagnostic,
  LatexPaperSize,
} from './types'
import { PAPER_DIMENSIONS_PX } from './types'

export interface LatexPdfPreviewHandle {
  getPageElements: () => HTMLElement[]
  scrollToSourceLine: (file: string, line: number) => void
}

export interface LatexPdfPreviewProps {
  result: LatexCompileResult
  compiling: boolean
  exportingPdf: boolean
  autoCompile: boolean
  compiler: LatexCompilerEngine
  availableNativeEngines: LatexCompilerEngine[]
  paperSize: LatexPaperSize
  invertPdf: boolean
  showLogs: boolean
  onRecompile: () => void
  onToggleAutoCompile: () => void
  onChangeCompiler: (engine: LatexCompilerEngine) => void
  onChangePaperSize: (size: LatexPaperSize) => void
  onToggleInvertPdf: () => void
  onToggleLogs: () => void
  onDownloadPdf: () => void
  onJumpToSource: (file: string, line: number) => void
}

const ZOOM_PRESETS = [
  { value: 'fit', label: 'Fit width' },
  { value: 0.75, label: '75%' },
  { value: 0.9, label: '90%' },
  { value: 1.0, label: '100%' },
  { value: 1.25, label: '125%' },
  { value: 1.5, label: '150%' },
] as const

export const LatexPdfPreview = forwardRef<
  LatexPdfPreviewHandle,
  LatexPdfPreviewProps
>(function LatexPdfPreview(
  {
    result,
    compiling,
    exportingPdf,
    autoCompile,
    compiler,
    availableNativeEngines,
    paperSize,
    invertPdf,
    showLogs,
    onRecompile,
    onToggleAutoCompile,
    onChangeCompiler,
    onChangePaperSize,
    onToggleInvertPdf,
    onToggleLogs,
    onDownloadPdf,
    onJumpToSource,
  },
  ref,
) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const pageRefs = useRef<Array<HTMLDivElement | null>>([])
  const [zoomMode, setZoomMode] = useState<'fit' | number>('fit')
  const [containerWidth, setContainerWidth] = useState(640)
  const [currentPage, setCurrentPage] = useState(1)
  const [logTab, setLogTab] = useState<'diagnostics' | 'raw'>('diagnostics')

  const paperDims = PAPER_DIMENSIONS_PX[result.metadata.paperSize]

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width && width > 120) {
        setContainerWidth(width)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const effectiveZoom = useMemo(() => {
    if (zoomMode === 'fit') {
      const avail = Math.max(260, containerWidth - 48)
      return Math.min(1.15, Math.max(0.45, avail / paperDims.width))
    }
    return zoomMode
  }, [zoomMode, containerWidth, paperDims.width])

  const nativePdfUrl = useMemo(() => {
    if (!result.nativePdfBase64 || typeof window === 'undefined') return null
    try {
      const binary = atob(result.nativePdfBase64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      const blob = new Blob([bytes], { type: 'application/pdf' })
      return URL.createObjectURL(blob)
    } catch {
      return null
    }
  }, [result.nativePdfBase64])

  useEffect(() => {
    return () => {
      if (nativePdfUrl) URL.revokeObjectURL(nativePdfUrl)
    }
  }, [nativePdfUrl])

  useImperativeHandle(ref, () => ({
    getPageElements() {
      return pageRefs.current.filter((el): el is HTMLDivElement => Boolean(el))
    },
    scrollToSourceLine(file: string, line: number) {
      const container = scrollContainerRef.current
      if (!container) return
      const candidates = Array.from(
        container.querySelectorAll<HTMLElement>('[data-synctex-line]'),
      )
      if (candidates.length === 0) return

      // Find closest element in the matching file, or closest overall
      let best: HTMLElement | null = null
      let bestDist = Number.POSITIVE_INFINITY
      for (const el of candidates) {
        const elFile = el.getAttribute('data-synctex-file') ?? ''
        const elLine = Number.parseInt(
          el.getAttribute('data-synctex-line') ?? '0',
          10,
        )
        const filePenalty = elFile === file ? 0 : 10000
        const dist = filePenalty + Math.abs(elLine - line)
        if (dist < bestDist) {
          bestDist = dist
          best = el
        }
      }
      if (best) {
        best.scrollIntoView({ behavior: 'smooth', block: 'center' })
        best.classList.remove('xd-synctex-highlight')
        void best.offsetWidth
        best.classList.add('xd-synctex-highlight')
      }
    },
  }))

  const errorCount = result.diagnostics.filter(
    (d) => d.severity === 'error',
  ).length
  const warningCount = result.diagnostics.filter(
    (d) => d.severity === 'warning',
  ).length

  const goToPage = (targetPage: number) => {
    const clamped = Math.max(1, Math.min(result.pageCount || 1, targetPage))
    setCurrentPage(clamped)
    const node = pageRefs.current[clamped - 1]
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleScroll = () => {
    const container = scrollContainerRef.current
    if (!container) return
    const containerTop = container.getBoundingClientRect().top
    let closest = 1
    let minDelta = Number.POSITIVE_INFINITY
    pageRefs.current.forEach((el, idx) => {
      if (!el) return
      const delta = Math.abs(el.getBoundingClientRect().top - containerTop - 24)
      if (delta < minDelta) {
        minDelta = delta
        closest = idx + 1
      }
    })
    setCurrentPage(closest)
  }

  const handlePaperDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null
    const synctexEl = target?.closest<HTMLElement>('[data-synctex-line]')
    if (!synctexEl) return
    const file = synctexEl.getAttribute('data-synctex-file')
    const lineStr = synctexEl.getAttribute('data-synctex-line')
    if (file && lineStr) {
      const line = Number.parseInt(lineStr, 10)
      if (Number.isFinite(line)) {
        onJumpToSource(file, line)
      }
    }
  }

  const handlePaperClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null
    const anchor = target?.closest<HTMLAnchorElement>('a[href^="#tex-"]')
    if (!anchor) return
    e.preventDefault()
    const id = anchor.getAttribute('href')?.slice(1)
    if (!id) return
    const dest = scrollContainerRef.current?.querySelector<HTMLElement>(
      `#${CSS.escape(id)}`,
    )
    if (dest) {
      dest.scrollIntoView({ behavior: 'smooth', block: 'center' })
      dest.classList.remove('xd-synctex-highlight')
      void dest.offsetWidth
      dest.classList.add('xd-synctex-highlight')
    }
  }

  return (
    <div
      data-marble-id="latex-pdf-preview"
      className="flex h-full min-h-0 flex-1 flex-col bg-[var(--xd-rail)]"
    >
      {/* Overleaf-Style PDF Viewer Header Toolbar */}
      <div className="relative z-30 flex h-9 shrink-0 items-center justify-between gap-2 border-b border-[var(--xd-border)] bg-[var(--xd-rail)] px-2.5 text-[12px]">
        <div className="flex items-center gap-1.5">
          {/* Split Recompile Button + Settings Dropdown.
              The menu is position:absolute, so this group must not clip it. */}
          <div className="inline-flex h-7 items-center rounded bg-[var(--xd-accent)] text-white">
            <button
              type="button"
              onClick={onRecompile}
              disabled={compiling}
              title="Recompile LaTeX document (⌘S / ⌘↵)"
              className="inline-flex h-full items-center gap-1.5 rounded-l px-2.5 text-[12px] font-medium transition-colors hover:bg-[var(--xd-accent-hover)] disabled:opacity-70"
            >
              {compiling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span>Recompile</span>
            </button>
            <span className="h-4 w-px bg-white/25" />
            <ToolbarDropdown
              title="Compiler & auto-compile settings"
              panelClassName="w-64 p-2"
              trigger={
                <span className="inline-flex h-7 items-center px-0.5 text-white">
                  <ChevronDown className="h-3 w-3 text-white" />
                </span>
              }
              className="[&>button]:h-7 [&>button]:rounded-none [&>button]:rounded-r [&>button]:px-1.5 [&>button]:text-white [&>button:hover]:bg-[var(--xd-accent-hover)] [&>button[aria-expanded=true]]:bg-[var(--xd-accent-hover)] [&>button>svg:last-child]:hidden"
            >
              {(close) => (
                <div
                  data-marble-id="latex-compiler-menu"
                  className="space-y-2.5 text-[12px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[var(--xd-ink)]">
                      Auto-compile
                    </span>
                    <button
                      type="button"
                      onClick={() => onToggleAutoCompile()}
                      className={cn(
                        'rounded border px-2 py-0.5 text-[11px] font-medium transition-colors',
                        autoCompile
                          ? 'border-[var(--xd-commit)]/40 bg-[var(--xd-commit-soft)] text-[var(--xd-commit)]'
                          : 'border-[var(--xd-border)] bg-[var(--xd-canvas)] text-[var(--xd-ink-muted)]',
                      )}
                    >
                      {autoCompile ? 'On' : 'Off'}
                    </button>
                  </div>

                  <div className="border-t border-[var(--xd-border)] pt-2">
                    <div className="mb-1 text-[11px] font-medium text-[var(--xd-ink-muted)]">
                      Compiler engine
                    </div>
                    <div className="space-y-1">
                      {(
                        [
                          {
                            id: 'xdrive-tex',
                            label: 'xDrive TeX (Built-in pdfLaTeX)',
                            available: true,
                          },
                          {
                            id: 'pdflatex',
                            label: 'Native pdfLaTeX (Host)',
                            available: availableNativeEngines.includes('pdflatex'),
                          },
                          {
                            id: 'xelatex',
                            label: 'Native XeLaTeX (Host)',
                            available: availableNativeEngines.includes('xelatex'),
                          },
                          {
                            id: 'lualatex',
                            label: 'Native LuaLaTeX (Host)',
                            available: availableNativeEngines.includes('lualatex'),
                          },
                        ] as const
                      ).map((eng) => (
                        <button
                          key={eng.id}
                          type="button"
                          disabled={!eng.available}
                          onClick={() => {
                            onChangeCompiler(eng.id)
                            close()
                          }}
                          className={cn(
                            'flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11.5px] transition-colors disabled:opacity-45',
                            compiler === eng.id
                              ? 'bg-[var(--xd-accent-soft)] font-medium text-[var(--xd-accent)]'
                              : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                          )}
                        >
                          <span>{eng.label}</span>
                          {!eng.available && (
                            <span className="text-[10px] text-[var(--xd-ink-muted)]">
                              not installed
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-[var(--xd-border)] pt-2">
                    <div className="mb-1 text-[11px] font-medium text-[var(--xd-ink-muted)]">
                      Paper size
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {(['letter', 'a4'] as const).map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => {
                            onChangePaperSize(sz)
                            close()
                          }}
                          className={cn(
                            'rounded border px-2 py-1 text-[11.5px] transition-colors',
                            paperSize === sz
                              ? 'border-[var(--xd-accent)] bg-[var(--xd-accent-soft)] font-medium text-[var(--xd-accent)]'
                              : 'border-[var(--xd-border)] bg-[var(--xd-canvas)] text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]',
                          )}
                        >
                          {sz === 'letter' ? 'US Letter' : 'A4'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </ToolbarDropdown>
          </div>

          {/* Logs & Diagnostics Toggle */}
          <button
            type="button"
            onClick={onToggleLogs}
            title="View compiler logs, errors, and warnings"
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded border px-2 text-[11.5px] font-medium transition-colors',
              showLogs
                ? 'border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]'
                : errorCount > 0
                  ? 'border-[var(--xd-danger)]/40 bg-[var(--xd-danger-soft)] text-[var(--xd-danger)]'
                  : warningCount > 0
                    ? 'border-[var(--xd-sketch)]/40 bg-[var(--xd-sketch-soft)] text-[var(--xd-sketch)]'
                    : 'border-[var(--xd-border)] bg-[var(--xd-canvas)] text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]',
            )}
          >
            {errorCount > 0 ? (
              <AlertCircle className="h-3.5 w-3.5" />
            ) : warningCount > 0 ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : (
              <FileWarning className="h-3.5 w-3.5" />
            )}
            <span>Logs</span>
            {(errorCount > 0 || warningCount > 0) && (
              <span className="xd-tabular font-semibold">
                {errorCount > 0 ? errorCount : warningCount}
              </span>
            )}
          </button>
        </div>

        {/* Page Navigation & Zoom Controls */}
        <div className="flex items-center gap-1">
          {!nativePdfUrl && (
            <>
              <div className="hidden items-center gap-0.5 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-1 sm:inline-flex">
                <button
                  type="button"
                  aria-label="Previous PDF page"
                  disabled={currentPage <= 1}
                  onClick={() => goToPage(currentPage - 1)}
                  className="inline-flex h-6 w-5 items-center justify-center text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)] disabled:opacity-35"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <span className="xd-tabular px-1 text-[11px] text-[var(--xd-ink-secondary)]">
                  {currentPage} / {Math.max(1, result.pageCount)}
                </span>
                <button
                  type="button"
                  aria-label="Next PDF page"
                  disabled={currentPage >= result.pageCount}
                  onClick={() => goToPage(currentPage + 1)}
                  className="inline-flex h-6 w-5 items-center justify-center text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)] disabled:opacity-35"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>

              <ToolbarButton
                title="Zoom out PDF"
                onClick={() =>
                  setZoomMode(
                    Math.max(0.5, Number((effectiveZoom - 0.1).toFixed(2))),
                  )
                }
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </ToolbarButton>

              <ToolbarDropdown
                title="PDF zoom level"
                align="right"
                panelClassName="w-28"
                trigger={
                  <span className="xd-tabular text-[11.5px]">
                    {zoomMode === 'fit'
                      ? `${Math.round(effectiveZoom * 100)}%`
                      : `${Math.round(zoomMode * 100)}%`}
                  </span>
                }
              >
                {(close) => (
                  <div className="space-y-0.5">
                    {ZOOM_PRESETS.map((preset) => (
                      <button
                        key={String(preset.value)}
                        type="button"
                        onClick={() => {
                          setZoomMode(preset.value)
                          close()
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11.5px] hover:bg-[var(--xd-surface-hover)]',
                          zoomMode === preset.value &&
                            'bg-[var(--xd-accent-soft)] font-medium text-[var(--xd-accent)]',
                        )}
                      >
                        <span>{preset.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </ToolbarDropdown>

              <ToolbarButton
                title="Zoom in PDF"
                onClick={() =>
                  setZoomMode(
                    Math.min(1.75, Number((effectiveZoom + 0.1).toFixed(2))),
                  )
                }
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </ToolbarButton>

              <ToolbarButton
                title={
                  invertPdf
                    ? 'Use white academic paper'
                    : 'Use dark reading paper'
                }
                active={invertPdf}
                onClick={onToggleInvertPdf}
              >
                {invertPdf ? (
                  <Sun className="h-3.5 w-3.5" />
                ) : (
                  <Moon className="h-3.5 w-3.5" />
                )}
              </ToolbarButton>
            </>
          )}

          <button
            type="button"
            onClick={onDownloadPdf}
            disabled={exportingPdf}
            title="Download compiled PDF (.pdf)"
            aria-label="Download PDF"
            className="inline-flex h-7 items-center gap-1 rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-2 text-[11.5px] font-medium text-[var(--xd-ink)] transition-colors hover:bg-[var(--xd-surface-hover)] disabled:opacity-50"
          >
            {exportingPdf ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span className="hidden md:inline">PDF</span>
          </button>
        </div>
      </div>

      {/* Collapsible Compiler Logs & Diagnostics Panel */}
      {showLogs && (
        <div
          data-marble-id="latex-logs-panel"
          className="flex max-h-56 shrink-0 flex-col border-b border-[var(--xd-border)] bg-[var(--xd-canvas)] text-[12px]"
        >
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-[var(--xd-border)] bg-[var(--xd-rail)] px-2.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setLogTab('diagnostics')}
                className={cn(
                  'rounded px-2 py-0.5 text-[11.5px] font-medium transition-colors',
                  logTab === 'diagnostics'
                    ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                    : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]',
                )}
              >
                Issues ({result.diagnostics.length})
              </button>
              <button
                type="button"
                onClick={() => setLogTab('raw')}
                className={cn(
                  'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11.5px] font-medium transition-colors',
                  logTab === 'raw'
                    ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                    : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]',
                )}
              >
                <Terminal className="h-3 w-3" />
                <span>Raw logs</span>
              </button>
            </div>

            <button
              type="button"
              aria-label="Close logs panel"
              onClick={onToggleLogs}
              className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {logTab === 'diagnostics' ? (
              result.diagnostics.length === 0 ? (
                <div className="flex items-center gap-2 rounded border border-[var(--xd-commit)]/30 bg-[var(--xd-commit-soft)] px-3 py-2 text-[12px] text-[var(--xd-commit)]">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    Compiled cleanly in {result.durationMs} ms — 0 errors, 0
                    warnings.
                  </span>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {result.diagnostics.map((diag: LatexDiagnostic) => {
                    const isError = diag.severity === 'error'
                    return (
                      <li key={diag.id}>
                        <button
                          type="button"
                          onClick={() => onJumpToSource(diag.file, diag.line)}
                          className={cn(
                            'flex w-full items-start gap-2 rounded border px-2.5 py-1.5 text-left transition-colors',
                            isError
                              ? 'border-[var(--xd-danger)]/35 bg-[var(--xd-danger-soft)] hover:border-[var(--xd-danger)]'
                              : 'border-[var(--xd-sketch)]/35 bg-[var(--xd-sketch-soft)] hover:border-[var(--xd-sketch)]',
                          )}
                        >
                          {isError ? (
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--xd-danger)]" />
                          ) : (
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--xd-sketch)]" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[12px] font-medium text-[var(--xd-ink)]">
                                {diag.message}
                              </span>
                              <span className="xd-mono xd-tabular shrink-0 text-[10.5px] text-[var(--xd-ink-muted)]">
                                {diag.file}:{diag.line}
                              </span>
                            </div>
                            {diag.detail && (
                              <div className="xd-mono mt-0.5 truncate text-[11px] text-[var(--xd-ink-secondary)]">
                                {diag.detail}
                              </div>
                            )}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )
            ) : (
              <pre className="xd-mono whitespace-pre-wrap rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] p-2.5 text-[11px] leading-relaxed text-[var(--xd-ink-secondary)]">
                {result.logs.join('\n')}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* PDF Stage */}
      {nativePdfUrl ? (
        <div className="min-h-0 flex-1 bg-[var(--xd-elevated)]">
          <iframe
            title="Compiled native LaTeX PDF preview"
            src={nativePdfUrl}
            className="h-full w-full border-0"
          />
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          onDoubleClick={handlePaperDoubleClick}
          onClick={handlePaperClick}
          className="min-h-0 flex-1 overflow-auto bg-[var(--xd-elevated)] px-5 py-6"
        >
          <div className="mx-auto flex flex-col items-center gap-6">
            {result.pages.map((page, index) => {
              const scaledW = Math.round(paperDims.width * effectiveZoom)
              const scaledH = Math.round(paperDims.height * effectiveZoom)
              return (
                <div
                  key={page.pageNumber}
                  style={{ width: scaledW, height: scaledH }}
                  className="relative shrink-0"
                >
                  <div
                    ref={(el) => {
                      pageRefs.current[index] = el
                    }}
                    data-latex-page={page.pageNumber}
                    style={{
                      width: paperDims.width,
                      height: paperDims.height,
                      transform: `scale(${effectiveZoom})`,
                      transformOrigin: 'top left',
                    }}
                    className={cn(
                      'xd-latex-paper',
                      result.metadata.twoColumn && 'is-twocolumn',
                      invertPdf && 'is-inverted',
                    )}
                  >
                    <div
                      className="xd-latex-paper-body"
                      dangerouslySetInnerHTML={{ __html: page.html }}
                    />
                    <div>
                      {page.footnotes.length > 0 && (
                        <div className="xd-tex-footnotes">
                          {page.footnotes.map((fn) => (
                            <div key={fn.number}>
                              <sup>{fn.number}</sup>{' '}
                              <span
                                dangerouslySetInnerHTML={{ __html: fn.html }}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="xd-tex-page-footer">
                        {page.pageNumber}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
})
