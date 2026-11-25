import { escapeText } from '#/lib/marble/engine-client'
import {
  DOCUMENT_DESIGN_SYSTEM_SLUG,
  DOCUMENT_DONTS_SYSTEM_SLUG,
  MARBLE_BASE_CSS,
} from '#/lib/marble/templates'
import { DEFAULT_SLIDES_DECK } from './themes'
import type { SlidePage, SlidesDeckState } from './types'

export function parseSlidesFromMarbleSource(source: string): SlidesDeckState {
  if (typeof DOMParser === 'undefined' || !source.trim()) {
    return structuredClone(DEFAULT_SLIDES_DECK)
  }

  try {
    const doc = new DOMParser().parseFromString(source, 'text/html')
    const embedded = doc.querySelector('script[data-marble-slides-state="1"]')
    if (embedded?.textContent) {
      const parsed = JSON.parse(
        embedded.textContent,
      ) as Partial<SlidesDeckState>
      if (Array.isArray(parsed.slides) && parsed.slides.length > 0) {
        return {
          title: parsed.title || 'Untitled presentation',
          starred: Boolean(parsed.starred),
          themeId: parsed.themeId || 'obsidian-studio',
          aspectRatio: parsed.aspectRatio || '16:9',
          slides: parsed.slides,
          activeSlideId:
            parsed.activeSlideId &&
            parsed.slides.some((s) => s.id === parsed.activeSlideId)
              ? parsed.activeSlideId
              : parsed.slides[0].id,
        }
      }
    }

    // Legacy slide-deck.mrbl conversion or general AI-generated slide sections
    const title =
      doc.querySelector('[data-marble-id="deck-title"]')?.textContent.trim() ||
      doc.querySelector('h1')?.textContent.trim() ||
      doc.querySelector('title')?.textContent.trim() ||
      DEFAULT_SLIDES_DECK.title
    const heroText = doc
      .querySelector('[data-marble-id="slide-hero"]')
      ?.textContent.trim()
    const notesTitle = doc
      .querySelector('[data-marble-id="notes-title"]')
      ?.textContent.trim()

    if (!heroText && !notesTitle) {
      const sectionSlides = Array.from(
        doc.querySelectorAll('section.slide, [data-slide], main > section, body > section'),
      ).filter((sec) => (sec.textContent || '').trim().length > 0)

      if (sectionSlides.length > 0) {
        const generatedSlides: SlidePage[] = sectionSlides.map((sec, idx) => {
          const slideId =
            sec.getAttribute('data-slide') ||
            sec.getAttribute('data-marble-id') ||
            `slide-${idx + 1}`
          const heading =
            sec.querySelector('h1, h2, h3')?.textContent.trim() ||
            `Slide ${idx + 1}`
          const speaker =
            sec.querySelector('.speaker')?.textContent.trim() || ''
          const bodyNodes = Array.from(
            sec.querySelectorAll('p:not(.speaker), li'),
          )
            .map((el) => (el.textContent || '').trim())
            .filter(Boolean)
          const bodyText = bodyNodes.join('\n')

          return {
            id: slideId,
            title: heading,
            layout: idx === 0 ? 'title' : 'title-body',
            speakerNotes: speaker,
            transition: 'fade',
            transitionMs: 300,
            elements: [
              {
                id: `${slideId}-title`,
                kind: 'text',
                x: 8,
                y: idx === 0 ? 24 : 10,
                w: 84,
                h: 18,
                text: heading,
                fontSize: idx === 0 ? 36 : 26,
                fontWeight: 'semibold',
                color: '#f3f5f8',
                align: idx === 0 ? 'center' : 'left',
              },
              ...(bodyText
                ? [
                    {
                      id: `${slideId}-body`,
                      kind: 'text' as const,
                      x: 8,
                      y: idx === 0 ? 48 : 30,
                      w: 84,
                      h: 56,
                      text: bodyText,
                      fontSize: 16,
                      fontWeight: 'normal' as const,
                      color: '#a2abb8',
                      align: idx === 0 ? ('center' as const) : ('left' as const),
                    },
                  ]
                : []),
            ],
          }
        })

        return {
          title,
          starred: false,
          themeId: 'obsidian-studio',
          aspectRatio: '16:9',
          slides: generatedSlides,
          activeSlideId: generatedSlides[0].id,
        }
      }
    }

    const deck = structuredClone(DEFAULT_SLIDES_DECK)
    deck.title = title
    const firstSlide = deck.slides.at(0)
    if (heroText && firstSlide) {
      const heroEl = firstSlide.elements.find((e) => e.id === 'slide-hero')
      if (heroEl) heroEl.text = heroText
    }
    if (notesTitle && firstSlide) {
      firstSlide.speakerNotes = notesTitle
    }
    return deck
  } catch {
    return structuredClone(DEFAULT_SLIDES_DECK)
  }
}

