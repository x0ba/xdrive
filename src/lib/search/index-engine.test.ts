import { describe, expect, it } from 'vitest'

import {
  DriveSearchIndex,
  buildSnippetAndHighlights,
  findHighlightRanges,
  tokenize,
} from './index-engine'
import type { IndexableItem } from './types'

function makeItem(
  overrides: Partial<IndexableItem> & { id: string },
): IndexableItem {
  const type = overrides.type ?? 'document'
  return {
    key: `${type}:${overrides.id}`,
    type,
    title: overrides.title ?? `Item ${overrides.id}`,
    href: overrides.href ?? `/d/${overrides.id}/item`,
    body: overrides.body ?? '',
    description: overrides.description ?? '',
    location: overrides.location ?? 'My Drive',
    path: overrides.path ?? `${overrides.id}.mrbl`,
    tags: overrides.tags ?? [],
    trashed: overrides.trashed ?? false,
    updatedAt: overrides.updatedAt ?? '2026-11-26T12:00:00.000Z',
    ...overrides,
  }
}

describe('DriveSearchIndex & tokenizer', () => {
  it('normalizes Unicode diacritics, casing, and punctuation', () => {
    expect(tokenize('Schrödinger’s QEC-Threshold v2!')).toEqual([
      'schrodinger',
      's',
      'qec',
      'threshold',
      'v2',
    ])
  })

  it('ranks title matches above body matches and exact matches above prefix matches', () => {
    const index = new DriveSearchIndex()
    index.upsert(
      makeItem({
        id: 'body-match',
        title: 'Lab Log',
        body: 'Ran a quick simulation for quantum error mitigation.',
      }),
    )
    index.upsert(
      makeItem({
        id: 'prefix-title',
        title: 'Quantization Notes',
        body: 'Model compression experiments.',
      }),
    )
    index.upsert(
      makeItem({
        id: 'exact-title',
        title: 'Quantum Memory',
        body: 'Distance seven surface code.',
      }),
    )

    const res = index.search({ query: 'quant' })
    expect(res.results.map((r) => r.id)).toEqual([
      'prefix-title',
      'exact-title',
      'body-match',
    ])

    const exact = index.search({ query: 'quantum' })
    expect(exact.results.map((r) => r.id)).toEqual([
      'exact-title',
      'body-match',
    ])
    expect(exact.results[0].matchedFields).toContain('title')
    expect(exact.results[1].matchedFields).toContain('body')
  })

  it('enforces multi-term AND matching across fields', () => {
    const index = new DriveSearchIndex()
    index.upsert(
      makeItem({
        id: 'both',
        title: 'Surface Code Notes',
        body: 'PyMatching decoder benchmark results.',
      }),
    )
    index.upsert(
      makeItem({
        id: 'only-one',
        title: 'Surface Roughness',
        body: 'Material calibration.',
      }),
    )

    const res = index.search({ query: 'surface pymatching' })
    expect(res.total).toBe(1)
    expect(res.results[0].id).toBe('both')
  })

  it('computes per-type counts before type filtering and filters cleanly', () => {
    const index = new DriveSearchIndex()
    index.upsert(
      makeItem({
        id: 'doc-1',
        type: 'document',
        title: 'Surface Architecture',
      }),
    )
    index.upsert(
      makeItem({
        id: 'wb-1',
        type: 'whiteboard',
        title: 'Topology Diagram',
        body: 'Surface lattice sketch',
      }),
    )
    index.upsert(
      makeItem({
        id: 'fld-1',
        type: 'folder',
        title: 'Surface Codes',
        href: '/f/fld-1/surface-codes',
      }),
    )
    index.upsert(
      makeItem({
        id: 'chat-1',
        type: 'chat',
        title: 'QEC Chat',
        href: '/chat/chat-1',
        body: 'Check the surface code threshold.',
        messageCount: 3,
      }),
    )

    const filtered = index.search({ query: 'surface', types: ['whiteboard'] })
    expect(filtered.counts).toEqual({
      all: 4,
      document: 1,
      whiteboard: 1,
      folder: 1,
      chat: 1,
    })
    expect(filtered.total).toBe(1)
    expect(filtered.results[0].id).toBe('wb-1')

    const chatOnly = index.search({ query: 'surface', types: ['chat'] })
    expect(chatOnly.results[0].matchedFields).toEqual(['messages'])
  })

  it('excludes trashed items unless includeTrash is true', () => {
    const index = new DriveSearchIndex()
    index.upsert(
      makeItem({
        id: 'active-1',
        title: 'Active Ablation',
        trashed: false,
      }),
    )
    index.upsert(
      makeItem({
        id: 'trashed-1',
        title: 'Trashed Ablation',
        trashed: true,
        trashedAt: '2026-11-27T00:00:00.000Z',
      }),
    )

    const defaultRes = index.search({ query: 'ablation' })
    expect(defaultRes.results.map((r) => r.id)).toEqual(['active-1'])
    expect(defaultRes.counts.all).toBe(1)

    const withTrash = index.search({ query: 'ablation', includeTrash: true })
    expect(withTrash.results.map((r) => r.id)).toEqual([
      'active-1',
      'trashed-1',
    ])
    expect(withTrash.counts.all).toBe(2)
  })

  it('removes stale terms on incremental upsert and remove', () => {
    const index = new DriveSearchIndex()
    index.upsert(
      makeItem({
        id: 'doc-1',
        title: 'Alpha Protocol',
        body: 'Original alpha token.',
      }),
    )
    expect(index.search({ query: 'alpha' }).total).toBe(1)

    index.upsert(
      makeItem({
        id: 'doc-1',
        title: 'Beta Protocol',
        body: 'Replaced beta token.',
      }),
    )
    expect(index.search({ query: 'alpha' }).total).toBe(0)
    expect(index.search({ query: 'beta' }).total).toBe(1)

    expect(index.remove('document:doc-1')).toBe(true)
    expect(index.search({ query: 'beta' }).total).toBe(0)
    expect(index.size).toBe(0)
  })

  it('produces exact UTF-16 highlight ranges and multi-term snippet windows', () => {
    const text = 'Schrödinger equation and quantum decoder'
    const ranges = findHighlightRanges(text, ['schrodinger', 'quant'])
    expect(ranges.map((r) => text.slice(r.start, r.end))).toEqual([
      'Schrödinger',
      'quant',
    ])

    const longBody = [
      'Introductory notes covering general lab hygiene and weekly setup.',
      'Another long paragraph about calibration baselines and cooling cycles in cryostat two.',
      'Finally, the rotated surface code achieves sub-threshold error suppression using sparse blossom matching.',
      'Trailing remarks about hardware scheduling.',
    ].join(' ')

    const { snippet, snippetMatches } = buildSnippetAndHighlights(
      {
        type: 'document',
        body: longBody,
        description: '',
        location: 'My Drive',
      },
      ['surface', 'blossom'],
      130,
    )

    expect(snippet.startsWith('…')).toBe(true)
    expect(
      snippetMatches.map((m) => snippet.slice(m.start, m.end).toLowerCase()),
    ).toEqual(['surface', 'blossom'])
  })
})
