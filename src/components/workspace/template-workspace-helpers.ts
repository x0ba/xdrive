import { getDescendantFolderIds } from '#/components/design-system'
import {
  TEMPLATES_FOLDER_ID,
  TEMPLATES_FOLDER_NAME,
  isTemplatesRootFolder,
} from '#/lib/marble'
import type {
  DriveFolder,
  DriveFolderColor,
  MarbleDocumentFile,
} from '#/lib/types'

export function getTemplateFolderIds(
  folders: readonly DriveFolder[],
): Set<string> {
  const templatesRoot = folders.find(isTemplatesRootFolder)
  if (!templatesRoot) return new Set<string>()
  return getDescendantFolderIds([...folders], templatesRoot.id)
}

export function deriveDocIsTemplate(
  doc: MarbleDocumentFile,
  folders: readonly DriveFolder[],
  templateFolderIds: ReadonlySet<string>,
): boolean {
  if (doc.folderId) {
    if (folders.some((folder) => folder.id === doc.folderId)) {
      return templateFolderIds.has(doc.folderId)
    }
  } else if (doc.folderId === null) {
    return false
  }

  const folderName = doc.folder.trim()
  if (
    folderName === TEMPLATES_FOLDER_NAME ||
    folderName.startsWith(`${TEMPLATES_FOLDER_NAME}/`)
  ) {
    return true
  }
  return Boolean(doc.isTemplate && !folderName)
}

export function reconcileFolderRename(
  folders: readonly DriveFolder[],
  docs: readonly MarbleDocumentFile[],
  input: {
    folderId: string
    name: string
    color: DriveFolderColor
    updatedAt: string
  },
): { folders: DriveFolder[]; docs: MarbleDocumentFile[] } {
  const nextFolders = folders.map((folder) =>
    folder.id === input.folderId
      ? {
          ...folder,
          name: input.name,
          color: input.color,
          updatedAt: input.updatedAt,
          isTemplatesFolder:
            folder.parentId === null && input.name === TEMPLATES_FOLDER_NAME,
        }
      : folder,
  )
  const nextTemplateFolderIds = getTemplateFolderIds(nextFolders)
  const nextDocs = docs.map((doc) => {
    const updatedFolder =
      doc.folderId === input.folderId ? { ...doc, folder: input.name } : doc
    if (updatedFolder.trashedAt) return updatedFolder
    const nextIsTemplate = deriveDocIsTemplate(
      updatedFolder,
      nextFolders,
      nextTemplateFolderIds,
    )
    if (updatedFolder.isTemplate === nextIsTemplate) return updatedFolder
    return {
      ...updatedFolder,
      isTemplate: nextIsTemplate,
    }
  })
  return { folders: nextFolders, docs: nextDocs }
}

export function mintClientFolderId(
  folders: readonly DriveFolder[],
  preferredId?: string,
  randomSuffix: () => string = () =>
    Math.random().toString(36).slice(2, 10) || 'x',
): string {
  const used = new Set(folders.map((folder) => folder.id))
  const candidate = preferredId?.trim()
  if (candidate && !used.has(candidate)) {
    return candidate
  }
  let minted = `folder-${randomSuffix()}`
  while (used.has(minted)) {
    minted = `folder-${randomSuffix()}`
  }
  return minted
}

export function ensureClientTemplatesFolder(
  folders: readonly DriveFolder[],
  now: string,
  randomSuffix?: () => string,
): { folder: DriveFolder; folders: DriveFolder[]; created: boolean } {
  const existing = folders.find(isTemplatesRootFolder)
  if (existing) {
    return { folder: existing, folders: [...folders], created: false }
  }
  const created: DriveFolder = {
    id: mintClientFolderId(folders, TEMPLATES_FOLDER_ID, randomSuffix),
    name: TEMPLATES_FOLDER_NAME,
    parentId: null,
    color: 'accent',
    isTemplatesFolder: true,
    createdAt: now,
    updatedAt: now,
  }
  return { folder: created, folders: [...folders, created], created: true }
}

