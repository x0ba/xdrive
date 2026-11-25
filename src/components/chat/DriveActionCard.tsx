import { useState } from 'react'
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FilePenLine,
  FilePlus2,
  FolderInput,
  FolderMinus,
  FolderPen,
  FolderPlus,
  RotateCcw,
  Tag,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import type { DriveChatAction } from '#/lib/ai/drive-chat-types'
import { WorkspaceLink } from '#/components/routing/WorkspaceLink'
import { docIdHref, folderIdHref } from '#/lib/routing'
import { cn } from '#/lib/utils'

export interface DriveActionCardProps {
  action: DriveChatAction
  onApply?: (actionId: string) => void
  onDiscard?: (actionId: string) => void
  onUndo?: (actionId: string) => void
  onOpenDocument?: (docId: string) => void
  onOpenFolder?: (folderId: string | null) => void
  defaultExpanded?: boolean
}

function ActionIcon({
  action,
  className = 'size-3.5',
}: {
  action: DriveChatAction
  className?: string
}) {
  switch (action.kind) {
    case 'edit_document':
      return <FilePenLine className={className} />
    case 'create_document':
      return <FilePlus2 className={className} />
    case 'rename_document':
      return <FilePenLine className={className} />
    case 'move_document':
      return <FolderInput className={className} />
    case 'update_document_meta':
      return <Tag className={className} />
    case 'trash_document':
      return <Trash2 className={className} />
    case 'restore_document':
      return <RotateCcw className={className} />
    case 'create_folder':
      return <FolderPlus className={className} />
    case 'rename_folder':
      return <FolderPen className={className} />
    case 'delete_folder':
      return <FolderMinus className={className} />
  }
}

function statusMeta(status: DriveChatAction['status']): {
  label: string
  className: string
} {
  switch (status) {
    case 'applied':
      return {
        label: 'Applied',
        className: 'bg-[var(--xd-commit-soft)] text-[var(--xd-commit)]',
      }
    case 'discarded':
      return {
        label: 'Discarded',
        className: 'bg-[var(--xd-surface-hover)] text-[var(--xd-ink-muted)]',
      }
    case 'undone':
      return {
        label: 'Undone',
        className:
          'bg-[var(--xd-surface-hover)] text-[var(--xd-ink-secondary)]',
      }
    case 'failed':
      return {
        label: 'Failed',
        className: 'bg-[var(--xd-danger-soft)] text-[var(--xd-danger)]',
      }
    case 'proposed':
    default:
      return {
        label: 'Pending',
        className: 'bg-[var(--xd-sketch-soft)] text-[var(--xd-sketch)]',
      }
  }
}

function resolveOpenableDocId(action: DriveChatAction): string | null {
  if (action.kind === 'create_document') {
    return action.createdDocId ?? null
  }
  if (
    action.kind === 'edit_document' ||
    action.kind === 'rename_document' ||
    action.kind === 'move_document' ||
    action.kind === 'update_document_meta' ||
    action.kind === 'restore_document'
  ) {
    return action.docId
  }
  return null
}

function resolveOpenableFolderId(
  action: DriveChatAction,
): { folderId: string | null } | null {
  if (action.kind === 'create_folder' && action.createdFolderId) {
    return { folderId: action.createdFolderId }
  }
  if (action.kind === 'rename_folder') {
    return { folderId: action.folderId }
  }
  if (action.kind === 'move_document') {
    return { folderId: action.targetFolderId }
  }
  return null
}

