import { describe, expect, it } from 'vitest'

import { updateMarbleSourceTitle } from './engine-client'
import { inferCategory } from './drive-storage.server'
import { PREDEFINED_MARBLE_TEMPLATES } from './templates'
import {
  categoryForAiWhiteboard,
  isWhiteboardEditorSnapshot,
  isWhiteboardMarbleSource,
  readWhiteboardSnapshot,
  whiteboardSnapshotSync,
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

  it("keeps $&, $', and $$ in drawing text literal", () => {
    const text = "price $& then $' then $$ and $` end"
    const snapshot = { document: { note: text } }
    const withScript = `<body><h1>Title</h1>${whiteboardStateScript(null)}</body>`
    const replaced = withWhiteboardSnapshot(withScript, snapshot)
    expect(readWhiteboardSnapshot(replaced)).toEqual(snapshot)
    expect(replaced).toContain('<h1>Title</h1>')
    expect(replaced).toContain(text)

    const bare = '<body><p>Keep</p></body>'
    const inserted = withWhiteboardSnapshot(bare, snapshot)
    expect(readWhiteboardSnapshot(inserted)).toEqual(snapshot)
    expect(inserted).toContain('<p>Keep</p>')
    expect(inserted.endsWith('</body>')).toBe(true)
  })

  it('treats a null file snapshot as a blank board', () => {
    expect(whiteboardSnapshotSync(null, null)).toBe('keep')
    expect(whiteboardSnapshotSync(null, SNAPSHOT)).toBe('blank')
    expect(whiteboardSnapshotSync({ broken: true }, SNAPSHOT)).toBe('blank')
    expect(whiteboardSnapshotSync(SNAPSHOT, SNAPSHOT)).toBe('keep')
    expect(
      whiteboardSnapshotSync(SNAPSHOT, {
        document: { schema: { schemaVersion: 1 } },
      }),
    ).toBe('load')
    expect(whiteboardSnapshotSync(SNAPSHOT, null)).toBe('load')
  })

  it('refuses a whiteboard category that would open an empty canvas', () => {
    const html = '<!DOCTYPE html><html><body><h1>Shapes</h1></body></html>'
    expect(categoryForAiWhiteboard('whiteboard', html)).toBe('custom')
    expect(
      categoryForAiWhiteboard('whiteboard', whiteboardStateScript(null)),
    ).toBe('custom')
    expect(
      categoryForAiWhiteboard('whiteboard', whiteboardStateScript(SNAPSHOT)),
    ).toBe('whiteboard')
    expect(categoryForAiWhiteboard('document', html)).toBe('document')
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
