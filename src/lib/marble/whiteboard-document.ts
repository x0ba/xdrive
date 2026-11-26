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

/** Replace the snapshot script and leave the rest of the file untouched. */
export function withWhiteboardSnapshot(
  source: string,
  snapshot: unknown,
): string {
  const script = whiteboardStateScript(snapshot)
  if (SCRIPT_RE.test(source)) return source.replace(SCRIPT_RE, script)
  if (/<\/body>/i.test(source)) {
    return source.replace(/<\/body>/i, `${script}\n</body>`)
  }
  return `${source}\n${script}\n`
}
