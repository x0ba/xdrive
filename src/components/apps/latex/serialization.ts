import { escapeText } from '#/lib/marble/engine-client'
import {
  DOCUMENT_DESIGN_SYSTEM_SLUG,
  DOCUMENT_DONTS_SYSTEM_SLUG,
  MARBLE_BASE_CSS,
} from '#/lib/marble/templates'
import type { LatexProjectFile, LatexProjectState } from './types'

export const DEFAULT_MAIN_TEX = String.raw`\documentclass[11pt,letterpaper]{article}
\usepackage{amsmath,amssymb,amsthm}
\usepackage{booktabs}
\usepackage{graphicx}
\usepackage{hyperref}
\usepackage{macros}

\newtheorem{theorem}{Theorem}
\newtheorem{lemma}{Lemma}
\newtheorem{definition}{Definition}

\title{Fault-Tolerant Memory with Concatenated Surface Codes}
\author{A. Okonkwo \and M. Chen \and The Lattice Lab}
\date{November 2026}

\begin{document}
\maketitle

\begin{abstract}
We study the logical error rate of a rotated surface code under circuit-level depolarizing noise. A finite-size collapse places the threshold near $p_{\mathrm{th}} \approx 0.90\%$ for minimum-weight perfect matching~\cite{dennis2002,fowler2012}. Below threshold, the logical failure rate per round decays exponentially with odd code distance $d$ while decoder runtime scales quadratically with syndrome defect count~\cite{higgott2022}.
\end{abstract}

\section{Introduction}\label{sec:intro}
A quantum memory is a promise about time. Every physical qubit experiences depolarizing faults at rate $p$ during stabilizer extraction rounds, modeled by the single-qubit Pauli channel
\begin{equation}
  \mathcal{E}(\rho) = (1 - p)\rho + \frac{p}{3}\left(X\rho X + Y\rho Y + Z\rho Z\right).
  \label{eq:channel}
\end{equation}
To sustain logical coherence across $T \gg 1$ cycles, syndrome defects must be matched faster than error chains percolate across the boundary~\cite{google2023}. We establish an explicit finite-distance upper bound in Section~\ref{sec:theorem} and validate the scaling collapse in Section~\ref{sec:results}.\footnote{All simulation seeds and PyMatching decoder commits are pinned in the accompanying xDrive lab notebook.}

\section{Formal Theorem and Proof}\label{sec:theorem}

\begin{definition}[Minimum-Weight Homology Class]\label{def:homology}
Let $G = (V, E)$ denote the space-time detector graph of a rotated distance-$d$ surface code. A logical failure occurs when the residual error $E \oplus \hat{E}$ contains a non-trivial cycle of weight at least $d$.
\end{definition}

\begin{theorem}[Sub-Threshold Exponential Suppression]\label{thm:scaling}
For odd code distance $d \geq 3$ and circuit-level physical error rate $p < p_{\mathrm{th}}$, the logical failure rate per stabilizer round satisfies
\begin{equation}
  P_L(d, p) \leq C \left(\frac{p}{p_{\mathrm{th}}}\right)^{(d+1)/2},
  \label{eq:scaling}
\end{equation}
where $C > 0$ absorbs the multiplicity of shortest non-contractible walks on the rotated lattice and $p_{\mathrm{th}} = (2\mu)^{-2}$ is set by the lattice connective constant $\mu$.
\end{theorem}

\begin{proof}
Fix a minimum-weight logical string $\gamma$ of length $\ell \geq d$. For the minimum-weight perfect matching decoder to misclassify $\gamma$, at least $\lceil \ell/2 \rceil$ edges along $\gamma$ must suffer physical faults. Applying a union bound over all self-avoiding walks of length $\ell$ yields
\begin{align}
  P_L(d, p) &\leq \sum_{\ell = d}^{\infty} N_{\ell} \binom{\ell}{\lceil \ell / 2 \rceil} p^{\lceil \ell / 2 \rceil} \label{eq:union} \\
            &\leq \sum_{\ell = d}^{\infty} \mu^{\ell} \, 2^{\ell} \, p^{(\ell + 1)/2}
             = C \left(\frac{p}{p_{\mathrm{th}}}\right)^{(d+1)/2}, \nonumber
\end{align}
which converges geometrically whenever $p / p_{\mathrm{th}} < 1$. Substituting~\eqref{eq:channel} into the edge-weight log-likelihood ratio completes the bound.
\end{proof}

\input{sections/results}

\bibliographystyle{plain}
\bibliography{references}

\end{document}
`

