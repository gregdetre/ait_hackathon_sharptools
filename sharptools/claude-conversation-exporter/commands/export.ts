import { Command, Option } from 'clipanion';
import * as fs from 'fs';
import * as path from 'path';
import { SessionFinder } from '../services/sessionFinder';
import { SessionParser } from '../services/sessionParser';
import { ExportMode, SessionData } from '../types';

export class ExportCommand extends Command {
  static paths = [['export'], Command.Default];

  static usage = Command.Usage({
    description: 'Export Claude Code conversations to JSON',
    details: `
      This command exports Claude Code conversation sessions to JSON format.

      By default, it exports the current directory's sessions to ./claude-exports.
    `,
    examples: [
      ['Export current project conversations', '$0'],
      ['Export all projects', '$0 --all'],
      ['Export specific project', '$0 --project /path/to/project'],
      ['Export to custom output directory', '$0 --output ./my-exports'],
      ['Export only user prompts', '$0 --mode prompts'],
      ['Export all projects with only prompts', '$0 --all --mode prompts'],
      ['Export with verbose logging', '$0 --verbose']
    ]
  });

  project = Option.String('-p,--project', process.cwd(), {
    description: 'Project path to export conversations from'
  });

  output = Option.String('-o,--output', './claude-exports', {
    description: 'Output directory for JSON files'
  });

  mode = Option.String('-m,--mode', 'full', {
    description: 'Export mode: prompts, outputs, or full'
  });

  verbose = Option.Boolean('-v,--verbose', false, {
    description: 'Enable verbose logging'
  });

  list = Option.Boolean('-l,--list', false, {
    description: 'List available sessions without exporting'
  });

  all = Option.Boolean('-a,--all', false, {
    description: 'Export conversations from all projects'
  });

  async execute() {
    try {
      // Resolve paths
      const outputDir = path.resolve(this.output);

      console.log(`🔍 Claude Conversation Exporter\n`);

      // Check if exporting all projects
      if (this.all) {
        console.log(`📁 Mode: Export all projects`);
      } else {
        const projectPath = path.resolve(this.project);
        if (!fs.existsSync(projectPath)) {
          throw new Error(`Project path does not exist: ${projectPath}`);
        }
        console.log(`📁 Project: ${projectPath}`);
      }

      // Validate mode
      const validModes = ['prompts', 'outputs', 'full'];
      if (!validModes.includes(this.mode)) {
        throw new Error(`Mode must be one of: ${validModes.join(', ')}`);
      }

      // Map string mode to enum
      const exportMode = {
        'prompts': ExportMode.PROMPTS_ONLY,
        'outputs': ExportMode.OUTPUTS_ONLY,
        'full': ExportMode.FULL_CONVERSATION
      }[this.mode] || ExportMode.FULL_CONVERSATION;

      // Find session directory
      const finder = new SessionFinder(this.verbose);

      if (this.list) {
        // List all sessions mode
        const allSessions = finder.listAllSessions();

        if (allSessions.size === 0) {
          console.log('\n❌ No Claude sessions found.');
          return 0;
        }

        console.log(`\n📋 Found ${allSessions.size} project(s) with sessions:\n`);

        for (const [projectDir, sessions] of allSessions) {
          console.log(`  📂 ${path.basename(projectDir)}`);
          console.log(`     Path: ${projectDir}`);
          console.log(`     Sessions: ${sessions.length}`);
          sessions.forEach(session => {
            console.log(`       • ${session}`);
          });
          console.log();
        }

        return 0;
      }

      // Export all projects mode
      if (this.all) {
        const allProjectSessions = finder.listAllSessions();

        if (allProjectSessions.size === 0) {
          console.log('\n❌ No Claude sessions found.');
          return 0;
        }

        console.log(`📊 Found ${allProjectSessions.size} project(s) with sessions\n`);

        // Create output directory
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        const parser = new SessionParser(exportMode, this.verbose);
        let totalProjects = 0;
        let totalSessions = 0;
        let totalMessages = 0;
        const projectSummaries: any[] = [];

        for (const [projectDir] of allProjectSessions) {
          const projectName = path.basename(projectDir);
          console.log(`\n📂 Processing: ${projectName}`);

          // Create project subdirectory
          const projectOutputDir = path.join(outputDir, projectName);
          if (!fs.existsSync(projectOutputDir)) {
            fs.mkdirSync(projectOutputDir, { recursive: true });
          }

          // Parse sessions for this project
          const sessions = parser.parseDirectory(projectDir);

          if (sessions.length === 0) {
            console.log(`  ⚠️  No valid sessions to export`);
            continue;
          }

          let projectMessages = 0;
          const projectFiles: string[] = [];

          for (const session of sessions) {
            const outputFile = path.join(projectOutputDir, `${session.sessionId}.json`);
            fs.writeFileSync(outputFile, JSON.stringify(session, null, 2));
            projectFiles.push(`${projectName}/${session.sessionId}.json`);
            projectMessages += session.messages.length;
          }

          totalProjects++;
          totalSessions += sessions.length;
          totalMessages += projectMessages;

          projectSummaries.push({
            projectName,
            projectPath: projectDir,
            sessionsExported: sessions.length,
            messagesExported: projectMessages,
            files: projectFiles
          });

          console.log(`  ✓ Exported ${sessions.length} session(s), ${projectMessages} message(s)`);
        }

        // Create global summary file
        const summaryFile = path.join(outputDir, 'export-summary.json');
        const summary = {
          exportedAt: new Date().toISOString(),
          exportMode: this.mode,
          totalProjects,
          totalSessions,
          totalMessages,
          projects: projectSummaries
        };

        fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));

        console.log(`\n✅ Export complete!`);
        console.log(`   Projects: ${totalProjects}`);
        console.log(`   Sessions: ${totalSessions}`);
        console.log(`   Messages: ${totalMessages}`);
        console.log(`   Output: ${outputDir}`);

        return 0;
      }

      // Single project export (existing logic)
      const projectPath = path.resolve(this.project);
      const sessionDir = finder.findSessionDirectory(projectPath);
      console.log(`📂 Session directory: ${sessionDir}`);

      // Parse sessions
      const parser = new SessionParser(exportMode, this.verbose);
      const sessions = parser.parseDirectory(sessionDir);

      if (sessions.length === 0) {
        console.log('\n❌ No sessions found to export.');
        return 0;
      }

      console.log(`📊 Found ${sessions.length} session(s) to export`);

      // Create output directory
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Export sessions
      let totalMessages = 0;
      const exportedFiles: string[] = [];

      for (const session of sessions) {
        const outputFile = path.join(outputDir, `${session.sessionId}.json`);
        fs.writeFileSync(outputFile, JSON.stringify(session, null, 2));
        exportedFiles.push(outputFile);
        totalMessages += session.messages.length;

        if (this.verbose) {
          console.log(`  ✓ Exported ${session.sessionId} (${session.messages.length} messages)`);
        }
      }

      // Create summary file
      const summaryFile = path.join(outputDir, 'export-summary.json');
      const summary = {
        exportedAt: new Date().toISOString(),
        projectPath,
        exportMode: this.mode,
        sessionsExported: sessions.length,
        totalMessages,
        files: exportedFiles.map(f => path.basename(f))
      };

      fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));

      console.log(`\n✅ Export complete!`);
      console.log(`   Sessions: ${sessions.length}`);
      console.log(`   Messages: ${totalMessages}`);
      console.log(`   Output: ${outputDir}`);

      return 0;
    } catch (error) {
      console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}`);

      if (this.verbose && error instanceof Error && error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }

      return 1;
    }
  }
}