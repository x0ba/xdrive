// Client-side Marble engine for xDrive.
//
// Ops splice the .mrbl source by byte range, the same idea as @bdhmin/marble's
// patcher: untouched bytes stay put, and every applied op keeps the inverse
// that puts those bytes back. Inverse ops are returned already reversed, so
// applying `inverseOps` in order undoes the batch.

import type {
  CanvasInteractionMode,
  MarbleDocumentFile,
  MarbleOp,
  SelectedMarbleElement,
  ShareConfig,
  SharePermissionLevel,
} from '../types'

const ID_ATTR = 'data-marble-id'

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

const RAW = new Set([
  'script',
  'style',
  'textarea',
  'title',
  'xmp',
  'iframe',
  'noembed',
  'noframes',
  'noscript',
])

const SVG_VOID = new Set([
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'use',
  'image',
  'stop',
  'animate',
  'feblend',
  'fecolormatrix',
  'fecomposite',
  'feflood',
  'fegaussianblur',
  'feoffset',
  'femergenode',
])

const AFFORDANCE_ATTRS: Array<[string, string]> = [
  ['data-marble-editable', 'editable'],
  ['data-marble-sortable', 'sortable'],
  ['data-marble-removable', 'removable'],
  ['data-marble-canvas', 'canvas'],
  ['data-marble-resizable', 'resizable'],
  ['data-marble-add', 'add'],
  ['data-marble-toggle', 'toggle'],
  ['data-marble-choose', 'choose'],
  ['data-marble-step', 'step'],
  ['data-marble-note', 'note'],
]

export interface MarbleNodeRecord {
  id: string
  tagName: string
  parentId: string | null
  nextId: string | null
  text: string
  sourceSlice: string
  affordances: string[]
}

interface AttrRec {
  name: string
  value: string | null
  rawStart: number
  rawEnd: number
  valueStart: number
  valueEnd: number
}

interface ElRec {
  tag: string
  tagLower: string
  start: number
  openEnd: number
  end: number
  innerStart: number
  innerEnd: number
  attrs: AttrRec[]
  parent: ElRec | null
  children: ElRec[]
  selfClosing: boolean
  id: string | null
  transient: boolean
}

export function countMarbleNodes(source: string): number {
  const re = /data-marble-id\s*=\s*(?:"[^"]*"|'[^']*')/g
  let count = 0
  while (re.exec(source)) count += 1
  return count
}

export function byteSizeOf(source: string): number {
  if (typeof TextEncoder !== 'undefined')
    return new TextEncoder().encode(source).length
  let bytes = 0
  for (const char of source) {
    const code = char.codePointAt(0) ?? 0
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code < 0x10000) bytes += 3
    else bytes += 4
  }
  return bytes
}

export function extractAddressableNodes(
  source: string,
): SelectedMarbleElement[] {
  if (typeof DOMParser !== 'undefined') return extractWithDom(source)
  return inspectMarbleNodes(source).map(recordToSelected)
}

/** Source-accurate index. Works in the browser and on the server. */
export function inspectMarbleNodes(source: string): MarbleNodeRecord[] {
  const elements = parseElements(source)
  const records: MarbleNodeRecord[] = []
  for (const el of elements) {
    if (!el.id) continue
    const parent = el.parent
    const siblings = parent
      ? parent.children.filter((child) => !child.transient)
      : []
    const index = siblings.indexOf(el)
    const next = index >= 0 ? siblings[index + 1] : undefined
    records.push({
      id: el.id,
      tagName: el.tagLower,
      parentId: parent?.id ?? null,
      nextId: next?.id ?? null,
      text: textOf(source, el),
      sourceSlice: source.slice(el.start, el.end),
      affordances: affordancesOf(el),
    })
  }
  return records
}

export function applyMarbleOpsClient(
  source: string,
  ops: MarbleOp[],
): { source: string; inverseOps: MarbleOp[]; touchedIds: string[] } {
  if (typeof source !== 'string') throw new Error('source must be a string')
  if (ops.length === 0) return { source, inverseOps: [], touchedIds: [] }

  let current = source
  const inverses: MarbleOp[] = []
  const touched: string[] = []
  for (const op of ops) {
    const step = applyOne(current, op)
    current = step.source
    if (step.inverse) inverses.push(step.inverse)
    for (const id of step.touched) {
      if (id && !touched.includes(id)) touched.push(id)
    }
  }
  inverses.reverse()
  return { source: current, inverseOps: inverses, touchedIds: touched }
}

export function duplicateMarbleTemplate(
  templateDoc: MarbleDocumentFile,
  newTitle: string,
  authorName?: string,
): MarbleDocumentFile {
  const author = authorName?.trim() || 'You'
  const now = new Date().toISOString()
  const slug = slugify(newTitle)
  const source = retitleSource(templateDoc.source, newTitle)
  const who = { name: author, initials: initialsOf(author) }
  return {
    ...templateDoc,
    id: mintDocumentId(),
    slug,
    fileName: `${slug}.mrbl`,
    title: newTitle,
    isTemplate: false,
    templateId: templateDoc.id,
    source,
    nodeCount: countMarbleNodes(source),
    byteSize: byteSizeOf(source),
    version: 1,
    syncState: 'saved',
    createdAt: now,
    updatedAt: now,
    createdBy: who,
    lastEditedBy: who,
    starred: false,
    pinned: false,
    folder: 'Workspace',
    share: freshShare(slug),
    checkpoints: [],
    intentHistory: [],
  }
}

export interface MarbleIframeOptions {
  appSlug: string
  mode: CanvasInteractionMode
  permission: SharePermissionLevel
  theme: 'dark' | 'light'
  selectedIds: string[]
  proposedIds: string[]
}

export function buildInteractiveMarbleIframeDoc(
  source: string,
  options: MarbleIframeOptions,
): string {
  const safe = sanitizeHostOptions(options)
  const stamped = stampHostAttrs(stripBridge(source), safe)
  const block = `<!-- xdrive-marble-bridge -->\n${bridgeStyle()}\n<script data-marble-carrier="1" data-marble-app="${escapeAttr(safe.appSlug)}">\n${bridgeScript(safe)}\n</script>\n<!-- /xdrive-marble-bridge -->`
  if (/<\/body>/i.test(stamped))
    return stamped.replace(/<\/body>/i, `${block}\n</body>`)
  return `${stamped}\n${block}`
}

function extractWithDom(source: string): SelectedMarbleElement[] {
  const doc = new DOMParser().parseFromString(source, 'text/html')
  const nodes = doc.querySelectorAll(`[${ID_ATTR}]`)
  const selected: SelectedMarbleElement[] = []
  nodes.forEach((el) => {
    const id = el.getAttribute(ID_ATTR)
    if (!id) return
    selected.push({
      id,
      tagName: el.tagName.toLowerCase(),
      textPreview: previewText(elementText(el)),
      sourceSlice: el.outerHTML,
      affordances: affordancesFromNames(
        el.tagName.toLowerCase(),
        el.getAttributeNames(),
        el.parentElement?.getAttributeNames() ?? [],
      ),
    })
  })
  return selected
}

function elementText(el: Element): string {
  const clone = el.cloneNode(true) as Element
  clone
    .querySelectorAll('script, style, [data-marble-transient]')
    .forEach((node) => node.remove())
  return clone.textContent
}

function recordToSelected(record: MarbleNodeRecord): SelectedMarbleElement {
  return {
    id: record.id,
    tagName: record.tagName,
    textPreview: previewText(record.text),
    sourceSlice: record.sourceSlice,
    affordances: record.affordances,
  }
}

function affordancesOf(el: ElRec): string[] {
  return affordancesFromNames(
    el.tagLower,
    el.attrs.map((entry) => entry.name),
    el.parent?.attrs.map((entry) => entry.name) ?? [],
  )
}

