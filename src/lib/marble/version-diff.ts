import { inspectMarbleNodes } from './engine-client'
import {
  isWhiteboardEditorSnapshot,
  isWhiteboardMarbleSource,
  readWhiteboardSnapshot,
} from './whiteboard-document'

export type DiffLineKind = 'context' | 'added' | 'removed'

export interface DiffLine {
  kind: DiffLineKind
  text: string
  oldLine: number | null
  newLine: number | null
}

export interface DiffHunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  skippedBefore: number
  lines: DiffLine[]
}

export interface TextDiffResult {
  lines: DiffLine[]
  hunks: DiffHunk[]
  addedLines: number
  removedLines: number
  unchangedLines: number
  hasChanges: boolean
}

export interface MarbleNodeChange {
  id: string
  tagName: string
  status: 'added' | 'removed' | 'modified'
  pastText?: string
  currentText?: string
}

export interface MarbleDocumentDiffResult {
  structuredDiff: TextDiffResult
  sourceDiff: TextDiffResult
  nodeChanges: MarbleNodeChange[]
  hasChanges: boolean
}

export interface WhiteboardDiffSummary {
  pastShapeCount: number
  currentShapeCount: number
  pastPageCount: number
  currentPageCount: number
  addedCount: number
  removedCount: number
  modifiedCount: number
  addedByType: Record<string, number>
  removedByType: Record<string, number>
  modifiedByType: Record<string, number>
  summaryLines: string[]
  hasChanges: boolean
}

const CONTEXT_LINES = 3
const MAX_LCS_CELLS = 2_500_000

function splitLines(text: string): string[] {
  if (!text) return []
  return text.replace(/\r\n/g, '\n').split('\n')
}

function buildHunks(lines: DiffLine[]): DiffHunk[] {
  const changeIndices: number[] = []
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].kind !== 'context') changeIndices.push(i)
  }
  if (changeIndices.length === 0) return []

  const ranges: Array<{ start: number; end: number }> = []
  for (const idx of changeIndices) {
    const start = Math.max(0, idx - CONTEXT_LINES)
    const end = Math.min(lines.length - 1, idx + CONTEXT_LINES)
    const prev = ranges.at(-1)
    if (prev && start <= prev.end + 1) {
      prev.end = Math.max(prev.end, end)
    } else {
      ranges.push({ start, end })
    }
  }

  let lastEnd = -1
  return ranges.map((range) => {
    const slice = lines.slice(range.start, range.end + 1)
    const skippedBefore = range.start - (lastEnd + 1)
    lastEnd = range.end
    const firstOld = slice.find((l) => l.oldLine !== null)?.oldLine ?? 1
    const firstNew = slice.find((l) => l.newLine !== null)?.newLine ?? 1
    const oldCount = slice.filter((l) => l.kind !== 'added').length
    const newCount = slice.filter((l) => l.kind !== 'removed').length
    return {
      oldStart: firstOld,
      oldCount,
      newStart: firstNew,
      newCount,
      skippedBefore,
      lines: slice,
    }
  })
}

