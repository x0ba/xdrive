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

function withSyncState(
  doc: MarbleDocumentFile,
  syncState: MarbleDocumentFile['syncState'],
): MarbleDocumentFile {
  if (doc.syncState === syncState) return doc
  return { ...doc, syncState }
}

function folderForDiskPath(
  folders: readonly DriveFolder[],
  folderPath: string,
): DriveFolder | null {
  const parts = folderPath.split('/').filter((part) => part.length > 0)
  if (parts.length === 0) return null
  let parentId: string | null = null
  let match: DriveFolder | null = null
  for (const name of parts) {
    const next =
      folders.find(
        (folder) => folder.parentId === parentId && folder.name === name,
      ) ?? null
    if (!next) return null
    match = next
    parentId = next.id
  }
  return match
}

/**
 * Applies a server-confirmed trash reply. Trash membership changes only after
 * the server accepts it.
 */
export function applyServerTrashDocumentReply(input: {
  doc: MarbleDocumentFile
  trashedAt: string
  syncState?: MarbleDocumentFile['syncState']
}): MarbleDocumentFile {
  return withSyncState(
    { ...input.doc, trashedAt: input.trashedAt },
    input.syncState ?? 'saved',
  )
}

/**
 * Applies a server-confirmed restore reply. Clears `trashedAt` so the caller
 * can upsert the document and leave Trash after the server accepts the restore.
 */
export function applyServerRestoreDocumentReply(input: {
  doc: MarbleDocumentFile
  folders: readonly DriveFolder[]
  folderPath: string
  syncState?: MarbleDocumentFile['syncState']
}): MarbleDocumentFile {
  const matched =
    input.folderPath.length > 0
      ? folderForDiskPath(input.folders, input.folderPath)
      : null
  const folderId =
    input.folderPath.length === 0 ? null : (matched?.id ?? input.doc.folderId)
  const folder =
    input.folderPath.length === 0
      ? 'My Drive'
      : (matched?.name ?? input.doc.folder)
  const placed: MarbleDocumentFile = {
    ...input.doc,
    trashedAt: null,
    folderId,
    folder,
  }
  return withSyncState(
    {
      ...placed,
      isTemplate: deriveDocIsTemplate(
        placed,
        input.folders,
        getTemplateFolderIds(input.folders),
      ),
    },
    input.syncState ?? 'saved',
  )
}

/**
 * Merges freshly loaded server documents with in-flight client rename/move/save
 * mutations so workspace reloads preserve queued edits while adopting the
 * server's confirmed folder location and metadata.
 *
 * `ignorePendingRenameDocIds` drops a failed rename's held edits so that
 * document reverts to server source. Local documents whose first save is still
 * pending are kept even when the server has not seen them yet.
 *
 * In-flight trash, restore, and permanent-delete mutations keep the server's
 * trash membership (that is what is on disk at reload time) and stay `saving`
 * until the queued mutation's own success applies the confirmed change.
 */
export function mergeReloadedWorkspaceDocs(input: {
  reloadedDocs: readonly MarbleDocumentFile[]
  currentDocs: readonly MarbleDocumentFile[]
  pendingRenameDocIds: ReadonlySet<string>
  heldDocEdits: ReadonlyMap<string, readonly HeldDocEdit[]>
  pendingMoveDocIds?: ReadonlySet<string>
  pendingSaveDocIds?: ReadonlySet<string>
  pendingTrashDocIds?: ReadonlySet<string>
  pendingRestoreDocIds?: ReadonlySet<string>
  pendingPermanentDeleteDocIds?: ReadonlySet<string>
  ignorePendingRenameDocIds?: ReadonlySet<string>
}): MarbleDocumentFile[] {
  const mergedFromServer = input.reloadedDocs.map(
    (serverDoc): MarbleDocumentFile => {
      const ignoreRename =
        input.ignorePendingRenameDocIds?.has(serverDoc.id) ?? false
      const isRenamePending =
        !ignoreRename && input.pendingRenameDocIds.has(serverDoc.id)
      const isMovePending = input.pendingMoveDocIds?.has(serverDoc.id) ?? false
      const hasPendingSave = input.pendingSaveDocIds?.has(serverDoc.id) ?? false
      const hasPendingTrashMutation =
        (input.pendingTrashDocIds?.has(serverDoc.id) ?? false) ||
        (input.pendingRestoreDocIds?.has(serverDoc.id) ?? false) ||
        (input.pendingPermanentDeleteDocIds?.has(serverDoc.id) ?? false)
      if (!isRenamePending && !isMovePending && !hasPendingSave) {
        return hasPendingTrashMutation
          ? withSyncState(serverDoc, 'saving')
          : serverDoc
      }
      const held = isRenamePending
        ? input.heldDocEdits.get(serverDoc.id)
        : undefined
      const preserveLocalEdits =
        Boolean(held && held.length > 0) || hasPendingSave
      if (preserveLocalEdits) {
        const currentDoc = input.currentDocs.find(
          (item) => item.id === serverDoc.id,
        )
        if (currentDoc) {
          return withSyncState(
            {
              ...serverDoc,
              source: currentDoc.source,
              nodeCount: currentDoc.nodeCount,
              byteSize: currentDoc.byteSize,
              version: currentDoc.version,
              checkpoints: currentDoc.checkpoints,
              intentHistory: currentDoc.intentHistory,
              updatedAt: currentDoc.updatedAt,
              lastEditedBy: currentDoc.lastEditedBy,
            },
            'saving',
          )
        }
      }
      return withSyncState(serverDoc, 'saving')
    },
  )

  const serverIds = new Set(input.reloadedDocs.map((doc) => doc.id))
  const pendingFirstSaves = input.currentDocs.filter(
    (doc) =>
      !serverIds.has(doc.id) && (input.pendingSaveDocIds?.has(doc.id) ?? false),
  )
  if (pendingFirstSaves.length === 0) return mergedFromServer
  return [
    ...pendingFirstSaves.map((doc) => withSyncState(doc, 'saving')),
    ...mergedFromServer,
  ]
}