export const DEFAULT_RESULTS_TEX = String.raw`\section{Experimental Results}\label{sec:results}
We evaluate rotated surface codes at distances $d \in \{3, 5, 7, 9\}$ under uniform circuit-level depolarizing noise at $p = 0.45\% \approx 0.5\,p_{\mathrm{th}}$. As predicted by Theorem~\ref{thm:scaling} and~\eqref{eq:scaling}, each distance increment suppresses the logical error rate by a factor $\Lambda \approx 2.65$.

\begin{table}[h]
  \centering
  \caption{Measured logical error per round and median MWPM decode latency at $p = 0.45\%$.}
  \label{tab:scaling}
  \begin{tabular}{lccc}
    \toprule
    Distance ($d$) & Physical Qubits & Logical Error / Round & Median Decode ($\mu$s) \\
    \midrule
    $d = 3$ & 17 & $4.8 \times 10^{-3}$ & 11.4 \\
    $d = 5$ & 49 & $1.6 \times 10^{-3}$ & 34.2 \\
    $d = 7$ & 97 & $6.2 \times 10^{-4}$ & 81.9 \\
    $d = 9$ & 161 & $2.1 \times 10^{-4}$ & 162.5 \\
    \bottomrule
  \end{tabular}
\end{table}

\begin{figure}[h]
  \centering
  \includegraphics[width=0.88\linewidth]{figures/threshold-collapse.pdf}
  \caption{Finite-size scaling collapse of $P_L(d, p)$ across distances $d = 3, 5, 7, 9$ confirming $p_{\mathrm{th}} = 0.90(2)\%$ and suppression factor $\Lambda = 2.65$.}
  \label{fig:collapse}
\end{figure}

Key empirical observations from Table~\ref{tab:scaling} and Figure~\ref{fig:collapse}:
\begin{itemize}
  \item At $d = 7$, logical failure drops below $10^{-3}$ per round, crossing the break-even threshold for long-lived quantum memory.
  \item Sparse blossom matching~\cite{higgott2022} keeps median decoding below $100\,\mu\text{s}$ through $d = 7$, well within a $1\,\text{ms}$ cryogenic control budget.
  \item Correlated leakage faults account for the remaining residual discrepancy relative to the idealized Pauli channel~\eqref{eq:channel}.
\end{itemize}
`

export const DEFAULT_REFERENCES_BIB = String.raw`@article{dennis2002,
  author  = {Eric Dennis and Alexei Kitaev and Andrew Landahl and John Preskill},
  title   = {Topological quantum memory},
  journal = {Journal of Mathematical Physics},
  volume  = {43},
  pages   = {4452--4505},
  year    = {2002},
  doi     = {10.1063/1.1499754}
}

@article{fowler2012,
  author  = {Austin G. Fowler and Matteo Mariantoni and John M. Martinis and Andrew N. Cleland},
  title   = {Surface codes: Towards practical large-scale quantum computation},
  journal = {Physical Review A},
  volume  = {86},
  pages   = {032324},
  year    = {2012},
  doi     = {10.1103/PhysRevA.86.032324}
}

@article{higgott2022,
  author  = {Oscar Higgott and Craig Gidney},
  title   = {Sparse Blossom: correcting a million errors per core second with minimum-weight matching},
  journal = {Quantum},
  volume  = {9},
  pages   = {1600},
  year    = {2025},
  doi     = {10.22331/q-2025-01-20-1600}
}

@article{google2023,
  author  = {Google Quantum AI},
  title   = {Suppressing quantum errors by scaling a surface code logical qubit},
  journal = {Nature},
  volume  = {614},
  pages   = {676--681},
  year    = {2023},
  doi     = {10.1038/s41586-022-05434-1}
}
`

export const DEFAULT_MACROS_STY = String.raw`% Custom project macros automatically loaded by the xDrive TeX compiler
\newcommand{\ket}[1]{\left|#1\right\rangle}
\newcommand{\bra}[1]{\left\langle#1\right|}
\newcommand{\braket}[2]{\left\langle#1\middle|#2\right\rangle}
\newcommand{\pth}{p_{\mathrm{th}}}
\DeclareMathOperator{\Tr}{Tr}
`

export const DEFAULT_LATEX_FILES: LatexProjectFile[] = [
  {
    id: 'file-main',
    path: 'main.tex',
    kind: 'tex',
    content: DEFAULT_MAIN_TEX,
  },
  {
    id: 'file-results',
    path: 'sections/results.tex',
    kind: 'tex',
    content: DEFAULT_RESULTS_TEX,
  },
  {
    id: 'file-bib',
    path: 'references.bib',
    kind: 'bib',
    content: DEFAULT_REFERENCES_BIB,
  },
  {
    id: 'file-macros',
    path: 'macros.sty',
    kind: 'sty',
    content: DEFAULT_MACROS_STY,
  },
]

