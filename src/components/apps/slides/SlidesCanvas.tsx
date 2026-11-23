import React, { useRef, useState } from 'react'
import { cn } from '#/lib/utils'
import type { SlideElement, SlidePage, SlideThemeSpec } from './types'

export interface SlideCanvasProps {
  slide: SlidePage
  theme: SlideThemeSpec
  interactive?: boolean
  readOnly?: boolean
  showGrid?: boolean
  selectedElementId?: string | null
  onSelectElement?: (id: string | null) => void
  onUpdateElement?: (id: string, patch: Partial<SlideElement>) => void
  className?: string
}

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const HANDLES: Array<{ dir: HandleDir; posClass: string; cursor: string }> = [
  { dir: 'nw', posClass: '-top-1 -left-1', cursor: 'nwse-resize' },
  {
    dir: 'n',
    posClass: '-top-1 left-1/2 -translate-x-1/2',
    cursor: 'ns-resize',
  },
  { dir: 'ne', posClass: '-top-1 -right-1', cursor: 'nesw-resize' },
  {
    dir: 'e',
    posClass: 'top-1/2 -right-1 -translate-y-1/2',
    cursor: 'ew-resize',
  },
  { dir: 'se', posClass: '-right-1 -bottom-1', cursor: 'nwse-resize' },
  {
    dir: 's',
    posClass: '-bottom-1 left-1/2 -translate-x-1/2',
    cursor: 'ns-resize',
  },
  { dir: 'sw', posClass: '-bottom-1 -left-1', cursor: 'nesw-resize' },
  {
    dir: 'w',
    posClass: 'top-1/2 -left-1 -translate-y-1/2',
    cursor: 'ew-resize',
  },
]

