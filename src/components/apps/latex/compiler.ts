import katex from 'katex'
import type {
  BibEntry,
  CompiledPdfPage,
  LatexCompileResult,
  LatexCompilerEngine,
  LatexDiagnostic,
  LatexDocumentMetadata,
  LatexLabelInfo,
  LatexOutlineItem,
  LatexPaperSize,
  LatexProjectFile,
  LatexProjectState,
} from './types'

interface SourceLine {
  file: string
  line: number
  text: string
}

interface MacroDef {
  name: string
  argCount: number
  body: string
}

interface TheoremSpec {
  env: string
  title: string
  numbered: boolean
  italicBody: boolean
}

interface RenderedBlock {
  html: string
  file: string
  line: number
  weight: number
  forceBreakBefore?: boolean
  footnotes: Array<{ number: number; html: string }>
}

const DEFAULT_THEOREMS: Record<string, TheoremSpec> = {
  theorem: { env: 'theorem', title: 'Theorem', numbered: true, italicBody: true },
  lemma: { env: 'lemma', title: 'Lemma', numbered: true, italicBody: true },
  proposition: {
    env: 'proposition',
    title: 'Proposition',
    numbered: true,
    italicBody: true,
  },
  corollary: {
    env: 'corollary',
    title: 'Corollary',
    numbered: true,
    italicBody: true,
  },
  conjecture: {
    env: 'conjecture',
    title: 'Conjecture',
    numbered: true,
    italicBody: true,
  },
  definition: {
    env: 'definition',
    title: 'Definition',
    numbered: true,
    italicBody: false,
  },
  example: {
    env: 'example',
    title: 'Example',
    numbered: true,
    italicBody: false,
  },
  remark: {
    env: 'remark',
    title: 'Remark',
    numbered: true,
    italicBody: false,
  },
  assumption: {
    env: 'assumption',
    title: 'Assumption',
    numbered: true,
    italicBody: false,
  },
}

const MATH_ENVS = new Set([
  'equation',
  'equation*',
  'align',
  'align*',
  'gather',
  'gather*',
  'multline',
  'multline*',
  'eqnarray',
  'eqnarray*',
  'flalign',
  'flalign*',
])

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function stripLatexComment(line: string): string {
  let out = ''
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '%' && (i === 0 || line[i - 1] !== '\\')) {
      break
    }
    out += ch
  }
  return out
}

function readBracedArg(
  source: string,
  startIdx: number,
): { value: string; endIdx: number } | null {
  let idx = startIdx
  while (idx < source.length && /\s/.test(source[idx])) idx++
  if (source[idx] !== '{') return null
  let depth = 0
  let i = idx
  for (; i < source.length; i++) {
    const ch = source[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        return { value: source.slice(idx + 1, i), endIdx: i + 1 }
      }
    }
  }
  return null
}

function readBracketArg(
  source: string,
  startIdx: number,
): { value: string; endIdx: number } | null {
  let idx = startIdx
  while (idx < source.length && /\s/.test(source[idx])) idx++
  if (source[idx] !== '[') return null
  let depth = 0
  let i = idx
  for (; i < source.length; i++) {
    const ch = source[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) {
        return { value: source.slice(idx + 1, i), endIdx: i + 1 }
      }
    }
  }
  return null
}

