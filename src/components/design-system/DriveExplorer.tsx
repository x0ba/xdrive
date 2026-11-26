import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  HardDrive,
  LayoutTemplate,
  MoreVertical,
  Pencil,
  Pin,
  RotateCcw,
  Share2,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { TEMPLATES_FOLDER_NAME, isTemplatesRootFolder } from '#/lib/marble'
import type {
  DriveFolder,
  DriveFolderColor,
  MarbleDocumentFile,
} from '#/lib/types'
import { AppContextMenu } from '#/components/apps/shared'
import type { ContextMenuItem } from '#/components/apps/shared'
import { WorkspaceLink } from '#/components/routing/WorkspaceLink'
import { docHref, folderHref, isModifiedClick } from '#/lib/routing'
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
    if (
      lower === 'evergreen' ||
      lower === TEMPLATES_FOLDER_NAME.toLowerCase()
    ) {
      return 'accent'
    }
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
        isTemplatesFolder: folderName === TEMPLATES_FOLDER_NAME,
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
  if (!folderId)
    return fallback && fallback !== 'My Drive' ? fallback : 'My Drive'
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
      if (
        folder.parentId &&
        result.has(folder.parentId) &&
        !result.has(folder.id)
      ) {
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
    if (doc.trashedAt) continue
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

/* ============================================================================
   Trash Retention Helpers (30-Day Default Auto-Purge)
   ============================================================================ */

export const TRASH_RETENTION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * DAY_MS

export function isDocTrashed(doc: MarbleDocumentFile): boolean {
  return Boolean(doc.trashedAt)
}

export function isTrashedDocExpired(
  doc: MarbleDocumentFile,
  nowMs = Date.now(),
  retentionDays = TRASH_RETENTION_DAYS,
): boolean {
  if (!doc.trashedAt) return false
  const trashedMs = Date.parse(doc.trashedAt)
  if (Number.isNaN(trashedMs)) return false
  return nowMs - trashedMs >= retentionDays * DAY_MS
}

export function getTrashDaysRemaining(
  trashedAt: string,
  nowMs = Date.now(),
  retentionDays = TRASH_RETENTION_DAYS,
): number {
  const trashedMs = Date.parse(trashedAt)
  if (Number.isNaN(trashedMs)) return retentionDays
  const remainingMs = trashedMs + retentionDays * DAY_MS - nowMs
  return Math.max(0, Math.ceil(remainingMs / DAY_MS))
}

export function purgeExpiredTrashedDocs(
  docs: MarbleDocumentFile[],
  nowMs = Date.now(),
  retentionDays = TRASH_RETENTION_DAYS,
): { docs: MarbleDocumentFile[]; purged: MarbleDocumentFile[] } {
  const kept: MarbleDocumentFile[] = []
  const purged: MarbleDocumentFile[] = []
  for (const doc of docs) {
    if (isTrashedDocExpired(doc, nowMs, retentionDays)) {
      purged.push(doc)
    } else {
      kept.push(doc)
    }
  }
  return { docs: kept, purged }
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

function toContextMenuItems(items: ActionMenuItem[]): ContextMenuItem[] {
  const result: ContextMenuItem[] = []
  let insertedDangerDivider = false
  for (const item of items) {
    if (item.danger && !insertedDangerDivider && result.length > 0) {
      result.push({ id: `sep-${item.id}`, label: '', divider: true })
      insertedDangerDivider = true
    }
    result.push({
      id: item.id,
      label: item.label,
      icon: item.icon,
      danger: item.danger,
      onSelect: item.onSelect,
    })
  }
  return result
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
          aria-label={label}
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
  itemCount?: number
  folderCount?: number
  onNavigateFolder?: (folderId: string | null) => void
  onCreateFolder?: () => void
  onDropDocOnFolder?: (docId: string, folderId: string | null) => void
}

export function DriveBreadcrumbBar({
  rootLabel = 'My Drive',
  ancestors,
  onNavigateFolder,
  onCreateFolder,
  onDropDocOnFolder,
}: DriveBreadcrumbBarProps) {
  const [dropTargetId, setDropTargetId] = useState<string | 'root' | null>(null)

  const handleDragOver = (event: React.DragEvent, target: string | 'root') => {
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

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav
        aria-label="Drive folder path"
        className="flex min-w-0 flex-wrap items-center gap-1"
      >
        <WorkspaceLink
          href="/drive"
          onNavigate={
            onNavigateFolder ? () => onNavigateFolder(null) : undefined
          }
          aria-current={ancestors.length === 0 ? 'page' : undefined}
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
        </WorkspaceLink>

        {ancestors.map((folder, index) => {
          const isCurrent = index === ancestors.length - 1
          return (
            <React.Fragment key={folder.id}>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--xd-ink-subtle)]" />
              <WorkspaceLink
                href={folderHref(folder)}
                onNavigate={
                  onNavigateFolder
                    ? () => onNavigateFolder(folder.id)
                    : undefined
                }
                aria-current={isCurrent ? 'page' : undefined}
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
              </WorkspaceLink>
            </React.Fragment>
          )
        })}
      </nav>

      {onCreateFolder && (
        <div className="flex shrink-0 items-center gap-2.5">
          <button
            type="button"
            onClick={onCreateFolder}
            className="inline-flex h-7 items-center gap-1.5 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2.5 text-[12px] font-medium text-[var(--xd-ink)] transition-colors hover:border-[var(--xd-border-strong)] hover:bg-[var(--xd-surface-hover)]"
          >
            <FolderPlus className="h-3.5 w-3.5 text-[var(--xd-ink-secondary)]" />
            <span>New folder</span>
          </button>
        </div>
      )}
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

export function isTopLevelTemplatesFolder(folder: DriveFolder): boolean {
  return isTemplatesRootFolder(folder)
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
  const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0 })

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
    <>
      <div
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setContextMenu({ open: true, x: event.clientX, y: event.clientY })
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
        className={`group relative flex h-11 cursor-pointer items-center justify-between gap-2 rounded-md border px-3 text-left transition-colors ${
          dragOver
            ? 'border-[var(--xd-accent)] bg-[var(--xd-accent-soft)]'
            : selected
              ? 'border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)]'
              : 'border-[var(--xd-border)] bg-[var(--xd-rail)] hover:border-[var(--xd-border-strong)] hover:bg-[var(--xd-elevated)]'
        }`}
      >
        <WorkspaceLink
          href={folderHref(folder)}
          onNavigate={onOpen ? () => onOpen(folder) : undefined}
          className="flex min-w-0 flex-1 items-center gap-2.5 after:absolute after:inset-0"
        >
          {isTopLevelTemplatesFolder(folder) ? (
            <LayoutTemplate
              className={`h-4 w-4 shrink-0 ${getFolderIconClass(folder.color)}`}
            />
          ) : (
            <Folder
              className={`h-4 w-4 shrink-0 fill-current/15 ${getFolderIconClass(folder.color)}`}
            />
          )}
          <span className="truncate text-[13px] font-medium text-[var(--xd-ink)]">
            {folder.name}
          </span>
        </WorkspaceLink>

        <div className="relative z-10 flex shrink-0 items-center gap-1">
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

      <AppContextMenu
        open={contextMenu.open}
        x={contextMenu.x}
        y={contextMenu.y}
        items={toContextMenuItems(menuItems)}
        onClose={() => setContextMenu((prev) => ({ ...prev, open: false }))}
        ariaLabel={`Actions for ${folder.name}`}
      />
    </>
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

  const pMatches = Array.from(
    source.matchAll(/<(?:p|li|h2|h3)[^>]*>([\s\S]*?)<\/(?:p|li|h2|h3)>/gi),
  )
    .map((match) => stripTags(match[1]))
    .filter((text) => text.length > 12)
    .slice(0, 3)

  return {
    heading: heading || doc.title,
    lines: pMatches.length > 0 ? pMatches : [doc.description],
  }
}

