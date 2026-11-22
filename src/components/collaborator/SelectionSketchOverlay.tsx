import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import {
  ArrowUpRight,
  Eraser,
  MessageSquare,
  PenTool,
  Send,
  Square,
} from 'lucide-react'
import type {
  CanvasInteractionMode,
  SelectedMarbleElement,
  SharePermissionLevel,
  SketchAnnotation,
  SketchStroke,
} from '#/lib/types'
import {
  FloatingPromptBar,
  PROMPT_MODELS,
  resolveModel,
} from '#/components/collaborator/FloatingPromptBar'
import type {
  ConnectedModelOption,
  FloatingPromptBarHandle,
  MarbleIntentRequest,
} from '#/components/collaborator/FloatingPromptBar'
import {
  aiIsBlocked,
  permissionByLevel,
} from '#/components/collaborator/ShareModal'
import { cn } from '#/lib/utils'

export interface StageNode {
  id: string
  tagName: string
  textPreview: string
  sourceSlice: string
  affordances: string[]
  rect: { left: number; top: number; width: number; height: number }
}

export const DEMO_STAGE_NODES: StageNode[] = [
  {
    id: 'h-title',
    tagName: 'h1',
    textPreview: 'Fault-tolerant lattice surgery',
    sourceSlice:
      '<h1 data-marble-id="h-title" data-marble-editable>Fault-tolerant lattice surgery</h1>',
    affordances: ['data-marble-editable'],
    rect: { left: 6, top: 8, width: 88, height: 9 },
  },
  {
    id: 'sec-abstract',
    tagName: 'section',
    textPreview: 'We give a distance-preserving lattice surgery schedule…',
    sourceSlice: '<section data-marble-id="sec-abstract" data-marble-editable>',
    affordances: ['data-marble-editable'],
    rect: { left: 6, top: 18, width: 88, height: 15 },
  },
  {
    id: 'eq-bell',
    tagName: 'figure',
    textPreview: '|ψ⟩ = (|00⟩ + |11⟩) / √2',
    sourceSlice: '<figure data-marble-id="eq-bell" data-marble-editable>',
    affordances: ['data-marble-editable'],
    rect: { left: 6, top: 34, width: 88, height: 12 },
  },
  {
    id: 'fig-1',
    tagName: 'figure',
    textPreview: 'Figure 1. Stabilizer weight during the merge.',
    sourceSlice:
      '<figure data-marble-id="fig-1" data-marble-selectable data-marble-resizable="wh">',
    affordances: ['data-marble-selectable', 'data-marble-resizable'],
    rect: { left: 6, top: 48, width: 43, height: 28 },
  },
  {
    id: 'tbl-results',
    tagName: 'table',
    textPreview: 'Round · defects · kept',
    sourceSlice:
      '<table data-marble-id="tbl-results" data-marble-sortable="rows">',
    affordances: ['data-marble-sortable'],
    rect: { left: 51, top: 48, width: 43, height: 28 },
  },
  {
    id: 'sec-method',
    tagName: 'section',
    textPreview: 'Lattice surgery proceeds by merging two patches…',
    sourceSlice: '<section data-marble-id="sec-method" data-marble-editable>',
    affordances: ['data-marble-editable'],
    rect: { left: 6, top: 78, width: 88, height: 16 },
  },
]

export function toSelectedElement(node: StageNode): SelectedMarbleElement {
  return {
    id: node.id,
    tagName: node.tagName,
    textPreview: node.textPreview,
    sourceSlice: node.sourceSlice,
    affordances: node.affordances,
    rect: { ...node.rect },
  }
}

export const SKETCH_COLORS = [
  { id: 'amber', value: '#e59934', label: 'Amber' },
  { id: 'cobalt', value: '#5e6ad2', label: 'Cobalt' },
  { id: 'emerald', value: '#2ea071', label: 'Emerald' },
  { id: 'crimson', value: '#e5484d', label: 'Crimson' },
] as const

type SketchTool = 'pen' | 'arrow' | 'highlight' | 'callout'
type Corner = 'nw' | 'ne' | 'sw' | 'se'
type LookId = 'manuscript' | 'notes' | 'proof'

interface Point {
  x: number
  y: number
}

interface NormBox {
  x: number
  y: number
  w: number
  h: number
}

