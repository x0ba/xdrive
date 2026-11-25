import { describe, expect, it } from 'vitest'

import {
  TEMPLATES_FOLDER_ID,
  TEMPLATES_FOLDER_NAME,
  byteSizeOf,
  countMarbleNodes,
  isTemplatesRootFolder,
} from '#/lib/marble'
import type { DriveFolder, MarbleDocumentFile } from '#/lib/types'
import {
  deriveDocIsTemplate,
  ensureClientTemplatesFolder,
  mergeRenameDocumentReply,
  mintClientFolderId,
  reconcileFolderRename,
} from './template-workspace-helpers'

const NOW = '2026-11-25T23:00:00.000Z'

function makeFolder(
  overrides: Partial<DriveFolder> & Pick<DriveFolder, 'id' | 'name'>,
): DriveFolder {
  return {
    parentId: null,
    color: 'default',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function makeDoc(
  overrides: Partial<MarbleDocumentFile> & Pick<MarbleDocumentFile, 'id'>,
): MarbleDocumentFile {
  const source =
    overrides.source ??
    '<!doctype html><html><head><title>Doc</title></head><body><h1 data-marble-id="h1">Body</h1></body></html>'
  return {
    slug: overrides.slug ?? 'doc',
    fileName: overrides.fileName ?? `${overrides.slug ?? 'doc'}.mrbl`,
    title: overrides.title ?? 'Doc',
    description: '',
    category: 'document',
    isTemplate: false,
    source,
    nodeCount: countMarbleNodes(source),
    byteSize: byteSizeOf(source),
    version: 1,
    syncState: 'saved',
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: { name: 'You', initials: 'YO' },
    lastEditedBy: { name: 'You', initials: 'YO' },
    starred: false,
    pinned: false,
    tags: [],
    folder: 'My Drive',
    folderId: null,
    trashedAt: null,
    share: {
      isPublicLinkEnabled: false,
      publicLinkUrl: 'https://xdrive.app/d/doc',
      publicPermission: 'view_only',
      allowDuplication: true,
      sharedAiDailyLimit: 40,
      sharedAiUsedToday: 0,
      collaborators: [],
    },
    checkpoints: [],
    intentHistory: [],
    ...overrides,
  }
}

describe('template-workspace-helpers', () => {
  it('mints an unused folder ID when recreating Templates after renaming the original', () => {
    const renamedOriginal = makeFolder({
      id: TEMPLATES_FOLDER_ID,
      name: 'Archived Templates',
      color: 'accent',
      isTemplatesFolder: false,
    })

    expect(isTemplatesRootFolder(renamedOriginal)).toBe(false)
    expect(
      mintClientFolderId(
        [renamedOriginal],
        TEMPLATES_FOLDER_ID,
        () => 'fresh1',
      ),
    ).toBe('folder-fresh1')

    const ensured = ensureClientTemplatesFolder(
      [renamedOriginal],
      NOW,
      () => 'fresh2',
    )
    expect(ensured.created).toBe(true)
    expect(ensured.folder.id).toBe('folder-fresh2')
    expect(ensured.folder.id).not.toBe(TEMPLATES_FOLDER_ID)
    expect(ensured.folder.name).toBe(TEMPLATES_FOLDER_NAME)
    expect(ensured.folder.isTemplatesFolder).toBe(true)
    expect(isTemplatesRootFolder(ensured.folder)).toBe(true)
  })

  it('reconciles folder renames immediately across direct docs, nested subfolders, and nested folders named Templates', () => {
    const templatesRoot = makeFolder({
      id: TEMPLATES_FOLDER_ID,
      name: TEMPLATES_FOLDER_NAME,
      isTemplatesFolder: true,
    })
    const nestedTemplatesSub = makeFolder({
      id: 'folder-sub',
      name: 'Papers',
      parentId: TEMPLATES_FOLDER_ID,
    })
    const nestedNamedTemplates = makeFolder({
      id: 'folder-nested-templates',
      name: TEMPLATES_FOLDER_NAME,
      parentId: 'folder-other',
      isTemplatesFolder: false,
    })
    const otherFolder = makeFolder({
      id: 'folder-other',
      name: 'Projects',
    })

    const directTpl = makeDoc({
      id: 'tpl-direct',
      folder: TEMPLATES_FOLDER_NAME,
      folderId: TEMPLATES_FOLDER_ID,
      isTemplate: true,
    })
    const nestedTpl = makeDoc({
      id: 'tpl-nested',
      folder: 'Papers',
      folderId: 'folder-sub',
      isTemplate: true,
    })
    const staleRootDoc = makeDoc({
      id: 'doc-stale',
      folder: 'My Drive',
      folderId: null,
      isTemplate: true,
    })
    const nestedSameNameDoc = makeDoc({
      id: 'doc-nested-same-name',
      folder: TEMPLATES_FOLDER_NAME,
      folderId: 'folder-nested-templates',
      isTemplate: false,
    })

    const initialFolders = [
      templatesRoot,
      nestedTemplatesSub,
      otherFolder,
      nestedNamedTemplates,
    ]
    const initialDocs = [directTpl, nestedTpl, staleRootDoc, nestedSameNameDoc]

    expect(
      deriveDocIsTemplate(
        staleRootDoc,
        initialFolders,
        new Set([TEMPLATES_FOLDER_ID, 'folder-sub']),
      ),
    ).toBe(false)
    expect(
      deriveDocIsTemplate(
        nestedSameNameDoc,
        initialFolders,
        new Set([TEMPLATES_FOLDER_ID, 'folder-sub']),
      ),
    ).toBe(false)

    // Rename Templates -> Archived Templates
    const afterRenameOut = reconcileFolderRename(initialFolders, initialDocs, {
      folderId: TEMPLATES_FOLDER_ID,
      name: 'Archived Templates',
      color: 'accent',
      updatedAt: NOW,
    })

    expect(
      afterRenameOut.folders.find((f) => f.id === TEMPLATES_FOLDER_ID)
        ?.isTemplatesFolder,
    ).toBe(false)
    expect(
      afterRenameOut.docs.find((d) => d.id === 'tpl-direct')?.isTemplate,
    ).toBe(false)
    expect(afterRenameOut.docs.find((d) => d.id === 'tpl-direct')?.folder).toBe(
      'Archived Templates',
    )
    expect(
      afterRenameOut.docs.find((d) => d.id === 'tpl-nested')?.isTemplate,
    ).toBe(false)

    // Renaming back to Templates at root restores template membership for direct + subfolder docs
    const afterRenameBack = reconcileFolderRename(
      afterRenameOut.folders,
      afterRenameOut.docs,
      {
        folderId: TEMPLATES_FOLDER_ID,
        name: TEMPLATES_FOLDER_NAME,
        color: 'accent',
        updatedAt: NOW,
      },
    )

    expect(
      afterRenameBack.folders.find((f) => f.id === TEMPLATES_FOLDER_ID)
        ?.isTemplatesFolder,
    ).toBe(true)
    expect(
      afterRenameBack.docs.find((d) => d.id === 'tpl-direct')?.isTemplate,
    ).toBe(true)
    expect(
      afterRenameBack.docs.find((d) => d.id === 'tpl-nested')?.isTemplate,
    ).toBe(true)
    expect(
      afterRenameBack.docs.find((d) => d.id === 'doc-nested-same-name')
        ?.isTemplate,
    ).toBe(false)
  })

  it('preserves newer local source edits when an in-flight rename reply arrives', () => {
    const optimisticSource =
      '<!doctype html><html><head><title>New Name</title></head><body><h1 data-marble-id="h1">Original Body</h1></body></html>'
    const newerLocalSource =
      '<!doctype html><html><head><title>New Name</title></head><body><h1 data-marble-id="h1">Edited While Saving</h1></body></html>'
    const folders = [
      makeFolder({
        id: TEMPLATES_FOLDER_ID,
        name: 'Renamed Folder',
        isTemplatesFolder: false,
      }),
    ]

    // Case 1: newer local edit arrived while rename request was in flight
    const editedDoc = makeDoc({
      id: 'doc-1',
      slug: 'new-name',
      title: 'New Name',
      source: newerLocalSource,
      version: 3,
      folderId: TEMPLATES_FOLDER_ID,
      folder: 'Renamed Folder',
      isTemplate: false,
    })
    const preserved = mergeRenameDocumentReply({
      currentDoc: editedDoc,
      currentLiveSource: newerLocalSource,
      optimisticSource,
      expectedVersion: 2,
      saveTokenAtRename: 1,
      currentSaveToken: 2,
      renameToken: 1,
      currentRenameToken: 1,
      serverReply: {
        slug: 'new-name-2',
        fileName: 'new-name-2.mrbl',
        source: optimisticSource,
        isTemplate: true,
        updatedAt: '2026-11-25T23:05:00.000Z',
      },
      folders,
      countNodes: countMarbleNodes,
      byteSize: byteSizeOf,
    })

    expect(preserved).not.toBeNull()
    expect(preserved?.shouldUpdateSourceRef).toBe(false)
    expect(preserved?.doc.source).toBe(newerLocalSource)
    expect(preserved?.doc.version).toBe(3)
    expect(preserved?.doc.slug).toBe('new-name-2')
    expect(preserved?.doc.fileName).toBe('new-name-2.mrbl')
    expect(preserved?.doc.isTemplate).toBe(false)

    // Case 2: no concurrent edits -> applies server canonical source
    const uneditedDoc = makeDoc({
      id: 'doc-1',
      slug: 'new-name',
      title: 'New Name',
      source: optimisticSource,
      version: 2,
      folderId: null,
      isTemplate: false,
    })
    const serverCanonicalSource = `${optimisticSource}\n<!-- canonical -->`
    const accepted = mergeRenameDocumentReply({
      currentDoc: uneditedDoc,
      currentLiveSource: optimisticSource,
      optimisticSource,
      expectedVersion: 2,
      saveTokenAtRename: 1,
      currentSaveToken: 1,
      renameToken: 1,
      currentRenameToken: 1,
      serverReply: {
        slug: 'new-name',
        fileName: 'new-name.mrbl',
        source: serverCanonicalSource,
        isTemplate: false,
        updatedAt: '2026-11-25T23:05:00.000Z',
      },
      folders,
      countNodes: countMarbleNodes,
      byteSize: byteSizeOf,
    })

    expect(accepted?.shouldUpdateSourceRef).toBe(true)
    expect(accepted?.doc.source).toBe(serverCanonicalSource)

    // Case 3: superseded by a newer rename -> reply ignored
    const superseded = mergeRenameDocumentReply({
      currentDoc: uneditedDoc,
      currentLiveSource: optimisticSource,
      optimisticSource,
      expectedVersion: 2,
      saveTokenAtRename: 1,
      currentSaveToken: 1,
      renameToken: 1,
      currentRenameToken: 2,
      serverReply: {
        slug: 'stale-slug',
        fileName: 'stale-slug.mrbl',
        source: optimisticSource,
      },
      folders,
      countNodes: countMarbleNodes,
      byteSize: byteSizeOf,
    })
    expect(superseded).toBeNull()
  })
})
