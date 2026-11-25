// Browser-side client helpers for xDrive Drive-wide AI Chat (/api/drive-chat).

import type {
  AISubscription,
  DriveFolder,
  MarbleDocumentFile,
} from '#/lib/types'
import { getFolderPathLabel } from '#/components/design-system/DriveExplorer'
import { inspectMarbleNodes } from '#/lib/marble/engine-client'
import type { AntigravityRuntimeStatus } from './antigravity-types'
import type { OpenCodeGoRuntimeStatus } from './opencode-go-types'
import { fromXDriveOpenCodeGoModelId } from './opencode-go-types'
import type {
  DriveChatApiRequest,
  DriveChatModelOption,
  DriveChatStreamEvent,
  DriveContextRef,
  DriveDocumentSnapshot,
  DriveFolderSnapshot,
  DriveSnapshot,
  ReasoningEffort,
} from './drive-chat-types'

const ALL_EFFORTS: ReasoningEffort[] = ['off', 'low', 'medium', 'high', 'max']

function extractReadableDigest(source: string, maxChars = 2400): string {
  const withoutScripts = source
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<template[\s\S]*?<\/template>/gi, ' ')
  const plain = withoutScripts
    .replace(/<\/(h[1-6]|p|li|tr|div|section|article|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (plain.length <= maxChars) return plain
  return `${plain.slice(0, maxChars - 1)}…`
}

function extractMarbleIds(source: string): string[] {
  try {
    return inspectMarbleNodes(source)
      .map((node) => node.id)
      .slice(0, 80)
  } catch {
    return [
      ...new Set(
        [...source.matchAll(/data-marble-id\s*=\s*["']([^"']+)["']/g)].map(
          (m) => m[1],
        ),
      ),
    ].slice(0, 80)
  }
}

function scoreDocRelevance(
  doc: MarbleDocumentFile,
  query: string,
  focusedRefs: DriveContextRef[],
): number {
  let score = 0
  for (const ref of focusedRefs) {
    if (ref.kind === 'doc' && ref.id === doc.id) score += 100
    if (ref.kind === 'folder' && doc.folderId === ref.id) score += 40
  }
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3)
  if (tokens.length === 0) return score
  const titleLower = doc.title.toLowerCase()
  const fileLower = doc.fileName.toLowerCase()
  const bodyLower =
    `${doc.description} ${doc.folder} ${doc.tags.join(' ')}`.toLowerCase()
  for (const token of tokens) {
    if (titleLower.includes(token)) score += 14
    if (fileLower.includes(token)) score += 14
    if (bodyLower.includes(token)) score += 6
  }
  return score
}

export function buildDriveSnapshot(params: {
  docs: MarbleDocumentFile[]
  trashedDocs: MarbleDocumentFile[]
  folders: DriveFolder[]
  focusedRefs: DriveContextRef[]
  query: string
}): DriveSnapshot {
  const { docs, trashedDocs, folders, focusedRefs, query } = params

  const folderSnapshots: DriveFolderSnapshot[] = folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    path: getFolderPathLabel(folders, folder.id),
    color: folder.color,
  }))

  const scored = docs.map((doc) => ({
    doc,
    score: scoreDocRelevance(doc, query, focusedRefs),
  }))
  const fullSourceIds = new Set(
    scored
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((entry) => entry.doc.id),
  )

  const toSnapshot = (
    doc: MarbleDocumentFile,
    includeSource: boolean,
  ): DriveDocumentSnapshot => ({
    id: doc.id,
    slug: doc.slug,
    fileName: doc.fileName,
    title: doc.title,
    description: doc.description,
    category: doc.category,
    folderId: doc.folderId ?? null,
    folderPath: getFolderPathLabel(folders, doc.folderId, doc.folder),
    starred: doc.starred,
    pinned: doc.pinned,
    isEvergreen: doc.isEvergreen,
    trashedAt: doc.trashedAt ?? null,
    tags: doc.tags,
    nodeCount: doc.nodeCount,
    byteSize: doc.byteSize,
    updatedAt: doc.updatedAt,
    textDigest: extractReadableDigest(doc.source),
    marbleIds: extractMarbleIds(doc.source),
    source: includeSource ? doc.source : undefined,
  })

  return {
    docs: docs.map((doc) => toSnapshot(doc, fullSourceIds.has(doc.id))),
    trashedDocs: trashedDocs.map((doc) => toSnapshot(doc, false)),
    folders: folderSnapshots,
    focusedRefs,
  }
}

function normalizeReasoningEfforts(
  rawEfforts?: string[],
  supportsReasoning = true,
): ReasoningEffort[] {
  if (!supportsReasoning) return ['off']
  if (!rawEfforts || rawEfforts.length === 0) return ALL_EFFORTS
  const mapped: ReasoningEffort[] = ['off']
  for (const effort of rawEfforts) {
    const clean = effort.toLowerCase()
    if (
      (clean === 'low' ||
        clean === 'medium' ||
        clean === 'high' ||
        clean === 'max') &&
      !mapped.includes(clean)
    ) {
      mapped.push(clean)
    } else if (clean === 'xhigh' && !mapped.includes('max')) {
      mapped.push('max')
    }
  }
  return mapped.length > 1 ? mapped : ALL_EFFORTS
}

