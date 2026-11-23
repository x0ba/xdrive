import JSZip from 'jszip'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type {
  LatexCompileResult,
  LatexCompilerEngine,
  LatexProjectState,
} from './types'
import { PAPER_DIMENSIONS_PX } from './types'

function triggerBrowserDownload(blob: Blob, fileName: string) {
  if (typeof document === 'undefined') return
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function sanitizeBaseName(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'document'
  )
}

export function downloadTexFile(fileName: string, content: string) {
  const safeName = fileName.endsWith('.tex') || fileName.endsWith('.bib') || fileName.endsWith('.sty')
    ? fileName
    : `${fileName}.tex`
  const blob = new Blob([content], { type: 'application/x-tex;charset=utf-8' })
  triggerBrowserDownload(blob, safeName)
}

export function buildFlattenedTex(state: LatexProjectState): string {
  const main =
    state.files.find((f) => f.path === state.mainFile) ?? state.files.at(0)
  if (!main) return ''

  const resolveFile = (ref: string) => {
    const clean = ref.trim().replace(/^\.\//, '')
    return state.files.find(
      (f) => f.path === clean || f.path === `${clean}.tex`,
    )
  }

  return main.content.replace(
    /\\(input|include)\{([^}]+)\}/g,
    (full, _cmd: string, ref: string) => {
      const target = resolveFile(ref)
      if (!target) return full
      return `% --- Begin inlined ${target.path} ---\n${target.content}\n% --- End inlined ${target.path} ---`
    },
  )
}

export function downloadFlattenedTex(state: LatexProjectState) {
  const flattened = buildFlattenedTex(state)
  const base = sanitizeBaseName(state.title)
  downloadTexFile(`${base}.tex`, flattened)
}

export async function downloadProjectZip(state: LatexProjectState) {
  const zip = new JSZip()
  for (const file of state.files) {
    zip.file(file.path, file.content)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  const base = sanitizeBaseName(state.title)
  triggerBrowserDownload(blob, `${base}-latex-source.zip`)
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function stripToAscii(text: string): string {
  return text
    .replace(/—/g, '--')
    .replace(/–/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/×/g, 'x')
    .replace(/□/g, '[QED]')
    .replace(/[^\x20-\x7E\n]/g, ' ')
}

async function buildVectorFallbackPdf(
  state: LatexProjectState,
  result: LatexCompileResult,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  pdfDoc.setTitle(result.metadata.title || state.title)
  if (result.metadata.authors) pdfDoc.setAuthor(result.metadata.authors)
  pdfDoc.setCreator('xDrive LaTeX Studio')

  const dims = PAPER_DIMENSIONS_PX[result.metadata.paperSize]
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman)
  const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold)
  const margin = 64
  const maxWidth = dims.widthPt - margin * 2

  for (const compiledPage of result.pages) {
    const page = pdfDoc.addPage([dims.widthPt, dims.heightPt])
    let y = dims.heightPt - margin

    const plain = stripToAscii(
      compiledPage.html
        .replace(/<style[\s\S]*?<\/style>/g, '')
        .replace(/<\/(p|h1|h2|h3|h4|div|li|tr|section|header|figcaption)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    )

    const lines = plain.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim()
      if (!rawLine) {
        y -= 10
        continue
      }
      const isHeading = i === 0 && compiledPage.pageNumber === 1
      const activeFont = isHeading ? boldFont : font
      const size = isHeading ? 16 : 11
      const lineHeight = isHeading ? 22 : 15

      const words = rawLine.split(/\s+/)
      let current = ''
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word
        if (activeFont.widthOfTextAtSize(candidate, size) > maxWidth && current) {
          if (y < margin + 20) break
          page.drawText(current, {
            x: margin,
            y,
            size,
            font: activeFont,
            color: rgb(0.08, 0.09, 0.12),
          })
          y -= lineHeight
          current = word
        } else {
          current = candidate
        }
      }
      if (current && y >= margin + 20) {
        page.drawText(current, {
          x: margin,
          y,
          size,
          font: activeFont,
          color: rgb(0.08, 0.09, 0.12),
        })
        y -= lineHeight
      }
    }

    const pageNumText = String(compiledPage.pageNumber)
    const numWidth = font.widthOfTextAtSize(pageNumText, 10)
    page.drawText(pageNumText, {
      x: (dims.widthPt - numWidth) / 2,
      y: 34,
      size: 10,
      font,
      color: rgb(0.35, 0.38, 0.42),
    })
  }

  return pdfDoc.save()
}

