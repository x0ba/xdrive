import {
  HighlightStyle,
  StreamLanguage,
  foldService,
  syntaxHighlighting,
} from '@codemirror/language'
import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from '@codemirror/autocomplete'
import { snippetCompletion } from '@codemirror/autocomplete'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import type { BibEntry, LatexLabelInfo, LatexProjectFile } from './types'

/* ============================================================================
   1. LaTeX & BibTeX StreamLanguage Syntax Highlighting
   ============================================================================ */

interface TexState {
  inMath: 'inline' | 'display' | null
}

export const latexStreamLanguage = StreamLanguage.define<TexState>({
  name: 'latex',
  startState: () => ({ inMath: null }),
  token(stream, state) {
    // Comments
    if (stream.match(/^%.*/)) {
      return 'comment'
    }

    // Display math $$
    if (stream.match('$$')) {
      state.inMath = state.inMath === 'display' ? null : 'display'
      return 'keyword'
    }

    // Inline math $
    if (stream.peek() === '$') {
      stream.next()
      state.inMath = state.inMath === 'inline' ? null : 'inline'
      return 'keyword'
    }

    // Escaped special chars
    if (stream.match(/^\\[%&$#_{}\\]/)) {
      return 'escape'
    }

    // \begin{...} and \end{...}
    if (stream.match(/^\\(begin|end)(?=\s*\{)/)) {
      return 'keyword'
    }

    // Sectioning & structural commands
    if (
      stream.match(
        /^\\(documentclass|usepackage|title|author|date|maketitle|tableofcontents|section|subsection|subsubsection|paragraph|chapter|part|input|include|bibliography|bibliographystyle|newcommand|renewcommand|newtheorem|DeclareMathOperator)\*?/,
      )
    ) {
      return 'definitionKeyword'
    }

    // Reference & citation commands
    if (stream.match(/^\\(label|ref|eqref|autoref|cref|Cref|cite|citep|citet|nocite|href|url)\b/)) {
      return 'link'
    }

    // Generic LaTeX commands
    if (stream.match(/^\\[a-zA-Z@]+\*?/)) {
      return state.inMath ? 'operatorKeyword' : 'tagName'
    }

    // Braces and brackets
    if (stream.match(/^[{}[\]]/)) {
      return 'bracket'
    }

    // BibTeX @article, @book, etc.
    if (stream.sol() && stream.match(/^@[a-zA-Z]+/)) {
      return 'definitionKeyword'
    }

    // Numbers & math operators
    if (state.inMath) {
      if (stream.match(/^[0-9]+(\.[0-9]+)?/)) return 'number'
      if (stream.match(/^[=+\-*/^_&|<>!]/)) return 'operator'
      stream.next()
      return 'string'
    }

    if (stream.match(/^[&^_~]/)) {
      return 'operator'
    }

    stream.next()
    return null
  },
})

export const xdriveLatexHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: 'var(--xd-ink-muted)', fontStyle: 'italic' },
  { tag: tags.definitionKeyword, color: 'var(--xd-accent)', fontWeight: '600' },
  { tag: tags.keyword, color: 'var(--xd-commit)', fontWeight: '600' },
  { tag: tags.tagName, color: 'var(--xd-accent)' },
  { tag: tags.operatorKeyword, color: 'var(--xd-sketch)' },
  { tag: tags.link, color: 'var(--xd-commit)' },
  { tag: tags.string, color: 'var(--xd-sketch)' },
  { tag: tags.bracket, color: 'var(--xd-ink-secondary)' },
  { tag: tags.number, color: 'var(--xd-sketch)' },
  { tag: tags.operator, color: 'var(--xd-ink-secondary)' },
  { tag: tags.escape, color: 'var(--xd-ink-secondary)' },
])

