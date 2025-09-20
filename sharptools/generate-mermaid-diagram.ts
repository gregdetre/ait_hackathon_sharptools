#!/usr/bin/env -S npx -y -p tsx@^4 -p clipanion@^3 -p @anthropic-ai/sdk@^0.21 -p dotenv@^16 tsx

/**
 * Generate Mermaid Diagram via Anthropic → .mermaid + .svg
 *
 * - Accepts a natural language prompt (arg, --prompt, or STDIN)
 * - Calls Anthropic to synthesize a Mermaid diagram
 * - Writes a .mermaid file using yyMMdd[a-z]_slug.mermaid naming
 * - Renders an SVG via Mermaid CLI (mmdc)
 *
 * Requires ANTHROPIC_API_KEY in .env.local (at CWD or repo root).
 *
 * See also:
 * - docs/reference/DIAGRAMS_MERMAID_GENERATION_REFERENCE.md — conventions, naming, and rendering commands
 * - sharptools/markdown-to-html.ts — render Markdown with inline Mermaid blocks to HTML
 */

import { Cli, Command, Option } from 'clipanion';
import Anthropic from '@anthropic-ai/sdk';
import { config as dotenvConfig } from 'dotenv';
import { mkdir, readdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { basename, extname, resolve } from 'path';
import { spawn } from 'child_process';

async function readAllFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  return await new Promise<string>((resolvePromise, reject) => {
    process.stdin.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    process.stdin.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

function toSlug(input: string, maxWords = 8, maxLen = 64): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[`"'()\[\]{}<>]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const words = cleaned.split(/\s+/).slice(0, maxWords);
  let base = words.join('_');
  if (base.length > maxLen) base = base.slice(0, maxLen).replace(/_+$/g, '');
  return base || 'diagram';
}

function yymmdd(date = new Date()): string {
  const y = date.getFullYear().toString().slice(-2);
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}${m}${d}`;
}

async function nextSequentialPrefix(targetDir: string, prefixDate = yymmdd()): Promise<string> {
  let files: string[] = [];
  try {
    files = await readdir(targetDir);
  } catch (err: any) {
    if (err && err.code === 'ENOENT') {
      return `${prefixDate}a_`;
    }
    throw err;
  }
  const pattern = new RegExp(`^${prefixDate}([a-z])_`);
  const used = new Set(
    files.map(f => f.match(pattern)?.[1]).filter(Boolean) as string[]
  );
  const letter = 'abcdefghijklmnopqrstuvwxyz'.split('').find(l => !used.has(l)) || 'a';
  return `${prefixDate}${letter}_`;
}

function ensureLeadingMermaid(diagram: string): string {
  const trimmed = diagram.trim();
  // If the model returned a fenced block, extract it
  const fenceMatch = trimmed.match(/```\s*mermaid\s*([\s\S]*?)```/i) || trimmed.match(/```([\s\S]*?)```/);
  const core = fenceMatch ? fenceMatch[1].trim() : trimmed;
  return core;
}

async function run(command: string, args: string[], opts: { cwd?: string; verbose?: boolean } = {}): Promise<{ code: number }>
{
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: opts.verbose ? 'inherit' : 'ignore', cwd: opts.cwd, env: process.env });
    child.on('error', reject);
    child.on('close', code => resolvePromise({ code: code ?? 1 }));
  });
}

class GenerateMermaidDiagram extends Command {
  static paths = [["generate-mermaid-diagram"], Command.Default];

  static usage = Command.Usage({
    description: 'Generate a Mermaid diagram from a natural language prompt using Anthropic, then render SVG with mmdc',
    examples: [
      ['Prompt via flag', 'generate-mermaid-diagram --prompt "ETL pipeline from S3 to warehouse with error paths"'],
      ['Prompt via STDIN', 'echo "OAuth login flow for web + mobile" | generate-mermaid-diagram'],
      ['Custom out dir and open SVG', 'generate-mermaid-diagram -p "Kafka topics overview" --outdir docs/diagrams --open'],
    ],
  });

  prompt = Option.String('--prompt,-p', {
    description: 'Text prompt describing the desired diagram. If omitted, reads from STDIN.',
    required: false,
  });

  outDir = Option.String('--outdir', 'docs/diagrams', {
    description: 'Directory to write .mermaid and .svg files',
  });

  model = Option.String('--model', 'claude-3-5-sonnet-20240620', {
    description: 'Anthropic model ID',
  });

  width = Option.String('--width,-w', '1400', { description: 'SVG width passed to mmdc' });
  height = Option.String('--height,-H', '1600', { description: 'SVG height passed to mmdc' });
  scale = Option.String('--scale,-s', '2', { description: 'SVG scale passed to mmdc' });
  theme = Option.String('--theme,-t', 'default', { description: 'Mermaid theme passed to mmdc' });
  background = Option.String('--background,-b', 'transparent', { description: 'Background color for mmdc' });

