import type { DriveChatThread } from '#/lib/ai/drive-chat-types'
import { isWhiteboardMarbleSource } from '#/lib/marble/whiteboard-document'
import { chatThreadHref, docHref, folderHref } from '#/lib/routing'
import type { DriveFolder, MarbleDocumentFile } from '#/lib/types'
import { extractChatMessagesText, extractMarbleDocumentText } from './extract'
import type {
  IndexableItem,
  SearchDriveCounts,
  SearchDriveOptions,
  SearchDriveResponse,
  SearchItemType,
  SearchMatchRange,
  SearchMatchedField,
  SearchResultItem,
} from './types'

const TOKEN_RE = /[\p{L}\p{N}]+/gu
const MAX_PREFIX_EXPANSIONS = 200
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const DEFAULT_SNIPPET_LENGTH = 176
const BM25_K1 = 1.2
const BM25_B = 0.75

interface PostingEntry {
  title: number
  tags: number
  path: number
  body: number
}

interface TokenSpan {
  token: string
  raw: string
  start: number
  end: number
}

/**
 * Normalize a single word/token by stripping diacritics via NFKD decomposition
 * and lowercasing.
 */
export function normalizeToken(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Tokenize text into normalized tokens while retaining exact UTF-16 character
 * offsets against the original string.
 */
export function tokenizeWithSpans(text: string): TokenSpan[] {
  if (!text) return []
  const spans: TokenSpan[] = []
  TOKEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TOKEN_RE.exec(text)) !== null) {
    const raw = match[0]
    const token = normalizeToken(raw)
    if (!token) continue
    spans.push({
      token,
      raw,
      start: match.index,
      end: match.index + raw.length,
    })
  }
  return spans
}

/**
 * Split text into normalized lowercase alphanumeric tokens.
 */
export function tokenize(text: string): string[] {
  return tokenizeWithSpans(text).map((span) => span.token)
}

function mergeRanges(ranges: SearchMatchRange[]): SearchMatchRange[] {
  if (ranges.length <= 1) return ranges
  const sorted = ranges
    .slice()
    .sort((a, b) => (a.start !== b.start ? a.start - b.start : a.end - b.end))
  const merged: SearchMatchRange[] = [sorted[0]]
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = merged[merged.length - 1]
    const curr = sorted[i]
    if (curr.start <= prev.end) {
      prev.end = Math.max(prev.end, curr.end)
    } else {
      merged.push({ ...curr })
    }
  }
  return merged
}

/**
 * Compute sorted, non-overlapping UTF-16 highlight ranges in `text` for exact
 * or prefix matches against `queryTerms`.
 */
export function findHighlightRanges(
  text: string,
  queryTerms: readonly string[],
): SearchMatchRange[] {
  if (!text || queryTerms.length === 0) return []
  const spans = tokenizeWithSpans(text)
  const ranges: SearchMatchRange[] = []

  for (const span of spans) {
    let bestEnd = -1
    for (const qTerm of queryTerms) {
      if (!qTerm) continue
      if (span.token === qTerm) {
        bestEnd = span.end
        break
      }
      if (span.token.startsWith(qTerm)) {
        const prefixEnd =
          span.raw.length >= qTerm.length &&
          normalizeToken(span.raw.slice(0, qTerm.length)) === qTerm
            ? span.start + qTerm.length
            : span.end
        if (prefixEnd > bestEnd) {
          bestEnd = prefixEnd
        }
      }
    }
    if (bestEnd > span.start) {
      ranges.push({ start: span.start, end: bestEnd })
    }
  }

  return mergeRanges(ranges)
}

function clampWindowStart(text: string, approxStart: number): number {
  if (approxStart <= 0) return 0
  let idx = approxStart
  while (idx > 0 && !/\s/.test(text[idx - 1])) {
    if (approxStart - idx > 18) break
    idx -= 1
  }
  while (idx < text.length && /\s/.test(text[idx])) {
    idx += 1
  }
  return idx
}

