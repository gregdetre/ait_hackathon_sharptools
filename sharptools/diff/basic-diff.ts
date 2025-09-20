#!/usr/bin/env -S npx -y -p tsx@^4 -p clipanion@^3 tsx

/**
 * Basic Diff Generator (Clipanion CLI)
 *
 * - Runs `git diff` (or reads from STDIN) and parses the unified diff
 * - Produces a deterministic BasicDiff JSON structure suitable for rich rendering
 * - IDs are stable and URL-safe (short base64url of SHA-1)
 */

import { Cli, Command, Option } from 'clipanion';
import { spawn } from 'child_process';
import { writeFile, readFile } from 'fs/promises';
import { basename, extname, resolve } from 'path';
import { createHash } from 'crypto';

export type {
  BasicDiff,
  FileDiff,
  FileStatus,
  Hunk,
  HunkLine,
  ColorMode,
} from '../claude-conversation-exporter/types/diff-schemas';

// ------------------------------
// Utilities
// ------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function stableHash(input: string): string {
  const hex = createHash('sha1').update(input).digest('base64url');
  return hex.slice(0, 12);
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

async function readAllFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  return await new Promise<string>((resolvePromise, reject) => {
    process.stdin.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    process.stdin.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

function languageFromPath(path?: string): string | undefined {
  if (!path) return undefined;
  const ext = extname(path).replace(/^\./, '').toLowerCase();
  if (!ext) return undefined;
  return ext;
}

function inferStatus(context: {
  sawRenameFrom: boolean;
  sawCopyFrom: boolean;
  oldPath?: string;
  newPath?: string;
}): FileStatus {
  if (context.sawRenameFrom) return 'renamed';
  if (context.sawCopyFrom) return 'copied';
  if (context.oldPath === '/dev/null') return 'added';
  if (context.newPath === '/dev/null') return 'deleted';
  return 'modified';
}

// ------------------------------
// Unified Diff Parser (minimal but robust)
// ------------------------------

interface ParseOptions {
  fileIdSeed?: string;
}

export function parseUnifiedDiff(diffText: string, options: ParseOptions = {}): { files: FileDiff[]; totals: { filesChanged: number; additions: number; deletions: number; hunks: number; binaryFilesChanged: number }; warnings: string[] }
{
  const lines = diffText.replace(/\r\n/g, '\n').split('\n');
  const files: FileDiff[] = [];
  const warnings: string[] = [];

  let current: {
    headerLines: string[];
    rawLines: string[];
    hunks: Hunk[];
    additions: number;
    deletions: number;
    pathOld?: string;
    pathNew?: string;
    modeBefore?: string;
    modeAfter?: string;
    isBinary: boolean;
    sawRenameFrom: boolean;
    sawCopyFrom: boolean;
    similarityIndex?: number;
    oldOid?: string;
    newOid?: string;
  } | null = null;

  function finalizeCurrent() {
    if (!current) return;
    const status = inferStatus({
      sawRenameFrom: current.sawRenameFrom,
      sawCopyFrom: current.sawCopyFrom,
      oldPath: current.pathOld,
      newPath: current.pathNew,
    });
    const fileId = stableHash([
      options.fileIdSeed ?? '',
      current.pathOld ?? '',
      current.pathNew ?? '',
      status,
      current.modeBefore ?? '',
      current.modeAfter ?? '',
    ].join('|'));
    const file: FileDiff = {
      id: fileId,
      pathOld: current.pathOld,
      pathNew: current.pathNew,
      status,
      isBinary: current.isBinary,
      language: languageFromPath(current.pathNew || current.pathOld),
      similarityIndex: current.similarityIndex,
      modeBefore: current.modeBefore,
      modeAfter: current.modeAfter,
      stats: { additions: current.additions, deletions: current.deletions, hunks: current.hunks.length },
      hunks: current.hunks,
      rawPatch: current.rawLines.join('\n'),
      attachments: (current.oldOid || current.newOid) ? { blobs: { before: current.oldOid ? { oid: current.oldOid } : undefined, after: current.newOid ? { oid: current.newOid } : undefined } } : undefined,
    };
    files.push(file);
    current = null;
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Start of a new file diff block
    if (line.startsWith('diff --git ')) {
      finalizeCurrent();
      current = {
        headerLines: [line],
        rawLines: [line],
        hunks: [],
        additions: 0,
        deletions: 0,
        isBinary: false,
        sawRenameFrom: false,
        sawCopyFrom: false,
      };
      i++;
      continue;
    }

    if (!current) {
      // Skip prelude lines (e.g., Git version headers)
      i++;
      continue;
    }

    current.rawLines.push(line);

    // File metadata lines
    if (line.startsWith('index ')) {
      // example: index abc123..def456 100644
      const m = line.match(/^index\s+([0-9a-fA-F]+)\.\.([0-9a-fA-F]+)(?:\s+([0-7]{6}))?/);
      if (m) {
        current.oldOid = m[1];
        current.newOid = m[2];
        if (m[3]) current.modeAfter = m[3];
      } else {
        const modeMatch = line.match(/\s([0-7]{6})$/);
        if (modeMatch) current.modeAfter = modeMatch[1];
      }
      i++;
      continue;
    }
    if (line.startsWith('old mode ')) {
      current.modeBefore = line.substring('old mode '.length).trim();
      i++;
      continue;
    }
    if (line.startsWith('new mode ')) {
      current.modeAfter = line.substring('new mode '.length).trim();
      i++;
      continue;
    }
    if (line.startsWith('similarity index ')) {
      const m = line.match(/similarity index\s+(\d+)%/);
      if (m) current.similarityIndex = parseInt(m[1], 10);
      i++;
      continue;
    }
    if (line.startsWith('rename from ')) {
      current.sawRenameFrom = true;
      current.pathOld = line.substring('rename from '.length).trim();
      i++;
      continue;
    }
    if (line.startsWith('rename to ')) {
      current.pathNew = line.substring('rename to '.length).trim();
      i++;
      continue;
    }
    if (line.startsWith('copy from ')) {
      current.sawCopyFrom = true;
      current.pathOld = line.substring('copy from '.length).trim();
      i++;
      continue;
    }
    if (line.startsWith('copy to ')) {
      current.pathNew = line.substring('copy to '.length).trim();
      i++;
      continue;
    }
    if (line.startsWith('--- ')) {
      current.pathOld = line.substring(4).trim();
      i++;
      continue;
    }
    if (line.startsWith('+++ ')) {
      current.pathNew = line.substring(4).trim();
      i++;
      continue;
    }
    if (line.startsWith('Binary files ') || line === 'GIT binary patch') {
      current.isBinary = true;
      i++;
      continue;
    }

    // Hunk header
    const hunkHeader = line.match(/^@@\s+-([0-9]+)(?:,([0-9]+))?\s+\+([0-9]+)(?:,([0-9]+))?\s+@@(.*)$/);
    if (hunkHeader) {
      const oldStart = parseInt(hunkHeader[1], 10);
      const oldLines = hunkHeader[2] ? parseInt(hunkHeader[2], 10) : 1;
      const newStart = parseInt(hunkHeader[3], 10);
      const newLines = hunkHeader[4] ? parseInt(hunkHeader[4], 10) : 1;
      const sectionHeading = (hunkHeader[5] || '').trim() || undefined;
      const hunkIndex = current.hunks.length;

      const fileIdSeed = [current.pathOld ?? '', current.pathNew ?? '', hunkIndex].join('|');
      const hunkId = stableHash([fileIdSeed, oldStart, oldLines, newStart, newLines, sectionHeading ?? '', hunkIndex].join('|'));

      const hunk: Hunk = {
        id: hunkId,
        oldStart,
        oldLines,
        newStart,
        newLines,
        sectionHeading,
        lines: [],
        rawHeader: line,
      };
      current.hunks.push(hunk);

      // Parse hunk lines until next hunk or file boundary
      let oldNum = oldStart;
      let newNum = newStart;
      i++;
      while (i < lines.length) {
        const l = lines[i];
        if (l.startsWith('diff --git ')) break;
        if (l.startsWith('@@ ')) break;
        if (l.startsWith('index ') || l.startsWith('Binary files ') || l.startsWith('GIT binary patch')) {
          // let outer loop handle these
          break;
        }

        // Handle "\\ No newline at end of file"
        if (l === '\\ No newline at end of file') {
          const last = hunk.lines[hunk.lines.length - 1];
          if (last) last.noNewlineAtEndOfFile = true;
          i++;
          continue;
        }

        const prefix = l[0];
        const text = l.length > 0 ? l.substring(1) : '';
        let op: HunkLine['op'];
        let oldNumber: number | null | undefined = null;
        let newNumber: number | null | undefined = null;

        if (prefix === ' ') {
          op = 'context';
          oldNumber = oldNum++;
          newNumber = newNum++;
        } else if (prefix === '+') {
          op = 'add';
          newNumber = newNum++;
          current.additions += 1;
        } else if (prefix === '-') {
          op = 'del';
          oldNumber = oldNum++;
          current.deletions += 1;
        } else {
          // Unexpected line in hunk – treat as context to avoid parser abort
          op = 'context';
        }

        const lineId = String(hunk.lines.length + 1);
        const entry: HunkLine = {
          id: lineId,
          op,
          text,
          oldNumber: oldNumber ?? null,
          newNumber: newNumber ?? null,
        };
        hunk.lines.push(entry);
        i++;
      }
      continue;
    }

    // End-of-file chunk handling: just advance
    i++;
  }

  finalizeCurrent();

  // Totals
  let additions = 0;
  let deletions = 0;
  let hunks = 0;
  let binaries = 0;
  for (const f of files) {
    additions += f.stats.additions;
    deletions += f.stats.deletions;
    hunks += f.hunks.length;
    if (f.isBinary) binaries += 1;
  }

  return {
    files,
    totals: { filesChanged: files.length, additions, deletions, hunks, binaryFilesChanged: binaries },
    warnings,
  };
}

function stripABPrefix(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (path === '/dev/null') return undefined;
  if (path.startsWith('a/')) return path.slice(2);
  if (path.startsWith('b/')) return path.slice(2);
  return path;
}

async function readBlob(oid: string): Promise<string> {
  const { code, stdout, stderr } = await runCapture('git', ['show', oid]);
  if (code !== 0) throw new Error(stderr || `git show ${oid} failed (${code})`);
  return stdout.replace(/\r\n/g, '\n');
}

async function readFileAtRef(ref: string, relPath: string): Promise<string> {
  const spec = `${ref}:${relPath}`;
  const { code, stdout, stderr } = await runCapture('git', ['show', spec]);
  if (code !== 0) throw new Error(stderr || `git show ${spec} failed (${code})`);
  return stdout.replace(/\r\n/g, '\n');
}

async function readFromWorkingTree(relPath: string): Promise<string> {
  const full = resolve(process.cwd(), relPath);
  const buf = await readFile(full);
  return buf.toString('utf8').replace(/\r\n/g, '\n');
}

function sliceContextLines(content: string | undefined, startLine: number, numLines: number, radius: number): string[] | undefined {
  if (content == null) return undefined;
  const all = content.split('\n');
  const startIdx = Math.max(0, (startLine - 1) - radius);
  const endIdx = Math.min(all.length, (startLine - 1) + numLines + radius);
  const slice = all.slice(startIdx, endIdx);
  return slice;
}

async function enrichHunksWithContext(files: FileDiff[], radius: number, refs: { baseRef?: string; headRef?: string }): Promise<void> {
  for (const file of files) {
    if (file.isBinary) continue;
    const oldRel = stripABPrefix(file.pathOld);
    const newRel = stripABPrefix(file.pathNew);

    let beforeContent: string | undefined;
    let afterContent: string | undefined;

    try {
      const beforeOid = file.attachments?.blobs?.before?.oid;
      const afterOid = file.attachments?.blobs?.after?.oid;
      if (beforeOid) beforeContent = await readBlob(beforeOid);
      if (afterOid) afterContent = await readBlob(afterOid);
    } catch {
      // ignore and fall through
    }

    if (!beforeContent && refs.baseRef && oldRel) {
      try { beforeContent = await readFileAtRef(refs.baseRef, oldRel); } catch { /* ignore */ }
    }
    if (!afterContent && refs.headRef && newRel) {
      try { afterContent = await readFileAtRef(refs.headRef, newRel); } catch { /* ignore */ }
    }
    if (!afterContent && newRel) {
      try { afterContent = await readFromWorkingTree(newRel); } catch { /* ignore */ }
    }

    for (const hunk of file.hunks) {
      const before = sliceContextLines(beforeContent, hunk.oldStart, hunk.oldLines, radius);
      const after = sliceContextLines(afterContent, hunk.newStart, hunk.newLines, radius);
      if (before || after) {
        hunk.attachments = {
          ...(hunk.attachments || {}),
          context: { radius, before, after },
        };
      }
    }
  }
}

// ------------------------------
// CLI
// ------------------------------

class BasicDiffCommand extends Command {
  static paths = [["diff:json"], Command.Default];

  static usage = Command.Usage({
    description: 'Generate BasicDiff JSON from a Git diff (reads from STDIN or runs git diff)',
    examples: [
      ['Working tree vs HEAD → out/basic-diff.json', 'basic-diff --output out/basic-diff.json'],
      ['Between commits', 'basic-diff --commits abc123..def456 -o out/range.json'],
      ['Only staged changes', 'basic-diff --staged -o out/staged.json'],
      ['Pipe from another CLI', 'git diff | basic-diff -o out/piped.json'],
    ],
  });

  // Diff selection options (parity with other CLIs)
  commitsRange = Option.String('--commits', { description: 'Commit range like a..b (overrides positional args)', required: false });
  refA = Option.String({ required: false });
  refB = Option.String({ required: false });
  staged = Option.Boolean('--staged,--cached', false, { description: 'Show only staged changes vs HEAD' });
  nameOnly = Option.Boolean('--name-only', false, { description: 'Show only changed file names' });
  wordDiff = Option.Boolean('--word-diff', false, { description: 'Show a word diff instead of a line diff (not parsed for intra-line)' });
  stat = Option.Boolean('--stat', false, { description: 'Generate a diffstat' });
  color = Option.String('--color', 'never' as ColorMode, { description: 'Color mode: auto | always | never (JSON parser strips ANSI; prefer never)' });
  unified = Option.String('--unified,-U', { description: 'Number of context lines (e.g., -U3). If omitted, use git default.', required: false });
  contextRadiusOpt = Option.String('--context-radius', '20', { description: 'Context radius lines to attach around hunks (0 to disable)' });
  noContext = Option.Boolean('--no-context', false, { description: 'Disable code context attachment to hunks' });

  // Output options
  outputFile = Option.String('--output,-o', { description: 'Path to output JSON file (omit to write to STDOUT)', required: false });
  quiet = Option.Boolean('--quiet,-q', false, { description: 'Suppress non-essential errors' });

  async execute(): Promise<number> {
    try {
      const diffText = await this.getDiffText();
      const { files, totals, warnings } = parseUnifiedDiff(diffText);

      const basic: BasicDiff = {
        meta: {
          createdAtIso: nowIso(),
          tool: { name: 'git-diff.ts', version: '1.0.0' },
          cwd: process.cwd(),
          git: {
            baseRef: this.refA || undefined,
            headRef: this.refB || undefined,
            rangeArg: this.commitsRange || undefined,
            staged: this.staged,
            args: this.buildGitArgs(),
            colorMode: this.color as ColorMode,
            wordDiff: this.wordDiff,
            nameOnly: this.nameOnly,
            stat: this.stat,
            unifiedContext: this.unified ? parseInt(this.unified, 10) : undefined,
          },
        },
        totals,
        files,
        warnings: warnings.length ? warnings : undefined,
      };

      const radius = Math.max(0, parseInt(this.contextRadiusOpt || '20', 10) || 0);
      if (!this.noContext && radius > 0) {
        await enrichHunksWithContext(basic.files, radius, { baseRef: basic.meta.git.baseRef, headRef: basic.meta.git.headRef });
      }

      const json = JSON.stringify(basic, null, 2);
      if (this.outputFile) {
        const outPath = resolve(this.outputFile);
        await writeFile(outPath, json, 'utf8');
      } else {
        this.context.stdout.write(json + '\n');
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

  private buildGitArgs(): string[] {
    const args: string[] = ['diff'];

    // Color handling
    if (this.color === 'always') args.push('--color=always');
    else if (this.color === 'never') args.push('--no-color');
    else args.push('--color');

    if (this.wordDiff) args.push('--word-diff');
    if (this.stat) args.push('--stat');
    if (this.nameOnly) args.push('--name-only');
    if (this.unified) args.push(`-U${this.unified}`);

    const rangeFromFlag = (this.commitsRange || '').trim();
    const havePositional = Boolean((this.refA || '').trim() || (this.refB || '').trim());
    if (rangeFromFlag) {
      args.push(rangeFromFlag);
    } else if (havePositional) {
      if (this.refA && this.refB) args.push(`${this.refA}..${this.refB}`);
      else if (this.refA) args.push(this.refA);
    } else if (this.staged) {
      args.push('--cached');
    }
    return args;
  }

  private async getDiffText(): Promise<string> {
    // Prefer STDIN when piped
    if (!process.stdin.isTTY) {
      const piped = await readAllFromStdin();
      return stripAnsi(piped);
    }
    const args = this.buildGitArgs();
    const { code, stdout, stderr } = await runCapture('git', args);
    if (code !== 0) {
      throw new Error(stderr || `git ${args.join(' ')} failed with code ${code}`);
    }
    return stripAnsi(stdout);
  }
}

const cli = new Cli({
  binaryLabel: 'Basic Diff (JSON)',
  binaryName: 'basic-diff',
  binaryVersion: '1.0.0',
});

cli.register(BasicDiffCommand);
cli.runExit(process.argv.slice(2));


