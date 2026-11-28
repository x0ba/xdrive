import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createChatThread,
  deleteChatThread,
  patchChatThread,
} from '#/lib/ai/chat-storage.server'
import {
  createFolderOnDisk,
  deleteDocumentPermanentlyOnDisk,
  deleteFolderOnDisk,
  emptyTrashOnDisk,
  moveDocumentOnDisk,
  renameDocumentOnDisk,
  renameFolderOnDisk,
  restoreDocumentOnDisk,
  saveDocumentToDisk,
  trashDocumentOnDisk,
  updateDocumentMetaOnDisk,
} from '#/lib/marble/drive-storage.server'
import { whiteboardStateScript } from '#/lib/marble/whiteboard-document'
import { GET as searchGet, POST as searchPost } from '#/routes/api.search'
import {
  getSearchIndexFilePath,
  rebuildDriveSearchIndex,
  resetDriveSearchCache,
  searchDrive,
} from './drive-search.server'

function makeHtmlDoc(title: string, bodyText: string): string {
  return `<!doctype html>
<html lang="en" data-marble="1">
<head><meta charset="utf-8"><title>${title}</title></head>
<body><main data-marble-id="root"><h1 data-marble-id="h1">${title}</h1><p data-marble-id="p1">${bodyText}</p></main></body>
</html>`
}

function makeWhiteboardDoc(title: string, shapeText: string): string {
  const snapshot = {
    document: {
      store: {
        'document:document': { id: 'document:document', typeName: 'document' },
        'page:page': { id: 'page:page', typeName: 'page', name: 'Page 1' },
        'shape:node1': {
          id: 'shape:node1',
          typeName: 'shape',
          type: 'text',
          index: 'a1',
          props: {
            richText: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: shapeText }],
                },
              ],
            },
          },
        },
      },
    },
    session: { version: 0 },
  }
  return `<!doctype html>
<html lang="en" data-marble="1">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
<main data-marble-id="whiteboard"><p data-marble-id="whiteboard-lede">An infinite canvas. Draw on it in xDrive and this file keeps the tldraw snapshot.</p></main>
${whiteboardStateScript(snapshot)}
</body>
</html>`
}

