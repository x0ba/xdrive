import type {
  DriveFolder,
  MarbleDocumentFile,
  MarbleOp,
  ShareConfig,
} from '../types'
import {
  applyMarbleOpsClient,
  byteSizeOf,
  countMarbleNodes,
  duplicateMarbleTemplate,
  escapeText,
} from './engine-client'

export const TEMPLATES_FOLDER_NAME = 'Templates'
export const TEMPLATES_FOLDER_ID = 'folder-templates'

export function isTemplatesRootFolder(
  folder: Pick<DriveFolder, 'name' | 'parentId' | 'isTemplatesFolder'>,
): boolean {
  if (typeof folder.isTemplatesFolder === 'boolean') {
    return folder.isTemplatesFolder
  }
  return folder.parentId === null && folder.name === TEMPLATES_FOLDER_NAME
}

export const DOCUMENT_DESIGN_SYSTEM_ID = 'ws-document-design-system'
export const DOCUMENT_DESIGN_SYSTEM_SLUG = 'document-design-system'
export const DOCUMENT_DONTS_SYSTEM_ID = 'ws-document-donts-system'
export const DOCUMENT_DONTS_SYSTEM_SLUG = 'document-donts-system'

export const MARBLE_LIGHT_TOKENS =
  '--xd-canvas:#ffffff;--xd-rail:#f7f8fa;--xd-elevated:#f1f3f7;--xd-surface-hover:#eaeef4;--xd-surface-active:#e2e7f0;--xd-ink:#0f131a;--xd-ink-secondary:#4a5568;--xd-ink-muted:#718096;--xd-border:#e3e8ee;--xd-border-strong:#cbd5e1;--xd-accent:#5e6ad2;--xd-accent-hover:#4e5ac0;--xd-accent-soft:rgba(94,106,210,0.12);--xd-accent-border:rgba(94,106,210,0.35);--xd-commit:#1f9d6b;--xd-commit-soft:rgba(31,157,107,0.12);--xd-sketch:#d9822b;--xd-sketch-soft:rgba(217,130,43,0.14);--xd-danger:#e5484d;--xd-danger-soft:rgba(229,72,77,0.12);--ink:#0f131a;--muted:#4a5568;--faint:#718096;--line:#e3e8ee;--line-strong:#cbd5e1;--paper:#ffffff;--panel:#f7f8fa;--panel-2:#f1f3f7;--accent:#5e6ad2;--accent-2:#1f9d6b;--accent-soft:rgba(94,106,210,0.12);--good:#1f9d6b;--warn:#d9822b;--danger:#e5484d;--radius:6px;--shadow:none;--serif:"Newsreader",Georgia,Cambria,"Times New Roman",serif;--sans:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;--mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;'

export const MARBLE_DARK_TOKENS =
  '--xd-canvas:#0b0c0e;--xd-rail:#101216;--xd-elevated:#161920;--xd-surface-hover:#1c2029;--xd-surface-active:#232834;--xd-ink:#f3f5f8;--xd-ink-secondary:#a2abb8;--xd-ink-muted:#6e7785;--xd-border:#22252e;--xd-border-strong:#313644;--xd-accent:#5e6ad2;--xd-accent-hover:#6e7ae2;--xd-accent-soft:rgba(94,106,210,0.16);--xd-accent-border:rgba(94,106,210,0.45);--xd-commit:#2ea071;--xd-commit-soft:rgba(46,160,113,0.16);--xd-sketch:#e59934;--xd-sketch-soft:rgba(229,153,52,0.18);--xd-danger:#e5484d;--xd-danger-soft:rgba(229,72,77,0.16);--ink:#f3f5f8;--muted:#a2abb8;--faint:#6e7785;--line:#22252e;--line-strong:#313644;--paper:#0b0c0e;--panel:#101216;--panel-2:#161920;--accent:#5e6ad2;--accent-2:#2ea071;--accent-soft:rgba(94,106,210,0.16);--good:#2ea071;--warn:#e59934;--danger:#e5484d;--radius:6px;--shadow:none;'

export const MARBLE_BASE_CSS = `
:root { ${MARBLE_LIGHT_TOKENS} }
@media (prefers-color-scheme: dark) { :root { ${MARBLE_DARK_TOKENS} } }
html[data-xdrive-theme="light"] { ${MARBLE_LIGHT_TOKENS} color-scheme: light; }
html[data-xdrive-theme="dark"] { ${MARBLE_DARK_TOKENS} color-scheme: dark; }
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body {
  background: var(--paper); color: var(--ink);
  font: 14.5px/1.6 var(--sans); letter-spacing: -0.006em;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
}
button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
:focus-visible { outline: 1.5px solid var(--accent); outline-offset: 2px; }
[data-marble-editable]:focus { outline: none; box-shadow: inset 0 -1.5px 0 var(--accent); }
.kicker {
  margin: 0 0 .3rem; color: var(--muted);
  font: 500 .78rem/1.4 var(--sans); letter-spacing: -0.004em; text-transform: none;
}
h1 {
  font-family: var(--serif); font-size: 2rem; font-weight: 500;
  letter-spacing: -0.024em; line-height: 1.12; margin: 0; color: var(--ink);
}
h2 {
  font-family: var(--serif); font-size: 1.25rem; font-weight: 500;
  letter-spacing: -0.016em; line-height: 1.24; margin: 0 0 .4rem; color: var(--ink);
}
h3 {
  font-family: var(--sans); font-size: .92rem; font-weight: 600;
  letter-spacing: -0.01em; line-height: 1.35; margin: 0 0 .3rem; color: var(--ink);
}
p { margin: 0; max-width: 68ch; }
.lede { color: var(--muted); max-width: 62ch; font-size: .96rem; line-height: 1.6; }
marble-alt { display: block; }
marble-alt > [data-marble-alt] { display: none; }
marble-alt[data-marble-active="v1"] > [data-marble-alt="v1"],
marble-alt[data-marble-active="v2"] > [data-marble-alt="v2"],
marble-alt[data-marble-active="v3"] > [data-marble-alt="v3"],
marble-alt[data-marble-active="v4"] > [data-marble-alt="v4"],
marble-alt[data-marble-active="v5"] > [data-marble-alt="v5"],
marble-alt[data-marble-active="v6"] > [data-marble-alt="v6"] { display: block; }
marble-alt:not([data-marble-active]) > [data-marble-alt]:first-child { display: block; }
[data-marble-sortable] { padding-left: 1.4rem; }
.pill, .choose button, .tex-edit, .add {
  border: 1px solid var(--line); background: var(--panel); border-radius: 4px;
  padding: .2rem .55rem; font: 500 .76rem/1.35 var(--sans); color: var(--muted);
  transition: border-color 120ms ease, color 120ms ease, background-color 120ms ease;
}
.pill:hover, .choose button:hover, .tex-edit:hover, .add:hover {
  border-color: var(--line-strong); color: var(--ink);
}
.choose { display: inline-flex; gap: .2rem; flex-wrap: wrap; padding: 2px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); }
.choose button { border-color: transparent; background: transparent; }
.choose button[aria-pressed="true"] { background: var(--paper); color: var(--ink); border-color: var(--line); }
.add { border-style: dashed; color: var(--accent); background: transparent; }
.card, section.block {
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
  padding: .95rem 1.1rem; box-shadow: none;
}
`

function page(
  title: string,
  css: string,
  body: string,
  script: string,
): string {
  return `<!doctype html>
<html lang="en" data-marble="1">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="marble:capabilities" content="storage; net=none">
<meta name="marble:design-system" content="${DOCUMENT_DESIGN_SYSTEM_SLUG}.mrbl,${DOCUMENT_DONTS_SYSTEM_SLUG}.mrbl">
<title>${escapeText(title)}</title>
<style>${MARBLE_BASE_CSS}
${css}</style>
</head>
<body>
${body}
<script>
${script}
</script>
</body>
</html>
`
}

const BOOT_OPEN = `(function () {
  function boot(start) {
    if (window.marble) start(window.marble);
    else document.addEventListener('marble:ready', function () { start(window.marble); }, { once: true });
  }
  boot(function (marble) {
    var MID = 'data-marble-' + 'id';
    var AFFORDANCES = [
      'data-marble-editable',
      'data-marble-sortable',
      'data-marble-canvas',
      'data-marble-resizable',
      'data-marble-removable',
      'data-marble-add',
      'data-marble-toggle',
      'data-marble-choose',
      'data-marble-expand',
      'data-marble-step',
      'data-marble-note'
    ];
    if (marble && marble.address) {
      marble.address(document.querySelectorAll(AFFORDANCES.map(function (a) { return '[' + a + ']'; }).join(',')));
    }
    function qMarble(id) { return document.querySelector('[' + MID + '="' + id + '"]'); }`

const BOOT_CLOSE = `  });
})();`

