/**
 * T3-Code-style Model Picker for xDrive.
 *
 * Layout, two-pane provider rail, search combobox, model row ergonomics,
 * docked reasoning effort column, and keyboard navigation adapted from
 * t3code (`github.com/pingdotgg/t3code`, MIT License, Copyright (c) 2026 T3 Tools Inc.):
 * - `apps/web/src/components/chat/ProviderModelPicker.tsx`
 * - `apps/web/src/components/chat/ModelPickerSidebar.tsx`
 * - `apps/web/src/components/chat/ModelPickerContent.tsx`
 * - `apps/web/src/components/chat/ModelListRow.tsx`
 * - `apps/web/src/components/chat/ComposerModelEffort.tsx`
 * - `apps/web/src/components/chat/ComposerControl.tsx`
 */

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import {
  Check,
  ChevronDown,
  KeyRound,
  Search,
  Sparkles,
  Star,
  X,
} from 'lucide-react'
import {
  Popover as PopoverPrimitive,
  Tooltip as TooltipPrimitive,
} from 'radix-ui'
import type { AIProviderId } from '#/lib/types'
import { REASONING_EFFORT_META } from '#/lib/ai/drive-chat-types'
import type { ReasoningEffort } from '#/lib/ai/drive-chat-types'
import { cn } from '#/lib/utils'
import { EffortGlyph, ProviderGlyph } from './ProviderGlyph'
import { normalizeModelPickerOptions } from './types'
import type {
  ModelPickerInputOption,
  ModelPickerOption,
  ModelPickerProviderTab,
} from './types'

const FAVORITES_STORAGE_KEY = 'xdrive.drive-chat.favorite-models.v1'
const DEFAULT_EFFORTS: ReasoningEffort[] = [
  'off',
  'low',
  'medium',
  'high',
  'max',
]

// Rendered heights in px matching t3code's stable popup height calculation
const ROW_HEIGHT_PX = 32
const ROW_GAP_PX = 2
const LIST_CHROME_PX = 62
const MAX_POPUP_HEIGHT_PX = 346 // t3code's 86.5 * 4px

type RailTab = 'favorites' | AIProviderId

export interface ModelPickerProps {
  /** Model options (accepts DriveChatModelOption, ModelPickerOption, or legacy shapes). */
  models: ReadonlyArray<ModelPickerInputOption>
  /** Currently selected model ID. */
  selectedModelId: string
  /** Callback invoked when the user picks a model. */
  onSelectModel: (modelId: string) => void
  /** Controlled favorite model IDs. When omitted, persisted in localStorage. */
  favoriteModelIds?: ReadonlyArray<string>
  /** Called when the user toggles a model's favorite star. */
  onFavoriteModelIdsChange?: (ids: string[]) => void
  /**
   * Optional reasoning effort state. When BOTH `reasoningEffort` and
   * `onSelectReasoningEffort` are supplied, the popover renders t3code's
   * docked right-hand Effort column beside the model list and shows the effort
   * indicator inline on the trigger button.
   */
  reasoningEffort?: ReasoningEffort
  onSelectReasoningEffort?: (effort: ReasoningEffort) => void
  /** How effort is displayed in the trigger button when docked. Default: `'bars'`. */
  effortDisplay?: 'bars' | 'label' | 'both'
  /** Optional footer bar rendered across the bottom of the docked popover. */
  footer?: ReactNode
  /** Optional callback to jump to Models & Providers settings. */
  onOpenProviders?: () => void
  /** Trigger visual style: `'ghost'` for composers/toolbars, `'field'` for form/settings selects. */
  variant?: 'ghost' | 'field'
  /** Trigger height/density matching t3code's `ComposerControlSize`. */
  size?: 'sm' | 'xs'
  /** Show trailing chevron on the trigger. Defaults to `true` for `'field'`, `false` for `'ghost'`. */
  showChevron?: boolean
  /** Popover placement side. Defaults to `'top'` when docked, `'bottom'` otherwise. */
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Popover horizontal alignment. Default: `'start'`. */
  align?: 'start' | 'center' | 'end'
  /** Controlled open state. */
  open?: boolean
  /** Uncontrolled initial open state (useful for Storybook visual states). */
  defaultOpen?: boolean
  /** Initial search query (useful for Storybook visual states). */
  defaultSearchQuery?: string
  /** Initial provider/favorites tab (useful for Storybook visual states). */
  defaultTab?: RailTab
  onOpenChange?: (open: boolean) => void
  /** Optional accessible label for the trigger button. */
  ariaLabel?: string
  /** Placeholder when no model is selected/available. */
  placeholder?: string
  disabled?: boolean
  /** Additional classes for the trigger button. */
  triggerClassName?: string
  /** Optional portal container (defaults to `document.body`). */
  portalContainer?: HTMLElement | null
}

function loadStoredFavorites(
  models: ReadonlyArray<ModelPickerOption>,
): string[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY)
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          return parsed.filter((id): id is string => typeof id === 'string')
        }
      }
    } catch {
      // ignore storage errors
    }
  }
  return models
    .filter((m) => m.connected)
    .slice(0, 3)
    .map((m) => m.id)
}

