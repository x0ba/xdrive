import { createElement } from 'react'
import {
  Clock,
  FilePlus2,
  Folder,
  FolderPlus,
  HardDrive,
  KeyRound,
  LayoutTemplate,
  MessageSquare,
  Moon,
  PanelRight,
  PenLine,
  Settings,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Users,
} from 'lucide-react'
import { getFolderPathLabel } from '#/components/design-system/DriveExplorer'
import {
  getCategoryIcon,
  getCategoryLabel,
} from '#/components/design-system/NavigationShell'
import type { PrimaryNavId } from '#/components/design-system/NavigationShell'
import type { DriveChatThread } from '#/lib/ai/drive-chat-types'
import {
  PREDEFINED_MARBLE_TEMPLATES,
  TEMPLATES_FOLDER_NAME,
  isTemplatesRootFolder,
} from '#/lib/marble'
import {
  chatThreadHref,
  docHref,
  folderHref,
  navHref,
  settingsProviderHref,
} from '#/lib/routing'
import type {
  AIProviderId,
  AISubscription,
  DriveFolder,
  MarbleDocumentFile,
} from '#/lib/types'
import { normalizeQuery, parseRecencyMs } from './fuzzy'
import type { CommandItem, CommandSource } from './types'

export interface WorkspaceCommandSourceDeps {
  docs: readonly MarbleDocumentFile[]
  trashedDocs: readonly MarbleDocumentFile[]
  folders: readonly DriveFolder[]
  templates: readonly MarbleDocumentFile[]
  chatThreads: readonly DriveChatThread[]
  subscriptions: readonly Pick<
    AISubscription,
    'providerId' | 'name' | 'connected' | 'status' | 'planName'
  >[]
  trashRetentionDays: number
  theme: 'dark' | 'light'
  activeDoc: MarbleDocumentFile | null
  isDocTemplate: (doc: MarbleDocumentFile) => boolean
  aiSidebarOpen: boolean
  onOpenDocument: (docId: string) => void
  onOpenFolder: (folderId: string | null) => void
  onOpenChatThread: (threadId: string) => void
  onOpenNav: (nav: PrimaryNavId) => void
  onOpenRecent: () => void
  onOpenSettingsProvider: (providerId?: AIProviderId) => void
  onCreateBlankDocument: () => void
  onCreateFromTemplate: (template: MarbleDocumentFile) => void
  onOpenNewTemplateModal: () => void
  onOpenNewAiAgentModal: () => void
  onCreateFolder: () => void
  onCreateWhiteboard: () => void
  onStartAiPrompt: (prompt?: string) => void
  onToggleTheme: () => void
  onToggleAiSidebar: () => void
  onSaveCurrentAsTemplate?: (doc: MarbleDocumentFile) => void
}

const MAX_RECENT_ITEMS = 5

function iconEl(
  Component: typeof Folder,
  className = 'h-3.5 w-3.5',
): ReturnType<typeof createElement> {
  return createElement(Component, { className })
}

function isMeaningfulThread(thread: DriveChatThread): boolean {
  return (
    thread.messages.length > 0 ||
    Boolean(thread.pinned) ||
    (thread.title.trim().length > 0 && thread.title.trim() !== 'New chat')
  )
}

function formatRelativeAge(iso?: string): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  const minutes = Math.round((Date.now() - ms) / 60000)
  if (Math.abs(minutes) < 1) return 'just now'
  if (Math.abs(minutes) < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 36) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 28) return `${days}d ago`
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function resolveDocFolderLabel(
  doc: MarbleDocumentFile,
  folders: readonly DriveFolder[],
): string {
  if (doc.folderId) {
    const path = getFolderPathLabel([...folders], doc.folderId, doc.folder)
    if (path) return path
  }
  return doc.folder || 'My Drive'
}

