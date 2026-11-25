// Server-side prompt builder and Marble op / document validator for xDrive AI collaboration.
// Formats the open .mrbl file, selected elements, sketch annotations, and evergreen
// design system guardrails for Google Antigravity ACP, then parses & validates the
// JSON output against @bdhmin/marble/guard and @bdhmin/marble/patcher.

// @ts-expect-error @bdhmin/marble has no type declarations.
import * as marbleGuard from '@bdhmin/marble/guard'
// @ts-expect-error @bdhmin/marble has no type declarations.
import * as marblePatcher from '@bdhmin/marble/patcher'
import type {
  AIMessage,
  AIProviderId,
  EvergreenDocRef,
  MarbleAppCategory,
  MarbleDocumentFile,
  MarbleOp,
  MarbleOpProposal,
  SelectedMarbleElement,
  SketchAnnotation,
} from '#/lib/types'
import type { ReasoningEffort } from '#/lib/ai/drive-chat-types'
import type { MarbleActionKind } from '#/lib/marble/ai-collaborator'
import {
  resolveEvergreenDesignContext,
  sanitizeHtmlWithEvergreenRules,
  sanitizeTextWithDonts,
} from '#/lib/marble/ai-collaborator'

const checkShapes = marbleGuard.checkShapes as (ops: readonly unknown[]) => void
const guardOps = marbleGuard.guardOps as (
  source: string,
  ops: readonly unknown[],
) => string
const applyOps = marblePatcher.applyOps as (
  source: string,
  ops: readonly unknown[],
) => string
const knownIds = marblePatcher.knownIds as (source: string) => Iterable<string>

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

export interface ServerCollaborateInput {
  source: string
  instruction: string
  modelId: string
  providerId: AIProviderId
  reasoningEffort?: ReasoningEffort
  action?: MarbleActionKind
  selectedElements?: SelectedMarbleElement[]
  sketchAnnotations?: SketchAnnotation[]
  evergreenRefs?: EvergreenDocRef[]
  designContracts?: string[]
  dontsGuardrails?: string[]
}

interface RawAiStage {
  note?: string
  ops?: unknown[]
}

interface RawAiResponse {
  note?: string
  summary?: string
  stages?: RawAiStage[]
  ops?: unknown[]
  newDocument?: {
    title?: string
    slug?: string
    category?: string
    description?: string
    tags?: string[]
    source?: string
  }
  title?: string
  slug?: string
  category?: string
  description?: string
  tags?: string[]
  source?: string
}

function isNewAppRequest(input: ServerCollaborateInput): boolean {
  if (input.action === 'new_app') return true
  if (!input.source.trim()) return true
  return /\b(new app|from scratch|build (me )?an app|create (me )?(a |an )?app|make (me )?a new app)\b/i.test(
    input.instruction,
  )
}

function truncateSource(source: string, maxChars = 28_000): string {
  if (source.length <= maxChars) return source
  const head = source.slice(0, Math.floor(maxChars * 0.65))
  const tail = source.slice(-Math.floor(maxChars * 0.3))
  return `${head}\n<!-- ... middle truncated (${source.length - maxChars} chars) ... -->\n${tail}`
}

function listKnownIds(source: string): string[] {
  try {
    return [...knownIds(source)]
  } catch {
    return [
      ...new Set(
        [...source.matchAll(/data-marble-id\s*=\s*["']([^"']+)["']/g)].map(
          (m) => m[1],
        ),
      ),
    ]
  }
}

function providerMeta(providerId: ServerCollaborateInput['providerId']): {
  name: string
  runtimeLabel: string
  initials: string
  tag: string
  defaultSlug: string
} {
  if (providerId === 'grok-build') {
    return {
      name: 'Grok Build',
      runtimeLabel: 'Grok Build ACP',
      initials: 'GB',
      tag: 'grok-build',
      defaultSlug: 'grok-build-app',
    }
  }
  if (providerId === 'opencode-go') {
    return {
      name: 'OpenCode Go',
      runtimeLabel: 'OpenCode Go',
      initials: 'OG',
      tag: 'opencode-go',
      defaultSlug: 'opencode-go-app',
    }
  }
  return {
    name: 'Google Antigravity',
    runtimeLabel: 'the official Google Antigravity ACP runtime',
    initials: 'AG',
    tag: 'antigravity',
    defaultSlug: 'antigravity-app',
  }
}