function designSystemSource(): string {
  const css = `
  .ds-shell { max-width: 68rem; margin: 0 auto; padding: 2rem 1.5rem 4rem; display: grid; grid-template-columns: 14rem 1fr; gap: 1.75rem; }
  .ds-head { grid-column: 1 / -1; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 1rem; padding-bottom: 1.1rem; border-bottom: 1px solid var(--line); }
  .ds-meta { display: flex; align-items: center; gap: .5rem; font: 500 .76rem/1.4 var(--mono); color: var(--faint); margin-top: .35rem; }
  .ds-badge { display: inline-flex; align-items: center; gap: .35rem; border: 1px solid var(--xd-accent-border); background: var(--accent-soft); color: var(--accent); border-radius: 4px; padding: .15rem .5rem; font: 500 .74rem/1.3 var(--mono); }
  .ds-nav { position: sticky; top: 1rem; align-self: start; display: flex; flex-direction: column; gap: .5rem; border-right: 1px solid var(--line); padding-right: 1rem; }
  .ds-nav-title { font: 600 .78rem/1.4 var(--sans); color: var(--ink); margin-bottom: .15rem; }
  .ds-nav-note { font-size: .78rem; color: var(--muted); line-height: 1.5; }
  .ds-main { display: flex; flex-direction: column; gap: 1.5rem; min-width: 0; }
  .ds-section { border-top: 1px solid var(--line); padding-top: 1.15rem; }
  .ds-section:first-child { border-top: 0; padding-top: 0; }
  .swatch-table { width: 100%; border-collapse: collapse; margin-top: .75rem; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; background: var(--panel); font-size: .82rem; }
  .swatch-table th, .swatch-table td { text-align: left; padding: .5rem .65rem; border-bottom: 1px solid var(--line); vertical-align: middle; }
  .swatch-table th { font-weight: 500; color: var(--muted); background: var(--panel-2); font-size: .76rem; }
  .swatch-chip { display: inline-block; width: 1.35rem; height: .9rem; border-radius: 3px; border: 1px solid var(--line-strong); vertical-align: middle; margin-right: .45rem; }
  .tok { font: 500 .76rem/1.35 var(--mono); color: var(--ink); }
  .hex { font: 400 .75rem/1.35 var(--mono); color: var(--muted); font-variant-numeric: tabular-nums; }
  .specimen-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: .75rem; margin-top: .75rem; }
  .specimen { border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); padding: .85rem .95rem; display: flex; flex-direction: column; gap: .35rem; }
  .specimen-role { font: 500 .75rem/1.3 var(--mono); color: var(--accent); }
  .specimen-sample-serif { font: 500 1.35rem/1.18 var(--serif); letter-spacing: -0.02em; }
  .specimen-sample-sans { font: 400 .9rem/1.55 var(--sans); }
  .specimen-sample-mono { font: 500 .82rem/1.5 var(--mono); font-variant-numeric: tabular-nums; }
  .specimen-spec { font-size: .76rem; color: var(--muted); }
  .rule-list { list-style: none; margin: .75rem 0 0; padding: 0; display: flex; flex-direction: column; gap: .5rem; }
  .rule-item { border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); padding: .75rem .95rem; display: grid; grid-template-columns: 11rem 1fr; gap: .75rem; align-items: baseline; }
  .rule-key { font: 500 .78rem/1.4 var(--mono); color: var(--accent); }
  .rule-body { font-size: .86rem; color: var(--ink); }
  [data-density="compact"] .rule-item { padding: .48rem .75rem; }
  [data-density="compact"] .swatch-table th, [data-density="compact"] .swatch-table td { padding: .35rem .5rem; }
  @media (max-width: 860px) {
    .ds-shell { grid-template-columns: 1fr; }
    .ds-nav { border-right: 0; border-bottom: 1px solid var(--line); padding-right: 0; padding-bottom: .85rem; position: static; }
    .specimen-grid { grid-template-columns: 1fr; }
    .rule-item { grid-template-columns: 1fr; gap: .25rem; }
  }
  `
  const body = `<article data-marble-id="ds-shell" class="ds-shell" data-density="comfortable" data-evergreen="design-system">
  <header data-marble-id="ds-head" class="ds-head">
    <div data-marble-id="ds-head-copy">
      <span data-marble-id="ds-badge" class="ds-badge">Evergreen system · AI reference</span>
      <h1 data-marble-id="ds-title" data-marble-editable style="margin-top:.45rem">xDrive Document Design System</h1>
      <p data-marble-id="ds-lede" class="lede" data-marble-editable style="margin-top:.35rem">Every .mrbl document in xDrive shares the workspace’s Obsidian Studio dark palette, Alabaster Lab light palette, Newsreader + Inter + JetBrains Mono typography, and 1px hairline layout grammar.</p>
      <div data-marble-id="ds-meta" class="ds-meta">
        <span data-marble-id="ds-slug">document-design-system.mrbl</span>
        <span>·</span>
        <span data-marble-id="ds-binding" data-marble-editable>Loaded before every AI edit and new app synthesis</span>
      </div>
    </div>
    <div data-marble-id="ds-controls">
      <span data-marble-id="ds-density-choose" class="choose" data-marble-choose="data-density" data-marble-of="[data-marble-id=ds-shell]">
        <button data-marble-id="ds-density-comfort" type="button" data-marble-value="comfortable">Comfortable</button>
        <button data-marble-id="ds-density-compact" type="button" data-marble-value="compact">Compact</button>
      </span>
    </div>
  </header>

  <aside data-marble-id="ds-nav" class="ds-nav">
    <p data-marble-id="ds-nav-title" class="ds-nav-title" data-marble-editable>How the AI uses this file</p>
    <p data-marble-id="ds-nav-note" class="ds-nav-note" data-marble-editable>When you prompt the collaborator or build a new .mrbl document, xDrive reads the tokens, type roles, and structural contracts defined here so documents match the application shell.</p>
    <p data-marble-id="ds-nav-pair" class="ds-nav-note" data-marble-editable style="margin-top:.4rem">Paired with <code class="tok">document-donts-system.mrbl</code> to reject generic AI slop.</p>
  </aside>

  <div data-marble-id="ds-main" class="ds-main">
    <section data-marble-id="sec-ds-tokens" class="ds-section" data-marble-selectable>
      <h2 data-marble-id="sec-ds-tokens-h" data-marble-editable>Dual-Mode Color &amp; Surface Tokens</h2>
      <p data-marble-id="sec-ds-tokens-p" class="lede" data-marble-editable>Documents inherit the active theme from html[data-xdrive-theme]. Never hardcode warm cream or off-brand accents; bind surfaces to --paper, --panel, --panel-2, and --line.</p>
      <table data-marble-id="ds-token-table" class="swatch-table">
        <thead data-marble-id="ds-token-thead">
          <tr data-marble-id="ds-token-hrow">
            <th data-marble-id="th-ds-token">Token</th>
            <th data-marble-id="th-ds-role">App Mirror</th>
            <th data-marble-id="th-ds-dark">Obsidian Studio (Dark)</th>
            <th data-marble-id="th-ds-light">Alabaster Lab (Light)</th>
            <th data-marble-id="th-ds-use">Document Role</th>
          </tr>
        </thead>
        <tbody data-marble-id="ds-token-tbody">
          <tr data-marble-id="tok-row-paper">
            <td data-marble-id="tok-paper-name" class="tok"><span class="swatch-chip" style="background:var(--paper)"></span>--paper</td>
            <td data-marble-id="tok-paper-alias" class="hex">--xd-canvas</td>
            <td data-marble-id="tok-paper-dark" class="hex" data-marble-editable>#0B0C0E</td>
            <td data-marble-id="tok-paper-light" class="hex" data-marble-editable>#FFFFFF</td>
            <td data-marble-id="tok-paper-use" data-marble-editable>Primary document stage and reading background</td>
          </tr>
          <tr data-marble-id="tok-row-panel">
            <td data-marble-id="tok-panel-name" class="tok"><span class="swatch-chip" style="background:var(--panel)"></span>--panel</td>
            <td data-marble-id="tok-panel-alias" class="hex">--xd-rail</td>
            <td data-marble-id="tok-panel-dark" class="hex" data-marble-editable>#101216</td>
            <td data-marble-id="tok-panel-light" class="hex" data-marble-editable>#F7F8FA</td>
            <td data-marble-id="tok-panel-use" data-marble-editable>Section containers, sidebars, and data tables</td>
          </tr>
          <tr data-marble-id="tok-row-panel2">
            <td data-marble-id="tok-panel2-name" class="tok"><span class="swatch-chip" style="background:var(--panel-2)"></span>--panel-2</td>
            <td data-marble-id="tok-panel2-alias" class="hex">--xd-elevated</td>
            <td data-marble-id="tok-panel2-dark" class="hex" data-marble-editable>#161920</td>
            <td data-marble-id="tok-panel2-light" class="hex" data-marble-editable>#F1F3F7</td>
            <td data-marble-id="tok-panel2-use" data-marble-editable>Equation wells, interactive toolbars, and code trays</td>
          </tr>
          <tr data-marble-id="tok-row-ink">
            <td data-marble-id="tok-ink-name" class="tok"><span class="swatch-chip" style="background:var(--ink)"></span>--ink</td>
            <td data-marble-id="tok-ink-alias" class="hex">--xd-ink</td>
            <td data-marble-id="tok-ink-dark" class="hex" data-marble-editable>#F3F5F8</td>
            <td data-marble-id="tok-ink-light" class="hex" data-marble-editable>#0F131A</td>
            <td data-marble-id="tok-ink-use" data-marble-editable>Headings, primary prose, and active values</td>
          </tr>
          <tr data-marble-id="tok-row-line">
            <td data-marble-id="tok-line-name" class="tok"><span class="swatch-chip" style="background:var(--line)"></span>--line</td>
            <td data-marble-id="tok-line-alias" class="hex">--xd-border</td>
            <td data-marble-id="tok-line-dark" class="hex" data-marble-editable>#22252E</td>
            <td data-marble-id="tok-line-light" class="hex" data-marble-editable>#E3E8EE</td>
            <td data-marble-id="tok-line-use" data-marble-editable>1px structural hairlines and table cell dividers</td>
          </tr>
          <tr data-marble-id="tok-row-accent">
            <td data-marble-id="tok-accent-name" class="tok"><span class="swatch-chip" style="background:var(--accent)"></span>--accent</td>
            <td data-marble-id="tok-accent-alias" class="hex">--xd-accent</td>
            <td data-marble-id="tok-accent-dark" class="hex" data-marble-editable>#5E6AD2</td>
            <td data-marble-id="tok-accent-light" class="hex" data-marble-editable>#5E6AD2</td>
            <td data-marble-id="tok-accent-use" data-marble-editable>Interactive focus, active selections, and primary chart series</td>
          </tr>
          <tr data-marble-id="tok-row-good">
            <td data-marble-id="tok-good-name" class="tok"><span class="swatch-chip" style="background:var(--good)"></span>--good / --warn / --danger</td>
            <td data-marble-id="tok-good-alias" class="hex">--xd-commit / sketch / danger</td>
            <td data-marble-id="tok-good-dark" class="hex" data-marble-editable>#2EA071 · #E59934 · #E5484D</td>
            <td data-marble-id="tok-good-light" class="hex" data-marble-editable>#1F9D6B · #D9822B · #E5484D</td>
            <td data-marble-id="tok-good-use" data-marble-editable>Verified results, pending proposals/warnings, and dropped runs</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section data-marble-id="sec-ds-type" class="ds-section" data-marble-selectable>
      <h2 data-marble-id="sec-ds-type-h" data-marble-editable>Typography &amp; Measure</h2>
      <p data-marble-id="sec-ds-type-p" class="lede" data-marble-editable>Three purposeful type families match the xDrive workspace. Body measure never exceeds 68 characters; numerical tables always enable tabular-nums.</p>
      <div data-marble-id="ds-specimens" class="specimen-grid">
        <div data-marble-id="spec-serif" class="specimen">
          <span data-marble-id="spec-serif-role" class="specimen-role">--serif · Newsreader</span>
          <p data-marble-id="spec-serif-sample" class="specimen-sample-serif" data-marble-editable>Fault-Tolerant Logical Memory</p>
          <p data-marble-id="spec-serif-desc" class="specimen-spec" data-marble-editable>Weight 500, tracking -0.024em, line-height 1.12–1.24. Used for h1, h2, theorem statements, and display equations.</p>
        </div>
        <div data-marble-id="spec-sans" class="specimen">
          <span data-marble-id="spec-sans-role" class="specimen-role">--sans · Inter</span>
          <p data-marble-id="spec-sans-sample" class="specimen-sample-sans" data-marble-editable>At distance 7, the logical failure rate per round drops below 10⁻³ under circuit-level noise.</p>
          <p data-marble-id="spec-sans-desc" class="specimen-spec" data-marble-editable>14.5px / 1.6 body prose, sentence-case controls, table cells, and margin annotations.</p>
        </div>
        <div data-marble-id="spec-mono" class="specimen">
          <span data-marble-id="spec-mono-role" class="specimen-role">--mono · JetBrains Mono</span>
          <p data-marble-id="spec-mono-sample" class="specimen-sample-mono" data-marble-editable>P_L ≤ C (p / p_th)^((d+1)/2) · 0.914</p>
          <p data-marble-id="spec-mono-desc" class="specimen-spec" data-marble-editable>12.5px / 1.5 with tabular-nums. Reserved for TeX source, citation keys, node IDs, and metrics.</p>
        </div>
      </div>
    </section>

    <section data-marble-id="sec-ds-rules" class="ds-section" data-marble-selectable>
      <h2 data-marble-id="sec-ds-rules-h" data-marble-editable>Structural &amp; Layout Contracts</h2>
      <p data-marble-id="sec-ds-rules-p" class="lede" data-marble-editable>Add or edit rules below. The AI collaborator inspects this list on every prompt and applies each contract to generated HTML and CSS.</p>
      <ul data-marble-id="ds-rule-list" id="ds-rule-list" class="rule-list" data-marble-sortable="rules">
        <li data-marble-id="ds-rule-hairline" class="rule-item" data-marble-removable>
          <span data-marble-id="ds-rule-hairline-k" class="rule-key" data-marble-editable>1px hairline borders</span>
          <span data-marble-id="ds-rule-hairline-v" class="rule-body" data-marble-editable>Separate sections, rails, and tables with 1px solid var(--line) and a 6px border-radius (--radius). Never use drop shadows.</span>
        </li>
        <li data-marble-id="ds-rule-measure" class="rule-item" data-marble-removable>
          <span data-marble-id="ds-rule-measure-k" class="rule-key" data-marble-editable>Left-aligned 68ch flow</span>
          <span data-marble-id="ds-rule-measure-v" class="rule-body" data-marble-editable>Keep prose left-aligned within a 68-character maximum measure. Pair wide stages with a 14rem outline or margin-note rail.</span>
        </li>
        <li data-marble-id="ds-rule-controls" class="rule-item" data-marble-removable>
          <span data-marble-id="ds-rule-controls-k" class="rule-key" data-marble-editable>Segmented switchers</span>
          <span data-marble-id="ds-rule-controls-v" class="rule-body" data-marble-editable>Group data-marble-choose buttons inside a 1px solid var(--line) tray on var(--panel) with active items highlighted on var(--paper).</span>
        </li>
        <li data-marble-id="ds-rule-affordances" class="rule-item" data-marble-removable>
          <span data-marble-id="ds-rule-affordances-k" class="rule-key" data-marble-editable>Addressable Marble DOM</span>
          <span data-marble-id="ds-rule-affordances-v" class="rule-body" data-marble-editable>Every heading, claim, table cell, and figure carries a stable data-marble-id and explicit data-marble-editable or data-marble-sortable affordances.</span>
        </li>
      </ul>
      <button data-marble-id="ds-add-rule" class="add" type="button" style="margin-top:.75rem" data-marble-add="#tpl-ds-rule" data-marble-into="#ds-rule-list">+ Add design contract</button>
      <template data-marble-id="tpl-ds-rule" id="tpl-ds-rule">
        <li class="rule-item" data-marble-removable>
          <span class="rule-key" data-marble-editable>new-contract</span>
          <span class="rule-body" data-marble-editable>Specify the token, measurement, or structural rule the AI must follow.</span>
        </li>
      </template>
    </section>
  </div>
</article>`
  const script = `${BOOT_OPEN}
    marble.register(function () {});
  ${BOOT_CLOSE}`
  return page('xDrive Document Design System', css, body, script)
}

