import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DOCUMENT_DESIGN_SYSTEM_SLUG,
  PREDEFINED_MARBLE_TEMPLATES,
  TEMPLATES_FOLDER_ID,
  TEMPLATES_FOLDER_NAME,
  countMarbleNodes,
} from './index'
import {
  createFolderOnDisk,
  deleteDocumentPermanentlyOnDisk,
  deleteFolderOnDisk,
  getTemplatesDir,
  listTemplatesOnDisk,
  loadDriveWorkspace,
  moveDocumentOnDisk,
  renameDocumentOnDisk,
  renameFolderOnDisk,
  restoreDocumentOnDisk,
  saveAsTemplateOnDisk,
  saveDocumentToDisk,
  seedPremadeTemplatesOnDisk,
  trashDocumentOnDisk,
  updateDocumentMetaOnDisk,
} from './drive-storage.server'
import { GET as marbleGet, POST as marblePost } from '#/routes/api.marble'

const SAMPLE_HTML = `<!doctype html>
<html lang="en" data-marble="1">
<head><meta charset="utf-8"><title>Original App</title></head>
<body><main data-marble-id="root"><h1 data-marble-id="h1" data-marble-editable>Original Heading</h1></main></body>
</html>`

describe('drive-storage templates and seeding', () => {
  let tempDir: string
  let previousDriveDir: string | undefined

  beforeEach(async () => {
    previousDriveDir = process.env.XDRIVE_DRIVE_DIR
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'xdrive-tpl-test-'))
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

  it('1. seeds all premade templates into Templates/ on initial load without starring or pinning', async () => {
    const workspace = await loadDriveWorkspace(countMarbleNodes)
    const templatesFolder = workspace.folders.find(
      (folder) => folder.name === TEMPLATES_FOLDER_NAME,
    )
    expect(templatesFolder).toBeDefined()
    expect(templatesFolder?.id).toBe(TEMPLATES_FOLDER_ID)

    const seededDocs = workspace.docs.filter((doc) => doc.isTemplate)
    expect(seededDocs).toHaveLength(PREDEFINED_MARBLE_TEMPLATES.length)
    for (const premade of PREDEFINED_MARBLE_TEMPLATES) {
      const match = seededDocs.find((doc) => doc.id === premade.id)
      expect(match).toBeDefined()
      expect(match?.slug).toBe(premade.slug)
      expect(match?.starred).toBe(false)
      expect(match?.pinned).toBe(false)
      expect(match?.folder).toBe(TEMPLATES_FOLDER_NAME)
      expect(match?.folderId).toBe(templatesFolder?.id)

      const onDisk = await readFile(
        path.join(getTemplatesDir(), `${premade.slug}.mrbl`),
        'utf8',
      )
      expect(onDisk).toBe(premade.source)
    }

    const rawMeta = JSON.parse(
      await readFile(path.join(tempDir, '.xdrive', 'metadata.json'), 'utf8'),
    ) as { templates: { seededIds: string[]; seededAt: string | null } }
    expect(rawMeta.templates.seededIds).toEqual(
      expect.arrayContaining(PREDEFINED_MARBLE_TEMPLATES.map((t) => t.id)),
    )
    expect(rawMeta.templates.seededAt).toBeTruthy()
  })

  it('2. does not overwrite user edits to a seeded template on subsequent seed or load', async () => {
    await loadDriveWorkspace(countMarbleNodes)
    const target = PREDEFINED_MARBLE_TEMPLATES[0]
    const editedSource = target.source.replace(
      'Theorem studio',
      'User Customized Studio',
    )

    await saveDocumentToDisk({
      slug: target.slug,
      folderPath: TEMPLATES_FOLDER_NAME,
      source: editedSource,
      meta: { title: 'Custom Edited Studio', description: 'Edited by user' },
    })

    const reseed = await seedPremadeTemplatesOnDisk()
    expect(reseed.seededSlugs).toHaveLength(0)

    const reloaded = await loadDriveWorkspace(countMarbleNodes)
    const found = reloaded.docs.find((doc) => doc.id === target.id)
    expect(found?.source).toContain('User Customized Studio')
    expect(found?.title).toBe('Custom Edited Studio')
    expect(found?.description).toBe('Edited by user')
  })

  it('3. does not resurrect trashed, permanently deleted, or folder-deleted premade templates', async () => {
    await loadDriveWorkspace(countMarbleNodes)
    const trashedTarget = PREDEFINED_MARBLE_TEMPLATES[0]
    const deletedTarget = PREDEFINED_MARBLE_TEMPLATES[1]

    await trashDocumentOnDisk({
      slug: trashedTarget.slug,
      folderPath: TEMPLATES_FOLDER_NAME,
    })
    await deleteDocumentPermanentlyOnDisk({
      slug: deletedTarget.slug,
      folderPath: TEMPLATES_FOLDER_NAME,
    })

    const afterDeletes = await loadDriveWorkspace(countMarbleNodes)
    expect(
      afterDeletes.docs.find((doc) => doc.id === deletedTarget.id),
    ).toBeUndefined()
    const stillTrashed = afterDeletes.docs.find(
      (doc) => doc.id === trashedTarget.id,
    )
    expect(stillTrashed?.trashedAt).toBeTruthy()
    expect(
      afterDeletes.docs.filter((doc) => !doc.trashedAt && doc.isTemplate),
    ).toHaveLength(PREDEFINED_MARBLE_TEMPLATES.length - 2)

    await deleteFolderOnDisk({ folderPath: TEMPLATES_FOLDER_NAME })
    const afterFolderDelete = await loadDriveWorkspace(countMarbleNodes)
    expect(
      afterFolderDelete.folders.find((f) => f.name === TEMPLATES_FOLDER_NAME),
    ).toBeUndefined()
    // Deleting the folder moved remaining templates up to My Drive root and never resurrected deleted ones.
    expect(
      afterFolderDelete.docs.find((doc) => doc.id === deletedTarget.id),
    ).toBeUndefined()
    expect(
      afterFolderDelete.docs.filter((doc) => !doc.trashedAt && doc.isTemplate),
    ).toHaveLength(0)
  })

  it('4. preserves a pre-existing file in Templates/ when metadata.json is absent', async () => {
    await mkdir(getTemplatesDir(), { recursive: true })
    const preExisting = PREDEFINED_MARBLE_TEMPLATES[0]
    const customHtml = `<!doctype html><html><head><title>Handwritten LaTeX</title></head><body><h1 data-marble-id="h">Handwritten</h1></body></html>`
    await writeFile(
      path.join(getTemplatesDir(), `${preExisting.slug}.mrbl`),
      customHtml,
      'utf8',
    )

    const result = await seedPremadeTemplatesOnDisk()
    expect(result.seededSlugs).not.toContain(preExisting.slug)
    expect(result.seededSlugs).toHaveLength(
      PREDEFINED_MARBLE_TEMPLATES.length - 1,
    )

    const workspace = await loadDriveWorkspace(countMarbleNodes)
    const found = workspace.docs.find((d) => d.slug === preExisting.slug)
    expect(found?.source).toBe(customHtml)
    expect(found?.title).toBe('Handwritten LaTeX')
  })

  it('5. seeds only newly added premade templates on upgrade without resurrecting deleted ones', async () => {
    await loadDriveWorkspace(countMarbleNodes)
    const deleted = PREDEFINED_MARBLE_TEMPLATES[2]
    await deleteDocumentPermanentlyOnDisk({
      slug: deleted.slug,
      folderPath: TEMPLATES_FOLDER_NAME,
    })

    const extraTemplate = {
      ...PREDEFINED_MARBLE_TEMPLATES[0],
      id: 'tpl-new-release-blueprint',
      slug: 'new-release-blueprint',
      fileName: 'new-release-blueprint.mrbl',
      title: 'New Release Blueprint',
    }

    const result = await seedPremadeTemplatesOnDisk([
      ...PREDEFINED_MARBLE_TEMPLATES,
      extraTemplate,
    ])
    expect(result.seededSlugs).toEqual(['new-release-blueprint'])

    const templates = await listTemplatesOnDisk(countMarbleNodes)
    expect(templates.some((t) => t.id === extraTemplate.id)).toBe(true)
    expect(templates.some((t) => t.id === deleted.id)).toBe(false)
  })

  it('6. saveAsTemplateOnDisk copies an existing doc into Templates/ without touching the original and deduplicates slugs', async () => {
    await loadDriveWorkspace(countMarbleNodes)
    await saveDocumentToDisk({
      slug: 'lab-report',
      folderPath: 'Papers',
      source: SAMPLE_HTML,
      meta: {
        id: 'doc-lab-report',
        title: 'Lab Report',
        description: 'Weekly paper draft',
        category: 'document',
        isEvergreen: true,
        tags: ['paper', 'lab'],
      },
    })

    const first = await saveAsTemplateOnDisk({
      sourceSlug: 'lab-report',
      sourceFolderPath: 'Papers',
      title: 'Lab Report Template',
      description: 'Reusable paper template',
      nodeCountOf: countMarbleNodes,
    })

    expect(first.ok).toBe(true)
    expect(first.doc.isTemplate).toBe(true)
    expect(first.doc.isEvergreen).toBe(false)
    expect(first.doc.slug).toBe('lab-report-template')
    expect(first.doc.folder).toBe(TEMPLATES_FOLDER_NAME)
    expect(first.doc.source).toContain('<title>Lab Report Template</title>')
    expect(first.doc.source).toContain('Original Heading')

    // Original remains untouched in Papers/
    const originalOnDisk = await readFile(
      path.join(tempDir, 'Papers', 'lab-report.mrbl'),
      'utf8',
    )
    expect(originalOnDisk).toBe(SAMPLE_HTML)

    // Saving again with same title deduplicates slug cleanly
    const second = await saveAsTemplateOnDisk({
      sourceSlug: 'lab-report',
      sourceFolderPath: 'Papers',
      title: 'Lab Report Template',
      nodeCountOf: countMarbleNodes,
    })
    expect(second.doc.slug).toBe('lab-report-template-2')

    // Recreates Templates/ folder if deleted
    await deleteFolderOnDisk({ folderPath: TEMPLATES_FOLDER_NAME })
    const third = await saveAsTemplateOnDisk({
      source: SAMPLE_HTML,
      title: 'Fresh Recreated Template',
      nodeCountOf: countMarbleNodes,
    })
    expect(third.folder.name).toBe(TEMPLATES_FOLDER_NAME)
    const listed = await listTemplatesOnDisk(countMarbleNodes)
    expect(listed.some((t) => t.id === third.doc.id)).toBe(true)
  })

  it('7. renameDocumentOnDisk renames templates and regular docs while preserving id, deduplicating collisions, and keeping evergreen slugs', async () => {
    await loadDriveWorkspace(countMarbleNodes)
    const seeded = PREDEFINED_MARBLE_TEMPLATES[0]

    const renamed = await renameDocumentOnDisk({
      slug: seeded.slug,
      folderPath: TEMPLATES_FOLDER_NAME,
      title: 'Quantum Paper Studio',
      description: 'Updated description',
    })

    expect(renamed.id).toBe(seeded.id)
    expect(renamed.oldSlug).toBe(seeded.slug)
    expect(renamed.slug).toBe('quantum-paper-studio')
    expect(renamed.isTemplate).toBe(true)
    expect(renamed.source).toContain('<title>Quantum Paper Studio</title>')

    // Reload should NOT re-seed the old premade slug
    const reloaded = await loadDriveWorkspace(countMarbleNodes)
    expect(reloaded.docs.filter((d) => d.id === seeded.id)).toHaveLength(1)
    expect(reloaded.docs.some((d) => d.slug === seeded.slug)).toBe(false)

    // Collision deduplication when another doc shares target title
    await saveDocumentToDisk({
      slug: 'another-doc',
      folderPath: '',
      source: SAMPLE_HTML,
      meta: { title: 'Another Doc' },
    })
    const collisionRenamed = await renameDocumentOnDisk({
      slug: 'another-doc',
      folderPath: '',
      title: 'Quantum Paper Studio',
    })
    expect(collisionRenamed.slug).toBe('quantum-paper-studio-2')

    // Evergreen doc preserves its canonical slug
    await saveDocumentToDisk({
      slug: DOCUMENT_DESIGN_SYSTEM_SLUG,
      folderPath: 'Evergreen',
      source: SAMPLE_HTML,
      meta: {
        id: 'ws-document-design-system',
        title: 'Design System',
        isEvergreen: true,
      },
    })
    const evergreenRenamed = await renameDocumentOnDisk({
      slug: DOCUMENT_DESIGN_SYSTEM_SLUG,
      folderPath: 'Evergreen',
      title: 'Custom Design System Title',
    })
    expect(evergreenRenamed.slug).toBe(DOCUMENT_DESIGN_SYSTEM_SLUG)
    expect(evergreenRenamed.title).toBe('Custom Design System Title')
  })

  it('8. moveDocumentOnDisk flips isTemplate based on whether the destination is Templates/', async () => {
    await loadDriveWorkspace(countMarbleNodes)
    await saveDocumentToDisk({
      slug: 'custom-note',
      folderPath: '',
      source: SAMPLE_HTML,
      meta: { id: 'doc-custom-note', title: 'Custom Note' },
    })

    const movedIn = await moveDocumentOnDisk({
      slug: 'custom-note',
      fromFolderPath: '',
      toFolderPath: TEMPLATES_FOLDER_NAME,
    })
    expect(movedIn.isTemplate).toBe(true)

    let workspace = await loadDriveWorkspace(countMarbleNodes)
    expect(
      workspace.docs.find((d) => d.slug === 'custom-note')?.isTemplate,
    ).toBe(true)

    const movedOut = await moveDocumentOnDisk({
      slug: 'custom-note',
      fromFolderPath: TEMPLATES_FOLDER_NAME,
      toFolderPath: '',
    })
    expect(movedOut.isTemplate).toBe(false)

    workspace = await loadDriveWorkspace(countMarbleNodes)
    expect(
      workspace.docs.find((d) => d.slug === 'custom-note')?.isTemplate,
    ).toBe(false)
  })

  it('9. discovers raw .mrbl files dropped directly into Templates/ on disk', async () => {
    await loadDriveWorkspace(countMarbleNodes)
    const manualHtml = `<!doctype html><html><head><title>Dropped Disk Template</title></head><body><p data-marble-id="p1">Hello</p></body></html>`
    await writeFile(
      path.join(getTemplatesDir(), 'dropped-disk-template.mrbl'),
      manualHtml,
      'utf8',
    )

    const templates = await listTemplatesOnDisk(countMarbleNodes)
    const discovered = templates.find((t) => t.slug === 'dropped-disk-template')
    expect(discovered).toBeDefined()
    expect(discovered?.isTemplate).toBe(true)
    expect(discovered?.title).toBe('Dropped Disk Template')
  })

  it('10. trashing and restoring a template removes it from active templates and restores it back to Templates/', async () => {
    await loadDriveWorkspace(countMarbleNodes)
    const target = PREDEFINED_MARBLE_TEMPLATES[3]

    await trashDocumentOnDisk({
      slug: target.slug,
      folderPath: TEMPLATES_FOLDER_NAME,
    })

    let templates = await listTemplatesOnDisk(countMarbleNodes)
    expect(templates.some((t) => t.id === target.id)).toBe(false)

    const restored = await restoreDocumentOnDisk({ slug: target.slug })
    expect(restored.folderPath).toBe(TEMPLATES_FOLDER_NAME)

    templates = await listTemplatesOnDisk(countMarbleNodes)
    expect(templates.some((t) => t.id === target.id)).toBe(true)
  })

  it('11. /api/marble supports GET templates, POST save_as_template, POST rename_document, and error handling', async () => {
    const getRes = await marbleGet({
      request: new Request('http://localhost/api/marble?action=templates'),
    })
    expect(getRes.status).toBe(200)
    const getPayload = (await getRes.json()) as {
      ok: boolean
      templates: Array<{ id: string; isTemplate: boolean }>
    }
    expect(getPayload.ok).toBe(true)
    expect(getPayload.templates).toHaveLength(
      PREDEFINED_MARBLE_TEMPLATES.length,
    )
    expect(getPayload.templates.every((t) => t.isTemplate)).toBe(true)

    await saveDocumentToDisk({
      slug: 'my-bench',
      folderPath: '',
      source: SAMPLE_HTML,
      meta: { id: 'doc-my-bench', title: 'My Bench' },
    })

    const saveTplRes = await marblePost({
      request: new Request('http://localhost/api/marble', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'save_as_template',
          sourceSlug: 'my-bench',
          sourceFolderPath: '',
          title: 'Benchmark Template',
          description: 'Reusable benchmark',
        }),
      }),
    })
    expect(saveTplRes.status).toBe(200)
    const saveTplPayload = (await saveTplRes.json()) as {
      ok: boolean
      doc: { slug: string; title: string; isTemplate: boolean }
    }
    expect(saveTplPayload.ok).toBe(true)
    expect(saveTplPayload.doc.slug).toBe('benchmark-template')
    expect(saveTplPayload.doc.isTemplate).toBe(true)

    const renameRes = await marblePost({
      request: new Request('http://localhost/api/marble', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'rename_document',
          slug: 'benchmark-template',
          folderPath: TEMPLATES_FOLDER_NAME,
          title: 'Benchmark Studio v2',
          description: 'Updated description',
        }),
      }),
    })
    expect(renameRes.status).toBe(200)
    const renamePayload = (await renameRes.json()) as {
      ok: boolean
      slug: string
      title: string
      isTemplate: boolean
    }
    expect(renamePayload.ok).toBe(true)
    expect(renamePayload.slug).toBe('benchmark-studio-v2')
    expect(renamePayload.title).toBe('Benchmark Studio v2')
    expect(renamePayload.isTemplate).toBe(true)

    await updateDocumentMetaOnDisk({
      slug: 'benchmark-studio-v2',
      folderPath: TEMPLATES_FOLDER_NAME,
      meta: { starred: true },
    })

    const missingTitleRes = await marblePost({
      request: new Request('http://localhost/api/marble', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'save_as_template',
          source: SAMPLE_HTML,
        }),
      }),
    })
    expect(missingTitleRes.status).toBe(400)

    const missingDocRes = await marblePost({
      request: new Request('http://localhost/api/marble', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'rename_document',
          slug: 'does-not-exist',
          title: 'New Name',
        }),
      }),
    })
    expect(missingDocRes.status).toBe(404)
  })

  it('12. mints an unused folder ID and sets isTemplatesFolder markers when Templates is renamed and recreated', async () => {
    await loadDriveWorkspace(countMarbleNodes)
    const renamed = await renameFolderOnDisk({
      oldPath: TEMPLATES_FOLDER_NAME,
      newName: 'Old Templates',
    })
    expect(renamed.folder.id).toBe(TEMPLATES_FOLDER_ID)
    expect(renamed.folder.isTemplatesFolder).toBe(false)

    await saveDocumentToDisk({
      slug: 'notes-draft',
      folderPath: '',
      source: SAMPLE_HTML,
      meta: { id: 'doc-notes-draft', title: 'Notes Draft' },
    })
    const saved = await saveAsTemplateOnDisk({
      sourceSlug: 'notes-draft',
      sourceFolderPath: '',
      title: 'Fresh Template',
      folderId: TEMPLATES_FOLDER_ID,
      nodeCountOf: countMarbleNodes,
    })

    expect(saved.folder.name).toBe(TEMPLATES_FOLDER_NAME)
    expect(saved.folder.isTemplatesFolder).toBe(true)
    expect(saved.folder.id).not.toBe(TEMPLATES_FOLDER_ID)

    const extraTemplate = {
      ...PREDEFINED_MARBLE_TEMPLATES[0],
      id: 'tpl-upgrade-after-rename',
      slug: 'upgrade-after-rename',
      fileName: 'upgrade-after-rename.mrbl',
      title: 'Upgrade After Rename',
    }
    await seedPremadeTemplatesOnDisk([
      ...PREDEFINED_MARBLE_TEMPLATES,
      extraTemplate,
    ])

    // Recreating a regular folder with the same name after renaming it also gets an unused ID.
    const papersCreated = await createFolderOnDisk({ name: 'Papers' })
    const papersRenamed = await renameFolderOnDisk({
      oldPath: 'Papers',
      newName: 'Papers Archive',
    })
    const papersRecreated = await createFolderOnDisk({ name: 'Papers' })
    expect(papersRecreated.folder.id).not.toBe(papersCreated.folder.id)
    expect(papersRecreated.folder.id).not.toBe(papersRenamed.folder.id)

    const reloaded = await loadDriveWorkspace(countMarbleNodes)
    const folderIds = reloaded.folders.map((folder) => folder.id)
    expect(new Set(folderIds).size).toBe(folderIds.length)

    const oldFolder = reloaded.folders.find(
      (folder) => folder.name === 'Old Templates',
    )
    const newTemplatesFolder = reloaded.folders.find(
      (folder) => folder.name === TEMPLATES_FOLDER_NAME,
    )
    expect(oldFolder?.id).toBe(TEMPLATES_FOLDER_ID)
    expect(oldFolder?.isTemplatesFolder).toBe(false)
    expect(newTemplatesFolder?.isTemplatesFolder).toBe(true)
    expect(newTemplatesFolder?.id).not.toBe(TEMPLATES_FOLDER_ID)

    const oldFolderDoc = reloaded.docs.find(
      (doc) => doc.folderId === oldFolder?.id,
    )
    expect(oldFolderDoc?.isTemplate).toBe(false)
    expect(
      reloaded.docs.find((doc) => doc.id === saved.doc.id)?.isTemplate,
    ).toBe(true)
    expect(
      reloaded.docs.find((doc) => doc.id === extraTemplate.id)?.folderId,
    ).toBe(newTemplatesFolder?.id)
  })

  it('13. deduplicates seeded template slugs against existing Drive and Trash files without overwriting Trash', async () => {
    const activePremade = PREDEFINED_MARBLE_TEMPLATES[0]
    const trashedPremade = PREDEFINED_MARBLE_TEMPLATES[1]

    const existingDriveHtml = SAMPLE_HTML.replace(
      'Original Heading',
      'User Active Drive Doc',
    )
    await saveDocumentToDisk({
      slug: activePremade.slug,
      folderPath: 'Papers',
      source: existingDriveHtml,
      meta: { id: 'doc-user-latex', title: 'User Active Drive Doc' },
    })

    const trashedUserHtml = SAMPLE_HTML.replace(
      'Original Heading',
      'User Trashed Notebook',
    )
    await saveDocumentToDisk({
      slug: trashedPremade.slug,
      folderPath: '',
      source: trashedUserHtml,
      meta: { id: 'doc-user-trashed', title: 'User Trashed Notebook' },
    })
    await trashDocumentOnDisk({
      slug: trashedPremade.slug,
      folderPath: '',
    })

    const workspace = await loadDriveWorkspace(countMarbleNodes)
    const seededActiveMatch = workspace.docs.find(
      (doc) => doc.id === activePremade.id,
    )
    const seededTrashedMatch = workspace.docs.find(
      (doc) => doc.id === trashedPremade.id,
    )
    const userActiveDoc = workspace.docs.find(
      (doc) => doc.id === 'doc-user-latex',
    )
    const userTrashedDoc = workspace.docs.find(
      (doc) => doc.id === 'doc-user-trashed',
    )

    expect(seededActiveMatch?.slug).toBe(`${activePremade.slug}-2`)
    expect(seededActiveMatch?.folder).toBe(TEMPLATES_FOLDER_NAME)
    expect(seededTrashedMatch?.slug).toBe(`${trashedPremade.slug}-2`)
    expect(seededTrashedMatch?.folder).toBe(TEMPLATES_FOLDER_NAME)

    expect(userActiveDoc?.slug).toBe(activePremade.slug)
    expect(userActiveDoc?.source).toBe(existingDriveHtml)
    expect(userTrashedDoc?.slug).toBe(trashedPremade.slug)
    expect(userTrashedDoc?.trashedAt).toBeTruthy()

    // Trashing the seeded templates uses their deduplicated slugs and preserves existing Trash entries.
    await trashDocumentOnDisk({
      slug: seededTrashedMatch!.slug,
      folderPath: TEMPLATES_FOLDER_NAME,
    })
    await trashDocumentOnDisk({
      slug: seededActiveMatch!.slug,
      folderPath: TEMPLATES_FOLDER_NAME,
    })
    await trashDocumentOnDisk({
      slug: userActiveDoc!.slug,
      folderPath: 'Papers',
    })

    const afterTrash = await loadDriveWorkspace(countMarbleNodes)
    expect(
      afterTrash.docs.find((doc) => doc.id === 'doc-user-trashed')?.source,
    ).toBe(trashedUserHtml)
    expect(
      afterTrash.docs.find((doc) => doc.id === trashedPremade.id)?.source,
    ).toBe(trashedPremade.source)
    expect(
      afterTrash.docs.find((doc) => doc.id === 'doc-user-latex')?.source,
    ).toBe(existingDriveHtml)
    expect(
      afterTrash.docs.find((doc) => doc.id === activePremade.id)?.source,
    ).toBe(activePremade.source)
  })
})