interface LiveDrag {
  kind: 'marquee' | 'pen' | 'arrow' | 'highlight' | 'scale'
  origin: Point
  current: Point
  points: Point[]
  shift: boolean
  corner?: Corner
  startBox?: NormBox
}

let markSeq = 0

function nextMarkId(): string {
  markSeq += 1
  return `mark-${markSeq.toString(36)}-${Date.now().toString(36)}`
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function nodeBox(node: StageNode): NormBox {
  return {
    x: node.rect.left / 100,
    y: node.rect.top / 100,
    w: node.rect.width / 100,
    h: node.rect.height / 100,
  }
}

function intersects(a: NormBox, b: NormBox): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  )
}

function boxFromCorners(a: Point, b: Point): NormBox {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  }
}

function boundsOf(points: Point[]): NormBox {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  return {
    x: clamp01(minX),
    y: clamp01(minY),
    w: Math.max(0.01, clamp01(maxX) - clamp01(minX)),
    h: Math.max(0.01, clamp01(maxY) - clamp01(minY)),
  }
}

function unionBoxes(boxes: NormBox[]): NormBox | null {
  if (boxes.length === 0) return null
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.w))
  const bottom = Math.max(...boxes.map((box) => box.y + box.h))
  return { x, y, w: right - x, h: bottom - y }
}

function coveredIds(nodes: StageNode[], box: NormBox): string[] {
  return nodes
    .filter((node) => intersects(nodeBox(node), box))
    .map((node) => node.id)
}

function idsAtPoint(nodes: StageNode[], point: Point): string[] {
  return nodes
    .filter((node) => {
      const box = nodeBox(node)
      return (
        point.x >= box.x &&
        point.x <= box.x + box.w &&
        point.y >= box.y &&
        point.y <= box.y + box.h
      )
    })
    .map((node) => node.id)
}

function scaleFromCorner(
  start: NormBox,
  corner: Corner,
  point: Point,
): { box: NormBox; gesture: { x: number; y: number } } {
  const anchor = {
    x: corner === 'nw' || corner === 'sw' ? start.x + start.w : start.x,
    y: corner === 'nw' || corner === 'ne' ? start.y + start.h : start.y,
  }
  const x = clamp01(Math.min(anchor.x, point.x))
  const y = clamp01(Math.min(anchor.y, point.y))
  const w = Math.max(0.04, Math.min(1 - x, Math.abs(point.x - anchor.x)))
  const h = Math.max(0.04, Math.min(1 - y, Math.abs(point.y - anchor.y)))
  return {
    box: { x, y, w, h },
    gesture: { x: w / Math.max(0.04, start.w), y: h / Math.max(0.04, start.h) },
  }
}

