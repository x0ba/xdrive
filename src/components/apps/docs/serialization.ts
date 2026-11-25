import { escapeText } from '#/lib/marble/engine-client'
import {
  DOCUMENT_DESIGN_SYSTEM_SLUG,
  DOCUMENT_DONTS_SYSTEM_SLUG,
  MARBLE_BASE_CSS,
} from '#/lib/marble/templates'
import { DEFAULT_DOCS_PAGE_SETUP } from './types'
import type { DocsState } from './types'

export const DEFAULT_DOCS_HTML = `
<h1 id="heading-title" data-marble-id="doc-title">Logical Memory Specification</h1>
<p data-marble-id="summary-v1">We will know the memory works when a distance-7 logical qubit stays below <strong>10<sup>−3</sup></strong> logical error per round for an hour of circuit-level noise, and we will know the spec failed if the decoder, not the code, is what moved.</p>
<h2 id="heading-problem" data-marble-id="sec-problem-h">1. Problem</h2>
<p data-marble-id="sec-problem-p">Physical error rates sit near the threshold, so a small mis-estimate of <code>p_th</code> changes whether the machine is a memory or a heater. The specification must pin down which noise model and decoder hash we trust before any distance sweep begins.</p>
<h2 id="heading-method" data-marble-id="sec-method-h">2. Method &amp; Experimental Protocol</h2>
<p data-marble-id="sec-method-p">Rotated surface code, circuit-level depolarizing noise, minimum-weight perfect matching. Distances <strong>3, 5, and 7</strong>. One seed list, hashed with SHA-256 and stored in the lab notebook.</p>
<blockquote data-marble-id="callout-method"><strong>Design constraint:</strong> Freeze the decoder commit before running the sweep so reviewers and authors inspect the exact same matching graph.</blockquote>
<table data-marble-id="doc-metrics-table">
  <thead>
    <tr><th>Distance (d)</th><th>Physical p</th><th>Logical error / round</th><th>Status</th></tr>
  </thead>
  <tbody>
    <tr><td>d = 3</td><td>0.45%</td><td>4.8 × 10⁻³</td><td>Baseline</td></tr>
    <tr><td>d = 5</td><td>0.45%</td><td>1.6 × 10⁻³</td><td>Verified</td></tr>
    <tr><td>d = 7</td><td>0.45%</td><td>6.2 × 10⁻⁴</td><td>Operating point</td></tr>
  </tbody>
</table>
<h2 id="heading-eval" data-marble-id="sec-eval-h">3. Evaluation Criteria</h2>
<p data-marble-id="sec-eval-p">Report logical error <em>per round</em>, not per shot. Fit the threshold by finite-size collapse, and publish the fit residuals next to the scaling curve:</p>
<ul>
  <li>Verify quadratic scaling of decoder runtime against defect count.</li>
  <li>Publish raw syndrome count distributions alongside bootstrap confidence intervals.</li>
  <li>Cross-check boundary conditions on open vs. periodic lattices.</li>
</ul>
<h2 id="heading-risks" data-marble-id="sec-risks-h">4. Risks &amp; Falsifiability</h2>
<p data-marble-id="sec-risks-p">A better decoder can fake a higher threshold. We freeze the decoder before the distance sweep and state its exact edge-weight formula in Theorem 1. If the decoder changes, the result belongs in a separate manuscript.</p>
`.trim()

export const DEFAULT_DOCS_SEED: DocsState = {
  title: 'Collaborative Research Document',
  starred: true,
  folder: 'Specs',
  html: DEFAULT_DOCS_HTML,
  pageSetup: { ...DEFAULT_DOCS_PAGE_SETUP },
  comments: [
    {
      id: 'cmt-1',
      author: 'Jordan Hale',
      initials: 'JH',
      quote: 'Check that the decoder assumption is in the theorem',
      body: 'Make sure we cite the exact PyMatching commit hash in Section 2 so the matching graph is reproducible.',
      createdAt: '2026-11-22T18:20:00.000Z',
      resolved: false,
      kind: 'comment',
      replies: [
        {
          id: 'rep-1',
          author: 'Mira Chen',
          initials: 'MC',
          body: 'Added the SHA-256 seed requirement — will pin the PyMatching commit next.',
          createdAt: '2026-11-22T19:05:00.000Z',
        },
      ],
    },
    {
      id: 'cmt-2',
      author: 'Dr. Elena Vance',
      initials: 'EV',
      quote: 'per round, not per shot',
      body: 'Suggest replacing "per shot" with "per full d-round memory cycle" for clarity.',
      createdAt: '2026-11-22T21:10:00.000Z',
      resolved: false,
      kind: 'suggestion',
      suggestionReplace: 'per full d-round memory cycle',
      replies: [],
    },
  ],
}

