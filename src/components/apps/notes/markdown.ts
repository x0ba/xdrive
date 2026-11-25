import { escapeText } from '#/lib/marble/engine-client'
import {
  DOCUMENT_DESIGN_SYSTEM_SLUG,
  DOCUMENT_DONTS_SYSTEM_SLUG,
  MARBLE_BASE_CSS,
} from '#/lib/marble/templates'
import type { NoteItem } from './types'

export const DEFAULT_NOTES_SEED: NoteItem[] = [
  {
    id: 'note-hypothesis',
    title: 'Hypothesis & Ablations',
    folder: 'Lab',
    tags: ['ablation', 'circuits'],
    pinned: true,
    locked: false,
    createdAt: '2026-11-20T09:15:00.000Z',
    updatedAt: '2026-11-22T23:42:00.000Z',
    body: `The early-layer heads are doing **position**, not semantics. Ablate them only after the seed is frozen, or the loss spike and the ablation get blamed on each other.

## Protocol checklist

- [ ] Freeze seeds before the sweep
- [x] Log the data order hash
- [ ] Write the failed run before the next one
- [x] Verify circuit-level baseline at \`d = 7\`

## Hyperparameters

| Parameter | Value | Notes |
| --- | --- | --- |
| Learning rate | \`1e-3\` | Cosine decay after step 40k |
| Layers | \`8\` | Early heads L0–L2 probed |
| Seeds | \`4\` | Hashed before shard shuffle |

> Do not change the decoder and the seed list in the same sweep — keep one falsifiable variable per run.`,
  },
  {
    id: 'note-probes',
    title: 'Attention Head Probes',
    folder: 'Lab',
    tags: ['probes', 'induction'],
    pinned: false,
    locked: false,
    createdAt: '2026-11-19T14:20:00.000Z',
    updatedAt: '2026-11-22T18:10:00.000Z',
    body: `Linear probes on the residual stream, fit per head, scored on the previous-token copy task. A head that probes well and ablates clean is a **circuit**, not a correlation.

### L2H4 — Previous-token copy
Copies the previous token. Ablation raises copy loss by \`0.4\` without moving the main loss.

### L5H1 — Induction head
Probe accuracy \`0.91\`. Leave it in until the name-mover is mapped.

\`\`\`python
probe_acc = fit_linear_probe(resid[:, head_idx], prev_token_ids)
assert probe_acc > 0.88, "Head is noisy; skip causal patch"
\`\`\``,
  },
  {
    id: 'note-spike',
    title: 'Loss Spike Postmortem',
    folder: 'Postmortems',
    tags: ['incident', 'shards'],
    pinned: false,
    locked: false,
    createdAt: '2026-11-16T17:05:00.000Z',
    updatedAt: '2026-11-20T15:30:00.000Z',
    body: `Step \`48,200\`. Loss jumped from **2.1 to 6.4** in forty steps, then stalled. The data order hash did not match the logged run.

## Timing
Just after the learning-rate decay, on the shard that was reshuffled by hand.

## Root cause
Not the ablation. The spike reproduces with every head intact whenever the shard hash differs.

- [x] Recompute SHA-256 on all training shards
- [x] Pin dataloader seed in checkpoint manifest
- [ ] Add pre-flight hash assertion to sweep launcher`,
  },
  {
    id: 'note-queue',
    title: 'Reading Queue',
    folder: 'Reading',
    tags: ['papers', 'circuits'],
    pinned: false,
    locked: false,
    createdAt: '2026-11-10T11:00:00.000Z',
    updatedAt: '2026-11-15T12:00:00.000Z',
    body: `Prioritized papers for this month's mechanistic interpretability seminar:

1. **Olsson et al. (2022)** — In-context learning and induction heads
2. **Elhage et al. (2021)** — A mathematical framework for transformer circuits
3. **Power et al. (2022)** — Grokking and generalization beyond overfitting

---

*Note:* Summarize the falsifiable claim for each paper before Friday's group meeting.`,
  },
]

