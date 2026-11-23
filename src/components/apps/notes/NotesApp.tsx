import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Folder, Hash, Lock, Pin, Unlock } from 'lucide-react'
import { cn } from '#/lib/utils'
import {
  DEFAULT_NOTES_SEED,
  countWords,
  formatFullNoteTimestamp,
  parseMarkdownBlocks,
  parseNotesFromMarbleSource,
  serializeNotesToMarbleSource,
  toggleChecklistLine,
} from './markdown'
import { NotesFormattingBar } from './NotesFormattingBar'
import type { MarkdownFormatCommand } from './NotesFormattingBar'
import { NotesSidebar } from './NotesSidebar'
import type { NoteItem, NotesSortBy, NotesViewMode } from './types'

export interface NotesAppProps {
  /** Initial notes when rendered standalone (e.g. in Storybook) */
  initialNotes?: NoteItem[]
  /** Initial active note id */
  initialActiveNoteId?: string
  /** Optional initial display mode for the markdown editor */
  initialViewMode?: NotesViewMode
  /** Optional .mrbl HTML5 source for bidirectional workspace integration */
  marbleSource?: string
  /** Emitted whenever note state changes so workspace can persist valid .mrbl HTML5 */
  onMarbleSourceChange?: (nextSource: string, label: string) => void
  /** Read-only enforcement for view_only / comment_annotate visitors */
  readOnly?: boolean
  className?: string
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = []
  const pattern =
    /(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|<u>[^<]+<\/u>|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index))
    }
    const raw = match[0]
    if (raw.startsWith('**') && raw.endsWith('**')) {
      tokens.push(
        <strong key={key++} className="font-semibold text-[var(--xd-ink)]">
          {raw.slice(2, -2)}
        </strong>,
      )
    } else if (raw.startsWith('~~') && raw.endsWith('~~')) {
      tokens.push(
        <del key={key++} className="text-[var(--xd-ink-muted)] line-through">
          {raw.slice(2, -2)}
        </del>,
      )
    } else if (raw.startsWith('`') && raw.endsWith('`')) {
      tokens.push(
        <code
          key={key++}
          className="xd-mono rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-1 py-0.5 text-[12.5px] text-[var(--xd-ink)]"
        >
          {raw.slice(1, -1)}
        </code>,
      )
    } else if (raw.startsWith('<u>') && raw.endsWith('</u>')) {
      tokens.push(
        <span key={key++} className="underline underline-offset-2">
          {raw.slice(3, -4)}
        </span>,
      )
    } else if (raw.startsWith('[')) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(raw)
      if (linkMatch) {
        tokens.push(
          <a
            key={key++}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--xd-accent)] underline underline-offset-2 hover:opacity-85"
          >
            {linkMatch[1]}
          </a>,
        )
      }
    } else if (raw.startsWith('*') && raw.endsWith('*')) {
      tokens.push(
        <em key={key++} className="italic">
          {raw.slice(1, -1)}
        </em>,
      )
    }
    lastIndex = match.index + raw.length
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex))
  }
  return tokens
}