function dontsSystemSource(): string {
  const css = `
  .donts-shell { max-width: 68rem; margin: 0 auto; padding: 2rem 1.5rem 4rem; display: flex; flex-direction: column; gap: 1.4rem; }
  .donts-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 1rem; padding-bottom: 1.1rem; border-bottom: 1px solid var(--line); }
  .donts-badge { display: inline-flex; align-items: center; gap: .35rem; border: 1px solid color-mix(in srgb, var(--danger) 40%, var(--line)); background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); border-radius: 4px; padding: .15rem .5rem; font: 500 .74rem/1.3 var(--mono); }
  .donts-meta { display: flex; align-items: center; gap: .5rem; font: 500 .76rem/1.4 var(--mono); color: var(--faint); margin-top: .35rem; }
  .donts-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .9rem; }
  .dont-card { border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); padding: 1rem 1.15rem; display: flex; flex-direction: column; gap: .75rem; }
  .dont-top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: .5rem; }
  .dont-tag { font: 500 .74rem/1.3 var(--mono); color: var(--danger); }
  .compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
  .sample-dont, .sample-do { border: 1px solid var(--line); border-radius: 5px; padding: .75rem .9rem; background: var(--paper); display: flex; flex-direction: column; gap: .35rem; }
  .sample-dont { border-left: 2.5px solid var(--danger); }
  .sample-do { border-left: 2.5px solid var(--good); }
  .sample-label-dont { font: 500 .73rem/1.3 var(--mono); color: var(--danger); }
  .sample-label-do { font: 500 .73rem/1.3 var(--mono); color: var(--good); }
  .sample-code { font: 400 .78rem/1.5 var(--mono); color: var(--muted); white-space: pre-wrap; }
  [data-view="dont-only"] .sample-do { display: none; }
  [data-view="dont-only"] .compare-grid { grid-template-columns: 1fr; }
  [data-view="do-only"] .sample-dont { display: none; }
  [data-view="do-only"] .compare-grid { grid-template-columns: 1fr; }
  @media (max-width: 820px) { .compare-grid { grid-template-columns: 1fr; } }
  `
  const body = `<main data-marble-id="donts-shell" class="donts-shell" data-view="compare" data-evergreen="donts-system">
  <header data-marble-id="donts-head" class="donts-head">
    <div data-marble-id="donts-head-copy">
      <span data-marble-id="donts-badge" class="donts-badge">Evergreen guardrails · Anti-slop filter</span>
      <h1 data-marble-id="donts-title" data-marble-editable style="margin-top:.45rem">Document Don’ts — Anti-Slop Guardrails</h1>
      <p data-marble-id="donts-lede" class="lede" data-marble-editable style="margin-top:.35rem">Hard negative constraints referenced by the AI collaborator on every edit and app build. Prevents generic AI-generated aesthetics, warm-cream clichés, SaaS card soup, and decorative template chrome.</p>
      <div data-marble-id="donts-meta" class="donts-meta">
        <span data-marble-id="donts-slug">document-donts-system.mrbl</span>
        <span>·</span>
        <span data-marble-id="donts-status" data-marble-editable>Active pre-flight &amp; post-synthesis filter</span>
      </div>
    </div>
    <div data-marble-id="donts-toolbar">
      <span data-marble-id="donts-view-choose" class="choose" data-marble-choose="data-view" data-marble-of="[data-marble-id=donts-shell]">
        <button data-marble-id="view-compare" type="button" data-marble-value="compare">Side-by-side</button>
        <button data-marble-id="view-do" type="button" data-marble-value="do-only">xDrive standard</button>
        <button data-marble-id="view-dont" type="button" data-marble-value="dont-only">Banned slop</button>
      </span>
    </div>
  </header>

  <ul data-marble-id="donts-list" id="donts-list" class="donts-list" data-marble-sortable="donts">
    <li data-marble-id="dont-palette" class="dont-card" data-marble-removable data-marble-selectable>
      <div data-marble-id="dont-palette-top" class="dont-top">
        <h2 data-marble-id="dont-palette-h" data-marble-editable>Never use warm-cream backgrounds or terracotta / off-brand accents</h2>
        <span data-marble-id="dont-palette-tag" class="dont-tag" data-marble-editable>ban: #F4F1EA · #F3EFE7 · #D97757 · #1F4B99</span>
      </div>
      <p data-marble-id="dont-palette-p" data-marble-editable>AI generators default to warm cream paper (#F4F1EA / #F3EFE7) with clay/terracotta (#D97757) or generic royal blue (#1F4B99). Every xDrive document must use the workspace’s Obsidian Studio (#0B0C0E) and Alabaster Lab (#FFFFFF) tokens with #5E6AD2 indigo.</p>
      <div data-marble-id="dont-palette-grid" class="compare-grid">
        <div data-marble-id="dont-palette-bad" class="sample-dont">
          <span data-marble-id="dont-palette-bad-lbl" class="sample-label-dont">Don’t (AI slop tell)</span>
          <code data-marble-id="dont-palette-bad-code" class="sample-code" data-marble-editable>--paper: #f4f1ea; --panel: #fffdf9; --accent: #d97757;</code>
        </div>
        <div data-marble-id="dont-palette-good" class="sample-do">
          <span data-marble-id="dont-palette-good-lbl" class="sample-label-do">Do (xDrive token parity)</span>
          <code data-marble-id="dont-palette-good-code" class="sample-code" data-marble-editable>--paper: var(--xd-canvas); --panel: var(--xd-rail); --accent: #5e6ad2;</code>
        </div>
      </div>
    </li>

    <li data-marble-id="dont-cards" class="dont-card" data-marble-removable data-marble-selectable>
      <div data-marble-id="dont-cards-top" class="dont-top">
        <h2 data-marble-id="dont-cards-h" data-marble-editable>Never chop documents into rounded SaaS cards with soft drop shadows</h2>
        <span data-marble-id="dont-cards-tag" class="dont-tag" data-marble-editable>ban: border-radius 14px+ · box-shadow soup</span>
      </div>
      <p data-marble-id="dont-cards-p" data-marble-editable>Do not wrap every paragraph in a 14px–16px rounded card floating over a drop shadow (0 18px 40px rgba(0,0,0,.08)) or decorative gradient wash. Use flat panels, 1px solid var(--line) hairlines, and 6px corners.</p>
      <div data-marble-id="dont-cards-grid" class="compare-grid">
        <div data-marble-id="dont-cards-bad" class="sample-dont">
          <span data-marble-id="dont-cards-bad-lbl" class="sample-label-dont">Don’t (SaaS card kit)</span>
          <code data-marble-id="dont-cards-bad-code" class="sample-code" data-marble-editable>border-radius: 16px; box-shadow: 0 18px 40px rgba(0,0,0,.1);</code>
        </div>
        <div data-marble-id="dont-cards-good" class="sample-do">
          <span data-marble-id="dont-cards-good-lbl" class="sample-label-do">Do (1px hairline geometry)</span>
          <code data-marble-id="dont-cards-good-code" class="sample-code" data-marble-editable>border: 1px solid var(--line); border-radius: 6px; box-shadow: none;</code>
        </div>
      </div>
    </li>

    <li data-marble-id="dont-eyebrows" class="dont-card" data-marble-removable data-marble-selectable>
      <div data-marble-id="dont-eyebrows-top" class="dont-top">
        <h2 data-marble-id="dont-eyebrows-h" data-marble-editable>Never put tracked-out ALL-CAPS monospace kickers above headings</h2>
        <span data-marble-id="dont-eyebrows-tag" class="dont-tag" data-marble-editable>ban: uppercase eyebrows · single-word italic accents</span>
      </div>
      <p data-marble-id="dont-eyebrows-p" data-marble-editable>Skip unnecessary eyebrow labels above headings. When section metadata is genuinely needed, set it in sentence-case Inter (--sans) with normal tracking, and never italicize or color a single word inside a heading.</p>
      <div data-marble-id="dont-eyebrows-grid" class="compare-grid">
        <div data-marble-id="dont-eyebrows-bad" class="sample-dont">
          <span data-marble-id="dont-eyebrows-bad-lbl" class="sample-label-dont">Don’t (template eyebrow tell)</span>
          <code data-marble-id="dont-eyebrows-bad-code" class="sample-code" data-marble-editable>font: 600 .72rem var(--mono); letter-spacing: .14em; text-transform: uppercase;</code>
        </div>
        <div data-marble-id="dont-eyebrows-good" class="sample-do">
          <span data-marble-id="dont-eyebrows-good-lbl" class="sample-label-do">Do (quiet sentence-case meta)</span>
          <code data-marble-id="dont-eyebrows-good-code" class="sample-code" data-marble-editable>font: 500 .78rem/1.4 var(--sans); color: var(--muted); text-transform: none;</code>
        </div>
      </div>
    </li>

    <li data-marble-id="dont-chrome" class="dont-card" data-marble-removable data-marble-selectable>
      <div data-marble-id="dont-chrome-top" class="dont-top">
        <h2 data-marble-id="dont-chrome-h" data-marble-editable>Never add decorative 01 / 02 / 03 numbering, em-dash labels, or trailing arrows</h2>
        <span data-marble-id="dont-chrome-tag" class="dont-tag" data-marble-editable>ban: 01/02/03 · WORD — fragment · CTA →</span>
      </div>
      <p data-marble-id="dont-chrome-p" data-marble-editable>Only number items when the content is an actual sequence or stepped protocol. Do not build headings as “WORD — fragment”, join decorative meta strings with middle dots, or append “→” to buttons and links.</p>
      <div data-marble-id="dont-chrome-grid" class="compare-grid">
        <div data-marble-id="dont-chrome-bad" class="sample-dont">
          <span data-marble-id="dont-chrome-bad-lbl" class="sample-label-dont">Don’t (generated chrome)</span>
          <code data-marble-id="dont-chrome-bad-code" class="sample-code" data-marble-editable>01 / OVERVIEW — Quantum Memory · Explore Results →</code>
        </div>
        <div data-marble-id="dont-chrome-good" class="sample-do">
          <span data-marble-id="dont-chrome-good-lbl" class="sample-label-do">Do (direct research signage)</span>
          <code data-marble-id="dont-chrome-good-code" class="sample-code" data-marble-editable>Fault-Tolerant Logical Memory · Freeze decoder seed</code>
        </div>
      </div>
    </li>

    <li data-marble-id="dont-copy" class="dont-card" data-marble-removable data-marble-selectable>
      <div data-marble-id="dont-copy-top" class="dont-top">
        <h2 data-marble-id="dont-copy-h" data-marble-editable>Never write marketing filler, vague placeholders, or scattered entrance animations</h2>
        <span data-marble-id="dont-copy-tag" class="dont-tag" data-marble-editable>ban: fade-up cards · marketing copy</span>
      </div>
      <p data-marble-id="dont-copy-p" data-marble-editable>Every sentence in an xDrive document states a concrete claim, assumption, measurement, or falsifiable bound. Motion is reserved for user-triggered state changes (editing TeX, filtering rows, switching notes).</p>
      <div data-marble-id="dont-copy-grid" class="compare-grid">
        <div data-marble-id="dont-copy-bad" class="sample-dont">
          <span data-marble-id="dont-copy-bad-lbl" class="sample-label-dont">Don’t (filler copy)</span>
          <code data-marble-id="dont-copy-bad-code" class="sample-code" data-marble-editable>Unlock next-generation insights with our seamless quantum workflow.</code>
        </div>
        <div data-marble-id="dont-copy-good" class="sample-do">
          <span data-marble-id="dont-copy-good-lbl" class="sample-label-do">Do (falsifiable prose)</span>
          <code data-marble-id="dont-copy-good-code" class="sample-code" data-marble-editable>At distance 7 and p = 0.5 p_th, logical error per round stays below 10⁻³.</code>
        </div>
      </div>
    </li>
  </ul>

  <button data-marble-id="add-dont" class="add" type="button" style="align-self:flex-start" data-marble-add="#tpl-dont" data-marble-into="#donts-list">+ Add anti-slop guardrail</button>
  <template data-marble-id="tpl-dont" id="tpl-dont">
    <li class="dont-card" data-marble-removable data-marble-selectable>
      <div class="dont-top">
        <h2 data-marble-editable>New anti-slop guardrail</h2>
        <span class="dont-tag" data-marble-editable>ban: pattern</span>
      </div>
      <p data-marble-editable>State the templated AI tell to reject and the xDrive design-system behavior required instead.</p>
    </li>
  </template>
</main>`
  const script = `${BOOT_OPEN}
    marble.register(function () {});
  ${BOOT_CLOSE}`
  return page('Document Don’ts — Anti-Slop Guardrails', css, body, script)
}

