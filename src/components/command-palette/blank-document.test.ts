import { describe, expect, it } from 'vitest'
import { createBlankDocumentFile } from './blank-document'

describe('createBlankDocumentFile', () => {
  it('creates an empty .mrbl document with no copied template content', () => {
    const doc = createBlankDocumentFile({
      title: 'Untitled document',
      folderName: 'Papers',
      folderId: 'folder-papers',
      authorName: 'You',
    })

    expect(doc.category).toBe('document')
    expect(doc.isTemplate).toBe(false)
    expect(doc.templateId).toBeUndefined()
    expect(doc.description).toBe('')
    expect(doc.title).toBe('Untitled document')
    expect(doc.slug).toBe('untitled-document')
    expect(doc.fileName).toBe('untitled-document.mrbl')
    expect(doc.folder).toBe('Papers')
    expect(doc.folderId).toBe('folder-papers')

    const match = doc.source.match(
      /<script type="application\/json" data-marble-docs-state="1">([\s\S]*?)<\/script>/,
    )
    expect(match).not.toBeNull()
    const parsedState = JSON.parse(match![1].replace(/<\\\//g, '</')) as {
      title: string
      html: string
      comments: unknown[]
    }
    expect(parsedState.title).toBe('Untitled document')
    expect(parsedState.html).toBe('')
    expect(parsedState.comments).toEqual([])
    expect(doc.source).not.toContain('Logical Memory Specification')
    expect(doc.source).not.toContain('Collaborative Research Document')
  })
})
