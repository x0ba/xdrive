import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { PREDEFINED_MARBLE_TEMPLATES } from '#/lib/marble/templates'
import type { DocumentVersionDetail } from '#/lib/marble/version-history-types'
import { withWhiteboardSnapshot } from '#/lib/marble/whiteboard-document'
import { VersionDiffPreview } from './VersionDiffPreview'

const PAST_DOC_SOURCE = `<!doctype html>
<html lang="en" data-marble="1">
<head><meta charset="utf-8"><title>Logical Memory Specification</title></head>
<body>
  <article data-marble-id="doc-shell">
    <h1 data-marble-id="doc-title">Logical Memory Specification</h1>
    <p data-marble-id="summary-v1">Threshold sweep targets 10^-3 logical error per round at distance 5.</p>
    <p data-marble-id="sec-method-p">Decoder: minimum-weight perfect matching v1.</p>
  </article>
  <script type="application/json" data-marble-docs-state="1">${JSON.stringify({
    title: 'Logical Memory Specification',
    html: '<h1>Logical Memory Specification</h1><p>Threshold sweep targets 10^-3 logical error per round at distance 5.</p><p>Decoder: minimum-weight perfect matching v1.</p>',
  })}</script>
</body>
</html>`

const CURRENT_DOC_SOURCE = `<!doctype html>
<html lang="en" data-marble="1">
<head><meta charset="utf-8"><title>Logical Memory Specification</title></head>
<body>
  <article data-marble-id="doc-shell">
    <h1 data-marble-id="doc-title">Logical Memory Specification</h1>
    <p data-marble-id="summary-v1">Threshold sweep targets 10^-3 logical error per round at distance 7.</p>
    <p data-marble-id="sec-method-p">Decoder: sparse blossom matching with frozen seed SHA-256.</p>
    <blockquote data-marble-id="callout-method">Freeze decoder commit before running the sweep.</blockquote>
  </article>
  <script type="application/json" data-marble-docs-state="1">${JSON.stringify({
    title: 'Logical Memory Specification',
    html: '<h1>Logical Memory Specification</h1><p>Threshold sweep targets 10^-3 logical error per round at distance 7.</p><p>Decoder: sparse blossom matching with frozen seed SHA-256.</p><blockquote>Freeze decoder commit before running the sweep.</blockquote>',
  })}</script>
</body>
</html>`

const DOC_VERSION_DETAIL: DocumentVersionDetail = {
  id: 'v-doc-1',
  docId: 'doc-spec',
  slug: 'logical-memory-spec',
  title: 'Logical Memory Specification',
  category: 'document',
  kind: 'named',
  trigger: 'manual',
  label: 'Distance 5 baseline',
  createdAt: '2026-11-28T09:00:00.000Z',
  contentHash: 'hash-past-doc',
  byteSize: PAST_DOC_SOURCE.length,
  nodeCount: 4,
  author: 'You',
  source: PAST_DOC_SOURCE,
}

const whiteboardTpl = PREDEFINED_MARBLE_TEMPLATES.find(
  (doc) => doc.id === 'tpl-whiteboard',
)
if (!whiteboardTpl) {
  throw new Error('Missing premade whiteboard template')
}

const TLDRAW_V5_SCHEMA = {
  schemaVersion: 2,
  sequences: {
    'com.tldraw.store': 5,
    'com.tldraw.asset': 1,
    'com.tldraw.camera': 1,
    'com.tldraw.document': 2,
    'com.tldraw.instance': 26,
    'com.tldraw.instance_page_state': 5,
    'com.tldraw.page': 1,
    'com.tldraw.instance_presence': 6,
    'com.tldraw.pointer': 1,
    'com.tldraw.shape': 4,
    'com.tldraw.user': 1,
    'com.tldraw.asset.image': 6,
    'com.tldraw.asset.video': 5,
    'com.tldraw.asset.bookmark': 2,
    'com.tldraw.shape.arrow': 8,
    'com.tldraw.shape.bookmark': 4,
    'com.tldraw.shape.draw': 5,
    'com.tldraw.shape.embed': 4,
    'com.tldraw.shape.frame': 1,
    'com.tldraw.shape.geo': 14,
    'com.tldraw.shape.group': 0,
    'com.tldraw.shape.highlight': 4,
    'com.tldraw.shape.image': 7,
    'com.tldraw.shape.line': 5,
    'com.tldraw.shape.note': 15,
    'com.tldraw.shape.text': 4,
    'com.tldraw.shape.video': 6,
    'com.tldraw.binding.arrow': 1,
  },
}

