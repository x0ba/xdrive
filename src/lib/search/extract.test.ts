import { describe, expect, it } from 'vitest'

import { whiteboardStateScript } from '#/lib/marble/whiteboard-document'
import {
  extractChatMessagesText,
  extractMarbleDocumentText,
  extractWhiteboardText,
} from './extract'

describe('search text extractors', () => {
  it('extracts plain text from Marble HTML while stripping scripts, styles, templates, and decoding entities', () => {
    const html = `<!doctype html>
<html lang="en">
<head>
  <title>Ignored Head Title</title>
  <style>body { color: red; }</style>
</head>
<body>
  <!-- hidden html comment token_comment_ignore -->
  <main data-marble-id="root">
    <h1 data-marble-id="h1">Floquet &amp; Surface Codes</h1>
    <p data-marble-id="p1">Threshold near <code>p_th</code> &mdash; error &lt; 10&#8315;&#179;.</p>
    <template><p>template_placeholder_ignore</p></template>
  </main>
  <script>const hiddenScriptToken = "ignore_script_text";</script>
</body>
</html>`

    const text = extractMarbleDocumentText(html)
    expect(text).toContain('Floquet & Surface Codes')
    expect(text).toContain('Threshold near p_th — error < 10⁻³.')
    expect(text).not.toContain('Ignored Head Title')
    expect(text).not.toContain('token_comment_ignore')
    expect(text).not.toContain('template_placeholder_ignore')
    expect(text).not.toContain('ignore_script_text')
    expect(text).not.toContain('color: red')
  })

  it('preserves words containing mid-word inline HTML formatting while separating block elements', () => {
    const html = `<!doctype html>
<html>
<body>
  <main data-marble-id="root">
    <p data-marble-id="p1">Examine the micro<strong>scope</strong>, <em>syn</em>drome, and re<span class="hl">search</span> notes.</p>
    <p data-marble-id="p2">NextSection</p>
    <table><tr><td>AlphaCell</td><td>BetaCell</td></tr></table>
  </main>
</body>
</html>`

    const text = extractMarbleDocumentText(html)
    expect(text).toContain('microscope')
    expect(text).toContain('syndrome')
    expect(text).toContain('research')
    expect(text).not.toContain('micro scope')
    expect(text).not.toContain('syn drome')
    expect(text).not.toContain('re search')
    expect(text.split('\n')).toEqual([
      'Examine the microscope, syndrome, and research notes.',
      'NextSection',
      'AlphaCell',
      'BetaCell',
    ])
  })

  it('extracts all files from embedded LaTeX project state beyond the HTML excerpt', () => {
    const latexState = {
      title: 'Concatenated Quantum Memory',
      mainFile: 'main.tex',
      files: [
        {
          id: 'f1',
          path: 'main.tex',
          kind: 'tex',
          content: `${'A'.repeat(1400)}\n\\section{Decoder Convergence}\nSparse blossom decoder meets the cryogenic latency budget.`,
        },
        {
          id: 'f2',
          path: 'references.bib',
          kind: 'bib',
          content:
            '@article{higgott2022, title={Sparse Blossom}, author={Oscar Higgott}}',
        },
      ],
    }
    const html = `<!doctype html>
<html>
<head><title>Concatenated Quantum Memory</title></head>
<body>
  <pre>Short excerpt only</pre>
  <script type="application/json" data-marble-latex-state="1">${JSON.stringify(latexState).replace(/<\//g, '<\\/')}</script>
</body>
</html>`

    const text = extractMarbleDocumentText(html)
    expect(text).toContain('Decoder Convergence')
    expect(text).toContain('cryogenic latency budget')
    expect(text).toContain('Oscar Higgott')
    expect(text).toContain('references.bib')
  })

  it('extracts live Docs DOM content plus embedded comment replies', () => {
    const docsState = {
      title: 'Memory Spec',
      html: '<p>Old body</p>',
      comments: [
        {
          id: 'c1',
          quote: 'minimum-weight perfect matching',
          body: 'Verify PyMatching commit hash',
          replies: [{ id: 'r1', body: 'Pinned commit hash 9f8a7b6c' }],
        },
      ],
    }
    const html = `<!doctype html>
<html>
<body>
  <article data-marble-id="doc-shell">
    <div data-marble-id="doc-body"><p>Updated live paragraph on distance seven qubits.</p></div>
  </article>
  <script type="application/json" data-marble-docs-state="1">${JSON.stringify(docsState)}</script>
</body>
</html>`

    const text = extractMarbleDocumentText(html)
    expect(text).toContain('Updated live paragraph on distance seven qubits.')
    expect(text).toContain('Verify PyMatching commit hash')
    expect(text).toContain('Pinned commit hash 9f8a7b6c')
  })

  it('extracts tldraw v5 richText, legacy text, frame names, altText, bookmarks, and custom page names while skipping boilerplate and data URLs', () => {
    const snapshot = {
      document: {
        store: {
          'document:document': {
            id: 'document:document',
            typeName: 'document',
            name: 'Architecture Board',
          },
          'page:one': {
            id: 'page:one',
            typeName: 'page',
            name: 'Page 1',
            index: 'a1',
          },
          'page:two': {
            id: 'page:two',
            typeName: 'page',
            name: 'Decoder Pipeline',
            index: 'a2',
          },
          'shape:note1': {
            id: 'shape:note1',
            typeName: 'shape',
            type: 'note',
            index: 'a1',
            props: {
              richText: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Syndrome extractor' }],
                  },
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'latency target 80us' }],
                  },
                ],
              },
            },
          },
          'shape:frame1': {
            id: 'shape:frame1',
            typeName: 'shape',
            type: 'frame',
            index: 'a2',
            props: { name: 'Cryogenic Control Rack' },
          },
          'shape:legacy': {
            id: 'shape:legacy',
            typeName: 'shape',
            type: 'geo',
            index: 'a3',
            props: { text: 'Legacy Matching Graph' },
          },
          'shape:img1': {
            id: 'shape:img1',
            typeName: 'shape',
            type: 'image',
            index: 'a4',
            props: { altText: 'Threshold collapse curve figure' },
          },
          'asset:bookmark1': {
            id: 'asset:bookmark1',
            typeName: 'asset',
            type: 'bookmark',
            props: {
              title: 'PyMatching Docs',
              description: 'Blossom algorithm reference',
              src: 'https://example.com',
            },
          },
          'asset:img1': {
            id: 'asset:img1',
            typeName: 'asset',
            type: 'image',
            props: {
              src: 'data:image/png;base64,AAAASECRETBASE64TOKEN',
            },
          },
        },
      },
      session: { version: 0 },
    }

    const source = `<!doctype html>
<html>
<head><title>System Sketch</title></head>
<body>
  <main data-marble-id="whiteboard">
    <p data-marble-id="whiteboard-lede">An infinite canvas. Draw on it in xDrive and this file keeps the tldraw snapshot.</p>
    ${whiteboardStateScript(snapshot)}
  </main>
</body>
</html>`

    const text = extractMarbleDocumentText(source)
    expect(text).toContain('Architecture Board')
    expect(text).toContain('Decoder Pipeline')
    expect(text).toContain('Syndrome extractor')
    expect(text).toContain('latency target 80us')
    expect(text).toContain('Cryogenic Control Rack')
    expect(text).toContain('Legacy Matching Graph')
    expect(text).toContain('Threshold collapse curve figure')
    expect(text).toContain('PyMatching Docs')
    expect(text).toContain('Blossom algorithm reference')
    expect(text).not.toContain('Page 1')
    expect(text).not.toContain('An infinite canvas')
    expect(text).not.toContain('AAAASECRETBASE64TOKEN')
  })

  it('returns empty string for null or corrupt whiteboard snapshots', () => {
    expect(extractWhiteboardText(null)).toBe('')
    expect(extractWhiteboardText('{bad json')).toBe('')
    expect(extractMarbleDocumentText(whiteboardStateScript(null))).toBe('')
  })

  it('extracts chat message prose while stripping xdrive-actions JSON fences', () => {
    const text = extractChatMessagesText([
      { role: 'user', content: 'Summarize the threshold ablation notes.' },
      {
        role: 'assistant',
        content: `Found two relevant documents in Research.\n\n\`\`\`xdrive-actions\n{"actions":[{"kind":"edit_document","docId":"doc-hidden-json-token"}]}\n\`\`\``,
      },
    ])

    expect(text).toContain('Summarize the threshold ablation notes.')
    expect(text).toContain('Found two relevant documents in Research.')
    expect(text).not.toContain('xdrive-actions')
    expect(text).not.toContain('doc-hidden-json-token')
  })
})
