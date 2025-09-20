#!/usr/bin/env -S npx -y -p tsx@^4 -p highlight.js@^11 -p clipanion@^3 tsx

import { Cli, Command, Option } from 'clipanion';
import hljs from 'highlight.js';
import { writeFile } from 'fs/promises';
import { spawn } from 'child_process';
import { resolve, basename, extname } from 'path';

type ColorMode = 'auto' | 'always' | 'never';

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

function stripAnsi(input: string): string {
  return input.replace(/\x1B\[[0-9;]*m/g, '');
}

async function runCapture(command: string, args: string[], options: { cwd?: string } = {}): Promise<{ code: number; stdout: string; stderr: string }>
{
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd: options.cwd, env: process.env });
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout.on('data', chunk => outChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    child.stderr.on('data', chunk => errChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    child.on('error', reject);
    child.on('close', code => {
      resolvePromise({ code: code ?? 1, stdout: Buffer.concat(outChunks).toString('utf8'), stderr: Buffer.concat(errChunks).toString('utf8') });
    });
  });
}

const EMPTY_TREE_OID = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

async function getFirstParent(commit: string): Promise<string | null> {
  return await new Promise((resolvePromise) => {
    const child = spawn('git', ['rev-list', '--parents', '-n', '1', commit], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', c => out += String(c));
    child.on('close', () => {
      const parts = out.trim().split(/\s+/).filter(Boolean);
      if (parts.length >= 2) resolvePromise(parts[1]); else resolvePromise(null);
    });
    child.on('error', () => resolvePromise(null));
  });
}

class GitDiffHtmlCommand extends Command {
  static paths = [["git-diff-html"], Command.Default];

  static usage = Command.Usage({
    description: 'Generate an HTML document from a Git diff (reads from STDIN or runs git diff)',
    examples: [
      ['From working tree vs HEAD', 'git-diff-html --output out/diff.html'],
      ['Only staged changes', 'git-diff-html --staged --output out/staged.html'],
      ['Between commits', 'git-diff-html --commits abc123..def456 -o out/range.html'],
      ['Pipe from existing CLI', 'git-diff | git-diff-html -o out/piped.html'],
    ],
  });

  // Diff selection options (parity with sharptools/git-diff.ts)
  commitsRange = Option.String('--commits', { description: 'Commit range like a..b (overrides positional args)', required: false });
  refA = Option.String({ required: false });
  refB = Option.String({ required: false });
  staged = Option.Boolean('--staged,--cached', false, { description: 'Show only staged changes vs HEAD' });
  nameOnly = Option.Boolean('--name-only', false, { description: 'Show only changed file names' });
  wordDiff = Option.Boolean('--word-diff', false, { description: 'Show a word diff instead of a line diff' });
  stat = Option.Boolean('--stat', false, { description: 'Generate a diffstat' });
  color = Option.String('--color', 'never' as ColorMode, { description: 'Color mode: auto | always | never (HTML renderer strips ANSI; prefer never)' });

  // HTML output options
  outputFile = Option.String('--output,-o', { description: 'Path to output HTML file (omit to write to STDOUT)', required: false });
  title = Option.String('--title', { description: 'HTML document title (default inferred or "Git Diff")', required: false });
  fragment = Option.Boolean('--fragment', false, { description: 'Output only the HTML fragment (no full HTML wrapper)' });
  highlightTheme = Option.String('--hl-theme', 'github', { description: 'highlight.js theme CSS via CDN (e.g. github, atom-one-dark)' });
  openFile = Option.Boolean('--open', false, { description: 'Open the output HTML with the default viewer' });
  quiet = Option.Boolean('--quiet,-q', false, { description: 'Suppress non-essential errors' });

  async execute(): Promise<number> {
    try {
      const outputPath = this.outputFile ? resolve(this.outputFile) : undefined;
      const title = this.title || inferTitle(outputPath) || 'Git Diff';

      const diffText = await this.getDiffText();
      const htmlFragment = this.renderDiffHtml(diffText);
      const finalHtml = this.fragment
        ? htmlFragment
        : this.wrapInHtmlDocument(htmlFragment, title, this.highlightTheme);

      if (outputPath) {
        await writeFile(outputPath, finalHtml, 'utf8');
      } else {
        this.context.stdout.write(finalHtml);
      }

      if (outputPath && this.openFile) {
        const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        runCapture(opener, [outputPath]).catch(() => {/* ignore */});
      }

      return 0;
    } catch (err: any) {
      if (!this.quiet) {
        const message = err instanceof Error ? err.message : String(err);
        this.context.stderr.write(`Error: ${message}\n`);
      }
      return 1;
    }
  }

  private async getDiffText(): Promise<string> {
    // Prefer STDIN when piped
    if (!process.stdin.isTTY) {
      const piped = await readAllFromStdin();
      return stripAnsi(piped);
    }

    const args: string[] = ['diff'];

    // Force no color to avoid ANSI in HTML; highlight.js handles styling
    if (this.color === 'always') args.push('--color=always');
    else if (this.color === 'never') args.push('--no-color');
    else args.push('--color');

    if (this.wordDiff) args.push('--word-diff');
    if (this.stat) args.push('--stat');
    if (this.nameOnly) args.push('--name-only');

    const rangeFromFlag = (this.commitsRange || '').trim();
    const havePositional = Boolean((this.refA || '').trim() || (this.refB || '').trim());
    if (rangeFromFlag) {
      if (!rangeFromFlag.includes('..')) {
        const parent = await getFirstParent(rangeFromFlag);
        if (parent) args.push(`${parent}..${rangeFromFlag}`);
        else args.push(`${EMPTY_TREE_OID}..${rangeFromFlag}`);
      } else {
        args.push(rangeFromFlag);
      }
    } else if (havePositional) {
      if (this.refA && this.refB) args.push(`${this.refA}..${this.refB}`);
      else if (this.refA) {
        const parent = await getFirstParent(this.refA);
        if (parent) args.push(`${parent}..${this.refA}`);
        else args.push(`${EMPTY_TREE_OID}..${this.refA}`);
      }
    } else if (this.staged) {
      args.push('--cached');
    }

    const { code, stdout, stderr } = await runCapture('git', args);
    if (code !== 0) {
      throw new Error(stderr || `git ${args.join(' ')} failed with code ${code}`);
    }
    return stripAnsi(stdout);
  }

  private renderDiffHtml(diff: string): string {
    // Use highlight.js to render as "diff"
    let highlighted = '';
    try {
      highlighted = hljs.highlight(diff, { language: 'diff', ignoreIllegals: true }).value;
    } catch {
      highlighted = escapeHtml(diff);
    }
    return `<pre><code class="hljs language-diff">${highlighted}</code></pre>`;
  }

  private wrapInHtmlDocument(bodyHtml: string, title: string, hlTheme: string): string {
    const highlightCssCdn = `https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/${encodeURIComponent(hlTheme)}.min.css`;

    const baseStyles = `
      body { font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; line-height: 1.6; margin: 0; padding: 0; }
      main { max-width: 1060px; margin: 2rem auto; padding: 0 1rem; }
      pre { background: #f6f8fa; padding: 1rem; overflow: auto; border-radius: 6px; }
      code { font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace; }
      h1, h2, h3, h4 { line-height: 1.25; }
      .meta { color: #666; font-size: 0.9rem; margin-bottom: 1rem; }
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
  </body>
</html>
`;
  }
}

function inferTitle(outputPath?: string): string | null {
  if (!outputPath) return null;
  const base = basename(outputPath, extname(outputPath));
  if (!base) return null;
  return base.replace(/[-_]/g, ' ').replace(/\b\w/g, s => s.toUpperCase());
}

const cli = new Cli({
  binaryLabel: 'Git Diff → HTML',
  binaryName: 'git-diff-html',
  binaryVersion: '1.0.0',
});

cli.register(GitDiffHtmlCommand);
cli.runExit(process.argv.slice(2));


