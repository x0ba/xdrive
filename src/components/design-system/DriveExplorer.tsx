import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronRight,
  Copy,
  ExternalLink,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  HardDrive,
  MoreVertical,
  Pencil,
  Pin,
  Share2,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import type {
  DriveFolder,
  DriveFolderColor,
  MarbleDocumentFile,
} from '#/lib/types'
import {
  formatBytes,
  getCategoryIcon,
  getCategoryLabel,
} from './NavigationShell'

/* ============================================================================
   Folder Helpers & Color Tokens
   ============================================================================ */

export const DRIVE_FOLDER_COLORS: Array<{
  id: DriveFolderColor
  label: string
  iconClass: string
  swatchStyle: string
}> = [
  {
    id: 'default',
    label: 'Neutral',
    iconClass: 'text-[var(--xd-ink-secondary)]',
    swatchStyle: 'var(--xd-ink-muted)',
  },
  {
    id: 'accent',
    label: 'Indigo',
    iconClass: 'text-[var(--xd-accent)]',
    swatchStyle: 'var(--xd-accent)',
  },
  {
    id: 'commit',
    label: 'Emerald',
    iconClass: 'text-[var(--xd-commit)]',
    swatchStyle: 'var(--xd-commit)',
  },
  {
    id: 'sketch',
    label: 'Amber',
    iconClass: 'text-[var(--xd-sketch)]',
    swatchStyle: 'var(--xd-sketch)',
  },
  {
    id: 'danger',
    label: 'Crimson',
    iconClass: 'text-[var(--xd-danger)]',
    swatchStyle: 'var(--xd-danger)',
  },
]

export function getFolderIconClass(color?: DriveFolderColor): string {
  return (
    DRIVE_FOLDER_COLORS.find((item) => item.id === color)?.iconClass ??
    'text-[var(--xd-ink-secondary)]'
  )
}

function folderSlugId(name: string): string {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `folder-${clean || 'untitled'}`
}

export function seedDriveFolders(docs: MarbleDocumentFile[]): {
  folders: DriveFolder[]
  docs: MarbleDocumentFile[]
} {
  const byName = new Map<string, DriveFolder>()
  const now = '2026-11-22T09:00:00.000Z'

  const colorFor = (name: string): DriveFolderColor => {
    const lower = name.toLowerCase()
    if (lower === 'evergreen') return 'accent'
    if (lower === 'papers' || lower === 'specs') return 'default'
    if (lower === 'lab') return 'commit'
    if (lower === 'talks') return 'sketch'
    return 'default'
  }

  const mappedDocs = docs.map((doc) => {
    const folderName = doc.folder.trim()
    if (!folderName || folderName.toLowerCase() === 'my drive') {
      return { ...doc, folder: 'My Drive', folderId: null }
    }
    let existing = byName.get(folderName)
    if (!existing) {
      existing = {
        id: folderSlugId(folderName),
        name: folderName,
        parentId: null,
        color: colorFor(folderName),
        createdAt: doc.createdAt || now,
        updatedAt: doc.updatedAt || now,
      }
      byName.set(folderName, existing)
    }
    return {
      ...doc,
      folderId: doc.folderId !== undefined ? doc.folderId : existing.id,
    }
  })

  return {
    folders: Array.from(byName.values()),
    docs: mappedDocs,
  }
}

export function getFolderAncestors(
  folders: DriveFolder[],
  folderId: string | null,
): DriveFolder[] {
  if (!folderId) return []
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const chain: DriveFolder[] = []
  const seen = new Set<string>()
  let cursor: string | null = folderId
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    const folder = byId.get(cursor)
    if (!folder) break
    chain.unshift(folder)
    cursor = folder.parentId
  }
  return chain
}

export function getFolderPathLabel(
  folders: DriveFolder[],
  folderId: string | null | undefined,
  fallback?: string,
): string {
  if (!folderId) return fallback && fallback !== 'My Drive' ? fallback : 'My Drive'
  const chain = getFolderAncestors(folders, folderId)
  if (chain.length === 0) return fallback || 'My Drive'
  return chain.map((folder) => folder.name).join(' / ')
}

export function getDescendantFolderIds(
  folders: DriveFolder[],
  rootId: string,
): Set<string> {
  const result = new Set<string>([rootId])
  let added = true
  while (added) {
    added = false
    for (const folder of folders) {
      if (folder.parentId && result.has(folder.parentId) && !result.has(folder.id)) {
        result.add(folder.id)
        added = true
      }
    }
  }
  return result
}

export function getFolderItemCounts(
  folders: DriveFolder[],
  docs: MarbleDocumentFile[],
): Map<string, { files: number; subfolders: number; total: number }> {
  const counts = new Map<
    string,
    { files: number; subfolders: number; total: number }
  >()
  for (const folder of folders) {
    counts.set(folder.id, { files: 0, subfolders: 0, total: 0 })
  }
  for (const folder of folders) {
    if (folder.parentId) {
      const parent = counts.get(folder.parentId)
      if (parent) {
        parent.subfolders += 1
        parent.total += 1
      }
    }
  }
  for (const doc of docs) {
    if (doc.folderId) {
      const entry = counts.get(doc.folderId)
      if (entry) {
        entry.files += 1
        entry.total += 1
      }
    }
  }
  return counts
}

const DRAG_MIME = 'application/x-xdrive-doc-id'