const PAST_BOARD_SOURCE = withWhiteboardSnapshot(whiteboardTpl.source, {
  document: {
    store: {
      'document:document': {
        id: 'document:document',
        typeName: 'document',
        gridSize: 10,
        name: '',
        meta: {},
      },
      'page:page': {
        id: 'page:page',
        typeName: 'page',
        name: 'Page 1',
        index: 'a1',
        meta: {},
      },
      'shape:box-1': {
        id: 'shape:box-1',
        typeName: 'shape',
        type: 'geo',
        x: 120,
        y: 120,
        rotation: 0,
        isLocked: false,
        opacity: 1,
        parentId: 'page:page',
        index: 'a1',
        props: {
          w: 180,
          h: 90,
          geo: 'rectangle',
          color: 'blue',
          labelColor: 'black',
          fill: 'semi',
          dash: 'draw',
          size: 'm',
          font: 'draw',
          align: 'middle',
          verticalAlign: 'middle',
          growY: 0,
          url: '',
          scale: 1,
          flipX: false,
          flipY: false,
          richText: { type: 'doc', content: [{ type: 'paragraph' }] },
        },
        meta: {},
      },
    },
    schema: TLDRAW_V5_SCHEMA,
  },
  session: {
    version: 0,
    currentPageId: 'page:page',
    pageStates: [
      {
        pageId: 'page:page',
        selectedShapeIds: [],
        focusedGroupId: null,
        camera: { x: 0, y: 0, z: 1 },
      },
    ],
  },
})

const CURRENT_BOARD_SOURCE = withWhiteboardSnapshot(whiteboardTpl.source, {
  document: {
    store: {
      'document:document': {
        id: 'document:document',
        typeName: 'document',
        gridSize: 10,
        name: '',
        meta: {},
      },
      'page:page': {
        id: 'page:page',
        typeName: 'page',
        name: 'Page 1',
        index: 'a1',
        meta: {},
      },
      'shape:box-1': {
        id: 'shape:box-1',
        typeName: 'shape',
        type: 'geo',
        x: 240,
        y: 120,
        rotation: 0,
        isLocked: false,
        opacity: 1,
        parentId: 'page:page',
        index: 'a1',
        props: {
          w: 180,
          h: 90,
          geo: 'rectangle',
          color: 'blue',
          labelColor: 'black',
          fill: 'semi',
          dash: 'draw',
          size: 'm',
          font: 'draw',
          align: 'middle',
          verticalAlign: 'middle',
          growY: 0,
          url: '',
          scale: 1,
          flipX: false,
          flipY: false,
          richText: { type: 'doc', content: [{ type: 'paragraph' }] },
        },
        meta: {},
      },
      'shape:arrow-1': {
        id: 'shape:arrow-1',
        typeName: 'shape',
        type: 'arrow',
        x: 420,
        y: 165,
        rotation: 0,
        isLocked: false,
        opacity: 1,
        parentId: 'page:page',
        index: 'a2',
        props: {
          kind: 'arc',
          elbowMidPoint: 0.5,
          dash: 'draw',
          size: 'm',
          fill: 'none',
          color: 'black',
          labelColor: 'black',
          bend: 0,
          start: { x: 0, y: 0 },
          end: { x: 120, y: 0 },
          arrowheadStart: 'none',
          arrowheadEnd: 'arrow',
          richText: { type: 'doc', content: [{ type: 'paragraph' }] },
          labelPosition: 0.5,
          font: 'draw',
          scale: 1,
        },
        meta: {},
      },
    },
    schema: TLDRAW_V5_SCHEMA,
  },
  session: {
    version: 0,
    currentPageId: 'page:page',
    pageStates: [
      {
        pageId: 'page:page',
        selectedShapeIds: [],
        focusedGroupId: null,
        camera: { x: 0, y: 0, z: 1 },
      },
    ],
  },
})

/**
 * Diff and preview pane comparing a selected snapshot against the current document.
 *
 * @summary Version diff and preview pane
 */
const meta = {
  title: 'xDrive Version History/Version Diff Preview',
  component: VersionDiffPreview,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="flex h-[540px] w-full flex-col bg-[var(--xd-canvas)] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof VersionDiffPreview>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Structured document diff with tabs for Source diff and sandboxed HTML Preview.
 *
 * @summary Marble document diff & preview
 */
export const MarbleDocumentDiff: Story = {
  args: {
    version: DOC_VERSION_DETAIL,
    currentSource: CURRENT_DOC_SOURCE,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText(/sparse blossom matching/i)
    await userEvent.click(canvas.getByRole('tab', { name: 'Source' }))
    await canvas.findByText(/data-marble-id="callout-method"/i)
    await userEvent.click(canvas.getByRole('tab', { name: 'Preview' }))
    await canvas.findByTitle('Preview of Logical Memory Specification')
  },
}

/**
 * Read-only tldraw whiteboard snapshot preview with shape-change summary strip.
 *
 * @summary Whiteboard snapshot preview & shape diff
 */
export const WhiteboardSnapshotPreview: Story = {
  args: {
    version: {
      ...DOC_VERSION_DETAIL,
      id: 'v-board-1',
      docId: 'doc-board',
      slug: 'architecture-board',
      title: 'Architecture Board',
      category: 'whiteboard',
      label: 'Initial layout',
      source: PAST_BOARD_SOURCE,
      byteSize: PAST_BOARD_SOURCE.length,
      nodeCount: 1,
    },
    currentSource: CURRENT_BOARD_SOURCE,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Whiteboard comparison')
    await canvas.findByText('+1 added')
    await canvas.findByText('~1 modified')
    await waitFor(
      () => {
        expect(
          canvasElement.querySelector('[data-testid="whiteboard-canvas"]'),
        ).toBeTruthy()
      },
      { timeout: 20000 },
    )
  },
}