export function DriveDocumentThumbnail({ doc }: { doc: MarbleDocumentFile }) {
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
        <svg viewBox="0 0 180 72" className="h-16 w-full" aria-hidden="true">
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
  onRename?: (doc: MarbleDocumentFile) => void
  onSaveAsTemplate?: (doc: MarbleDocumentFile) => void
  onMove?: (doc: MarbleDocumentFile) => void
  onDuplicate?: (doc: MarbleDocumentFile) => void
  onShare?: (doc: MarbleDocumentFile) => void
  onToggleStar?: (doc: MarbleDocumentFile) => void
  onTogglePin?: (doc: MarbleDocumentFile) => void
  onDelete?: (doc: MarbleDocumentFile) => void
}

function buildFileMenuItems(props: DriveFileCardProps): ActionMenuItem[] {
  const {
    doc,
    onOpen,
    onRename,
    onSaveAsTemplate,
    onMove,
    onDuplicate,
    onShare,
    onToggleStar,
    onTogglePin,
    onDelete,
  } = props
  return [
    {
      id: 'open',
      label: 'Open',
      icon: <ExternalLink className="h-3.5 w-3.5" />,
      onSelect: () => onOpen?.(doc),
    },
    ...(onRename
      ? [
          {
            id: 'rename',
            label: 'Rename',
            icon: <Pencil className="h-3.5 w-3.5" />,
            onSelect: () => onRename(doc),
          },
        ]
      : []),
    ...(onSaveAsTemplate && !doc.isTemplate
      ? [
          {
            id: 'save-as-template',
            label: 'Save as template',
            icon: <LayoutTemplate className="h-3.5 w-3.5" />,
            onSelect: () => onSaveAsTemplate(doc),
          },
        ]
      : []),
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
    ...(onDelete
      ? [
          {
            id: 'delete',
            label: 'Move to trash',
            icon: <Trash2 className="h-3.5 w-3.5" />,
            danger: true,
            onSelect: () => onDelete(doc),
          },
        ]
      : []),
  ]
}