  openSvg = Option.Boolean('--open', false, { description: 'Open the generated SVG with the default viewer' });
  verbose = Option.Boolean('--verbose,-v', false, { description: 'Verbose logs' });

  async execute(): Promise<number> {
    try {
      // Load env
      const envPath = resolve(process.cwd(), '.env.local');
      dotenvConfig({ path: envPath });
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        this.context.stderr.write('Missing ANTHROPIC_API_KEY in .env.local or environment.\n');
        return 1;
      }

      const promptText = await this.getPromptText();
      if (!promptText.trim()) {
        this.context.stderr.write('No prompt provided. Use --prompt or pipe via STDIN.\n');
        return 1;
      }

      const outDirAbs = resolve(this.outDir);
      if (!existsSync(outDirAbs)) {
        await mkdir(outDirAbs, { recursive: true });
        if (this.verbose) this.context.stdout.write(`Created directory: ${outDirAbs}\n`);
      }

      const prefix = await nextSequentialPrefix(outDirAbs);
      const slug = toSlug(promptText);
      const baseName = `${prefix}${slug}`;
      const mermaidPath = resolve(outDirAbs, `${baseName}.mermaid`);
      const svgPath = resolve(outDirAbs, `${baseName}.svg`);

      if (this.verbose) this.context.stdout.write('Contacting Anthropic...\n');
      const anthropic = new Anthropic({ apiKey });

      const system = [
        'You generate Mermaid diagram definitions only. No code fences, no extra prose.',
        'Prefer concise, readable diagrams. Use flowchart/sequence/class/state/er as appropriate.',
        'Avoid long linear chains; collapse to a single node with bullet points when applicable.',
        'Use short labels; leave detailed explanations out.',
        'Avoid special characters in labels. Use emojis sparingly. Keep spacing tight.',
      ].join(' ');

      const user = `Create a Mermaid diagram for: ${promptText}`;

      const response = await anthropic.messages.create({
        model: this.model,
        max_tokens: 2000,
        temperature: 0.2,
        system,
        messages: [
          { role: 'user', content: user },
        ],
      } as any);

      const textPart = Array.isArray((response as any).content)
        ? (response as any).content.find((c: any) => c.type === 'text')?.text
        : (response as any).content;
      const diagram = ensureLeadingMermaid(String(textPart || '').trim());

      const headerComment = [
        '%% Generated by generate-mermaid-diagram.ts',
        `%% Date: ${new Date().toISOString()}`,
        '%% Prompt:',
        ...promptText.split(/\r?\n/).map(line => `%% ${line}`),
        '%% Notes: Keep this comment in sync if the diagram is edited later.',
        '',
      ].join('\n');

      const mermaidFileContent = `${headerComment}\n${diagram}\n`;
      await writeFile(mermaidPath, mermaidFileContent, 'utf8');
      if (this.verbose) this.context.stdout.write(`Wrote Mermaid → ${mermaidPath}\n`);

      if (this.verbose) this.context.stdout.write('Rendering SVG with mmdc...\n');
      const mmdcArgs = [
        '--yes', // forwarded to npx
      ];
      // Using npx to invoke mmdc non-interactively
      const { code } = await run('npx', [
        '--yes',
        'mmdc',
        '-i', mermaidPath,
        '-o', svgPath,
        '-w', this.width,
        '-H', this.height,
        '-s', this.scale,
        '-b', this.background,
        '-t', this.theme,
      ], { verbose: this.verbose });

      if (code !== 0) {
        // Try again ensuring the package is installed in the ephemeral context
        const retry = await run('npx', [
          '--yes',
          '-p', '@mermaid-js/mermaid-cli',
          'mmdc',
          '-i', mermaidPath,
          '-o', svgPath,
          '-w', this.width,
          '-H', this.height,
          '-s', this.scale,
          '-b', this.background,
          '-t', this.theme,
        ], { verbose: this.verbose });
        if (retry.code !== 0) {
          this.context.stderr.write('Failed to render SVG with Mermaid CLI. Ensure Chrome/Chromium dependencies are available.\n');
          return 1;
        }
      }

      if (this.openSvg) {
        const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        await run(opener, [svgPath], { verbose: false }).catch(() => {/* ignore */});
      }

      this.context.stdout.write(`${mermaidPath}\n${svgPath}\n`);
      return 0;
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      this.context.stderr.write(`Error: ${message}\n`);
      return 1;
    }
  }

  private async getPromptText(): Promise<string> {
    if (this.prompt && this.prompt.trim()) return this.prompt.trim();
    if (!process.stdin.isTTY) {
      const stdin = await readAllFromStdin();
      if (stdin && stdin.trim()) return stdin.trim();
    }
    return '';
  }
}

const cli = new Cli({
  binaryLabel: 'Generate Mermaid Diagram',
  binaryName: 'generate-mermaid-diagram',
  binaryVersion: '1.0.0',
});

cli.register(GenerateMermaidDiagram);
cli.runExit(process.argv.slice(2));


