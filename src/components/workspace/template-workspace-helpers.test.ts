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
  applyServerSaveAsTemplateReply,
  deriveDocIsTemplate,
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
})