export function parseBibTeX(files: LatexProjectFile[]): Record<string, BibEntry> {
  const entries: Record<string, BibEntry> = {}
  const bibFiles = files.filter((f) => f.kind === 'bib' || f.path.endsWith('.bib'))

  for (const file of bibFiles) {
    const src = file.content
    const headerRe = /@([a-zA-Z]+)\s*\{\s*([^,\s]+)\s*,/g
    let match: RegExpExecArray | null
    while ((match = headerRe.exec(src)) !== null) {
      const type = match[1].toLowerCase()
      const key = match[2].trim()
      let depth = 1
      let i = match.index + match[0].length
      const startBody = i
      for (; i < src.length && depth > 0; i++) {
        if (src[i] === '{') depth++
        else if (src[i] === '}') depth--
      }
      const body = src.slice(startBody, Math.max(startBody, i - 1))
      const raw = src.slice(match.index, i)
      const fields: Record<string, string> = {}

      const fieldRe = /([a-zA-Z_-]+)\s*=\s*/g
      let fMatch: RegExpExecArray | null
      while ((fMatch = fieldRe.exec(body)) !== null) {
        const fieldName = fMatch[1].toLowerCase()
        let pos = fMatch.index + fMatch[0].length
        while (pos < body.length && /\s/.test(body[pos])) pos++
        let val = ''
        if (body[pos] === '{') {
          const parsed = readBracedArg(body, pos)
          if (parsed) {
            val = parsed.value
            fieldRe.lastIndex = parsed.endIdx
          }
        } else if (body[pos] === '"') {
          let end = pos + 1
          while (end < body.length && (body[end] !== '"' || body[end - 1] === '\\')) {
            end++
          }
          val = body.slice(pos + 1, end)
          fieldRe.lastIndex = end + 1
        } else {
          let end = pos
          while (end < body.length && body[end] !== ',' && body[end] !== '\n') {
            end++
          }
          val = body.slice(pos, end).trim()
          fieldRe.lastIndex = end
        }
        fields[fieldName] = val.replace(/\s+/g, ' ').replace(/[{}]/g, '').trim()
      }

      const venueParts = [
        fields.journal || fields.booktitle || fields.publisher || fields.howpublished || '',
        fields.volume ? `vol. ${fields.volume}` : '',
        fields.pages ? `pp. ${fields.pages}` : '',
      ].filter(Boolean)

      entries[key] = {
        key,
        type,
        author: fields.author || 'Anonymous',
        title: fields.title || key,
        venue: venueParts.join(', '),
        year: fields.year || 'n.d.',
        doi: fields.doi,
        url: fields.url,
        raw,
      }
    }
  }

  return entries
}

function findProjectFile(
  files: LatexProjectFile[],
  refPath: string,
): LatexProjectFile | undefined {
  const clean = refPath.trim().replace(/^\.\//, '')
  const candidates = [
    clean,
    `${clean}.tex`,
    `${clean}.sty`,
    `${clean}.bib`,
  ]
  return files.find((f) => candidates.includes(f.path.replace(/^\.\//, '')))
}

function parseMacroDefs(content: string): MacroDef[] {
  const macros: MacroDef[] = []
  const cleaned = content
    .split('\n')
    .map(stripLatexComment)
    .join('\n')

  const cmdRe = /\\(?:re)?newcommand\*?\s*\{?\\([a-zA-Z]+)\}?/g
  let match: RegExpExecArray | null
  while ((match = cmdRe.exec(cleaned)) !== null) {
    const name = match[1]
    let pos = match.index + match[0].length
    let argCount = 0
    const opt = readBracketArg(cleaned, pos)
    if (opt) {
      const parsed = Number.parseInt(opt.value.trim(), 10)
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 9) {
        argCount = parsed
      }
      pos = opt.endIdx
      // skip optional default argument [default]
      const optDefault = readBracketArg(cleaned, pos)
      if (optDefault) pos = optDefault.endIdx
    }
    const bodyArg = readBracedArg(cleaned, pos)
    if (bodyArg) {
      macros.push({ name, argCount, body: bodyArg.value })
      cmdRe.lastIndex = bodyArg.endIdx
    }
  }

  const opRe = /\\DeclareMathOperator\*?\s*\{\\([a-zA-Z]+)\}\s*\{([^}]*)\}/g
  let opMatch: RegExpExecArray | null
  while ((opMatch = opRe.exec(cleaned)) !== null) {
    macros.push({
      name: opMatch[1],
      argCount: 0,
      body: `\\operatorname{${opMatch[2]}}`,
    })
  }

  return macros
}

function buildKatexMacros(macros: MacroDef[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const m of macros) {
    map[`\\${m.name}`] = m.body
  }
  return map
}

function expandTextMacros(text: string, macros: MacroDef[]): string {
  if (macros.length === 0) return text
  let out = text
  for (const macro of macros) {
    if (macro.argCount === 0) {
      const re = new RegExp(`\\\\${macro.name}(?![a-zA-Z])`, 'g')
      out = out.replace(re, macro.body)
    } else {
      const trigger = `\\${macro.name}`
      let searchFrom = 0
      while (searchFrom < out.length) {
        const idx = out.indexOf(trigger, searchFrom)
        if (idx === -1) break
        const nextChar = out[idx + trigger.length]
        if (nextChar && /[a-zA-Z]/.test(nextChar)) {
          searchFrom = idx + trigger.length
          continue
        }
        let pos = idx + trigger.length
        const args: string[] = []
        let ok = true
        for (let a = 0; a < macro.argCount; a++) {
          const parsed = readBracedArg(out, pos)
          if (!parsed) {
            ok = false
            break
          }
          args.push(parsed.value)
          pos = parsed.endIdx
        }
        if (!ok) {
          searchFrom = idx + trigger.length
          continue
        }
        let replacement = macro.body
        for (let a = 0; a < args.length; a++) {
          replacement = replacement.replaceAll(`#${a + 1}`, args[a])
        }
        out = out.slice(0, idx) + replacement + out.slice(pos)
        searchFrom = idx + replacement.length
      }
    }
  }
  return out
}

function renderMathWithKatex(
  tex: string,
  displayMode: boolean,
  katexMacros: Record<string, string>,
  diagnostics: LatexDiagnostic[],
  file: string,
  line: number,
): string {
  const cleanTex = tex
    .replace(/\\label\{[^}]*\}/g, '')
    .replace(/\\nonumber/g, '')
    .replace(/\\notag/g, '')
    .trim()
  if (!cleanTex) return ''
  try {
    return katex.renderToString(cleanTex, {
      displayMode,
      throwOnError: true,
      strict: 'ignore',
      trust: false,
      macros: { ...katexMacros },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Math syntax error'
    diagnostics.push({
      id: `diag-math-${file}-${line}-${diagnostics.length}`,
      severity: 'error',
      file,
      line,
      message: message.replace(/^KaTeX parse error:\s*/i, 'LaTeX math error: '),
      detail: cleanTex.slice(0, 120),
    })
    return katex.renderToString(cleanTex, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      errorColor: '#dc2626',
      macros: { ...katexMacros },
    })
  }
}

function validateStructure(
  files: LatexProjectFile[],
  mainFile: string,
  diagnostics: LatexDiagnostic[],
) {
  const main = files.find((f) => f.path === mainFile) ?? files.at(0)
  if (!main) {
    diagnostics.push({
      id: 'diag-no-main',
      severity: 'error',
      file: mainFile,
      line: 1,
      message: `Main TeX file "${mainFile}" not found in project.`,
    })
    return
  }

  const texFiles = files.filter((f) => f.kind === 'tex' || f.path.endsWith('.tex'))
  for (const file of texFiles) {
    const lines = file.content.split('\n')
    const envStack: Array<{ name: string; line: number }> = []
    let inVerbatim = false

    for (let idx = 0; idx < lines.length; idx++) {
      const lineNo = idx + 1
      const rawLine = stripLatexComment(lines[idx])

      if (inVerbatim) {
        if (/\\end\{(verbatim|lstlisting)\}/.test(rawLine)) {
          inVerbatim = false
          envStack.pop()
        }
        continue
      }

      // Check \begin / \end balance
      const envRe = /\\(begin|end)\{([^}]+)\}/g
      let m: RegExpExecArray | null
      while ((m = envRe.exec(rawLine)) !== null) {
        const kind = m[1]
        const name = m[2].trim()
        if (kind === 'begin') {
          envStack.push({ name, line: lineNo })
          if (name === 'verbatim' || name === 'lstlisting') {
            inVerbatim = true
            break
          }
        } else {
          const top = envStack.at(-1)
          if (!top) {
            diagnostics.push({
              id: `diag-extra-end-${file.path}-${lineNo}-${diagnostics.length}`,
              severity: 'error',
              file: file.path,
              line: lineNo,
              message: `Unexpected \\end{${name}} with no matching \\begin{${name}}.`,
            })
          } else if (top.name !== name) {
            diagnostics.push({
              id: `diag-mismatch-env-${file.path}-${lineNo}-${diagnostics.length}`,
              severity: 'error',
              file: file.path,
              line: lineNo,
              message: `Environment mismatch: \\begin{${top.name}} on line ${top.line} closed by \\end{${name}}.`,
            })
            envStack.pop()
          } else {
            envStack.pop()
          }
        }
      }

      // Check unbalanced braces on non-verbatim single lines that are clearly broken
      let braceDepth = 0
      for (let i = 0; i < rawLine.length; i++) {
        if (rawLine[i] === '\\') {
          i++
          continue
        }
        if (rawLine[i] === '{') braceDepth++
        else if (rawLine[i] === '}') braceDepth--
      }
      if (braceDepth < 0) {
        diagnostics.push({
          id: `diag-extra-brace-${file.path}-${lineNo}-${diagnostics.length}`,
          severity: 'error',
          file: file.path,
          line: lineNo,
          message: 'Extra closing brace "}" found on line.',
          detail: lines[idx].trim().slice(0, 100),
        })
      }

      // Check unclosed inline $ on line (ignoring $$ and \$)
      const noDisplay = rawLine.replace(/\$\$/g, '').replace(/\\\$/g, '')
      const dollarCount = (noDisplay.match(/\$/g) || []).length
      if (dollarCount % 2 !== 0) {
        diagnostics.push({
          id: `diag-unclosed-dollar-${file.path}-${lineNo}-${diagnostics.length}`,
          severity: 'error',
          file: file.path,
          line: lineNo,
          message: 'Unclosed inline math delimiter "$".',
          detail: lines[idx].trim().slice(0, 100),
        })
      }
    }

    for (const unclosed of envStack) {
      diagnostics.push({
        id: `diag-unclosed-env-${file.path}-${unclosed.line}-${diagnostics.length}`,
        severity: 'error',
        file: file.path,
        line: unclosed.line,
        message: `Unclosed environment \\begin{${unclosed.name}} (missing \\end{${unclosed.name}}).`,
      })
    }
  }

  if (!/\\begin\{document\}/.test(main.content)) {
    diagnostics.push({
      id: `diag-missing-doc-${main.path}`,
      severity: 'error',
      file: main.path,
      line: 1,
      message: 'Missing \\begin{document} in main TeX file.',
    })
  }
}

export function extractLabelsAndOutlinePreview(
  files: LatexProjectFile[],
): { labels: LatexLabelInfo[]; bibEntries: BibEntry[] } {
  const labels: LatexLabelInfo[] = []
  const texFiles = files.filter((f) => f.kind === 'tex' || f.path.endsWith('.tex'))
  for (const file of texFiles) {
    const lines = file.content.split('\n')
    let lastContext = file.path
    let lastKind: LatexLabelInfo['kind'] = 'section'
    for (let i = 0; i < lines.length; i++) {
      const line = stripLatexComment(lines[i])
      const sec = line.match(/\\(?:sub)*section\*?\{([^}]+)\}/)
      if (sec) {
        lastContext = sec[1]
        lastKind = 'section'
      }
      const env = line.match(/\\begin\{(equation|align|theorem|lemma|proposition|corollary|definition|figure|table)\}/)
      if (env) {
        const name = env[1]
        lastKind =
          name === 'equation' || name === 'align'
            ? 'equation'
            : name === 'figure'
              ? 'figure'
              : name === 'table'
                ? 'table'
                : 'theorem'
        lastContext = `${name} (line ${i + 1})`
      }
      const lblRe = /\\label\{([^}]+)\}/g
      let m: RegExpExecArray | null
      while ((m = lblRe.exec(line)) !== null) {
        const key = m[1].trim()
        const inferredKind: LatexLabelInfo['kind'] = key.startsWith('eq:')
          ? 'equation'
          : key.startsWith('thm:') || key.startsWith('lem:') || key.startsWith('prop:')
            ? 'theorem'
            : key.startsWith('fig:')
              ? 'figure'
              : key.startsWith('tab:')
                ? 'table'
                : lastKind
        labels.push({
          key,
          kind: inferredKind,
          number: '',
          title: lastContext,
          file: file.path,
          line: i + 1,
        })
      }
    }
  }
  const bibEntries = Object.values(parseBibTeX(files))
  return { labels, bibEntries }
}

