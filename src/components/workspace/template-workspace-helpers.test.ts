import { describe, expect, it } from 'vitest'

import {
  TEMPLATES_FOLDER_ID,
  TEMPLATES_FOLDER_NAME,
  applyMarbleOpsClient,
  byteSizeOf,
  countMarbleNodes,
  isTemplatesRootFolder,
  updateMarbleSourceTitle,
} from '#/lib/marble'
import type { DriveFolder, MarbleDocumentFile } from '#/lib/types'
import {
  applyServerRenameDocumentReply,
  applyServerRestoreDocumentReply,
  applyServerSaveAsTemplateReply,
  applyServerTrashDocumentReply,
  chatEditUndoDecision,
  confirmedEmptyTrashIds,
  deriveDocIsTemplate,
  emptyTrashRowsToRemove,
  restoreLandedOnDisk,
  templateSourceErrorSyncState,
  docEditDisposition,
  docLifecycleBlocksPermanentDelete,
  docLifecycleRefusalMessage,
  emptyTrashDocIds,
  ensureClientTemplatesFolder,
  mergeReloadedWorkspaceDocs,
  mintClientFolderId,
  reconcileFolderRename,
  replayHeldDocEdits,
} from './template-workspace-helpers'
import type { HeldDocEdit } from './template-workspace-helpers'

