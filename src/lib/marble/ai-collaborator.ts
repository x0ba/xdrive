// Turns a prompt, a selection, or a sketch into Marble ops against the open
// .mrbl file. A live /api/marble route wins when it answers; otherwise the
// synthesizer below reads the addressed nodes and writes the smallest staged
// edit that still changes the file.

import type {
  AIMessage,
  AIProviderId,
  MarbleDocumentFile,
  MarbleOp,
  MarbleOpProposal,
  SelectedMarbleElement,
  SketchAnnotation,
  ShareConfig,
} from '../types'
import type { MarbleNodeRecord } from './engine-client'
import {
  applyMarbleOpsClient,
  byteSizeOf,
  countMarbleNodes,
  escapeText,
  inspectMarbleNodes,
} from './engine-client'

export type MarbleActionKind =
  'dtrt' | 'factory' | 'scale' | 'fork_alt' | 'sketch_build' | 'new_app'

export interface CollaborationRequest {
  source: string
  instruction: string
  selectedElements?: SelectedMarbleElement[]
  sketchAnnotations?: SketchAnnotation[]
  modelId: string
  providerId: AIProviderId
  action?: MarbleActionKind
}

export interface CollaborationResult {
  proposal: MarbleOpProposal
  stages: NonNullable<AIMessage['stages']>
  newDocument?: MarbleDocumentFile
  source: 'api' | 'synthesizer'
}

const OP_TYPES = new Set([
  'setText',
  'setInner',
  'setAttr',
  'insert',
  'move',
  'remove',
  'assignId',
])

export async function generateMarbleCollaboration(
  request: CollaborationRequest,
): Promise<CollaborationResult> {
  const fromApi = await askMarbleApi(request)
  if (fromApi) return fromApi
  return synthesizeMarbleOps(request)
}

export function synthesizeMarbleOps(
  request: CollaborationRequest,
): CollaborationResult {
  const instruction = request.instruction.trim() || 'Do the right thing.'
  const selected = request.selectedElements ?? []
  const sketches = request.sketchAnnotations ?? []
  const action = detectMarbleAction(instruction, sketches, request.action)
  const nodes = request.source ? inspectMarbleNodes(request.source) : []
  const mint = idFactory(request.source || '')

  if (action === 'new_app') {
    const built = buildNewApp(instruction, request, mint)
    const stages = narrateApp(built.title, built.sections)
    return {
      proposal: makeProposal(
        request,
        `Built “${built.title}” as a new .mrbl app.`,
        stages,
        [],
      ),
      stages,
      newDocument: built.document,
      source: 'synthesizer',
    }
  }

  const structured =
    action === 'dtrt' || action === 'factory'
      ? tryStructuredInsert(nodes, mint, instruction)
      : null
  const drafted =
    structured ??
    draftForAction(action, nodes, mint, instruction, selected, sketches)
  const stages = commitStages(request.source, drafted.stages)
  const targetIds = drafted.targetIds.length
    ? drafted.targetIds
    : stages.flatMap((stage) => idsTouched(stage.ops))
  return {
    proposal: makeProposal(request, drafted.note, stages, unique(targetIds)),
    stages,
    source: 'synthesizer',
  }
}

export function detectMarbleAction(
  instruction: string,
  sketches: SketchAnnotation[] = [],
  explicit?: MarbleActionKind,
): MarbleActionKind {
  if (explicit) return explicit
  const text = instruction.trim()
  if (
    /\b(new app|from scratch|build (me )?an app|create (me )?(a |an )?app|make (me )?a new app)\b/i.test(
      text,
    )
  ) {
    return 'new_app'
  }
  if (
    sketches.length &&
    /\b(sketch|annotation|circled|boxed|arrow|callout)\b/i.test(text)
  )
    return 'sketch_build'
  if (
    /\b(fork|another (way|phrasing|version)|alternative|rephrase)\b/i.test(text)
  )
    return 'fork_alt'
  if (
    /\b(scale|duplicate|clone|another (section|row|slide|note|copy)|more like this)\b/i.test(
      text,
    )
  )
    return 'scale'
  if (/\b(factory|adder|button that adds)\b/i.test(text)) return 'factory'
  if (sketches.length && text.length < 12) return 'sketch_build'
  return 'dtrt'
}

function draftForAction(
  action: MarbleActionKind,
  nodes: MarbleNodeRecord[],
  mint: () => string,
  instruction: string,
  selected: SelectedMarbleElement[],
  sketches: SketchAnnotation[],
): {
  note: string
  stages: NonNullable<AIMessage['stages']>
  targetIds: string[]
} {
  if (action === 'fork_alt')
    return draftFork(nodes, mint, instruction, selected)
  if (action === 'scale') return draftScale(nodes, mint, instruction, selected)
  if (action === 'factory')
    return draftFactory(nodes, mint, instruction, selected)
  if (action === 'sketch_build')
    return draftSketch(nodes, mint, sketches, instruction)
  return draftDtrt(nodes, instruction, selected, sketches)
}

