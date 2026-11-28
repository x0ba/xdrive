import { describe, expect, it, vi } from 'vitest'
import {
  CommandSourceRegistry,
  executeCommandSources,
  mergeCommandSources,
} from './registry'
import type { CommandQueryState } from './registry'
import type { CommandContext, CommandItem, CommandSource } from './types'

function makeContext(signal?: AbortSignal): CommandContext {
  return {
    pathname: '/drive',
    activeNav: 'drive',
    currentFolderId: null,
    activeDoc: null,
    theme: 'dark',
    signal: signal ?? new AbortController().signal,
  }
}

describe('CommandSourceRegistry', () => {
  it('registers, sorts by priority, notifies subscribers, and unregisters cleanly', () => {
    const registry = new CommandSourceRegistry()
    const listener = vi.fn()
    const unsubscribe = registry.subscribe(listener)

    const unregLow = registry.register({
      id: 'low',
      label: 'Low',
      priority: 10,
      getItems: () => [],
    })
    registry.register({
      id: 'high',
      label: 'High',
      priority: 100,
      getItems: () => [],
    })

    expect(registry.getSources().map((s) => s.id)).toEqual(['high', 'low'])
    expect(listener).toHaveBeenCalledTimes(2)

    unregLow()
    expect(registry.has('low')).toBe(false)
    expect(registry.getSources().map((s) => s.id)).toEqual(['high'])

    unsubscribe()
    registry.clear()
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('merges local and registry sources by id and priority', () => {
    const merged = mergeCommandSources(
      [
        {
          id: 'builtin:navigate',
          label: 'Navigate',
          priority: 90,
          getItems: () => [],
        },
      ],
      [
        {
          id: 'external:drive-search',
          label: 'Search Results',
          priority: 95,
          getItems: () => [],
        },
      ],
    )
    expect(merged.map((s) => s.id)).toEqual([
      'external:drive-search',
      'builtin:navigate',
    ])
  })
})

describe('executeCommandSources', () => {
  it('emits sync results immediately while tracking pending async sources', async () => {
    let resolveAsync!: (items: CommandItem[]) => void
    const asyncPromise = new Promise<CommandItem[]>((resolve) => {
      resolveAsync = resolve
    })

    const syncSource: CommandSource = {
      id: 'sync',
      label: 'Navigate',
      priority: 90,
      getItems: () => [
        {
          id: 'doc-1',
          label: 'Surface Code Draft',
          section: 'navigate',
          onSelect: () => {},
        },
      ],
    }

    const asyncSource: CommandSource = {
      id: 'async-search',
      label: 'Search Results',
      priority: 95,
      minQueryLength: 2,
      getItems: () => asyncPromise,
    }

    const updates: CommandQueryState[] = []
    const runPromise = executeCommandSources(
      [syncSource, asyncSource],
      'surface',
      makeContext(),
      {
        onUpdate: (state) => updates.push(state),
      },
    )

    // Initial emission happens synchronously with sync items and pending async id.
    expect(updates).toHaveLength(1)
    expect(updates[0].items.map((i) => i.item.id)).toEqual(['doc-1'])
    expect(updates[0].pendingSourceIds).toEqual(['async-search'])

    resolveAsync([
      {
        id: 'search-hit-1',
        label: 'Surface Code Body Match',
        section: 'drive-search',
        sectionLabel: 'Search Results',
        alwaysMatch: true,
        score: 6000,
        onSelect: () => {},
      },
    ])

    const finalState = await runPromise
    expect(updates).toHaveLength(2)
    expect(finalState.pendingSourceIds).toEqual([])
    expect(finalState.items.map((i) => i.item.id)).toEqual([
      'search-hit-1',
      'doc-1',
    ])
  })

  it('isolates failing sources and ignores aborted queries', async () => {
    const failingSource: CommandSource = {
      id: 'broken',
      label: 'Broken',
      priority: 50,
      getItems: async () => {
        throw new Error('Backend search offline')
      },
    }
    const okSource: CommandSource = {
      id: 'ok',
      label: 'Navigate',
      priority: 90,
      getItems: () => [
        {
          id: 'ok-1',
          label: 'My Drive',
          section: 'navigate',
          onSelect: () => {},
        },
      ],
    }

    const state = await executeCommandSources(
      [failingSource, okSource],
      'drive',
      makeContext(),
      { onUpdate: () => {} },
    )
    expect(state.items.map((i) => i.item.id)).toEqual(['ok-1'])
    expect(state.errors).toEqual([
      { sourceId: 'broken', message: 'Backend search offline' },
    ])

    // Aborted debounced source never invokes getItems or onUpdate after abort.
    const controller = new AbortController()
    const debouncedGetItems = vi.fn(() => [])
    const debouncedSource: CommandSource = {
      id: 'debounced',
      label: 'Debounced',
      priority: 40,
      debounceMs: 50,
      getItems: debouncedGetItems,
    }
    const onUpdate = vi.fn()
    const abortedRun = executeCommandSources(
      [debouncedSource],
      'drive',
      makeContext(controller.signal),
      { onUpdate },
    )
    controller.abort()
    await abortedRun
    expect(debouncedGetItems).not.toHaveBeenCalled()
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })
})