export const latexSyntaxSupport = [
  latexStreamLanguage,
  syntaxHighlighting(xdriveLatexHighlightStyle),
  foldService.of((state, lineStart, lineEnd) => {
    const lineText = state.doc.sliceString(lineStart, lineEnd)
    const beginM = lineText.match(/\\begin\{([^}]+)\}/)
    if (beginM) {
      const env = beginM[1]
      const endToken = `\\end{${env}}`
      const beginToken = `\\begin{${env}}`
      let depth = 1
      let lineNo = state.doc.lineAt(lineStart).number + 1
      while (lineNo <= state.doc.lines) {
        const l = state.doc.line(lineNo)
        if (l.text.includes(beginToken)) depth++
        if (l.text.includes(endToken)) {
          depth--
          if (depth === 0) {
            return { from: lineEnd, to: l.to }
          }
        }
        lineNo++
      }
    }
    if (/^\s*\\section\*?\{/.test(lineText)) {
      let lineNo = state.doc.lineAt(lineStart).number + 1
      let lastLine = state.doc.lineAt(lineStart)
      while (lineNo <= state.doc.lines) {
        const l = state.doc.line(lineNo)
        if (/^\s*(\\section\*?\{|\\end\{document\})/.test(l.text)) {
          break
        }
        lastLine = l
        lineNo++
      }
      if (lastLine.to > lineEnd) {
        return { from: lineEnd, to: lastLine.to }
      }
    }
    return null
  }),
]

/* ============================================================================
   2. Overleaf-Grade LaTeX Autocomplete Catalog
   ============================================================================ */

export const LATEX_ENVIRONMENTS: Array<{
  name: string
  detail: string
  bodySnippet: string
}> = [
  { name: 'equation', detail: 'Numbered display equation', bodySnippet: '  ${}\n  \\label{eq:${label}}' },
  { name: 'equation*', detail: 'Unnumbered display equation', bodySnippet: '  ${}' },
  { name: 'align', detail: 'Multi-line aligned equations', bodySnippet: '  ${lhs} &= ${rhs} \\\\\n  ${lhs2} &= ${rhs2}' },
  { name: 'align*', detail: 'Unnumbered aligned equations', bodySnippet: '  ${lhs} &= ${rhs}' },
  { name: 'theorem', detail: 'Numbered theorem block', bodySnippet: '  \\label{thm:${label}}\n  ${Statement}' },
  { name: 'lemma', detail: 'Numbered lemma block', bodySnippet: '  \\label{lem:${label}}\n  ${Statement}' },
  { name: 'proposition', detail: 'Numbered proposition', bodySnippet: '  ${Statement}' },
  { name: 'corollary', detail: 'Numbered corollary', bodySnippet: '  ${Statement}' },
  { name: 'definition', detail: 'Numbered definition', bodySnippet: '  ${Definition}' },
  { name: 'proof', detail: 'Proof with QED tombstone', bodySnippet: '  ${Proof steps.}' },
  { name: 'abstract', detail: 'Paper abstract', bodySnippet: '  ${Abstract summary.}' },
  { name: 'itemize', detail: 'Bulleted list', bodySnippet: '  \\item ${First item}\n  \\item ${Second item}' },
  { name: 'enumerate', detail: 'Numbered list', bodySnippet: '  \\item ${First step}\n  \\item ${Second step}' },
  { name: 'description', detail: 'Labeled definition list', bodySnippet: '  \\item[${Term}] ${Description}' },
  { name: 'figure', detail: 'Floating figure with caption', bodySnippet: '  \\centering\n  \\includegraphics[width=0.85\\linewidth]{${figure.pdf}}\n  \\caption{${Figure caption.}}\n  \\label{fig:${label}}' },
  { name: 'table', detail: 'Floating booktabs table', bodySnippet: '  \\centering\n  \\caption{${Table caption.}}\n  \\label{tab:${label}}\n  \\begin{tabular}{lcc}\n    \\toprule\n    ${Col 1} & ${Col 2} & ${Col 3} \\\\\n    \\midrule\n    ${A} & ${1.0} & ${0.95} \\\\\n    \\bottomrule\n  \\end{tabular}' },
  { name: 'tabular', detail: 'Inline table grid', bodySnippet: '  \\toprule\n  ${A} & ${B} \\\\\n  \\midrule\n  ${1} & ${2} \\\\\n  \\bottomrule' },
  { name: 'pmatrix', detail: 'Parenthesized matrix', bodySnippet: '  ${a} & ${b} \\\\\n  ${c} & ${d}' },
  { name: 'bmatrix', detail: 'Bracketed matrix', bodySnippet: '  ${a} & ${b} \\\\\n  ${c} & ${d}' },
  { name: 'cases', detail: 'Piecewise function cases', bodySnippet: '  ${expr1}, & \\text{if } ${cond1} \\\\\n  ${expr2}, & \\text{otherwise}' },
  { name: 'quote', detail: 'Indented quotation', bodySnippet: '  ${Quoted text.}' },
  { name: 'verbatim', detail: 'Monospace verbatim block', bodySnippet: '${code}' },
  { name: 'center', detail: 'Centered block', bodySnippet: '  ${Content}' },
]

const LATEX_PACKAGES: Array<{ name: string; detail: string }> = [
  { name: 'amsmath', detail: 'AMS mathematical environments & operators' },
  { name: 'amssymb', detail: 'AMS math symbols & blackboard bold' },
  { name: 'amsthm', detail: 'Theorem, lemma, proof environments' },
  { name: 'booktabs', detail: 'Publication-quality horizontal table rules' },
  { name: 'graphicx', detail: 'Image & figure inclusion' },
  { name: 'hyperref', detail: 'Clickable cross-references & URLs' },
  { name: 'geometry', detail: 'Page margins and paper size' },
  { name: 'microtype', detail: 'Subtle typographic refinement' },
  { name: 'xcolor', detail: 'Color definitions and \\textcolor' },
  { name: 'natbib', detail: 'Author-year and numeric citations' },
  { name: 'cleveref', detail: 'Smart \\cref cross-referencing' },
  { name: 'tikz', detail: 'Vector diagrams and plots' },
  { name: 'listings', detail: 'Formatted source code listings' },
  { name: 'algorithm2e', detail: 'Pseudocode algorithm floats' },
]

const LATEX_COMMAND_COMPLETIONS: Completion[] = [
  // Document structure
  snippetCompletion('\\section{${Title}}', { label: '\\section', detail: 'Section heading', type: 'keyword', boost: 95 }),
  snippetCompletion('\\subsection{${Title}}', { label: '\\subsection', detail: 'Subsection heading', type: 'keyword', boost: 90 }),
  snippetCompletion('\\subsubsection{${Title}}', { label: '\\subsubsection', detail: 'Subsubsection heading', type: 'keyword', boost: 80 }),
  snippetCompletion('\\paragraph{${Title}}', { label: '\\paragraph', detail: 'Run-in paragraph heading', type: 'keyword' }),
  snippetCompletion('\\begin{${equation}}\n  ${}\n\\end{${equation}}', { label: '\\begin', detail: 'Start environment', type: 'keyword', boost: 99 }),
  snippetCompletion('\\label{${key}}', { label: '\\label', detail: 'Define cross-reference label', type: 'keyword', boost: 88 }),
  snippetCompletion('\\ref{${key}}', { label: '\\ref', detail: 'Reference a label', type: 'keyword', boost: 92 }),
  snippetCompletion('\\eqref{${eq:key}}', { label: '\\eqref', detail: 'Parenthesized equation reference', type: 'keyword', boost: 91 }),
  snippetCompletion('\\cite{${key}}', { label: '\\cite', detail: 'Cite BibTeX entry', type: 'keyword', boost: 94 }),
  snippetCompletion('\\citet{${key}}', { label: '\\citet', detail: 'Textual citation Author [n]', type: 'keyword' }),
  snippetCompletion('\\input{${sections/file}}', { label: '\\input', detail: 'Include another .tex file', type: 'keyword' }),
  snippetCompletion('\\usepackage{${amsmath}}', { label: '\\usepackage', detail: 'Load LaTeX package', type: 'keyword' }),
  snippetCompletion('\\newcommand{\\${cmd}}[${1}]{${body}}', { label: '\\newcommand', detail: 'Define custom macro', type: 'keyword' }),
  snippetCompletion('\\newtheorem{${theorem}}{${Theorem}}', { label: '\\newtheorem', detail: 'Define theorem environment', type: 'keyword' }),
  snippetCompletion('\\footnote{${Note text}}', { label: '\\footnote', detail: 'Insert numbered footnote', type: 'keyword' }),
  snippetCompletion('\\caption{${Caption text}}', { label: '\\caption', detail: 'Figure or table caption', type: 'keyword' }),
  snippetCompletion('\\includegraphics[width=0.8\\linewidth]{${figure.pdf}}', { label: '\\includegraphics', detail: 'Insert graphic', type: 'keyword' }),
  { label: '\\maketitle', detail: 'Render title, authors, and date', type: 'keyword' },
  { label: '\\tableofcontents', detail: 'Generate table of contents', type: 'keyword' },
  { label: '\\newpage', detail: 'Force page break', type: 'keyword' },
  { label: '\\clearpage', detail: 'Flush floats and start new page', type: 'keyword' },
  { label: '\\centering', detail: 'Center float content', type: 'keyword' },
  { label: '\\toprule', detail: 'Booktabs top horizontal rule', type: 'keyword' },
  { label: '\\midrule', detail: 'Booktabs mid horizontal rule', type: 'keyword' },
  { label: '\\bottomrule', detail: 'Booktabs bottom horizontal rule', type: 'keyword' },
  snippetCompletion('\\multicolumn{${2}}{${c}}{${Text}}', { label: '\\multicolumn', detail: 'Span table columns', type: 'keyword' }),

  // Text formatting
  snippetCompletion('\\textbf{${text}}', { label: '\\textbf', detail: 'Bold text', type: 'function', boost: 86 }),
  snippetCompletion('\\textit{${text}}', { label: '\\textit', detail: 'Italic text', type: 'function', boost: 85 }),
  snippetCompletion('\\emph{${text}}', { label: '\\emph', detail: 'Emphasized text', type: 'function', boost: 84 }),
  snippetCompletion('\\texttt{${code}}', { label: '\\texttt', detail: 'Monospace text', type: 'function' }),
  snippetCompletion('\\textsc{${Small Caps}}', { label: '\\textsc', detail: 'Small capitals', type: 'function' }),
  snippetCompletion('\\underline{${text}}', { label: '\\underline', detail: 'Underlined text', type: 'function' }),
  snippetCompletion('\\textcolor{${#5e6ad2}}{${text}}', { label: '\\textcolor', detail: 'Colored text', type: 'function' }),
  snippetCompletion('\\href{${https://}}{${label}}', { label: '\\href', detail: 'Hyperlink', type: 'function' }),
  snippetCompletion('\\url{${https://}}', { label: '\\url', detail: 'Formatted URL', type: 'function' }),

  // Core math constructs
  snippetCompletion('\\frac{${num}}{${den}}', { label: '\\frac', detail: 'Fraction a / b', type: 'function', boost: 98 }),
  snippetCompletion('\\sqrt{${x}}', { label: '\\sqrt', detail: 'Square root', type: 'function', boost: 87 }),
  snippetCompletion('\\sum_{${i=1}}^{${n}} ${}', { label: '\\sum', detail: 'Summation ∑', type: 'function', boost: 93 }),
  snippetCompletion('\\prod_{${i=1}}^{${n}} ${}', { label: '\\prod', detail: 'Product ∏', type: 'function' }),
  snippetCompletion('\\int_{${a}}^{${b}} ${} \\, d${x}', { label: '\\int', detail: 'Definite integral ∫', type: 'function', boost: 91 }),
  snippetCompletion('\\lim_{${n \\to \\infty}} ${}', { label: '\\lim', detail: 'Limit', type: 'function' }),
  snippetCompletion('\\binom{${n}}{${k}}', { label: '\\binom', detail: 'Binomial coefficient', type: 'function' }),
  snippetCompletion('\\left( ${} \\right)', { label: '\\left(', detail: 'Auto-sized parentheses', type: 'function', boost: 89 }),
  snippetCompletion('\\left[ ${} \\right]', { label: '\\left[', detail: 'Auto-sized brackets', type: 'function' }),
  snippetCompletion('\\left\\{ ${} \\right\\}', { label: '\\left\\{', detail: 'Auto-sized braces', type: 'function' }),
  snippetCompletion('\\mathbb{${R}}', { label: '\\mathbb', detail: 'Blackboard bold ℝ, ℂ, ℤ, ℕ', type: 'function', boost: 89 }),
  snippetCompletion('\\mathcal{${E}}', { label: '\\mathcal', detail: 'Calligraphic math font', type: 'function', boost: 88 }),
  snippetCompletion('\\mathrm{${d}}', { label: '\\mathrm', detail: 'Upright roman in math', type: 'function' }),
  snippetCompletion('\\text{${words}}', { label: '\\text', detail: 'Normal text inside math', type: 'function', boost: 86 }),
  snippetCompletion('\\hat{${x}}', { label: '\\hat', detail: 'Hat accent', type: 'function' }),
  snippetCompletion('\\tilde{${x}}', { label: '\\tilde', detail: 'Tilde accent', type: 'function' }),
  snippetCompletion('\\bar{${x}}', { label: '\\bar', detail: 'Overbar accent', type: 'function' }),
  snippetCompletion('\\vec{${v}}', { label: '\\vec', detail: 'Vector arrow', type: 'function' }),
  snippetCompletion('\\overline{${x}}', { label: '\\overline', detail: 'Overline', type: 'function' }),
  snippetCompletion('\\operatorname{${Tr}}', { label: '\\operatorname', detail: 'Custom upright operator', type: 'function' }),

  // Greek letters & math symbols
  { label: '\\alpha', detail: 'α', type: 'constant' },
  { label: '\\beta', detail: 'β', type: 'constant' },
  { label: '\\gamma', detail: 'γ', type: 'constant' },
  { label: '\\Gamma', detail: 'Γ', type: 'constant' },
  { label: '\\delta', detail: 'δ', type: 'constant' },
  { label: '\\Delta', detail: 'Δ', type: 'constant' },
  { label: '\\epsilon', detail: 'ϵ', type: 'constant' },
  { label: '\\varepsilon', detail: 'ε', type: 'constant' },
  { label: '\\zeta', detail: 'ζ', type: 'constant' },
  { label: '\\eta', detail: 'η', type: 'constant' },
  { label: '\\theta', detail: 'θ', type: 'constant' },
  { label: '\\Theta', detail: 'Θ', type: 'constant' },
  { label: '\\lambda', detail: 'λ', type: 'constant' },
  { label: '\\Lambda', detail: 'Λ', type: 'constant' },
  { label: '\\mu', detail: 'μ', type: 'constant' },
  { label: '\\nu', detail: 'ν', type: 'constant' },
  { label: '\\xi', detail: 'ξ', type: 'constant' },
  { label: '\\pi', detail: 'π', type: 'constant' },
  { label: '\\Pi', detail: 'Π', type: 'constant' },
  { label: '\\rho', detail: 'ρ', type: 'constant' },
  { label: '\\sigma', detail: 'σ', type: 'constant' },
  { label: '\\Sigma', detail: 'Σ', type: 'constant' },
  { label: '\\tau', detail: 'τ', type: 'constant' },
  { label: '\\phi', detail: 'ϕ', type: 'constant' },
  { label: '\\varphi', detail: 'φ', type: 'constant' },
  { label: '\\Phi', detail: 'Φ', type: 'constant' },
  { label: '\\chi', detail: 'χ', type: 'constant' },
  { label: '\\psi', detail: 'ψ', type: 'constant' },
  { label: '\\Psi', detail: 'Ψ', type: 'constant' },
  { label: '\\omega', detail: 'ω', type: 'constant' },
  { label: '\\Omega', detail: 'Ω', type: 'constant' },

  // Relations & operators
  { label: '\\leq', detail: '≤ less or equal', type: 'constant' },
  { label: '\\geq', detail: '≥ greater or equal', type: 'constant' },
  { label: '\\neq', detail: '≠ not equal', type: 'constant' },
  { label: '\\approx', detail: '≈ approximately', type: 'constant' },
  { label: '\\equiv', detail: '≡ equivalent', type: 'constant' },
  { label: '\\sim', detail: '∼ similar / distributed as', type: 'constant' },
  { label: '\\propto', detail: '∝ proportional to', type: 'constant' },
  { label: '\\in', detail: '∈ element of', type: 'constant' },
  { label: '\\notin', detail: '∉ not element of', type: 'constant' },
  { label: '\\subset', detail: '⊂ subset', type: 'constant' },
  { label: '\\subseteq', detail: '⊆ subset or equal', type: 'constant' },
  { label: '\\cup', detail: '∪ union', type: 'constant' },
  { label: '\\cap', detail: '∩ intersection', type: 'constant' },
  { label: '\\forall', detail: '∀ for all', type: 'constant' },
  { label: '\\exists', detail: '∃ there exists', type: 'constant' },
  { label: '\\infty', detail: '∞ infinity', type: 'constant' },
  { label: '\\partial', detail: '∂ partial derivative', type: 'constant' },
  { label: '\\nabla', detail: '∇ gradient / del', type: 'constant' },
  { label: '\\cdot', detail: '· center dot', type: 'constant' },
  { label: '\\cdots', detail: '⋯ centered ellipsis', type: 'constant' },
  { label: '\\ldots', detail: '… lower ellipsis', type: 'constant' },
  { label: '\\times', detail: '× cross / times', type: 'constant' },
  { label: '\\otimes', detail: '⊗ tensor product', type: 'constant' },
  { label: '\\oplus', detail: '⊕ direct sum', type: 'constant' },
  { label: '\\pm', detail: '± plus-minus', type: 'constant' },
  { label: '\\to', detail: '→ right arrow', type: 'constant' },
  { label: '\\mapsto', detail: '↦ maps to', type: 'constant' },
  { label: '\\implies', detail: '⟹ implies', type: 'constant' },
  { label: '\\iff', detail: '⟺ if and only if', type: 'constant' },
  { label: '\\dagger', detail: '† Hermitian conjugate', type: 'constant' },
  { label: '\\langle', detail: '⟨ left angle bracket', type: 'constant' },
  { label: '\\rangle', detail: '⟩ right angle bracket', type: 'constant' },
  { label: '\\log', detail: 'logarithm', type: 'function' },
  { label: '\\exp', detail: 'exponential', type: 'function' },
  { label: '\\sin', detail: 'sine', type: 'function' },
  { label: '\\cos', detail: 'cosine', type: 'function' },
  { label: '\\max', detail: 'maximum', type: 'function' },
  { label: '\\min', detail: 'minimum', type: 'function' },
  { label: '\\arg', detail: 'argument', type: 'function' },
]

export interface LatexAutocompleteData {
  labels: LatexLabelInfo[]
  bibEntries: BibEntry[]
  files: LatexProjectFile[]
}

export function createLatexCompletionSource(
  getData: () => LatexAutocompleteData,
) {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos)
    const before = line.text.slice(0, context.pos - line.from)

    // 1. \begin{...} environment autocomplete with auto-closing \end{...}
    const beginMatch = before.match(/\\begin\{([a-zA-Z*]*)$/)
    if (beginMatch) {
      const from = context.pos - beginMatch[1].length
      const afterCursor = line.text.slice(context.pos - line.from)
      const hasClosingBrace = afterCursor.startsWith('}')
      return {
        from,
        options: LATEX_ENVIRONMENTS.map((env) =>
          snippetCompletion(
            `${env.name}${hasClosingBrace ? '' : '}'}\n${env.bodySnippet}\n\\end{${env.name}}`,
            {
              label: env.name,
              detail: env.detail,
              type: 'class',
            },
          ),
        ),
      }
    }

    // 2. \cite{...}, \citep{...}, \citet{...} autocomplete from project .bib files
    const citeMatch = before.match(/\\cite[pt]?(?:\[[^\]]*\])?\{(?:[^}]*,\s*)?([a-zA-Z0-9_:-]*)$/)
    if (citeMatch) {
      const from = context.pos - citeMatch[1].length
      const { bibEntries } = getData()
      return {
        from,
        options: bibEntries.map((entry) => ({
          label: entry.key,
          detail: `${entry.year}`,
          info: `${entry.author} — ${entry.title}`,
          type: 'variable',
        })),
      }
    }

    // 3. \ref{...}, \eqref{...}, \autoref{...} autocomplete from project \label{...}
    const refMatch = before.match(/\\(?:eq|auto|c|C)?ref\{([a-zA-Z0-9_:-]*)$/)
    if (refMatch) {
      const from = context.pos - refMatch[1].length
      const { labels } = getData()
      return {
        from,
        options: labels.map((lbl) => ({
          label: lbl.key,
          detail: lbl.number ? `${lbl.kind} ${lbl.number}` : lbl.kind,
          info: `${lbl.title} (${lbl.file}:${lbl.line})`,
          type: 'property',
        })),
      }
    }

    // 4. \input{...} / \include{...} autocomplete from project .tex files
    const inputMatch = before.match(/\\(?:input|include)\{([a-zA-Z0-9_./-]*)$/)
    if (inputMatch) {
      const from = context.pos - inputMatch[1].length
      const { files } = getData()
      return {
        from,
        options: files
          .filter((f) => f.kind === 'tex' || f.path.endsWith('.tex'))
          .map((f) => ({
            label: f.path.replace(/\.tex$/, ''),
            detail: f.path,
            type: 'text',
          })),
      }
    }

    // 5. \usepackage{...} autocomplete
    const pkgMatch = before.match(/\\usepackage(?:\[[^\]]*\])?\{(?:[^}]*,\s*)?([a-zA-Z0-9_-]*)$/)
    if (pkgMatch) {
      const from = context.pos - pkgMatch[1].length
      return {
        from,
        options: LATEX_PACKAGES.map((pkg) => ({
          label: pkg.name,
          detail: pkg.detail,
          type: 'namespace',
        })),
      }
    }

    // 6. General \command autocomplete
    const cmdMatch = before.match(/\\[a-zA-Z*]*$/)
    if (cmdMatch && (cmdMatch[0].length > 1 || context.explicit)) {
      return {
        from: context.pos - cmdMatch[0].length,
        options: LATEX_COMMAND_COMPLETIONS,
      }
    }

    return null
  }
}