function draftDtrt(
  nodes: MarbleNodeRecord[],
  instruction: string,
  selected: SelectedMarbleElement[],
  sketches: SketchAnnotation[],
): {
  note: string
  stages: NonNullable<AIMessage['stages']>
  targetIds: string[]
} {
  const targets = resolveTargets(nodes, selected, instruction)
    .filter(isLeafEditable)
    .slice(0, 6)
  const leaves = targets.length
    ? targets
    : nodes.filter(isLeafEditable).slice(0, 3)
  const rewrites = leaves
    .map((node) => {
      const hint = sketchHint(sketches, node.id)
      const text = rewriteText(
        node.text,
        hint ? `${instruction} ${hint}` : instruction,
      )
      return text && text !== node.text.replace(/\s+/g, ' ').trim()
        ? { node, text }
        : null
    })
    .filter((item): item is { node: MarbleNodeRecord; text: string } =>
      Boolean(item),
    )

  if (!rewrites.length && leaves[0]) {
    const text =
      `${leaves[0].text.replace(/\s+/g, ' ').trim()} ${closingClause(instruction)}`.trim()
    rewrites.push({ node: leaves[0], text })
  }

  const first = rewrites.at(0)
  const rest = rewrites.slice(1)
  const stages: NonNullable<AIMessage['stages']> = [
    {
      stageNumber: 1,
      totalStages: 3,
      note: 'Stage 1 of 3: revise the line the instruction names.',
      ops: first
        ? [{ type: 'setText', id: first.node.id, text: first.text }]
        : [],
      completed: false,
    },
    {
      stageNumber: 2,
      totalStages: 3,
      note: 'Stage 2 of 3: carry the same edit through the neighboring lines.',
      ops: rest.map((item) => ({
        type: 'setText',
        id: item.node.id,
        text: item.text,
      })),
      completed: false,
    },
    {
      stageNumber: 3,
      totalStages: 3,
      note: 'Stage 3 of 3: mark the passage as reviewed in the file.',
      ops: first
        ? [
            {
              type: 'setAttr',
              id: first.node.id,
              name: 'data-reviewed',
              value: 'yes',
            },
          ]
        : [],
      completed: false,
    },
  ]
  return {
    note: first
      ? `Revised “${clip(first.node.text)}” from the open document.`
      : 'Nothing in the selection could take a text edit.',
    stages,
    targetIds: rewrites.map((item) => item.node.id),
  }
}

function draftScale(
  nodes: MarbleNodeRecord[],
  mint: () => string,
  instruction: string,
  selected: SelectedMarbleElement[],
): {
  note: string
  stages: NonNullable<AIMessage['stages']>
  targetIds: string[]
} {
  const seed = pickSeed(nodes, selected)
  if (!seed || !seed.parentId) {
    return draftDtrt(nodes, instruction, selected, [])
  }
  const count = requestedCount(instruction)
  const ops: MarbleOp[] = []
  const ids: string[] = []
  for (let index = 0; index < count; index += 1) {
    const html = suffixCopy(renewIds(seed.sourceSlice, mint), index + 2)
    const id = firstId(html)
    if (id) ids.push(id)
    // Same beforeId each time: the next insert lands after the previous copy.
    ops.push({
      type: 'insert',
      html,
      parentId: seed.parentId,
      beforeId: seed.nextId,
    })
  }
  const chunks = splitCount(ops, 3)
  return {
    note: `Scaled “${clip(seed.text)}” into ${count} more ${seed.tagName} node${count === 1 ? '' : 's'}.`,
    targetIds: [seed.id, ...ids],
    stages: chunks.map((part, index) => ({
      stageNumber: index + 1,
      totalStages: chunks.length,
      note: `Stage ${index + 1} of ${chunks.length}: add the next copy beside the selection.`,
      ops: part,
      completed: false,
    })),
  }
}

function draftFactory(
  nodes: MarbleNodeRecord[],
  mint: () => string,
  instruction: string,
  selected: SelectedMarbleElement[],
): {
  note: string
  stages: NonNullable<AIMessage['stages']>
  targetIds: string[]
} {
  const seed = pickSeed(nodes, selected)
  const parent = seed?.parentId
    ? nodes.find((node) => node.id === seed.parentId)
    : nodes.find((node) => node.affordances.includes('sortable'))
  if (!parent) return draftDtrt(nodes, instruction, selected, [])
  const templateId = mint()
  const buttonId = mint()
  const list = parent.affordances.includes('sortable')
    ? parent
    : (nodes.find((node) => node.affordances.includes('sortable')) ?? parent)
  const hostId = list.parentId ?? list.id
  const beforeId = list.parentId ? list.nextId : null
  const cleanTemplate = `<template data-marble-id="${templateId}" id="${templateId}">${stamp(
    '<section data-marble-id="__" data-marble-removable data-marble-selectable><h3 data-marble-id="__" data-marble-editable>New item</h3><p data-marble-id="__" data-marble-editable>Name the thing this button adds.</p></section>',
    mint,
  )}</template>`
  const buttonHtml = `<button data-marble-id="${buttonId}" type="button" data-marble-add="#${templateId}" data-marble-into="#${list.id}">+ Add</button>`
  return {
    note: `Added an adder for ${list.tagName} “${clip(list.text)}”.`,
    targetIds: [list.id, templateId, buttonId],
    stages: [
      {
        stageNumber: 1,
        totalStages: 3,
        note: 'Stage 1 of 3: plant the template the button will clone.',
        ops: [
          { type: 'insert', html: cleanTemplate, parentId: hostId, beforeId },
        ],
        completed: false,
      },
      {
        stageNumber: 2,
        totalStages: 3,
        note: 'Stage 2 of 3: add the button that clones it.',
        ops: [{ type: 'insert', html: buttonHtml, parentId: hostId, beforeId }],
        completed: false,
      },
      {
        stageNumber: 3,
        totalStages: 3,
        note: 'Stage 3 of 3: label the button from the instruction.',
        ops: [
          {
            type: 'setText',
            id: buttonId,
            text: buttonLabel(instruction),
          },
        ],
        completed: false,
      },
    ],
  }
}

