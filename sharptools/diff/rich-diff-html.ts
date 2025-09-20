#!/usr/bin/env -S npx -y -p tsx@^4 -p clipanion@^3 tsx

/**
 * Rich Diff → HTML Renderer (LLM-aware)
 *
 * Renders a RichDiff JSON into a standalone HTML document including:
 * - Summary headline, narrative, totals
 * - Key callouts (importance/risk/confidence)
 * - Items table with expandable details (why, operations, entities, evidence)
 * - Cluster cards with heuristics, member items, and Mermaid diagrams
 */

import { Cli, Command, Option } from 'clipanion';
import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';

interface EvidenceRef { fileId: string; hunkId?: string; lineIds?: string[] }
interface Operation { op: string; details?: string }
interface Entities { symbols?: string[]; exports?: string[]; routes?: Array<{ method: string; path: string }>; tables?: string[]; filesTouched?: string[]; configKeys?: string[] }
interface Highlight { tag: string; note?: string }
interface RichDiffMeta { createdAtIso: string; model?: { provider: string; name: string }; git?: { baseRef?: string; headRef?: string; rangeArg?: string; staged?: boolean } }
interface RichItem {
  id: string;
  fileId: string;
  hunkId?: string;
  kind: string;
  headline: string;
  whatChanged: string;
  whyChanged?: string;
  operations?: Operation[];
  entities?: Entities;
  highlights?: Highlight[];
  importance: number;
  risk: number;
  confidence: number;
  evidence?: EvidenceRef[];
}
interface Cluster { id: string; title: string; kind: string; description: string; importance: number; risk: number; confidence: number; heuristics: string[]; members: Array<{ itemId: string }>; mermaid?: string }
interface Callout { id: string; title: string; whyItMatters: string; importance: number; risk: number; confidence: number; references: EvidenceRef[] }
interface RichDiffDoc { meta: RichDiffMeta; summary: { headline: string; narrative: string; keyCallouts?: Callout[]; totals: { filesChanged: number; additions: number; deletions: number; clusters: number } }; clusters?: Cluster[]; items: RichItem[] }

// Minimal BasicDiff shapes for optional evidence rendering
interface BasicHunkContext { radius: number; before?: string[]; after?: string[] }
interface BasicHunk { id: string; attachments?: { context?: BasicHunkContext } }
interface BasicFile { id: string; pathOld?: string; pathNew?: string; rawPatch?: string; hunks: BasicHunk[] }
interface BasicDiffDoc { files: BasicFile[]; meta?: { git?: { baseRef?: string; headRef?: string; rangeArg?: string; staged?: boolean } } }

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

class RichDiffHtmlCommand extends Command {
  static paths = [["rich-diff-html"], Command.Default];

  static usage = Command.Usage({
    description: 'Render a RichDiff JSON to a standalone HTML document',
    examples: [[ 'Render HTML', 'rich-diff-html -i out/rich-diff.json -o out/rich-diff.html' ]],
  });

  inputFile = Option.String('--input,-i', { required: true, description: 'Path to RichDiff JSON' });
  outputFile = Option.String('--output,-o', { required: true, description: 'Path to output HTML file' });
  quiet = Option.Boolean('--quiet,-q', false, { description: 'Suppress non-essential errors' });
  basicFile = Option.String('--basic,-b', { required: false, description: 'Optional path to BasicDiff JSON to render evidence snippets' });

  async execute(): Promise<number> {
    try {
      const doc: RichDiffDoc = JSON.parse(await readFile(resolve(this.inputFile), 'utf8'));
      const basic: BasicDiffDoc | undefined = this.basicFile ? JSON.parse(await readFile(resolve(this.basicFile), 'utf8')) : undefined;
      const html = this.render(doc, basic);
      await writeFile(resolve(this.outputFile), html, 'utf8');
      return 0;
    } catch (err: any) {
      if (!this.quiet) {
        const message = err instanceof Error ? err.message : String(err);
        this.context.stderr.write(`Error: ${message}\n`);
      }
      return 1;
    }
  }

