import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DRIVE_HIDDEN_DIRS,
  DRIVE_HIDDEN_DIR_NAMES,
  HISTORY_DIR_NAME,
  isHiddenDriveEntry,
} from './drive-hidden'
import {
  createFolderOnDisk,
  deleteDocumentPermanentlyOnDisk,
  deleteFolderOnDisk,
  emptyTrashOnDisk,
  getTrashDir,
  listDriveSummary,
  listTemplatesOnDisk,
  loadDriveWorkspace,
  moveDocumentOnDisk,
  purgeExpiredTrashOnDisk,
  renameDocumentOnDisk,
  renameFolderOnDisk,
  restoreDocumentOnDisk,
  saveDocumentToDisk,
  trashDocumentOnDisk,
} from './drive-storage.server'
import { countMarbleNodes } from './engine-client'
import {
  createVersion,
  getDocVersionHistoryDir,
  getVersion,
  getVersionHistoryRootDir,
  hashVersionSource,
  listVersions,
  restoreVersion,
  selectVersionsToPrune,
  shouldCreateAutoSnapshot,
} from './version-history.server'
import {
  AUTO_SNAPSHOT_INTERVAL_MS,
  DEFAULT_VERSION_RETENTION_POLICY,
} from './version-history-types'
import type { DocumentVersionSummary } from './version-history-types'
import { GET as marbleGet } from '#/routes/api.marble'
import { GET as versionsGet, POST as versionsPost } from '#/routes/api.versions'

function makeHtml(heading: string, body = 'Paragraph content') {
  return `<!doctype html>
<html lang="en" data-marble="1">
<head><meta charset="utf-8"><title>${heading}</title></head>
<body>
  <main data-marble-id="root">
    <h1 data-marble-id="h1" data-marble-editable>${heading}</h1>
    <p data-marble-id="p1" data-marble-editable>${body}</p>
  </main>
</body>
</html>`
}