function draftFork(
  nodes: MarbleNodeRecord[],
  mint: () => string,
  instruction: string,
  selected: SelectedMarbleElement[],
): {
  note: string
  stages: NonNullable<AIMessage['stages']>
  targetIds: string[]
} {
  const seed =
    pickSeed(nodes, selected) ?? nodes.find((node) => node.tagName === 'h1')
  if (!seed) return draftDtrt(nodes, instruction, selected, [])
  const parent = seed.parentId
    ? nodes.find((node) => node.id === seed.parentId)
    : undefined
  const [second, third] = reframings(seed.text, instruction)

  if (parent?.tagName === 'marble-alt') {
    const version = nextVersion(parent.sourceSlice)
    const html = replaceFirstText(
      withAttr(renewIds(seed.sourceSlice, mint), 'data-marble-alt', version),
      second,
    )
    const id = firstId(html)
    return {
      note: `Added ${version} inside the existing alternatives.`,
      targetIds: [parent.id, seed.id, id ?? ''],
      stages: [
        {
          stageNumber: 1,
          totalStages: 3,
          note: 'Stage 1 of 3: insert the new phrasing beside the current one.',
          ops: [{ type: 'insert', html, parentId: parent.id, beforeId: null }],
          completed: false,
        },
        {
          stageNumber: 2,
          totalStages: 3,
          note: 'Stage 2 of 3: sharpen that candidate in place.',
          ops: id ? [{ type: 'setText', id, text: third }] : [],
          completed: false,
        },
        {
          stageNumber: 3,
          totalStages: 3,
          note: 'Stage 3 of 3: show the new candidate.',
          ops: [
            {
              type: 'setAttr',
              id: parent.id,
              name: 'data-marble-active',
              value: version,
            },
          ],
          completed: false,
        },
      ],
    }
  }

  if (!seed.parentId) return draftDtrt(nodes, instruction, selected, [])
  const altId = mint()
  const variant = replaceFirstText(
    withAttr(renewIds(seed.sourceSlice, mint), 'data-marble-alt', 'v2'),
    second,
  )
  // v1 keeps the original ids so the move does not duplicate them. The variant is the insert.
  const shell = `<marble-alt data-marble-id="${altId}" data-marble-active="v1"></marble-alt>`
  return {
    note: `Forked “${clip(seed.text)}” into a marble-alt.`,
    targetIds: [seed.id, altId],
    stages: [
      {
        stageNumber: 1,
        totalStages: 4,
        note: 'Stage 1 of 4: open an alternative beside the selection.',
        ops: [
          {
            type: 'insert',
            html: shell,
            parentId: seed.parentId,
            beforeId: seed.nextId,
          },
        ],
        completed: false,
      },
      {
        stageNumber: 2,
        totalStages: 4,
        note: 'Stage 2 of 4: move the current wording in as v1.',
        ops: [
          { type: 'move', id: seed.id, parentId: altId, beforeId: null },
          {
            type: 'setAttr',
            id: seed.id,
            name: 'data-marble-alt',
            value: 'v1',
          },
        ],
        completed: false,
      },
      {
        stageNumber: 3,
        totalStages: 4,
        note: 'Stage 3 of 4: add the other way it could read.',
        ops: [
          { type: 'insert', html: variant, parentId: altId, beforeId: null },
        ],
        completed: false,
      },
      {
        stageNumber: 4,
        totalStages: 4,
        note: 'Stage 4 of 4: show the new phrasing.',
        ops: [
          {
            type: 'setAttr',
            id: altId,
            name: 'data-marble-active',
            value: 'v2',
          },
        ],
        completed: false,
      },
    ],
  }
}