export function computeLineDiff(
  oldText: string,
  newText: string,
): TextDiffResult {
  const oldLines = splitLines(oldText)
  const newLines = splitLines(newText)

  if (oldText === newText) {
    const contextLines: DiffLine[] = oldLines.map((text, idx) => ({
      kind: 'context',
      text,
      oldLine: idx + 1,
      newLine: idx + 1,
    }))
    return {
      lines: contextLines,
      hunks: [],
      addedLines: 0,
      removedLines: 0,
      unchangedLines: contextLines.length,
      hasChanges: false,
    }
  }

  let prefixLen = 0
  while (
    prefixLen < oldLines.length &&
    prefixLen < newLines.length &&
    oldLines[prefixLen] === newLines[prefixLen]
  ) {
    prefixLen += 1
  }

  let oldEnd = oldLines.length - 1
  let newEnd = newLines.length - 1
  while (
    oldEnd >= prefixLen &&
    newEnd >= prefixLen &&
    oldLines[oldEnd] === newLines[newEnd]
  ) {
    oldEnd -= 1
    newEnd -= 1
  }

  const midOld = oldLines.slice(prefixLen, oldEnd + 1)
  const midNew = newLines.slice(prefixLen, newEnd + 1)

  const lines: DiffLine[] = []
  for (let i = 0; i < prefixLen; i += 1) {
    lines.push({
      kind: 'context',
      text: oldLines[i],
      oldLine: i + 1,
      newLine: i + 1,
    })
  }

  const m = midOld.length
  const n = midNew.length
  if (m === 0 || n === 0) {
    for (let i = 0; i < m; i += 1) {
      lines.push({
        kind: 'removed',
        text: midOld[i],
        oldLine: prefixLen + i + 1,
        newLine: null,
      })
    }
    for (let j = 0; j < n; j += 1) {
      lines.push({
        kind: 'added',
        text: midNew[j],
        oldLine: null,
        newLine: prefixLen + j + 1,
      })
    }
  } else if (m * n <= MAX_LCS_CELLS) {
    const dp = new Int32Array((m + 1) * (n + 1))
    const stride = n + 1
    for (let i = m - 1; i >= 0; i -= 1) {
      const rowOffset = i * stride
      const nextRowOffset = (i + 1) * stride
      for (let j = n - 1; j >= 0; j -= 1) {
        if (midOld[i] === midNew[j]) {
          dp[rowOffset + j] = dp[nextRowOffset + j + 1] + 1
        } else {
          const down = dp[nextRowOffset + j]
          const right = dp[rowOffset + j + 1]
          dp[rowOffset + j] = down >= right ? down : right
        }
      }
    }

    let i = 0
    let j = 0
    while (i < m && j < n) {
      if (midOld[i] === midNew[j]) {
        lines.push({
          kind: 'context',
          text: midOld[i],
          oldLine: prefixLen + i + 1,
          newLine: prefixLen + j + 1,
        })
        i += 1
        j += 1
      } else if (dp[(i + 1) * stride + j] >= dp[i * stride + j + 1]) {
        lines.push({
          kind: 'removed',
          text: midOld[i],
          oldLine: prefixLen + i + 1,
          newLine: null,
        })
        i += 1
      } else {
        lines.push({
          kind: 'added',
          text: midNew[j],
          oldLine: null,
          newLine: prefixLen + j + 1,
        })
        j += 1
      }
    }
    while (i < m) {
      lines.push({
        kind: 'removed',
        text: midOld[i],
        oldLine: prefixLen + i + 1,
        newLine: null,
      })
      i += 1
    }
    while (j < n) {
      lines.push({
        kind: 'added',
        text: midNew[j],
        oldLine: null,
        newLine: prefixLen + j + 1,
      })
      j += 1
    }
  } else {
    for (let i = 0; i < m; i += 1) {
      lines.push({
        kind: 'removed',
        text: midOld[i],
        oldLine: prefixLen + i + 1,
        newLine: null,
      })
    }
    for (let j = 0; j < n; j += 1) {
      lines.push({
        kind: 'added',
        text: midNew[j],
        oldLine: null,
        newLine: prefixLen + j + 1,
      })
    }
  }

  for (let k = oldEnd + 1; k < oldLines.length; k += 1) {
    const newIdx = newEnd + 1 + (k - (oldEnd + 1))
    lines.push({
      kind: 'context',
      text: oldLines[k],
      oldLine: k + 1,
      newLine: newIdx + 1,
    })
  }

  let addedLines = 0
  let removedLines = 0
  let unchangedLines = 0
  for (const line of lines) {
    if (line.kind === 'added') addedLines += 1
    else if (line.kind === 'removed') removedLines += 1
    else unchangedLines += 1
  }

  return {
    lines,
    hunks: buildHunks(lines),
    addedLines,
    removedLines,
    unchangedLines,
    hasChanges: addedLines > 0 || removedLines > 0,
  }
}

const NAMED_HTML_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decodeCodePoint(cp: number, raw: string): string {
  if (!Number.isInteger(cp) || cp < 0 || cp > 0x10ffff) return raw
  try {
    return String.fromCodePoint(cp)
  } catch {
    return raw
  }
}

function decodeHtmlEntities(input: string): string {
  return input.replace(
    /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/g,
    (full, entity: string) => {
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        return decodeCodePoint(Number.parseInt(entity.slice(2), 16), full)
      }
      if (entity.startsWith('#')) {
        return decodeCodePoint(Number.parseInt(entity.slice(1), 10), full)
      }
      return NAMED_HTML_ENTITIES[entity.toLowerCase()] ?? full
    },
  )
}