export type DocSlugRemapStore = Map<string, Map<string, string>>

/**
 * Records that an optimistic or superseded slug for `docId` maps to the
 * server-canonical `canonicalSlug`, flattening any prior chained remaps so
 * follow-up queued mutations never target an outdated path.
 */
export function recordDocSlugRemap(
  store: DocSlugRemapStore,
  docId: string,
  optimisticSlug: string,
  canonicalSlug: string,
): void {
  if (!docId || !optimisticSlug || !canonicalSlug) return
  if (optimisticSlug === canonicalSlug) return
  let byDoc = store.get(docId)
  if (!byDoc) {
    byDoc = new Map<string, string>()
    store.set(docId, byDoc)
  }
  for (const [key, target] of byDoc.entries()) {
    if (target === optimisticSlug) {
      byDoc.set(key, canonicalSlug)
    }
  }
  byDoc.set(optimisticSlug, canonicalSlug)
}

/**
 * Resolves `slug` to the newest server-canonical slug known for `docId`.
 */
export function resolveCanonicalDocSlug(
  store: DocSlugRemapStore,
  docId: string,
  slug: string,
): string {
  const byDoc = store.get(docId)
  if (!byDoc || byDoc.size === 0) return slug
  let current = slug
  const visited = new Set<string>()
  while (byDoc.has(current) && !visited.has(current)) {
    visited.add(current)
    const next = byDoc.get(current)
    if (!next) break
    current = next
  }
  return current
}

/**
 * Rewrites `meta.slug` (and a matching default `share.publicLinkUrl`) when a
 * queued mutation was captured before an earlier server slug deduplication.
 */
export function remapSerializedDocMetaSlug<T extends Record<string, unknown>>(
  meta: T,
  previousSlug: string,
  canonicalSlug: string,
): T {
  if (!canonicalSlug || canonicalSlug === previousSlug) {
    return meta
  }
  const share = meta.share
  if (share && typeof share === 'object' && !Array.isArray(share)) {
    const shareObj = share as Record<string, unknown>
    const defaultPrevUrl = `https://xdrive.app/d/${previousSlug}`
    if (shareObj.publicLinkUrl === defaultPrevUrl) {
      return {
        ...meta,
        slug: canonicalSlug,
        share: {
          ...shareObj,
          publicLinkUrl: `https://xdrive.app/d/${canonicalSlug}`,
        },
      }
    }
  }
  return {
    ...meta,
    slug: canonicalSlug,
  }
}

function shareWithReconciledSlug(
  doc: MarbleDocumentFile,
  previousSlugs: readonly string[],
  nextSlug: string,
): MarbleDocumentFile['share'] {
  const currentUrl = doc.share.publicLinkUrl
  const matchesPrevious = previousSlugs.some(
    (slug) => slug && currentUrl === `https://xdrive.app/d/${slug}`,
  )
  if (!matchesPrevious) return doc.share
  return {
    ...doc.share,
    publicLinkUrl: `https://xdrive.app/d/${nextSlug}`,
  }
}

export interface RenameReplyServerPayload {
  slug: string
  fileName?: unknown
  source?: unknown
  isTemplate?: unknown
  updatedAt?: unknown
}

