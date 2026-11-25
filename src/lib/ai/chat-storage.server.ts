import { randomBytes } from 'node:crypto'
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'

import type {
  DriveChatAction,
  DriveChatMessage,
  DriveChatMode,
  DriveChatThread,
  DriveContextRef,
  ReasoningEffort,
} from '#/lib/ai/drive-chat-types'
import { getDriveDir, isEnoent } from '#/lib/marble/drive-storage.server'
import type { AIMessage, AIProviderId, MarbleOpProposal } from '#/lib/types'

export const CHAT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

const VALID_MODES = new Set<DriveChatMode>(['ask', 'review', 'auto'])
const VALID_EFFORTS = new Set<ReasoningEffort>([
  'off',
  'low',
  'medium',
  'high',
  'max',
])
const VALID_ROLES = new Set(['user', 'assistant', 'system'])
const VALID_PROVIDERS = new Set<AIProviderId>([
  'antigravity',
  'opencode-go',
  'grok-build',
  'xai',
  'claude',
  'openai',
])

export class ChatStorageError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ChatStorageError'
    this.status = status
  }
}

export interface StoredDocChatHistory {
  docId: string
  updatedAt: string
  messages: AIMessage[]
}

function fail(status: number, message: string): never {
  throw new ChatStorageError(status, message)
}

export function getChatsDir(): string {
  return path.resolve(getDriveDir(), '.xdrive', 'chats')
}

export function getDocChatsDir(): string {
  return path.resolve(getDriveDir(), '.xdrive', 'doc-chats')
}

let chatLock: Promise<void> = Promise.resolve()

async function withChatLock<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const previous = chatLock
  chatLock = previous.then(() => gate)
  await previous
  try {
    return await fn()
  } finally {
    release()
  }
}

export function assertChatId(raw: string, label = 'threadId'): string {
  const trimmed = raw.trim()
  if (!trimmed || !CHAT_ID_PATTERN.test(trimmed) || trimmed.includes('..')) {
    fail(400, `Invalid ${label}`)
  }
  return trimmed
}

function resolveThreadFilePath(threadId: string): string {
  const validId = assertChatId(threadId, 'threadId')
  const chatsDir = getChatsDir()
  const fullPath = path.resolve(chatsDir, `${validId}.json`)
  if (path.dirname(fullPath) !== chatsDir) {
    fail(400, 'Invalid threadId')
  }
  return fullPath
}

function resolveDocChatFilePath(docId: string): string {
  const validId = assertChatId(docId, 'docId')
  const docChatsDir = getDocChatsDir()
  const fullPath = path.resolve(docChatsDir, `${validId}.json`)
  if (path.dirname(fullPath) !== docChatsDir) {
    fail(400, 'Invalid docId')
  }
  return fullPath
}

