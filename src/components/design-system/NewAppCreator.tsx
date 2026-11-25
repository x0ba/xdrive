import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowUp,
  Check,
  ChevronDown,
  Folder,
  FolderPlus,
  LayoutTemplate,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import type { ReasoningEffort } from '#/lib/ai/drive-chat-types'
import { reasoningEffortForModel } from '#/lib/ai/drive-chat-client'
import type {
  AIModelSpec,
  DriveFolder,
  MarbleAppCategory,
  MarbleDocumentFile,
} from '#/lib/types'
import { DriveDocumentThumbnail, getFolderPathLabel } from './DriveExplorer'
import { DEFAULT_COMPOSER_MODELS } from './FilterAndMetrics'
import { getCategoryIcon, getCategoryLabel } from './NavigationShell'
import { WorkspaceLink } from '#/components/routing/WorkspaceLink'
import { ModelPicker } from '#/components/model-picker'
import type { ModelPickerInputOption } from '#/components/model-picker'

export type NewAppMode = 'agent' | 'templates'

export type NewAppModelOption = Pick<
  AIModelSpec,
  'id' | 'name' | 'providerId' | 'badge' | 'role'
>

const TEMPLATE_CATEGORIES: Array<{
  value: MarbleAppCategory | 'all'
  label: string
}> = [
  { value: 'all', label: 'All' },
  { value: 'latex', label: 'LaTeX' },
  { value: 'notebook', label: 'Notebooks' },
  { value: 'document', label: 'Docs' },
  { value: 'slides', label: 'Slides' },
  { value: 'matrix', label: 'Matrices' },
  { value: 'sandbox', label: 'Sandbox' },
]

/* ============================================================================
   1. NewAppButton — Top-Left Google Drive-Style "+ New" Button & Menu
   ============================================================================ */

export interface NewAppButtonProps {
  templates?: MarbleDocumentFile[]
  aiAgentHref?: string
  templatesHref?: string
  onOpenAIAgent?: () => void
  onOpenTemplates?: () => void
  onQuickCreateTemplate?: (template: MarbleDocumentFile) => void
  onCreateFolder?: () => void
  defaultOpen?: boolean
}