export function mergeRenameDocumentReply(input: {
  currentDoc: MarbleDocumentFile
  currentLiveSource: string | undefined
  optimisticSource: string
  expectedVersion: number
  saveTokenAtRename: number
  currentSaveToken: number
  renameToken: number
  currentRenameToken: number
  serverReply: RenameReplyServerPayload
  folders: readonly DriveFolder[]
  countNodes: (source: string) => number
  byteSize: (source: string) => number
}): {
  doc: MarbleDocumentFile
  shouldUpdateSourceRef: boolean
  nextSourceRefValue?: string
} | null {
  if (input.currentRenameToken !== input.renameToken) {
    return null
  }

  const serverSlug = input.serverReply.slug
  const serverFileName =
    typeof input.serverReply.fileName === 'string'
      ? input.serverReply.fileName
      : `${serverSlug}.mrbl`
  const nextShare = shareWithReconciledSlug(
    input.currentDoc,
    [input.currentDoc.slug],
    serverSlug,
  )

  const preserveLocalSource =
    input.currentSaveToken !== input.saveTokenAtRename ||
    input.currentDoc.version !== input.expectedVersion ||
    input.currentDoc.source !== input.optimisticSource ||
    (input.currentLiveSource !== undefined &&
      input.currentLiveSource !== input.optimisticSource)

  const hasKnownFolder =
    input.currentDoc.folderId === null ||
    Boolean(
      input.currentDoc.folderId &&
      input.folders.some((folder) => folder.id === input.currentDoc.folderId),
    )

  const nextIsTemplate = hasKnownFolder
    ? deriveDocIsTemplate(
        input.currentDoc,
        input.folders,
        getTemplateFolderIds(input.folders),
      )
    : typeof input.serverReply.isTemplate === 'boolean'
      ? input.serverReply.isTemplate
      : input.currentDoc.isTemplate

  if (preserveLocalSource) {
    return {
      doc: {
        ...input.currentDoc,
        slug: serverSlug,
        fileName: serverFileName,
        isTemplate: nextIsTemplate,
        share: nextShare,
      },
      shouldUpdateSourceRef: false,
    }
  }

  const serverSource =
    typeof input.serverReply.source === 'string'
      ? input.serverReply.source
      : input.optimisticSource
  return {
    doc: {
      ...input.currentDoc,
      slug: serverSlug,
      fileName: serverFileName,
      source: serverSource,
      nodeCount: input.countNodes(serverSource),
      byteSize: input.byteSize(serverSource),
      isTemplate: nextIsTemplate,
      share: nextShare,
      updatedAt:
        typeof input.serverReply.updatedAt === 'string'
          ? input.serverReply.updatedAt
          : input.currentDoc.updatedAt,
    },
    shouldUpdateSourceRef: true,
    nextSourceRefValue: serverSource,
  }
}

/**
 * Merges a `save_as_template` folder reply against the current folder tree so
 * concurrent local folder renames or deletions are never overwritten by an
 * earlier server response.
 */
