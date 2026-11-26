import { describe, expect, it } from 'vitest'

import { updateMarbleSourceTitle } from './engine-client'
import { inferCategory } from './drive-storage.server'
import { PREDEFINED_MARBLE_TEMPLATES } from './templates'
import {
  isWhiteboardEditorSnapshot,
  isWhiteboardMarbleSource,
  readWhiteboardSnapshot,
  whiteboardStateScript,
  withWhiteboardSnapshot,
} from './whiteboard-document'

const SNAPSHOT = {
  document: {
    schema: { schemaVersion: 2, sequences: {} },
    store: { 'document:document': { id: 'document:document' } },
  },
  session: { version: 0 },
}

describe('whiteboard document bytes', () => {
  it('round-trips a snapshot without touching the title', () => {
    const template = PREDEFINED_MARBLE_TEMPLATES.find(
      (doc) => doc.id === 'tpl-whiteboard',
    )
    expect(template).toBeDefined()
    if (!template) return
    expect(template.category).toBe('whiteboard')
    expect(template.slug).toBe('whiteboard')
    expect(isWhiteboardMarbleSource(template.source)).toBe(true)
    expect(readWhiteboardSnapshot(template.source)).toBeNull()
    expect(inferCategory(template.source, template.slug)).toBe('whiteboard')

    const renamed = updateMarbleSourceTitle(template.source, 'System sketch')
    const next = withWhiteboardSnapshot(renamed, SNAPSHOT)
    expect(next).toContain('<title>System sketch</title>')
    expect(next).toContain('data-marble-id="whiteboard-title"')
    expect(next).toContain('Whiteboard')
    expect(readWhiteboardSnapshot(next)).toEqual(SNAPSHOT)
    expect(withWhiteboardSnapshot(next, SNAPSHOT)).toBe(next)
  })

  it('keeps a </script> sequence inside the snapshot from closing the tag', () => {
    const hostile = {
      document: { note: 'keep </script><p>the rest' },
    }
    const script = whiteboardStateScript(hostile)
    expect(script).not.toContain('</script><p>')
    expect(readWhiteboardSnapshot(script)).toEqual(hostile)
    expect(isWhiteboardEditorSnapshot(hostile)).toBe(true)
    expect(isWhiteboardEditorSnapshot(null)).toBe(false)
  })

  it('infers a whiteboard slug only when the file is not another app', () => {
    expect(
      inferCategory('<html><title>Notes</title></html>', 'team-whiteboard'),
    ).toBe('whiteboard')
    expect(
      inferCategory(
        '<html><body data-marble-notes-state="1"></body></html>',
        'whiteboard-notes',
      ),
    ).toBe('notebook')
  })
})