function rankModelSearch(
  models: ReadonlyArray<ModelPickerOption>,
  query: string,
  favoriteSet: ReadonlySet<string>,
): ModelPickerOption[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...models]
  const tokens = needle.split(/\s+/).filter(Boolean)

  const scored: Array<{ model: ModelPickerOption; score: number }> = []
  for (const model of models) {
    const nameLower = model.name.toLowerCase()
    const idLower = model.id.toLowerCase()
    const providerLower = model.providerName.toLowerCase()
    const descLower = (model.description ?? '').toLowerCase()
    const haystack = `${nameLower} ${providerLower} ${idLower} ${descLower}`

    if (!tokens.every((token) => haystack.includes(token))) continue

    let score = 0
    if (nameLower === needle) score += 200
    else if (nameLower.startsWith(needle)) score += 120
    else if (nameLower.includes(needle)) score += 80
    if (providerLower.startsWith(needle)) score += 50
    else if (providerLower.includes(needle)) score += 30
    if (idLower.includes(needle)) score += 20
    if (model.connected) score += 15
    if (favoriteSet.has(model.id)) score += 12
    scored.push({ model, score })
  }

  return scored
    .sort(
      (a, b) => b.score - a.score || a.model.name.localeCompare(b.model.name),
    )
    .map((entry) => entry.model)
}

function describeProviderTooltip(tab: ModelPickerProviderTab): string {
  if (tab.status === 'rate_limited' && tab.connected) {
    return `${tab.providerName}: Rate limited`
  }
  if (!tab.connected || tab.status === 'disconnected') {
    return `${tab.providerName}: Not connected`
  }
  return tab.providerName
}

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