export function mergeSaveAsTemplateFolderReply(input: {
  folders: readonly DriveFolder[]
  docs: readonly MarbleDocumentFile[]
  optimisticFolderId: string
  folderTokenAtCreate: number
  currentFolderToken: number
  wasDeletedLocally: boolean
  serverFolder: DriveFolder
}): {
  folders: DriveFolder[]
  docs: MarbleDocumentFile[]
  resolvedFolderId: string | null
  didRemapFolderId: boolean
} {
  const targetFolder = input.folders.find(
    (folder) => folder.id === input.optimisticFolderId,
  )

  if (!targetFolder) {
    if (
      input.wasDeletedLocally ||
      input.currentFolderToken !== input.folderTokenAtCreate
    ) {
      return {
        folders: [...input.folders],
        docs: [...input.docs],
        resolvedFolderId: null,
        didRemapFolderId: false,
      }
    }
    const existingRoot =
      input.folders.find((folder) => folder.id === input.serverFolder.id) ??
      input.folders.find(isTemplatesRootFolder)
    if (existingRoot) {
      return {
        folders: [...input.folders],
        docs: [...input.docs],
        resolvedFolderId: existingRoot.id,
        didRemapFolderId: false,
      }
    }
    const adopted: DriveFolder = {
      ...input.serverFolder,
      isTemplatesFolder: true,
    }
    return {
      folders: [...input.folders, adopted],
      docs: [...input.docs],
      resolvedFolderId: adopted.id,
      didRemapFolderId: false,
    }
  }

  const serverIdTakenByOther =
    input.serverFolder.id !== input.optimisticFolderId &&
    input.folders.some(
      (folder) =>
        folder.id === input.serverFolder.id &&
        folder.id !== input.optimisticFolderId,
    )
  const resolvedFolderId = serverIdTakenByOther
    ? input.optimisticFolderId
    : input.serverFolder.id
  const didRemapFolderId = resolvedFolderId !== input.optimisticFolderId

  const hasLocalFolderChanges =
    input.currentFolderToken !== input.folderTokenAtCreate ||
    targetFolder.name !== TEMPLATES_FOLDER_NAME ||
    targetFolder.isTemplatesFolder !== true ||
    targetFolder.parentId !== null

  const mergedFolder: DriveFolder = hasLocalFolderChanges
    ? {
        ...targetFolder,
        id: resolvedFolderId,
      }
    : {
        ...input.serverFolder,
        id: resolvedFolderId,
        isTemplatesFolder: true,
      }

  const nextFolders = input.folders.map((folder) => {
    if (folder.id === input.optimisticFolderId) {
      return mergedFolder
    }
    if (didRemapFolderId && folder.parentId === input.optimisticFolderId) {
      return {
        ...folder,
        parentId: resolvedFolderId,
      }
    }
    return folder
  })

  const nextTemplateFolderIds = getTemplateFolderIds(nextFolders)
  const nextDocs = input.docs.map((doc) => {
    const folderChanged =
      didRemapFolderId && doc.folderId === input.optimisticFolderId
    const remappedDoc = folderChanged
      ? {
          ...doc,
          folderId: resolvedFolderId,
          folder: mergedFolder.name,
        }
      : doc
    if (remappedDoc.trashedAt) return remappedDoc
    if (!folderChanged && remappedDoc.folderId !== resolvedFolderId) {
      return remappedDoc
    }
    const nextIsTemplate = deriveDocIsTemplate(
      remappedDoc,
      nextFolders,
      nextTemplateFolderIds,
    )
    if (remappedDoc.isTemplate === nextIsTemplate) return remappedDoc
    return {
      ...remappedDoc,
      isTemplate: nextIsTemplate,
    }
  })

  return {
    folders: nextFolders,
    docs: nextDocs,
    resolvedFolderId,
    didRemapFolderId,
  }
}

/**
 * Merges a `save_as_template` document reply against the live workspace state
 * so server slug deduplication updates the doc's canonical path while newer
 * local edits, moves, renames, flags, and trash state are preserved.
 */
