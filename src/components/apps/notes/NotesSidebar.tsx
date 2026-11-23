import { useMemo, useState } from 'react'
import {
  CheckSquare,
  Copy,
  Download,
  Folder,
  FolderInput,
  FolderPlus,
  Lock,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  Unlock,
} from 'lucide-react'
import { AppContextMenu } from '#/components/apps/shared'
import type { ContextMenuItem } from '#/components/apps/shared'
import { cn } from '#/lib/utils'
import {
  countChecklistStats,
  countWords,
  formatAppleNotesTime,
  noteDateBucket,
  stripMarkdownPreview,
} from './markdown'
import type { NoteItem, NotesSortBy } from './types'

export interface NotesSidebarProps {
  notes: NoteItem[]
  activeNoteId: string
  folders: string[]
  selectedFolder: string
  searchQuery: string
  sortBy: NotesSortBy
  readOnly?: boolean
  onSelectNote: (id: string) => void
  onSelectFolder: (folder: string) => void
  onSearchChange: (query: string) => void
  onSortChange: (sort: NotesSortBy) => void
  onCreateNote: (folder?: string) => void
  onDuplicateNote: (id: string) => void
  onTogglePin: (id: string) => void
  onToggleLock: (id: string) => void
  onMoveToFolder: (id: string, folder: string) => void
  onCreateFolderAndMove: (id: string, folderName: string) => void
  onCopyMarkdown: (id: string) => void
  onDownloadMarkdown: (id: string) => void
  onDeleteNote: (id: string) => void
}

