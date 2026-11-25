import {
  FileQuestion,
  FolderSearch,
  HardDrive,
  MessageSquareOff,
  RotateCcw,
  Settings,
  Trash2,
} from 'lucide-react'
import { WorkspaceLink } from '#/components/routing/WorkspaceLink'
import { getTrashDaysRemaining } from '#/components/design-system/DriveExplorer'
import type { MarbleDocumentFile } from '#/lib/types'

export interface TrashedDocumentViewProps {
  doc: MarbleDocumentFile
  folderLabel: string
  retentionDays: number
  onRestoreAndOpen: () => void
  onGoTrash?: () => void
  onGoDrive?: () => void
}

export function TrashedDocumentView({
  doc,
  folderLabel,
  retentionDays,
  onRestoreAndOpen,
  onGoTrash,
  onGoDrive,
}: TrashedDocumentViewProps) {
  const daysLeft = doc.trashedAt
    ? getTrashDaysRemaining(doc.trashedAt, Date.now(), retentionDays)
    : retentionDays
  const expiryLabel =
    daysLeft <= 0
      ? 'Expiring soon'
      : daysLeft === 1
        ? '1 day remaining before auto-delete'
        : `${daysLeft} days remaining before auto-delete`

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-rail)] p-6 text-center">
        <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--xd-sketch)]/40 bg-[var(--xd-sketch-soft)] text-[var(--xd-sketch)]">
          <Trash2 className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-[16px] font-semibold tracking-tight text-[var(--xd-ink)]">
          This document is in Trash
        </h1>
        <p className="mt-1.5 text-[13px] font-medium text-[var(--xd-ink-secondary)]">
          {doc.title}
        </p>
        <p className="xd-mono mt-0.5 text-[11px] text-[var(--xd-ink-muted)]">
          {doc.fileName} · Original location: {folderLabel}
        </p>
        <p className="mt-2 text-[12px] text-[var(--xd-ink-muted)]">
          {expiryLabel}. Restore it to resume viewing and editing.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onRestoreAndOpen}
            className="inline-flex h-8 items-center gap-1.5 rounded bg-[var(--xd-accent)] px-3.5 text-[12.5px] font-medium text-white transition-colors hover:bg-[var(--xd-accent-hover)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Restore &amp; open</span>
          </button>
          <WorkspaceLink
            href="/trash"
            onNavigate={onGoTrash}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-3 text-[12.5px] font-medium text-[var(--xd-ink)] transition-colors hover:bg-[var(--xd-surface-hover)]"
          >
            <Trash2 className="h-3.5 w-3.5 text-[var(--xd-ink-muted)]" />
            <span>Open Trash</span>
          </WorkspaceLink>
          <WorkspaceLink
            href="/drive"
            onNavigate={onGoDrive}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-[var(--xd-border)] px-3 text-[12.5px] text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
          >
            <HardDrive className="h-3.5 w-3.5" />
            <span>My Drive</span>
          </WorkspaceLink>
        </div>
      </div>
    </div>
  )
}

export interface WorkspaceNotFoundViewProps {
  kind: 'doc' | 'folder' | 'chat' | 'settings' | 'route'
  targetId?: string
  onGoDrive?: () => void
  onGoTrash?: () => void
  onGoChat?: () => void
  onGoSettings?: () => void
}

export function WorkspaceNotFoundView({
  kind,
  targetId,
  onGoDrive,
  onGoTrash,
  onGoChat,
  onGoSettings,
}: WorkspaceNotFoundViewProps) {
  const meta = (() => {
    switch (kind) {
      case 'doc':
        return {
          icon: <FileQuestion className="h-5 w-5" />,
          title: 'Document not found',
          description:
            'This .mrbl document does not exist or may have been permanently deleted.',
        }
      case 'folder':
        return {
          icon: <FolderSearch className="h-5 w-5" />,
          title: 'Folder not found',
          description:
            'This folder does not exist or may have been deleted from your Drive.',
        }
      case 'chat':
        return {
          icon: <MessageSquareOff className="h-5 w-5" />,
          title: 'Chat thread not found',
          description:
            'This Drive Chat conversation could not be found or was deleted.',
        }
      case 'settings':
        return {
          icon: <Settings className="h-5 w-5" />,
          title: 'Settings section not found',
          description:
            'That settings section or AI provider does not exist in xDrive.',
        }
      default:
        return {
          icon: <FileQuestion className="h-5 w-5" />,
          title: 'Page not found',
          description:
            'The xDrive URL you requested does not match any view, folder, or document.',
        }
    }
  })()

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-rail)] p-6 text-center">
        <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] text-[var(--xd-ink-muted)]">
          {meta.icon}
        </span>
        <p className="xd-mono mt-3 text-[10.5px] uppercase tracking-wider text-[var(--xd-ink-muted)]">
          404 · Not Found
        </p>
        <h1 className="mt-1 text-[16px] font-semibold tracking-tight text-[var(--xd-ink)]">
          {meta.title}
        </h1>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--xd-ink-secondary)]">
          {meta.description}
        </p>
        {targetId && (
          <p className="xd-mono mt-2 truncate rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2.5 py-1 text-[11px] text-[var(--xd-ink-muted)]">
            {targetId}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <WorkspaceLink
            href="/drive"
            onNavigate={onGoDrive}
            className="inline-flex h-8 items-center gap-1.5 rounded bg-[var(--xd-accent)] px-3.5 text-[12.5px] font-medium text-white transition-colors hover:bg-[var(--xd-accent-hover)]"
          >
            <HardDrive className="h-3.5 w-3.5" />
            <span>Back to My Drive</span>
          </WorkspaceLink>

          {kind === 'doc' && (
            <WorkspaceLink
              href="/trash"
              onNavigate={onGoTrash}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-3 text-[12.5px] font-medium text-[var(--xd-ink)] transition-colors hover:bg-[var(--xd-surface-hover)]"
            >
              <Trash2 className="h-3.5 w-3.5 text-[var(--xd-ink-muted)]" />
              <span>Check Trash</span>
            </WorkspaceLink>
          )}

          {kind === 'chat' && (
            <WorkspaceLink
              href="/chat"
              onNavigate={onGoChat}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-3 text-[12.5px] font-medium text-[var(--xd-ink)] transition-colors hover:bg-[var(--xd-surface-hover)]"
            >
              <span>New Drive Chat</span>
            </WorkspaceLink>
          )}

          {kind === 'settings' && (
            <WorkspaceLink
              href="/settings/models"
              onNavigate={onGoSettings}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-3 text-[12.5px] font-medium text-[var(--xd-ink)] transition-colors hover:bg-[var(--xd-surface-hover)]"
            >
              <Settings className="h-3.5 w-3.5 text-[var(--xd-ink-muted)]" />
              <span>Models &amp; Providers</span>
            </WorkspaceLink>
          )}
        </div>
      </div>
    </div>
  )
}