export const DEFAULT_LATEX_SEED: LatexProjectState = {
  title: 'LaTeX Paper & Theorem Studio',
  mainFile: 'main.tex',
  files: DEFAULT_LATEX_FILES,
  compiler: 'xdrive-tex',
  paperSize: 'letter',
  autoCompile: true,
  wordWrap: true,
  editorFontSize: 13,
  invertPdf: false,
}

export const TWO_COLUMN_LATEX_SEED: LatexProjectState = {
  ...DEFAULT_LATEX_SEED,
  title: 'Sparse Attention Kernels (Two-Column)',
  files: [
    {
      id: 'file-main-2col',
      path: 'main.tex',
      kind: 'tex',
      content: String.raw`\documentclass[10pt,twocolumn,letterpaper]{article}
\usepackage{amsmath,amssymb,amsthm}
\usepackage{booktabs}
\usepackage{hyperref}

\newtheorem{theorem}{Theorem}

\title{Block-Sparse Flash Attention with Adaptive Routing}
\author{M. Lin \and S. Patel \and xDrive Systems Group}
\date{November 2026}

\begin{document}
\maketitle

\begin{abstract}
We present a hardware-aligned block-sparse attention kernel that prunes $82\%$ of key-value tiles while preserving full-sequence perplexity within $0.03$ nats across $128\text{k}$ context benchmarks~\cite{dennis2002}.
\end{abstract}

\section{Formulation}\label{sec:formulation}
Given query $Q \in \mathbb{R}^{N \times d}$ and key-value matrices $K, V \in \mathbb{R}^{N \times d}$, partitioned into tiles of size $B = 128$, we compute a lightweight routing score
\begin{equation}
  S_{ij} = \frac{1}{\sqrt{d}} \langle \bar{q}_i, \bar{k}_j \rangle, \qquad M_{ij} = \mathbb{I}\!\left[S_{ij} \geq \tau_i\right].
  \label{eq:router}
\end{equation}
Only tiles with $M_{ij} = 1$ are streamed from HBM into SRAM, cutting memory traffic linearly with the active sparsity ratio $\rho$.

\begin{theorem}[Spectral Approximation Error]\label{thm:sparse}
If the retained tile mass satisfies $\sum_{j: M_{ij}=1} \alpha_{ij} \geq 1 - \varepsilon$ for every query block $i$, then the output perturbation obeys $\|O - \hat{O}\|_{\infty} \leq 2\varepsilon \|V\|_{\infty}$.
\end{theorem}

\section{Throughput Benchmarks}\label{sec:bench}
Table~\ref{tab:throughput} compares end-to-end prefill latency across sequence lengths. Equation~\eqref{eq:router} adds less than $1.4\%$ routing overhead.

\begin{table}[h]
  \centering
  \caption{Prefill latency (ms) at batch size 1, FP16.}
  \label{tab:throughput}
  \begin{tabular}{lrrr}
    \toprule
    Context & Dense & Sparse ($\rho=0.2$) & Speedup \\
    \midrule
    16k & 42.1 & 14.8 & $2.8\times$ \\
    64k & 618.0 & 118.4 & $5.2\times$ \\
    128k & 2490.2 & 421.6 & $5.9\times$ \\
    \bottomrule
  \end{tabular}
\end{table}

\bibliographystyle{plain}
\bibliography{references}
\end{document}
`,
    },
    {
      id: 'file-bib-2col',
      path: 'references.bib',
      kind: 'bib',
      content: DEFAULT_REFERENCES_BIB,
    },
  ],
}

export const DIAGNOSTICS_LATEX_SEED: LatexProjectState = {
  ...DEFAULT_LATEX_SEED,
  title: 'Draft with Compiler Diagnostics',
  files: [
    {
      id: 'file-main-err',
      path: 'main.tex',
      kind: 'tex',
      content: String.raw`\documentclass[11pt]{article}
\usepackage{amsmath,amsthm}
\title{Threshold Draft with Diagnostics}
\author{A. Okonkwo}
\date{November 2026}

\begin{document}
\maketitle

\section{Preliminary Bound}
As shown in Theorem~\ref{thm:missing-label} and~\cite{unknown2026}, the logical failure rate obeys
\begin{equation}
  P_L \leq \frac{p}{p_{\mathrm{th}}
\end{equation}

\begin{itemize}
  \item First check unclosed math or braces.
\end{enumerate}

\end{document}
`,
    },
    {
      id: 'file-bib-err',
      path: 'references.bib',
      kind: 'bib',
      content: DEFAULT_REFERENCES_BIB,
    },
  ],
}

