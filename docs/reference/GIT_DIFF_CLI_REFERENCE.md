# Git Diff CLI

Lightweight TypeScript wrapper around `git diff` with ergonomic flags. Defaults to showing working tree changes vs `HEAD`; supports staged-only, commit ranges, and ref comparisons.

## See also
- `../../sharptools/git-diff.ts` — implementation
- `../../CLAUDE.md` — how to run TypeScript files with `tsx`

## Usage
- Requirements: `git` on PATH, Node.js available
- Run:
  - `npx tsx sharptools/git-diff.ts [options]`
  - Or executable: `./sharptools/git-diff.ts [options]`

Invocation: `git-diff [options] [refA] [refB]`

## Options
- `--commits a..b` — compare a commit range; overrides positional refs
- `refA [refB]` — compare refs; with both → `refA..refB`, with one → `git diff refA`
- `--staged, --cached` — only staged changes vs `HEAD`
- `--name-only` — list changed file names only
- `--color=auto|always|never` — color mode (default adds `--color` which behaves like always)
- `--word-diff` — word-level diff
- `--stat` — show diffstat
- `--quiet, -q` — suppress non-essential error output

## Examples
```bash
# Working tree vs HEAD
npx tsx sharptools/git-diff.ts

# Only staged changes
npx tsx sharptools/git-diff.ts --staged

# Between commit range
npx tsx sharptools/git-diff.ts --commits abc123..def456

# Between positional refs
npx tsx sharptools/git-diff.ts abc123 def456

# Names only with forced color
npx tsx sharptools/git-diff.ts --name-only --color=always
```

## Notes / Limitations
- Spawns `git` and inherits stdio; output mirrors `git`
- Exit code from `git` isn't propagated; command returns `0` unless an exception occurs
- Default color flag adds `--color` which may include ANSI codes when piped; use `--color=never` if needed
