// Server-side Drive-wide AI Chat prompt builder and action validator.
// Supports querying across all files & folders in xDrive and proposing or
// executing validated Drive mutations (Marble DOM ops, new .mrbl docs, renames,
// moves, metadata updates, trash/restore, and folder operations).

// @ts-expect-error @bdhmin/marble has no type declarations.
import * as marbleGuard from '@bdhmin/marble/guard'
// @ts-expect-error @bdhmin/marble has no type declarations.
import * as marblePatcher from '@bdhmin/marble/patcher'
import {
  resolveEvergreenDesignContext,
  sanitizeHtmlWithEvergreenRules,
  sanitizeTextWithDonts,
} from '#/lib/marble/ai-collaborator'
import type {
  DriveFolderColor,
  MarbleAppCategory,
  MarbleOp,
} from '#/lib/types'
import type {
  DriveChatAction,
  DriveChatApiRequest,
  DriveDocumentSnapshot,
  DriveFolderSnapshot,
  DriveSnapshot,
} from './drive-chat-types'

const checkShapes = marbleGuard.checkShapes as (ops: readonly unknown[]) => void
const guardOps = marbleGuard.guardOps as (
  source: string,
  ops: readonly unknown[],
) => string
const applyOps = marblePatcher.applyOps as (
  source: string,
  ops: readonly unknown[],
) => string

const VALID_OP_TYPES = new Set<MarbleOp['type']>([
  'setText',
  'setInner',
  'setAttr',
  'insert',
  'move',
  'remove',
  'assignId',
])

const VALID_CATEGORIES = new Set<MarbleAppCategory>([
  'latex',
  'notebook',
  'document',
  'slides',
  'matrix',
  'sandbox',
  'custom',
])

const VALID_FOLDER_COLORS = new Set<DriveFolderColor>([
  'default',
  'accent',
  'commit',
  'sketch',
  'danger',
])

const ACTION_FENCE_RE = /```xdrive-actions\s*([\s\S]*?)```/gi

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  const head = value.slice(0, Math.floor(maxChars * 0.72))
  const tail = value.slice(-Math.floor(maxChars * 0.22))
  return `${head}\n<!-- ... truncated (${value.length - maxChars} chars) ... -->\n${tail}`
}