function affordancesFromNames(
  tag: string,
  own: string[],
  parent: string[],
): string[] {
  const have = new Set(own.map((name) => name.toLowerCase()))
  const parentHave = new Set(parent.map((name) => name.toLowerCase()))
  const out: string[] = []
  for (const [attrName, name] of AFFORDANCE_ATTRS) {
    if (have.has(attrName)) out.push(name)
  }
  if (tag === 'marble-alt' || have.has('data-marble-alt')) out.push('alt')
  if (parentHave.has('data-marble-sortable') && !out.includes('sortable'))
    out.push('sortable')
  if (parentHave.has('data-marble-canvas') && !out.includes('canvas'))
    out.push('canvas')
  return out
}

function previewText(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= 140) return clean
  return `${clean.slice(0, 139)}…`
}

function retitleSource(source: string, title: string): string {
  const next = source.replace(
    /<title(\s[^>]*)?>[\s\S]*?<\/title>/i,
    (_match, attrs: string | undefined) => {
      return `<title${attrs ?? ''}>${escapeText(title)}</title>`
    },
  )
  const heading = pickPrimaryHeading(parseElements(next))
  if (!heading?.id) return next
  return applyOne(next, { type: 'setText', id: heading.id, text: title }).source
}

function headingInside(el: ElRec): ElRec | null {
  if (el.tagLower === 'h1' && el.id) return el
  for (const child of el.children) {
    const found = headingInside(child)
    if (found) return found
  }
  return null
}

function pickPrimaryHeading(elements: ElRec[]): ElRec | null {
  const alts = elements.filter((el) => el.tagLower === 'marble-alt')
  for (const alt of alts) {
    const active = attr(alt, 'data-marble-active')
    const versions = alt.children.filter((child) =>
      attr(child, 'data-marble-alt'),
    )
    if (versions.length > 0) {
      const activeVersion =
        versions.find((child) => attr(child, 'data-marble-alt') === active) ??
        versions[0]
      const inActive = headingInside(activeVersion)
      if (inActive) return inActive
    }
    const direct = headingInside(alt)
    if (direct) return direct
  }
  return elements.find((el) => el.tagLower === 'h1' && el.id) ?? null
}

function freshShare(slug: string): ShareConfig {
  return {
    isPublicLinkEnabled: false,
    publicLinkUrl: `https://xdrive.app/d/${slug}`,
    publicPermission: 'view_only',
    allowDuplication: true,
    sharedAiDailyLimit: 40,
    sharedAiUsedToday: 0,
    collaborators: [],
  }
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return slug || 'untitled'
}

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  if (!parts.length) return 'YO'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function mintDocumentId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `doc-${crypto.randomUUID()}`
  }
  return `doc-${Math.random().toString(36).slice(2, 12)}`
}

interface Applied {
  source: string
  inverse: MarbleOp | null
  touched: string[]
}

function applyOne(source: string, op: MarbleOp): Applied {
  const elements = parseElements(source)
  const byId = idMap(elements)
  switch (op.type) {
    case 'assignId':
      return applyAssignId(source, elements, op)
    case 'setText':
      return applySetText(source, must(byId, op.id, op.type), op)
    case 'setInner':
      return applySetInner(source, must(byId, op.id, op.type), op)
    case 'setAttr':
      return applySetAttr(source, must(byId, op.id, op.type), op)
    case 'insert':
      return applyInsert(source, byId, op)
    case 'move':
      return applyMove(source, byId, op)
    case 'remove':
      return applyRemove(source, must(byId, op.id, op.type), op)
    default:
      throw new Error(`unknown op type "${op.type}"`)
  }
}

function applyAssignId(
  source: string,
  elements: ElRec[],
  op: MarbleOp,
): Applied {
  if (!op.id || !op.path) throw new Error('assignId needs path and id')
  const root = elements.find((el) => el.tagLower === 'html')
  if (!root) throw new Error('assignId: document has no <html>')
  const target = elementAtPath(root, op.path)
  if (!target) throw new Error(`assignId: nothing at path ${op.path.join('/')}`)
  if (target.id) return { source, inverse: null, touched: [] }
  const next = writeAttr(source, target, ID_ATTR, op.id)
  return { source: next, inverse: null, touched: [op.id] }
}

function applySetText(source: string, el: ElRec, op: MarbleOp): Applied {
  if (RAW.has(el.tagLower)) {
    throw new Error(`setText would corrupt <${el.tagLower}> — use setInner`)
  }
  if (hasAddressedDescendant(el)) {
    throw new Error(
      `setText on "${el.id}" would replace addressed element(s) with plain text`,
    )
  }
  const text = op.text ?? ''
  const inverse = carryLook(
    { type: 'setText', id: el.id ?? undefined, text: textOf(source, el) },
    op,
  )
  const next = splice(source, el.innerStart, el.innerEnd, escapeText(text))
  return { source: next, inverse, touched: el.id ? [el.id] : [] }
}

function applySetInner(source: string, el: ElRec, op: MarbleOp): Applied {
  const html = op.html ?? ''
  const inverse = carryLook(
    {
      type: 'setInner',
      id: el.id ?? undefined,
      html: source.slice(el.innerStart, el.innerEnd),
    },
    op,
  )
  const next = splice(source, el.innerStart, el.innerEnd, html)
  return { source: next, inverse, touched: touchedOf(el.id, html) }
}

function applySetAttr(source: string, el: ElRec, op: MarbleOp): Applied {
  if (!op.name) throw new Error('setAttr needs a name')
  const prior = attr(el, op.name)
  const inverse = carryLook(
    { type: 'setAttr', id: el.id ?? undefined, name: op.name, value: prior },
    op,
  )
  const next = writeAttr(source, el, op.name, op.value ?? null)
  return { source: next, inverse, touched: el.id ? [el.id] : [] }
}

function applyInsert(
  source: string,
  byId: Map<string, ElRec>,
  op: MarbleOp,
): Applied {
  if (!op.parentId) throw new Error('insert needs parentId')
  if (typeof op.html !== 'string' || !op.html)
    throw new Error('insert needs html')
  const parent = must(byId, op.parentId, 'insert')
  const before = op.beforeId ? must(byId, op.beforeId, 'insert') : null
  const at = before ? before.start : parent.innerEnd
  const next = splice(source, at, at, op.html)
  const rootId = firstId(op.html)
  const inverse = rootId ? carryLook({ type: 'remove', id: rootId }, op) : null
  return { source: next, inverse, touched: idsIn(op.html) }
}

function applyMove(
  source: string,
  byId: Map<string, ElRec>,
  op: MarbleOp,
): Applied {
  const el = must(byId, op.id, 'move')
  if (!op.parentId) throw new Error('move needs parentId')
  const parent = must(byId, op.parentId, 'move')
  const before = op.beforeId ? must(byId, op.beforeId, 'move') : null
  if (before === el) return { source, inverse: null, touched: [] }
  if (before && isAncestor(el, before))
    throw new Error('move destination is inside the node')
  if (isAncestor(el, parent))
    throw new Error('move destination is inside the node')

  const oldParent = el.parent
  const siblings = oldParent
    ? oldParent.children.filter((child) => !child.transient)
    : []
  const index = siblings.indexOf(el)
  const oldNext = index >= 0 ? siblings[index + 1] : undefined
  const inverse = carryLook(
    {
      type: 'move',
      id: el.id ?? undefined,
      parentId: oldParent?.id ?? undefined,
      beforeId: oldNext?.id ?? null,
    },
    op,
  )

  const insertAt = before ? before.start : parent.innerEnd
  if (insertAt > el.start && insertAt < el.end)
    throw new Error('move destination is inside the node')
  const chunk = source.slice(el.start, el.end)
  let next: string
  if (insertAt >= el.end) {
    next =
      source.slice(0, el.start) +
      source.slice(el.end, insertAt) +
      chunk +
      source.slice(insertAt)
  } else {
    next =
      source.slice(0, insertAt) +
      chunk +
      source.slice(insertAt, el.start) +
      source.slice(el.end)
  }
  return { source: next, inverse, touched: el.id ? [el.id] : [] }
}

