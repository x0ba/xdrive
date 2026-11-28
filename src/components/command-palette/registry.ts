import { groupRankedItems, normalizeQuery, rankCommandItems } from './fuzzy'
import type {
  CommandContext,
  CommandItem,
  CommandSectionGroup,
  CommandSource,
  RankedCommandItem,
} from './types'

export interface CommandSourceError {
  sourceId: string
  message: string
}

export interface CommandQueryState {
  groups: CommandSectionGroup[]
  items: RankedCommandItem[]
  pendingSourceIds: string[]
  errors: CommandSourceError[]
}

/**
 * Registry allowing built-in features and external modules (such as Drive-wide
 * search) to register and unregister `CommandSource` providers dynamically.
 */
export class CommandSourceRegistry {
  private readonly sources = new Map<string, CommandSource>()
  private readonly listeners = new Set<() => void>()

  register(source: CommandSource): () => void {
    this.sources.set(source.id, source)
    this.notify()
    return () => {
      if (this.sources.get(source.id) === source) {
        this.sources.delete(source.id)
        this.notify()
      }
    }
  }

  unregister(id: string): boolean {
    const removed = this.sources.delete(id)
    if (removed) this.notify()
    return removed
  }

  has(id: string): boolean {
    return this.sources.has(id)
  }

  getSources(): CommandSource[] {
    return Array.from(this.sources.values()).sort(
      (a, b) => b.priority - a.priority,
    )
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  clear(): void {
    if (this.sources.size === 0) return
    this.sources.clear()
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

export const defaultCommandRegistry = new CommandSourceRegistry()

export function registerCommandSource(source: CommandSource): () => void {
  return defaultCommandRegistry.register(source)
}

export function mergeCommandSources(
  localSources: ReadonlyArray<CommandSource>,
  registrySources: ReadonlyArray<CommandSource>,
): CommandSource[] {
  const byId = new Map<string, CommandSource>()
  for (const source of localSources) {
    byId.set(source.id, source)
  }
  for (const source of registrySources) {
    byId.set(source.id, source)
  }
  return Array.from(byId.values()).sort((a, b) => b.priority - a.priority)
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Promise<T>).then === 'function'
  )
}

function sleepWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message === 'Aborted')
  )
}

/**
 * Execute synchronous and asynchronous command sources for a query.
 * Sync sources emit immediately before awaiting async/debounced sources.
 */
export async function executeCommandSources(
  sources: ReadonlyArray<CommandSource>,
  query: string,
  ctx: CommandContext,
  callbacks: { onUpdate: (state: CommandQueryState) => void },
): Promise<CommandQueryState> {
  const trimmed = normalizeQuery(query)
  const orderedSources = sources.slice().sort((a, b) => b.priority - a.priority)

  const settledEntries: Array<{
    item: CommandItem
    sourceId: string
    sourcePriority: number
  }> = []
  const pendingIds = new Set<string>()
  const errors: CommandSourceError[] = []

  const buildSnapshot = (): CommandQueryState => {
    const ranked = rankCommandItems(query, settledEntries)
    const groups = groupRankedItems(query, ranked)
    return {
      groups,
      items: ranked,
      pendingSourceIds: Array.from(pendingIds),
      errors: errors.slice(),
    }
  }

  const asyncTasks: Array<{
    source: CommandSource
    promise?: Promise<CommandItem[]>
  }> = []

  for (const source of orderedSources) {
    if (source.minQueryLength && trimmed.length < source.minQueryLength) {
      continue
    }

    if (source.debounceMs && source.debounceMs > 0) {
      pendingIds.add(source.id)
      asyncTasks.push({ source })
      continue
    }

    try {
      const result = source.getItems(query, ctx)
      if (isPromiseLike(result)) {
        pendingIds.add(source.id)
        asyncTasks.push({ source, promise: result })
      } else {
        for (const item of result) {
          settledEntries.push({
            item,
            sourceId: source.id,
            sourcePriority: source.priority,
          })
        }
      }
    } catch (error) {
      if (!isAbortError(error)) {
        errors.push({
          sourceId: source.id,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  const initialSnapshot = buildSnapshot()
  if (!ctx.signal.aborted) {
    callbacks.onUpdate(initialSnapshot)
  }

  if (asyncTasks.length === 0 || ctx.signal.aborted) {
    return initialSnapshot
  }

  await Promise.all(
    asyncTasks.map(async (task) => {
      try {
        let items: CommandItem[]
        if (task.promise) {
          items = await task.promise
        } else {
          await sleepWithSignal(task.source.debounceMs ?? 0, ctx.signal)
          if (ctx.signal.aborted) return
          items = await task.source.getItems(query, ctx)
        }
        if (ctx.signal.aborted) return
        for (const item of items) {
          settledEntries.push({
            item,
            sourceId: task.source.id,
            sourcePriority: task.source.priority,
          })
        }
      } catch (error) {
        if (!isAbortError(error) && !ctx.signal.aborted) {
          errors.push({
            sourceId: task.source.id,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      } finally {
        pendingIds.delete(task.source.id)
        if (!ctx.signal.aborted) {
          callbacks.onUpdate(buildSnapshot())
        }
      }
    }),
  )

  return buildSnapshot()
}
