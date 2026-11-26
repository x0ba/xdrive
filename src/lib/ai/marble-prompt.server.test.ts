import { describe, expect, it } from 'vitest'
import { whiteboardStateScript } from '#/lib/marble/whiteboard-document'
import {
  buildMarbleAcpPrompt,
  parseMarbleAcpResponse,
} from './marble-prompt.server'
import type { ServerCollaborateInput } from './marble-prompt.server'

const input: ServerCollaborateInput = {
  source: '<h1 data-marble-id="title">Old</h1>',
  instruction: 'Tighten the title',
  modelId: 'grok-build/grok-4.7',
  providerId: 'grok-build',
}

describe('parseMarbleAcpResponse', () => {
  it('rejects a non-JSON model body without copying document text into the error', () => {
    const documentText = [
      'Title {Ada Lovelace} diagnosis: confidential-token-88421',
      '<p>This open document body must never reach server logs.</p>',
      'x'.repeat(400),
    ].join('\n')

    let caught: unknown
    try {
      parseMarbleAcpResponse(documentText, input, 'grok-build/grok-4.7')
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    const message = caught instanceof Error ? caught.message : String(caught)
    expect(message).toBe(
      'Grok Build returned a non-JSON response that could not be applied as Marble ops.',
    )
    expect(message).not.toContain('confidential-token-88421')
    expect(message).not.toContain('Ada Lovelace')
    expect(message).not.toContain('open document body')
  })

  it('stores an HTML-only whiteboard as a normal app', () => {
    const created = parseMarbleAcpResponse(
      JSON.stringify({
        note: 'Drew a board in HTML',
        newDocument: {
          title: 'Sketch',
          slug: 'sketch',
          category: 'whiteboard',
          source:
            '<!DOCTYPE html><html><body><h1 data-marble-id="title">Shapes</h1></body></html>',
        },
      }),
      { ...input, instruction: 'Make a whiteboard' },
      'grok-build/grok-4.7',
    )

    expect(created.newDocument?.category).toBe('custom')
    expect(created.newDocument?.source).toContain('Shapes')
  })

  it('keeps a whiteboard when the source has a tldraw snapshot', () => {
    const source = `<!DOCTYPE html><html><body><h1 data-marble-id="whiteboard-title">Sketch</h1>${whiteboardStateScript(
      {
        document: { store: {} },
        session: { version: 0 },
      },
    )}</body></html>`
    const created = parseMarbleAcpResponse(
      JSON.stringify({
        note: 'Blank canvas with a snapshot',
        newDocument: {
          title: 'Sketch',
          slug: 'sketch',
          category: 'whiteboard',
          source,
        },
      }),
      { ...input, instruction: 'Make a whiteboard' },
      'grok-build/grok-4.7',
    )

    expect(created.newDocument?.category).toBe('whiteboard')
    expect(created.newDocument?.source).toContain(
      'data-marble-whiteboard-state',
    )
  })

  it('tells a new-app prompt that whiteboard needs a tldraw snapshot', () => {
    const prompt = buildMarbleAcpPrompt({
      ...input,
      source: '',
      instruction: 'Create a whiteboard',
      action: 'new_app',
    })
    expect(prompt).toContain('data-marble-whiteboard-state')
    expect(prompt).toContain('tldraw editor snapshot')
    expect(prompt).toContain('stored as a normal app')
  })
})