function boxStyle(box: NormBox): CSSProperties {
  return {
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.w * 100}%`,
    height: `${box.h * 100}%`,
  }
}

function paintPen(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  width: number,
  height: number,
) {
  if (points.length < 2) return
  ctx.beginPath()
  ctx.strokeStyle = color
  ctx.lineWidth = 2.25
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.moveTo(points[0].x * width, points[0].y * height)
  for (const point of points.slice(1))
    ctx.lineTo(point.x * width, point.y * height)
  ctx.stroke()
}

const TOOLS: Array<{ id: SketchTool; label: string; icon: ReactNode }> = [
  { id: 'pen', label: 'Pen', icon: <PenTool className="size-3.5" /> },
  { id: 'arrow', label: 'Arrow', icon: <ArrowUpRight className="size-3.5" /> },
  {
    id: 'highlight',
    label: 'Box',
    icon: <Square className="size-3.5" />,
  },
  {
    id: 'callout',
    label: 'Note',
    icon: <MessageSquare className="size-3.5" />,
  },
]

const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se']

export interface SelectionSketchOverlayProps {
  mode?: CanvasInteractionMode
  nodes?: StageNode[]
  permission?: SharePermissionLevel
  models?: ConnectedModelOption[]
  modelId?: string
  onModelChange?: (modelId: string) => void
  selectedIds?: string[]
  initialSelectedIds?: string[]
  onSelectedIdsChange?: (ids: string[]) => void
  sketches?: SketchAnnotation[]
  onSketchesChange?: (
    sketches: SketchAnnotation[],
    strokes: SketchStroke[],
  ) => void
  onIntent?: (request: MarbleIntentRequest) => void
  fileName?: string
  className?: string
  children?: ReactNode
}

export function SelectionSketchOverlay({
  mode = 'select',
  nodes = DEMO_STAGE_NODES,
  permission = 'edit_with_ai_shared',
  models = PROMPT_MODELS,
  modelId,
  onModelChange,
  selectedIds: selectedIdsProp,
  initialSelectedIds = [],
  onSelectedIdsChange,
  sketches: sketchesProp,
  onSketchesChange,
  onIntent,
  fileName = 'quantum-error-correction.mrbl',
  className,
  children,
}: SelectionSketchOverlayProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const promptRef = useRef<FloatingPromptBarHandle>(null)
  const dragRef = useRef<LiveDrag | null>(null)
  const livePenRef = useRef<Point[] | null>(null)
  const [localSelection, setLocalSelection] =
    useState<string[]>(initialSelectedIds)
  const [localSketches, setLocalSketches] = useState<SketchAnnotation[]>([])
  const [strokes, setStrokes] = useState<SketchStroke[]>([])
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes
  const [drag, setDrag] = useState<LiveDrag | null>(null)
  const [tool, setTool] = useState<SketchTool>('pen')
  const [color, setColor] = useState<string>(SKETCH_COLORS[0].value)
  const [prompt, setPrompt] = useState('')
  const [callout, setCallout] = useState<{ point: Point; text: string } | null>(
    null,
  )
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingIds, setPendingIds] = useState<string[]>([])
  const colorRef = useRef(color)
  colorRef.current = color

  const spec = permissionByLevel(permission)
  const blocked = aiIsBlocked(permission)
  const spatial = mode === 'select' || mode === 'sketch'
  const selection = selectedIdsProp ?? localSelection
  const annotations = sketchesProp ?? localSketches

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return
    const rect = stage.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const width = Math.max(1, rect.width)
    const height = Math.max(1, rect.height)
    const pixelWidth = Math.floor(width * dpr)
    const pixelHeight = Math.floor(height * dpr)
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth
      canvas.height = pixelHeight
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    for (const stroke of strokesRef.current) {
      if (stroke.tool === 'pen')
        paintPen(ctx, stroke.points, stroke.color, width, height)
    }
    if (livePenRef.current)
      paintPen(ctx, livePenRef.current, colorRef.current, width, height)
  }, [])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    redraw()
    const observer = new ResizeObserver(() => redraw())
    observer.observe(stage)
    return () => observer.disconnect()
  }, [redraw])

  useEffect(() => {
    redraw()
  }, [strokes, redraw])

  useEffect(() => {
    if (sketchesProp === undefined) return
    setStrokes((prev) => {
      const ids = new Set(sketchesProp.map((item) => item.id))
      const next = prev.filter((stroke) => ids.has(stroke.id))
      return next.length === prev.length ? prev : next
    })
  }, [sketchesProp])

  function updateSelection(next: string[]) {
    if (selectedIdsProp === undefined) setLocalSelection(next)
    onSelectedIdsChange?.(next)
  }

  function updateSketches(
    nextAnnotations: SketchAnnotation[],
    nextStrokes: SketchStroke[],
  ) {
    strokesRef.current = nextStrokes
    if (sketchesProp === undefined) setLocalSketches(nextAnnotations)
    setStrokes(nextStrokes)
    onSketchesChange?.(nextAnnotations, nextStrokes)
  }

  function publish(request: MarbleIntentRequest) {
    setPendingIds(request.targetIds)
    window.setTimeout(() => setPendingIds([]), 1600)
    onIntent?.(request)
    if (request.kind === 'scale' && request.gesture) {
      setNotice(
        `Scale ${request.gesture.x.toFixed(2)}×${request.gesture.y.toFixed(2)}`,
      )
      return
    }
    setNotice(request.instruction)
  }

  function toPoint(event: ReactPointerEvent<HTMLDivElement>): Point {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 }
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    }
  }

  function remember(mark: SketchStroke, annotation: SketchAnnotation) {
    updateSketches([...annotations, annotation], [...strokes, mark])
  }

  function finishDrag(live: LiveDrag) {
    if (live.kind === 'marquee') {
      const box = boxFromCorners(live.origin, live.current)
      if (box.w < 0.01 && box.h < 0.01) {
        if (!live.shift) updateSelection([])
        return
      }
      const hits = coveredIds(nodes, box)
      updateSelection(live.shift ? [...new Set([...selection, ...hits])] : hits)
      return
    }
    if (live.kind === 'scale' && live.startBox && live.corner) {
      const scaled = scaleFromCorner(live.startBox, live.corner, live.current)
      const changed =
        Math.abs(scaled.gesture.x - 1) > 0.04 ||
        Math.abs(scaled.gesture.y - 1) > 0.04
      if (!changed) return
      if (blocked) {
        setNotice(spec.blockReason)
        return
      }
      const model = resolveModel(models, modelId)
      if (model === null) return
      publish({
        id: nextMarkId(),
        kind: 'scale',
        instruction: `Restyle the selection from the corner drag (${scaled.gesture.x.toFixed(2)}, ${scaled.gesture.y.toFixed(2)}).`,
        targetIds: selection,
        modelId: model.id,
        providerId: model.providerId,
        gesture: scaled.gesture,
        sketches: annotations.length ? annotations : undefined,
      })
      return
    }
    if (
      live.kind === 'pen' ||
      live.kind === 'arrow' ||
      live.kind === 'highlight'
    ) {
      const points =
        live.kind === 'pen' ? live.points : [live.origin, live.current]
      if (points.length < 2) return
      const box = boundsOf(points)
      if (box.w < 0.008 && box.h < 0.008) return
      const ids = coveredIds(nodes, box)
      const id = nextMarkId()
      const strokeTool = live.kind === 'highlight' ? 'highlight' : live.kind
      remember(
        {
          id,
          tool: strokeTool,
          color,
          points,
          targetNodeId: ids[0],
        },
        {
          id,
          kind:
            live.kind === 'pen'
              ? 'freehand'
              : live.kind === 'arrow'
                ? 'arrow'
                : 'box',
          label: ids.length
            ? ids.map((nodeId) => `#${nodeId}`).join(' ')
            : strokeTool,
          boundingBox: { x: box.x, y: box.y, width: box.w, height: box.h },
          coveredNodeIds: ids,
          color,
        },
      )
    }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!spatial) return
    const target = event.target as HTMLElement
    if (target.closest('[data-overlay-chrome]')) return
    const point = toPoint(event)
    if (mode === 'select') {
      const corner = target.closest<HTMLElement>('[data-corner]')?.dataset
        .corner as Corner | undefined
      const selectedNodes = nodes.filter((node) => selection.includes(node.id))
      const union = unionBoxes(selectedNodes.map(nodeBox))
      if (corner && union) {
        const live: LiveDrag = {
          kind: 'scale',
          origin: point,
          current: point,
          points: [point],
          shift: event.shiftKey,
          corner,
          startBox: union,
        }
        dragRef.current = live
        setDrag(live)
        event.currentTarget.setPointerCapture(event.pointerId)
        return
      }
      if (target.closest('[data-node-id]')) return
      const live: LiveDrag = {
        kind: 'marquee',
        origin: point,
        current: point,
        points: [point],
        shift: event.shiftKey,
      }
      dragRef.current = live
      setDrag(live)
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    if (!spec.sketch) {
      setNotice(spec.blockReason)
      return
    }
    if (tool === 'callout') {
      setCallout({ point, text: '' })
      return
    }
    const live: LiveDrag = {
      kind: tool === 'pen' ? 'pen' : tool,
      origin: point,
      current: point,
      points: [point],
      shift: event.shiftKey,
    }
    dragRef.current = live
    setDrag(live)
    if (tool === 'pen') {
      livePenRef.current = live.points
      redraw()
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const live = dragRef.current
    if (!live) return
    const point = toPoint(event)
    live.current = point
    live.shift = event.shiftKey
    if (live.kind === 'pen') {
      const last = live.points.at(-1)
      if (
        last === undefined ||
        Math.hypot(point.x - last.x, point.y - last.y) >= 0.004
      ) {
        live.points.push(point)
        livePenRef.current = live.points
        redraw()
      }
      return
    }
    setDrag({ ...live, current: point, points: live.points })
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const live = dragRef.current
    if (!live) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    live.current = toPoint(event)
    live.shift = event.shiftKey
    finishDrag(live)
    dragRef.current = null
    livePenRef.current = null
    setDrag(null)
    redraw()
  }

  function commitCallout() {
    if (!callout) return
    const text = callout.text.trim() || 'Note'
    const ids = idsAtPoint(nodes, callout.point)
    const id = nextMarkId()
    const box = {
      x: clamp01(callout.point.x),
      y: clamp01(callout.point.y),
      w: 0.02,
      h: 0.02,
    }
    remember(
      {
        id,
        tool: 'callout',
        color,
        points: [callout.point],
        label: text,
        targetNodeId: ids[0],
      },
      {
        id,
        kind: 'callout',
        label: text,
        boundingBox: { x: box.x, y: box.y, width: 0.16, height: 0.06 },
        coveredNodeIds: ids,
        color,
      },
    )
    setCallout(null)
  }

  function clearSketch() {
    updateSketches([], [])
    setCallout(null)
    livePenRef.current = null
    redraw()
  }

  function sendSketch() {
    if (!spec.sketch || blocked) {
      setNotice(spec.blockReason)
      return
    }
    if (annotations.length === 0) {
      setNotice('Draw on the stage first.')
      return
    }
    if (!prompt.trim()) {
      setPrompt('Apply this sketch: build or modify the marked region.')
      promptRef.current?.focusPrompt()
      return
    }
    const model = resolveModel(models, modelId)
    if (model === null) return
    publish({
      id: nextMarkId(),
      kind: 'instruct',
      instruction: prompt.trim(),
      targetIds: [
        ...new Set([
          ...selection,
          ...annotations.flatMap((item) => item.coveredNodeIds),
        ]),
      ],
      modelId: model.id,
      providerId: model.providerId,
      sketches: annotations,
    })
    setPrompt('')
  }

  const selectedNodes = nodes.filter((node) => selection.includes(node.id))
  const selectionBox = unionBoxes(selectedNodes.map(nodeBox))
  const liveScale =
    drag?.kind === 'scale' && drag.startBox && drag.corner
      ? scaleFromCorner(drag.startBox, drag.corner, drag.current)
      : null
  const shownBox = liveScale?.box ?? selectionBox
  const sketchBox = unionBoxes(
    annotations.map((item) => ({
      x: item.boundingBox.x,
      y: item.boundingBox.y,
      w: item.boundingBox.width,
      h: item.boundingBox.height,
    })),
  )
  const anchor = shownBox ?? sketchBox
  const showBar = spatial && (selection.length > 0 || annotations.length > 0)
  const barStyle: CSSProperties = anchor
    ? {
        left: `clamp(8px, ${anchor.x * 100}%, calc(100% - 496px))`,
        top:
          anchor.y + anchor.h > 0.72
            ? undefined
            : `${(anchor.y + anchor.h) * 100}%`,
        bottom:
          anchor.y + anchor.h > 0.72 ? `${(1 - anchor.y) * 100}%` : undefined,
        marginTop: anchor.y + anchor.h > 0.72 ? undefined : 10,
      }
    : { left: '50%', bottom: 16, transform: 'translateX(-50%)' }

  return (
    <div
      ref={stageRef}
      data-component="selection-sketch-overlay"
      className={cn(
        'relative h-full min-h-[640px] w-full overflow-hidden bg-[var(--xd-canvas)]',
        className,
      )}
    >
      {children ?? <DemoMrblStage nodes={nodes} fileName={fileName} />}
      <div
        className={cn(
          'absolute inset-0 z-10',
          spatial ? 'touch-none' : 'pointer-events-none',
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          {strokes
            .filter(
              (stroke) =>
                stroke.tool === 'arrow' ||
                stroke.tool === 'highlight' ||
                stroke.tool === 'rect',
            )
            .map((stroke) =>
              stroke.tool === 'arrow' && stroke.points.length >= 2 ? (
                <ArrowShape
                  key={stroke.id}
                  from={stroke.points[0]}
                  to={stroke.points[stroke.points.length - 1]}
                  color={stroke.color}
                />
              ) : (
                <rect
                  key={stroke.id}
                  x={
                    Math.min(
                      stroke.points[0].x,
                      stroke.points[stroke.points.length - 1].x,
                    ) * 100
                  }
                  y={
                    Math.min(
                      stroke.points[0].y,
                      stroke.points[stroke.points.length - 1].y,
                    ) * 100
                  }
                  width={
                    Math.abs(
                      stroke.points[stroke.points.length - 1].x -
                        stroke.points[0].x,
                    ) * 100
                  }
                  height={
                    Math.abs(
                      stroke.points[stroke.points.length - 1].y -
                        stroke.points[0].y,
                    ) * 100
                  }
                  fill={stroke.color}
                  fillOpacity={0.28}
                  stroke={stroke.color}
                  strokeWidth={0.4}
                />
              ),
            )}
          {drag?.kind === 'arrow' && (
            <ArrowShape from={drag.origin} to={drag.current} color={color} />
          )}
          {drag?.kind === 'highlight' && (
            <rect
              x={Math.min(drag.origin.x, drag.current.x) * 100}
              y={Math.min(drag.origin.y, drag.current.y) * 100}
              width={Math.abs(drag.current.x - drag.origin.x) * 100}
              height={Math.abs(drag.current.y - drag.origin.y) * 100}
              fill={color}
              fillOpacity={0.28}
              stroke={color}
              strokeWidth={0.4}
            />
          )}
        </svg>

        {mode === 'select' &&
          nodes.map((node) => {
            const active = selection.includes(node.id)
            const pending = pendingIds.includes(node.id)
            return (
              <button
                key={node.id}
                type="button"
                data-node-id={node.id}
                title={`#${node.id}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  const next = event.shiftKey
                    ? selection.includes(node.id)
                      ? selection.filter((id) => id !== node.id)
                      : [...selection, node.id]
                    : [node.id]
                  updateSelection(next)
                }}
                className={cn(
                  'absolute z-20 rounded border text-left',
                  active
                    ? 'border-[var(--xd-accent)] bg-[var(--xd-accent-soft)]'
                    : 'border-transparent hover:border-[var(--xd-border-strong)]',
                  pending && 'border-dashed border-[var(--xd-sketch)]',
                )}
                style={{
                  left: `${node.rect.left}%`,
                  top: `${node.rect.top}%`,
                  width: `${node.rect.width}%`,
                  height: `${node.rect.height}%`,
                }}
              >
                <span className="xd-mono absolute top-1 left-1 rounded bg-[var(--xd-canvas)]/90 px-1 py-0.5 text-[10px] text-[var(--xd-accent)]">
                  #{node.id}
                </span>
              </button>
            )
          })}

        {mode === 'select' && drag?.kind === 'marquee' && (
          <div
            className="pointer-events-none absolute z-30 border border-[var(--xd-accent)] bg-[var(--xd-accent)]/10"
            style={boxStyle(boxFromCorners(drag.origin, drag.current))}
          />
        )}

        {mode === 'select' && shownBox && selection.length > 0 && (
          <div
            className="pointer-events-none absolute z-30 border-2 border-[var(--xd-accent)]"
            style={boxStyle(shownBox)}
          >
            {liveScale && (
              <span className="xd-tabular absolute -top-5 left-0 rounded bg-[var(--xd-accent)] px-1.5 py-0.5 text-[10px] text-white">
                {liveScale.gesture.x.toFixed(2)}×{liveScale.gesture.y.toFixed(2)}
              </span>
            )}
            {CORNERS.map((corner) => (
              <span
                key={corner}
                data-corner={corner}
                className="pointer-events-auto absolute size-2.5 border border-[var(--xd-accent)] bg-white"
                style={{
                  left: corner === 'nw' || corner === 'sw' ? 0 : '100%',
                  top: corner === 'nw' || corner === 'ne' ? 0 : '100%',
                  transform: 'translate(-50%, -50%)',
                  cursor:
                    corner === 'nw' || corner === 'se'
                      ? 'nwse-resize'
                      : 'nesw-resize',
                }}
              />
            ))}
          </div>
        )}

        {annotations
          .filter((item) => item.kind === 'callout')
          .map((item) => (
            <div
              key={item.id}
              data-overlay-chrome=""
              className="absolute z-30 max-w-[180px] rounded px-1.5 py-1 text-[11px] text-white shadow-md"
              style={{
                left: `${item.boundingBox.x * 100}%`,
                top: `${item.boundingBox.y * 100}%`,
                backgroundColor: item.color,
              }}
            >
              {item.label}
            </div>
          ))}

        {callout && (
          <form
            data-overlay-chrome=""
            className="absolute z-40 flex gap-1"
            style={{
              left: `${callout.point.x * 100}%`,
              top: `${callout.point.y * 100}%`,
            }}
            onSubmit={(event) => {
              event.preventDefault()
              commitCallout()
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <label className="sr-only" htmlFor="sketch-callout">
              Callout text
            </label>
            <input
              id="sketch-callout"
              autoFocus
              value={callout.text}
              onChange={(event) =>
                setCallout({ ...callout, text: event.target.value })
              }
              placeholder="Note..."
              className="h-7 w-36 rounded border border-[var(--xd-border-strong)] bg-[var(--xd-canvas)] px-2 text-[12px] text-[var(--xd-ink)] outline-none"
            />
            <button
              type="submit"
              className="h-7 rounded bg-[var(--xd-sketch)] px-2 text-[11px] font-medium text-black"
            >
              Add
            </button>
          </form>
        )}

        {mode === 'sketch' && (
          <div
            data-overlay-chrome=""
            className="absolute top-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-md border border-[var(--xd-border-strong)] bg-[var(--xd-elevated)] px-1.5 py-1 shadow-md"
            onPointerDown={(event) => event.stopPropagation()}
          >
            {TOOLS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={tool === item.id}
                disabled={!spec.sketch}
                onClick={() => setTool(item.id)}
                className={cn(
                  'inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium disabled:opacity-40',
                  tool === item.id
                    ? 'bg-[var(--xd-sketch-soft)] text-[var(--xd-sketch)]'
                    : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]',
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
            <span className="mx-1 h-3.5 w-px bg-[var(--xd-border)]" />
            {SKETCH_COLORS.map((swatch) => (
              <button
                key={swatch.id}
                type="button"
                aria-label={swatch.label}
                aria-pressed={color === swatch.value}
                disabled={!spec.sketch}
                onClick={() => setColor(swatch.value)}
                className={cn(
                  'size-4 rounded-full border-2 disabled:opacity-40',
                  color === swatch.value
                    ? 'border-[var(--xd-ink)]'
                    : 'border-transparent',
                )}
                style={{ backgroundColor: swatch.value }}
              />
            ))}
            <span className="mx-1 h-3.5 w-px bg-[var(--xd-border)]" />
            <button
              type="button"
              onClick={clearSketch}
              disabled={!spec.sketch || annotations.length === 0}
              className="inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)] disabled:opacity-40"
            >
              <Eraser className="size-3" />
              <span>Clear</span>
            </button>
            <button
              type="button"
              onClick={sendSketch}
              disabled={!spec.sketch || blocked || annotations.length === 0}
              className="inline-flex h-6 items-center gap-1 rounded bg-[var(--xd-sketch)] px-2 text-[11px] font-medium text-black disabled:opacity-40"
            >
              <Send className="size-3" />
              <span>Send</span>
            </button>
          </div>
        )}

        {mode === 'sketch' && !spec.sketch && spec.blockReason && (
          <p
            data-overlay-chrome=""
            className="absolute top-14 left-1/2 z-40 -translate-x-1/2 rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-1.5 text-[11.5px] text-[var(--xd-ink-secondary)]"
          >
            {spec.title} — Sketching is disabled
          </p>
        )}

        {showBar && (
          <div className="absolute z-40" style={barStyle}>
            <FloatingPromptBar
              handleRef={promptRef}
              selectedElements={selectedNodes.map(toSelectedElement)}
              sketches={annotations}
              models={models}
              modelId={modelId}
              onModelChange={onModelChange}
              permission={permission}
              prompt={prompt}
              onPromptChange={setPrompt}
              onIntent={publish}
            />
          </div>
        )}

        {notice && (
          <div
            className="pointer-events-none absolute bottom-3 left-3 z-40 max-w-sm"
            aria-live="polite"
          >
            <p className="truncate rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)]/95 px-2 py-1 text-[11px] text-[var(--xd-ink)] shadow-2xs">
              {notice}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function ArrowShape({
  from,
  to,
  color,
}: {
  from: Point
  to: Point
  color: string
}) {
  const x1 = from.x * 100
  const y1 = from.y * 100
  const x2 = to.x * 100
  const y2 = to.y * 100
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const size = 2.4
  const p1 = `${x2 - Math.cos(angle - 0.45) * size},${y2 - Math.sin(angle - 0.45) * size}`
  const p2 = `${x2 - Math.cos(angle + 0.45) * size},${y2 - Math.sin(angle + 0.45) * size}`
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={0.7} />
      <polygon points={`${x2},${y2} ${p1} ${p2}`} fill={color} />
    </g>
  )
}

export function DemoMrblStage({
  nodes = DEMO_STAGE_NODES,
  fileName = 'quantum-error-correction.mrbl',
}: {
  nodes?: StageNode[]
  fileName?: string
}) {
  const [look, setLook] = useState<LookId>('manuscript')
  return (
    <div className="absolute inset-0 bg-[var(--xd-canvas)]">
      <div className="absolute inset-x-0 top-0 flex h-[7%] items-center justify-between gap-3 px-4">
        <p className="xd-mono truncate text-[11px] text-[var(--xd-ink-muted)]">
          {fileName}
        </p>
        <div
          role="group"
          aria-label="data-marble-look"
          className="inline-flex rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] p-0.5"
        >
          {(['manuscript', 'notes', 'proof'] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={look === item}
              onClick={() => setLook(item)}
              className={cn(
                'rounded-xs px-2 py-0.5 text-[11px] capitalize',
                look === item
                  ? 'bg-[var(--xd-canvas)] text-[var(--xd-ink)]'
                  : 'text-[var(--xd-ink-secondary)]',
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      {nodes.map((node) => (
        <article
          key={node.id}
          data-marble-id={node.id}
          className="absolute overflow-hidden rounded border border-[var(--xd-border)] bg-[var(--xd-elevated)] px-3 py-2"
          style={{
            left: `${node.rect.left}%`,
            top: `${node.rect.top}%`,
            width: `${node.rect.width}%`,
            height: `${node.rect.height}%`,
          }}
        >
          <NodeFace node={node} look={look} />
        </article>
      ))}
    </div>
  )
}

function NodeFace({ node, look }: { node: StageNode; look: LookId }) {
  if (node.id === 'h-title') {
    return (
      <h1 className="xd-serif text-[20px] leading-tight font-medium">
        {look === 'notes'
          ? 'Margin: check the distance claim'
          : 'Fault-tolerant lattice surgery'}
      </h1>
    )
  }
  if (node.id === 'sec-abstract') {
    return (
      <p className="text-[12.5px] leading-snug text-[var(--xd-ink-secondary)]">
        {look === 'proof'
          ? 'Proof sketch. Merge, then measure the new stabilizers. The distance does not fall if the interface is prepared in |+⟩.'
          : 'We give a distance-preserving lattice surgery schedule for a Floquet surface code and show the interface can be checked without leaving the manuscript.'}
      </p>
    )
  }
  if (node.id === 'eq-bell') {
    return (
      <p className="xd-serif text-center text-[18px] leading-none">
        {look === 'proof' ? 'K_Z |ψ⟩ = |ψ⟩' : '|ψ⟩ = (|00⟩ + |11⟩) / √2'}
      </p>
    )
  }
  if (node.id === 'fig-1') {
    return (
      <div>
        <p className="text-[11px] font-medium">Figure 1. Stabilizer weight</p>
        <div className="mt-2 flex h-16 items-end gap-1.5">
          {[40, 70, 55, 88, 62].map((height, index) => (
            <span
              key={index}
              className="flex-1 rounded-xs bg-[var(--xd-accent)]/80"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </div>
    )
  }
  if (node.id === 'tbl-results') {
    return (
      <table className="w-full text-left text-[11.5px]">
        <thead className="text-[var(--xd-ink-muted)]">
          <tr>
            <th className="font-medium">Round</th>
            <th className="font-medium">Defects</th>
            <th className="font-medium">Kept</th>
          </tr>
        </thead>
        <tbody className="xd-tabular">
          <tr>
            <td>12</td>
            <td>3</td>
            <td>yes</td>
          </tr>
          <tr>
            <td>13</td>
            <td>1</td>
            <td>yes</td>
          </tr>
          <tr>
            <td>14</td>
            <td>6</td>
            <td>no</td>
          </tr>
        </tbody>
      </table>
    )
  }
  return (
    <p className="text-[12.5px] leading-snug text-[var(--xd-ink-secondary)]">
      {look === 'notes'
        ? 'Note. Wire this paragraph to the figure before asking for a chart.'
        : 'Lattice surgery proceeds by merging two patches along a prepared boundary, then splitting them once the stabilizers agree.'}
    </p>
  )
}