function latexSource(): string {
  const css = `
  main { max-width: 52rem; margin: 0 auto; padding: 2.2rem 1.5rem 4rem; }
  header.paper-head { margin-bottom: 1.5rem; padding-bottom: 1.1rem; border-bottom: 1px solid var(--line); }
  .authors { color: var(--muted); margin-top: .55rem; font-size: .9rem; }
  .venue { color: var(--faint); font: .78rem/1.4 var(--mono); margin-top: .2rem; }
  .stack { display: flex; flex-direction: column; gap: .75rem; }
  .eq { margin: .75rem 0 0; padding: .75rem .95rem; border-radius: var(--radius); background: var(--panel-2); border: 1px solid var(--line); }
  .eq-top { display: flex; justify-content: space-between; align-items: center; gap: .5rem; margin-bottom: .35rem; }
  .eq-label { font: 500 .75rem/1.2 var(--mono); color: var(--muted); }
  .eq-render { font-family: var(--serif); font-size: 1.3rem; text-align: center; padding: .35rem 0 .15rem; }
  .eq:not([data-editing="on"]) .eq-src { display: none; }
  .eq[data-editing="on"] .eq-render { display: none; }
  .eq-src { display: block; font: .88rem/1.5 var(--mono); white-space: pre-wrap; }
  .frac { display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; font-size: .82em; margin: 0 .15em; }
  .frac i, .frac b { font-style: normal; font-weight: 500; padding: 0 .25em; }
  .frac b { border-top: 1px solid currentColor; }
  .cal { font-family: var(--serif); font-style: italic; }
  .bib { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .35rem; }
  .bib li { display: grid; grid-template-columns: 8.5rem 1fr; gap: .6rem; padding: .45rem .2rem; border-top: 1px solid var(--line); font-size: .88rem; }
  .key { font: 500 .76rem/1.4 var(--mono); color: var(--accent); }
  .actions { display: flex; gap: .5rem; margin-top: 1rem; }
  `
  const body = String.raw`<main>
  <header class="paper-head" data-marble-id="paper-head" data-marble-selectable>
    <p data-marble-id="paper-kicker" class="kicker" data-marble-editable>Theorem studio</p>
    <marble-alt data-marble-id="paper-title-alt" data-marble-active="v1">
      <h1 data-marble-id="paper-title-v1" data-marble-alt="v1" data-marble-editable>Fault-Tolerant Memory with Concatenated Surface Codes</h1>
      <h1 data-marble-id="paper-title-v2" data-marble-alt="v2" data-marble-editable>A Theorem Studio for Logical Qubit Lifetimes</h1>
      <h1 data-marble-id="paper-title-v3" data-marble-alt="v3" data-marble-editable>Thresholds, Decoders, and the Cost of a Logical Gate</h1>
    </marble-alt>
    <p data-marble-id="paper-authors" class="authors" data-marble-editable>A. Okonkwo, M. Chen, and the Lattice Lab</p>
    <p data-marble-id="paper-venue" class="venue" data-marble-editable>QEC 2026 manuscript · circuit-level depolarizing noise</p>
  </header>
  <div data-marble-id="sections" id="sections" class="stack" data-marble-sortable="sections">
    <section data-marble-id="sec-abstract" class="block" data-marble-removable data-marble-selectable>
      <h2 data-marble-id="sec-abstract-h" data-marble-editable>Abstract</h2>
      <p data-marble-id="sec-abstract-p" data-marble-editable>We study the logical error rate of a rotated surface code under circuit-level depolarizing noise. A finite-size collapse puts the threshold near 0.9% for minimum-weight perfect matching, and past that point the logical failure rate tracks (p / p_th) to the power of half the distance.</p>
    </section>
    <section data-marble-id="sec-intro" class="block" data-marble-removable data-marble-selectable>
      <h2 data-marble-id="sec-intro-h" data-marble-editable>Introduction</h2>
      <p data-marble-id="sec-intro-p" data-marble-editable>A quantum memory is a promise about time. The equation edited below is the equation the proof cites: there is no second copy of the claim hiding in a script.</p>
    </section>
    <section data-marble-id="sec-theorem" class="block" data-marble-removable data-marble-selectable>
      <h2 data-marble-id="sec-theorem-h" data-marble-editable>Formal Theorem &amp; Proof</h2>
      <p data-marble-id="thm-name" class="kicker" data-marble-editable>Theorem 1</p>
      <p data-marble-id="thm-statement" data-marble-editable>For odd distance d and physical error p below threshold, the logical error rate is at most C (p / p_th) raised to (d + 1) / 2.</p>
      <p data-marble-id="thm-proof-h" class="kicker" data-marble-editable style="margin-top:.55rem">Proof sketch</p>
      <p data-marble-id="thm-proof" data-marble-editable>Union bound over the shortest logical string, then a Chernoff bound on the matching weight. The constant C absorbs the number of homology classes on the torus.</p>
      <figure data-marble-id="eq-1" class="eq" data-editing="off">
        <div data-marble-id="eq-1-top" class="eq-top">
          <span data-marble-id="eq-1-label" class="eq-label">Eq. 1 (channel)</span>
          <button data-marble-id="eq-1-edit" class="tex-edit" type="button">Edit TeX</button>
        </div>
        <div data-marble-id="eq-1-render" class="eq-render"><span class="cal">E</span>(ρ) = (1 − p) ρ + p XρX</div>
        <code data-marble-id="eq-1-src" class="eq-src" data-marble-editable>\mathcal{E}(\rho)=(1-p)\rho+pX\rho X</code>
      </figure>
      <figure data-marble-id="eq-2" class="eq" data-editing="off">
        <div data-marble-id="eq-2-top" class="eq-top">
          <span data-marble-id="eq-2-label" class="eq-label">Eq. 2 (threshold)</span>
          <button data-marble-id="eq-2-edit" class="tex-edit" type="button">Edit TeX</button>
        </div>
        <div data-marble-id="eq-2-render" class="eq-render">p / p<sub>th</sub> ≤ 1</div>
        <code data-marble-id="eq-2-src" class="eq-src" data-marble-editable>\frac{p}{p_{th}} \leq 1</code>
      </figure>
      <figure data-marble-id="eq-3" class="eq" data-editing="off">
        <div data-marble-id="eq-3-top" class="eq-top">
          <span data-marble-id="eq-3-label" class="eq-label">Eq. 3 (scaling)</span>
          <button data-marble-id="eq-3-edit" class="tex-edit" type="button">Edit TeX</button>
        </div>
        <div data-marble-id="eq-3-render" class="eq-render">P<sub>L</sub> ≤ C (p / p<sub>th</sub>)<sup>(d+1)/2</sup></div>
        <code data-marble-id="eq-3-src" class="eq-src" data-marble-editable>P_L \leq C \left(\frac{p}{p_{th}}\right)^{(d+1)/2}</code>
      </figure>
    </section>
    <section data-marble-id="sec-results" class="block" data-marble-removable data-marble-selectable>
      <h2 data-marble-id="sec-results-h" data-marble-editable>Experimental Results</h2>
      <p data-marble-id="sec-results-p" data-marble-editable>At distance 7 the logical error drops below 10⁻³ once p is at most half the threshold. Decoder time stays quadratic in the number of defects.</p>
    </section>
    <section data-marble-id="sec-bib" class="block" data-marble-removable data-marble-selectable>
      <h2 data-marble-id="sec-bib-h" data-marble-editable>BibTeX Citations</h2>
      <ul data-marble-id="bib-list" id="bib-list" class="bib" data-marble-sortable="citations">
        <li data-marble-id="cite-1" data-marble-removable>
          <span data-marble-id="cite-1-key" class="key" data-marble-editable>dennis2002</span>
          <span data-marble-id="cite-1-body" data-marble-editable>Dennis, Kitaev, Landahl, Preskill. Topological quantum memory. J. Math. Phys. 2002.</span>
        </li>
        <li data-marble-id="cite-2" data-marble-removable>
          <span data-marble-id="cite-2-key" class="key" data-marble-editable>fowler2012</span>
          <span data-marble-id="cite-2-body" data-marble-editable>Fowler, Mariantoni, Martinis, Cleland. Surface codes: Towards practical large-scale quantum computation. PRA 2012.</span>
        </li>
        <li data-marble-id="cite-3" data-marble-removable>
          <span data-marble-id="cite-3-key" class="key" data-marble-editable>google2023</span>
          <span data-marble-id="cite-3-body" data-marble-editable>Google Quantum AI. Suppressing quantum errors by scaling a surface code logical qubit. Nature 2023.</span>
        </li>
      </ul>
    </section>
  </div>
  <div data-marble-id="paper-actions" class="actions">
    <button data-marble-id="add-theorem" class="add" type="button" data-marble-add="#tpl-theorem" data-marble-into="#sections">+ Add theorem</button>
    <button data-marble-id="add-citation" class="add" type="button" data-marble-add="#tpl-citation" data-marble-into="#bib-list">+ Add citation</button>
  </div>
  <template data-marble-id="tpl-theorem" id="tpl-theorem">
    <section class="block" data-marble-removable data-marble-selectable>
      <h2 data-marble-editable>New theorem</h2>
      <p data-marble-editable>State the claim, the assumption it needs, and the bound.</p>
    </section>
  </template>
  <template data-marble-id="tpl-citation" id="tpl-citation">
    <li data-marble-removable>
      <span class="key" data-marble-editable>key2026</span>
      <span data-marble-editable>Author. Title. Venue, year.</span>
    </li>
  </template>
</main>`
  const script = String.raw`${BOOT_OPEN}
    function renderTex(tex) {
      var s = String(tex || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      s = s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '<span class="frac"><i>$1</i><b>$2</b></span>');
      s = s.replace(/\\mathcal\{([^{}]+)\}/g, '<span class="cal">$1</span>');
      s = s.replace(/_\{([^{}]+)\}/g, '<sub>$1</sub>');
      s = s.replace(/\^\{([^{}]+)\}/g, '<sup>$1</sup>');
      s = s.replace(/\\leq/g, '≤').replace(/\\geq/g, '≥').replace(/\\rho/g, 'ρ').replace(/\\left\(/g, '(').replace(/\\right\)/g, ')');
      return s;
    }
    var edits = document.querySelectorAll('.tex-edit');
    for (var i = 0; i < edits.length; i++) {
      edits[i].addEventListener('click', function (event) {
        var fig = event.currentTarget.closest('figure');
        if (!fig) return;
        var next = fig.getAttribute('data-editing') === 'on' ? 'off' : 'on';
        fig.setAttribute('data-editing', next);
        var id = fig.getAttribute('data-marble-id');
        if (id) marble.op({ type: 'setAttr', id: id, name: 'data-editing', value: next }, { look: true });
        if (next === 'on') {
          var src = fig.querySelector('.eq-src');
          if (src) src.focus();
        }
      });
    }
    var sources = document.querySelectorAll('.eq-src');
    for (var j = 0; j < sources.length; j++) {
      sources[j].addEventListener('focusout', function (event) {
        var fig = event.currentTarget.closest('figure');
        var render = fig && fig.querySelector('.eq-render');
        if (!render) return;
        var html = renderTex(event.currentTarget.textContent || '');
        render.innerHTML = html;
        var id = render.getAttribute('data-marble-id');
        if (id && marble.canChange !== false) marble.op({ type: 'setInner', id: id, html: html }, { immediate: true });
      });
    }
    marble.register(function () {});
  ${BOOT_CLOSE}`
  return page('LaTeX Paper & Theorem Studio', css, body, script)
}

function notebookSource(): string {
  const css = `
  .notebook { display: grid; grid-template-columns: 16rem 1fr; min-height: 100vh; }
  .rail { border-right: 1px solid var(--line); padding: 1.15rem .95rem 2rem; background: var(--panel); }
  .rail h1 { font-size: 1.25rem; margin-bottom: .75rem; }
  .note-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .25rem; }
  .note-list li { padding: .45rem .65rem; border-radius: 5px; border: 1px solid transparent; background: transparent; font-size: .86rem; color: var(--muted); }
  .note-list li.marble-on, .notebook:not(.marble-derived) .note-list li:first-child { background: var(--panel-2); border-color: var(--line); color: var(--ink); font-weight: 500; }
  .stage { padding: 1.6rem 1.8rem 3rem; background: var(--paper); }
  .notebook.marble-derived [data-note] { display: none; }
  .notebook.marble-derived [data-note].marble-on { display: block; }
  .notebook:not(.marble-derived) [data-note] { display: none; }
  .notebook:not(.marble-derived) [data-note="note-hypothesis"] { display: block; }
  .checks { list-style: none; margin: .8rem 0; padding: 0; display: flex; flex-direction: column; gap: .35rem; }
  .checks li { display: flex; gap: .6rem; align-items: center; padding: .4rem .55rem; border: 1px solid var(--line); border-radius: 5px; background: var(--panel); }
  .checks li button { border: 1px solid var(--line); background: var(--panel-2); border-radius: 4px; padding: .12rem .45rem; font-size: .74rem; color: var(--muted); }
  [data-done="yes"] [data-marble-editable] { text-decoration: line-through; color: var(--muted); }
  .steps { display: flex; flex-wrap: wrap; gap: .55rem; margin-top: .85rem; }
  .stepper { display: flex; align-items: center; gap: .35rem; padding: .3rem .55rem; border: 1px solid var(--line); border-radius: 5px; background: var(--panel); font-size: .82rem; font-variant-numeric: tabular-nums; }
  .stepper button { width: 1.4rem; height: 1.4rem; border-radius: 4px; border: 1px solid var(--line); background: var(--panel-2); }
  .probes { display: grid; grid-template-columns: 1fr 1fr; gap: .7rem; margin-top: .85rem; }
  .queue { list-style: none; margin: .6rem 0 0; padding: 0; display: flex; flex-direction: column; gap: .4rem; }
  .queue li { padding: .5rem .65rem; border: 1px solid var(--line); border-radius: 5px; background: var(--panel); }
  .add { margin-top: .75rem; }
  @media (max-width: 800px) { .notebook { grid-template-columns: 1fr; } .probes { grid-template-columns: 1fr; } }
  `
  const body = `<div data-marble-id="notebook-shell" id="notebook-shell" class="notebook" data-active-note="note-hypothesis">
  <aside class="rail" data-marble-id="notebook-rail">
    <p data-marble-id="notebook-kicker" class="kicker">Lab notebook</p>
    <h1 data-marble-id="notebook-title" data-marble-editable>Multi-Note Lab Notebook</h1>
    <ol data-marble-id="note-list" id="note-list" class="note-list" data-marble-sortable="notes">
      <li data-marble-id="note-hypothesis" data-marble-removable><p data-marble-id="note-hypothesis-title" data-marble-editable>Hypothesis &amp; Ablations</p></li>
      <li data-marble-id="note-probes" data-marble-removable><p data-marble-id="note-probes-title" data-marble-editable>Attention Head Probes</p></li>
      <li data-marble-id="note-spike" data-marble-removable><p data-marble-id="note-spike-title" data-marble-editable>Loss Spike Postmortem</p></li>
      <li data-marble-id="note-queue" data-marble-removable><p data-marble-id="note-queue-title" data-marble-editable>Reading Queue</p></li>
    </ol>
    <button data-marble-id="add-note" class="add" type="button" data-marble-add="#tpl-note" data-marble-into="#note-list">+ New note</button>
    <template data-marble-id="tpl-note" id="tpl-note">
      <li data-marble-removable><p data-marble-editable>New note</p></li>
    </template>
  </aside>
  <div data-marble-id="note-stage" id="note-stage" class="stage">
    <article data-marble-id="pane-hypothesis" data-note="note-hypothesis">
      <h2 data-marble-id="pane-hypothesis-h" data-marble-editable>Hypothesis &amp; Ablations</h2>
      <p data-marble-id="pane-hypothesis-p" data-marble-editable>The early-layer heads are doing position, not semantics. Ablate them only after the seed is frozen, or the loss spike and the ablation get blamed on each other.</p>
      <ul data-marble-id="proto" class="checks" data-marble-sortable="protocol">
        <li data-marble-id="chk-freeze" data-done="no" data-marble-removable>
          <button data-marble-id="chk-freeze-tog" type="button" data-marble-toggle="data-done:yes|no" data-marble-of="[data-marble-id=chk-freeze]">Done</button>
          <span data-marble-id="chk-freeze-label" data-marble-editable>Freeze seeds before the sweep</span>
        </li>
        <li data-marble-id="chk-seeds" data-done="yes" data-marble-removable>
          <button data-marble-id="chk-seeds-tog" type="button" data-marble-toggle="data-done:yes|no" data-marble-of="[data-marble-id=chk-seeds]">Done</button>
          <span data-marble-id="chk-seeds-label" data-marble-editable>Log the data order hash</span>
        </li>
        <li data-marble-id="chk-log" data-done="no" data-marble-removable>
          <button data-marble-id="chk-log-tog" type="button" data-marble-toggle="data-done:yes|no" data-marble-of="[data-marble-id=chk-log]">Done</button>
          <span data-marble-id="chk-log-label" data-marble-editable>Write the failed run before the next one</span>
        </li>
      </ul>
      <div data-marble-id="hyper" class="steps">
        <div data-marble-id="hp-lr" class="stepper" data-lr="3">
          <span data-marble-id="hp-lr-name">lr 10^−</span>
          <button data-marble-id="hp-lr-dec" type="button" data-marble-step="data-lr:1:8" data-marble-by="-1" data-marble-of="[data-marble-id=hp-lr]">−</button>
          <b data-marble-id="hp-lr-val">3</b>
          <button data-marble-id="hp-lr-inc" type="button" data-marble-step="data-lr:1:8" data-marble-by="1" data-marble-of="[data-marble-id=hp-lr]">+</button>
        </div>
        <div data-marble-id="hp-layers" class="stepper" data-layers="8">
          <span data-marble-id="hp-layers-name">layers</span>
          <button data-marble-id="hp-layers-dec" type="button" data-marble-step="data-layers:2:24" data-marble-by="-1" data-marble-of="[data-marble-id=hp-layers]">−</button>
          <b data-marble-id="hp-layers-val">8</b>
          <button data-marble-id="hp-layers-inc" type="button" data-marble-step="data-layers:2:24" data-marble-by="1" data-marble-of="[data-marble-id=hp-layers]">+</button>
        </div>
        <div data-marble-id="hp-seed" class="stepper" data-seed="4">
          <span data-marble-id="hp-seed-name">seeds</span>
          <button data-marble-id="hp-seed-dec" type="button" data-marble-step="data-seed:1:12" data-marble-by="-1" data-marble-of="[data-marble-id=hp-seed]">−</button>
          <b data-marble-id="hp-seed-val">4</b>
          <button data-marble-id="hp-seed-inc" type="button" data-marble-step="data-seed:1:12" data-marble-by="1" data-marble-of="[data-marble-id=hp-seed]">+</button>
        </div>
      </div>
    </article>
    <article data-marble-id="pane-probes" data-note="note-probes">
      <h2 data-marble-id="pane-probes-h" data-marble-editable>Attention Head Probes</h2>
      <p data-marble-id="pane-probes-p" data-marble-editable>Linear probes on the residual stream, fit per head, scored on the previous-token copy task. A head that probes well and ablates clean is a circuit, not a correlation.</p>
      <div data-marble-id="probe-grid" class="probes">
        <section data-marble-id="probe-1" class="block" data-marble-removable>
          <h2 data-marble-id="probe-1-h" data-marble-editable>L2H4</h2>
          <p data-marble-id="probe-1-p" data-marble-editable>Copies the previous token. Ablation raises copy loss by 0.4 without moving the main loss.</p>
        </section>
        <section data-marble-id="probe-2" class="block" data-marble-removable>
          <h2 data-marble-id="probe-2-h" data-marble-editable>L5H1</h2>
          <p data-marble-id="probe-2-p" data-marble-editable>Induction head. Probe accuracy 0.91. Leave it in until the name-mover is mapped.</p>
        </section>
      </div>
    </article>
    <article data-marble-id="pane-spike" data-note="note-spike">
      <h2 data-marble-id="pane-spike-h" data-marble-editable>Loss Spike Postmortem</h2>
      <p data-marble-id="pane-spike-p" data-marble-editable>Step 48,200. Loss 2.1 to 6.4 in forty steps, then a stall. The data order hash did not match the logged run.</p>
      <p data-marble-id="spike-when" class="kicker" data-marble-editable style="margin-top:.75rem">Timing</p>
      <p data-marble-id="spike-when-p" data-marble-editable>Just after the learning-rate decay, on the shard that was reshuffled by hand.</p>
      <p data-marble-id="spike-cause" class="kicker" data-marble-editable style="margin-top:.75rem">Root cause</p>
      <p data-marble-id="spike-cause-p" data-marble-editable>Not the ablation. The spike reproduces with every head intact if the shard hash differs.</p>
    </article>
    <article data-marble-id="pane-queue" data-note="note-queue">
      <h2 data-marble-id="pane-queue-h" data-marble-editable>Reading Queue</h2>
      <ol data-marble-id="queue-list" class="queue" data-marble-sortable="queue">
        <li data-marble-id="q-1" data-marble-removable><p data-marble-id="q-1-t" data-marble-editable>Olsson et al. (2022): In-context learning and induction heads</p></li>
        <li data-marble-id="q-2" data-marble-removable><p data-marble-id="q-2-t" data-marble-editable>Elhage et al. (2021): A mathematical framework for transformer circuits</p></li>
        <li data-marble-id="q-3" data-marble-removable><p data-marble-id="q-3-t" data-marble-editable>Power et al. (2022): Grokking and generalization beyond overfitting</p></li>
      </ol>
    </article>
  </div>
</div>`
  const script = `${BOOT_OPEN}
    var shell = qMarble('notebook-shell');
    function syncSteps() {
      var hosts = document.querySelectorAll('.stepper');
      for (var i = 0; i < hosts.length; i++) {
        var val = hosts[i].querySelector('b');
        var name = hosts[i].hasAttribute('data-lr') ? 'data-lr' : hosts[i].hasAttribute('data-layers') ? 'data-layers' : 'data-seed';
        if (val) val.textContent = hosts[i].getAttribute(name) || '';
      }
    }
    function derive() {
      if (!shell) return;
      shell.classList.add('marble-derived');
      var active = shell.getAttribute('data-active-note');
      var items = document.querySelectorAll('#note-list > li');
      for (var i = 0; i < items.length; i++) items[i].classList.toggle('marble-on', items[i].getAttribute('data-marble-id') === active);
      var panes = document.querySelectorAll('#note-stage > [data-note]');
      for (var p = 0; p < panes.length; p++) panes[p].classList.toggle('marble-on', panes[p].getAttribute('data-note') === active);
      syncSteps();
    }
    function ensurePanes() {
      var items = document.querySelectorAll('#note-list > li');
      for (var i = 0; i < items.length; i++) {
        var id = items[i].getAttribute('data-marble-id');
        if (!id || document.querySelector('#note-stage > [data-note="' + id + '"]')) continue;
        var titleEl = items[i].querySelector('[data-marble-editable]');
        var title = (titleEl && titleEl.textContent || 'New note').trim();
        var paneId = marble.newId();
        var hId = marble.newId();
        var pId = marble.newId();
        var html = '<article ' + MID + '="' + paneId + '" data-note="' + id + '"><h2 ' + MID + '="' + hId + '" data-marble-editable>' + title.replace(/</g, '') + '</h2><p ' + MID + '="' + pId + '" data-marble-editable>What changed, what you measured, and what you would rerun.</p></article>';
        var op = { type: 'insert', parentId: 'note-stage', beforeId: null, html: html };
        marble.apply(op);
        if (marble.canChange) marble.op(op, { immediate: true });
      }
      derive();
    }
    document.getElementById('note-list').addEventListener('click', function (event) {
      if (event.target.closest('.marble-btn, .marble-grip')) return;
      var li = event.target.closest('#note-list > li');
      if (!li) return;
      var id = li.getAttribute('data-marble-id');
      if (!id) return;
      shell.setAttribute('data-active-note', id);
      derive();
      marble.op({ type: 'setAttr', id: 'notebook-shell', name: 'data-active-note', value: id }, { look: true });
    });
    marble.register(derive);
    new MutationObserver(ensurePanes).observe(document.getElementById('note-list'), { childList: true });
    new MutationObserver(syncSteps).observe(qMarble('hyper'), { attributes: true, subtree: true });
    ensurePanes();
  ${BOOT_CLOSE}`
  return page('Multi-Note Lab Notebook', css, body, script)
}

