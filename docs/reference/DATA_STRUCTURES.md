# DATA_STRUCTURES.md – Diff Visualizer Schemas Overview

## Introduction

This document provides a high-level overview of the two data structures used by the Diff Visualizer:
- **BasicDiff**: deterministic, lossless encoding of a Git text diff with stable IDs
- **RichDiff**: LLM-augmented, value-focused interpretation that references BasicDiff by IDs

For full, authoritative details see the TypeScript definitions in:
- `sharptools/claude-conversation-exporter/types/diff-schemas.ts`

## See also

- `planning/250920a_diff_visualizer_planning.md` – implementation plan and design decisions
- `docs/conversations/250920a_diff_visualizer_design.md` – conversation capture and context
- `sharptools/git-diff.ts` – the underlying CLI that emits the raw diff

## Principles, key decisions

- Keep BasicDiff faithful to `git diff` semantics; do not infer meaning at this layer.
- Use deterministic IDs for files, hunks, and lines to enable deep-linking and stable anchors.
- Include code context slices around hunks by default as attachments; display is optional.
- RichDiff never contains raw patch text; it references BasicDiff elements by ID.
- RichDiff groups by value/intent and includes narratives, callouts, importance/risk/confidence, and optional Mermaid diagrams.

## BasicDiff (summary)

- Captures meta (tool invocation, args, refs), totals, and a list of file diffs.
- Each file diff contains status (added/modified/deleted/renamed/copied/etc.), stats, hunks, and optional `rawPatch`.
- Each hunk records ranges and an array of lines with `op` (context/add/del). Optional word-diff spans.
- Attachments (optional):
  - Blob identities for before/after
  - File snapshots (size-capped; off by default)
  - Context slices around hunks (default on; configurable radius)

## RichDiff (summary)

- Adds a value/intent layer on top of BasicDiff, without duplicating patch text.
- Key elements:
  - `summary`: headline, narrative, totals, key callouts
  - `clusters`: group changes by kind (feature/fix/perf/security/etc.) with descriptions and optional Mermaid diagrams
  - `items`: per-file or per-hunk narratives, operations, extracted entities, highlights, and evidence refs back to BasicDiff
  - `relations`: cross-item dependencies/links
  - `views`: indexes for UI (by kind/risk/importance/layer)
  - `trace`: anchors mapping prose to evidence refs

## Examples (small fragments)

```ts
// BasicDiff snippet
const basic: BasicDiff = {
  meta: { /* ... */ },
  totals: { filesChanged: 3, additions: 42, deletions: 10, hunks: 5, binaryFilesChanged: 0 },
  files: [
    {
      id: "f_ab12",
      pathOld: "src/auth.ts",
      pathNew: "src/auth.ts",
      status: "modified",
      isBinary: false,
      stats: { additions: 12, deletions: 3, hunks: 2 },
      hunks: [ /* ... */ ],
    },
  ],
};

// RichDiff snippet
const rich: RichDiff = {
  meta: { /* ... */ },
  summary: {
    headline: "Harden token validation and clarify session flow",
    narrative: "Updates auth validation, adds guard clauses, and documents the flow.",
    keyCallouts: [ /* ... */ ],
    totals: { filesChanged: 3, additions: 42, deletions: 10, clusters: 2 },
  },
  clusters: [ /* ... */ ],
  items: [
    {
      id: "i_cdef",
      fileId: "f_ab12",
      hunkId: "h_01",
      kind: "security",
      headline: "Enforce expiration check in validateSession(...)",
      whatChanged: "Added expiry comparison and error path with logging.",
      importance: 5,
      risk: 3,
      confidence: 0.86,
      evidence: [{ fileId: "f_ab12", hunkId: "h_01", lineIds: ["l_5","l_6"] }],
    },
  ],
};
```

## Gotchas

- Large diffs: cap attachments and paginate UI.
- Binary files: represent as `isBinary=true` with status and metadata, no hunks.
- Renames/copies: include `similarityIndex`, preserve old/new paths.
- Word-diff: only populate `intraLine` spans when explicitly enabled at diff time.

## Planned future work

- Expand TypeScript entity extraction coverage; consider JS/TS import graph analysis.
- Add optional PR metadata (commit messages, authors, timestamps) to meta when available.
- Enable alternate renderers (e.g., Markdown-only report) alongside HTML.