function clampWindowEnd(text: string, approxEnd: number): number {
  if (approxEnd >= text.length) return text.length
  let idx = approxEnd
  while (idx < text.length && !/\s/.test(text[idx])) {
    if (idx - approxEnd > 16) {
      idx = approxEnd
      break
    }
    idx += 1
  }
  while (idx > 0 && /\s/.test(text[idx - 1])) {
    idx -= 1
  }
  return idx
}

function matchedTermForSpan(
  token: string,
  queryTerms: readonly string[],
): string | null {
  for (const qTerm of queryTerms) {
    if (token === qTerm || token.startsWith(qTerm)) {
      return qTerm
    }
  }
  return null
}

/**
 * Build a readable plain-text excerpt centered on the strongest cluster of
 * matched query terms, plus exact UTF-16 highlight offsets inside that snippet.
 */
export function buildSnippetAndHighlights(
  item: Pick<IndexableItem, 'type' | 'body' | 'description' | 'location'>,
  queryTerms: readonly string[],
  maxLen = DEFAULT_SNIPPET_LENGTH,
): { snippet: string; snippetMatches: SearchMatchRange[] } {
  if (item.type === 'folder') {
    const folderLine =
      !item.location || item.location === 'My Drive'
        ? 'Top-level folder in My Drive'
        : `Folder in ${item.location}`
    return {
      snippet: folderLine,
      snippetMatches: findHighlightRanges(folderLine, queryTerms),
    }
  }

  const candidateRaw = item.body.trim() || item.description.trim()
  if (!candidateRaw) {
    return { snippet: '', snippetMatches: [] }
  }

  const flat = candidateRaw.replace(/\s+/g, ' ').trim()
  if (flat.length <= maxLen) {
    return {
      snippet: flat,
      snippetMatches: findHighlightRanges(flat, queryTerms),
    }
  }

  const spans = tokenizeWithSpans(flat)
  const hitSpans: Array<{ start: number; end: number; qTerm: string }> = []
  for (const span of spans) {
    const qTerm = matchedTermForSpan(span.token, queryTerms)
    if (qTerm) {
      hitSpans.push({ start: span.start, end: span.end, qTerm })
    }
  }

  if (hitSpans.length === 0) {
    const end = clampWindowEnd(flat, maxLen - 1)
    const snippet = `${flat.slice(0, end)}…`
    return { snippet, snippetMatches: [] }
  }

  let bestWindowStart = Math.max(0, hitSpans[0].start - 44)
  let bestDistinct = 0
  let bestTotal = 0

  for (let i = 0; i < hitSpans.length; i += 1) {
    const anchor = hitSpans[i]
    const winStart = Math.max(0, anchor.start - 44)
    const winEnd = winStart + maxLen - 2
    const seenTerms = new Set<string>()
    let count = 0
    for (let j = i; j < hitSpans.length; j += 1) {
      if (hitSpans[j].start > winEnd) break
      seenTerms.add(hitSpans[j].qTerm)
      count += 1
    }
    if (
      seenTerms.size > bestDistinct ||
      (seenTerms.size === bestDistinct && count > bestTotal)
    ) {
      bestDistinct = seenTerms.size
      bestTotal = count
      bestWindowStart = winStart
    }
  }

  const start = clampWindowStart(flat, bestWindowStart)
  const needsPrefix = start > 0
  const budget = maxLen - (needsPrefix ? 1 : 0) - 1
  const end = clampWindowEnd(flat, Math.min(flat.length, start + budget))
  const needsSuffix = end < flat.length

  const core = flat.slice(start, end).trim()
  const snippet = `${needsPrefix ? '…' : ''}${core}${needsSuffix ? '…' : ''}`
  return {
    snippet,
    snippetMatches: findHighlightRanges(snippet, queryTerms),
  }
}

function emptyCounts(): SearchDriveCounts {
  return {
    all: 0,
    document: 0,
    whiteboard: 0,
    folder: 0,
    chat: 0,
  }
}