export function NewAppButton({
  templates = [],
  aiAgentHref = '?modal=new-agent',
  templatesHref = '?modal=new-template',
  onOpenAIAgent,
  onOpenTemplates,
  onQuickCreateTemplate,
  onCreateFolder,
  defaultOpen = false,
}: NewAppButtonProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [menuPos, setMenuPos] = useState<{
    top: number
    left: number
    maxHeight: number
  } | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const updatePosition = useCallback(() => {
    const trigger = buttonRef.current
    if (!trigger || typeof window === 'undefined') return
    const rect = trigger.getBoundingClientRect()
    const menuWidth = 288
    const gap = 6
    const margin = 8
    const left = Math.max(
      margin,
      Math.min(rect.left, window.innerWidth - menuWidth - margin),
    )
    const availableBelow = window.innerHeight - rect.bottom - gap - margin
    const availableAbove = rect.top - gap - margin
    const openAbove = availableBelow < 260 && availableAbove > availableBelow
    const top = openAbove
      ? Math.max(margin, rect.top - gap - Math.min(440, availableAbove))
      : rect.bottom + gap
    const maxHeight = Math.max(180, openAbove ? availableAbove : availableBelow)
    setMenuPos({ top, left, maxHeight })
  }, [])

  const useIsomorphicLayoutEffect =
    typeof window !== 'undefined' ? useLayoutEffect : useEffect

  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setMenuPos(null)
      return
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      const insideTrigger = Boolean(rootRef.current?.contains(target))
      const insideMenu = Boolean(menuRef.current?.contains(target))
      if (!insideTrigger && !insideMenu) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const quickTemplates = templates.slice(0, 6)
  const portalTarget =
    typeof document !== 'undefined'
      ? (rootRef.current?.closest('[data-component="xdrive-workspace"]') ??
        document.body)
      : null

  const menuContent =
    open && menuPos ? (
      <div
        ref={menuRef}
        role="menu"
        aria-label="Create new app or folder"
        style={{
          top: menuPos.top,
          left: menuPos.left,
          maxHeight: menuPos.maxHeight,
        }}
        className="fixed z-60 flex w-72 flex-col overflow-y-auto rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] py-1.5 text-[var(--xd-ink)] shadow-xl"
      >
        <WorkspaceLink
          href={aiAgentHref}
          role="menuitem"
          onNavigate={() => {
            setOpen(false)
            onOpenAIAgent?.()
          }}
          className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--xd-surface-hover)]"
        >
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--xd-accent-border)] bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-medium text-[var(--xd-ink)]">
              Build with AI agent
            </span>
            <span className="block text-[11px] leading-snug text-[var(--xd-ink-muted)]">
              Describe a new app or document
            </span>
          </span>
        </WorkspaceLink>

        <WorkspaceLink
          href={templatesHref}
          role="menuitem"
          onNavigate={() => {
            setOpen(false)
            onOpenTemplates?.()
          }}
          className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--xd-surface-hover)]"
        >
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--xd-border-strong)] bg-[var(--xd-rail)] text-[var(--xd-ink-secondary)]">
            <LayoutTemplate className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-medium text-[var(--xd-ink)]">
              New from template
            </span>
            <span className="block text-[11px] leading-snug text-[var(--xd-ink-muted)]">
              Start from your saved templates
            </span>
          </span>
        </WorkspaceLink>

        {quickTemplates.length > 0 && (
          <>
            <div className="my-1.5 border-t border-[var(--xd-border)]" />
            <div className="px-3 py-1 text-[11px] font-medium text-[var(--xd-ink-muted)]">
              Templates
            </div>
            <div className="max-h-56 overflow-y-auto">
              {quickTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    if (onQuickCreateTemplate) {
                      onQuickCreateTemplate(tpl)
                    } else {
                      onOpenTemplates?.()
                    }
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
                >
                  <span className="shrink-0 text-[var(--xd-accent)]">
                    {getCategoryIcon(tpl.category, 'h-3.5 w-3.5')}
                  </span>
                  <span className="truncate">{tpl.title}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {onCreateFolder && (
          <>
            <div className="my-1.5 border-t border-[var(--xd-border)]" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onCreateFolder()
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
            >
              <FolderPlus className="h-3.5 w-3.5 shrink-0 text-[var(--xd-ink-muted)]" />
              <span>New folder</span>
            </button>
          </>
        )}
      </div>
    ) : null

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md bg-[var(--xd-accent)] px-3 text-[13px] font-medium text-white transition-colors hover:bg-[var(--xd-accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--xd-accent)]"
      >
        <span className="inline-flex items-center gap-2">
          <Plus className="h-4 w-4 stroke-[2.25]" />
          <span>New</span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 opacity-80 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {menuContent && portalTarget
        ? createPortal(menuContent, portalTarget)
        : null}
    </div>
  )
}

/* ============================================================================
   2. NewAppModal — Unified AI Agent & Template Creation Dialog
   ============================================================================ */

export interface NewAppModalProps {
  open: boolean
  initialMode?: NewAppMode
  onModeChange?: (mode: NewAppMode) => void
  modeHrefs?: Partial<Record<NewAppMode, string>>
  templates: MarbleDocumentFile[]
  folders?: DriveFolder[]
  initialFolderId?: string | null
  models?: ModelPickerInputOption[]
  selectedModelId?: string
  onSelectModel?: (modelId: string) => void
  reasoningEffort?: ReasoningEffort
  onSelectReasoningEffort?: (effort: ReasoningEffort) => void
  favoriteModelIds?: string[]
  onFavoriteModelIdsChange?: (ids: string[]) => void
  onOpenProviders?: () => void
  onClose: () => void
  onBuildWithAgent: (input: {
    prompt: string
    modelId: string
    folderId: string | null
    reasoningEffort: ReasoningEffort
  }) => void
  onCreateFromTemplate: (input: {
    template: MarbleDocumentFile
    title: string
    folderId: string | null
  }) => void
  onPreviewTemplate?: (template: MarbleDocumentFile) => void
}

