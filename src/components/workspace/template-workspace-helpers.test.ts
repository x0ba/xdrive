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
  mergeRenameFolderReply,
  mergeSaveAsTemplateDocReply,
  mergeSaveAsTemplateFolderReply,
  mintClientFolderId,
  reconcileFolderRename,
  recordDocSlugRemap,
  remapSerializedDocMetaSlug,
  resolveCanonicalDocSlug,
} from './template-workspace-helpers'
import type { DocSlugRemapStore } from './template-workspace-helpers'

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

  it('records canonical doc slug remaps transitively and rewrites serialized meta slugs', () => {
    const store: DocSlugRemapStore = new Map()
    recordDocSlugRemap(store, 'doc-1', 'example', 'example-2')
    expect(resolveCanonicalDocSlug(store, 'doc-1', 'example')).toBe('example-2')
    expect(resolveCanonicalDocSlug(store, 'doc-1', 'unrelated')).toBe(
      'unrelated',
    )

    // Subsequent server-deduped rename chains transitively: example -> example-2 -> renamed-3
    recordDocSlugRemap(store, 'doc-1', 'example-2', 'renamed-3')
    expect(resolveCanonicalDocSlug(store, 'doc-1', 'example')).toBe('renamed-3')
    expect(resolveCanonicalDocSlug(store, 'doc-1', 'example-2')).toBe(
      'renamed-3',
    )

    // Cycle safety
    store.get('doc-1')?.set('renamed-3', 'example')
    expect(() =>
      resolveCanonicalDocSlug(store, 'doc-1', 'example'),
    ).not.toThrow()

    const remapped = remapSerializedDocMetaSlug(
      {
        id: 'doc-1',
        slug: 'example',
        title: 'Example',
        share: {
          isPublicLinkEnabled: false,
          publicLinkUrl: 'https://xdrive.app/d/example',
        },
      },
      'example',
      'example-2',
    )
    expect(remapped.slug).toBe('example-2')
    expect(remapped.share.publicLinkUrl).toBe('https://xdrive.app/d/example-2')

    const customShare = remapSerializedDocMetaSlug(
      {
        id: 'doc-1',
        slug: 'example',
        share: {
          publicLinkUrl: 'https://custom.example.com/shared',
        },
      },
      'example',
      'example-2',
    )
    expect(customShare.slug).toBe('example-2')
    expect(customShare.share.publicLinkUrl).toBe(
      'https://custom.example.com/shared',
    )
  })

  it('reconciles save_as_template canonical slug while preserving newer local edits and renames', () => {
    const optimisticSource =
      '<!doctype html><html><head><title>Example</title></head><body><h1 data-marble-id="h1">Original</h1></body></html>'
    const locallyEditedSource =
      '<!doctype html><html><head><title>Example</title></head><body><h1 data-marble-id="h1">Edited In Flight</h1></body></html>'
    const templatesFolder = makeFolder({
      id: TEMPLATES_FOLDER_ID,
      name: TEMPLATES_FOLDER_NAME,
      isTemplatesFolder: true,
    })

    const currentEditedDoc = makeDoc({
      id: 'tpl-1',
      slug: 'example',
      fileName: 'example.mrbl',
      title: 'Example',
      isTemplate: true,
      source: locallyEditedSource,
      version: 2,
      syncState: 'saving',
      folderId: TEMPLATES_FOLDER_ID,
      folder: TEMPLATES_FOLDER_NAME,
      share: {
        isPublicLinkEnabled: false,
        publicLinkUrl: 'https://xdrive.app/d/example',
        publicPermission: 'view_only',
        allowDuplication: true,
        sharedAiDailyLimit: 40,
        sharedAiUsedToday: 0,
        collaborators: [],
      },
    })
    const serverDedupedDoc = makeDoc({
      id: 'tpl-1',
      slug: 'example-2',
      fileName: 'example-2.mrbl',
      title: 'Example',
      isTemplate: true,
      source: optimisticSource,
      version: 1,
      syncState: 'saved',
      folderId: TEMPLATES_FOLDER_ID,
      folder: TEMPLATES_FOLDER_NAME,
    })

    const mergedWithEdits = mergeSaveAsTemplateDocReply({
      currentDoc: currentEditedDoc,
      currentLiveSource: locallyEditedSource,
      optimisticSlug: 'example',
      optimisticSource,
      optimisticFolderId: TEMPLATES_FOLDER_ID,
      resolvedFolderId: TEMPLATES_FOLDER_ID,
      expectedVersion: 1,
      saveTokenAtCreate: 0,
      currentSaveToken: 1,
      renameTokenAtCreate: 0,
      currentRenameToken: 0,
      serverDoc: serverDedupedDoc,
      folders: [templatesFolder],
      countNodes: countMarbleNodes,
      byteSize: byteSizeOf,
    })

    expect(mergedWithEdits.shouldUpdateSourceRef).toBe(false)
    expect(mergedWithEdits.doc.slug).toBe('example-2')
    expect(mergedWithEdits.doc.fileName).toBe('example-2.mrbl')
    expect(mergedWithEdits.doc.share.publicLinkUrl).toBe(
      'https://xdrive.app/d/example-2',
    )
    expect(mergedWithEdits.doc.source).toBe(locallyEditedSource)
    expect(mergedWithEdits.doc.version).toBe(2)
    expect(mergedWithEdits.doc.syncState).toBe('saving')

    // Case 2: renamed locally while save_as_template was pending -> keeps newer local rename
    const renamedDoc = makeDoc({
      ...currentEditedDoc,
      slug: 'custom-renamed',
      fileName: 'custom-renamed.mrbl',
      title: 'Custom Renamed',
      share: {
        ...currentEditedDoc.share,
        publicLinkUrl: 'https://xdrive.app/d/custom-renamed',
      },
    })
    const mergedWithRename = mergeSaveAsTemplateDocReply({
      currentDoc: renamedDoc,
      currentLiveSource: locallyEditedSource,
      optimisticSlug: 'example',
      optimisticSource,
      optimisticFolderId: TEMPLATES_FOLDER_ID,
      resolvedFolderId: TEMPLATES_FOLDER_ID,
      expectedVersion: 1,
      saveTokenAtCreate: 0,
      currentSaveToken: 0,
      renameTokenAtCreate: 0,
      currentRenameToken: 1,
      serverDoc: serverDedupedDoc,
      folders: [templatesFolder],
      countNodes: countMarbleNodes,
      byteSize: byteSizeOf,
    })
    expect(mergedWithRename.shouldUpdateSourceRef).toBe(false)
    expect(mergedWithRename.doc.slug).toBe('custom-renamed')
    expect(mergedWithRename.doc.fileName).toBe('custom-renamed.mrbl')
    expect(mergedWithRename.doc.title).toBe('Custom Renamed')

    // Case 3: flagged/moved/trashed with no source edit -> keeps flags/move/trash + adopts server canonical slug
    const otherFolder = makeFolder({ id: 'folder-work', name: 'Work' })
    const movedTrashedDoc = makeDoc({
      id: 'tpl-1',
      slug: 'example',
      fileName: 'example.mrbl',
      title: 'Example',
      isTemplate: false,
      source: optimisticSource,
      version: 1,
      starred: true,
      pinned: true,
      folderId: 'folder-work',
      folder: 'Work',
      trashedAt: NOW,
    })
    const mergedWithFlags = mergeSaveAsTemplateDocReply({
      currentDoc: movedTrashedDoc,
      currentLiveSource: optimisticSource,
      optimisticSlug: 'example',
      optimisticSource,
      optimisticFolderId: TEMPLATES_FOLDER_ID,
      resolvedFolderId: TEMPLATES_FOLDER_ID,
      expectedVersion: 1,
      saveTokenAtCreate: 0,
      currentSaveToken: 0,
      renameTokenAtCreate: 0,
      currentRenameToken: 0,
      serverDoc: serverDedupedDoc,
      folders: [templatesFolder, otherFolder],
      countNodes: countMarbleNodes,
      byteSize: byteSizeOf,
    })
    expect(mergedWithFlags.shouldUpdateSourceRef).toBe(true)
    expect(mergedWithFlags.doc.slug).toBe('example-2')
    expect(mergedWithFlags.doc.fileName).toBe('example-2.mrbl')
    expect(mergedWithFlags.doc.starred).toBe(true)
    expect(mergedWithFlags.doc.pinned).toBe(true)
    expect(mergedWithFlags.doc.folderId).toBe('folder-work')
    expect(mergedWithFlags.doc.folder).toBe('Work')
    expect(mergedWithFlags.doc.trashedAt).toBe(NOW)
  })

  it('merges save_as_template folder replies without undoing concurrent folder renames or deletions', () => {
    // Renamed Templates -> Archived Templates while save_as_template was in flight,
    // and server returned a canonical server folder ID.
    const renamedOriginal = makeFolder({
      id: 'folder-opt-1',
      name: 'Archived Templates',
      color: 'sketch',
      isTemplatesFolder: false,
      updatedAt: '2026-11-25T23:05:00.000Z',
    })
    const secondTemplates = makeFolder({
      id: 'folder-new-templates',
      name: TEMPLATES_FOLDER_NAME,
      color: 'accent',
      isTemplatesFolder: true,
    })
    const nestedChild = makeFolder({
      id: 'folder-child',
      name: 'Nested',
      parentId: 'folder-opt-1',
    })
    const docInRenamed = makeDoc({
      id: 'tpl-in-renamed',
      folderId: 'folder-opt-1',
      folder: 'Archived Templates',
      isTemplate: false,
    })
    const serverFolderReply = makeFolder({
      id: 'folder-server-1',
      name: TEMPLATES_FOLDER_NAME,
      color: 'accent',
      isTemplatesFolder: true,
    })

    const renamedMerge = mergeSaveAsTemplateFolderReply({
      folders: [renamedOriginal, secondTemplates, nestedChild],
      docs: [docInRenamed],
      optimisticFolderId: 'folder-opt-1',
      folderTokenAtCreate: 0,
      currentFolderToken: 1,
      wasDeletedLocally: false,
      serverFolder: serverFolderReply,
    })

    expect(renamedMerge.resolvedFolderId).toBe('folder-server-1')
    expect(renamedMerge.didRemapFolderId).toBe(true)
    const updatedRenamed = renamedMerge.folders.find(
      (f) => f.id === 'folder-server-1',
    )
    expect(updatedRenamed?.name).toBe('Archived Templates')
    expect(updatedRenamed?.color).toBe('sketch')
    expect(updatedRenamed?.isTemplatesFolder).toBe(false)
    // Leaves unrelated newly created Templates folder untouched
    expect(
      renamedMerge.folders.find((f) => f.id === 'folder-new-templates')
        ?.isTemplatesFolder,
    ).toBe(true)
    expect(
      renamedMerge.folders.find((f) => f.id === 'folder-child')?.parentId,
    ).toBe('folder-server-1')
    const updatedDoc = renamedMerge.docs.find((d) => d.id === 'tpl-in-renamed')
    expect(updatedDoc?.folderId).toBe('folder-server-1')
    expect(updatedDoc?.folder).toBe('Archived Templates')
    expect(updatedDoc?.isTemplate).toBe(false)

    // Deleted locally while in flight -> never resurrects Templates
    const deletedMerge = mergeSaveAsTemplateFolderReply({
      folders: [],
      docs: [],
      optimisticFolderId: 'folder-opt-1',
      folderTokenAtCreate: 0,
      currentFolderToken: 1,
      wasDeletedLocally: true,
      serverFolder: serverFolderReply,
    })
    expect(deletedMerge.resolvedFolderId).toBeNull()
    expect(deletedMerge.folders).toHaveLength(0)

    // mergeRenameFolderReply ignores stale replies when token changed, accepts matching token
    expect(
      mergeRenameFolderReply({
        folders: [renamedOriginal],
        docs: [docInRenamed],
        folderId: 'folder-opt-1',
        renameToken: 1,
        currentFolderToken: 2,
        serverFolder: makeFolder({
          id: 'folder-server-2',
          name: 'Stale Name',
        }),
      }),
    ).toBeNull()

    const acceptedFolderIdMerge = mergeRenameFolderReply({
      folders: [renamedOriginal, nestedChild],
      docs: [docInRenamed],
      folderId: 'folder-opt-1',
      renameToken: 2,
      currentFolderToken: 2,
      serverFolder: makeFolder({
        id: 'folder-server-2',
        name: 'Ignored Server Name',
        isTemplatesFolder: true,
      }),
    })
    expect(acceptedFolderIdMerge?.resolvedFolderId).toBe('folder-server-2')
    expect(
      acceptedFolderIdMerge?.folders.find((f) => f.id === 'folder-server-2')
        ?.name,
    ).toBe('Archived Templates')
    expect(
      acceptedFolderIdMerge?.folders.find((f) => f.id === 'folder-server-2')
        ?.isTemplatesFolder,
    ).toBe(false)
    expect(
      acceptedFolderIdMerge?.docs.find((d) => d.id === 'tpl-in-renamed')
        ?.folderId,
    ).toBe('folder-server-2')
  })
})
