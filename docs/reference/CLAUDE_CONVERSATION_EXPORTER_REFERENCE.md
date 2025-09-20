### Introduction

The Claude Conversation Exporter is a small CLI that locates Claude Code conversation logs on your machine, parses them, and exports structured JSON files plus a summary. It enables analysis, archival, and downstream processing of local Claude Code sessions.

### See also

- `../instructions/WRITE_EVERGREEN_DOC.md` – guidelines followed by this doc
- `../../CLAUDE.md` – repository guidance, architecture, and dev commands
- `../../sharptools/claude-conversation-exporter/index.ts` – CLI entrypoint registration
- `../../sharptools/claude-conversation-exporter/commands/export.ts` – `export` command implementation
- `../../sharptools/claude-conversation-exporter/services/sessionFinder.ts` – discovers Claude session directories
- `../../sharptools/claude-conversation-exporter/services/sessionParser.ts` – parses `.jsonl` sessions into structured data
- `../../sharptools/package.json` – scripts for Sharp Tools; unrelated to this CLI’s build
- Root `package.json` and `tsconfig.json` – build, dev scripts, and TypeScript config for this CLI

### Principles, key decisions

- Uses Clipanion for a clean, extensible CLI command system.
- Treats Claude Code sessions as append-only `.jsonl` logs; parsing is line-based and resilient to individual line errors.
- Exports one JSON per session file plus a summary file, preferring simple, stable JSON for downstream tooling.
- Source moved to `sharptools/claude-conversation-exporter/` to clarify scope and ownership within the repo.

### Overview and architecture

High-level data flow:
1) Session discovery – `SessionFinder` searches local Claude project homes:
   - `~/.claude/projects`
   - `~/.config/claude/projects`
   It encodes the project path (replacing `/` and `_` with `-`) and tries exact and partial matches.
2) Session parsing – `SessionParser` reads `.jsonl` files line-by-line, converts each to a `Message` with role/content/timestamps, and filters by export mode.
3) Export – Writes per-session JSON and an `export-summary.json`. With `--all`, sessions are grouped by project name in subfolders.

Key modules:
- `index.ts`: CLI bootstrap; registers commands (export/help/version)
- `commands/export.ts`: argument parsing, orchestration, progress output
- `services/sessionFinder.ts`: local filesystem discovery
- `services/sessionParser.ts`: JSONL parsing and message filtering/statistics
- `types.ts`: `MessageRole`, `ExportMode`, `Message`, `SessionData`, etc.

### CLI usage

Common commands:

```bash
# Export sessions for the current project into ./claude-exports
npm run build && npm start

# Dev mode (no build step):
npm run dev

# Export a specific project
claude-export --project /absolute/path/to/project

# Export all projects found on this machine
claude-export --all

# List projects/sessions without exporting
claude-export --list

# Export only user prompts (no assistant outputs)
claude-export --mode prompts

# Choose a custom output directory
claude-export --output ./my-exports

# Verbose logs for troubleshooting
claude-export --verbose
```

Options:
- `-p, --project <path>`: Project path (default: current working directory)
- `-o, --output <dir>`: Output directory (default: `./claude-exports`)
- `-m, --mode <prompts|outputs|full>`: Message filter (default: `full`)
- `-v, --verbose`: Verbose logging
- `-l, --list`: List available sessions without exporting
- `-a, --all`: Export sessions for all discovered projects

### Exported data format

Per-session JSON (`SessionData`):
- `sessionId`: derived from file name (sans `.jsonl`)
- `messages[]`:
  - `role`: `user | assistant | system`
  - `content`: string (other types are JSON-stringified)
  - `timestamp`: ISO string (source or generated)
  - `index`: 0-based line index within the session file
- `stats`: counts of messages by role and total
- `projectPath`: directory containing the original `.jsonl`
- `exportedAt`: ISO timestamp when export ran

Summary file (`export-summary.json`):
- Single-project mode: includes `projectPath`, `exportMode`, `sessionsExported`, `totalMessages`, and exported file names.
- `--all` mode: includes totals across projects and a `projects[]` array with per-project summaries and file lists.

### Session discovery details

- Claude home directories checked: `~/.claude/projects`, then `~/.config/claude/projects`.
- Project path is encoded for directory matching by replacing `/` and `_` with `-`.
- If exact directory match is not found, falls back to partial match using the project basename.

### Modes and filtering

- `prompts`: Keep only `user` messages
- `outputs`: Keep only `assistant` messages
- `full`: Keep all messages (`user`, `assistant`, `system`)

### Troubleshooting

- "No Claude home directory found": Ensure Claude Code is installed and has created local session logs.
- Empty or malformed `.jsonl` lines: Parser logs the error lines (with `--verbose`) and continues; valid lines still export.
- Permission issues reading home directories: Run with sufficient permissions or adjust file ACLs.
- Node/TypeScript toolchain:
  - Requires Node >= 18
  - Install deps at repo root: `npm install`
  - Build with `npm run build` or run dev with `npm run dev`

### Planned future work

- Filters (by date/session size/role), and richer query options
- Additional output formats (Markdown, CSV) and bundling strategies
- Session naming helpers beyond file-derived `sessionId`
- Incremental exports and deduplication helpers

### Maintenance

- Review after changes to `SessionFinder`, `SessionParser`, or CLI options.
- Keep examples and option lists synchronized with `commands/export.ts`.
- Link any major behavior changes from this doc to relevant planning notes.