export function NewAppModal({
  open,
  initialMode = 'agent',
  onModeChange,
  modeHrefs,
  templates,
  folders = [],
  initialFolderId = null,
  models = DEFAULT_COMPOSER_MODELS,
  selectedModelId,
  onSelectModel,
  reasoningEffort: reasoningEffortProp,
  onSelectReasoningEffort,
  favoriteModelIds,
  onFavoriteModelIdsChange,
  onOpenProviders,
  onClose,
  onBuildWithAgent,
  onCreateFromTemplate,
  onPreviewTemplate,
}: NewAppModalProps) {
  const [mode, setMode] = useState<NewAppMode>(initialMode)
  const [prompt, setPrompt] = useState('')
  const [currentModelId, setCurrentModelId] = useState(
    selectedModelId ?? models.at(0)?.id ?? 'grok-4.7',
  )
  const [internalEffort, setInternalEffort] = useState<ReasoningEffort>(
    () => reasoningEffortProp ?? 'high',
  )
  const reasoningEffort = reasoningEffortProp ?? internalEffort
  const [folderId, setFolderId] = useState<string | null>(initialFolderId)
  const [templateSearch, setTemplateSearch] = useState('')
  const [templateCategory, setTemplateCategory] = useState<
    MarbleAppCategory | 'all'
  >('all')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    templates.at(0)?.id ?? '',
  )
  const [customTitle, setCustomTitle] = useState('')

  useEffect(() => {
    if (!open) return
    setMode(initialMode)
    setFolderId(initialFolderId)
    if (templates.length > 0) {
      const first = templates[0]
      setSelectedTemplateId(first.id)
      setCustomTitle(`${first.title} copy`)
    }
  }, [open, initialMode, initialFolderId, templates])

  useEffect(() => {
    if (!open || !selectedModelId) return
    setCurrentModelId(selectedModelId)
  }, [open, selectedModelId])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !document.querySelector('[data-xdrive-model-picker-popup]')
      ) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const filteredTemplates = useMemo(() => {
    const needle = templateSearch.trim().toLowerCase()
    return templates
      .filter(
        (tpl) =>
          templateCategory === 'all' || tpl.category === templateCategory,
      )
      .filter((tpl) => {
        if (!needle) return true
        return `${tpl.title} ${tpl.description} ${tpl.fileName} ${tpl.tags.join(' ')}`
          .toLowerCase()
          .includes(needle)
      })
  }, [templates, templateCategory, templateSearch])

  const selectedTemplate: MarbleDocumentFile | null =
    templates.find((tpl) => tpl.id === selectedTemplateId) ??
    filteredTemplates.at(0) ??
    null

  const folderOptions = useMemo(() => {
    const list: Array<{ id: string | null; label: string }> = [
      { id: null, label: 'My Drive' },
    ]
    const walk = (parentId: string | null) => {
      const children = folders
        .filter((f) => f.parentId === parentId)
        .sort((a, b) => a.name.localeCompare(b.name))
      for (const child of children) {
        list.push({
          id: child.id,
          label: `My Drive / ${getFolderPathLabel(folders, child.id)}`,
        })
        walk(child.id)
      }
    }
    walk(null)
    return list
  }, [folders])

  if (!open) return null

  const submitAgent = () => {
    const trimmed = prompt.trim()
    if (!trimmed) return
    const model =
      models.find((item) => item.id === currentModelId) ?? models.at(0)
    onBuildWithAgent({
      prompt: trimmed,
      modelId: currentModelId,
      folderId,
      reasoningEffort: reasoningEffortForModel(model, reasoningEffort),
    })
    setPrompt('')
    onClose()
  }

  const submitTemplate = (target?: MarbleDocumentFile) => {
    const chosen = target ?? selectedTemplate
    if (!chosen) return
    const nextTitle =
      target && target.id !== selectedTemplate?.id
        ? `${target.title} copy`
        : customTitle.trim() || `${chosen.title} copy`
    onCreateFromTemplate({
      template: chosen,
      title: nextTitle,
      folderId,
    })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[10vh]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-label="Create new app"
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header with Mode Switcher */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--xd-border)] bg-[var(--xd-rail)] px-4 py-3">
          <div
            role="tablist"
            aria-label="Creation method"
            className="inline-flex items-center rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] p-0.5"
          >
            <WorkspaceLink
              href={modeHrefs?.agent ?? '?modal=new-agent'}
              role="tab"
              aria-selected={mode === 'agent'}
              onNavigate={() => {
                setMode('agent')
                onModeChange?.('agent')
              }}
              className={`inline-flex h-7 items-center gap-1.5 rounded-xs px-3 text-[12px] font-medium transition-colors ${
                mode === 'agent'
                  ? 'bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]'
                  : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>AI agent</span>
            </WorkspaceLink>
            <WorkspaceLink
              href={modeHrefs?.templates ?? '?modal=new-template'}
              role="tab"
              aria-selected={mode === 'templates'}
              onNavigate={() => {
                setMode('templates')
                onModeChange?.('templates')
              }}
              className={`inline-flex h-7 items-center gap-1.5 rounded-xs px-3 text-[12px] font-medium transition-colors ${
                mode === 'templates'
                  ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                  : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]'
              }`}
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              <span>Templates</span>
              <span className="xd-tabular text-[11px] text-[var(--xd-ink-muted)]">
                {templates.length}
              </span>
            </WorkspaceLink>
          </div>

          <div className="flex items-center gap-2">
            {folderOptions.length > 1 && (
              <div className="relative hidden items-center sm:inline-flex">
                <Folder className="pointer-events-none absolute left-2 h-3 w-3 text-[var(--xd-ink-muted)]" />
                <select
                  aria-label="Destination folder"
                  value={folderId ?? ''}
                  onChange={(e) => setFolderId(e.target.value || null)}
                  className="h-7 max-w-[200px] appearance-none rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] pr-6 pl-6 text-[11.5px] text-[var(--xd-ink-secondary)] focus:border-[var(--xd-accent)] focus:outline-none"
                >
                  {folderOptions.map((opt) => (
                    <option
                      key={opt.id ?? '__root__'}
                      value={opt.id ?? ''}
                      className="bg-[var(--xd-canvas)] text-[var(--xd-ink)]"
                    >
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-[var(--xd-ink-muted)]" />
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close create dialog"
              className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--xd-ink-muted)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        {mode === 'agent' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submitAgent()
            }}
            className="flex flex-col gap-4 p-5"
          >
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-[var(--xd-ink)]">
                Build a new app with an AI agent
              </h2>
              <p className="mt-0.5 text-[12.5px] text-[var(--xd-ink-secondary)]">
                Describe the document, interactive tool, or research app you
                want. The agent creates a live `.mrbl` file and opens it in a
                new tab.
              </p>
            </div>

            <div className="overflow-hidden rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-rail)]/50 focus-within:border-[var(--xd-accent)] focus-within:bg-[var(--xd-canvas)]">
              <textarea
                autoFocus
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    submitAgent()
                  }
                }}
                placeholder="Example: Build an interactive ablation dashboard comparing 3 decoder variants with editable parameter rows and a live SVG threshold plot..."
                aria-label="Describe the new app"
                className="w-full resize-none bg-transparent px-3.5 py-3 text-[13px] leading-relaxed text-[var(--xd-ink)] placeholder:text-[var(--xd-ink-muted)] focus:outline-none"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2">
                <ModelPicker
                  models={models}
                  selectedModelId={currentModelId}
                  onSelectModel={(nextId) => {
                    setCurrentModelId(nextId)
                    onSelectModel?.(nextId)
                  }}
                  reasoningEffort={reasoningEffort}
                  onSelectReasoningEffort={(next) => {
                    if (reasoningEffortProp === undefined)
                      setInternalEffort(next)
                    onSelectReasoningEffort?.(next)
                  }}
                  effortDisplay="both"
                  favoriteModelIds={favoriteModelIds}
                  onFavoriteModelIdsChange={onFavoriteModelIdsChange}
                  onOpenProviders={
                    onOpenProviders
                      ? () => {
                          onClose()
                          onOpenProviders()
                        }
                      : undefined
                  }
                  size="sm"
                  side="top"
                  align="start"
                  ariaLabel="Select AI model"
                />

                <div className="flex items-center gap-2">
                  <span className="xd-mono hidden text-[10.5px] text-[var(--xd-ink-muted)] sm:inline">
                    ⌘↵ to build
                  </span>
                  <button
                    type="submit"
                    disabled={!prompt.trim()}
                    className="inline-flex h-7 items-center gap-1.5 rounded bg-[var(--xd-accent)] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[var(--xd-accent-hover)] disabled:opacity-40"
                  >
                    <span>Build app</span>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </form>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Template Search & Category Filter */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--xd-border)] px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-1">
                {TEMPLATE_CATEGORIES.map((cat) => {
                  const active = templateCategory === cat.value
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setTemplateCategory(cat.value)}
                      className={`rounded px-2 py-1 text-[11.5px] transition-colors ${
                        active
                          ? 'bg-[var(--xd-surface-active)] font-medium text-[var(--xd-ink)]'
                          : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]'
                      }`}
                    >
                      {cat.label}
                    </button>
                  )
                })}
              </div>

              <div className="relative flex items-center">
                <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[var(--xd-ink-muted)]" />
                <input
                  type="search"
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  placeholder="Search templates..."
                  aria-label="Search templates"
                  className="h-7 w-44 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] pr-2.5 pl-8 text-[12px] text-[var(--xd-ink)] placeholder:text-[var(--xd-ink-muted)] focus:border-[var(--xd-accent)] focus:outline-none"
                />
              </div>
            </div>

            {/* Template Grid */}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {filteredTemplates.length === 0 ? (
                <p className="py-10 text-center text-[12.5px] text-[var(--xd-ink-muted)]">
                  No templates match this filter.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {filteredTemplates.map((tpl) => {
                    const isSelected = selectedTemplate?.id === tpl.id
                    return (
                      <div
                        key={tpl.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedTemplateId(tpl.id)
                          setCustomTitle(`${tpl.title} copy`)
                        }}
                        onDoubleClick={() => submitTemplate(tpl)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setSelectedTemplateId(tpl.id)
                            setCustomTitle(`${tpl.title} copy`)
                          }
                        }}
                        className={`flex cursor-pointer flex-col overflow-hidden rounded-lg border text-left transition-colors ${
                          isSelected
                            ? 'border-[var(--xd-accent)] bg-[var(--xd-accent-soft)]/50'
                            : 'border-[var(--xd-border)] bg-[var(--xd-rail)] hover:border-[var(--xd-border-strong)] hover:bg-[var(--xd-elevated)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 px-3 py-2">
                          <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-[var(--xd-ink)]">
                            <span className="shrink-0 text-[var(--xd-accent)]">
                              {getCategoryIcon(tpl.category, 'h-3.5 w-3.5')}
                            </span>
                            <span className="truncate">{tpl.title}</span>
                          </span>
                          {isSelected ? (
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--xd-accent)] text-white">
                              <Check className="h-2.5 w-2.5" />
                            </span>
                          ) : (
                            <span className="shrink-0 text-[10.5px] text-[var(--xd-ink-muted)]">
                              {getCategoryLabel(tpl.category)}
                            </span>
                          )}
                        </div>

                        <div className="px-2.5">
                          <div className="aspect-[16/9] w-full overflow-hidden rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)]">
                            <DriveDocumentThumbnail doc={tpl} />
                          </div>
                        </div>

                        <p className="line-clamp-2 px-3 py-2 text-[11.5px] leading-snug text-[var(--xd-ink-secondary)]">
                          {tpl.description}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer Bar for Naming & Creating from Selected Template */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--xd-border)] bg-[var(--xd-rail)] px-4 py-3">
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && selectedTemplate) {
                    e.preventDefault()
                    submitTemplate()
                  }
                }}
                placeholder="Name your new app..."
                aria-label="New app name"
                className="h-7 min-w-[200px] flex-1 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2.5 text-[12px] text-[var(--xd-ink)] placeholder:text-[var(--xd-ink-muted)] focus:border-[var(--xd-accent)] focus:outline-none"
              />

              <div className="flex items-center gap-1.5">
                {onPreviewTemplate && selectedTemplate && (
                  <button
                    type="button"
                    onClick={() => {
                      onPreviewTemplate(selectedTemplate)
                      onClose()
                    }}
                    className="h-7 rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2.5 text-[12px] text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
                  >
                    Preview
                  </button>
                )}
                <button
                  type="button"
                  disabled={!selectedTemplate}
                  onClick={() => submitTemplate()}
                  className="inline-flex h-7 items-center gap-1.5 rounded bg-[var(--xd-accent)] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[var(--xd-accent-hover)] disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create app</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