function htmlToStructuredLines(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
  const withBreaks = withoutScripts
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(
      /<\/(p|h1|h2|h3|h4|h5|h6|li|tr|blockquote|section|article|div|pre)>/gi,
      '\n',
    )
    .replace(/<(li)\b[^>]*>/gi, '- ')
    .replace(/<\/t[dh]>/gi, ' | ')
  const stripped = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, ''))
  return stripped
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
}

function readEmbeddedJsonScript(
  source: string,
  attrName: string,
): unknown | null {
  const escaped = attrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(
    `<script[^>]*${escaped}=["']1["'][^>]*>([\\s\\S]*?)<\\/script>`,
    'i',
  )
  const match = source.match(re)
  if (!match) return null
  const raw = match[1].replace(/<\\\//g, '</').trim()
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function readLiveDocBodyHtml(source: string): string | null {
  const openRe =
    /<([A-Za-z][\w:-]*)\b[^>]*\bdata-marble-id\s*=\s*(["'])doc-body\2[^>]*>/i
  const open = openRe.exec(source)
  if (!open) return null
  const tag = open[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const innerStart = open.index + open[0].length
  const tagRe = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi')
  tagRe.lastIndex = innerStart
  let depth = 1
  let match: RegExpExecArray | null
  while ((match = tagRe.exec(source)) !== null) {
    if (match[0].endsWith('/>')) continue
    if (match[1] === '/') {
      depth -= 1
      if (depth === 0) {
        const inner = source.slice(innerStart, match.index).trim()
        return inner.length > 0 ? inner : null
      }
    } else {
      depth += 1
    }
  }
  return null
}

export function extractStructuredMarbleText(source: string): string {
  if (!source.trim()) return ''

  if (isWhiteboardMarbleSource(source)) {
    const title = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()
    const snapshot = readWhiteboardSnapshot(source)
    if (!isWhiteboardEditorSnapshot(snapshot)) {
      return [
        title ? `Title: ${decodeHtmlEntities(title)}` : null,
        'Empty whiteboard',
      ]
        .filter(Boolean)
        .join('\n')
    }
    const store =
      (
        snapshot as {
          document?: {
            store?: Record<string, Record<string, unknown> | undefined>
          }
        }
      ).document?.store ?? {}
    const pages = Object.values(store).filter((r) => r?.typeName === 'page')
    const shapes = Object.values(store).filter(
      (r): r is Record<string, unknown> => r?.typeName === 'shape',
    )
    const shapeLines = shapes
      .map((shape) => {
        const type = typeof shape.type === 'string' ? shape.type : 'shape'
        const id = typeof shape.id === 'string' ? shape.id : ''
        return `- [${type}] ${id}`
      })
      .sort()
    return [
      title ? `Title: ${decodeHtmlEntities(title)}` : null,
      `Pages: ${pages.length}`,
      `Shapes: ${shapes.length}`,
      ...shapeLines,
    ]
      .filter(Boolean)
      .join('\n')
  }

  const latexState = readEmbeddedJsonScript(source, 'data-marble-latex-state')
  if (latexState && typeof latexState === 'object') {
    const rec = latexState as {
      title?: unknown
      files?: Array<{ path?: unknown; content?: unknown } | null | undefined>
    }
    const parts: string[] = []
    if (typeof rec.title === 'string' && rec.title.trim()) {
      parts.push(`# ${rec.title.trim()}`)
    }
    if (Array.isArray(rec.files)) {
      for (const file of rec.files) {
        const filePath = typeof file?.path === 'string' ? file.path : 'file.tex'
        const content = typeof file?.content === 'string' ? file.content : ''
        parts.push(`=== ${filePath} ===`)
        if (content.trim()) parts.push(content.trimEnd())
      }
      if (parts.length > 0) return parts.join('\n')
    }
  }

  const notesState = readEmbeddedJsonScript(source, 'data-marble-notes-state')
  if (notesState && typeof notesState === 'object') {
    const rec = notesState as {
      notes?: Array<
        { title?: unknown; folder?: unknown; body?: unknown } | null | undefined
      >
    }
    if (Array.isArray(rec.notes)) {
      const parts: string[] = []
      for (const note of rec.notes) {
        const title =
          typeof note?.title === 'string' && note.title.trim()
            ? note.title.trim()
            : 'Untitled note'
        const folder =
          typeof note?.folder === 'string' && note.folder.trim()
            ? ` [${note.folder.trim()}]`
            : ''
        parts.push(`## ${title}${folder}`)
        if (typeof note?.body === 'string' && note.body.trim()) {
          parts.push(note.body.trimEnd())
        }
      }
      if (parts.length > 0) return parts.join('\n')
    }
  }

  const slidesState = readEmbeddedJsonScript(source, 'data-marble-slides-state')
  if (slidesState && typeof slidesState === 'object') {
    const rec = slidesState as {
      title?: unknown
      slides?: Array<
        | {
            title?: unknown
            speakerNotes?: unknown
            elements?: Array<{ text?: unknown } | null | undefined>
          }
        | null
        | undefined
      >
    }
    const parts: string[] = []
    if (typeof rec.title === 'string' && rec.title.trim()) {
      parts.push(`# ${rec.title.trim()}`)
    }
    if (Array.isArray(rec.slides)) {
      rec.slides.forEach((slide, index) => {
        const title =
          typeof slide?.title === 'string' && slide.title.trim()
            ? slide.title.trim()
            : `Slide ${index + 1}`
        parts.push(`## Slide ${index + 1}: ${title}`)
        if (Array.isArray(slide?.elements)) {
          for (const el of slide.elements) {
            if (typeof el?.text === 'string' && el.text.trim()) {
              parts.push(el.text.trim())
            }
          }
        }
        if (
          typeof slide?.speakerNotes === 'string' &&
          slide.speakerNotes.trim()
        ) {
          parts.push(`Speaker notes: ${slide.speakerNotes.trim()}`)
        }
      })
      if (parts.length > 0) return parts.join('\n')
    }
  }

  const docsState = readEmbeddedJsonScript(source, 'data-marble-docs-state')
  if (docsState && typeof docsState === 'object') {
    const rec = docsState as { title?: unknown; html?: unknown }
    const parts: string[] = []
    if (typeof rec.title === 'string' && rec.title.trim()) {
      parts.push(`# ${rec.title.trim()}`)
    }
    const liveBody = readLiveDocBodyHtml(source)
    const embeddedHtml = typeof rec.html === 'string' ? rec.html : ''
    const html = liveBody ?? embeddedHtml
    if (html.trim()) {
      const bodyLines = htmlToStructuredLines(html)
      if (bodyLines) parts.push(bodyLines)
    }
    if (parts.length > 0) return parts.join('\n')
  }

  try {
    const nodes = inspectMarbleNodes(source)
    const leafish = nodes
      .map((node) => ({
        id: node.id,
        tagName: node.tagName,
        text: node.text.replace(/\s+/g, ' ').trim(),
      }))
      .filter((node) => node.text.length > 0)
    if (leafish.length > 0) {
      return leafish
        .map((node) => `#${node.id} (${node.tagName}): ${node.text}`)
        .join('\n')
    }
  } catch {
    // Fall back to plain HTML stripping below.
  }

  return htmlToStructuredLines(source)
}

export function diffMarbleDocuments(
  pastSource: string,
  currentSource: string,
): MarbleDocumentDiffResult {
  const pastStructured = extractStructuredMarbleText(pastSource)
  const currentStructured = extractStructuredMarbleText(currentSource)
  const structuredDiff = computeLineDiff(pastStructured, currentStructured)
  const sourceDiff = computeLineDiff(pastSource, currentSource)

  const nodeChanges: MarbleNodeChange[] = []
  try {
    const pastNodes = inspectMarbleNodes(pastSource)
    const currentNodes = inspectMarbleNodes(currentSource)
    const pastById = new Map(pastNodes.map((n) => [n.id, n]))
    const currentById = new Map(currentNodes.map((n) => [n.id, n]))

    for (const node of currentNodes) {
      const prev = pastById.get(node.id)
      const curText = node.text.replace(/\s+/g, ' ').trim()
      if (!prev) {
        nodeChanges.push({
          id: node.id,
          tagName: node.tagName,
          status: 'added',
          currentText: curText,
        })
      } else {
        const prevText = prev.text.replace(/\s+/g, ' ').trim()
        if (prevText !== curText || prev.sourceSlice !== node.sourceSlice) {
          nodeChanges.push({
            id: node.id,
            tagName: node.tagName,
            status: 'modified',
            pastText: prevText,
            currentText: curText,
          })
        }
      }
    }
    for (const prev of pastNodes) {
      if (!currentById.has(prev.id)) {
        nodeChanges.push({
          id: prev.id,
          tagName: prev.tagName,
          status: 'removed',
          pastText: prev.text.replace(/\s+/g, ' ').trim(),
        })
      }
    }
  } catch {
    // Ignore parse errors on malformed historical HTML.
  }

  return {
    structuredDiff,
    sourceDiff,
    nodeChanges,
    hasChanges: pastSource !== currentSource,
  }
}

interface RawShapeRecord {
  id: string
  typeName?: unknown
  type?: unknown
}

function extractWhiteboardStore(source: string): {
  shapes: Map<string, RawShapeRecord>
  pageCount: number
  rawJson: string | null
} {
  const snapshot = readWhiteboardSnapshot(source)
  if (!isWhiteboardEditorSnapshot(snapshot)) {
    return {
      shapes: new Map(),
      pageCount: 0,
      rawJson: snapshot === null ? null : JSON.stringify(snapshot),
    }
  }
  const doc = (
    snapshot as {
      document?: { store?: Record<string, RawShapeRecord | null | undefined> }
    }
  ).document
  const store = doc?.store ?? {}
  const shapes = new Map<string, RawShapeRecord>()
  let pageCount = 0
  for (const [key, record] of Object.entries(store)) {
    if (!record || typeof record !== 'object') continue
    if (record.typeName === 'page') {
      pageCount += 1
    } else if (record.typeName === 'shape') {
      const id = typeof record.id === 'string' ? record.id : key
      shapes.set(id, record)
    }
  }
  return {
    shapes,
    pageCount,
    rawJson: JSON.stringify(doc ?? null),
  }
}

function incrementTypeCount(
  map: Record<string, number>,
  shape: RawShapeRecord,
) {
  const type =
    typeof shape.type === 'string' && shape.type.trim()
      ? shape.type.trim()
      : 'shape'
  map[type] = (map[type] ?? 0) + 1
}

function formatTypeBreakdown(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return ''
  return ` (${entries.map(([type, count]) => `${count} ${type}`).join(', ')})`
}

export function diffWhiteboardSnapshots(
  pastSource: string,
  currentSource: string,
): WhiteboardDiffSummary {
  const past = extractWhiteboardStore(pastSource)
  const current = extractWhiteboardStore(currentSource)

  const addedByType: Record<string, number> = {}
  const removedByType: Record<string, number> = {}
  const modifiedByType: Record<string, number> = {}
  let addedCount = 0
  let removedCount = 0
  let modifiedCount = 0

  for (const [id, curShape] of current.shapes.entries()) {
    const prevShape = past.shapes.get(id)
    if (!prevShape) {
      addedCount += 1
      incrementTypeCount(addedByType, curShape)
    } else if (JSON.stringify(prevShape) !== JSON.stringify(curShape)) {
      modifiedCount += 1
      incrementTypeCount(modifiedByType, curShape)
    }
  }
  for (const [id, prevShape] of past.shapes.entries()) {
    if (!current.shapes.has(id)) {
      removedCount += 1
      incrementTypeCount(removedByType, prevShape)
    }
  }

  const summaryLines: string[] = []
  if (addedCount > 0) {
    summaryLines.push(
      `${addedCount} ${addedCount === 1 ? 'shape' : 'shapes'} added${formatTypeBreakdown(addedByType)}`,
    )
  }
  if (modifiedCount > 0) {
    summaryLines.push(
      `${modifiedCount} ${modifiedCount === 1 ? 'shape' : 'shapes'} modified${formatTypeBreakdown(modifiedByType)}`,
    )
  }
  if (removedCount > 0) {
    summaryLines.push(
      `${removedCount} ${removedCount === 1 ? 'shape' : 'shapes'} removed${formatTypeBreakdown(removedByType)}`,
    )
  }
  if (past.pageCount !== current.pageCount) {
    summaryLines.push(`Pages: ${past.pageCount} → ${current.pageCount}`)
  }

  const hasChanges =
    addedCount > 0 ||
    removedCount > 0 ||
    modifiedCount > 0 ||
    past.pageCount !== current.pageCount ||
    past.rawJson !== current.rawJson

  if (summaryLines.length === 0) {
    summaryLines.push(
      hasChanges
        ? 'Board metadata or canvas view changed'
        : 'No shape changes compared to current board',
    )
  }

  return {
    pastShapeCount: past.shapes.size,
    currentShapeCount: current.shapes.size,
    pastPageCount: past.pageCount,
    currentPageCount: current.pageCount,
    addedCount,
    removedCount,
    modifiedCount,
    addedByType,
    removedByType,
    modifiedByType,
    summaryLines,
    hasChanges,
  }
}
