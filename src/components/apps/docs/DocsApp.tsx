import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckSquare,
  Columns2,
  Copy,
  Download,
  Eye,
  FilePlus,
  FileText,
  Folder,
  Hash,
  Image,
  Link2,
  List,
  ListOrdered,
  ListTree,
  MessageSquare,
  Minus,
  Pencil,
  Printer,
  Quote,
  Redo2,
  Search,
  SeparatorHorizontal,
  Settings2,
  Sparkles,
  Star,
  Table2,
  Undo2,
} from 'lucide-react'
import { AppMenuBar } from '#/components/apps/shared'
import type { MenuBarGroup } from '#/components/apps/shared'
import { cn } from '#/lib/utils'
import {
  DocsCommentsPanel,
  DocsOutlineSidebar,
  DocsRuler,
} from './DocsChromePanels'
import {
  DocsFindReplaceBar,
  DocsInsertDialog,
  DocsPageSetupModal,
  DocsWordCountModal,
} from './DocsDialogs'
import { DocsFormattingToolbar } from './DocsFormattingToolbar'
import type { ActiveFormatState } from './DocsFormattingToolbar'
import {
  DEFAULT_DOCS_SEED,
  htmlToMarkdown,
  htmlToPlainText,
  parseDocsFromMarbleSource,
  serializeDocsToMarbleSource,
} from './serialization'
import type {
  DocsComment,
  DocsEditMode,
  DocsOutlineItem,
  DocsState,
} from './types'

export interface DocsAppProps {
  /** Standalone initial state (used by Storybook) */
  initialState?: DocsState
  /** Initial editing mode */
  initialEditMode?: DocsEditMode
  /** Open comments panel initially */
  initialShowComments?: boolean
  /** Open outline panel initially */
  initialShowOutline?: boolean
  /** Open find & replace initially */
  initialShowFindReplace?: boolean
  /** Bidirectional .mrbl HTML5 source */
  marbleSource?: string
  onMarbleSourceChange?: (nextSource: string, label: string) => void
  readOnly?: boolean
  className?: string
}

const DEFAULT_FORMAT: ActiveFormatState = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  align: 'left',
  blockTag: 'p',
  fontFamily: 'Inter',
  fontSize: 14,
  textColor: 'var(--xd-ink)',
  highlightColor: 'transparent',
}