function countTokensInText(text: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const token of tokenize(text)) {
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  return counts
}

function lowerBound(sorted: readonly string[], target: string): number {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (sorted[mid] < target) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return lo
}

function nowMs(): number {
  return typeof performance !== 'undefined' &&
    typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

/**
 * Fast in-memory inverted index with prefix lookup, field-weighted BM25
 * scoring, AND-query semantics, and incremental document updates.
 */
export class DriveSearchIndex {
  private entries = new Map<string, IndexableItem>()
  private postings = new Map<string, Map<string, PostingEntry>>()
  private docTerms = new Map<string, Set<string>>()
  private bodyLengths = new Map<string, number>()
  private totalBodyLength = 0
  private sortedTerms: string[] | null = null

  get size(): number {
    return this.entries.size
  }

  getAllEntries(): IndexableItem[] {
    return [...this.entries.values()]
  }

  clear(): void {
    this.entries.clear()
    this.postings.clear()
    this.docTerms.clear()
    this.bodyLengths.clear()
    this.totalBodyLength = 0
    this.sortedTerms = null
  }

  remove(key: string): boolean {
    const existed = this.entries.delete(key)
    if (!existed) return false

    const prevTerms = this.docTerms.get(key)
    if (prevTerms) {
      for (const term of prevTerms) {
        const docMap = this.postings.get(term)
        if (!docMap) continue
        docMap.delete(key)
        if (docMap.size === 0) {
          this.postings.delete(term)
          this.sortedTerms = null
        }
      }
      this.docTerms.delete(key)
    }

    const prevBodyLen = this.bodyLengths.get(key) ?? 0
    this.totalBodyLength = Math.max(0, this.totalBodyLength - prevBodyLen)
    this.bodyLengths.delete(key)
    return true
  }

  upsert(item: IndexableItem): void {
    this.remove(item.key)
    this.entries.set(item.key, item)

    const titleCounts = countTokensInText(item.title)
    const tagText = [
      ...item.tags,
      item.slug ?? '',
      item.fileName ?? '',
      item.category ?? '',
    ]
      .filter(Boolean)
      .join(' ')
    const tagCounts = countTokensInText(tagText)
    const pathText = [item.location, item.path].filter(Boolean).join(' ')
    const pathCounts = countTokensInText(pathText)
    const bodyText = [item.description, item.body].filter(Boolean).join('\n')
    const bodyCounts = countTokensInText(bodyText)

    let bodyLength = 0
    for (const count of bodyCounts.values()) {
      bodyLength += count
    }
    this.bodyLengths.set(item.key, bodyLength)
    this.totalBodyLength += bodyLength

    const terms = new Set<string>([
      ...titleCounts.keys(),
      ...tagCounts.keys(),
      ...pathCounts.keys(),
      ...bodyCounts.keys(),
    ])
    this.docTerms.set(item.key, terms)

    for (const term of terms) {
      let docMap = this.postings.get(term)
      if (!docMap) {
        docMap = new Map()
        this.postings.set(term, docMap)
        this.sortedTerms = null
      }
      docMap.set(item.key, {
        title: titleCounts.get(term) ?? 0,
        tags: tagCounts.get(term) ?? 0,
        path: pathCounts.get(term) ?? 0,
        body: bodyCounts.get(term) ?? 0,
      })
    }
  }

  private getSortedTerms(): readonly string[] {
    if (!this.sortedTerms) {
      this.sortedTerms = [...this.postings.keys()].sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0,
      )
    }
    return this.sortedTerms
  }

  private expandQueryTerm(qTerm: string): string[] {
    const matches: string[] = []
    if (this.postings.has(qTerm)) {
      matches.push(qTerm)
    }
    const vocab = this.getSortedTerms()
    let idx = lowerBound(vocab, qTerm)
    while (idx < vocab.length && matches.length < MAX_PREFIX_EXPANSIONS) {
      const candidate = vocab[idx]
      if (!candidate.startsWith(qTerm)) break
      if (candidate !== qTerm) {
        matches.push(candidate)
      }
      idx += 1
    }
    return matches
  }

  search(options: SearchDriveOptions): SearchDriveResponse {
    const startMs = nowMs()
    const query = options.query
    const terms = Array.from(new Set(tokenize(query)))
    const includeTrash = Boolean(options.includeTrash)
    const rawLimit = options.limit ?? DEFAULT_LIMIT
    const limit = Math.max(
      1,
      Math.min(
        MAX_LIMIT,
        Math.round(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT),
      ),
    )
    const rawOffset = options.offset ?? 0
    const offset = Math.max(
      0,
      Math.round(Number.isFinite(rawOffset) ? rawOffset : 0),
    )

    if (terms.length === 0) {
      return {
        query,
        terms: [],
        results: [],
        total: 0,
        counts: emptyCounts(),
        tookMs: Math.max(0, Math.round((nowMs() - startMs) * 100) / 100),
        indexedCount: this.size,
      }
    }

    // Collect expanded vocab matches for every query term, and intersect matching keys.
    const termExpansions: Array<{
      qTerm: string
      vocabTerms: string[]
      docSet: Set<string>
    }> = []

    for (const qTerm of terms) {
      const vocabTerms = this.expandQueryTerm(qTerm)
      if (vocabTerms.length === 0) {
        return {
          query,
          terms,
          results: [],
          total: 0,
          counts: emptyCounts(),
          tookMs: Math.max(0, Math.round((nowMs() - startMs) * 100) / 100),
          indexedCount: this.size,
        }
      }
      const docSet = new Set<string>()
      for (const vocabTerm of vocabTerms) {
        const docMap = this.postings.get(vocabTerm)
        if (!docMap) continue
        for (const docKey of docMap.keys()) {
          docSet.add(docKey)
        }
      }
      termExpansions.push({ qTerm, vocabTerms, docSet })
    }

    termExpansions.sort((a, b) => a.docSet.size - b.docSet.size)
    const candidateKeys: string[] = []
    for (const key of termExpansions[0].docSet) {
      let matchesAll = true
      for (let i = 1; i < termExpansions.length; i += 1) {
        if (!termExpansions[i].docSet.has(key)) {
          matchesAll = false
          break
        }
      }
      if (!matchesAll) continue
      const entry = this.entries.get(key)
      if (!entry) continue
      if (!includeTrash && entry.trashed) continue
      candidateKeys.push(key)
    }

    const totalDocs = Math.max(1, this.entries.size)
    const avgBodyLen = Math.max(1, this.totalBodyLength / totalDocs)
    const normalizedPhrase = terms.join(' ')
    const nowTime = Date.now()
    const counts = emptyCounts()

    interface ScoredCandidate {
      entry: IndexableItem
      score: number
      matchedFields: SearchMatchedField[]
      updatedMs: number
    }

    const scored: ScoredCandidate[] = []

    for (const key of candidateKeys) {
      const entry = this.entries.get(key)!
      const dl = this.bodyLengths.get(key) ?? 0
      const fieldFlags = {
        title: false,
        tags: false,
        path: false,
        body: false,
      }
      let score = 0

      for (const { qTerm, vocabTerms } of termExpansions) {
        let bestTermScore = 0
        let matchedTitle = false
        let matchedTags = false
        let matchedPath = false
        let matchedBody = false

        for (const vocabTerm of vocabTerms) {
          const docMap = this.postings.get(vocabTerm)
          const posting = docMap?.get(key)
          if (!posting) continue

          const df = docMap!.size
          const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5))
          const isExact = vocabTerm === qTerm
          const matchWeight = isExact
            ? 1.0
            : 0.65 * Math.min(1, qTerm.length / Math.max(1, vocabTerm.length))

          let subScore = 0
          if (posting.title > 0) {
            matchedTitle = true
            subScore += 8.0 * Math.min(3, posting.title)
          }
          if (posting.tags > 0) {
            matchedTags = true
            subScore += 4.5 * Math.min(3, posting.tags)
          }
          if (posting.path > 0) {
            matchedPath = true
            subScore += 2.5 * Math.min(2, posting.path)
          }
          if (posting.body > 0) {
            matchedBody = true
            const tf = posting.body
            const bm25 =
              (tf * (BM25_K1 + 1)) /
              (tf + BM25_K1 * (1 - BM25_B + (BM25_B * dl) / avgBodyLen))
            subScore += 2.0 * bm25
          }

          const weighted = subScore * idf * matchWeight
          if (weighted > bestTermScore) {
            bestTermScore = weighted
          }
        }

        score += bestTermScore
        if (matchedTitle) fieldFlags.title = true
        if (matchedTags) fieldFlags.tags = true
        if (matchedPath) fieldFlags.path = true
        if (matchedBody) fieldFlags.body = true
      }

      const normTitle = tokenize(entry.title).join(' ')
      if (normTitle === normalizedPhrase) {
        score += 14
      } else if (normTitle.startsWith(normalizedPhrase)) {
        score += 6
      } else if (terms.length > 1 && normTitle.includes(normalizedPhrase)) {
        score += 5
      }

      if (terms.length > 1 && fieldFlags.body) {
        const normBodyHead = tokenize(entry.body.slice(0, 6000)).join(' ')
        if (normBodyHead.includes(normalizedPhrase)) {
          score += 3
        }
      }

      const parsedUpdated = Date.parse(entry.updatedAt)
      const updatedMs = Number.isFinite(parsedUpdated) ? parsedUpdated : 0
      if (updatedMs > 0) {
        const ageDays = Math.max(
          0,
          (nowTime - updatedMs) / (24 * 60 * 60 * 1000),
        )
        score += 0.25 / (1 + ageDays / 30)
      }

      const matchedFields: SearchMatchedField[] = []
      if (fieldFlags.title) matchedFields.push('title')
      if (fieldFlags.body) {
        matchedFields.push(entry.type === 'chat' ? 'messages' : 'body')
      }
      if (fieldFlags.tags) matchedFields.push('tags')
      if (fieldFlags.path) matchedFields.push('path')

      counts.all += 1
      counts[entry.type] += 1

      scored.push({
        entry,
        score,
        matchedFields,
        updatedMs,
      })
    }

    const typeFilter =
      options.types && options.types.length > 0 ? new Set(options.types) : null

    const filtered = typeFilter
      ? scored.filter((item) => typeFilter.has(item.entry.type))
      : scored

    filtered.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (b.updatedMs !== a.updatedMs) return b.updatedMs - a.updatedMs
      return a.entry.title.localeCompare(b.entry.title)
    })

    const page = filtered.slice(offset, offset + limit)
    const results: SearchResultItem[] = page.map(
      ({ entry, score, matchedFields }) => {
        const titleMatches = findHighlightRanges(entry.title, terms)
        const { snippet, snippetMatches } = buildSnippetAndHighlights(
          entry,
          terms,
        )
        return {
          id: entry.id,
          type: entry.type,
          title: entry.title,
          href: entry.href,
          score: Math.round(score * 1000) / 1000,
          snippet,
          snippetMatches,
          titleMatches,
          matchedFields,
          location: entry.location,
          updatedAt: entry.updatedAt,
          trashed: entry.trashed,
          ...(entry.trashedAt ? { trashedAt: entry.trashedAt } : {}),
          ...(entry.category ? { category: entry.category } : {}),
          ...(entry.slug ? { slug: entry.slug } : {}),
          ...(entry.fileName ? { fileName: entry.fileName } : {}),
          ...(entry.tags.length > 0 ? { tags: entry.tags } : {}),
          ...(entry.isTemplate ? { isTemplate: true } : {}),
          ...(entry.starred ? { starred: true } : {}),
          ...(entry.pinned ? { pinned: true } : {}),
          ...(typeof entry.messageCount === 'number'
            ? { messageCount: entry.messageCount }
            : {}),
        }
      },
    )

    return {
      query,
      terms,
      results,
      total: filtered.length,
      counts,
      tookMs: Math.max(0, Math.round((nowMs() - startMs) * 100) / 100),
      indexedCount: this.size,
    }
  }
}