function applyRemove(source: string, el: ElRec, op: MarbleOp): Applied {
  const parentId = el.parent?.id
  if (!parentId) throw new Error(`remove: "${el.id}" has no addressable parent`)
  const siblings = el.parent
    ? el.parent.children.filter((child) => !child.transient)
    : []
  const index = siblings.indexOf(el)
  const nextSibling = index >= 0 ? siblings[index + 1] : undefined
  const inverse = carryLook(
    {
      type: 'insert',
      html: source.slice(el.start, el.end),
      parentId,
      beforeId: nextSibling?.id ?? null,
    },
    op,
  )
  const [start, end] = expandRemoval(source, el.start, el.end)
  const ids = [el.id, ...descendantIds(el)].filter((id): id is string =>
    Boolean(id),
  )
  return { source: splice(source, start, end, ''), inverse, touched: ids }
}

function writeAttr(
  source: string,
  el: ElRec,
  name: string,
  value: string | null,
): string {
  const existing = el.attrs.find(
    (item) => item.name.toLowerCase() === name.toLowerCase(),
  )
  if (value === null) {
    if (!existing) return source
    return splice(source, existing.rawStart, existing.rawEnd, '')
  }
  if (!existing) {
    const slash = source.slice(el.openEnd - 2, el.openEnd) === '/>'
    const boundary = slash ? el.openEnd - 2 : el.openEnd - 1
    return splice(source, boundary, boundary, ` ${name}="${escapeAttr(value)}"`)
  }
  if (existing.valueStart < 0) {
    return splice(
      source,
      existing.rawStart,
      existing.rawEnd,
      ` ${existing.name}="${escapeAttr(value)}"`,
    )
  }
  return splice(
    source,
    existing.valueStart,
    existing.valueEnd,
    escapeAttr(value),
  )
}

function carryLook(inverse: MarbleOp, op: MarbleOp): MarbleOp {
  if (op.look) inverse.look = true
  return inverse
}

function must(
  byId: Map<string, ElRec>,
  id: string | undefined,
  type: string,
): ElRec {
  if (!id) throw new Error(`${type} needs an id`)
  const el = byId.get(id)
  if (!el) throw new Error(`no node with ${ID_ATTR}="${id}"`)
  return el
}

function elementAtPath(root: ElRec, path: number[]): ElRec | null {
  let node: ElRec = root
  for (const index of path) {
    const next = node.children.filter((child) => !child.transient).at(index)
    if (!next) return null
    node = next
  }
  return node
}

function hasAddressedDescendant(el: ElRec): boolean {
  const walk = (node: ElRec): boolean =>
    node.children.some(
      (child) => !child.transient && (Boolean(child.id) || walk(child)),
    )
  return walk(el)
}

function descendantIds(el: ElRec): string[] {
  const ids: string[] = []
  const walk = (node: ElRec) => {
    for (const child of node.children) {
      if (child.id) ids.push(child.id)
      walk(child)
    }
  }
  walk(el)
  return ids
}

function isAncestor(ancestor: ElRec, node: ElRec): boolean {
  let parent = node.parent
  while (parent) {
    if (parent === ancestor) return true
    parent = parent.parent
  }
  return false
}

function touchedOf(id: string | null, html: string): string[] {
  const ids = idsIn(html)
  if (id && !ids.includes(id)) ids.unshift(id)
  return ids
}

function idsIn(html: string): string[] {
  const ids: string[] = []
  const re = /data-marble-id\s*=\s*"([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) ids.push(match[1])
  return ids
}

function firstId(html: string): string | null {
  return idsIn(html)[0] ?? null
}

function attr(el: ElRec, name: string): string | null {
  const found = el.attrs.find(
    (item) => item.name.toLowerCase() === name.toLowerCase(),
  )
  return found ? found.value : null
}

function idMap(elements: ElRec[]): Map<string, ElRec> {
  const map = new Map<string, ElRec>()
  for (const el of elements) {
    if (el.id && !map.has(el.id)) map.set(el.id, el)
  }
  return map
}

function textOf(source: string, el: ElRec): string {
  let out = ''
  let index = el.innerStart
  while (index < el.innerEnd) {
    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4)
      index = end < 0 ? el.innerEnd : end + 3
      continue
    }
    if (source[index] === '<') {
      const child = el.children.find((item) => item.start === index)
      if (child) {
        if (
          !child.transient &&
          child.tagLower !== 'script' &&
          child.tagLower !== 'style'
        ) {
          out += textOf(source, child)
        }
        index = child.end
        continue
      }
    }
    const next = source.indexOf('<', index)
    const end = next < 0 || next > el.innerEnd ? el.innerEnd : next
    out += decodeEntities(source.slice(index, end))
    index = end
  }
  return out
}

function parseElements(source: string): ElRec[] {
  const all: ElRec[] = []
  const stack: ElRec[] = []
  let index = 0

  while (index < source.length) {
    const lt = source.indexOf('<', index)
    if (lt < 0) break
    index = lt
    const next = source[index + 1]
    if (
      next !== '/' &&
      next !== '!' &&
      next !== '?' &&
      !/[A-Za-z]/.test(next)
    ) {
      index += 1
      continue
    }
    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4)
      index = end < 0 ? source.length : end + 3
      continue
    }
    if (source.startsWith('<!', index)) {
      const end = source.indexOf('>', index + 2)
      index = end < 0 ? source.length : end + 1
      continue
    }
    if (source.startsWith('<?', index)) {
      const end = source.indexOf('?>', index + 2)
      index = end < 0 ? source.length : end + 2
      continue
    }
    if (source.startsWith('</', index)) {
      const match = /^<\/([A-Za-z][\w:-]*)\s*>/.exec(source.slice(index))
      if (!match) {
        index += 2
        continue
      }
      const name = match[1].toLowerCase()
      const closeEnd = index + match[0].length
      let at = stack.length - 1
      while (at >= 0 && stack[at].tagLower !== name) at -= 1
      if (at < 0) {
        index = closeEnd
        continue
      }
      while (stack.length - 1 > at) {
        const implied = stack.pop()
        if (!implied) break
        implied.innerEnd = index
        implied.end = index
      }
      const closed = stack.pop()
      if (closed) {
        closed.innerEnd = index
        closed.end = closeEnd
      }
      index = closeEnd
      continue
    }

    const opened = openTag(source, index)
    if (!opened) {
      index += 1
      continue
    }
    const parent = stack.at(-1) ?? null
    const el = createElement(opened, parent)
    all.push(el)
    if (parent) parent.children.push(el)
    const foreign = stack.some(
      (item) => item.tagLower === 'svg' || item.tagLower === 'math',
    )
    const empty =
      VOID.has(el.tagLower) ||
      (opened.selfClosing && (foreign || VOID.has(el.tagLower))) ||
      (foreign && SVG_VOID.has(el.tagLower))
    if (empty) {
      el.selfClosing =
        opened.selfClosing || VOID.has(el.tagLower) || SVG_VOID.has(el.tagLower)
      el.innerStart = opened.openEnd
      el.innerEnd = opened.openEnd
      el.end = opened.openEnd
      index = opened.openEnd
      continue
    }
    if (RAW.has(el.tagLower)) {
      const closeAt = findRawClose(source, opened.openEnd, el.tagLower)
      if (closeAt < 0) {
        el.innerStart = opened.openEnd
        el.innerEnd = source.length
        el.end = source.length
        index = source.length
        continue
      }
      const match = /^<\/[A-Za-z][\w:-]*\s*>/.exec(source.slice(closeAt))
      const closeEnd = closeAt + (match ? match[0].length : 0)
      el.innerStart = opened.openEnd
      el.innerEnd = closeAt
      el.end = closeEnd
      index = closeEnd
      continue
    }
    el.innerStart = opened.openEnd
    stack.push(el)
    index = opened.openEnd
  }

  while (stack.length) {
    const el = stack.pop()
    if (!el) break
    el.innerEnd = source.length
    el.end = source.length
  }
  return all
}

interface OpenedTag {
  start: number
  tag: string
  openEnd: number
  selfClosing: boolean
  attrs: AttrRec[]
}