export function buildMarbleAcpPrompt(input: ServerCollaborateInput): string {
  const fallbackContext = resolveEvergreenDesignContext()
  const designContracts = input.designContracts?.length
    ? input.designContracts
    : fallbackContext.designSystem.contracts
  const dontsGuardrails = input.dontsGuardrails?.length
    ? input.dontsGuardrails
    : fallbackContext.dontsSystem.guardrails

  const buildingNewApp = isNewAppRequest(input)
  const selected = input.selectedElements ?? []
  const sketches = input.sketchAnnotations ?? []
  const existingIds = input.source ? listKnownIds(input.source) : []
  const provider = providerMeta(input.providerId)

  const sections: string[] = [
    `You are the xDrive Marble (.mrbl) AI Collaborator running inside xDrive via ${provider.runtimeLabel}.`,
    'CRITICAL RULES:',
    '1. Do NOT invoke any filesystem, shell, terminal, search, or external tools. All document context is provided directly below.',
    '2. Respond ONLY with a single valid JSON object (no markdown fences, no commentary before or after the JSON).',
    '3. Every element you create or insert MUST have a unique `data-marble-id` attribute and use xDrive CSS variables (`var(--paper)`, `var(--panel)`, `var(--ink)`, `var(--muted)`, `var(--line)`, `var(--accent)`, `var(--commit)`, `var(--danger)`, `var(--radius)`).',
    '4. Strictly follow xDrive design-system contracts and anti-slop guardrails:',
    ...designContracts
      .slice(0, 10)
      .map((rule) => `   - Design contract: ${rule}`),
    ...dontsGuardrails
      .slice(0, 8)
      .map((rule) => `   - Anti-slop guardrail: ${rule}`),
  ]

  if (buildingNewApp) {
    sections.push(
      '',
      'TASK: Build a complete, self-contained, interactive `.mrbl` HTML5 document/app from scratch.',
      `USER INSTRUCTION: ${input.instruction}`,
      '',
      'Return ONLY a JSON object with this exact shape:',
      '{',
      '  "note": "Brief 1-sentence summary of the app you built",',
      '  "newDocument": {',
      '    "title": "Human-readable title",',
      '    "slug": "url-safe-slug",',
      '    "category": "latex" | "notebook" | "document" | "slides" | "matrix" | "sandbox" | "custom",',
      '    "description": "1-sentence description",',
      '    "tags": ["tag1", "tag2"],',
      '    "source": "<!DOCTYPE html>\\n<html lang=\\"en\\">...complete interactive .mrbl HTML5 document with data-marble-id on key elements, data-marble-editable on editable prose, and clean <style> using xDrive tokens...</html>"',
      '  }',
      '}',
    )
  } else {
    sections.push(
      '',
      'TASK: Produce valid Marble DOM operations (`ops`) grouped into 1 to 4 clear `stages` to fulfill the user instruction against the open `.mrbl` file.',
      `ACTION HINT: ${input.action ?? 'dtrt'}`,
      `USER INSTRUCTION: ${input.instruction}`,
      '',
      'ALLOWED MARBLE OP SHAPES:',
      '- { "type": "setText", "id": "<existing data-marble-id>", "text": "<new plain text>" }',
      '- { "type": "setInner", "id": "<existing data-marble-id>", "html": "<inner HTML with unique data-marble-id attributes>" }',
      '- { "type": "setAttr", "id": "<existing data-marble-id>", "name": "<attr>", "value": "<string or null to remove>" }',
      '- { "type": "insert", "parentId": "<existing container data-marble-id>", "beforeId": "<existing child id or null to append>", "html": "<valid HTML element(s) with NEW unique data-marble-id attributes>" }',
      '- { "type": "move", "id": "<existing id>", "parentId": "<existing container id>", "beforeId": "<existing child id or null>" }',
      '- { "type": "remove", "id": "<existing id>" }',
      '',
      'IMPORTANT OP CONSTRAINTS:',
      '- Only reference IDs that ALREADY exist in EXISTING_MARBLE_IDS (or IDs introduced by an earlier op in the same response).',
      '- NEVER reuse an existing `data-marble-id` when inserting new HTML.',
      '- Keep prose crisp, domain-accurate, and free of placeholder text or AI cliches.',
      '',
      'Return ONLY a JSON object with this exact shape:',
      '{',
      '  "note": "Brief 1-sentence summary of the proposed edits",',
      '  "stages": [',
      '    { "note": "Step description", "ops": [ /* MarbleOp[] */ ] }',
      '  ]',
      '}',
      '',
      `EXISTING_MARBLE_IDS (${existingIds.length}): ${existingIds.slice(0, 120).join(', ')}`,
    )

    if (selected.length > 0) {
      sections.push(
        '',
        'SELECTED ELEMENTS:',
        ...selected.map(
          (el) =>
            `- #${el.id} (<${el.tagName}>, affordances: ${el.affordances.join(', ') || 'none'}): ${el.textPreview}\n  slice: ${el.sourceSlice.slice(0, 400)}`,
        ),
      )
    }

    if (sketches.length > 0) {
      sections.push(
        '',
        'SKETCH ANNOTATIONS ON CANVAS:',
        ...sketches.map(
          (sk) =>
            `- [${sk.kind}] "${sk.label}" covering nodes: ${sk.coveredNodeIds.join(', ') || 'canvas'}`,
        ),
      )
    }

    sections.push(
      '',
      'OPEN .MRBL DOCUMENT SOURCE:',
      truncateSource(input.source),
    )
  }

  return sections.join('\n')
}