function draftSketch(
  nodes: MarbleNodeRecord[],
  mint: () => string,
  sketches: SketchAnnotation[],
  instruction: string,
): {
  note: string
  stages: NonNullable<AIMessage['stages']>
  targetIds: string[]
} {
  const notes = sketches.length
    ? sketches
    : [
        {
          id: 'sketch',
          kind: 'callout' as const,
          label: instruction,
          boundingBox: { x: 0, y: 0, width: 0, height: 0 },
          coveredNodeIds: [],
          color: '#1f4b99',
        },
      ]
  const ops: MarbleOp[] = []
  const targetIds: string[] = []
  for (const sketch of notes) {
    const covered = sketch.coveredNodeIds
      .map((id) => nodes.find((node) => node.id === id))
      .filter((node): node is MarbleNodeRecord => Boolean(node))
    const host =
      covered.at(0) ??
      nodes.find(
        (node) =>
          node.tagName === 'section' || node.affordances.includes('sortable'),
      )
    if (!host) continue
    targetIds.push(host.id)
    const marked = covered.at(0)
    if (/^\s*(remove|delete|drop)\b/i.test(sketch.label) && marked) {
      ops.push({ type: 'remove', id: marked.id })
      continue
    }
    const html = stamp(
      `<aside data-marble-id="__" data-marble-note data-marble-removable><p data-marble-id="__" data-marble-note-body data-marble-editable>${escapeText(sketch.label || instruction)}</p></aside>`,
      mint,
    )
    ops.push({ type: 'insert', html, parentId: host.id, beforeId: null })
    const leaf = covered.find(isLeafEditable)
    if (
      leaf &&
      sketch.label &&
      !/^\s*(remove|delete|drop)\b/i.test(sketch.label)
    ) {
      const text = rewriteText(leaf.text, sketch.label)
      if (text && text !== leaf.text.trim())
        ops.push({ type: 'setText', id: leaf.id, text })
    }
  }
  const chunks = splitCount(ops, 3)
  return {
    note: `Turned ${notes.length} sketch mark${notes.length === 1 ? '' : 's'} into ops on the nodes underneath.`,
    targetIds,
    stages: chunks.map((part, index) => ({
      stageNumber: index + 1,
      totalStages: chunks.length,
      note: `Stage ${index + 1} of ${chunks.length}: land the next sketch mark in the file.`,
      ops: part,
      completed: false,
    })),
  }
}

function tryStructuredInsert(
  nodes: MarbleNodeRecord[],
  mint: () => string,
  instruction: string,
): {
  note: string
  stages: NonNullable<AIMessage['stages']>
  targetIds: string[]
} | null {
  const match = instruction.match(
    /\badd(?:\s+\d+)?\s+(?:a|an|another)?\s*(theorem|citation|section|slide|note|paper|row|run)s?\b(?:\s+(?:called|named|titled))?\s*[“"]?([^”".]+)?/i,
  )
  if (!match && !/^\s*add\b/i.test(instruction)) return null
  const kind = (match?.[1] || kindFrom(instruction) || '').toLowerCase()
  if (!kind) return null
  const title = cleanTitle(
    match?.[2] || quoted(instruction) || defaultTitle(kind),
  )
  const group = groupFor(kind)
  const container =
    nodes.find((node) =>
      opening(node).includes(`data-marble-sortable="${group}"`),
    ) ??
    nodes.find(
      (node) => node.id.includes(group) || node.id.includes(kind.slice(0, 3)),
    )
  if (!container) return null
  const count = requestedCount(instruction)
  const ops: MarbleOp[] = []
  const ids: string[] = []
  for (let index = 0; index < count; index += 1) {
    const label = count > 1 ? `${title} ${index + 1}` : title
    const html = blockFor(kind, label, instruction, mint)
    const id = firstId(html)
    if (id) ids.push(id)
    ops.push({ type: 'insert', html, parentId: container.id, beforeId: null })
  }
  const chunks = splitCount(ops, 3)
  return {
    note: `Added ${count} ${kind}${count === 1 ? '' : 's'} to ${container.id}.`,
    targetIds: [container.id, ...ids],
    stages: chunks.map((part, index) => ({
      stageNumber: index + 1,
      totalStages: Math.max(3, chunks.length),
      note:
        index === chunks.length - 1
          ? `Stage ${index + 1} of ${chunks.length}: the new ${kind} is in the list.`
          : `Stage ${index + 1} of ${chunks.length}: insert the next ${kind}.`,
      ops: part,
      completed: false,
    })),
  }
}

function blockFor(
  kind: string,
  title: string,
  instruction: string,
  mint: () => string,
): string {
  const safe = escapeText(title)
  const body = escapeText(closingClause(instruction))
  if (kind === 'citation') {
    return stamp(
      `<li data-marble-id="__" data-marble-removable><span data-marble-id="__" data-marble-editable>${safe}</span><span data-marble-id="__" data-marble-editable>${body}</span></li>`,
      mint,
    )
  }
  if (kind === 'slide') {
    return stamp(
      `<li data-marble-id="__" data-marble-removable><p data-marble-id="__" data-marble-editable>${safe}</p></li>`,
      mint,
    )
  }
  if (kind === 'note') {
    return stamp(
      `<li data-marble-id="__" data-marble-removable><p data-marble-id="__" data-marble-editable>${safe}</p></li>`,
      mint,
    )
  }
  if (kind === 'paper' || kind === 'row' || kind === 'run') {
    return stamp(
      `<tr data-marble-id="__" data-marble-removable data-status="reading"><td data-marble-id="__" data-marble-editable>${safe}</td><td data-marble-id="__" data-marble-editable>Preprint</td><td data-marble-id="__" data-marble-editable>${body}</td><td data-marble-id="__" data-marble-editable>Worth a second pass.</td></tr>`,
      mint,
    )
  }
  return stamp(
    `<section data-marble-id="__" data-marble-removable data-marble-selectable><h2 data-marble-id="__" data-marble-editable>${safe}</h2><p data-marble-id="__" data-marble-editable>${body}</p></section>`,
    mint,
  )
}