function setDraggedDoc(event: React.DragEvent, docId: string) {
  event.dataTransfer.setData(DRAG_MIME, docId)
  event.dataTransfer.setData('text/plain', docId)
  event.dataTransfer.effectAllowed = 'move'
}

export function readDraggedDocId(event: React.DragEvent): string | null {
  const value =
    event.dataTransfer.getData(DRAG_MIME) ||
    event.dataTransfer.getData('text/plain')
  return value ? value.trim() : null
}

/* ============================================================================
   Shared Action Popover Menu (Click-Outside Safe)
   ============================================================================ */

interface ActionMenuItem {
  id: string
  label: string
  icon: React.ReactNode
  danger?: boolean
  onSelect: () => void
}

function CompactActionMenu({
  label,
  items,
  triggerClassName,
}: {
  label: string
  items: ActionMenuItem[]
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div
      ref={containerRef}
      className="relative"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={
          triggerClassName ??
          'inline-flex h-6 w-6 items-center justify-center rounded text-[var(--xd-ink-muted)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
        }
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-7 z-30 min-w-[168px] overflow-hidden rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] py-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                item.danger
                  ? 'text-[var(--xd-danger)] hover:bg-[var(--xd-danger-soft)]'
                  : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
              }`}
            >
              <span className="shrink-0 opacity-80">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ============================================================================
   1. DriveBreadcrumbBar — Google Drive Folder Path & New Folder Trigger
   ============================================================================ */

export interface DriveBreadcrumbBarProps {
  rootLabel?: string
  ancestors: DriveFolder[]
  itemCount: number
  folderCount: number
  onNavigateFolder?: (folderId: string | null) => void
  onCreateFolder?: () => void
  onDropDocOnFolder?: (docId: string, folderId: string | null) => void
}

export function DriveBreadcrumbBar({
  rootLabel = 'My Drive',
  ancestors,
  itemCount,
  folderCount,
  onNavigateFolder,
  onCreateFolder,
  onDropDocOnFolder,
}: DriveBreadcrumbBarProps) {
  const [dropTargetId, setDropTargetId] = useState<string | 'root' | null>(null)

  const handleDragOver = (
    event: React.DragEvent,
    target: string | 'root',
  ) => {
    if (!onDropDocOnFolder) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTargetId(target)
  }

  const handleDrop = (event: React.DragEvent, folderId: string | null) => {
    event.preventDefault()
    setDropTargetId(null)
    const docId = readDraggedDocId(event)
    if (docId && onDropDocOnFolder) {
      onDropDocOnFolder(docId, folderId)
    }
  }

  const countText =
    folderCount > 0 && itemCount > 0
      ? `${folderCount} ${folderCount === 1 ? 'folder' : 'folders'}, ${itemCount} ${itemCount === 1 ? 'file' : 'files'}`
      : folderCount > 0
        ? `${folderCount} ${folderCount === 1 ? 'folder' : 'folders'}`
        : `${itemCount} ${itemCount === 1 ? 'file' : 'files'}`

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav
        aria-label="Drive folder path"
        className="flex min-w-0 flex-wrap items-center gap-1"
      >
        <button
          type="button"
          onClick={() => onNavigateFolder?.(null)}
          onDragOver={(e) => handleDragOver(e, 'root')}
          onDragLeave={() => setDropTargetId(null)}
          onDrop={(e) => handleDrop(e, null)}
          className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[16px] tracking-tight transition-colors ${
            ancestors.length === 0
              ? 'font-semibold text-[var(--xd-ink)]'
              : 'font-medium text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
          } ${
            dropTargetId === 'root'
              ? 'bg-[var(--xd-accent-soft)] ring-1 ring-[var(--xd-accent)]'
              : ''
          }`}
        >
          <HardDrive className="h-4 w-4 text-[var(--xd-ink-muted)]" />
          <span>{rootLabel}</span>
        </button>

        {ancestors.map((folder, index) => {
          const isCurrent = index === ancestors.length - 1
          return (
            <React.Fragment key={folder.id}>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--xd-ink-subtle)]" />
              <button
                type="button"
                onClick={() => onNavigateFolder?.(folder.id)}
                onDragOver={(e) => handleDragOver(e, folder.id)}
                onDragLeave={() => setDropTargetId(null)}
                onDrop={(e) => handleDrop(e, folder.id)}
                className={`inline-flex max-w-[220px] items-center gap-1.5 rounded px-2 py-1 text-[15px] tracking-tight transition-colors ${
                  isCurrent
                    ? 'font-semibold text-[var(--xd-ink)]'
                    : 'font-medium text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
                } ${
                  dropTargetId === folder.id
                    ? 'bg-[var(--xd-accent-soft)] ring-1 ring-[var(--xd-accent)]'
                    : ''
                }`}
              >
                <Folder
                  className={`h-3.5 w-3.5 shrink-0 ${getFolderIconClass(folder.color)}`}
                />
                <span className="truncate">{folder.name}</span>
              </button>
            </React.Fragment>
          )
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-2.5">
        <span className="xd-tabular text-[12px] text-[var(--xd-ink-muted)]">
          {countText}
        </span>

        {onCreateFolder && (
          <button
            type="button"
            onClick={onCreateFolder}
            className="inline-flex h-7 items-center gap-1.5 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2.5 text-[12px] font-medium text-[var(--xd-ink)] transition-colors hover:border-[var(--xd-border-strong)] hover:bg-[var(--xd-surface-hover)]"
          >
            <FolderPlus className="h-3.5 w-3.5 text-[var(--xd-ink-secondary)]" />
            <span>New folder</span>
          </button>
        )}
      </div>
    </div>
  )
}