export function DriveFilePreviewCard(props: DriveFileCardProps) {
  const { doc, folderLabel, onOpen, onToggleStar } = props
  const menuItems = buildFileMenuItems(props)
  const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0 })

  return (
    <>
      <article
        draggable
        onDragStart={(e) => setDraggedDoc(e, doc.id)}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setContextMenu({ open: true, x: event.clientX, y: event.clientY })
        }}
        className="group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-[var(--xd-border)] bg-[var(--xd-rail)] transition-colors hover:border-[var(--xd-border-strong)] hover:bg-[var(--xd-elevated)]"
      >
        {/* Top Google Drive File Card Header */}
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-[var(--xd-accent)]">
              {getCategoryIcon(doc.category, 'h-3.5 w-3.5')}
            </span>
            <h3 className="min-w-0 truncate text-[12.5px] font-medium text-[var(--xd-ink)]">
              <WorkspaceLink
                href={docHref(doc)}
                onNavigate={onOpen ? () => onOpen(doc) : undefined}
                className="block truncate after:absolute after:inset-0"
              >
                {doc.title}
              </WorkspaceLink>
            </h3>
          </div>

          <div
            className="relative z-10 flex shrink-0 items-center gap-0.5"
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

      <AppContextMenu
        open={contextMenu.open}
        x={contextMenu.x}
        y={contextMenu.y}
        items={toContextMenuItems(menuItems)}
        onClose={() => setContextMenu((prev) => ({ ...prev, open: false }))}
        ariaLabel={`Actions for ${doc.title}`}
      />
    </>
  )
}

/* ============================================================================
   5. DriveFileIconTile — Compact Icon Grid View
   ============================================================================ */

export function DriveFileIconTile(props: DriveFileCardProps) {
  const { doc, onOpen, onToggleStar } = props
  const menuItems = buildFileMenuItems(props)
  const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0 })

  return (
    <>
      <article
        draggable
        onDragStart={(e) => setDraggedDoc(e, doc.id)}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setContextMenu({ open: true, x: event.clientX, y: event.clientY })
        }}
        className="group relative flex cursor-pointer flex-col items-center rounded-lg border border-transparent px-3 py-3.5 text-center transition-colors hover:border-[var(--xd-border)] hover:bg-[var(--xd-rail)]"
      >
        <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5">
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
          <WorkspaceLink
            href={docHref(doc)}
            onNavigate={onOpen ? () => onOpen(doc) : undefined}
            className="after:absolute after:inset-0"
          >
            {doc.title}
          </WorkspaceLink>
        </h3>
        <span className="mt-0.5 text-[10.5px] text-[var(--xd-ink-muted)]">
          {getCategoryLabel(doc.category)}
        </span>
      </article>

      <AppContextMenu
        open={contextMenu.open}
        x={contextMenu.x}
        y={contextMenu.y}
        items={toContextMenuItems(menuItems)}
        onClose={() => setContextMenu((prev) => ({ ...prev, open: false }))}
        ariaLabel={`Actions for ${doc.title}`}
      />
    </>
  )
}

