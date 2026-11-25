// Turns a prompt, a selection, or a sketch into Marble ops against the open
// .mrbl file. Every request loads and enforces the two evergreen drive
// documents (`document-design-system.mrbl` and `document-donts-system.mrbl`) so
// generated apps and edits follow xDrive's design language and reject AI slop.

import type { ReasoningEffort } from '../ai/drive-chat-types'
import type {
  AIMessage,
  AIProviderId,
  EvergreenDocRef,
  MarbleDocumentFile,
  MarbleOp,
  MarbleOpProposal,
  SelectedMarbleElement,
  ShareConfig,
  SketchAnnotation,
} from '../types'
import type { MarbleNodeRecord } from './engine-client'
import {
  applyMarbleOpsClient,
  byteSizeOf,
  countMarbleNodes,
  escapeText,
  inspectMarbleNodes,
} from './engine-client'
import {
  DOCUMENT_DESIGN_SYSTEM_SLUG,
  DOCUMENT_DONTS_SYSTEM_SLUG,
  EVERGREEN_WORKSPACE_DOCS,
  MARBLE_BASE_CSS,
} from './templates'

export type MarbleActionKind =
  'dtrt' | 'factory' | 'scale' | 'fork_alt' | 'sketch_build' | 'new_app'

export interface EvergreenDesignContext {
  designSystem: {
    ref: EvergreenDocRef
    contracts: string[]
    baseCss: string
  }
  dontsSystem: {
    ref: EvergreenDocRef
    guardrails: string[]
    bannedHexes: string[]
  }
  refs: EvergreenDocRef[]
}

export const DEFAULT_COLLABORATE_CLIENT_TIMEOUT_MS = 630_000

export type CollaborationProgressPhase =
  'connecting' | 'thinking' | 'generating' | 'parsing'

export interface CollaborationProgress {
  phase: CollaborationProgressPhase
  label: string
  thoughtSnippet?: string
  elapsedMs?: number
}

export interface CollaborationRequest {
  source: string
  instruction: string
  selectedElements?: SelectedMarbleElement[]
  sketchAnnotations?: SketchAnnotation[]
  sketchDataUrl?: string
  modelId: string
  providerId: AIProviderId
  reasoningEffort?: ReasoningEffort
  sessionId?: string
  action?: MarbleActionKind
  evergreenDocs?: MarbleDocumentFile[]
  /** Allow deterministic local synthesizer fallback only when /api/ai is absent (e.g. static Storybook). */
  allowOfflineFallback?: boolean
  signal?: AbortSignal
  timeoutMs?: number
  onProgress?: (progress: CollaborationProgress) => void
}

export interface CollaborationResult {
  proposal: MarbleOpProposal
  stages: NonNullable<AIMessage['stages']>
  newDocument?: MarbleDocumentFile
  evergreenContext: EvergreenDesignContext
  source:
    | 'antigravity-acp'
    | 'opencode-acp'
    | 'opencode-go'
    | 'grok-build-acp'
    | 'api'
    | 'synthesizer'
  thoughts?: string[]
  runtime?: {
    protocol: string
    agentName: string
    agentVersion: string
    modelId: string
    stopReason: string
  }
}

export class MarbleCollaborationError extends Error {
  readonly code:
    | 'AUTH_REQUIRED'
    | 'ENTITLEMENT_REQUIRED'
    | 'RATE_LIMITED'
    | 'BINARY_MISSING'
    | 'PROVIDER_UNAVAILABLE'
    | 'TIMEOUT'
    | 'AI_ERROR'

