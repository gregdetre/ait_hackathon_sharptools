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
interface RichDiffMeta { createdAtIso: string; model?: { provider: string; name: string } }
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

  async execute(): Promise<number> {
    try {
      const doc: RichDiffDoc = JSON.parse(await readFile(resolve(this.inputFile), 'utf8'));
      const html = this.render(doc);
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

  private render(doc: RichDiffDoc): string {
    const itemsById: Record<string, RichItem> = Object.fromEntries((doc.items || []).map(i => [i.id, i]));
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
      const details = [item.whyChanged ? `<div><strong>Why</strong>: ${escapeHtml(item.whyChanged)}</div>` : '', ops, ents, highlights, evidence]
        .filter(Boolean)
        .join('');
      const detailsCell = details
        ? `<details><summary>View</summary>${details}</details>`
        : '';
      return `<tr>
        <td>${escapeHtml(item.kind)}</td>
        <td>${escapeHtml(item.headline)}</td>
        <td>${escapeHtml(item.whatChanged)}</td>
        <td>${item.importance}</td>
        <td>${item.risk}</td>
        <td>${Math.round(item.confidence * 100)}%</td>
        <td>${detailsCell}</td>
      </tr>`;
    }).join('\n');

    const styles = `
      body { font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; line-height: 1.6; margin: 0; }
      main { max-width: 1060px; margin: 2rem auto; padding: 0 1rem; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border-bottom: 1px solid #e5e7eb; padding: 8px 6px; text-align: left; vertical-align: top; }
      th { background: #f8fafc; position: sticky; top: 0; }
      h1, h2 { margin: 0.2rem 0 0.6rem; }
      .muted { color: #6b7280; font-size: 0.9rem; }
      .cluster { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; margin: 10px 0; }
      .cluster .chips { margin: 6px 0; }
      .chip { display: inline-block; background: #eef2ff; color: #3730a3; padding: 2px 8px; border-radius: 9999px; font-size: 12px; margin-right: 6px; }
      .tag { display: inline-block; background: #f1f5f9; color: #334155; padding: 1px 6px; border-radius: 6px; font-size: 12px; margin-right: 4px; }
      .callouts { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; margin: 10px 0; }
      .callout { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; }
      .callout .title { font-weight: 600; }
      .mermaid { background: #f9fafb; border-radius: 6px; padding: 8px; white-space: pre; overflow-x: auto; }
    `;

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
      <header>
        <h1>${escapeHtml(doc.summary.headline || 'Rich Diff')}</h1>
        <p class="muted">Total files changed: ${doc.summary.totals.filesChanged}, +${doc.summary.totals.additions}/-${doc.summary.totals.deletions}${typeof doc.summary.totals.clusters === 'number' ? `, clusters: ${doc.summary.totals.clusters}` : ''}</p>
        ${doc.meta && doc.meta.model ? `<p class="muted">Model: ${escapeHtml(doc.meta.model.provider)} · ${escapeHtml(doc.meta.model.name)}</p>` : ''}
        <p>${escapeHtml(doc.summary.narrative || '')}</p>
      </header>
      ${Array.isArray(doc.summary.keyCallouts) && doc.summary.keyCallouts.length ? `
      <section>
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
      <section>
        <h2>Items</h2>
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
      <section>
        <h2>Clusters</h2>
        ${doc.clusters.map(c => `
          <div class="cluster">
            <div><strong>${escapeHtml(c.title)}</strong> <span class="muted">(${escapeHtml(c.kind)})</span></div>
            <div>${escapeHtml(c.description)}</div>
            <div class="chips">
              <span class="chip">Importance ${c.importance}</span>
              <span class="chip">Risk ${c.risk}</span>
              <span class="chip">Confidence ${Math.round(c.confidence * 100)}%</span>
            </div>
            ${Array.isArray(c.heuristics) && c.heuristics.length ? `<div>${c.heuristics.map(h => `<span class="tag">${escapeHtml(h)}</span>`).join(' ')}</div>` : ''}
            ${Array.isArray(c.members) && c.members.length ? `<div class="muted">Members: ${c.members.map(m => {
              const it = itemsById[m.itemId];
              return it ? `${escapeHtml(it.headline)} <span class=\"muted\">(${escapeHtml(it.kind)})</span>` : escapeHtml(m.itemId);
            }).join('; ')}</div>` : ''}
            ${c.mermaid ? `<pre class="mermaid">${escapeHtml(c.mermaid)}</pre>` : ''}
          </div>
        `).join('\n')}
      </section>
      ` : ''}
    </main>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <script>
      try {
        // Initialize Mermaid if available
        if (window['mermaid']) {
          window['mermaid'].initialize({ startOnLoad: true, theme: 'default' });
        }
      } catch (e) { /* ignore */ }
    </script>
  </body>
</html>`;
  }
}

const cli = new Cli({ binaryLabel: 'Rich Diff → HTML', binaryName: 'rich-diff-html', binaryVersion: '1.0.0' });
cli.register(RichDiffHtmlCommand);
cli.runExit(process.argv.slice(2));


