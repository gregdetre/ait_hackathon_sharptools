import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

function runCapture(command: string, args: string[], options: { cwd?: string } = {}): Promise<{ code: number; stdout: string; stderr: string }>
{
  return new Promise((resolvePromise, reject) => {
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

function runCaptureWithInput(command: string, args: string[], input: string, options: { cwd?: string } = {}): Promise<{ code: number; stdout: string; stderr: string }>
{
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], cwd: options.cwd, env: process.env });
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout.on('data', chunk => outChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    child.stderr.on('data', chunk => errChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    child.on('error', reject);
    child.on('close', code => {
      resolvePromise({ code: code ?? 1, stdout: Buffer.concat(outChunks).toString('utf8'), stderr: Buffer.concat(errChunks).toString('utf8') });
    });
    child.stdin.end(Buffer.from(input, 'utf8'));
  });
}

type LineOp = 'context' | 'add' | 'del';
interface HunkLine { id: string; op: LineOp; text: string; noNewlineAtEndOfFile?: boolean }
interface Hunk { rawHeader?: string; oldStart: number; oldLines: number; newStart: number; newLines: number; lines: HunkLine[] }
interface BasicDiffFile { rawPatch?: string; hunks: Hunk[] }
interface BasicDiff { files: BasicDiffFile[] }

async function generateBasicDiffJsonFromRaw(rawText: string): Promise<BasicDiff> {
  const args: string[] = [ 'tsx', 'sharptools/diff/basic-diff.ts' ];
  const { code, stdout, stderr } = await runCaptureWithInput('npx', args, rawText);
  if (code !== 0) throw new Error(stderr || `basic-diff failed with code ${code}`);
  const json = stdout.trim();
  return JSON.parse(json) as BasicDiff;
}

async function readCanonicalRawDiff(): Promise<string> {
  const full = resolve(process.cwd(), 'out', 'raw_git_diff_e8f3a986..txt');
  const content = await readFile(full, 'utf8');
  return content.replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n';
}

type HunkToken = { type: 'header'; header: string } | { type: 'line'; op: LineOp; text: string; noNewline?: boolean };

function tokenizeRawDiffHunks(raw: string): HunkToken[] {
  const tokens: HunkToken[] = [];
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('@@ ')) {
      tokens.push({ type: 'header', header: line });
      i++;
      continue;
    }
    if (line.length > 0) {
      const c0 = line[0];
      if (c0 === ' ' || c0 === '+' || c0 === '-') {
        if (line.startsWith('--- ') || line.startsWith('+++ ')) { i++; continue; }
        const text = line.slice(1);
        let noNewline = false;
        if (i + 1 < lines.length && lines[i + 1] === '\\ No newline at end of file') {
          noNewline = true;
        }
        const op: LineOp = c0 === ' ' ? 'context' : (c0 === '+' ? 'add' : 'del');
        tokens.push({ type: 'line', op, text, noNewline });
        i++;
        if (noNewline) { i++; continue; }
        continue;
      }
      if (line === '\\ No newline at end of file') { i++; continue; }
    }
    i++;
  }
  return tokens;
}

function tokenizeBasicHunks(basic: BasicDiff): HunkToken[] {
  const tokens: HunkToken[] = [];
  for (const file of basic.files) {
    for (const hunk of file.hunks) {
      if (hunk.rawHeader) tokens.push({ type: 'header', header: hunk.rawHeader });
      else {
        const oldSeg = `${hunk.oldStart}${hunk.oldLines ? ',' + hunk.oldLines : ''}`;
        const newSeg = `${hunk.newStart}${hunk.newLines ? ',' + hunk.newLines : ''}`;
        tokens.push({ type: 'header', header: `@@ -${oldSeg} +${newSeg} @@` });
      }
      for (const line of hunk.lines) {
        tokens.push({ type: 'line', op: line.op, text: line.text, noNewline: line.noNewlineAtEndOfFile });
      }
    }
  }
  return tokens;
}