/* ============================================================================
   2. DriveFolderCard — Compact Google Drive Folder Tile
   ============================================================================ */

export interface DriveFolderCardProps {
  folder: DriveFolder
  itemCount?: number
  selected?: boolean
  onOpen?: (folder: DriveFolder) => void
  onCreateSubfolder?: (folder: DriveFolder) => void
  onRename?: (folder: DriveFolder) => void
  onDelete?: (folder: DriveFolder) => void
  onDropDoc?: (docId: string, folderId: string) => void
}

export function DriveFolderCard({
  folder,
  itemCount = 0,
  selected = false,
  onOpen,
  onCreateSubfolder,
  onRename,
  onDelete,
  onDropDoc,
}: DriveFolderCardProps) {
  const [dragOver, setDragOver] = useState(false)

  const menuItems: ActionMenuItem[] = [
    {
      id: 'open',
      label: 'Open folder',
      icon: <FolderOpen className="h-3.5 w-3.5" />,
      onSelect: () => onOpen?.(folder),
    },
    ...(onCreateSubfolder
      ? [
          {
            id: 'subfolder',
            label: 'New subfolder',
            icon: <FolderPlus className="h-3.5 w-3.5" />,
            onSelect: () => onCreateSubfolder(folder),
          },
        ]
      : []),
    ...(onRename
      ? [
          {
            id: 'rename',
            label: 'Rename',
            icon: <Pencil className="h-3.5 w-3.5" />,
            onSelect: () => onRename(folder),
          },
        ]
      : []),
    ...(onDelete
      ? [
          {
            id: 'delete',
            label: 'Delete folder',
            icon: <Trash2 className="h-3.5 w-3.5" />,
            danger: true,
            onSelect: () => onDelete(folder),
          },
        ]
      : []),
  ]

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(folder)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen?.(folder)
        }
      }}
      onDragOver={(event) => {
        if (!onDropDoc) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragOver(false)
        const docId = readDraggedDocId(event)
        if (docId && onDropDoc) onDropDoc(docId, folder.id)
      }}
      className={`group flex h-11 cursor-pointer items-center justify-between gap-2 rounded-md border px-3 text-left transition-colors ${
        dragOver
          ? 'border-[var(--xd-accent)] bg-[var(--xd-accent-soft)]'
          : selected
            ? 'border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)]'
            : 'border-[var(--xd-border)] bg-[var(--xd-rail)] hover:border-[var(--xd-border-strong)] hover:bg-[var(--xd-elevated)]'
      }`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Folder
          className={`h-4 w-4 shrink-0 fill-current/15 ${getFolderIconClass(folder.color)}`}
        />
        <span className="truncate text-[13px] font-medium text-[var(--xd-ink)]">
          {folder.name}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <span className="xd-tabular text-[11px] text-[var(--xd-ink-muted)]">
          {itemCount}
        </span>
        <CompactActionMenu
          label={`Actions for ${folder.name}`}
          items={menuItems}
          triggerClassName="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--xd-ink-muted)] opacity-0 transition-opacity hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] group-hover:opacity-100 focus:opacity-100"
        />
      </div>
    </div>
  )
}

/* ============================================================================
   3. DriveDocumentThumbnail — Lightweight Visual Preview of a .mrbl File
   ============================================================================ */

function extractPreviewSnippets(doc: MarbleDocumentFile): {
  heading: string
  lines: string[]
} {
  const source = doc.source || ''
  const stripTags = (raw: string) =>
    raw
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const h1Match = source.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const heading = h1Match ? stripTags(h1Match[1]) : doc.title

  const pMatches = Array.from(source.matchAll(/<(?:p|li|h2|h3)[^>]*>([\s\S]*?)<\/(?:p|li|h2|h3)>/gi))
    .map((match) => stripTags(match[1]))
    .filter((text) => text.length > 12)
    .slice(0, 3)

  return {
    heading: heading || doc.title,
    lines: pMatches.length > 0 ? pMatches : [doc.description],
  }
}