describe('drive-search.server', () => {
  let tempDir: string
  let previousDriveDir: string | undefined

  beforeEach(async () => {
    previousDriveDir = process.env.XDRIVE_DRIVE_DIR
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'xdrive-search-test-'))
    process.env.XDRIVE_DRIVE_DIR = tempDir
    resetDriveSearchCache()
  })

  afterEach(async () => {
    resetDriveSearchCache()
    if (previousDriveDir === undefined) {
      delete process.env.XDRIVE_DRIVE_DIR
    } else {
      process.env.XDRIVE_DRIVE_DIR = previousDriveDir
    }
    await rm(tempDir, { recursive: true, force: true })
  })

  it('indexes documents, tldraw whiteboards, folders, and chat threads with canonical shareable hrefs', async () => {
    const createdFolder = await createFolderOnDisk({
      id: 'folder-qec',
      name: 'Quantum Topology',
    })
    expect(createdFolder.folder.id).toBe('folder-qec')

    await saveDocumentToDisk({
      slug: 'decoder-notes',
      folderPath: 'Quantum Topology',
      source: makeHtmlDoc(
        'Decoder Notes',
        'Minimum-weight perfect matching for topological syndromes.',
      ),
      meta: {
        id: 'doc-decoder-1',
        title: 'Decoder Notes',
        tags: ['topological', 'qec'],
      },
    })

    await saveDocumentToDisk({
      slug: 'lattice-board',
      folderPath: '',
      source: makeWhiteboardDoc(
        'Lattice Whiteboard',
        'Topological stabilizer braiding diagram',
      ),
      meta: {
        id: 'wb-lattice-1',
        title: 'Lattice Whiteboard',
        category: 'whiteboard',
      },
    })

    await createChatThread({
      id: 'chat-topo-99',
      title: 'Topological Review',
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'Check topological invariants across the lattice board.',
        },
      ],
    })

    const res = await searchDrive({ query: 'topological' })
    expect(res.counts).toEqual({
      all: 3,
      document: 1,
      whiteboard: 1,
      folder: 0,
      chat: 1,
    })

    const byId = new Map(res.results.map((item) => [item.id, item]))
    expect(byId.get('doc-decoder-1')).toMatchObject({
      type: 'document',
      href: '/d/doc-decoder-1/decoder-notes',
      location: 'Quantum Topology',
    })
    expect(byId.get('wb-lattice-1')).toMatchObject({
      type: 'whiteboard',
      href: '/d/wb-lattice-1/lattice-board',
    })
    expect(byId.get('chat-topo-99')).toMatchObject({
      type: 'chat',
      href: '/chat/chat-topo-99',
      location: 'Drive Chat',
    })

    const folderRes = await searchDrive({ query: 'quantum', types: ['folder'] })
    expect(folderRes.results).toHaveLength(1)
    expect(folderRes.results[0]).toMatchObject({
      id: 'folder-qec',
      type: 'folder',
      href: '/f/folder-qec/quantum-topology',
    })
  })

  it('stays synchronized across document, folder, trash, and chat lifecycle mutations', async () => {
    await createFolderOnDisk({ id: 'fld-lab', name: 'CryoLab' })
    await saveDocumentToDisk({
      slug: 'drift-log',
      folderPath: 'CryoLab',
      source: makeHtmlDoc('Drift Log', 'Initial fluxonium measurement.'),
      meta: { id: 'doc-drift', title: 'Drift Log' },
    })

    expect((await searchDrive({ query: 'fluxonium' })).total).toBe(1)

    // Save edited content
    await saveDocumentToDisk({
      slug: 'drift-log',
      folderPath: 'CryoLab',
      source: makeHtmlDoc('Drift Log', 'Updated transmon coherence.'),
    })
    expect((await searchDrive({ query: 'fluxonium' })).total).toBe(0)
    expect((await searchDrive({ query: 'transmon' })).total).toBe(1)

    // Update metadata
    await updateDocumentMetaOnDisk({
      slug: 'drift-log',
      folderPath: 'CryoLab',
      meta: { title: 'Coherence Report', tags: ['benchmark'] },
    })
    const afterMeta = await searchDrive({ query: 'benchmark' })
    expect(afterMeta.results[0].title).toBe('Coherence Report')

    // Rename document
    await renameDocumentOnDisk({
      slug: 'drift-log',
      folderPath: 'CryoLab',
      title: 'Renamed Spectroscopy',
      nextSlug: 'renamed-spectroscopy',
    })
    const afterRename = await searchDrive({ query: 'spectroscopy' })
    expect(afterRename.results[0].href).toBe(
      '/d/doc-drift/renamed-spectroscopy',
    )

    // Rename folder updates folder & child location
    await renameFolderOnDisk({ oldPath: 'CryoLab', newName: 'PhotonicsLab' })
    const afterFolderRename = await searchDrive({ query: 'photonicslab' })
    expect(afterFolderRename.results.map((r) => r.type).sort()).toEqual([
      'document',
      'folder',
    ])

    // Move document to root
    await moveDocumentOnDisk({
      slug: 'renamed-spectroscopy',
      fromFolderPath: 'PhotonicsLab',
      toFolderPath: '',
    })
    const afterMove = await searchDrive({ query: 'spectroscopy' })
    expect(afterMove.results[0].location).toBe('My Drive')

    // Delete folder
    await deleteFolderOnDisk({ folderPath: 'PhotonicsLab' })
    expect((await searchDrive({ query: 'photonicslab' })).total).toBe(0)

    // Trash excludes by default, includes when includeTrash=true
    await trashDocumentOnDisk({ slug: 'renamed-spectroscopy', folderPath: '' })
    expect((await searchDrive({ query: 'spectroscopy' })).total).toBe(0)
    const trashedHit = await searchDrive({
      query: 'spectroscopy',
      includeTrash: true,
    })
    expect(trashedHit.total).toBe(1)
    expect(trashedHit.results[0].trashed).toBe(true)

    // Restore puts it back in active results
    await restoreDocumentOnDisk({
      slug: 'renamed-spectroscopy',
      targetFolderPath: '',
    })
    const restoredHit = await searchDrive({ query: 'spectroscopy' })
    expect(restoredHit.total).toBe(1)
    expect(restoredHit.results[0].trashed).toBe(false)

    // Permanent delete removes from both active and trash
    await deleteDocumentPermanentlyOnDisk({
      slug: 'renamed-spectroscopy',
      folderPath: '',
    })
    expect(
      (await searchDrive({ query: 'spectroscopy', includeTrash: true })).total,
    ).toBe(0)

    // Empty trash removes trashed entries
    await saveDocumentToDisk({
      slug: 'ephemeral-note',
      folderPath: '',
      source: makeHtmlDoc('Ephemeral Note', 'Temporary ephemeral token.'),
      meta: { id: 'doc-ephemeral', title: 'Ephemeral Note' },
    })
    await trashDocumentOnDisk({ slug: 'ephemeral-note', folderPath: '' })
    expect(
      (await searchDrive({ query: 'ephemeral', includeTrash: true })).total,
    ).toBe(1)
    await emptyTrashOnDisk(['doc-ephemeral'])
    expect(
      (await searchDrive({ query: 'ephemeral', includeTrash: true })).total,
    ).toBe(0)

    // Chat create, patch, delete
    await createChatThread({
      id: 'chat-life-1',
      title: 'Cryostat Calibration',
      messages: [{ id: 'u1', role: 'user', content: 'Initial helium query' }],
    })
    expect((await searchDrive({ query: 'helium' })).total).toBe(1)

    await patchChatThread('chat-life-1', {
      title: 'Nitrogen Calibration',
      messages: [
        {
          id: 'u1',
          role: 'user',
          content: 'Updated nitrogen cooling query',
          createdAt: new Date().toISOString(),
        },
      ],
    })
    expect((await searchDrive({ query: 'helium' })).total).toBe(0)
    expect((await searchDrive({ query: 'nitrogen' })).total).toBe(1)

    await deleteChatThread('chat-life-1')
    expect((await searchDrive({ query: 'nitrogen' })).total).toBe(0)
  })

  it('strictly ignores hidden/dot directories at every nesting depth and internal non-chat JSON stores', async () => {
    await saveDocumentToDisk({
      slug: 'public-note',
      folderPath: 'Research',
      source: makeHtmlDoc('Public Note', 'Shared visible research text.'),
      meta: { id: 'doc-public', title: 'Public Note' },
    })

    // Create hidden directories simulating sibling PRs (.history, .backup, .git, nested .hidden)
    await mkdir(path.join(tempDir, '.history'), { recursive: true })
    await writeFile(
      path.join(tempDir, '.history', 'old-rev.mrbl'),
      makeHtmlDoc('History Secret', 'canary_hidden_history_token'),
      'utf8',
    )
    await mkdir(path.join(tempDir, '.backup'), { recursive: true })
    await writeFile(
      path.join(tempDir, '.backup', 'snapshot.mrbl'),
      makeHtmlDoc('Backup Secret', 'canary_hidden_backup_token'),
      'utf8',
    )
    await mkdir(path.join(tempDir, 'Research', '.hidden-sub'), {
      recursive: true,
    })
    await writeFile(
      path.join(tempDir, 'Research', '.hidden-sub', 'private.mrbl'),
      makeHtmlDoc('Nested Hidden', 'canary_nested_hidden_token'),
      'utf8',
    )
    await mkdir(path.join(tempDir, '.xdrive', 'history'), { recursive: true })
    await writeFile(
      path.join(tempDir, '.xdrive', 'history', 'doc-public.json'),
      JSON.stringify({ note: 'canary_internal_history_token' }),
      'utf8',
    )
    await mkdir(path.join(tempDir, '.xdrive', 'doc-chats'), { recursive: true })
    await writeFile(
      path.join(tempDir, '.xdrive', 'doc-chats', 'doc-public.json'),
      JSON.stringify({ messages: [{ content: 'canary_doc_chat_token' }] }),
      'utf8',
    )

    for (const canary of [
      'canary_hidden_history_token',
      'canary_hidden_backup_token',
      'canary_nested_hidden_token',
      'canary_internal_history_token',
      'canary_doc_chat_token',
    ]) {
      const hit = await searchDrive({ query: canary, includeTrash: true })
      expect(hit.total).toBe(0)
    }

    const folderHits = await searchDrive({ query: 'hidden', types: ['folder'] })
    expect(folderHits.total).toBe(0)
    expect((await searchDrive({ query: 'visible' })).total).toBe(1)
  })

  it('persists relative-only cache under .search/ and recovers gracefully when missing, corrupt, or un-writable', async () => {
    await saveDocumentToDisk({
      slug: 'persist-doc',
      folderPath: 'Notes',
      source: makeHtmlDoc(
        'Persist Doc',
        'Persistent inverted index verification.',
      ),
      meta: { id: 'doc-persist', title: 'Persist Doc' },
    })

    const cacheFile = getSearchIndexFilePath()
    const rawCache = await readFile(cacheFile, 'utf8')
    expect(rawCache).toContain('"version":1')
    // Portable relative keys only — never leak tempDir host paths into the cache.
    expect(rawCache).not.toContain(tempDir)

    // Cold reload from valid persisted cache
    resetDriveSearchCache()
    const fromCache = await searchDrive({ query: 'persistent' })
    expect(fromCache.total).toBe(1)

    // Corrupt cache file -> gracefully rebuilds without throwing
    resetDriveSearchCache()
    await writeFile(cacheFile, '{corrupt json!!!', 'utf8')
    const afterCorrupt = await searchDrive({ query: 'persistent' })
    expect(afterCorrupt.total).toBe(1)

    // Wrong schema version -> gracefully rebuilds
    resetDriveSearchCache()
    await writeFile(cacheFile, JSON.stringify({ version: 999 }), 'utf8')
    const afterWrongVersion = await searchDrive({ query: 'persistent' })
    expect(afterWrongVersion.total).toBe(1)

    // Missing cache file -> gracefully rebuilds
    resetDriveSearchCache()
    await rm(cacheFile, { force: true })
    const afterDelete = await searchDrive({ query: 'persistent' })
    expect(afterDelete.total).toBe(1)

    // Unwritable .search (blocked by regular file) must never break Drive writes or searches
    resetDriveSearchCache()
    await rm(path.dirname(cacheFile), { recursive: true, force: true })
    await writeFile(path.dirname(cacheFile), 'block-dir-creation', 'utf8')

    await saveDocumentToDisk({
      slug: 'unblocked-doc',
      folderPath: '',
      source: makeHtmlDoc('Unblocked Doc', 'Drive writes stay resilient.'),
      meta: { id: 'doc-unblocked', title: 'Unblocked Doc' },
    })
    const resilient = await searchDrive({ query: 'resilient' })
    expect(resilient.total).toBe(1)
  })

  it('serves GET and POST /api/search requests including plural type aliases and rebuild', async () => {
    await saveDocumentToDisk({
      slug: 'api-paper',
      folderPath: '',
      source: makeHtmlDoc('API Paper', 'Endpoint verification manuscript.'),
      meta: { id: 'doc-api-1', title: 'API Paper' },
    })
    await saveDocumentToDisk({
      slug: 'api-board',
      folderPath: '',
      source: makeWhiteboardDoc('API Board', 'Endpoint verification sketch'),
      meta: { id: 'wb-api-1', title: 'API Board', category: 'whiteboard' },
    })

    const getRes = await searchGet({
      request: new Request(
        'http://local/api/search?q=verification&type=whiteboards&limit=10',
      ),
    })
    expect(getRes.status).toBe(200)
    const getBody = (await getRes.json()) as {
      ok: boolean
      total: number
      counts: { all: number; whiteboard: number; document: number }
      results: Array<{ id: string }>
    }
    expect(getBody.ok).toBe(true)
    expect(getBody.total).toBe(1)
    expect(getBody.counts.all).toBe(2)
    expect(getBody.results[0].id).toBe('wb-api-1')

    const postRes = await searchPost({
      request: new Request('http://local/api/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'manuscript', types: ['documents'] }),
      }),
    })
    expect(postRes.status).toBe(200)
    const postBody = (await postRes.json()) as {
      ok: boolean
      results: Array<{ id: string }>
    }
    expect(postBody.results.map((r) => r.id)).toEqual(['doc-api-1'])

    const rebuildRes = await searchPost({
      request: new Request('http://local/api/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'rebuild' }),
      }),
    })
    expect(rebuildRes.status).toBe(200)
    const rebuildBody = (await rebuildRes.json()) as {
      ok: boolean
      indexedCount: number
    }
    expect(rebuildBody.ok).toBe(true)
    expect(rebuildBody.indexedCount).toBeGreaterThanOrEqual(2)

    const badJson = await searchPost({
      request: new Request('http://local/api/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json',
      }),
    })
    expect(badJson.status).toBe(400)

    const manualRebuild = await rebuildDriveSearchIndex()
    expect(manualRebuild.indexedCount).toBeGreaterThanOrEqual(2)
  })
})