function documentSource(): string {
  const css = `
  .doc { max-width: 68rem; margin: 0 auto; padding: 1.4rem 1.4rem 4rem; display: grid; grid-template-columns: 13.5rem 1fr; gap: 1.4rem; }
  .toolbar { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: .8rem 1rem; align-items: center; padding-bottom: .8rem; border-bottom: 1px solid var(--line); }
  .tool { display: flex; align-items: center; gap: .4rem; color: var(--muted); font-size: .78rem; }
  .outline { position: sticky; top: 1rem; align-self: start; display: flex; flex-direction: column; gap: .25rem; border-right: 1px solid var(--line); padding-right: .9rem; }
  .outline [data-marble-choose] { display: flex; flex-direction: column; gap: .15rem; }
  .outline button { text-align: left; border: 0; background: transparent; padding: .35rem .5rem; border-radius: 5px; color: var(--muted); font-size: .83rem; }
  [data-active-section="problem"] [data-outline="problem"],
  [data-active-section="method"] [data-outline="method"],
  [data-active-section="eval"] [data-outline="eval"],
  [data-active-section="risks"] [data-outline="risks"] { background: var(--accent-soft); color: var(--accent); font-weight: 500; }
  .doc-title { font-size: 2.15rem; margin: .15rem 0 .65rem; }
  .sections { display: flex; flex-direction: column; gap: .75rem; margin-top: 1.1rem; }
  .doc-section { display: grid; grid-template-columns: 1fr 12.5rem; gap: 1rem; }
  [data-density="compact"] .doc-section { padding: .65rem .85rem; }
  [data-density="comfortable"] .doc-section { padding: 1rem 1.15rem; }
  [data-level="1"] .doc-section h2 { font-size: 1.55rem; }
  [data-level="2"] .doc-section h2 { font-size: 1.22rem; }
  [data-level="3"] .doc-section h2 { font-size: 1rem; }
  .margin { color: var(--muted); font-size: .8rem; border-left: 1px solid var(--line); padding-left: .75rem; }
  .callout { margin-top: .65rem; border-left: 2.5px solid var(--accent); background: var(--accent-soft); padding: .6rem .8rem; border-radius: 0 5px 5px 0; }
  [data-callout="warning"] .callout { border-left-color: var(--warn); background: color-mix(in srgb, var(--warn) 14%, var(--panel)); }
  [data-callout="result"] .callout { border-left-color: var(--good); background: color-mix(in srgb, var(--good) 14%, var(--panel)); }
  @media (max-width: 860px) { .doc { grid-template-columns: 1fr; } .outline { border-right: 0; border-bottom: 1px solid var(--line); padding-bottom: .75rem; } .doc-section { grid-template-columns: 1fr; } }
  `
  const body = `<article data-marble-id="doc-shell" class="doc" data-density="comfortable" data-callout="insight" data-level="2" data-active-section="problem">
  <div data-marble-id="doc-toolbar" class="toolbar">
    <span data-marble-id="tool-density" class="tool">Density
      <span data-marble-id="density-choose" class="choose" data-marble-choose="data-density" data-marble-of="[data-marble-id=doc-shell]">
        <button data-marble-id="density-compact" type="button" data-marble-value="compact">Compact</button>
        <button data-marble-id="density-comfort" type="button" data-marble-value="comfortable">Comfortable</button>
      </span>
    </span>
    <span data-marble-id="tool-callout" class="tool">Callout
      <span data-marble-id="callout-choose" class="choose" data-marble-choose="data-callout" data-marble-look="off" data-marble-of="[data-marble-id=doc-shell]">
        <button data-marble-id="callout-insight" type="button" data-marble-value="insight">Insight</button>
        <button data-marble-id="callout-warning" type="button" data-marble-value="warning">Warning</button>
        <button data-marble-id="callout-result" type="button" data-marble-value="result">Result</button>
      </span>
    </span>
    <span data-marble-id="tool-level" class="tool">Heading
      <span data-marble-id="level-choose" class="choose" data-marble-choose="data-level" data-marble-look="off" data-marble-of="[data-marble-id=doc-shell]">
        <button data-marble-id="level-1" type="button" data-marble-value="1">H1</button>
        <button data-marble-id="level-2" type="button" data-marble-value="2">H2</button>
        <button data-marble-id="level-3" type="button" data-marble-value="3">H3</button>
      </span>
    </span>
  </div>
  <nav data-marble-id="doc-outline" class="outline">
    <p data-marble-id="outline-kicker" class="kicker">Outline</p>
    <span data-marble-id="out-choose" data-marble-choose="data-active-section" data-marble-of="[data-marble-id=doc-shell]">
      <button data-marble-id="out-problem" type="button" data-marble-value="problem" data-outline="problem">Problem</button>
      <button data-marble-id="out-method" type="button" data-marble-value="method" data-outline="method">Method</button>
      <button data-marble-id="out-eval" type="button" data-marble-value="eval" data-outline="eval">Evaluation</button>
      <button data-marble-id="out-risks" type="button" data-marble-value="risks" data-outline="risks">Risks</button>
    </span>
  </nav>
  <div data-marble-id="doc-main">
    <p data-marble-id="doc-kicker" class="kicker">Research specification</p>
    <h1 data-marble-id="doc-title" class="doc-title" data-marble-editable>Collaborative Research Document</h1>
    <marble-alt data-marble-id="summary-alt" data-marble-active="v1">
      <p data-marble-id="summary-v1" data-marble-alt="v1" class="lede" data-marble-editable>We will know the memory works when a distance-7 logical qubit stays below 10⁻³ for an hour of circuit-level noise, and we will know the spec failed if the decoder, not the code, is what moved.</p>
      <p data-marble-id="summary-v2" data-marble-alt="v2" class="lede" data-marble-editable>Ship a logical memory whose error is predicted by the theorem, not by the best decoder we happened to run.</p>
      <p data-marble-id="summary-v3" data-marble-alt="v3" class="lede" data-marble-editable>The deliverable is a threshold, a scaling plot, and a sentence a reviewer can falsify.</p>
    </marble-alt>
    <div data-marble-id="doc-sections" id="doc-sections" class="sections" data-marble-sortable="sections">
      <section data-marble-id="sec-problem" class="block doc-section" data-section="problem" data-marble-removable data-marble-selectable>
        <div data-marble-id="sec-problem-body">
          <h2 data-marble-id="sec-problem-h" data-marble-editable>Problem</h2>
          <p data-marble-id="sec-problem-p" data-marble-editable>Physical error rates sit near the threshold, so a small mis-estimate of p_th changes whether the machine is a memory or a heater. The spec has to say which estimate we trust.</p>
        </div>
        <aside data-marble-id="note-problem" class="margin" data-marble-note>
          <p data-marble-id="note-problem-body" data-marble-note-body data-marble-editable>Check that the decoder assumption is in the theorem, not only in the plot.</p>
        </aside>
      </section>
      <section data-marble-id="sec-method" class="block doc-section" data-section="method" data-marble-removable data-marble-selectable>
        <div data-marble-id="sec-method-body">
          <h2 data-marble-id="sec-method-h" data-marble-editable>Method</h2>
          <p data-marble-id="sec-method-p" data-marble-editable>Rotated surface code, circuit-level depolarizing noise, minimum-weight perfect matching. Distances 3, 5, 7. One seed list, hashed and stored in the notebook.</p>
          <div data-marble-id="callout-method" class="callout">
            <p data-marble-id="callout-method-p" data-marble-editable>The callout style is a fact on the document, so a reviewer and the author see the same emphasis.</p>
          </div>
        </div>
        <aside data-marble-id="note-method" class="margin" data-marble-note>
          <p data-marble-id="note-method-body" data-marble-note-body data-marble-editable>Ask for the matching graph, not a screenshot of the matching graph.</p>
        </aside>
      </section>
      <section data-marble-id="sec-eval" class="block doc-section" data-section="eval" data-marble-removable data-marble-selectable>
        <div data-marble-id="sec-eval-body">
          <h2 data-marble-id="sec-eval-h" data-marble-editable>Evaluation</h2>
          <p data-marble-id="sec-eval-p" data-marble-editable>Report logical error per round, not per shot. Fit the threshold by collapse, and publish the fit residuals next to the curve.</p>
        </div>
        <aside data-marble-id="note-eval" class="margin" data-marble-note>
          <p data-marble-id="note-eval-body" data-marble-note-body data-marble-editable>Per round, or the distance comparison lies.</p>
        </aside>
      </section>
      <section data-marble-id="sec-risks" class="block doc-section" data-section="risks" data-marble-removable data-marble-selectable>
        <div data-marble-id="sec-risks-body">
          <h2 data-marble-id="sec-risks-h" data-marble-editable>Risks</h2>
          <p data-marble-id="sec-risks-p" data-marble-editable>A better decoder can fake a higher threshold. We freeze the decoder before the distance sweep, and we say so in the theorem.</p>
        </div>
        <aside data-marble-id="note-risks" class="margin" data-marble-note>
          <p data-marble-id="note-risks-body" data-marble-note-body data-marble-editable>If the decoder changes, the result is a new paper.</p>
        </aside>
      </section>
    </div>
  </div>
</article>`
  const script = `${BOOT_OPEN}
    qMarble('out-choose').addEventListener('click', function (event) {
      var option = event.target.closest('[data-marble-value]');
      if (!option) return;
      var name = option.getAttribute('data-marble-value');
      var section = document.querySelector('[data-section="' + name + '"]');
      if (section && section.scrollIntoView) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    marble.register(function () {});
    marble.pageOnly('data-ph');
  ${BOOT_CLOSE}`
  return page('Collaborative Research Document', css, body, script)
}