export function DriveActionCard({
  action,
  onApply,
  onDiscard,
  onUndo,
  onOpenDocument,
  onOpenFolder,
  defaultExpanded = false,
}: DriveActionCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const badge = statusMeta(action.status)
  const isDestructive =
    action.kind === 'trash_document' || action.kind === 'delete_folder'
  const docId = resolveOpenableDocId(action)
  const folderTarget = resolveOpenableFolderId(action)

  const hasDetails =
    action.kind === 'edit_document' ||
    action.kind === 'create_document' ||
    action.kind === 'rename_document' ||
    action.kind === 'move_document' ||
    action.kind === 'update_document_meta' ||
    Boolean(action.error)

  return (
    <div
      data-component="drive-action-card"
      className={cn(
        'overflow-hidden rounded-xl border bg-[var(--xd-rail)]/80 text-[12.5px] transition-colors',
        action.status === 'proposed'
          ? 'border-[var(--xd-border-strong)]'
          : 'border-[var(--xd-border)]',
        action.status === 'discarded' && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => hasDetails && setExpanded((prev) => !prev)}
          disabled={!hasDetails}
          className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
        >
          {hasDetails ? (
            expanded ? (
              <ChevronDown className="size-3.5 shrink-0 text-[var(--xd-ink-muted)]" />
            ) : (
              <ChevronRight className="size-3.5 shrink-0 text-[var(--xd-ink-muted)]" />
            )
          ) : (
            <span className="w-3.5 shrink-0" />
          )}

          <span
            className={cn(
              'shrink-0',
              isDestructive
                ? 'text-[var(--xd-danger)]'
                : action.status === 'applied'
                  ? 'text-[var(--xd-commit)]'
                  : 'text-[var(--xd-ink-secondary)]',
            )}
          >
            <ActionIcon action={action} />
          </span>

          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium text-[var(--xd-ink)]">
              {action.label}
            </span>
            <span className="ml-2 text-[12px] text-[var(--xd-ink-muted)]">
              {action.summary}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-medium',
              badge.className,
            )}
          >
            {badge.label}
          </span>

          {action.status === 'proposed' && (
            <>
              {onApply && (
                <button
                  type="button"
                  onClick={() => onApply(action.id)}
                  className={cn(
                    'inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium transition-colors',
                    isDestructive
                      ? 'bg-[var(--xd-danger)] text-white hover:opacity-90'
                      : 'bg-[var(--xd-ink)] text-[var(--xd-canvas)] hover:opacity-90',
                  )}
                >
                  <Check className="size-3" />
                  <span>Apply</span>
                </button>
              )}
              {onDiscard && (
                <button
                  type="button"
                  onClick={() => onDiscard(action.id)}
                  aria-label={`Discard ${action.label}`}
                  className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] text-[var(--xd-ink-muted)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
                >
                  <X className="size-3" />
                  <span>Discard</span>
                </button>
              )}
            </>
          )}

          {action.status === 'applied' && onUndo && (
            <button
              type="button"
              onClick={() => onUndo(action.id)}
              className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
            >
              <Undo2 className="size-3" />
              <span>Undo</span>
            </button>
          )}

          {docId && onOpenDocument && action.status !== 'discarded' && (
            <WorkspaceLink
              href={docIdHref(docId)}
              onNavigate={() => onOpenDocument(docId)}
              title="Open document in tab"
              className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
            >
              <ExternalLink className="size-3" />
              <span>Open</span>
            </WorkspaceLink>
          )}

          {!docId &&
            folderTarget &&
            onOpenFolder &&
            action.status === 'applied' && (
              <WorkspaceLink
                href={folderIdHref(folderTarget.folderId)}
                onNavigate={() => onOpenFolder(folderTarget.folderId)}
                className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
              >
                <ExternalLink className="size-3" />
                <span>Folder</span>
              </WorkspaceLink>
            )}
        </div>
      </div>

      {expanded && hasDetails && (
        <div className="border-t border-[var(--xd-border)] bg-[var(--xd-canvas)]/70 px-3.5 py-2.5 text-[11.5px]">
          {action.error && (
            <p className="mb-2 flex items-center gap-1.5 text-[var(--xd-danger)]">
              <AlertCircle className="size-3.5 shrink-0" />
              <span>{action.error}</span>
            </p>
          )}

          {action.kind === 'edit_document' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[var(--xd-ink-muted)]">
                <span className="xd-mono text-[11px]">{action.fileName}</span>
                <span>
                  {action.ops.length > 0
                    ? `${action.ops.length} Marble ${action.ops.length === 1 ? 'op' : 'ops'}`
                    : 'Full source update'}
                </span>
              </div>
              {action.diffPreview && action.diffPreview.length > 0 && (
                <ul className="xd-mono space-y-1 rounded-lg border border-[var(--xd-border)] bg-[var(--xd-rail)] p-2.5 text-[11px] text-[var(--xd-ink-secondary)]">
                  {action.diffPreview.map((line, index) => (
                    <li key={index} className="truncate">
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {action.kind === 'create_document' && (
            <div className="space-y-1 text-[var(--xd-ink-secondary)]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="xd-mono text-[11px] text-[var(--xd-ink)]">
                  {action.slug}.mrbl
                </span>
                <span className="text-[var(--xd-ink-muted)]">in</span>
                <span>{action.folderName}</span>
                <span className="rounded bg-[var(--xd-elevated)] px-1.5 py-0.5 text-[10.5px]">
                  {action.category}
                </span>
              </div>
              <p className="text-[var(--xd-ink-muted)]">{action.description}</p>
            </div>
          )}

          {action.kind === 'rename_document' && (
            <div className="flex flex-wrap items-center gap-2 text-[var(--xd-ink-secondary)]">
              <span className="line-through text-[var(--xd-ink-muted)]">
                {action.docTitle}
              </span>
              <span className="font-medium text-[var(--xd-ink)]">
                {action.nextTitle}
              </span>
            </div>
          )}

          {action.kind === 'move_document' && (
            <div className="flex flex-wrap items-center gap-2 text-[var(--xd-ink-secondary)]">
              <span>{action.fromFolderName || 'My Drive'}</span>
              <span className="text-[var(--xd-ink-muted)]">to</span>
              <span className="font-medium text-[var(--xd-ink)]">
                {action.targetFolderName}
              </span>
            </div>
          )}

          {action.kind === 'update_document_meta' && (
            <div className="flex flex-wrap items-center gap-2 text-[var(--xd-ink-secondary)]">
              {action.starred !== undefined && (
                <span>{action.starred ? 'Starred' : 'Unstarred'}</span>
              )}
              {action.pinned !== undefined && (
                <span>{action.pinned ? 'Pinned' : 'Unpinned'}</span>
              )}
              {action.tags && action.tags.length > 0 && (
                <span>Tags: {action.tags.join(', ')}</span>
              )}
              {action.description && <span>{action.description}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
