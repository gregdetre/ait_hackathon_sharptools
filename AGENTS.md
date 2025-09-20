# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Sharp Tools helps programmers use AI-assisted tools (like Claude Code and Cursor) more effectively by providing real-time, digestible readouts of changes being made by AI. The project aims to reduce cognitive load through visual summaries, diagrams, and interactive displays of code changes.

## Development Commands

### Development Commands (project root)

```bash
# Install dependencies (root)
npm install

# Run the chat server
npm run prechat && npm run chat
# or directly:
npx tsx sharptools/chat-server.ts --host=127.0.0.1 --port=8787 --dir=./sharptools/chat

# Git diff helper (Clipanion CLI)
npm run git:diff -- --name-only

# Git diff → HTML
npm run git:diff:html -- --output out/diff.html --title "Working Tree Diff"

# Markdown → HTML renderer
npm run markdown:html -- --input README.md --output README.html

# Generate Mermaid diagram via Anthropic
npm run generate:mermaid -- --prompt "OAuth login flow"

# Run TypeScript files directly with tsx
npx tsx sharptools/<filename>.ts
```

### Claude Conversation Exporter

```bash
# Export conversations for this repo only (explicit path)
claude-export --project "/Users/greg/Dropbox/dev/experim/ait_hackathon_sharptools" --output ./claude-exports

# Or from within the repo (defaults to current directory)
npm run build && npm start
```

#### Git Diff CLI examples

```bash
# Working tree vs HEAD
npx tsx sharptools/git-diff.ts

# Only staged changes
npx tsx sharptools/git-diff.ts --staged

# Between commits/refs
npx tsx sharptools/git-diff.ts --commits abc123..def456
npx tsx sharptools/git-diff.ts abc123 def456

# Names only with forced color
npx tsx sharptools/git-diff.ts --name-only --color=always

# Render HTML from diff
npx tsx sharptools/git-diff.ts --color=never \
| npx tsx sharptools/git-diff-html.ts -o out/piped.html --title "Piped Git Diff"
```

See `docs/reference/GIT_DIFF_CLI_REFERENCE.md` for full reference.

## Architecture

### Project Structure

- **sharptools/**: Main Sharp Tools implementation
  - `chat-server.ts`: HTTP server for serving chat interface
  - `generate-mermaid-diagram.ts`: Creates Mermaid diagrams from code changes
  - `markdown-to-html.ts`: Converts Markdown to styled HTML with syntax highlighting


- **docs/reference/**: Documentation
  - `PRODUCT_VISION_FEATURES.md`: Product vision and feature planning
  - `DIAGRAMS_MERMAID_GENERATION_REFERENCE.md`: Mermaid diagram generation guide
  - `libraries/VERCEL_AI_SDK.md`: Vercel AI SDK reference

### Key Technologies

- **TypeScript**: Main implementation language for Sharp Tools
- **Node.js**: Runtime environment
- **Dependencies**:
  - `clipanion`: Command-line parsing
  - `markdown-it`: Markdown processing
  - `highlight.js`: Syntax highlighting
  - `openai`: OpenAI API integration

### Design Principles

The project focuses on:
- Visual representation of code changes (diagrams, proportional diff displays)
- Real-time monitoring of AI coding activities
- Reducing programmer cognitive load through summaries and digests
- Interactive displays that allow drilling down for more detail