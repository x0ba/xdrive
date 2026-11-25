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
      updatedAt:
        typeof input.serverReply.updatedAt === 'string'
          ? input.serverReply.updatedAt
          : input.currentDoc.updatedAt,
    },
    shouldUpdateSourceRef: true,
    nextSourceRefValue: serverSource,
  }
}