/* ============================================================================
   6. DriveFileListTable — Google Drive Dense List View (Folders + Files)
   ============================================================================ */

export interface DriveFileListTableProps {
  folders: DriveFolder[]
  folderCounts?: Map<
    string,
    { files: number; subfolders: number; total: number }
  >
  docs: MarbleDocumentFile[]
  resolveFolderLabel?: (doc: MarbleDocumentFile) => string
  onOpenFolder?: (folder: DriveFolder) => void
  onCreateSubfolder?: (folder: DriveFolder) => void
  onRenameFolder?: (folder: DriveFolder) => void
  onDeleteFolder?: (folder: DriveFolder) => void
  onDropDocOnFolder?: (docId: string, folderId: string) => void
  onOpenDoc?: (doc: MarbleDocumentFile) => void
  onRenameDoc?: (doc: MarbleDocumentFile) => void
  onSaveAsTemplateDoc?: (doc: MarbleDocumentFile) => void
  onMoveDoc?: (doc: MarbleDocumentFile) => void
  onDuplicateDoc?: (doc: MarbleDocumentFile) => void
  onShareDoc?: (doc: MarbleDocumentFile) => void
  onToggleStar?: (doc: MarbleDocumentFile) => void
  onTogglePin?: (doc: MarbleDocumentFile) => void
  onDeleteDoc?: (doc: MarbleDocumentFile) => void
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
  onRenameDoc,
  onSaveAsTemplateDoc,
  onMoveDoc,
  onDuplicateDoc,
  onShareDoc,
  onToggleStar,
  onTogglePin,
  onDeleteDoc,
}: DriveFileListTableProps) {
  const [dragTargetFolderId, setDragTargetFolderId] = useState<string | null>(
    null,
  )
  const [contextState, setContextState] = useState<{
    open: boolean
    x: number
    y: number
    label: string
    items: ContextMenuItem[]
  }>({ open: false, x: 0, y: 0, label: 'Actions', items: [] })

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

            const href = folderHref(folder)
            return (
              <tr
                key={folder.id}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('a')) return
                  if (isModifiedClick(event)) {
                    window.open(href, '_blank', 'noopener,noreferrer')
                    return
                  }
                  onOpenFolder?.(folder)
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setContextState({
                    open: true,
                    x: event.clientX,
                    y: event.clientY,
                    label: `Actions for ${folder.name}`,
                    items: toContextMenuItems(folderMenuItems),
                  })
                }}
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
                  <WorkspaceLink
                    href={href}
                    onNavigate={
                      onOpenFolder ? () => onOpenFolder(folder) : undefined
                    }
                    className="flex items-center gap-2.5"
                  >
                    {isTopLevelTemplatesFolder(folder) ? (
                      <LayoutTemplate
                        className={`h-4 w-4 shrink-0 ${getFolderIconClass(folder.color)}`}
                      />
                    ) : (
                      <Folder
                        className={`h-4 w-4 shrink-0 fill-current/15 ${getFolderIconClass(folder.color)}`}
                      />
                    )}
                    <span className="font-medium text-[var(--xd-ink)]">
                      {folder.name}
                    </span>
                  </WorkspaceLink>
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
              onRename: onRenameDoc,
              onSaveAsTemplate: onSaveAsTemplateDoc,
              onMove: onMoveDoc,
              onDuplicate: onDuplicateDoc,
              onShare: onShareDoc,
              onToggleStar,
              onTogglePin,
              onDelete: onDeleteDoc,
            })

            const href = docHref(doc)
            return (
              <tr
                key={doc.id}
                draggable
                onDragStart={(e) => setDraggedDoc(e, doc.id)}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('a')) return
                  if (isModifiedClick(event)) {
                    window.open(href, '_blank', 'noopener,noreferrer')
                    return
                  }
                  onOpenDoc?.(doc)
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setContextState({
                    open: true,
                    x: event.clientX,
                    y: event.clientY,
                    label: `Actions for ${doc.title}`,
                    items: toContextMenuItems(menuItems),
                  })
                }}
                className="group cursor-pointer transition-colors hover:bg-[var(--xd-surface-hover)]/50"
              >
                <td className="px-3 py-2.5">
                  <WorkspaceLink
                    href={href}
                    onNavigate={onOpenDoc ? () => onOpenDoc(doc) : undefined}
                    className="flex items-center gap-2.5"
                  >
                    <span className="shrink-0 text-[var(--xd-accent)]">
                      {getCategoryIcon(doc.category, 'h-4 w-4')}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-[var(--xd-ink)]">
                          {doc.title}
                        </span>
                        {doc.isTemplate && (
                          <span className="xd-mono shrink-0 rounded border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] px-1 py-0.5 text-[9.5px] leading-none text-[var(--xd-accent)]">
                            Template
                          </span>
                        )}
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
                  </WorkspaceLink>
                </td>
                <td className="hidden px-3 py-2.5 sm:table-cell">
                  <span className="inline-flex items-center gap-1 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-1.5 py-0.5 text-[11px] text-[var(--xd-ink-secondary)]">
                    <Folder className="h-3 w-3 text-[var(--xd-ink-muted)]" />
                    <span className="max-w-[140px] truncate">
                      {folderLabel}
                    </span>
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

      <AppContextMenu
        open={contextState.open}
        x={contextState.x}
        y={contextState.y}
        items={contextState.items}
        onClose={() => setContextState((prev) => ({ ...prev, open: false }))}
        ariaLabel={contextState.label}
      />
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

  const trimmedName = name.trim()
  const invalidNameReason = trimmedName.startsWith('.')
    ? 'Folder names cannot start with ".".'
    : trimmedName.includes('/') || trimmedName.includes('\\')
      ? 'Folder names cannot contain "/" or "\\".'
      : null

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
          if (!trimmedName || invalidNameReason) return
          onSubmit(trimmedName, color)
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
        {invalidNameReason && (
          <p className="mt-1.5 text-[11px] text-[var(--xd-danger)]">
            {invalidNameReason}
          </p>
        )}

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
            disabled={!trimmedName || Boolean(invalidNameReason)}
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
   7b. SaveAsTemplateDialog — Save an Existing App/File as a Reusable Template
   ============================================================================ */

