import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Stethoscope } from 'lucide-react'
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

function badgeLabel(name: string): string {
  if (name === 'alt') return 'alt'
  return name
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

function statusLine(report: DoctorReport): string {
  if (report.errors === 0) {
    return 'Doctor Check: 0 errors · All data-marble-id nodes valid'
  }
  const detail = report.findings.slice(0, 2).join(' · ')
  return `Doctor Check: ${report.errors} error${report.errors === 1 ? '' : 's'}${
    detail ? ` · ${detail}` : ''
  }`
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
        setNote(
          `Spliced ${ops.length} Marble op${ops.length === 1 ? '' : 's'} into ${fileName}.`,
        )
        return
      }
      const check = clientDoctor(draft)
      if (check.errors === 0) {
        onApplySource?.(draft, [])
        setNote(
          'No addressable text diff. Saved the edited source after the id check.',
        )
        return
      }
      setNote(
        check.findings[0] ?? 'The edited source did not pass the id check.',
      )
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
        'flex h-full min-h-0 w-[min(440px,46%)] shrink-0 flex-col border-l border-[var(--xd-border)] bg-[var(--xd-rail)] text-[var(--xd-ink)]',
        className,
      )}
    >
      <header className="border-b border-[var(--xd-border)] px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium tracking-wide text-[var(--xd-ink-muted)] uppercase">
            Source & nodes
          </p>
          <span className="xd-mono truncate text-[10.5px] text-[var(--xd-ink-secondary)]">
            {fileName}
          </span>
        </div>
        <p
          className={cn(
            'mt-2 flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[11.5px] leading-snug',
            report.errors === 0
              ? 'border-[var(--xd-commit)]/30 bg-[var(--xd-commit-soft)] text-[var(--xd-commit)]'
              : 'border-[var(--xd-danger)]/35 bg-[var(--xd-danger-soft)] text-[var(--xd-danger)]',
          )}
        >
          {report.errors === 0 ? (
            <Check className="mt-0.5 size-3.5 shrink-0" />
          ) : (
            <Stethoscope className="mt-0.5 size-3.5 shrink-0" />
          )}
          <span>{statusLine(report)}</span>
        </p>
        {report.warnings > 0 && (
          <p className="mt-1 text-[11px] text-[var(--xd-sketch)]">
            {report.warnings} doctor warning{report.warnings === 1 ? '' : 's'}
          </p>
        )}
      </header>

      <label className="flex min-h-0 flex-1 flex-col px-3 pt-2">
        <span className="mb-1 text-[11px] font-medium text-[var(--xd-ink-muted)]">
          Live .mrbl HTML5 source
        </span>
        <textarea
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            setRemote(null)
          }}
          spellCheck={false}
          aria-label="Marble HTML5 source"
          className="xd-mono min-h-40 w-full flex-1 resize-none rounded-md border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-2 py-1.5 text-[11px] leading-relaxed text-[var(--xd-ink)] outline-none focus-visible:border-[var(--xd-accent)]"
        />
      </label>

      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <p className="text-[11px] text-[var(--xd-ink-muted)]">
          {dirty ? 'Unapplied source edits' : 'Source matches the open app'}
          {note ? ` · ${note}` : ''}
        </p>
        <button
          type="button"
          onClick={() => void applyDiff()}
          disabled={!dirty || busy}
          className="inline-flex h-7 shrink-0 items-center rounded-md bg-[var(--xd-accent)] px-2.5 text-[11.5px] font-medium text-white disabled:opacity-40"
        >
          {busy ? 'Diffing…' : 'Apply Source Diff as Marble Ops'}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--xd-border)]">
        <div className="flex items-center justify-between px-3 py-2 text-[11px] text-[var(--xd-ink-muted)]">
          <span>Addressable data-marble-id nodes</span>
          <span className="xd-tabular">{nodes.length}</span>
        </div>
        <ul className="space-y-1 px-2 pb-3">
          {nodes.map((node, index) => {
            const selected = node.id === selectedId
            return (
              <li key={`${node.id}-${index}`}>
                <button
                  type="button"
                  onClick={() => onSelectNode?.(nodeToElement(node))}
                  aria-pressed={selected}
                  className={cn(
                    'w-full rounded-md border px-2 py-1.5 text-left',
                    selected
                      ? 'border-[var(--xd-accent)] bg-[var(--xd-accent-soft)]'
                      : 'border-transparent hover:border-[var(--xd-border)] hover:bg-[var(--xd-surface-hover)]',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="xd-mono truncate text-[11.5px] text-[var(--xd-accent)]">
                      #{node.id}
                    </span>
                    <span className="xd-mono text-[10.5px] text-[var(--xd-ink-muted)]">
                      {node.tagName}
                    </span>
                  </span>
                  {node.affordances.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {node.affordances.map((name) => (
                        <span
                          key={name}
                          className="xd-mono rounded border border-[var(--xd-border)] bg-[var(--xd-canvas)] px-1 py-0.5 text-[10px] text-[var(--xd-ink-secondary)]"
                        >
                          {badgeLabel(name)}
                        </span>
                      ))}
                    </span>
                  )}
                  {clip(node.text, 80) && (
                    <span className="mt-1 block truncate text-[11px] text-[var(--xd-ink-secondary)]">
                      {clip(node.text, 80)}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}
