import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands'
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
} from '@codemirror/language'
import { linter } from '@codemirror/lint'
import type { Diagnostic } from '@codemirror/lint'
import {
  highlightSelectionMatches,
  openSearchPanel,
  searchKeymap,
} from '@codemirror/search'
import { Compartment, EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import {
  createLatexCompletionSource,
  createXDriveEditorTheme,
  latexSyntaxSupport,
} from './latexLanguage'
import type { LatexAutocompleteData } from './latexLanguage'
import type { LatexDiagnostic } from './types'

export interface LatexCodeEditorHandle {
  focus: () => void
  jumpToLine: (line: number) => void
  insertText: (snippet: string, cursorOffsetBack?: number) => void
  wrapSelection: (before: string, after: string, placeholder?: string) => void
  toggleComment: () => void
  openFind: () => void
  getCursorLine: () => number
}

export interface LatexCodeEditorProps {
  filePath: string
  value: string
  onChange: (nextValue: string) => void
  readOnly?: boolean
  wordWrap?: boolean
  fontSize?: number
  diagnostics?: LatexDiagnostic[]
  autocompleteData: LatexAutocompleteData
  onCursorChange?: (pos: { line: number; col: number }) => void
  onTriggerCompile?: () => void
}

export const LatexCodeEditor = forwardRef<
  LatexCodeEditorHandle,
  LatexCodeEditorProps
>(function LatexCodeEditor(
  {
    filePath,
    value,
    onChange,
    readOnly = false,
    wordWrap = true,
    fontSize = 13,
    diagnostics = [],
    autocompleteData,
    onCursorChange,
    onTriggerCompile,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onCursorRef = useRef(onCursorChange)
  onCursorRef.current = onCursorChange
  const onCompileRef = useRef(onTriggerCompile)
  onCompileRef.current = onTriggerCompile
  const autoDataRef = useRef(autocompleteData)
  autoDataRef.current = autocompleteData
  const diagnosticsRef = useRef(diagnostics)
  diagnosticsRef.current = diagnostics
  const filePathRef = useRef(filePath)
  filePathRef.current = filePath

  const wrapCompartment = useRef(new Compartment())
  const themeCompartment = useRef(new Compartment())
  const readOnlyCompartment = useRef(new Compartment())
  const lintCompartment = useRef(new Compartment())

  const makeLintExtension = () =>
    linter(
      (view) => {
        const list: Diagnostic[] = []
        const activeDiags = diagnosticsRef.current.filter(
          (d) => d.file === filePathRef.current,
        )
        const doc = view.state.doc
        for (const d of activeDiags) {
          const safeLine = Math.max(1, Math.min(doc.lines, d.line))
          const lineObj = doc.line(safeLine)
          const from = lineObj.from
          const to = Math.max(lineObj.to, from)
          list.push({
            from,
            to,
            severity: d.severity === 'error' ? 'error' : 'warning',
            message: d.message,
          })
        }
        return list
      },
      { delay: 80 },
    )

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const completionSource = createLatexCompletionSource(
      () => autoDataRef.current,
    )

    const compileShortcutKeymap = keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          onCompileRef.current?.()
          return true
        },
      },
      {
        key: 'Mod-Enter',
        run: () => {
          onCompileRef.current?.()
          return true
        },
      },
      {
        key: 'Mod-/',
        run: (view) => {
          toggleLatexCommentInView(view)
          return true
        },
      },
    ])

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        foldGutter(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        latexSyntaxSupport,
        autocompletion({
          override: [completionSource],
          activateOnTyping: true,
          icons: false,
        }),
        compileShortcutKeymap,
        keymap.of([
          ...closeBracketsKeymap,
          ...completionKeymap,
          ...searchKeymap,
          ...foldKeymap,
          ...historyKeymap,
          ...defaultKeymap,
          indentWithTab,
        ]),
        wrapCompartment.current.of(wordWrap ? EditorView.lineWrapping : []),
        themeCompartment.current.of(createXDriveEditorTheme(fontSize)),
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
        lintCompartment.current.of(makeLintExtension()),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head
            const lineObj = update.state.doc.lineAt(head)
            onCursorRef.current?.({
              line: lineObj.number,
              col: head - lineObj.from + 1,
            })
          }
        }),
      ],
    })

    const view = new EditorView({ state, parent: host })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Re-create editor cleanly when switching active file so history stays per-session
  }, [filePath])

  // Sync external value changes (e.g. AI edits or template load) without resetting cursor if identical
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapCompartment.current.reconfigure(
        wordWrap ? EditorView.lineWrapping : [],
      ),
    })
  }, [wordWrap])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(
        createXDriveEditorTheme(fontSize),
      ),
    })
  }, [fontSize])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        EditorState.readOnly.of(readOnly),
      ),
    })
  }, [readOnly])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: lintCompartment.current.reconfigure(makeLintExtension()),
    })
  }, [diagnostics, filePath])

  useImperativeHandle(ref, () => ({
    focus() {
      viewRef.current?.focus()
    },
    jumpToLine(line: number) {
      const view = viewRef.current
      if (!view) return
      const safeLine = Math.max(1, Math.min(view.state.doc.lines, line))
      const lineObj = view.state.doc.line(safeLine)
      view.dispatch({
        selection: { anchor: lineObj.from, head: lineObj.to },
        effects: EditorView.scrollIntoView(lineObj.from, { y: 'center' }),
      })
      view.focus()
    },
    insertText(snippet: string, cursorOffsetBack = 0) {
      const view = viewRef.current
      if (!view || readOnly) return
      const sel = view.state.selection.main
      const nextCursor = sel.from + snippet.length - cursorOffsetBack
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: snippet },
        selection: { anchor: Math.max(sel.from, nextCursor) },
      })
      view.focus()
    },
    wrapSelection(before: string, after: string, placeholder = 'text') {
      const view = viewRef.current
      if (!view || readOnly) return
      const sel = view.state.selection.main
      const selected = view.state.doc.sliceString(sel.from, sel.to)
      const inner = selected || placeholder
      const insert = `${before}${inner}${after}`
      const anchor = sel.from + before.length
      const head = anchor + inner.length
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert },
        selection: { anchor, head },
      })
      view.focus()
    },
    toggleComment() {
      const view = viewRef.current
      if (!view || readOnly) return
      toggleLatexCommentInView(view)
      view.focus()
    },
    openFind() {
      const view = viewRef.current
      if (!view) return
      openSearchPanel(view)
    },
    getCursorLine() {
      const view = viewRef.current
      if (!view) return 1
      return view.state.doc.lineAt(view.state.selection.main.head).number
    },
  }))

  return (
    <div
      ref={hostRef}
      data-marble-id="latex-code-editor"
      aria-label={`LaTeX source editor for ${filePath}`}
      className="h-full min-h-0 w-full overflow-hidden bg-[var(--xd-canvas)]"
    />
  )
})

function toggleLatexCommentInView(view: EditorView) {
  const { from, to } = view.state.selection.main
  const startLine = view.state.doc.lineAt(from).number
  const endLine = view.state.doc.lineAt(to).number
  const lines: Array<{ number: number; from: number; text: string }> = []
  let allCommented = true

  for (let n = startLine; n <= endLine; n++) {
    const l = view.state.doc.line(n)
    lines.push({ number: n, from: l.from, text: l.text })
    if (!/^\s*%/.test(l.text)) {
      allCommented = false
    }
  }

  const changes = lines.map((l) => {
    if (allCommented) {
      const match = l.text.match(/^(\s*)%\s?/)
      if (!match) return { from: l.from, to: l.from, insert: '' }
      return {
        from: l.from + match[1].length,
        to: l.from + match[0].length,
        insert: '',
      }
    }
    return { from: l.from, to: l.from, insert: '% ' }
  })

  view.dispatch({ changes })
}
