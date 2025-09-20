# Claude Conversation Exporter

A Node.js CLI tool built with Clipanion that exports Claude Code conversations to JSON format.

## Features

- 🔍 **Discover Sessions**: Automatically finds Claude Code session files from your projects
- 📊 **Multiple Export Modes**: Export user prompts, assistant outputs, or full conversations
- 📁 **Project Support**: Export conversations from any project directory
- 📋 **List Sessions**: View all available Claude sessions across your system
- 🎯 **Flexible Output**: Export to custom output directories

## Installation

```bash
# Install dependencies
npm install

# Build the TypeScript project
npm run build
```

## Usage

### Development Mode

```bash
# Run in development mode with ts-node
npm run dev -- [options]
```

### Production Mode

```bash
# Build and run
npm run export -- [options]

# Or separately
npm run build
npm start -- [options]
```

### Command Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--project` | `-p` | Project path to export conversations from | Current directory |
| `--output` | `-o` | Output directory for JSON files | `./claude-exports` |
| `--mode` | `-m` | Export mode: `prompts`, `outputs`, or `full` | `full` |
| `--verbose` | `-v` | Enable verbose logging | `false` |
| `--list` | `-l` | List available sessions without exporting | `false` |
| `--help` | | Show help information | |

### Examples

```bash
# Export current project conversations
npm run dev

# Export specific project
npm run dev -- --project /path/to/project

# Export only user prompts
npm run dev -- --mode prompts

# Export to custom directory
npm run dev -- --output ./my-exports

# List all available sessions
npm run dev -- --list

# Enable verbose logging
npm run dev -- --verbose
```

## Output Format

The tool exports conversations as JSON files with the following structure:

```json
{
  "sessionId": "uuid",
  "messages": [
    {
      "role": "user|assistant|system",
      "content": "message content",
      "timestamp": "ISO 8601 date",
      "index": 0
    }
  ],
  "stats": {
    "userMessages": 10,
    "assistantMessages": 10,
    "systemMessages": 0,
    "totalMessages": 20
  },
  "projectPath": "/path/to/project",
  "exportedAt": "ISO 8601 date"
}
```

Additionally, an `export-summary.json` file is created with metadata about the export:

```json
{
  "exportedAt": "ISO 8601 date",
  "projectPath": "/path/to/project",
  "exportMode": "full",
  "sessionsExported": 5,
  "totalMessages": 100,
  "files": ["session1.json", "session2.json"]
}
```

## Requirements

- Node.js >= 18.0.0
- Claude Code must be installed with session files in `~/.claude/projects` or `~/.config/claude/projects`

## Development

### Project Structure

```
├── src/
│   ├── index.ts           # CLI entry point
│   ├── commands/
│   │   └── export.ts      # Export command implementation
│   ├── services/
│   │   ├── sessionFinder.ts  # Find Claude session directories
│   │   └── sessionParser.ts  # Parse JSONL session files
│   └── types.ts           # TypeScript type definitions
├── package.json
└── tsconfig.json
```

### NPM Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run the compiled CLI
- `npm run dev` - Run in development mode with ts-node
- `npm run export` - Build and run the CLI

## License

MIT