export function parseDocsFromMarbleSource(source: string): DocsState {
  if (typeof DOMParser === 'undefined' || !source.trim()) {
    return {
      ...DEFAULT_DOCS_SEED,
      pageSetup: { ...DEFAULT_DOCS_PAGE_SETUP },
      comments: DEFAULT_DOCS_SEED.comments.map((c) => ({
        ...c,
        replies: [...c.replies],
      })),
    }
  }

  try {
    const doc = new DOMParser().parseFromString(source, 'text/html')

    const embedded = doc.querySelector('script[data-marble-docs-state="1"]')
    const liveDocBody = doc.querySelector('[data-marble-id="doc-body"]')
    if (embedded?.textContent) {
      const parsed = JSON.parse(embedded.textContent) as Partial<DocsState>
      if (typeof parsed.html === 'string') {
        // Prefer live [data-marble-id="doc-body"] HTML when Marble ops edited the DOM directly.
        const liveHtml = liveDocBody?.innerHTML.trim()
        return {
          title: parsed.title || 'Untitled document',
          starred: Boolean(parsed.starred),
          folder: parsed.folder || 'Workspace',
          html: liveHtml || parsed.html,
          pageSetup: {
            ...DEFAULT_DOCS_PAGE_SETUP,
            ...(parsed.pageSetup ?? {}),
          },
          comments: Array.isArray(parsed.comments) ? parsed.comments : [],
        }
      }
    }

    // Legacy rich-document.mrbl DOM conversion
    const titleEl =
      doc.querySelector('[data-marble-id="doc-title"]') ??
      doc.querySelector('h1')
    const headTitleEl = doc.querySelector('title')
    const title =
      titleEl?.textContent.trim() ||
      headTitleEl?.textContent.trim() ||
      'Untitled document'

    const sections = Array.from(doc.querySelectorAll('.doc-section'))
    if (sections.length > 0) {
      const summaryEl = doc.querySelector('[data-marble-id="summary-v1"]')
      const summary = summaryEl?.textContent.trim() || ''
      const htmlParts: string[] = [
        `<h1 id="heading-title" data-marble-id="doc-title">${escapeText(title)}</h1>`,
      ]
      if (summary) {
        htmlParts.push(
          `<p data-marble-id="summary-v1">${escapeText(summary)}</p>`,
        )
      }
      const comments: DocsState['comments'] = []

      sections.forEach((sec, idx) => {
        const h =
          sec.querySelector('h2')?.textContent.trim() || `Section ${idx + 1}`
        const p = sec.querySelector('p')?.textContent.trim() || ''
        const callout = sec.querySelector('.callout p')?.textContent.trim()
        const note = sec
          .querySelector('[data-marble-note-body]')
          ?.textContent.trim()
        const secId = sec.getAttribute('data-section') || `sec-${idx + 1}`
        htmlParts.push(
          `<h2 id="heading-${escapeText(secId)}" data-marble-id="sec-${escapeText(secId)}-h">${escapeText(h)}</h2>`,
        )
        if (p) {
          htmlParts.push(
            `<p data-marble-id="sec-${escapeText(secId)}-p">${escapeText(p)}</p>`,
          )
        }
        if (callout) {
          htmlParts.push(
            `<blockquote data-marble-id="callout-${escapeText(secId)}">${escapeText(callout)}</blockquote>`,
          )
        }
        if (note) {
          comments.push({
            id: `cmt-${secId}`,
            author: 'Reviewer',
            initials: 'RV',
            quote: h,
            body: note,
            createdAt: '2026-11-22T18:00:00.000Z',
            resolved: false,
            kind: 'comment',
            replies: [],
          })
        }
      })

      return {
        title,
        starred: false,
        folder: 'Specs',
        html: htmlParts.join('\n'),
        pageSetup: { ...DEFAULT_DOCS_PAGE_SETUP },
        comments,
      }
    }

    // General .mrbl HTML5 document conversion (e.g. AI-generated documents from Drive Chat)
    const articles = doc.querySelectorAll('article')
    const contentRoot =
      liveDocBody ??
      doc.querySelector('main') ??
      (articles.length === 1 ? articles[0] : null) ??
      doc.body
    const cloned = contentRoot.cloneNode(true) as HTMLElement
    cloned
      .querySelectorAll('script, style, template, link, meta')
      .forEach((node) => node.remove())
    const cleanedHtml = cloned.innerHTML.trim()
    const plainText = (cloned.textContent || '').trim()
    if (cleanedHtml && plainText.length > 0) {
      const hasHeading = Boolean(cloned.querySelector('h1'))
      const finalHtml = hasHeading
        ? cleanedHtml
        : `<h1 id="heading-title" data-marble-id="doc-title">${escapeText(title)}</h1>\n${cleanedHtml}`
      const folderMeta = doc
        .querySelector('meta[name="xdrive:folder"]')
        ?.getAttribute('content')
        ?.trim()
      return {
        title,
        starred: false,
        folder: folderMeta || 'My Drive',
        html: finalHtml,
        pageSetup: { ...DEFAULT_DOCS_PAGE_SETUP },
        comments: [],
      }
    }
  } catch {
    // fallback below
  }

  return {
    ...DEFAULT_DOCS_SEED,
    pageSetup: { ...DEFAULT_DOCS_PAGE_SETUP },
    comments: DEFAULT_DOCS_SEED.comments.map((c) => ({
      ...c,
      replies: [...c.replies],
    })),
  }
}