const NOW = '2026-11-26T00:00:00.000Z'

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
  const slug = overrides.slug ?? 'doc'
  const source =
    overrides.source ??
    '<!doctype html><html><head><title>Doc</title></head><body><h1 data-marble-id="h1">Body</h1></body></html>'
  return {
    slug,
    fileName: overrides.fileName ?? `${slug}.mrbl`,
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
      publicLinkUrl: `https://xdrive.app/d/${slug}`,
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

  it('reconciles folder renames and optional server folder IDs across direct docs and nested subfolders', () => {
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

    // Rename Templates -> Archived Templates (with canonical server folder ID update)
    const afterRenameOut = reconcileFolderRename(initialFolders, initialDocs, {
      folderId: TEMPLATES_FOLDER_ID,
      nextFolderId: 'folder-archived-srv',
      name: 'Archived Templates',
      color: 'sketch',
      updatedAt: NOW,
    })

    expect(afterRenameOut.resolvedFolderId).toBe('folder-archived-srv')
    expect(
      afterRenameOut.folders.find((f) => f.id === 'folder-archived-srv')
        ?.isTemplatesFolder,
    ).toBe(false)
    expect(
      afterRenameOut.folders.find((f) => f.id === 'folder-sub')?.parentId,
    ).toBe('folder-archived-srv')
    expect(
      afterRenameOut.docs.find((d) => d.id === 'tpl-direct')?.isTemplate,
    ).toBe(false)
    expect(afterRenameOut.docs.find((d) => d.id === 'tpl-direct')?.folder).toBe(
      'Archived Templates',
    )
    expect(
      afterRenameOut.docs.find((d) => d.id === 'tpl-nested')?.isTemplate,
    ).toBe(false)

    // Renaming back to Templates at root restores template membership
    const afterRenameBack = reconcileFolderRename(
      afterRenameOut.folders,
      afterRenameOut.docs,
      {
        folderId: 'folder-archived-srv',
        name: TEMPLATES_FOLDER_NAME,
        color: 'accent',
        updatedAt: NOW,
      },
    )

    expect(
      afterRenameBack.folders.find((f) => f.id === 'folder-archived-srv')
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

  it('applies server-confirmed save_as_template replies with canonical slug and live folder membership', () => {
    const existingOther = makeDoc({
      id: 'tpl-existing',
      slug: 'example',
      fileName: 'example.mrbl',
      title: 'Example',
      folderId: 'folder-templates',
      folder: TEMPLATES_FOLDER_NAME,
      isTemplate: true,
    })
    const serverFolder = makeFolder({
      id: 'folder-templates',
      name: TEMPLATES_FOLDER_NAME,
      color: 'accent',
      isTemplatesFolder: true,
    })
    const serverDoc = makeDoc({
      id: 'tpl-new',
      slug: 'example-2',
      fileName: 'example-2.mrbl',
      title: 'Example',
      folderId: 'folder-templates',
      folder: TEMPLATES_FOLDER_NAME,
      isTemplate: false,
    })

    const applied = applyServerSaveAsTemplateReply([], [existingOther], {
      folder: serverFolder,
      doc: serverDoc,
    })

    expect(applied.folders).toHaveLength(1)
    expect(applied.folders[0]?.id).toBe('folder-templates')
    expect(applied.folders[0]?.isTemplatesFolder).toBe(true)
    expect(applied.doc?.slug).toBe('example-2')
    expect(applied.doc?.fileName).toBe('example-2.mrbl')
    expect(applied.doc?.isTemplate).toBe(true)
    expect(applied.docs[0]?.id).toBe('tpl-new')
  })

  it('applies server rename replies (including reclaimed slugs) and replays held edits', () => {
    const templatesFolder = makeFolder({
      id: TEMPLATES_FOLDER_ID,
      name: TEMPLATES_FOLDER_NAME,
      isTemplatesFolder: true,
    })
    const initialSource =
      '<!doctype html><html><head><title>Example</title></head><body><h1 data-marble-id="h1">Initial Body</h1></body></html>'
    const serverRenamedSource =
      '<!doctype html><html><head><title>Renamed Example</title></head><body><h1 data-marble-id="h1">Initial Body</h1></body></html>'

    // Step 1: doc started with deduped slug 'example-2'; server confirms rename to 'renamed-example-2'
    const initialDoc = makeDoc({
      id: 'tpl-1',
      slug: 'example-2',
      fileName: 'example-2.mrbl',
      title: 'Example',
      source: initialSource,
      version: 2,
      folderId: TEMPLATES_FOLDER_ID,
      folder: TEMPLATES_FOLDER_NAME,
      isTemplate: true,
    })

    const confirmed = applyServerRenameDocumentReply({
      currentDoc: initialDoc,
      serverReply: {
        slug: 'renamed-example-2',
        fileName: 'renamed-example-2.mrbl',
        title: 'Renamed Example',
        source: serverRenamedSource,
        updatedAt: '2026-11-26T00:05:00.000Z',
      },
      fallbackTitle: 'Renamed Example',
      fallbackDescription: '',
      folders: [templatesFolder],
      countNodes: countMarbleNodes,
      byteSize: byteSizeOf,
    })

    expect(confirmed.slug).toBe('renamed-example-2')
    expect(confirmed.fileName).toBe('renamed-example-2.mrbl')
    expect(confirmed.share.publicLinkUrl).toBe(
      'https://xdrive.app/d/renamed-example-2',
    )
    expect(confirmed.version).toBe(3)
    expect(confirmed.syncState).toBe('saved')

    // Replay held edit onto the confirmed server source
    const held: HeldDocEdit[] = [
      {
        ops: [{ type: 'setText', id: 'h1', text: 'Replayed Held Edit' }],
        nextSource: initialSource.replace('Initial Body', 'Replayed Held Edit'),
        lastEditedBy: { name: 'You', initials: 'YO' },
        updatedAt: '2026-11-26T00:05:01.000Z',
      },
    ]
    const replayed = replayHeldDocEdits(
      confirmed.source,
      confirmed.title,
      held,
      applyMarbleOpsClient,
      updateMarbleSourceTitle,
    )
    expect(replayed.ops).toHaveLength(1)
    expect(replayed.source).toContain('<title>Renamed Example</title>')
    expect(replayed.source).toContain('Replayed Held Edit')

    // Step 2: original 'example' is later gone and user renames to reclaim 'example'
    const reclaimed = applyServerRenameDocumentReply({
      currentDoc: { ...confirmed, source: replayed.source },
      serverReply: {
        slug: 'example',
        fileName: 'example.mrbl',
        title: 'Example',
        source: updateMarbleSourceTitle(replayed.source, 'Example'),
        updatedAt: '2026-11-26T00:06:00.000Z',
      },
      fallbackTitle: 'Example',
      fallbackDescription: '',
      folders: [templatesFolder],
      countNodes: countMarbleNodes,
      byteSize: byteSizeOf,
    })

    expect(reclaimed.slug).toBe('example')
    expect(reclaimed.fileName).toBe('example.mrbl')
    expect(reclaimed.share.publicLinkUrl).toBe('https://xdrive.app/d/example')
    expect(reclaimed.source).toContain('Replayed Held Edit')
  })

  it('preserves held rename edits and saving flags across unrelated workspace reloads', () => {
    const heldSource =
      '<!doctype html><html><head><title>Rename Target</title></head><body><h1 data-marble-id="h1">Edited While Queued</h1></body></html>'
    const renamingDoc = makeDoc({
      id: 'doc-renaming',
      slug: 'rename-target',
      title: 'Rename Target',
      source: heldSource,
      version: 3,
      syncState: 'saving',
      checkpoints: [
        {
          sha: 'cp1',
          label: 'Queued edit',
          timestamp: 1000,
          author: 'You',
          opsCount: 1,
          source: heldSource,
        },
      ],
    })
    const movingDoc = makeDoc({
      id: 'doc-moving',
      slug: 'moving-doc',
      title: 'Moving Doc',
      syncState: 'saving',
    })
    const unaffectedCurrent = makeDoc({
      id: 'doc-other',
      slug: 'other-doc',
      title: 'Old Other',
    })

    const serverRenameDoc = makeDoc({
      id: 'doc-renaming',
      slug: 'rename-target',
      title: 'Rename Target',
      folder: 'Archive',
      folderId: 'folder-archive',
      isTemplate: false,
      version: 1,
      syncState: 'saved',
    })
    const serverMovingDoc = makeDoc({
      id: 'doc-moving',
      slug: 'moving-doc',
      title: 'Moving Doc',
      syncState: 'saved',
    })
    const serverOtherDoc = makeDoc({
      id: 'doc-other',
      slug: 'other-doc',
      title: 'Fresh From Server',
      syncState: 'saved',
    })

    const heldMap = new Map<string, HeldDocEdit[]>([
      [
        'doc-renaming',
        [
          {
            ops: [{ type: 'setText', id: 'h1', text: 'Edited While Queued' }],
            nextSource: heldSource,
            lastEditedBy: { name: 'You', initials: 'YO' },
            updatedAt: '2026-11-26T00:10:00.000Z',
          },
        ],
      ],
    ])

    const merged = mergeReloadedWorkspaceDocs({
      reloadedDocs: [serverRenameDoc, serverMovingDoc, serverOtherDoc],
      currentDocs: [renamingDoc, movingDoc, unaffectedCurrent],
      pendingRenameDocIds: new Set(['doc-renaming']),
      heldDocEdits: heldMap,
      pendingMoveDocIds: new Set(['doc-moving']),
    })

    const mergedRenaming = merged.find((d) => d.id === 'doc-renaming')
    expect(mergedRenaming?.source).toBe(heldSource)
    expect(mergedRenaming?.version).toBe(3)
    expect(mergedRenaming?.checkpoints).toHaveLength(1)
    expect(mergedRenaming?.syncState).toBe('saving')
    // Adopts server-reloaded folder metadata while preserving held source edits
    expect(mergedRenaming?.folderId).toBe('folder-archive')
    expect(mergedRenaming?.folder).toBe('Archive')

    const mergedMoving = merged.find((d) => d.id === 'doc-moving')
    expect(mergedMoving?.syncState).toBe('saving')

    const mergedOther = merged.find((d) => d.id === 'doc-other')
    expect(mergedOther?.title).toBe('Fresh From Server')
    expect(mergedOther?.syncState).toBe('saved')
  })

  it('adopts server location while preserving queued save source across lost-response move reloads', () => {
    const queuedSource =
      '<!doctype html><html><head><title>Move Doc</title></head><body><h1 data-marble-id="h1">Edited During Lost Move</h1></body></html>'
    const clientStaleFolderDoc = makeDoc({
      id: 'doc-lost-move',
      slug: 'move-doc',
      title: 'Move Doc',
      folder: 'My Drive',
      folderId: null,
      isTemplate: false,
      source: queuedSource,
      version: 2,
      syncState: 'saving',
      checkpoints: [
        {
          sha: 'cp-queued',
          label: 'Queued edit',
          timestamp: 2000,
          author: 'You',
          opsCount: 1,
          source: queuedSource,
        },
      ],
    })
    const serverMovedDoc = makeDoc({
      id: 'doc-lost-move',
      slug: 'move-doc',
      title: 'Move Doc',
      folder: 'Archive',
      folderId: 'folder-archive',
      isTemplate: false,
      version: 1,
      syncState: 'saved',
    })

    const merged = mergeReloadedWorkspaceDocs({
      reloadedDocs: [serverMovedDoc],
      currentDocs: [clientStaleFolderDoc],
      pendingRenameDocIds: new Set(),
      heldDocEdits: new Map(),
      pendingMoveDocIds: new Set(['doc-lost-move']),
      pendingSaveDocIds: new Set(['doc-lost-move']),
    })

    expect(merged).toHaveLength(1)
    expect(merged[0]?.folderId).toBe('folder-archive')
    expect(merged[0]?.folder).toBe('Archive')
    expect(merged[0]?.source).toBe(queuedSource)
    expect(merged[0]?.version).toBe(2)
    expect(merged[0]?.checkpoints).toHaveLength(1)
    expect(merged[0]?.syncState).toBe('saving')
  })

  it('reverts a failed rename to server source when that doc ignores pending rename state', () => {
    const editedSource =
      '<!doctype html><html><head><title>Rename Target</title></head><body><h1 data-marble-id="h1">Edited During Failed Reload</h1></body></html>'
    const serverSource =
      '<!doctype html><html><head><title>Rename Target</title></head><body><h1 data-marble-id="h1">Server Body</h1></body></html>'
    const currentDoc = makeDoc({
      id: 'doc-failed-rename',
      slug: 'rename-target',
      title: 'Rename Target',
      source: editedSource,
      version: 4,
      syncState: 'saving',
    })
    const serverDoc = makeDoc({
      id: 'doc-failed-rename',
      slug: 'rename-target',
      title: 'Rename Target',
      source: serverSource,
      version: 1,
      syncState: 'saved',
    })
    const heldMap = new Map<string, HeldDocEdit[]>([
      [
        'doc-failed-rename',
        [
          {
            ops: [],
            nextSource: editedSource,
            lastEditedBy: { name: 'You', initials: 'YO' },
            updatedAt: '2026-11-26T00:12:00.000Z',
          },
        ],
      ],
    ])

    const merged = mergeReloadedWorkspaceDocs({
      reloadedDocs: [serverDoc],
      currentDocs: [currentDoc],
      pendingRenameDocIds: new Set(['doc-failed-rename']),
      heldDocEdits: heldMap,
      ignorePendingRenameDocIds: new Set(['doc-failed-rename']),
    })

    expect(merged).toHaveLength(1)
    const syncState: MarbleDocumentFile['syncState'] = merged[0].syncState
    expect(merged[0]?.source).toBe(serverSource)
    expect(syncState).toBe('saved')
    expect(merged[0]?.version).toBe(1)
  })

  it('keeps queued save source when a failed rename reload ignores only rename state', () => {
    const queuedSource =
      '<!doctype html><html><head><title>Rename Target</title></head><body><h1 data-marble-id="h1">Queued Save</h1></body></html>'
    const currentDoc = makeDoc({
      id: 'doc-failed-rename',
      source: queuedSource,
      version: 2,
      syncState: 'saving',
    })
    const serverDoc = makeDoc({
      id: 'doc-failed-rename',
      source:
        '<!doctype html><html><head><title>Doc</title></head><body><h1 data-marble-id="h1">Server</h1></body></html>',
      syncState: 'saved',
    })

    const merged = mergeReloadedWorkspaceDocs({
      reloadedDocs: [serverDoc],
      currentDocs: [currentDoc],
      pendingRenameDocIds: new Set(['doc-failed-rename']),
      heldDocEdits: new Map(),
      pendingSaveDocIds: new Set(['doc-failed-rename']),
      ignorePendingRenameDocIds: new Set(['doc-failed-rename']),
    })

    expect(merged[0]?.source).toBe(queuedSource)
    expect(merged[0]?.syncState).toBe('saving')
  })

  it('preserves local documents whose first save is still pending', () => {
    const localSource =
      '<!doctype html><html><head><title>Stencil Note</title></head><body><h1 data-marble-id="h1">Copied</h1></body></html>'
    const localDoc = makeDoc({
      id: 'doc-first-save',
      slug: 'stencil-note',
      title: 'Stencil Note',
      source: localSource,
      syncState: 'saved',
    })
    const serverDoc = makeDoc({
      id: 'doc-on-server',
      slug: 'on-server',
      title: 'On Server',
    })
    const unsavedOrphan = makeDoc({
      id: 'doc-orphan',
      slug: 'orphan',
      title: 'Orphan',
    })

    const merged = mergeReloadedWorkspaceDocs({
      reloadedDocs: [serverDoc],
      currentDocs: [localDoc, serverDoc, unsavedOrphan],
      pendingRenameDocIds: new Set(),
      heldDocEdits: new Map(),
      pendingSaveDocIds: new Set(['doc-first-save']),
    })

    expect(merged.map((doc) => doc.id)).toEqual([
      'doc-first-save',
      'doc-on-server',
    ])
    const preserved = merged[0]
    const syncState: MarbleDocumentFile['syncState'] = preserved.syncState
    expect(preserved.source).toBe(localSource)
    expect(syncState).toBe('saving')
    expect(merged[1]?.title).toBe('On Server')
  })

  it('keeps server trash membership while a later restore is pending, then applies the confirmed restore', () => {
    const trashedAt = '2026-11-26T00:04:00.000Z'
    const archive = makeFolder({ id: 'folder-archive', name: 'Archive' })
    const localRestored = makeDoc({
      id: 'doc-undo',
      slug: 'undo-doc',
      title: 'Undo Doc',
      folder: 'Archive',
      folderId: 'folder-archive',
      trashedAt: null,
      syncState: 'saving',
    })
    const serverTrashed = makeDoc({
      id: 'doc-undo',
      slug: 'undo-doc',
      title: 'Undo Doc',
      folder: 'Archive',
      folderId: 'folder-archive',
      trashedAt,
      syncState: 'saved',
    })

    const merged = mergeReloadedWorkspaceDocs({
      reloadedDocs: [serverTrashed],
      currentDocs: [localRestored],
      pendingRenameDocIds: new Set(),
      heldDocEdits: new Map(),
      pendingRestoreDocIds: new Set(['doc-undo']),
    })

    expect(merged).toHaveLength(1)
    const reloaded = merged[0]
    const reloadedSync: MarbleDocumentFile['syncState'] = reloaded.syncState
    expect(reloaded.trashedAt).toBe(trashedAt)
    expect(reloadedSync).toBe('saving')

    const restored = applyServerRestoreDocumentReply({
      doc: reloaded,
      folders: [archive],
      folderPath: 'Archive',
      syncState: 'saved',
    })
    const replaceExisting = merged.map((doc) =>
      doc.id === restored.id ? restored : doc,
    )
    const insertMissing = [restored]
    const confirmed = replaceExisting[0]
    const confirmedSync: MarbleDocumentFile['syncState'] = confirmed.syncState
    expect(confirmed.trashedAt).toBeNull()
    expect(confirmed.folderId).toBe('folder-archive')
    expect(confirmed.folder).toBe('Archive')
    expect(confirmedSync).toBe('saved')
    expect(replaceExisting).toHaveLength(1)
    expect(insertMissing[0]?.trashedAt).toBeNull()
    expect(insertMissing).toHaveLength(1)
  })

  it('marks a server-confirmed trash without treating an unconfirmed restore as saved', () => {
    const doc = makeDoc({
      id: 'doc-trash',
      slug: 'trash-doc',
      title: 'Trash Doc',
      trashedAt: null,
      syncState: 'saving',
    })
    const trashed = applyServerTrashDocumentReply({
      doc,
      trashedAt: '2026-11-26T00:04:00.000Z',
      syncState: 'saving',
    })
    const syncState: MarbleDocumentFile['syncState'] = trashed.syncState
    expect(trashed.trashedAt).toBe('2026-11-26T00:04:00.000Z')
    expect(syncState).toBe('saving')
  })
})

describe('pending document lifecycle gate', () => {
  it('blocks a queued save while trash is pending so the save cannot recreate the file', () => {
    const pending = { trash: new Set(['doc-race']) }
    expect(docEditDisposition('doc-race', pending)).toBe('block')
    expect(docEditDisposition('doc-other', pending)).toBe('allow')
    expect(
      docLifecycleRefusalMessage(
        'doc-race',
        'edit',
        'editing this file',
        pending,
      ),
    ).toBe('Wait for trash to finish before editing this file.')
    expect(
      docLifecycleRefusalMessage(
        'doc-race',
        'meta',
        'modifying metadata',
        pending,
      ),
    ).toBe('Wait for trash to finish before modifying metadata.')
    expect(docLifecycleBlocksPermanentDelete('doc-race', pending)).toBe(true)
  })

  it('blocks emptying Trash while any trash, restore, or delete is pending and otherwise sends only the shown ids', () => {
    expect(
      emptyTrashDocIds({
        visibleDocIds: ['shown-keep', 'pending-restore'],
        pending: { restore: new Set(['pending-restore']) },
      }),
    ).toEqual({ blocked: true })
    expect(
      emptyTrashDocIds({
        visibleDocIds: ['shown-keep'],
        pending: { trash: new Set(['doc-leaving']) },
      }),
    ).toEqual({ blocked: true })
    expect(
      emptyTrashDocIds({
        visibleDocIds: ['shown-keep'],
        pending: { delete: new Set(['shown-keep']) },
      }),
    ).toEqual({ blocked: true })
    expect(
      emptyTrashDocIds({
        visibleDocIds: ['shown-a', ' shown-b ', 'shown-a', ''],
        pending: { move: new Set(['active-doc']) },
      }),
    ).toEqual({ blocked: false, ids: ['shown-a', 'shown-b'] })
  })

  it('holds edits only for rename, queues edits behind move, and blocks the other pending lifecycle pairs', () => {
    expect(
      docEditDisposition('doc-race', { rename: new Set(['doc-race']) }),
    ).toBe('hold')
    expect(
      docLifecycleRefusalMessage('doc-race', 'edit', 'editing this file', {
        rename: new Set(['doc-race']),
      }),
    ).toBeNull()
    expect(
      docEditDisposition('doc-race', { move: new Set(['doc-race']) }),
    ).toBe('allow')
    expect(
      docLifecycleRefusalMessage('doc-race', 'edit', 'editing this file', {
        move: new Set(['doc-race']),
      }),
    ).toBeNull()
    expect(
      docLifecycleBlocksPermanentDelete('doc-race', {
        move: new Set(['doc-race']),
      }),
    ).toBe(true)
    expect(
      docLifecycleRefusalMessage('doc-race', 'restore', 'restoring this file', {
        trash: new Set(['doc-race']),
      }),
    ).toBeNull()

    const blocking = ['restore', 'delete', 'save_as_template'] as const
    for (const kind of blocking) {
      const pending =
        kind === 'save_as_template'
          ? { saveAsTemplate: new Set(['doc-race']) }
          : { [kind]: new Set(['doc-race']) }
      expect(docEditDisposition('doc-race', pending)).toBe('block')
      expect(docLifecycleBlocksPermanentDelete('doc-race', pending)).toBe(true)
      expect(
        docLifecycleRefusalMessage(
          'doc-race',
          'edit',
          'editing this file',
          pending,
        ),
      ).toBe(
        `Wait for ${kind === 'save_as_template' ? 'save as template' : kind} to finish before editing this file.`,
      )
    }

    expect(
      docLifecycleRefusalMessage('doc-race', 'trash', 'trashing this file', {
        trash: new Set(['doc-race']),
      }),
    ).toBe('Trash is already in progress.')
  })

  it('keeps a source doc saving while save-as-template is pending', () => {
    const serverDoc = makeDoc({
      id: 'doc-source',
      slug: 'source-doc',
      title: 'Source Doc',
      syncState: 'saved',
    })
    const merged = mergeReloadedWorkspaceDocs({
      reloadedDocs: [serverDoc],
      currentDocs: [{ ...serverDoc, syncState: 'saving' }],
      pendingRenameDocIds: new Set(),
      heldDocEdits: new Map(),
      pendingSaveAsTemplateDocIds: new Set(['doc-source']),
    })
    const reloaded = merged[0]
    const syncState: MarbleDocumentFile['syncState'] = reloaded.syncState
    expect(syncState).toBe('saving')
    expect(reloaded.source).toBe(serverDoc.source)
  })

  it('keeps Drive Chat undo available while save-as-template is pending', () => {
    const pending = { saveAsTemplate: new Set(['doc-race']) }
    expect(chatEditUndoDecision('doc-race', pending)).toEqual({
      proceed: false,
      message: 'Wait for save as template to finish before editing this file.',
    })
    expect(chatEditUndoDecision('doc-other', pending)).toEqual({
      proceed: true,
    })
    expect(
      chatEditUndoDecision('doc-race', { rename: new Set(['doc-race']) }),
    ).toEqual({ proceed: true })
  })

  it('removes empty-trash rows only for ids the server confirmed', () => {
    expect(
      confirmedEmptyTrashIds(
        ['shown-a', 'shown-b', 'orphan'],
        ['shown-b', 'unrequested', 'shown-b', ''],
      ),
    ).toEqual(['shown-b'])
    expect(confirmedEmptyTrashIds(['shown-a'], [])).toEqual([])
  })

  it('blocks restore while an empty-trash deletion is pending', () => {
    const pending = { delete: new Set(['trashed-a', 'trashed-b']) }
    expect(
      docLifecycleRefusalMessage(
        'trashed-a',
        'restore',
        'restoring this file',
        pending,
      ),
    ).toBe('Wait for delete to finish before restoring this file.')
    expect(
      docLifecycleRefusalMessage(
        'trashed-other',
        'restore',
        'restoring this file',
        pending,
      ),
    ).toBeNull()
    expect(restoreLandedOnDisk({ restoredOnDisk: true })).toBe(true)
    expect(restoreLandedOnDisk({ restoredOnDisk: false })).toBe(false)
    expect(restoreLandedOnDisk({})).toBe(false)
  })

  it('removes every requested trash row when sync is off and only confirmed ids when sync is on', () => {
    expect(
      emptyTrashRowsToRemove({
        syncWithServer: false,
        requestedIds: ['shown-a', ' shown-b ', 'shown-a', ''],
        deletedIds: [],
      }),
    ).toEqual(['shown-a', 'shown-b'])
    expect(
      emptyTrashRowsToRemove({
        syncWithServer: true,
        requestedIds: ['shown-a', 'shown-b'],
        deletedIds: ['shown-b'],
      }),
    ).toEqual(['shown-b'])
    expect(
      emptyTrashRowsToRemove({
        syncWithServer: true,
        requestedIds: ['shown-a'],
      }),
    ).toEqual([])
  })

  it('settles a failed save-as-template against the recovered server source', () => {
    expect(
      templateSourceErrorSyncState({
        displayedSource: 'disk body',
        recoveredSource: 'disk body',
        writeStillPending: false,
      }),
    ).toBe('saved')
    expect(
      templateSourceErrorSyncState({
        displayedSource: 'unsaved body',
        recoveredSource: 'disk body',
        writeStillPending: false,
      }),
    ).toBe('retrying')
    expect(
      templateSourceErrorSyncState({
        displayedSource: 'disk body',
        recoveredSource: 'disk body',
        writeStillPending: true,
      }),
    ).toBe('saving')
    expect(
      templateSourceErrorSyncState({
        displayedSource: 'unsaved body',
        recoveredSource: undefined,
        writeStillPending: false,
      }),
    ).toBe('retrying')
  })
})