export function stripMarkdownPreview(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' [code] ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\|/g, ' ')
    .replace(/[*_~`]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

export function countWords(text: string): number {
  const clean = stripMarkdownPreview(text)
  if (!clean) return 0
  return clean.split(/\s+/).filter(Boolean).length
}

export function countChecklistStats(markdown: string): {
  done: number
  total: number
} {
  const matches = markdown.match(/^\s*[-*+]\s+\[([ xX])\]/gm) ?? []
  let done = 0
  for (const m of matches) {
    if (/\[[xX]\]/.test(m)) done += 1
  }
  return { done, total: matches.length }
}

export function formatAppleNotesTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffDays <= 0 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
  }
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7 && diffDays > 0) {
    return date.toLocaleDateString(undefined, { weekday: 'long' })
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function formatFullNoteTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return (
    date.toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }) +
    ' at ' +
    date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
  )
}

export function noteDateBucket(
  iso: string,
): 'Today' | 'Previous 7 Days' | 'Earlier' {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Earlier'
  const diffMs = Date.now() - date.getTime()
  const diffDays = diffMs / 86_400_000
  if (diffDays < 1) return 'Today'
  if (diffDays < 7) return 'Previous 7 Days'
  return 'Earlier'
}

export function toggleChecklistLine(
  markdown: string,
  lineIndex: number,
): string {
  const lines = markdown.split('\n')
  const line = lines.at(lineIndex)
  if (line === undefined) return markdown
  if (/^(\s*[-*+]\s+)\[ \]/.test(line)) {
    lines[lineIndex] = line.replace(/^(\s*[-*+]\s+)\[ \]/, '$1[x]')
  } else if (/^(\s*[-*+]\s+)\[[xX]\]/.test(line)) {
    lines[lineIndex] = line.replace(/^(\s*[-*+]\s+)\[[xX]\]/, '$1[ ]')
  }
  return lines.join('\n')
}

export interface MarkdownBlock {
  type:
    | 'h1'
    | 'h2'
    | 'h3'
    | 'paragraph'
    | 'checklist'
    | 'ul'
    | 'ol'
    | 'blockquote'
    | 'code'
    | 'hr'
    | 'table'
  text?: string
  lang?: string
  items?: Array<{ text: string; checked?: boolean; lineIndex: number }>
  rows?: string[][]
  lineIndex: number
}

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.split('\n')
  const blocks: MarkdownBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      i += 1
      continue
    }

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim()
      const start = i
      const codeLines: string[] = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i += 1
      }
      i += 1
      blocks.push({
        type: 'code',
        lang,
        text: codeLines.join('\n'),
        lineIndex: start,
      })
      continue
    }

    // Horizontal rule
    if (/^(?:---+|\*\*\*+|___+)$/.test(trimmed)) {
      blocks.push({ type: 'hr', lineIndex: i })
      i += 1
      continue
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'h3', text: trimmed.slice(4), lineIndex: i })
      i += 1
      continue
    }
    if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', text: trimmed.slice(3), lineIndex: i })
      i += 1
      continue
    }
    if (trimmed.startsWith('# ')) {
      blocks.push({ type: 'h1', text: trimmed.slice(2), lineIndex: i })
      i += 1
      continue
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const start = i
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''))
        i += 1
      }
      blocks.push({
        type: 'blockquote',
        text: quoteLines.join(' '),
        lineIndex: start,
      })
      continue
    }

    // Markdown table
    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(lines[i + 1])
    ) {
      const start = i
      const splitRow = (row: string) =>
        row
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim())
      const rows: string[][] = [splitRow(lines[i])]
      i += 2 // skip separator
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitRow(lines[i]))
        i += 1
      }
      blocks.push({ type: 'table', rows, lineIndex: start })
      continue
    }

    // Checklist
    if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) {
      const start = i
      const items: Array<{
        text: string
        checked: boolean
        lineIndex: number
      }> = []
      while (i < lines.length && /^\s*[-*+]\s+\[[ xX]\]\s+/.test(lines[i])) {
        const match = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(lines[i])
        if (match) {
          items.push({
            checked: match[1].toLowerCase() === 'x',
            text: match[2],
            lineIndex: i,
          })
        }
        i += 1
      }
      blocks.push({ type: 'checklist', items, lineIndex: start })
      continue
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const start = i
      const items: Array<{ text: string; lineIndex: number }> = []
      while (
        i < lines.length &&
        /^\s*[-*+]\s+/.test(lines[i]) &&
        !/^\s*[-*+]\s+\[[ xX]\]\s+/.test(lines[i])
      ) {
        items.push({
          text: lines[i].replace(/^\s*[-*+]\s+/, ''),
          lineIndex: i,
        })
        i += 1
      }
      blocks.push({ type: 'ul', items, lineIndex: start })
      continue
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const start = i
      const items: Array<{ text: string; lineIndex: number }> = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push({
          text: lines[i].replace(/^\s*\d+\.\s+/, ''),
          lineIndex: i,
        })
        i += 1
      }
      blocks.push({ type: 'ol', items, lineIndex: start })
      continue
    }

    // Paragraph
    const start = i
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3}\s|```|>|---+|\*\*\*+|___+|\s*[-*+]\s+|\s*\d+\.\s+)/.test(
        lines[i],
      )
    ) {
      paraLines.push(lines[i])
      i += 1
    }
    blocks.push({
      type: 'paragraph',
      text: paraLines.join('\n'),
      lineIndex: start,
    })
  }

  return blocks
}

