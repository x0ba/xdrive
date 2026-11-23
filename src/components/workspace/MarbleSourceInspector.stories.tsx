import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { MarbleSourceInspector } from './MarbleSourceInspector'

const SAMPLE_MARBLE_SOURCE = `<!DOCTYPE html>
<html lang="en">
  <body data-marble-id="root">
    <main data-marble-id="doc-main">
      <h1 data-marble-id="h-title" data-marble-editable>Fault-Tolerant Lattice Surgery</h1>
      <section data-marble-id="sec-abstract" data-marble-editable>
        <p data-marble-id="p-lead" data-marble-editable>Distance-preserving lattice surgery schedule achieving p_th = 1.04%.</p>
      </section>
      <table data-marble-id="tbl-results" data-marble-sortable="rows">
        <tr data-marble-id="row-1"><td>d = 5</td><td>1.04%</td></tr>
      </table>
    </main>
  </body>
</html>`

/**
 * Live `.mrbl` DOM inspector, structural doctor, and semantic op runner for inspecting and patching Marble documents.
 *
 * @summary Inspector for .mrbl DOM nodes, diagnostics, and raw HTML5 source
 */
const meta = {
  title: 'xDrive Workspace/Marble Source Inspector',
  component: MarbleSourceInspector,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="h-[620px] w-full bg-[var(--xd-canvas)]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MarbleSourceInspector>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Default inspector showing the parsed `.mrbl` node outline with a selected node highlighted.
 *
 * @summary Parsed Marble source inspector with selected node
 */
export const Default: Story = {
  args: {
    fileName: 'quantum-error-correction.mrbl',
    source: SAMPLE_MARBLE_SOURCE,
    selectedId: 'sec-abstract',
  },
}