function slugify(value: string, fallback = 'drive-doc'): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || fallback
  )
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function buildDriveChatSystemPrompt(input: DriveChatApiRequest): string {
  const evergreen = resolveEvergreenDesignContext()
  const { drive, mode } = input

  const folderLines =
    drive.folders.length > 0
      ? drive.folders.map(
          (folder) =>
            `- [${folder.id}] ${folder.path} (color: ${folder.color ?? 'default'}, parent: ${folder.parentId ?? 'root'})`,
        )
      : ['- (No subfolders yet — all files are in My Drive root)']

  const docLines = drive.docs.map((doc) => {
    const flags = [
      doc.starred ? 'starred' : null,
      doc.pinned ? 'pinned' : null,
      doc.isEvergreen ? 'evergreen-rules' : null,
    ]
      .filter(Boolean)
      .join(', ')
    return [
      `### [${doc.id}] ${doc.title} (${doc.fileName})`,
      `Category: ${doc.category} | Folder: ${doc.folderPath} (${doc.folderId ?? 'root'}) | Nodes: ${doc.nodeCount} | Updated: ${doc.updatedAt}${flags ? ` | Flags: ${flags}` : ''}`,
      doc.tags.length > 0 ? `Tags: ${doc.tags.join(', ')}` : null,
      doc.description ? `Description: ${doc.description}` : null,
      doc.marbleIds.length > 0
        ? `Marble IDs (${doc.marbleIds.length}): ${doc.marbleIds.slice(0, 50).join(', ')}`
        : null,
      `Content digest:\n${doc.textDigest.slice(0, 2600)}`,
    ]
      .filter(Boolean)
      .join('\n')
  })

  const trashedLines =
    drive.trashedDocs.length > 0
      ? drive.trashedDocs.map(
          (doc) =>
            `- [${doc.id}] ${doc.title} (${doc.fileName}, folder: ${doc.folderPath}, trashed: ${doc.trashedAt ?? 'recently'})`,
        )
      : ['- (Trash is empty)']

  const fullSourceDocs = drive.docs.filter((doc) => Boolean(doc.source)).slice(0, 4)

  const focusLines =
    drive.focusedRefs.length > 0
      ? drive.focusedRefs.map((ref) =>
          ref.kind === 'doc'
            ? `- File: [${ref.id}] ${ref.title} (${ref.fileName})`
            : `- Folder: [${ref.id}] ${ref.name}`,
        )
      : ['- Entire Drive (no narrower scope filter)']

  const modeInstructions =
    mode === 'ask'
      ? [
          'EXECUTION MODE: ASK ONLY (READ-ONLY).',
          '- Do NOT emit any mutating Drive actions.',
          '- You may still emit a ```xdrive-actions``` block with ONLY `{ "referencedDocIds": ["..."], "actions": [] }` so referenced files appear as clickable citations.',
        ]
      : [
          `EXECUTION MODE: ${mode === 'auto' ? 'AUTO-APPLY' : 'REVIEW CHANGES'}.`,
          '- Answer the user concisely and clearly in Markdown.',
          '- Whenever the user asks to create, edit, organize, rename, move, tag, star, pin, trash, or restore files or folders across their Drive, append ONE fenced ```xdrive-actions``` JSON block at the very end of your response.',
          '- Do NOT describe JSON schemas in prose; keep prose natural and helpful.',
          '- Format of the fenced block (must be valid JSON):',
          '```xdrive-actions',
          '{',
          '  "referencedDocIds": ["doc-id-1"],',
          '  "actions": [',
          '    // Supported action objects:',
          '    // 1. Edit existing .mrbl doc using Marble ops (preferred when modifying text/elements):',
          '    { "kind": "edit_document", "docId": "<existing doc id>", "summary": "What changed", "ops": [ { "type": "setText", "id": "<existing marble id>", "text": "..." } ] },',
          '    // 2. Create a new .mrbl document/app:',
          '    { "kind": "create_document", "title": "...", "slug": "url-safe-slug", "category": "document|notebook|slides|latex|matrix|sandbox|custom", "description": "...", "tags": ["..."], "folderName": "Existing or new folder or My Drive", "source": "<!DOCTYPE html>\\n<html lang=\\"en\\">...complete .mrbl HTML5 with unique data-marble-id attrs and xDrive CSS tokens...</html>" },',
          '    // 3. Rename a document:',
          '    { "kind": "rename_document", "docId": "<doc id>", "nextTitle": "...", "nextDescription": "optional", "nextTags": ["optional"] },',
          '    // 4. Move a document to a folder (use null / "My Drive" for root):',
          '    { "kind": "move_document", "docId": "<doc id>", "targetFolderId": "<folder id or null>", "targetFolderName": "<folder name>" },',
          '    // 5. Star, pin, or update tags/description:',
          '    { "kind": "update_document_meta", "docId": "<doc id>", "starred": true, "pinned": false, "tags": ["..."], "description": "..." },',
          '    // 6. Move a document to Trash or restore from Trash:',
          '    { "kind": "trash_document", "docId": "<doc id>" },',
          '    { "kind": "restore_document", "docId": "<trashed doc id>" },',
          '    // 7. Create, rename, or delete a folder:',
          '    { "kind": "create_folder", "name": "...", "parentId": null, "color": "default|accent|commit|sketch|danger" },',
          '    { "kind": "rename_folder", "folderId": "<folder id>", "nextName": "...", "nextColor": "optional" },',
          '    { "kind": "delete_folder", "folderId": "<folder id>" }',
          '  ]',
          '}',
          '```',
          '- For `edit_document`, allowed Marble op shapes are: `setText` (`id`, `text`), `setInner` (`id`, `html`), `setAttr` (`id`, `name`, `value`), `insert` (`parentId`, `beforeId`, `html`), `move` (`id`, `parentId`, `beforeId`), `remove` (`id`). Only reference IDs that exist in that document’s Marble IDs.',
          '- When creating or editing `.mrbl` HTML, follow xDrive design contracts (use `var(--paper)`, `var(--panel)`, `var(--ink)`, `var(--muted)`, `var(--line)`, `var(--accent)`, `var(--radius)`) and anti-slop guardrails:',
          ...evergreen.designSystem.contracts
            .slice(0, 5)
            .map((rule) => `  - ${rule}`),
          ...evergreen.dontsSystem.guardrails
            .slice(0, 4)
            .map((rule) => `  - ${rule}`),
        ]

  const sections: string[] = [
    'You are xDrive Assistant, an AI workspace collaborator with live read/write visibility across the user’s entire xDrive (all `.mrbl` Notes, Docs, Slides, LaTeX manuscripts, Lab Notebooks, interactive apps, folders, and Trash).',
    'CRITICAL RULES:',
    '1. Do NOT call any shell, filesystem, or external tools. The complete live xDrive snapshot is provided below.',
    '2. Ground every factual claim in the actual files shown below. Cite specific file names (e.g., `week-12-ablations.mrbl`) when synthesizing or comparing across documents.',
    '3. Keep Markdown crisp, well-structured, and free of filler.',
    '',
    ...modeInstructions,
    '',
    'USER-PINNED FOCUS CONTEXT:',
    ...focusLines,
    '',
    `DRIVE FOLDERS (${drive.folders.length}):`,
    ...folderLines,
    '',
    `ACTIVE DRIVE DOCUMENTS (${drive.docs.length}):`,
    ...docLines,
    '',
    `TRASHED DOCUMENTS (${drive.trashedDocs.length}):`,
    ...trashedLines,
  ]

  if (fullSourceDocs.length > 0) {
    sections.push(
      '',
      'FULL .MRBL SOURCE FOR FOCUSED / RELEVANT DOCUMENTS (use exact data-marble-id values from here when emitting edit_document ops):',
      ...fullSourceDocs.map(
        (doc) =>
          `--- SOURCE [${doc.id}] ${doc.fileName} ---\n${truncate(doc.source ?? '', 14_000)}\n--- END SOURCE [${doc.id}] ---`,
      ),
    )
  }

  return sections.join('\n')
}