function openTag(source: string, start: number): OpenedTag | null {
  let index = start + 1
  const nameStart = index
  while (index < source.length && /[\w:-]/.test(source[index])) index += 1
  if (index === nameStart) return null
  const tag = source.slice(nameStart, index)
  const attrs: AttrRec[] = []
  while (index < source.length) {
    const ws = index
    while (index < source.length && /\s/.test(source[index])) index += 1
    if (
      source[index] === '>' ||
      source[index] === '/' ||
      index >= source.length
    )
      break
    if (!/[A-Za-z_:]/.test(source[index] ?? '')) break
    const attrStart = index
    index += 1
    while (index < source.length && /[\w:.-]/.test(source[index])) index += 1
    const name = source.slice(attrStart, index)
    let value: string | null = null
    let valueStart = -1
    let valueEnd = -1
    if (source[index] === '=') {
      index += 1
      const quote = source[index]
      if (quote === '"' || quote === "'") {
        index += 1
        valueStart = index
        while (index < source.length && source[index] !== quote) index += 1
        valueEnd = index
        value = decodeEntities(source.slice(valueStart, valueEnd))
        if (source[index] === quote) index += 1
      } else {
        valueStart = index
        while (index < source.length && !/[\s>/"']/.test(source[index]))
          index += 1
        valueEnd = index
        value = decodeEntities(source.slice(valueStart, valueEnd))
      }
    }
    attrs.push({
      name,
      value,
      rawStart: ws,
      rawEnd: index,
      valueStart,
      valueEnd,
    })
  }
  let selfClosing = false
  if (source[index] === '/' && source[index + 1] === '>') {
    selfClosing = true
    index += 2
  } else if (source[index] === '>') {
    index += 1
  } else {
    const end = source.indexOf('>', index)
    index = end < 0 ? source.length : end + 1
  }
  return { start, tag, openEnd: index, selfClosing, attrs }
}

function createElement(opened: OpenedTag, parent: ElRec | null): ElRec {
  const idAttr = opened.attrs.find(
    (item) => item.name.toLowerCase() === ID_ATTR,
  )
  const transient = opened.attrs.some(
    (item) => item.name.toLowerCase() === 'data-marble-transient',
  )
  return {
    tag: opened.tag,
    tagLower: opened.tag.toLowerCase(),
    start: opened.start,
    openEnd: opened.openEnd,
    end: opened.openEnd,
    innerStart: opened.openEnd,
    innerEnd: opened.openEnd,
    attrs: opened.attrs,
    parent,
    children: [],
    selfClosing: opened.selfClosing,
    id: idAttr?.value ?? null,
    transient,
  }
}

function findRawClose(source: string, from: number, tag: string): number {
  const lower = source.toLowerCase()
  const needle = `</${tag}`
  let index = from
  while (index < source.length) {
    const at = lower.indexOf(needle, index)
    if (at < 0) return -1
    const after = at + needle.length
    if (after >= source.length || /[\s>]/.test(source[after])) return at
    index = at + 1
  }
  return -1
}

function splice(
  source: string,
  start: number,
  end: number,
  text: string,
): string {
  return source.slice(0, start) + text + source.slice(end)
}

function expandRemoval(
  source: string,
  start: number,
  end: number,
): [number, number] {
  let next = start
  while (next > 0 && (source[next - 1] === ' ' || source[next - 1] === '\t'))
    next -= 1
  if (next > 0 && source[next - 1] === '\n') next -= 1
  return [next, end]
}

export function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos|nbsp);/g,
    (_match, entity: string) => {
      if (entity === 'amp') return '&'
      if (entity === 'lt') return '<'
      if (entity === 'gt') return '>'
      if (entity === 'quot') return '"'
      if (entity === 'apos') return "'"
      if (entity === 'nbsp') return ' '
      if (entity[1] === 'x')
        return String.fromCodePoint(parseInt(entity.slice(2), 16))
      return String.fromCodePoint(parseInt(entity.slice(1), 10))
    },
  )
}

const PERMISSIONS = new Set<SharePermissionLevel>([
  'view_only',
  'comment_annotate',
  'edit_no_ai',
  'edit_with_ai_byok',
  'edit_with_ai_shared',
])

const MODES = new Set<CanvasInteractionMode>([
  'direct',
  'select',
  'sketch',
  'source',
])

function sanitizeHostOptions(
  options: MarbleIframeOptions,
): MarbleIframeOptions {
  return {
    appSlug:
      (options.appSlug || 'app').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) ||
      'app',
    mode: MODES.has(options.mode) ? options.mode : 'direct',
    permission: PERMISSIONS.has(options.permission)
      ? options.permission
      : 'view_only',
    theme: options.theme === 'light' ? 'light' : 'dark',
    selectedIds: options.selectedIds.filter((id) => typeof id === 'string'),
    proposedIds: options.proposedIds.filter((id) => typeof id === 'string'),
  }
}

function stripBridge(source: string): string {
  return source.replace(
    /<!-- xdrive-marble-bridge -->[\s\S]*?<!-- \/xdrive-marble-bridge -->\n?/g,
    '',
  )
}

function stampHostAttrs(source: string, options: MarbleIframeOptions): string {
  const locked =
    options.permission === 'view_only' ||
    options.permission === 'comment_annotate'
      ? '1'
      : '0'
  return source.replace(/<html\b([^>]*)>/i, (_match, attrs: string) => {
    const cleaned = attrs
      .replace(/\sdata-xdrive-theme="[^"]*"/g, '')
      .replace(/\sdata-xdrive-mode="[^"]*"/g, '')
      .replace(/\sdata-xdrive-permission="[^"]*"/g, '')
      .replace(/\sdata-xdrive-locked="[^"]*"/g, '')
    return `<html${cleaned} data-xdrive-theme="${options.theme}" data-xdrive-mode="${options.mode}" data-xdrive-permission="${options.permission}" data-xdrive-locked="${locked}">`
  })
}

function bridgeStyle(): string {
  return `<style data-xdrive-bridge="1">
html[data-xdrive-theme="dark"] { color-scheme: dark; }
html[data-xdrive-theme="light"] { color-scheme: light; }
.marble-grip, .marble-btn, .marble-alts, .marble-handle { font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.marble-item { position: relative; }
.marble-grip {
  position: absolute; left: -1.35rem; top: .35rem; z-index: 3;
  width: 1.1rem; height: 1.35rem; padding: 0; border: 0; border-radius: 4px;
  background: transparent; color: var(--muted, currentColor); cursor: grab; opacity: .35;
}
.marble-item:hover > .marble-grip, .marble-item:focus-within > .marble-grip, .marble-grip:focus-visible { opacity: 1; }
.marble-btn {
  position: absolute; right: .35rem; top: .35rem; z-index: 3;
  width: 1.25rem; height: 1.25rem; border: 0; border-radius: 999px;
  background: transparent; color: var(--danger, #9d2c2c); cursor: pointer; opacity: 0;
}
.marble-item:hover > .marble-btn, .marble-item:focus-within > .marble-btn, .marble-btn:focus-visible { opacity: 1; }
.marble-alts { display: inline-flex; gap: .25rem; margin: .35rem 0 0; }
.marble-alts button {
  border: 1px solid var(--line, #ccc); background: transparent; color: inherit;
  border-radius: 999px; padding: .1rem .45rem; cursor: pointer;
}
.marble-alts button[aria-pressed="true"] { background: var(--accent, #1f4b99); color: white; border-color: transparent; }
marble-alt > [data-marble-alt] { display: none; }
marble-alt > .marble-alt-shown { display: block; }
.xdrive-hover { outline: 1.5px dashed #1f4fd8; outline-offset: 3px; }
.xdrive-selected { outline: 2px dashed #1f4fd8; outline-offset: 3px; background: color-mix(in srgb, #1f4fd8 10%, transparent); }
.xdrive-proposed { outline: 2px dashed #c47b12; outline-offset: 5px; }
html[data-xdrive-locked="1"] [data-marble-add] { opacity: .45; }
.marble-handle {
  position: absolute; right: -6px; bottom: -6px; width: 12px; height: 12px;
  border: 0; border-radius: 2px; background: var(--accent, #1f4b99); cursor: nwse-resize;
}
[data-marble-resizable] { position: relative; }
</style>`
}

