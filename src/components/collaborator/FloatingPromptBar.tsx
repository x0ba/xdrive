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
  | 'instruct'
  | 'dtrt'
  | 'factory'
  | 'fork-alt'
  | 'polish'
  | 'scale'

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
    id: 'antigravity/default',
    providerId: 'antigravity',
    group: 'Google Antigravity',
    label: 'Antigravity · Gemini (Google AI Plan)',
    modelName: 'Gemini (Antigravity)',
    supportsVisionSketch: true,
  },
  {
    id: 'opencode-go/gemini-4-argon',
    providerId: 'opencode-go',
    group: 'OpenCode Go',
    label: 'Gemini 4 Argon',
    modelName: 'Gemini 4 Argon',
    supportsVisionSketch: true,
  },
  {
    id: 'xai/grok-4.7',
    providerId: 'xai',
    group: 'SpaceX AI',
    label: 'Grok 4.7',
    modelName: 'Grok 4.7',
    supportsVisionSketch: true,
  },
  {
    id: 'claude-sonnet-5-5',
    providerId: 'claude',
    group: 'Claude',
    label: 'Claude Sonnet 5.5',
    modelName: 'Sonnet 5.5',
    supportsVisionSketch: true,
  },
  {
    id: 'gpt-5.4',
    providerId: 'openai',
    group: 'OpenAI',
    label: 'GPT-5.4',
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
      <span className="inline-flex h-6 items-center px-1.5 text-[11px] text-[var(--xd-ink-muted)]">
        No model
      </span>
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
        className="inline-flex h-6 max-w-[180px] items-center gap-1 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 text-[11px] font-medium text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)] disabled:opacity-45"
      >
        <span className="truncate">{current.modelName}</span>
        <ChevronDown className="size-3 shrink-0 text-[var(--xd-ink-muted)]" />
      </button>
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Connected models"
          className="absolute right-0 z-30 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] p-1 shadow-lg"
        >
          {groups.map((group) => (
            <div key={group.name} className="mb-1 last:mb-0">
              <p className="px-2 py-1 text-[10px] font-medium text-[var(--xd-ink-muted)]">
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
                      'flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[11.5px]',
                      selected
                        ? 'bg-[var(--xd-accent-soft)] font-medium text-[var(--xd-ink)]'
                        : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                    )}
                  >
                    <span className="truncate">{model.modelName}</span>
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
      label: 'Wire',
      icon: <Sparkles className="size-3" />,
      base: 'Do The Right Thing',
    },
    {
      kind: 'factory',
      label: 'Tool',
      icon: <Wrench className="size-3" />,
      base: 'Make a deterministic in-file tool from the selection',
    },
    {
      kind: 'fork-alt',
      label: 'Fork alt',
      icon: <GitFork className="size-3" />,
      base: 'Fork <marble-alt> candidates so the selection can switch versions',
    },
    {
      kind: 'polish',
      label: 'Polish',
      icon: <PenLine className="size-3" />,
      base: 'Polish LaTeX and prose without changing structure',
    },
  ]

  return (
    <section
      data-component="floating-prompt-bar"
      data-overlay-chrome=""
      aria-label="AI prompt for the selection"
      className={cn(
        'xd-glass-bar w-[min(100%,480px)] rounded-md border border-[var(--xd-border-strong)] text-[var(--xd-ink)] shadow-lg',
        className,
      )}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--xd-border)] px-2.5 py-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {selectedElements.length === 0 && sketches.length === 0 ? (
            <span className="text-[11px] text-[var(--xd-ink-muted)]">
              Select a node
            </span>
          ) : (
            <>
              {selectedElements.map((element) => (
                <span
                  key={element.id}
                  className="xd-mono inline-flex items-center rounded bg-[var(--xd-accent-soft)] px-1.5 py-0.5 text-[10.5px] text-[var(--xd-accent)]"
                >
                  #{element.id}
                </span>
              ))}
              {sketches.map((sketch) => (
                <span
                  key={sketch.id}
                  className="inline-flex items-center gap-1 rounded bg-[var(--xd-sketch-soft)] px-1.5 py-0.5 text-[10.5px] text-[var(--xd-sketch)]"
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: sketch.color }}
                    aria-hidden
                  />
                  {sketch.label || sketch.kind}
                </span>
              ))}
            </>
          )}
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
          className="flex items-center gap-1.5 border-b border-[var(--xd-border)] bg-[var(--xd-rail)] px-2.5 py-1.5 text-[11.5px] text-[var(--xd-ink-secondary)]"
          role="status"
        >
          <Lock className="size-3 shrink-0" />
          <span className="truncate">{spec.title} — AI locked</span>
        </p>
      )}

      <form
        className="flex items-center gap-1.5 px-2.5 py-1.5"
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
          placeholder="Edit selection..."
          className="max-h-24 min-h-7 flex-1 resize-none bg-transparent py-1 text-[12.5px] outline-none placeholder:text-[var(--xd-ink-muted)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canInstruct}
          className="inline-flex h-7 items-center gap-1 rounded bg-[var(--xd-accent)] px-2 text-[11.5px] font-medium text-white hover:bg-[var(--xd-accent-hover)] disabled:opacity-35"
        >
          <Send className="size-3" />
          <span>{spec.ai === 'propose' ? 'Propose' : 'Send'}</span>
        </button>
      </form>

      <div className="flex flex-wrap gap-1 border-t border-[var(--xd-border)] px-2 py-1.5">
        {quickActions.map((action) => {
          const disabled = blocked || needsTargets
          const typed = prompt.trim()
          return (
            <button
              key={action.kind}
              type="button"
              disabled={disabled}
              title={action.base}
              onClick={() =>
                emit(
                  action.kind,
                  typed ? `${action.base}. ${typed}` : action.base,
                )
              }
              className="inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
