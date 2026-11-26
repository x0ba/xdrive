import { useEffect, useRef } from 'react'
import { Tldraw } from 'tldraw'
import type { Editor, TLEditorSnapshot } from 'tldraw'
import 'tldraw/tldraw.css'
import {
  isWhiteboardEditorSnapshot,
  readWhiteboardSnapshot,
  whiteboardSnapshotSync,
  withWhiteboardSnapshot,
} from '#/lib/marble/whiteboard-document'

const SAVE_DEBOUNCE_MS = 300

export interface WhiteboardCanvasProps {
  marbleSource: string
  readOnly: boolean
  onDraft: () => void
  onDraftClear: () => void
  onCommit: (nextSource: string, label: string) => boolean
}

export function WhiteboardCanvas({
  marbleSource,
  readOnly,
  onDraft,
  onDraftClear,
  onCommit,
}: WhiteboardCanvasProps) {
  const editorRef = useRef<Editor | null>(null)
  const marbleSourceRef = useRef(marbleSource)
  const readOnlyRef = useRef(readOnly)
  const onDraftRef = useRef(onDraft)
  const onDraftClearRef = useRef(onDraftClear)
  const onCommitRef = useRef(onCommit)
  const latestSnapshotRef = useRef<TLEditorSnapshot | null>(null)
  const dirtyRef = useRef(false)
  const generationRef = useRef(0)
  const suppressRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  marbleSourceRef.current = marbleSource
  readOnlyRef.current = readOnly
  onDraftRef.current = onDraft
  onDraftClearRef.current = onDraftClear
  onCommitRef.current = onCommit

  function clearTimer() {
    if (timerRef.current === null) return
    window.clearTimeout(timerRef.current)
    timerRef.current = null
  }

  function schedule(delay = SAVE_DEBOUNCE_MS) {
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      flush()
    }, delay)
  }

  function applySnapshot(editor: Editor, snapshot: unknown) {
    if (!isWhiteboardEditorSnapshot(snapshot)) {
      const ids = [...editor.getCurrentPageShapeIds()]
      if (ids.length > 0) editor.deleteShapes(ids)
      return
    }
    editor.store.mergeRemoteChanges(() => {
      editor.loadSnapshot(snapshot as TLEditorSnapshot)
    })
  }

  function revertTo(source: string) {
    const editor = editorRef.current
    if (!editor) return
    suppressRef.current = true
    try {
      editor.updateInstanceState({ isReadonly: false })
      applySnapshot(editor, readWhiteboardSnapshot(source))
      latestSnapshotRef.current = editor.getSnapshot()
    } catch {
      // A snapshot this tldraw build cannot load leaves the blank board.
    } finally {
      suppressRef.current = false
      editor.updateInstanceState({ isReadonly: readOnlyRef.current })
    }
  }

  function flush(): boolean {
    clearTimer()
    if (!dirtyRef.current) return true
    const snapshot = latestSnapshotRef.current
    const base = marbleSourceRef.current
    if (!snapshot || !base) {
      dirtyRef.current = false
      onDraftClearRef.current()
      return true
    }
    const seen = generationRef.current
    const next = withWhiteboardSnapshot(base, snapshot)
    if (generationRef.current !== seen) {
      schedule(0)
      return true
    }
    if (next === base) {
      dirtyRef.current = false
      onDraftClearRef.current()
      return true
    }
    const normalized = readWhiteboardSnapshot(next)
    if (isWhiteboardEditorSnapshot(normalized)) {
      latestSnapshotRef.current = normalized as TLEditorSnapshot
    }
    const accepted = onCommitRef.current(next, 'Edit whiteboard')
    if (generationRef.current !== seen) {
      dirtyRef.current = true
      if (accepted) onDraftRef.current()
      schedule(0)
      return accepted
    }
    if (!accepted) {
      dirtyRef.current = false
      revertTo(base)
      return false
    }
    dirtyRef.current = false
    return true
  }

  const flushRef = useRef(flush)
  flushRef.current = flush
  const revertRef = useRef(revertTo)
  revertRef.current = revertTo

  useEffect(() => {
    return () => {
      flushRef.current()
    }
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (readOnly) {
      const accepted = flushRef.current()
      if (!accepted) revertRef.current(marbleSourceRef.current)
    }
    editor.updateInstanceState({ isReadonly: readOnly })
  }, [readOnly])

  useEffect(() => {
    if (!editorRef.current || dirtyRef.current) return
    const incoming = readWhiteboardSnapshot(marbleSource)
    const action = whiteboardSnapshotSync(incoming, latestSnapshotRef.current)
    if (action === 'keep') return
    revertRef.current(marbleSource)
  }, [marbleSource])

  return (
    <div
      data-testid="whiteboard-canvas"
      className="absolute inset-0"
      onPointerUpCapture={() => {
        requestAnimationFrame(() => flushRef.current())
      }}
    >
      <Tldraw
        onMount={(editor) => {
          editorRef.current = editor
          editor.updateInstanceState({ isReadonly: readOnlyRef.current })
          const initial = readWhiteboardSnapshot(marbleSourceRef.current)
          if (isWhiteboardEditorSnapshot(initial)) {
            suppressRef.current = true
            try {
              applySnapshot(editor, initial)
            } catch {
              // Keep the blank document tldraw created.
            } finally {
              suppressRef.current = false
            }
          }
          latestSnapshotRef.current = editor.getSnapshot()
          const unlisten = editor.store.listen(
            () => {
              if (suppressRef.current || readOnlyRef.current) return
              generationRef.current += 1
              latestSnapshotRef.current = editor.getSnapshot()
              dirtyRef.current = true
              onDraftRef.current()
              schedule()
            },
            { source: 'user', scope: 'document' },
          )
          return () => {
            unlisten()
            if (editorRef.current === editor) editorRef.current = null
          }
        }}
      />
    </div>
  )
}

export default WhiteboardCanvas