type RecentCandidate =
  | {
      kind: 'doc'
      key: string
      updatedMs: number
      doc: MarbleDocumentFile
    }
  | {
      kind: 'thread'
      key: string
      updatedMs: number
      thread: DriveChatThread
    }

function getRecentCandidates(
  deps: Pick<WorkspaceCommandSourceDeps, 'docs' | 'chatThreads'>,
): RecentCandidate[] {
  const candidates: RecentCandidate[] = []

  for (const doc of deps.docs) {
    if (doc.trashedAt) continue
    candidates.push({
      kind: 'doc',
      key: `doc:${doc.id}`,
      updatedMs: parseRecencyMs(doc.updatedAt),
      doc,
    })
  }

  for (const thread of deps.chatThreads) {
    if (!isMeaningfulThread(thread)) continue
    candidates.push({
      kind: 'thread',
      key: `thread:${thread.id}`,
      updatedMs: parseRecencyMs(thread.updatedAt),
      thread,
    })
  }

  return candidates
    .sort((a, b) => b.updatedMs - a.updatedMs)
    .slice(0, MAX_RECENT_ITEMS)
}

export function createRecentSource(
  deps: WorkspaceCommandSourceDeps,
): CommandSource {
  return {
    id: 'builtin:recent',
    label: 'Recent',
    priority: 100,
    getItems: (query) => {
      if (normalizeQuery(query).length > 0) return []
      const recent = getRecentCandidates(deps)

      return recent.map((entry): CommandItem => {
        if (entry.kind === 'doc') {
          const { doc } = entry
          const age = formatRelativeAge(doc.updatedAt)
          const folderLabel = resolveDocFolderLabel(doc, deps.folders)
          return {
            id: `recent:doc:${doc.id}`,
            label: doc.title,
            subtitle: age ? `${folderLabel} · ${age}` : folderLabel,
            section: 'recent',
            icon: getCategoryIcon(doc.category),
            href: docHref(doc),
            updatedAt: doc.updatedAt,
            badge: deps.isDocTemplate(doc)
              ? 'Template'
              : doc.starred
                ? 'Starred'
                : undefined,
            keywords: [doc.fileName, doc.folder, ...doc.tags],
            onSelect: () => deps.onOpenDocument(doc.id),
          }
        }

        const { thread } = entry
        const age = formatRelativeAge(thread.updatedAt)
        const count = thread.messages.length
        const msgPart = `${count} message${count === 1 ? '' : 's'}`
        return {
          id: `recent:chat:${thread.id}`,
          label: thread.title,
          subtitle: age ? `Chat · ${msgPart} · ${age}` : `Chat · ${msgPart}`,
          section: 'recent',
          icon: iconEl(MessageSquare),
          href: chatThreadHref(thread.id),
          updatedAt: thread.updatedAt,
          badge: thread.pinned ? 'Pinned' : undefined,
          onSelect: () => deps.onOpenChatThread(thread.id),
        }
      })
    },
  }
}

