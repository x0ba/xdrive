import { serializeDocsToMarbleSource } from '#/components/apps/docs/serialization'
import { DEFAULT_DOCS_PAGE_SETUP } from '#/components/apps/docs/types'
import { byteSizeOf, countMarbleNodes } from '#/lib/marble/engine-client'
import { buildPublicDocShareUrl, slugifySegment } from '#/lib/routing'
import type { MarbleDocumentFile } from '#/lib/types'

function createBlankId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `doc-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
  }
  return `doc-${Math.random().toString(16).slice(2, 14)}`
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'YO'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export interface CreateBlankDocumentOptions {
  title?: string
  folderName?: string
  folderId?: string | null
  authorName?: string
}

/**
 * Create a truly empty rich `.mrbl` document without copying any starter or
 * template contents.
 */
export function createBlankDocumentFile(
  options: CreateBlankDocumentOptions = {},
): MarbleDocumentFile {
  const title = options.title?.trim() || 'Untitled document'
  const folderName = options.folderName?.trim() || 'My Drive'
  const folderId = options.folderId ?? null
  const authorName = options.authorName?.trim() || 'You'
  const author = { name: authorName, initials: initialsFromName(authorName) }
  const now = new Date().toISOString()
  const id = createBlankId()
  const slug = slugifySegment(title, 'untitled-document')

  const source = serializeDocsToMarbleSource({
    title,
    starred: false,
    folder: folderName,
    html: '',
    pageSetup: { ...DEFAULT_DOCS_PAGE_SETUP },
    comments: [],
  })

  return {
    id,
    slug,
    fileName: `${slug}.mrbl`,
    title,
    description: '',
    category: 'document',
    isTemplate: false,
    isEvergreen: false,
    source,
    nodeCount: countMarbleNodes(source),
    byteSize: byteSizeOf(source),
    version: 1,
    syncState: 'saved',
    createdAt: now,
    updatedAt: now,
    createdBy: author,
    lastEditedBy: author,
    starred: false,
    pinned: false,
    tags: [],
    folder: folderName,
    folderId,
    share: {
      isPublicLinkEnabled: false,
      publicLinkUrl: buildPublicDocShareUrl({ id, slug, title }),
      publicPermission: 'view_only',
      allowDuplication: true,
      sharedAiDailyLimit: 50,
      sharedAiUsedToday: 0,
      collaborators: [],
    },
    checkpoints: [],
    intentHistory: [],
  }
}