export function DriveDocumentThumbnail({
  doc,
}: {
  doc: MarbleDocumentFile
}) {
  const snippet = useMemo(() => extractPreviewSnippets(doc), [doc])

  if (doc.category === 'slides') {
    return (
      <div className="flex h-full w-full flex-col justify-between bg-[var(--xd-canvas)] p-3">
        <div className="flex items-center justify-between text-[9px] text-[var(--xd-ink-muted)]">
          <span className="xd-mono">01 / 05</span>
          <span className="h-1.5 w-8 rounded-full bg-[var(--xd-accent)]/50" />
        </div>
        <div className="my-auto space-y-1.5">
          <div className="line-clamp-2 text-[12px] font-semibold leading-tight tracking-tight text-[var(--xd-ink)]">
            {snippet.heading}
          </div>
          <div className="line-clamp-2 text-[9.5px] leading-snug text-[var(--xd-ink-secondary)]">
            {snippet.lines[0]}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1 pt-1">
          <span className="h-2.5 rounded-xs border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)]" />
          <span className="h-2.5 rounded-xs border border-[var(--xd-border)] bg-[var(--xd-rail)]" />
          <span className="h-2.5 rounded-xs border border-[var(--xd-border)] bg-[var(--xd-rail)]" />
          <span className="h-2.5 rounded-xs border border-[var(--xd-border)] bg-[var(--xd-rail)]" />
        </div>
      </div>
    )
  }

  if (doc.category === 'sandbox') {
    return (
      <div className="flex h-full w-full flex-col justify-between bg-[var(--xd-canvas)] p-3">
        <div className="flex items-center justify-between">
          <span className="truncate text-[10px] font-medium text-[var(--xd-ink)]">
            {snippet.heading}
          </span>
          <span className="xd-mono text-[9px] text-[var(--xd-commit)]">
            SVG
          </span>
        </div>
        <svg
          viewBox="0 0 180 72"
          className="h-16 w-full"
          aria-hidden="true"
        >
          <line
            x1="8"
            y1="62"
            x2="172"
            y2="62"
            stroke="var(--xd-border-strong)"
            strokeWidth="1"
          />
          <rect
            x="18"
            y="30"
            width="22"
            height="32"
            rx="2"
            fill="var(--xd-accent)"
            opacity="0.85"
          />
          <rect
            x="54"
            y="20"
            width="22"
            height="42"
            rx="2"
            fill="var(--xd-accent)"
            opacity="0.65"
          />
          <rect
            x="90"
            y="12"
            width="22"
            height="50"
            rx="2"
            fill="var(--xd-accent)"
          />
          <rect
            x="126"
            y="26"
            width="22"
            height="36"
            rx="2"
            fill="var(--xd-commit)"
            opacity="0.85"
          />
          <polyline
            points="29,28 65,18 101,10 137,24"
            fill="none"
            stroke="var(--xd-sketch)"
            strokeWidth="1.75"
          />
        </svg>
        <div className="flex items-center justify-between text-[9px] text-[var(--xd-ink-muted)]">
          <span className="xd-mono">{doc.nodeCount} nodes</span>
          <span className="xd-tabular">{formatBytes(doc.byteSize)}</span>
        </div>
      </div>
    )
  }

  if (doc.category === 'notebook') {
    return (
      <div className="flex h-full w-full bg-[var(--xd-canvas)]">
        <div className="flex w-[34%] flex-col gap-1 border-r border-[var(--xd-border)] bg-[var(--xd-rail)] p-2">
          <div className="h-2.5 w-full rounded-xs bg-[var(--xd-accent-soft)]" />
          <div className="h-2 w-4/5 rounded-xs bg-[var(--xd-border)]" />
          <div className="h-2 w-3/4 rounded-xs bg-[var(--xd-border)]" />
          <div className="h-2 w-5/6 rounded-xs bg-[var(--xd-border)]" />
        </div>
        <div className="flex flex-1 flex-col justify-between p-2.5">
          <div>
            <div className="line-clamp-2 text-[10.5px] font-semibold leading-snug text-[var(--xd-ink)]">
              {snippet.heading}
            </div>
            <p className="mt-1 line-clamp-3 text-[9px] leading-relaxed text-[var(--xd-ink-secondary)]">
              {snippet.lines[0]}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--xd-commit)]" />
            <span className="h-1.5 w-14 rounded-full bg-[var(--xd-border-strong)]" />
          </div>
        </div>
      </div>
    )
  }

  if (doc.category === 'matrix') {
    return (
      <div className="flex h-full w-full flex-col bg-[var(--xd-canvas)] p-2.5">
        <div className="mb-1.5 truncate text-[10px] font-semibold text-[var(--xd-ink)]">
          {snippet.heading}
        </div>
        <div className="grid flex-1 grid-cols-4 gap-px overflow-hidden rounded-xs border border-[var(--xd-border)] bg-[var(--xd-border)]">
          {Array.from({ length: 12 }).map((_, idx) => (
            <div
              key={idx}
              className={`flex items-center px-1.5 ${
                idx < 4 ? 'bg-[var(--xd-rail)]' : 'bg-[var(--xd-canvas)]'
              }`}
            >
              <span
                className={`h-1.5 rounded-full ${
                  idx < 4
                    ? 'w-3/4 bg-[var(--xd-ink-muted)]/60'
                    : idx % 5 === 0
                      ? 'w-2/3 bg-[var(--xd-accent)]/60'
                      : 'w-1/2 bg-[var(--xd-border-strong)]'
                }`}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (doc.category === 'latex') {
    return (
      <div className="flex h-full w-full flex-col justify-between bg-[var(--xd-canvas)] p-3">
        <div className="border-b border-[var(--xd-border)] pb-1.5 text-center">
          <div className="xd-serif line-clamp-1 text-[11px] font-medium text-[var(--xd-ink)]">
            {snippet.heading}
          </div>
          <div className="mt-0.5 text-[8.5px] text-[var(--xd-ink-muted)]">
            {doc.createdBy.name}
          </div>
        </div>
        <div className="mt-2 grid flex-1 grid-cols-2 gap-2.5 overflow-hidden">
          <p className="xd-serif line-clamp-4 text-[8.5px] leading-relaxed text-[var(--xd-ink-secondary)]">
            {snippet.lines[0]}
          </p>
          <div className="space-y-1.5">
            <div className="rounded-xs border-l-2 border-[var(--xd-accent)] bg-[var(--xd-rail)] px-1.5 py-1 text-[8px] text-[var(--xd-ink-secondary)]">
              Theorem 1
            </div>
            <div className="h-1.5 w-full rounded-full bg-[var(--xd-border)]" />
            <div className="h-1.5 w-4/5 rounded-full bg-[var(--xd-border)]" />
            <div className="h-1.5 w-5/6 rounded-full bg-[var(--xd-border)]" />
          </div>
        </div>
      </div>
    )
  }

  // Default: rich document / evergreen / custom
  return (
    <div className="flex h-full w-full flex-col justify-between bg-[var(--xd-canvas)] p-3">
      <div>
        <div className="flex items-center justify-between gap-1.5">
          <div className="xd-serif line-clamp-1 text-[11.5px] font-medium text-[var(--xd-ink)]">
            {snippet.heading}
          </div>
          {doc.isEvergreen && (
            <span className="xd-mono shrink-0 rounded border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] px-1 py-0.5 text-[8px] leading-none text-[var(--xd-accent)]">
              Ref
            </span>
          )}
        </div>
        <div className="mt-1.5 border-l-2 border-[var(--xd-accent)]/60 pl-2">
          <p className="line-clamp-3 text-[9px] leading-relaxed text-[var(--xd-ink-secondary)]">
            {snippet.lines[0]}
          </p>
        </div>
      </div>
      <div className="space-y-1 pt-1.5">
        <div className="h-1.5 w-11/12 rounded-full bg-[var(--xd-border)]" />
        <div className="h-1.5 w-2/3 rounded-full bg-[var(--xd-border)]" />
      </div>
    </div>
  )
}

/* ============================================================================
   4. DriveFilePreviewCard — Google Drive Preview Card
   ============================================================================ */

export interface DriveFileCardProps {
  doc: MarbleDocumentFile
  folderLabel?: string
  onOpen?: (doc: MarbleDocumentFile) => void
  onMove?: (doc: MarbleDocumentFile) => void
  onDuplicate?: (doc: MarbleDocumentFile) => void
  onShare?: (doc: MarbleDocumentFile) => void
  onToggleStar?: (doc: MarbleDocumentFile) => void
  onTogglePin?: (doc: MarbleDocumentFile) => void
}

function buildFileMenuItems(props: DriveFileCardProps): ActionMenuItem[] {
  const { doc, onOpen, onMove, onDuplicate, onShare, onToggleStar, onTogglePin } =
    props
  return [
    {
      id: 'open',
      label: 'Open',
      icon: <ExternalLink className="h-3.5 w-3.5" />,
      onSelect: () => onOpen?.(doc),
    },
    ...(onMove
      ? [
          {
            id: 'move',
            label: 'Move to folder…',
            icon: <FolderInput className="h-3.5 w-3.5" />,
            onSelect: () => onMove(doc),
          },
        ]
      : []),
    ...(onDuplicate
      ? [
          {
            id: 'duplicate',
            label: 'Duplicate',
            icon: <Copy className="h-3.5 w-3.5" />,
            onSelect: () => onDuplicate(doc),
          },
        ]
      : []),
    ...(onShare
      ? [
          {
            id: 'share',
            label: 'Share',
            icon: <Share2 className="h-3.5 w-3.5" />,
            onSelect: () => onShare(doc),
          },
        ]
      : []),
    ...(onToggleStar
      ? [
          {
            id: 'star',
            label: doc.starred ? 'Remove star' : 'Add to Starred',
            icon: <Star className="h-3.5 w-3.5" />,
            onSelect: () => onToggleStar(doc),
          },
        ]
      : []),
    ...(onTogglePin
      ? [
          {
            id: 'pin',
            label: doc.pinned ? 'Unpin from sidebar' : 'Pin to sidebar',
            icon: <Pin className="h-3.5 w-3.5" />,
            onSelect: () => onTogglePin(doc),
          },
        ]
      : []),
  ]
}

export function DriveFilePreviewCard(props: DriveFileCardProps) {
  const { doc, folderLabel, onOpen, onToggleStar } = props
  const menuItems = buildFileMenuItems(props)

  return (
    <article
      draggable
      onDragStart={(e) => setDraggedDoc(e, doc.id)}
      onClick={() => onOpen?.(doc)}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-lg border border-[var(--xd-border)] bg-[var(--xd-rail)] transition-colors hover:border-[var(--xd-border-strong)] hover:bg-[var(--xd-elevated)]"
    >
      {/* Top Google Drive File Card Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[var(--xd-accent)]">
            {getCategoryIcon(doc.category, 'h-3.5 w-3.5')}
          </span>
          <h3 className="truncate text-[12.5px] font-medium text-[var(--xd-ink)]">
            {doc.title}
          </h3>
        </div>

        <div
          className="flex shrink-0 items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          {onToggleStar && (
            <button
              type="button"
              onClick={() => onToggleStar(doc)}
              aria-label={doc.starred ? 'Remove star' : 'Star file'}
              aria-pressed={doc.starred}
              className={`inline-flex h-6 w-6 items-center justify-center rounded transition-colors ${
                doc.starred
                  ? 'text-[var(--xd-sketch)]'
                  : 'text-[var(--xd-ink-muted)] opacity-0 hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] group-hover:opacity-100'
              }`}
            >
              <Star
                className={`h-3.5 w-3.5 ${doc.starred ? 'fill-current' : ''}`}
              />
            </button>
          )}
          <CompactActionMenu
            label={`Actions for ${doc.title}`}
            items={menuItems}
          />
        </div>
      </div>

      {/* Center Preview Window */}
      <div className="px-2.5">
        <div className="aspect-[16/10] w-full overflow-hidden rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)]">
          <DriveDocumentThumbnail doc={doc} />
        </div>
      </div>

      {/* Quiet Footer */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] text-[var(--xd-ink-muted)]">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--xd-surface-active)] text-[9px] font-semibold text-[var(--xd-ink)]">
            {doc.lastEditedBy.initials}
          </span>
          <span className="truncate text-[var(--xd-ink-secondary)]">
            {folderLabel && folderLabel !== 'My Drive'
              ? folderLabel
              : doc.lastEditedBy.name}
          </span>
        </div>
        <span className="xd-tabular shrink-0">{doc.updatedAt}</span>
      </div>
    </article>
  )
}

/* ============================================================================
   5. DriveFileIconTile — Compact Icon Grid View
   ============================================================================ */

export function DriveFileIconTile(props: DriveFileCardProps) {
  const { doc, onOpen, onToggleStar } = props
  const menuItems = buildFileMenuItems(props)

  return (
    <article
      draggable
      onDragStart={(e) => setDraggedDoc(e, doc.id)}
      onClick={() => onOpen?.(doc)}
      className="group relative flex cursor-pointer flex-col items-center rounded-lg border border-transparent px-3 py-3.5 text-center transition-colors hover:border-[var(--xd-border)] hover:bg-[var(--xd-rail)]"
    >
      <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
        {doc.starred && onToggleStar && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleStar(doc)
            }}
            aria-label="Remove star"
            className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--xd-sketch)]"
          >
            <Star className="h-3 w-3 fill-current" />
          </button>
        )}
        <CompactActionMenu
          label={`Actions for ${doc.title}`}
          items={menuItems}
          triggerClassName="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--xd-ink-muted)] opacity-0 transition-opacity hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] group-hover:opacity-100 focus:opacity-100"
        />
      </div>

      {/* Geometric Document Sheet Glyph */}
      <div className="relative flex h-14 w-12 items-center justify-center rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] transition-colors group-hover:border-[var(--xd-accent-border)]">
        <span
          aria-hidden="true"
          className="absolute right-0 top-0 h-3 w-3 border-b border-l border-[var(--xd-border)] bg-[var(--xd-rail)]"
        />
        <span className="text-[var(--xd-accent)]">
          {getCategoryIcon(doc.category, 'h-5 w-5')}
        </span>
      </div>

      <h3 className="mt-2.5 line-clamp-2 w-full text-[12px] font-medium leading-snug text-[var(--xd-ink)]">
        {doc.title}
      </h3>
      <span className="mt-0.5 text-[10.5px] text-[var(--xd-ink-muted)]">
        {getCategoryLabel(doc.category)}
      </span>
    </article>
  )
}

