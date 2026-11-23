import { useState } from 'react'
import {
  BookMarked,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FilePlus2,
  FileText,
  Folder,
  Hash,
  ListTree,
  Sigma,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import type {
  LatexFileKind,
  LatexOutlineItem,
  LatexProjectFile,
} from './types'

export interface LatexProjectSidebarProps {
  files: LatexProjectFile[]
  mainFile: string
  activeFilePath: string
  outline: LatexOutlineItem[]
  readOnly?: boolean
  onSelectFile: (path: string) => void
  onCreateFile: (path: string, kind: LatexFileKind) => void
  onDeleteFile: (path: string) => void
  onSetMainFile: (path: string) => void
  onJumpToOutline: (item: LatexOutlineItem) => void
}

function fileIcon(kind: LatexFileKind, isMain: boolean) {
  if (kind === 'bib') {
    return <BookMarked className="h-3.5 w-3.5 shrink-0 text-[var(--xd-sketch)]" />
  }
  if (kind === 'sty' || kind === 'cls') {
    return <FileCode2 className="h-3.5 w-3.5 shrink-0 text-[var(--xd-commit)]" />
  }
  return (
    <FileText
      className={cn(
        'h-3.5 w-3.5 shrink-0',
        isMain ? 'text-[var(--xd-accent)]' : 'text-[var(--xd-ink-muted)]',
      )}
    />
  )
}

function inferKind(path: string): LatexFileKind {
  if (path.endsWith('.bib')) return 'bib'
  if (path.endsWith('.sty')) return 'sty'
  if (path.endsWith('.cls')) return 'cls'
  if (path.endsWith('.txt')) return 'txt'
  return 'tex'
}

export function LatexProjectSidebar({
  files,
  mainFile,
  activeFilePath,
  outline,
  readOnly = false,
  onSelectFile,
  onCreateFile,
  onDeleteFile,
  onSetMainFile,
  onJumpToOutline,
}: LatexProjectSidebarProps) {
  const [filesExpanded, setFilesExpanded] = useState(true)
  const [outlineExpanded, setOutlineExpanded] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newPath, setNewPath] = useState('sections/appendix.tex')

  // Group files by top-level directory for a clean Overleaf tree
  const rootFiles = files.filter((f) => !f.path.includes('/'))
  const folders = Array.from(
    new Set(
      files
        .filter((f) => f.path.includes('/'))
        .map((f) => f.path.split('/')[0]),
    ),
  ).sort()

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const clean = newPath.trim().replace(/^\/+/, '')
    if (!clean) return
    const normalized = /\.[a-z0-9]+$/i.test(clean) ? clean : `${clean}.tex`
    onCreateFile(normalized, inferKind(normalized))
    setCreating(false)
    setNewPath('')
  }

  return (
    <aside
      data-marble-id="latex-project-sidebar"
      aria-label="LaTeX project files and outline"
      className="flex h-full w-52 shrink-0 select-none flex-col border-r border-[var(--xd-border)] bg-[var(--xd-rail)] text-[12px]"
    >
      {/* Files Section */}
      <div className="flex min-h-0 flex-1 flex-col border-b border-[var(--xd-border)]">
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-[var(--xd-border)] px-2">
          <button
            type="button"
            onClick={() => setFilesExpanded((v) => !v)}
            className="flex items-center gap-1 text-[11.5px] font-medium text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]"
          >
            {filesExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span>Project files</span>
            <span className="xd-tabular text-[10.5px] text-[var(--xd-ink-muted)]">
              ({files.length})
            </span>
          </button>

          {!readOnly && (
            <button
              type="button"
              title="New file (.tex, .bib, .sty)"
              aria-label="New file"
              onClick={() => {
                setCreating((v) => !v)
                setNewPath('sections/appendix.tex')
              }}
              className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--xd-ink-muted)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
            >
              <FilePlus2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {creating && !readOnly && (
          <form
            onSubmit={handleCreateSubmit}
            className="border-b border-[var(--xd-border)] bg-[var(--xd-canvas)] p-2"
          >
            <input
              autoFocus
              type="text"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setCreating(false)
              }}
              placeholder="sections/methods.tex"
              aria-label="New LaTeX file path"
              className="xd-mono h-6 w-full rounded border border-[var(--xd-border-strong)] bg-[var(--xd-rail)] px-1.5 text-[11px] text-[var(--xd-ink)] outline-none focus:border-[var(--xd-accent)]"
            />
            <div className="mt-1.5 flex justify-end gap-1">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded px-1.5 py-0.5 text-[10.5px] text-[var(--xd-ink-muted)] hover:text-[var(--xd-ink)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded bg-[var(--xd-accent)] px-2 py-0.5 text-[10.5px] font-medium text-white hover:bg-[var(--xd-accent-hover)]"
              >
                Add
              </button>
            </div>
          </form>
        )}

        {filesExpanded && (
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5 space-y-0.5">
            {rootFiles.map((file) => {
              const isActive = file.path === activeFilePath
              const isMain = file.path === mainFile
              return (
                <div
                  key={file.id}
                  className={cn(
                    'group flex items-center justify-between gap-1 rounded px-1.5 py-1 transition-colors',
                    isActive
                      ? 'bg-[var(--xd-surface-active)] font-medium text-[var(--xd-ink)]'
                      : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectFile(file.path)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    {fileIcon(file.kind, isMain)}
                    <span className="xd-mono truncate text-[11.5px]">
                      {file.path}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {isMain && (
                      <span
                        title="Main compile root"
                        className="rounded bg-[var(--xd-accent-soft)] px-1 text-[9.5px] font-medium text-[var(--xd-accent)]"
                      >
                        root
                      </span>
                    )}
                    {!readOnly && !isMain && file.kind === 'tex' && (
                      <button
                        type="button"
                        title="Set as main file"
                        onClick={() => onSetMainFile(file.path)}
                        className="hidden h-4 w-4 items-center justify-center rounded text-[var(--xd-ink-muted)] hover:text-[var(--xd-accent)] group-hover:inline-flex"
                      >
                        <Sparkles className="h-2.5 w-2.5" />
                      </button>
                    )}
                    {!readOnly && !isMain && files.length > 1 && (
                      <button
                        type="button"
                        title={`Delete ${file.path}`}
                        aria-label={`Delete ${file.path}`}
                        onClick={() => onDeleteFile(file.path)}
                        className="hidden h-4 w-4 items-center justify-center rounded text-[var(--xd-ink-muted)] hover:text-[var(--xd-danger)] group-hover:inline-flex"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {folders.map((folder) => {
              const children = files.filter((f) =>
                f.path.startsWith(`${folder}/`),
              )
              return (
                <div key={folder} className="pt-1">
                  <div className="flex items-center gap-1.5 px-1.5 py-0.5 text-[11px] font-medium text-[var(--xd-ink-muted)]">
                    <Folder className="h-3 w-3 shrink-0" />
                    <span className="xd-mono truncate">{folder}/</span>
                  </div>
                  <div className="mt-0.5 space-y-0.5 pl-3">
                    {children.map((file) => {
                      const isActive = file.path === activeFilePath
                      const shortName = file.path.slice(folder.length + 1)
                      return (
                        <div
                          key={file.id}
                          className={cn(
                            'group flex items-center justify-between gap-1 rounded px-1.5 py-1 transition-colors',
                            isActive
                              ? 'bg-[var(--xd-surface-active)] font-medium text-[var(--xd-ink)]'
                              : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => onSelectFile(file.path)}
                            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                          >
                            {fileIcon(file.kind, false)}
                            <span className="xd-mono truncate text-[11.5px]">
                              {shortName}
                            </span>
                          </button>
                          {!readOnly && (
                            <button
                              type="button"
                              title={`Delete ${file.path}`}
                              aria-label={`Delete ${file.path}`}
                              onClick={() => onDeleteFile(file.path)}
                              className="hidden h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--xd-ink-muted)] hover:text-[var(--xd-danger)] group-hover:inline-flex"
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* File Outline Section */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-[var(--xd-border)] px-2">
          <button
            type="button"
            onClick={() => setOutlineExpanded((v) => !v)}
            className="flex items-center gap-1 text-[11.5px] font-medium text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]"
          >
            {outlineExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <ListTree className="h-3 w-3 text-[var(--xd-ink-muted)]" />
            <span>File outline</span>
          </button>
        </div>

        {outlineExpanded && (
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5 space-y-0.5">
            {outline.length === 0 ? (
              <p className="px-2 py-3 text-[11px] text-[var(--xd-ink-muted)]">
                Add \section&#123;...&#125; or theorems to populate the outline.
              </p>
            ) : (
              outline.map((item) => (
                <button
                  key={`${item.id}-${item.line}`}
                  type="button"
                  onClick={() => onJumpToOutline(item)}
                  style={{ paddingLeft: `${6 + (item.level - 1) * 10}px` }}
                  className="flex w-full items-center justify-between gap-1.5 rounded pr-1.5 py-1 text-left text-[11.5px] text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {item.kind === 'equation' ? (
                      <Sigma className="h-3 w-3 shrink-0 text-[var(--xd-sketch)]" />
                    ) : item.kind === 'theorem' ? (
                      <Hash className="h-3 w-3 shrink-0 text-[var(--xd-commit)]" />
                    ) : (
                      <span className="xd-tabular shrink-0 text-[10.5px] font-medium text-[var(--xd-accent)]">
                        {item.number || '§'}
                      </span>
                    )}
                    <span className="truncate">{item.title}</span>
                  </span>
                  <span className="xd-mono xd-tabular shrink-0 text-[10px] text-[var(--xd-ink-muted)]">
                    L{item.line}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