  constructor(code: MarbleCollaborationError['code'], message: string) {
    super(message)
    this.name = 'MarbleCollaborationError'
    this.code = code
  }
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

const DEFAULT_BANNED_HEXES = [
  '#f4f1ea',
  '#f3efe7',
  '#f4f0e8',
  '#f7f3ec',
  '#fffdf9',
  '#e4dcd2',
  '#d97757',
  '#1f4b99',
  '#221e1a',
  '#131210',
  '#1c1a17',
]

export function resolveEvergreenDesignContext(
  evergreenDocs?: MarbleDocumentFile[],
): EvergreenDesignContext {
  const pool = [...(evergreenDocs ?? []), ...EVERGREEN_WORKSPACE_DOCS]
  const designDoc =
    pool.find((doc) => doc.slug === DOCUMENT_DESIGN_SYSTEM_SLUG) ??
    EVERGREEN_WORKSPACE_DOCS[0]
  const dontsDoc =
    pool.find((doc) => doc.slug === DOCUMENT_DONTS_SYSTEM_SLUG) ??
    EVERGREEN_WORKSPACE_DOCS[1]

  const designNodes = inspectMarbleNodes(designDoc.source)
  const dontsNodes = inspectMarbleNodes(dontsDoc.source)

  const contracts = designNodes
    .filter(
      (node) =>
        node.id.startsWith('ds-rule-') ||
        node.id.startsWith('tok-row-') ||
        (node.tagName === 'li' && node.parentId === 'ds-rule-list'),
    )
    .map((node) => node.text.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const guardrails = dontsNodes
    .filter(
      (node) =>
        (node.id.startsWith('dont-') && node.tagName === 'li') ||
        node.parentId === 'donts-list',
    )
    .map((node) => node.text.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const discoveredHexes = [
    ...dontsDoc.source.matchAll(/#[0-9a-fA-F]{6}\b/g),
  ].map((match) => match[0].toLowerCase())
  const keepHexes = new Set([
    '#0b0c0e',
    '#101216',
    '#161920',
    '#1c2029',
    '#232834',
    '#f3f5f8',
    '#a2abb8',
    '#6e7785',
    '#22252e',
    '#313644',
    '#ffffff',
    '#f7f8fa',
    '#f1f3f7',
    '#eaeef4',
    '#e2e7f0',
    '#0f131a',
    '#4a5568',
    '#718096',
    '#e3e8ee',
    '#cbd5e1',
    '#5e6ad2',
    '#4e5ac0',
    '#6e7ae2',
    '#1f9d6b',
    '#2ea071',
    '#d9822b',
    '#e59934',
    '#e5484d',
  ])
  const bannedHexes = [
    ...new Set([
      ...DEFAULT_BANNED_HEXES,
      ...discoveredHexes.filter((hex) => !keepHexes.has(hex)),
    ]),
  ]

  const designRef: EvergreenDocRef = {
    slug: designDoc.slug,
    fileName: designDoc.fileName,
    title: designDoc.title,
    ruleCount: Math.max(contracts.length, 4),
  }
  const dontsRef: EvergreenDocRef = {
    slug: dontsDoc.slug,
    fileName: dontsDoc.fileName,
    title: dontsDoc.title,
    ruleCount: Math.max(guardrails.length, 5),
  }

  return {
    designSystem: {
      ref: designRef,
      contracts,
      baseCss: MARBLE_BASE_CSS,
    },
    dontsSystem: {
      ref: dontsRef,
      guardrails,
      bannedHexes,
    },
    refs: [designRef, dontsRef],
  }
}

export function sanitizeTextWithDonts(
  text: string,
  _context?: EvergreenDesignContext,
): string {
  let clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return clean
  // Strip trailing arrows on CTAs and labels (Don'ts rule #4)
  clean = clean.replace(/\s*(?:→|->)\s*$/g, '')
  // Strip decorative 01 / 02 / 03 prefix numbering on non-stepped headings
  clean = clean.replace(/^\d{2}\s*[/·|]\s*/g, '')
  // Convert "WORD — fragment" all-caps eyebrow-dash pattern into sentence case
  clean = clean.replace(
    /^([A-Z]{3,})\s*[—–-]\s+(.+)$/,
    (_m, head: string, tail: string) =>
      `${head[0]}${head.slice(1).toLowerCase()}: ${tail}`,
  )
  return clean.trim()
}

export function sanitizeHtmlWithEvergreenRules(
  html: string,
  _context?: EvergreenDesignContext,
): string {
  return html
    .replace(/#(?:f4f1ea|f3efe7|f4f0e8|f7f3ec)\b/gi, 'var(--paper)')
    .replace(/#(?:fffdf9|1c1a17|131210|221e1a)\b/gi, 'var(--panel)')
    .replace(/#(?:e4dcd2|34302b)\b/gi, 'var(--line)')
    .replace(/#(?:d97757|1f4b99|9db6ff)\b/gi, 'var(--accent)')
    .replace(/#9d2c2c\b/gi, 'var(--danger)')
    .replace(/border-radius\s*:\s*1[4-9]px/gi, 'border-radius: var(--radius)')
    .replace(/box-shadow\s*:\s*0\s+18px\s+40px[^;}"]*/gi, 'box-shadow: none')
    .replace(/text-transform\s*:\s*uppercase\s*;?/gi, '')
    .replace(/letter-spacing\s*:\s*0?\.1[2-9]em\s*;?/gi, '')
}

function sanitizeOpsWithEvergreen(
  ops: MarbleOp[],
  context: EvergreenDesignContext,
): MarbleOp[] {
  return ops.map((op) => {
    const next: MarbleOp = { ...op }
    if (typeof next.text === 'string') {
      next.text = sanitizeTextWithDonts(next.text, context)
    }
    if (typeof next.html === 'string') {
      next.html = sanitizeHtmlWithEvergreenRules(next.html, context)
    }
    return next
  })
}

export async function generateMarbleCollaboration(
  request: CollaborationRequest,
): Promise<CollaborationResult> {
  const evergreenContext = resolveEvergreenDesignContext(request.evergreenDocs)
  const fromApi = await askMarbleApi(request, evergreenContext)
  if (fromApi) return fromApi
  if (request.allowOfflineFallback) {
    return synthesizeMarbleOps(request, evergreenContext)
  }
  throw new MarbleCollaborationError(
    'AI_ERROR',
    'AI backend (/api/ai) is unreachable. Start the xDrive server and connect Google Antigravity, OpenCode Go, or Grok Build in Models & Providers.',
  )
}

export function synthesizeMarbleOps(
  request: CollaborationRequest,
  providedContext?: EvergreenDesignContext,
): CollaborationResult {
  const evergreenContext =
    providedContext ?? resolveEvergreenDesignContext(request.evergreenDocs)
  const instruction = request.instruction.trim() || 'Do the right thing.'
  const selected = request.selectedElements ?? []
  const sketches = request.sketchAnnotations ?? []
  const action = detectMarbleAction(instruction, sketches, request.action)
  const nodes = request.source ? inspectMarbleNodes(request.source) : []
  const mint = idFactory(request.source || '')

  if (action === 'new_app') {
    const built = buildNewApp(instruction, request, mint, evergreenContext)
    const stages = narrateApp(built.title, built.sections, evergreenContext)
    return {
      proposal: makeProposal(
        request,
        `Built “${built.title}” following ${DOCUMENT_DESIGN_SYSTEM_SLUG}.mrbl and ${DOCUMENT_DONTS_SYSTEM_SLUG}.mrbl.`,
        stages,
        [],
        evergreenContext,
      ),
      stages,
      newDocument: built.document,
      evergreenContext,
      source: 'synthesizer',
    }
  }

  const structured =
    action === 'dtrt' || action === 'factory'
      ? tryStructuredInsert(nodes, mint, instruction, evergreenContext)
      : null
  const drafted =
    structured ??
    draftForAction(
      action,
      nodes,
      mint,
      instruction,
      selected,
      sketches,
      evergreenContext,
    )
  const sanitizedStages = drafted.stages.map((stage) => ({
    ...stage,
    ops: sanitizeOpsWithEvergreen(stage.ops, evergreenContext),
  }))
  const stages = commitStages(request.source, sanitizedStages)
  const targetIds = drafted.targetIds.length
    ? drafted.targetIds
    : stages.flatMap((stage) => idsTouched(stage.ops))
  return {
    proposal: makeProposal(
      request,
      drafted.note,
      stages,
      unique(targetIds),
      evergreenContext,
    ),
    stages,
    evergreenContext,
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
  evergreenContext: EvergreenDesignContext,
): {
  note: string
  stages: NonNullable<AIMessage['stages']>
  targetIds: string[]
} {
  if (action === 'fork_alt')
    return draftFork(nodes, mint, instruction, selected, evergreenContext)
  if (action === 'scale')
    return draftScale(nodes, mint, instruction, selected, evergreenContext)
  if (action === 'factory')
    return draftFactory(nodes, mint, instruction, selected, evergreenContext)
  if (action === 'sketch_build')
    return draftSketch(nodes, mint, sketches, instruction, evergreenContext)
  return draftDtrt(nodes, instruction, selected, sketches, evergreenContext)
}

function draftDtrt(
  nodes: MarbleNodeRecord[],
  instruction: string,
  selected: SelectedMarbleElement[],
  sketches: SketchAnnotation[],
  evergreenContext: EvergreenDesignContext,
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
      const text = sanitizeTextWithDonts(
        rewriteText(node.text, hint ? `${instruction} ${hint}` : instruction),
        evergreenContext,
      )
      return text && text !== node.text.replace(/\s+/g, ' ').trim()
        ? { node, text }
        : null
    })
    .filter((item): item is { node: MarbleNodeRecord; text: string } =>
      Boolean(item),
    )

  if (!rewrites.length && leaves[0]) {
    const text = sanitizeTextWithDonts(
      `${leaves[0].text.replace(/\s+/g, ' ').trim()} ${closingClause(instruction)}`.trim(),
      evergreenContext,
    )
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
      note: 'Stage 3 of 3: verify against document-design-system and document-donts-system.',
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
  evergreenContext: EvergreenDesignContext,
): {
  note: string
  stages: NonNullable<AIMessage['stages']>
  targetIds: string[]
} {
  const seed = pickSeed(nodes, selected)
  if (!seed || !seed.parentId) {
    return draftDtrt(nodes, instruction, selected, [], evergreenContext)
  }
  const count = requestedCount(instruction)
  const ops: MarbleOp[] = []
  const ids: string[] = []
  for (let index = 0; index < count; index += 1) {
    const html = sanitizeHtmlWithEvergreenRules(
      suffixCopy(renewIds(seed.sourceSlice, mint), index + 2),
      evergreenContext,
    )
    const id = firstId(html)
    if (id) ids.push(id)
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
  evergreenContext: EvergreenDesignContext,
): {
  note: string
  stages: NonNullable<AIMessage['stages']>
  targetIds: string[]
} {
  const seed = pickSeed(nodes, selected)
  const parent = seed?.parentId
    ? nodes.find((node) => node.id === seed.parentId)
    : nodes.find((node) => node.affordances.includes('sortable'))
  if (!parent)
    return draftDtrt(nodes, instruction, selected, [], evergreenContext)
  const templateId = mint()
  const buttonId = mint()
  const list = parent.affordances.includes('sortable')
    ? parent
    : (nodes.find((node) => node.affordances.includes('sortable')) ?? parent)
  const hostId = list.parentId ?? list.id
  const beforeId = list.parentId ? list.nextId : null
  const cleanTemplate = `<template data-marble-id="${templateId}" id="${templateId}">${stamp(
    '<section class="block" data-marble-id="__" data-marble-removable data-marble-selectable><h3 data-marble-id="__" data-marble-editable>New item</h3><p data-marble-id="__" data-marble-editable>Name the claim or record this button adds.</p></section>',
    mint,
  )}</template>`
  const buttonHtml = `<button data-marble-id="${buttonId}" class="add" type="button" data-marble-add="#${templateId}" data-marble-into="#${list.id}">+ Add</button>`
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
        note: 'Stage 3 of 3: label the button in plain active voice.',
        ops: [
          {
            type: 'setText',
            id: buttonId,
            text: sanitizeTextWithDonts(
              buttonLabel(instruction),
              evergreenContext,
            ),
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
  evergreenContext: EvergreenDesignContext,
): {
  note: string
  stages: NonNullable<AIMessage['stages']>
  targetIds: string[]
} {
  const seed =
    pickSeed(nodes, selected) ?? nodes.find((node) => node.tagName === 'h1')
  if (!seed)
    return draftDtrt(nodes, instruction, selected, [], evergreenContext)
  const parent = seed.parentId
    ? nodes.find((node) => node.id === seed.parentId)
    : undefined
  const [second, third] = reframings(seed.text, instruction).map((item) =>
    sanitizeTextWithDonts(item, evergreenContext),
  ) as [string, string]

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

  if (!seed.parentId)
    return draftDtrt(nodes, instruction, selected, [], evergreenContext)
  const altId = mint()
  const variant = replaceFirstText(
    withAttr(renewIds(seed.sourceSlice, mint), 'data-marble-alt', 'v2'),
    second,
  )
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
  evergreenContext: EvergreenDesignContext,
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
          color: '#5e6ad2',
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
    const cleanNote = sanitizeTextWithDonts(
      sketch.label || instruction,
      evergreenContext,
    )
    const html = stamp(
      `<aside data-marble-id="__" class="margin" data-marble-note data-marble-removable><p data-marble-id="__" data-marble-note-body data-marble-editable>${escapeText(cleanNote)}</p></aside>`,
      mint,
    )
    ops.push({ type: 'insert', html, parentId: host.id, beforeId: null })
    const leaf = covered.find(isLeafEditable)
    if (
      leaf &&
      sketch.label &&
      !/^\s*(remove|delete|drop)\b/i.test(sketch.label)
    ) {
      const text = sanitizeTextWithDonts(
        rewriteText(leaf.text, sketch.label),
        evergreenContext,
      )
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
  evergreenContext: EvergreenDesignContext,
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
  const title = sanitizeTextWithDonts(
    cleanTitle(match?.[2] || quoted(instruction) || defaultTitle(kind)),
    evergreenContext,
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
    const html = blockFor(kind, label, instruction, mint, evergreenContext)
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
          ? `Stage ${index + 1} of ${chunks.length}: verified new ${kind} against document-design-system and document-donts-system.`
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
  evergreenContext: EvergreenDesignContext,
): string {
  const safe = escapeText(sanitizeTextWithDonts(title, evergreenContext))
  const body = escapeText(
    sanitizeTextWithDonts(closingClause(instruction), evergreenContext),
  )
  if (kind === 'citation') {
    return stamp(
      `<li data-marble-id="__" data-marble-removable><span data-marble-id="__" class="key" data-marble-editable>${safe}</span><span data-marble-id="__" data-marble-editable>${body}</span></li>`,
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
    `<section data-marble-id="__" class="block" data-marble-removable data-marble-selectable><h2 data-marble-id="__" data-marble-editable>${safe}</h2><p data-marble-id="__" data-marble-editable>${body}</p></section>`,
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
  evergreenContext: EvergreenDesignContext,
): { title: string; sections: string[]; document: MarbleDocumentFile } {
  const title = sanitizeTextWithDonts(inferTitle(instruction), evergreenContext)
  const sections = inferSections(instruction).map((item) =>
    sanitizeTextWithDonts(item, evergreenContext),
  )
  const author = 'You'
  const now = new Date().toISOString()
  const slug = slugify(title)
  const source = newAppSource(
    title,
    instruction,
    sections,
    mint,
    evergreenContext,
  )
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
    tags: [
      'generated',
      request.providerId,
      DOCUMENT_DESIGN_SYSTEM_SLUG,
      DOCUMENT_DONTS_SYSTEM_SLUG,
    ],
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
  evergreenContext: EvergreenDesignContext,
): NonNullable<AIMessage['stages']> {
  return [
    {
      stageNumber: 1,
      totalStages: 4,
      note: `Stage 1 of 4: load tokens from ${evergreenContext.designSystem.ref.fileName} and name “${title}”.`,
      ops: [],
      completed: false,
    },
    {
      stageNumber: 2,
      totalStages: 4,
      note: `Stage 2 of 4: lay out ${sections.length} hairline-divided sections.`,
      ops: [],
      completed: false,
    },
    {
      stageNumber: 3,
      totalStages: 4,
      note: `Stage 3 of 4: apply ${evergreenContext.dontsSystem.ref.fileName} anti-slop guardrails.`,
      ops: [],
      completed: false,
    },
    {
      stageNumber: 4,
      totalStages: 4,
      note: 'Stage 4 of 4: leave every section editable, sortable, and removable.',
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
  evergreenContext: EvergreenDesignContext,
): string {
  const titleId = mint()
  const ledeId = mint()
  const listId = mint()
  const clause = escapeText(
    sanitizeTextWithDonts(closingClause(instruction), evergreenContext),
  )
  const blocks = sections
    .map((section) => {
      const safe = escapeText(section)
      return stamp(
        `<section data-marble-id="__" class="block" data-marble-removable data-marble-selectable><h2 data-marble-id="__" data-marble-editable>${safe}</h2><p data-marble-id="__" data-marble-editable>${clause}</p></section>`,
        mint,
      )
    })
    .join('\n')
  const addId = mint()
  const tplId = mint()
  const raw = `<!doctype html>
<html lang="en" data-marble="1">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="marble:capabilities" content="storage; net=none">
<meta name="marble:design-system" content="${DOCUMENT_DESIGN_SYSTEM_SLUG}.mrbl,${DOCUMENT_DONTS_SYSTEM_SLUG}.mrbl">
<title>${escapeText(title)}</title>
<style>${evergreenContext.designSystem.baseCss}
main { max-width: 52rem; margin: 0 auto; padding: 2.2rem 1.5rem 4rem; }
header.app-head { padding-bottom: 1.1rem; margin-bottom: 1.35rem; border-bottom: 1px solid var(--line); }
h1 { margin: 0 0 .4rem; }
.sections { display: flex; flex-direction: column; gap: .75rem; }
button.add { margin-top: 1rem; }
</style>
</head>
<body>
<main>
  <header class="app-head">
    <p data-marble-id="${mint()}" class="kicker">Workspace document</p>
    <h1 data-marble-id="${titleId}" data-marble-editable>${escapeText(title)}</h1>
    <p data-marble-id="${ledeId}" class="lede" data-marble-editable>${escapeText(sanitizeTextWithDonts(instruction.replace(/\s+/g, ' ').slice(0, 280), evergreenContext))}</p>
  </header>
  <div data-marble-id="${listId}" id="${listId}" class="sections" data-marble-sortable="sections">
${blocks}
  </div>
  <button data-marble-id="${addId}" class="add" type="button" data-marble-add="#${tplId}" data-marble-into="#${listId}">+ Add section</button>
  <template data-marble-id="${tplId}" id="${tplId}">${stamp('<section class="block" data-marble-removable data-marble-selectable><h2 data-marble-editable>New section</h2><p data-marble-editable>State the claim, method, or observation for this section.</p></section>', mint)}</template>
</main>
<script>
(function () {
  function boot(start) {
    if (window.marble) start(window.marble);
    else document.addEventListener('marble:ready', function () { start(window.marble); }, { once: true });
  }
  boot(function (marble) {
    var MID = 'data-marble-' + 'id';
    var AFFORDANCES = [
      'data-marble-editable',
      'data-marble-sortable',
      'data-marble-canvas',
      'data-marble-resizable',
      'data-marble-removable',
      'data-marble-add',
      'data-marble-toggle',
      'data-marble-choose',
      'data-marble-expand',
      'data-marble-step',
      'data-marble-note'
    ];
    if (marble && marble.address) {
      marble.address(document.querySelectorAll(AFFORDANCES.map(function (a) { return '[' + a + ']'; }).join(',')));
    }
    marble.register(function () {});
  });
})();
</script>
</body>
</html>
`
  return sanitizeHtmlWithEvergreenRules(raw, evergreenContext)
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
  const withoutQuotes = instruction.replace(/[“"][^”"]*[”"]/g, ' ')
  const match = withoutQuotes.match(/\b(\d{1,2})\b/)
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
  evergreenContext: EvergreenDesignContext,
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
    referencedEvergreenDocs: evergreenContext.refs,
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

interface CollaborateErrorPayload {
  code?: string
  authRequired?: boolean
  entitlementRequired?: boolean
  rateLimited?: boolean
  binaryMissing?: boolean
  error?: string
  httpStatus?: number
}

export function toMarbleCollaborationError(
  rawPayload: unknown,
  fallbackStatus?: number,
): MarbleCollaborationError {
  const payload =
    rawPayload && typeof rawPayload === 'object'
      ? (rawPayload as CollaborateErrorPayload)
      : {}
  const code: MarbleCollaborationError['code'] =
    payload.authRequired || payload.code === 'AUTH_REQUIRED'
      ? 'AUTH_REQUIRED'
      : payload.entitlementRequired || payload.code === 'ENTITLEMENT_REQUIRED'
        ? 'ENTITLEMENT_REQUIRED'
        : payload.rateLimited || payload.code === 'RATE_LIMITED'
          ? 'RATE_LIMITED'
          : payload.binaryMissing || payload.code === 'BINARY_MISSING'
            ? 'BINARY_MISSING'
            : payload.code === 'PROVIDER_UNAVAILABLE'
              ? 'PROVIDER_UNAVAILABLE'
              : payload.code === 'TIMEOUT' ||
                  payload.httpStatus === 504 ||
                  fallbackStatus === 504
                ? 'TIMEOUT'
                : 'AI_ERROR'
  const status = payload.httpStatus ?? fallbackStatus
  return new MarbleCollaborationError(
    code,
    payload.error ||
      (status
        ? `AI collaboration failed (HTTP ${status}).`
        : 'AI collaboration failed.'),
  )
}

function extractThoughtSnippet(accumulated: string, maxChars = 140): string {
  const lines = accumulated
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s#>*`-]+/, '').trim())
    .filter(Boolean)
  const latest = lines.at(-1) ?? accumulated.replace(/\s+/g, ' ').trim()
  if (!latest) return ''
  return latest.length <= maxChars
    ? latest
    : `…${latest.slice(-(maxChars - 1))}`
}

async function askMarbleApi(
  request: CollaborationRequest,
  evergreenContext: EvergreenDesignContext,
): Promise<CollaborationResult | null> {
  if (typeof fetch !== 'function') return null
  const timeoutMs = request.timeoutMs ?? DEFAULT_COLLABORATE_CLIENT_TIMEOUT_MS
  const controller = new AbortController()
  const timeoutState = { fired: false }
  const timer = setTimeout(() => {
    timeoutState.fired = true
    controller.abort()
  }, timeoutMs)

  const onExternalAbort = () => controller.abort(request.signal?.reason)
  if (request.signal) {
    if (request.signal.aborted) {
      onExternalAbort()
    } else {
      request.signal.addEventListener('abort', onExternalAbort, { once: true })
    }
  }

  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream, application/json',
      },
      body: JSON.stringify({
        action: 'collaborate',
        stream: true,
        actionKind: request.action,
        source: request.source,
        instruction: request.instruction,
        selectedElements: request.selectedElements,
        sketchAnnotations: request.sketchAnnotations,
        sketchDataUrl: request.sketchDataUrl,
        modelId: request.modelId,
        providerId: request.providerId,
        reasoningEffort: request.reasoningEffort,
        sessionId: request.sessionId,
        evergreenRefs: evergreenContext.refs,
        designContracts: evergreenContext.designSystem.contracts,
        dontsGuardrails: evergreenContext.dontsSystem.guardrails,
      }),
      signal: controller.signal,
    })
    if (response.status === 404) {
      // Static environments (such as Storybook without TanStack Start server).
      return null
    }
    if (!response.ok) {
      const data: unknown = await response.json().catch(() => null)
      throw toMarbleCollaborationError(data, response.status)
    }

    const contentType = (
      response.headers.get('content-type') ?? ''
    ).toLowerCase()
    if (!contentType.includes('text/event-stream') || !response.body) {
      const data: unknown = await response.json().catch(() => null)
      return normalizeApi(data, request, evergreenContext)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let thoughtBuffer = ''
    let currentPhase: CollaborationProgressPhase = 'thinking'
    let currentLabel = 'Thinking…'
    const streamOutcome: {
      donePayload: unknown
      error: MarbleCollaborationError | null
    } = {
      donePayload: null,
      error: null,
    }

    const handleEvent = (rawEvent: Record<string, unknown>) => {
      const type = rawEvent.type
      if (type === 'status') {
        const phase = rawEvent.phase
        if (
          phase === 'connecting' ||
          phase === 'thinking' ||
          phase === 'generating' ||
          phase === 'parsing'
        ) {
          currentPhase = phase
        }
        if (typeof rawEvent.label === 'string' && rawEvent.label.trim()) {
          currentLabel = rawEvent.label.trim()
        }
        request.onProgress?.({
          phase: currentPhase,
          label: currentLabel,
          thoughtSnippet: thoughtBuffer
            ? extractThoughtSnippet(thoughtBuffer)
            : undefined,
          elapsedMs:
            typeof rawEvent.elapsedMs === 'number'
              ? rawEvent.elapsedMs
              : undefined,
        })
        return
      }
      if (type === 'thought_delta' && typeof rawEvent.delta === 'string') {
        thoughtBuffer += rawEvent.delta
        currentPhase = 'thinking'
        request.onProgress?.({
          phase: 'thinking',
          label: 'Thinking…',
          thoughtSnippet: extractThoughtSnippet(thoughtBuffer),
        })
        return
      }
      if (type === 'progress') {
        request.onProgress?.({
          phase: currentPhase,
          label: currentLabel,
          thoughtSnippet: thoughtBuffer
            ? extractThoughtSnippet(thoughtBuffer)
            : undefined,
          elapsedMs:
            typeof rawEvent.elapsedMs === 'number'
              ? rawEvent.elapsedMs
              : undefined,
        })
        return
      }
      if (type === 'heartbeat') {
        request.onProgress?.({
          phase: currentPhase,
          label: currentLabel,
          thoughtSnippet: thoughtBuffer
            ? extractThoughtSnippet(thoughtBuffer)
            : undefined,
          elapsedMs:
            typeof rawEvent.elapsedMs === 'number'
              ? rawEvent.elapsedMs
              : undefined,
        })
        return
      }
      if (type === 'done') {
        streamOutcome.donePayload = rawEvent
        return
      }
      if (type === 'error') {
        streamOutcome.error = toMarbleCollaborationError(rawEvent)
      }
    }

    const flushLine = (line: string) => {
      const clean = line.endsWith('\r') ? line.slice(0, -1) : line
      if (!clean.startsWith('data:')) return
      const raw = clean.slice('data:'.length).trim()
      if (!raw || raw === '[DONE]') return
      try {
        const parsed: unknown = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          handleEvent(parsed as Record<string, unknown>)
        }
      } catch {
        // ignore malformed chunk
      }
    }

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let idx = buffer.indexOf('\n')
        while (idx !== -1) {
          flushLine(buffer.slice(0, idx))
          buffer = buffer.slice(idx + 1)
          idx = buffer.indexOf('\n')
        }
      }
      buffer += decoder.decode()
      if (buffer.trim()) {
        for (const line of buffer.split('\n')) flushLine(line)
      }
    } finally {
      try {
        reader.releaseLock()
      } catch {
        // ignore
      }
    }

    if (streamOutcome.error) {
      throw streamOutcome.error
    }
    if (streamOutcome.donePayload) {
      return normalizeApi(streamOutcome.donePayload, request, evergreenContext)
    }
    throw new MarbleCollaborationError(
      'AI_ERROR',
      'AI collaborator stream ended unexpectedly before returning a proposal.',
    )
  } catch (error) {
    if (error instanceof MarbleCollaborationError) throw error
    if (request.signal?.aborted) {
      throw error
    }
    if (
      timeoutState.fired ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      const label =
        request.providerId === 'grok-build'
          ? 'Grok Build'
          : request.providerId === 'opencode-go'
            ? 'OpenCode Go'
            : 'Antigravity'
      throw new MarbleCollaborationError(
        'TIMEOUT',
        `${label} timed out before returning a Marble proposal.`,
      )
    }
    return null
  } finally {
    clearTimeout(timer)
    request.signal?.removeEventListener('abort', onExternalAbort)
  }
}

function normalizeApi(
  data: unknown,
  request: CollaborationRequest,
  evergreenContext: EvergreenDesignContext,
): CollaborationResult | null {
  if (!data || typeof data !== 'object') return null
  const record = data as {
    proposal?: MarbleOpProposal
    stages?: NonNullable<AIMessage['stages']>
    newDocument?: MarbleDocumentFile
    ops?: MarbleOp[]
    note?: string
    source?:
      | 'antigravity-acp'
      | 'opencode-acp'
      | 'opencode-go'
      | 'grok-build-acp'
      | 'api'
      | 'synthesizer'
    thoughts?: string[]
    runtime?: CollaborationResult['runtime']
  }
  const responseSource =
    record.source === 'antigravity-acp' ||
    record.source === 'opencode-acp' ||
    record.source === 'opencode-go' ||
    record.source === 'grok-build-acp'
      ? record.source
      : 'api'
  if (
    record.proposal &&
    Array.isArray(record.proposal.ops) &&
    validOps(record.proposal.ops)
  ) {
    const sanitizedOps = sanitizeOpsWithEvergreen(
      record.proposal.ops,
      evergreenContext,
    )
    const stages = (
      record.stages ?? [
        {
          stageNumber: 1,
          totalStages: 1,
          note: record.proposal.note,
          ops: sanitizedOps,
          completed: false,
        },
      ]
    ).map((stage) => ({
      ...stage,
      ops: sanitizeOpsWithEvergreen(stage.ops, evergreenContext),
    }))
    return {
      proposal: {
        ...record.proposal,
        ops: sanitizedOps,
        referencedEvergreenDocs:
          record.proposal.referencedEvergreenDocs ?? evergreenContext.refs,
      },
      stages,
      newDocument: record.newDocument
        ? {
            ...record.newDocument,
            source: sanitizeHtmlWithEvergreenRules(
              record.newDocument.source,
              evergreenContext,
            ),
          }
        : undefined,
      evergreenContext,
      source: responseSource,
      thoughts: Array.isArray(record.thoughts) ? record.thoughts : undefined,
      runtime: record.runtime,
    }
  }
  if (Array.isArray(record.ops) && validOps(record.ops)) {
    const sanitizedOps = sanitizeOpsWithEvergreen(record.ops, evergreenContext)
    const stages = record.stages?.length
      ? record.stages.map((stage) => ({
          ...stage,
          ops: sanitizeOpsWithEvergreen(stage.ops, evergreenContext),
        }))
      : [
          {
            stageNumber: 1,
            totalStages: 1,
            note: record.note || request.instruction,
            ops: sanitizedOps,
            completed: false,
          },
        ]
    return {
      proposal: makeProposal(
        request,
        record.note || request.instruction,
        stages,
        idsTouched(sanitizedOps),
        evergreenContext,
      ),
      stages,
      newDocument: record.newDocument
        ? {
            ...record.newDocument,
            source: sanitizeHtmlWithEvergreenRules(
              record.newDocument.source,
              evergreenContext,
            ),
          }
        : undefined,
      evergreenContext,
      source: responseSource,
      thoughts: Array.isArray(record.thoughts) ? record.thoughts : undefined,
      runtime: record.runtime,
    }
  }
  if (record.newDocument?.source) {
    const stages = narrateApp(
      record.newDocument.title || 'New app',
      [],
      evergreenContext,
    )
    return {
      proposal: makeProposal(
        request,
        record.note || `Built ${record.newDocument.title}.`,
        stages,
        [],
        evergreenContext,
      ),
      stages,
      newDocument: {
        ...record.newDocument,
        source: sanitizeHtmlWithEvergreenRules(
          record.newDocument.source,
          evergreenContext,
        ),
      },
      evergreenContext,
      source: responseSource,
      thoughts: Array.isArray(record.thoughts) ? record.thoughts : undefined,
      runtime: record.runtime,
    }
  }
  return null
}

function validOps(ops: MarbleOp[]): boolean {
  return ops.every((op) => typeof op.type === 'string' && OP_TYPES.has(op.type))
}