/* ============================================================================
   6. DriveFileListTable — Google Drive Dense List View (Folders + Files)
   ============================================================================ */

export interface DriveFileListTableProps {
  folders: DriveFolder[]
  folderCounts?: Map<string, { files: number; subfolders: number; total: number }>
  docs: MarbleDocumentFile[]
  resolveFolderLabel?: (doc: MarbleDocumentFile) => string
  onOpenFolder?: (folder: DriveFolder) => void
  onCreateSubfolder?: (folder: DriveFolder) => void
  onRenameFolder?: (folder: DriveFolder) => void
  onDeleteFolder?: (folder: DriveFolder) => void
  onDropDocOnFolder?: (docId: string, folderId: string) => void
  onOpenDoc?: (doc: MarbleDocumentFile) => void
  onMoveDoc?: (doc: MarbleDocumentFile) => void
  onDuplicateDoc?: (doc: MarbleDocumentFile) => void
  onShareDoc?: (doc: MarbleDocumentFile) => void
  onToggleStar?: (doc: MarbleDocumentFile) => void
  onTogglePin?: (doc: MarbleDocumentFile) => void
}

export function DriveFileListTable({
  folders,
  folderCounts,
  docs,
  resolveFolderLabel,
  onOpenFolder,
  onCreateSubfolder,
  onRenameFolder,
  onDeleteFolder,
  onDropDocOnFolder,
  onOpenDoc,
  onMoveDoc,
  onDuplicateDoc,
  onShareDoc,
  onToggleStar,
  onTogglePin,
}: DriveFileListTableProps) {
  const [dragTargetFolderId, setDragTargetFolderId] = useState<string | null>(
    null,
  )

  return (
    <div className="overflow-visible rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)]">
      <table className="w-full border-collapse text-left text-[12.5px]">
        <thead className="border-b border-[var(--xd-border)] bg-[var(--xd-rail)] text-[11px] text-[var(--xd-ink-muted)]">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="hidden px-3 py-2 font-medium sm:table-cell">
              Location
            </th>
            <th className="hidden px-3 py-2 font-medium md:table-cell">
              Owner
            </th>
            <th className="px-3 py-2 font-medium">Modified</th>
            <th className="hidden px-3 py-2 text-right font-medium lg:table-cell">
              Size
            </th>
            <th className="w-16 px-3 py-2 font-medium"> </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--xd-border)]">
          {folders.map((folder) => {
            const count = folderCounts?.get(folder.id)?.total ?? 0
            const folderMenuItems: ActionMenuItem[] = [
              {
                id: 'open',
                label: 'Open folder',
                icon: <FolderOpen className="h-3.5 w-3.5" />,
                onSelect: () => onOpenFolder?.(folder),
              },
              ...(onCreateSubfolder
                ? [
                    {
                      id: 'sub',
                      label: 'New subfolder',
                      icon: <FolderPlus className="h-3.5 w-3.5" />,
                      onSelect: () => onCreateSubfolder(folder),
                    },
                  ]
                : []),
              ...(onRenameFolder
                ? [
                    {
                      id: 'rename',
                      label: 'Rename',
                      icon: <Pencil className="h-3.5 w-3.5" />,
                      onSelect: () => onRenameFolder(folder),
                    },
                  ]
                : []),
              ...(onDeleteFolder
                ? [
                    {
                      id: 'delete',
                      label: 'Delete folder',
                      icon: <Trash2 className="h-3.5 w-3.5" />,
                      danger: true,
                      onSelect: () => onDeleteFolder(folder),
                    },
                  ]
                : []),
            ]

            return (
              <tr
                key={folder.id}
                onClick={() => onOpenFolder?.(folder)}
                onDragOver={(e) => {
                  if (!onDropDocOnFolder) return
                  e.preventDefault()
                  setDragTargetFolderId(folder.id)
                }}
                onDragLeave={() => setDragTargetFolderId(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragTargetFolderId(null)
                  const docId = readDraggedDocId(e)
                  if (docId && onDropDocOnFolder) {
                    onDropDocOnFolder(docId, folder.id)
                  }
                }}
                className={`group cursor-pointer transition-colors ${
                  dragTargetFolderId === folder.id
                    ? 'bg-[var(--xd-accent-soft)]'
                    : 'hover:bg-[var(--xd-surface-hover)]/50'
                }`}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Folder
                      className={`h-4 w-4 shrink-0 fill-current/15 ${getFolderIconClass(folder.color)}`}
                    />
                    <span className="font-medium text-[var(--xd-ink)]">
                      {folder.name}
                    </span>
                  </div>
                </td>
                <td className="hidden px-3 py-2.5 text-[var(--xd-ink-muted)] sm:table-cell">
                  Folder
                </td>
                <td className="hidden px-3 py-2.5 text-[var(--xd-ink-muted)] md:table-cell">
                  You
                </td>
                <td className="xd-tabular px-3 py-2.5 text-[var(--xd-ink-muted)]">
                  {count} {count === 1 ? 'item' : 'items'}
                </td>
                <td className="hidden px-3 py-2.5 text-right text-[var(--xd-ink-muted)] lg:table-cell">
                  —
                </td>
                <td
                  className="px-3 py-2.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-end">
                    <CompactActionMenu
                      label={`Actions for ${folder.name}`}
                      items={folderMenuItems}
                    />
                  </div>
                </td>
              </tr>
            )
          })}

          {docs.map((doc) => {
            const folderLabel = resolveFolderLabel
              ? resolveFolderLabel(doc)
              : doc.folder || 'My Drive'
            const menuItems = buildFileMenuItems({
              doc,
              onOpen: onOpenDoc,
              onMove: onMoveDoc,
              onDuplicate: onDuplicateDoc,
              onShare: onShareDoc,
              onToggleStar,
              onTogglePin,
            })

            return (
              <tr
                key={doc.id}
                draggable
                onDragStart={(e) => setDraggedDoc(e, doc.id)}
                onClick={() => onOpenDoc?.(doc)}
                className="group cursor-pointer transition-colors hover:bg-[var(--xd-surface-hover)]/50"
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="shrink-0 text-[var(--xd-accent)]">
                      {getCategoryIcon(doc.category, 'h-4 w-4')}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-[var(--xd-ink)]">
                          {doc.title}
                        </span>
                        {doc.isEvergreen && (
                          <span className="xd-mono shrink-0 rounded border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] px-1 py-0.5 text-[9.5px] leading-none text-[var(--xd-accent)]">
                            Ref
                          </span>
                        )}
                      </div>
                      <div className="xd-mono truncate text-[10.5px] text-[var(--xd-ink-muted)]">
                        {doc.fileName}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="hidden px-3 py-2.5 sm:table-cell">
                  <span className="inline-flex items-center gap-1 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-1.5 py-0.5 text-[11px] text-[var(--xd-ink-secondary)]">
                    <Folder className="h-3 w-3 text-[var(--xd-ink-muted)]" />
                    <span className="max-w-[140px] truncate">{folderLabel}</span>
                  </span>
                </td>
                <td className="hidden px-3 py-2.5 md:table-cell">
                  <div className="flex items-center gap-1.5 text-[var(--xd-ink-secondary)]">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--xd-surface-active)] text-[9.5px] font-semibold text-[var(--xd-ink)]">
                      {doc.lastEditedBy.initials}
                    </span>
                    <span className="truncate">{doc.lastEditedBy.name}</span>
                  </div>
                </td>
                <td className="xd-tabular px-3 py-2.5 text-[var(--xd-ink-muted)]">
                  {doc.updatedAt}
                </td>
                <td className="xd-tabular hidden px-3 py-2.5 text-right text-[var(--xd-ink-muted)] lg:table-cell">
                  {formatBytes(doc.byteSize)}
                </td>
                <td
                  className="px-3 py-2.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-end gap-0.5">
                    {onToggleStar && (
                      <button
                        type="button"
                        onClick={() => onToggleStar(doc)}
                        aria-label={doc.starred ? 'Remove star' : 'Star file'}
                        aria-pressed={doc.starred}
                        className={`inline-flex h-6 w-6 items-center justify-center rounded transition-colors ${
                          doc.starred
                            ? 'text-[var(--xd-sketch)]'
                            : 'text-[var(--xd-ink-muted)] opacity-0 hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] group-hover:opacity-100'
                        }`}
                      >
                        <Star
                          className={`h-3.5 w-3.5 ${doc.starred ? 'fill-current' : ''}`}
                        />
                      </button>
                    )}
                    <CompactActionMenu
                      label={`Actions for ${doc.title}`}
                      items={menuItems}
                    />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ============================================================================
   7. DriveFolderDialog — Create or Rename a Folder
   ============================================================================ */

export interface DriveFolderDialogProps {
  open: boolean
  mode: 'create' | 'rename'
  initialName?: string
  initialColor?: DriveFolderColor
  parentPathLabel?: string
  onClose: () => void
  onSubmit: (name: string, color: DriveFolderColor) => void
}

export function DriveFolderDialog({
  open,
  mode,
  initialName = '',
  initialColor = 'default',
  parentPathLabel = 'My Drive',
  onClose,
  onSubmit,
}: DriveFolderDialogProps) {
  const [name, setName] = useState(initialName)
  const [color, setColor] = useState<DriveFolderColor>(initialColor)

  useEffect(() => {
    if (open) {
      setName(initialName)
      setColor(initialColor)
    }
  }, [open, initialName, initialColor])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-[18vh]"
      onMouseDown={onClose}
    >
      <form
        role="dialog"
        aria-label={mode === 'create' ? 'Create folder' : 'Rename folder'}
        className="w-full max-w-sm rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          const trimmed = name.trim()
          if (!trimmed) return
          onSubmit(trimmed, color)
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[var(--xd-ink)]">
            {mode === 'create' ? 'New folder' : 'Rename folder'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {mode === 'create' && (
          <p className="mt-1 text-[11.5px] text-[var(--xd-ink-muted)]">
            Location: {parentPathLabel}
          </p>
        )}

        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Untitled folder"
          aria-label="Folder name"
          className="mt-3 h-8 w-full rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2.5 text-[12.5px] text-[var(--xd-ink)] placeholder:text-[var(--xd-ink-muted)] focus:border-[var(--xd-accent)] focus:outline-none"
        />

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11.5px] text-[var(--xd-ink-muted)]">
            Color
          </span>
          <div className="flex items-center gap-1.5">
            {DRIVE_FOLDER_COLORS.map((swatch) => (
              <button
                key={swatch.id}
                type="button"
                aria-label={swatch.label}
                aria-pressed={color === swatch.id}
                onClick={() => setColor(swatch.id)}
                className={`flex h-5 w-5 items-center justify-center rounded-full border transition-transform ${
                  color === swatch.id
                    ? 'scale-110 border-[var(--xd-ink)]'
                    : 'border-transparent hover:scale-105'
                }`}
              >
                <span
                  className="h-3.5 w-3.5 rounded-full"
                  style={{ backgroundColor: swatch.swatchStyle }}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="h-7 rounded border border-[var(--xd-border)] px-3 text-[12px] text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="h-7 rounded bg-[var(--xd-accent)] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[var(--xd-accent-hover)] disabled:opacity-40"
          >
            {mode === 'create' ? 'Create folder' : 'Save name'}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ============================================================================
   8. DriveMoveDialog — Move a File into Any Folder
   ============================================================================ */

export interface DriveMoveDialogProps {
  open: boolean
  fileName: string
  currentFolderId: string | null
  folders: DriveFolder[]
  onClose: () => void
  onMove: (targetFolderId: string | null) => void
}

export function DriveMoveDialog({
  open,
  fileName,
  currentFolderId,
  folders,
  onClose,
  onMove,
}: DriveMoveDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(currentFolderId)

  useEffect(() => {
    if (open) setSelectedId(currentFolderId)
  }, [open, currentFolderId])

  const orderedFolders = useMemo(() => {
    const result: Array<{ folder: DriveFolder; depth: number }> = []
    const walk = (parentId: string | null, depth: number) => {
      const children = folders
        .filter((f) => f.parentId === parentId)
        .sort((a, b) => a.name.localeCompare(b.name))
      for (const child of children) {
        result.push({ folder: child, depth })
        walk(child.id, depth + 1)
      }
    }
    walk(null, 0)
    return result
  }, [folders])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-[16vh]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-label="Move file to folder"
        className="w-full max-w-sm rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[var(--xd-ink)]">
            Move file
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="xd-mono mt-1 truncate text-[11px] text-[var(--xd-ink-muted)]">
          {fileName}
        </p>

        <div className="mt-3 max-h-60 overflow-y-auto rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] p-1">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12.5px] transition-colors ${
              selectedId === null
                ? 'bg-[var(--xd-accent-soft)] font-medium text-[var(--xd-ink)]'
                : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
            }`}
          >
            <HardDrive className="h-3.5 w-3.5 text-[var(--xd-ink-muted)]" />
            <span>My Drive (root)</span>
          </button>

          {orderedFolders.map(({ folder, depth }) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => setSelectedId(folder.id)}
              style={{ paddingLeft: `${18 + depth * 14}px` }}
              className={`flex w-full items-center gap-2 rounded py-1.5 pr-2 text-left text-[12.5px] transition-colors ${
                selectedId === folder.id
                  ? 'bg-[var(--xd-accent-soft)] font-medium text-[var(--xd-ink)]'
                  : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
              }`}
            >
              <Folder
                className={`h-3.5 w-3.5 shrink-0 ${getFolderIconClass(folder.color)}`}
              />
              <span className="truncate">{folder.name}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-end gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="h-7 rounded border border-[var(--xd-border)] px-3 text-[12px] text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onMove(selectedId)}
            className="h-7 rounded bg-[var(--xd-accent)] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[var(--xd-accent-hover)]"
          >
            Move here
          </button>
        </div>
      </div>
    </div>
  )
}