function groupFor(kind: string): string {
  if (kind === 'citation') return 'citations'
  if (kind === 'slide') return 'slides'
  if (kind === 'note') return 'notes'
  if (kind === 'paper') return 'papers'
  if (kind === 'row' || kind === 'run') return 'rows'
  return 'sections'
}

function kindFrom(instruction: string): string | null {
  const match = instruction.match(
    /\b(theorem|citation|section|slide|note|paper|row|run)\b/i,
  )
  return match ? match[1].toLowerCase() : null
}

function defaultTitle(kind: string): string {
  if (kind === 'theorem') return 'New theorem'
  if (kind === 'citation') return 'New citation'
  if (kind === 'slide') return 'New slide'
  if (kind === 'note') return 'New note'
  if (kind === 'paper') return 'New paper'
  return 'New section'
}

function buildNewApp(
  instruction: string,
  request: CollaborationRequest,
  mint: () => string,
): { title: string; sections: string[]; document: MarbleDocumentFile } {
  const title = inferTitle(instruction)
  const sections = inferSections(instruction)
  const author = 'You'
  const now = new Date().toISOString()
  const slug = slugify(title)
  const source = newAppSource(title, instruction, sections, mint)
  const document: MarbleDocumentFile = {
    id: `doc-${mint()}`,
    slug,
    fileName: `${slug}.mrbl`,
    title,
    description: instruction.replace(/\s+/g, ' ').slice(0, 220),
    category: 'custom',
    isTemplate: false,
    source,
    nodeCount: countMarbleNodes(source),
    byteSize: byteSizeOf(source),
    version: 1,
    syncState: 'saved',
    createdAt: now,
    updatedAt: now,
    createdBy: {
      name: author,
      initials: 'YO',
      isAi: true,
      modelBadge: request.modelId,
    },
    lastEditedBy: {
      name: author,
      initials: 'YO',
      isAi: true,
      modelBadge: request.modelId,
    },
    starred: false,
    pinned: false,
    tags: ['generated', request.providerId],
    folder: 'Drafts',
    share: emptyShare(slug),
    checkpoints: [],
    intentHistory: [],
  }
  return { title, sections, document }
}

function narrateApp(
  title: string,
  sections: string[],
): NonNullable<AIMessage['stages']> {
  return [
    {
      stageNumber: 1,
      totalStages: 4,
      note: `Stage 1 of 4: name the app “${title}”.`,
      ops: [],
      completed: false,
    },
    {
      stageNumber: 2,
      totalStages: 4,
      note: `Stage 2 of 4: lay out ${sections.length} sections.`,
      ops: [],
      completed: false,
    },
    {
      stageNumber: 3,
      totalStages: 4,
      note: 'Stage 3 of 4: fill each section from the instruction.',
      ops: [],
      completed: false,
    },
    {
      stageNumber: 4,
      totalStages: 4,
      note: 'Stage 4 of 4: leave the sections editable, sortable, and removable.',
      ops: [],
      completed: false,
    },
  ]
}

function newAppSource(
  title: string,
  instruction: string,
  sections: string[],
  mint: () => string,
): string {
  const titleId = mint()
  const ledeId = mint()
  const listId = mint()
  const blocks = sections
    .map((section) => {
      const safe = escapeText(section)
      return stamp(
        `<section data-marble-id="__" data-marble-removable data-marble-selectable><h2 data-marble-id="__" data-marble-editable>${safe}</h2><p data-marble-id="__" data-marble-editable>${escapeText(closingClause(instruction))}</p></section>`,
        mint,
      )
    })
    .join('\n')
  const addId = mint()
  const tplId = mint()
  return `<!doctype html>
<html lang="en" data-marble="1">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeText(title)}</title>
<style>
:root { --ink:#1c1915; --muted:#6d655c; --line:#e4dcd2; --paper:#f4f0e8; --panel:#fffdf9; --accent:#1f4b99; --serif:Palatino,Georgia,serif; --sans:"Avenir Next",system-ui,sans-serif; }
@media (prefers-color-scheme: dark) { :root { --ink:#efeae3; --muted:#b7aea2; --line:#34302b; --paper:#131210; --panel:#1c1a17; --accent:#9db6ff; } }
html[data-xdrive-theme="light"] { color-scheme: light; }
html[data-xdrive-theme="dark"] { --ink:#efeae3; --muted:#b7aea2; --line:#34302b; --paper:#131210; --panel:#1c1a17; --accent:#9db6ff; color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.55 var(--sans); }
main { max-width: 44rem; margin: 0 auto; padding: 3rem 1.4rem 4rem; }
h1 { font-family: var(--serif); font-size: 2.4rem; line-height: 1.05; letter-spacing: -.03em; margin: 0 0 .4rem; }
.lede { color: var(--muted); margin: 0 0 1.6rem; }
.sections { display: flex; flex-direction: column; gap: .7rem; }
section { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 1rem 1.1rem; }
h2 { font-family: var(--serif); font-size: 1.25rem; margin: 0 0 .35rem; }
p { margin: 0; }
button.add { margin-top: 1rem; border: 1px dashed var(--line); background: transparent; color: var(--accent); border-radius: 999px; padding: .4rem .8rem; cursor: pointer; }
</style>
</head>
<body>
<main>
  <p data-marble-id="${mint()}" class="kicker">Generated app</p>
  <h1 data-marble-id="${titleId}" data-marble-editable>${escapeText(title)}</h1>
  <p data-marble-id="${ledeId}" class="lede" data-marble-editable>${escapeText(instruction.replace(/\s+/g, ' ').slice(0, 280))}</p>
  <div data-marble-id="${listId}" id="${listId}" class="sections" data-marble-sortable="sections">
${blocks}
  </div>
  <button data-marble-id="${addId}" class="add" type="button" data-marble-add="#${tplId}" data-marble-into="#${listId}">+ Add section</button>
  <template data-marble-id="${tplId}" id="${tplId}">${stamp('<section data-marble-removable data-marble-selectable><h2 data-marble-editable>New section</h2><p data-marble-editable>Say what this section is for.</p></section>', mint)}</template>
</main>
<script>
(function () {
  function boot(start) {
    if (window.marble) start(window.marble);
    else document.addEventListener('marble:ready', function () { start(window.marble); }, { once: true });
  }
  boot(function (marble) {
    marble.register(function () {});
  });
})();
</script>
</body>
</html>
`
}