async function writeAtomicJson(fullPath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(fullPath), { recursive: true })
  const temporary = `${fullPath}.${randomBytes(8).toString('hex')}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(data, null, 2), 'utf8')
    await rename(temporary, fullPath)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

function sanitizeIso(value: unknown, fallback: string): string {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return value
  }
  return fallback
}

function sanitizeMode(value: unknown, fallback: DriveChatMode): DriveChatMode {
  if (typeof value === 'string' && VALID_MODES.has(value as DriveChatMode)) {
    return value as DriveChatMode
  }
  return fallback
}

function sanitizeEffort(
  value: unknown,
  fallback: ReasoningEffort,
): ReasoningEffort {
  if (
    typeof value === 'string' &&
    VALID_EFFORTS.has(value as ReasoningEffort)
  ) {
    return value as ReasoningEffort
  }
  return fallback
}

function sanitizeProvider(value: unknown): AIProviderId | undefined {
  if (typeof value === 'string' && VALID_PROVIDERS.has(value as AIProviderId)) {
    return value as AIProviderId
  }
  return undefined
}

function sanitizeDriveChatMessage(raw: unknown): DriveChatMessage | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  if (typeof rec.id !== 'string' || !rec.id.trim()) return null
  if (typeof rec.role !== 'string' || !VALID_ROLES.has(rec.role)) return null
  if (typeof rec.content !== 'string') return null

  const now = new Date().toISOString()
  const out: DriveChatMessage = {
    id: rec.id.trim(),
    role: rec.role as DriveChatMessage['role'],
    content: rec.content,
    createdAt: sanitizeIso(rec.createdAt, now),
    isStreaming: false,
  }

  if (typeof rec.modelId === 'string' && rec.modelId.trim()) {
    out.modelId = rec.modelId
  }
  if (typeof rec.modelName === 'string' && rec.modelName.trim()) {
    out.modelName = rec.modelName
  }
  const providerId = sanitizeProvider(rec.providerId)
  if (providerId) out.providerId = providerId
  if (
    typeof rec.reasoningEffort === 'string' &&
    VALID_EFFORTS.has(rec.reasoningEffort as ReasoningEffort)
  ) {
    out.reasoningEffort = rec.reasoningEffort as ReasoningEffort
  }
  if (
    typeof rec.mode === 'string' &&
    VALID_MODES.has(rec.mode as DriveChatMode)
  ) {
    out.mode = rec.mode as DriveChatMode
  }
  if (Array.isArray(rec.thoughts)) {
    out.thoughts = rec.thoughts.filter(
      (item): item is string => typeof item === 'string',
    )
  }
  if (
    typeof rec.thinkingDurationMs === 'number' &&
    Number.isFinite(rec.thinkingDurationMs)
  ) {
    out.thinkingDurationMs = rec.thinkingDurationMs
  }
  if (Array.isArray(rec.contextRefs)) {
    out.contextRefs = rec.contextRefs.filter(
      (item): item is DriveContextRef =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    )
  }
  if (Array.isArray(rec.referencedDocIds)) {
    out.referencedDocIds = rec.referencedDocIds.filter(
      (item): item is string => typeof item === 'string',
    )
  }
  if (Array.isArray(rec.actions)) {
    out.actions = rec.actions.filter(
      (item): item is DriveChatAction =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    )
  }
  if (typeof rec.error === 'string' && rec.error) {
    out.error = rec.error
  }

  return out
}

export function sanitizeDriveChatThread(
  raw: unknown,
  options?: { forcedId?: string; generateIdIfMissing?: boolean },
): DriveChatThread {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail(400, 'Thread payload must be a JSON object')
  }
  const rec = raw as Record<string, unknown>
  const now = new Date().toISOString()

  let id: string
  if (options?.forcedId) {
    id = assertChatId(options.forcedId, 'threadId')
  } else if (typeof rec.id === 'string' && rec.id.trim()) {
    id = assertChatId(rec.id, 'threadId')
  } else if (options?.generateIdIfMissing) {
    id = `chat-${randomBytes(6).toString('hex')}`
  } else {
    fail(400, 'Thread id is required')
  }

  const title =
    typeof rec.title === 'string' && rec.title.trim()
      ? rec.title.trim().slice(0, 200)
      : 'New chat'
  const createdAt = sanitizeIso(rec.createdAt, now)
  const updatedAt = sanitizeIso(rec.updatedAt, createdAt)
  const modelId =
    typeof rec.modelId === 'string' && rec.modelId.trim()
      ? rec.modelId.trim()
      : 'antigravity/default'
  const reasoningEffort = sanitizeEffort(rec.reasoningEffort, 'high')
  const mode = sanitizeMode(rec.mode, 'review')
  const messages = Array.isArray(rec.messages)
    ? rec.messages
        .map(sanitizeDriveChatMessage)
        .filter((item): item is DriveChatMessage => item !== null)
    : []

  const thread: DriveChatThread = {
    id,
    title,
    createdAt,
    updatedAt,
    modelId,
    reasoningEffort,
    mode,
    messages,
  }
  if (typeof rec.pinned === 'boolean') {
    thread.pinned = rec.pinned
  }
  return thread
}

function sortThreads(threads: DriveChatThread[]): DriveChatThread[] {
  return threads.slice().sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) {
      return a.pinned ? -1 : 1
    }
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
  })
}

async function readThreadFileOptional(
  threadId: string,
): Promise<DriveChatThread | null> {
  const fullPath = resolveThreadFilePath(threadId)
  try {
    const raw = await readFile(fullPath, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    return sanitizeDriveChatThread(parsed, { forcedId: threadId })
  } catch (error) {
    if (isEnoent(error)) return null
    return null
  }
}

export async function listChatThreads(): Promise<DriveChatThread[]> {
  const chatsDir = getChatsDir()
  let names: string[]
  try {
    names = await readdir(chatsDir)
  } catch (error) {
    if (isEnoent(error)) return []
    throw error
  }

  const loaded = await Promise.all(
    names
      .filter((name) => name.endsWith('.json'))
      .map(async (fileName) => {
        const id = fileName.slice(0, -'.json'.length)
        if (!CHAT_ID_PATTERN.test(id) || id.includes('..')) return null
        return await readThreadFileOptional(id)
      }),
  )

  return sortThreads(
    loaded.filter((item): item is DriveChatThread => item !== null),
  )
}

export async function readChatThread(
  threadId: string,
): Promise<DriveChatThread | null> {
  const validId = assertChatId(threadId, 'threadId')
  return await readThreadFileOptional(validId)
}

export async function createChatThread(raw: unknown): Promise<DriveChatThread> {
  return await withChatLock(async () => {
    const thread = sanitizeDriveChatThread(raw, { generateIdIfMissing: true })
    const existing = await readThreadFileOptional(thread.id)
    if (existing) {
      fail(409, `Chat thread "${thread.id}" already exists`)
    }
    await writeAtomicJson(resolveThreadFilePath(thread.id), thread)
    return thread
  })
}

export async function saveChatThread(
  threadId: string,
  raw: unknown,
): Promise<DriveChatThread> {
  return await withChatLock(async () => {
    const thread = sanitizeDriveChatThread(raw, { forcedId: threadId })
    await writeAtomicJson(resolveThreadFilePath(thread.id), thread)
    return thread
  })
}

export async function patchChatThread(
  threadId: string,
  rawPatch: unknown,
): Promise<DriveChatThread> {
  return await withChatLock(async () => {
    if (!rawPatch || typeof rawPatch !== 'object' || Array.isArray(rawPatch)) {
      fail(400, 'Patch payload must be a JSON object')
    }
    const validId = assertChatId(threadId, 'threadId')
    const existing = await readThreadFileOptional(validId)
    if (!existing) {
      fail(404, `Chat thread "${validId}" not found`)
    }
    const patch = rawPatch as Record<string, unknown>
    const merged: Record<string, unknown> = {
      ...existing,
      ...patch,
      id: validId,
      createdAt: existing.createdAt,
      updatedAt:
        typeof patch.updatedAt === 'string' &&
        !Number.isNaN(Date.parse(patch.updatedAt))
          ? patch.updatedAt
          : new Date().toISOString(),
    }
    const next = sanitizeDriveChatThread(merged, { forcedId: validId })
    await writeAtomicJson(resolveThreadFilePath(validId), next)
    return next
  })
}

export async function deleteChatThread(
  threadId: string,
): Promise<{ ok: true; id: string; deleted: true }> {
  return await withChatLock(async () => {
    const validId = assertChatId(threadId, 'threadId')
    await rm(resolveThreadFilePath(validId), { force: true })
    return { ok: true, id: validId, deleted: true }
  })
}

export async function importChatThreads(rawThreads: unknown): Promise<{
  imported: number
  skipped: number
  threads: DriveChatThread[]
}> {
  if (!Array.isArray(rawThreads)) {
    fail(400, 'threads must be an array')
  }
  return await withChatLock(async () => {
    let imported = 0
    let skipped = 0

    for (const item of rawThreads) {
      let thread: DriveChatThread
      try {
        thread = sanitizeDriveChatThread(item, { generateIdIfMissing: true })
      } catch {
        skipped += 1
        continue
      }
      const existing = await readThreadFileOptional(thread.id)
      if (existing) {
        skipped += 1
        continue
      }
      await writeAtomicJson(resolveThreadFilePath(thread.id), thread)
      imported += 1
    }

    const threads = await listChatThreads()
    return { imported, skipped, threads }
  })
}

function sanitizeAIMessage(raw: unknown): AIMessage | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  if (typeof rec.id !== 'string' || !rec.id.trim()) return null
  if (typeof rec.role !== 'string' || !VALID_ROLES.has(rec.role)) return null
  if (typeof rec.content !== 'string') return null

  const now = new Date().toISOString()
  const out: AIMessage = {
    id: rec.id.trim(),
    role: rec.role as AIMessage['role'],
    content: rec.content,
    timestamp: sanitizeIso(rec.timestamp, now),
  }

  if (typeof rec.modelId === 'string' && rec.modelId.trim()) {
    out.modelId = rec.modelId
  }
  const providerId = sanitizeProvider(rec.providerId)
  if (providerId) out.providerId = providerId
  if (
    rec.runtimeSource === 'antigravity-acp' ||
    rec.runtimeSource === 'opencode-acp' ||
    rec.runtimeSource === 'opencode-go' ||
    rec.runtimeSource === 'grok-build-acp' ||
    rec.runtimeSource === 'api' ||
    rec.runtimeSource === 'synthesizer'
  ) {
    out.runtimeSource = rec.runtimeSource
  }
  if (Array.isArray(rec.thoughts)) {
    out.thoughts = rec.thoughts.filter(
      (item): item is string => typeof item === 'string',
    )
  }
  if (Array.isArray(rec.attachedElements)) {
    out.attachedElements = rec.attachedElements as AIMessage['attachedElements']
  }
  if (Array.isArray(rec.attachedSketches)) {
    out.attachedSketches = rec.attachedSketches as AIMessage['attachedSketches']
  }
  if (Array.isArray(rec.stages)) {
    out.stages = (rec.stages as NonNullable<AIMessage['stages']>).map(
      (stage) => ({
        ...stage,
        completed: true,
      }),
    )
  }
  if (
    rec.proposal &&
    typeof rec.proposal === 'object' &&
    !Array.isArray(rec.proposal)
  ) {
    const proposal = rec.proposal as MarbleOpProposal
    out.proposal =
      proposal.status === 'thinking'
        ? { ...proposal, status: 'proposed' }
        : proposal
  }

  return out
}

function sanitizeAIMessages(raw: unknown): AIMessage[] {
  if (!Array.isArray(raw)) {
    fail(400, 'messages must be an array')
  }
  return raw
    .map(sanitizeAIMessage)
    .filter((item): item is AIMessage => item !== null)
}

async function readDocChatFileOptional(
  docId: string,
): Promise<StoredDocChatHistory | null> {
  const fullPath = resolveDocChatFilePath(docId)
  try {
    const raw = await readFile(fullPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<StoredDocChatHistory>
    const messages = Array.isArray(parsed.messages)
      ? parsed.messages
          .map(sanitizeAIMessage)
          .filter((item): item is AIMessage => item !== null)
      : []
    return {
      docId,
      updatedAt: sanitizeIso(parsed.updatedAt, new Date().toISOString()),
      messages,
    }
  } catch (error) {
    if (isEnoent(error)) return null
    return null
  }
}

export async function listDocChatHistories(): Promise<
  Record<string, AIMessage[]>
> {
  const dir = getDocChatsDir()
  let names: string[]
  try {
    names = await readdir(dir)
  } catch (error) {
    if (isEnoent(error)) return {}
    throw error
  }

  const out: Record<string, AIMessage[]> = {}
  await Promise.all(
    names
      .filter((name) => name.endsWith('.json'))
      .map(async (fileName) => {
        const docId = fileName.slice(0, -'.json'.length)
        if (!CHAT_ID_PATTERN.test(docId) || docId.includes('..')) return
        const record = await readDocChatFileOptional(docId)
        if (record && record.messages.length > 0) {
          out[docId] = record.messages
        }
      }),
  )
  return out
}

export async function readDocChatHistory(
  docId: string,
): Promise<StoredDocChatHistory | null> {
  const validId = assertChatId(docId, 'docId')
  return await readDocChatFileOptional(validId)
}

export async function saveDocChatHistory(
  docId: string,
  rawMessages: unknown,
): Promise<StoredDocChatHistory> {
  return await withChatLock(async () => {
    const validId = assertChatId(docId, 'docId')
    const messages = sanitizeAIMessages(rawMessages)
    const updatedAt = new Date().toISOString()
    const fullPath = resolveDocChatFilePath(validId)
    if (messages.length === 0) {
      await rm(fullPath, { force: true })
      return { docId: validId, updatedAt, messages: [] }
    }
    const record: StoredDocChatHistory = {
      docId: validId,
      updatedAt,
      messages,
    }
    await writeAtomicJson(fullPath, record)
    return record
  })
}

export async function deleteDocChatHistory(
  docId: string,
): Promise<{ ok: true; docId: string; deleted: true }> {
  return await withChatLock(async () => {
    const validId = assertChatId(docId, 'docId')
    await rm(resolveDocChatFilePath(validId), { force: true })
    return { ok: true, docId: validId, deleted: true }
  })
}
