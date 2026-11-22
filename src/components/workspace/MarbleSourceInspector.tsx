import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import type { MarbleOp, SelectedMarbleElement } from '#/lib/types'
import { applyMarbleOpsClient, inspectMarbleNodes } from '#/lib/marble'
import type { MarbleNodeRecord } from '#/lib/marble'
import { cn } from '#/lib/utils'

export interface MarbleSourceInspectorProps {
  fileName: string
  source: string
  selectedId?: string | null
  onSelectNode?: (element: SelectedMarbleElement) => void
  onApplySource?: (nextSource: string, ops: MarbleOp[]) => void
  className?: string
}

interface DoctorReport {
  errors: number
  warnings: number
  findings: string[]
}

const OP_TYPES = new Set<MarbleOp['type']>([
  'setText',
  'setInner',
  'setAttr',
  'insert',
  'move',
  'remove',
  'assignId',
])

function clip(text: string, max = 96): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1)}…`
}

export function nodeToElement(node: MarbleNodeRecord): SelectedMarbleElement {
  return {
    id: node.id,
    tagName: node.tagName,
    textPreview: clip(node.text, 140),
    sourceSlice: node.sourceSlice.slice(0, 480),
    affordances: node.affordances,
  }
}

function clientDoctor(source: string): DoctorReport {
  let nodes: MarbleNodeRecord[] = []
  try {
    nodes = inspectMarbleNodes(source)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Source did not parse'
    return { errors: 1, warnings: 0, findings: [message] }
  }
  const seen = new Set<string>()
  const findings: string[] = []
  for (const node of nodes) {
    if (!node.id.trim()) {
      findings.push('Empty data-marble-id')
      continue
    }
    if (seen.has(node.id))
      findings.push(`Duplicate data-marble-id “${node.id}”`)
    else seen.add(node.id)
  }
  return { errors: findings.length, warnings: 0, findings }
}

function isMarbleOp(value: unknown): value is MarbleOp {
  if (!value || typeof value !== 'object') return false
  const type = (value as { type?: unknown }).type
  return typeof type === 'string' && OP_TYPES.has(type as MarbleOp['type'])
}

function textDiffOps(prior: string, incoming: string): MarbleOp[] {
  let before: MarbleNodeRecord[] = []
  let after: MarbleNodeRecord[] = []
  try {
    before = inspectMarbleNodes(prior)
    after = inspectMarbleNodes(incoming)
  } catch {
    return []
  }
  const previous = new Map(before.map((node) => [node.id, node]))
  const ops: MarbleOp[] = []
  for (const node of after) {
    const priorNode = previous.get(node.id)
    if (!priorNode) continue
    const nextText = node.text.replace(/\s+/g, ' ').trim()
    const prevText = priorNode.text.replace(/\s+/g, ' ').trim()
    if (nextText !== prevText) {
      ops.push({ type: 'setText', id: node.id, text: nextText })
    }
  }
  return ops
}

export function MarbleSourceInspector({
  fileName,
  source,
  selectedId,
  onSelectNode,
  onApplySource,
  className,
}: MarbleSourceInspectorProps) {
  const [draft, setDraft] = useState(source)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [remote, setRemote] = useState<DoctorReport | null>(null)
  const doctorEpoch = useRef(0)

  useEffect(() => {
    setDraft(source)
    setNote(null)
  }, [source])

  const localReport = useMemo(() => clientDoctor(draft), [draft])
  const report = remote ?? localReport
  const nodes = useMemo(() => {
    try {
      return inspectMarbleNodes(draft)
    } catch {
      return []
    }
  }, [draft])

  useEffect(() => {
    setRemote(null)
    const epoch = doctorEpoch.current + 1
    doctorEpoch.current = epoch
    const controller = new AbortController()
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch('/api/marble', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              action: 'doctor',
              fileName,
              source: draft,
            }),
            signal: controller.signal,
          })
          if (!response.ok || doctorEpoch.current !== epoch) return
          const data: unknown = await response.json()
          if (
            doctorEpoch.current !== epoch ||
            data === null ||
            typeof data !== 'object'
          ) {
            return
          }
          const findings = (data as { findings?: unknown }).findings
          if (!Array.isArray(findings)) return
          let errors = 0
          let warnings = 0
          const lines: string[] = []
          for (const finding of findings) {
            if (finding === null || typeof finding !== 'object') continue
            const level = String((finding as { level?: unknown }).level ?? '')
            const message = String(
              (finding as { message?: unknown }).message ?? '',
            )
            if (level === 'error') errors += 1
            else warnings += 1
            if (message) lines.push(message)
          }
          if (doctorEpoch.current === epoch) {
            setRemote({ errors, warnings, findings: lines })
          }
        } catch {
          if (doctorEpoch.current === epoch) setRemote(null)
        }
      })()
    }, 320)
    return () => {
      doctorEpoch.current += 1
      controller.abort()
      window.clearTimeout(handle)
    }
  }, [draft, fileName])

  async function applyDiff() {
    if (draft === source || busy) return
    setBusy(true)
    setNote(null)
    try {
      let ops: MarbleOp[] = []
      try {
        const response = await fetch('/api/marble', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'diff',
            prior: source,
            incoming: draft,
          }),
        })
        if (response.ok) {
          const data: unknown = await response.json()
          const raw =
            data && typeof data === 'object'
              ? (data as { ops?: unknown }).ops
              : null
          if (Array.isArray(raw)) ops = raw.filter(isMarbleOp)
        }
      } catch {
        ops = []
      }
      if (ops.length === 0) ops = textDiffOps(source, draft)
      if (ops.length > 0) {
        const applied = applyMarbleOpsClient(source, ops)
        onApplySource?.(applied.source, ops)
        setNote(`Applied ${ops.length} op${ops.length === 1 ? '' : 's'}.`)
        return
      }
      const check = clientDoctor(draft)
      if (check.errors === 0) {
        onApplySource?.(draft, [])
        setNote('Saved.')
        return
      }
      setNote(check.findings[0] ?? 'Invalid node IDs.')
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Source diff failed')
    } finally {
      setBusy(false)
    }
  }

  const dirty = draft !== source

  return (
    <aside
      data-component="marble-source-inspector"
      className={cn(
        'flex h-full min-h-0 w-[min(400px,45%)] shrink-0 flex-col border-l border-[var(--xd-border)] bg-[var(--xd-rail)] text-[var(--xd-ink)]',
        className,
      )}
    >
      <header className="flex h-9 items-center justify-between gap-2 border-b border-[var(--xd-border)] px-3">
        <span className="xd-mono truncate text-[11.5px] text-[var(--xd-ink-secondary)]">
          {fileName}
        </span>
        <div className="flex items-center gap-2">
          {note && (
            <span className="text-[11px] text-[var(--xd-ink-muted)]">
              {note}
            </span>
          )}
          <button
            type="button"
            onClick={() => void applyDiff()}
            disabled={!dirty || busy}
            className="inline-flex h-6 shrink-0 items-center rounded bg-[var(--xd-accent)] px-2 text-[11px] font-medium text-white disabled:opacity-35"
          >
            {busy ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </header>

      {report.errors > 0 && (
        <p className="flex items-center gap-1.5 border-b border-[var(--xd-danger)]/30 bg-[var(--xd-danger-soft)] px-3 py-1.5 text-[11.5px] text-[var(--xd-danger)]">
          <AlertCircle className="size-3.5 shrink-0" />
          <span className="truncate">
            {report.findings[0] ?? `${report.errors} ID error`}
          </span>
        </p>
      )}

      <textarea
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value)
          setRemote(null)
        }}
        spellCheck={false}
        aria-label="Marble HTML5 source"
        className="xd-mono min-h-40 w-full flex-1 resize-none border-b border-[var(--xd-border)] bg-[var(--xd-canvas)] p-2.5 text-[11px] leading-relaxed text-[var(--xd-ink)] outline-none"
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--xd-ink-muted)]">
          <span>Nodes</span>
          <span className="xd-tabular">{nodes.length}</span>
        </div>
        <ul className="space-y-0.5 px-2 pb-2">
          {nodes.map((node, index) => {
            const selected = node.id === selectedId
            return (
              <li key={`${node.id}-${index}`}>
                <button
                  type="button"
                  onClick={() => onSelectNode?.(nodeToElement(node))}
                  aria-pressed={selected}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[11.5px]',
                    selected
                      ? 'bg-[var(--xd-accent-soft)] text-[var(--xd-accent)]'
                      : 'text-[var(--xd-ink-secondary)] hover:bg-[var(--xd-surface-hover)] hover:text-[var(--xd-ink)]',
                  )}
                >
                  <span className="xd-mono truncate">#{node.id}</span>
                  <span className="xd-mono shrink-0 text-[10.5px] text-[var(--xd-ink-muted)]">
                    {node.tagName}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}