export interface SaveAsTemplateDialogProps {
  open: boolean
  sourceTitle: string
  initialTitle?: string
  initialDescription?: string
  onClose: () => void
  onSubmit: (input: { title: string; description: string }) => void
}

export function SaveAsTemplateDialog({
  open,
  sourceTitle,
  initialTitle = '',
  initialDescription = '',
  onClose,
  onSubmit,
}: SaveAsTemplateDialogProps) {
  const [title, setTitle] = useState(initialTitle || `${sourceTitle} template`)
  const [description, setDescription] = useState(initialDescription)

  useEffect(() => {
    if (open) {
      setTitle(initialTitle || `${sourceTitle} template`)
      setDescription(initialDescription)
    }
  }, [open, sourceTitle, initialTitle, initialDescription])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const trimmedTitle = title.trim()

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-[16vh]"
      onMouseDown={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Save as template"
        className="w-full max-w-sm rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          if (!trimmedTitle) return
          onSubmit({ title: trimmedTitle, description: description.trim() })
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]">
              <LayoutTemplate className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-[14px] font-semibold text-[var(--xd-ink)]">
              Save as template
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="mt-1.5 text-[11.5px] text-[var(--xd-ink-muted)]">
          Location: My Drive / {TEMPLATES_FOLDER_NAME}
        </p>

        <div className="mt-3 space-y-2.5">
          <div>
            <label
              htmlFor="xdrive-save-template-title"
              className="mb-1 block text-[11.5px] font-medium text-[var(--xd-ink-secondary)]"
            >
              Template name
            </label>
            <input
              id="xdrive-save-template-title"
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Template name"
              aria-label="Template name"
              className="h-8 w-full rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2.5 text-[12.5px] text-[var(--xd-ink)] placeholder:text-[var(--xd-ink-muted)] focus:border-[var(--xd-accent)] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="xdrive-save-template-desc"
              className="mb-1 block text-[11.5px] font-medium text-[var(--xd-ink-secondary)]"
            >
              Description (optional)
            </label>
            <textarea
              id="xdrive-save-template-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this template includes..."
              aria-label="Template description"
              className="w-full resize-none rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2.5 py-1.5 text-[12px] text-[var(--xd-ink)] placeholder:text-[var(--xd-ink-muted)] focus:border-[var(--xd-accent)] focus:outline-none"
            />
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
            disabled={!trimmedTitle}
            className="h-7 rounded bg-[var(--xd-accent)] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[var(--xd-accent-hover)] disabled:opacity-40"
          >
            Save template
          </button>
        </div>
      </form>
    </div>
  )
}