function resolveTargets(
  nodes: MarbleNodeRecord[],
  selected: SelectedMarbleElement[],
  instruction: string,
): MarbleNodeRecord[] {
  if (selected.length) {
    const ids = new Set(selected.map((item) => item.id))
    const picked = nodes.filter((node) => ids.has(node.id))
    return expandLeaves(nodes, picked)
  }
  const words = instruction
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 4 && !STOP.has(word))
  const hits = nodes.filter((node) =>
    words.some((word) => node.text.toLowerCase().includes(word)),
  )
  if (hits.length) return expandLeaves(nodes, hits)
  const heading = nodes.find(
    (node) => node.tagName === 'h1' && isLeafEditable(node),
  )
  return heading ? [heading] : []
}

function expandLeaves(
  nodes: MarbleNodeRecord[],
  seeds: MarbleNodeRecord[],
): MarbleNodeRecord[] {
  const out: MarbleNodeRecord[] = []
  const push = (node: MarbleNodeRecord | undefined) => {
    if (!node || out.some((item) => item.id === node.id)) return
    out.push(node)
  }
  for (const seed of seeds) {
    if (isLeafEditable(seed)) push(seed)
    const inside = nodes.filter(
      (node) =>
        node.id !== seed.id &&
        seed.sourceSlice.includes(`data-marble-id="${node.id}"`) &&
        isLeafEditable(node),
    )
    inside.slice(0, 4).forEach(push)
    if (/^h[1-3]$/.test(seed.tagName)) {
      push(
        nodes.find(
          (node) =>
            node.parentId === seed.parentId &&
            node.tagName === 'p' &&
            isLeafEditable(node),
        ),
      )
    }
  }
  return out
}

function pickSeed(
  nodes: MarbleNodeRecord[],
  selected: SelectedMarbleElement[],
): MarbleNodeRecord | undefined {
  for (const item of selected) {
    const node = nodes.find((candidate) => candidate.id === item.id)
    if (node) return node
  }
  return (
    nodes.find(
      (node) => node.affordances.includes('removable') && node.parentId,
    ) ?? nodes.find((node) => node.tagName === 'h1')
  )
}

