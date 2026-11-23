export type LatexFileKind = 'tex' | 'bib' | 'sty' | 'cls' | 'txt'

export interface LatexProjectFile {
  id: string
  path: string
  kind: LatexFileKind
  content: string
}

export type LatexCompilerEngine =
  | 'xdrive-tex'
  | 'pdflatex'
  | 'xelatex'
  | 'lualatex'

export type LatexPaperSize = 'letter' | 'a4'

export type LatexLayoutMode = 'split' | 'editor' | 'pdf'

export interface LatexDiagnostic {
  id: string
  severity: 'error' | 'warning' | 'info'
  file: string
  line: number
  column?: number
  message: string
  detail?: string
}

export interface LatexOutlineItem {
  id: string
  level: 1 | 2 | 3 | 4
  number: string
  title: string
  file: string
  line: number
  kind: 'section' | 'theorem' | 'equation'
}

export interface BibEntry {
  key: string
  type: string
  author: string
  title: string
  venue: string
  year: string
  doi?: string
  url?: string
  raw: string
}

export interface LatexLabelInfo {
  key: string
  kind: 'section' | 'theorem' | 'equation' | 'figure' | 'table'
  number: string
  title: string
  file: string
  line: number
}

export interface CompiledPdfPage {
  pageNumber: number
  html: string
  footnotes: Array<{ number: number; html: string }>
}

export interface LatexDocumentMetadata {
  title: string
  authors: string
  date: string
  documentClass: string
  twoColumn: boolean
  fontSizePt: number
  paperSize: LatexPaperSize
}

export interface LatexCompileResult {
  ok: boolean
  engine: LatexCompilerEngine
  compiledAt: number
  durationMs: number
  pageCount: number
  pages: CompiledPdfPage[]
  diagnostics: LatexDiagnostic[]
  logs: string[]
  outline: LatexOutlineItem[]
  labels: Record<string, LatexLabelInfo>
  citations: Record<string, BibEntry>
  citedKeys: string[]
  metadata: LatexDocumentMetadata
  wordCount: number
  nativePdfBase64?: string
}

export interface LatexProjectState {
  title: string
  mainFile: string
  files: LatexProjectFile[]
  compiler: LatexCompilerEngine
  paperSize: LatexPaperSize
  autoCompile: boolean
  wordWrap: boolean
  editorFontSize: number
  invertPdf: boolean
}

export const PAPER_DIMENSIONS_PX: Record<
  LatexPaperSize,
  { width: number; height: number; widthPt: number; heightPt: number; label: string }
> = {
  letter: {
    width: 794,
    height: 1028,
    widthPt: 612,
    heightPt: 792,
    label: 'US Letter (8.5 × 11 in)',
  },
  a4: {
    width: 794,
    height: 1123,
    widthPt: 595.28,
    heightPt: 841.89,
    label: 'A4 (210 × 297 mm)',
  },
}