  private render(doc: RichDiffDoc, basic?: BasicDiffDoc): string {
    const itemsById: Record<string, RichItem> = Object.fromEntries((doc.items || []).map(i => [i.id, i]));
    const kinds = Array.from(new Set((doc.items || []).map(i => i.kind))).sort((a, b) => a.localeCompare(b));
    const basicFilesById: Record<string, BasicFile> = {};
    if (basic && Array.isArray(basic.files)) {
      for (const f of basic.files) basicFilesById[f.id] = f;
    }

    function resolveFilePath(f?: BasicFile): string | undefined {
      if (!f) return undefined;
      // Prefer new path if available; strip common a/ b/ prefixes for readability
      const candidate = f.pathNew || f.pathOld || '';
      return candidate.replace(/^a\//, '').replace(/^b\//, '') || undefined;
    }

    function renderEvidenceSnippets(item: RichItem): string {
      if (!basic || !Array.isArray(item.evidence) || !item.evidence.length) return '';
      const blocks: string[] = [];
      for (const ev of item.evidence) {
        const file = basicFilesById[ev.fileId];
        if (!file) continue;
        const filePath = resolveFilePath(file) || ev.fileId;
        if (!ev.hunkId) {
          // No hunk reference – fall back to rawPatch excerpt if present
          if (file.rawPatch) {
            const lines = file.rawPatch.split('\n').slice(0, 40).join('\n');
            blocks.push(`<div class="snippet"><div class="muted">${escapeHtml(filePath)} (patch excerpt)</div><pre><code>${escapeHtml(lines)}</code></pre></div>`);
          }
          continue;
        }
        const h = (file.hunks || []).find(hh => hh.id === ev.hunkId);
        const ctx = h && h.attachments && h.attachments.context;
        if (ctx && (ctx.after?.length || ctx.before?.length)) {
          const after = (ctx.after && ctx.after.length) ? ctx.after.join('\n') : undefined;
          const before = (ctx.before && ctx.before.length) ? ctx.before.join('\n') : undefined;
          const which = after ? 'after' : 'before';
          const content = after || before || '';
          blocks.push(
            `<div class="snippet">
               <div class="muted">${escapeHtml(filePath)} · hunk ${escapeHtml(ev.hunkId)} · ${which} (±${String(ctx.radius)} lines)</div>
               <pre><code>${escapeHtml(content)}</code></pre>
             </div>`
          );
        } else if (file.rawPatch) {
          const lines = file.rawPatch.split('\n').filter(l => l.startsWith('@@') || l.startsWith('+') || l.startsWith('-')).slice(0, 40).join('\n');
          if (lines) blocks.push(`<div class="snippet"><div class="muted">${escapeHtml(filePath)} · hunk ${escapeHtml(ev.hunkId)} (raw patch)</div><pre><code>${escapeHtml(lines)}</code></pre></div>`);
        }
      }
      return blocks.length ? `<details class="evidence"><summary>View evidence snippet${item.evidence!.length > 1 ? 's' : ''}</summary>${blocks.join('')}</details>` : '';
    }
    const rows = (doc.items || []).map(item => {
      const ops = Array.isArray(item.operations) && item.operations.length
        ? `<div><strong>Operations</strong><ul>${item.operations.map(op => `<li><code>${escapeHtml(op.op)}</code>${op.details ? ` – ${escapeHtml(op.details)}` : ''}</li>`).join('')}</ul></div>`
        : '';
      const entsParts: string[] = [];
      if (item.entities) {
        if (item.entities.symbols && item.entities.symbols.length) entsParts.push(`<div><strong>Symbols</strong>: ${item.entities.symbols.map(escapeHtml).join(', ')}</div>`);
        if (item.entities.exports && item.entities.exports.length) entsParts.push(`<div><strong>Exports</strong>: ${item.entities.exports.map(escapeHtml).join(', ')}</div>`);
        if (item.entities.routes && item.entities.routes.length) entsParts.push(`<div><strong>Routes</strong>: ${item.entities.routes.map(r => `${escapeHtml(r.method)} ${escapeHtml(r.path)}`).join(', ')}</div>`);
      }
      const ents = entsParts.length ? `<div>${entsParts.join('')}</div>` : '';
      const highlights = Array.isArray(item.highlights) && item.highlights.length
        ? `<div><strong>Highlights</strong>: ${item.highlights.map(h => `<span class="tag">${escapeHtml(h.tag)}</span>${h.note ? ` <span class="muted">(${escapeHtml(h.note)})</span>` : ''}`).join(' ')}</div>`
        : '';
      const evidence = Array.isArray(item.evidence) && item.evidence.length
        ? `<div class="muted">Evidence: ${item.evidence.map(e => `${escapeHtml(e.fileId)}${e.hunkId ? `#${escapeHtml(e.hunkId)}` : ''}${e.lineIds && e.lineIds.length ? ` [${e.lineIds.length} lines]` : ''}`).join('; ')}</div>`
        : '';
      const snippets = renderEvidenceSnippets(item);
      const anchorBtn = `<button class="btn btn-sm copy-link" type="button" data-target="#item-${escapeHtml(item.id)}">Copy link</button>`;
      const details = [item.whyChanged ? `<div><strong>Why</strong>: ${escapeHtml(item.whyChanged)}</div>` : '', ops, ents, highlights, evidence, snippets, anchorBtn]
        .filter(Boolean)
        .join('');
      const detailsCell = details
        ? `<details><summary>View</summary>${details}</details>`
        : '';
      const confBucket = item.confidence >= 0.9 ? 'conf-5' : item.confidence >= 0.75 ? 'conf-4' : item.confidence >= 0.5 ? 'conf-3' : item.confidence >= 0.25 ? 'conf-2' : 'conf-1';
      return `<tr id="item-${escapeHtml(item.id)}" data-item-id="${escapeHtml(item.id)}" data-kind="${escapeHtml(item.kind)}" data-importance="${String(item.importance)}" data-risk="${String(item.risk)}" data-confidence="${String(item.confidence)}" data-headline="${escapeHtml(item.headline)}" data-what="${escapeHtml(item.whatChanged)}">
        <td><span class="tag">${escapeHtml(item.kind)}</span></td>
        <td>${escapeHtml(item.headline)}</td>
        <td>${escapeHtml(item.whatChanged)}</td>
        <td><span class="chip chip-imp imp-${item.importance}">${item.importance}</span></td>
        <td><span class="chip chip-risk risk-${item.risk}">${item.risk}</span></td>
        <td><span class="chip chip-conf ${confBucket}">${Math.round(item.confidence * 100)}%</span></td>
        <td>${detailsCell}</td>
      </tr>`;
    }).join('\n');

    const styles = `
      :root {
        --bg: #ffffff;
        --text: #0f172a;
        --muted: #64748b;
        --border: #e5e7eb;
        --card: #f8fafc;
        --accent: #3730a3;
        --chip-bg: #eef2ff;
        --tag-bg: #f1f5f9;
        --danger: #ef4444;
        --warn: #f59e0b;
        --ok: #10b981;
        --info: #3b82f6;
      }
      .dark {
        --bg: #0b1020;
        --text: #e5e7eb;
        --muted: #9aa6b2;
        --border: #243046;
        --card: #111a2f;
        --accent: #a5b4fc;
        --chip-bg: #1f2a44;
        --tag-bg: #0f172a;
        --danger: #f87171;
        --warn: #fbbf24;
        --ok: #34d399;
        --info: #60a5fa;
      }
      html, body { background: var(--bg); color: var(--text); }
      body { font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; line-height: 1.6; margin: 0; }
      main { max-width: 1160px; margin: 2rem auto; padding: 0 1rem; }
      .layout { display: grid; grid-template-columns: 220px 1fr; gap: 16px; }
      .sidebar { position: sticky; top: 10px; align-self: start; border: 1px solid var(--border); border-radius: 8px; padding: 10px; background: transparent; }
      .sidebar h3 { margin: 0 0 8px; font-size: 0.95rem; }
      .sidebar a { display: block; color: var(--text); text-decoration: none; padding: 4px 6px; border-radius: 6px; }
      .sidebar a:hover { background: var(--card); }
      .sidebar .count { color: var(--muted); }
      table { width: 100%; border-collapse: collapse; }
      th, td { border-bottom: 1px solid var(--border); padding: 8px 6px; text-align: left; vertical-align: top; }
      th { background: var(--card); position: sticky; top: 0; }
      h1, h2 { margin: 0.2rem 0 0.6rem; }
      .muted { color: var(--muted); font-size: 0.9rem; }
      header .toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      header .toolbar .spacer { flex: 1; }
      .controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 10px; margin: 10px 0; }
      .controls label { font-size: 12px; color: var(--muted); display: block; }
      .controls input, .controls select { width: 100%; box-sizing: border-box; padding: 6px 8px; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; }
      .btn { padding: 6px 10px; border: 1px solid var(--border); background: var(--bg); color: var(--text); border-radius: 6px; cursor: pointer; }
      .btn-sm { padding: 2px 8px; font-size: 12px; }
      .btn:hover { background: var(--card); }
      .cluster { border: 1px solid var(--border); border-radius: 8px; padding: 10px; margin: 10px 0; background: transparent; }
      .cluster .chips { margin: 6px 0; }
      .chip { display: inline-block; background: var(--chip-bg); color: var(--accent); padding: 2px 8px; border-radius: 9999px; font-size: 12px; margin-right: 6px; border: 1px solid var(--border); }
      .chip-imp.imp-1, .chip-imp.imp-2 { color: var(--info); }
      .chip-imp.imp-3 { color: #6366f1; }
      .chip-imp.imp-4, .chip-imp.imp-5 { color: #4f46e5; }
      .chip-risk.risk-1, .chip-risk.risk-2 { color: var(--ok); }
      .chip-risk.risk-3 { color: var(--warn); }
      .chip-risk.risk-4, .chip-risk.risk-5 { color: var(--danger); }
      .chip-conf.conf-1 { color: #94a3b8; }
      .chip-conf.conf-2 { color: #60a5fa; }
      .chip-conf.conf-3 { color: #3b82f6; }
      .chip-conf.conf-4 { color: #2563eb; }
      .chip-conf.conf-5 { color: #1d4ed8; }
      .tag { display: inline-block; background: var(--tag-bg); color: var(--text); padding: 1px 6px; border-radius: 6px; font-size: 12px; margin-right: 4px; border: 1px solid var(--border); }
      .callouts { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; margin: 10px 0; }
      .callout { border: 1px solid var(--border); border-radius: 8px; padding: 10px; background: transparent; }
      .callout .title { font-weight: 600; }
      .mermaid { background: var(--card); border-radius: 6px; padding: 8px; white-space: pre; overflow-x: auto; }
      .legend { display: flex; gap: 10px; align-items: center; font-size: 12px; color: var(--muted); }
      .snippet pre { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 8px; overflow: auto; }
      details.cluster > summary { cursor: pointer; list-style: none; }
      details.cluster > summary::-webkit-details-marker { display: none; }
    `;

    function renderGitContext(meta: RichDiffMeta | undefined): string {
      if (!meta || !meta.git) return '';
      const g = meta.git;
      const parts: string[] = [];
      if (g.rangeArg) parts.push(escapeHtml(g.rangeArg));
      else if (g.baseRef || g.headRef) parts.push(`${escapeHtml(g.baseRef || '?')}..${escapeHtml(g.headRef || '?')}`);
      if (g.staged) parts.push('(staged)');
      return parts.length ? `<p class="muted">Commit range: ${parts.join(' ')}</p>` : '';
    }

    const itemsCount = (doc.items || []).length;
    const clustersCount = Array.isArray(doc.clusters) ? doc.clusters.length : 0;
    const calloutsCount = Array.isArray(doc.summary?.keyCallouts) ? doc.summary.keyCallouts.length : 0;

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(doc.summary.headline || 'Rich Diff')}</title>
    <style>${styles}</style>
  </head>
  <body>
    <main>
      <div class="layout">
        <aside class="sidebar">
          <h3>Overview</h3>
          <a href="#summary">Summary</a>
          <a href="#key-callouts">Key callouts <span class="count">(${calloutsCount})</span></a>
          <a href="#items">Items <span class="count">(${itemsCount})</span></a>
          <a href="#clusters">Clusters <span class="count">(${clustersCount})</span></a>
        </aside>
        <div class="content">
      <header id="summary">
        <h1>${escapeHtml(doc.summary.headline || 'Rich Diff')}</h1>
        <p class="muted">Total files changed: ${doc.summary.totals.filesChanged}, +${doc.summary.totals.additions}/-${doc.summary.totals.deletions}${typeof doc.summary.totals.clusters === 'number' ? `, clusters: ${doc.summary.totals.clusters}` : ''}</p>
        ${doc.meta && doc.meta.model ? `<p class="muted">Model: ${escapeHtml(doc.meta.model.provider)} · ${escapeHtml(doc.meta.model.name)}</p>` : ''}
        ${renderGitContext(doc.meta)}
        <div class="toolbar">
          <span class="spacer"></span>
          <span id="items-count" class="muted"></span>
          <button id="theme-toggle" class="btn" type="button">Toggle theme</button>
        </div>
        ${doc.meta && (doc.meta as any).goalRef ? `<p class="muted">Goal: ${escapeHtml((doc.meta as any).goalRef.goalSummary || '')}${(doc.meta as any).goalRef.planningDocPath ? ` — <a href="${escapeHtml((doc.meta as any).goalRef.planningDocPath)}">planning doc</a>` : ''}</p>` : ''}
        <p>${escapeHtml(doc.summary.narrative || '')}</p>
      </header>
      ${Array.isArray(doc.summary.keyCallouts) && doc.summary.keyCallouts.length ? `
      <section id="key-callouts">
        <h2>Key callouts</h2>
        <div class="callouts">
          ${doc.summary.keyCallouts.map(k => `
            <div class="callout">
              <div class="title">${escapeHtml(k.title)}</div>
              <div>${escapeHtml(k.whyItMatters)}</div>
              <div class="chips">
                <span class="chip">Importance ${k.importance}</span>
                <span class="chip">Risk ${k.risk}</span>
                <span class="chip">Confidence ${Math.round(k.confidence * 100)}%</span>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
      ` : ''}
      <section id="items">
        <h2>Items</h2>
        <div class="controls">
          <div>
            <label for="filter-kind">Kind</label>
            <select id="filter-kind">
              <option value="">All kinds</option>
              ${kinds.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label for="filter-search">Search</label>
            <input id="filter-search" type="search" placeholder="Headline, what changed..." />
          </div>
          <div>
            <label for="filter-importance">Min importance</label>
            <select id="filter-importance">
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2" selected>2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>
          </div>
          <div>
            <label for="filter-risk">Min risk</label>
            <select id="filter-risk">
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2" selected>2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>
          </div>
          <div>
            <label for="filter-confidence">Min confidence</label>
            <select id="filter-confidence">
              <option value="0">0%</option>
              <option value="0.25">25%</option>
              <option value="0.5" selected>50%</option>
              <option value="0.75">75%</option>
              <option value="0.9">90%</option>
            </select>
          </div>
          <div>
            <label for="sort-by">Sort</label>
            <select id="sort-by">
              <option value="importance">Importance</option>
              <option value="risk">Risk</option>
              <option value="confidence">Confidence</option>
              <option value="kind">Kind</option>
              <option value="headline">Headline</option>
            </select>
          </div>
          <div>
            <label for="sort-dir">Direction</label>
            <select id="sort-dir">
              <option value="desc" selected>Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>
          <div>
            <label>&nbsp;</label>
            <button id="filters-reset" class="btn" type="button">Reset</button>
          </div>
        </div>
        <div class="legend">Legend:
          <span class="chip chip-imp imp-5">Importance</span>
          <span class="chip chip-risk risk-5">Risk</span>
          <span class="chip chip-conf conf-5">Confidence</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Kind</th>
              <th>Headline</th>
              <th>What changed</th>
              <th>Importance</th>
              <th>Risk</th>
              <th>Confidence</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
${rows}
          </tbody>
        </table>
      </section>
      ${Array.isArray(doc.clusters) && doc.clusters.length ? `
      <section id="clusters">
        <h2>Clusters</h2>
        ${doc.clusters.map(c => `
          <details class="cluster" id="cluster-${escapeHtml(c.id)}">
            <summary>
              <strong>${escapeHtml(c.title)}</strong> <span class="muted">(${escapeHtml(c.kind)})</span>
              <span class="chips">
                <span class="chip">Importance ${c.importance}</span>
                <span class="chip">Risk ${c.risk}</span>
                <span class="chip">Confidence ${Math.round(c.confidence * 100)}%</span>
              </span>
            </summary>
            <div>${escapeHtml(c.description)}</div>
            ${Array.isArray(c.heuristics) && c.heuristics.length ? `<div>${c.heuristics.map(h => `<span class="tag">${escapeHtml(h)}</span>`).join(' ')}</div>` : ''}
            ${Array.isArray(c.members) && c.members.length ? `<div class="muted">Members: ${c.members.map(m => {
              const it = itemsById[m.itemId];
              return it ? `<a href="#item-${escapeHtml(it.id)}">${escapeHtml(it.headline)}</a> <span class=\"muted\">(${escapeHtml(it.kind)})</span>` : escapeHtml(m.itemId);
            }).join('; ')}</div>` : ''}
            ${c.mermaid ? `<pre class="mermaid">${escapeHtml(c.mermaid)}</pre>` : ''}
          </details>
        `).join('\n')}
      </section>
      ` : ''}
      </div>
      </div>
    </main>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <script>
      try {
        // Initialize Mermaid if available
        if (window['mermaid']) {
          window['mermaid'].initialize({ startOnLoad: true, theme: 'default' });
        }
      } catch (e) { /* ignore */ }
      (function(){
        const d = document;
        const tbody = d.querySelector('tbody');
        const rows = Array.from(d.querySelectorAll('tbody tr[data-item-id]'));
        const kindSel = d.getElementById('filter-kind');
        const qInput = d.getElementById('filter-search');
        const impSel = d.getElementById('filter-importance');
        const riskSel = d.getElementById('filter-risk');
        const confSel = d.getElementById('filter-confidence');
        const sortSel = d.getElementById('sort-by');
        const dirSel = d.getElementById('sort-dir');
        const resetBtn = d.getElementById('filters-reset');
        const countEl = d.getElementById('items-count');
        // Optional persisted theme, default off (no toggle button)
        try {
          const persisted = localStorage.getItem('richdiff-theme');
          if (persisted === 'dark') document.body.classList.add('dark');
        } catch {}

        function text(v){ return (v || '').toString().toLowerCase(); }
        function update(){
          const kind = kindSel && kindSel['value'] ? kindSel['value'] : '';
          const q = text(qInput && qInput['value']);
          const minImp = parseInt(impSel && impSel['value'] || '0', 10);
          const minRisk = parseInt(riskSel && riskSel['value'] || '0', 10);
          const minConf = parseFloat(confSel && confSel['value'] || '0');
          let shown = 0;
          rows.forEach(tr => {
            const rk = tr.getAttribute('data-kind') || '';
            const imp = parseInt(tr.getAttribute('data-importance') || '0', 10);
            const risk = parseInt(tr.getAttribute('data-risk') || '0', 10);
            const conf = parseFloat(tr.getAttribute('data-confidence') || '0');
            const h = text(tr.getAttribute('data-headline'));
            const w = text(tr.getAttribute('data-what'));
            const pass = (!kind || rk === kind)
              && imp >= minImp
              && risk >= minRisk
              && conf >= minConf
              && (!q || h.includes(q) || w.includes(q) || rk.toLowerCase().includes(q));
            tr.style.display = pass ? '' : 'none';
            if (pass) shown++;
          });
          if (countEl) countEl.textContent = shown + ' of ' + rows.length + ' items shown';
        }
        function sort(){
          if (!tbody) return;
          const by = sortSel && sortSel['value'] || 'importance';
          const dir = dirSel && dirSel['value'] || 'desc';
          const mul = dir === 'asc' ? 1 : -1;
          const get = (tr, key) => {
            switch(key){
              case 'importance': return parseInt(tr.getAttribute('data-importance') || '0', 10);
              case 'risk': return parseInt(tr.getAttribute('data-risk') || '0', 10);
              case 'confidence': return parseFloat(tr.getAttribute('data-confidence') || '0');
              case 'kind': return tr.getAttribute('data-kind') || '';
              case 'headline': return tr.getAttribute('data-headline') || '';
              default: return 0;
            }
          };
          const visible = rows.slice();
          visible.sort((a, b) => {
            const va = get(a, by);
            const vb = get(b, by);
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul;
            return String(va).localeCompare(String(vb)) * mul;
          });
          visible.forEach(tr => tbody.appendChild(tr));
        }
        [kindSel, qInput, impSel, riskSel, confSel].forEach(el => el && el.addEventListener('input', update));
        [sortSel, dirSel].forEach(el => el && el.addEventListener('change', () => { sort(); update(); }));
        if (resetBtn) resetBtn.addEventListener('click', () => {
          if (kindSel) kindSel['value'] = '';
          if (qInput) qInput['value'] = '';
          if (impSel) impSel['value'] = '0';
          if (riskSel) riskSel['value'] = '0';
          if (confSel) confSel['value'] = '0';
          if (sortSel) sortSel['value'] = 'importance';
          if (dirSel) dirSel['value'] = 'desc';
          sort();
          update();
        });
        // Theme toggle
        const themeBtn = d.getElementById('theme-toggle');
        if (themeBtn) themeBtn.addEventListener('click', () => {
          const dark = document.body.classList.toggle('dark');
          try { localStorage.setItem('richdiff-theme', dark ? 'dark' : 'light'); } catch {}
        });
        // Copy link buttons
        d.addEventListener('click', (ev) => {
          const t = ev.target as HTMLElement;
          if (t && t.classList && t.classList.contains('copy-link')) {
            const target = t.getAttribute('data-target') || '';
            if (target) {
              const url = new URL(window.location.href);
              url.hash = target;
              navigator.clipboard && navigator.clipboard.writeText(url.toString()).catch(() => {});
            }
          }
        });
        sort();
        update();
      })();
    </script>
  </body>
</html>`;
  }
}

const cli = new Cli({ binaryLabel: 'Rich Diff → HTML', binaryName: 'rich-diff-html', binaryVersion: '1.0.0' });
cli.register(RichDiffHtmlCommand);
cli.runExit(process.argv.slice(2));