export function serializeSlidesToMarbleSource(deck: SlidesDeckState): string {
  const safeState = JSON.stringify(deck).replace(/<\//g, '<\\/')
  const listHtml = deck.slides
    .map(
      (s) =>
        `      <li data-marble-id="${escapeText(s.id)}" data-marble-removable><p data-marble-id="${escapeText(s.id)}-label" data-marble-editable>${escapeText(s.title)}</p></li>`,
    )
    .join('\n')

  const slidesHtml = deck.slides
    .map((slide: SlidePage) => {
      const texts = slide.elements
        .filter((e) => e.text)
        .map((e, idx) =>
          idx === 0
            ? `      <h2 data-marble-id="${escapeText(e.id)}" data-marble-editable>${escapeText(e.text ?? '')}</h2>`
            : `      <p data-marble-id="${escapeText(e.id)}" data-marble-editable>${escapeText(e.text ?? '')}</p>`,
        )
        .join('\n')
      return `    <section data-marble-id="pane-${escapeText(slide.id)}" class="slide card" data-slide="${escapeText(slide.id)}">
${texts}
      <p data-marble-id="notes-${escapeText(slide.id)}" class="speaker" data-marble-editable>${escapeText(slide.speakerNotes)}</p>
    </section>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="en" data-marble="1">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="marble:capabilities" content="storage; net=none">
<meta name="marble:design-system" content="${DOCUMENT_DESIGN_SYSTEM_SLUG}.mrbl,${DOCUMENT_DONTS_SYSTEM_SLUG}.mrbl">
<title>${escapeText(deck.title)}</title>
<style>${MARBLE_BASE_CSS}
  .deck { display: grid; grid-template-columns: 14rem 1fr; min-height: 100vh; }
  .film { background: var(--panel); border-right: 1px solid var(--line); padding: 1rem .85rem; }
  .filmstrip { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .3rem; }
  .stage-wrap { padding: 1.5rem; background: var(--paper); display: flex; flex-direction: column; gap: 1rem; }
  .slide.card { min-height: 22rem; display: flex; flex-direction: column; gap: .5rem; }
  .speaker { margin-top: auto; padding-top: .75rem; border-top: 1px solid var(--line); color: var(--muted); font-size: .84rem; }
</style>
</head>
<body>
<div data-marble-id="deck" id="deck" class="deck" data-active-slide="${escapeText(deck.activeSlideId)}">
  <aside data-marble-id="film" class="film">
    <h1 data-marble-id="deck-title" data-marble-editable>${escapeText(deck.title)}</h1>
    <ol data-marble-id="slide-list" id="slide-list" class="filmstrip" data-marble-sortable="slides">
${listHtml}
    </ol>
  </aside>
  <div data-marble-id="slide-stage" id="slide-stage" class="stage-wrap">
${slidesHtml}
  </div>
</div>
<script type="application/json" data-marble-slides-state="1">${safeState}</script>
</body>
</html>
`
}