export function createNavigationSource(
  deps: WorkspaceCommandSourceDeps,
): CommandSource {
  return {
    id: 'builtin:navigate',
    label: 'Navigate',
    priority: 90,
    getItems: (query) => {
      const isEmptyQuery = normalizeQuery(query).length === 0
      const recentKeys = isEmptyQuery
        ? new Set(getRecentCandidates(deps).map((item) => item.key))
        : new Set<string>()

      const items: CommandItem[] = [
        {
          id: 'nav:drive',
          label: 'My Drive',
          subtitle: 'Browse folders and .mrbl documents',
          section: 'navigate',
          icon: iconEl(HardDrive),
          href: navHref('drive'),
          keywords: ['drive', 'home', 'files', 'root'],
          onSelect: () => deps.onOpenFolder(null),
        },
        {
          id: 'nav:chat',
          label: 'Drive Chat',
          subtitle: 'AI workspace conversation across your Drive',
          section: 'navigate',
          icon: iconEl(MessageSquare),
          href: navHref('chat'),
          keywords: ['chat', 'ai', 'assistant', 'conversation'],
          onSelect: () => deps.onOpenNav('chat'),
        },
      ]

      for (const doc of deps.docs) {
        if (doc.trashedAt) continue
        if (recentKeys.has(`doc:${doc.id}`)) continue
        const folderLabel = resolveDocFolderLabel(doc, deps.folders)
        items.push({
          id: `nav:doc:${doc.id}`,
          label: doc.title,
          subtitle: `${folderLabel} · ${doc.fileName}`,
          section: 'navigate',
          icon: getCategoryIcon(doc.category),
          href: docHref(doc),
          updatedAt: doc.updatedAt,
          badge: deps.isDocTemplate(doc)
            ? 'Template'
            : doc.starred
              ? 'Starred'
              : undefined,
          keywords: [
            doc.fileName,
            doc.slug,
            doc.category,
            getCategoryLabel(doc.category),
            folderLabel,
            doc.description,
            ...doc.tags,
          ],
          onSelect: () => deps.onOpenDocument(doc.id),
        })
      }

      const folderList = [...deps.folders]
      for (const folder of folderList) {
        const pathLabel = getFolderPathLabel(folderList, folder.id)
        const isTemplates = isTemplatesRootFolder(folder)
        items.push({
          id: `nav:folder:${folder.id}`,
          label: folder.name,
          subtitle:
            pathLabel && pathLabel !== folder.name
              ? `Folder · ${pathLabel}`
              : 'Folder in My Drive',
          section: 'navigate',
          icon: iconEl(isTemplates ? LayoutTemplate : Folder),
          href: folderHref(folder),
          updatedAt: folder.updatedAt,
          keywords: ['folder', 'directory', pathLabel],
          onSelect: () => deps.onOpenFolder(folder.id),
        })
      }

      for (const thread of deps.chatThreads) {
        if (!isMeaningfulThread(thread)) continue
        if (recentKeys.has(`thread:${thread.id}`)) continue
        const count = thread.messages.length
        const snippet = thread.messages
          .filter((msg) => msg.role === 'user')
          .map((msg) => msg.content.slice(0, 120))
        items.push({
          id: `nav:chat:${thread.id}`,
          label: thread.title,
          subtitle: `Chat thread · ${count} message${count === 1 ? '' : 's'}`,
          section: 'navigate',
          icon: iconEl(MessageSquare),
          href: chatThreadHref(thread.id),
          updatedAt: thread.updatedAt,
          badge: thread.pinned ? 'Pinned' : undefined,
          keywords: ['chat', 'thread', 'conversation', ...snippet],
          onSelect: () => deps.onOpenChatThread(thread.id),
        })
      }

      items.push({
        id: 'nav:settings:models',
        label: 'Settings · Models & Providers',
        subtitle: 'Configure ACP runtimes, model roles, and connections',
        section: 'navigate',
        icon: iconEl(Settings),
        href: settingsProviderHref(),
        keywords: [
          'settings',
          'models',
          'providers',
          'subscriptions',
          'preferences',
          'api',
        ],
        onSelect: () => deps.onOpenSettingsProvider(),
      })

      for (const sub of deps.subscriptions) {
        items.push({
          id: `nav:settings:provider:${sub.providerId}`,
          label: `Settings · ${sub.name}`,
          subtitle: `${sub.connected ? 'Connected' : 'Disconnected'} · ${sub.planName}`,
          section: 'navigate',
          icon: iconEl(KeyRound),
          href: settingsProviderHref(sub.providerId),
          keywords: [
            'settings',
            'models',
            'provider',
            sub.providerId,
            sub.name,
            sub.planName,
          ],
          onSelect: () => deps.onOpenSettingsProvider(sub.providerId),
        })
      }

      return items
    },
  }
}

