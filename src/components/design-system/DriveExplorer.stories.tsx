import { useMemo, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import {
  DriveBreadcrumbBar,
  DriveFileIconTile,
  DriveFileListTable,
  DriveFilePreviewCard,
  DriveFolderCard,
  DriveFolderDialog,
  DriveMoveDialog,
  DrivePermanentDeleteDialog,
  DriveTrashList,
  TRASH_RETENTION_DAYS,
  getDescendantFolderIds,
  getFolderAncestors,
  getFolderItemCounts,
  getFolderPathLabel,
  seedDriveFolders,
} from './DriveExplorer'
import { FilterPillBar } from './FilterAndMetrics'
import type { DriveViewMode, SortOption } from './FilterAndMetrics'
import { INITIAL_WORKSPACE_DOCS } from '#/lib/marble'
import type {
  DriveFolder,
  DriveFolderColor,
  MarbleAppCategory,
  MarbleDocumentFile,
} from '#/lib/types'

function makeStorySeed() {
  const seeded = seedDriveFolders(
    INITIAL_WORKSPACE_DOCS.map((doc) => ({
      ...doc,
      updatedAt: '12m ago',
    })),
  )
  const papers = seeded.folders.find((f) => f.name === 'Papers')
  if (papers) {
    seeded.folders.push({
      id: 'folder-qec-drafts',
      name: 'Surface Code Drafts',
      parentId: papers.id,
      color: 'accent',
      createdAt: '2026-11-18T10:00:00.000Z',
      updatedAt: '2026-11-21T10:00:00.000Z',
    })
  }
  return seeded
}

const DEFAULT_SEED = makeStorySeed()

function InteractiveDriveBrowserDemo() {
  const initial = useMemo(() => makeStorySeed(), [])
  const [folders, setFolders] = useState<DriveFolder[]>(initial.folders)
  const [docs, setDocs] = useState<MarbleDocumentFile[]>(initial.docs)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<DriveViewMode>('preview')
  const [category, setCategory] = useState<MarbleAppCategory | 'all'>('all')
  const [sortBy, setSortBy] = useState<SortOption>('updated')
  const [searchQuery, setSearchQuery] = useState('')
  const [folderModal, setFolderModal] = useState<
    | { mode: 'create'; parentId: string | null }
    | { mode: 'rename'; folder: DriveFolder }
    | null
  >(null)
  const [moveDoc, setMoveDoc] = useState<MarbleDocumentFile | null>(null)

  const ancestors = useMemo(
    () => getFolderAncestors(folders, currentFolderId),
    [folders, currentFolderId],
  )
  const counts = useMemo(
    () => getFolderItemCounts(folders, docs),
    [folders, docs],
  )

  const visibleFolders = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase()
    return folders
      .filter((f) => f.parentId === currentFolderId)
      .filter((f) => !needle || f.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [folders, currentFolderId, searchQuery])

  const visibleDocs = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase()
    return docs
      .filter((doc) => !doc.trashedAt)
      .filter((doc) =>
        currentFolderId === null ? true : doc.folderId === currentFolderId,
      )
      .filter((doc) => category === 'all' || doc.category === category)
      .filter(
        (doc) =>
          !needle ||
          `${doc.title} ${doc.fileName} ${doc.description}`
            .toLowerCase()
            .includes(needle),
      )
      .sort((a, b) => {
        if (sortBy === 'title') return a.title.localeCompare(b.title)
        if (sortBy === 'size') return b.byteSize - a.byteSize
        return 0
      })
  }, [docs, currentFolderId, category, searchQuery, sortBy])

  const handleMoveDoc = (docId: string, targetFolderId: string | null) => {
    const targetName = targetFolderId
      ? (folders.find((f) => f.id === targetFolderId)?.name ?? 'My Drive')
      : 'My Drive'
    setDocs((prev) =>
      prev.map((doc) =>
        doc.id === docId
          ? { ...doc, folderId: targetFolderId, folder: targetName }
          : doc,
      ),
    )
    setMoveDoc(null)
  }

  const handleSubmitFolder = (name: string, color: DriveFolderColor) => {
    if (!folderModal) return
    if (folderModal.mode === 'create') {
      const now = new Date().toISOString()
      const created: DriveFolder = {
        id: `folder-${Math.random().toString(16).slice(2, 8)}`,
        name,
        parentId: folderModal.parentId,
        color,
        createdAt: now,
        updatedAt: now,
      }
      setFolders((prev) => [...prev, created])
    } else {
      setFolders((prev) =>
        prev.map((f) =>
          f.id === folderModal.folder.id ? { ...f, name, color } : f,
        ),
      )
      setDocs((prev) =>
        prev.map((d) =>
          d.folderId === folderModal.folder.id ? { ...d, folder: name } : d,
        ),
      )
    }
    setFolderModal(null)
  }

  const handleDeleteFolder = (folder: DriveFolder) => {
    const removed = getDescendantFolderIds(folders, folder.id)
    const parentName = folder.parentId
      ? (folders.find((f) => f.id === folder.parentId)?.name ?? 'My Drive')
      : 'My Drive'
    setFolders((prev) => prev.filter((f) => !removed.has(f.id)))
    setDocs((prev) =>
      prev.map((doc) =>
        doc.folderId && removed.has(doc.folderId)
          ? { ...doc, folderId: folder.parentId, folder: parentName }
          : doc,
      ),
    )
    if (currentFolderId && removed.has(currentFolderId)) {
      setCurrentFolderId(folder.parentId)
    }
  }

  const handleTrashDoc = (doc: MarbleDocumentFile) => {
    setDocs((prev) =>
      prev.map((item) =>
        item.id === doc.id
          ? { ...item, trashedAt: new Date().toISOString() }
          : item,
      ),
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 bg-[var(--xd-canvas)] p-6 text-[var(--xd-ink)]">
      <DriveBreadcrumbBar
        ancestors={ancestors}
        folderCount={visibleFolders.length}
        itemCount={visibleDocs.length}
        onNavigateFolder={setCurrentFolderId}
        onCreateFolder={() =>
          setFolderModal({ mode: 'create', parentId: currentFolderId })
        }
        onDropDocOnFolder={handleMoveDoc}
      />

      <FilterPillBar
        selectedCategory={category}
        onSelectCategory={setCategory}
        sortBy={sortBy}
        onSelectSort={setSortBy}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        searchQuery={searchQuery}
        onChangeSearchQuery={setSearchQuery}
      />

      {viewMode === 'list' ? (
        <DriveFileListTable
          folders={visibleFolders}
          folderCounts={counts}
          docs={visibleDocs}
          resolveFolderLabel={(doc) =>
            getFolderPathLabel(folders, doc.folderId, doc.folder)
          }
          onOpenFolder={(folder) => setCurrentFolderId(folder.id)}
          onCreateSubfolder={(folder) =>
            setFolderModal({ mode: 'create', parentId: folder.id })
          }
          onRenameFolder={(folder) =>
            setFolderModal({ mode: 'rename', folder })
          }
          onDeleteFolder={handleDeleteFolder}
          onDropDocOnFolder={handleMoveDoc}
          onMoveDoc={setMoveDoc}
          onToggleStar={(doc) =>
            setDocs((prev) =>
              prev.map((item) =>
                item.id === doc.id ? { ...item, starred: !item.starred } : item,
              ),
            )
          }
          onDeleteDoc={handleTrashDoc}
        />
      ) : (
        <div className="space-y-6">
          {visibleFolders.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-[12px] font-medium text-[var(--xd-ink-secondary)]">
                Folders
              </h2>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                {visibleFolders.map((folder) => (
                  <DriveFolderCard
                    key={folder.id}
                    folder={folder}
                    itemCount={counts.get(folder.id)?.total ?? 0}
                    onOpen={(target) => setCurrentFolderId(target.id)}
                    onCreateSubfolder={(target) =>
                      setFolderModal({ mode: 'create', parentId: target.id })
                    }
                    onRename={(target) =>
                      setFolderModal({ mode: 'rename', folder: target })
                    }
                    onDelete={handleDeleteFolder}
                    onDropDoc={handleMoveDoc}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="space-y-2.5">
            <h2 className="text-[12px] font-medium text-[var(--xd-ink-secondary)]">
              Files
            </h2>
            {viewMode === 'preview' ? (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {visibleDocs.map((doc) => (
                  <DriveFilePreviewCard
                    key={doc.id}
                    doc={doc}
                    folderLabel={getFolderPathLabel(
                      folders,
                      doc.folderId,
                      doc.folder,
                    )}
                    onMove={setMoveDoc}
                    onToggleStar={(target) =>
                      setDocs((prev) =>
                        prev.map((item) =>
                          item.id === target.id
                            ? { ...item, starred: !item.starred }
                            : item,
                        ),
                      )
                    }
                    onDelete={handleTrashDoc}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {visibleDocs.map((doc) => (
                  <DriveFileIconTile
                    key={doc.id}
                    doc={doc}
                    onMove={setMoveDoc}
                    onToggleStar={(target) =>
                      setDocs((prev) =>
                        prev.map((item) =>
                          item.id === target.id
                            ? { ...item, starred: !item.starred }
                            : item,
                        ),
                      )
                    }
                    onDelete={handleTrashDoc}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <DriveFolderDialog
        open={folderModal !== null}
        mode={folderModal?.mode ?? 'create'}
        initialName={
          folderModal?.mode === 'rename' ? folderModal.folder.name : ''
        }
        initialColor={
          folderModal?.mode === 'rename'
            ? (folderModal.folder.color ?? 'default')
            : 'default'
        }
        parentPathLabel={
          folderModal?.mode === 'create'
            ? getFolderPathLabel(folders, folderModal.parentId)
            : 'My Drive'
        }
        onClose={() => setFolderModal(null)}
        onSubmit={handleSubmitFolder}
      />

      <DriveMoveDialog
        open={moveDoc !== null}
        fileName={moveDoc?.fileName ?? ''}
        currentFolderId={moveDoc?.folderId ?? null}
        folders={folders}
        onClose={() => setMoveDoc(null)}
        onMove={(targetFolderId) => {
          if (moveDoc) handleMoveDoc(moveDoc.id, targetFolderId)
        }}
      />
    </div>
  )
}

/**
 * Google Drive-style file explorer primitives including preview cards, icon tiles, list tables, nested folders, breadcrumbs, and move/folder dialogs.
 *
 * @summary Drive file explorer views, folder cards, breadcrumbs, and move/create dialogs
 */
const meta = {
  title: 'xDrive Design System/Google Drive Explorer',
  component: DriveFilePreviewCard,
  subcomponents: {
    DriveBreadcrumbBar,
    DriveFolderCard,
    DriveFileIconTile,
    DriveFileListTable,
    DriveFolderDialog,
    DriveMoveDialog,
    DriveTrashList,
    DrivePermanentDeleteDialog,
  },
  args: {
    doc: DEFAULT_SEED.docs[0],
  },
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DriveFilePreviewCard>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Full interactive Drive browser with nested folder navigation, drag-and-drop move, folder creation/rename, and view switching.
 *
 * @summary Interactive Drive browser with folders, search, and drag-and-drop
 */
export const InteractiveDriveBrowser: Story = {
  name: 'Interactive Google Drive Browser',
  render: () => <InteractiveDriveBrowserDemo />,
}

/**
 * Three-column preview card grid rendering rich document thumbnails.
 *
 * @summary Preview cards grid view
 */
export const PreviewCardView: Story = {
  name: 'View Mode · Preview Cards',
  render: () => {
    const { docs, folders } = DEFAULT_SEED
    return (
      <div className="mx-auto max-w-6xl bg-[var(--xd-canvas)] p-6 text-[var(--xd-ink)]">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((doc) => (
            <DriveFilePreviewCard
              key={doc.id}
              doc={doc}
              folderLabel={getFolderPathLabel(
                folders,
                doc.folderId,
                doc.folder,
              )}
            />
          ))}
        </div>
      </div>
    )
  },
}

/**
 * Dense icon tile grid for fast visual scanning across many `.mrbl` files.
 *
 * @summary Compact icon tile grid view
 */
export const IconGridView: Story = {
  name: 'View Mode · Icon Grid',
  render: () => {
    const { docs } = DEFAULT_SEED
    return (
      <div className="mx-auto max-w-5xl bg-[var(--xd-canvas)] p-6 text-[var(--xd-ink)]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {docs.map((doc) => (
            <DriveFileIconTile key={doc.id} doc={doc} />
          ))}
        </div>
      </div>
    )
  },
}

/**
 * Tabular Drive list view combining folders and documents with path resolution and actions.
 *
 * @summary Tabular Drive list view
 */
export const ListView: Story = {
  name: 'View Mode · List Table',
  render: () => {
    const { docs, folders } = DEFAULT_SEED
    const counts = getFolderItemCounts(folders, docs)
    return (
      <div className="mx-auto max-w-6xl bg-[var(--xd-canvas)] p-6 text-[var(--xd-ink)]">
        <DriveFileListTable
          folders={folders.filter((f) => f.parentId === null)}
          folderCounts={counts}
          docs={docs}
          resolveFolderLabel={(doc) =>
            getFolderPathLabel(folders, doc.folderId, doc.folder)
          }
        />
      </div>
    )
  },
}

/**
 * Breadcrumb path header paired with color-coded folder cards.
 *
 * @summary Folder strip and breadcrumb bar
 */
export const FolderStripAndBreadcrumbs: Story = {
  name: 'Folders & Breadcrumbs',
  render: () => {
    const { folders, docs } = DEFAULT_SEED
    const counts = getFolderItemCounts(folders, docs)
    return (
      <div className="mx-auto max-w-5xl space-y-5 bg-[var(--xd-canvas)] p-6 text-[var(--xd-ink)]">
        <DriveBreadcrumbBar
          ancestors={folders.slice(0, 2)}
          folderCount={folders.length}
          itemCount={docs.length}
          onCreateFolder={() => {}}
        />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {folders.map((folder) => (
            <DriveFolderCard
              key={folder.id}
              folder={folder}
              itemCount={counts.get(folder.id)?.total ?? 0}
              onRename={() => {}}
              onDelete={() => {}}
              onCreateSubfolder={() => {}}
            />
          ))}
        </div>
      </div>
    )
  },
}

function InteractiveTrashDemo() {
  const seed = useMemo(() => {
    const now = Date.now()
    const base = makeStorySeed()
    return {
      folders: base.folders,
      docs: base.docs.slice(0, 3).map((doc, idx) => ({
        ...doc,
        trashedAt: new Date(
          now - (idx === 0 ? 1 : idx === 1 ? 14 : 27) * 24 * 60 * 60 * 1000,
        ).toISOString(),
      })),
    }
  }, [])
  const [trashedDocs, setTrashedDocs] = useState<MarbleDocumentFile[]>(
    seed.docs,
  )
  const [confirmTarget, setConfirmTarget] = useState<
    { mode: 'single'; doc: MarbleDocumentFile } | { mode: 'empty' } | null
  >(null)

  return (
    <div className="mx-auto max-w-6xl space-y-4 bg-[var(--xd-canvas)] p-6 text-[var(--xd-ink)]">
      <h1 className="text-[16px] font-semibold tracking-tight">Trash</h1>
      <DriveTrashList
        docs={trashedDocs}
        retentionDays={TRASH_RETENTION_DAYS}
        resolveFolderLabel={(doc) =>
          getFolderPathLabel(seed.folders, doc.folderId, doc.folder)
        }
        formatTrashedAt={(iso) =>
          new Date(iso).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })
        }
        onRestoreDoc={(doc) =>
          setTrashedDocs((prev) => prev.filter((item) => item.id !== doc.id))
        }
        onDeleteForeverDoc={(doc) => setConfirmTarget({ mode: 'single', doc })}
        onEmptyTrash={() => setConfirmTarget({ mode: 'empty' })}
      />
      <DrivePermanentDeleteDialog
        open={confirmTarget !== null}
        mode={confirmTarget?.mode ?? 'single'}
        fileName={
          confirmTarget?.mode === 'single'
            ? confirmTarget.doc.title
            : undefined
        }
        itemCount={trashedDocs.length}
        onClose={() => setConfirmTarget(null)}
        onConfirm={() => {
          if (confirmTarget?.mode === 'empty') {
            setTrashedDocs([])
          } else if (confirmTarget?.mode === 'single') {
            setTrashedDocs((prev) =>
              prev.filter((item) => item.id !== confirmTarget.doc.id),
            )
          }
          setConfirmTarget(null)
        }}
      />
    </div>
  )
}

/**
 * Interactive Trash view showing 30-day auto-delete countdowns, restore actions, and permanent delete confirmation.
 *
 * @summary Trash view with restore and permanent deletion
 */
export const TrashView: Story = {
  name: 'Trash · Restore & Permanent Delete',
  render: () => <InteractiveTrashDemo />,
}
