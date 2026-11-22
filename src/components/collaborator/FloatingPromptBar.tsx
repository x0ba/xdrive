import { useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import {
  ChevronDown,
  GitFork,
  Lock,
  PenLine,
  Send,
  Sparkles,
  Wrench,
} from 'lucide-react'
import type {
  AIProviderId,
  SelectedMarbleElement,
  SharePermissionLevel,
  SketchAnnotation,
} from '#/lib/types'
import {
  aiIsBlocked,
  permissionByLevel,
} from '#/components/collaborator/ShareModal'
import { cn } from '#/lib/utils'

export type MarbleIntentKind =
  'instruct' | 'dtrt' | 'factory' | 'fork-alt' | 'polish' | 'scale'

export interface MarbleIntentRequest {
  id: string
  kind: MarbleIntentKind
  instruction: string
  targetIds: string[]
  modelId: string
  providerId: AIProviderId
  gesture?: { x: number; y: number }
  sketches?: SketchAnnotation[]
}

export interface ConnectedModelOption {
  id: string
  providerId: AIProviderId
  group: string
  label: string
  modelName: string
  rateLimited?: boolean
  supportsVisionSketch?: boolean
}

export const PROMPT_MODELS: ConnectedModelOption[] = [
  {
    id: 'opencode-go/gemini-4-argon',
    providerId: 'opencode-go',
    group: 'OpenCode Go',
    label: 'OpenCode Go · Gemini 4 Argon',
    modelName: 'Gemini 4 Argon',
    supportsVisionSketch: true,
  },
  {
    id: 'opencode-go/grok-4.7',
    providerId: 'opencode-go',
    group: 'OpenCode Go',
    label: 'Grok · Grok 4.7',
    modelName: 'Grok 4.7',
    supportsVisionSketch: true,
  },
  {
    id: 'opencode-go/claude-haiku-5-5',
    providerId: 'opencode-go',
    group: 'OpenCode Go',
    label: 'OpenCode Go · Claude Haiku 5.5',
    modelName: 'Claude Haiku 5.5',
  },
  {
    id: 'opencode-go/deepseek-v4.1-flash',
    providerId: 'opencode-go',
    group: 'OpenCode Go',
    label: 'OpenCode Go · DeepSeek V4.1 Flash',
    modelName: 'DeepSeek V4.1 Flash',
  },
  {
    id: 'xai/grok-4.7',
    providerId: 'xai',
    group: 'SpaceX AI',
    label: 'SpaceX AI · Grok 4.7',
    modelName: 'Grok 4.7',
    supportsVisionSketch: true,
  },
  {
    id: 'claude-sonnet-5-5',
    providerId: 'claude',
    group: 'Claude',
    label: 'Claude · Sonnet 5.5',
    modelName: 'Sonnet 5.5',
    supportsVisionSketch: true,
  },
  {
    id: 'gpt-5.4',
    providerId: 'openai',
    group: 'OpenAI',
    label: 'OpenAI · GPT-5.4',
    modelName: 'GPT-5.4',
    supportsVisionSketch: true,
  },
]

export interface FloatingPromptBarHandle {
  focusPrompt: () => void
}

export interface FloatingPromptBarProps {
  selectedElements?: SelectedMarbleElement[]
  sketches?: SketchAnnotation[]
  models?: ConnectedModelOption[]
  modelId?: string
  onModelChange?: (modelId: string) => void
  permission?: SharePermissionLevel
  prompt?: string
  onPromptChange?: (value: string) => void
  onIntent?: (request: MarbleIntentRequest) => void
  handleRef?: Ref<FloatingPromptBarHandle>
  className?: string
}

export function resolveModel(
  models: ConnectedModelOption[],
  modelId?: string,
): ConnectedModelOption | null {
  const match = models.find((item) => item.id === modelId)
  if (match) return match
  if (models.length === 0) return null
  return models[0]
}

let intentSeq = 0

function nextIntentId(): string {
  intentSeq += 1
  return `intent-${intentSeq.toString(36)}-${Date.now().toString(36)}`
}

export function ModelSelect({
  models,
  modelId,
  onChange,
  disabled,
}: {
  models: ConnectedModelOption[]
  modelId: string
  onChange: (modelId: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const current = resolveModel(models, modelId)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!current) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex h-7 items-center rounded-md border border-[var(--xd-border)] px-2 text-[11.5px] text-[var(--xd-ink-muted)]"
      >
        No model connected
      </button>
    )
  }

  const groups: Array<{ name: string; models: ConnectedModelOption[] }> = []
  for (const model of models) {
    const existing = groups.find((group) => group.name === model.group)
    if (existing) existing.models.push(model)
    else groups.push({ name: model.group, models: [model] })
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-7 max-w-[240px] items-center gap-1 rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 text-[11.5px] font-medium text-[var(--xd-ink)] disabled:opacity-45"
      >
        <span className="truncate">{current.label}</span>
        {current.rateLimited && (
          <span className="rounded bg-[var(--xd-sketch-soft)] px-1 text-[10px] text-[var(--xd-sketch)]">
            capped
          </span>
        )}
        <ChevronDown className="size-3.5 shrink-0 text-[var(--xd-ink-muted)]" />
      </button>
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Connected models"
          className="absolute right-0 z-30 mt-1 max-h-72 w-[280px] overflow-y-auto rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] p-1 shadow-lg"
        >
          {groups.map((group) => (
            <div key={group.name} className="mb-1">
              <p className="px-2 py-1 text-[10.5px] font-semibold tracking-wide text-[var(--xd-ink-muted)] uppercase">
                {group.name}
              </p>
              {group.models.map((model) => {
                const selected = model.id === current.id
                return (
                  <button
                    key={model.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(model.id)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[12px]',
                      selected
                        ? 'bg-[var(--xd-accent-soft)] text-[var(--xd-ink)]'
                        : 'hover:bg-[var(--xd-surface-hover)]',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {model.label}
                      </span>
                      <span className="xd-mono block truncate text-[10.5px] text-[var(--xd-ink-muted)]">
                        {model.id}
                      </span>
                    </span>
                    {model.supportsVisionSketch && (
                      <span className="shrink-0 text-[10px] text-[var(--xd-sketch)]">
                        sketch
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function FloatingPromptBar({
  selectedElements = [],
  sketches = [],
  models = PROMPT_MODELS,
  modelId: modelIdProp,
  onModelChange,
  permission = 'edit_with_ai_shared',
  prompt: promptProp,
  onPromptChange,
  onIntent,
  handleRef,
  className,
}: FloatingPromptBarProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [internalPrompt, setInternalPrompt] = useState('')
  const [internalModel, setInternalModel] = useState(
    () => modelIdProp ?? resolveModel(models)?.id ?? 'xai/grok-4.7',
  )
  const prompt = promptProp ?? internalPrompt
  const modelId = modelIdProp ?? internalModel
  const spec = permissionByLevel(permission)
  const blocked = aiIsBlocked(permission)
  const model = resolveModel(models, modelId)
  const inputId = useId()

  useImperativeHandle(
    handleRef ?? null,
    () => ({ focusPrompt: () => inputRef.current?.focus() }),
    [],
  )

  function setPrompt(value: string) {
    if (promptProp === undefined) setInternalPrompt(value)
    onPromptChange?.(value)
  }

  function setModel(next: string) {
    if (modelIdProp === undefined) setInternalModel(next)
    onModelChange?.(next)
  }

  function emit(kind: MarbleIntentKind, instruction: string) {
    if (blocked || model === null || !instruction.trim()) return
    onIntent?.({
      id: nextIntentId(),
      kind,
      instruction: instruction.trim(),
      targetIds: selectedElements.map((element) => element.id),
      modelId: model.id,
      providerId: model.providerId,
      sketches: sketches.length ? sketches : undefined,
    })
    if (kind === 'instruct') setPrompt('')
  }

  const countLabel =
    selectedElements.length === 0
      ? 'No nodes targeted'
      : `${selectedElements.length} node${selectedElements.length === 1 ? '' : 's'} selected: ${selectedElements
          .map((element) => `#${element.id}`)
          .join(', ')}`

  const needsTargets = selectedElements.length === 0
  const canInstruct =
    !blocked &&
    prompt.trim().length > 0 &&
    (selectedElements.length > 0 || sketches.length > 0)

  const quickActions: Array<{
    kind: MarbleIntentKind
    label: string
    icon: ReactNode
    base: string
  }> = [
    {
      kind: 'dtrt',
      label: 'Do The Right Thing',
      icon: <Sparkles className="size-3.5" />,
      base: 'Do The Right Thing',
    },
    {
      kind: 'factory',
      label: 'Make a Tool',
      icon: <Wrench className="size-3.5" />,
      base: 'Make a deterministic in-file tool from the selection',
    },
    {
      kind: 'fork-alt',
      label: 'Fork <marble-alt>',
      icon: <GitFork className="size-3.5" />,
      base: 'Fork <marble-alt> candidates so the selection can switch versions',
    },
    {
      kind: 'polish',
      label: 'Polish LaTeX / Prose',
      icon: <PenLine className="size-3.5" />,
      base: 'Polish LaTeX and prose without changing structure',
    },
  ]

  return (
    <section
      data-component="floating-prompt-bar"
      data-overlay-chrome=""
      aria-label="AI prompt for the selection"
      className={cn(
        'xd-glass-bar w-[min(100%,540px)] rounded-lg border border-[var(--xd-border-strong)] text-[var(--xd-ink)] shadow-[0_16px_40px_rgba(0,0,0,0.28)]',
        className,
      )}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2 border-b border-[var(--xd-border)] px-3 py-2">
        <div className="min-w-0">
          <p className="text-[12.5px] leading-snug font-medium">{countLabel}</p>
          {sketches.length > 0 && (
            <p className="mt-0.5 text-[11.5px] text-[var(--xd-sketch)]">
              {sketches.length} sketch annotation
              {sketches.length === 1 ? '' : 's'}
              {sketches.some((sketch) => sketch.coveredNodeIds.length > 0)
                ? ` · ${[
                    ...new Set(
                      sketches.flatMap((sketch) => sketch.coveredNodeIds),
                    ),
                  ]
                    .map((id) => `#${id}`)
                    .join(', ')}`
                : ''}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {selectedElements.map((element) => (
              <span
                key={element.id}
                className="xd-mono inline-flex items-center rounded border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] px-1.5 py-0.5 text-[10.5px] text-[var(--xd-accent)]"
              >
                #{element.id}
              </span>
            ))}
            {sketches.map((sketch) => (
              <span
                key={sketch.id}
                className="inline-flex items-center gap-1 rounded border border-[var(--xd-sketch)]/40 bg-[var(--xd-sketch-soft)] px-1.5 py-0.5 text-[10.5px] text-[var(--xd-sketch)]"
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: sketch.color }}
                  aria-hidden
                />
                {sketch.kind}
                {sketch.label ? ` · ${sketch.label}` : ''}
              </span>
            ))}
          </div>
        </div>
        <ModelSelect
          models={models}
          modelId={modelId}
          onChange={setModel}
          disabled={blocked || models.length === 0}
        />
      </div>

      {spec.blockReason && (
        <p
          className="flex items-start gap-1.5 border-b border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2 text-[12px] leading-snug text-[var(--xd-ink-secondary)]"
          role="status"
        >
          <Lock className="mt-0.5 size-3.5 shrink-0" />
          <span>{spec.blockReason}</span>
        </p>
      )}
      {spec.ai === 'propose' && (
        <p className="border-b border-[var(--xd-border)] px-3 py-1.5 text-[11.5px] text-[var(--xd-sketch)]">
          Annotate & Propose. Sending files a MarbleOpProposal on the review
          queue. It does not write the .mrbl file.
        </p>
      )}

      <form
        className="flex items-end gap-2 px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault()
          emit('instruct', prompt)
        }}
      >
        <label className="sr-only" htmlFor={inputId}>
          Instruction
        </label>
        <textarea
          ref={inputRef}
          id={inputId}
          rows={1}
          disabled={blocked}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              emit('instruct', prompt)
            }
          }}
          placeholder="Ask AI to edit selected nodes, restyle, or wire controls..."
          className="max-h-28 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-[13px] outline-none placeholder:text-[var(--xd-ink-muted)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canInstruct}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--xd-accent)] px-2.5 text-[12px] font-medium text-white hover:bg-[var(--xd-accent-hover)] disabled:opacity-40"
        >
          <Send className="size-3.5" />
          {spec.ai === 'propose' ? 'Propose' : 'Send'}
        </button>
      </form>

      <div className="flex flex-wrap gap-1 px-2.5 pb-2.5">
        {quickActions.map((action) => {
          const disabled = blocked || needsTargets
          const typed = prompt.trim()
          return (
            <button
              key={action.kind}
              type="button"
              disabled={disabled}
              title={
                needsTargets
                  ? 'Select at least one data-marble-id node'
                  : action.base
              }
              onClick={() =>
                emit(
                  action.kind,
                  typed ? `${action.base}. ${typed}` : action.base,
                )
              }
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-2 text-[11.5px] font-medium text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {action.icon}
              {action.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}
