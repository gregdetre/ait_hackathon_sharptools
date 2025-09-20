#!/usr/bin/env node

import { Cli, Builtins } from 'clipanion';
import { ExportCommand } from './commands/export';

const [node, app, ...args] = process.argv;

const cli = new Cli({
  binaryLabel: 'Claude Conversation Exporter',
  binaryName: 'claude-export',
  binaryVersion: '1.0.0'
});

// Register commands
cli.register(ExportCommand);
cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);

// Run the CLI
cli.runExit(args);