export function buildSingleTurnPromptForAcp(
  input: DriveChatApiRequest,
): string {
  const systemPrompt = buildDriveChatSystemPrompt(input)
  const history = input.messages.slice(0, -1).slice(-10)
  const latest = input.messages.at(-1)?.content ?? ''

  const lines: string[] = [systemPrompt, '']
  if (history.length > 0) {
    lines.push('CONVERSATION HISTORY:')
    for (const msg of history) {
      lines.push(
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`,
      )
    }
    lines.push('')
  }
  lines.push(`LATEST USER MESSAGE:\n${latest}`)
  return lines.join('\n')
}

function coerceMarbleOp(raw: unknown): MarbleOp | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const type = record.type
  if (
    typeof type !== 'string' ||
    !VALID_OP_TYPES.has(type as MarbleOp['type'])
  ) {
    return null
  }
  const op: MarbleOp = { type: type as MarbleOp['type'] }
  if (typeof record.id === 'string') op.id = record.id
  if (typeof record.text === 'string') op.text = sanitizeTextWithDonts(record.text)
  if (typeof record.html === 'string') {
    op.html = sanitizeHtmlWithEvergreenRules(record.html)
  }
  if (typeof record.name === 'string') op.name = record.name
  if (typeof record.value === 'string' || record.value === null) {
    op.value = record.value
  }
  if (typeof record.parentId === 'string') op.parentId = record.parentId
  if (typeof record.beforeId === 'string' || record.beforeId === null) {
    op.beforeId = record.beforeId
  }
  return op
}

function formatOpPreview(op: MarbleOp): string {
  const target = op.id ? `#${op.id}` : op.parentId ? `#${op.parentId}` : ''
  switch (op.type) {
    case 'setText':
      return `setText ${target}: "${(op.text ?? '').slice(0, 90)}"`
    case 'setInner':
      return `setInner ${target} (${(op.html ?? '').length} chars)`
    case 'setAttr':
      return op.value === null
        ? `removeAttr ${target} ${op.name ?? ''}`
        : `setAttr ${target} ${op.name ?? ''}="${op.value ?? ''}"`
    case 'insert':
      return `insert into ${target} (${(op.html ?? '').length} chars)`
    case 'move':
      return `move #${op.id ?? '?'} → #${op.parentId ?? '?'}`
    case 'remove':
      return `remove ${target}`
    case 'assignId':
      return `assignId ${target}`
    default:
      return op.type
  }
}

function validateOpsAgainstDoc(
  doc: DriveDocumentSnapshot,
  ops: MarbleOp[],
): MarbleOp[] {
  if (!doc.source) return ops
  let rolling = doc.source
  const accepted: MarbleOp[] = []
  for (const op of ops) {
    try {
      if (op.type !== 'assignId') {
        checkShapes([op])
        rolling = guardOps(rolling, [op])
      } else {
        rolling = applyOps(rolling, [op])
      }
      accepted.push(op)
    } catch {
      try {
        rolling = applyOps(rolling, [op])
        accepted.push(op)
      } catch {
        // Drop invalid op safely.
      }
    }
  }
  return accepted
}

function findDocByRef(
  docs: DriveDocumentSnapshot[],
  ref: unknown,
): DriveDocumentSnapshot | null {
  if (typeof ref !== 'string' || !ref.trim()) return null
  const needle = ref.trim().toLowerCase()
  return (
    docs.find((d) => d.id.toLowerCase() === needle) ??
    docs.find((d) => d.slug.toLowerCase() === needle) ??
    docs.find((d) => d.fileName.toLowerCase() === needle) ??
    docs.find((d) => d.title.toLowerCase() === needle) ??
    docs.find((d) => d.title.toLowerCase().includes(needle)) ??
    null
  )
}

function findFolderByRef(
  folders: DriveFolderSnapshot[],
  idRef: unknown,
  nameRef: unknown,
): DriveFolderSnapshot | null {
  if (typeof idRef === 'string' && idRef.trim()) {
    const idNeedle = idRef.trim().toLowerCase()
    const match =
      folders.find((f) => f.id.toLowerCase() === idNeedle) ??
      folders.find((f) => f.name.toLowerCase() === idNeedle) ??
      folders.find((f) => f.path.toLowerCase() === idNeedle)
    if (match) return match
  }
  if (typeof nameRef === 'string' && nameRef.trim()) {
    const nameNeedle = nameRef.trim().toLowerCase()
    if (nameNeedle === 'my drive' || nameNeedle === 'root') return null
    return (
      folders.find((f) => f.name.toLowerCase() === nameNeedle) ??
      folders.find((f) => f.path.toLowerCase() === nameNeedle) ??
      null
    )
  }
  return null
}

function detectReferencedDocsInProse(
  answer: string,
  docs: DriveDocumentSnapshot[],
): string[] {
  const lower = answer.toLowerCase()
  const found: string[] = []
  for (const doc of docs) {
    if (
      lower.includes(doc.fileName.toLowerCase()) ||
      lower.includes(doc.title.toLowerCase()) ||
      lower.includes(doc.slug.toLowerCase())
    ) {
      found.push(doc.id)
    }
  }
  return found
}

export function parseDriveChatResponse(
  rawText: string,
  drive: DriveSnapshot,
  mode: DriveChatApiRequest['mode'],
): {
  answer: string
  referencedDocIds: string[]
  actions: DriveChatAction[]
} {
  const referencedSet = new Set<string>()
  const actions: DriveChatAction[] = []

  const fenceMatches = [...rawText.matchAll(ACTION_FENCE_RE)]
  for (const match of fenceMatches) {
    const jsonChunk = match[1].trim()
    if (!jsonChunk) continue
    let parsed: Record<string, unknown>
    try {
      const candidate: unknown = JSON.parse(jsonChunk)
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        continue
      }
      parsed = candidate as Record<string, unknown>
    } catch {
      continue
    }

    if (Array.isArray(parsed.referencedDocIds)) {
      for (const ref of parsed.referencedDocIds) {
        const doc =
          findDocByRef(drive.docs, ref) ?? findDocByRef(drive.trashedDocs, ref)
        if (doc) referencedSet.add(doc.id)
      }
    }

    if (mode === 'ask' || !Array.isArray(parsed.actions)) continue

    for (const rawItem of parsed.actions) {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
        continue
      }
      const item = rawItem as Record<string, unknown>
      const kind = typeof item.kind === 'string' ? item.kind : ''

      if (kind === 'edit_document') {
        const doc = findDocByRef(
          drive.docs,
          item.docId ?? item.slug ?? item.fileName ?? item.title,
        )
        if (!doc) continue
        referencedSet.add(doc.id)
        const rawOps = Array.isArray(item.ops)
          ? item.ops
              .map(coerceMarbleOp)
              .filter((op): op is MarbleOp => op !== null)
          : []
        const validatedOps = validateOpsAgainstDoc(doc, rawOps)
        const replacementSource =
          typeof item.replacementSource === 'string' &&
          item.replacementSource.includes('<')
            ? sanitizeHtmlWithEvergreenRules(item.replacementSource.trim())
            : undefined
        if (validatedOps.length === 0 && !replacementSource) continue
        actions.push({
          id: uid('act'),
          kind: 'edit_document',
          docId: doc.id,
          docTitle: doc.title,
          fileName: doc.fileName,
          ops: validatedOps,
          replacementSource,
          diffPreview:
            validatedOps.length > 0
              ? validatedOps.slice(0, 6).map(formatOpPreview)
              : [
                  `Replace document HTML (${(replacementSource ?? '').length} chars)`,
                ],
          label: `Edit ${doc.title}`,
          summary:
            typeof item.summary === 'string' && item.summary.trim()
              ? item.summary.trim()
              : `Apply ${validatedOps.length || 1} update${validatedOps.length === 1 ? '' : 's'} to ${doc.fileName}`,
          status: 'proposed',
        })
        continue
      }

      if (kind === 'create_document') {
        const title =
          typeof item.title === 'string' && item.title.trim()
            ? item.title.trim()
            : 'Untitled Document'
        const rawSource =
          typeof item.source === 'string' ? item.source.trim() : ''
        if (!rawSource) continue
        const source = sanitizeHtmlWithEvergreenRules(
          rawSource.startsWith('<!') || rawSource.startsWith('<html')
            ? rawSource
            : `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="utf-8" /><title>${title}</title></head>\n<body data-marble-id="doc-root">${rawSource}</body>\n</html>`,
        )
        const rawCategory = (
          typeof item.category === 'string' ? item.category : 'document'
        ) as MarbleAppCategory
        const category: MarbleAppCategory = VALID_CATEGORIES.has(rawCategory)
          ? rawCategory
          : 'document'
        const slug = slugify(
          typeof item.slug === 'string' && item.slug.trim()
            ? item.slug.trim()
            : title,
        )
        const folder = findFolderByRef(
          drive.folders,
          item.folderId,
          item.folderName,
        )
        const folderName =
          folder?.name ??
          (typeof item.folderName === 'string' && item.folderName.trim()
            ? item.folderName.trim()
            : 'My Drive')
        const tags = Array.isArray(item.tags)
          ? item.tags
              .filter((t): t is string => typeof t === 'string' && Boolean(t.trim()))
              .slice(0, 6)
          : [category]
        actions.push({
          id: uid('act'),
          kind: 'create_document',
          title,
          slug,
          category,
          description:
            typeof item.description === 'string' && item.description.trim()
              ? item.description.trim()
              : `Created via Drive Chat in ${folderName}`,
          tags,
          folderId: folder?.id ?? null,
          folderName,
          source,
          label: `Create ${title}`,
          summary:
            typeof item.summary === 'string' && item.summary.trim()
              ? item.summary.trim()
              : `Create ${slug}.mrbl in ${folderName}`,
          status: 'proposed',
        })
        continue
      }

      if (kind === 'rename_document') {
        const doc = findDocByRef(drive.docs, item.docId ?? item.fileName)
        const nextTitle =
          typeof item.nextTitle === 'string' ? item.nextTitle.trim() : ''
        if (!doc || !nextTitle) continue
        referencedSet.add(doc.id)
        actions.push({
          id: uid('act'),
          kind: 'rename_document',
          docId: doc.id,
          docTitle: doc.title,
          nextTitle,
          nextDescription:
            typeof item.nextDescription === 'string'
              ? item.nextDescription.trim()
              : undefined,
          nextTags: Array.isArray(item.nextTags)
            ? item.nextTags.filter((t): t is string => typeof t === 'string')
            : undefined,
          label: `Rename ${doc.title}`,
          summary:
            typeof item.summary === 'string' && item.summary.trim()
              ? item.summary.trim()
              : `Rename "${doc.title}" to "${nextTitle}"`,
          status: 'proposed',
        })
        continue
      }

      if (kind === 'move_document') {
        const doc = findDocByRef(drive.docs, item.docId ?? item.fileName)
        if (!doc) continue
        referencedSet.add(doc.id)
        const targetFolder = findFolderByRef(
          drive.folders,
          item.targetFolderId,
          item.targetFolderName,
        )
        const targetFolderName =
          targetFolder?.name ??
          (typeof item.targetFolderName === 'string' &&
          item.targetFolderName.trim()
            ? item.targetFolderName.trim()
            : 'My Drive')
        actions.push({
          id: uid('act'),
          kind: 'move_document',
          docId: doc.id,
          docTitle: doc.title,
          fromFolderName: doc.folderPath,
          targetFolderId: targetFolder?.id ?? null,
          targetFolderName,
          label: `Move ${doc.title}`,
          summary:
            typeof item.summary === 'string' && item.summary.trim()
              ? item.summary.trim()
              : `Move "${doc.title}" from ${doc.folderPath} to ${targetFolderName}`,
          status: 'proposed',
        })
        continue
      }

      if (kind === 'update_document_meta') {
        const doc = findDocByRef(drive.docs, item.docId ?? item.fileName)
        if (!doc) continue
        referencedSet.add(doc.id)
        const starred =
          typeof item.starred === 'boolean' ? item.starred : undefined
        const pinned = typeof item.pinned === 'boolean' ? item.pinned : undefined
        const tags = Array.isArray(item.tags)
          ? item.tags.filter((t): t is string => typeof t === 'string')
          : undefined
        const description =
          typeof item.description === 'string'
            ? item.description.trim()
            : undefined
        if (
          starred === undefined &&
          pinned === undefined &&
          !tags &&
          description === undefined
        ) {
          continue
        }
        const parts: string[] = []
        if (starred !== undefined) parts.push(starred ? 'star' : 'unstar')
        if (pinned !== undefined) parts.push(pinned ? 'pin' : 'unpin')
        if (tags) parts.push(`set tags (${tags.join(', ')})`)
        if (description !== undefined) parts.push('update description')
        actions.push({
          id: uid('act'),
          kind: 'update_document_meta',
          docId: doc.id,
          docTitle: doc.title,
          starred,
          pinned,
          tags,
          description,
          label: `Update ${doc.title}`,
          summary:
            typeof item.summary === 'string' && item.summary.trim()
              ? item.summary.trim()
              : `${parts.join(', ')} on "${doc.title}"`,
          status: 'proposed',
        })
        continue
      }

      if (kind === 'trash_document') {
        const doc = findDocByRef(drive.docs, item.docId ?? item.fileName)
        if (!doc) continue
        referencedSet.add(doc.id)
        actions.push({
          id: uid('act'),
          kind: 'trash_document',
          docId: doc.id,
          docTitle: doc.title,
          label: `Move ${doc.title} to Trash`,
          summary:
            typeof item.summary === 'string' && item.summary.trim()
              ? item.summary.trim()
              : `Move "${doc.title}" to Trash (recoverable for 30 days)`,
          status: 'proposed',
        })
        continue
      }

      if (kind === 'restore_document') {
        const doc = findDocByRef(drive.trashedDocs, item.docId ?? item.fileName)
        if (!doc) continue
        referencedSet.add(doc.id)
        actions.push({
          id: uid('act'),
          kind: 'restore_document',
          docId: doc.id,
          docTitle: doc.title,
          label: `Restore ${doc.title}`,
          summary:
            typeof item.summary === 'string' && item.summary.trim()
              ? item.summary.trim()
              : `Restore "${doc.title}" from Trash`,
          status: 'proposed',
        })
        continue
      }

      if (kind === 'create_folder') {
        const name = typeof item.name === 'string' ? item.name.trim() : ''
        if (!name) continue
        const parent = findFolderByRef(
          drive.folders,
          item.parentId,
          item.parentName,
        )
        const rawColor = (
          typeof item.color === 'string' ? item.color : 'default'
        ) as DriveFolderColor
        const color: DriveFolderColor = VALID_FOLDER_COLORS.has(rawColor)
          ? rawColor
          : 'default'
        actions.push({
          id: uid('act'),
          kind: 'create_folder',
          name,
          parentId: parent?.id ?? null,
          parentPath: parent?.path ?? 'My Drive',
          color,
          label: `Create folder ${name}`,
          summary:
            typeof item.summary === 'string' && item.summary.trim()
              ? item.summary.trim()
              : `Create folder "${name}" inside ${parent?.path ?? 'My Drive'}`,
          status: 'proposed',
        })
        continue
      }

      if (kind === 'rename_folder') {
        const folder = findFolderByRef(
          drive.folders,
          item.folderId,
          item.folderName,
        )
        const nextName =
          typeof item.nextName === 'string' ? item.nextName.trim() : ''
        if (!folder || !nextName) continue
        const rawColor = item.nextColor as DriveFolderColor | undefined
        actions.push({
          id: uid('act'),
          kind: 'rename_folder',
          folderId: folder.id,
          folderName: folder.name,
          nextName,
          nextColor:
            rawColor && VALID_FOLDER_COLORS.has(rawColor) ? rawColor : undefined,
          label: `Rename folder ${folder.name}`,
          summary:
            typeof item.summary === 'string' && item.summary.trim()
              ? item.summary.trim()
              : `Rename folder "${folder.name}" to "${nextName}"`,
          status: 'proposed',
        })
        continue
      }

      if (kind === 'delete_folder') {
        const folder = findFolderByRef(
          drive.folders,
          item.folderId,
          item.folderName,
        )
        if (!folder) continue
        actions.push({
          id: uid('act'),
          kind: 'delete_folder',
          folderId: folder.id,
          folderName: folder.name,
          label: `Delete folder ${folder.name}`,
          summary:
            typeof item.summary === 'string' && item.summary.trim()
              ? item.summary.trim()
              : `Delete folder "${folder.name}" (files move up to parent folder)`,
          status: 'proposed',
        })
      }
    }
  }

  const answer = rawText.replace(ACTION_FENCE_RE, '').trim()

  for (const detectedId of detectReferencedDocsInProse(answer, drive.docs)) {
    referencedSet.add(detectedId)
  }

  return {
    answer:
      answer ||
      (actions.length > 0
        ? `Prepared ${actions.length} Drive ${actions.length === 1 ? 'change' : 'changes'} below.`
        : 'Done.'),
    referencedDocIds: [...referencedSet],
    actions,
  }
}
