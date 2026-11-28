import { describe, expect, it } from 'vitest'
import {
  fuzzyMatch,
  groupRankedItems,
  rankCommandItems,
  scoreCommandItem,
  splitHighlightRanges,
} from './fuzzy'
import type { CommandItem } from './types'

function makeItem(
  partial: Partial<CommandItem> & Pick<CommandItem, 'id' | 'label'>,
): CommandItem {
  return {
    section: 'navigate',
    onSelect: () => {},
    ...partial,
  }
}

describe('fuzzyMatch', () => {
  it('ranks exact > prefix > substring > word-boundary > scattered matches', () => {
    const exact = fuzzyMatch('surface', 'Surface')
    const prefix = fuzzyMatch('surface', 'Surface Code Notes')
    const substring = fuzzyMatch('surface', 'Rotated Surface Code')
    const boundary = fuzzyMatch('bn', 'Bench Notes')
    const scattered = fuzzyMatch('bn', 'Subdomain')

    expect(exact).not.toBeNull()
    expect(prefix).not.toBeNull()
    expect(substring).not.toBeNull()
    expect(boundary).not.toBeNull()
    expect(scattered).not.toBeNull()

    expect(exact!.score).toBeGreaterThan(prefix!.score)
    expect(prefix!.score).toBeGreaterThan(substring!.score)
    expect(boundary!.score).toBeGreaterThan(scattered!.score)
  })

  it('matches camelCase and delimiter boundaries with accurate ranges', () => {
    const match = fuzzyMatch('cp', 'CommandPalette')
    expect(match).not.toBeNull()
    expect(match!.ranges).toEqual([
      [0, 1],
      [7, 8],
    ])
  })

  it('supports multi-token out-of-order queries and still prefers contiguous phrases', () => {
    const contiguous = fuzzyMatch(
      'surface code',
      'Threshold of the Rotated Surface Code',
    )
    const outOfOrder = fuzzyMatch('code surface', 'Rotated Surface Code')

    expect(contiguous).not.toBeNull()
    expect(outOfOrder).not.toBeNull()
    expect(contiguous!.score).toBeGreaterThan(outOfOrder!.score)
    expect(outOfOrder!.ranges).toEqual([
      [8, 15],
      [16, 20],
    ])
  })

  it('returns null when characters do not match in sequence', () => {
    expect(fuzzyMatch('xyz', 'Threshold')).toBeNull()
  })
})

describe('rankCommandItems', () => {
  it('ranks by match quality first, then recency when match scores tie', () => {
    const olderExact = makeItem({
      id: 'older-exact',
      label: 'Settings',
      updatedAt: '2026-11-01T00:00:00.000Z',
    })
    const newerPrefix = makeItem({
      id: 'newer-prefix',
      label: 'Settings Providers Overview',
      updatedAt: '2026-11-28T00:00:00.000Z',
    })

    const rankedQuality = rankCommandItems('settings', [
      { item: newerPrefix, sourceId: 'nav', sourcePriority: 90 },
      { item: olderExact, sourceId: 'nav', sourcePriority: 90 },
    ])
    expect(rankedQuality.map((r) => r.item.id)).toEqual([
      'older-exact',
      'newer-prefix',
    ])

    // When query is empty (equal match score 0), recency decides order.
    const rankedRecency = rankCommandItems('', [
      { item: olderExact, sourceId: 'nav', sourcePriority: 90 },
      { item: newerPrefix, sourceId: 'nav', sourcePriority: 90 },
    ])
    expect(rankedRecency.map((r) => r.item.id)).toEqual([
      'newer-prefix',
      'older-exact',
    ])
  })

  it('supports cross-field multi-token queries (label + subtitle)', () => {
    const docItem = makeItem({
      id: 'doc-1',
      label: 'Threshold of the Rotated Surface Code',
      subtitle: 'Papers · threshold-rotated-surface-code.mrbl',
    })
    const scored = scoreCommandItem('papers threshold', docItem)
    expect(scored).not.toBeNull()
    expect(scored!.labelRanges).toEqual([[0, 9]])
  })

  it('keeps alwaysMatch items even when the query string does not fuzzy-match label', () => {
    const aiPrompt = makeItem({
      id: 'action:ai',
      section: 'actions',
      label: 'Ask AI: "explain syndrome extraction"',
      alwaysMatch: true,
      score: 12,
    })
    const ranked = rankCommandItems('explain syndrome extraction', [
      { item: aiPrompt, sourceId: 'actions', sourcePriority: 70 },
    ])
    expect(ranked).toHaveLength(1)
    expect(ranked[0].item.id).toBe('action:ai')
  })

  it('deduplicates items with the same id by keeping the best match score', () => {
    const low = makeItem({
      id: 'doc-1',
      label: 'Alpha Notes',
      subtitle: 'Recent',
      score: 5,
    })
    const high = makeItem({
      id: 'doc-1',
      label: 'Alpha Notes',
      score: 100,
    })
    const ranked = rankCommandItems('alpha', [
      { item: low, sourceId: 'recent', sourcePriority: 100 },
      { item: high, sourceId: 'nav', sourcePriority: 90 },
    ])
    expect(ranked).toHaveLength(1)
    expect(ranked[0].sourceId).toBe('nav')
  })
})

describe('groupRankedItems & splitHighlightRanges', () => {
  it('orders sections by built-in order when query is empty and by best score when searching', () => {
    const items = [
      {
        item: makeItem({
          id: 'act',
          section: 'actions',
          label: 'Toggle theme',
        }),
        sourceId: 'actions',
        sourcePriority: 70,
      },
      {
        item: makeItem({
          id: 'rec',
          section: 'recent',
          label: 'Lab Notebook',
          updatedAt: '2026-11-27T00:00:00.000Z',
        }),
        sourceId: 'recent',
        sourcePriority: 100,
      },
      {
        item: makeItem({ id: 'cre', section: 'create', label: 'New folder' }),
        sourceId: 'create',
        sourcePriority: 75,
      },
    ]

    const emptyGroups = groupRankedItems('', rankCommandItems('', items))
    expect(emptyGroups.map((g) => g.id)).toEqual([
      'recent',
      'create',
      'actions',
    ])

    const searchGroups = groupRankedItems(
      'theme',
      rankCommandItems('theme', items),
    )
    expect(searchGroups.map((g) => g.id)).toEqual(['actions'])
  })

  it('splits highlight spans without losing or duplicating characters', () => {
    expect(
      splitHighlightRanges('Surface Code', [
        [0, 4],
        [8, 12],
      ]),
    ).toEqual([
      { text: 'Surf', matched: true },
      { text: 'ace ', matched: false },
      { text: 'Code', matched: true },
    ])
  })
})