function bridgeScript(options: MarbleIframeOptions): string {
  const config = JSON.stringify({
    appSlug: options.appSlug,
    mode: options.mode,
    permission: options.permission,
    theme: options.theme,
    selectedIds: options.selectedIds,
    proposedIds: options.proposedIds,
  })
  return BRIDGE_JS.replace('%%CONFIG%%', config)
}

// The carrier the iframe document actually calls. Kept as a string so the same
// bytes run in the srcDoc and nowhere else — the .mrbl file on disk never
// contains this host bridge.
const BRIDGE_JS = `
(function () {
  var HOST = %%CONFIG%%;
  var ID = 'data-marble-id';
  var TRANSIENT = 'data-marble-transient';
  var readOnly = HOST.permission === 'view_only' || HOST.permission === 'comment_annotate';
  var notesAllowed = HOST.permission !== 'view_only';
  var undoStack = [];
  var redoStack = [];
  var pageOnly = ['contenteditable', 'spellcheck', 'aria-pressed', 'aria-expanded', 'aria-disabled', 'aria-label', 'tabindex', 'role'];
  var used = Object.create(null);
  var roles = new WeakMap();
  var status = { state: 'saved', sync: 'saved', pending: 0, sha: '', v: 0 };

  function $(id) {
    if (!id || !/^[\\w:.-]+$/.test(id)) return null;
    return document.querySelector('[' + ID + '="' + id + '"]');
  }

  function idOf(el) { return el && el.getAttribute ? el.getAttribute(ID) : null; }
  function isTransient(el) { return !!(el && el.hasAttribute && el.hasAttribute(TRANSIENT)); }
  function persistentChildren(el) {
    return [].filter.call(el.children || [], function (child) { return !isTransient(child); });
  }
  function nextPersistent(el) {
    var sibling = el.nextElementSibling;
    while (sibling && isTransient(sibling)) sibling = sibling.nextElementSibling;
    return sibling;
  }
  function claim(el, role) {
    var held = roles.get(el);
    if (!held) { held = new Set(); roles.set(el, held); }
    if (held.has(role)) return false;
    held.add(role);
    return true;
  }
  function within(root, selector) {
    var out = [];
    if (root.matches && root.matches(selector)) out.push(root);
    var found = root.querySelectorAll ? root.querySelectorAll(selector) : [];
    for (var i = 0; i < found.length; i++) out.push(found[i]);
    return out;
  }
  function post(message) {
    if (window.parent) window.parent.postMessage(message, '*');
  }
  function looks(el, byDefault) {
    var says = el.getAttribute('data-marble-look');
    return says === null ? byDefault : says !== 'off';
  }
  function isLook(op, options) {
    return !!(options && options.look) || !!(op && op.look);
  }
  function noteOp(op) {
    if (!op) return false;
    if (op.type === 'insert' && /data-marble-note/.test(op.html || '')) return true;
    if ((op.type === 'setText' || op.type === 'setInner' || op.type === 'setAttr') && op.id) {
      var el = $(op.id);
      if (el && (el.hasAttribute('data-marble-note') || el.hasAttribute('data-marble-note-body') || el.closest('[data-marble-note]'))) return true;
    }
    return false;
  }
  function allowed(op, options) {
    if (!readOnly) return true;
    if (isLook(op, options)) return true;
    if (notesAllowed && noteOp(op)) return true;
    return false;
  }
  function seedUsed() {
    var nodes = document.querySelectorAll('[' + ID + ']');
    for (var i = 0; i < nodes.length; i++) used[nodes[i].getAttribute(ID)] = true;
    var templates = document.querySelectorAll('template');
    for (var t = 0; t < templates.length; t++) {
      var content = templates[t].content;
      if (!content) continue;
      var inner = content.querySelectorAll('[' + ID + ']');
      for (var j = 0; j < inner.length; j++) used[inner[j].getAttribute(ID)] = true;
    }
  }
  function newId() {
    var id;
    do { id = Math.random().toString(36).slice(2, 10); } while (used[id]);
    used[id] = true;
    return id;
  }
  function tidy(html) {
    return html.replace(/(data-marble-[a-z][a-z0-9-]*)=""/g, '$1');
  }
  function cleanClone(el) {
    var clone = el.cloneNode(true);
    var doomed = [].slice.call(clone.querySelectorAll('[' + TRANSIENT + ']'));
    for (var i = 0; i < doomed.length; i++) doomed[i].remove();
    var nodes = [clone].concat([].slice.call(clone.querySelectorAll('*')));
    for (var n = 0; n < nodes.length; n++) {
      var node = nodes[n];
      for (var p = 0; p < pageOnly.length; p++) node.removeAttribute(pageOnly[p]);
      var cls = node.getAttribute('class');
      if (cls) {
        var keep = cls.split(/\\s+/).filter(function (name) {
          return name && name.indexOf('marble-') !== 0 && name.indexOf('xdrive-') !== 0;
        });
        if (keep.length) node.setAttribute('class', keep.join(' '));
        else node.removeAttribute('class');
      }
    }
    return clone;
  }
  function outerSource(el) { return tidy(cleanClone(el).outerHTML); }
  function innerSource(el) { return tidy(cleanClone(el).innerHTML); }
  function textOf(el) {
    var clone = cleanClone(el);
    return (clone.textContent || '').replace(/\\s+/g, ' ').trim();
  }
  function pathOf(el) {
    var path = [];
    var node = el;
    while (node && node !== document.documentElement) {
      var parent = node.parentElement;
      if (!parent) return null;
      var index = persistentChildren(parent).indexOf(node);
      if (index < 0) return null;
      path.unshift(index);
      node = parent;
    }
    return path;
  }
  function elementAtPath(path) {
    var node = document.documentElement;
    for (var i = 0; i < path.length; i++) {
      node = persistentChildren(node)[path[i]];
      if (!node) return null;
    }
    return node;
  }
  function fragmentFrom(html) {
    var template = document.createElement('template');
    template.innerHTML = html;
    return template.content;
  }
  function apply(op) {
    if (!op || !op.type) return;
    if (op.type === 'assignId') {
      var at = elementAtPath(op.path || []);
      if (at && !idOf(at)) { at.setAttribute(ID, op.id); used[op.id] = true; }
      return;
    }
    if (op.type === 'setText') {
      var textEl = $(op.id);
      if (!textEl) return;
      var chrome = [].filter.call(textEl.children, isTransient);
      textEl.textContent = op.text || '';
      for (var c = 0; c < chrome.length; c++) textEl.insertBefore(chrome[c], textEl.firstChild);
      return;
    }
    if (op.type === 'setInner') {
      var innerEl = $(op.id);
      if (!innerEl) return;
      var keep = [].filter.call(innerEl.children, isTransient);
      innerEl.innerHTML = op.html || '';
      for (var k = keep.length - 1; k >= 0; k--) innerEl.insertBefore(keep[k], innerEl.firstChild);
      adopt(innerEl);
      return;
    }
    if (op.type === 'setAttr') {
      var attrEl = $(op.id);
      if (!attrEl) return;
      if (op.value === null) attrEl.removeAttribute(op.name);
      else attrEl.setAttribute(op.name, op.value);
      return;
    }
    if (op.type === 'remove') {
      var gone = $(op.id);
      if (gone) gone.remove();
      return;
    }
    if (op.type === 'move') {
      var moving = $(op.id);
      var dest = $(op.parentId);
      if (!moving || !dest) return;
      dest.insertBefore(moving, op.beforeId ? $(op.beforeId) : null);
      return;
    }
    if (op.type === 'insert') {
      var parent = $(op.parentId);
      if (!parent) return;
      var fragment = fragmentFrom(op.html || '');
      var added = [].slice.call(fragment.children);
      parent.insertBefore(fragment, op.beforeId ? $(op.beforeId) : null);
      for (var a = 0; a < added.length; a++) {
        var stamped = [added[a]].concat([].slice.call(added[a].querySelectorAll('[' + ID + ']')));
        for (var s = 0; s < stamped.length; s++) {
          var sid = idOf(stamped[s]);
          if (sid) used[sid] = true;
        }
        adopt(added[a]);
      }
    }
  }
  function invert(op) {
    var el = op.id ? $(op.id) : null;
    if (op.type === 'assignId') return null;
    if (op.type === 'setText') return el && { type: 'setText', id: op.id, text: textOf(el) };
    if (op.type === 'setInner') return el && { type: 'setInner', id: op.id, html: innerSource(el) };
    if (op.type === 'setAttr') return el && { type: 'setAttr', id: op.id, name: op.name, value: el.getAttribute(op.name) };
    if (op.type === 'remove' && el) {
      return { type: 'insert', html: outerSource(el), parentId: idOf(el.parentElement), beforeId: idOf(nextPersistent(el)) };
    }
    if (op.type === 'move' && el) {
      return { type: 'move', id: op.id, parentId: idOf(el.parentElement), beforeId: idOf(nextPersistent(el)) };
    }
    if (op.type === 'insert') {
      var probe = fragmentFrom(op.html || '').firstElementChild;
      var rootId = probe && probe.getAttribute(ID);
      return rootId ? { type: 'remove', id: rootId } : null;
    }
    return null;
  }
  function file(op, options) {
    if (!allowed(op, options)) {
      post({ type: 'marble:locked', op: op, options: options || {} });
      return false;
    }
    status.pending += 1;
    status.state = 'saving';
    status.sync = 'saving';
    post({ type: 'marble:op', op: op, options: options || {} });
    status.pending = Math.max(0, status.pending - 1);
    status.state = 'saved';
    status.sync = 'saved';
    return true;
  }
  function record(step, opts) {
    if (opts && opts.coalesce && undoStack.length) {
      var tip = undoStack[undoStack.length - 1];
      if (tip.redo[0] && step.redo[0] && tip.redo[0].type === 'setText' && step.redo[0].type === 'setText' && tip.redo[0].id === step.redo[0].id) {
        tip.redo = step.redo;
        return;
      }
    }
    undoStack.push(step);
    redoStack = [];
  }
  function play(list) {
    for (var i = 0; i < list.length; i++) {
      apply(list[i]);
      file(list[i], {});
    }
  }
  var wirers = [];
  function register(fn) {
    wirers.push(fn);
    if (document.body) fn(document.body);
    return function () {
      var at = wirers.indexOf(fn);
      if (at >= 0) wirers.splice(at, 1);
    };
  }
  function adopt(root) {
    if (!root) return;
    for (var i = 0; i < wirers.length; i++) wirers[i](root);
  }
  function address(elements) {
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (!el || isTransient(el) || idOf(el)) continue;
      var path = pathOf(el);
      if (!path) continue;
      var id = newId();
      el.setAttribute(ID, id);
      file({ type: 'assignId', path: path, id: id }, {});
    }
  }
  function stampAll(root) {
    var nodes = [root].concat([].slice.call(root.querySelectorAll('*')));
    for (var i = 0; i < nodes.length; i++) {
      if (isTransient(nodes[i])) continue;
      nodes[i].setAttribute(ID, newId());
    }
  }
  function styleWith(el, declarations) {
    var written = [];
    var dropped = Object.create(null);
    var names = declarations ? Object.keys(declarations) : [];
    for (var i = 0; i < names.length; i++) {
      var dashed = names[i].replace(/[A-Z]/g, function (letter) { return '-' + letter.toLowerCase(); });
      dropped[dashed] = true;
      written.push([dashed, declarations[names[i]]]);
    }
    var style = typeof el === 'string' ? el : ((el && el.getAttribute && el.getAttribute('style')) || '');
    var rest = style.split(';').map(function (part) { return part.trim(); }).filter(function (part) {
      if (!part) return false;
      var key = part.slice(0, part.indexOf(':')).trim().toLowerCase();
      return !dropped[key];
    });
    var next = written.filter(function (pair) { return pair[1] !== null && pair[1] !== undefined && pair[1] !== ''; }).map(function (pair) { return pair[0] + ':' + pair[1]; });
    return next.concat(rest).join(';');
  }
  function affordanceList(el) {
    var names = [];
    if (el.hasAttribute('data-marble-editable')) names.push('editable');
    if (el.hasAttribute('data-marble-sortable')) names.push('sortable');
    if (el.hasAttribute('data-marble-removable')) names.push('removable');
    if (el.hasAttribute('data-marble-canvas')) names.push('canvas');
    if (el.hasAttribute('data-marble-resizable')) names.push('resizable');
    if (el.hasAttribute('data-marble-add')) names.push('add');
    if (el.hasAttribute('data-marble-toggle')) names.push('toggle');
    if (el.hasAttribute('data-marble-choose')) names.push('choose');
    if (el.hasAttribute('data-marble-step')) names.push('step');
    if (el.hasAttribute('data-marble-note')) names.push('note');
    if (el.tagName.toLowerCase() === 'marble-alt' || el.hasAttribute('data-marble-alt')) names.push('alt');
    var parent = el.parentElement;
    if (parent && parent.hasAttribute('data-marble-sortable') && names.indexOf('sortable') < 0) names.push('sortable');
    if (parent && parent.hasAttribute('data-marble-canvas') && names.indexOf('canvas') < 0) names.push('canvas');
    return names;
  }
  function affords(el) {
    var empty = { id: null, move: null, size: null, text: false, remove: false, pick: false, attrs: [] };
    if (!el || el.nodeType !== 1) return empty;
    var parent = el.parentElement;
    var move = null;
    if (parent && parent.hasAttribute('data-marble-sortable')) {
      move = { kind: 'sortable', group: parent.getAttribute('data-marble-sortable') || '', op: 'move' };
    } else if (parent && parent.hasAttribute('data-marble-canvas') && parent.getAttribute('data-marble-canvas') !== 'off') {
      move = { kind: 'canvas', op: 'setAttr', name: 'style' };
    }
    var size = null;
    if (el.hasAttribute('data-marble-resizable')) {
      var axes = (el.getAttribute('data-marble-resizable') || 'wh').toLowerCase();
      if (!axes.trim()) axes = 'wh';
      size = { kind: 'resizable', axes: axes, op: 'setAttr', name: 'style' };
    }
    var attrs = [];
    if (el.hasAttribute('data-marble-toggle')) attrs.push({ kind: 'toggle', name: el.getAttribute('data-marble-toggle') || '' });
    if (el.hasAttribute('data-marble-choose')) attrs.push({ kind: 'choose', name: el.getAttribute('data-marble-choose') || '' });
    if (el.hasAttribute('data-marble-step')) attrs.push({ kind: 'step', name: el.getAttribute('data-marble-step') || '' });
    return {
      id: idOf(el),
      move: move,
      size: size,
      text: el.hasAttribute('data-marble-editable'),
      remove: el.hasAttribute('data-marble-removable'),
      pick: el.hasAttribute('data-marble-selectable'),
      attrs: attrs
    };
  }

  var marble = {
    app: HOST.appSlug,
    client: Math.random().toString(36).slice(2, 10),
    canChange: !readOnly,
    notesAllowed: notesAllowed,
    get status() { return status; },
    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; },
    op: function (op, options) { return file(op, options || {}); },
    flush: function () { status.pending = 0; status.state = 'saved'; status.sync = 'saved'; return Promise.resolve(status); },
    newId: newId,
    id: idOf,
    byId: $,
    address: address,
    ensureIds: function (els) { address(els || []); return Promise.resolve((els || []).length); },
    apply: apply,
    invert: invert,
    record: record,
    undo: function () {
      var step = undoStack.pop();
      if (!step) return;
      play(step.undo);
      redoStack.push(step);
    },
    redo: function () {
      var step = redoStack.pop();
      if (!step) return;
      play(step.redo);
      undoStack.push(step);
    },
    register: register,
    adopt: adopt,
    clone: cleanClone,
    text: textOf,
    source: { outer: outerSource, inner: innerSource },
    transient: function (el) { if (el) el.setAttribute(TRANSIENT, ''); },
    pageOnly: function () { for (var i = 0; i < arguments.length; i++) pageOnly.push(arguments[i]); },
    docs: function () { return Promise.resolve([]); },
    href: function (name) { return '#' + name; },
    patch: function () { return Promise.resolve(); },
    stream: function () { return { readyState: 2, close: function () {}, rest: function () {}, wake: function () {} }; },
    outbox: { held: function () { return []; }, send: function () { return Promise.resolve([]); }, discard: function () {} }
  };
  window.marble = marble;
  globalThis.marble = marble;
  globalThis.marbleVocabulary = { affords: affords, styleWith: styleWith };
  seedUsed();

  function setFact(node, name, value, look) {
    var id = idOf(node);
    if (!id) return;
    var prior = node.getAttribute(name);
    if (prior === value) return;
    node.setAttribute(name, value);
    var op = { type: 'setAttr', id: id, name: name, value: value };
    if (!file(op, { immediate: true, look: look })) {
      if (prior === null) node.removeAttribute(name);
      else node.setAttribute(name, prior);
      return;
    }
    record({ redo: [op], undo: [{ type: 'setAttr', id: id, name: name, value: prior }] });
  }
  function resolve(el) {
    var selector = el.getAttribute('data-marble-of');
    var node = selector ? el.closest(selector) : el;
    return node;
  }

  function wireEditable(root) {
    if (readOnly) return;
    var nodes = within(root, '[data-marble-editable]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!claim(el, 'editable')) continue;
      el.setAttribute('contenteditable', 'plaintext-only');
      if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
      el.spellcheck = false;
      (function (node) {
        var prior = null;
        node.addEventListener('focus', function () { prior = marble.text(node); });
        node.addEventListener('input', function () {
          var id = idOf(node);
          if (!id || prior === null) return;
          var text = marble.text(node);
          if (text === prior) return;
          var op = { type: 'setText', id: id, text: text };
          record({ redo: [op], undo: [{ type: 'setText', id: id, text: prior }] }, { coalesce: true });
          file(op, { immediate: true });
        });
      })(el);
    }
  }
  function wireRemovable(root) {
    var nodes = within(root, '[data-marble-removable]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!claim(el, 'removable')) continue;
      el.classList.add('marble-item');
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'marble-btn';
      button.setAttribute(TRANSIENT, '');
      button.setAttribute('contenteditable', 'false');
      button.setAttribute('aria-label', 'Remove');
      button.textContent = '×';
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        if (readOnly) { post({ type: 'marble:locked', op: { type: 'remove' }, options: {} }); return; }
        var item = event.currentTarget.parentElement;
        var id = idOf(item);
        var parentId = idOf(item.parentElement);
        if (!id || !parentId) return;
        var beforeId = idOf(nextPersistent(item));
        var html = outerSource(item);
        var op = { type: 'remove', id: id };
        item.remove();
        if (!file(op, { immediate: true })) return;
        record({ redo: [op], undo: [{ type: 'insert', html: html, parentId: parentId, beforeId: beforeId }] });
      });
      el.appendChild(button);
    }
  }
  function wireSortable(root) {
    var lists = within(root, '[data-marble-sortable]');
    for (var i = 0; i < lists.length; i++) {
      var list = lists[i];
      if (!claim(list, 'sortable')) continue;
      var group = list.getAttribute('data-marble-sortable') || '';
      var items = persistentChildren(list);
      for (var n = 0; n < items.length; n++) wireSortItem(items[n], group);
    }
  }
  function wireSortItem(item, group) {
    if (!idOf(item) || !claim(item, 'sort-item')) return;
    item.classList.add('marble-item');
    var handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'marble-grip';
    handle.setAttribute(TRANSIENT, '');
    handle.setAttribute('contenteditable', 'false');
    handle.setAttribute('aria-label', 'Drag to reorder');
    handle.textContent = '⋮⋮';
    item.insertBefore(handle, item.firstChild);
    if (readOnly) { handle.disabled = true; return; }
    handle.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      event.preventDefault();
      var startParent = idOf(item.parentElement);
      var startBefore = idOf(nextPersistent(item));
      item.classList.add('marble-dragging');
      function move(ev) {
        var under = document.elementFromPoint(ev.clientX, ev.clientY);
        var target = under && under.closest ? under.closest('[data-marble-id]') : null;
        while (target && target.parentElement && (target.parentElement.getAttribute('data-marble-sortable') || '') !== group) {
          target = target.parentElement.closest('[data-marble-id]');
        }
        if (!target || target === item || !target.parentElement) return;
        var rect = target.getBoundingClientRect();
        var before = ev.clientY < rect.top + rect.height / 2;
        target.parentElement.insertBefore(item, before ? target : target.nextElementSibling);
      }
      function up() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        item.classList.remove('marble-dragging');
        var parentId = idOf(item.parentElement);
        var beforeId = idOf(nextPersistent(item));
        if (parentId === startParent && beforeId === startBefore) return;
        var op = { type: 'move', id: idOf(item), parentId: parentId, beforeId: beforeId };
        if (!file(op, { immediate: true })) {
          apply({ type: 'move', id: idOf(item), parentId: startParent, beforeId: startBefore });
          return;
        }
        record({ redo: [op], undo: [{ type: 'move', id: idOf(item), parentId: startParent, beforeId: startBefore }] });
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  }
  function wireAdders(root) {
    var buttons = within(root, '[data-marble-add]');
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      if (!claim(button, 'adder')) continue;
      button.addEventListener('click', function (event) {
        var control = event.currentTarget;
        if (readOnly) { post({ type: 'marble:locked', op: { type: 'insert' }, options: {} }); return; }
        var template = document.querySelector(control.getAttribute('data-marble-add'));
        var into = control.getAttribute('data-marble-into');
        var container = into === 'prev' ? control.previousElementSibling : document.querySelector(into);
        var seed = template && template.content && template.content.firstElementChild;
        if (!seed || !container) return;
        var node = seed.cloneNode(true);
        stampAll(node);
        var html = outerSource(node);
        container.appendChild(node);
        adopt(node);
        var op = { type: 'insert', html: html, parentId: idOf(container), beforeId: null };
        if (!file(op, { immediate: true })) { node.remove(); return; }
        var inverse = invert(op);
        if (inverse) record({ redo: [op], undo: [inverse] });
        var focus = node.querySelector('[data-marble-editable]');
        if (focus) focus.focus();
      });
    }
  }
  function wireAlt(root) {
    var alts = within(root, 'marble-alt');
    for (var i = 0; i < alts.length; i++) {
      var alt = alts[i];
      if (!claim(alt, 'alt')) continue;
      var widget = document.createElement('div');
      widget.className = 'marble-alts';
      widget.setAttribute(TRANSIENT, '');
      widget.setAttribute('contenteditable', 'false');
      alt.appendChild(widget);
      function versionsOf(box) {
        return persistentChildren(box).filter(function (el) { return el !== widget; });
      }
      function render(box) {
        var versions = versionsOf(box);
        var active = box.getAttribute('data-marble-active');
        var current = null;
        for (var v = 0; v < versions.length; v++) {
          if (versions[v].getAttribute('data-marble-alt') === active) current = versions[v];
        }
        if (!current) current = versions[0] || null;
        for (var s = 0; s < versions.length; s++) {
          versions[s].classList.toggle('marble-alt-shown', versions[s] === current);
        }
        var names = versions.map(function (el) { return el.getAttribute('data-marble-alt') || ''; }).join('\\n');
        if (widget.dataset.names !== names) {
          widget.dataset.names = names;
          widget.innerHTML = '';
          for (var b = 0; b < versions.length; b++) {
            var name = versions[b].getAttribute('data-marble-alt') || ('v' + (b + 1));
            var pill = document.createElement('button');
            pill.type = 'button';
            pill.textContent = name;
            pill.dataset.name = name;
            pill.addEventListener('click', function (event) {
              var chosen = event.currentTarget.dataset.name;
              setFact(box, 'data-marble-active', chosen, true);
              render(box);
            });
            widget.appendChild(pill);
          }
        }
        var pills = widget.querySelectorAll('button');
        for (var p = 0; p < pills.length; p++) {
          pills[p].setAttribute('aria-pressed', String(current && pills[p].dataset.name === current.getAttribute('data-marble-alt')));
        }
      }
      render(alt);
      new MutationObserver(function () { render(alt); }).observe(alt, { attributes: true, attributeFilter: ['data-marble-active'], childList: true });
    }
  }
  function wireToggle(root) {
    var nodes = within(root, '[data-marble-toggle]');
    for (var i = 0; i < nodes.length; i++) {
      (function (el) {
        if (!claim(el, 'toggle')) return;
        var spec = el.getAttribute('data-marble-toggle') || '';
        var cut = spec.indexOf(':');
        var name = spec.slice(0, cut).trim();
        var pair = spec.slice(cut + 1).split('|');
        var on = (pair[0] || '').trim();
        var off = (pair[1] || '').trim();
        var node = resolve(el);
        if (!name || !on || !node) return;
        if (el.tagName !== 'BUTTON') el.setAttribute('role', 'button');
        var sync = function () { el.setAttribute('aria-pressed', String(node.getAttribute(name) === on)); };
        sync();
        el.addEventListener('click', function () {
          var next = node.getAttribute(name) === on ? off : on;
          setFact(node, name, next, looks(el, false));
          sync();
        });
      })(nodes[i]);
    }
  }
  function wireChoose(root) {
    var boxes = within(root, '[data-marble-choose]');
    for (var i = 0; i < boxes.length; i++) {
      (function (box) {
        if (!claim(box, 'choose')) return;
        var name = (box.getAttribute('data-marble-choose') || '').trim();
        var node = resolve(box);
        var options = [].slice.call(box.querySelectorAll('[data-marble-value]'));
        if (!name || !node || !options.length) return;
        var sync = function () {
          var current = node.getAttribute(name);
          for (var o = 0; o < options.length; o++) {
            options[o].setAttribute('aria-pressed', String(options[o].getAttribute('data-marble-value') === current));
          }
        };
        for (var o = 0; o < options.length; o++) {
          (function (option) {
            option.addEventListener('click', function () {
              setFact(node, name, option.getAttribute('data-marble-value'), looks(box, true));
              sync();
            });
          })(options[o]);
        }
        sync();
      })(boxes[i]);
    }
  }
  function wireStep(root) {
    var nodes = within(root, '[data-marble-step]');
    for (var i = 0; i < nodes.length; i++) {
      (function (el) {
        if (!claim(el, 'step')) return;
        var parts = (el.getAttribute('data-marble-step') || '').split(':');
        var name = (parts[0] || '').trim();
        var low = Number((parts[1] || '').trim());
        var high = Number((parts[2] || '').trim());
        var by = Number(el.getAttribute('data-marble-by') || '1');
        var node = resolve(el);
        if (!name || !node || !isFinite(low) || !isFinite(high)) return;
        el.addEventListener('click', function () {
          var now = Number(node.getAttribute(name));
          if (!isFinite(now)) now = low;
          var next = Math.min(high, Math.max(low, now + by));
          if (next === now) return;
          setFact(node, name, String(next), looks(el, true));
        });
      })(nodes[i]);
    }
  }
  function wireNote(root) {
    var nodes = within(root, '[data-marble-note]');
    for (var i = 0; i < nodes.length; i++) {
      (function (el) {
        if (!claim(el, 'note')) return;
        if (!notesAllowed && readOnly) return;
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'marble-btn';
        button.setAttribute(TRANSIENT, '');
        button.setAttribute('aria-label', 'Add a note');
        button.textContent = '✎';
        button.addEventListener('click', function (event) {
          event.stopPropagation();
          var body = el.querySelector(':scope > [data-marble-note-body]');
          if (!body) {
            var id = newId();
            var op = { type: 'insert', parentId: idOf(el), beforeId: null, html: '<p data-marble-id="' + id + '" data-marble-note-body data-marble-editable data-ph="Note"></p>' };
            apply(op);
            if (!file(op, { immediate: true })) { var born = $(id); if (born) born.remove(); return; }
            record({ redo: [op], undo: [{ type: 'remove', id: id }] });
            body = $(id);
          }
          if (body) body.focus();
        });
        el.appendChild(button);
      })(nodes[i]);
    }
  }
  function wireResizable(root) {
    if (readOnly) return;
    var nodes = within(root, '[data-marble-resizable]');
    for (var i = 0; i < nodes.length; i++) {
      (function (el) {
        if (!claim(el, 'resizable')) return;
        var handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'marble-handle';
        handle.setAttribute(TRANSIENT, '');
        handle.setAttribute('aria-label', 'Resize');
        el.appendChild(handle);
        handle.addEventListener('pointerdown', function (event) {
          event.preventDefault();
          event.stopPropagation();
          var startX = event.clientX;
          var startY = event.clientY;
          var rect = el.getBoundingClientRect();
          var prior = el.getAttribute('style');
          function move(ev) {
            var style = styleWith(el, { width: Math.max(48, rect.width + ev.clientX - startX) + 'px', height: Math.max(48, rect.height + ev.clientY - startY) + 'px' });
            el.setAttribute('style', style);
          }
          function up() {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
            var style = el.getAttribute('style');
            setFact(el, 'style', style, false);
            if (prior !== null && el.getAttribute('style') === prior) el.setAttribute('style', prior);
          }
          document.addEventListener('pointermove', move);
          document.addEventListener('pointerup', up);
        });
      })(nodes[i]);
    }
  }

  register(function (root) {
    wireEditable(root);
    wireRemovable(root);
    wireSortable(root);
    wireAdders(root);
    wireAlt(root);
    wireToggle(root);
    wireChoose(root);
    wireStep(root);
    wireNote(root);
    wireResizable(root);
  });

  if (readOnly) {
    document.addEventListener('beforeinput', function (event) {
      var el = event.target && event.target.closest && event.target.closest('[contenteditable]');
      if (!el) return;
      if (notesAllowed && el.closest('[data-marble-note], [data-marble-note-body]')) return;
      event.preventDefault();
    }, true);
  }

  function previewOf(el) {
    var text = textOf(el);
    return text.length > 140 ? text.slice(0, 139) + '…' : text;
  }
  function mark() {
    var prev = document.querySelectorAll('.xdrive-selected, .xdrive-proposed');
    for (var i = 0; i < prev.length; i++) {
      prev[i].classList.remove('xdrive-selected');
      prev[i].classList.remove('xdrive-proposed');
    }
    for (var s = 0; s < HOST.selectedIds.length; s++) {
      var selected = $(HOST.selectedIds[s]);
      if (selected) selected.classList.add('xdrive-selected');
    }
    for (var p = 0; p < HOST.proposedIds.length; p++) {
      var proposed = $(HOST.proposedIds[p]);
      if (proposed) proposed.classList.add('xdrive-proposed');
    }
  }
  if (HOST.mode === 'select' || HOST.mode === 'sketch') {
    var hover = null;
    document.addEventListener('mouseover', function (event) {
      var el = event.target && event.target.closest && event.target.closest('[' + ID + ']');
      if (hover === el) return;
      if (hover) hover.classList.remove('xdrive-hover');
      hover = el;
      if (hover) hover.classList.add('xdrive-hover');
    }, true);
    document.addEventListener('pointerdown', function (event) {
      var el = event.target && event.target.closest && event.target.closest('[' + ID + ']');
      if (!el) return;
      if (event.target.closest && event.target.closest('[' + TRANSIENT + ']')) return;
      event.preventDefault();
      event.stopPropagation();
      var rect = el.getBoundingClientRect();
      el.classList.add('xdrive-selected');
      post({
        type: 'marble:select-node',
        element: {
          id: idOf(el),
          tagName: el.tagName.toLowerCase(),
          textPreview: previewOf(el),
          sourceSlice: outerSource(el),
          affordances: affordanceList(el),
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        }
      });
    }, true);
  }
  mark();
  document.addEventListener('keydown', function (event) {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
    var field = event.target && event.target.closest && event.target.closest('[contenteditable]');
    if (field) return;
    event.preventDefault();
    if (event.shiftKey) marble.redo();
    else marble.undo();
  });
  document.dispatchEvent(new Event('marble:ready'));
})();
`.trim()