function extractJsonObject(rawText: string): RawAiResponse | null {
  const trimmed = rawText.trim()
  if (!trimmed) return null

  const candidates: string[] = [trimmed]

  const fencedMatches = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
  for (const match of fencedMatches) {
    if (match[1]) candidates.push(match[1].trim())
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1))
  }

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed
      }
    } catch {
      // Try next extraction strategy.
    }
  }
  return null
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
  if (typeof record.text === 'string')
    op.text = sanitizeTextWithDonts(record.text)
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

function validateAndFilterStages(
  source: string,
  rawStages: Array<{ note: string; ops: MarbleOp[] }>,
): NonNullable<AIMessage['stages']> {
  let rollingSource = source
  const validated: NonNullable<AIMessage['stages']> = []

  for (const stage of rawStages) {
    const acceptedOps: MarbleOp[] = []
    for (const op of stage.ops) {
      try {
        if (op.type !== 'assignId') {
          checkShapes([op])
          rollingSource = guardOps(rollingSource, [op])
        } else {
          rollingSource = applyOps(rollingSource, [op])
        }
        acceptedOps.push(op)
      } catch {
        // Try patcher fallback for non-guarded shapes; if still invalid, skip safely.
        try {
          rollingSource = applyOps(rollingSource, [op])
          acceptedOps.push(op)
        } catch {
          // Drop ops referencing missing/invalid IDs.
        }
      }
    }
    if (acceptedOps.length > 0) {
      validated.push({
        stageNumber: validated.length + 1,
        totalStages: rawStages.length,
        note: stage.note,
        ops: acceptedOps,
        completed: false,
      })
    }
  }

  return validated.map((stage, index, all) => ({
    ...stage,
    stageNumber: index + 1,
    totalStages: all.length,
  }))
}

function slugify(value: string, fallback = 'antigravity-app'): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || fallback
  )
}

function buildDocumentFromAi(
  docPayload: NonNullable<RawAiResponse['newDocument']>,
  modelId: string,
  providerId: ServerCollaborateInput['providerId'],
  instruction: string,
): MarbleDocumentFile {
  const provider = providerMeta(providerId)
  const title = (docPayload.title || 'Untitled Research App').trim()
  const slug = slugify(docPayload.slug || title, provider.defaultSlug)
  const rawCategory = (docPayload.category || 'custom') as MarbleAppCategory
  const category: MarbleAppCategory = VALID_CATEGORIES.has(rawCategory)
    ? rawCategory
    : 'custom'
  const rawSource = (docPayload.source || '').trim()
  const source = sanitizeHtmlWithEvergreenRules(
    rawSource.startsWith('<!') || rawSource.startsWith('<html')
      ? rawSource
      : `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="utf-8" /><title>${title}</title></head>\n<body data-marble-id="app-root">${rawSource}</body>\n</html>`,
  )
  const now = new Date().toISOString()
  const nodeCount = listKnownIds(source).length
  const byteSize = new TextEncoder().encode(source).byteLength
  return {
    id: `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    slug,
    fileName: `${slug}.mrbl`,
    title,
    description:
      docPayload.description?.trim() ||
      `Built with ${provider.name} (${modelId}) from "${instruction.slice(0, 80)}"`,
    category,
    isTemplate: false,
    source,
    nodeCount,
    byteSize,
    version: 1,
    syncState: 'saved',
    createdAt: now,
    updatedAt: now,
    createdBy: {
      name: modelId,
      initials: provider.initials,
      isAi: true,
      modelBadge: modelId,
    },
    lastEditedBy: {
      name: modelId,
      initials: provider.initials,
      isAi: true,
      modelBadge: modelId,
    },
    starred: false,
    pinned: false,
    tags:
      Array.isArray(docPayload.tags) && docPayload.tags.length > 0
        ? docPayload.tags
            .filter((t): t is string => typeof t === 'string')
            .slice(0, 6)
        : [provider.tag, category],
    folder: 'My Drive',
    folderId: null,
    share: {
      isPublicLinkEnabled: false,
      publicLinkUrl: `https://xdrive.app/d/${slug}`,
      publicPermission: 'view_only',
      allowDuplication: true,
      sharedAiDailyLimit: 40,
      sharedAiUsedToday: 0,
      collaborators: [],
    },
    checkpoints: [
      {
        sha: Math.random().toString(16).slice(2, 14),
        label: `Built with ${modelId}`,
        timestamp: Date.now(),
        author: modelId,
        opsCount: nodeCount,
        source,
        note: instruction,
      },
    ],
    intentHistory: [],
  }
}

