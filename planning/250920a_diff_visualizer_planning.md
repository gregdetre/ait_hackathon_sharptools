# Diff Visualizer – Planning and Implementation Guide

## Goal, context

Build a value-focused diff visualizer that:
- Parses standard Git text diffs (from `sharptools/git-diff.ts`) into a deterministic `basic-diff` JSON with stable IDs
- Adds optional attachments (code context around hunks enabled by default)
- Enriches with LLM into a `rich-diff` structure that groups by value/intent, narrates changes, and highlights importance/risk
- Renders multi-view HTML: clusters, split-diff, risk/importance, and Mermaid diagrams

## References

- `sharptools/claude-conversation-exporter/types/diff-schemas.ts` – TypeScript schemas
- `docs/conversations/250920a_diff_visualizer_design.md` – conversation capture
- `docs/reference/DATA_STRUCTURES.md` – high-level schema overview
- `sharptools/git-diff.ts` – CLI producing git diff text
- `.claude/agents/commit-diff-visualizer.md` – value-first visualization guidance
- `prompts/adam_diff_prompt_1338.md` – early diff summarization prompt ideas
- `docs/instructions/WRITE_PLANNING_DOC.md` – planning doc guidance

## Principles, key decisions

- `basic-diff` is lossless, compact, deterministic. Rich UI anchors require stable IDs for file/hunk/line.
- Include code context slices by default as attachments (e.g., 20-line radius), display optional.
- Focus language: TypeScript. Use Tree-sitter TypeScript for symbol/entity extraction where useful.
- `rich-diff` references `basic-diff` by IDs only. No duplication of patch text.
- Group by intent/value (feature/fix/perf/security/etc.), not file layout. Provide narratives, callouts, risk/importance/confidence, Mermaid diagrams.
- Cache at file/hunk granularity keyed by content-hash to minimize repeated LLM work.

## Stages & actions

### Stage: Foundations and Schemas
- [x] Add TypeScript schemas for `BasicDiff` and `RichDiff` in `types/diff-schemas.ts`
 - [x] Decide/default context radius (default: 20; configurable via `--context-radius`)
 - [x] Add hunk `contentHash` to schema for caching (schema v1.1.0)
- [ ] Decide file snapshot limits (default off; limit small files)

### Stage: Basic Diff Generator
- [x] Implement `sharptools/diff/basic-diff.ts` that:
  - [x] Invokes `git diff` via child_process with options (inherit args)
  - [x] Parses patch into `BasicDiff` with files/hunks/lines and stable IDs
  - [x] Detects file status (added/modified/deleted/renamed/copied/mode changes)
  - [ ] Captures word-diff spans when enabled (planned; not yet parsed to `intraLine`)
  - [x] Computes totals and basic stats
  - [x] Attaches blob identities (before/after) when available
  - [x] Fetches and attaches code context slices around hunks (default on; radius configurable)
  - [x] Computes hunk `contentHash` for caching (normalized header + ops + text)
  - [x] Exposes a function and a CLI wrapper (e.g., `tsx sharptools/diff/basic-diff.ts --output out/basic-diff.json`)

### Stage: TypeScript Pre-enrichment (Deterministic)
- [x] Add `sharptools/diff/ts-preenrich.ts` that:
  - [ ] Uses Tree-sitter TypeScript to parse before/after snapshots (when size allows)
  - [x] Extracts symbols, exports, and maps them to hunks/lines (regex-based MVP)
  - [x] Tags files by layer (frontend/backend/tests/docs) via path heuristics
  - [x] Computes churn/density metrics and marks likely public API changes (MVP churn only)
  - [x] Outputs an enrichment bundle keyed by `fileId`/`hunkId`

### Stage: LLM Itemization and Clustering
- [ ] Create prompts:
  - [ ] Per-file/hunk item extraction (small prompts including only added/removed lines + compact context + TS entities)
  - [ ] Global clustering and summarization prompt (groups items by value/intent, assigns importance/risk/confidence)
  - [ ] Optional: per-cluster Mermaid generation prompt
- [x] Implement `sharptools/diff/rich-diff.ts` that:
  - [x] Consumes `BasicDiff` + enrichment and produces `RichDiff` (heuristic stub; no LLM calls yet)
  - [ ] Caches per-hunk item results by hash
  - [ ] Validates output strictly against schema, annotates low-confidence sections

Notes:
- Provider: use Anthropic for the first version (JSON-only), aligned with `sharptools/chat-server.ts`.
- Prompts authored as Nunjucks `.md.njk` templates (Markdown with templating variables).
- Input caps: default context radius 20; enforce per-hunk token budget and truncate long hunks deterministically.
- Cache per-hunk by `contentHash` and reuse prior LLM results when unchanged.