export function mergeSaveAsTemplateDocReply(input: {
  currentDoc: MarbleDocumentFile
  currentLiveSource: string | undefined
  optimisticSlug: string
  optimisticSource: string
  optimisticFolderId: string
  resolvedFolderId: string | null
  expectedVersion: number
  saveTokenAtCreate: number
  currentSaveToken: number
  renameTokenAtCreate: number
  currentRenameToken: number
  serverDoc: MarbleDocumentFile
  folders: readonly DriveFolder[]
  countNodes: (source: string) => number
  byteSize: (source: string) => number
}): {
  doc: MarbleDocumentFile
  shouldUpdateSourceRef: boolean
  nextSourceRefValue?: string
} {
  const hasNewerRename = input.currentRenameToken !== input.renameTokenAtCreate
  const preserveLocalSource =
    hasNewerRename ||
    input.currentSaveToken !== input.saveTokenAtCreate ||
    input.currentDoc.version !== input.expectedVersion ||
    input.currentDoc.source !== input.optimisticSource ||
    (input.currentLiveSource !== undefined &&
      input.currentLiveSource !== input.optimisticSource)

  const shouldRemapFolder =
    input.currentDoc.folderId === input.optimisticFolderId &&
    input.resolvedFolderId !== null
  const nextFolderId = shouldRemapFolder
    ? input.resolvedFolderId
    : input.currentDoc.folderId
  const liveFolder = nextFolderId
    ? input.folders.find((folder) => folder.id === nextFolderId)
    : undefined
  const nextFolderName = liveFolder ? liveFolder.name : input.currentDoc.folder

  const docWithFolder: MarbleDocumentFile = {
    ...input.currentDoc,
    folderId: nextFolderId,
    folder: nextFolderName,
  }
  const hasKnownFolder =
    nextFolderId === null || Boolean(nextFolderId && liveFolder !== undefined)
  const nextIsTemplate = docWithFolder.trashedAt
    ? docWithFolder.isTemplate
    : hasKnownFolder
      ? deriveDocIsTemplate(
          docWithFolder,
          input.folders,
          getTemplateFolderIds(input.folders),
        )
      : input.currentDoc.isTemplate

  const serverFileName =
    input.serverDoc.fileName || `${input.serverDoc.slug}.mrbl`
  const nextSlug = hasNewerRename ? input.currentDoc.slug : input.serverDoc.slug
  const nextFileName = hasNewerRename
    ? input.currentDoc.fileName
    : serverFileName
  const nextShare = hasNewerRename
    ? input.currentDoc.share
    : shareWithReconciledSlug(
        input.currentDoc,
        [input.optimisticSlug, input.currentDoc.slug],
        nextSlug,
      )

  if (preserveLocalSource) {
    return {
      doc: {
        ...docWithFolder,
        slug: nextSlug,
        fileName: nextFileName,
        isTemplate: nextIsTemplate,
        share: nextShare,
      },
      shouldUpdateSourceRef: false,
    }
  }

  const serverSource = input.serverDoc.source
  return {
    doc: {
      ...docWithFolder,
      slug: nextSlug,
      fileName: nextFileName,
      isTemplate: nextIsTemplate,
      share: nextShare,
      source: serverSource,
      nodeCount: input.countNodes(serverSource),
      byteSize: input.byteSize(serverSource),
      updatedAt: input.serverDoc.updatedAt || input.currentDoc.updatedAt,
    },
    shouldUpdateSourceRef: true,
    nextSourceRefValue: serverSource,
  }
}

/**
 * Reconciles a `rename_folder` server reply when no newer local folder
 * mutation supersedes it and the server minted a different canonical folder ID.
 */
export function mergeRenameFolderReply(input: {
  folders: readonly DriveFolder[]
  docs: readonly MarbleDocumentFile[]
  folderId: string
  renameToken: number
  currentFolderToken: number
  serverFolder: DriveFolder
}): {
  folders: DriveFolder[]
  docs: MarbleDocumentFile[]
  resolvedFolderId: string
} | null {
  if (input.currentFolderToken !== input.renameToken) {
    return null
  }
  const target = input.folders.find((folder) => folder.id === input.folderId)
  if (!target) {
    return null
  }
  const canonicalId = input.serverFolder.id
  if (
    !canonicalId ||
    canonicalId === input.folderId ||
    input.folders.some(
      (folder) => folder.id === canonicalId && folder.id !== input.folderId,
    )
  ) {
    return null
  }

  const nextFolders = input.folders.map((folder) => {
    if (folder.id === input.folderId) {
      return {
        ...folder,
        id: canonicalId,
      }
    }
    if (folder.parentId === input.folderId) {
      return {
        ...folder,
        parentId: canonicalId,
      }
    }
    return folder
  })

  const nextTemplateFolderIds = getTemplateFolderIds(nextFolders)
  const nextDocs = input.docs.map((doc) => {
    if (doc.folderId !== input.folderId) return doc
    const updated = {
      ...doc,
      folderId: canonicalId,
      folder: target.name,
    }
    if (updated.trashedAt) return updated
    return {
      ...updated,
      isTemplate: deriveDocIsTemplate(
        updated,
        nextFolders,
        nextTemplateFolderIds,
      ),
    }
  })

  return {
    folders: nextFolders,
    docs: nextDocs,
    resolvedFolderId: canonicalId,
  }
}
