#!/usr/bin/env -S npx -y -p tsx@^4 -p clipanion@^3 tsx

/**
 * TypeScript Pre-enrichment (Deterministic)
 *
 * Reads a BasicDiff JSON, fetches before/after file contents for TS/TSX files,
 * extracts shallow symbols/exports via regex (Tree-sitter optional in future),
 * computes simple churn metrics, and tags files by layer via path heuristics.
 *
 * Output: JSON bundle keyed by fileId and hunkId.
 */

import { Cli, Command, Option } from 'clipanion';
import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { spawn } from 'child_process';
import type { BasicDiff, FileDiff } from '../claude-conversation-exporter/types/diff-schemas';

type Layer = 'frontend' | 'backend' | 'tests' | 'docs' | 'unknown';

interface FileEnrichment {
  fileId: string;
  layer: Layer;
  symbols?: string[];
  exports?: string[];
  churn: { additions: number; deletions: number; hunks: number };
}

interface HunkEnrichment {
  fileId: string;
  hunkId: string;
  symbolsNearChange?: string[];
}

interface EnrichmentBundle {
  createdAtIso: string;
  source: { basicDiffFile?: string };
  files: Record<string, FileEnrichment>;
  hunks: Record<string, HunkEnrichment>;
}

function nowIso(): string { return new Date().toISOString(); }

async function runCapture(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }>
{
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout.on('data', c => outChunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))));
    child.stderr.on('data', c => errChunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))));
    child.on('error', reject);
    child.on('close', code => resolvePromise({ code: code ?? 1, stdout: Buffer.concat(outChunks).toString('utf8'), stderr: Buffer.concat(errChunks).toString('utf8') }));
  });
}

async function readBlob(oid: string): Promise<string> {
  const { code, stdout, stderr } = await runCapture('git', ['show', oid]);
  if (code !== 0) throw new Error(stderr || `git show ${oid} failed (${code})`);
  return stdout.replace(/\r\n/g, '\n');
}

function stripABPrefix(path?: string): string | undefined {
  if (!path) return undefined;
  if (path === '/dev/null') return undefined;
  if (path.startsWith('a/')) return path.slice(2);
  if (path.startsWith('b/')) return path.slice(2);
  return path;
}

function detectLayer(p: string | undefined): Layer {
  if (!p) return 'unknown';
  const path = p.toLowerCase();
  if (path.includes('/test') || path.includes('tests/')) return 'tests';
  if (path.includes('/docs/') || path.endsWith('.md')) return 'docs';
  if (path.includes('app/') || path.includes('src/components/') || path.endsWith('.tsx')) return 'frontend';
  if (path.includes('sharptools/') || path.includes('server') || path.includes('api')) return 'backend';
  return 'unknown';
}

function extractSymbolsAndExports(content: string): { symbols: string[]; exports: string[] } {
  const symbols = new Set<string>();
  const exports = new Set<string>();
  const lines = content.split('\n');

  const symbolPatterns: RegExp[] = [
    /function\s+([A-Za-z_$][\w$]*)\s*\(/,
    /class\s+([A-Za-z_$][\w$]*)\s*[\{\n]/,
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*/,
    /let\s+([A-Za-z_$][\w$]*)\s*=\s*/,
    /var\s+([A-Za-z_$][\w$]*)\s*=\s*/,
  ];
  const exportPatterns: RegExp[] = [
    /export\s+(?:default\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/,
    /export\s+class\s+([A-Za-z_$][\w$]*)\s*[\{\n]/,
    /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/,
    /export\s*\{\s*([^}]+)\s*\}/, // named exports list
  ];

  for (const l of lines) {
    for (const r of symbolPatterns) {
      const m = l.match(r);
      if (m && m[1]) symbols.add(m[1]);
    }
    for (const r of exportPatterns) {
      const m = l.match(r);
      if (m) {
        if (r.source.includes('{')) {
          const parts = (m[1] || '').split(',').map(s => s.trim()).filter(Boolean);
          for (const p of parts) exports.add(p.replace(/\s+as\s+.+$/, ''));
        } else if (m[1]) exports.add(m[1]);
      }
    }
  }
  return { symbols: Array.from(symbols), exports: Array.from(exports) };
}

async function loadContent(file: FileDiff): Promise<{ before?: string; after?: string }> {
  const beforeOid = file.attachments?.blobs?.before?.oid;
  const afterOid = file.attachments?.blobs?.after?.oid;
  const result: { before?: string; after?: string } = {};
  if (beforeOid) { try { result.before = await readBlob(beforeOid); } catch { /* ignore */ } }
  if (afterOid) { try { result.after = await readBlob(afterOid); } catch { /* ignore */ } }
  return result;
}

class TsPreEnrichCommand extends Command {
  static paths = [["ts-preenrich"], Command.Default];

  static usage = Command.Usage({
    description: 'Compute deterministic TS enrichment bundle from a BasicDiff JSON',
    examples: [
      ['Generate bundle', 'ts-preenrich -i out/basic-diff.json -o out/enrichment.json'],
    ],
  });

  inputFile = Option.String('--input,-i', { required: true, description: 'Path to BasicDiff JSON file' });
  outputFile = Option.String('--output,-o', { required: true, description: 'Path to output enrichment JSON' });
  quiet = Option.Boolean('--quiet,-q', false, { description: 'Suppress non-essential errors' });

  async execute(): Promise<number> {
    try {
      const basicPath = resolve(this.inputFile);
      const basic: BasicDiff = JSON.parse(await readFile(basicPath, 'utf8'));
      const bundle: EnrichmentBundle = { createdAtIso: nowIso(), source: { basicDiffFile: basicPath }, files: {}, hunks: {} };

      for (const f of basic.files) {
        const isTs = (f.language === 'ts' || f.language === 'tsx');
        const layer = detectLayer(f.pathNew || f.pathOld);
        let symbols: string[] = [];
        let exportsArr: string[] = [];

        if (isTs && !f.isBinary) {
          try {
            const { before, after } = await loadContent(f);
            const target = after || before || '';
            const res = extractSymbolsAndExports(target);
            symbols = res.symbols;
            exportsArr = res.exports;
          } catch {/* ignore */}
        }

        bundle.files[f.id] = {
          fileId: f.id,
          layer,
          symbols: symbols.length ? symbols : undefined,
          exports: exportsArr.length ? exportsArr : undefined,
          churn: { additions: f.stats.additions, deletions: f.stats.deletions, hunks: f.stats.hunks },
        };

        for (const h of f.hunks) {
          const key = `${f.id}|${h.id}`;
          bundle.hunks[key] = {
            fileId: f.id,
            hunkId: h.id,
            symbolsNearChange: symbols.length ? symbols.slice(0, 12) : undefined,
          };
        }
      }

      await writeFile(resolve(this.outputFile), JSON.stringify(bundle, null, 2), 'utf8');
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

const cli = new Cli({ binaryLabel: 'TS Pre-enrichment', binaryName: 'ts-preenrich', binaryVersion: '1.0.0' });
cli.register(TsPreEnrichCommand);
cli.runExit(process.argv.slice(2));


