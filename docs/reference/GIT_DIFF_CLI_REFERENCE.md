# Git Diff CLI

Lightweight TypeScript wrapper around `git diff` with ergonomic flags. Defaults to showing working tree changes vs `HEAD`; supports staged-only, commit ranges, and ref comparisons.

## See also
- `../../sharptools/git-diff.ts` — implementation
- `../../sharptools/git-diff-html.ts` — HTML renderer for diffs
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

## Git Diff → HTML

Render the output of `git diff` to a standalone HTML file with syntax highlighting.

- Entry: `sharptools/git-diff-html.ts`
- Script: `npm run git:diff:html`

### Usage

Invocation: `git-diff-html [options] [refA] [refB]`

Reads from STDIN when piped, otherwise runs `git diff` with the provided flags.

### Options (diff selection)
- `--commits a..b` — commit range; overrides positional refs
- `refA [refB]` — ref comparison; with both → `refA..refB`, with one → `git diff refA`
- `--staged, --cached` — staged changes vs `HEAD`
- `--name-only` — list changed file names only
- `--word-diff` — word-level diff
- `--stat` — show diffstat
- `--color=auto|always|never` — color mode (ANSI is stripped before HTML)

### Options (HTML output)
- `--output, -o <file>` — write HTML to file (default STDOUT)
- `--title <text>` — document title (default inferred from output name)
- `--fragment` — emit HTML fragment only (no `<html>` wrapper)
- `--hl-theme <name>` — highlight.js theme via CDN (default `github`)
- `--open` — open the generated HTML in the default browser

### Examples
```bash
# Generate HTML for working tree vs HEAD
npm run git:diff:html -- --output out/diff.html --title "Working Tree Diff"

# Only staged changes to HTML
npx tsx sharptools/git-diff-html.ts --staged -o out/staged.html --title "Staged Changes"

# Between commit range
npx tsx sharptools/git-diff-html.ts --commits abc123..def456 -o out/range.html

# Pipe from git-diff.ts
npx tsx sharptools/git-diff.ts --color=never \
| npx tsx sharptools/git-diff-html.ts -o out/piped.html --title "Piped Git Diff"
```

> Note: The HTML renderer strips ANSI color codes from piped input before highlighting.