function PickerTooltip({
  label,
  side = 'left',
  sideOffset = 8,
  children,
}: {
  label: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  sideOffset?: number
  children: ReactNode
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={sideOffset}
          className="z-[160] max-w-60 rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] px-2 py-1 text-[11.5px] leading-snug text-[var(--xd-ink)] shadow-lg"
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

/**
 * Left vertical provider icon rail with animated primary selection pill,
 * adapted from t3code's `ModelPickerSidebar.tsx`.
 */
const ModelPickerSidebar = memo(function ModelPickerSidebar({
  selectedTab,
  onSelectTab,
  onFocusSearch,
  providerTabs,
  showFavorites = true,
}: {
  selectedTab: RailTab
  onSelectTab: (tab: RailTab) => void
  onFocusSearch: () => void
  providerTabs: ReadonlyArray<ModelPickerProviderTab>
  showFavorites?: boolean
}) {
  const railContentRef = useRef<HTMLDivElement>(null)
  const [indicatorTop, setIndicatorTop] = useState<number | null>(null)

  useIsomorphicLayoutEffect(() => {
    const content = railContentRef.current
    if (!content) return
    const selectedItem = Array.from(
      content.querySelectorAll<HTMLElement>('[data-model-picker-provider]'),
    ).find((item) => item.dataset.modelPickerProvider === selectedTab)
    if (!selectedItem) {
      setIndicatorTop(null)
      return
    }
    setIndicatorTop(selectedItem.offsetTop + selectedItem.offsetHeight / 2 - 10)
  }, [providerTabs, selectedTab, showFavorites])

  const handleRailKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      onFocusSearch()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const buttons = Array.from(
        event.currentTarget.querySelectorAll<HTMLButtonElement>(
          'button[data-rail-button]:not(:disabled)',
        ),
      )
      if (buttons.length === 0) return
      const currentIndex = buttons.indexOf(
        document.activeElement as HTMLButtonElement,
      )
      const delta = event.key === 'ArrowDown' ? 1 : -1
      const nextIndex =
        currentIndex < 0
          ? 0
          : (currentIndex + delta + buttons.length) % buttons.length
      event.preventDefault()
      buttons[nextIndex]?.focus()
    }
  }

  return (
    <div
      role="toolbar"
      aria-label="Providers"
      aria-orientation="vertical"
      data-model-picker-sidebar="true"
      onKeyDown={handleRailKeyDown}
      className="w-11 shrink-0 overflow-hidden bg-[var(--xd-rail)]/80"
    >
      <div className="h-full overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div
          ref={railContentRef}
          className="relative flex min-h-full flex-col gap-1 p-1"
        >
          {indicatorTop !== null && (
            <div
              data-model-picker-selected-indicator="true"
              className="pointer-events-none absolute right-0.5 z-10 h-5 w-[3px] rounded-full bg-[var(--xd-accent)] transition-[top] duration-200 ease-out"
              style={{ top: indicatorTop }}
            />
          )}

          {showFavorites && (
            <>
              <div
                className="relative w-full"
                data-model-picker-provider="favorites"
              >
                <PickerTooltip label="Favorites" side="left">
                  <button
                    type="button"
                    data-rail-button
                    aria-label="Favorites"
                    aria-pressed={selectedTab === 'favorites'}
                    onClick={() => onSelectTab('favorites')}
                    className={cn(
                      'relative isolate flex aspect-square w-full cursor-pointer items-center justify-center rounded-md transition-colors outline-none hover:bg-[var(--xd-ink)]/[0.09] focus-visible:bg-[var(--xd-ink)]/[0.09]',
                      selectedTab === 'favorites'
                        ? 'text-[var(--xd-ink)]'
                        : 'text-[var(--xd-ink-secondary)]',
                    )}
                  >
                    <Star
                      className="size-4.5 shrink-0 fill-current"
                      aria-hidden
                    />
                  </button>
                </PickerTooltip>
              </div>
              <div
                className="border-b border-[var(--xd-border)]/80"
                aria-hidden="true"
              />
            </>
          )}

          {providerTabs.map((tab) => {
            const isSelected = selectedTab === tab.providerId
            const tooltip = describeProviderTooltip(tab)
            return (
              <div
                key={tab.providerId}
                className="relative w-full"
                data-model-picker-provider={tab.providerId}
              >
                <PickerTooltip label={tooltip} side="left">
                  <button
                    type="button"
                    data-rail-button
                    aria-label={tooltip}
                    aria-pressed={isSelected}
                    onClick={() => onSelectTab(tab.providerId)}
                    className={cn(
                      'relative isolate flex aspect-square w-full cursor-pointer items-center justify-center rounded-md transition-colors outline-none hover:bg-[var(--xd-ink)]/[0.09] focus-visible:bg-[var(--xd-ink)]/[0.09]',
                      isSelected
                        ? 'text-[var(--xd-ink)]'
                        : tab.connected
                          ? 'text-[var(--xd-ink-secondary)]'
                          : 'text-[var(--xd-ink-muted)]/60',
                    )}
                  >
                    <ProviderGlyph
                      providerId={tab.providerId}
                      className="size-4.5"
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute right-1 bottom-1 size-1.5 rounded-full ring-2 ring-[var(--xd-rail)]',
                        tab.connected && tab.status === 'active'
                          ? 'bg-[var(--xd-commit)]'
                          : tab.connected && tab.status === 'rate_limited'
                            ? 'bg-[var(--xd-sketch)]'
                            : 'bg-[var(--xd-ink-subtle)]/75',
                      )}
                    />
                  </button>
                </PickerTooltip>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})

/**
 * Single uniform model row adapted from t3code's `ModelListRow.tsx`.
 */
const ModelListRow = memo(function ModelListRow({
  model,
  isSelected,
  isHighlighted,
  isFavorite,
  favoriteStarOnHover,
  onSelect,
  onHighlight,
  onToggleFavorite,
}: {
  model: ModelPickerOption
  isSelected: boolean
  isHighlighted: boolean
  isFavorite: boolean
  favoriteStarOnHover: boolean
  onSelect: () => void
  onHighlight: () => void
  onToggleFavorite: () => void
}) {
  return (
    <div
      role="option"
      aria-selected={isSelected}
      data-model-picker-row="true"
      data-highlighted={isHighlighted || undefined}
      onMouseEnter={onHighlight}
      onClick={onSelect}
      className={cn(
        'group relative flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left transition-colors outline-none sm:min-h-7',
        isHighlighted
          ? 'bg-[var(--xd-ink)]/[0.09] text-[var(--xd-ink)]'
          : 'text-[var(--xd-ink)] hover:bg-[var(--xd-ink)]/[0.09]',
        model.isUnavailable && 'opacity-60',
      )}
    >
      <ProviderGlyph
        providerId={model.providerId}
        className={cn(
          'size-4 shrink-0',
          model.connected
            ? 'text-[var(--xd-ink-secondary)]'
            : 'text-[var(--xd-ink-muted)]/60',
        )}
      />

      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
        <div
          className="min-w-0 truncate text-[13px] leading-snug font-normal"
          onPointerEnter={(event) => {
            const el = event.currentTarget
            el.title = el.scrollWidth > el.clientWidth ? model.name : ''
          }}
        >
          {model.name}
          <span className="sr-only">, {model.providerName}</span>
        </div>

        {isSelected && (
          <Check
            className="size-3.5 shrink-0 text-[var(--xd-ink)]"
            aria-hidden="true"
          />
        )}

        {!model.connected && (
          <span className="shrink-0 rounded border border-[var(--xd-border-strong)] px-1 py-px text-[10px] leading-none text-[var(--xd-ink-muted)]">
            Off
          </span>
        )}

        {model.connected && model.status === 'rate_limited' && (
          <span className="shrink-0 rounded border border-[var(--xd-sketch)]/40 bg-[var(--xd-sketch-soft)] px-1 py-px text-[10px] leading-none text-[var(--xd-sketch)]">
            Limited
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {model.contextWindow && (
          <span className="xd-mono text-[10.5px] text-[var(--xd-ink-muted)]/80">
            {model.contextWindow}
          </span>
        )}

        <PickerTooltip
          label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          side="top"
          sideOffset={4}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label={
              isFavorite
                ? `Remove ${model.name} from favorites`
                : `Add ${model.name} to favorites`
            }
            onClick={(event) => {
              event.stopPropagation()
              onToggleFavorite()
            }}
            onKeyDown={(event) => event.stopPropagation()}
            className={cn(
              'inline-flex size-5.5 items-center justify-center rounded-sm text-[var(--xd-ink-muted)] transition-opacity hover:bg-[var(--xd-ink)]/[0.08] hover:text-[var(--xd-ink)] focus-visible:opacity-100',
              isFavorite && !favoriteStarOnHover
                ? 'text-[var(--xd-sketch)] opacity-100'
                : isFavorite && favoriteStarOnHover
                  ? 'text-[var(--xd-sketch)] opacity-0 group-hover:opacity-100 group-data-[highlighted]:opacity-100'
                  : 'opacity-0 group-hover:opacity-100 group-data-[highlighted]:opacity-100',
            )}
          >
            <Star
              className={cn('size-3', isFavorite && 'fill-current')}
              aria-hidden="true"
            />
          </button>
        </PickerTooltip>
      </div>
    </div>
  )
})

/**
 * Docked reasoning effort column adapted from t3code's `ComposerModelEffort.tsx`.
 */
const ModelPickerEffortColumn = memo(function ModelPickerEffortColumn({
  modelLabel,
  supportsReasoning,
  supportedEfforts,
  selectedEffort,
  defaultEffort,
  onSelectEffort,
  onReturnToSearch,
}: {
  modelLabel: string
  supportsReasoning: boolean
  supportedEfforts: ReadonlyArray<ReasoningEffort>
  selectedEffort: ReasoningEffort
  defaultEffort?: ReasoningEffort
  onSelectEffort: (effort: ReasoningEffort) => void
  onReturnToSearch: () => void
}) {
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      event.key === 'ArrowLeft' &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault()
      event.stopPropagation()
      onReturnToSearch()
      return
    }

    const isArrow = event.key === 'ArrowDown' || event.key === 'ArrowUp'
    const isLetter =
      event.key.length === 1 &&
      event.key.trim() !== '' &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey

    if (!isArrow && !isLetter) return

    const rows = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[data-effort-row]:not(:disabled)',
      ),
    )
    if (rows.length === 0) return

    const currentIndex = rows.findIndex((row) => row === document.activeElement)
    const nextRow = isArrow
      ? rows[
          Math.min(
            rows.length - 1,
            Math.max(0, currentIndex + (event.key === 'ArrowDown' ? 1 : -1)),
          )
        ]
      : [
          ...rows.slice(currentIndex + 1),
          ...rows.slice(0, currentIndex + 1),
        ].find((row) =>
          row.dataset.effortLevel
            ?.toLowerCase()
            .startsWith(event.key.toLowerCase()),
        )

    if (!nextRow) return
    event.preventDefault()
    event.stopPropagation()
    nextRow.focus()
    nextRow.scrollIntoView({ block: 'nearest' })
  }

  const effectiveDefault =
    defaultEffort ??
    (supportedEfforts.includes('high')
      ? 'high'
      : supportedEfforts.includes('medium')
        ? 'medium'
        : undefined)

  return (
    <div
      data-model-picker-effort="true"
      className="flex min-h-0 w-48 shrink-0 flex-col border-l border-[var(--xd-border)]/70 bg-[var(--xd-rail)]/50 max-sm:h-52 max-sm:w-full max-sm:border-t max-sm:border-l-0"
      onKeyDown={handleKeyDown}
    >
      {/* Header aligns bottom rule with the search bar's bottom rule */}
      <div className="shrink-0 px-3 pt-2.5">
        <div className="flex h-[33px] -translate-y-px items-center gap-2 border-b border-[var(--xd-border)]/70 pb-1.5 text-[13px]">
          <span className="shrink-0 text-[var(--xd-ink-muted)]">Effort</span>
          <span className="ms-auto min-w-0 truncate text-[11.5px] text-[var(--xd-ink-muted)]">
            {modelLabel}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-2 pt-2 pb-1.5">
        {!supportsReasoning ? (
          <div className="flex h-8 items-center px-2 text-[13px] text-[var(--xd-ink-muted)]">
            No effort levels
          </div>
        ) : (
          <div
            role="radiogroup"
            aria-label="Reasoning effort"
            className="flex flex-col gap-0.5"
          >
            {supportedEfforts.map((effort, index) => {
              const meta = REASONING_EFFORT_META[effort]
              const selected = selectedEffort === effort
              const isDefault = effort === effectiveDefault
              const hasSelected = supportedEfforts.includes(selectedEffort)
              return (
                <PickerTooltip
                  key={effort}
                  label={meta.description}
                  side="right"
                  sideOffset={8}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-effort-row="true"
                    data-effort-level={meta.label}
                    tabIndex={
                      selected || (!hasSelected && index === 0) ? 0 : -1
                    }
                    onClick={() => onSelectEffort(effort)}
                    className="flex h-8 w-full shrink-0 cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-[13px] text-[var(--xd-ink)] outline-none transition-colors hover:bg-[var(--xd-ink)]/[0.09] focus-visible:bg-[var(--xd-ink)]/[0.09]"
                  >
                    <EffortGlyph
                      count={4}
                      filled={meta.bars}
                      size="xs"
                      className="text-[var(--xd-ink-secondary)]"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {meta.label}
                    </span>
                    {selected ? (
                      <>
                        {isDefault && <span className="sr-only">Default</span>}
                        <Check
                          aria-hidden="true"
                          className="size-3.5 shrink-0 text-[var(--xd-ink)]"
                        />
                      </>
                    ) : isDefault ? (
                      <span className="text-[11px] text-[var(--xd-ink-muted)]/75">
                        Default
                      </span>
                    ) : null}
                  </button>
                </PickerTooltip>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
})

export const ModelPicker = memo(function ModelPicker({
  models: rawModels,
  selectedModelId,
  onSelectModel,
  favoriteModelIds: controlledFavoriteIds,
  onFavoriteModelIdsChange,
  reasoningEffort,
  onSelectReasoningEffort,
  effortDisplay = 'bars',
  footer,
  onOpenProviders,
  variant = 'ghost',
  size = 'sm',
  showChevron,
  side,
  align = 'start',
  open: controlledOpen,
  defaultOpen = false,
  defaultSearchQuery = '',
  defaultTab,
  onOpenChange,
  ariaLabel,
  placeholder = 'Select model',
  disabled = false,
  triggerClassName,
  portalContainer,
}: ModelPickerProps) {
  const models = useMemo(
    () => normalizeModelPickerOptions(rawModels),
    [rawModels],
  )

  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const isOpen = controlledOpen ?? uncontrolledOpen

  const [internalFavorites, setInternalFavorites] = useState<string[]>(() =>
    controlledFavoriteIds
      ? [...controlledFavoriteIds]
      : loadStoredFavorites(models),
  )
  const favoriteIds = controlledFavoriteIds ?? internalFavorites
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds])

  const activeModel = useMemo(
    () =>
      models.find((m) => m.id === selectedModelId) ??
      models.find((m) => m.connected) ??
      models.at(0) ??
      null,
    [models, selectedModelId],
  )

  const providerTabs = useMemo<ModelPickerProviderTab[]>(() => {
    const map = new Map<AIProviderId, ModelPickerProviderTab>()
    for (const model of models) {
      let tab = map.get(model.providerId)
      if (!tab) {
        tab = {
          providerId: model.providerId,
          providerName: model.providerName,
          connected: model.connected,
          status: model.status,
          models: [],
        }
        map.set(model.providerId, tab)
      }
      if (model.connected) {
        tab.connected = true
        if (model.status === 'active') tab.status = 'active'
      }
      tab.models.push(model)
    }
    return [...map.values()].sort(
      (a, b) => Number(b.connected) - Number(a.connected),
    )
  }, [models])

  const providerOrder = useMemo(
    () => providerTabs.map((tab) => tab.providerId),
    [providerTabs],
  )

  const pickInitialTab = useCallback((): RailTab => {
    if (defaultTab) return defaultTab
    const hasPickableFavorite = models.some((m) => favoriteSet.has(m.id))
    if (
      hasPickableFavorite &&
      (!activeModel || favoriteSet.has(activeModel.id))
    ) {
      return 'favorites'
    }
    if (activeModel) return activeModel.providerId
    return providerTabs.at(0)?.providerId ?? 'favorites'
  }, [defaultTab, models, favoriteSet, activeModel, providerTabs])

  const [selectedTab, setSelectedTab] = useState<RailTab>(pickInitialTab)
  const [searchQuery, setSearchQuery] = useState(defaultSearchQuery)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const listContainerRef = useRef<HTMLDivElement>(null)
  const searchHeightRef = useRef<number | null>(null)
  const listboxId = useId()

  const docked =
    reasoningEffort !== undefined && onSelectReasoningEffort !== undefined
  const resolvedSide = side ?? (docked ? 'top' : 'bottom')
  const resolvedShowChevron = showChevron ?? variant === 'field'
  const isSearching = searchQuery.trim().length > 0

  const setOpen = useCallback(
    (next: boolean) => {
      if (disabled && next) return
      if (next) {
        setSearchQuery(defaultSearchQuery)
        setSelectedTab(pickInitialTab())
        setHighlightedIndex(0)
        searchHeightRef.current = null
      }
      onOpenChange?.(next)
      if (controlledOpen === undefined) {
        setUncontrolledOpen(next)
      }
    },
    [
      disabled,
      defaultSearchQuery,
      pickInitialTab,
      onOpenChange,
      controlledOpen,
    ],
  )

  const visibleModels = useMemo(() => {
    if (isSearching) {
      return rankModelSearch(models, searchQuery, favoriteSet)
    }
    if (selectedTab === 'favorites') {
      const favs = models.filter((m) => favoriteSet.has(m.id))
      return favs.slice().sort((a, b) => {
        const provDiff =
          providerOrder.indexOf(a.providerId) -
          providerOrder.indexOf(b.providerId)
        if (provDiff !== 0) return provDiff
        return a.name.localeCompare(b.name)
      })
    }
    const tabModels = models.filter((m) => m.providerId === selectedTab)
    // Favorites sorted to top within provider tab, matching t3code's sortProviderModelItems
    return tabModels.slice().sort((a, b) => {
      const favDiff =
        Number(favoriteSet.has(b.id)) - Number(favoriteSet.has(a.id))
      if (favDiff !== 0) return favDiff
      return 0
    })
  }, [
    models,
    isSearching,
    searchQuery,
    selectedTab,
    favoriteSet,
    providerOrder,
  ])

  // Keep highlighted index valid whenever the filtered list changes
  useEffect(() => {
    setHighlightedIndex(0)
  }, [searchQuery, selectedTab])

  // Compute stable popup height from the tallest tab so switching tabs never jumps the popover
  const stableMinHeightPx = useMemo(() => {
    let maxRows = 0
    const favCount = models.filter((m) => favoriteSet.has(m.id)).length
    maxRows = Math.max(maxRows, favCount)
    for (const tab of providerTabs) {
      maxRows = Math.max(maxRows, tab.models.length)
    }
    const contentHeight =
      maxRows > 0
        ? maxRows * ROW_HEIGHT_PX + Math.max(0, maxRows - 1) * ROW_GAP_PX
        : 96
    return Math.min(
      contentHeight + LIST_CHROME_PX + (onOpenProviders ? 40 : 0),
      MAX_POPUP_HEIGHT_PX,
    )
  }, [models, favoriteSet, providerTabs, onOpenProviders])

  const supportedEfforts: ReasoningEffort[] = useMemo(() => {
    if (!activeModel) return DEFAULT_EFFORTS
    if (activeModel.supportsReasoning === false) return ['off']
    if (
      activeModel.reasoningEfforts &&
      activeModel.reasoningEfforts.length > 0
    ) {
      return activeModel.reasoningEfforts
    }
    return DEFAULT_EFFORTS
  }, [activeModel])

  const supportsReasoning = activeModel
    ? activeModel.supportsReasoning !== false && supportedEfforts.length > 1
    : false

  const effectiveEffort: ReasoningEffort =
    reasoningEffort && supportedEfforts.includes(reasoningEffort)
      ? reasoningEffort
      : (supportedEfforts.at(-1) ?? 'off')

  const focusEffortColumn = useCallback((rows: 'levels' | 'any' = 'any') => {
    const column = popupRef.current?.querySelector('[data-model-picker-effort]')
    const level =
      column?.querySelector<HTMLElement>(
        '[data-effort-level][aria-checked="true"]:not(:disabled)',
      ) ??
      column?.querySelector<HTMLElement>('[data-effort-level]:not(:disabled)')
    const target =
      level ??
      (rows === 'any'
        ? column?.querySelector<HTMLElement>('[data-effort-row]:not(:disabled)')
        : null)
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ block: 'nearest' })
    return target != null
  }, [])

  const focusSearchInput = useCallback(() => {
    searchInputRef.current?.focus({ preventScroll: true })
  }, [])

  const handleSelectModel = useCallback(
    (modelId: string) => {
      if (disabled) return
      onSelectModel(modelId)
      if (!docked) {
        setOpen(false)
        return
      }
      window.requestAnimationFrame(() => {
        focusEffortColumn('levels')
      })
    },
    [disabled, onSelectModel, docked, setOpen, focusEffortColumn],
  )

  const toggleFavorite = useCallback(
    (modelId: string) => {
      const next = favoriteIds.includes(modelId)
        ? favoriteIds.filter((id) => id !== modelId)
        : [...favoriteIds, modelId]
      if (onFavoriteModelIdsChange) {
        onFavoriteModelIdsChange(next)
      } else {
        setInternalFavorites(next)
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(
              FAVORITES_STORAGE_KEY,
              JSON.stringify(next),
            )
          } catch {
            // ignore
          }
        }
      }
    },
    [favoriteIds, onFavoriteModelIdsChange],
  )

  const handleSelectRailTab = useCallback(
    (tab: RailTab) => {
      setSelectedTab(tab)
      setSearchQuery('')
      if (
        typeof window !== 'undefined' &&
        window.matchMedia('(pointer: coarse)').matches
      ) {
        return
      }
      window.requestAnimationFrame(() => focusSearchInput())
    },
    [focusSearchInput],
  )

  const scrollRowIntoView = (index: number) => {
    const rows = listContainerRef.current?.querySelectorAll<HTMLElement>(
      '[data-model-picker-row]',
    )
    rows?.[index]?.scrollIntoView({ block: 'nearest' })
  }

  const showSidebar = !isSearching && providerTabs.length > 0
  const selectedProviderTab =
    selectedTab === 'favorites'
      ? null
      : (providerTabs.find((tab) => tab.providerId === selectedTab) ?? null)

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return

    if (event.key === 'ArrowDown') {
      if (visibleModels.length === 0) return
      event.preventDefault()
      const next = (highlightedIndex + 1) % visibleModels.length
      setHighlightedIndex(next)
      scrollRowIntoView(next)
      return
    }

    if (event.key === 'ArrowUp') {
      if (visibleModels.length === 0) return
      event.preventDefault()
      const next =
        (highlightedIndex - 1 + visibleModels.length) % visibleModels.length
      setHighlightedIndex(next)
      scrollRowIntoView(next)
      return
    }

    if (event.key === 'Enter') {
      const chosen = visibleModels.at(highlightedIndex)
      if (!chosen) return
      event.preventDefault()
      handleSelectModel(chosen.id)
      return
    }

    if (
      showSidebar &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      ((event.key === 'ArrowLeft' &&
        !event.shiftKey &&
        searchQuery.length === 0) ||
        (event.key === 'Tab' && event.shiftKey))
    ) {
      const sidebar = popupRef.current?.querySelector(
        '[data-model-picker-sidebar]',
      )
      const activeBtn =
        sidebar?.querySelector<HTMLButtonElement>(
          'button[aria-pressed="true"]:not(:disabled)',
        ) ?? sidebar?.querySelector<HTMLButtonElement>('button:not(:disabled)')
      if (activeBtn) {
        event.preventDefault()
        activeBtn.focus()
      }
      return
    }

    if (
      docked &&
      event.key === 'ArrowRight' &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      event.currentTarget.selectionStart === searchQuery.length
    ) {
      event.preventDefault()
      const highlighted = visibleModels.at(highlightedIndex)
      if (highlighted && highlighted.id !== activeModel?.id) {
        handleSelectModel(highlighted.id)
      } else {
        focusEffortColumn('any')
      }
    }
  }

  const effortMeta = REASONING_EFFORT_META[effectiveEffort]
  const showEffortSuffix = docked && supportsReasoning
  const triggerText = activeModel ? activeModel.name : placeholder
  const showEffortWord =
    effortDisplay === 'label' ||
    effortDisplay === 'both' ||
    effectiveEffort === 'max'

  const triggerAriaLabel = [
    ariaLabel ?? triggerText,
    showEffortSuffix ? `Reasoning effort: ${effortMeta.label}` : null,
  ]
    .filter(Boolean)
    .join(', ')

  const emptyMessage =
    selectedTab === 'favorites' && !isSearching
      ? 'No favorites yet'
      : 'No models found'

  const setupProviderTab =
    !isSearching &&
    selectedProviderTab !== null &&
    !selectedProviderTab.connected &&
    onOpenProviders !== undefined
      ? selectedProviderTab
      : null

  return (
    <TooltipPrimitive.Provider delayDuration={150}>
      <PopoverPrimitive.Root open={isOpen} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            disabled={disabled || models.length === 0}
            aria-label={triggerAriaLabel}
            data-xdrive-model-picker="true"
            className={cn(
              'group/model-trigger relative inline-flex min-w-0 shrink cursor-pointer items-center whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--xd-accent)] disabled:pointer-events-none disabled:opacity-45',
              variant === 'field'
                ? 'h-7.5 w-full justify-between gap-1.5 rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 text-[12px] font-medium text-[var(--xd-ink)] hover:border-[var(--xd-border-strong)] hover:bg-[var(--xd-surface-hover)]/60 data-[state=open]:border-[var(--xd-accent)] data-[state=open]:bg-[var(--xd-surface-hover)]/60'
                : cn(
                    'rounded-lg border border-transparent hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] data-[state=open]:bg-[var(--xd-surface-hover)] data-[state=open]:text-[var(--xd-ink)]',
                    size === 'xs'
                      ? 'h-6 max-w-[200px] gap-1 px-1.5 text-[12px] font-medium text-[var(--xd-ink-secondary)]'
                      : 'h-7 max-w-[260px] gap-1.5 px-2 text-[13px] font-medium text-[var(--xd-ink-secondary)]',
                  ),
              triggerClassName,
            )}
          >
            <span
              className={cn(
                'flex min-w-0 flex-1 items-center',
                size === 'xs' ? 'gap-1' : 'gap-1.5',
              )}
            >
              {activeModel ? (
                <ProviderGlyph
                  providerId={activeModel.providerId}
                  className={cn(
                    size === 'xs' ? 'size-3.5' : 'size-4',
                    activeModel.connected
                      ? 'text-[var(--xd-ink)]'
                      : 'text-[var(--xd-ink-muted)]',
                  )}
                />
              ) : (
                <Sparkles
                  className={cn(
                    size === 'xs' ? 'size-3.5' : 'size-4',
                    'text-[var(--xd-ink-muted)]',
                  )}
                />
              )}

              <span className="min-w-0 truncate text-[var(--xd-ink)]">
                {triggerText}
              </span>

              {showEffortSuffix && (
                <span className="flex shrink-0 items-center gap-1 text-[var(--xd-ink-muted)] group-hover/model-trigger:text-[var(--xd-ink)] group-data-[state=open]/model-trigger:text-[var(--xd-ink)]">
                  {(effortDisplay === 'bars' || effortDisplay === 'both') &&
                    effectiveEffort !== 'max' && (
                      <EffortGlyph
                        count={4}
                        filled={effortMeta.bars}
                        size={size}
                      />
                    )}
                  {showEffortWord && (
                    <span className="text-[12px] font-normal">
                      {effortMeta.label}
                    </span>
                  )}
                </span>
              )}

              {activeModel && !activeModel.connected && (
                <span className="shrink-0 rounded border border-[var(--xd-border-strong)] px-1 py-px text-[10px] leading-none text-[var(--xd-ink-muted)]">
                  Off
                </span>
              )}
            </span>

            {resolvedShowChevron && (
              <ChevronDown
                className="size-3 shrink-0 text-[var(--xd-ink-muted)]"
                aria-hidden="true"
              />
            )}
          </button>
        </PopoverPrimitive.Trigger>

        <PopoverPrimitive.Portal container={portalContainer}>
          <PopoverPrimitive.Content
            ref={popupRef}
            side={resolvedSide}
            align={align}
            sideOffset={6}
            collisionPadding={12}
            onOpenAutoFocus={(event) => {
              if (
                typeof window !== 'undefined' &&
                window.matchMedia('(pointer: coarse)').matches
              ) {
                return
              }
              event.preventDefault()
              focusSearchInput()
            }}
            data-xdrive-model-picker-popup="true"
            className={cn(
              'z-[130] overflow-hidden rounded-lg border border-[var(--xd-border-strong)]/90 bg-[var(--xd-elevated)]/96 text-[var(--xd-ink)] shadow-[0_16px_40px_-18px_rgb(0_0_0/55%)] backdrop-blur-xl outline-none dark:shadow-[0_18px_44px_-18px_rgb(0_0_0/80%)]',
              'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            )}
          >
            <div className="flex max-h-[min(var(--radix-popover-content-available-height),28rem)] flex-col">
              <div
                className={cn(
                  'flex min-h-0',
                  docked
                    ? 'h-[346px] max-sm:h-auto max-sm:flex-col'
                    : 'max-h-[346px]',
                )}
                style={
                  docked
                    ? undefined
                    : isSearching && searchHeightRef.current
                      ? { height: searchHeightRef.current }
                      : { minHeight: stableMinHeightPx }
                }
              >
                {/* Left two-pane picker: Provider Rail + Search & Model List */}
                <div
                  data-model-picker-content="true"
                  className={cn(
                    'relative flex min-h-0 flex-row overflow-hidden',
                    docked
                      ? 'w-[min(22.5rem,calc(100vw-2rem))] max-sm:h-56 max-sm:w-[calc(100vw-2rem)]'
                      : 'w-[min(22.5rem,calc(100vw-2rem))]',
                  )}
                >
                  {showSidebar && (
                    <ModelPickerSidebar
                      selectedTab={selectedTab}
                      onSelectTab={handleSelectRailTab}
                      onFocusSearch={focusSearchInput}
                      providerTabs={providerTabs}
                      showFavorites
                    />
                  )}

                  <div
                    className={cn(
                      'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--xd-elevated)]/40',
                      showSidebar && 'border-l border-[var(--xd-border)]/70',
                    )}
                  >
                    {/* Border-bottom-only search box matching t3code ComboboxSearchInput */}
                    <label className="block min-w-0 shrink-0 cursor-text px-3 pt-2.5">
                      <div className="relative -translate-y-px border-b border-[var(--xd-border)]/70 pb-1.5 transition-colors focus-within:border-[var(--xd-accent)]">
                        <Search
                          aria-hidden="true"
                          className="pointer-events-none absolute top-1.5 left-0 size-3.5 shrink-0 text-[var(--xd-ink-muted)]/65"
                        />
                        <input
                          ref={searchInputRef}
                          type="text"
                          role="combobox"
                          aria-expanded={true}
                          aria-controls={listboxId}
                          aria-autocomplete="list"
                          placeholder="Search models..."
                          value={searchQuery}
                          onChange={(event) => {
                            if (!isSearching && popupRef.current) {
                              searchHeightRef.current =
                                popupRef.current.offsetHeight
                            }
                            setSearchQuery(event.target.value)
                          }}
                          onKeyDown={handleSearchKeyDown}
                          className="h-6.5 w-full bg-transparent pr-5 pl-5.5 text-[13px] leading-6.5 text-[var(--xd-ink)] outline-none placeholder:text-[var(--xd-ink-muted)]"
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            tabIndex={-1}
                            aria-label="Clear search"
                            onClick={() => {
                              setSearchQuery('')
                              focusSearchInput()
                            }}
                            className="absolute top-1 right-0 inline-flex size-5 items-center justify-center rounded text-[var(--xd-ink-muted)] hover:text-[var(--xd-ink)]"
                          >
                            <X className="size-3" />
                          </button>
                        )}
                      </div>
                    </label>

                    {/* Scrollable Model List */}
                    <div
                      ref={listContainerRef}
                      id={listboxId}
                      role="listbox"
                      aria-label="Models"
                      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1.5"
                    >
                      {visibleModels.length === 0 ? (
                        <p className="px-2 py-8 text-center text-[12.5px] text-[var(--xd-ink-muted)]">
                          {emptyMessage}
                        </p>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {visibleModels.map((model, index) => (
                            <ModelListRow
                              key={model.id}
                              model={model}
                              isSelected={activeModel?.id === model.id}
                              isHighlighted={index === highlightedIndex}
                              isFavorite={favoriteSet.has(model.id)}
                              favoriteStarOnHover={
                                selectedTab === 'favorites' && !isSearching
                              }
                              onHighlight={() => setHighlightedIndex(index)}
                              onSelect={() => handleSelectModel(model.id)}
                              onToggleFavorite={() => toggleFavorite(model.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Provider setup notice for disconnected providers (t3code ModelPickerProviderNotices) */}
                    {setupProviderTab && onOpenProviders && (
                      <div className="shrink-0 border-t border-[var(--xd-border)]/70 px-3 py-2 text-[11.5px] leading-snug">
                        <p className="text-[var(--xd-ink-muted)]">
                          {setupProviderTab.providerName} is not connected yet.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false)
                            onOpenProviders()
                          }}
                          className="mt-1 inline-flex cursor-pointer items-center gap-1 font-medium text-[var(--xd-accent)] underline-offset-2 hover:underline"
                        >
                          Open provider setup
                        </button>
                      </div>
                    )}

                    {/* Quiet manage providers footer when not already showing setup notice */}
                    {onOpenProviders && !setupProviderTab && (
                      <div className="shrink-0 border-t border-[var(--xd-border)]/70 bg-[var(--xd-rail)]/55 p-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false)
                            onOpenProviders()
                          }}
                          className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[12px] font-medium text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-ink)]/[0.08] hover:text-[var(--xd-ink)]"
                        >
                          <KeyRound className="size-3.5 text-[var(--xd-ink-muted)]" />
                          <span>Manage providers &amp; plans</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Docked right-hand Reasoning Effort Column (t3code ComposerEffortColumn) */}
                {docked && (
                  <ModelPickerEffortColumn
                    modelLabel={activeModel ? activeModel.name : placeholder}
                    supportsReasoning={supportsReasoning}
                    supportedEfforts={supportedEfforts}
                    selectedEffort={effectiveEffort}
                    defaultEffort={activeModel?.defaultReasoningEffort}
                    onSelectEffort={onSelectReasoningEffort}
                    onReturnToSearch={focusSearchInput}
                  />
                )}
              </div>

              {footer}
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
})