export function compileLatexProject(
  state: LatexProjectState,
  overrideEngine?: LatexCompilerEngine,
): LatexCompileResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const engine = overrideEngine ?? state.compiler
  const logs: string[] = []
  const diagnostics: LatexDiagnostic[] = []

  logs.push(
    `This is xDrive TeX Engine 2026.1 (pdfTeX-compatible + KaTeX ${katex.version})`,
  )
  logs.push(`Compiler profile: ${engine} · Paper: ${state.paperSize.toUpperCase()}`)
  logs.push(`entering extended mode — root file (${state.mainFile})`)

  validateStructure(state.files, state.mainFile, diagnostics)

  const mainFileObj =
    state.files.find((f) => f.path === state.mainFile) ?? state.files.at(0)

  if (!mainFileObj) {
    const durationMs = Math.max(
      1,
      Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0),
    )
    return {
      ok: false,
      engine,
      compiledAt: Date.now(),
      durationMs,
      pageCount: 0,
      pages: [],
      diagnostics,
      logs,
      outline: [],
      labels: {},
      citations: {},
      citedKeys: [],
      metadata: {
        title: state.title,
        authors: '',
        date: '',
        documentClass: 'article',
        twoColumn: false,
        fontSizePt: 11,
        paperSize: state.paperSize,
      },
      wordCount: 0,
    }
  }

  // Parse BibTeX across project
  const citations = parseBibTeX(state.files)
  const bibCount = Object.keys(citations).length
  if (bibCount > 0) {
    logs.push(`BibTeX pass: loaded ${bibCount} bibliographic entries`)
  }

  // Parse custom macros from preamble + .sty files
  const allMacros: MacroDef[] = []
  for (const styFile of state.files.filter(
    (f) => f.kind === 'sty' || f.path.endsWith('.sty'),
  )) {
    const found = parseMacroDefs(styFile.content)
    allMacros.push(...found)
    logs.push(`(${styFile.path} — ${found.length} custom macros loaded)`)
  }

  // Split main.tex into preamble & document body
  const mainLines = mainFileObj.content.split('\n')
  let beginDocLine = mainLines.findIndex((l) => /\\begin\{document\}/.test(stripLatexComment(l)))
  let endDocLine = mainLines.findIndex((l) => /\\end\{document\}/.test(stripLatexComment(l)))
  if (beginDocLine === -1) beginDocLine = 0
  if (endDocLine === -1) endDocLine = mainLines.length

  const preambleText = mainLines
    .slice(0, beginDocLine)
    .map(stripLatexComment)
    .join('\n')
  allMacros.push(...parseMacroDefs(preambleText))
  const katexMacros = buildKatexMacros(allMacros)

  // Parse \documentclass[options]{class}
  const docClassMatch = preambleText.match(
    /\\documentclass(?:\[([^\]]*)\])?\{([^}]+)\}/,
  )
  const docOptions = (docClassMatch?.[1] ?? '').split(',').map((s) => s.trim())
  const documentClass = docClassMatch?.[2]?.trim() ?? 'article'
  const twoColumn = docOptions.includes('twocolumn')
  const fontSizePt = docOptions.includes('12pt')
    ? 12
    : docOptions.includes('10pt')
      ? 10
      : 11
  const paperSize: LatexPaperSize = docOptions.includes('a4paper')
    ? 'a4'
    : docOptions.includes('letterpaper')
      ? 'letter'
      : state.paperSize

  // Parse \newtheorem definitions from preamble
  const theoremSpecs: Record<string, TheoremSpec> = { ...DEFAULT_THEOREMS }
  const newThmRe = /\\newtheorem(\*)?\{([^}]+)\}(?:\[[^\]]+\])?\{([^}]+)\}/g
  let thmM: RegExpExecArray | null
  while ((thmM = newThmRe.exec(preambleText)) !== null) {
    const starred = Boolean(thmM[1])
    const env = thmM[2].trim()
    const title = thmM[3].trim()
    theoremSpecs[env] = {
      env,
      title,
      numbered: !starred,
      italicBody: !/definition|example|remark/i.test(env),
    }
  }

  // Parse \title, \author, \date
  const extractPreambleCmd = (cmd: string): string => {
    const idx = preambleText.indexOf(`\\${cmd}`)
    if (idx === -1) return ''
    const arg = readBracedArg(preambleText, idx + cmd.length + 1)
    return arg ? arg.value.trim() : ''
  }

  const rawTitle = extractPreambleCmd('title') || state.title
  const rawAuthors = extractPreambleCmd('author')
  const rawDate = extractPreambleCmd('date') || '\\today'

  // Expand \input and \include recursively into SourceLine[]
  const expandedLines: SourceLine[] = []
  const expandFileLines = (
    filePath: string,
    lines: string[],
    startIdx: number,
    endIdx: number,
    depth: number,
  ) => {
    if (depth > 8) {
      diagnostics.push({
        id: `diag-recursion-${filePath}`,
        severity: 'error',
        file: filePath,
        line: startIdx + 1,
        message: 'Maximum \\input nesting depth exceeded.',
      })
      return
    }
    for (let i = startIdx; i < endIdx; i++) {
      const raw = lines[i]
      const clean = stripLatexComment(raw)
      const inpMatch = clean.match(/^\s*\\(input|include)\{([^}]+)\}\s*$/)
      if (inpMatch) {
        const refPath = inpMatch[2].trim()
        const target = findProjectFile(state.files, refPath)
        if (!target) {
          diagnostics.push({
            id: `diag-missing-input-${filePath}-${i + 1}`,
            severity: 'error',
            file: filePath,
            line: i + 1,
            message: `File "${refPath}" not found for \\${inpMatch[1]}{${refPath}}.`,
          })
          continue
        }
        logs.push(`(./${target.path})`)
        if (inpMatch[1] === 'include') {
          expandedLines.push({ file: filePath, line: i + 1, text: '\\clearpage' })
        }
        const subLines = target.content.split('\n')
        expandFileLines(target.path, subLines, 0, subLines.length, depth + 1)
        continue
      }
      expandedLines.push({ file: filePath, line: i + 1, text: raw })
    }
  }

  const bodyStart = /\\begin\{document\}/.test(stripLatexComment(mainLines[beginDocLine] ?? ''))
    ? beginDocLine + 1
    : beginDocLine
  expandFileLines(mainFileObj.path, mainLines, bodyStart, endDocLine, 0)

  // Track counters, labels, citations, outline, footnotes
  const labels: Record<string, LatexLabelInfo> = {}
  const outline: LatexOutlineItem[] = []
  const citedOrder: string[] = []
  const citeIndexMap = new Map<string, number>()
  const bibFlags = { hasBibliographyCmd: false, nociteAll: false }

  const registerCitation = (key: string, file: string, line: number): number | null => {
    const k = key.trim()
    if (!k) return null
    if (!Object.prototype.hasOwnProperty.call(citations, k)) {
      diagnostics.push({
        id: `diag-undef-cite-${file}-${line}-${k}`,
        severity: 'warning',
        file,
        line,
        message: `Citation "${k}" undefined in project .bib files.`,
      })
      return null
    }
    if (!citeIndexMap.has(k)) {
      citedOrder.push(k)
      citeIndexMap.set(k, citedOrder.length)
    }
    return citeIndexMap.get(k) ?? null
  }

  // First lightweight pass to pre-collect labels & section/theorem/eq numbers so forward \ref works!
  let preSec = 0
  let preSub = 0
  let preSubSub = 0
  let preEq = 0
  let preFig = 0
  let preTab = 0
  const preThmCounters: Record<string, number> = {}
  let currentLabelTarget: {
    kind: LatexLabelInfo['kind']
    number: string
    title: string
  } = { kind: 'section', number: '1', title: rawTitle }

  for (const sl of expandedLines) {
    const clean = stripLatexComment(sl.text)

    const secM = clean.match(/\\(section|subsection|subsubsection)(\*)?\{([^}]*)\}/)
    if (secM) {
      const level = secM[1]
      const starred = Boolean(secM[2])
      const title = secM[3].trim()
      if (!starred) {
        if (level === 'section') {
          preSec++
          preSub = 0
          preSubSub = 0
          currentLabelTarget = { kind: 'section', number: `${preSec}`, title }
        } else if (level === 'subsection') {
          preSub++
          preSubSub = 0
          currentLabelTarget = {
            kind: 'section',
            number: `${preSec}.${preSub}`,
            title,
          }
        } else {
          preSubSub++
          currentLabelTarget = {
            kind: 'section',
            number: `${preSec}.${preSub}.${preSubSub}`,
            title,
          }
        }
      }
    }

    const beginM = clean.match(/\\begin\{([^}]+)\}/)
    if (beginM) {
      const env = beginM[1].trim()
      if (env === 'equation' || env === 'align' || env === 'gather' || env === 'multline') {
        preEq++
        currentLabelTarget = {
          kind: 'equation',
          number: `${preEq}`,
          title: `Equation (${preEq})`,
        }
      } else if (env === 'figure' || env === 'figure*') {
        preFig++
        currentLabelTarget = {
          kind: 'figure',
          number: `${preFig}`,
          title: `Figure ${preFig}`,
        }
      } else if (env === 'table' || env === 'table*') {
        preTab++
        currentLabelTarget = {
          kind: 'table',
          number: `${preTab}`,
          title: `Table ${preTab}`,
        }
      } else if (
        Object.prototype.hasOwnProperty.call(theoremSpecs, env) &&
        theoremSpecs[env].numbered
      ) {
        preThmCounters[env] = (preThmCounters[env] ?? 0) + 1
        currentLabelTarget = {
          kind: 'theorem',
          number: `${preThmCounters[env]}`,
          title: `${theoremSpecs[env].title} ${preThmCounters[env]}`,
        }
      }
    }

    const lblRe = /\\label\{([^}]+)\}/g
    let lm: RegExpExecArray | null
    while ((lm = lblRe.exec(clean)) !== null) {
      const key = lm[1].trim()
      labels[key] = {
        key,
        kind: currentLabelTarget.kind,
        number: currentLabelTarget.number,
        title: currentLabelTarget.title,
        file: sl.file,
        line: sl.line,
      }
    }
  }

  logs.push(
    `Pass 1 complete: indexed ${Object.keys(labels).length} labels across ${state.files.length} project files`,
  )

  // Inline LaTeX renderer
  let globalFootnoteCounter = 0
  const renderInline = (
    input: string,
    file: string,
    line: number,
    blockFootnotes: Array<{ number: number; html: string }>,
  ): string => {
    const expanded = expandTextMacros(input, allMacros)
    let out = ''
    let i = 0

    while (i < expanded.length) {
      // Display math $$...$$ inline
      if (expanded[i] === '$' && expanded[i + 1] === '$') {
        const end = expanded.indexOf('$$', i + 2)
        if (end !== -1) {
          const math = expanded.slice(i + 2, end)
          out += `<span class="xd-tex-display-inline">${renderMathWithKatex(math, true, katexMacros, diagnostics, file, line)}</span>`
          i = end + 2
          continue
        }
      }

      // Inline math $...$
      if (expanded[i] === '$' && (i === 0 || expanded[i - 1] !== '\\')) {
        let end = i + 1
        while (
          end < expanded.length &&
          !(expanded[end] === '$' && expanded[end - 1] !== '\\')
        ) {
          end++
        }
        if (end < expanded.length) {
          const math = expanded.slice(i + 1, end)
          out += renderMathWithKatex(math, false, katexMacros, diagnostics, file, line)
          i = end + 1
          continue
        }
      }

      // \( ... \) inline math
      if (expanded[i] === '\\' && expanded[i + 1] === '(') {
        const end = expanded.indexOf('\\)', i + 2)
        if (end !== -1) {
          const math = expanded.slice(i + 2, end)
          out += renderMathWithKatex(math, false, katexMacros, diagnostics, file, line)
          i = end + 2
          continue
        }
      }

      // Commands starting with \
      if (expanded[i] === '\\') {
        const next = expanded[i + 1]
        if (next === '\\') {
          out += '<br />'
          i += 2
          continue
        }
        if (next === '%' || next === '&' || next === '$' || next === '#' || next === '_' || next === '{' || next === '}') {
          out += escapeHtml(next)
          i += 2
          continue
        }
        if (next === ',' || next === ';' || next === ' ') {
          out += '&thinsp;'
          i += 2
          continue
        }

        const cmdMatch = expanded.slice(i + 1).match(/^([a-zA-Z]+\*?)/)
        if (cmdMatch) {
          const cmd = cmdMatch[1]
          const afterCmd = i + 1 + cmd.length

          if (cmd === 'today') {
            out += new Date().toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })
            i = afterCmd
            continue
          }
          if (cmd === 'LaTeX') {
            out += '<span class="xd-tex-logo">L<sup>A</sup>T<sub>E</sub>X</span>'
            i = afterCmd
            continue
          }
          if (cmd === 'TeX') {
            out += '<span class="xd-tex-logo">T<sub>E</sub>X</span>'
            i = afterCmd
            continue
          }
          if (cmd === 'newline') {
            out += '<br />'
            i = afterCmd
            continue
          }
          if (cmd === 'quad') {
            out += '<span style="display:inline-block;width:1em"></span>'
            i = afterCmd
            continue
          }
          if (cmd === 'qquad') {
            out += '<span style="display:inline-block;width:2em"></span>'
            i = afterCmd
            continue
          }
          if (cmd === 'and') {
            out += ' &nbsp;·&nbsp; '
            i = afterCmd
            continue
          }
          if (cmd === 'label' || cmd === 'index' || cmd === 'centering' || cmd === 'noindent') {
            const arg = readBracedArg(expanded, afterCmd)
            i = arg ? arg.endIdx : afterCmd
            continue
          }
          if (cmd === 'nocite') {
            const arg = readBracedArg(expanded, afterCmd)
            if (arg) {
              if (arg.value.trim() === '*') bibFlags.nociteAll = true
              else {
                for (const k of arg.value.split(',')) {
                  registerCitation(k, file, line)
                }
              }
              i = arg.endIdx
            } else {
              i = afterCmd
            }
            continue
          }

          // Formatting commands taking one braced argument
          const singleArgMap: Record<string, (inner: string) => string> = {
            textbf: (s) => `<strong>${s}</strong>`,
            mathbf: (s) => `<strong>${s}</strong>`,
            textit: (s) => `<em>${s}</em>`,
            emph: (s) => `<em>${s}</em>`,
            underline: (s) => `<span style="text-decoration:underline">${s}</span>`,
            texttt: (s) => `<code class="xd-tex-tt">${s}</code>`,
            textsc: (s) => `<span style="font-variant:small-caps">${s}</span>`,
            textsf: (s) => `<span style="font-family:var(--font-sans)">${s}</span>`,
            textrm: (s) => `<span style="font-family:var(--font-serif)">${s}</span>`,
            textsuperscript: (s) => `<sup>${s}</sup>`,
            textsubscript: (s) => `<sub>${s}</sub>`,
            thanks: (s) => `<span class="xd-tex-thanks"> (${s})</span>`,
          }

          if (cmd in singleArgMap) {
            const arg = readBracedArg(expanded, afterCmd)
            if (arg) {
              out += singleArgMap[cmd](
                renderInline(arg.value, file, line, blockFootnotes),
              )
              i = arg.endIdx
              continue
            }
          }

          if (cmd === 'textcolor') {
            const cArg = readBracedArg(expanded, afterCmd)
            const tArg = cArg ? readBracedArg(expanded, cArg.endIdx) : null
            if (cArg && tArg) {
              const safeColor = cArg.value.replace(/[^a-zA-Z0-9#(),.% -]/g, '')
              out += `<span style="color:${safeColor}">${renderInline(tArg.value, file, line, blockFootnotes)}</span>`
              i = tArg.endIdx
              continue
            }
          }

          if (cmd === 'href') {
            const uArg = readBracedArg(expanded, afterCmd)
            const tArg = uArg ? readBracedArg(expanded, uArg.endIdx) : null
            if (uArg && tArg) {
              out += `<a class="xd-tex-link" href="${escapeHtml(uArg.value)}" target="_blank" rel="noreferrer">${renderInline(tArg.value, file, line, blockFootnotes)}</a>`
              i = tArg.endIdx
              continue
            }
          }

          if (cmd === 'url') {
            const uArg = readBracedArg(expanded, afterCmd)
            if (uArg) {
              out += `<code class="xd-tex-tt xd-tex-link">${escapeHtml(uArg.value)}</code>`
              i = uArg.endIdx
              continue
            }
          }

          if (cmd === 'footnote') {
            const arg = readBracedArg(expanded, afterCmd)
            if (arg) {
              globalFootnoteCounter++
              const fnNum = globalFootnoteCounter
              const fnHtml = renderInline(arg.value, file, line, blockFootnotes)
              blockFootnotes.push({ number: fnNum, html: fnHtml })
              out += `<sup class="xd-tex-fn-mark">${fnNum}</sup>`
              i = arg.endIdx
              continue
            }
          }

          if (cmd === 'ref' || cmd === 'eqref' || cmd === 'autoref' || cmd === 'cref' || cmd === 'Cref') {
            const arg = readBracedArg(expanded, afterCmd)
            if (arg) {
              const key = arg.value.trim()
              const info = Object.prototype.hasOwnProperty.call(labels, key)
                ? labels[key]
                : undefined
              if (!info) {
                diagnostics.push({
                  id: `diag-undef-ref-${file}-${line}-${key}`,
                  severity: 'warning',
                  file,
                  line,
                  message: `Reference "${key}" undefined (missing \\label{${key}}).`,
                })
                out += `<strong class="xd-tex-undef">??</strong>`
              } else {
                const labelText =
                  cmd === 'eqref'
                    ? `(${info.number})`
                    : cmd === 'autoref' || cmd === 'cref' || cmd === 'Cref'
                      ? `${info.kind[0].toUpperCase()}${info.kind.slice(1)} ${info.number}`
                      : info.number
                out += `<a class="xd-tex-ref" data-ref-key="${escapeHtml(key)}" href="#tex-label-${escapeHtml(key)}">${escapeHtml(labelText)}</a>`
              }
              i = arg.endIdx
              continue
            }
          }

          if (cmd === 'cite' || cmd === 'citep' || cmd === 'citet') {
            const opt = readBracketArg(expanded, afterCmd)
            const argStart = opt ? opt.endIdx : afterCmd
            const arg = readBracedArg(expanded, argStart)
            if (arg) {
              const keys = arg.value
                .split(',')
                .map((k) => k.trim())
                .filter(Boolean)
              const renderedNums = keys.map((k) => {
                const num = registerCitation(k, file, line)
                if (num === null) {
                  return `<strong class="xd-tex-undef">?</strong>`
                }
                const entry = citations[k]
                if (cmd === 'citet') {
                  const firstAuthor = entry.author.split(',')[0].split(' ').at(-1) ?? entry.author
                  return `<a class="xd-tex-cite" href="#tex-bib-${escapeHtml(k)}">${escapeHtml(firstAuthor)} [${num}]</a>`
                }
                return `<a class="xd-tex-cite" href="#tex-bib-${escapeHtml(k)}">${num}</a>`
              })
              const note = opt ? `, ${escapeHtml(opt.value)}` : ''
              out +=
                cmd === 'citet'
                  ? renderedNums.join(', ')
                  : `<span class="xd-tex-cite-bracket">[${renderedNums.join(', ')}${note}]</span>`
              i = arg.endIdx
              continue
            }
          }

          if (cmd === 'verb') {
            const delim = expanded[afterCmd]
            if (delim) {
              const end = expanded.indexOf(delim, afterCmd + 1)
              if (end !== -1) {
                out += `<code class="xd-tex-tt">${escapeHtml(expanded.slice(afterCmd + 1, end))}</code>`
                i = end + 1
                continue
              }
            }
          }

          // Unknown benign formatting command with optional braced arg: render inner text gracefully
          const fallbackArg = readBracedArg(expanded, afterCmd)
          if (fallbackArg) {
            out += renderInline(fallbackArg.value, file, line, blockFootnotes)
            i = fallbackArg.endIdx
            continue
          }
          i = afterCmd
          continue
        }
      }

      // Typography ligatures
      if (expanded.startsWith('---', i)) {
        out += '—'
        i += 3
        continue
      }
      if (expanded.startsWith('--', i)) {
        out += '–'
        i += 2
        continue
      }
      if (expanded.startsWith('``', i)) {
        out += '“'
        i += 2
        continue
      }
      if (expanded.startsWith("''", i)) {
        out += '”'
        i += 2
        continue
      }
      if (expanded[i] === '~') {
        out += '&nbsp;'
        i++
        continue
      }
      if (expanded[i] === '{' || expanded[i] === '}') {
        i++
        continue
      }

      out += escapeHtml(expanded[i])
      i++
    }

    return out
  }

  // Parse tabular environment
  const renderTabular = (
    rawBody: string,
    colSpec: string,
    file: string,
    line: number,
    blockFootnotes: Array<{ number: number; html: string }>,
  ): string => {
    const aligns: Array<'left' | 'center' | 'right'> = []
    for (const ch of colSpec) {
      if (ch === 'l' || ch === 'p') aligns.push('left')
      else if (ch === 'c') aligns.push('center')
      else if (ch === 'r') aligns.push('right')
    }

    const normalized = rawBody.replace(/\r/g, '')
    const rawRows = normalized.split(/\\\\(?:\[[^\]]*\])?/)
    const rowsHtml: string[] = []
    let seenMidrule = false

    for (const rawRow of rawRows) {
      const hasTop = /\\toprule/.test(rawRow)
      const hasMid = /\\midrule/.test(rawRow)
      const hasBot = /\\bottomrule/.test(rawRow)
      const hasHline = /\\hline/.test(rawRow)
      if (hasMid) seenMidrule = true

      const cleanedRow = rawRow
        .replace(/\\(toprule|midrule|bottomrule|hline|cline\{[^}]*\})/g, '')
        .trim()
      if (!cleanedRow) continue

      const cells = cleanedRow.split(/(?<!\\)&/)
      const isHeader = hasTop || (!seenMidrule && rowsHtml.length === 0)
      const rowClasses = [
        hasTop ? 'xd-tex-tr-top' : '',
        hasMid ? 'xd-tex-tr-mid' : '',
        hasBot ? 'xd-tex-tr-bot' : '',
        hasHline ? 'xd-tex-tr-hline' : '',
      ]
        .filter(Boolean)
        .join(' ')

      const cellsHtml = cells
        .map((cell, cIdx) => {
          const mc = cell.trim().match(/^\\multicolumn\{(\d+)\}\{([^}]*)\}\{([\s\S]*)\}$/)
          const colspan = mc ? Number.parseInt(mc[1], 10) : 1
          const alignSpec = mc ? mc[2] : ''
          const content = mc ? mc[3] : cell.trim()
          const align = alignSpec.includes('c')
            ? 'center'
            : alignSpec.includes('r')
              ? 'right'
              : (aligns[cIdx] ?? 'left')
          const tag = isHeader ? 'th' : 'td'
          return `<${tag}${colspan > 1 ? ` colspan="${colspan}"` : ''} style="text-align:${align}">${renderInline(content, file, line, blockFootnotes)}</${tag}>`
        })
        .join('')

      rowsHtml.push(`<tr class="${rowClasses}">${cellsHtml}</tr>`)
    }

    return `<table class="xd-tex-table"><tbody>${rowsHtml.join('')}</tbody></table>`
  }

  // Pass 2: Compile blocks
  const blocks: RenderedBlock[] = []
  let secNum = 0
  let subNum = 0
  let subSubNum = 0
  let eqNum = 0
  let figNum = 0
  let tabNum = 0
  const thmCounters: Record<string, number> = {}
  let wordCount = 0

  const addWords = (text: string) => {
    const stripped = text
      .replace(/\\[a-zA-Z]+\*?/g, ' ')
      .replace(/[{}$\\_%^~]/g, ' ')
      .trim()
    if (!stripped) return
    wordCount += stripped.split(/\s+/).filter(Boolean).length
  }

  const tocPlaceholders: number[] = []

  let idx = 0
  while (idx < expandedLines.length) {
    const sl = expandedLines[idx]
    const clean = stripLatexComment(sl.text).trim()

    if (!clean) {
      idx++
      continue
    }

    // Hard page breaks
    if (/^\\(newpage|clearpage|pagebreak)$/.test(clean)) {
      if (blocks.length > 0) {
        // mark next block to force break
        blocks.push({
          html: '',
          file: sl.file,
          line: sl.line,
          weight: 0,
          forceBreakBefore: true,
          footnotes: [],
        })
      }
      idx++
      continue
    }

    // \maketitle
    if (/^\\maketitle\b/.test(clean)) {
      const fns: Array<{ number: number; html: string }> = []
      const titleHtml = renderInline(rawTitle, sl.file, sl.line, fns)
      const authorsHtml = rawAuthors
        ? renderInline(rawAuthors, sl.file, sl.line, fns)
        : ''
      const dateHtml = rawDate ? renderInline(rawDate, sl.file, sl.line, fns) : ''
      addWords(`${rawTitle} ${rawAuthors}`)
      blocks.push({
        html: `<header class="xd-tex-maketitle" data-synctex-file="${escapeHtml(sl.file)}" data-synctex-line="${sl.line}">
          <h1 class="xd-tex-title">${titleHtml}</h1>
          ${authorsHtml ? `<div class="xd-tex-authors">${authorsHtml}</div>` : ''}
          ${dateHtml ? `<div class="xd-tex-date">${dateHtml}</div>` : ''}
        </header>`,
        file: sl.file,
        line: sl.line,
        weight: 145,
        footnotes: fns,
      })
      idx++
      continue
    }

    // \tableofcontents
    if (/^\\tableofcontents\b/.test(clean)) {
      tocPlaceholders.push(blocks.length)
      blocks.push({
        html: '',
        file: sl.file,
        line: sl.line,
        weight: 120,
        footnotes: [],
      })
      idx++
      continue
    }

    // \bibliography{...} / \bibliographystyle{...}
    if (/^\\bibliographystyle\{[^}]*\}/.test(clean)) {
      idx++
      continue
    }
    if (/^\\(bibliography\{[^}]*\}|printbibliography)/.test(clean)) {
      bibFlags.hasBibliographyCmd = true
      idx++
      continue
    }

    // Sections: \section, \subsection, \subsubsection, \paragraph
    const secMatch = clean.match(
      /^\\(section|subsection|subsubsection|paragraph)(\*)?\{([\s\S]*)\}(.*)$/,
    )
    if (secMatch) {
      const levelName = secMatch[1]
      const starred = Boolean(secMatch[2])
      const titleRaw = secMatch[3].trim()
      const trailing = secMatch[4]
      const labelM = trailing.match(/\\label\{([^}]+)\}/)
      let numStr = ''
      let level: 1 | 2 | 3 | 4 = 1
      if (levelName === 'section') {
        level = 1
        if (!starred) {
          secNum++
          subNum = 0
          subSubNum = 0
          numStr = `${secNum}`
        }
      } else if (levelName === 'subsection') {
        level = 2
        if (!starred) {
          subNum++
          subSubNum = 0
          numStr = `${secNum}.${subNum}`
        }
      } else if (levelName === 'subsubsection') {
        level = 3
        if (!starred) {
          subSubNum++
          numStr = `${secNum}.${subNum}.${subSubNum}`
        }
      } else {
        level = 4
      }

      const fns: Array<{ number: number; html: string }> = []
      const renderedTitle = renderInline(titleRaw, sl.file, sl.line, fns)
      addWords(titleRaw)
      const anchorId = labelM ? `tex-label-${escapeHtml(labelM[1].trim())}` : `tex-sec-${outline.length + 1}`

      if (level <= 3) {
        outline.push({
          id: anchorId,
          level,
          number: numStr,
          title: titleRaw.replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1'),
          file: sl.file,
          line: sl.line,
          kind: 'section',
        })
      }

      const tag = level === 1 ? 'h2' : level === 2 ? 'h3' : 'h4'
      const cls =
        level === 1
          ? 'xd-tex-h1'
          : level === 2
            ? 'xd-tex-h2'
            : level === 3
              ? 'xd-tex-h3'
              : 'xd-tex-h4'
      blocks.push({
        html: `<${tag} id="${anchorId}" class="${cls}" data-synctex-file="${escapeHtml(sl.file)}" data-synctex-line="${sl.line}">${
          numStr ? `<span class="xd-tex-secnum">${numStr}</span>` : ''
        }${renderedTitle}</${tag}>`,
        file: sl.file,
        line: sl.line,
        weight: level === 1 ? 52 : 38,
        footnotes: fns,
      })
      idx++
      continue
    }

    // Standalone display math \[ ... \] or $$ ... $$
    if (clean.startsWith('\\[') || clean.startsWith('$$')) {
      const isBracket = clean.startsWith('\\[')
      const endDelim = isBracket ? '\\]' : '$$'
      const startLine = sl.line
      const startFile = sl.file
      let buf = clean.slice(2)
      let foundEnd = buf.indexOf(endDelim)
      while (foundEnd === -1 && idx + 1 < expandedLines.length) {
        idx++
        buf += '\n' + stripLatexComment(expandedLines[idx].text)
        foundEnd = buf.indexOf(endDelim)
      }
      const mathSrc = foundEnd !== -1 ? buf.slice(0, foundEnd) : buf
      const mathHtml = renderMathWithKatex(
        mathSrc,
        true,
        katexMacros,
        diagnostics,
        startFile,
        startLine,
      )
      blocks.push({
        html: `<div class="xd-tex-eq-block" data-synctex-file="${escapeHtml(startFile)}" data-synctex-line="${startLine}"><div class="xd-tex-eq-math">${mathHtml}</div></div>`,
        file: startFile,
        line: startLine,
        weight: 68,
        footnotes: [],
      })
      idx++
      continue
    }

    // Environments: \begin{env} ... \end{env}
    const envMatch = clean.match(/^\\begin\{([^}]+)\}(?:\[([^\]]*)\])?(.*)$/)
    if (envMatch) {
      const envName = envMatch[1].trim()
      const envOpt = envMatch[2] ? envMatch[2].trim() : undefined
      const startLine = sl.line
      const startFile = sl.file
      const restFirstLine = envMatch[3]
      const bodyLines: string[] = []
      let depth = 1

      const endRe = new RegExp(`\\\\end\\{${envName.replace('*', '\\*')}\\}`)
      const beginSameRe = new RegExp(`\\\\begin\\{${envName.replace('*', '\\*')}\\}`)

      if (endRe.test(restFirstLine)) {
        bodyLines.push(restFirstLine.replace(endRe, ''))
        depth = 0
      } else {
        if (restFirstLine.trim()) bodyLines.push(restFirstLine)
        while (depth > 0 && idx + 1 < expandedLines.length) {
          idx++
          const nextLine =
            envName === 'verbatim' || envName === 'lstlisting'
              ? expandedLines[idx].text
              : stripLatexComment(expandedLines[idx].text)
          if (beginSameRe.test(nextLine)) depth++
          if (endRe.test(nextLine)) {
            depth--
            if (depth === 0) {
              const beforeEnd = nextLine.split(endRe)[0]
              if (beforeEnd.trim()) bodyLines.push(beforeEnd)
              break
            }
          }
          bodyLines.push(nextLine)
        }
      }

      const envBody = bodyLines.join('\n').trim()
      const fns: Array<{ number: number; html: string }> = []

      // Abstract
      if (envName === 'abstract') {
        addWords(envBody)
        const paras = envBody
          .split(/\n\s*\n/)
          .map((p) => `<p>${renderInline(p.trim(), startFile, startLine, fns)}</p>`)
          .join('')
        blocks.push({
          html: `<section class="xd-tex-abstract" data-synctex-file="${escapeHtml(startFile)}" data-synctex-line="${startLine}">
            <div class="xd-tex-abstract-title">Abstract</div>
            ${paras}
          </section>`,
          file: startFile,
          line: startLine,
          weight: Math.max(90, Math.ceil(envBody.length / 4.2)),
          footnotes: fns,
        })
        idx++
        continue
      }

      // Math environments
      if (MATH_ENVS.has(envName)) {
        const isStarred = envName.endsWith('*')
        const hasNoNumber = /\\(nonumber|notag)\b/.test(envBody)
        const labelM = envBody.match(/\\label\{([^}]+)\}/)
        const numbered = !isStarred && !hasNoNumber
        let thisEqNum = ''
        if (numbered) {
          eqNum++
          thisEqNum = `(${eqNum})`
        }
        const anchorId = labelM
          ? `tex-label-${escapeHtml(labelM[1].trim())}`
          : `tex-eq-${eqNum}`

        const katexSrc =
          envName.startsWith('align') || envName.startsWith('flalign')
            ? `\\begin{aligned}\n${envBody}\n\\end{aligned}`
            : envName.startsWith('gather')
              ? `\\begin{gathered}\n${envBody}\n\\end{gathered}`
              : envBody

        const mathHtml = renderMathWithKatex(
          katexSrc,
          true,
          katexMacros,
          diagnostics,
          startFile,
          startLine,
        )

        if (numbered) {
          outline.push({
            id: anchorId,
            level: 3,
            number: thisEqNum,
            title: labelM ? labelM[1].trim() : `Equation ${eqNum}`,
            file: startFile,
            line: startLine,
            kind: 'equation',
          })
        }

        blocks.push({
          html: `<div id="${anchorId}" class="xd-tex-eq-block" data-synctex-file="${escapeHtml(startFile)}" data-synctex-line="${startLine}">
            <div class="xd-tex-eq-math">${mathHtml}</div>
            ${thisEqNum ? `<span class="xd-tex-eq-num">${thisEqNum}</span>` : ''}
          </div>`,
          file: startFile,
          line: startLine,
          weight: Math.max(66, bodyLines.length * 28 + 30),
          footnotes: [],
        })
        idx++
        continue
      }

      // Theorem-like environments
      if (Object.prototype.hasOwnProperty.call(theoremSpecs, envName)) {
        const spec = theoremSpecs[envName]
        const labelM = envBody.match(/\\label\{([^}]+)\}/)
        let numLabel = ''
        if (spec.numbered) {
          thmCounters[envName] = (thmCounters[envName] ?? 0) + 1
          numLabel = ` ${thmCounters[envName]}`
        }
        const anchorId = labelM
          ? `tex-label-${escapeHtml(labelM[1].trim())}`
          : `tex-thm-${envName}-${thmCounters[envName] ?? 0}`
        const optTitleHtml = envOpt
          ? ` <span class="xd-tex-thm-opt">(${renderInline(envOpt, startFile, startLine, fns)})</span>`
          : ''

        outline.push({
          id: anchorId,
          level: 3,
          number: `${spec.title}${numLabel}`,
          title: envOpt || (labelM ? labelM[1].trim() : spec.title),
          file: startFile,
          line: startLine,
          kind: 'theorem',
        })

        addWords(envBody)
        const bodyHtml = renderInline(envBody, startFile, startLine, fns)
        blocks.push({
          html: `<div id="${anchorId}" class="xd-tex-theorem ${spec.italicBody ? 'is-italic' : ''}" data-synctex-file="${escapeHtml(startFile)}" data-synctex-line="${startLine}">
            <span class="xd-tex-thm-head">${escapeHtml(spec.title)}${numLabel}${optTitleHtml}.</span> ${bodyHtml}
          </div>`,
          file: startFile,
          line: startLine,
          weight: Math.max(70, Math.ceil(envBody.length / 4.5) + 28),
          footnotes: fns,
        })
        idx++
        continue
      }

      // Proof environment
      if (envName === 'proof') {
        const head = envOpt
          ? renderInline(envOpt, startFile, startLine, fns)
          : 'Proof'
        addWords(envBody)
        const bodyHtml = renderInline(envBody, startFile, startLine, fns)
        blocks.push({
          html: `<div class="xd-tex-proof" data-synctex-file="${escapeHtml(startFile)}" data-synctex-line="${startLine}">
            <span class="xd-tex-proof-head">${head}.</span> ${bodyHtml}<span class="xd-tex-qed" aria-label="Q.E.D.">□</span>
          </div>`,
          file: startFile,
          line: startLine,
          weight: Math.max(66, Math.ceil(envBody.length / 4.5) + 26),
          footnotes: fns,
        })
        idx++
        continue
      }

      // Lists: itemize, enumerate, description
      if (envName === 'itemize' || envName === 'enumerate' || envName === 'description') {
        const tag = envName === 'enumerate' ? 'ol' : 'ul'
        const items = envBody
          .split(/\\item\b/)
          .slice(1)
          .map((rawItem) => {
            const trimmed = rawItem.trim()
            const optM = trimmed.match(/^\[([^\]]*)\]\s*([\s\S]*)$/)
            if (optM && envName === 'description') {
              addWords(optM[2])
              return `<li><strong>${renderInline(optM[1], startFile, startLine, fns)}</strong> ${renderInline(optM[2], startFile, startLine, fns)}</li>`
            }
            addWords(trimmed)
            return `<li>${renderInline(trimmed, startFile, startLine, fns)}</li>`
          })
          .join('')
        blocks.push({
          html: `<${tag} class="xd-tex-list xd-tex-list-${envName}" data-synctex-file="${escapeHtml(startFile)}" data-synctex-line="${startLine}">${items}</${tag}>`,
          file: startFile,
          line: startLine,
          weight: Math.max(54, bodyLines.length * 24 + 20),
          footnotes: fns,
        })
        idx++
        continue
      }

      // Table float or standalone tabular
      if (envName === 'table' || envName === 'table*' || envName === 'tabular') {
        const labelM = envBody.match(/\\label\{([^}]+)\}/)
        const capMatch = envBody.match(/\\caption\{/)
        let captionText = ''
        if (capMatch && capMatch.index !== undefined) {
          const parsed = readBracedArg(envBody, capMatch.index + '\\caption'.length)
          if (parsed) captionText = parsed.value
        }

        let tabularHtml = ''
        if (envName === 'tabular') {
          const specM = envMatch[3].match(/^\{([^}]*)\}/)
          tabularHtml = renderTabular(
            envBody,
            specM?.[1] ?? 'llll',
            startFile,
            startLine,
            fns,
          )
        } else {
          tabNum++
          const tabRe = /\\begin\{tabular\}\{([^}]*)\}([\s\S]*?)\\end\{tabular\}/
          const tm = envBody.match(tabRe)
          if (tm) {
            tabularHtml = renderTabular(tm[2], tm[1], startFile, startLine, fns)
          }
        }

        const anchorId = labelM
          ? `tex-label-${escapeHtml(labelM[1].trim())}`
          : `tex-tab-${tabNum}`
        addWords(captionText)
        blocks.push({
          html: `<figure id="${anchorId}" class="xd-tex-float xd-tex-table-float" data-synctex-file="${escapeHtml(startFile)}" data-synctex-line="${startLine}">
            ${
              captionText
                ? `<figcaption class="xd-tex-caption"><strong>Table ${tabNum || 1}:</strong> ${renderInline(captionText, startFile, startLine, fns)}</figcaption>`
                : ''
            }
            ${tabularHtml}
          </figure>`,
          file: startFile,
          line: startLine,
          weight: Math.max(130, bodyLines.length * 22 + 60),
          footnotes: fns,
        })
        idx++
        continue
      }

      // Figure float
      if (envName === 'figure' || envName === 'figure*') {
        figNum++
        const labelM = envBody.match(/\\label\{([^}]+)\}/)
        const capMatch = envBody.match(/\\caption\{/)
        let captionText = ''
        if (capMatch && capMatch.index !== undefined) {
          const parsed = readBracedArg(envBody, capMatch.index + '\\caption'.length)
          if (parsed) captionText = parsed.value
        }
        const incM = envBody.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/)
        const anchorId = labelM
          ? `tex-label-${escapeHtml(labelM[1].trim())}`
          : `tex-fig-${figNum}`
        const figureGraphic = incM
          ? `<div class="xd-tex-fig-box">
              <div class="xd-tex-fig-graphic">
                <svg viewBox="0 0 360 120" width="100%" height="112" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(incM[1])}">
                  <line x1="36" y1="98" x2="334" y2="98" stroke="currentColor" stroke-opacity="0.35" stroke-width="1"/>
                  <line x1="36" y1="16" x2="36" y2="98" stroke="currentColor" stroke-opacity="0.35" stroke-width="1"/>
                  <path d="M44 26 Q130 40 206 66 T326 92" fill="none" stroke="#5e6ad2" stroke-width="2"/>
                  <path d="M44 38 Q134 54 210 78 T326 95" fill="none" stroke="#1f9d6b" stroke-width="1.8" stroke-dasharray="4 3"/>
                  <circle cx="128" cy="46" r="3" fill="#5e6ad2"/>
                  <circle cx="206" cy="66" r="3" fill="#5e6ad2"/>
                  <circle cx="282" cy="84" r="3" fill="#5e6ad2"/>
                  <text x="44" y="18" font-size="9" fill="currentColor" fill-opacity="0.65" font-family="monospace">${escapeHtml(incM[1])}</text>
                </svg>
              </div>
            </div>`
          : `<div class="xd-tex-fig-box"><div class="xd-tex-fig-placeholder">Figure ${figNum}</div></div>`

        addWords(captionText)
        blocks.push({
          html: `<figure id="${anchorId}" class="xd-tex-float" data-synctex-file="${escapeHtml(startFile)}" data-synctex-line="${startLine}">
            ${figureGraphic}
            ${
              captionText
                ? `<figcaption class="xd-tex-caption"><strong>Figure ${figNum}:</strong> ${renderInline(captionText, startFile, startLine, fns)}</figcaption>`
                : ''
            }
          </figure>`,
          file: startFile,
          line: startLine,
          weight: 185,
          footnotes: fns,
        })
        idx++
        continue
      }

      // Verbatim / Code listing
      if (envName === 'verbatim' || envName === 'lstlisting') {
        blocks.push({
          html: `<pre class="xd-tex-verbatim" data-synctex-file="${escapeHtml(startFile)}" data-synctex-line="${startLine}"><code>${escapeHtml(envBody)}</code></pre>`,
          file: startFile,
          line: startLine,
          weight: Math.max(60, bodyLines.length * 18 + 30),
          footnotes: [],
        })
        idx++
        continue
      }

      // Quote / Center
      if (envName === 'quote' || envName === 'quotation' || envName === 'center') {
        addWords(envBody)
        const cls = envName === 'center' ? 'xd-tex-center' : 'xd-tex-quote'
        blocks.push({
          html: `<div class="${cls}" data-synctex-file="${escapeHtml(startFile)}" data-synctex-line="${startLine}">${renderInline(envBody, startFile, startLine, fns)}</div>`,
          file: startFile,
          line: startLine,
          weight: Math.max(54, Math.ceil(envBody.length / 4.5) + 20),
          footnotes: fns,
        })
        idx++
        continue
      }

      // Fallback environment
      addWords(envBody)
      blocks.push({
        html: `<div class="xd-tex-env-generic" data-synctex-file="${escapeHtml(startFile)}" data-synctex-line="${startLine}">${renderInline(envBody, startFile, startLine, fns)}</div>`,
        file: startFile,
        line: startLine,
        weight: Math.max(48, Math.ceil(envBody.length / 4.5)),
        footnotes: fns,
      })
      idx++
      continue
    }

    // Regular paragraph: collect contiguous non-blank, non-block lines
    const paraStartLine = sl.line
    const paraStartFile = sl.file
    const paraParts: string[] = []
    while (idx < expandedLines.length) {
      const cur = stripLatexComment(expandedLines[idx].text).trim()
      if (!cur) break
      if (
        /^\\(section|subsection|subsubsection|paragraph|begin|maketitle|tableofcontents|bibliography|bibliographystyle|newpage|clearpage|pagebreak)\b/.test(
          cur,
        ) ||
        cur.startsWith('\\[') ||
        cur.startsWith('$$')
      ) {
        break
      }
      paraParts.push(cur)
      idx++
    }
    const paraText = paraParts.join(' ').trim()
    if (paraText) {
      const fns: Array<{ number: number; html: string }> = []
      addWords(paraText)
      const html = renderInline(paraText, paraStartFile, paraStartLine, fns)
      if (html.trim()) {
        blocks.push({
          html: `<p class="xd-tex-p" data-synctex-file="${escapeHtml(paraStartFile)}" data-synctex-line="${paraStartLine}">${html}</p>`,
          file: paraStartFile,
          line: paraStartLine,
          weight: Math.max(36, Math.ceil(paraText.length / (twoColumn ? 3.1 : 5.2)) + 16),
          footnotes: fns,
        })
      }
    } else {
      idx++
    }
  }

  // Fill TOC placeholders now that outline is known
  if (tocPlaceholders.length > 0) {
    const tocItems = outline
      .filter((o) => o.kind === 'section')
      .map(
        (item) =>
          `<li class="xd-tex-toc-l${item.level}"><a href="#${escapeHtml(item.id)}"><span class="xd-tex-toc-num">${escapeHtml(item.number)}</span><span>${escapeHtml(item.title)}</span></a></li>`,
      )
      .join('')
    const tocHtml = `<nav class="xd-tex-toc"><div class="xd-tex-toc-title">Contents</div><ul>${tocItems}</ul></nav>`
    for (const pos of tocPlaceholders) {
      blocks[pos] = {
        ...blocks[pos],
        html: tocHtml,
        weight: Math.max(80, outline.length * 22 + 40),
      }
    }
  }

  // Append References section if citations exist or \bibliography was requested
  const keysToRender: string[] = bibFlags.nociteAll
    ? Object.keys(citations)
    : citedOrder.length > 0
      ? citedOrder
      : bibFlags.hasBibliographyCmd
        ? Object.keys(citations)
        : []

  if (keysToRender.length > 0) {
    const refItems = keysToRender
      .map((key, idxRef) => {
        if (!Object.prototype.hasOwnProperty.call(citations, key)) return ''
        const entry = citations[key]
        return `<li id="tex-bib-${escapeHtml(key)}" class="xd-tex-bib-item">
          <span class="xd-tex-bib-num">[${idxRef + 1}]</span>
          <span class="xd-tex-bib-body">${escapeHtml(entry.author)}. <em>${escapeHtml(entry.title)}</em>. ${
            entry.venue ? `${escapeHtml(entry.venue)}, ` : ''
          }${escapeHtml(entry.year)}.${entry.doi ? ` <span class="xd-tex-bib-doi">doi:${escapeHtml(entry.doi)}</span>` : ''}</span>
        </li>`
      })
      .filter(Boolean)
      .join('')

    blocks.push({
      html: `<section class="xd-tex-bib-section" id="tex-references">
        <h2 class="xd-tex-h1">References</h2>
        <ol class="xd-tex-bib-list">${refItems}</ol>
      </section>`,
      file: state.files.find((f) => f.kind === 'bib')?.path ?? mainFileObj.path,
      line: 1,
      weight: Math.max(110, keysToRender.length * 36 + 50),
      footnotes: [],
    })
  }

  // Paginate blocks into US Letter / A4 PDF sheets
  const pageCapacity = paperSize === 'a4' ? 860 : 790
  const effectiveCapacity = twoColumn ? pageCapacity * 1.65 : pageCapacity
  const pages: CompiledPdfPage[] = []
  let currentHtmlParts: string[] = []
  let currentFootnotes: Array<{ number: number; html: string }> = []
  let currentWeight = 0

  const flushPage = () => {
    if (currentHtmlParts.length === 0 && pages.length > 0) return
    pages.push({
      pageNumber: pages.length + 1,
      html: currentHtmlParts.join('\n'),
      footnotes: currentFootnotes,
    })
    currentHtmlParts = []
    currentFootnotes = []
    currentWeight = 0
  }

  for (const block of blocks) {
    if (block.forceBreakBefore) {
      if (currentHtmlParts.length > 0) flushPage()
      continue
    }
    if (!block.html) continue
    if (
      currentHtmlParts.length > 0 &&
      currentWeight + block.weight > effectiveCapacity
    ) {
      flushPage()
    }
    currentHtmlParts.push(block.html)
    if (block.footnotes.length > 0) {
      currentFootnotes.push(...block.footnotes)
    }
    currentWeight += block.weight
  }
  flushPage()

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length
  const durationMs = Math.max(
    1,
    Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0),
  )

  logs.push(
    `Pass 2 complete: resolved ${citedOrder.length} citations, ${eqNum} numbered equations, ${Object.values(thmCounters).reduce((a, b) => a + b, 0)} theorem blocks`,
  )
  logs.push(
    `Output written on ${mainFileObj.path.replace(/\.tex$/, '.pdf')} (${pages.length} ${pages.length === 1 ? 'page' : 'pages'}, ${wordCount} words) in ${durationMs} ms.`,
  )
  logs.push(
    `Transcript finished: ${errorCount} error(s), ${warningCount} warning(s).`,
  )

  const metadata: LatexDocumentMetadata = {
    title: rawTitle.replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1'),
    authors: rawAuthors.replace(/\\and/g, ', ').replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1'),
    date: rawDate === '\\today' ? new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : rawDate,
    documentClass,
    twoColumn,
    fontSizePt,
    paperSize,
  }

  return {
    ok: errorCount === 0,
    engine,
    compiledAt: Date.now(),
    durationMs,
    pageCount: pages.length,
    pages,
    diagnostics,
    logs,
    outline,
    labels,
    citations,
    citedKeys: citedOrder,
    metadata,
    wordCount,
  }
}