function idsTouchedByOps(ops: MarbleOp[]): string[] {
  const ids = new Set<string>()
  for (const op of ops) {
    if (op.id) ids.add(op.id)
    if (op.parentId) ids.add(op.parentId)
    if (op.type === 'insert' && op.html) {
      for (const match of op.html.matchAll(/data-marble-id="([^"]+)"/g)) {
        ids.add(match[1])
      }
    }
  }
  return [...ids]
}

export function parseMarbleAcpResponse(
  rawText: string,
  input: ServerCollaborateInput,
  resolvedModelId: string,
): {
  proposal: MarbleOpProposal
  stages: NonNullable<AIMessage['stages']>
  newDocument?: MarbleDocumentFile
} {
  const fallbackContext = resolveEvergreenDesignContext()
  const evergreenRefs = input.evergreenRefs?.length
    ? input.evergreenRefs
    : fallbackContext.refs

  const provider = providerMeta(input.providerId)
  const parsed = extractJsonObject(rawText)
  if (!parsed) {
    throw new Error(
      `${provider.name} returned a non-JSON response that could not be applied as Marble ops: "${rawText.slice(0, 220)}"`,
    )
  }

  const docCandidate =
    parsed.newDocument ??
    (typeof parsed.source === 'string' && parsed.source.includes('<')
      ? {
          title: parsed.title,
          slug: parsed.slug,
          category: parsed.category,
          description: parsed.description,
          tags: parsed.tags,
          source: parsed.source,
        }
      : undefined)

  if (docCandidate?.source) {
    const newDocument = buildDocumentFromAi(
      docCandidate,
      resolvedModelId,
      input.providerId,
      input.instruction,
    )
    const note =
      parsed.note?.trim() ||
      parsed.summary?.trim() ||
      `Built “${newDocument.title}” with ${provider.name}.`
    const stages: NonNullable<AIMessage['stages']> = [
      {
        stageNumber: 1,
        totalStages: 2,
        note: `Generated ${newDocument.fileName} (${newDocument.nodeCount} Marble nodes)`,
        ops: [],
        completed: true,
      },
      {
        stageNumber: 2,
        totalStages: 2,
        note: 'Verified against document-design-system and document-donts-system',
        ops: [],
        completed: true,
      },
    ]
    const proposal: MarbleOpProposal = {
      id: `prop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      note,
      stage: '1-2',
      ops: [],
      targetIds: [],
      modelId: resolvedModelId,
      providerId: input.providerId,
      createdAt: Date.now(),
      status: 'committed',
      sketchAnnotations: input.sketchAnnotations,
      instruction: input.instruction,
      referencedEvergreenDocs: evergreenRefs,
    }
    return { proposal, stages, newDocument }
  }

  const rawStages: Array<{ note: string; ops: MarbleOp[] }> = []
  if (Array.isArray(parsed.stages) && parsed.stages.length > 0) {
    for (const stage of parsed.stages) {
      const ops = Array.isArray(stage.ops)
        ? stage.ops
            .map(coerceMarbleOp)
            .filter((op): op is MarbleOp => op !== null)
        : []
      if (ops.length > 0) {
        rawStages.push({
          note: stage.note?.trim() || 'Apply proposed Marble edit',
          ops,
        })
      }
    }
  } else if (Array.isArray(parsed.ops)) {
    const ops = parsed.ops
      .map(coerceMarbleOp)
      .filter((op): op is MarbleOp => op !== null)
    if (ops.length > 0) {
      rawStages.push({
        note: parsed.note?.trim() || input.instruction,
        ops,
      })
    }
  }

  const validatedStages = validateAndFilterStages(input.source, rawStages)
  const ops = validatedStages.flatMap((stage) => stage.ops)

  if (ops.length === 0) {
    const fallbackNote =
      parsed.note?.trim() ||
      parsed.summary?.trim() ||
      `${provider.name} responded without any applicable Marble DOM operations for the current document.`
    throw new Error(fallbackNote)
  }

  const note =
    parsed.note?.trim() ||
    parsed.summary?.trim() ||
    `Proposed ${ops.length} Marble operation${ops.length === 1 ? '' : 's'} via ${provider.name}.`

  const proposal: MarbleOpProposal = {
    id: `prop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    note,
    stage: `1-${validatedStages.length}`,
    ops,
    targetIds: idsTouchedByOps(ops),
    modelId: resolvedModelId,
    providerId: input.providerId,
    createdAt: Date.now(),
    status: 'proposed',
    sketchAnnotations: input.sketchAnnotations,
    instruction: input.instruction,
    referencedEvergreenDocs: evergreenRefs,
  }

  return { proposal, stages: validatedStages }
}