export async function generateCompiledPdfBytes(options: {
  state: LatexProjectState
  result: LatexCompileResult
  pageElements?: HTMLElement[]
}): Promise<Uint8Array> {
  const { state, result, pageElements = [] } = options

  if (result.nativePdfBase64) {
    return base64ToUint8Array(result.nativePdfBase64)
  }

  if (pageElements.length > 0 && typeof window !== 'undefined') {
    try {
      const { default: html2canvas } = await import('html2canvas-pro')
      const pdfDoc = await PDFDocument.create()
      pdfDoc.setTitle(result.metadata.title || state.title)
      if (result.metadata.authors) pdfDoc.setAuthor(result.metadata.authors)
      pdfDoc.setCreator('xDrive LaTeX Studio')

      const dims = PAPER_DIMENSIONS_PX[result.metadata.paperSize]

      for (const el of pageElements) {
        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          onclone: (clonedDoc, clonedEl) => {
            clonedEl.classList.remove('is-inverted')
            clonedEl.style.transform = 'none'
            clonedEl.style.backgroundColor = '#ffffff'
            clonedEl.style.color = '#111318'
            const root = clonedDoc.documentElement
            root.classList.remove('dark')
          },
        })
        const pngDataUrl = canvas.toDataURL('image/png')
        const pngBytes = base64ToUint8Array(pngDataUrl.split(',')[1] ?? '')
        const pngImage = await pdfDoc.embedPng(pngBytes)
        const page = pdfDoc.addPage([dims.widthPt, dims.heightPt])
        const scale = Math.min(
          dims.widthPt / pngImage.width,
          dims.heightPt / pngImage.height,
        )
        const drawW = pngImage.width * scale
        const drawH = pngImage.height * scale
        page.drawImage(pngImage, {
          x: (dims.widthPt - drawW) / 2,
          y: dims.heightPt - drawH,
          width: drawW,
          height: drawH,
        })
      }

      return await pdfDoc.save()
    } catch {
      // Fall back to deterministic vector PDF
    }
  }

  return buildVectorFallbackPdf(state, result)
}

export async function exportCompiledPdf(options: {
  state: LatexProjectState
  result: LatexCompileResult
  pageElements?: HTMLElement[]
}): Promise<Uint8Array> {
  const bytes = await generateCompiledPdfBytes(options)
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
  const base = sanitizeBaseName(options.result.metadata.title || options.state.title)
  triggerBrowserDownload(blob, `${base}.pdf`)
  return bytes
}

export interface ServerLatexCapabilities {
  availableEngines: LatexCompilerEngine[]
}

export async function fetchServerLatexCapabilities(): Promise<ServerLatexCapabilities> {
  try {
    const res = await fetch('/api/latex', { method: 'GET' })
    if (!res.ok) return { availableEngines: [] }
    const data = (await res.json()) as {
      ok?: boolean
      availableEngines?: LatexCompilerEngine[]
    }
    return {
      availableEngines: Array.isArray(data.availableEngines)
        ? data.availableEngines
        : [],
    }
  } catch {
    return { availableEngines: [] }
  }
}

export interface NativeServerCompileResponse {
  ok: boolean
  available: boolean
  pdfBase64?: string
  log?: string
  error?: string
  durationMs?: number
}

export async function compileWithNativeServer(
  state: LatexProjectState,
  engine: Exclude<LatexCompilerEngine, 'xdrive-tex'>,
): Promise<NativeServerCompileResponse> {
  try {
    const res = await fetch('/api/latex', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engine,
        mainFile: state.mainFile,
        files: state.files.map((f) => ({ path: f.path, content: f.content })),
      }),
    })
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: string
        log?: string
        available?: boolean
      }
      return {
        ok: false,
        available: errBody.available ?? false,
        error: errBody.error ?? `Server returned ${res.status}`,
        log: errBody.log,
      }
    }
    return (await res.json()) as NativeServerCompileResponse
  } catch {
    return {
      ok: false,
      available: false,
      error: 'Native TeX server route unavailable',
    }
  }
}