### Stage: HTML Renderer
- [x] Implement `sharptools/diff/rich-diff-html.ts` that renders a standalone HTML:
  - [x] Summary dashboard (files changed, additions/deletions, clusters)
  - [ ] Cluster view with collapsible sections and Mermaid diagrams
  - [ ] Two-column split-diff with line highlighting using evidence refs
  - [ ] Filters by kind, risk, importance, layer; expand/collapse all
  - [ ] Client-side search across headlines/entities
  - [ ] Syntax highlighting via highlight.js (already a dependency)

### Stage: Integration and CLI
- [x] Add npm scripts:
  - [x] `diff:json` → generate `basic-diff.json`
  - [x] `diff:enrich` → generate `enrichment.json`
  - [x] `diff:rich` → generate `rich-diff.json`
  - [x] `diff:html` → generate `rich-diff.html` from `rich-diff.json`
- [x] Wire options: context radius, model/provider, prompt version (file snapshot limits TBD)

### Stage: Health Checks
- [x] Type checking (`tsc --noEmit`) after each stage (no errors in MVP files)
- [x] Linting (align with repo conventions)
- [x] Manual spot checks on representative diffs (generated out/*.json, out/*.html)
  - [x] End-to-end run produced: `out/basic-diff.json`, `out/enrichment.json`, `out/rich-diff.json`, `out/rich-diff.html`

### Stage: Documentation and Diagrams
- [x] Keep `docs/reference/DATA_STRUCTURES.md` aligned with schema evolution
- [ ] Add examples (redacted) showing `BasicDiff` and `RichDiff` fragments
- [x] Cross-reference planning and conversation docs

## Appendix A – ID Strategy

- `fileId`: hash of (`pathOld|pathNew|status|modeBefore|modeAfter`) with normalized separators
- `hunkId`: hash of (`fileId|oldStart|oldLines|newStart|newLines|sectionHeading|hunkIndex`)
- `lineId`: stable sequence index within hunk (stringified), or hash of (`op|text|oldNumber|newNumber|seq`)
- Use short, URL-safe hashes (e.g., base36/base62) to keep anchors compact

## Appendix B – Context Attachments

- Default `radius=20`; configurable via CLI and programmatic API
- Fetch context lines from repository state at respective refs (before/after)
- For large files, cap total context lines per file/hunk to avoid bloat (TBD)

## Appendix C – TypeScript Entity Extraction

- Use Tree-sitter TypeScript to extract:
  - Top-level exports (functions, classes, const/let)
  - Named function declarations, method signatures
  - Import/export specifiers and their names
- Map identifiers to changed lines using line ranges; attach to enrichment bundle

## Appendix D – Scoring Heuristics

- Importance ↑ when:
  - Public export signatures changed
  - Entry points/routes/config/schema modified
  - Changes fan out to many files
- Risk ↑ when:
  - Security/auth/concurrency/IO/infra touched
  - Migrations or data shape changes present
  - Error handling or transaction boundaries modified

## Appendix E – Prompt Contracts (Sketch)

- Item extraction prompt: strict JSON output, include `evidence` refs (file/hunk/lineIds), forbid speculative code, include confidence.
- Clustering prompt: accept list of items, group into clusters with titles, heuristics, and Mermaid summaries; add callouts.
- Mermaid prompt: produce small, readable diagrams; prefer sequence/class/flow as appropriate; keep within size limits.

## Progress – 2025-09-20

- Added `contentHash` to `Hunk` in `sharptools/claude-conversation-exporter/types/diff-schemas.ts` (schema v1.1.0) to enable per-hunk caching.
- Authored Nunjucks prompt templates:
  - `prompts/templates/pass_a_item_extraction.md.njk`
  - `prompts/templates/pass_b_clustering.md.njk`
  - `prompts/templates/pass_c_diagram.md.njk`
- Wrote `docs/reference/PROMPT_TEMPLATES.md` documenting the templating approach and I/O contracts.
- Updated `docs/reference/DATA_STRUCTURES.md` to mention `contentHash` and clarify hunk attachments.

## Notes

- Provider: use Anthropic for v1 (JSON-only), consistent with `sharptools/chat-server.ts`.
- Context radius: default 20 lines (configurable); apply deterministic truncation for very large hunks.
- Caching: reuse per-hunk LLM results keyed by `contentHash` to avoid re-processing unchanged hunks.