export function buildDriveChatModels(params: {
  subscriptions: AISubscription[]
  antigravityStatus?: AntigravityRuntimeStatus | null
  openCodeGoStatus?: OpenCodeGoRuntimeStatus | null
}): DriveChatModelOption[] {
  const { subscriptions, antigravityStatus, openCodeGoStatus } = params

  const antigravityReasoningConfig = antigravityStatus?.configOptions?.find(
    (opt) =>
      opt.category === 'thought_level' ||
      opt.category === 'reasoning' ||
      /reason|think|effort/i.test(`${opt.id} ${opt.name}`),
  )
  const antigravityEfforts = antigravityReasoningConfig
    ? normalizeReasoningEfforts(
        antigravityReasoningConfig.options.map((choice) => choice.value),
        true,
      )
    : ALL_EFFORTS

  const openCodeReasoningConfig = openCodeGoStatus?.configOptions?.find(
    (opt) =>
      opt.category === 'thought_level' ||
      opt.category === 'reasoning' ||
      /reason|think|effort/i.test(`${opt.id} ${opt.name}`),
  )
  const openCodeAcpEfforts = openCodeReasoningConfig
    ? normalizeReasoningEfforts(
        openCodeReasoningConfig.options.map((choice) => choice.value),
        true,
      )
    : undefined

  const goCatalogById = new Map(
    (openCodeGoStatus?.models ?? []).map((model) => [model.id, model]),
  )

  return subscriptions.flatMap((subscription) =>
    subscription.models.map((model): DriveChatModelOption => {
      let supportsReasoning = true
      let reasoningEfforts: ReasoningEffort[] = ALL_EFFORTS

      if (subscription.providerId === 'opencode-go') {
        const rawId = fromXDriveOpenCodeGoModelId(model.id)
        const goMeta = goCatalogById.get(rawId) ?? goCatalogById.get(model.id)
        supportsReasoning = goMeta?.reasoning ?? true
        reasoningEfforts = goMeta?.reasoningEfforts?.length
          ? normalizeReasoningEfforts(
              goMeta.reasoningEfforts,
              supportsReasoning,
            )
          : (openCodeAcpEfforts ??
            normalizeReasoningEfforts(undefined, supportsReasoning))
      } else if (subscription.providerId === 'antigravity') {
        supportsReasoning = true
        reasoningEfforts = antigravityEfforts
      } else {
        supportsReasoning =
          model.role === 'reasoning' ||
          model.speedTier === 'deep' ||
          /gpt-5|gpt-6|o4|claude|grok|gemini/i.test(model.id)
        reasoningEfforts = supportsReasoning ? ALL_EFFORTS : ['off']
      }

      return {
        id: model.id,
        name: model.name,
        providerId: subscription.providerId,
        providerName: subscription.name,
        connected:
          subscription.connected && subscription.status !== 'disconnected',
        status: subscription.connected ? subscription.status : 'disconnected',
        contextWindow: model.contextWindow,
        speedTier: model.speedTier,
        supportsVision: model.supportsVisionSketch,
        supportsReasoning,
        reasoningEfforts,
        description: model.recommendedFor,
        badge: model.badge,
      }
    }),
  )
}

export async function streamDriveChat(
  payload: DriveChatApiRequest,
  onEvent: (event: DriveChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch('/api/drive-chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream, application/json',
    },
    body: JSON.stringify(payload),
    signal,
  })

  if (!response.ok) {
    const fallback = `Drive Chat request failed (HTTP ${response.status}).`
    let message = fallback
    try {
      const errJson = (await response.json()) as { error?: string }
      if (typeof errJson.error === 'string' && errJson.error.trim()) {
        message = errJson.error.trim()
      }
    } catch {
      // ignore
    }
    onEvent({
      type: 'error',
      code: 'HTTP_ERROR',
      error: message,
      providerId: payload.providerId,
    })
    return
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream') || !response.body) {
    onEvent({
      type: 'error',
      code: 'STREAM_UNAVAILABLE',
      error:
        'Drive Chat backend (/api/drive-chat) did not return an event stream. Start the xDrive server to chat with your live providers.',
      providerId: payload.providerId,
    })
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const flushLine = (line: string) => {
    const clean = line.endsWith('\r') ? line.slice(0, -1) : line
    if (!clean.startsWith('data:')) return
    const raw = clean.slice('data:'.length).trim()
    if (!raw || raw === '[DONE]') return
    try {
      const parsed = JSON.parse(raw) as DriveChatStreamEvent
      onEvent(parsed)
    } catch {
      // ignore malformed chunk
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx = buffer.indexOf('\n')
      while (idx !== -1) {
        flushLine(buffer.slice(0, idx))
        buffer = buffer.slice(idx + 1)
        idx = buffer.indexOf('\n')
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) {
      for (const line of buffer.split('\n')) flushLine(line)
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // ignore
    }
  }
}
