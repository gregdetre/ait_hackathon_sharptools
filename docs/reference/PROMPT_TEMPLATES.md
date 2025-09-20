# PROMPT_TEMPLATES.md – Rich Diff Prompting (Nunjucks)

## Introduction

This document describes the Nunjucks-based prompt templates for converting `BasicDiff` to `RichDiff`. Templates are Markdown `.md.njk` files that render strict-JSON tasks for Anthropic (first version) and can be adapted to other providers.

## See also

- `sharptools/claude-conversation-exporter/types/diff-schemas.ts` – data structures
- `prompts/templates/pass_a_item_extraction.md.njk` – per-hunk item extraction
- `prompts/templates/pass_b_clustering.md.njk` – global clustering & summary
- `prompts/templates/pass_c_diagram.md.njk` – per-cluster Mermaid diagrams
- `planning/250920a_diff_visualizer_planning.md` – implementation plan

## Principles, key decisions

- Strict JSON outputs; wrapper validates and assigns stable IDs.
- Evidence-only citations via `{fileId,hunkId,lineIds}`; never include raw patch text.
- TypeScript-focused context (20-line radius by default) with token caps to avoid huge payloads.
- Provider: Anthropic (JSON-only behavior), then expand as needed.

## Templates overview

### Pass A – Per-hunk Item Extraction
- Input vars:
  - `meta_json`, `file_json`, `hunk_json`, `tsEntities_json`, `hints_json`
- Output: `{ items: RichItemDraft[], warnings: string[] }` JSON
- Purpose: produce small, precise change items with operations, entities, scores, and evidence.

### Pass B – Global Clustering & Summary
- Input vars:
  - `meta_json`, `totals_json`, `pathTags_json`, `items_json`
- Output: `RichDiffDraft` JSON with `summary`, `clusters`, optional `relations`, `warnings`
- Purpose: group by value/intent, author narratives and callouts, prepare optional diagram slots.

### Pass C – Diagram Synthesis (Mermaid)
- Input vars:
  - `cluster_json`, `items_json`
- Output: `{ mermaid: string | null }`
- Purpose: generate compact sequence/flow/class diagrams when confidence is sufficient.

## Anthropic usage

- Use low temperature (≈0.2), moderate max tokens (≈1k–2k per call).
- Reject non-JSON; re-prompt on invalid JSON with tighter instructions.
- Keep per-hunk inputs compact (only +/- lines and minimal context). Truncate deterministically when over budget.

## Maintenance

- Version prompts (e.g., `promptVersion: richdiff-v1`) and document changes.
- Add test fixtures with small BasicDiff samples mapped to stable RichDiff drafts.
- Update this doc and templates alongside schema updates (e.g., `contentHash`).