describe('version-history server storage and lifecycle', () => {
  let tempDir: string
  let previousDriveDir: string | undefined

  beforeEach(async () => {
    previousDriveDir = process.env.XDRIVE_DRIVE_DIR
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'xdrive-vh-test-'))
    process.env.XDRIVE_DRIVE_DIR = tempDir
  })

  afterEach(async () => {
    if (previousDriveDir === undefined) {
      delete process.env.XDRIVE_DRIVE_DIR
    } else {
      process.env.XDRIVE_DRIVE_DIR = previousDriveDir
    }
    await rm(tempDir, { recursive: true, force: true })
  })

  it('1. exports hidden-dir constants/helpers and excludes .history from Drive, Templates, and Trash listings', async () => {
    expect(HISTORY_DIR_NAME).toBe('.history')
    expect(DRIVE_HIDDEN_DIRS).toContain('.history')
    expect(DRIVE_HIDDEN_DIRS).toContain('.trash')
    expect(DRIVE_HIDDEN_DIRS).toContain('.xdrive')
    expect(DRIVE_HIDDEN_DIR_NAMES.has('.history')).toBe(true)

    expect(isHiddenDriveEntry('.history')).toBe(true)
    expect(isHiddenDriveEntry('.history/doc-1/snapshots/v1.mrbl')).toBe(true)
    expect(isHiddenDriveEntry('Papers/.history/ghost.mrbl')).toBe(true)
    expect(isHiddenDriveEntry('.trash\\foo.mrbl')).toBe(true)
    expect(isHiddenDriveEntry('.xdrive/metadata.json')).toBe(true)
    expect(isHiddenDriveEntry('.DS_Store')).toBe(true)
    expect(isHiddenDriveEntry('Papers/quantum-note.mrbl')).toBe(false)
    expect(isHiddenDriveEntry('')).toBe(false)

    await saveDocumentToDisk({
      slug: 'visible-note',
      folderPath: 'Papers',
      source: makeHtml('Visible Note'),
      meta: { id: 'doc-visible', title: 'Visible Note' },
    })

    // Also plant decoy .mrbl files directly inside .history and .trash/.history
    const historyDir = getDocVersionHistoryDir('doc-visible')
    await mkdir(path.join(historyDir, 'snapshots'), { recursive: true })
    await writeFile(
      path.join(getVersionHistoryRootDir(), 'rogue-top-level.mrbl'),
      makeHtml('Rogue History File'),
      'utf8',
    )
    await mkdir(path.join(getTrashDir(), '.history'), { recursive: true })
    await writeFile(
      path.join(getTrashDir(), '.history', 'nested-trash-history.mrbl'),
      makeHtml('Nested Trash History'),
      'utf8',
    )

    const workspace = await loadDriveWorkspace(countMarbleNodes)
    expect(workspace.folders.some((f) => f.name.startsWith('.'))).toBe(false)
    expect(workspace.docs.some((d) => d.slug === 'rogue-top-level')).toBe(false)
    expect(workspace.docs.some((d) => d.slug === 'nested-trash-history')).toBe(
      false,
    )
    expect(
      workspace.docs.some((d) => d.slug === 'visible-note' && !d.trashedAt),
    ).toBe(true)

    const summary = await listDriveSummary(countMarbleNodes, () => ({
      errors: 0,
      warnings: 0,
      findings: [],
    }))
    expect(summary.folders.some((p) => isHiddenDriveEntry(p))).toBe(false)
    expect(summary.documents.some((d) => d.slug === 'rogue-top-level')).toBe(
      false,
    )

    const templates = await listTemplatesOnDisk(countMarbleNodes)
    expect(templates.some((t) => t.slug === 'rogue-top-level')).toBe(false)

    const trashRes = await marbleGet({
      request: new Request('http://localhost/api/marble?action=trash'),
    })
    const trashPayload = (await trashRes.json()) as {
      ok: boolean
      documents: Array<{ slug: string }>
    }
    expect(trashPayload.ok).toBe(true)
    expect(trashPayload.documents).toHaveLength(0)
  })

  it('2. auto-snapshots on save with hash deduplication, interval throttling, and legacy baseline preservation', async () => {
    const t0 = Date.parse('2026-11-28T10:00:00.000Z')
    const v1Source = makeHtml('Doc V1', 'Initial paragraph')
    const v2Source = makeHtml('Doc V2', 'Rapid edit within throttle')
    const v3Source = makeHtml('Doc V3', 'Edit after interval')

    await saveDocumentToDisk({
      slug: 'research-memo',
      folderPath: '',
      source: v1Source,
      meta: { id: 'doc-memo', title: 'Research Memo' },
      nowMs: t0,
    })

    let versions = await listVersions('doc-memo')
    expect(versions).toHaveLength(1)
    expect(versions[0].kind).toBe('auto')
    expect(versions[0].trigger).toBe('autosave')
    expect(versions[0].contentHash).toBe(hashVersionSource(v1Source))

    // Identical source beyond interval -> skipped as unchanged
    await saveDocumentToDisk({
      slug: 'research-memo',
      folderPath: '',
      source: v1Source,
      meta: { id: 'doc-memo', title: 'Research Memo' },
      nowMs: t0 + AUTO_SNAPSHOT_INTERVAL_MS + 10_000,
    })
    versions = await listVersions('doc-memo')
    expect(versions).toHaveLength(1)

    // Changed content within throttle window -> skipped (throttled)
    await saveDocumentToDisk({
      slug: 'research-memo',
      folderPath: '',
      source: v2Source,
      meta: { id: 'doc-memo', title: 'Research Memo' },
      nowMs: t0 + 60_000,
    })
    versions = await listVersions('doc-memo')
    expect(versions).toHaveLength(1)

    // Changed content after throttle interval -> new auto snapshot created
    await saveDocumentToDisk({
      slug: 'research-memo',
      folderPath: '',
      source: v3Source,
      meta: { id: 'doc-memo', title: 'Research Memo' },
      nowMs: t0 + AUTO_SNAPSHOT_INTERVAL_MS + 1_000,
    })
    versions = await listVersions('doc-memo')
    expect(versions).toHaveLength(2)
    expect(versions[0].contentHash).toBe(hashVersionSource(v3Source))
    expect(versions[1].contentHash).toBe(hashVersionSource(v1Source))

    // Pure shouldCreateAutoSnapshot guard checks
    expect(
      shouldCreateAutoSnapshot(
        versions,
        hashVersionSource(v3Source),
        t0 + AUTO_SNAPSHOT_INTERVAL_MS * 3,
      ),
    ).toEqual({ create: false, reason: 'unchanged' })
    expect(
      shouldCreateAutoSnapshot(
        versions,
        hashVersionSource('different'),
        t0 + AUTO_SNAPSHOT_INTERVAL_MS + 5_000,
      ),
    ).toEqual({ create: false, reason: 'throttled' })

    // Pre-existing raw .mrbl file without history captures baseline before first edit
    const rawOriginal = makeHtml('Raw On Disk', 'Original raw text')
    const rawFile = path.join(tempDir, 'legacy-raw.mrbl')
    await writeFile(rawFile, rawOriginal, 'utf8')
    const oldMtime = new Date(t0 - 10 * 60 * 1000)
    await utimes(rawFile, oldMtime, oldMtime)

    const loaded = await loadDriveWorkspace(countMarbleNodes)
    const legacyDoc = loaded.docs.find((d) => d.slug === 'legacy-raw')
    expect(legacyDoc).toBeDefined()

    const editedRaw = makeHtml('Raw On Disk', 'Updated after load')
    await saveDocumentToDisk({
      slug: 'legacy-raw',
      folderPath: '',
      source: editedRaw,
      meta: { id: legacyDoc!.id, title: 'Raw On Disk' },
      nowMs: t0,
    })
    const legacyVersions = await listVersions(legacyDoc!.id)
    expect(legacyVersions).toHaveLength(2)
    expect(legacyVersions[0].contentHash).toBe(hashVersionSource(editedRaw))
    expect(legacyVersions[1].contentHash).toBe(hashVersionSource(rawOriginal))
  })

  it('3. enforces retention policy: 24h all, 7d hourly, 30d daily, per-doc cap, and never prunes named versions', async () => {
    const nowMs = Date.parse('2026-11-28T12:00:00.000Z')
    const hour = 60 * 60 * 1000
    const day = 24 * hour

    const mkSummary = (
      id: string,
      ageMs: number,
      kind: 'auto' | 'named' = 'auto',
    ): DocumentVersionSummary => ({
      id,
      docId: 'doc-ret',
      slug: 'ret-doc',
      title: 'Retention Doc',
      category: 'document',
      kind,
      trigger: kind === 'named' ? 'manual' : 'autosave',
      ...(kind === 'named' ? { label: `Release ${id}` } : {}),
      createdAt: new Date(nowMs - ageMs).toISOString(),
      contentHash: hashVersionSource(id),
      byteSize: 100,
      nodeCount: 2,
    })

    const fixtures: DocumentVersionSummary[] = [
      // Within 24h: all kept
      mkSummary('recent-1', 10 * 60 * 1000),
      mkSummary('recent-2', 20 * 60 * 1000),
      mkSummary('recent-3', 5 * hour),
      // Within 7d (same hour bucket -> keep newest in bucket)
      mkSummary('hour-a-new', 48 * hour + 5 * 60 * 1000),
      mkSummary('hour-a-old', 48 * hour + 30 * 60 * 1000),
      mkSummary('hour-b', 50 * hour),
      // Within 30d (same day bucket -> keep newest in bucket)
      mkSummary('day-a-new', 12 * day + 2 * hour),
      mkSummary('day-a-old', 12 * day + 6 * hour),
      mkSummary('day-b', 15 * day),
      // Beyond 30d: auto pruned, named ALWAYS kept
      mkSummary('expired-auto', 35 * day),
      mkSummary('ancient-named', 90 * day, 'named'),
    ]

    const { kept, pruned } = selectVersionsToPrune(
      fixtures,
      nowMs,
      DEFAULT_VERSION_RETENTION_POLICY,
    )
    const keptIds = new Set(kept.map((v) => v.id))
    const prunedIds = new Set(pruned.map((v) => v.id))

    expect(keptIds.has('recent-1')).toBe(true)
    expect(keptIds.has('recent-2')).toBe(true)
    expect(keptIds.has('recent-3')).toBe(true)
    expect(keptIds.has('hour-a-new')).toBe(true)
    expect(prunedIds.has('hour-a-old')).toBe(true)
    expect(keptIds.has('hour-b')).toBe(true)
    expect(keptIds.has('day-a-new')).toBe(true)
    expect(prunedIds.has('day-a-old')).toBe(true)
    expect(keptIds.has('day-b')).toBe(true)
    expect(prunedIds.has('expired-auto')).toBe(true)
    expect(keptIds.has('ancient-named')).toBe(true)

    // Disk pruning + maxAutoVersions cap (named versions exempt from cap)
    const t0 = Date.parse('2026-11-28T00:00:00.000Z')
    await saveDocumentToDisk({
      slug: 'capped-doc',
      folderPath: '',
      source: makeHtml('V0'),
      meta: { id: 'doc-cap', title: 'Capped Doc' },
      nowMs: t0,
    })
    const namedRes = await createVersion({
      docId: 'doc-cap',
      slug: 'capped-doc',
      kind: 'named',
      label: 'Milestone Alpha',
      nowMs: t0 + 1_000,
    })
    expect(namedRes.created).toBe(true)

    const tightPolicy = {
      ...DEFAULT_VERSION_RETENTION_POLICY,
      maxAutoVersions: 2,
    }
    const auto1 = await createVersion({
      docId: 'doc-cap',
      slug: 'capped-doc',
      source: makeHtml('Auto 1'),
      kind: 'auto',
      nowMs: t0 + 10 * 60 * 1000,
      policy: tightPolicy,
    })
    const auto2 = await createVersion({
      docId: 'doc-cap',
      slug: 'capped-doc',
      source: makeHtml('Auto 2'),
      kind: 'auto',
      nowMs: t0 + 20 * 60 * 1000,
      policy: tightPolicy,
    })
    expect(auto1.created).toBe(true)
    expect(auto2.created).toBe(true)
    expect(auto2.prunedIds.length).toBe(1)

    const remaining = await listVersions('doc-cap')
    expect(remaining.filter((v) => v.kind === 'auto')).toHaveLength(2)
    expect(remaining.some((v) => v.id === namedRes.version!.id)).toBe(true)

    // Pruned snapshot file was deleted from disk
    const prunedFile = path.join(
      getDocVersionHistoryDir('doc-cap'),
      'snapshots',
      `${auto2.prunedIds[0]}.mrbl`,
    )
    await expect(stat(prunedFile)).rejects.toThrow()
  })

  it('4. manual named versions allow labels even with unchanged hash and reject empty labels', async () => {
    const t0 = Date.parse('2026-11-28T10:00:00.000Z')
    const source = makeHtml('Named Test', 'Same text')
    await saveDocumentToDisk({
      slug: 'named-doc',
      folderPath: '',
      source,
      meta: { id: 'doc-named', title: 'Named Test' },
      nowMs: t0,
    })

    await expect(
      createVersion({
        docId: 'doc-named',
        kind: 'named',
        label: '   ',
        nowMs: t0 + 5_000,
      }),
    ).rejects.toMatchObject({ status: 400 })

    const created = await createVersion({
      docId: 'doc-named',
      kind: 'named',
      label: 'Ready for review',
      author: 'Ada',
      nowMs: t0 + 5_000,
    })
    expect(created.created).toBe(true)
    expect(created.version?.kind).toBe('named')
    expect(created.version?.label).toBe('Ready for review')
    expect(created.version?.author).toBe('Ada')
    expect(created.versions).toHaveLength(2)
  })

  it('5. restore snapshots current state first so restore itself is undoable and refuses trashed docs', async () => {
    const t0 = Date.parse('2026-11-28T10:00:00.000Z')
    const v1 = makeHtml('Draft 1', 'First version body')
    const v2 = makeHtml('Draft 2', 'Second version body')

    await saveDocumentToDisk({
      slug: 'restore-target',
      folderPath: 'Papers',
      source: v1,
      meta: { id: 'doc-restore', title: 'Restore Target' },
      nowMs: t0,
    })
    const savedV1 = await listVersions('doc-restore')
    const v1Id = savedV1[0].id

    // Save v2 after interval
    await saveDocumentToDisk({
      slug: 'restore-target',
      folderPath: 'Papers',
      source: v2,
      meta: { id: 'doc-restore', title: 'Restore Target' },
      nowMs: t0 + AUTO_SNAPSHOT_INTERVAL_MS + 1_000,
    })

    // Restore back to v1 right away (within throttle window!)
    const restored = await restoreVersion({
      docId: 'doc-restore',
      versionId: v1Id,
      nowMs: t0 + AUTO_SNAPSHOT_INTERVAL_MS + 5_000,
    })

    expect(restored.ok).toBe(true)
    expect(restored.source).toBe(v1)
    expect(restored.preRestoreVersion.trigger).toBe('pre-restore')
    expect(restored.preRestoreVersion.contentHash).toBe(hashVersionSource(v2))

    const onDiskAfterRestore = await readFile(
      path.join(tempDir, 'Papers', 'restore-target.mrbl'),
      'utf8',
    )
    expect(onDiskAfterRestore).toBe(v1)

    const preRestoreDetail = await getVersion(
      'doc-restore',
      restored.preRestoreVersion.id,
    )
    expect(preRestoreDetail?.source).toBe(v2)

    // Undo the restore by restoring the pre-restore snapshot
    const undone = await restoreVersion({
      docId: 'doc-restore',
      versionId: restored.preRestoreVersion.id,
      nowMs: t0 + AUTO_SNAPSHOT_INTERVAL_MS + 10_000,
    })
    expect(undone.source).toBe(v2)
    expect(
      await readFile(
        path.join(tempDir, 'Papers', 'restore-target.mrbl'),
        'utf8',
      ),
    ).toBe(v2)

    // Refuse restore while document is in Trash
    await trashDocumentOnDisk({
      slug: 'restore-target',
      folderPath: 'Papers',
    })
    await expect(
      restoreVersion({
        docId: 'doc-restore',
        versionId: v1Id,
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('6. preserves history across document rename, document move, folder rename, and folder delete', async () => {
    const t0 = Date.parse('2026-11-28T10:00:00.000Z')
    await createFolderOnDisk({ name: 'Drafts' })
    await saveDocumentToDisk({
      slug: 'alpha-spec',
      folderPath: 'Drafts',
      source: makeHtml('Alpha Spec', 'Line 1'),
      meta: { id: 'doc-alpha', title: 'Alpha Spec' },
      nowMs: t0,
    })
    await createVersion({
      docId: 'doc-alpha',
      kind: 'named',
      label: 'Initial Spec',
      nowMs: t0 + 1_000,
    })

    const renamed = await renameDocumentOnDisk({
      slug: 'alpha-spec',
      folderPath: 'Drafts',
      title: 'Beta Spec',
    })
    expect(renamed.id).toBe('doc-alpha')
    expect(renamed.slug).toBe('beta-spec')
    expect(await listVersions('doc-alpha')).toHaveLength(2)

    await createFolderOnDisk({ name: 'Archive' })
    await moveDocumentOnDisk({
      slug: 'beta-spec',
      fromFolderPath: 'Drafts',
      toFolderPath: 'Archive',
    })
    await renameFolderOnDisk({
      oldPath: 'Archive',
      newName: 'Published',
    })
    await deleteFolderOnDisk({ folderPath: 'Published' })

    const versionsAfterMoves = await listVersions('doc-alpha')
    expect(versionsAfterMoves).toHaveLength(2)

    // Restoring works at the final location
    const restored = await restoreVersion({
      docId: 'doc-alpha',
      versionId: versionsAfterMoves[0].id,
      nowMs: t0 + 5_000,
    })
    expect(restored.relPath).toBe('beta-spec.mrbl')
  })

  it('7. keeps history on trash, reconnects on restore, and deletes on permanent delete / empty trash / expiry purge', async () => {
    const t0 = Date.parse('2026-11-28T10:00:00.000Z')
    await saveDocumentToDisk({
      slug: 'trash-cycle',
      folderPath: '',
      source: makeHtml('Trash Cycle V1'),
      meta: { id: 'doc-trash-cycle', title: 'Trash Cycle' },
      nowMs: t0,
    })
    await createVersion({
      docId: 'doc-trash-cycle',
      kind: 'named',
      label: 'Before trash',
      nowMs: t0 + 1_000,
    })

    // Trash keeps history
    await trashDocumentOnDisk({ slug: 'trash-cycle', folderPath: '' })
    expect(await listVersions('doc-trash-cycle')).toHaveLength(2)

    // Restore from trash reconnects history
    const restoredDoc = await restoreDocumentOnDisk({ slug: 'trash-cycle' })
    expect(restoredDoc.restoredOnDisk).toBe(true)
    expect(await listVersions('doc-trash-cycle')).toHaveLength(2)

    // Permanent delete removes history directory
    await deleteDocumentPermanentlyOnDisk({
      slug: 'trash-cycle',
      folderPath: '',
    })
    expect(await listVersions('doc-trash-cycle')).toHaveLength(0)
    await expect(
      stat(getDocVersionHistoryDir('doc-trash-cycle')),
    ).rejects.toThrow()

    // Empty trash removes history directory
    await saveDocumentToDisk({
      slug: 'empty-me',
      folderPath: '',
      source: makeHtml('Empty Me'),
      meta: { id: 'doc-empty-me', title: 'Empty Me' },
      nowMs: t0,
    })
    await trashDocumentOnDisk({ slug: 'empty-me', folderPath: '' })
    expect(await listVersions('doc-empty-me')).toHaveLength(1)
    await emptyTrashOnDisk(['doc-empty-me'])
    expect(await listVersions('doc-empty-me')).toHaveLength(0)
    await expect(
      stat(getDocVersionHistoryDir('doc-empty-me')),
    ).rejects.toThrow()

    // Expired trash purge removes history directory
    await saveDocumentToDisk({
      slug: 'expire-me',
      folderPath: '',
      source: makeHtml('Expire Me'),
      meta: { id: 'doc-expire-me', title: 'Expire Me' },
      nowMs: t0,
    })
    await trashDocumentOnDisk({
      slug: 'expire-me',
      folderPath: '',
      trashedAt: '2020-01-01T00:00:00.000Z',
      retentionDays: 1,
    })
    await purgeExpiredTrashOnDisk(1)
    expect(await listVersions('doc-expire-me')).toHaveLength(0)
    await expect(
      stat(getDocVersionHistoryDir('doc-expire-me')),
    ).rejects.toThrow()
  })

  it('8. /api/versions handles GET list/detail and POST create/restore with validation errors', async () => {
    const t0 = Date.parse('2026-11-28T10:00:00.000Z')
    const initialSource = makeHtml('API Doc', 'Version A')
    const updatedSource = makeHtml('API Doc', 'Version B')

    await saveDocumentToDisk({
      slug: 'api-doc',
      folderPath: '',
      source: initialSource,
      meta: { id: 'doc-api', title: 'API Doc' },
      nowMs: t0,
    })

    const createRes = await versionsPost({
      request: new Request('http://localhost/api/versions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          docId: 'doc-api',
          slug: 'api-doc',
          label: 'Checkpoint One',
          source: initialSource,
        }),
      }),
    })
    expect(createRes.status).toBe(200)
    const createdPayload = (await createRes.json()) as {
      ok: boolean
      version: DocumentVersionSummary
      versions: DocumentVersionSummary[]
    }
    expect(createdPayload.ok).toBe(true)
    expect(createdPayload.version.label).toBe('Checkpoint One')

    // Edit document
    await saveDocumentToDisk({
      slug: 'api-doc',
      folderPath: '',
      source: updatedSource,
      meta: { id: 'doc-api', title: 'API Doc' },
      nowMs: t0 + AUTO_SNAPSHOT_INTERVAL_MS + 1_000,
    })

    // List via GET
    const listRes = await versionsGet({
      request: new Request('http://localhost/api/versions?docId=doc-api'),
    })
    expect(listRes.status).toBe(200)
    const listPayload = (await listRes.json()) as {
      ok: boolean
      versions: DocumentVersionSummary[]
    }
    expect(listPayload.ok).toBe(true)
    expect(listPayload.versions.length).toBeGreaterThanOrEqual(2)

    // Detail via GET
    const detailRes = await versionsGet({
      request: new Request(
        `http://localhost/api/versions?docId=doc-api&versionId=${createdPayload.version.id}`,
      ),
    })
    expect(detailRes.status).toBe(200)
    const detailPayload = (await detailRes.json()) as {
      ok: boolean
      version: { source: string }
    }
    expect(detailPayload.version.source).toBe(initialSource)

    // Restore via POST
    const restoreRes = await versionsPost({
      request: new Request('http://localhost/api/versions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'restore',
          docId: 'doc-api',
          versionId: createdPayload.version.id,
        }),
      }),
    })
    expect(restoreRes.status).toBe(200)
    const restorePayload = (await restoreRes.json()) as {
      ok: boolean
      source: string
      preRestoreVersion: DocumentVersionSummary
    }
    expect(restorePayload.ok).toBe(true)
    expect(restorePayload.source).toBe(initialSource)
    expect(restorePayload.preRestoreVersion.trigger).toBe('pre-restore')

    // Validation errors
    const missingDocRes = await versionsGet({
      request: new Request('http://localhost/api/versions'),
    })
    expect(missingDocRes.status).toBe(400)

    const missingVersionRes = await versionsGet({
      request: new Request(
        'http://localhost/api/versions?docId=doc-api&versionId=does-not-exist',
      ),
    })
    expect(missingVersionRes.status).toBe(404)
  })
})