export function DocsApp({
  initialState,
  initialEditMode = 'editing',
  initialShowComments = true,
  initialShowOutline = true,
  initialShowFindReplace = false,
  marbleSource,
  onMarbleSourceChange,
  readOnly = false,
  className,
}: DocsAppProps) {
  const seeded = useMemo(
    () =>
      initialState ??
      (marbleSource
        ? parseDocsFromMarbleSource(marbleSource)
        : DEFAULT_DOCS_SEED),
    [initialState, marbleSource],
  )

  const [docState, setDocState] = useState<DocsState>(seeded)
  const [editMode, setEditMode] = useState<DocsEditMode>(
    readOnly ? 'viewing' : initialEditMode,
  )
  const [zoom, setZoom] = useState(100)
  const [showOutline, setShowOutline] = useState(initialShowOutline)
  const [showRuler, setShowRuler] = useState(true)
  const [showComments, setShowComments] = useState(initialShowComments)
  const [showLiveWordCount, setShowLiveWordCount] = useState(true)
  const [wordCountOpen, setWordCountOpen] = useState(false)
  const [pageSetupOpen, setPageSetupOpen] = useState(false)
  const [findOpen, setFindOpen] = useState(initialShowFindReplace)
  const [findQuery, setFindQuery] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [insertDialog, setInsertDialog] = useState<'link' | 'image' | null>(
    null,
  )
  const [draftCommentQuote, setDraftCommentQuote] = useState<string | null>(
    null,
  )
  const [draftCommentKind, setDraftCommentKind] = useState<
    'comment' | 'suggestion'
  >('comment')
  const [paintFormat, setPaintFormat] = useState<ActiveFormatState | null>(null)
  const [activeFormat, setActiveFormat] =
    useState<ActiveFormatState>(DEFAULT_FORMAT)
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)
  const [outline, setOutline] = useState<DocsOutlineItem[]>([])
  const [toast, setToast] = useState<string | null>(null)

  const editorRef = useRef<HTMLDivElement | null>(null)
  const lastEmittedRef = useRef<string | null>(null)
  const historyRef = useRef<string[]>([seeded.html])
  const historyIdxRef = useRef(0)

  const effectiveReadOnly = readOnly || editMode === 'viewing'

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr))
    }, 2200)
  }, [])

  const extractOutline = useCallback((root: HTMLElement | null) => {
    if (!root) return
    const headings = Array.from(root.querySelectorAll('h1, h2, h3'))
    const items: DocsOutlineItem[] = headings
      .map((el, idx) => {
        const id = el.id || `doc-h-${idx + 1}`
        if (!el.id) el.id = id
        const level = Number(el.tagName[1]) as 1 | 2 | 3
        return { id, level, text: (el.textContent || '').trim() }
      })
      .filter((item) => item.text.length > 0)
    setOutline(items)
  }, [])

  // Mount initial HTML into contentEditable once
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== docState.html) {
      editorRef.current.innerHTML = docState.html
      extractOutline(editorRef.current)
    }
  }, [])

  // Sync external marbleSource updates
  useEffect(() => {
    if (!marbleSource || marbleSource === lastEmittedRef.current) return
    const next = parseDocsFromMarbleSource(marbleSource)
    setDocState(next)
    if (editorRef.current && editorRef.current.innerHTML !== next.html) {
      editorRef.current.innerHTML = next.html
      extractOutline(editorRef.current)
    }
  }, [marbleSource, extractOutline])

  const emitState = useCallback(
    (next: DocsState, label: string) => {
      setDocState(next)
      if (onMarbleSourceChange) {
        const serialized = serializeDocsToMarbleSource(next)
        lastEmittedRef.current = serialized
        onMarbleSourceChange(serialized, label)
      }
    },
    [onMarbleSourceChange],
  )

  const syncHtmlFromDom = useCallback(
    (label = 'Edit document', pushHistory = true) => {
      if (!editorRef.current) return
      const html = editorRef.current.innerHTML
      extractOutline(editorRef.current)
      if (pushHistory && historyRef.current[historyIdxRef.current] !== html) {
        historyRef.current = historyRef.current
          .slice(0, historyIdxRef.current + 1)
          .concat(html)
          .slice(-50)
        historyIdxRef.current = historyRef.current.length - 1
      }
      emitState({ ...docState, html }, label)
    },
    [docState, emitState, extractOutline],
  )

  const refreshSelectionFormat = useCallback(() => {
    if (typeof document === 'undefined') return
    try {
      const bold = document.queryCommandState('bold')
      const italic = document.queryCommandState('italic')
      const underline = document.queryCommandState('underline')
      const strikethrough = document.queryCommandState('strikeThrough')
      const align = document.queryCommandState('justifyCenter')
        ? 'center'
        : document.queryCommandState('justifyRight')
          ? 'right'
          : document.queryCommandState('justifyFull')
            ? 'justify'
            : 'left'
      const rawBlock = String(document.queryCommandValue('formatBlock') || 'p')
        .replace(/[<>]/g, '')
        .toLowerCase()
      const sel = window.getSelection()
      const anchorEl =
        sel?.anchorNode instanceof HTMLElement
          ? sel.anchorNode
          : sel?.anchorNode?.parentElement
      const computed = anchorEl ? window.getComputedStyle(anchorEl) : null
      const fontSize = computed
        ? Math.round(parseFloat(computed.fontSize) || 14)
        : 14
      const fontFamily = computed?.fontFamily || 'Inter'

      setActiveFormat((prev) => ({
        ...prev,
        bold,
        italic,
        underline,
        strikethrough,
        align,
        blockTag: ['h1', 'h2', 'h3', 'p'].includes(rawBlock) ? rawBlock : 'p',
        fontFamily,
        fontSize,
      }))
    } catch {
      // ignore in non-browser contexts
    }
  }, [])

  const exec = useCallback(
    (cmd: string, value?: string) => {
      if (effectiveReadOnly) return
      editorRef.current?.focus()
      document.execCommand(cmd, false, value)
      refreshSelectionFormat()
      syncHtmlFromDom(`Format ${cmd}`)
    },
    [effectiveReadOnly, refreshSelectionFormat, syncHtmlFromDom],
  )

  const undo = useCallback(() => {
    if (effectiveReadOnly || historyIdxRef.current <= 0) return
    historyIdxRef.current -= 1
    const html = historyRef.current[historyIdxRef.current]
    if (editorRef.current) {
      editorRef.current.innerHTML = html
      extractOutline(editorRef.current)
    }
    emitState({ ...docState, html }, 'Undo')
  }, [docState, effectiveReadOnly, emitState, extractOutline])

  const redo = useCallback(() => {
    if (
      effectiveReadOnly ||
      historyIdxRef.current >= historyRef.current.length - 1
    ) {
      return
    }
    historyIdxRef.current += 1
    const html = historyRef.current[historyIdxRef.current]
    if (editorRef.current) {
      editorRef.current.innerHTML = html
      extractOutline(editorRef.current)
    }
    emitState({ ...docState, html }, 'Redo')
  }, [docState, effectiveReadOnly, emitState, extractOutline])

  const applyBlockStyle = (
    style: 'p' | 'title' | 'subtitle' | 'h1' | 'h2' | 'h3',
  ) => {
    if (effectiveReadOnly) return
    editorRef.current?.focus()
    if (style === 'title') {
      document.execCommand('formatBlock', false, 'h1')
    } else if (style === 'subtitle') {
      document.execCommand('formatBlock', false, 'p')
    } else {
      document.execCommand('formatBlock', false, style)
    }
    refreshSelectionFormat()
    syncHtmlFromDom(`Style ${style}`)
  }

  const applyFontFamily = (family: string) => {
    if (effectiveReadOnly) return
    exec('fontName', family)
  }

  const applyFontSize = (sizePx: number) => {
    if (effectiveReadOnly) return
    editorRef.current?.focus()
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0)
      const span = document.createElement('span')
      span.style.fontSize = `${sizePx}px`
      try {
        range.surroundContents(span)
      } catch {
        document.execCommand(
          'insertHTML',
          false,
          `<span style="font-size:${sizePx}px">${sel.toString()}</span>`,
        )
      }
      setActiveFormat((prev) => ({ ...prev, fontSize: sizePx }))
      syncHtmlFromDom(`Font size ${sizePx}px`)
    } else {
      setActiveFormat((prev) => ({ ...prev, fontSize: sizePx }))
    }
  }

  const insertHtml = (snippet: string, label: string) => {
    if (effectiveReadOnly) return
    editorRef.current?.focus()
    document.execCommand('insertHTML', false, snippet)
    syncHtmlFromDom(label)
  }

  const insertTable = (rows: number, cols: number) => {
    const headCells = Array.from({ length: cols })
      .map((_, i) => `<th>Column ${i + 1}</th>`)
      .join('')
    const bodyRows = Array.from({ length: Math.max(1, rows - 1) })
      .map(
        () =>
          `<tr>${Array.from({ length: cols })
            .map(() => '<td>—</td>')
            .join('')}</tr>`,
      )
      .join('')
    insertHtml(
      `<table><thead><tr>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table><p><br></p>`,
      `Insert ${rows}×${cols} table`,
    )
  }

  const insertChecklist = () => {
    insertHtml(
      `<div class="xd-doc-check"><label><input type="checkbox"> <span>Action item</span></label></div><p><br></p>`,
      'Insert checklist',
    )
  }

  const insertCallout = () => {
    insertHtml(
      `<blockquote><strong>Note:</strong> Add a key finding, assumption, or falsifiable check here.</blockquote><p><br></p>`,
      'Insert callout',
    )
  }

  const insertPageBreak = () => {
    insertHtml(`<hr class="xd-page-break"><p><br></p>`, 'Insert page break')
  }

  const insertTableOfContents = () => {
    if (outline.length === 0) {
      showToast('Add headings first to build a Table of Contents')
      return
    }
    const items = outline
      .map((item) => `<li><a href="#${item.id}">${item.text}</a></li>`)
      .join('')
    insertHtml(
      `<div class="xd-doc-toc"><strong>Table of Contents</strong><ul>${items}</ul></div><p><br></p>`,
      'Insert table of contents',
    )
  }

  const startCommentOrSuggestion = (kind: 'comment' | 'suggestion') => {
    const selectedText = window.getSelection()?.toString().trim() || ''
    setDraftCommentKind(kind)
    setDraftCommentQuote(selectedText)
    setShowComments(true)
  }

  const submitDraftComment = (body: string, suggestionReplace?: string) => {
    const created: DocsComment = {
      id: `cmt-${Math.random().toString(36).slice(2, 8)}`,
      author: 'You',
      initials: 'YO',
      quote: draftCommentQuote || '',
      body,
      createdAt: new Date().toISOString(),
      resolved: false,
      kind: draftCommentKind,
      suggestionReplace,
      replies: [],
    }
    emitState(
      { ...docState, comments: [created, ...docState.comments] },
      draftCommentKind === 'suggestion' ? 'Add suggestion' : 'Add comment',
    )
    setDraftCommentQuote(null)
  }

  const acceptSuggestion = (commentId: string) => {
    const target = docState.comments.find((c) => c.id === commentId)
    if (!target || !target.suggestionReplace) return
    let nextHtml = docState.html
    if (target.quote && nextHtml.includes(target.quote)) {
      nextHtml = nextHtml.replace(target.quote, target.suggestionReplace)
      if (editorRef.current) editorRef.current.innerHTML = nextHtml
    }
    const nextComments = docState.comments.map((c) =>
      c.id === commentId ? { ...c, resolved: true } : c,
    )
    emitState(
      { ...docState, html: nextHtml, comments: nextComments },
      'Accept suggestion',
    )
    showToast('Accepted suggestion')
  }

  // Stats
  const plainText = useMemo(
    () => htmlToPlainText(docState.html),
    [docState.html],
  )
  const wordCount = useMemo(
    () => (plainText ? plainText.split(/\s+/).filter(Boolean).length : 0),
    [plainText],
  )
  const charCount = plainText.length
  const charNoSpaces = plainText.replace(/\s+/g, '').length
  const pageCount = Math.max(1, Math.ceil(wordCount / 360))

  // Find & Replace count
  const findMatchCount = useMemo(() => {
    if (!findQuery) return 0
    const escaped = findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(escaped, matchCase ? 'g' : 'gi')
    return (plainText.match(re) ?? []).length
  }, [findQuery, matchCase, plainText])

  const performReplace = (all: boolean) => {
    if (!findQuery || effectiveReadOnly || !editorRef.current) return
    const escaped = findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(escaped, `${all ? 'g' : ''}${matchCase ? '' : 'i'}`)
    const walker = document.createTreeWalker(
      editorRef.current,
      NodeFilter.SHOW_TEXT,
    )
    let replaced = 0
    let node: Node | null
    while ((node = walker.nextNode())) {
      const value = node.nodeValue || ''
      if (re.test(value)) {
        node.nodeValue = value.replace(re, replaceText)
        replaced += 1
        if (!all) break
      }
    }
    if (replaced > 0) {
      syncHtmlFromDom(all ? 'Replace all' : 'Replace')
      showToast(
        all ? `Replaced across ${replaced} text node(s)` : 'Replaced match',
      )
    }
  }

  const downloadFile = (ext: 'md' | 'html' | 'txt') => {
    const slug =
      docState.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'document'
    const content =
      ext === 'md'
        ? htmlToMarkdown(docState.html)
        : ext === 'txt'
          ? plainText
          : serializeDocsToMarbleSource(docState)
    const mime =
      ext === 'html'
        ? 'text/html'
        : ext === 'md'
          ? 'text/markdown'
          : 'text/plain'
    const blob = new Blob([content], { type: `${mime};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
    showToast(`Exported ${slug}.${ext}`)
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'h') {
        e.preventDefault()
        setFindOpen(true)
      } else if (meta && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        setWordCountOpen(true)
      } else if (meta && e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        startCommentOrSuggestion(
          editMode === 'suggesting' ? 'suggestion' : 'comment',
        )
      } else if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (document.activeElement === editorRef.current) {
          e.preventDefault()
          undo()
        }
      } else if (meta && e.shiftKey && e.key.toLowerCase() === 'z') {
        if (document.activeElement === editorRef.current) {
          e.preventDefault()
          redo()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editMode, redo, undo])

  const menus: MenuBarGroup[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        {
          id: 'file-new',
          label: 'Reset blank document',
          icon: <FilePlus className="h-3.5 w-3.5" />,
          disabled: effectiveReadOnly,
          onSelect: () => {
            const blank = '<h1>Untitled document</h1><p>Start writing...</p>'
            if (editorRef.current) editorRef.current.innerHTML = blank
            emitState(
              { ...docState, title: 'Untitled document', html: blank },
              'New document',
            )
          },
        },
        { id: 'file-sep-1', label: '', divider: true },
        {
          id: 'file-dl-md',
          label: 'Download Markdown (.md)',
          icon: <Download className="h-3.5 w-3.5" />,
          onSelect: () => downloadFile('md'),
        },
        {
          id: 'file-dl-html',
          label: 'Download HTML (.html)',
          icon: <Download className="h-3.5 w-3.5" />,
          onSelect: () => downloadFile('html'),
        },
        {
          id: 'file-dl-txt',
          label: 'Download Plain Text (.txt)',
          icon: <Download className="h-3.5 w-3.5" />,
          onSelect: () => downloadFile('txt'),
        },
        { id: 'file-sep-2', label: '', divider: true },
        {
          id: 'file-setup',
          label: 'Page setup…',
          icon: <Settings2 className="h-3.5 w-3.5" />,
          onSelect: () => setPageSetupOpen(true),
        },
        {
          id: 'file-print',
          label: 'Print',
          icon: <Printer className="h-3.5 w-3.5" />,
          shortcut: '⌘P',
          onSelect: () => window.print(),
        },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        {
          id: 'edit-undo',
          label: 'Undo',
          icon: <Undo2 className="h-3.5 w-3.5" />,
          shortcut: '⌘Z',
          disabled: effectiveReadOnly,
          onSelect: undo,
        },
        {
          id: 'edit-redo',
          label: 'Redo',
          icon: <Redo2 className="h-3.5 w-3.5" />,
          shortcut: '⌘⇧Z',
          disabled: effectiveReadOnly,
          onSelect: redo,
        },
        { id: 'edit-sep-1', label: '', divider: true },
        {
          id: 'edit-copy',
          label: 'Copy Markdown',
          icon: <Copy className="h-3.5 w-3.5" />,
          onSelect: () => {
            if (typeof navigator !== 'undefined')
              void navigator.clipboard.writeText(htmlToMarkdown(docState.html))
            showToast('Copied Markdown')
          },
        },
        {
          id: 'edit-find',
          label: 'Find and replace',
          icon: <Search className="h-3.5 w-3.5" />,
          shortcut: '⌘H',
          onSelect: () => setFindOpen(true),
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'view-outline',
          label: 'Show document outline',
          checked: showOutline,
          onSelect: () => setShowOutline((v) => !v),
        },
        {
          id: 'view-ruler',
          label: 'Show ruler',
          checked: showRuler,
          onSelect: () => setShowRuler((v) => !v),
        },
        {
          id: 'view-comments',
          label: 'Show comments panel',
          checked: showComments,
          onSelect: () => setShowComments((v) => !v),
        },
        { id: 'view-sep', label: '', divider: true },
        {
          id: 'view-pageless',
          label: 'Pageless layout',
          checked: docState.pageSetup.pageless,
          onSelect: () =>
            emitState(
              {
                ...docState,
                pageSetup: {
                  ...docState.pageSetup,
                  pageless: !docState.pageSetup.pageless,
                },
              },
              'Toggle pageless',
            ),
        },
        {
          id: 'view-hf',
          label: 'Show header & footer',
          checked: docState.pageSetup.showHeaderFooter,
          onSelect: () =>
            emitState(
              {
                ...docState,
                pageSetup: {
                  ...docState.pageSetup,
                  showHeaderFooter: !docState.pageSetup.showHeaderFooter,
                },
              },
              'Toggle header/footer',
            ),
        },
      ],
    },
    {
      id: 'insert',
      label: 'Insert',
      items: [
        {
          id: 'ins-img',
          label: 'Image…',
          icon: <Image className="h-3.5 w-3.5" />,
          disabled: effectiveReadOnly,
          onSelect: () => setInsertDialog('image'),
        },
        {
          id: 'ins-tbl',
          label: 'Table (3 × 3)',
          icon: <Table2 className="h-3.5 w-3.5" />,
          disabled: effectiveReadOnly,
          onSelect: () => insertTable(3, 3),
        },
        {
          id: 'ins-callout',
          label: 'Callout block',
          icon: <Quote className="h-3.5 w-3.5" />,
          disabled: effectiveReadOnly,
          onSelect: insertCallout,
        },
        {
          id: 'ins-check',
          label: 'Checklist item',
          icon: <CheckSquare className="h-3.5 w-3.5" />,
          disabled: effectiveReadOnly,
          onSelect: insertChecklist,
        },
        {
          id: 'ins-hr',
          label: 'Horizontal line',
          icon: <Minus className="h-3.5 w-3.5" />,
          disabled: effectiveReadOnly,
          onSelect: () =>
            insertHtml('<hr><p><br></p>', 'Insert horizontal line'),
        },
        {
          id: 'ins-pb',
          label: 'Page break',
          icon: <SeparatorHorizontal className="h-3.5 w-3.5" />,
          disabled: effectiveReadOnly,
          onSelect: insertPageBreak,
        },
        { id: 'ins-sep', label: '', divider: true },
        {
          id: 'ins-link',
          label: 'Link…',
          icon: <Link2 className="h-3.5 w-3.5" />,
          shortcut: '⌘K',
          disabled: effectiveReadOnly,
          onSelect: () => setInsertDialog('link'),
        },
        {
          id: 'ins-cmt',
          label: 'Comment',
          icon: <MessageSquare className="h-3.5 w-3.5" />,
          shortcut: '⌘⌥M',
          onSelect: () => startCommentOrSuggestion('comment'),
        },
        {
          id: 'ins-toc',
          label: 'Table of contents',
          icon: <ListTree className="h-3.5 w-3.5" />,
          disabled: effectiveReadOnly,
          onSelect: insertTableOfContents,
        },
      ],
    },
    {
      id: 'format',
      label: 'Format',
      items: [
        {
          id: 'fmt-h1',
          label: 'Heading 1',
          disabled: effectiveReadOnly,
          onSelect: () => applyBlockStyle('h1'),
        },
        {
          id: 'fmt-h2',
          label: 'Heading 2',
          disabled: effectiveReadOnly,
          onSelect: () => applyBlockStyle('h2'),
        },
        {
          id: 'fmt-h3',
          label: 'Heading 3',
          disabled: effectiveReadOnly,
          onSelect: () => applyBlockStyle('h3'),
        },
        {
          id: 'fmt-p',
          label: 'Normal text',
          disabled: effectiveReadOnly,
          onSelect: () => applyBlockStyle('p'),
        },
        { id: 'fmt-sep-1', label: '', divider: true },
        {
          id: 'fmt-ul',
          label: 'Bulleted list',
          icon: <List className="h-3.5 w-3.5" />,
          disabled: effectiveReadOnly,
          onSelect: () => exec('insertUnorderedList'),
        },
        {
          id: 'fmt-ol',
          label: 'Numbered list',
          icon: <ListOrdered className="h-3.5 w-3.5" />,
          disabled: effectiveReadOnly,
          onSelect: () => exec('insertOrderedList'),
        },
        { id: 'fmt-sep-2', label: '', divider: true },
        {
          id: 'fmt-col-1',
          label: '1 column',
          icon: <Columns2 className="h-3.5 w-3.5" />,
          checked: docState.pageSetup.columns === 1,
          onSelect: () =>
            emitState(
              { ...docState, pageSetup: { ...docState.pageSetup, columns: 1 } },
              '1 column',
            ),
        },
        {
          id: 'fmt-col-2',
          label: '2 columns',
          icon: <Columns2 className="h-3.5 w-3.5" />,
          checked: docState.pageSetup.columns === 2,
          onSelect: () =>
            emitState(
              { ...docState, pageSetup: { ...docState.pageSetup, columns: 2 } },
              '2 columns',
            ),
        },
        {
          id: 'fmt-clear',
          label: 'Clear formatting',
          disabled: effectiveReadOnly,
          onSelect: () => exec('removeFormat'),
        },
      ],
    },
    {
      id: 'tools',
      label: 'Tools',
      items: [
        {
          id: 'tools-wc',
          label: 'Word count',
          icon: <Hash className="h-3.5 w-3.5" />,
          shortcut: '⌘⇧C',
          onSelect: () => setWordCountOpen(true),
        },
        {
          id: 'tools-live-wc',
          label: 'Display word count while typing',
          checked: showLiveWordCount,
          onSelect: () => setShowLiveWordCount((v) => !v),
        },
        {
          id: 'tools-find',
          label: 'Find and replace',
          icon: <Search className="h-3.5 w-3.5" />,
          shortcut: '⌘H',
          onSelect: () => setFindOpen(true),
        },
      ],
    },
  ]

  const pageWidthPx = docState.pageSetup.pageless
    ? 920
    : docState.pageSetup.orientation === 'landscape'
      ? 1056
      : 816

  const openCommentsCount = docState.comments.filter((c) => !c.resolved).length

  return (
    <div
      data-component="docs-app"
      data-marble-id="doc-shell"
      className={cn(
        'relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--xd-canvas)] text-[var(--xd-ink)]',
        className,
      )}
    >
      {/* Google Docs Top Header: Title + Menu Bar + Mode/Comments */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--xd-border)] bg-[var(--xd-canvas)] px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={docState.title}
                readOnly={effectiveReadOnly}
                aria-label="Document title"
                onChange={(e) =>
                  emitState(
                    { ...docState, title: e.target.value },
                    'Rename document',
                  )
                }
                className="min-w-[140px] rounded px-1 py-0.5 text-[14px] font-medium tracking-tight text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)] focus:bg-[var(--xd-rail)] focus:outline-none"
              />
              <button
                type="button"
                aria-label={docState.starred ? 'Remove star' : 'Star document'}
                aria-pressed={docState.starred}
                onClick={() =>
                  emitState(
                    { ...docState, starred: !docState.starred },
                    'Toggle star',
                  )
                }
                className={cn(
                  'inline-flex h-6 w-6 items-center justify-center rounded transition-colors',
                  docState.starred
                    ? 'text-[var(--xd-sketch)]'
                    : 'text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                )}
              >
                <Star
                  className={cn(
                    'h-3.5 w-3.5',
                    docState.starred && 'fill-current',
                  )}
                />
              </button>
              <span className="inline-flex items-center gap-1 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-1.5 py-0.5 text-[10.5px] text-[var(--xd-ink-muted)]">
                <Folder className="h-2.5 w-2.5" />
                {docState.folder}
              </span>
            </div>
            <AppMenuBar menus={menus} className="-ml-1 mt-0.5" />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setShowComments((v) => !v)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded border px-2.5 text-[12px] font-medium transition-colors',
              showComments
                ? 'border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]'
                : 'border-[var(--xd-border)] text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="xd-tabular">{openCommentsCount}</span>
          </button>

          {/* Editing / Suggesting / Viewing mode switcher */}
          <div
            role="group"
            aria-label="Document editing mode"
            className="inline-flex items-center rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] p-0.5 text-[11.5px]"
          >
            {(
              [
                {
                  id: 'editing',
                  label: 'Editing',
                  icon: <Pencil className="h-3 w-3" />,
                },
                {
                  id: 'suggesting',
                  label: 'Suggesting',
                  icon: <Sparkles className="h-3 w-3" />,
                },
                {
                  id: 'viewing',
                  label: 'Viewing',
                  icon: <Eye className="h-3 w-3" />,
                },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={readOnly && m.id !== 'viewing'}
                aria-pressed={editMode === m.id}
                onClick={() => setEditMode(m.id)}
                className={cn(
                  'inline-flex h-6 items-center gap-1 rounded-xs px-2 font-medium transition-colors disabled:opacity-40',
                  editMode === m.id
                    ? m.id === 'suggesting'
                      ? 'bg-[var(--xd-commit-soft)] text-[var(--xd-commit)]'
                      : 'bg-[var(--xd-canvas)] text-[var(--xd-ink)] shadow-2xs'
                    : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]',
                )}
              >
                {m.icon}
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Google Docs Formatting Toolbar */}
      <DocsFormattingToolbar
        format={activeFormat}
        zoom={zoom}
        lineSpacing={docState.pageSetup.lineSpacing}
        paintFormatActive={paintFormat !== null}
        disabled={effectiveReadOnly}
        onUndo={undo}
        onRedo={redo}
        onPrint={() => window.print()}
        onTogglePaintFormat={() => {
          if (paintFormat) {
            setPaintFormat(null)
          } else {
            setPaintFormat({ ...activeFormat })
            showToast('Copied formatting — select text to apply')
          }
        }}
        onZoomChange={setZoom}
        onBlockStyle={applyBlockStyle}
        onFontFamily={applyFontFamily}
        onFontSize={applyFontSize}
        onInlineCommand={(cmd) => exec(cmd)}
        onTextColor={(color) => {
          setActiveFormat((prev) => ({ ...prev, textColor: color }))
          exec('foreColor', color === 'transparent' ? 'inherit' : color)
        }}
        onHighlightColor={(color) => {
          setActiveFormat((prev) => ({ ...prev, highlightColor: color }))
          exec('hiliteColor', color)
        }}
        onLineSpacing={(spacing) =>
          emitState(
            {
              ...docState,
              pageSetup: { ...docState.pageSetup, lineSpacing: spacing },
            },
            `Line spacing ${spacing}`,
          )
        }
        onInsertLink={() => setInsertDialog('link')}
        onAddComment={() =>
          startCommentOrSuggestion(
            editMode === 'suggesting' ? 'suggestion' : 'comment',
          )
        }
        onInsertImage={() => setInsertDialog('image')}
        onInsertTable={insertTable}
        onInsertChecklist={insertChecklist}
        onInsertCallout={insertCallout}
      />

      {/* Main 3-Pane Docs Area */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {showOutline && (
          <DocsOutlineSidebar
            items={outline}
            activeHeadingId={activeHeadingId}
            onSelectHeading={(id) => {
              setActiveHeadingId(id)
              const el = editorRef.current?.querySelector(`#${CSS.escape(id)}`)
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
            onClose={() => setShowOutline(false)}
          />
        )}

        {/* Center Ruler + Paginated Paper Stage */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--xd-rail)]">
          {showRuler && !docState.pageSetup.pageless && (
            <DocsRuler
              pageWidthPx={Math.round((pageWidthPx * zoom) / 100)}
              marginLeftIn={docState.pageSetup.marginLeft}
              marginRightIn={docState.pageSetup.marginRight}
              onMarginsChange={(left, right) =>
                emitState(
                  {
                    ...docState,
                    pageSetup: {
                      ...docState.pageSetup,
                      marginLeft: left,
                      marginRight: right,
                    },
                  },
                  'Adjust margins',
                )
              }
            />
          )}

          {findOpen && (
            <DocsFindReplaceBar
              query={findQuery}
              replaceWith={replaceText}
              matchCase={matchCase}
              matchCount={findMatchCount}
              onQueryChange={setFindQuery}
              onReplaceChange={setReplaceText}
              onToggleMatchCase={() => setMatchCase((v) => !v)}
              onReplaceOne={() => performReplace(false)}
              onReplaceAll={() => performReplace(true)}
              onClose={() => setFindOpen(false)}
            />
          )}

          <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
            <div
              className="mx-auto transition-all"
              style={{
                width: docState.pageSetup.pageless
                  ? '100%'
                  : `${pageWidthPx}px`,
                maxWidth: docState.pageSetup.pageless ? '920px' : undefined,
                transform: zoom !== 100 ? `scale(${zoom / 100})` : undefined,
                transformOrigin: 'top center',
              }}
            >
              <div
                className={cn(
                  'min-h-[920px] bg-[var(--xd-canvas)] text-[var(--xd-ink)]',
                  !docState.pageSetup.pageless &&
                    'rounded-[3px] border border-[var(--xd-border)]',
                )}
                style={{
                  paddingTop: `${docState.pageSetup.marginTop * 64}px`,
                  paddingBottom: `${docState.pageSetup.marginBottom * 64}px`,
                  paddingLeft: `${docState.pageSetup.marginLeft * 72}px`,
                  paddingRight: `${docState.pageSetup.marginRight * 72}px`,
                }}
              >
                {docState.pageSetup.showHeaderFooter &&
                  !docState.pageSetup.pageless && (
                    <div className="mb-6 flex items-center justify-between border-b border-[var(--xd-border-subtle)] pb-2 text-[11px] text-[var(--xd-ink-muted)]">
                      <input
                        type="text"
                        value={docState.pageSetup.headerText}
                        readOnly={effectiveReadOnly}
                        aria-label="Running header"
                        onChange={(e) =>
                          emitState(
                            {
                              ...docState,
                              pageSetup: {
                                ...docState.pageSetup,
                                headerText: e.target.value,
                              },
                            },
                            'Edit header',
                          )
                        }
                        className="w-2/3 bg-transparent text-[11px] text-[var(--xd-ink-muted)] outline-none focus:text-[var(--xd-ink)]"
                      />
                      <span className="xd-tabular">Page 1 of {pageCount}</span>
                    </div>
                  )}

                {editMode === 'suggesting' && (
                  <div className="mb-4 flex items-center justify-between rounded border border-[var(--xd-commit)]/35 bg-[var(--xd-commit-soft)] px-3 py-1.5 text-[11.5px] text-[var(--xd-commit)]">
                    <span>
                      Suggesting mode — highlight text and click Add Comment
                      (⌘⌥M) to propose a tracked replacement.
                    </span>
                    <button
                      type="button"
                      onClick={() => startCommentOrSuggestion('suggestion')}
                      className="rounded border border-[var(--xd-commit)]/40 px-2 py-0.5 font-medium hover:bg-[var(--xd-canvas)]"
                    >
                      Propose edit
                    </button>
                  </div>
                )}

                <div
                  ref={editorRef}
                  data-marble-id="doc-body"
                  contentEditable={!effectiveReadOnly}
                  suppressContentEditableWarning
                  spellCheck
                  role="textbox"
                  aria-multiline="true"
                  aria-label="Document body"
                  onInput={() => syncHtmlFromDom('Edit document')}
                  onKeyUp={refreshSelectionFormat}
                  onMouseUp={() => {
                    refreshSelectionFormat()
                    if (paintFormat && !effectiveReadOnly) {
                      if (paintFormat.bold) document.execCommand('bold')
                      if (paintFormat.italic) document.execCommand('italic')
                      if (paintFormat.underline)
                        document.execCommand('underline')
                      setPaintFormat(null)
                      syncHtmlFromDom('Apply paint format')
                      showToast('Applied formatting')
                    }
                  }}
                  style={{
                    lineHeight: docState.pageSetup.lineSpacing,
                    columnCount: docState.pageSetup.columns,
                    columnGap:
                      docState.pageSetup.columns > 1 ? '2rem' : undefined,
                  }}
                  className={cn(
                    'min-h-[720px] text-[14.5px] text-[var(--xd-ink)] outline-none',
                    '[&_h1]:xd-serif [&_h1]:mb-3 [&_h1]:text-[28px] [&_h1]:font-medium [&_h1]:leading-tight [&_h1]:tracking-tight',
                    '[&_h2]:xd-serif [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-[20px] [&_h2]:font-medium [&_h2]:leading-snug',
                    '[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-[15.5px] [&_h3]:font-semibold',
                    '[&_p]:my-2.5',
                    '[&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6',
                    '[&_ol]:my-2.5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6',
                    '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--xd-accent)] [&_blockquote]:bg-[var(--xd-rail)] [&_blockquote]:px-3.5 [&_blockquote]:py-2.5 [&_blockquote]:text-[13.5px] [&_blockquote]:text-[var(--xd-ink-secondary)]',
                    '[&_code]:xd-mono [&_code]:rounded [&_code]:border [&_code]:border-[var(--xd-border)] [&_code]:bg-[var(--xd-elevated)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12.5px]',
                    '[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px]',
                    '[&_th]:border [&_th]:border-[var(--xd-border)] [&_th]:bg-[var(--xd-rail)] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium',
                    '[&_td]:border [&_td]:border-[var(--xd-border)] [&_td]:px-3 [&_td]:py-2',
                    '[&_hr]:my-6 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-[var(--xd-border)]',
                    '[&_a]:text-[var(--xd-accent)] [&_a]:underline [&_a]:underline-offset-2',
                  )}
                />

                {docState.pageSetup.showHeaderFooter &&
                  !docState.pageSetup.pageless && (
                    <div className="mt-10 flex items-center justify-between border-t border-[var(--xd-border-subtle)] pt-2 text-[11px] text-[var(--xd-ink-muted)]">
                      <input
                        type="text"
                        value={docState.pageSetup.footerText}
                        readOnly={effectiveReadOnly}
                        aria-label="Running footer"
                        onChange={(e) =>
                          emitState(
                            {
                              ...docState,
                              pageSetup: {
                                ...docState.pageSetup,
                                footerText: e.target.value,
                              },
                            },
                            'Edit footer',
                          )
                        }
                        className="w-2/3 bg-transparent text-[11px] text-[var(--xd-ink-muted)] outline-none focus:text-[var(--xd-ink)]"
                      />
                      <span className="xd-tabular">{wordCount} words</span>
                    </div>
                  )}
              </div>
            </div>
          </div>

          {/* Bottom Google Docs Status Bar */}
          <footer className="flex h-7 shrink-0 items-center justify-between border-t border-[var(--xd-border)] bg-[var(--xd-canvas)] px-3 text-[11px] text-[var(--xd-ink-muted)] select-none">
            <div className="flex items-center gap-3">
              {!showOutline && (
                <button
                  type="button"
                  onClick={() => setShowOutline(true)}
                  className="text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]"
                >
                  Show outline
                </button>
              )}
              <span className="xd-tabular">
                {docState.pageSetup.pageless
                  ? 'Pageless'
                  : `Page 1 of ${pageCount}`}
              </span>
              {showLiveWordCount && (
                <button
                  type="button"
                  onClick={() => setWordCountOpen(true)}
                  className="xd-tabular hover:text-[var(--xd-ink)]"
                >
                  {wordCount} words
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="capitalize">{editMode} mode</span>
              <span className="xd-tabular">{zoom}%</span>
            </div>
          </footer>
        </div>

        {showComments && (
          <DocsCommentsPanel
            comments={docState.comments}
            draftQuote={draftCommentQuote}
            draftKind={draftCommentKind}
            onCancelDraft={() => setDraftCommentQuote(null)}
            onSubmitDraft={submitDraftComment}
            onReply={(commentId, body) => {
              const nextComments = docState.comments.map((c) =>
                c.id === commentId
                  ? {
                      ...c,
                      replies: [
                        ...c.replies,
                        {
                          id: `rep-${Math.random().toString(36).slice(2, 7)}`,
                          author: 'You',
                          initials: 'YO',
                          body,
                          createdAt: new Date().toISOString(),
                        },
                      ],
                    }
                  : c,
              )
              emitState(
                { ...docState, comments: nextComments },
                'Reply to comment',
              )
            }}
            onToggleResolve={(commentId) => {
              const nextComments = docState.comments.map((c) =>
                c.id === commentId ? { ...c, resolved: !c.resolved } : c,
              )
              emitState(
                { ...docState, comments: nextComments },
                'Resolve comment',
              )
            }}
            onAcceptSuggestion={acceptSuggestion}
            onDeleteComment={(commentId) => {
              const nextComments = docState.comments.filter(
                (c) => c.id !== commentId,
              )
              emitState(
                { ...docState, comments: nextComments },
                'Delete comment',
              )
            }}
            onClose={() => setShowComments(false)}
          />
        )}
      </div>

      {/* Modals */}
      <DocsWordCountModal
        open={wordCountOpen}
        pages={pageCount}
        words={wordCount}
        characters={charCount}
        charactersNoSpaces={charNoSpaces}
        showLiveWordCount={showLiveWordCount}
        onToggleLiveWordCount={() => setShowLiveWordCount((v) => !v)}
        onClose={() => setWordCountOpen(false)}
      />

      <DocsPageSetupModal
        open={pageSetupOpen}
        setup={docState.pageSetup}
        onSave={(nextSetup) =>
          emitState({ ...docState, pageSetup: nextSetup }, 'Update page setup')
        }
        onClose={() => setPageSetupOpen(false)}
      />

      <DocsInsertDialog
        kind={insertDialog}
        initialLabel={
          typeof window !== 'undefined'
            ? window.getSelection()?.toString().trim() || ''
            : ''
        }
        onSubmit={(url, label) => {
          if (insertDialog === 'link') {
            const safeUrl = url || 'https://example.com'
            insertHtml(
              `<a href="${safeUrl}" target="_blank" rel="noreferrer">${label}</a>`,
              'Insert link',
            )
          } else if (insertDialog === 'image') {
            if (url) {
              insertHtml(
                `<figure style="margin:1rem 0;"><img src="${url}" alt="${label}" style="max-width:100%;border-radius:6px;border:1px solid var(--xd-border);"/><figcaption style="font-size:12px;color:var(--xd-ink-muted);margin-top:4px;">${label}</figcaption></figure><p><br></p>`,
                'Insert image',
              )
            } else {
              insertHtml(
                `<figure style="margin:1rem 0;padding:1.25rem;border:1px solid var(--xd-border);border-radius:6px;background:var(--xd-rail);text-align:center;"><div style="font-size:12.5px;font-weight:500;">${label}</div><div style="font-size:11.5px;color:var(--xd-ink-muted);margin-top:4px;">Embedded diagram placeholder — replace with SVG or figure URL</div></figure><p><br></p>`,
                'Insert figure',
              )
            }
          }
        }}
        onClose={() => setInsertDialog(null)}
      />

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