function slidesSource(): string {
  const css = `
  .deck { display: grid; grid-template-columns: 14rem 1fr; min-height: 100vh; }
  .film { background: var(--panel); border-right: 1px solid var(--line); padding: 1.15rem .9rem 2rem; }
  .film h1 { font-size: 1.15rem; margin: .2rem 0 .8rem; }
  .filmstrip { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .25rem; }
  .filmstrip li { padding: .45rem .6rem; border-radius: 5px; border: 1px solid transparent; background: transparent; font-size: .85rem; color: var(--muted); }
  .filmstrip li.marble-on, .deck:not(.marble-derived) .filmstrip li:first-child { background: var(--panel-2); border-color: var(--line); color: var(--ink); font-weight: 500; }
  .stage-wrap { padding: 1.5rem; background: var(--paper); }
  .slide { display: none; }
  .deck.marble-derived .slide.marble-on { display: flex; }
  .deck:not(.marble-derived) .slide { display: none; }
  .deck:not(.marble-derived) .slide[data-slide="slide-title"] { display: flex; }
  .card { background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: var(--radius); min-height: 26rem; padding: 2rem 2rem 1.2rem; flex-direction: column; box-shadow: none; }
  .card h1, .card h2 { color: var(--ink); }
  .card .speaker { margin-top: auto; padding-top: .8rem; border-top: 1px solid var(--line); color: var(--muted); font-size: .84rem; }
  .pane-title:has(marble-alt[data-marble-active="v1"]) h2 { font-size: 2.1rem; margin-top: 1.5rem; }
  .pane-title:has(marble-alt[data-marble-active="v2"]) { display: grid; grid-template-columns: 1.2fr .8fr; gap: 1rem; align-items: end; }
  .pane-title:has(marble-alt[data-marble-active="v3"]) h2 { font-size: 1.65rem; }
  .arch { display: grid; grid-template-columns: repeat(3, 1fr); gap: .65rem; margin-top: 1rem; }
  .arch section { background: var(--paper); border: 1px solid var(--line); border-radius: 5px; padding: .85rem; color: var(--ink); }
  .nexts { margin: .8rem 0 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: .35rem; }
  .add { margin-top: .8rem; }
  @media (max-width: 800px) { .deck { grid-template-columns: 1fr; } .arch { grid-template-columns: 1fr; } }
  `
  const body = `<div data-marble-id="deck" id="deck" class="deck" data-active-slide="slide-title">
  <aside data-marble-id="film" class="film">
    <p data-marble-id="deck-kicker" class="kicker">Slideshow</p>
    <h1 data-marble-id="deck-title" data-marble-editable>Interactive Research Slideshow</h1>
    <ol data-marble-id="slide-list" id="slide-list" class="filmstrip" data-marble-sortable="slides">
      <li data-marble-id="slide-title" data-marble-removable><p data-marble-id="slide-title-label" data-marble-editable>Title slide</p></li>
      <li data-marble-id="slide-arch" data-marble-removable><p data-marble-id="slide-arch-label" data-marble-editable>Architecture diagram</p></li>
      <li data-marble-id="slide-bench" data-marble-removable><p data-marble-id="slide-bench-label" data-marble-editable>Benchmark chart</p></li>
      <li data-marble-id="slide-eq" data-marble-removable><p data-marble-id="slide-eq-label" data-marble-editable>Key equations</p></li>
      <li data-marble-id="slide-next" data-marble-removable><p data-marble-id="slide-next-label" data-marble-editable>Next steps</p></li>
    </ol>
    <button data-marble-id="add-slide" class="add" type="button" data-marble-add="#tpl-slide" data-marble-into="#slide-list">+ Add slide</button>
    <template data-marble-id="tpl-slide" id="tpl-slide">
      <li data-marble-removable><p data-marble-editable>New slide</p></li>
    </template>
  </aside>
  <div data-marble-id="slide-stage" id="slide-stage" class="stage-wrap">
    <section data-marble-id="pane-title" class="slide card pane-title" data-slide="slide-title">
      <marble-alt data-marble-id="title-layout" data-marble-active="v1">
        <p data-marble-id="layout-v1" data-marble-alt="v1" class="kicker" data-marble-editable>Layout: focus</p>
        <p data-marble-id="layout-v2" data-marble-alt="v2" class="kicker" data-marble-editable>Layout: split</p>
        <p data-marble-id="layout-v3" data-marble-alt="v3" class="kicker" data-marble-editable>Layout: compact</p>
      </marble-alt>
      <h2 data-marble-id="slide-hero" data-marble-editable>A logical memory you can check</h2>
      <p data-marble-id="slide-sub" class="lede" data-marble-editable>Threshold, scaling, and the decoder we froze before the sweep.</p>
      <p data-marble-id="notes-title" class="speaker" data-marble-editable>Open on the claim, not the architecture. The layout pills only change where the eye lands.</p>
    </section>
    <section data-marble-id="pane-arch" class="slide card" data-slide="slide-arch">
      <h2 data-marble-id="arch-h" data-marble-editable>Architecture</h2>
      <div data-marble-id="arch-row" class="arch">
        <section data-marble-id="arch-box-1" data-marble-removable>
          <h2 data-marble-id="arch-box-1-h" data-marble-editable>Encode</h2>
          <p data-marble-id="arch-box-1-p" data-marble-editable>Rotated surface code, odd distance.</p>
        </section>
        <section data-marble-id="arch-box-2" data-marble-removable>
          <h2 data-marble-id="arch-box-2-h" data-marble-editable>Syndrome</h2>
          <p data-marble-id="arch-box-2-p" data-marble-editable>Circuit-level noise, then matching.</p>
        </section>
        <section data-marble-id="arch-box-3" data-marble-removable>
          <h2 data-marble-id="arch-box-3-h" data-marble-editable>Correct</h2>
          <p data-marble-id="arch-box-3-p" data-marble-editable>One decoder, frozen, named in the theorem.</p>
        </section>
      </div>
      <p data-marble-id="notes-arch" class="speaker" data-marble-editable>Point at the middle box. That is the assumption the result depends on.</p>
    </section>
    <section data-marble-id="pane-bench" class="slide card" data-slide="slide-bench">
      <h2 data-marble-id="bench-h" data-marble-editable>Benchmark</h2>
      <svg data-marble-id="bench-svg" viewBox="0 0 520 180" width="100%" height="180" role="img" aria-label="Logical error by distance">
        <line x1="40" y1="150" x2="490" y2="150" stroke="currentColor" opacity="0.25"/>
        <rect x="70" y="70" width="48" height="80" rx="4" fill="var(--accent)"/>
        <rect x="180" y="46" width="48" height="104" rx="4" fill="var(--accent)"/>
        <rect x="290" y="28" width="48" height="122" rx="4" fill="var(--good)"/>
        <text x="94" y="168" text-anchor="middle" font-size="12" fill="currentColor">d=3</text>
        <text x="204" y="168" text-anchor="middle" font-size="12" fill="currentColor">d=5</text>
        <text x="314" y="168" text-anchor="middle" font-size="12" fill="currentColor">d=7</text>
      </svg>
      <p data-marble-id="bench-caption" data-marble-editable>Logical error per round falls with distance once p is half the threshold. The green bar is the operating point.</p>
      <p data-marble-id="notes-bench" class="speaker" data-marble-editable>Do not read the y-axis aloud. Say “below 10⁻³ at distance 7” and stop.</p>
    </section>
    <section data-marble-id="pane-eq" class="slide card" data-slide="slide-eq">
      <h2 data-marble-id="eqs-h" data-marble-editable>Key equations</h2>
      <p data-marble-id="eqs-1" style="font-family:var(--mono);margin-bottom:.4rem" data-marble-editable>P_L ≤ C (p / p_th)^((d+1)/2)</p>
      <p data-marble-id="eqs-2" data-marble-editable>The constant C counts homology classes, not fit parameters.</p>
      <p data-marble-id="notes-eq" class="speaker" data-marble-editable>If someone asks where C comes from, go back to the proof slide you have not written yet. Say so.</p>
    </section>
    <section data-marble-id="pane-next" class="slide card" data-slide="slide-next">
      <h2 data-marble-id="next-h" data-marble-editable>Next steps</h2>
      <ol data-marble-id="next-list" class="nexts" data-marble-sortable="nexts">
        <li data-marble-id="next-1" data-marble-removable><span data-marble-id="next-1-t" data-marble-editable>Freeze the decoder hash in the notebook.</span></li>
        <li data-marble-id="next-2" data-marble-removable><span data-marble-id="next-2-t" data-marble-editable>Rerun distance 7 with the logged shard.</span></li>
        <li data-marble-id="next-3" data-marble-removable><span data-marble-id="next-3-t" data-marble-editable>Write the sentence a reviewer can falsify.</span></li>
      </ol>
      <p data-marble-id="notes-next" class="speaker" data-marble-editable>End on the falsifiable sentence. Do not take questions about a decoder you have not frozen.</p>
    </section>
  </div>
</div>`
  const script = `${BOOT_OPEN}
    var deck = qMarble('deck');
    function derive() {
      deck.classList.add('marble-derived');
      var active = deck.getAttribute('data-active-slide');
      var items = document.querySelectorAll('#slide-list > li');
      for (var i = 0; i < items.length; i++) items[i].classList.toggle('marble-on', items[i].getAttribute('data-marble-id') === active);
      var slides = document.querySelectorAll('#slide-stage > .slide');
      for (var s = 0; s < slides.length; s++) slides[s].classList.toggle('marble-on', slides[s].getAttribute('data-slide') === active);
    }
    function ensureSlides() {
      var items = document.querySelectorAll('#slide-list > li');
      for (var i = 0; i < items.length; i++) {
        var id = items[i].getAttribute('data-marble-id');
        if (!id || document.querySelector('#slide-stage > [data-slide="' + id + '"]')) continue;
        var titleEl = items[i].querySelector('[data-marble-editable]');
        var title = (titleEl && titleEl.textContent || 'New slide').trim().replace(/</g, '');
        var paneId = marble.newId();
        var hId = marble.newId();
        var pId = marble.newId();
        var nId = marble.newId();
        var html = '<section ' + MID + '="' + paneId + '" class="slide card" data-slide="' + id + '"><h2 ' + MID + '="' + hId + '" data-marble-editable>' + title + '</h2><p ' + MID + '="' + pId + '" data-marble-editable>One claim, then the evidence that would retire it.</p><p ' + MID + '="' + nId + '" class="speaker" data-marble-editable>Say this sentence, then stop.</p></section>';
        var op = { type: 'insert', parentId: 'slide-stage', beforeId: null, html: html };
        marble.apply(op);
        if (marble.canChange) marble.op(op, { immediate: true });
      }
      derive();
    }
    document.getElementById('slide-list').addEventListener('click', function (event) {
      if (event.target.closest('.marble-btn, .marble-grip')) return;
      var li = event.target.closest('#slide-list > li');
      if (!li) return;
      var id = li.getAttribute('data-marble-id');
      if (!id) return;
      deck.setAttribute('data-active-slide', id);
      derive();
      marble.op({ type: 'setAttr', id: 'deck', name: 'data-active-slide', value: id }, { look: true });
    });
    marble.register(derive);
    new MutationObserver(ensureSlides).observe(document.getElementById('slide-list'), { childList: true });
    ensureSlides();
  ${BOOT_CLOSE}`
  return page('Interactive Research Slideshow', css, body, script)
}

