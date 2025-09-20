#!/usr/bin/env -S npx -y -p tsx@^4 -p clipanion@^3 tsx

/**
 * Diff Pipeline (timestamped)
 *
 * Runs the full diff pipeline and writes timestamped artifacts:
 *   yyMMdd_HHmmss_basic-diff.json
 *   yyMMdd_HHmmss_enrichment.json
 *   yyMMdd_HHmmss_rich-diff.json
 *   yyMMdd_HHmmss_rich-diff.html
 *
 * Flags allow skipping persistence of intermediates (default emit all).
 */

import { Cli, Command, Option } from 'clipanion';
import { spawn } from 'child_process';
import { resolve, basename } from 'path';
import { rm } from 'fs/promises';

type ColorMode = 'auto' | 'always' | 'never';

function dtStamp(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const HH = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yy}${MM}${dd}_${HH}${mm}${ss}`;
}

async function runCapture(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }>
{
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout.on('data', c => outChunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))));
    child.stderr.on('data', c => errChunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))));
    child.on('error', reject);
    child.on('close', code => resolvePromise({ code: code ?? 1, stdout: Buffer.concat(outChunks).toString('utf8'), stderr: Buffer.concat(errChunks).toString('utf8') }));
  });
}

class DiffPipelineCommand extends Command {
  static paths = [["diff:pipeline"], Command.Default];

  static usage = Command.Usage({
    description: 'Run the diff pipeline and write timestamped artifacts (with optional intermediate persistence)',
    examples: [
      ['Run and open HTML', 'diff:pipeline --open'],
      ['Only staged changes', 'diff:pipeline --staged --open'],
      ['Between commits', 'diff:pipeline --commits abc..def --open'],
      ['Skip saving intermediates', 'diff:pipeline --no-emit-basic --no-emit-enrichment --no-emit-rich --open'],
    ],
  });

  // Diff selection options
  commitsRange = Option.String('--commits', { required: false });
  refA = Option.String({ required: false });
  refB = Option.String({ required: false });
  staged = Option.Boolean('--staged,--cached', false);
  nameOnly = Option.Boolean('--name-only', false);
  wordDiff = Option.Boolean('--word-diff', false);
  stat = Option.Boolean('--stat', false);
  color = Option.String('--color', 'never' as ColorMode);
  unified = Option.String('--unified,-U', { required: false });
  contextRadiusOpt = Option.String('--context-radius', '20');
  noContext = Option.Boolean('--no-context', false);

  // Output control
  outDir = Option.String('--out-dir', 'out');
  emitBasic = Option.Boolean('--emit-basic', true);
  emitEnrichment = Option.Boolean('--emit-enrichment', true);
  emitRich = Option.Boolean('--emit-rich', true);
  emitHtml = Option.Boolean('--emit-html', true);
  openFile = Option.Boolean('--open', false);
  quiet = Option.Boolean('--quiet,-q', false);
  useLlm = Option.Boolean('--use-llm', false);
  // LLM controls (only used when --use-llm)
  model = Option.String('--model', 'claude-3-opus-20240229');
  promptVersion = Option.String('--prompt-version', 'v1-llm');
  filterByExtensions = Option.String('--filter-by-extensions', { required: false });

  async execute(): Promise<number> {
    const prefix = dtStamp();
    const outDir = resolve(this.outDir);
    const basicPath = resolve(outDir, `${prefix}_basic-diff.json`);
    const enrichPath = resolve(outDir, `${prefix}_enrichment.json`);
    const richPath = resolve(outDir, `${prefix}_rich-diff.json`);
    const htmlPath = resolve(outDir, `${prefix}_rich-diff.html`);

    try {
      // 1) Basic diff
      const basicArgs: string[] = [
        'sharptools/diff/basic-diff.ts',
        ...(this.color ? ['--color', this.color] : []),
        ...(this.wordDiff ? ['--word-diff'] : []),
        ...(this.stat ? ['--stat'] : []),
        ...(this.nameOnly ? ['--name-only'] : []),
        ...(this.unified ? ['-U', String(this.unified)] : []),
        ...(this.noContext ? ['--no-context'] : []),
        ...(this.contextRadiusOpt ? ['--context-radius', String(this.contextRadiusOpt)] : []),
        ...(this.commitsRange ? ['--commits', String(this.commitsRange)] : []),
        ...(this.refA ? [String(this.refA)] : []),
        ...(this.refB ? [String(this.refB)] : []),
        ...(this.staged ? ['--staged'] : []),
        '--output', basicPath,
      ];
      const basicRes = await runCapture('tsx', basicArgs);
      if (basicRes.code !== 0) throw new Error(basicRes.stderr || 'basic-diff failed');

      // 2) Enrichment
      const enrichArgs: string[] = [
        'sharptools/diff/ts-preenrich.ts',
        '-i', basicPath,
        '-o', enrichPath,
      ];
      const enrRes = await runCapture('tsx', enrichArgs);
      if (enrRes.code !== 0) throw new Error(enrRes.stderr || 'ts-preenrich failed');

      // 3) Rich diff (LLM or heuristic)
      const richArgs: string[] = this.useLlm
        ? [
            'sharptools/diff/rich-diff-llm.ts',
            '-i', basicPath,
            '-e', enrichPath,
            '--model', this.model,
            '--prompt-version', this.promptVersion,
            ...(this.filterByExtensions ? ['--filter-by-extensions', String(this.filterByExtensions)] : []),
            '-o', richPath,
          ]
        : [
            'sharptools/diff/rich-diff.ts',
            '-i', basicPath,
            '-e', enrichPath,
            '-o', richPath,
          ];
      const richRes = await runCapture('tsx', richArgs);
      if (richRes.code !== 0) throw new Error(richRes.stderr || 'rich-diff failed');

      // 4) HTML
      const htmlArgs: string[] = [
        'sharptools/diff/rich-diff-html.ts',
        '-i', richPath,
        '-o', htmlPath,
      ];
      const htmlRes = await runCapture('tsx', htmlArgs);
      if (htmlRes.code !== 0) throw new Error(htmlRes.stderr || 'rich-diff-html failed');

      // Optionally clean up intermediates
      const removals: string[] = [];
      if (!this.emitBasic) removals.push(basicPath);
      if (!this.emitEnrichment) removals.push(enrichPath);
      if (!this.emitRich) removals.push(richPath);
      if (!this.emitHtml) removals.push(htmlPath);
      for (const p of removals) {
        try { await rm(p, { force: true }); } catch {/* ignore */}
      }

      if (this.openFile && this.emitHtml) {
        const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        runCapture(opener, [htmlPath]).catch(() => {/* ignore */});
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
}

const cli = new Cli({ binaryLabel: 'Diff Pipeline (timestamped)', binaryName: 'diff:pipeline', binaryVersion: '1.0.0' });
cli.register(DiffPipelineCommand);
cli.runExit(process.argv.slice(2));


