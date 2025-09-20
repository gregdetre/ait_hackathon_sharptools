---
Date: 2025-09-20
Duration: ~20 minutes
Type: Decision-making
Status: Active
Related Docs:
- planning/250920a_diff_visualizer_planning.md
- docs/reference/DATA_STRUCTURES.md
---

# Diff Visualizer Design - 2025-09-20

## Context & Goals

"We are building a fancy diff-visualiser. The idea is that it takes a standard text Git diff (as output by `sharptools/git-diff.ts`), we write a script that turns that into a `basic-diff` JSON data structure, we define a schema for a richly augmented/annotated `rich-diff` schema, then we run an LLM with a carefully-written prompt to turn our `basic-diff` into a `rich-diff` structure."

Goals:
- Enable a human programmer to quickly build a mental model of what changed, how it fits within the existing codebase, and how it relates to goals/plans.
- Support multiple views: narrative summaries, Mermaid diagrams, split-diff, risk/importance views, clustering by value/intent.

## Key Background

- User preference: "Be in `SOUNDING_BOARD_MODE.md` to start with. Ask one or two questions at a time."
- Initial references and inspiration:
  - `prompts/adam_diff_prompt_1338.md` (early summarization ideas)
  - `.claude/agents/commit-diff-visualizer.md` (value-first visualization agent brief)
  - `sharptools/git-diff.ts` (Clipanion CLI that prints git diff)
  - `docs/instructions/WRITE_PLANNING_DOC.md` (planning format)

## Main Discussion

### Basic-diff data structure

- Keep it lossless, compact, and deterministic. Faithful to `git diff` semantics.
- Include stable IDs for files, hunks, and lines to support deep-linking and UI anchors.
- Represent file status variants: added/modified/deleted/renamed/copied/modeChanged/typeChanged/binary.
- Carry raw per-file patch for fallback. Support word-diff spans when enabled.
- Totals and meta capture exact invocation args for traceability.

### Attachments beyond plain diff

- Decision: include optional extras as attachments (off by default), but the user later decided: "Yes, include context (we can always choose not to display it)."
- Attachments catalog:
  - Blob identities (before/after) for on-demand fetching
  - Context slices (N lines before/after each hunk, radius configurable)
  - Optional file snapshots (size-capped)
- Attachments are keyed to `fileId`/`hunkId` for easy pruning.

### Rich-diff data structure

- Opinionated, value-focused layer, referencing `basic-diff` by IDs only.
- Group changes into clusters by intent/value (e.g., feature, fix, perf, security).
- Provide item-level narratives (per file or hunk), callouts for important changes, and risk/importance/confidence scoring.
- Include extracted entities (symbols/exports/routes), structured operations (e.g., changeSignature), relations, render hints, and optional Mermaid diagrams per cluster.

### Grouping, scoring, and pipeline

- Heuristics: path prefixes, shared symbols/routes, co-modified files, public API surface, config/schema changes.
- Risk signals: security/auth/concurrency/error-handling/migrations/infra.
- Pipeline:
  1) Produce `basic-diff` (+context attachments)
  2) Deterministic pre-enrichment (no LLM): path tags, churn metrics, TypeScript symbol hints
  3) LLM passes: item extraction → clustering → summaries/diagrams
  4) Cache by content-hash at file/hunk granularity
  5) Render multi-view HTML

### Language focus and static analysis

- Decision: "Let's focus on TypeScript. (If it will help to do a static analysis of the code first, use Tree-sitter.)"
- Apply Tree-sitter TypeScript to extract symbols/exports and map to hunks.

## Decisions Made

1. Adopt the proposed `basic-diff` and `rich-diff` schemas with deterministic IDs.
2. Include code context slices by default in `basic-diff` attachments (display is optional).
3. Prioritize TypeScript entity extraction; use Tree-sitter where helpful.
4. Rich-diff groups by value/intent; include narratives, callouts, risk/importance/confidence, and optional Mermaid diagrams.

## Open Questions

- Context radius default: propose `radius=20` lines; confirm later based on UI/LLM performance.
- Limits for file snapshots: default off; enable for files under a conservative size (e.g., 64 KB)?
- Prompt versions and caching policy: set versioning and eviction rules.

## Next Steps

- Implement TypeScript schemas (done): `sharptools/claude-conversation-exporter/types/diff-schemas.ts`.
- Implement `basic-diff` generator and attachments (context enabled by default).
- Add TypeScript pre-enrichment using Tree-sitter.
- Implement LLM itemization and clustering prompts; produce `rich-diff.json`.
- HTML renderer for multi-view visualization.

## Sources & References

- `docs/instructions/SOUNDING_BOARD_MODE.md` – conversational approach
- `docs/instructions/WRITE_PLANNING_DOC.md` – planning structure
- `docs/instructions/WRITE_EVERGREEN_DOC.md` – evergreen docs guidance
- `.claude/agents/commit-diff-visualizer.md` – value-first summary design
- `prompts/adam_diff_prompt_1338.md` – diff abstraction prompts
- `sharptools/git-diff.ts` – underlying git diff CLI

## Related Work

- Planned: `planning/250920a_diff_visualizer_planning.md`
- Planned: `docs/reference/DATA_STRUCTURES.md`