export function cloneLatexState(state: LatexProjectState): LatexProjectState {
  return {
    ...state,
    files: state.files.map((f) => ({ ...f })),
  }
}

export function parseLatexFromMarbleSource(source: string): LatexProjectState {
  if (typeof DOMParser === 'undefined' || !source.trim()) {
    return cloneLatexState(DEFAULT_LATEX_SEED)
  }

  try {
    const doc = new DOMParser().parseFromString(source, 'text/html')

    // 1. Check for embedded LaTeX project JSON state
    const embedded = doc.querySelector('script[data-marble-latex-state="1"]')
    if (embedded?.textContent) {
      const parsed = JSON.parse(embedded.textContent) as Partial<LatexProjectState>
      if (Array.isArray(parsed.files) && parsed.files.length > 0) {
        return {
          title: parsed.title || DEFAULT_LATEX_SEED.title,
          mainFile: parsed.mainFile || parsed.files[0].path,
          files: parsed.files.map((f, idx) => ({
            id: f.id || `file-${idx + 1}`,
            path: f.path || `file-${idx + 1}.tex`,
            kind: (f.kind as LatexProjectFile['kind'] | undefined) ?? 'tex',
            content: typeof f.content === 'string' ? f.content : '',
          })),
          compiler: parsed.compiler ?? 'xdrive-tex',
          paperSize: parsed.paperSize ?? 'letter',
          autoCompile: parsed.autoCompile ?? true,
          wordWrap: parsed.wordWrap ?? true,
          editorFontSize: parsed.editorFontSize ?? 13,
          invertPdf: parsed.invertPdf ?? false,
        }
      }
    }

    // 2. Legacy latex-paper.mrbl HTML conversion: extract title/authors if customized
    const paperTitle =
      doc.querySelector('[data-marble-id="paper-title-v1"]')?.textContent.trim() ||
      doc.querySelector('title')?.textContent.trim()
    const paperAuthors =
      doc.querySelector('[data-marble-id="paper-authors"]')?.textContent.trim()

    const base = cloneLatexState(DEFAULT_LATEX_SEED)
    if (paperTitle && paperTitle !== 'Fault-Tolerant Memory with Concatenated Surface Codes') {
      base.title = paperTitle
      base.files[0] = {
        ...base.files[0],
        content: base.files[0].content.replace(
          /\\title\{[^}]*\}/,
          `\\title{${paperTitle}}`,
        ),
      }
    }
    if (paperAuthors && paperAuthors !== 'A. Okonkwo, M. Chen, and the Lattice Lab') {
      base.files[0] = {
        ...base.files[0],
        content: base.files[0].content.replace(
          /\\author\{[^}]*\}/,
          `\\author{${paperAuthors}}`,
        ),
      }
    }
    return base
  } catch {
    return cloneLatexState(DEFAULT_LATEX_SEED)
  }
}

export function serializeLatexToMarbleSource(state: LatexProjectState): string {
  const safeJson = JSON.stringify(state).replace(/<\/script/gi, '<\\/script')
  const main =
    state.files.find((f) => f.path === state.mainFile) ?? state.files.at(0)
  const excerpt = (main?.content ?? '').slice(0, 1200)

  return `<!doctype html>
<html lang="en" data-marble="1">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="marble:capabilities" content="storage; net=none">
<meta name="marble:design-system" content="${DOCUMENT_DESIGN_SYSTEM_SLUG}.mrbl,${DOCUMENT_DONTS_SYSTEM_SLUG}.mrbl">
<title>${escapeText(state.title)}</title>
<style>${MARBLE_BASE_CSS}
main.latex-mrbl-shell { max-width: 56rem; margin: 0 auto; padding: 2rem 1.5rem 3rem; }
pre.latex-mrbl-src { font: 12.5px/1.6 var(--mono); background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 1rem; overflow-x: auto; white-space: pre-wrap; }
</style>
</head>
<body>
<main data-marble-id="latex-studio-root" class="latex-mrbl-shell">
  <h1 data-marble-id="paper-title-v1" data-marble-editable>${escapeText(state.title)}</h1>
  <pre data-marble-id="latex-main-source" class="latex-mrbl-src">${escapeText(excerpt)}</pre>
</main>
<script type="application/json" data-marble-latex-state="1">${safeJson}</script>
</body>
</html>
`
}
