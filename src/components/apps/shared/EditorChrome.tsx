import React, { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Minus, Plus } from 'lucide-react'
import { cn } from '#/lib/utils'

/* ============================================================================
   Shared Editor Chrome Primitives (xDrive Design System)
   Built for Notes (Apple Notes), Docs (Google Docs), and Slides (Google Slides)
   ============================================================================ */

export interface ContextMenuItem {
  id: string
  label: string
  icon?: React.ReactNode
  shortcut?: string
  checked?: boolean
  danger?: boolean
  disabled?: boolean
  divider?: boolean
  submenu?: ContextMenuItem[]
  onSelect?: () => void
}

export interface AppContextMenuProps {
  open: boolean
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
  ariaLabel?: string
}

export function AppContextMenu({
  open,
  x,
  y,
  items,
  onClose,
  ariaLabel = 'Context menu',
}: AppContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [hoveredSubmenu, setHoveredSubmenu] = useState<string | null>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useEffect(() => {
    if (!open) {
      setHoveredSubmenu(null)
      return
    }
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800
    const width = 224
    const estHeight = Math.min(items.length * 30 + 16, 380)
    setPos({
      left: Math.max(8, Math.min(x, vw - width - 8)),
      top: Math.max(8, Math.min(y, vh - estHeight - 8)),
    })
  }, [open, x, y, items.length])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={ariaLabel}
      style={{ left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      className="fixed z-50 min-w-[216px] rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] p-1 text-[12px] text-[var(--xd-ink)] shadow-lg"
    >
      {items.map((item) => {
        if (item.divider) {
          return (
            <div
              key={item.id}
              role="separator"
              className="my-1 h-px bg-[var(--xd-border)]"
            />
          )
        }
        const hasSub = Boolean(item.submenu && item.submenu.length > 0)
        return (
          <div
            key={item.id}
            className="relative"
            onMouseEnter={() => setHoveredSubmenu(hasSub ? item.id : null)}
          >
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled || hasSub) return
                item.onSelect?.()
                onClose()
              }}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-xs px-2 py-1.5 text-left transition-colors disabled:pointer-events-none disabled:opacity-40',
                item.danger
                  ? 'text-[var(--xd-danger)] hover:bg-[var(--xd-danger-soft)]'
                  : 'text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)]',
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[var(--xd-ink-muted)]">
                  {item.checked ? (
                    <Check className="h-3.5 w-3.5 text-[var(--xd-accent)]" />
                  ) : (
                    item.icon
                  )}
                </span>
                <span className="truncate">{item.label}</span>
              </span>
              {hasSub ? (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--xd-ink-muted)]" />
              ) : (
                item.shortcut && (
                  <kbd className="xd-mono shrink-0 text-[10.5px] text-[var(--xd-ink-muted)]">
                    {item.shortcut}
                  </kbd>
                )
              )}
            </button>

            {hasSub && hoveredSubmenu === item.id && item.submenu && (
              <div
                role="menu"
                className="absolute top-0 left-full ml-1 min-w-[176px] rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] p-1 shadow-lg"
              >
                {item.submenu.map((sub) =>
                  sub.divider ? (
                    <div
                      key={sub.id}
                      role="separator"
                      className="my-1 h-px bg-[var(--xd-border)]"
                    />
                  ) : (
                    <button
                      key={sub.id}
                      type="button"
                      role="menuitem"
                      disabled={sub.disabled}
                      onClick={() => {
                        if (sub.disabled) return
                        sub.onSelect?.()
                        onClose()
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-xs px-2 py-1.5 text-left text-[12px] text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)] disabled:opacity-40"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[var(--xd-ink-muted)]">
                          {sub.checked ? (
                            <Check className="h-3.5 w-3.5 text-[var(--xd-accent)]" />
                          ) : (
                            sub.icon
                          )}
                        </span>
                        <span className="truncate">{sub.label}</span>
                      </span>
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ============================================================================
   AppMenuBar — Google Docs / Google Slides Top Application Menu Bar
   ============================================================================ */

export interface MenuBarGroup {
  id: string
  label: string
  items: ContextMenuItem[]
}

export interface AppMenuBarProps {
  menus: MenuBarGroup[]
  className?: string
}

export function AppMenuBar({ menus, className }: AppMenuBarProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!openMenuId) return
    function onDown(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenuId(null)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenuId(null)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [openMenuId])

  return (
    <div
      ref={barRef}
      role="menubar"
      aria-label="Application menu"
      className={cn(
        'flex items-center gap-0.5 select-none text-[12px]',
        className,
      )}
    >
      {menus.map((menu) => {
        const isOpen = openMenuId === menu.id
        return (
          <div key={menu.id} className="relative">
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={isOpen}
              onClick={() => setOpenMenuId(isOpen ? null : menu.id)}
              onMouseEnter={() => {
                if (openMenuId) setOpenMenuId(menu.id)
              }}
              className={cn(
                'rounded px-2 py-0.5 text-[12px] transition-colors',
                isOpen
                  ? 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]'
                  : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
              )}
            >
              {menu.label}
            </button>

            {isOpen && (
              <div
                role="menu"
                aria-label={menu.label}
                className="absolute top-full left-0 z-50 mt-1 min-w-[230px] rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] p-1 text-[12px] text-[var(--xd-ink)] shadow-lg"
              >
                {menu.items.map((item) => {
                  if (item.divider) {
                    return (
                      <div
                        key={item.id}
                        role="separator"
                        className="my-1 h-px bg-[var(--xd-border)]"
                      />
                    )
                  }
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      disabled={item.disabled}
                      onClick={() => {
                        if (item.disabled) return
                        item.onSelect?.()
                        setOpenMenuId(null)
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-4 rounded-xs px-2 py-1.5 text-left transition-colors disabled:pointer-events-none disabled:opacity-40',
                        item.danger
                          ? 'text-[var(--xd-danger)] hover:bg-[var(--xd-danger-soft)]'
                          : 'text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)]',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[var(--xd-ink-muted)]">
                          {item.checked ? (
                            <Check className="h-3.5 w-3.5 text-[var(--xd-accent)]" />
                          ) : (
                            item.icon
                          )}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.shortcut && (
                        <kbd className="xd-mono shrink-0 text-[10.5px] text-[var(--xd-ink-muted)]">
                          {item.shortcut}
                        </kbd>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ============================================================================
   Toolbar Primitives — Crisp 1px xDrive Formatting Controls
   ============================================================================ */

export interface ToolbarButtonProps {
  active?: boolean
  disabled?: boolean
  title: string
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  onMouseDown?: (e: React.MouseEvent<HTMLButtonElement>) => void
  children: React.ReactNode
  className?: string
  'aria-label'?: string
}

export function ToolbarButton({
  active = false,
  disabled = false,
  title,
  onClick,
  onMouseDown,
  children,
  className,
  'aria-label': ariaLabel,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel ?? title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={onMouseDown}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded px-1.5 text-[12px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-35',
        active
          ? 'bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]'
          : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function ToolbarDivider({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'mx-0.5 h-4 w-px shrink-0 bg-[var(--xd-border)]',
        className,
      )}
    />
  )
}

export interface ToolbarDropdownProps {
  trigger: React.ReactNode
  title: string
  children: (close: () => void) => React.ReactNode
  align?: 'left' | 'right'
  className?: string
  panelClassName?: string
  disabled?: boolean
}

export function ToolbarDropdown({
  trigger,
  title,
  children,
  align = 'left',
  className,
  panelClassName,
  disabled = false,
}: ToolbarDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className={cn('relative inline-flex', className)}>
      <button
        type="button"
        title={title}
        aria-label={title}
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'inline-flex h-7 items-center gap-1 rounded px-2 text-[12px] text-[var(--xd-ink-secondary)] transition-colors hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] disabled:pointer-events-none disabled:opacity-35',
          open && 'bg-[var(--xd-surface-active)] text-[var(--xd-ink)]',
        )}
      >
        {trigger}
        <ChevronDown className="h-3 w-3 shrink-0 text-[var(--xd-ink-muted)]" />
      </button>

      {open && (
        <div
          className={cn(
            'absolute top-full z-50 mt-1 rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] p-1 text-[12px] text-[var(--xd-ink)] shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
            panelClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/* ============================================================================
   ColorPalettePopover — Swatch Grid for Text, Highlight, Fill & Border
   ============================================================================ */

export const XDRIVE_EDITOR_SWATCHES = [
  '#f3f5f8',
  '#a2abb8',
  '#6e7785',
  '#22252e',
  '#0f131a',
  '#ffffff',
  '#5e6ad2',
  '#4e5ac0',
  '#3b82f6',
  '#06b6d4',
  '#2ea071',
  '#1f9d6b',
  '#e59934',
  '#d9822b',
  '#e5484d',
  '#ec4899',
  '#8b5cf6',
  '#161920',
]

export interface ColorPalettePopoverProps {
  title: string
  value: string
  onChange: (color: string) => void
  icon: React.ReactNode
  swatches?: string[]
  allowClear?: boolean
  clearLabel?: string
  disabled?: boolean
}

export function ColorPalettePopover({
  title,
  value,
  onChange,
  icon,
  swatches = XDRIVE_EDITOR_SWATCHES,
  allowClear = true,
  clearLabel = 'Reset color',
  disabled = false,
}: ColorPalettePopoverProps) {
  return (
    <ToolbarDropdown
      title={title}
      disabled={disabled}
      panelClassName="w-[184px] p-2"
      trigger={
        <span className="flex flex-col items-center justify-center leading-none">
          {icon}
          <span
            className="mt-0.5 h-[2.5px] w-3.5 rounded-full"
            style={{
              backgroundColor:
                value === 'transparent' || !value
                  ? 'var(--xd-ink-muted)'
                  : value,
            }}
          />
        </span>
      }
    >
      {(close) => (
        <div className="space-y-2">
          <div className="grid grid-cols-6 gap-1.5">
            {swatches.map((hex) => {
              const selected = value.toLowerCase() === hex.toLowerCase()
              return (
                <button
                  key={hex}
                  type="button"
                  title={hex}
                  aria-label={`Color ${hex}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(hex)
                    close()
                  }}
                  style={{ backgroundColor: hex }}
                  className={cn(
                    'h-5 w-5 rounded-xs border transition-transform hover:scale-110',
                    selected
                      ? 'border-[var(--xd-accent)] ring-1 ring-[var(--xd-accent)]'
                      : 'border-[var(--xd-border-strong)]',
                  )}
                />
              )
            })}
          </div>
          {allowClear && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange('transparent')
                close()
              }}
              className="w-full rounded border border-[var(--xd-border)] py-1 text-center text-[11px] text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]"
            >
              {clearLabel}
            </button>
          )}
        </div>
      )}
    </ToolbarDropdown>
  )
}

/* ============================================================================
   FontSizeControl — Stepper + Direct Input (Google Docs / Slides style)
   ============================================================================ */

export interface FontSizeControlProps {
  value: number
  min?: number
  max?: number
  onChange: (size: number) => void
  disabled?: boolean
}

export function FontSizeControl({
  value,
  min = 8,
  max = 96,
  onChange,
  disabled = false,
}: FontSizeControlProps) {
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)))

  return (
    <div className="inline-flex h-7 items-center rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)]">
      <button
        type="button"
        title="Decrease font size"
        aria-label="Decrease font size"
        disabled={disabled || value <= min}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onChange(clamp(value - 1))}
        className="inline-flex h-full w-5 items-center justify-center text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] disabled:opacity-35"
      >
        <Minus className="h-3 w-3" />
      </button>
      <input
        type="number"
        aria-label="Font size"
        disabled={disabled}
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const parsed = Number(e.target.value)
          if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
            onChange(clamp(parsed))
          }
        }}
        className="xd-tabular h-full w-8 border-x border-[var(--xd-border)] bg-transparent text-center text-[11.5px] font-medium text-[var(--xd-ink)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        title="Increase font size"
        aria-label="Increase font size"
        disabled={disabled || value >= max}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onChange(clamp(value + 1))}
        className="inline-flex h-full w-5 items-center justify-center text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)] disabled:opacity-35"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  )
}

/* ============================================================================
   TableGridPicker — Interactive NxM Table Inserter
   ============================================================================ */

export interface TableGridPickerProps {
  onSelect: (rows: number, cols: number) => void
  maxRows?: number
  maxCols?: number
}

export function TableGridPicker({
  onSelect,
  maxRows = 6,
  maxCols = 6,
}: TableGridPickerProps) {
  const [hover, setHover] = useState({ r: 3, c: 3 })

  return (
    <div className="p-2">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${maxCols}, 18px)` }}
      >
        {Array.from({ length: maxRows * maxCols }).map((_, idx) => {
          const r = Math.floor(idx / maxCols) + 1
          const c = (idx % maxCols) + 1
          const active = r <= hover.r && c <= hover.c
          return (
            <button
              key={`${r}-${c}`}
              type="button"
              aria-label={`Insert ${r} by ${c} table`}
              onMouseEnter={() => setHover({ r, c })}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(r, c)}
              className={cn(
                'h-[18px] w-[18px] rounded-[2px] border transition-colors',
                active
                  ? 'border-[var(--xd-accent)] bg-[var(--xd-accent-soft)]'
                  : 'border-[var(--xd-border-strong)] bg-[var(--xd-canvas)]',
              )}
            />
          )
        })}
      </div>
      <div className="xd-tabular mt-2 text-center text-[11px] text-[var(--xd-ink-muted)]">
        {hover.r} × {hover.c} table
      </div>
    </div>
  )
}
