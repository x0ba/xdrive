import { describe, expect, it } from 'vitest'

import {
  computeLineDiff,
  diffMarbleDocuments,
  diffWhiteboardSnapshots,
  extractStructuredMarbleText,
} from './version-diff'
import { withWhiteboardSnapshot } from './whiteboard-document'

describe('version-diff utilities', () => {
  it('computes unified line diffs and collapsed context hunks', () => {
    const oldText = Array.from({ length: 15 }, (_, i) => `line ${i + 1}`).join(
      '\n',
    )
    const newText = Array.from({ length: 15 }, (_, i) =>
      i === 7 ? 'line 8 updated' : `line ${i + 1}`,
    ).join('\n')

    const diff = computeLineDiff(oldText, newText)
    expect(diff.hasChanges).toBe(true)
    expect(diff.addedLines).toBe(1)
    expect(diff.removedLines).toBe(1)
    expect(diff.hunks).toHaveLength(1)
    expect(diff.hunks[0].skippedBefore).toBe(4)

    const identical = computeLineDiff(oldText, oldText)
    expect(identical.hasChanges).toBe(false)
    expect(identical.hunks).toHaveLength(0)
  })

  it('extracts structured text and diffs Docs, Notes, Slides, LaTeX, and generic Marble HTML', () => {
    const docsPast = `<!doctype html><html><head><title>Spec</title></head><body><script type="application/json" data-marble-docs-state="1">${JSON.stringify(
      {
        title: 'Quantum Spec',
        html: '<h1>Quantum Spec</h1><p>Initial threshold 0.45%</p><p>Keep unchanged</p>',
      },
    )}</script></body></html>`
    const docsCurr = `<!doctype html><html><head><title>Spec</title></head><body><script type="application/json" data-marble-docs-state="1">${JSON.stringify(
      {
        title: 'Quantum Spec',
        html: '<h1>Quantum Spec</h1><p>Updated threshold 0.62%</p><p>Keep unchanged</p>',
      },
    )}</script></body></html>`

    const docsDiff = diffMarbleDocuments(docsPast, docsCurr)
    expect(docsDiff.hasChanges).toBe(true)
    expect(docsDiff.structuredDiff.removedLines).toBe(1)
    expect(docsDiff.structuredDiff.addedLines).toBe(1)
    expect(
      docsDiff.structuredDiff.lines.some(
        (l) => l.kind === 'added' && l.text.includes('0.62%'),
      ),
    ).toBe(true)

    const notesSrc = `<script type="application/json" data-marble-notes-state="1">${JSON.stringify(
      {
        notes: [{ title: 'Run 1', folder: 'Lab', body: 'Accuracy 0.91' }],
      },
    )}</script>`
    expect(extractStructuredMarbleText(notesSrc)).toContain('## Run 1 [Lab]')
    expect(extractStructuredMarbleText(notesSrc)).toContain('Accuracy 0.91')

    const slidesSrc = `<script type="application/json" data-marble-slides-state="1">${JSON.stringify(
      {
        title: 'Talk Deck',
        slides: [
          {
            title: 'Intro',
            elements: [{ text: 'Main claim' }],
            speakerNotes: 'Pause here',
          },
        ],
      },
    )}</script>`
    expect(extractStructuredMarbleText(slidesSrc)).toContain('Slide 1: Intro')
    expect(extractStructuredMarbleText(slidesSrc)).toContain(
      'Speaker notes: Pause here',
    )

    const latexSrc = `<script type="application/json" data-marble-latex-state="1">${JSON.stringify(
      {
        title: 'Paper',
        files: [{ path: 'main.tex', content: '\\section{Results}\nGood' }],
      },
    )}</script>`
    expect(extractStructuredMarbleText(latexSrc)).toContain('=== main.tex ===')
    expect(extractStructuredMarbleText(latexSrc)).toContain(
      '\\section{Results}',
    )

    const htmlPast = `<!doctype html><html><body><h1 data-marble-id="h1">Title</h1><p data-marble-id="p1">Old</p><p data-marble-id="p-old">Drop</p></body></html>`
    const htmlCurr = `<!doctype html><html><body><h1 data-marble-id="h1">Title</h1><p data-marble-id="p1">New</p><p data-marble-id="p-new">Added</p></body></html>`
    const htmlDiff = diffMarbleDocuments(htmlPast, htmlCurr)
    expect(htmlDiff.nodeChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'p1', status: 'modified' }),
        expect.objectContaining({ id: 'p-new', status: 'added' }),
        expect.objectContaining({ id: 'p-old', status: 'removed' }),
      ]),
    )
  })

  it('summarizes tldraw whiteboard shape and page changes safely', () => {
    const baseHtml =
      '<!doctype html><html><head><title>Board</title></head><body><script type="application/json" data-marble-whiteboard-state="1">null</script></body></html>'

    const pastSource = withWhiteboardSnapshot(baseHtml, {
      document: {
        store: {
          'page:1': { id: 'page:1', typeName: 'page', name: 'Page 1' },
          'shape:a': {
            id: 'shape:a',
            typeName: 'shape',
            type: 'geo',
            x: 10,
            y: 20,
          },
          'shape:b': {
            id: 'shape:b',
            typeName: 'shape',
            type: 'draw',
            x: 30,
            y: 40,
          },
        },
      },
    })

    const currentSource = withWhiteboardSnapshot(baseHtml, {
      document: {
        store: {
          'page:1': { id: 'page:1', typeName: 'page', name: 'Page 1' },
          'page:2': { id: 'page:2', typeName: 'page', name: 'Page 2' },
          'shape:a': {
            id: 'shape:a',
            typeName: 'shape',
            type: 'geo',
            x: 150,
            y: 20,
          },
          'shape:c': {
            id: 'shape:c',
            typeName: 'shape',
            type: 'arrow',
            x: 50,
            y: 60,
          },
        },
      },
    })

    const summary = diffWhiteboardSnapshots(pastSource, currentSource)
    expect(summary.hasChanges).toBe(true)
    expect(summary.pastShapeCount).toBe(2)
    expect(summary.currentShapeCount).toBe(2)
    expect(summary.addedCount).toBe(1)
    expect(summary.modifiedCount).toBe(1)
    expect(summary.removedCount).toBe(1)
    expect(summary.addedByType).toEqual({ arrow: 1 })
    expect(summary.modifiedByType).toEqual({ geo: 1 })
    expect(summary.removedByType).toEqual({ draw: 1 })
    expect(summary.pastPageCount).toBe(1)
    expect(summary.currentPageCount).toBe(2)
    expect(summary.summaryLines).toEqual([
      '1 shape added (1 arrow)',
      '1 shape modified (1 geo)',
      '1 shape removed (1 draw)',
      'Pages: 1 → 2',
    ])

    // Blank / null snapshot resilience
    const blankDiff = diffWhiteboardSnapshots(baseHtml, currentSource)
    expect(blankDiff.pastShapeCount).toBe(0)
    expect(blankDiff.addedCount).toBe(2)
  })

  it('compares the live doc-body and falls back to embedded html', () => {
    function docsSource(live: string, embedded: string) {
      return `<!doctype html><html><head><title>Spec</title></head><body>
<article>
  <div data-marble-id="doc-body"><div class="callout"><p>${live}</p></div></div>
</article>
<script type="application/json" data-marble-docs-state="1">${JSON.stringify({
        title: 'Quantum Spec',
        html: `<p>${embedded}</p>`,
      })}</script>
</body></html>`
    }

    const past = docsSource('Old live sentence', 'Stale embedded sentence')
    const current = docsSource(
      'New live sentence about qubits',
      'Stale embedded sentence',
    )
    const text = extractStructuredMarbleText(current)
    expect(text).toContain('New live sentence about qubits')
    expect(text).not.toContain('Stale embedded sentence')

    const diff = diffMarbleDocuments(past, current)
    expect(
      diff.structuredDiff.lines.some(
        (line) =>
          line.kind === 'added' &&
          line.text.includes('New live sentence about qubits'),
      ),
    ).toBe(true)
    expect(
      diff.structuredDiff.lines.some((line) =>
        line.text.includes('Stale embedded sentence'),
      ),
    ).toBe(false)

    const fallback = `<!doctype html><html><body>
<div data-marble-id="doc-body">   </div>
<script type="application/json" data-marble-docs-state="1">${JSON.stringify({
      title: 'Spec',
      html: '<p>Embedded fallback text</p>',
    })}</script>
</body></html>`
    expect(extractStructuredMarbleText(fallback)).toContain(
      'Embedded fallback text',
    )
  })

  it('decodes HTML entities once and does not throw on invalid code points', () => {
    const source = `<!doctype html><html><body><p>Tom &amp; Jerry &#65; &#99999999; &amp;#99999999; &#x110000;</p></body></html>`
    expect(() => extractStructuredMarbleText(source)).not.toThrow()
    const text = extractStructuredMarbleText(source)
    expect(text).toContain('Tom & Jerry')
    expect(text).toContain('A')
    expect(text).toContain('&#99999999;')
    expect(text).toContain('&#x110000;')
    expect(text).not.toContain('&amp;')
  })
})
