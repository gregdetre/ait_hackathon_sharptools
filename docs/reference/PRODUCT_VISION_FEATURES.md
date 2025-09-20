Sharp Tools helps programmers to use AI-assisted tools (like Claude Code and Cursor) more effectively, by getting a nicely-digested readout of the changes being made by the AI (either when a diff is finished, or in realtime).

Ideally this would be a tool to watch (and describe/highlight/filter/summarise the changes being made by the AI), so that we can understand what's happening with lower cognitive load, and notice/interrupt if it's going off the rails.

e.g.

- I’m an experienced programmer. I’ve asked the LLM to do something, and I want to make sure it’s doing things the right way, and to interrupt if it goes off the rails.

- I run `npx sharptools` in the background

- I write a prompt in Cursor, and the model starts whirring

- I open up the browser window, and watch a diff-summary/visualisation/update of what the LLM is doing, e.g.
    
  - *The goal here is to implement your planning doc X.*
    
  - *The LLM has changed the following N files. Here's a summary of the change made to each.*
    
  - *It has made the following decisions along the way that weren’t explicitly defined in your prompt.*
    
  - *Here’s a diagram showing the structure of the changes it has made.*
    

The key is it’s about building a mental model of what’s being changed, not evaluating whether the code is good.

Make it visual, interactive

Product goals:
- Enable programmers to quickly build a mental model of what changed, how it fits within the existing codebase, and how it relates to goals/plans.
- Support multiple complementary views: narrative summaries, split-diff, risk/importance, clustering by value/intent, and small Mermaid diagrams.
- Emphasise value/intent over file layout; group related changes into clusters with clear narratives and callouts.
- Work in realtime so you can monitor and interrupt if things go off track.

Implementation notes (from the current plan/design):
- Under the hood: standard Git diffs → `basic-diff` JSON (stable IDs; optional context attachments with default radius 20) → deterministic TypeScript pre-enrichment → LLM itemization and clustering → `rich-diff` (references `basic-diff` by IDs only).
- Render a multi-view HTML: summaries, clusters by intent/value, split-diff with evidence refs, risk/importance, and concise Mermaid diagrams.
- Focus first on TypeScript; use Tree-sitter where helpful for symbols/exports.
- Cache per-hunk by content-hash to avoid repeated LLM work.

Try to really reduce/manage the human programmer's cognitive load. Start with summaries/digests, that you can click on for more information.

Ideally you can interact with the diff summary/visualisation, e.g. chat with it, to ask for more information about particular areas/changes.