export function createCreateSource(
  deps: WorkspaceCommandSourceDeps,
): CommandSource {
  return {
    id: 'builtin:create',
    label: 'Create',
    priority: 75,
    getItems: () => {
      const starters =
        deps.templates.length > 0 ? deps.templates : PREDEFINED_MARBLE_TEMPLATES

      const items: CommandItem[] = [
        {
          id: 'create:blank-document',
          label: 'New blank document',
          subtitle: 'Create a blank .mrbl document in Drive',
          section: 'create',
          icon: iconEl(FilePlus2),
          keywords: ['new', 'create', 'document', 'doc', 'blank', 'page'],
          onSelect: () => deps.onCreateBlankDocument(),
        },
        {
          id: 'create:whiteboard',
          label: 'New whiteboard',
          subtitle: 'Create a tldraw canvas saved into Drive',
          section: 'create',
          icon: iconEl(PenLine),
          keywords: [
            'new',
            'create',
            'whiteboard',
            'tldraw',
            'canvas',
            'draw',
            'sketch',
          ],
          onSelect: () => deps.onCreateWhiteboard(),
        },
        {
          id: 'create:folder',
          label: 'New folder',
          subtitle: 'Create a folder in the current location',
          section: 'create',
          icon: iconEl(FolderPlus),
          keywords: ['new', 'create', 'folder', 'directory'],
          onSelect: () => deps.onCreateFolder(),
        },
        {
          id: 'create:from-template-modal',
          label: 'New document from template…',
          subtitle: 'Choose from saved templates and starters',
          section: 'create',
          icon: iconEl(LayoutTemplate),
          keywords: ['new', 'create', 'template', 'starter', 'gallery'],
          onSelect: () => deps.onOpenNewTemplateModal(),
        },
        {
          id: 'create:ai-agent-modal',
          label: 'Build app with AI agent…',
          subtitle: 'Generate a new .mrbl document from a description',
          section: 'create',
          icon: iconEl(Sparkles),
          keywords: ['new', 'create', 'ai', 'agent', 'build', 'generate'],
          onSelect: () => deps.onOpenNewAiAgentModal(),
        },
      ]

      for (const tpl of starters) {
        if (tpl.category === 'whiteboard' && tpl.slug === 'whiteboard') {
          continue
        }
        items.push({
          id: `create:template:${tpl.id}`,
          label: `New from template: ${tpl.title}`,
          subtitle:
            tpl.description || `${getCategoryLabel(tpl.category)} starter`,
          section: 'create',
          icon: getCategoryIcon(tpl.category),
          badge: getCategoryLabel(tpl.category),
          keywords: [
            'new',
            'create',
            'template',
            'starter',
            tpl.category,
            getCategoryLabel(tpl.category),
            tpl.fileName,
            ...tpl.tags,
          ],
          onSelect: () => deps.onCreateFromTemplate(tpl),
        })
      }

      return items
    },
  }
}

