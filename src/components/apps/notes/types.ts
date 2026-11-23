export interface NoteItem {
  id: string
  title: string
  body: string // Markdown source
  folder: string
  tags: string[]
  pinned: boolean
  locked: boolean
  createdAt: string // ISO string
  updatedAt: string // ISO string
}

export type NotesSortBy = 'updated' | 'created' | 'title'
export type NotesViewMode = 'write' | 'split' | 'preview'
