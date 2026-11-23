import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { expect, userEvent, within } from 'storybook/test'
import {
  DEFAULT_LATEX_SEED,
  DIAGNOSTICS_LATEX_SEED,
  LatexApp,
  TWO_COLUMN_LATEX_SEED,
  compileLatexProject,
  generateCompiledPdfBytes,
} from './index'

const DARK_PDF_SEED = {
  ...DEFAULT_LATEX_SEED,
  invertPdf: true,
}

/**
 * Overleaf-parity LaTeX studio built in the xDrive design language.
 *
 * @summary Split LaTeX code editor with autocomplete, live compiler, paginated PDF preview, SyncTeX, and .tex/.pdf export
 */
const meta = {
  title: 'xDrive Apps/LaTeX Studio (Overleaf)',
  component: LatexApp,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Overleaf-parity LaTeX IDE styled with xDrive Obsidian Studio / Alabaster Lab tokens: multi-file project tree (.tex, .bib, .sty), live file outline, CodeMirror 6 editor with LaTeX/BibTeX syntax highlighting, snippet & label/citation autocomplete, live multi-pass compiler with KaTeX math typesetting, paginated US Letter/A4 PDF preview, compiler diagnostics & logs drawer, bidirectional SyncTeX, and real .pdf, .tex, and .zip exports.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="h-[740px] w-full overflow-hidden">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LatexApp>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Default Overleaf-style split workspace with project files, outline, CodeMirror LaTeX editor, and live compiled PDF preview.
 *
 * @summary Split LaTeX editor and live PDF preview
 */
export const SplitOverleafStudio: Story = {
  args: {
    initialState: DEFAULT_LATEX_SEED,
    initialLayout: 'split',
    initialShowSidebar: true,
    initialShowLogs: false,
    readOnly: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sidebarEl = canvasElement.querySelector<HTMLElement>(
      '[data-marble-id="latex-project-sidebar"]',
    )
    await expect(sidebarEl).not.toBeNull()
    const sidebar = within(sidebarEl!)
    await expect(sidebar.getByText('main.tex')).toBeVisible()
    await expect(sidebar.getByText('references.bib')).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: /Recompile/i }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: /Download PDF/i }),
    ).toBeVisible()

    // Verify compiled PDF output includes typeset title and KaTeX equations
    const pdfPane = canvasElement.querySelector(
      '[data-marble-id="latex-pdf-preview"]',
    )
    await expect(pdfPane).not.toBeNull()
    await expect(pdfPane?.textContent).toContain(
      'Fault-Tolerant Memory with Concatenated Surface Codes',
    )
    await expect(pdfPane?.querySelectorAll('.katex').length).toBeGreaterThan(0)

    // Verify switching files in the Overleaf project tree updates the active editor
    await userEvent.click(sidebar.getByText('references.bib'))
    await expect(canvasElement.textContent).toContain('@article{dennis2002')
    await userEvent.click(sidebar.getByText('main.tex'))

    // Verify real PDF binary export produces a valid %PDF- document
    const compiled = compileLatexProject(DEFAULT_LATEX_SEED)
    const pdfBytes = await generateCompiledPdfBytes({
      state: DEFAULT_LATEX_SEED,
      result: compiled,
    })
    const header = new TextDecoder().decode(pdfBytes.slice(0, 5))
    await expect(header).toBe('%PDF-')
    await expect(pdfBytes.byteLength).toBeGreaterThan(1000)
  },
}

/**
 * LaTeX project with intentional syntax errors and undefined references demonstrating compiler diagnostics, inline lint squiggles, and the Logs drawer.
 *
 * @summary Compiler errors, warnings, and logs drawer
 */
export const WithCompilerDiagnosticsAndLogs: Story = {
  args: {
    initialState: DIAGNOSTICS_LATEX_SEED,
    initialLayout: 'split',
    initialShowSidebar: true,
    initialShowLogs: true,
    readOnly: false,
  },
  play: async ({ canvasElement }) => {
    const logsPanel = canvasElement.querySelector(
      '[data-marble-id="latex-logs-panel"]',
    )
    await expect(logsPanel).not.toBeNull()
    await expect(logsPanel?.textContent).toContain('Environment mismatch')
  },
}

/**
 * Two-column conference manuscript compiled with `\documentclass[10pt,twocolumn]{article}`, booktabs tables, and BibTeX references.
 *
 * @summary Two-column conference paper layout
 */
export const TwoColumnConferencePaper: Story = {
  args: {
    initialState: TWO_COLUMN_LATEX_SEED,
    initialLayout: 'split',
    initialShowSidebar: true,
    initialShowLogs: false,
    readOnly: false,
  },
}

/**
 * Focused split view with dark-mode inverted PDF reading paper and collapsed project sidebar.
 *
 * @summary Dark PDF reading mode with collapsed sidebar
 */
export const DarkPdfReadingMode: Story = {
  args: {
    initialState: DARK_PDF_SEED,
    initialLayout: 'split',
    initialShowSidebar: false,
    initialShowLogs: false,
    readOnly: false,
  },
}

/**
 * Read-only viewer mode preserving PDF inspection, SyncTeX, outline navigation, and PDF/.tex export.
 *
 * @summary Read-only LaTeX viewing and export mode
 */
export const ReadOnlyViewingMode: Story = {
  args: {
    initialState: DEFAULT_LATEX_SEED,
    initialLayout: 'split',
    initialShowSidebar: true,
    initialShowLogs: false,
    readOnly: true,
  },
}
