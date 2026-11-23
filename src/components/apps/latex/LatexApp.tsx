import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bold,
  BookOpen,
  Code,
  Columns2,
  Download,
  FileArchive,
  FileCode2,
  FileDown,
  FileText,
  Hash,
  Italic,
  Link2,
  List,
  ListOrdered,
  MessageSquareCode,
  PanelLeft,
  Search,
  Sigma,
  Sparkles,
  Table2,
  WrapText,
} from 'lucide-react'
import {
  AppMenuBar,
  TableGridPicker,
  ToolbarButton,
  ToolbarDivider,
  ToolbarDropdown,
} from '#/components/apps/shared'
import type { MenuBarGroup } from '#/components/apps/shared'
import { cn } from '#/lib/utils'
import {
  compileLatexProject,
  extractLabelsAndOutlinePreview,
} from './compiler'
import {
  compileWithNativeServer,
  downloadFlattenedTex,
  downloadProjectZip,
  downloadTexFile,
  exportCompiledPdf,
  fetchServerLatexCapabilities,
} from './exportUtils'
import { LatexCodeEditor } from './LatexCodeEditor'
import type { LatexCodeEditorHandle } from './LatexCodeEditor'
import { LatexPdfPreview } from './LatexPdfPreview'
import type { LatexPdfPreviewHandle } from './LatexPdfPreview'
import { LatexProjectSidebar } from './LatexProjectSidebar'
import {
  DEFAULT_LATEX_SEED,
  cloneLatexState,
  parseLatexFromMarbleSource,
  serializeLatexToMarbleSource,
} from './serialization'
import type {
  LatexCompileResult,
  LatexCompilerEngine,
  LatexFileKind,
  LatexLayoutMode,
  LatexOutlineItem,
  LatexPaperSize,
  LatexProjectState,
} from './types'

const LATEX_SYMBOL_GROUPS: Array<{
  group: string
  items: Array<{ symbol: string; tex: string; label: string }>
}> = [
  {
    group: 'Greek',
    items: [
      { symbol: 'α', tex: '\\alpha', label: 'alpha' },
      { symbol: 'β', tex: '\\beta', label: 'beta' },
      { symbol: 'γ', tex: '\\gamma', label: 'gamma' },
      { symbol: 'δ', tex: '\\delta', label: 'delta' },
      { symbol: 'ε', tex: '\\varepsilon', label: 'varepsilon' },
      { symbol: 'θ', tex: '\\theta', label: 'theta' },
      { symbol: 'λ', tex: '\\lambda', label: 'lambda' },
      { symbol: 'μ', tex: '\\mu', label: 'mu' },
      { symbol: 'π', tex: '\\pi', label: 'pi' },
      { symbol: 'ρ', tex: '\\rho', label: 'rho' },
      { symbol: 'σ', tex: '\\sigma', label: 'sigma' },
      { symbol: 'φ', tex: '\\varphi', label: 'varphi' },
      { symbol: 'ψ', tex: '\\psi', label: 'psi' },
      { symbol: 'ω', tex: '\\omega', label: 'omega' },
      { symbol: 'Λ', tex: '\\Lambda', label: 'Lambda' },
      { symbol: 'Σ', tex: '\\Sigma', label: 'Sigma' },
      { symbol: 'Ω', tex: '\\Omega', label: 'Omega' },
      { symbol: 'Δ', tex: '\\Delta', label: 'Delta' },
    ],
  },
  {
    group: 'Operators & Relations',
    items: [
      { symbol: '≤', tex: '\\leq', label: 'leq' },
      { symbol: '≥', tex: '\\geq', label: 'geq' },
      { symbol: '≠', tex: '\\neq', label: 'neq' },
      { symbol: '≈', tex: '\\approx', label: 'approx' },
      { symbol: '≡', tex: '\\equiv', label: 'equiv' },
      { symbol: '±', tex: '\\pm', label: 'pm' },
      { symbol: '×', tex: '\\times', label: 'times' },
      { symbol: '⊗', tex: '\\otimes', label: 'otimes' },
      { symbol: '⊕', tex: '\\oplus', label: 'oplus' },
      { symbol: '∑', tex: '\\sum_{i=1}^{n}', label: 'sum' },
      { symbol: '∫', tex: '\\int_{a}^{b}', label: 'int' },
      { symbol: '∂', tex: '\\partial', label: 'partial' },
      { symbol: '∇', tex: '\\nabla', label: 'nabla' },
      { symbol: '∞', tex: '\\infty', label: 'infty' },
      { symbol: '∈', tex: '\\in', label: 'in' },
      { symbol: '∀', tex: '\\forall', label: 'forall' },
      { symbol: '∃', tex: '\\exists', label: 'exists' },
      { symbol: '→', tex: '\\to', label: 'to' },
    ],
  },
]

export interface LatexAppProps {
  marbleSource?: string
  onMarbleSourceChange?: (nextSource: string, label: string) => void
  initialState?: LatexProjectState
  initialLayout?: LatexLayoutMode
  initialShowSidebar?: boolean
  initialShowLogs?: boolean
  readOnly?: boolean
}