export function createActionsSource(
  deps: WorkspaceCommandSourceDeps,
): CommandSource {
  return {
    id: 'builtin:actions',
    label: 'Actions',
    priority: 70,
    getItems: (query) => {
      const trimmed = normalizeQuery(query)
      const items: CommandItem[] = [
        {
          id: 'action:open-recent',
          label: 'Open Recent',
          subtitle: 'My Drive sorted by recently updated',
          section: 'actions',
          icon: iconEl(Clock),
          href: '/drive?sort=updated',
          keywords: ['recent', 'latest', 'updated', 'history', 'drive'],
          onSelect: () => deps.onOpenRecent(),
        },
        {
          id: 'action:open-starred',
          label: 'Open Starred',
          subtitle: 'View starred files and templates',
          section: 'actions',
          icon: iconEl(Star),
          href: navHref('starred'),
          keywords: ['starred', 'favorites', 'bookmarks'],
          onSelect: () => deps.onOpenNav('starred'),
        },
        {
          id: 'action:open-trash',
          label: 'Open Trash',
          subtitle:
            deps.trashedDocs.length > 0
              ? `${deps.trashedDocs.length} trashed · clears after ${deps.trashRetentionDays}d`
              : `Auto-clears after ${deps.trashRetentionDays} days`,
          section: 'actions',
          icon: iconEl(Trash2),
          href: navHref('trash'),
          keywords: ['trash', 'deleted', 'bin', 'restore'],
          onSelect: () => deps.onOpenNav('trash'),
        },
        {
          id: 'action:open-shared',
          label: 'Open Shared',
          subtitle: 'Shared links and collaborator permissions',
          section: 'actions',
          icon: iconEl(Users),
          href: navHref('shared'),
          keywords: ['shared', 'permissions', 'collaborators'],
          onSelect: () => deps.onOpenNav('shared'),
        },
        {
          id: 'action:open-templates',
          label: 'Open Templates',
          subtitle: 'Manage saved and premade .mrbl templates',
          section: 'actions',
          icon: iconEl(LayoutTemplate),
          href: navHref('templates'),
          keywords: ['templates', 'gallery', 'starters'],
          onSelect: () => deps.onOpenNav('templates'),
        },
        trimmed.length > 0
          ? {
              id: 'action:ai-prompt-prefill',
              label: `Ask AI: "${trimmed}"`,
              subtitle: 'Start a new Drive Chat prefilled with this prompt',
              section: 'actions',
              icon: iconEl(Sparkles),
              href: '/chat',
              shortcut: ['↵'],
              alwaysMatch: true,
              score: 12,
              keywords: ['ai', 'prompt', 'chat', 'ask'],
              onSelect: () => deps.onStartAiPrompt(trimmed),
            }
          : {
              id: 'action:ai-prompt',
              label: 'Start AI prompt',
              subtitle: 'Open a new Drive Chat thread',
              section: 'actions',
              icon: iconEl(Sparkles),
              href: '/chat',
              keywords: ['ai', 'prompt', 'chat', 'ask', 'assistant'],
              onSelect: () => deps.onStartAiPrompt(''),
            },
        {
          id: 'action:toggle-theme',
          label:
            deps.theme === 'dark'
              ? 'Switch to light theme'
              : 'Switch to dark theme',
          subtitle:
            deps.theme === 'dark'
              ? 'Alabaster Lab light mode'
              : 'Obsidian Studio dark mode',
          section: 'actions',
          icon: iconEl(deps.theme === 'dark' ? Sun : Moon),
          keywords: ['theme', 'toggle', 'dark', 'light', 'appearance', 'mode'],
          onSelect: () => deps.onToggleTheme(),
        },
        {
          id: 'action:toggle-ai-sidebar',
          label: deps.aiSidebarOpen ? 'Hide AI sidebar' : 'Open AI sidebar',
          subtitle: 'Toggle the right-hand collaborator panel',
          section: 'actions',
          icon: iconEl(PanelRight),
          keywords: ['ai', 'sidebar', 'collaborator', 'panel', 'toggle'],
          onSelect: () => deps.onToggleAiSidebar(),
        },
      ]

      if (
        deps.activeDoc &&
        !deps.isDocTemplate(deps.activeDoc) &&
        deps.onSaveCurrentAsTemplate
      ) {
        const currentDoc = deps.activeDoc
        const saveTemplate = deps.onSaveCurrentAsTemplate
        items.push({
          id: 'action:save-current-as-template',
          label: 'Save current file as template',
          subtitle: `Save a copy into ${TEMPLATES_FOLDER_NAME}`,
          section: 'actions',
          icon: iconEl(LayoutTemplate),
          keywords: ['save', 'template', currentDoc.title],
          onSelect: () => saveTemplate(currentDoc),
        })
      }

      return items
    },
  }
}

export function createBuiltinCommandSources(
  deps: WorkspaceCommandSourceDeps,
): CommandSource[] {
  return [
    createRecentSource(deps),
    createNavigationSource(deps),
    createCreateSource(deps),
    createActionsSource(deps),
  ]
}
