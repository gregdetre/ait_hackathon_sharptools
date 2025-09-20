# ait_hackathon_sharptools

Sharp Tools helps programmers to use AI-assisted tools (like Claude Code and Cursor) more effectively, by getting a nicely-digested readout of the changes being made by the AI in realtime.

see `docs/reference/PRODUCT_VISION_FEATURES.md`

## Diff Visualizer – Quick Start

Prereqs:
- Node.js 18+
- Git (run inside a Git repo)

Setup:
1) Install deps
```bash
npm install
```

Generate the diff artifacts (JSON → HTML):
1) Basic diff JSON
```bash
npm run diff:json
```
2) Deterministic TS enrichment
```bash
npm run diff:enrich
```
3) Rich diff (heuristic MVP)
```bash
npm run diff:rich
```
4) Render HTML
```bash
npm run diff:html
```
5) Open the HTML report
```bash
# macOS
open out/rich-diff.html
# Linux
# xdg-open out/rich-diff.html
```

One-liner:
```bash
npm run diff:json && npm run diff:enrich && npm run diff:rich && npm run diff:html && open out/rich-diff.html
```

### LLM-enhanced Rich Diff

Prereq (set once):
```bash
echo 'ANTHROPIC_API_KEY=your_key_here' > .env.local
```

Generate rich diff with LLM:
```bash
npm run diff:rich:llm
```

LLM one-liner:
```bash
npm run diff:json && npm run diff:enrich && npm run diff:rich:llm && npm run diff:html && open out/rich-diff.html
```

End-to-end pipeline (timestamped artifacts):
```bash
# Open after generation
npm run diff:pipeline:llm -- --open

# Between refs/commits
npm run diff:pipeline:llm -- --commits abc123..def456 --open

# Single commit vs parent
npm run diff:pipeline:llm -- --commits e8f3a986c86fbe7d75faf00c6ad149182f74581c --open
```

Note: If the API key is missing, the LLM step will gracefully fall back to the heuristic rich diff.

Tips:
- Pass extra options to the diff step via npm:
  - Only staged changes
    ```bash
    npm run diff:json -- --staged
    ```
  - Between commits/refs
    ```bash
    npm run diff:json -- --commits abc123..def456
    ```
  - Adjust context radius (default 20) and unified hunk context
    ```bash
    npm run diff:json -- --context-radius 10 -U3
    ```
- To render the raw Git diff as HTML (without the rich view):
  ```bash
  npm run git:diff:html -- --output out/diff.html
  ```
