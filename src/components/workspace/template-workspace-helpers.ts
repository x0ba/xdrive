import { getDescendantFolderIds } from '#/components/design-system'
import {
  TEMPLATES_FOLDER_ID,
  TEMPLATES_FOLDER_NAME,
  isTemplatesRootFolder,
  updateMarbleSourceTitle,
} from '#/lib/marble'
import type {
  DriveFolder,
  DriveFolderColor,
  MarbleCheckpoint,
  MarbleDocumentFile,
  MarbleOp,
  MarbleOpProposal,
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
    nextFolderId?: string
    name: string
    color: DriveFolderColor
    updatedAt: string
  },
): {
  folders: DriveFolder[]
  docs: MarbleDocumentFile[]
  resolvedFolderId: string
} {
  const candidateId = input.nextFolderId?.trim()
  const resolvedFolderId =
    candidateId &&
    candidateId !== input.folderId &&
    !folders.some(
      (folder) => folder.id === candidateId && folder.id !== input.folderId,
    )
      ? candidateId
      : input.folderId
  const didRemapId = resolvedFolderId !== input.folderId

  const nextFolders = folders.map((folder) => {
    if (folder.id === input.folderId) {
      return {
        ...folder,
        id: resolvedFolderId,
        name: input.name,
        color: input.color,
        updatedAt: input.updatedAt,
        isTemplatesFolder:
          folder.parentId === null && input.name === TEMPLATES_FOLDER_NAME,
      }
    }
    if (didRemapId && folder.parentId === input.folderId) {
      return {
        ...folder,
        parentId: resolvedFolderId,
      }
    }
    return folder
  })
  const nextTemplateFolderIds = getTemplateFolderIds(nextFolders)
  const nextDocs = docs.map((doc) => {
    const updatedFolder =
      doc.folderId === input.folderId
        ? { ...doc, folderId: resolvedFolderId, folder: input.name }
        : doc
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
  return { folders: nextFolders, docs: nextDocs, resolvedFolderId }
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

export interface HeldDocEdit {
  ops: MarbleOp[]
  nextSource: string
  checkpoint?: MarbleCheckpoint
  lastEditedBy: MarbleDocumentFile['lastEditedBy']
  updatedAt: string
  intentHistory?: MarbleOpProposal[]
}

/**
 * Applies a server-confirmed `save_as_template` response directly to the
 * workspace folder and document lists, deriving live template membership.
 */
export function applyServerSaveAsTemplateReply(
  folders: readonly DriveFolder[],
  docs: readonly MarbleDocumentFile[],
  reply: {
    folder?: DriveFolder
    doc?: MarbleDocumentFile
  },
): {
  folders: DriveFolder[]
  docs: MarbleDocumentFile[]
  doc: MarbleDocumentFile | null
} {
  let nextFolders = [...folders]
  let replacedRootId: string | null = null

  if (reply.folder) {
    const serverFolder: DriveFolder = {
      ...reply.folder,
      isTemplatesFolder:
        reply.folder.parentId === null &&
        reply.folder.name === TEMPLATES_FOLDER_NAME,
    }
    const byIdIndex = nextFolders.findIndex((f) => f.id === serverFolder.id)
    if (byIdIndex >= 0) {
      nextFolders = nextFolders.map((f, index) =>
        index === byIdIndex ? serverFolder : f,
      )
    } else if (isTemplatesRootFolder(serverFolder)) {
      const existingRoot = nextFolders.find(isTemplatesRootFolder)
      if (existingRoot) {
        replacedRootId = existingRoot.id
        nextFolders = nextFolders.map((f) => {
          if (f.id === existingRoot.id) return serverFolder
          if (f.parentId === existingRoot.id) {
            return { ...f, parentId: serverFolder.id }
          }
          return f
        })
      } else {
        nextFolders = [...nextFolders, serverFolder]
      }
    } else {
      nextFolders = [...nextFolders, serverFolder]
    }
  }

  let nextDocs = [...docs]
  if (reply.folder && replacedRootId && replacedRootId !== reply.folder.id) {
    const confirmedFolder = reply.folder
    nextDocs = nextDocs.map((doc) =>
      doc.folderId === replacedRootId
        ? { ...doc, folderId: confirmedFolder.id, folder: confirmedFolder.name }
        : doc,
    )
  }

  const templateFolderIds = getTemplateFolderIds(nextFolders)
  if (!reply.doc) {
    return { folders: nextFolders, docs: nextDocs, doc: null }
  }

  const liveFolder = reply.doc.folderId
    ? nextFolders.find((folder) => folder.id === reply.doc?.folderId)
    : undefined
  const docWithLiveFolder: MarbleDocumentFile = {
    ...reply.doc,
    folder: liveFolder ? liveFolder.name : reply.doc.folder,
  }
  const normalizedDoc: MarbleDocumentFile = docWithLiveFolder.trashedAt
    ? docWithLiveFolder
    : {
        ...docWithLiveFolder,
        isTemplate: deriveDocIsTemplate(
          docWithLiveFolder,
          nextFolders,
          templateFolderIds,
        ),
      }

  const existingIndex = nextDocs.findIndex((doc) => doc.id === normalizedDoc.id)
  if (existingIndex >= 0) {
    nextDocs = nextDocs.map((doc, index) =>
      index === existingIndex ? normalizedDoc : doc,
    )
  } else {
    nextDocs = [normalizedDoc, ...nextDocs]
  }

  return { folders: nextFolders, docs: nextDocs, doc: normalizedDoc }
}

/**
 * Applies a server-confirmed `rename_document` reply as the canonical state for
 * `currentDoc`, deriving `isTemplate` from the live folder tree and updating
 * default public share links to the confirmed slug.
 */
export function applyServerRenameDocumentReply(input: {
  currentDoc: MarbleDocumentFile
  serverReply: {
    slug: string
    fileName?: unknown
    title?: unknown
    description?: unknown
    source?: unknown
    updatedAt?: unknown
  }
  fallbackTitle: string
  fallbackDescription: string
  folders: readonly DriveFolder[]
  countNodes: (source: string) => number
  byteSize: (source: string) => number
}): MarbleDocumentFile {
  const serverSlug = input.serverReply.slug
  const serverFileName =
    typeof input.serverReply.fileName === 'string'
      ? input.serverReply.fileName
      : `${serverSlug}.mrbl`
  const nextTitle =
    typeof input.serverReply.title === 'string' &&
    input.serverReply.title.trim()
      ? input.serverReply.title.trim()
      : input.fallbackTitle
  const nextDescription =
    typeof input.serverReply.description === 'string'
      ? input.serverReply.description
      : input.fallbackDescription
  const nextSource =
    typeof input.serverReply.source === 'string'
      ? input.serverReply.source
      : updateMarbleSourceTitle(input.currentDoc.source, nextTitle)

  const liveFolder = input.currentDoc.folderId
    ? input.folders.find((folder) => folder.id === input.currentDoc.folderId)
    : undefined
  const nextFolderName = liveFolder ? liveFolder.name : input.currentDoc.folder
  const docWithFolder: MarbleDocumentFile = {
    ...input.currentDoc,
    folder: nextFolderName,
  }
  const hasKnownFolder =
    input.currentDoc.folderId === null || liveFolder !== undefined
  const nextIsTemplate = input.currentDoc.trashedAt
    ? input.currentDoc.isTemplate
    : hasKnownFolder
      ? deriveDocIsTemplate(
          docWithFolder,
          input.folders,
          getTemplateFolderIds(input.folders),
        )
      : input.currentDoc.isTemplate

  const nextShare =
    input.currentDoc.share.publicLinkUrl ===
    `https://xdrive.app/d/${input.currentDoc.slug}`
      ? {
          ...input.currentDoc.share,
          publicLinkUrl: `https://xdrive.app/d/${serverSlug}`,
        }
      : input.currentDoc.share

  return {
    ...docWithFolder,
    slug: serverSlug,
    fileName: serverFileName,
    title: nextTitle,
    description: nextDescription,
    source: nextSource,
    nodeCount: input.countNodes(nextSource),
    byteSize: input.byteSize(nextSource),
    version: input.currentDoc.version + 1,
    syncState: 'saved',
    isTemplate: nextIsTemplate,
    share: nextShare,
    updatedAt:
      typeof input.serverReply.updatedAt === 'string'
        ? input.serverReply.updatedAt
        : input.currentDoc.updatedAt,
  }
}

/**
 * Replays edits captured while a rename request was pending against the
 * server-confirmed document source.
 */
export function replayHeldDocEdits(
  baseSource: string,
  title: string,
  heldEdits: readonly HeldDocEdit[],
  applyOps: (source: string, ops: MarbleOp[]) => { source: string },
  retitle: (source: string, title: string) => string = updateMarbleSourceTitle,
): { source: string; ops: MarbleOp[] } {
  let current = baseSource
  const ops: MarbleOp[] = []
  let hasSnapshotReset = false

  for (const edit of heldEdits) {
    if (edit.ops.length > 0) {
      try {
        current = applyOps(current, edit.ops).source
        if (!hasSnapshotReset) {
          ops.push(...edit.ops)
        }
        continue
      } catch {
        // Fall back to full source snapshot when prior ops no longer apply cleanly.
      }
    }
    current = retitle(edit.nextSource, title)
    ops.length = 0
    hasSnapshotReset = true
  }

  return { source: current, ops }
}

/**
 * Merges freshly loaded server documents with in-flight client rename/move
 * mutations so unrelated workspace reloads never erase held edits or clear
 * saving indicators for queued mutations.
 */
export function mergeReloadedWorkspaceDocs(input: {
  reloadedDocs: readonly MarbleDocumentFile[]
  currentDocs: readonly MarbleDocumentFile[]
  pendingRenameDocIds: ReadonlySet<string>
  heldDocEdits: ReadonlyMap<string, readonly HeldDocEdit[]>
  pendingMoveDocIds?: ReadonlySet<string>
}): MarbleDocumentFile[] {
  return input.reloadedDocs.map((serverDoc) => {
    const isRenamePending = input.pendingRenameDocIds.has(serverDoc.id)
    const isMovePending = input.pendingMoveDocIds?.has(serverDoc.id) ?? false
    if (!isRenamePending && !isMovePending) {
      return serverDoc
    }
    if (!isRenamePending) {
      return { ...serverDoc, syncState: 'saving' }
    }
    const held = input.heldDocEdits.get(serverDoc.id)
    const currentDoc = input.currentDocs.find(
      (item) => item.id === serverDoc.id,
    )
    if (held && held.length > 0 && currentDoc) {
      return {
        ...serverDoc,
        source: currentDoc.source,
        nodeCount: currentDoc.nodeCount,
        byteSize: currentDoc.byteSize,
        version: currentDoc.version,
        checkpoints: currentDoc.checkpoints,
        intentHistory: currentDoc.intentHistory,
        updatedAt: currentDoc.updatedAt,
        lastEditedBy: currentDoc.lastEditedBy,
        syncState: 'saving',
      }
    }
    return { ...serverDoc, syncState: 'saving' }
  })
}
