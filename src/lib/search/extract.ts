import type { DriveChatMessage } from '#/lib/ai/drive-chat-types'
import {
  isWhiteboardMarbleSource,
  readWhiteboardSnapshot,
} from '#/lib/marble/whiteboard-document'

const MAX_EXTRACTED_CHARS = 200_000

const LATEX_STATE_RE =
  /<script\b[^>]*data-marble-latex-state=["']1["'][^>]*>([\s\S]*?)<\/script>/i
const DOCS_STATE_RE =
  /<script\b[^>]*data-marble-docs-state=["']1["'][^>]*>([\s\S]*?)<\/script>/i
const ACTION_FENCE_RE = /```xdrive-actions[\s\S]*?```/gi

const BLOCK_BOUNDARY_RE =
  /<\/?(?:h[1-6]|p|div|section|article|aside|blockquote|li|ul|ol|tr|td|th|pre|hr|br|header|footer|main|nav)\b[^>]*>/gi

const RICH_TEXT_BLOCK_NODES = new Set([
  'doc',
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'hardBreak',
])

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
}

function decodeHtmlEntities(input: string): string {
  return input.replace(
    /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/g,
    (full, entity: string) => {
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        const cp = Number.parseInt(entity.slice(2), 16)
        if (Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff) {
          return String.fromCodePoint(cp)
        }
        return full
      }
      if (entity.startsWith('#')) {
        const cp = Number.parseInt(entity.slice(1), 10)
        if (Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff) {
          return String.fromCodePoint(cp)
        }
        return full
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? full
    },
  )
}

function normalizeExtractedLines(chunks: readonly string[]): string {
  const lines: string[] = []
  let previous = ''
  let total = 0

  for (const chunk of chunks) {
    const cleaned = chunk.replace(/\r\n?/g, '\n')
    for (const rawLine of cleaned.split('\n')) {
      const line = rawLine.replace(/[ \t]+/g, ' ').trim()
      if (!line) continue
      if (line.startsWith('data:')) continue
      if (line === previous) continue
      lines.push(line)
      previous = line
      total += line.length + 1
      if (total >= MAX_EXTRACTED_CHARS) {
        return lines.join('\n').slice(0, MAX_EXTRACTED_CHARS)
      }
    }
  }

  return lines.join('\n')
}

function extractRichTextNodes(node: unknown, parts: string[]): void {
  if (!node || typeof node !== 'object') return
  const rec = node as Record<string, unknown>

  if (typeof rec.text === 'string' && rec.text) {
    parts.push(rec.text)
  }

  if (Array.isArray(rec.content)) {
    for (const child of rec.content) {
      extractRichTextNodes(child, parts)
    }
  }

  if (typeof rec.type === 'string' && RICH_TEXT_BLOCK_NODES.has(rec.type)) {
    parts.push('\n')
  }
}

function extractRichText(richText: unknown): string {
  if (!richText || typeof richText !== 'object') return ''
  const parts: string[] = []
  extractRichTextNodes(richText, parts)
  return parts
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function pushCleanSegment(target: string[], raw: unknown): void {
  if (typeof raw !== 'string') return
  const trimmed = raw.trim()
  if (!trimmed || trimmed.startsWith('data:')) return
  target.push(trimmed)
}

function compareStoreRecords(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): number {
  const aIdx = typeof a.index === 'string' ? a.index : ''
  const bIdx = typeof b.index === 'string' ? b.index : ''
  if (aIdx !== bIdx) return aIdx.localeCompare(bIdx)
  const aId = typeof a.id === 'string' ? a.id : ''
  const bId = typeof b.id === 'string' ? b.id : ''
  return aId.localeCompare(bId)
}

/**
 * Extract searchable text from a `.mrbl` whiteboard file or a parsed tldraw
 * snapshot object (`props.richText`, legacy `props.text`, frame `props.name`,
 * media `props.altText`, bookmark asset metadata, and non-default page names).
 */
export function extractWhiteboardText(
  sourceOrSnapshot: string | unknown,
): string {
  const snapshot =
    typeof sourceOrSnapshot === 'string'
      ? readWhiteboardSnapshot(sourceOrSnapshot)
      : sourceOrSnapshot

  if (!snapshot || typeof snapshot !== 'object') return ''
  const docRecord = (snapshot as { document?: unknown }).document
  if (!docRecord || typeof docRecord !== 'object') return ''
  const store = (docRecord as { store?: unknown }).store
  if (!store || typeof store !== 'object' || Array.isArray(store)) return ''

  const records = Object.values(store as Record<string, unknown>).filter(
    (rec): rec is Record<string, unknown> =>
      Boolean(rec) && typeof rec === 'object' && !Array.isArray(rec),
  )

  const docRecords = records
    .filter((rec) => rec.typeName === 'document')
    .sort(compareStoreRecords)
  const pageRecords = records
    .filter((rec) => rec.typeName === 'page')
    .sort(compareStoreRecords)
  const shapeRecords = records
    .filter((rec) => rec.typeName === 'shape')
    .sort(compareStoreRecords)
  const assetRecords = records
    .filter((rec) => rec.typeName === 'asset')
    .sort(compareStoreRecords)

  const chunks: string[] = []

  for (const docRec of docRecords) {
    pushCleanSegment(chunks, docRec.name)
  }

  for (const pageRec of pageRecords) {
    const name = typeof pageRec.name === 'string' ? pageRec.name.trim() : ''
    if (name && name !== 'Page 1') {
      chunks.push(name)
    }
  }

  for (const shapeRec of shapeRecords) {
    const props =
      shapeRec.props &&
      typeof shapeRec.props === 'object' &&
      !Array.isArray(shapeRec.props)
        ? (shapeRec.props as Record<string, unknown>)
        : null
    if (!props) continue

    const rich = extractRichText(props.richText)
    if (rich) chunks.push(rich)
    pushCleanSegment(chunks, props.text)
    pushCleanSegment(chunks, props.name)
    pushCleanSegment(chunks, props.altText)
    pushCleanSegment(chunks, props.label)
  }

  for (const assetRec of assetRecords) {
    if (assetRec.type !== 'bookmark') continue
    const props =
      assetRec.props &&
      typeof assetRec.props === 'object' &&
      !Array.isArray(assetRec.props)
        ? (assetRec.props as Record<string, unknown>)
        : null
    if (!props) continue
    pushCleanSegment(chunks, props.title)
    pushCleanSegment(chunks, props.description)
  }

  return normalizeExtractedLines(chunks)
}

function extractEmbeddedLatexText(source: string): string[] {
  const match = source.match(LATEX_STATE_RE)
  if (!match) return []
  const rawJson = match[1].replace(/<\\\//g, '</').trim()
  if (!rawJson) return []
  try {
    const parsed = JSON.parse(rawJson) as {
      title?: unknown
      files?: unknown[]
    }
    if (!Array.isArray(parsed.files)) return []
    const out: string[] = []
    for (const rawFile of parsed.files) {
      if (!rawFile || typeof rawFile !== 'object') continue
      const file = rawFile as { path?: unknown; content?: unknown }
      if (typeof file.path === 'string' && file.path.trim()) {
        out.push(file.path.trim())
      }
      if (typeof file.content === 'string' && file.content.trim()) {
        out.push(file.content)
      }
    }
    return out
  } catch {
    return []
  }
}

function extractEmbeddedDocsComments(source: string): string[] {
  const match = source.match(DOCS_STATE_RE)
  if (!match) return []
  const rawJson = match[1].replace(/<\\\//g, '</').trim()
  if (!rawJson) return []
  try {
    const parsed = JSON.parse(rawJson) as {
      comments?: unknown[]
    }
    if (!Array.isArray(parsed.comments)) return []
    const out: string[] = []
    for (const rawComment of parsed.comments) {
      if (!rawComment || typeof rawComment !== 'object') continue
      const comment = rawComment as {
        quote?: unknown
        body?: unknown
        replies?: unknown[]
      }
      pushCleanSegment(out, comment.quote)
      pushCleanSegment(out, comment.body)
      if (Array.isArray(comment.replies)) {
        for (const rawReply of comment.replies) {
          if (rawReply && typeof rawReply === 'object') {
            const reply = rawReply as { body?: unknown }
            pushCleanSegment(out, reply.body)
          }
        }
      }
    }
    return out
  } catch {
    return []
  }
}

function extractVisibleHtmlText(source: string): string {
  const stripped = source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(BLOCK_BOUNDARY_RE, '\n')
    .replace(/<[^>]+>/g, ' ')

  const decoded = decodeHtmlEntities(stripped)
  return normalizeExtractedLines([decoded])
}

/**
 * Extract searchable plain text from any `.mrbl` HTML5 document source.
 * Delegates whiteboards strictly to tldraw snapshot extraction (skipping HTML
 * boilerplate), indexes full multi-file LaTeX project contents when present,
 * and includes Docs comment/reply threads alongside live DOM body text.
 */
export function extractMarbleDocumentText(source: string): string {
  if (!source) return ''
  if (isWhiteboardMarbleSource(source)) {
    return extractWhiteboardText(source)
  }

  const latexChunks = extractEmbeddedLatexText(source)
  if (latexChunks.length > 0) {
    return normalizeExtractedLines(latexChunks)
  }

  const visible = extractVisibleHtmlText(source)
  const extraComments = extractEmbeddedDocsComments(source)
  if (extraComments.length === 0) {
    return visible
  }

  const lowerVisible = visible.toLowerCase()
  const missingComments = extraComments.filter(
    (item) => !lowerVisible.includes(item.toLowerCase()),
  )
  if (missingComments.length === 0) return visible
  return normalizeExtractedLines([visible, ...missingComments])
}

/**
 * Extract searchable conversation text from Drive Chat messages while stripping
 * fenced `xdrive-actions` JSON payloads so snippets stay clean and readable.
 */
export function extractChatMessagesText(
  messages: readonly Pick<DriveChatMessage, 'role' | 'content'>[],
): string {
  const chunks: string[] = []
  for (const msg of messages) {
    if (typeof msg.content !== 'string') continue
    const prose = msg.content.replace(ACTION_FENCE_RE, ' ').trim()
    if (prose) chunks.push(prose)
  }
  return normalizeExtractedLines(chunks)
}
