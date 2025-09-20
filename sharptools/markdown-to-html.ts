#!/usr/bin/env -S npx -y -p tsx@^4 -p markdown-it@^14 -p highlight.js@^11 -p clipanion@^3 tsx

/**
 * Markdown → HTML CLI with Mermaid support (root script)
 *
 * - Parses Markdown using markdown-it
 * - Syntax highlights code blocks with highlight.js
 * - Supports Mermaid via client-side rendering (CDN script)
 * - Reads from --input file or STDIN; writes to --output or STDOUT
 *
 * See also:
 * - docs/reference/DIAGRAMS_MERMAID_GENERATION_REFERENCE.md — conventions and workflow for Mermaid diagrams
 */

import { Cli, Command, Option } from 'clipanion';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { readFile, writeFile } from 'fs/promises';
import { basename, extname, resolve } from 'path';

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function readAllFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  return await new Promise<string>((resolvePromise, reject) => {
    process.stdin.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    process.stdin.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

type MermaidMode = 'client' | 'none';

class MarkdownToHtmlCommand extends Command {
  static paths = [["markdown-to-html"], Command.Default];

  static usage = Command.Usage({
    description: 'Convert Markdown to HTML with optional Mermaid support',
    details: `
      Converts Markdown to HTML using markdown-it and highlight.js. Mermaid diagrams in
      \`mermaid\` code blocks are rendered client-side via a CDN script when enabled.
    `,
    examples: [
      ['Read file and write HTML', 'markdown-to-html --input README.md --output README.html'],
      ['Use STDIN → STDOUT', 'cat doc.md | markdown-to-html'],
      ['Output HTML fragment only', 'markdown-to-html --input notes.md --fragment'],
      ['Disable Mermaid handling', 'markdown-to-html --input spec.md --mermaid none'],
    ],
  });

  inputFile = Option.String('--input', {
    description: 'Path to Markdown file (omit to read from STDIN)',
    required: false,
  });

  outputFile = Option.String('--output', {
    description: 'Path to output HTML file (omit to write to STDOUT)',
    required: false,
  });

  title = Option.String('--title', {
    description: 'Title for the HTML document (default inferred from input filename or "Document")',
    required: false,
  });

  fragment = Option.Boolean('--fragment', false, {
    description: 'Output only the HTML fragment (no full HTML document wrapper)',
  });

  mermaid = Option.String('--mermaid', 'client' as MermaidMode, {
    description: 'Mermaid handling: client | none',
    tolerateBoolean: false,
  });

  highlightTheme = Option.String('--hl-theme', 'github', {
    description: 'highlight.js theme (CSS via CDN), e.g. github, atom-one-dark, default',
  });

  verbose = Option.Boolean('-v,--verbose', false, {
    description: 'Enable verbose output',
  });

  async execute(): Promise<number> {
    try {
      const inputPath = this.inputFile ? resolve(this.inputFile) : undefined;
      const outputPath = this.outputFile ? resolve(this.outputFile) : undefined;

      const content = this.inputFile
        ? await readFile(String(inputPath), 'utf8')
        : await readAllFromStdin();

      const inferredTitle = this.title
        || (inputPath ? basename(inputPath, extname(inputPath)) : 'Document');

      const htmlFragment = this.renderMarkdownToHtml(content, this.mermaid as MermaidMode);

      const finalHtml = this.fragment
        ? htmlFragment
        : this.wrapInHtmlDocument(htmlFragment, inferredTitle, this.highlightTheme, this.mermaid as MermaidMode);

      if (outputPath) {
        await writeFile(outputPath, finalHtml, 'utf8');
        if (this.verbose) this.context.stdout.write(`Wrote HTML → ${outputPath}\n`);
      } else {
        this.context.stdout.write(finalHtml);
      }

      return 0;
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      this.context.stderr.write(`Error: ${message}\n`);
      return 1;
    }
  }

  private renderMarkdownToHtml(markdown: string, mermaidMode: MermaidMode): string {
    const md = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
      highlight: (code: string, lang?: string) => {
        if (lang && hljs.getLanguage(lang)) {
          try {
            const highlighted = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
            return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
          } catch {/* ignore */}
        }
        return `<pre><code class="hljs">${escapeHtml(code)}</code></pre>`;
      },
    });

    const defaultFence = md.renderer.rules.fence;
    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const info = (token.info || '').trim();
      const [lang] = info.split(/\s+/, 1);
      if (lang === 'mermaid' && mermaidMode !== 'none') {
        const diagram = token.content.trim();
        return `\n<div class="mermaid">\n${escapeHtml(diagram)}\n</div>\n`;
      }
      if (defaultFence) {
        return defaultFence(tokens, idx, options, env, self);
      }
      const code = escapeHtml(tokens[idx].content);
      return `<pre><code>${code}</code></pre>`;
    };

    return md.render(markdown);
  }

  private wrapInHtmlDocument(bodyHtml: string, title: string, hlTheme: string, mermaidMode: MermaidMode): string {
    const highlightCssCdn = `https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/${encodeURIComponent(hlTheme)}.min.css`;
    const mermaidScript = mermaidMode === 'client'
      ? `\n<script type="module">\n  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';\n  mermaid.initialize({ startOnLoad: true, securityLevel: 'loose' });\n</script>\n`
      : '';

    const baseStyles = `
      body { font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; line-height: 1.6; margin: 0; padding: 0; }
      main { max-width: 860px; margin: 2rem auto; padding: 0 1rem; }
      pre { background: #f6f8fa; padding: 1rem; overflow: auto; border-radius: 6px; }
      code { font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace; }
      img, svg { max-width: 100%; }
      table { border-collapse: collapse; }
      th, td { border: 1px solid #ddd; padding: 0.5rem; }
      h1, h2, h3, h4 { line-height: 1.25; }
    `;

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="${highlightCssCdn}">
    <style>${baseStyles}</style>
  </head>
  <body>
    <main>
${bodyHtml}
    </main>
${mermaidScript}  </body>
</html>
`;
  }
}

const cli = new Cli({
  binaryLabel: 'Markdown → HTML',
  binaryName: 'markdown-to-html',
  binaryVersion: '1.0.0',
});

cli.register(MarkdownToHtmlCommand);
cli.runExit(process.argv.slice(2));