async function getGitRawDiffForCommit(commit: string): Promise<string> {
  // Use the same commit expansion as the CLI: parent..commit (or empty-tree..commit for roots)
  // Ask git for the raw diff text with no ANSI/color.
  // We do not specify -U to let Git use its default context, aligning with the CLI default.
  const parentRes = await runCapture('git', ['rev-list', '--parents', '-n', '1', commit]);
  const parts = parentRes.stdout.trim().split(/\s+/).filter(Boolean);
  const parent = parts.length >= 2 ? parts[1] : null;
  const range = parent ? `${parent}..${commit}` : `4b825dc642cb6eb9a060e54bf8d69288fbee4904..${commit}`;
  const { code, stdout, stderr } = await runCapture('git', ['diff', '--no-color', range]);
  if (code !== 0) throw new Error(stderr || `git diff failed`);
  let text = stdout.replace(/\r\n/g, '\n');
  // Ensure trailing newline
  if (!text.endsWith('\n')) text += '\n';
  return text;
}

async function main() {
  const commit = 'e8f3a986c86fbe7d75faf00c6ad149182f74581c';

  // Read canonical raw diff (fixture)
  let canonical: string;
  try {
    canonical = await readCanonicalRawDiff();
  } catch {
    // Fallback to live git diff if the fixture is missing
    canonical = await getGitRawDiffForCommit(commit);
  }

  // Generate BasicDiff JSON by piping the raw diff into the CLI (stdin)
  const basic = await generateBasicDiffJsonFromRaw(canonical);
  const tokensBasic = tokenizeBasicHunks(basic);
  const tokensCanon = tokenizeRawDiffHunks(canonical);

  // Tolerate trailing empty context tokens produced by parser on blank lines after hunks
  while (tokensBasic.length && tokensBasic[tokensBasic.length - 1].type === 'line') {
    const t = tokensBasic[tokensBasic.length - 1] as any;
    if (t.op === 'context' && (!t.text || t.text.length === 0)) {
      tokensBasic.pop();
      continue;
    }
    break;
  }

  // Compare token streams 1:1; if different lengths, locate first mismatch before failing
  const compareLen = Math.min(tokensBasic.length, tokensCanon.length);
  let mismatchIndex = -1;
  for (let i = 0; i < compareLen; i++) {
    const a = tokensBasic[i];
    const b = tokensCanon[i];
    if (a.type !== b.type) throw new Error(`Token[${i}] type mismatch: ${a.type} vs ${b.type}`);
    if (a.type === 'header' && b.type === 'header') {
      if (a.header !== b.header) throw new Error(`Header mismatch at token[${i}]:\nA: ${a.header}\nB: ${b.header}`);
    } else if (a.type === 'line' && b.type === 'line') {
      if (a.op !== b.op || a.text !== b.text) {
        throw new Error(`Line mismatch at token[${i}]:\nA: ${a.op} ${JSON.stringify(a.text)}\nB: ${b.op} ${JSON.stringify(b.text)}`);
      }
      const aNN = Boolean(a.noNewline);
      const bNN = Boolean(b.noNewline);
      if (aNN !== bNN) throw new Error(`noNewline flag mismatch at token[${i}]: ${aNN} vs ${bNN}`);
    }
    if (i === compareLen - 1 && tokensBasic.length !== tokensCanon.length) mismatchIndex = i + 1;
  }
  if (tokensBasic.length !== tokensCanon.length) {
    const tailA = tokensBasic.slice(-5).map(t => t.type === 'header' ? `H:${t.header}` : `L:${t.op}:${t.text.length}`);
    const tailB = tokensCanon.slice(-5).map(t => t.type === 'header' ? `H:${t.header}` : `L:${t.op}:${t.text.length}`);
    throw new Error(`Token count mismatch: basic=${tokensBasic.length} canonical=${tokensCanon.length} (diverged at index ${mismatchIndex})\nA.tail=${JSON.stringify(tailA)}\nB.tail=${JSON.stringify(tailB)}`);
  }
}

// Execute and surface non-zero exit for CI-like usage
main().catch(err => {
  console.error(String(err && err.stack) || String(err));
  process.exit(1);
});