export function SlideCanvas({
  slide,
  theme,
  interactive = false,
  readOnly = false,
  showGrid = false,
  selectedElementId = null,
  onSelectElement,
  onUpdateElement,
  className,
}: SlideCanvasProps) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const bgColor = slide.background || theme.surface

  function startDrag(e: React.PointerEvent, el: SlideElement) {
    if (!interactive || readOnly || editingId === el.id) return
    if (e.button !== 0) return
    e.stopPropagation()
    onSelectElement?.(el.id)
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const origX = el.x
    const origY = el.y

    function onMove(ev: PointerEvent) {
      const dxPct = ((ev.clientX - startX) / rect.width) * 100
      const dyPct = ((ev.clientY - startY) / rect.height) * 100
      const nx = Math.max(
        -5,
        Math.min(98 - el.w, Math.round((origX + dxPct) * 2) / 2),
      )
      const ny = Math.max(
        -5,
        Math.min(98 - el.h, Math.round((origY + dyPct) * 2) / 2),
      )
      onUpdateElement?.(el.id, { x: nx, y: ny })
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function startResize(
    e: React.PointerEvent,
    el: SlideElement,
    dir: HandleDir,
  ) {
    if (!interactive || readOnly) return
    e.stopPropagation()
    e.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const { x, y, w, h } = el

    function onMove(ev: PointerEvent) {
      const dx = ((ev.clientX - startX) / rect.width) * 100
      const dy = ((ev.clientY - startY) / rect.height) * 100
      let nx = x
      let ny = y
      let nw = w
      let nh = h

      if (dir.includes('e')) nw = Math.max(6, w + dx)
      if (dir.includes('s')) nh = Math.max(4, h + dy)
      if (dir.includes('w')) {
        const clamped = Math.min(w - 6, dx)
        nx = x + clamped
        nw = w - clamped
      }
      if (dir.includes('n')) {
        const clamped = Math.min(h - 4, dy)
        ny = y + clamped
        nh = h - clamped
      }
      onUpdateElement?.(el.id, {
        x: Math.round(nx * 2) / 2,
        y: Math.round(ny * 2) / 2,
        w: Math.round(nw * 2) / 2,
        h: Math.round(nh * 2) / 2,
      })
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      ref={stageRef}
      data-marble-id={interactive ? `pane-${slide.id}` : undefined}
      onPointerDown={() => {
        if (interactive) {
          setEditingId(null)
          onSelectElement?.(null)
        }
      }}
      style={{
        backgroundColor: bgColor,
        color: theme.ink,
        fontFamily: theme.bodyFont,
        backgroundImage: showGrid
          ? `linear-gradient(to right, ${theme.border} 1px, transparent 1px), linear-gradient(to bottom, ${theme.border} 1px, transparent 1px)`
          : undefined,
        backgroundSize: showGrid ? '5% 8.88%' : undefined,
      }}
      className={cn(
        'relative h-full w-full overflow-hidden select-none',
        className,
      )}
    >
      {slide.elements.map((el) => {
        const isSelected = interactive && selectedElementId === el.id
        const isEditing = interactive && editingId === el.id
        const isHeadline = (el.fontSize ?? 18) >= 28
        const fontFamily =
          el.fontFamily || (isHeadline ? theme.headingFont : theme.bodyFont)

        return (
          <div
            key={el.id}
            data-marble-id={interactive ? el.id : undefined}
            onPointerDown={(e) => startDrag(e, el)}
            onDoubleClick={(e) => {
              if (!interactive || readOnly) return
              if (el.kind === 'text' || el.kind === 'shape') {
                e.stopPropagation()
                onSelectElement?.(el.id)
                setEditingId(el.id)
              }
            }}
            style={{
              left: `${el.x}%`,
              top: `${el.y}%`,
              width: `${el.w}%`,
              height: `${el.h}%`,
              opacity: el.opacity ?? 1,
              transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
            }}
            className={cn(
              'absolute',
              interactive && !readOnly && !isEditing && 'cursor-move',
              isSelected && 'outline outline-2 outline-[var(--xd-accent)]',
            )}
          >
            {/* TEXT ELEMENT */}
            {el.kind === 'text' && (
              <div
                style={{
                  fontFamily,
                  fontSize: `${el.fontSize ?? 18}px`,
                  fontWeight:
                    el.fontWeight === 'bold'
                      ? 700
                      : el.fontWeight === 'semibold'
                        ? 600
                        : el.fontWeight === 'medium'
                          ? 500
                          : 400,
                  fontStyle: el.italic ? 'italic' : 'normal',
                  textDecoration: el.underline ? 'underline' : 'none',
                  color: el.color || theme.ink,
                  textAlign: el.align || 'left',
                  lineHeight: isHeadline ? 1.15 : 1.45,
                  letterSpacing: isHeadline ? '-0.02em' : '-0.006em',
                }}
                className="h-full w-full overflow-hidden px-1 py-0.5 whitespace-pre-wrap"
              >
                {isEditing ? (
                  <textarea
                    autoFocus
                    value={el.text ?? ''}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      onUpdateElement?.(el.id, { text: e.target.value })
                    }
                    onBlur={() => setEditingId(null)}
                    style={{ textAlign: el.align || 'left' }}
                    className="h-full w-full resize-none bg-transparent outline-none"
                  />
                ) : (
                  el.text || (interactive ? 'Double-click to edit' : '')
                )}
              </div>
            )}

            {/* SHAPE ELEMENT */}
            {el.kind === 'shape' && (
              <div
                style={{
                  backgroundColor: el.fill || theme.card,
                  borderColor: el.borderColor || theme.border,
                  borderWidth: `${el.borderWidth ?? 1}px`,
                  borderStyle: 'solid',
                  borderRadius:
                    el.shapeKind === 'ellipse'
                      ? '9999px'
                      : el.shapeKind === 'rounded' || el.shapeKind === 'callout'
                        ? `${el.borderRadius ?? 8}px`
                        : '2px',
                  clipPath:
                    el.shapeKind === 'diamond'
                      ? 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)'
                      : el.shapeKind === 'arrow'
                        ? 'polygon(0% 28%, 68% 28%, 68% 8%, 100% 50%, 68% 92%, 68% 72%, 0% 72%)'
                        : undefined,
                  color: el.color || theme.ink,
                  fontFamily,
                  fontSize: `${el.fontSize ?? 16}px`,
                  fontWeight:
                    el.fontWeight === 'bold'
                      ? 700
                      : el.fontWeight === 'semibold'
                        ? 600
                        : 400,
                  textAlign: el.align || 'left',
                }}
                className="flex h-full w-full flex-col justify-center overflow-hidden p-4 whitespace-pre-wrap"
              >
                {isEditing ? (
                  <textarea
                    autoFocus
                    value={el.text ?? ''}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      onUpdateElement?.(el.id, { text: e.target.value })
                    }
                    onBlur={() => setEditingId(null)}
                    className="h-full w-full resize-none bg-transparent outline-none"
                  />
                ) : (
                  el.text
                )}
              </div>
            )}

            {/* LINE ELEMENT */}
            {el.kind === 'line' && (
              <div className="flex h-full w-full items-center">
                <div
                  style={{
                    height: `${Math.max(1, el.borderWidth ?? 2)}px`,
                    backgroundColor: el.borderColor || theme.accent,
                  }}
                  className="w-full"
                />
              </div>
            )}

            {/* CHART ELEMENT */}
            {el.kind === 'chart' && (
              <div
                style={{
                  backgroundColor: el.fill || theme.card,
                  borderColor: el.borderColor || theme.border,
                }}
                className="flex h-full w-full flex-col rounded-md border p-4"
              >
                <svg
                  viewBox="0 0 600 220"
                  className="h-full w-full"
                  role="img"
                  aria-label="Slide bar chart"
                >
                  <line
                    x1="36"
                    y1="184"
                    x2="564"
                    y2="184"
                    stroke={theme.border}
                    strokeWidth="1.5"
                  />
                  {(el.chartData ?? []).map((datum, idx, arr) => {
                    const max = Math.max(1, ...arr.map((d) => d.value))
                    const slot = 500 / Math.max(1, arr.length)
                    const barW = Math.min(76, slot * 0.52)
                    const barH = Math.max(8, (datum.value / max) * 140)
                    const x = 50 + idx * slot + (slot - barW) / 2
                    const y = 184 - barH
                    return (
                      <g key={`${datum.label}-${idx}`}>
                        <rect
                          x={x}
                          y={y}
                          width={barW}
                          height={barH}
                          rx="4"
                          fill={datum.highlight ? theme.good : theme.accent}
                        />
                        <text
                          x={x + barW / 2}
                          y={y - 8}
                          textAnchor="middle"
                          fontSize="13"
                          fontFamily="'JetBrains Mono', monospace"
                          fill={theme.ink}
                        >
                          {datum.value}
                        </text>
                        <text
                          x={x + barW / 2}
                          y="206"
                          textAnchor="middle"
                          fontSize="13"
                          fill={theme.muted}
                        >
                          {datum.label}
                        </text>
                      </g>
                    )
                  })}
                </svg>
              </div>
            )}

            {/* TABLE ELEMENT */}
            {el.kind === 'table' && el.tableData && (
              <div
                style={{
                  borderColor: el.borderColor || theme.border,
                  backgroundColor: el.fill || theme.card,
                }}
                className="h-full w-full overflow-hidden rounded-md border"
              >
                <table className="h-full w-full border-collapse text-left text-[14px]">
                  <tbody>
                    {el.tableData.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        style={{
                          backgroundColor:
                            rIdx === 0 ? theme.surface : 'transparent',
                          borderBottom: `1px solid ${theme.border}`,
                        }}
                      >
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            style={{
                              borderRight:
                                cIdx < row.length - 1
                                  ? `1px solid ${theme.border}`
                                  : undefined,
                              fontWeight: rIdx === 0 ? 600 : 400,
                              color: rIdx === 0 ? theme.muted : theme.ink,
                            }}
                            className="px-3 py-2 align-middle"
                          >
                            {interactive && !readOnly ? (
                              <input
                                value={cell}
                                onPointerDown={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  const nextRows = (el.tableData ?? []).map(
                                    (r, ri) =>
                                      ri === rIdx
                                        ? r.map((v, ci) =>
                                            ci === cIdx ? e.target.value : v,
                                          )
                                        : r,
                                  )
                                  onUpdateElement?.(el.id, {
                                    tableData: nextRows,
                                  })
                                }}
                                className="w-full bg-transparent outline-none"
                              />
                            ) : (
                              cell
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* IMAGE ELEMENT */}
            {el.kind === 'image' && (
              <div
                style={{
                  borderColor: el.borderColor || theme.border,
                  backgroundColor: theme.card,
                }}
                className="flex h-full w-full items-center justify-center overflow-hidden rounded-md border"
              >
                {el.imageUrl ? (
                  <img
                    src={el.imageUrl}
                    alt={el.text || 'Slide image'}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="p-4 text-center">
                    <div className="text-[15px] font-medium">
                      {el.text || 'Figure placeholder'}
                    </div>
                    <div
                      style={{ color: theme.muted }}
                      className="mt-1 text-[12px]"
                    >
                      Set image URL in Format Options
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 8-POINT RESIZE HANDLES */}
            {isSelected && !readOnly && !isEditing && (
              <>
                {HANDLES.map((h) => (
                  <button
                    key={h.dir}
                    type="button"
                    aria-label={`Resize ${h.dir}`}
                    onPointerDown={(e) => startResize(e, el, h.dir)}
                    style={{ cursor: h.cursor }}
                    className={cn(
                      'absolute z-20 h-2.5 w-2.5 rounded-[2px] border border-[var(--xd-accent)] bg-[var(--xd-canvas)]',
                      h.posClass,
                    )}
                  />
                ))}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