function isLeafEditable(node: MarbleNodeRecord): boolean {
  if (!node.affordances.includes('editable')) return false
  const ids = node.sourceSlice.match(/data-marble-id\s*=\s*"/g)
  return (ids?.length ?? 0) <= 1
}

function rewriteText(text: string, instruction: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return clean
  const quotedText = quoted(instruction)
  if (
    quotedText &&
    /\b(rename|retitle|call it|title|change|set|replace|to)\b/i.test(
      instruction,
    )
  ) {
    return quotedText
  }
  if (/\b(shorter|tighten|concise|brief|compress)\b/i.test(instruction)) {
    const sentence = clean.split(/(?<=[.!?])\s+/)[0] ?? clean
    return sentence.length < clean.length ? sentence : clip(clean, 90)
  }
  if (/\b(expand|elaborate|more detail|flesh)\b/i.test(instruction)) {
    return `${clean.replace(/[.]+$/, '')}. ${closingClause(instruction)}`
  }
  if (/\b(formal|academic|theorem|proof)\b/i.test(instruction)) {
    return formalize(clean)
  }
  let next = clean
    .replace(/\bvery\s+/gi, '')
    .replace(/\bjust\s+/gi, '')
    .replace(/\breally\s+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (next) next = next[0].toUpperCase() + next.slice(1)
  if (next && !/[.!?]$/.test(next) && next.split(' ').length > 8) next += '.'
  return next
}

function formalize(text: string): string {
  return text
    .replace(/\bdon't\b/gi, 'do not')
    .replace(/\bcan't\b/gi, 'cannot')
    .replace(/\bwe're\b/gi, 'we are')
    .replace(/\bit's\b/gi, 'it is')
    .replace(/\bshow(?:s|ed)?\b/gi, 'establishes')
}

function closingClause(instruction: string): string {
  const quotedText = quoted(instruction)
  if (quotedText) return quotedText
  const about = instruction.match(/\b(?:about|on|for)\s+([^.]{8,120})/i)
  if (about)
    return `The point to keep is ${about[1].trim().replace(/[.]+$/, '')}.`
  const stripped = instruction
    .replace(
      /^(please\s+)?(dtrt|do the right thing|fix this|improve this)[:\s-]*/i,
      '',
    )
    .trim()
  if (stripped.length > 12 && stripped.length < 180) {
    return (
      stripped[0].toUpperCase() + stripped.slice(1).replace(/[.]+$/, '') + '.'
    )
  }
  return 'State the claim, the assumption it needs, and what would falsify it.'
}

function reframings(text: string, instruction: string): [string, string] {
  const clean = text.replace(/\s+/g, ' ').trim()
  const quotedText = quoted(instruction)
  const base = clean.replace(/[.]+$/, '')
  const second =
    quotedText ||
    `On ${base.replace(/^(the|a|an)\s+/i, (word) => word.toLowerCase())}`
  const third = base.startsWith('Toward ')
    ? `${base}, and what it costs`
    : `Toward ${base.replace(/^(the|a|an)\s+/i, '').replace(/^[A-Z]/, (letter) => letter.toLowerCase())}`
  return [second, third]
}

function sketchHint(sketches: SketchAnnotation[], id: string): string {
  return sketches
    .filter((sketch) => sketch.coveredNodeIds.includes(id))
    .map((sketch) => sketch.label)
    .filter(Boolean)
    .join('; ')
}

function requestedCount(instruction: string): number {
  const match = instruction.match(/\b(\d{1,2})\b/)
  const value = match ? Number(match[1]) : 1
  if (!Number.isFinite(value) || value > 8 || value < 1) return 1
  return value
}

function buttonLabel(instruction: string): string {
  const kind = kindFrom(instruction)
  if (kind) return `+ Add ${kind}`
  return '+ Add'
}

function inferTitle(instruction: string): string {
  const named = instruction.match(
    /\b(?:called|named|titled)\s+[“"]?([^”".,]{3,80})/i,
  )
  if (named) return named[1].trim()
  const quotedText = quoted(instruction)
  if (quotedText && quotedText.length < 80) return quotedText
  const about = instruction.match(
    /\b(?:app|tool|studio|notebook|deck)\s+(?:for|about|on)\s+([^.,]{3,80})/i,
  )
  if (about) return titleCase(about[1].trim())
  return 'Untitled Research App'
}

function inferSections(instruction: string): string[] {
  const withClause = instruction.match(/\bwith\s+(.+)$/i)
  if (withClause) {
    const parts = withClause[1]
      .split(/,|\band\b/i)
      .map((part) => part.replace(/[.]+$/, '').trim())
      .filter((part) => part.length > 2 && part.length < 48)
    if (parts.length >= 2) return parts.slice(0, 6).map(titleCase)
  }
  return ['Overview', 'Method', 'Evidence', 'Open questions']
}

function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ')
}

function quoted(instruction: string): string | null {
  const match = instruction.match(/[“"]([^”"]{2,180})[”"]/)
  return match ? match[1].trim() : null
}

function cleanTitle(text: string): string {
  return (
    text
      .replace(/^[\s:–—-]+/, '')
      .replace(/[.]+$/, '')
      .trim() || 'Untitled'
  )
}

function opening(node: MarbleNodeRecord): string {
  return node.sourceSlice.match(/^<[^>]+>/)?.[0] ?? ''
}

function nextVersion(slice: string): string {
  const nums = [...slice.matchAll(/data-marble-alt="v(\d+)"/g)].map((match) =>
    Number(match[1]),
  )
  return `v${Math.max(0, ...nums) + 1}`
}

function withAttr(slice: string, name: string, value: string): string {
  const openEnd = slice.indexOf('>')
  if (openEnd < 0) return slice
  const open = slice.slice(0, openEnd)
  if (new RegExp(`${name}\\s*=`).test(open)) {
    return `${open.replace(new RegExp(`${name}\\s*=\\s*"[^"]*"`), `${name}="${value}"`)}${slice.slice(openEnd)}`
  }
  return `${open} ${name}="${value}"${slice.slice(openEnd)}`
}

function replaceFirstText(html: string, text: string): string {
  const safe = escapeText(text)
  if (/>[^<]*\S[^<]*</.test(html))
    return html.replace(/>([^<]*\S[^<]*)</, `>${safe}<`)
  return html
}

function suffixCopy(html: string, index: number): string {
  return html.replace(
    />([^<]*\S[^<]*)</,
    (_match, text: string) => `>${text.trim()} ${index}<`,
  )
}

function renewIds(html: string, mint: () => string): string {
  return html.replace(
    /data-marble-id\s*=\s*"[^"]*"/g,
    () => `data-marble-id="${mint()}"`,
  )
}

function stamp(html: string, mint: () => string): string {
  return html.replaceAll(
    'data-marble-id="__"',
    () => `data-marble-id="${mint()}"`,
  )
}

function firstId(html: string): string | null {
  return html.match(/data-marble-id="([^"]+)"/)?.[1] ?? null
}

function idFactory(source: string): () => string {
  const used = new Set<string>()
  const re = /data-marble-id\s*=\s*"([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) used.add(match[1])
  return () => {
    let id = ''
    do id = Math.random().toString(36).slice(2, 10)
    while (used.has(id) || !id)
    used.add(id)
    return id
  }
}

function splitCount<T>(items: T[], parts: number): T[][] {
  if (!items.length) return [[]]
  const size = Math.max(1, Math.ceil(items.length / parts))
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size)
    chunks.push(items.slice(index, index + size))
  return chunks
}

function commitStages(
  source: string,
  stages: NonNullable<AIMessage['stages']>,
): NonNullable<AIMessage['stages']> {
  let current = source
  return stages.map((stage) => {
    const ops: MarbleOp[] = []
    for (const op of stage.ops) {
      if (!OP_TYPES.has(op.type)) continue
      try {
        current = applyMarbleOpsClient(current, [op]).source
        ops.push(op)
      } catch {
        // Skip an op the current source cannot take. Later stages still run.
      }
    }
    return { ...stage, ops }
  })
}

function makeProposal(
  request: CollaborationRequest,
  note: string,
  stages: NonNullable<AIMessage['stages']>,
  targetIds: string[],
): MarbleOpProposal {
  const ops = stages.flatMap((stage) => stage.ops)
  return {
    id: `prop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    note,
    stage: stages.length ? `1-${stages.length}` : undefined,
    ops,
    targetIds: targetIds.filter(Boolean),
    modelId: request.modelId,
    providerId: request.providerId,
    createdAt: Date.now(),
    status: 'proposed',
    sketchAnnotations: request.sketchAnnotations,
    instruction: request.instruction,
  }
}

function idsTouched(ops: MarbleOp[]): string[] {
  const ids: string[] = []
  for (const op of ops) {
    if (op.id) ids.push(op.id)
    if (op.type === 'insert' && op.html) {
      const re = /data-marble-id="([^"]+)"/g
      let match: RegExpExecArray | null
      while ((match = re.exec(op.html))) ids.push(match[1])
    }
  }
  return ids
}

function unique(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))]
}

function clip(text: string, max = 64): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'untitled'
  )
}

function emptyShare(slug: string): ShareConfig {
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

const STOP = new Set([
  'about',
  'there',
  'their',
  'would',
  'could',
  'should',
  'please',
  'right',
  'thing',
  'this',
  'that',
  'with',
  'from',
  'into',
  'make',
  'more',
])

async function askMarbleApi(
  request: CollaborationRequest,
): Promise<CollaborationResult | null> {
  if (typeof fetch !== 'function') return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 800)
  try {
    const response = await fetch('/api/marble', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
    if (!response.ok) return null
    const data: unknown = await response.json()
    return normalizeApi(data, request)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function normalizeApi(
  data: unknown,
  request: CollaborationRequest,
): CollaborationResult | null {
  if (!data || typeof data !== 'object') return null
  const record = data as {
    proposal?: MarbleOpProposal
    stages?: NonNullable<AIMessage['stages']>
    newDocument?: MarbleDocumentFile
    ops?: MarbleOp[]
    note?: string
  }
  if (
    record.proposal &&
    Array.isArray(record.proposal.ops) &&
    validOps(record.proposal.ops)
  ) {
    const stages = record.stages ?? [
      {
        stageNumber: 1,
        totalStages: 1,
        note: record.proposal.note,
        ops: record.proposal.ops,
        completed: false,
      },
    ]
    return {
      proposal: record.proposal,
      stages,
      newDocument: record.newDocument,
      source: 'api',
    }
  }
  if (Array.isArray(record.ops) && validOps(record.ops)) {
    const stages = record.stages?.length
      ? record.stages
      : [
          {
            stageNumber: 1,
            totalStages: 1,
            note: record.note || request.instruction,
            ops: record.ops,
            completed: false,
          },
        ]
    return {
      proposal: makeProposal(
        request,
        record.note || request.instruction,
        stages,
        idsTouched(record.ops),
      ),
      stages,
      newDocument: record.newDocument,
      source: 'api',
    }
  }
  if (record.newDocument?.source) {
    const stages = narrateApp(record.newDocument.title || 'New app', [])
    return {
      proposal: makeProposal(
        request,
        record.note || `Built ${record.newDocument.title}.`,
        stages,
        [],
      ),
      stages,
      newDocument: record.newDocument,
      source: 'api',
    }
  }
  return null
}

function validOps(ops: MarbleOp[]): boolean {
  return ops.every((op) => typeof op.type === 'string' && OP_TYPES.has(op.type))
}
