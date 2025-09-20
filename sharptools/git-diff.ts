#!/usr/bin/env -S npx -y -p tsx@^4 -p clipanion@^3 tsx

/**
 * Git Diff CLI (Clipanion)
 *
 * Prints a Git diff:
 * - Default: changes since last commit (working tree vs HEAD)
 * - Optional: diff between two commits (or refs) via `--commits <a>..<b>` or positional args
 *
 * Examples:
 *   git-diff                 # show unstaged+staged vs HEAD
 *   git-diff --staged        # show only staged changes vs HEAD
 *   git-diff --cached        # alias of --staged
 *   git-diff --commits abc123..def456
 *   git-diff abc123 def456
 *   git-diff --name-only
 *   git-diff --color=always
 */

import { Cli, Command, Option } from 'clipanion';
import { spawn } from 'child_process';

type ColorMode = 'auto' | 'always' | 'never';

async function run(command: string, args: string[], options: { cwd?: string; inherit?: boolean } = {}): Promise<{ code: number }>
{
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: options.inherit ? 'inherit' : 'pipe',
      cwd: options.cwd,
      env: process.env,
    });
    child.on('error', reject);
    child.on('close', code => resolvePromise({ code: code ?? 1 }));
  });
}

class GitDiffCommand extends Command {
  static paths = [["git-diff"], Command.Default];

  static usage = Command.Usage({
    description: 'Print Git diffs: working tree vs HEAD or between two commits/refs',
    examples: [
      ['Working tree vs HEAD', 'git-diff'],
      ['Only staged changes vs HEAD', 'git-diff --staged'],
      ['Between commits', 'git-diff --commits abc123..def456'],
      ['Between positional refs', 'git-diff abc123 def456'],
      ['Names only', 'git-diff --name-only'],
      ['Force color', 'git-diff --color=always'],
    ],
  });

  // Either provide a single "a..b" via --commits, or two positional refs
  commitsRange = Option.String('--commits', {
    description: 'Commit range like a..b (overrides positional args)',
    required: false,
  });

  refA = Option.String({ required: false });
  refB = Option.String({ required: false });

  staged = Option.Boolean('--staged,--cached', false, {
    description: 'Show only staged changes vs HEAD',
  });

  nameOnly = Option.Boolean('--name-only', false, {
    description: 'Show only changed file names',
  });

  color = Option.String('--color', 'auto' as ColorMode, {
    description: 'Color mode: auto | always | never',
  });

  wordDiff = Option.Boolean('--word-diff', false, {
    description: 'Show a word diff instead of a line diff',
  });

  stat = Option.Boolean('--stat', false, {
    description: 'Generate a diffstat',
  });

  quiet = Option.Boolean('--quiet,-q', false, { description: 'Suppress non-essential errors' });

  async execute(): Promise<number> {
    try {
      const args: string[] = ['diff'];

      // Color handling
      if (this.color === 'always') args.push('--color=always');
      else if (this.color === 'never') args.push('--no-color');
      else args.push('--color');

      if (this.wordDiff) args.push('--word-diff');
      if (this.stat) args.push('--stat');
      if (this.nameOnly) args.push('--name-only');

      const rangeFromFlag = (this.commitsRange || '').trim();
      const havePositional = Boolean((this.refA || '').trim() || (this.refB || '').trim());

      if (rangeFromFlag) {
        args.push(rangeFromFlag);
      } else if (havePositional) {
        if (this.refA && this.refB) args.push(`${this.refA}..${this.refB}`);
        else if (this.refA) args.push(this.refA);
      } else if (this.staged) {
        args.push('--cached');
      } else {
        // Default working tree vs HEAD (no extra args)
      }

      const child = spawn('git', args, { stdio: 'inherit' });
      await new Promise<number>((resolvePromise, reject) => {
        child.on('error', reject);
        child.on('close', code => resolvePromise(code ?? 1));
      });
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

const cli = new Cli({
  binaryLabel: 'Git Diff',
  binaryName: 'git-diff',
  binaryVersion: '1.0.0',
});

cli.register(GitDiffCommand);
cli.runExit(process.argv.slice(2));