/* ============================================================================
   3. CodeMirror 6 xDrive Theme (Obsidian Studio Dark & Alabaster Lab Light)
   ============================================================================ */

export function createXDriveEditorTheme(fontSize: number) {
  return EditorView.theme({
    '&': {
      height: '100%',
      backgroundColor: 'var(--xd-canvas)',
      color: 'var(--xd-ink)',
      fontSize: `${fontSize}px`,
      fontFamily: 'var(--font-mono)',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'var(--font-mono)',
      lineHeight: '1.62',
    },
    '.cm-content': {
      padding: '12px 0 64px',
      caretColor: 'var(--xd-accent)',
    },
    '.cm-line': {
      padding: '0 14px',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--xd-rail)',
      color: 'var(--xd-ink-muted)',
      borderRight: '1px solid var(--xd-border)',
      fontVariantNumeric: 'tabular-nums',
      minWidth: '44px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--xd-elevated)',
      color: 'var(--xd-ink)',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--xd-accent-soft)',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--xd-accent)',
      borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      {
        backgroundColor: 'var(--xd-accent-border)',
      },
    '.cm-matchingBracket, .cm-nonmatchingBracket': {
      backgroundColor: 'var(--xd-surface-active)',
      outline: '1px solid var(--xd-accent-border)',
      borderRadius: '2px',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--xd-elevated)',
      border: '1px solid var(--xd-border-strong)',
      borderRadius: '6px',
      color: 'var(--xd-ink)',
      boxShadow: '0 10px 24px rgba(0, 0, 0, 0.28)',
      overflow: 'hidden',
    },
    '.cm-tooltip-autocomplete': {
      fontFamily: 'var(--font-sans)',
      fontSize: '12px',
    },
    '.cm-tooltip-autocomplete > ul': {
      maxHeight: '240px',
      padding: '4px',
    },
    '.cm-tooltip-autocomplete > ul > li': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '4px 8px',
      borderRadius: '4px',
      color: 'var(--xd-ink)',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: 'var(--xd-accent-soft)',
      color: 'var(--xd-ink)',
    },
    '.cm-completionLabel': {
      fontFamily: 'var(--font-mono)',
      fontSize: '12px',
      fontWeight: '500',
    },
    '.cm-completionDetail': {
      fontFamily: 'var(--font-sans)',
      fontSize: '11px',
      color: 'var(--xd-ink-muted)',
      fontStyle: 'normal',
      marginLeft: 'auto',
    },
    '.cm-completionInfo': {
      padding: '6px 10px',
      fontSize: '11.5px',
      color: 'var(--xd-ink-secondary)',
      borderLeft: '1px solid var(--xd-border)',
    },
    '.cm-panels': {
      backgroundColor: 'var(--xd-rail)',
      color: 'var(--xd-ink)',
      borderTop: '1px solid var(--xd-border)',
    },
    '.cm-search': {
      padding: '6px 10px',
      fontSize: '12px',
      fontFamily: 'var(--font-sans)',
    },
    '.cm-textfield': {
      backgroundColor: 'var(--xd-canvas)',
      border: '1px solid var(--xd-border-strong)',
      borderRadius: '4px',
      color: 'var(--xd-ink)',
      padding: '2px 6px',
    },
    '.cm-button': {
      backgroundImage: 'none',
      backgroundColor: 'var(--xd-elevated)',
      border: '1px solid var(--xd-border-strong)',
      borderRadius: '4px',
      color: 'var(--xd-ink)',
      padding: '2px 8px',
    },
    '.cm-lintRange-error': {
      backgroundImage: 'none',
      textDecoration: 'underline wavy var(--xd-danger)',
      textUnderlineOffset: '3px',
    },
    '.cm-lintRange-warning': {
      backgroundImage: 'none',
      textDecoration: 'underline wavy var(--xd-sketch)',
      textUnderlineOffset: '3px',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--xd-elevated)',
      border: '1px solid var(--xd-border-strong)',
      color: 'var(--xd-ink-muted)',
      borderRadius: '3px',
      padding: '0 4px',
      margin: '0 3px',
    },
  })
}
