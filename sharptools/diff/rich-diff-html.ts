#!/usr/bin/env -S npx -y -p tsx@^4 -p clipanion@^3 tsx

/**
 * Rich Diff → HTML Renderer (MVP)
 *
 * Renders a RichDiff JSON into a simple standalone HTML document with a
 * summary and a per-item table. Future work: cluster views, filters, diagrams.
 */

import { Cli, Command, Option } from 'clipanion';
import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';

interface RichDiffMeta { createdAtIso: string; }
interface RichItem { id: string; fileId: string; kind: string; headline: string; whatChanged: string; importance: number; risk: number; confidence: number }
interface RichDiffDoc { meta: RichDiffMeta; summary: { headline: string; narrative: string; totals: { filesChanged: number; additions: number; deletions: number; clusters: number } }; items: RichItem[] }

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
    const rows = doc.items.map(item => {
      return `<tr>
        <td>${escapeHtml(item.kind)}</td>
        <td>${escapeHtml(item.headline)}</td>
        <td>${escapeHtml(item.whatChanged)}</td>
        <td>${item.importance}</td>
        <td>${item.risk}</td>
        <td>${Math.round(item.confidence * 100)}%</td>
      </tr>`;
    }).join('\n');

    const styles = `
      body { font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; line-height: 1.6; margin: 0; }
      main { max-width: 1060px; margin: 2rem auto; padding: 0 1rem; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border-bottom: 1px solid #e5e7eb; padding: 8px 6px; text-align: left; }
      th { background: #f8fafc; position: sticky; top: 0; }
      h1, h2 { margin: 0.2rem 0 0.6rem; }
      .muted { color: #6b7280; font-size: 0.9rem; }
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
        <p class="muted">Total files changed: ${doc.summary.totals.filesChanged}, +${doc.summary.totals.additions}/-${doc.summary.totals.deletions}</p>
        <p>${escapeHtml(doc.summary.narrative || '')}</p>
      </header>
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
            </tr>
          </thead>
          <tbody>
${rows}
          </tbody>
        </table>
      </section>
    </main>
  </body>
</html>`;
  }
}

const cli = new Cli({ binaryLabel: 'Rich Diff → HTML', binaryName: 'rich-diff-html', binaryVersion: '1.0.0' });
cli.register(RichDiffHtmlCommand);
cli.runExit(process.argv.slice(2));


