# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Sharp Tools helps programmers use AI-assisted tools (like Claude Code and Cursor) more effectively by providing real-time, digestible readouts of changes being made by AI. The project aims to reduce cognitive load through visual summaries, diagrams, and interactive displays of code changes.

## Development Commands

### sharptools/ Directory

```bash
# Install dependencies
cd sharptools
npm install

# Run the chat server
npm run chat
# or directly: tsx chat-server.ts --host=127.0.0.1 --port=8787

# Run TypeScript files directly with tsx
npx tsx <filename>.ts
```

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