function resolveFolderLocation(
  folders: readonly DriveFolder[],
  folderId: string | null | undefined,
  fallback = 'My Drive',
): string {
  if (!folderId) return fallback || 'My Drive'
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const chain: string[] = []
  const seen = new Set<string>()
  let cursor = byId.get(folderId)
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    chain.unshift(cursor.name)
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
  }
  return chain.length > 0 ? chain.join(' / ') : fallback || 'My Drive'
}

/**
 * Determine whether a `.mrbl` file should be indexed as `'whiteboard'` or `'document'`.
 */
export function resolveMarbleSearchType(
  category: MarbleDocumentFile['category'],
  source: string,
): SearchItemType {
  if (category === 'whiteboard' || isWhiteboardMarbleSource(source)) {
    return 'whiteboard'
  }
  return 'document'
}

/**
 * Build an in-memory `DriveSearchIndex` from client workspace state.
 * Used by Storybook stories and when `/api/search` is unavailable (e.g. static previews).
 */
export function buildClientSearchIndex(input: {
  docs: readonly MarbleDocumentFile[]
  folders: readonly DriveFolder[]
  chatThreads: readonly DriveChatThread[]
}): DriveSearchIndex {
  const index = new DriveSearchIndex()

  for (const folder of input.folders) {
    const parentLocation = folder.parentId
      ? resolveFolderLocation(input.folders, folder.parentId, 'My Drive')
      : 'My Drive'
    const fullPath = resolveFolderLocation(
      input.folders,
      folder.id,
      folder.name,
    )
    index.upsert({
      key: `folder:${folder.id}`,
      id: folder.id,
      type: 'folder',
      title: folder.name,
      href: folderHref(folder),
      body: '',
      description: '',
      location: parentLocation,
      path: fullPath,
      tags: [],
      trashed: false,
      updatedAt: folder.updatedAt,
    })
  }

  for (const doc of input.docs) {
    const type = resolveMarbleSearchType(doc.category, doc.source)
    const location = resolveFolderLocation(
      input.folders,
      doc.folderId,
      doc.folder,
    )
    index.upsert({
      key: `${type}:${doc.id}`,
      id: doc.id,
      type,
      title: doc.title,
      href: docHref(doc),
      body: extractMarbleDocumentText(doc.source),
      description: doc.description,
      location,
      path:
        location === 'My Drive' ? doc.fileName : `${location}/${doc.fileName}`,
      tags: doc.tags,
      slug: doc.slug,
      fileName: doc.fileName,
      category: doc.category,
      isTemplate: doc.isTemplate,
      starred: doc.starred,
      pinned: doc.pinned,
      trashed: Boolean(doc.trashedAt),
      trashedAt: doc.trashedAt ?? null,
      updatedAt: doc.updatedAt,
    })
  }

  for (const thread of input.chatThreads) {
    if (thread.messages.length === 0 && thread.title.trim() === 'New chat') {
      continue
    }
    index.upsert({
      key: `chat:${thread.id}`,
      id: thread.id,
      type: 'chat',
      title: thread.title,
      href: chatThreadHref(thread.id),
      body: extractChatMessagesText(thread.messages),
      description: '',
      location: 'Drive Chat',
      path: `Drive Chat/${thread.title}`,
      tags: [],
      pinned: Boolean(thread.pinned),
      trashed: false,
      updatedAt: thread.updatedAt,
      messageCount: thread.messages.length,
    })
  }

  return index
}