function matrixSource(): string {
  const css = `
  main { max-width: 68rem; margin: 0 auto; padding: 2rem 1.4rem 4rem; }
  h1 { font-size: 2rem; margin-bottom: .35rem; }
  .filters { margin: 1rem 0; }
  table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
  th, td { text-align: left; padding: .6rem .75rem; border-bottom: 1px solid var(--line); vertical-align: top; font-size: .88rem; }
  th { font: 500 .76rem/1.3 var(--sans); color: var(--muted); background: var(--panel-2); }
  tr[data-status="keep"] { --mark: var(--good); }
  tr[data-status="reading"] { --mark: var(--accent); }
  tr[data-status="drop"] { --mark: var(--danger); }
  tbody tr { box-shadow: inset 2.5px 0 0 var(--mark, var(--line)); }
  .matrix.marble-derived tr.marble-dim { display: none; }
  .take { color: var(--ink); }
  .add { margin-top: .85rem; }
  .foot { margin-top: .85rem; color: var(--muted); font-size: .84rem; }
  `
  const row = (
    id: string,
    name: string,
    venue: string,
    method: string,
    status: string,
    take: string,
  ) => `<tr data-marble-id="${id}" data-status="${status}" data-marble-removable>
      <td data-marble-id="${id}-name" data-marble-editable>${name}</td>
      <td data-marble-id="${id}-venue" data-marble-editable>${venue}</td>
      <td data-marble-id="${id}-method" data-marble-editable>${method}</td>
      <td data-marble-id="${id}-status">
        <span data-marble-id="${id}-choose" class="choose" data-marble-choose="data-status" data-marble-look="off" data-marble-of="[data-marble-id=${id}]">
          <button data-marble-id="${id}-reading" type="button" data-marble-value="reading">Reading</button>
          <button data-marble-id="${id}-keep" type="button" data-marble-value="keep">Keep</button>
          <button data-marble-id="${id}-drop" type="button" data-marble-value="drop">Drop</button>
        </span>
      </td>
      <td data-marble-id="${id}-take" class="take" data-marble-editable>${take}</td>
    </tr>`
  const body = `<main data-marble-id="matrix-shell" class="matrix" data-filter="all">
  <p data-marble-id="matrix-kicker" class="kicker">Synthesis</p>
  <h1 data-marble-id="matrix-title" data-marble-editable>Literature Review &amp; Synthesis Matrix</h1>
  <p data-marble-id="matrix-lede" class="lede" data-marble-editable>Five papers, one question: what has to be true for a bigger model to be a better reasoner, and which of these results actually says that.</p>
  <div data-marble-id="matrix-filters" class="filters">
    <span data-marble-id="filter-choose" class="choose" data-marble-choose="data-filter" data-marble-of="[data-marble-id=matrix-shell]">
      <button data-marble-id="filter-all" type="button" data-marble-value="all">All</button>
      <button data-marble-id="filter-reading" type="button" data-marble-value="reading">Reading</button>
      <button data-marble-id="filter-keep" type="button" data-marble-value="keep">Keep</button>
      <button data-marble-id="filter-drop" type="button" data-marble-value="drop">Drop</button>
    </span>
  </div>
  <table data-marble-id="paper-table">
    <thead data-marble-id="paper-head">
      <tr data-marble-id="paper-head-row">
        <th data-marble-id="th-paper">Paper</th>
        <th data-marble-id="th-venue">Venue</th>
        <th data-marble-id="th-method">Method</th>
        <th data-marble-id="th-status">Status</th>
        <th data-marble-id="th-take">Takeaway</th>
      </tr>
    </thead>
    <tbody data-marble-id="paper-body" id="paper-body" data-marble-sortable="papers">
      ${row('row-vaswani', 'Vaswani et al. 2017', 'NeurIPS', 'Scaled dot-product attention', 'keep', 'The interface is the residual stream. Attention is how it moves, not what it stores.')}
      ${row('row-kaplan', 'Kaplan et al. 2020', 'arXiv', 'Power-law loss vs compute', 'reading', 'Loss falls as a power of compute. It does not say the model got wiser.')}
      ${row('row-hoffmann', 'Hoffmann et al. 2022', 'NeurIPS', 'Compute-optimal tokens', 'keep', 'Most models in the earlier curve were under-trained. Re-fit before you quote them.')}
      ${row('row-wei', 'Wei et al. 2022', 'NeurIPS', 'Chain of thought', 'reading', 'A prompt can move accuracy without moving the training loss. Treat it as a method, not a scale law.')}
      ${row('row-dao', 'Dao et al. 2022', 'ICML', 'IO-aware exact attention', 'keep', 'The speedup is real and the function is the same. Do not cite it as a new algorithm.')}
    </tbody>
  </table>
  <button data-marble-id="add-paper" class="add" type="button" data-marble-add="#tpl-paper" data-marble-into="#paper-body">+ Add paper</button>
  <template data-marble-id="tpl-paper" id="tpl-paper">
    <tr data-marble-removable data-status="reading">
      <td data-marble-editable>New paper</td>
      <td data-marble-editable>Venue</td>
      <td data-marble-editable>Method</td>
      <td><span class="choose" data-marble-choose="data-status" data-marble-look="off"><button type="button" data-marble-value="reading">Reading</button><button type="button" data-marble-value="keep">Keep</button><button type="button" data-marble-value="drop">Drop</button></span></td>
      <td data-marble-editable>The sentence you would still believe in a year.</td>
    </tr>
  </template>
  <p data-marble-id="matrix-note" class="foot" data-marble-note><span data-marble-id="matrix-note-body" data-marble-note-body data-marble-editable>Status is a decision, so it is filed. The filter is only where you are looking.</span></p>
</main>`
  const script = `${BOOT_OPEN}
    var shell = qMarble('matrix-shell');
    function derive() {
      shell.classList.add('marble-derived');
      var filter = shell.getAttribute('data-filter') || 'all';
      var rows = document.querySelectorAll('#paper-body > tr');
      for (var i = 0; i < rows.length; i++) {
        var status = rows[i].getAttribute('data-status') || '';
        rows[i].classList.toggle('marble-dim', filter !== 'all' && status !== filter);
      }
    }
    marble.register(derive);
    new MutationObserver(derive).observe(shell, { attributes: true, attributeFilter: ['data-filter'] });
    new MutationObserver(derive).observe(document.getElementById('paper-body'), { attributes: true, subtree: true, attributeFilter: ['data-status'] });
    derive();
  ${BOOT_CLOSE}`
  return page('Literature Review & Synthesis Matrix', css, body, script)
}

function sandboxSource(): string {
  const css = `
  main { max-width: 68rem; margin: 0 auto; padding: 2rem 1.4rem 4rem; display: grid; grid-template-columns: 1.2fr .8fr; gap: 1rem; }
  .span { grid-column: 1 / -1; padding-bottom: .9rem; border-bottom: 1px solid var(--line); }
  h1 { font-size: 2rem; }
  .chart-card, .table-card { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 1rem; }
  svg { width: 100%; height: auto; display: block; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: .48rem .45rem; border-bottom: 1px solid var(--line); font-size: .86rem; }
  th { font: 500 .76rem/1.3 var(--sans); color: var(--muted); }
  td { font-variant-numeric: tabular-nums; }
  .stepper { display: inline-flex; align-items: center; gap: .35rem; margin-top: .8rem; font-size: .82rem; font-variant-numeric: tabular-nums; }
  .stepper button { width: 1.5rem; height: 1.5rem; border-radius: 4px; border: 1px solid var(--line); background: var(--panel-2); }
  .add { margin-top: .8rem; }
  @media (max-width: 860px) { main { grid-template-columns: 1fr; } }
  `
  const body = `<main data-marble-id="bench-shell" data-smooth="2">
  <header data-marble-id="bench-head" class="span">
    <p data-marble-id="bench-kicker" class="kicker">Sandbox</p>
    <h1 data-marble-id="bench-title" data-marble-editable>Interactive Data &amp; Chart Sandbox</h1>
    <p data-marble-id="bench-lede" class="lede" data-marble-editable>Edit a loss or a token budget and the bars move. The table is the file; the chart is drawn from it.</p>
  </header>
  <section data-marble-id="chart-card" class="chart-card">
    <svg data-marble-id="bench-chart" viewBox="0 0 640 280" role="img" aria-label="Loss by model">
      <line x1="40" y1="210" x2="600" y2="210" stroke="currentColor" opacity="0.25"/>
      <rect x="64" y="118" width="52" height="92" rx="4" fill="var(--accent)"/>
      <rect x="184" y="105" width="52" height="105" rx="4" fill="var(--accent)"/>
      <rect x="304" y="87" width="52" height="123" rx="4" fill="var(--accent)"/>
      <rect x="424" y="129" width="52" height="81" rx="4" fill="var(--accent)"/>
      <polyline points="90,120 210,107 330,89 450,131" fill="none" stroke="var(--accent-2)" stroke-width="2"/>
      <text x="90" y="232" text-anchor="middle" font-size="12" fill="currentColor">Argon</text>
      <text x="210" y="232" text-anchor="middle" font-size="12" fill="currentColor">Flash</text>
      <text x="330" y="232" text-anchor="middle" font-size="12" fill="currentColor">Haiku</text>
      <text x="450" y="232" text-anchor="middle" font-size="12" fill="currentColor">Opus</text>
    </svg>
    <p data-marble-id="bench-caption" data-marble-editable>Bar height is loss. The curve is the same series, nudged by the smoothing window.</p>
    <div data-marble-id="smooth" class="stepper">
      <span data-marble-id="smooth-name">Smoothing</span>
      <button data-marble-id="smooth-dec" type="button" data-marble-step="data-smooth:1:6" data-marble-by="-1" data-marble-of="[data-marble-id=bench-shell]">−</button>
      <b data-marble-id="smooth-val">2</b>
      <button data-marble-id="smooth-inc" type="button" data-marble-step="data-smooth:1:6" data-marble-by="1" data-marble-of="[data-marble-id=bench-shell]">+</button>
    </div>
  </section>
  <section data-marble-id="table-card" class="table-card">
    <table data-marble-id="bench-table">
      <thead data-marble-id="bench-thead">
        <tr data-marble-id="bench-head-row">
          <th data-marble-id="th-model">Model</th>
          <th data-marble-id="th-loss">Loss</th>
          <th data-marble-id="th-tok">Tokens (B)</th>
        </tr>
      </thead>
      <tbody data-marble-id="bench-body" id="bench-body" data-marble-sortable="rows">
        <tr data-marble-id="row-argon" data-marble-removable>
          <td data-marble-id="row-argon-name" data-marble-editable>Argon</td>
          <td data-marble-id="row-argon-loss" data-marble-editable>1.84</td>
          <td data-marble-id="row-argon-tok" data-marble-editable>128</td>
        </tr>
        <tr data-marble-id="row-flash" data-marble-removable>
          <td data-marble-id="row-flash-name" data-marble-editable>Flash</td>
          <td data-marble-id="row-flash-loss" data-marble-editable>2.11</td>
          <td data-marble-id="row-flash-tok" data-marble-editable>96</td>
        </tr>
        <tr data-marble-id="row-haiku" data-marble-removable>
          <td data-marble-id="row-haiku-name" data-marble-editable>Haiku</td>
          <td data-marble-id="row-haiku-loss" data-marble-editable>2.46</td>
          <td data-marble-id="row-haiku-tok" data-marble-editable>64</td>
        </tr>
        <tr data-marble-id="row-opus" data-marble-removable>
          <td data-marble-id="row-opus-name" data-marble-editable>Opus</td>
          <td data-marble-id="row-opus-loss" data-marble-editable>1.62</td>
          <td data-marble-id="row-opus-tok" data-marble-editable>40</td>
        </tr>
      </tbody>
    </table>
    <button data-marble-id="add-run" class="add" type="button" data-marble-add="#tpl-run" data-marble-into="#bench-body">+ Add run</button>
    <template data-marble-id="tpl-run" id="tpl-run">
      <tr data-marble-removable>
        <td data-marble-editable>New run</td>
        <td data-marble-editable>2.40</td>
        <td data-marble-editable>32</td>
      </tr>
    </template>
  </section>
</main>`
  const script = `${BOOT_OPEN}
    var shell = qMarble('bench-shell');
    var chart = qMarble('bench-chart');
    var last = '';
    function num(cell) {
      var n = parseFloat((cell && cell.textContent) || '');
      return isFinite(n) ? n : 0;
    }
    function chartInner() {
      var list = [].slice.call(document.querySelectorAll('#bench-body > tr'));
      var smooth = Math.max(1, Number(shell.getAttribute('data-smooth') || '1'));
      var parts = ['<line x1="40" y1="210" x2="600" y2="210" stroke="currentColor" opacity="0.25"/>'];
      var points = [];
      for (var i = 0; i < list.length; i++) {
        var cells = list[i].children;
        var loss = num(cells[1]);
        var h = Math.max(4, Math.round(loss / 3.2 * 160));
        var x = 64 + i * 120;
        var y = 210 - h;
        var name = ((cells[0] && cells[0].textContent) || '').trim().replace(/</g, '');
        var nudge = Math.round((smooth - 1) * 2);
        parts.push('<rect x="' + x + '" y="' + y + '" width="52" height="' + h + '" rx="4" fill="var(--accent)"/>');
        parts.push('<text x="' + (x + 26) + '" y="232" text-anchor="middle" font-size="12" fill="currentColor">' + name + '</text>');
        points.push((x + 26) + ',' + Math.max(16, y + nudge));
      }
      parts.push('<polyline points="' + points.join(' ') + '" fill="none" stroke="var(--accent-2)" stroke-width="2"/>');
      return parts.join('');
    }
    function paint(file) {
      var html = chartInner();
      if (!chart || html === last) return;
      last = html;
      chart.innerHTML = html;
      if (file && marble.canChange) marble.op({ type: 'setInner', id: 'bench-chart', html: html }, { immediate: true });
    }
    function syncSmooth() {
      var val = qMarble('smooth-val');
      if (val) val.textContent = shell.getAttribute('data-smooth') || '2';
    }
    document.getElementById('bench-body').addEventListener('focusout', function () { paint(true); });
    new MutationObserver(function () { paint(true); }).observe(document.getElementById('bench-body'), { childList: true });
    new MutationObserver(function () { syncSmooth(); paint(true); }).observe(shell, { attributes: true, attributeFilter: ['data-smooth'] });
    marble.register(function () { syncSmooth(); });
    syncSmooth();
  ${BOOT_CLOSE}`
  return page('Interactive Data & Chart Sandbox', css, body, script)
}

const STUDIO = { name: 'xDrive', initials: 'XD' }
const MIRA = { name: 'Mira Chen', initials: 'MC' }

function shareFor(slug: string, extra?: Partial<ShareConfig>): ShareConfig {
  return {
    isPublicLinkEnabled: false,
    publicLinkUrl: `https://xdrive.app/s/${slug}`,
    publicPermission: 'view_only',
    allowDuplication: true,
    sharedAiDailyLimit: 40,
    sharedAiUsedToday: 0,
    collaborators: [],
    ...extra,
  }
}