export function LatexApp({
  marbleSource,
  onMarbleSourceChange,
  initialState,
  initialLayout = 'split',
  initialShowSidebar = true,
  initialShowLogs = false,
  readOnly = false,
}: LatexAppProps) {
  const [state, setState] = useState<LatexProjectState>(() =>
    initialState
      ? cloneLatexState(initialState)
      : marbleSource
        ? parseLatexFromMarbleSource(marbleSource)
        : cloneLatexState(DEFAULT_LATEX_SEED),
  )
  const [activeFilePath, setActiveFilePath] = useState<string>(
    () => state.mainFile || state.files[0]?.path || 'main.tex',
  )
  const [layout, setLayout] = useState<LatexLayoutMode>(initialLayout)
  const [showSidebar, setShowSidebar] = useState(initialShowSidebar)
  const [showLogs, setShowLogs] = useState(initialShowLogs)
  const [splitRatio, setSplitRatio] = useState(0.49)
  const [cursor, setCursor] = useState({ line: 1, col: 1 })
  const [compiling, setCompiling] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [statusNotice, setStatusNotice] = useState<string | null>(null)
  const [availableNativeEngines, setAvailableNativeEngines] = useState<
    LatexCompilerEngine[]
  >([])

  const [compileResult, setCompileResult] = useState<LatexCompileResult>(() =>
    compileLatexProject(state),
  )

  const editorRef = useRef<LatexCodeEditorHandle | null>(null)
  const pdfRef = useRef<LatexPdfPreviewHandle | null>(null)
  const splitContainerRef = useRef<HTMLDivElement | null>(null)
  const lastMarbleSerializedRef = useRef<string | null>(null)
  const persistTimerRef = useRef<number | null>(null)
  const autoCompileTimerRef = useRef<number | null>(null)
  const pendingJumpRef = useRef<number | null>(null)

  // Detect optional host TeX binaries once
  useEffect(() => {
    let active = true
    void fetchServerLatexCapabilities().then((caps) => {
      if (active) setAvailableNativeEngines(caps.availableEngines)
    })
    return () => {
      active = false
    }
  }, [])

  // Sync external Marble source edits (e.g. from AI collaborator or checkpoints)
  useEffect(() => {
    if (!marbleSource || marbleSource === lastMarbleSerializedRef.current) return
    const parsed = parseLatexFromMarbleSource(marbleSource)
    setState(parsed)
    setCompileResult(compileLatexProject(parsed))
  }, [marbleSource])

  // Notify parent Marble workspace with debounce
  const schedulePersist = useCallback(
    (nextState: LatexProjectState, label: string) => {
      if (!onMarbleSourceChange || readOnly) return
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current)
      persistTimerRef.current = window.setTimeout(() => {
        const serialized = serializeLatexToMarbleSource(nextState)
        lastMarbleSerializedRef.current = serialized
        onMarbleSourceChange(serialized, label)
      }, 360)
    },
    [onMarbleSourceChange, readOnly],
  )

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current)
      if (autoCompileTimerRef.current) {
        window.clearTimeout(autoCompileTimerRef.current)
      }
    }
  }, [])

  const runCompile = useCallback(
    async (targetState: LatexProjectState, explicitEngine?: LatexCompilerEngine) => {
      const engine = explicitEngine ?? targetState.compiler
      setCompiling(true)

      // Always run built-in AST + KaTeX + diagnostics pass for instant outline, labels, and lint squiggles
      const builtIn = compileLatexProject(targetState, engine)

      if (engine !== 'xdrive-tex') {
        const nativeRes = await compileWithNativeServer(targetState, engine)
        if (nativeRes.ok && nativeRes.pdfBase64) {
          setCompileResult({
            ...builtIn,
            ok: true,
            engine,
            durationMs: nativeRes.durationMs ?? builtIn.durationMs,
            nativePdfBase64: nativeRes.pdfBase64,
            logs: nativeRes.log
              ? nativeRes.log.split('\n')
              : builtIn.logs,
          })
          setCompiling(false)
          return
        }
        setStatusNotice(
          nativeRes.error || `${engine} unavailable; fell back to xDrive TeX.`,
        )
      }

      setCompileResult(builtIn)
      setCompiling(false)
    },
    [],
  )

  // Debounced auto-compile on project edits
  useEffect(() => {
    if (!state.autoCompile) return
    if (autoCompileTimerRef.current) {
      window.clearTimeout(autoCompileTimerRef.current)
    }
    autoCompileTimerRef.current = window.setTimeout(() => {
      void runCompile(state)
    }, 240)
    return () => {
      if (autoCompileTimerRef.current) {
        window.clearTimeout(autoCompileTimerRef.current)
      }
    }
  }, [state, runCompile])

  // Clear transient status notice
  useEffect(() => {
    if (!statusNotice) return
    const timer = window.setTimeout(() => setStatusNotice(null), 3500)
    return () => window.clearTimeout(timer)
  }, [statusNotice])

  // Execute pending line jump after switching active file
  useEffect(() => {
    if (pendingJumpRef.current === null) return
    const line = pendingJumpRef.current
    pendingJumpRef.current = null
    const id = window.setTimeout(() => {
      editorRef.current?.jumpToLine(line)
    }, 40)
    return () => window.clearTimeout(id)
  }, [activeFilePath])

  const activeFile = useMemo(
    () =>
      state.files.find((f) => f.path === activeFilePath) ?? state.files.at(0),
    [state.files, activeFilePath],
  )

  const autocompleteData = useMemo(() => {
    const { labels, bibEntries } = extractLabelsAndOutlinePreview(state.files)
    // Enrich labels with compiled numbers when available
    const mergedLabels = labels.map((lbl) => {
      const compiled = Object.prototype.hasOwnProperty.call(
        compileResult.labels,
        lbl.key,
      )
        ? compileResult.labels[lbl.key]
        : undefined
      return compiled ? { ...lbl, number: compiled.number } : lbl
    })
    return {
      labels: mergedLabels,
      bibEntries,
      files: state.files,
    }
  }, [state.files, compileResult.labels])

  const updateState = useCallback(
    (
      updater: (prev: LatexProjectState) => LatexProjectState,
      label: string,
    ) => {
      setState((prev) => {
        const next = updater(prev)
        schedulePersist(next, label)
        return next
      })
    },
    [schedulePersist],
  )

  const handleFileContentChange = useCallback(
    (nextContent: string) => {
      if (!activeFile || readOnly) return
      updateState(
        (prev) => ({
          ...prev,
          files: prev.files.map((f) =>
            f.path === activeFile.path ? { ...f, content: nextContent } : f,
          ),
        }),
        `Edited ${activeFile.path}`,
      )
    },
    [activeFile, readOnly, updateState],
  )

  const handleCreateFile = useCallback(
    (path: string, kind: LatexFileKind) => {
      if (readOnly) return
      if (state.files.some((f) => f.path === path)) {
        setActiveFilePath(path)
        return
      }
      const starter =
        kind === 'bib'
          ? `@article{newref2026,\n  author  = {Author Name},\n  title   = {Reference Title},\n  journal = {Journal Name},\n  year    = {2026}\n}\n`
          : kind === 'sty'
            ? `% Custom LaTeX package macros\n\\newcommand{\\E}{\\mathbb{E}}\n`
            : `% ${path}\n\\section{New Section}\nWrite LaTeX content here.\n`
      updateState(
        (prev) => ({
          ...prev,
          files: [
            ...prev.files,
            {
              id: `file-${Date.now().toString(36)}`,
              path,
              kind,
              content: starter,
            },
          ],
        }),
        `Created ${path}`,
      )
      setActiveFilePath(path)
    },
    [readOnly, state.files, updateState],
  )

  const handleDeleteFile = useCallback(
    (path: string) => {
      if (readOnly || path === state.mainFile) return
      updateState(
        (prev) => ({
          ...prev,
          files: prev.files.filter((f) => f.path !== path),
        }),
        `Deleted ${path}`,
      )
      if (activeFilePath === path) {
        setActiveFilePath(state.mainFile)
      }
    },
    [readOnly, state.mainFile, activeFilePath, updateState],
  )

  const handleJumpToSource = useCallback(
    (file: string, line: number) => {
      if (layout === 'pdf') setLayout('split')
      if (file !== activeFilePath && state.files.some((f) => f.path === file)) {
        pendingJumpRef.current = line
        setActiveFilePath(file)
      } else {
        editorRef.current?.jumpToLine(line)
      }
    },
    [activeFilePath, layout, state.files],
  )

  const handleJumpToOutline = useCallback(
    (item: LatexOutlineItem) => {
      handleJumpToSource(item.file, item.line)
      pdfRef.current?.scrollToSourceLine(item.file, item.line)
    },
    [handleJumpToSource],
  )

  const handleSyncToPdf = useCallback(() => {
    const line = editorRef.current?.getCursorLine() ?? cursor.line
    if (layout === 'editor') setLayout('split')
    pdfRef.current?.scrollToSourceLine(activeFile?.path ?? state.mainFile, line)
  }, [activeFile?.path, cursor.line, layout, state.mainFile])

  const handleDownloadPdf = useCallback(async () => {
    setExportingPdf(true)
    try {
      const pageElements = pdfRef.current?.getPageElements() ?? []
      await exportCompiledPdf({
        state,
        result: compileResult,
        pageElements,
      })
      setStatusNotice('Exported PDF document.')
    } finally {
      setExportingPdf(false)
    }
  }, [state, compileResult])

  const handleInsertTable = useCallback((rows: number, cols: number) => {
    const colSpec = 'l' + 'c'.repeat(Math.max(0, cols - 1))
    const headerCells = Array.from({ length: cols }, (_, i) => `Col ${i + 1}`).join(
      ' & ',
    )
    const bodyRows = Array.from({ length: Math.max(1, rows - 1) }, (_row, r) =>
      Array.from({ length: cols }, (_col, c) => `R${r + 1}C${c + 1}`).join(' & '),
    )
      .map((line) => `    ${line} \\\\`)
      .join('\n')
    const snippet = `\n\\begin{table}[h]\n  \\centering\n  \\caption{Table caption.}\n  \\label{tab:data}\n  \\begin{tabular}{${colSpec}}\n    \\toprule\n    ${headerCells} \\\\\n    \\midrule\n${bodyRows}\n    \\bottomrule\n  \\end{tabular}\n\\end{table}\n`
    editorRef.current?.insertText(snippet)
  }, [])

  // Draggable split divider between Editor and PDF
  const startSplitDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    const container = splitContainerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const onMove = (ev: MouseEvent) => {
      const next = (ev.clientX - rect.left) / rect.width
      setSplitRatio(Math.min(0.75, Math.max(0.25, next)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const menus: MenuBarGroup[] = useMemo(
    () => [
      {
        id: 'file',
        label: 'File',
        items: [
          {
            id: 'new-section',
            label: 'New .tex file',
            disabled: readOnly,
            icon: <FileText className="h-3.5 w-3.5" />,
            onSelect: () =>
              handleCreateFile(
                `sections/section-${state.files.length + 1}.tex`,
                'tex',
              ),
          },
          { id: 'div-exp', label: '', divider: true },
          {
            id: 'dl-pdf',
            label: 'Download PDF (.pdf)',
            icon: <FileDown className="h-3.5 w-3.5" />,
            onSelect: () => void handleDownloadPdf(),
          },
          {
            id: 'dl-tex',
            label: `Download ${activeFile?.path ?? 'main.tex'}`,
            icon: <FileCode2 className="h-3.5 w-3.5" />,
            onSelect: () => {
              if (activeFile) {
                downloadTexFile(activeFile.path, activeFile.content)
                setStatusNotice(`Exported ${activeFile.path}.`)
              }
            },
          },
          {
            id: 'dl-flat',
            label: 'Download standalone .tex',
            icon: <Code className="h-3.5 w-3.5" />,
            onSelect: () => {
              downloadFlattenedTex(state)
              setStatusNotice('Exported standalone .tex file.')
            },
          },
          {
            id: 'dl-zip',
            label: 'Download project source (.zip)',
            icon: <FileArchive className="h-3.5 w-3.5" />,
            onSelect: () => {
              void downloadProjectZip(state)
              setStatusNotice('Exported project .zip archive.')
            },
          },
        ],
      },
      {
        id: 'edit',
        label: 'Edit',
        items: [
          {
            id: 'find',
            label: 'Find and replace',
            shortcut: '⌘F',
            icon: <Search className="h-3.5 w-3.5" />,
            onSelect: () => editorRef.current?.openFind(),
          },
          {
            id: 'comment',
            label: 'Toggle % comment',
            shortcut: '⌘/',
            disabled: readOnly,
            icon: <MessageSquareCode className="h-3.5 w-3.5" />,
            onSelect: () => editorRef.current?.toggleComment(),
          },
          { id: 'div-ed', label: '', divider: true },
          {
            id: 'wrap',
            label: 'Word wrap',
            checked: state.wordWrap,
            onSelect: () =>
              updateState(
                (prev) => ({ ...prev, wordWrap: !prev.wordWrap }),
                'Toggled word wrap',
              ),
          },
        ],
      },
      {
        id: 'insert',
        label: 'Insert',
        items: [
          {
            id: 'ins-sec',
            label: 'Section heading',
            disabled: readOnly,
            onSelect: () =>
              editorRef.current?.insertText(
                '\n\\section{Section Title}\\label{sec:new}\n',
              ),
          },
          {
            id: 'ins-eq',
            label: 'Numbered equation',
            disabled: readOnly,
            onSelect: () =>
              editorRef.current?.insertText(
                '\n\\begin{equation}\n  E = mc^2\n  \\label{eq:new}\n\\end{equation}\n',
              ),
          },
          {
            id: 'ins-align',
            label: 'Aligned equations',
            disabled: readOnly,
            onSelect: () =>
              editorRef.current?.insertText(
                '\n\\begin{align}\n  a &= b + c \\\\\n  d &= e + f\n\\end{align}\n',
              ),
          },
          {
            id: 'ins-thm',
            label: 'Theorem + Proof',
            disabled: readOnly,
            onSelect: () =>
              editorRef.current?.insertText(
                '\n\\begin{theorem}[Title]\\label{thm:new}\n  State the theorem claim here.\n\\end{theorem}\n\n\\begin{proof}\n  Outline the proof steps here.\n\\end{proof}\n',
              ),
          },
          {
            id: 'ins-fig',
            label: 'Figure float',
            disabled: readOnly,
            onSelect: () =>
              editorRef.current?.insertText(
                '\n\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.85\\linewidth]{figures/plot.pdf}\n  \\caption{Figure description.}\n  \\label{fig:new}\n\\end{figure}\n',
              ),
          },
          {
            id: 'ins-toc',
            label: 'Table of contents',
            disabled: readOnly,
            onSelect: () =>
              editorRef.current?.insertText('\n\\tableofcontents\n'),
          },
          {
            id: 'ins-break',
            label: 'Page break (\\newpage)',
            disabled: readOnly,
            onSelect: () => editorRef.current?.insertText('\n\\newpage\n'),
          },
        ],
      },
      {
        id: 'compile',
        label: 'Compile',
        items: [
          {
            id: 'recompile',
            label: 'Recompile now',
            shortcut: '⌘↵',
            onSelect: () => void runCompile(state),
          },
          {
            id: 'autocompile',
            label: 'Auto-compile on edit',
            checked: state.autoCompile,
            onSelect: () =>
              updateState(
                (prev) => ({ ...prev, autoCompile: !prev.autoCompile }),
                'Toggled auto-compile',
              ),
          },
          {
            id: 'toggle-logs',
            label: 'Show logs & diagnostics',
            checked: showLogs,
            onSelect: () => setShowLogs((v) => !v),
          },
          { id: 'div-sync', label: '', divider: true },
          {
            id: 'synctex',
            label: 'SyncTeX: Jump editor → PDF',
            onSelect: handleSyncToPdf,
          },
        ],
      },
      {
        id: 'view',
        label: 'View',
        items: [
          {
            id: 'view-sidebar',
            label: 'Project files & outline',
            checked: showSidebar,
            onSelect: () => setShowSidebar((v) => !v),
          },
          { id: 'div-lay', label: '', divider: true },
          {
            id: 'lay-split',
            label: 'Split editor & PDF',
            checked: layout === 'split',
            onSelect: () => setLayout('split'),
          },
          {
            id: 'lay-editor',
            label: 'Editor only',
            checked: layout === 'editor',
            onSelect: () => setLayout('editor'),
          },
          {
            id: 'lay-pdf',
            label: 'PDF preview only',
            checked: layout === 'pdf',
            onSelect: () => setLayout('pdf'),
          },
          { id: 'div-pdf', label: '', divider: true },
          {
            id: 'invert-pdf',
            label: 'Dark PDF reading paper',
            checked: state.invertPdf,
            onSelect: () =>
              updateState(
                (prev) => ({ ...prev, invertPdf: !prev.invertPdf }),
                'Toggled PDF paper theme',
              ),
          },
        ],
      },
    ],
    [
      activeFile,
      handleCreateFile,
      handleDownloadPdf,
      handleSyncToPdf,
      layout,
      readOnly,
      runCompile,
      showLogs,
      showSidebar,
      state,
      updateState,
    ],
  )

  const errorCount = compileResult.diagnostics.filter(
    (d) => d.severity === 'error',
  ).length
  const warningCount = compileResult.diagnostics.filter(
    (d) => d.severity === 'warning',
  ).length

  return (
    <div
      data-marble-id="latex-app-root"
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--xd-canvas)] text-[var(--xd-ink)]"
    >
      {/* Row 1: Overleaf Menu Bar, Project Title, Layout Switcher & Export */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-[var(--xd-border)] bg-[var(--xd-rail)] px-2.5 text-[12px]">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            title={showSidebar ? 'Hide project sidebar' : 'Show project sidebar'}
            aria-label="Toggle project sidebar"
            onClick={() => setShowSidebar((v) => !v)}
            className={cn(
              'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors',
              showSidebar
                ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
            )}
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </button>

          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]">
            <Sigma className="h-3.5 w-3.5" />
          </span>

          <input
            type="text"
            aria-label="LaTeX project title"
            readOnly={readOnly}
            value={state.title}
            onChange={(e) =>
              updateState(
                (prev) => ({ ...prev, title: e.target.value }),
                'Renamed LaTeX project',
              )
            }
            className="w-44 min-w-0 truncate rounded bg-transparent px-1.5 py-0.5 text-[12.5px] font-semibold text-[var(--xd-ink)] outline-none hover:bg-[var(--xd-surface-hover)] focus:bg-[var(--xd-canvas)] focus:ring-1 focus:ring-[var(--xd-accent)] sm:w-56"
          />

          <ToolbarDivider />
          <AppMenuBar menus={menus} className="hidden md:flex" />
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {statusNotice && (
            <span className="hidden text-[11px] text-[var(--xd-commit)] lg:inline">
              {statusNotice}
            </span>
          )}

          {/* Layout Segmented Switcher */}
          <div
            role="group"
            aria-label="Workspace layout"
            className="inline-flex items-center rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] p-0.5"
          >
            {(
              [
                { id: 'editor', label: 'Code', icon: <Code className="h-3 w-3" /> },
                { id: 'split', label: 'Split', icon: <Columns2 className="h-3 w-3" /> },
                { id: 'pdf', label: 'PDF', icon: <BookOpen className="h-3 w-3" /> },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={layout === opt.id}
                onClick={() => setLayout(opt.id)}
                className={cn(
                  'inline-flex h-5 items-center gap-1 rounded-xs px-2 text-[11px] font-medium transition-colors',
                  layout === opt.id
                    ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                    : 'text-[var(--xd-ink-muted)] hover:text-[var(--xd-ink)]',
                )}
              >
                {opt.icon}
                <span className="hidden sm:inline">{opt.label}</span>
              </button>
            ))}
          </div>

          {/* Export Dropdown (PDF / .tex / .zip) */}
          <ToolbarDropdown
            title="Export LaTeX or PDF"
            align="right"
            panelClassName="w-56 p-1"
            trigger={
              <span className="inline-flex items-center gap-1 font-medium text-[var(--xd-ink)]">
                <Download className="h-3.5 w-3.5 text-[var(--xd-accent)]" />
                <span>Export</span>
              </span>
            }
          >
            {(close) => (
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    close()
                    void handleDownloadPdf()
                  }}
                  className="flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-left text-[12px] text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)]"
                >
                  <FileDown className="h-3.5 w-3.5 text-[var(--xd-accent)]" />
                  <span>Compiled PDF (.pdf)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    close()
                    if (activeFile) {
                      downloadTexFile(activeFile.path, activeFile.content)
                      setStatusNotice(`Exported ${activeFile.path}.`)
                    }
                  }}
                  className="flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-left text-[12px] text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)]"
                >
                  <FileCode2 className="h-3.5 w-3.5 text-[var(--xd-commit)]" />
                  <span className="truncate">
                    Active file ({activeFile?.path ?? 'main.tex'})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    close()
                    downloadFlattenedTex(state)
                    setStatusNotice('Exported standalone .tex file.')
                  }}
                  className="flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-left text-[12px] text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)]"
                >
                  <FileText className="h-3.5 w-3.5 text-[var(--xd-ink-muted)]" />
                  <span>Standalone LaTeX (.tex)</span>
                </button>
                <div className="my-1 h-px bg-[var(--xd-border)]" />
                <button
                  type="button"
                  onClick={() => {
                    close()
                    void downloadProjectZip(state)
                    setStatusNotice('Exported project .zip archive.')
                  }}
                  className="flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-left text-[12px] text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)]"
                >
                  <FileArchive className="h-3.5 w-3.5 text-[var(--xd-sketch)]" />
                  <span>Full project source (.zip)</span>
                </button>
              </div>
            )}
          </ToolbarDropdown>
        </div>
      </div>

      {/* Main Overleaf Body: Project Sidebar + Split (Code Editor | SyncTeX Rail | PDF Preview) */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showSidebar && (
          <LatexProjectSidebar
            files={state.files}
            mainFile={state.mainFile}
            activeFilePath={activeFile?.path ?? state.mainFile}
            outline={compileResult.outline}
            readOnly={readOnly}
            onSelectFile={setActiveFilePath}
            onCreateFile={handleCreateFile}
            onDeleteFile={handleDeleteFile}
            onSetMainFile={(path) =>
              updateState(
                (prev) => ({ ...prev, mainFile: path }),
                `Set main file to ${path}`,
              )
            }
            onJumpToOutline={handleJumpToOutline}
          />
        )}

        <div
          ref={splitContainerRef}
          className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
        >
          {/* Left Pane: LaTeX Formatting Toolbar + CodeMirror 6 Editor */}
          {layout !== 'pdf' && (
            <div
              style={
                layout === 'split'
                  ? { width: `${splitRatio * 100}%` }
                  : { width: '100%' }
              }
              className="flex min-h-0 min-w-0 flex-col bg-[var(--xd-canvas)]"
            >
              {/* Editor Formatting & Insert Toolbar */}
              <div className="flex h-9 shrink-0 items-center justify-between gap-1 overflow-x-auto border-b border-[var(--xd-border)] bg-[var(--xd-rail)] px-2">
                <div className="flex items-center gap-0.5">
                  <ToolbarButton
                    title="Bold (\\textbf{})"
                    disabled={readOnly}
                    onClick={() =>
                      editorRef.current?.wrapSelection('\\textbf{', '}', 'bold')
                    }
                  >
                    <Bold className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <ToolbarButton
                    title="Italic (\\textit{})"
                    disabled={readOnly}
                    onClick={() =>
                      editorRef.current?.wrapSelection(
                        '\\textit{',
                        '}',
                        'italic',
                      )
                    }
                  >
                    <Italic className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <ToolbarButton
                    title="Inline math ($...$)"
                    disabled={readOnly}
                    onClick={() =>
                      editorRef.current?.wrapSelection('$', '$', 'x^2')
                    }
                  >
                    <span className="xd-mono text-[11.5px] font-semibold">
                      $x$
                    </span>
                  </ToolbarButton>
                  <ToolbarButton
                    title="Display equation block"
                    disabled={readOnly}
                    onClick={() =>
                      editorRef.current?.insertText(
                        '\n\\begin{equation}\n  \n  \\label{eq:new}\n\\end{equation}\n',
                        32,
                      )
                    }
                  >
                    <Sigma className="h-3.5 w-3.5" />
                  </ToolbarButton>

                  <ToolbarDivider />

                  {/* LaTeX Symbol Palette */}
                  <ToolbarDropdown
                    title="Insert LaTeX math symbol"
                    disabled={readOnly}
                    panelClassName="w-64 p-2"
                    trigger={
                      <span className="inline-flex items-center gap-1 text-[11.5px]">
                        <span className="xd-serif text-[13px]">Ω</span>
                        <span className="hidden lg:inline">Symbols</span>
                      </span>
                    }
                  >
                    {(close) => (
                      <div className="space-y-2.5">
                        {LATEX_SYMBOL_GROUPS.map((grp) => (
                          <div key={grp.group}>
                            <div className="mb-1 text-[10.5px] font-medium text-[var(--xd-ink-muted)]">
                              {grp.group}
                            </div>
                            <div className="grid grid-cols-6 gap-1">
                              {grp.items.map((item) => (
                                <button
                                  key={item.tex}
                                  type="button"
                                  title={`${item.label} (${item.tex})`}
                                  onClick={() => {
                                    editorRef.current?.insertText(item.tex)
                                    close()
                                  }}
                                  className="flex h-7 items-center justify-center rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] text-[13px] text-[var(--xd-ink)] hover:border-[var(--xd-accent)] hover:bg-[var(--xd-accent-soft)]"
                                >
                                  {item.symbol}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ToolbarDropdown>

                  {/* Citation Picker */}
                  <ToolbarDropdown
                    title="Insert BibTeX citation (\\cite{})"
                    disabled={readOnly}
                    panelClassName="w-64 max-h-60 overflow-y-auto p-1"
                    trigger={
                      <span className="inline-flex items-center gap-1 text-[11.5px]">
                        <Sparkles className="h-3 w-3 text-[var(--xd-commit)]" />
                        <span className="hidden xl:inline">Cite</span>
                      </span>
                    }
                  >
                    {(close) => (
                      <div className="space-y-0.5">
                        {autocompleteData.bibEntries.length === 0 ? (
                          <div className="px-2 py-2 text-[11px] text-[var(--xd-ink-muted)]">
                            No entries in .bib files.
                          </div>
                        ) : (
                          autocompleteData.bibEntries.map((entry) => (
                            <button
                              key={entry.key}
                              type="button"
                              onClick={() => {
                                editorRef.current?.insertText(
                                  `~\\cite{${entry.key}}`,
                                )
                                close()
                              }}
                              className="flex w-full flex-col rounded-xs px-2 py-1.5 text-left hover:bg-[var(--xd-surface-hover)]"
                            >
                              <span className="xd-mono text-[11px] font-medium text-[var(--xd-accent)]">
                                {entry.key} ({entry.year})
                              </span>
                              <span className="truncate text-[11px] text-[var(--xd-ink-secondary)]">
                                {entry.title}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </ToolbarDropdown>

                  {/* Cross-Ref Picker */}
                  <ToolbarDropdown
                    title="Insert cross-reference (\\ref / \\eqref)"
                    disabled={readOnly}
                    panelClassName="w-56 max-h-60 overflow-y-auto p-1"
                    trigger={
                      <span className="inline-flex items-center gap-1 text-[11.5px]">
                        <Link2 className="h-3 w-3" />
                        <span className="hidden xl:inline">Ref</span>
                      </span>
                    }
                  >
                    {(close) => (
                      <div className="space-y-0.5">
                        {autocompleteData.labels.length === 0 ? (
                          <div className="px-2 py-2 text-[11px] text-[var(--xd-ink-muted)]">
                            Add \label&#123;...&#125; to insert references.
                          </div>
                        ) : (
                          autocompleteData.labels.map((lbl) => (
                            <button
                              key={lbl.key}
                              type="button"
                              onClick={() => {
                                const cmd =
                                  lbl.kind === 'equation' ? '\\eqref' : '\\ref'
                                editorRef.current?.insertText(
                                  `~${cmd}{${lbl.key}}`,
                                )
                                close()
                              }}
                              className="flex w-full items-center justify-between gap-2 rounded-xs px-2 py-1 text-left hover:bg-[var(--xd-surface-hover)]"
                            >
                              <span className="xd-mono truncate text-[11px] text-[var(--xd-ink)]">
                                {lbl.key}
                              </span>
                              <span className="xd-tabular shrink-0 text-[10.5px] text-[var(--xd-ink-muted)]">
                                {lbl.number || lbl.kind}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </ToolbarDropdown>

                  {/* Booktabs Table Grid Inserter */}
                  <ToolbarDropdown
                    title="Insert LaTeX booktabs table"
                    disabled={readOnly}
                    trigger={<Table2 className="h-3.5 w-3.5" />}
                  >
                    {(close) => (
                      <TableGridPicker
                        onSelect={(r, c) => {
                          handleInsertTable(r, c)
                          close()
                        }}
                      />
                    )}
                  </ToolbarDropdown>

                  <ToolbarDivider />

                  <ToolbarButton
                    title="Bulleted list (itemize)"
                    disabled={readOnly}
                    onClick={() =>
                      editorRef.current?.insertText(
                        '\n\\begin{itemize}\n  \\item \n\\end{itemize}\n',
                        15,
                      )
                    }
                  >
                    <List className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <ToolbarButton
                    title="Numbered list (enumerate)"
                    disabled={readOnly}
                    onClick={() =>
                      editorRef.current?.insertText(
                        '\n\\begin{enumerate}\n  \\item \n\\end{enumerate}\n',
                        17,
                      )
                    }
                  >
                    <ListOrdered className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <ToolbarButton
                    title="Insert section heading"
                    disabled={readOnly}
                    onClick={() =>
                      editorRef.current?.insertText(
                        '\n\\section{New Section}\n',
                      )
                    }
                  >
                    <Hash className="h-3.5 w-3.5" />
                  </ToolbarButton>
                </div>

                <div className="flex items-center gap-0.5">
                  <ToolbarButton
                    title="Toggle word wrap"
                    active={state.wordWrap}
                    onClick={() =>
                      updateState(
                        (prev) => ({ ...prev, wordWrap: !prev.wordWrap }),
                        'Toggled word wrap',
                      )
                    }
                  >
                    <WrapText className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <ToolbarButton
                    title="Find & Replace (⌘F)"
                    onClick={() => editorRef.current?.openFind()}
                  >
                    <Search className="h-3.5 w-3.5" />
                  </ToolbarButton>
                </div>
              </div>

              {/* CodeMirror 6 LaTeX Editor */}
              <div className="min-h-0 flex-1 overflow-hidden">
                {activeFile && (
                  <LatexCodeEditor
                    ref={editorRef}
                    filePath={activeFile.path}
                    value={activeFile.content}
                    onChange={handleFileContentChange}
                    readOnly={readOnly}
                    wordWrap={state.wordWrap}
                    fontSize={state.editorFontSize}
                    diagnostics={compileResult.diagnostics}
                    autocompleteData={autocompleteData}
                    onCursorChange={setCursor}
                    onTriggerCompile={() => void runCompile(state)}
                  />
                )}
              </div>
            </div>
          )}

          {/* Center Draggable Split Rail with Overleaf SyncTeX Buttons */}
          {layout === 'split' && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize LaTeX editor and PDF preview"
              onMouseDown={startSplitDrag}
              className="group relative flex w-5 shrink-0 cursor-col-resize flex-col items-center justify-center gap-1.5 border-x border-[var(--xd-border)] bg-[var(--xd-rail)] select-none"
            >
              <button
                type="button"
                title="SyncTeX: Jump from editor line to PDF"
                aria-label="Jump from editor to PDF"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={handleSyncToPdf}
                className="inline-flex h-6 w-4 items-center justify-center rounded text-[var(--xd-ink-muted)] transition-colors hover:bg-[var(--xd-accent-soft)] hover:text-[var(--xd-accent)]"
              >
                <ArrowRight className="h-3 w-3" />
              </button>
              <button
                type="button"
                title="SyncTeX: Double-click any paragraph in the PDF to jump to its source line"
                aria-label="Focus editor at current line"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => editorRef.current?.focus()}
                className="inline-flex h-6 w-4 items-center justify-center rounded text-[var(--xd-ink-muted)] transition-colors hover:bg-[var(--xd-accent-soft)] hover:text-[var(--xd-accent)]"
              >
                <ArrowLeft className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Right Pane: PDF Preview + Compiler Controls + Logs */}
          {layout !== 'editor' && (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <LatexPdfPreview
                ref={pdfRef}
                result={compileResult}
                compiling={compiling}
                exportingPdf={exportingPdf}
                autoCompile={state.autoCompile}
                compiler={state.compiler}
                availableNativeEngines={availableNativeEngines}
                paperSize={state.paperSize}
                invertPdf={state.invertPdf}
                showLogs={showLogs}
                onRecompile={() => void runCompile(state)}
                onToggleAutoCompile={() =>
                  updateState(
                    (prev) => ({ ...prev, autoCompile: !prev.autoCompile }),
                    'Toggled auto-compile',
                  )
                }
                onChangeCompiler={(engine) => {
                  const next = { ...state, compiler: engine }
                  updateState(() => next, `Switched compiler to ${engine}`)
                  void runCompile(next, engine)
                }}
                onChangePaperSize={(paperSize: LatexPaperSize) =>
                  updateState(
                    (prev) => ({ ...prev, paperSize }),
                    `Set paper size to ${paperSize}`,
                  )
                }
                onToggleInvertPdf={() =>
                  updateState(
                    (prev) => ({ ...prev, invertPdf: !prev.invertPdf }),
                    'Toggled PDF paper theme',
                  )
                }
                onToggleLogs={() => setShowLogs((v) => !v)}
                onDownloadPdf={() => void handleDownloadPdf()}
                onJumpToSource={handleJumpToSource}
              />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Status Bar */}
      <footer className="flex h-6 shrink-0 items-center justify-between border-t border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 text-[11px] text-[var(--xd-ink-muted)]">
        <div className="flex items-center gap-3">
          <span className="xd-mono text-[var(--xd-ink-secondary)]">
            {activeFile?.path ?? state.mainFile}
          </span>
          <span className="xd-mono xd-tabular">
            Ln {cursor.line}, Col {cursor.col}
          </span>
          <span className="xd-tabular hidden sm:inline">
            {compileResult.wordCount} words
          </span>
          <span className="hidden md:inline">
            Type <code className="xd-mono text-[var(--xd-ink-secondary)]">\</code> for autocomplete
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="xd-tabular">
            {compileResult.pageCount}{' '}
            {compileResult.pageCount === 1 ? 'page' : 'pages'}
          </span>
          <span className="xd-tabular">
            {compileResult.engine} · {compileResult.durationMs}ms
          </span>
          <span
            className={cn(
              'xd-tabular font-medium',
              errorCount > 0
                ? 'text-[var(--xd-danger)]'
                : warningCount > 0
                  ? 'text-[var(--xd-sketch)]'
                  : 'text-[var(--xd-commit)]',
            )}
          >
            {errorCount > 0
              ? `${errorCount} error${errorCount === 1 ? '' : 's'}`
              : warningCount > 0
                ? `${warningCount} warning${warningCount === 1 ? '' : 's'}`
                : 'Compiled'}
          </span>
        </div>
      </footer>
    </div>
  )
}
