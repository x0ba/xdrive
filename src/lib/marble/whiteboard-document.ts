import type { MarbleAppCategory } from '#/lib/types'

/**
 * Whiteboard bytes inside a .mrbl file.
 *
 * The tldraw snapshot is the only copy of the drawing. The HTML around it is
 * the title and a short description so the file still opens as a document.
 * Shape geometry is not repeated in the markup.
 */

export const WHITEBOARD_STATE_ATTR = 'data-marble-whiteboard-state'

const SCRIPT_RE =
  /<script type="application\/json" data-marble-whiteboard-state="1">[\s\S]*?<\/script>/

const READ_RE =
  /<script type="application\/json" data-marble-whiteboard-state="1">([\s\S]*?)<\/script>/

export function whiteboardStateScript(snapshot: unknown): string {
  const json = JSON.stringify(snapshot ?? null).replace(/<\//g, '<\\/')
  return `<script type="application/json" data-marble-whiteboard-state="1">${json}</script>`
}

export function isWhiteboardMarbleSource(source: string): boolean {
  return (
    source.includes(`${WHITEBOARD_STATE_ATTR}="1"`) ||
    source.includes(`${WHITEBOARD_STATE_ATTR}='1'`)
  )
}

/** A tldraw editor snapshot has a document record. `null` is a blank board. */
export function isWhiteboardEditorSnapshot(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const documentRecord = (value as { document?: unknown }).document
  return Boolean(documentRecord && typeof documentRecord === 'object')
}

export function readWhiteboardSnapshot(source: string): unknown | null {
  const match = source.match(READ_RE)
  if (!match) return null
  const raw = match[1].replace(/<\\\//g, '</').trim()
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

/**
 * A replacement string would treat `$&`, `$'`, and `$$` inside drawing JSON
 * as special patterns and corrupt the file. A function return is literal.
 */
function literalReplace(replacement: string): () => string {
  return () => replacement
}

/** Replace the snapshot script and leave the rest of the file untouched. */
export function withWhiteboardSnapshot(
  source: string,
  snapshot: unknown,
): string {
  const script = whiteboardStateScript(snapshot)
  if (SCRIPT_RE.test(source)) {
    return source.replace(SCRIPT_RE, literalReplace(script))
  }
  if (/<\/body>/i.test(source)) {
    return source.replace(/<\/body>/i, literalReplace(`${script}\n</body>`))
  }
  return `${source}\n${script}\n`
}

export type WhiteboardSnapshotSync = 'keep' | 'blank' | 'load'

/**
 * How an open canvas should follow the file.
 * JSON `null`, a missing script, and unreadable JSON are a blank board.
 * Ignoring them leaves old shapes on screen, and the next edit writes those
 * shapes back over the blank file.
 */
export function whiteboardSnapshotSync(
  fileSnapshot: unknown,
  canvasSnapshot: unknown,
): WhiteboardSnapshotSync {
  if (!isWhiteboardEditorSnapshot(fileSnapshot)) {
    return isWhiteboardEditorSnapshot(canvasSnapshot) ? 'blank' : 'keep'
  }
  const fileDocument = (fileSnapshot as { document: unknown }).document
  const canvasDocument = isWhiteboardEditorSnapshot(canvasSnapshot)
    ? (canvasSnapshot as { document: unknown }).document
    : null
  if (JSON.stringify(fileDocument) === JSON.stringify(canvasDocument)) {
    return 'keep'
  }
  return 'load'
}

/**
 * An AI file is a whiteboard only when it carries a tldraw editor snapshot.
 * HTML with no snapshot would open as an empty canvas, so it stays a normal app.
 */
export function categoryForAiWhiteboard(
  category: MarbleAppCategory,
  source: string,
): MarbleAppCategory {
  if (category !== 'whiteboard') return category
  if (isWhiteboardEditorSnapshot(readWhiteboardSnapshot(source))) {
    return 'whiteboard'
  }
  return 'custom'
}