function template(
  doc: Omit<
    MarbleDocumentFile,
    | 'nodeCount'
    | 'byteSize'
    | 'version'
    | 'syncState'
    | 'checkpoints'
    | 'intentHistory'
    | 'createdBy'
    | 'lastEditedBy'
    | 'createdAt'
    | 'updatedAt'
    | 'share'
    | 'isTemplate'
  > & { share?: ShareConfig },
): MarbleDocumentFile {
  return {
    ...doc,
    isTemplate: true,
    source: doc.source,
    nodeCount: countMarbleNodes(doc.source),
    byteSize: byteSizeOf(doc.source),
    version: 1,
    syncState: 'saved',
    createdAt: '2026-09-12T15:00:00.000Z',
    updatedAt: '2026-10-02T15:00:00.000Z',
    createdBy: STUDIO,
    lastEditedBy: STUDIO,
    share: doc.share ?? shareFor(doc.slug),
    checkpoints: [],
    intentHistory: [],
  }
}

function evergreenDoc(
  doc: Omit<
    MarbleDocumentFile,
    | 'nodeCount'
    | 'byteSize'
    | 'version'
    | 'syncState'
    | 'checkpoints'
    | 'intentHistory'
    | 'createdBy'
    | 'lastEditedBy'
    | 'share'
    | 'isTemplate'
    | 'isEvergreen'
  >,
): MarbleDocumentFile {
  return {
    ...doc,
    isTemplate: false,
    isEvergreen: true,
    source: doc.source,
    nodeCount: countMarbleNodes(doc.source),
    byteSize: byteSizeOf(doc.source),
    version: 1,
    syncState: 'saved',
    createdBy: STUDIO,
    lastEditedBy: STUDIO,
    share: shareFor(doc.slug, {
      isPublicLinkEnabled: true,
      publicPermission: 'view_only',
    }),
    checkpoints: [
      {
        sha: `evergreen-${doc.slug}`,
        label: 'Evergreen system baseline',
        timestamp: Date.parse(doc.updatedAt),
        author: STUDIO.name,
        opsCount: 0,
        source: doc.source,
        note: 'Referenced automatically by the AI collaborator on every edit and app build.',
      },
    ],
    intentHistory: [],
  }
}

export const EVERGREEN_WORKSPACE_DOCS: MarbleDocumentFile[] = [
  evergreenDoc({
    id: DOCUMENT_DESIGN_SYSTEM_ID,
    slug: DOCUMENT_DESIGN_SYSTEM_SLUG,
    fileName: `${DOCUMENT_DESIGN_SYSTEM_SLUG}.mrbl`,
    title: 'xDrive Document Design System',
    description:
      'Evergreen specification of xDrive’s dual-mode Obsidian Studio & Alabaster Lab tokens, Newsreader + Inter + JetBrains Mono type scale, and 1px hairline grammar. Referenced by AI on every edit.',
    category: 'document',
    source: designSystemSource(),
    createdAt: '2026-11-01T09:00:00.000Z',
    updatedAt: '2026-11-22T09:00:00.000Z',
    starred: true,
    pinned: true,
    tags: ['evergreen', 'design-system', 'tokens', 'ai-reference'],
    folder: 'Evergreen',
  }),
  evergreenDoc({
    id: DOCUMENT_DONTS_SYSTEM_ID,
    slug: DOCUMENT_DONTS_SYSTEM_SLUG,
    fileName: `${DOCUMENT_DONTS_SYSTEM_SLUG}.mrbl`,
    title: 'Document Don’ts — Anti-Slop Guardrails',
    description:
      'Evergreen anti-slop contract forbidding warm-cream defaults, SaaS drop-shadow card kits, tracked-out uppercase kickers, and decorative chrome. Enforced by AI on every operation.',
    category: 'document',
    source: dontsSystemSource(),
    createdAt: '2026-11-01T09:05:00.000Z',
    updatedAt: '2026-11-22T09:05:00.000Z',
    starred: true,
    pinned: true,
    tags: ['evergreen', 'donts', 'anti-slop', 'ai-reference'],
    folder: 'Evergreen',
  }),
]

export const PREDEFINED_MARBLE_TEMPLATES: MarbleDocumentFile[] = [
  template({
    id: 'tpl-latex-studio',
    slug: 'latex-studio',
    fileName: 'latex-studio.mrbl',
    title: 'LaTeX Paper & Theorem Studio',
    description:
      'Overleaf-parity split LaTeX IDE with autocomplete, multi-file BibTeX & KaTeX compiler, live PDF preview, SyncTeX, and .tex/.pdf export.',
    category: 'latex',
    source: latexSource(),
    starred: true,
    pinned: true,
    tags: ['latex', 'theorem', 'paper'],
    folder: 'Templates',
  }),
  template({
    id: 'tpl-research-notebook',
    slug: 'research-notebook',
    fileName: 'research-notebook.mrbl',
    title: 'Multi-Note Lab Notebook',
    description:
      'Four research notes in one file. Switching notes is a look, so a visitor’s place stays in their tab.',
    category: 'notebook',
    source: notebookSource(),
    starred: true,
    pinned: false,
    tags: ['notebook', 'ablation', 'protocol'],
    folder: 'Templates',
  }),
  template({
    id: 'tpl-rich-document',
    slug: 'rich-document',
    fileName: 'rich-document.mrbl',
    title: 'Collaborative Research Document',
    description:
      'A structured spec with a formatting toolbar, an outline, summary alternatives, and margin notes.',
    category: 'document',
    source: documentSource(),
    starred: false,
    pinned: true,
    tags: ['spec', 'review', 'outline'],
    folder: 'Templates',
  }),
  template({
    id: 'tpl-slide-deck',
    slug: 'slide-deck',
    fileName: 'slide-deck.mrbl',
    title: 'Interactive Research Slideshow',
    description:
      'Five slides, a filmstrip, a layout switch, and speaker notes, all in one file.',
    category: 'slides',
    source: slidesSource(),
    starred: false,
    pinned: false,
    tags: ['slides', 'talk', 'qec'],
    folder: 'Templates',
  }),
  template({
    id: 'tpl-literature-matrix',
    slug: 'literature-matrix',
    fileName: 'literature-matrix.mrbl',
    title: 'Literature Review & Synthesis Matrix',
    description:
      'A filterable paper matrix. Status is a decision. The filter is only where you are looking.',
    category: 'matrix',
    source: matrixSource(),
    starred: false,
    pinned: false,
    tags: ['literature', 'synthesis', 'matrix'],
    folder: 'Templates',
  }),
  template({
    id: 'tpl-experiment-sandbox',
    slug: 'experiment-sandbox',
    fileName: 'experiment-sandbox.mrbl',
    title: 'Interactive Data & Chart Sandbox',
    description:
      'An editable benchmark table that redraws its SVG bars and files the chart as Marble ops.',
    category: 'sandbox',
    source: sandboxSource(),
    starred: true,
    pinned: false,
    tags: ['chart', 'benchmark', 'sandbox'],
    folder: 'Templates',
  }),
]

function workspaceFrom(
  base: MarbleDocumentFile,
  title: string,
  when: string,
  ops: MarbleOp[],
  rest: Partial<MarbleDocumentFile>,
): MarbleDocumentFile {
  const copy = duplicateMarbleTemplate(base, title, MIRA.name)
  const source = ops.length
    ? applyMarbleOpsClient(copy.source, ops).source
    : copy.source
  return {
    ...copy,
    ...rest,
    title,
    source,
    nodeCount: countMarbleNodes(source),
    byteSize: byteSizeOf(source),
    createdAt: when,
    updatedAt: '2026-11-21T18:40:00.000Z',
    createdBy: MIRA,
    lastEditedBy: MIRA,
    checkpoints: [
      {
        sha: `seed-${copy.slug}`,
        label: 'Opened in the workspace',
        timestamp: Date.parse(when),
        author: MIRA.name,
        opsCount: ops.length,
        source,
        note: `Seeded from ${base.title}.`,
      },
    ],
  }
}

const latex = () => PREDEFINED_MARBLE_TEMPLATES[0]
const notebook = () => PREDEFINED_MARBLE_TEMPLATES[1]
const richDoc = () => PREDEFINED_MARBLE_TEMPLATES[2]
const slides = () => PREDEFINED_MARBLE_TEMPLATES[3]
const sandbox = () => PREDEFINED_MARBLE_TEMPLATES[5]

export const INITIAL_WORKSPACE_DOCS: MarbleDocumentFile[] = [
  ...EVERGREEN_WORKSPACE_DOCS,
  workspaceFrom(
    latex(),
    'Threshold of the Rotated Surface Code',
    '2026-11-02T14:10:00.000Z',
    [
      {
        type: 'setText',
        id: 'paper-authors',
        text: 'Mira Chen, Lattice Lab',
      },
      {
        type: 'setText',
        id: 'sec-abstract-p',
        text: 'The rotated surface code, matched with a frozen minimum-weight decoder, thresholds near 0.9% under circuit-level depolarizing noise. At distance 7 and p = 0.5 p_th the logical error per round sits below 10⁻³.',
      },
    ],
    {
      id: 'ws-qec-threshold',
      slug: 'threshold-rotated-surface-code',
      fileName: 'threshold-rotated-surface-code.mrbl',
      description:
        'Working draft of the distance sweep. The decoder hash is the one logged in week 12.',
      category: 'latex',
      starred: true,
      pinned: true,
      tags: ['qec', 'threshold', 'surface-code'],
      folder: 'Papers',
    },
  ),
  workspaceFrom(
    notebook(),
    'Week 12: Head Ablations',
    '2026-11-08T11:05:00.000Z',
    [
      {
        type: 'setAttr',
        id: 'notebook-shell',
        name: 'data-active-note',
        value: 'note-probes',
      },
    ],
    {
      id: 'ws-week-12-ablations',
      slug: 'week-12-head-ablations',
      fileName: 'week-12-head-ablations.mrbl',
      description:
        'Apple Notes-style lab notebook with right-click note actions, folders, pin/lock, formatting bar, and live Markdown.',
      category: 'notebook',
      starred: true,
      pinned: true,
      tags: ['ablation', 'probes', 'notes'],
      folder: 'Lab',
    },
  ),
  workspaceFrom(
    richDoc(),
    'Logical Memory Specification',
    '2026-11-16T10:20:00.000Z',
    [],
    {
      id: 'ws-logical-memory-spec',
      slug: 'logical-memory-spec',
      fileName: 'logical-memory-spec.mrbl',
      description:
        'Collaborative Google Docs-style specification with menu bar, ruler, outline, pageless mode, find & replace, and comments.',
      category: 'document',
      starred: true,
      pinned: true,
      tags: ['spec', 'docs', 'qec'],
      folder: 'Specs',
    },
  ),
  workspaceFrom(
    slides(),
    'Group Meeting (22 Nov)',
    '2026-11-18T09:30:00.000Z',
    [
      {
        type: 'setText',
        id: 'slide-hero',
        text: 'Group meeting: the threshold moved, the decoder did not',
      },
      {
        type: 'setText',
        id: 'notes-title',
        text: 'Start with the number: 0.9%, distance 7, decoder frozen. Then take questions.',
      },
    ],
    {
      id: 'ws-group-meeting',
      slug: 'group-meeting-22-nov',
      fileName: 'group-meeting-22-nov.mrbl',
      description:
        'Monday’s deck. Jordan can comment. The public link is view only.',
      category: 'slides',
      starred: false,
      pinned: true,
      tags: ['talk', 'group-meeting'],
      folder: 'Talks',
      share: shareFor('group-meeting-22-nov', {
        isPublicLinkEnabled: true,
        publicPermission: 'view_only',
        collaborators: [
          {
            id: 'col-jordan',
            name: 'Jordan Hale',
            email: 'jordan@lattice-lab.example',
            avatarInitials: 'JH',
            avatarColor: '#5e6ad2',
            permission: 'comment_annotate',
            addedAt: '2026-11-18T15:00:00.000Z',
            lastActive: '2026-11-21T18:12:00.000Z',
          },
        ],
      }),
    },
  ),
  workspaceFrom(
    sandbox(),
    'Scaling Bench: Argon vs Flash',
    '2026-11-20T16:45:00.000Z',
    [
      { type: 'setText', id: 'row-argon-loss', text: '1.71' },
      {
        type: 'setText',
        id: 'bench-lede',
        text: 'Argon was refit on the Chinchilla token budget. Flash is the control. Edit either loss and the bars follow.',
      },
      {
        type: 'setInner',
        id: 'bench-chart',
        html: '<line x1="40" y1="210" x2="600" y2="210" stroke="currentColor" opacity="0.25"/><rect x="64" y="125" width="52" height="85" rx="4" fill="var(--accent)"/><text x="90" y="232" text-anchor="middle" font-size="12" fill="currentColor">Argon</text><rect x="184" y="105" width="52" height="105" rx="4" fill="var(--accent)"/><text x="210" y="232" text-anchor="middle" font-size="12" fill="currentColor">Flash</text><rect x="304" y="87" width="52" height="123" rx="4" fill="var(--accent)"/><text x="330" y="232" text-anchor="middle" font-size="12" fill="currentColor">Haiku</text><rect x="424" y="129" width="52" height="81" rx="4" fill="var(--accent)"/><text x="450" y="232" text-anchor="middle" font-size="12" fill="currentColor">Opus</text><polyline points="90,127 210,107 330,89 450,131" fill="none" stroke="var(--accent-2)" stroke-width="2"/>',
      },
    ],
    {
      id: 'ws-scaling-bench',
      slug: 'scaling-bench-argon-flash',
      fileName: 'scaling-bench-argon-flash.mrbl',
      description:
        'The live chart for the Argon refit. Loss 1.71 is the number in the abstract.',
      category: 'sandbox',
      starred: false,
      pinned: false,
      tags: ['benchmark', 'argon', 'scaling'],
      folder: 'Benches',
    },
  ),
]