export function serializeDocsToMarbleSource(state: DocsState): string {
  const safeStateJson = JSON.stringify(state).replace(/<\//g, '<\\/')
  const commentsHtml = state.comments
    .map(
      (c) =>
        `    <aside data-marble-id="${escapeText(c.id)}" class="margin" data-marble-note data-resolved="${String(c.resolved)}"><p data-marble-id="${escapeText(c.id)}-body" data-marble-note-body data-marble-editable>${escapeText(c.body)}</p></aside>`,
    )
    .join('\n')

  return `<!doctype html>
<html lang="en" data-marble="1">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="marble:capabilities" content="storage; net=none">
<meta name="marble:design-system" content="${DOCUMENT_DESIGN_SYSTEM_SLUG}.mrbl,${DOCUMENT_DONTS_SYSTEM_SLUG}.mrbl">
<title>${escapeText(state.title)}</title>
<style>${MARBLE_BASE_CSS}
  .doc-page { max-width: 52rem; margin: 2rem auto; padding: 2.5rem 3rem; background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius); }
  .doc-page h1 { font-size: 2rem; margin-bottom: .75rem; }
  .doc-page h2 { font-size: 1.3rem; margin-top: 1.5rem; margin-bottom: .45rem; }
  .doc-page p { margin: .5rem 0; line-height: 1.65; }
  .doc-page blockquote { border-left: 2.5px solid var(--accent); background: var(--accent-soft); padding: .6rem .9rem; margin: .8rem 0; }
  .doc-page table { width: 100%; border-collapse: collapse; margin: 1rem 0; border: 1px solid var(--line); }
  .doc-page th, .doc-page td { border: 1px solid var(--line); padding: .45rem .65rem; text-align: left; }
</style>
</head>
<body>
<article data-marble-id="doc-shell" class="doc-page" data-pageless="${String(state.pageSetup.pageless)}">
  <div data-marble-id="doc-body" data-marble-editable>
${state.html}
  </div>
  <div data-marble-id="doc-comments">
${commentsHtml}
  </div>
</article>
<script type="application/json" data-marble-docs-state="1">${safeStateJson}</script>
</body>
</html>
`
}

export function htmlToPlainText(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
}

export function htmlToMarkdown(html: string): string {
  if (typeof DOMParser === 'undefined') return htmlToPlainText(html)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const lines: string[] = []
  for (const el of Array.from(doc.body.children)) {
    const tag = el.tagName.toLowerCase()
    const text = (el.textContent || '').trim()
    if (!text && tag !== 'hr') continue
    if (tag === 'h1') lines.push(`# ${text}`)
    else if (tag === 'h2') lines.push(`## ${text}`)
    else if (tag === 'h3') lines.push(`### ${text}`)
    else if (tag === 'blockquote') lines.push(`> ${text}`)
    else if (tag === 'hr') lines.push('---')
    else if (tag === 'ul') {
      for (const li of Array.from(el.querySelectorAll('li'))) {
        lines.push(`- ${(li.textContent || '').trim()}`)
      }
    } else if (tag === 'ol') {
      Array.from(el.querySelectorAll('li')).forEach((li, i) => {
        lines.push(`${i + 1}. ${(li.textContent || '').trim()}`)
      })
    } else if (tag === 'table') {
      const rows = Array.from(el.querySelectorAll('tr')).map((tr) =>
        Array.from(tr.querySelectorAll('th,td')).map((c) =>
          (c.textContent || '').trim(),
        ),
      )
      if (rows.length > 0) {
        lines.push(`| ${rows[0].join(' | ')} |`)
        lines.push(`| ${rows[0].map(() => '---').join(' | ')} |`)
        for (const r of rows.slice(1)) {
          lines.push(`| ${r.join(' | ')} |`)
        }
      }
    } else {
      lines.push(text)
    }
  }
  return lines.join('\n\n')
}