/* ============================================================================
   7c. DriveRenameDocDialog — Rename a File or Template
   ============================================================================ */

export interface DriveRenameDocDialogProps {
  open: boolean
  isTemplate?: boolean
  initialTitle: string
  initialDescription?: string
  onClose: () => void
  onSubmit: (input: { title: string; description: string }) => void
}

export function DriveRenameDocDialog({
  open,
  isTemplate = false,
  initialTitle,
  initialDescription = '',
  onClose,
  onSubmit,
}: DriveRenameDocDialogProps) {
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription)

  useEffect(() => {
    if (open) {
      setTitle(initialTitle)
      setDescription(initialDescription)
    }
  }, [open, initialTitle, initialDescription])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const trimmedTitle = title.trim()

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-[16vh]"
      onMouseDown={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={isTemplate ? 'Rename template' : 'Rename file'}
        className="w-full max-w-sm rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          if (!trimmedTitle) return
          onSubmit({ title: trimmedTitle, description: description.trim() })
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[var(--xd-ink)]">
            {isTemplate ? 'Rename template' : 'Rename file'}
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

        <div className="mt-3 space-y-2.5">
          <div>
            <label
              htmlFor="xdrive-rename-doc-title"
              className="mb-1 block text-[11.5px] font-medium text-[var(--xd-ink-secondary)]"
            >
              Name
            </label>
            <input
              id="xdrive-rename-doc-title"
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document name"
              aria-label="Document name"
              className="h-8 w-full rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2.5 text-[12.5px] text-[var(--xd-ink)] placeholder:text-[var(--xd-ink-muted)] focus:border-[var(--xd-accent)] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="xdrive-rename-doc-desc"
              className="mb-1 block text-[11.5px] font-medium text-[var(--xd-ink-secondary)]"
            >
              Description (optional)
            </label>
            <textarea
              id="xdrive-rename-doc-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary..."
              aria-label="Document description"
              className="w-full resize-none rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2.5 py-1.5 text-[12px] text-[var(--xd-ink)] placeholder:text-[var(--xd-ink-muted)] focus:border-[var(--xd-accent)] focus:outline-none"
            />
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
            disabled={!trimmedTitle}
            className="h-7 rounded bg-[var(--xd-accent)] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[var(--xd-accent-hover)] disabled:opacity-40"
          >
            Save
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

/* ============================================================================
   9. DriveTrashList — Trash View with 30-Day Retention, Restore & Delete Forever
   ============================================================================ */

export interface DriveTrashListProps {
  docs: MarbleDocumentFile[]
  totalCount?: number
  retentionDays?: number
  resolveFolderLabel?: (doc: MarbleDocumentFile) => string
  formatTrashedAt?: (iso: string) => string
  onRestoreDoc?: (doc: MarbleDocumentFile) => void
  onDeleteForeverDoc?: (doc: MarbleDocumentFile) => void
  restoreBlockedDocIds?: ReadonlySet<string>
  deleteForeverBlockedDocIds?: ReadonlySet<string>
  emptyTrashBlocked?: boolean
  onEmptyTrash?: () => void
}

export function DriveTrashList({
  docs,
  totalCount,
  retentionDays = TRASH_RETENTION_DAYS,
  resolveFolderLabel,
  formatTrashedAt,
  onRestoreDoc,
  onDeleteForeverDoc,
  restoreBlockedDocIds,
  deleteForeverBlockedDocIds,
  emptyTrashBlocked = false,
  onEmptyTrash,
}: DriveTrashListProps) {
  const effectiveTotal = totalCount ?? docs.length
  const hasTrashItems = effectiveTotal > 0
  const [contextState, setContextState] = useState<{
    open: boolean
    x: number
    y: number
    label: string
    items: ContextMenuItem[]
  }>({ open: false, x: 0, y: 0, label: 'Trash actions', items: [] })

  return (
    <div className="space-y-4">
      {/* 30-Day Auto-Clear Policy Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3.5 py-2.5 text-[12px] text-[var(--xd-ink-secondary)]">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--xd-ink-muted)]" />
          <span>
            Items in trash are automatically permanently deleted after{' '}
            <strong className="font-medium text-[var(--xd-ink)]">
              {retentionDays} {retentionDays === 1 ? 'day' : 'days'}
            </strong>
            .
          </span>
        </div>

        {hasTrashItems && onEmptyTrash && (
          <button
            type="button"
            onClick={onEmptyTrash}
            disabled={emptyTrashBlocked}
            title={
              emptyTrashBlocked
                ? 'Wait for Trash changes to finish'
                : 'Empty trash'
            }
            className="inline-flex h-7 items-center gap-1.5 rounded border border-[var(--xd-danger)]/35 bg-[var(--xd-danger-soft)] px-2.5 text-[11.5px] font-medium text-[var(--xd-danger)] transition-colors hover:border-[var(--xd-danger)]/60 hover:bg-[var(--xd-danger)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--xd-danger)]/35 disabled:hover:bg-[var(--xd-danger-soft)] disabled:hover:text-[var(--xd-danger)]"
          >
            <Trash2 className="h-3 w-3" />
            <span>Empty trash</span>
          </button>
        )}
      </div>

      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--xd-border-strong)] py-14 text-center">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--xd-border)] bg-[var(--xd-rail)] text-[var(--xd-ink-muted)]">
            <Trash2 className="h-4 w-4" />
          </span>
          <p className="mt-3 text-[13px] font-medium text-[var(--xd-ink)]">
            {hasTrashItems ? 'No matching files in Trash' : 'Trash is empty'}
          </p>
          <p className="mt-1 max-w-sm text-[12px] text-[var(--xd-ink-muted)]">
            {hasTrashItems
              ? 'Try clearing your search query to see all trashed files.'
              : `Files you delete are moved here and kept for ${retentionDays} ${retentionDays === 1 ? 'day' : 'days'} before they are permanently removed.`}
          </p>
        </div>
      ) : (
        <div className="overflow-visible rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)]">
          <table className="w-full border-collapse text-left text-[12.5px]">
            <thead className="border-b border-[var(--xd-border)] bg-[var(--xd-rail)] text-[11px] text-[var(--xd-ink-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">
                  Original location
                </th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">
                  Date trashed
                </th>
                <th className="px-3 py-2 font-medium">Auto-delete</th>
                <th className="hidden px-3 py-2 text-right font-medium lg:table-cell">
                  Size
                </th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--xd-border)]">
              {docs.map((doc) => {
                const folderLabel = resolveFolderLabel
                  ? resolveFolderLabel(doc)
                  : doc.folder || 'My Drive'
                const trashedIso = doc.trashedAt ?? doc.updatedAt
                const daysLeft = getTrashDaysRemaining(
                  trashedIso,
                  Date.now(),
                  retentionDays,
                )
                const trashedLabel = formatTrashedAt
                  ? formatTrashedAt(trashedIso)
                  : trashedIso
                const expiryLabel =
                  daysLeft <= 0
                    ? 'Expiring soon'
                    : daysLeft === 1
                      ? '1 day left'
                      : `${daysLeft} days left`
                const urgent = daysLeft <= 5

                const deleteForeverBlocked =
                  deleteForeverBlockedDocIds?.has(doc.id) ?? false
                const restoreBlocked =
                  restoreBlockedDocIds?.has(doc.id) ?? false
                const menuItems: ActionMenuItem[] = [
                  ...(onRestoreDoc && !restoreBlocked
                    ? [
                        {
                          id: 'restore',
                          label: 'Restore',
                          icon: <RotateCcw className="h-3.5 w-3.5" />,
                          onSelect: () => onRestoreDoc(doc),
                        },
                      ]
                    : []),
                  ...(onDeleteForeverDoc && !deleteForeverBlocked
                    ? [
                        {
                          id: 'delete-forever',
                          label: 'Delete forever',
                          icon: <Trash2 className="h-3.5 w-3.5" />,
                          danger: true,
                          onSelect: () => onDeleteForeverDoc(doc),
                        },
                      ]
                    : []),
                ]

                return (
                  <tr
                    key={doc.id}
                    onContextMenu={(event) => {
                      if (menuItems.length === 0) return
                      event.preventDefault()
                      event.stopPropagation()
                      setContextState({
                        open: true,
                        x: event.clientX,
                        y: event.clientY,
                        label: `Trash actions for ${doc.title}`,
                        items: toContextMenuItems(menuItems),
                      })
                    }}
                    className="group transition-colors hover:bg-[var(--xd-surface-hover)]/40"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="shrink-0 text-[var(--xd-ink-muted)]">
                          {getCategoryIcon(doc.category, 'h-4 w-4')}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-[var(--xd-ink)]">
                            {doc.title}
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
                        <span className="max-w-[140px] truncate">
                          {folderLabel}
                        </span>
                      </span>
                    </td>

                    <td className="xd-tabular hidden px-3 py-2.5 text-[var(--xd-ink-muted)] md:table-cell">
                      {trashedLabel}
                    </td>

                    <td className="xd-tabular px-3 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${
                          urgent
                            ? 'border-[var(--xd-sketch)]/40 bg-[var(--xd-sketch-soft)] text-[var(--xd-sketch)]'
                            : 'border-[var(--xd-border)] bg-[var(--xd-rail)] text-[var(--xd-ink-muted)]'
                        }`}
                      >
                        {expiryLabel}
                      </span>
                    </td>

                    <td className="xd-tabular hidden px-3 py-2.5 text-right text-[var(--xd-ink-muted)] lg:table-cell">
                      {formatBytes(doc.byteSize)}
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {onRestoreDoc && (
                          <button
                            type="button"
                            onClick={() => onRestoreDoc(doc)}
                            disabled={restoreBlocked}
                            aria-label={`Restore ${doc.title}`}
                            title={
                              restoreBlocked
                                ? 'Wait for delete to finish'
                                : 'Restore'
                            }
                            className="inline-flex h-7 items-center gap-1 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 text-[11.5px] font-medium text-[var(--xd-ink)] transition-colors hover:border-[var(--xd-border-strong)] hover:bg-[var(--xd-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--xd-border)] disabled:hover:bg-[var(--xd-canvas)]"
                          >
                            <RotateCcw className="h-3 w-3 text-[var(--xd-ink-secondary)]" />
                            <span>Restore</span>
                          </button>
                        )}
                        {onDeleteForeverDoc && (
                          <button
                            type="button"
                            onClick={() => onDeleteForeverDoc(doc)}
                            disabled={deleteForeverBlocked}
                            aria-label={`Delete ${doc.title} forever`}
                            title={
                              deleteForeverBlocked
                                ? 'Wait for the current change to finish'
                                : 'Delete forever'
                            }
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-[var(--xd-border)] text-[var(--xd-ink-muted)] transition-colors hover:border-[var(--xd-danger)]/45 hover:bg-[var(--xd-danger-soft)] hover:text-[var(--xd-danger)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--xd-border)] disabled:hover:bg-transparent disabled:hover:text-[var(--xd-ink-muted)]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {menuItems.length > 0 && (
                          <CompactActionMenu
                            label={`Trash actions for ${doc.title}`}
                            items={menuItems}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AppContextMenu
        open={contextState.open}
        x={contextState.x}
        y={contextState.y}
        items={contextState.items}
        onClose={() => setContextState((prev) => ({ ...prev, open: false }))}
        ariaLabel={contextState.label}
      />
    </div>
  )
}

/* ============================================================================
   10. DrivePermanentDeleteDialog — Confirm Permanent Deletion from Trash
   ============================================================================ */

export interface DrivePermanentDeleteDialogProps {
  open: boolean
  mode: 'single' | 'empty'
  fileName?: string
  itemCount?: number
  onClose: () => void
  onConfirm: () => void
}

export function DrivePermanentDeleteDialog({
  open,
  mode,
  fileName,
  itemCount = 0,
  onClose,
  onConfirm,
}: DrivePermanentDeleteDialogProps) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const title =
    mode === 'empty' ? 'Empty trash forever?' : 'Delete file forever?'
  const description =
    mode === 'empty'
      ? `All ${itemCount} ${itemCount === 1 ? 'item' : 'items'} in Trash will be permanently deleted. This action cannot be undone.`
      : `"${fileName || 'This file'}" will be permanently deleted and can no longer be restored.`

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-[18vh]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--xd-danger-soft)] text-[var(--xd-danger)]">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <h2 className="text-[14px] font-semibold text-[var(--xd-ink)]">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--xd-ink-muted)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--xd-ink-secondary)]">
          {description}
        </p>

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
            onClick={onConfirm}
            className="h-7 rounded bg-[var(--xd-danger)] px-3 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
          >
            {mode === 'empty' ? 'Empty trash' : 'Delete forever'}
          </button>
        </div>
      </div>
    </div>
  )
}