function MarkdownPreview({
  markdown,
  readOnly,
  onToggleChecklist,
}: {
  markdown: string
  readOnly: boolean
  onToggleChecklist: (lineIndex: number) => void
}) {
  const blocks = useMemo(() => parseMarkdownBlocks(markdown), [markdown])

  if (blocks.length === 0) {
    return (
      <p className="text-[14px] text-[var(--xd-ink-muted)]">
        Start typing Markdown or use the formatting bar above.
      </p>
    )
  }

  return (
    <div className="space-y-3.5 text-[14.5px] leading-[1.7] text-[var(--xd-ink)]">
      {blocks.map((block, idx) => {
        if (block.type === 'h1') {
          return (
            <h1
              key={idx}
              className="xd-serif pt-2 text-[24px] font-medium tracking-tight text-[var(--xd-ink)]"
            >
              {renderInlineMarkdown(block.text ?? '')}
            </h1>
          )
        }
        if (block.type === 'h2') {
          return (
            <h2
              key={idx}
              className="xd-serif pt-1.5 text-[19px] font-medium tracking-tight text-[var(--xd-ink)]"
            >
              {renderInlineMarkdown(block.text ?? '')}
            </h2>
          )
        }
        if (block.type === 'h3') {
          return (
            <h3
              key={idx}
              className="pt-1 text-[15px] font-semibold tracking-tight text-[var(--xd-ink)]"
            >
              {renderInlineMarkdown(block.text ?? '')}
            </h3>
          )
        }
        if (block.type === 'hr') {
          return (
            <hr
              key={idx}
              className="my-4 border-0 border-t border-[var(--xd-border)]"
            />
          )
        }
        if (block.type === 'blockquote') {
          return (
            <blockquote
              key={idx}
              className="border-l-2 border-[var(--xd-accent)] bg-[var(--xd-rail)] py-2 pr-3 pl-3.5 text-[14px] text-[var(--xd-ink-secondary)]"
            >
              {renderInlineMarkdown(block.text ?? '')}
            </blockquote>
          )
        }
        if (block.type === 'code') {
          return (
            <pre
              key={idx}
              className="xd-mono overflow-x-auto rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] p-3 text-[12.5px] leading-relaxed text-[var(--xd-ink)]"
            >
              <code>{block.text}</code>
            </pre>
          )
        }
        if (block.type === 'table' && block.rows) {
          const [header, ...bodyRows] = block.rows
          return (
            <div
              key={idx}
              className="overflow-x-auto rounded-md border border-[var(--xd-border)]"
            >
              <table className="w-full border-collapse text-left text-[13px]">
                <thead className="border-b border-[var(--xd-border)] bg-[var(--xd-rail)] text-[12px] text-[var(--xd-ink-secondary)]">
                  <tr>
                    {header.map((cell, cIdx) => (
                      <th key={cIdx} className="px-3 py-2 font-medium">
                        {renderInlineMarkdown(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--xd-border)]">
                  {bodyRows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-3 py-2">
                          {renderInlineMarkdown(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        if (block.type === 'checklist' && block.items) {
          return (
            <ul key={idx} className="space-y-1.5">
              {block.items.map((item) => (
                <li key={item.lineIndex} className="flex items-start gap-2.5">
                  <button
                    type="button"
                    disabled={readOnly}
                    aria-label={
                      item.checked ? 'Mark incomplete' : 'Mark complete'
                    }
                    aria-pressed={item.checked}
                    onClick={() => onToggleChecklist(item.lineIndex)}
                    className={cn(
                      'mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                      item.checked
                        ? 'border-[var(--xd-accent)] bg-[var(--xd-accent)] text-white'
                        : 'border-[var(--xd-border-strong)] bg-transparent hover:border-[var(--xd-accent)]',
                    )}
                  >
                    {item.checked && (
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    )}
                  </button>
                  <span
                    className={cn(
                      'flex-1',
                      item.checked && 'text-[var(--xd-ink-muted)] line-through',
                    )}
                  >
                    {renderInlineMarkdown(item.text)}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
        if (block.type === 'ul' && block.items) {
          return (
            <ul key={idx} className="list-disc space-y-1 pl-5">
              {block.items.map((item) => (
                <li key={item.lineIndex}>{renderInlineMarkdown(item.text)}</li>
              ))}
            </ul>
          )
        }
        if (block.type === 'ol' && block.items) {
          return (
            <ol key={idx} className="list-decimal space-y-1 pl-5">
              {block.items.map((item) => (
                <li key={item.lineIndex}>{renderInlineMarkdown(item.text)}</li>
              ))}
            </ol>
          )
        }
        return (
          <p key={idx} className="whitespace-pre-wrap">
            {renderInlineMarkdown(block.text ?? '')}
          </p>
        )
      })}
    </div>
  )
}

export function NotesApp({
  initialNotes,
  initialActiveNoteId,
  initialViewMode = 'split',
  marbleSource,
  onMarbleSourceChange,
  readOnly = false,
  className,
}: NotesAppProps) {
  const parsed = useMemo(
    () => (marbleSource ? parseNotesFromMarbleSource(marbleSource) : null),
    [marbleSource],
  )

  const [notebookTitle, setNotebookTitle] = useState(
    parsed?.notebookTitle ?? 'Lab Notes',
  )
  const [notes, setNotes] = useState<NoteItem[]>(
    () => initialNotes ?? parsed?.notes ?? DEFAULT_NOTES_SEED,
  )
  const [activeNoteId, setActiveNoteId] = useState<string>(() => {
    const seed = initialNotes ?? DEFAULT_NOTES_SEED
    const first = seed.at(0)
    return (
      initialActiveNoteId ??
      parsed?.activeNoteId ??
      first?.id ??
      'note-hypothesis'
    )
  })
  const [selectedFolder, setSelectedFolder] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<NotesSortBy>('updated')
  const [viewMode, setViewMode] = useState<NotesViewMode>(initialViewMode)
  const [unlockedIds, setUnlockedIds] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState<string | null>(null)

  const lastEmittedRef = useRef<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Sync if marbleSource changes externally (e.g., AI collaborator or Source inspector)
  useEffect(() => {
    if (!marbleSource || marbleSource === lastEmittedRef.current) return
    const next = parseNotesFromMarbleSource(marbleSource)
    setNotebookTitle(next.notebookTitle)
    setNotes(next.notes)
    setActiveNoteId(next.activeNoteId)
  }, [marbleSource])

  const folders = useMemo(() => {
    const set = new Set<string>(['Lab', 'Postmortems', 'Reading'])
    for (const note of notes) {
      if (note.folder.trim()) set.add(note.folder.trim())
    }
    return Array.from(set)
  }, [notes])

  const activeNote: NoteItem | null =
    notes.find((n) => n.id === activeNoteId) ?? notes.at(0) ?? null
  const isLockedView = Boolean(
    activeNote && activeNote.locked && !unlockedIds[activeNote.id],
  )

  function showToast(msg: string) {
    setToast(msg)
    window.setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr))
    }, 2000)
  }

  function commit(
    nextNotes: NoteItem[],
    nextActiveId: string,
    label: string,
    nextTitle = notebookTitle,
  ) {
    setNotes(nextNotes)
    setActiveNoteId(nextActiveId)
    if (onMarbleSourceChange) {
      const serialized = serializeNotesToMarbleSource(
        nextTitle,
        nextActiveId,
        nextNotes,
      )
      lastEmittedRef.current = serialized
      onMarbleSourceChange(serialized, label)
    }
  }

  function updateActiveNote(
    patch: Partial<Pick<NoteItem, 'title' | 'body' | 'tags' | 'folder'>>,
    label = 'Edit note',
  ) {
    if (!activeNote || readOnly) return
    const now = new Date().toISOString()
    const next = notes.map((n) =>
      n.id === activeNote.id ? { ...n, ...patch, updatedAt: now } : n,
    )
    commit(next, activeNote.id, label)
  }

  function createNote(folder?: string) {
    if (readOnly) return
    const now = new Date().toISOString()
    const id = `note-${Math.random().toString(36).slice(2, 8)}`
    const created: NoteItem = {
      id,
      title: 'Untitled Note',
      body: '',
      folder: folder || 'Lab',
      tags: [],
      pinned: false,
      locked: false,
      createdAt: now,
      updatedAt: now,
    }
    commit([created, ...notes], id, 'New note')
    setViewMode((m) => (m === 'preview' ? 'write' : m))
    window.requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function duplicateNote(id: string) {
    if (readOnly) return
    const target = notes.find((n) => n.id === id)
    if (!target) return
    const now = new Date().toISOString()
    const copy: NoteItem = {
      ...target,
      id: `note-${Math.random().toString(36).slice(2, 8)}`,
      title: `${target.title} Copy`,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    }
    const idx = notes.findIndex((n) => n.id === id)
    const next = [...notes.slice(0, idx + 1), copy, ...notes.slice(idx + 1)]
    commit(next, copy.id, 'Duplicate note')
    showToast('Duplicated note')
  }

  function togglePin(id: string) {
    if (readOnly) return
    const next = notes.map((n) =>
      n.id === id ? { ...n, pinned: !n.pinned } : n,
    )
    commit(next, activeNoteId, 'Toggle pin')
  }

  function toggleLock(id: string) {
    if (readOnly) return
    const target = notes.find((n) => n.id === id)
    if (!target) return
    const nextLocked = !target.locked
    const next = notes.map((n) =>
      n.id === id ? { ...n, locked: nextLocked } : n,
    )
    setUnlockedIds((prev) => ({ ...prev, [id]: false }))
    commit(next, activeNoteId, nextLocked ? 'Lock note' : 'Unlock note')
    showToast(nextLocked ? 'Note locked' : 'Lock removed')
  }

  function moveToFolder(id: string, folder: string) {
    if (readOnly) return
    const next = notes.map((n) =>
      n.id === id ? { ...n, folder, updatedAt: new Date().toISOString() } : n,
    )
    commit(next, activeNoteId, `Move note to ${folder}`)
    showToast(`Moved to ${folder}`)
  }

  function deleteNote(id: string) {
    if (readOnly || notes.length <= 1) return
    const next = notes.filter((n) => n.id !== id)
    const fallbackId = next.at(0)?.id ?? ''
    const nextActive = activeNoteId === id ? fallbackId : activeNoteId
    commit(next, nextActive, 'Delete note')
    showToast('Deleted note')
  }

  function copyMarkdown(id: string) {
    const target = notes.find((n) => n.id === id)
    if (!target) return
    const md = `# ${target.title}\n\n${target.body}`
    if (typeof navigator !== 'undefined') {
      void navigator.clipboard.writeText(md)
    }
    showToast('Copied Markdown')
  }

  function downloadMarkdown(id: string) {
    const target = notes.find((n) => n.id === id)
    if (!target || typeof document === 'undefined') return
    const md = `# ${target.title}\n\n${target.body}\n`
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${target.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'note'}.md`
    link.click()
    URL.revokeObjectURL(url)
    showToast('Exported .md')
  }

  function applyMarkdownFormat(cmd: MarkdownFormatCommand) {
    if (!activeNote || readOnly || isLockedView) return
    if (viewMode === 'preview') setViewMode('split')
    const el = textareaRef.current
    const body = activeNote.body
    const start = el ? el.selectionStart : body.length
    const end = el ? el.selectionEnd : body.length
    const selected = body.slice(start, end)

    const wrap = (before: string, after: string, placeholder: string) => {
      const inner = selected || placeholder
      const next =
        body.slice(0, start) + before + inner + after + body.slice(end)
      updateActiveNote({ body: next }, `Format ${cmd}`)
      window.requestAnimationFrame(() => {
        if (!textareaRef.current) return
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(
          start + before.length,
          start + before.length + inner.length,
        )
      })
    }

    const prefixLine = (prefix: string) => {
      const lineStart = body.lastIndexOf('\n', start - 1) + 1
      const lineEndIdx = body.indexOf('\n', end)
      const lineEnd = lineEndIdx === -1 ? body.length : lineEndIdx
      const block = body.slice(lineStart, lineEnd)
      const updated = block
        .split('\n')
        .map((line, i) => {
          const clean = line.replace(
            /^(#{1,3}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+\.\s+|>\s?)/,
            '',
          )
          if (!prefix) return clean
          if (prefix === '1. ') return `${i + 1}. ${clean}`
          return `${prefix}${clean}`
        })
        .join('\n')
      const next = body.slice(0, lineStart) + updated + body.slice(lineEnd)
      updateActiveNote({ body: next }, `Format ${cmd}`)
      window.requestAnimationFrame(() => {
        if (!textareaRef.current) return
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(
          lineStart + updated.length,
          lineStart + updated.length,
        )
      })
    }

    switch (cmd) {
      case 'bold':
        return wrap('**', '**', 'bold text')
      case 'italic':
        return wrap('*', '*', 'italic text')
      case 'underline':
        return wrap('<u>', '</u>', 'underlined text')
      case 'strike':
        return wrap('~~', '~~', 'strikethrough')
      case 'inlineCode':
        return wrap('`', '`', 'code')
      case 'link':
        return wrap('[', '](https://)', selected || 'link text')
      case 'title':
        return prefixLine('# ')
      case 'h2':
        return prefixLine('## ')
      case 'h3':
        return prefixLine('### ')
      case 'body':
        return prefixLine('')
      case 'checklist':
        return prefixLine('- [ ] ')
      case 'bullet':
        return prefixLine('- ')
      case 'numbered':
        return prefixLine('1. ')
      case 'quote':
        return prefixLine('> ')
      case 'codeBlock':
        return wrap('\n```\n', '\n```\n', 'code')
      case 'hr': {
        const insert = '\n\n---\n\n'
        const next = body.slice(0, start) + insert + body.slice(end)
        updateActiveNote({ body: next }, 'Insert divider')
        return
      }
      case 'table': {
        const table =
          '\n\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| Value | Value | Value |\n\n'
        const next = body.slice(0, start) + table + body.slice(end)
        updateActiveNote({ body: next }, 'Insert table')
        return
      }
    }
  }

  function handleEditorKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!activeNote || readOnly) return
    const meta = e.metaKey || e.ctrlKey
    if (meta && e.key.toLowerCase() === 'b') {
      e.preventDefault()
      applyMarkdownFormat('bold')
      return
    }
    if (meta && e.key.toLowerCase() === 'i') {
      e.preventDefault()
      applyMarkdownFormat('italic')
      return
    }
    if (meta && e.key.toLowerCase() === 'u') {
      e.preventDefault()
      applyMarkdownFormat('underline')
      return
    }
    if (meta && e.key.toLowerCase() === 'e') {
      e.preventDefault()
      applyMarkdownFormat('inlineCode')
      return
    }
    if (meta && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      applyMarkdownFormat('link')
      return
    }

    // Smart Markdown list continuation on Enter
    if (e.key === 'Enter' && !e.shiftKey) {
      const el = e.currentTarget
      const pos = el.selectionStart
      if (pos !== el.selectionEnd) return
      const body = activeNote.body
      const lineStart = body.lastIndexOf('\n', pos - 1) + 1
      const currentLine = body.slice(lineStart, pos)

      const checkMatch = /^(\s*[-*+]\s+)\[[ xX]\]\s+(.*)$/.exec(currentLine)
      const bulletMatch = /^(\s*[-*+]\s+)(.*)$/.exec(currentLine)
      const numMatch = /^(\s*)(\d+)\.\s+(.*)$/.exec(currentLine)

      let continuation: string | null = null
      if (checkMatch) {
        continuation = checkMatch[2].trim() ? `\n${checkMatch[1]}[ ] ` : null
      } else if (bulletMatch) {
        continuation = bulletMatch[2].trim() ? `\n${bulletMatch[1]}` : null
      } else if (numMatch) {
        continuation = numMatch[3].trim()
          ? `\n${numMatch[1]}${Number(numMatch[2]) + 1}. `
          : null
      }

      if (continuation) {
        e.preventDefault()
        const next = body.slice(0, pos) + continuation + body.slice(pos)
        updateActiveNote({ body: next }, 'Continue list')
        const nextPos = pos + continuation.length
        window.requestAnimationFrame(() => {
          el.setSelectionRange(nextPos, nextPos)
        })
      }
    }
  }

  return (
    <div
      data-component="notes-app"
      data-marble-id="notebook-shell"
      className={cn(
        'relative flex h-full min-h-0 w-full overflow-hidden bg-[var(--xd-canvas)] text-[var(--xd-ink)]',
        className,
      )}
    >
      <NotesSidebar
        notes={notes}
        activeNoteId={activeNote?.id ?? ''}
        folders={folders}
        selectedFolder={selectedFolder}
        searchQuery={searchQuery}
        sortBy={sortBy}
        readOnly={readOnly}
        onSelectNote={(id) => setActiveNoteId(id)}
        onSelectFolder={setSelectedFolder}
        onSearchChange={setSearchQuery}
        onSortChange={setSortBy}
        onCreateNote={createNote}
        onDuplicateNote={duplicateNote}
        onTogglePin={togglePin}
        onToggleLock={toggleLock}
        onMoveToFolder={moveToFolder}
        onCreateFolderAndMove={(id, folder) => moveToFolder(id, folder)}
        onCopyMarkdown={copyMarkdown}
        onDownloadMarkdown={downloadMarkdown}
        onDeleteNote={deleteNote}
      />

      <section
        data-marble-id="note-stage"
        className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--xd-canvas)]"
      >
        <NotesFormattingBar
          viewMode={viewMode}
          disabled={readOnly || isLockedView || !activeNote}
          onChangeViewMode={setViewMode}
          onFormat={applyMarkdownFormat}
        />

        {activeNote ? (
          isLockedView ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--xd-border)] bg-[var(--xd-rail)] text-[var(--xd-ink-secondary)]">
                <Lock className="h-5 w-5" />
              </div>
              <h2 className="mt-3 text-[15px] font-semibold text-[var(--xd-ink)]">
                {activeNote.title}
              </h2>
              <p className="mt-1 max-w-xs text-[12.5px] text-[var(--xd-ink-muted)]">
                This note is locked. Unlock it to read or edit its contents.
              </p>
              <button
                type="button"
                onClick={() =>
                  setUnlockedIds((prev) => ({ ...prev, [activeNote.id]: true }))
                }
                className="mt-4 inline-flex items-center gap-1.5 rounded bg-[var(--xd-accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[var(--xd-accent-hover)]"
              >
                <Unlock className="h-3.5 w-3.5" />
                <span>View note</span>
              </button>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* Apple Notes centered date & metadata header */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-6 pt-3 pb-1 text-[11.5px] text-[var(--xd-ink-muted)]">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-1.5 py-0.5 text-[11px] text-[var(--xd-ink-secondary)]">
                    <Folder className="h-3 w-3" />
                    <span>{activeNote.folder}</span>
                  </span>
                  {activeNote.pinned && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--xd-sketch)]">
                      <Pin className="h-3 w-3 fill-current" />
                      <span>Pinned</span>
                    </span>
                  )}
                  {activeNote.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-0.5 text-[11px] text-[var(--xd-ink-muted)]"
                    >
                      <Hash className="h-2.5 w-2.5" />
                      {tag}
                    </span>
                  ))}
                </div>
                <span className="xd-tabular">
                  {formatFullNoteTimestamp(activeNote.updatedAt)} ·{' '}
                  {countWords(activeNote.body)} words
                </span>
              </div>

              {/* Title */}
              <div className="mx-auto w-full max-w-4xl px-6 pt-2 pb-2">
                <input
                  data-marble-id={`pane-${activeNote.id}-h`}
                  type="text"
                  value={activeNote.title}
                  readOnly={readOnly}
                  placeholder="Note title"
                  aria-label="Note title"
                  onChange={(e) =>
                    updateActiveNote({ title: e.target.value }, 'Rename note')
                  }
                  className="xd-serif w-full bg-transparent text-[26px] font-medium tracking-tight text-[var(--xd-ink)] placeholder:text-[var(--xd-ink-subtle)] focus:outline-none"
                />
              </div>

              {/* Main Markdown Body Area (Write / Split / Preview) */}
              <div
                className={cn(
                  'mx-auto flex min-h-0 w-full max-w-4xl flex-1 gap-6 px-6 pb-8',
                  viewMode === 'split' && 'max-w-6xl',
                )}
              >
                {(viewMode === 'write' || viewMode === 'split') && (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <textarea
                      ref={textareaRef}
                      data-marble-id={`pane-${activeNote.id}-body`}
                      value={activeNote.body}
                      readOnly={readOnly}
                      onChange={(e) =>
                        updateActiveNote({ body: e.target.value }, 'Edit note')
                      }
                      onKeyDown={handleEditorKeyDown}
                      placeholder="Write in Markdown — use #, **bold**, *italic*, - [ ] checklist, > quote, or ```code```..."
                      aria-label="Note markdown editor"
                      className={cn(
                        'min-h-0 w-full flex-1 resize-none bg-transparent py-2 text-[14.5px] leading-[1.7] text-[var(--xd-ink)] placeholder:text-[var(--xd-ink-subtle)] focus:outline-none',
                        viewMode === 'split' &&
                          'xd-mono border-r border-[var(--xd-border)] pr-5 text-[13px] leading-[1.7]',
                      )}
                    />
                  </div>
                )}

                {(viewMode === 'preview' || viewMode === 'split') && (
                  <div className="min-h-0 flex-1 overflow-y-auto py-2">
                    <MarkdownPreview
                      markdown={activeNote.body}
                      readOnly={readOnly}
                      onToggleChecklist={(lineIdx) =>
                        updateActiveNote(
                          {
                            body: toggleChecklistLine(activeNote.body, lineIdx),
                          },
                          'Toggle checklist item',
                        )
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          )
        ) : (
          <div className="flex flex-1 items-center justify-center text-[13px] text-[var(--xd-ink-muted)]">
            Select a note or create a new one.
          </div>
        )}
      </section>

      {toast && (
        <div
          role="status"
          className="pointer-events-none fixed right-5 bottom-5 z-50 rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] px-3 py-1.5 text-[12px] font-medium text-[var(--xd-ink)] shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  )
}