/* ============================================================================
   .mrbl HTML5 Parsing & Serialization for Notes
   ============================================================================ */

export function parseNotesFromMarbleSource(source: string): {
  notebookTitle: string
  activeNoteId: string
  notes: NoteItem[]
} {
  if (typeof DOMParser === 'undefined' || !source.trim()) {
    return {
      notebookTitle: 'Lab Notes',
      activeNoteId: DEFAULT_NOTES_SEED[0].id,
      notes: DEFAULT_NOTES_SEED,
    }
  }

  try {
    const doc = new DOMParser().parseFromString(source, 'text/html')
    const shell = doc.querySelector('[data-marble-id="notebook-shell"]')
    const titleEl = doc.querySelector('[data-marble-id="notebook-title"]')
    const notebookTitle = titleEl?.textContent.trim() || 'Lab Notes'
    const activeFromAttr = shell?.getAttribute('data-active-note') || ''

    // Check for embedded JSON state first (preserves full markdown, folders, pins, locks)
    const stateScript = doc.querySelector('script[data-marble-notes-state="1"]')
    if (stateScript?.textContent) {
      const parsed = JSON.parse(stateScript.textContent) as {
        notes?: NoteItem[]
        activeNoteId?: string
      }
      if (Array.isArray(parsed.notes) && parsed.notes.length > 0) {
        return {
          notebookTitle,
          activeNoteId:
            activeFromAttr || parsed.activeNoteId || parsed.notes[0].id,
          notes: parsed.notes,
        }
      }
    }

    // Fallback: parse legacy notebook .mrbl DOM cleanly into NoteItems
    const listItems = Array.from(doc.querySelectorAll('#note-list > li'))
    if (listItems.length > 0) {
      const notes: NoteItem[] = listItems.map((li, index) => {
        const id = li.getAttribute('data-marble-id') || `note-${index + 1}`
        const title =
          li.querySelector('[data-marble-editable]')?.textContent.trim() ||
          li.textContent.trim() ||
          'Untitled note'
        const pane = doc.querySelector(`#note-stage > [data-note="${id}"]`)
        const parts: string[] = []
        if (pane) {
          const children = Array.from(pane.children)
          for (const child of children) {
            const tag = child.tagName.toLowerCase()
            if (tag === 'h2' && child.textContent.trim() === title) continue
            if (tag === 'p') {
              const txt = child.textContent.trim()
              if (txt) {
                parts.push(
                  child.classList.contains('kicker') ? `### ${txt}` : txt,
                )
              }
            } else if (tag === 'ul' && child.classList.contains('checks')) {
              const items = Array.from(child.querySelectorAll('li')).map(
                (item) => {
                  const done = item.getAttribute('data-done') === 'yes'
                  const label =
                    item
                      .querySelector('[data-marble-editable]')
                      ?.textContent.trim() || ''
                  return `- [${done ? 'x' : ' '}] ${label}`
                },
              )
              if (items.length) parts.push(items.join('\n'))
            } else if (tag === 'ol' || tag === 'ul') {
              const items = Array.from(child.querySelectorAll('li')).map(
                (item, idx) => {
                  const txt = item.textContent.trim() || ''
                  return tag === 'ol' ? `${idx + 1}. ${txt}` : `- ${txt}`
                },
              )
              if (items.length) parts.push(items.join('\n'))
            } else if (child.classList.contains('probes')) {
              const sections = Array.from(
                child.querySelectorAll('section'),
              ).map((sec) => {
                const h = sec.querySelector('h2,h3')?.textContent.trim() || ''
                const p = sec.querySelector('p')?.textContent.trim() || ''
                return `### ${h}\n${p}`
              })
              if (sections.length) parts.push(sections.join('\n\n'))
            }
          }
        }
        const now = new Date(Date.now() - index * 3_600_000 * 6).toISOString()
        return {
          id,
          title,
          body: parts.join('\n\n') || '',
          folder: li.getAttribute('data-folder') || 'Lab',
          tags: (li.getAttribute('data-tags') || '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          pinned: li.getAttribute('data-pinned') === 'true' || index === 0,
          locked: li.getAttribute('data-locked') === 'true',
          createdAt: li.getAttribute('data-created') || now,
          updatedAt: li.getAttribute('data-updated') || now,
        }
      })

      return {
        notebookTitle,
        activeNoteId:
          notes.find((n) => n.id === activeFromAttr)?.id ?? notes[0].id,
        notes,
      }
    }

    // General .mrbl HTML5 fallback (e.g. AI-generated notebooks from Drive Chat)
    const noteArticles = doc.querySelectorAll('article')
    const root =
      doc.querySelector('main') ??
      (noteArticles.length === 1 ? noteArticles[0] : null) ??
      doc.body
    const cloned = root.cloneNode(true) as HTMLElement
    cloned
      .querySelectorAll('script, style, template')
      .forEach((node) => node.remove())
    const plainText = (cloned.textContent || '').trim()
    if (plainText.length > 0) {
      const resolvedTitle =
        cloned.querySelector('h1')?.textContent.trim() ||
        doc.querySelector('title')?.textContent.trim() ||
        notebookTitle ||
        'Untitled Note'
      const toMarkdown = (container: Element): string => {
        const lines: string[] = []
        for (const child of Array.from(container.children)) {
          const tag = child.tagName.toLowerCase()
          const text = (child.textContent || '').trim()
          if (!text && tag !== 'hr') continue
          if (tag === 'h1') lines.push(`# ${text}`)
          else if (tag === 'h2') lines.push(`## ${text}`)
          else if (tag === 'h3' || tag === 'h4') lines.push(`### ${text}`)
          else if (tag === 'hr') lines.push('---')
          else if (tag === 'blockquote') lines.push(`> ${text}`)
          else if (tag === 'pre') lines.push(`\`\`\`\n${text}\n\`\`\``)
          else if (tag === 'ul') {
            const lis = Array.from(child.querySelectorAll(':scope > li')).map(
              (li) => `- ${(li.textContent || '').trim()}`,
            )
            if (lis.length) lines.push(lis.join('\n'))
          } else if (tag === 'ol') {
            const lis = Array.from(child.querySelectorAll(':scope > li')).map(
              (li, i) => `${i + 1}. ${(li.textContent || '').trim()}`,
            )
            if (lis.length) lines.push(lis.join('\n'))
          } else if (tag === 'section' || tag === 'article' || tag === 'div') {
            const nested = toMarkdown(child)
            if (nested) lines.push(nested)
          } else {
            lines.push(text)
          }
        }
        return lines.join('\n\n') || plainText
      }

      const now = new Date().toISOString()
      const sections = Array.from(
        cloned.querySelectorAll(':scope > section, :scope > article'),
      )
      const noteItems: NoteItem[] =
        sections.length > 1
          ? sections.map((sec, idx) => {
              const secTitle =
                sec.querySelector('h1, h2, h3')?.textContent.trim() ||
                `Note ${idx + 1}`
              return {
                id: sec.getAttribute('data-marble-id') || `note-${idx + 1}`,
                title: secTitle,
                body: toMarkdown(sec),
                folder: 'My Drive',
                tags: [],
                pinned: idx === 0,
                locked: false,
                createdAt: now,
                updatedAt: now,
              }
            })
          : [
              {
                id: 'note-1',
                title: resolvedTitle,
                body: toMarkdown(cloned),
                folder: 'My Drive',
                tags: [],
                pinned: true,
                locked: false,
                createdAt: now,
                updatedAt: now,
              },
            ]

      return {
        notebookTitle: resolvedTitle,
        activeNoteId: noteItems[0].id,
        notes: noteItems,
      }
    }
  } catch {
    // Fallback to seed below
  }

  return {
    notebookTitle: 'Lab Notes',
    activeNoteId: DEFAULT_NOTES_SEED[0].id,
    notes: DEFAULT_NOTES_SEED,
  }
}

export function serializeNotesToMarbleSource(
  notebookTitle: string,
  activeNoteId: string,
  notes: NoteItem[],
): string {
  const safeStateJson = JSON.stringify({ activeNoteId, notes }).replace(
    /<\//g,
    '<\\/',
  )
  const listHtml = notes
    .map(
      (
        n,
      ) => `      <li data-marble-id="${escapeText(n.id)}" data-folder="${escapeText(n.folder)}" data-pinned="${String(n.pinned)}" data-locked="${String(n.locked)}" data-updated="${escapeText(n.updatedAt)}" data-marble-removable>
        <p data-marble-id="${escapeText(n.id)}-title" data-marble-editable>${escapeText(n.title || 'Untitled note')}</p>
        <span data-marble-id="${escapeText(n.id)}-snippet" class="snippet">${escapeText(stripMarkdownPreview(n.body).slice(0, 96))}</span>
      </li>`,
    )
    .join('\n')

  const panesHtml = notes
    .map(
      (
        n,
      ) => `    <article data-marble-id="pane-${escapeText(n.id)}" data-note="${escapeText(n.id)}">
      <h2 data-marble-id="pane-${escapeText(n.id)}-h" data-marble-editable>${escapeText(n.title || 'Untitled note')}</h2>
      <div data-marble-id="pane-${escapeText(n.id)}-body" class="md-body" data-marble-editable>${escapeText(n.body)}</div>
    </article>`,
    )
    .join('\n')

  return `<!doctype html>
<html lang="en" data-marble="1">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="marble:capabilities" content="storage; net=none">
<meta name="marble:design-system" content="${DOCUMENT_DESIGN_SYSTEM_SLUG}.mrbl,${DOCUMENT_DONTS_SYSTEM_SLUG}.mrbl">
<title>${escapeText(notebookTitle)}</title>
<style>${MARBLE_BASE_CSS}
  .notebook { display: grid; grid-template-columns: 17rem 1fr; min-height: 100vh; }
  .rail { border-right: 1px solid var(--line); padding: 1rem .85rem; background: var(--panel); }
  .rail h1 { font-size: 1.15rem; margin-bottom: .75rem; }
  .note-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .3rem; }
  .note-list li { padding: .55rem .65rem; border-radius: 6px; border: 1px solid transparent; }
  .note-list li .snippet { display: block; font-size: .76rem; color: var(--muted); margin-top: .15rem; }
  .stage { padding: 2rem 2.5rem; background: var(--paper); max-width: 52rem; }
  .md-body { white-space: pre-wrap; margin-top: .75rem; line-height: 1.65; }
</style>
</head>
<body>
<div data-marble-id="notebook-shell" id="notebook-shell" class="notebook" data-active-note="${escapeText(activeNoteId)}">
  <aside class="rail" data-marble-id="notebook-rail">
    <h1 data-marble-id="notebook-title" data-marble-editable>${escapeText(notebookTitle)}</h1>
    <ol data-marble-id="note-list" id="note-list" class="note-list" data-marble-sortable="notes">
${listHtml}
    </ol>
  </aside>
  <div data-marble-id="note-stage" id="note-stage" class="stage">
${panesHtml}
  </div>
</div>
<script type="application/json" data-marble-notes-state="1">${safeStateJson}</script>
</body>
</html>
`
}