export function NotesSidebar({
  notes,
  activeNoteId,
  folders,
  selectedFolder,
  searchQuery,
  sortBy,
  readOnly = false,
  onSelectNote,
  onSelectFolder,
  onSearchChange,
  onSortChange,
  onCreateNote,
  onDuplicateNote,
  onTogglePin,
  onToggleLock,
  onMoveToFolder,
  onCreateFolderAndMove,
  onCopyMarkdown,
  onDownloadMarkdown,
  onDeleteNote,
}: NotesSidebarProps) {
  const [contextState, setContextState] = useState<{
    open: boolean
    x: number
    y: number
    noteId: string | null
  }>({ open: false, x: 0, y: 0, noteId: null })
  const [newFolderPromptNoteId, setNewFolderPromptNoteId] = useState<
    string | null
  >(null)
  const [newFolderName, setNewFolderName] = useState('')

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return notes
      .filter((note) => {
        if (selectedFolder !== 'All' && note.folder !== selectedFolder) {
          return false
        }
        if (!q) return true
        return `${note.title} ${note.body} ${note.folder} ${note.tags.join(' ')}`
          .toLowerCase()
          .includes(q)
      })
      .slice()
      .sort((a, b) => {
        if (sortBy === 'title') return a.title.localeCompare(b.title)
        if (sortBy === 'created') {
          return Date.parse(b.createdAt) - Date.parse(a.createdAt)
        }
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
      })
  }, [notes, selectedFolder, searchQuery, sortBy])

  const pinnedNotes = useMemo(
    () => filteredNotes.filter((n) => n.pinned),
    [filteredNotes],
  )
  const unpinnedGroups = useMemo(() => {
    const unpinned = filteredNotes.filter((n) => !n.pinned)
    if (sortBy === 'title') {
      return unpinned.length > 0 ? [{ label: 'Notes', items: unpinned }] : []
    }
    const buckets: Record<string, NoteItem[]> = {
      Today: [],
      'Previous 7 Days': [],
      Earlier: [],
    }
    for (const note of unpinned) {
      buckets[noteDateBucket(note.updatedAt)].push(note)
    }
    return (['Today', 'Previous 7 Days', 'Earlier'] as const)
      .filter((k) => buckets[k].length > 0)
      .map((label) => ({ label, items: buckets[label] }))
  }, [filteredNotes, sortBy])

  const contextNote = contextState.noteId
    ? (notes.find((n) => n.id === contextState.noteId) ?? null)
    : null

  const contextMenuItems: ContextMenuItem[] = useMemo(() => {
    if (!contextNote) {
      return [
        {
          id: 'ctx-new-note',
          label: 'New note',
          icon: <Plus className="h-3.5 w-3.5" />,
          shortcut: '⌘N',
          disabled: readOnly,
          onSelect: () =>
            onCreateNote(selectedFolder === 'All' ? undefined : selectedFolder),
        },
      ]
    }
    return [
      {
        id: 'ctx-pin',
        label: contextNote.pinned ? 'Unpin note' : 'Pin note',
        icon: contextNote.pinned ? (
          <PinOff className="h-3.5 w-3.5" />
        ) : (
          <Pin className="h-3.5 w-3.5" />
        ),
        disabled: readOnly,
        onSelect: () => onTogglePin(contextNote.id),
      },
      {
        id: 'ctx-lock',
        label: contextNote.locked ? 'Remove lock' : 'Lock note',
        icon: contextNote.locked ? (
          <Unlock className="h-3.5 w-3.5" />
        ) : (
          <Lock className="h-3.5 w-3.5" />
        ),
        disabled: readOnly,
        onSelect: () => onToggleLock(contextNote.id),
      },
      {
        id: 'ctx-dup',
        label: 'Duplicate note',
        icon: <Copy className="h-3.5 w-3.5" />,
        shortcut: '⌘D',
        disabled: readOnly,
        onSelect: () => onDuplicateNote(contextNote.id),
      },
      {
        id: 'ctx-move',
        label: 'Move to folder',
        icon: <FolderInput className="h-3.5 w-3.5" />,
        disabled: readOnly,
        submenu: [
          ...folders.map((folder) => ({
            id: `folder-${folder}`,
            label: folder,
            checked: contextNote.folder === folder,
            icon: <Folder className="h-3.5 w-3.5" />,
            onSelect: () => onMoveToFolder(contextNote.id, folder),
          })),
          { id: 'folder-sep', label: '', divider: true },
          {
            id: 'folder-new',
            label: 'New folder…',
            icon: <FolderPlus className="h-3.5 w-3.5" />,
            onSelect: () => {
              setNewFolderPromptNoteId(contextNote.id)
              setNewFolderName('')
            },
          },
        ],
      },
      { id: 'ctx-sep-1', label: '', divider: true },
      {
        id: 'ctx-copy-md',
        label: 'Copy as Markdown',
        icon: <Copy className="h-3.5 w-3.5" />,
        onSelect: () => onCopyMarkdown(contextNote.id),
      },
      {
        id: 'ctx-export-md',
        label: 'Export Markdown (.md)',
        icon: <Download className="h-3.5 w-3.5" />,
        onSelect: () => onDownloadMarkdown(contextNote.id),
      },
      { id: 'ctx-sep-2', label: '', divider: true },
      {
        id: 'ctx-delete',
        label: 'Delete note',
        icon: <Trash2 className="h-3.5 w-3.5" />,
        danger: true,
        disabled: readOnly || notes.length <= 1,
        onSelect: () => onDeleteNote(contextNote.id),
      },
    ]
  }, [
    contextNote,
    folders,
    notes.length,
    onCopyMarkdown,
    onCreateNote,
    onDeleteNote,
    onDownloadMarkdown,
    onDuplicateNote,
    onMoveToFolder,
    onToggleLock,
    onTogglePin,
    readOnly,
    selectedFolder,
  ])

  const renderNoteRow = (note: NoteItem) => {
    const active = note.id === activeNoteId
    const preview = note.locked
      ? 'This note is locked.'
      : stripMarkdownPreview(note.body) || 'No additional text'
    const words = countWords(note.body)
    const tasks = countChecklistStats(note.body)

    return (
      <li key={note.id} data-marble-id={note.id}>
        <button
          type="button"
          onClick={() => onSelectNote(note.id)}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onSelectNote(note.id)
            setContextState({
              open: true,
              x: e.clientX,
              y: e.clientY,
              noteId: note.id,
            })
          }}
          className={cn(
            'group flex w-full flex-col rounded-md border px-2.5 py-2 text-left transition-colors',
            active
              ? 'border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)]'
              : 'border-transparent hover:bg-[var(--xd-surface-hover)]',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              {note.pinned && (
                <Pin className="h-3 w-3 shrink-0 fill-current text-[var(--xd-sketch)]" />
              )}
              {note.locked && (
                <Lock className="h-3 w-3 shrink-0 text-[var(--xd-ink-muted)]" />
              )}
              <span
                className={cn(
                  'truncate text-[13px] font-semibold tracking-tight',
                  active ? 'text-[var(--xd-ink)]' : 'text-[var(--xd-ink)]',
                )}
              >
                {note.title || 'New Note'}
              </span>
            </span>
          </div>

          <div className="mt-0.5 flex items-baseline gap-1.5 text-[11.5px] leading-snug">
            <span className="xd-tabular shrink-0 font-medium text-[var(--xd-ink-secondary)]">
              {formatAppleNotesTime(note.updatedAt)}
            </span>
            <span className="truncate text-[var(--xd-ink-muted)]">
              {preview}
            </span>
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-2 text-[10.5px] text-[var(--xd-ink-muted)]">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="inline-flex items-center gap-1 truncate">
                <Folder className="h-2.5 w-2.5 shrink-0 opacity-75" />
                <span className="truncate">{note.folder}</span>
              </span>
              {tasks.total > 0 && !note.locked && (
                <span className="xd-tabular inline-flex items-center gap-0.5 text-[var(--xd-ink-secondary)]">
                  <CheckSquare className="h-2.5 w-2.5" />
                  <span>
                    {tasks.done}/{tasks.total}
                  </span>
                </span>
              )}
            </span>
            <span className="xd-tabular shrink-0">{words}w</span>
          </div>
        </button>
      </li>
    )
  }

  return (
    <aside
      data-marble-id="notebook-rail"
      onContextMenu={(e) => {
        e.preventDefault()
        setContextState({
          open: true,
          x: e.clientX,
          y: e.clientY,
          noteId: null,
        })
      }}
      className="flex h-full w-64 shrink-0 select-none flex-col border-r border-[var(--xd-border)] bg-[var(--xd-rail)]"
    >
      {/* Top search & compose */}
      <div className="space-y-2 border-b border-[var(--xd-border)] p-2.5">
        <div className="flex items-center gap-1.5">
          <div className="relative flex flex-1 items-center">
            <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-[var(--xd-ink-muted)]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search notes"
              aria-label="Search notes"
              className="h-7 w-full rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] pr-2 pl-7 text-[12px] text-[var(--xd-ink)] placeholder:text-[var(--xd-ink-muted)] focus:border-[var(--xd-accent)] focus:outline-none"
            />
          </div>
          <button
            type="button"
            disabled={readOnly}
            onClick={() =>
              onCreateNote(
                selectedFolder === 'All' ? undefined : selectedFolder,
              )
            }
            title="New note"
            aria-label="New note"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] text-[var(--xd-ink-secondary)] transition-colors hover:border-[var(--xd-border-strong)] hover:text-[var(--xd-ink)] disabled:opacity-35"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Folder pills & sort */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-0.5">
            {['All', ...folders].map((folder) => {
              const active = selectedFolder === folder
              return (
                <button
                  key={folder}
                  type="button"
                  onClick={() => onSelectFolder(folder)}
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-[11px] transition-colors',
                    active
                      ? 'bg-[var(--xd-surface-active)] font-medium text-[var(--xd-ink)]'
                      : 'text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                  )}
                >
                  {folder}
                </button>
              )
            })}
          </div>
          <select
            aria-label="Sort notes"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as NotesSortBy)}
            className="h-5 shrink-0 rounded bg-transparent text-[11px] text-[var(--xd-ink-muted)] hover:text-[var(--xd-ink)] focus:outline-none"
          >
            <option value="updated" className="bg-[var(--xd-canvas)]">
              Edited
            </option>
            <option value="created" className="bg-[var(--xd-canvas)]">
              Created
            </option>
            <option value="title" className="bg-[var(--xd-canvas)]">
              Title
            </option>
          </select>
        </div>
      </div>

      {/* Note groups */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {filteredNotes.length === 0 ? (
          <div className="px-2 py-8 text-center">
            <p className="text-[12px] text-[var(--xd-ink-muted)]">
              No matching notes.
            </p>
            {!readOnly && (
              <button
                type="button"
                onClick={() => onCreateNote()}
                className="mt-2 rounded border border-[var(--xd-border)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)]"
              >
                Create note
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3" data-marble-id="note-list">
            {pinnedNotes.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-2 pb-1 text-[11px] font-medium text-[var(--xd-ink-muted)]">
                  <span>Pinned</span>
                  <span className="xd-tabular">{pinnedNotes.length}</span>
                </div>
                <ol className="space-y-0.5">
                  {pinnedNotes.map(renderNoteRow)}
                </ol>
              </div>
            )}

            {unpinnedGroups.map((group) => (
              <div key={group.label}>
                <div className="flex items-center justify-between px-2 pb-1 text-[11px] font-medium text-[var(--xd-ink-muted)]">
                  <span>{group.label}</span>
                  <span className="xd-tabular">{group.items.length}</span>
                </div>
                <ol className="space-y-0.5">
                  {group.items.map(renderNoteRow)}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quiet footer count + right-click hint */}
      <div className="flex items-center justify-between border-t border-[var(--xd-border)] px-3 py-1.5 text-[11px] text-[var(--xd-ink-muted)]">
        <span className="xd-tabular">
          {filteredNotes.length} {filteredNotes.length === 1 ? 'note' : 'notes'}
        </span>
        <span>Right-click for actions</span>
      </div>

      <AppContextMenu
        open={contextState.open}
        x={contextState.x}
        y={contextState.y}
        items={contextMenuItems}
        onClose={() => setContextState((s) => ({ ...s, open: false }))}
        ariaLabel="Note actions"
      />

      {newFolderPromptNoteId && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-[20vh]"
          onMouseDown={() => setNewFolderPromptNoteId(null)}
        >
          <form
            role="dialog"
            aria-label="New folder"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              const trimmed = newFolderName.trim()
              if (trimmed) {
                onCreateFolderAndMove(newFolderPromptNoteId, trimmed)
              }
              setNewFolderPromptNoteId(null)
            }}
            className="w-full max-w-xs rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] p-3.5 shadow-xl"
          >
            <h3 className="text-[13px] font-semibold text-[var(--xd-ink)]">
              Move to new folder
            </h3>
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              aria-label="Folder name"
              className="mt-2 h-8 w-full rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2.5 text-[12px] text-[var(--xd-ink)] outline-none focus:border-[var(--xd-accent)]"
            />
            <div className="mt-3 flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setNewFolderPromptNoteId(null)}
                className="rounded border border-[var(--xd-border)] px-2.5 py-1 text-[11.5px] text-[var(--xd-ink-secondary)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newFolderName.trim()}
                className="rounded bg-[var(--xd-accent)] px-2.5 py-1 text-[11.5px] font-medium text-white disabled:opacity-40"
              >
                Move
              </button>
            </div>
          </form>
        </div>
      )}
    </aside>
  )
}
