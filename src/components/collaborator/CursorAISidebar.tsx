import { useEffect, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { Loader2, Lock, ShieldCheck, X } from 'lucide-react'
import type {
  AIMessage,
  EvergreenDocRef,
  MarbleCheckpoint,
  MarbleOp,
  MarbleOpProposal,
  SelectedMarbleElement,
  SharePermissionLevel,
  SketchAnnotation,
  SketchStroke,
} from '#/lib/types'
import {
  PROMPT_MODELS,
  resolveModel,
} from '#/components/collaborator/FloatingPromptBar'
import type {
  MarbleIntentKind,
  MarbleIntentRequest,
} from '#/components/collaborator/FloatingPromptBar'
import {
  aiIsBlocked,
  permissionByLevel,
} from '#/components/collaborator/ShareModal'
import { ModelPicker } from '#/components/model-picker'
import type { ModelPickerInputOption } from '#/components/model-picker'
import { WorkspaceLink } from '#/components/routing/WorkspaceLink'
import type { AiSidebarTab } from '#/lib/routing'
import { cn } from '#/lib/utils'

export const QUICK_PROMPTS = [
  'Add an interactive chart section',
  'Create <marble-alt> variations for selected heading',
  'Wire selected table to filter cards',
] as const

const STAGE_PLANS: Record<MarbleIntentKind, string[]> = {
  instruct: [
    'Insert theorem container stub',
    'Populate LaTeX derivation',
    'Wire affordances onto the new nodes',
    'Finish with a small inserted stylesheet',
  ],
  dtrt: [
    'Read how the selected nodes should relate',
    'Insert the wiring stub beside them',
    'Bind controls with data-marble affordances',
    'Stamp data-marble-intent provenance',
  ],
  factory: [
    'Insert the tool control stub',
    'Register the deterministic factory script',
    'Stamp data-marble-made-by lineage',
    'Keep the tool offline — no fetch, no /intent',
  ],
  'fork-alt': [
    'Wrap the selection in <marble-alt>',
    'Keep the current reading as data-marble-alt v1',
    'Insert a candidate sibling',
    'Point data-marble-active at the candidate',
  ],
  polish: [
    'Mark the prose that will change',
    'Rewrite the LaTeX in place with setText',
    'Keep every data-marble-id stable',
    'Drop filler so the last stage is the finished voice',
  ],
  scale: [
    'Read the corner drag as a restyle',
    'Map gesture x, y onto spacing and type',
    'Adjust columns rather than bitmap-scaling the node',
    'Insert a small style block for the new measure',
  ],
}

export const DEFAULT_EVERGREEN_REFS: EvergreenDocRef[] = [
  {
    slug: 'document-design-system',
    fileName: 'document-design-system.mrbl',
    title: 'xDrive Document Design System',
    ruleCount: 11,
  },
  {
    slug: 'document-donts-system',
    fileName: 'document-donts-system.mrbl',
    title: 'Document Don’ts — Anti-Slop Guardrails',
    ruleCount: 5,
  },
]

const DEMO_PROPOSAL: MarbleOpProposal = {
  id: 'prop-lattice',
  note: 'Stage 4 of 4: Finish with a small inserted stylesheet',
  stage: 'Stage 4 of 4',
  instruction:
    'Insert a theorem under the method section and derive the Bell stabilizer.',
  modelId: 'xai/grok-4.7',
  providerId: 'xai',
  createdAt: Date.parse('2026-11-22T14:05:00Z'),
  status: 'proposed',
  targetIds: ['sec-method', 'eq-bell'],
  referencedEvergreenDocs: DEFAULT_EVERGREEN_REFS,
  ops: [
    {
      type: 'insert',
      parentId: 'sec-method',
      beforeId: null,
      html: '<section data-marble-id="thm-lattice" data-marble-editable><h3 data-marble-id="thm-lattice-h">Theorem</h3></section>',
    },
    {
      type: 'setInner',
      id: 'thm-lattice',
      html: '<h3 data-marble-id="thm-lattice-h">Theorem 2. Bell stabilizer</h3><p data-marble-id="thm-lattice-p">\\[\\langle\\psi|K_Z|\\psi\\rangle = 1\\]</p>',
    },
    {
      type: 'setAttr',
      id: 'thm-lattice',
      name: 'data-marble-removable',
      value: '',
    },
    {
      type: 'insert',
      parentId: 'sec-method',
      beforeId: null,
      html: '<style data-marble-id="thm-lattice-css">[data-marble-id="thm-lattice"]{border-left:2px solid var(--ink);padding-left:0.75rem}</style>',
    },
  ],
  inverseOps: [
    { type: 'remove', id: 'thm-lattice-css' },
    {
      type: 'setAttr',
      id: 'thm-lattice',
      name: 'data-marble-removable',
      value: null,
    },
    { type: 'setText', id: 'thm-lattice', text: 'Theorem' },
    { type: 'remove', id: 'thm-lattice' },
  ],
}

export const DEMO_PROPOSALS: MarbleOpProposal[] = [DEMO_PROPOSAL]

export const DEMO_MESSAGES: AIMessage[] = [
  {
    id: 'msg-user-1',
    role: 'user',
    content:
      'Insert a theorem under the method section and derive the Bell stabilizer.',
    timestamp: '2026-11-22T14:04:00.000Z',
    attachedElements: [
      {
        id: 'sec-method',
        tagName: 'section',
        textPreview: 'Lattice surgery proceeds by merging…',
        sourceSlice:
          '<section data-marble-id="sec-method" data-marble-editable>',
        affordances: ['data-marble-editable'],
      },
      {
        id: 'eq-bell',
        tagName: 'figure',
        textPreview: '|ψ⟩ = (|00⟩ + |11⟩)/√2',
        sourceSlice: '<figure data-marble-id="eq-bell" data-marble-editable>',
        affordances: ['data-marble-editable'],
      },
    ],
  },
  {
    id: 'msg-assistant-1',
    role: 'assistant',
    content: 'Proposed 4 operations on #sec-method.',
    timestamp: '2026-11-22T14:05:00.000Z',
    modelId: 'xai/grok-4.7',
    providerId: 'xai',
    stages: [
      {
        stageNumber: 1,
        totalStages: 4,
        note: 'Insert theorem container stub',
        ops: [DEMO_PROPOSAL.ops[0]],
        completed: true,
      },
      {
        stageNumber: 2,
        totalStages: 4,
        note: 'Populate LaTeX derivation',
        ops: [DEMO_PROPOSAL.ops[1]],
        completed: true,
      },
      {
        stageNumber: 3,
        totalStages: 4,
        note: 'Wire affordances onto the new nodes',
        ops: [DEMO_PROPOSAL.ops[2]],
        completed: true,
      },
      {
        stageNumber: 4,
        totalStages: 4,
        note: 'Finish with a small inserted stylesheet',
        ops: [DEMO_PROPOSAL.ops[3]],
        completed: true,
      },
    ],
    proposal: DEMO_PROPOSAL,
  },
]

export const DEMO_CHECKPOINTS: MarbleCheckpoint[] = [
  {
    sha: 'a1c9e20f4b77',
    label: 'Fork template into the Floquet manuscript',
    timestamp: Date.parse('2026-11-21T18:12:00Z'),
    author: 'You',
    opsCount: 6,
    source: 'Duplicate',
  },
  {
    sha: '44de10aa91c3',
    label: 'Direct edit · method paragraph',
    timestamp: Date.parse('2026-11-22T09:40:00Z'),
    author: 'You',
    opsCount: 1,
    source: 'setText',
  },
  {
    sha: 'b70e5512cd08',
    label: 'Keep · figure caption restyle',
    timestamp: Date.parse('2026-11-22T11:16:00Z'),
    author: 'Grok 4.7',
    opsCount: 3,
    source: 'Keep',
  },
]

type TabId = AiSidebarTab

export interface CursorAISidebarProps {
  fileName?: string
  activeTab?: TabId
  onTabChange?: (tab: TabId) => void
  tabHrefs?: Partial<Record<TabId, string>>
  evergreenHrefs?: Record<string, string>
  messages?: AIMessage[]
  checkpoints?: MarbleCheckpoint[]
  proposals?: MarbleOpProposal[]
  selectedElements?: SelectedMarbleElement[]
  sketches?: SketchAnnotation[]
  strokes?: SketchStroke[]
  models?: ModelPickerInputOption[]
  modelId?: string
  onModelChange?: (modelId: string) => void
  favoriteModelIds?: string[]
  onFavoriteModelIdsChange?: (ids: string[]) => void
  permission?: SharePermissionLevel
  evergreenRefs?: EvergreenDocRef[]
  onOpenEvergreenDoc?: (slug: string) => void
  onRemoveElement?: (id: string) => void
  onRemoveSketch?: (id: string) => void
  onSend?: (text: string) => void
  onKeep?: (proposalId: string) => void
  onDiscard?: (proposalId: string) => void
  onOpenProviders?: () => void
  isThinking?: boolean
  thinkingLabel?: string
  antigravityConnected?: boolean
  hasConnectedProvider?: boolean
  pendingIntent?: MarbleIntentRequest | null
  width?: number
  className?: string
}

let sidebarSeq = 0

function uid(prefix: string): string {
  sidebarSeq += 1
  return `${prefix}-${sidebarSeq.toString(36)}-${Date.now().toString(36)}`
}

function formatWhen(value: string | number): string {
  const date = new Date(value)
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function opLines(op: MarbleOp): string[] {
  const id = op.id ? `#${op.id}` : '(new)'
  switch (op.type) {
    case 'setText':
      return [`setText ${id}`, `+ ${op.text ?? ''}`]
    case 'setInner':
      return [`setInner ${id}`, `+ ${op.html ?? ''}`]
    case 'setAttr':
      return [
        `setAttr ${id}`,
        op.value == null ? `− ${op.name}` : `+ ${op.name}="${op.value}"`,
      ]
    case 'insert':
      return [
        `insert into #${op.parentId ?? '?'} before ${op.beforeId ? `#${op.beforeId}` : 'end'}`,
        `+ ${op.html ?? ''}`,
      ]
    case 'move':
      return [
        `move ${id} → #${op.parentId ?? '?'} before ${op.beforeId ? `#${op.beforeId}` : 'end'}`,
      ]
    case 'remove':
      return [`− remove ${id}`]
    case 'assignId':
      return [`+ assignId ${id}`]
    default:
      return [op.type]
  }
}

function opsForKind(
  kind: MarbleIntentKind,
  targetIds: string[],
  gesture?: { x: number; y: number },
): MarbleOp[] {
  const anchor = targetIds[0] ?? 'sec-method'
  const fresh = `${anchor}-gen`
  if (kind === 'scale') {
    const x = (gesture?.x ?? 1).toFixed(2)
    const y = (gesture?.y ?? 1).toFixed(2)
    return [
      {
        type: 'setAttr',
        id: anchor,
        name: 'style',
        value: `--marble-scale-x:${x};--marble-scale-y:${y}`,
      },
      {
        type: 'insert',
        parentId: anchor,
        beforeId: null,
        html: `<style data-marble-id="${fresh}-css">[data-marble-id="${anchor}"]{font-size:calc(1rem * ${y});gap:calc(0.75rem * ${x})}</style>`,
      },
    ]
  }
  if (kind === 'fork-alt') {
    return [
      {
        type: 'insert',
        parentId: anchor,
        beforeId: null,
        html: `<marble-alt data-marble-id="${fresh}-alt" data-marble-active="v2"><div data-marble-id="${fresh}-v1" data-marble-alt="v1"></div><div data-marble-id="${fresh}-v2" data-marble-alt="v2" data-marble-editable>Candidate</div></marble-alt>`,
      },
      {
        type: 'setAttr',
        id: `${fresh}-alt`,
        name: 'data-marble-active',
        value: 'v2',
      },
    ]
  }
  if (kind === 'factory') {
    return [
      {
        type: 'insert',
        parentId: anchor,
        beforeId: null,
        html: `<button data-marble-id="${fresh}-tool" data-marble-factory="from-${anchor}" data-marble-add="#${fresh}-tpl" data-marble-into="#${anchor}">Make another</button>`,
      },
      {
        type: 'insert',
        parentId: anchor,
        beforeId: null,
        html: `<template data-marble-id="${fresh}-tpl"><div data-marble-id="${fresh}-row" data-marble-editable data-marble-made-by="${fresh}-tool"></div></template>`,
      },
    ]
  }
  if (kind === 'polish') {
    return targetIds.slice(0, 3).map((id) => ({
      type: 'setText' as const,
      id,
      text: 'Polished passage — same node, tighter prose.',
    }))
  }
  if (kind === 'dtrt') {
    const other = targetIds[1] ?? anchor
    return [
      {
        type: 'setAttr',
        id: anchor,
        name: 'data-marble-controls',
        value: other,
      },
      {
        type: 'insert',
        parentId: anchor,
        beforeId: null,
        html: `<button data-marble-id="${fresh}-wire" data-marble-editable>Wired to #${other}</button>`,
      },
    ]
  }
  return [
    {
      type: 'insert',
      parentId: anchor,
      beforeId: null,
      html: `<section data-marble-id="${fresh}" data-marble-editable><h3 data-marble-id="${fresh}-h">Theorem</h3></section>`,
    },
    {
      type: 'setInner',
      id: fresh,
      html: `<h3 data-marble-id="${fresh}-h">Theorem</h3><p data-marble-id="${fresh}-p">\\[\\langle\\psi|H|\\psi\\rangle\\]</p>`,
    },
    { type: 'setAttr', id: fresh, name: 'data-marble-removable', value: '' },
    {
      type: 'insert',
      parentId: anchor,
      beforeId: null,
      html: `<style data-marble-id="${fresh}-css">[data-marble-id="${fresh}"]{margin-top:1rem}</style>`,
    },
  ]
}

function draftFromIntent(
  request: MarbleIntentRequest,
  elements: SelectedMarbleElement[],
): { user: AIMessage; assistant: AIMessage; proposal: MarbleOpProposal } {
  const notes = STAGE_PLANS[request.kind]
  const ops = opsForKind(request.kind, request.targetIds, request.gesture)
  const proposalId = uid('prop')
  const proposal: MarbleOpProposal = {
    id: proposalId,
    note: `Stage 1 of ${notes.length}: ${notes[0]}`,
    stage: `Stage 1 of ${notes.length}`,
    instruction: request.instruction,
    modelId: request.modelId,
    providerId: request.providerId,
    createdAt: Date.now(),
    status: 'thinking',
    targetIds: request.targetIds,
    ops,
    inverseOps: [...ops].reverse().map((op) => {
      if (op.type === 'setAttr') {
        return {
          type: 'setAttr' as const,
          id: op.id,
          name: op.name,
          value: null,
        }
      }
      if (op.type === 'setText')
        return { type: 'setText' as const, id: op.id, text: '' }
      return { type: 'remove' as const, id: op.id ?? 'pending-inverse' }
    }),
    sketchAnnotations: request.sketches,
    referencedEvergreenDocs: DEFAULT_EVERGREEN_REFS,
  }
  const user: AIMessage = {
    id: uid('msg'),
    role: 'user',
    content: request.instruction,
    timestamp: new Date().toISOString(),
    modelId: request.modelId,
    providerId: request.providerId,
    attachedElements: elements.filter((element) =>
      request.targetIds.includes(element.id),
    ),
    attachedSketches: request.sketches,
  }
  const assistant: AIMessage = {
    id: uid('msg'),
    role: 'assistant',
    content: 'Prepared staged operations.',
    timestamp: new Date().toISOString(),
    modelId: request.modelId,
    providerId: request.providerId,
    stages: notes.map((note, index) => ({
      stageNumber: index + 1,
      totalStages: notes.length,
      note,
      ops: ops[index] ? [ops[index]] : [],
      completed: false,
    })),
    proposal,
  }
  return { user, assistant, proposal }
}

export function CursorAISidebar({
  activeTab: activeTabProp,
  onTabChange,
  tabHrefs,
  evergreenHrefs,
  messages = DEMO_MESSAGES,
  checkpoints = DEMO_CHECKPOINTS,
  proposals = DEMO_PROPOSALS,
  selectedElements = [],
  sketches = [],
  models = PROMPT_MODELS,
  modelId: modelIdProp,
  onModelChange,
  favoriteModelIds,
  onFavoriteModelIdsChange,
  permission = 'edit_with_ai_shared',
  evergreenRefs = DEFAULT_EVERGREEN_REFS,
  onOpenEvergreenDoc,
  onRemoveElement,
  onRemoveSketch,
  onSend,
  onKeep,
  onDiscard,
  onOpenProviders,
  isThinking = false,
  thinkingLabel,
  antigravityConnected,
  hasConnectedProvider,
  pendingIntent = null,
  width: widthProp,
  className,
}: CursorAISidebarProps) {
  const [internalTab, setInternalTab] = useState<TabId>(activeTabProp ?? 'chat')
  const tab = activeTabProp ?? internalTab
  const setTab = (next: TabId) => {
    if (activeTabProp === undefined) setInternalTab(next)
    onTabChange?.(next)
  }
  const [thread, setThread] = useState<AIMessage[]>(messages)
  const [proposalList, setProposalList] =
    useState<MarbleOpProposal[]>(proposals)
  const [history, setHistory] = useState<MarbleCheckpoint[]>(checkpoints)
  const [draft, setDraft] = useState('')
  const [internalWidth, setInternalWidth] = useState(widthProp ?? 340)
  const [internalModel, setInternalModel] = useState(
    () => modelIdProp ?? resolveModel(models)?.id ?? 'antigravity/default',
  )
  const [hiddenElements, setHiddenElements] = useState<string[]>([])
  const [hiddenSketches, setHiddenSketches] = useState<string[]>([])
  const seenIntent = useRef<string | null>(null)
  const timers = useRef<number[]>([])
  const spec = permissionByLevel(permission)
  const blocked = aiIsBlocked(permission)
  const modelId = modelIdProp ?? internalModel
  const width = widthProp ?? internalWidth
  const model = resolveModel(models, modelId)

  useEffect(() => {
    setThread(messages)
  }, [messages])

  useEffect(() => {
    setProposalList(proposals)
  }, [proposals])

  useEffect(() => {
    setHistory(checkpoints)
  }, [checkpoints])

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  const visibleElements = onRemoveElement
    ? selectedElements
    : selectedElements.filter((element) => !hiddenElements.includes(element.id))
  const visibleSketches = onRemoveSketch
    ? sketches
    : sketches.filter((sketch) => !hiddenSketches.includes(sketch.id))

  function setModel(next: string) {
    if (modelIdProp === undefined) setInternalModel(next)
    onModelChange?.(next)
  }

  function play(messageId: string, proposalId: string, total: number) {
    for (let index = 0; index < total; index += 1) {
      const timer = window.setTimeout(
        () => {
          const stageNumber = index + 1
          const done = stageNumber === total
          setThread((prev) =>
            prev.map((message) => {
              if (message.id !== messageId || !message.stages) return message
              const stages = message.stages.map((stage) =>
                stage.stageNumber === stageNumber
                  ? { ...stage, completed: true }
                  : stage,
              )
              const current = stages.find(
                (stage) => stage.stageNumber === stageNumber,
              )
              return {
                ...message,
                stages,
                proposal: message.proposal
                  ? {
                      ...message.proposal,
                      status: done ? 'proposed' : 'thinking',
                      note: current
                        ? `Stage ${stageNumber} of ${total}: ${current.note}`
                        : message.proposal.note,
                      stage: `Stage ${stageNumber} of ${total}`,
                    }
                  : message.proposal,
              }
            }),
          )
          if (done) {
            setProposalList((prev) =>
              prev.map((item) =>
                item.id === proposalId ? { ...item, status: 'proposed' } : item,
              ),
            )
          }
        },
        700 * (index + 1),
      )
      timers.current.push(timer)
    }
  }

  function ingest(request: MarbleIntentRequest) {
    if (aiIsBlocked(permission)) {
      setThread((prev) => [
        ...prev,
        {
          id: uid('msg'),
          role: 'system',
          content:
            permissionByLevel(permission).blockReason ??
            'AI is locked for this role.',
          timestamp: new Date().toISOString(),
        },
      ])
      setTab('chat')
      return
    }
    const { user, assistant, proposal } = draftFromIntent(
      request,
      selectedElements,
    )
    setThread((prev) => [...prev, user, assistant])
    setProposalList((prev) => [proposal, ...prev])
    setTab('chat')
    play(assistant.id, proposal.id, assistant.stages?.length ?? 4)
    onSend?.(request.instruction)
  }

  function sendText(text: string) {
    const instruction = text.trim()
    if (!instruction) return
    setDraft('')
    if (onSend) {
      setTab('chat')
      onSend(instruction)
      return
    }
    if (!model) return
    ingest({
      id: uid('intent'),
      kind: instruction.includes('<marble-alt>') ? 'fork-alt' : 'instruct',
      instruction,
      targetIds: visibleElements.map((element) => element.id),
      modelId: model.id,
      providerId: model.providerId,
      sketches: visibleSketches,
    })
  }

  function setStatus(id: string, status: MarbleOpProposal['status']) {
    setProposalList((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item)),
    )
    setThread((prev) =>
      prev.map((message) =>
        message.proposal?.id === id
          ? { ...message, proposal: { ...message.proposal, status } }
          : message,
      ),
    )
    if (status === 'committed') {
      const proposal = proposalList.find((item) => item.id === id)
      setHistory((prev) => [
        {
          sha: uid('sha').replace('sha-', '').slice(0, 12),
          label: proposal?.note ?? 'Keep',
          timestamp: Date.now(),
          author: 'You',
          opsCount: proposal?.ops.length ?? 0,
          source: 'Keep',
          note: proposal?.instruction,
        },
        ...prev,
      ])
      onKeep?.(id)
    }
    if (status === 'discarded') onDiscard?.(id)
  }

  const ingestRef = useRef(ingest)
  ingestRef.current = ingest

  useEffect(() => {
    if (!pendingIntent || seenIntent.current === pendingIntent.id) return
    seenIntent.current = pendingIntent.id
    ingestRef.current(pendingIntent)
  }, [pendingIntent])

  function onResizeKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (widthProp !== undefined) return
    if (event.key === 'ArrowLeft')
      setInternalWidth((value) => Math.min(380, value + 10))
    if (event.key === 'ArrowRight')
      setInternalWidth((value) => Math.max(300, value - 10))
  }

  function onResizeDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (widthProp !== undefined) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width
    const move = (ev: PointerEvent) => {
      const next = Math.min(
        380,
        Math.max(300, startWidth - (ev.clientX - startX)),
      )
      setInternalWidth(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const canKeep = spec.ai === 'byok' || spec.ai === 'shared'
  const canDiscard = !blocked
  const hasContext = visibleElements.length > 0 || visibleSketches.length > 0
  const hasUserMessages = thread.some((m) => m.role === 'user')

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'chat', label: 'Chat' },
    { id: 'ops', label: 'Diff' },
    { id: 'history', label: 'History' },
  ]

  return (
    <aside
      data-component="cursor-ai-sidebar"
      className={cn(
        'relative flex h-full min-h-[480px] shrink-0 flex-col border-l border-[var(--xd-border)] bg-[var(--xd-rail)] text-[var(--xd-ink)]',
        className,
      )}
      style={{ width }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={300}
        aria-valuemax={380}
        aria-valuenow={width}
        aria-label="Resize collaborator sidebar"
        tabIndex={0}
        onKeyDown={onResizeKey}
        onPointerDown={onResizeDown}
        className="absolute top-0 left-0 h-full w-1 cursor-col-resize hover:bg-[var(--xd-accent)]/40"
      />

      <header className="flex h-9 items-center justify-between gap-2 border-b border-[var(--xd-border)] px-2.5">
        <div
          role="tablist"
          aria-label="Collaborator sections"
          className="flex items-center gap-0.5"
        >
          {tabs.map((item) => (
            <WorkspaceLink
              key={item.id}
              href={tabHrefs?.[item.id] ?? `?ai=${item.id}`}
              role="tab"
              aria-selected={tab === item.id}
              onNavigate={() => setTab(item.id)}
              className={cn(
                'rounded px-2 py-1 text-[11.5px] font-medium transition-colors',
                tab === item.id
                  ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                  : 'text-[var(--xd-ink-muted)] hover:text-[var(--xd-ink)]',
              )}
            >
              {item.label}
            </WorkspaceLink>
          ))}
        </div>

        <ModelPicker
          models={models}
          selectedModelId={modelId}
          onSelectModel={setModel}
          favoriteModelIds={favoriteModelIds}
          onFavoriteModelIdsChange={onFavoriteModelIdsChange}
          onOpenProviders={onOpenProviders}
          size="xs"
          side="bottom"
          align="end"
          placeholder="No model"
          disabled={blocked}
        />
      </header>

      <div
        data-component="evergreen-ai-references"
        className="flex flex-wrap items-center gap-1 border-b border-[var(--xd-border)] bg-[var(--xd-canvas)]/60 px-2.5 py-1.5 text-[10.5px]"
      >
        <span className="text-[var(--xd-ink-muted)]">Always referenced:</span>
        {evergreenRefs.map((ref) => (
          <WorkspaceLink
            key={ref.slug}
            href={evergreenHrefs?.[ref.slug] ?? `/d/${ref.slug}`}
            title={`${ref.title} (${ref.ruleCount} rules active)`}
            onNavigate={
              onOpenEvergreenDoc
                ? () => onOpenEvergreenDoc(ref.slug)
                : undefined
            }
            className="xd-mono inline-flex items-center gap-1 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-1.5 py-0.5 text-[10px] text-[var(--xd-ink-secondary)] transition-colors hover:border-[var(--xd-accent-border)] hover:text-[var(--xd-ink)]"
          >
            <span className="size-1.5 rounded-full bg-[var(--xd-commit)]" />
            <span>{ref.fileName}</span>
          </WorkspaceLink>
        ))}
      </div>

      {hasContext && (
        <div className="flex flex-wrap gap-1 border-b border-[var(--xd-border)] px-2.5 py-1.5">
          {visibleElements.map((element) => (
            <span
              key={element.id}
              className="inline-flex items-center gap-1 rounded bg-[var(--xd-accent-soft)] px-1.5 py-0.5 text-[10.5px] text-[var(--xd-accent)]"
            >
              <span className="xd-mono">#{element.id}</span>
              <button
                type="button"
                aria-label={`Remove #${element.id}`}
                onClick={() => {
                  if (onRemoveElement) onRemoveElement(element.id)
                  else setHiddenElements((prev) => [...prev, element.id])
                }}
                className="opacity-75 hover:opacity-100"
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))}
          {visibleSketches.map((sketch) => (
            <span
              key={sketch.id}
              className="inline-flex items-center gap-1 rounded bg-[var(--xd-sketch-soft)] px-1.5 py-0.5 text-[10.5px] text-[var(--xd-sketch)]"
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: sketch.color }}
                aria-hidden
              />
              <span>{sketch.kind}</span>
              <button
                type="button"
                aria-label={`Remove ${sketch.kind} sketch`}
                onClick={() => {
                  if (onRemoveSketch) onRemoveSketch(sketch.id)
                  else setHiddenSketches((prev) => [...prev, sketch.id])
                }}
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {blocked && (
        <p className="flex items-center gap-1.5 border-b border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2.5 py-1.5 text-[11.5px] text-[var(--xd-ink-secondary)]">
          <Lock className="size-3 shrink-0" />
          <span className="truncate">{spec.title} — AI locked</span>
        </p>
      )}

      {!blocked &&
        (hasConnectedProvider ?? antigravityConnected) === false &&
        onOpenProviders && (
          <div className="flex items-center justify-between gap-2 border-b border-[var(--xd-border)] bg-[var(--xd-accent-soft)]/50 px-2.5 py-1.5 text-[11px]">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[var(--xd-ink-secondary)]">
              <ShieldCheck className="size-3.5 shrink-0 text-[var(--xd-accent)]" />
              <span className="truncate">
                Connect Antigravity or OpenCode Go
              </span>
            </span>
            <WorkspaceLink
              href="/settings/models"
              onNavigate={onOpenProviders}
              className="shrink-0 rounded bg-[var(--xd-accent)] px-2 py-0.5 text-[10.5px] font-medium text-white hover:bg-[var(--xd-accent-hover)]"
            >
              Connect
            </WorkspaceLink>
          </div>
        )}

      <div className="min-h-0 flex-1 overflow-y-auto" role="tabpanel">
        {tab === 'chat' && (
          <ol className="space-y-3 px-2.5 py-2.5">
            {thread.length === 0 && !isThinking && (
              <li className="py-6 text-center text-[12px] text-[var(--xd-ink-muted)]">
                Select a node or ask for a change.
              </li>
            )}
            {thread.map((message) => (
              <li key={message.id}>
                <MessageBubble message={message} />
                {message.stages && message.stages.length > 0 && (
                  <StageList stages={message.stages} />
                )}
                {message.proposal && (
                  <OpReviewCard
                    proposal={message.proposal}
                    canKeep={canKeep}
                    canDiscard={canDiscard}
                    proposeOnly={spec.ai === 'propose'}
                    onKeep={() => setStatus(message.proposal!.id, 'committed')}
                    onDiscard={() =>
                      setStatus(message.proposal!.id, 'discarded')
                    }
                  />
                )}
              </li>
            ))}
            {isThinking && (
              <li>
                <div className="flex items-center gap-2 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2.5 py-2 text-[11.5px] text-[var(--xd-ink-secondary)]">
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--xd-accent)]" />
                  <span className="truncate">
                    {thinkingLabel || 'Running AI collaborator…'}
                  </span>
                </div>
              </li>
            )}
          </ol>
        )}
        {tab === 'ops' && (
          <div className="space-y-2.5 px-2.5 py-2.5">
            {proposalList.length === 0 && (
              <p className="py-6 text-center text-[12px] text-[var(--xd-ink-muted)]">
                No proposals yet.
              </p>
            )}
            {proposalList.map((proposal) => (
              <OpReviewCard
                key={proposal.id}
                proposal={proposal}
                canKeep={canKeep}
                canDiscard={canDiscard}
                proposeOnly={spec.ai === 'propose'}
                onKeep={() => setStatus(proposal.id, 'committed')}
                onDiscard={() => setStatus(proposal.id, 'discarded')}
              />
            ))}
          </div>
        )}
        {tab === 'history' && (
          <ol className="space-y-1.5 px-2.5 py-2.5">
            {history.length === 0 && (
              <li className="py-6 text-center text-[12px] text-[var(--xd-ink-muted)]">
                No checkpoints yet.
              </li>
            )}
            {history.map((checkpoint) => (
              <li
                key={checkpoint.sha}
                className="rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2.5 py-2"
              >
                <p className="text-[12px] font-medium">{checkpoint.label}</p>
                <p className="xd-mono mt-0.5 text-[10.5px] text-[var(--xd-ink-muted)]">
                  {checkpoint.sha.slice(0, 7)} · {checkpoint.opsCount} ops ·{' '}
                  {formatWhen(checkpoint.timestamp)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

      {tab === 'chat' && (
        <div className="border-t border-[var(--xd-border)] bg-[var(--xd-canvas)] p-2.5">
          {!hasUserMessages && (
            <div className="mb-2 flex flex-wrap gap-1">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={blocked}
                  onClick={() => sendText(prompt)}
                  className="rounded border border-[var(--xd-border)] px-2 py-0.5 text-left text-[11px] text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] disabled:opacity-40"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
          <form
            className="flex items-end gap-1.5"
            onSubmit={(event) => {
              event.preventDefault()
              sendText(draft)
            }}
          >
            <label className="sr-only" htmlFor="collaborator-draft">
              Message the collaborator
            </label>
            <textarea
              id="collaborator-draft"
              rows={2}
              disabled={blocked}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  sendText(draft)
                }
              }}
              placeholder={blocked ? 'AI locked' : 'Ask for a change...'}
              className="max-h-24 min-h-12 flex-1 resize-none rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-2 py-1.5 text-[12px] outline-none focus-visible:border-[var(--xd-accent)] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={blocked || isThinking || draft.trim().length === 0}
              className="inline-flex h-7 items-center rounded bg-[var(--xd-accent)] px-2.5 text-[11.5px] font-medium text-white disabled:opacity-35"
            >
              {isThinking
                ? 'Working…'
                : spec.ai === 'propose'
                  ? 'Propose'
                  : 'Send'}
            </button>
          </form>
        </div>
      )}
    </aside>
  )
}

function MessageBubble({ message }: { message: AIMessage }) {
  const align = message.role === 'user'
  return (
    <div className={cn('max-w-[95%]', align && 'ml-auto')}>
      <div
        className={cn(
          'rounded px-2.5 py-1.5 text-[12px] leading-snug',
          message.role === 'user' &&
            'bg-[var(--xd-accent-soft)] text-[var(--xd-ink)]',
          message.role === 'assistant' &&
            'border border-[var(--xd-border)] bg-[var(--xd-canvas)] text-[var(--xd-ink-secondary)]',
          message.role === 'system' &&
            'border border-dashed border-[var(--xd-border)] text-[var(--xd-ink-muted)]',
        )}
      >
        {message.runtimeSource === 'antigravity-acp' && (
          <div className="xd-mono mb-1 flex items-center gap-1 text-[9.5px] text-[var(--xd-commit)]">
            <ShieldCheck className="size-2.5 shrink-0" />
            <span>
              Antigravity ACP
              {message.modelId
                ? ` · ${message.modelId.replace(/^antigravity\//, '')}`
                : ''}
            </span>
          </div>
        )}
        {message.runtimeSource === 'opencode-acp' && (
          <div className="xd-mono mb-1 flex items-center gap-1 text-[9.5px] text-[var(--xd-commit)]">
            <ShieldCheck className="size-2.5 shrink-0" />
            <span>
              OpenCode ACP
              {message.modelId
                ? ` · ${message.modelId.replace(/^opencode-go\/(?:opencode\/)?/, '')}`
                : ''}
            </span>
          </div>
        )}
        {message.runtimeSource === 'opencode-go' && (
          <div className="xd-mono mb-1 flex items-center gap-1 text-[9.5px] text-[var(--xd-commit)]">
            <ShieldCheck className="size-2.5 shrink-0" />
            <span>
              OpenCode Go
              {message.modelId
                ? ` · ${message.modelId.replace(/^opencode-go\//, '')}`
                : ''}
            </span>
          </div>
        )}
        <div>{message.content}</div>
      </div>
    </div>
  )
}

function StageList({ stages }: { stages: NonNullable<AIMessage['stages']> }) {
  return (
    <ol className="mt-1.5 space-y-1 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2.5 py-1.5">
      {stages.map((stage) => (
        <li
          key={stage.stageNumber}
          className="flex items-center gap-2 text-[11.5px]"
        >
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              stage.completed
                ? 'bg-[var(--xd-commit)]'
                : 'bg-[var(--xd-sketch)]',
            )}
            aria-hidden
          />
          <span
            className={cn(
              'truncate',
              stage.completed
                ? 'text-[var(--xd-ink)]'
                : 'text-[var(--xd-ink-secondary)]',
            )}
          >
            {stage.note}
          </span>
        </li>
      ))}
    </ol>
  )
}

const OP_TONE: Record<MarbleOp['type'], string> = {
  setText: 'text-[var(--xd-accent)]',
  setInner: 'text-[var(--xd-accent)]',
  setAttr: 'text-[var(--xd-ink-secondary)]',
  insert: 'text-[var(--xd-commit)]',
  move: 'text-[var(--xd-sketch)]',
  remove: 'text-[var(--xd-danger)]',
  assignId: 'text-[var(--xd-ink-muted)]',
}

export function OpReviewCard({
  proposal,
  canKeep,
  canDiscard,
  proposeOnly,
  onKeep,
  onDiscard,
}: {
  proposal: MarbleOpProposal
  canKeep: boolean
  canDiscard: boolean
  proposeOnly: boolean
  onKeep: () => void
  onDiscard: () => void
}) {
  const settled =
    proposal.status === 'committed' || proposal.status === 'discarded'
  const evergreenRefs =
    proposal.referencedEvergreenDocs ?? DEFAULT_EVERGREEN_REFS
  return (
    <article className="mt-1.5 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] p-2">
      <header className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium leading-snug">{proposal.note}</p>
        <span className="xd-mono shrink-0 text-[10px] uppercase text-[var(--xd-ink-muted)]">
          {proposal.status}
        </span>
      </header>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-[var(--xd-ink-muted)]">
        <span>Checked against</span>
        {evergreenRefs.map((ref) => (
          <span
            key={ref.slug}
            className="xd-mono rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-1 py-0.2 text-[var(--xd-ink-secondary)]"
          >
            {ref.fileName}
          </span>
        ))}
      </div>
      <ul className="mt-1.5 space-y-1">
        {proposal.ops.map((op, index) => (
          <li
            key={`${proposal.id}-${index}`}
            className="rounded border border-[var(--xd-border)] bg-[var(--xd-rail)]"
          >
            <details>
              <summary className="cursor-pointer list-none px-2 py-1 text-[11.5px]">
                <span className={cn('xd-mono font-medium', OP_TONE[op.type])}>
                  {op.type}
                </span>
                <span className="xd-mono ml-1.5 text-[var(--xd-ink-secondary)]">
                  {op.id ? `#${op.id}` : op.parentId ? `→ #${op.parentId}` : ''}
                </span>
              </summary>
              <pre className="xd-mono overflow-x-auto border-t border-[var(--xd-border)] px-2 py-1 text-[10px] leading-relaxed whitespace-pre-wrap text-[var(--xd-ink-secondary)]">
                {opLines(op).join('\n')}
              </pre>
            </details>
          </li>
        ))}
      </ul>
      {!settled && (
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            disabled={!canKeep || proposal.status === 'thinking'}
            title={
              proposeOnly
                ? 'Propose-only role cannot commit ops.'
                : 'Commit ops to file'
            }
            onClick={onKeep}
            className="inline-flex h-6 items-center rounded bg-[var(--xd-commit)] px-2 text-[11px] font-medium text-white disabled:opacity-35"
          >
            Keep
          </button>
          <button
            type="button"
            disabled={!canDiscard || proposal.status === 'thinking'}
            onClick={onDiscard}
            className="inline-flex h-6 items-center rounded border border-[var(--xd-border)] px-2 text-[11px] font-medium text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)] disabled:opacity-35"
          >
            Discard
          </button>
        </div>
      )}
    </article>
  )
}
