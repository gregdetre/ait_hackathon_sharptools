import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class SessionFinder {
  private verbose: boolean;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  private log(message: string): void {
    if (this.verbose) {
      console.log(`[SessionFinder] ${message}`);
    }
  }

  private encodePath(projectPath: string): string {
    return projectPath
      .replace(/\//g, '-')
      .replace(/_/g, '-');
  }

  private getClaudeHomes(): string[] {
    const homeDir = os.homedir();
    const candidates = [
      path.join(homeDir, '.claude', 'projects'),
      path.join(homeDir, '.config', 'claude', 'projects')
    ];

    return candidates.filter(dir => {
      const exists = fs.existsSync(dir);
      if (exists) {
        this.log(`Found Claude home at: ${dir}`);
      }
      return exists;
    });
  }

  public findSessionDirectory(projectPath: string): string {
    const claudeHomes = this.getClaudeHomes();

    if (claudeHomes.length === 0) {
      throw new Error('No Claude home directory found. Please ensure Claude Code is installed.');
    }

    const encodedPath = this.encodePath(projectPath);
    this.log(`Looking for encoded path: ${encodedPath}`);

    for (const claudeHome of claudeHomes) {
      const sessionDir = path.join(claudeHome, encodedPath);

      if (fs.existsSync(sessionDir)) {
        this.log(`Found exact match at: ${sessionDir}`);
        return sessionDir;
      }

      // Try to find partial matches
      const projectName = path.basename(projectPath);
      try {
        const dirs = fs.readdirSync(claudeHome);
        const candidates = dirs.filter(dir => dir.includes(projectName));

        if (candidates.length > 0) {
          const bestMatch = candidates[0];
          const matchPath = path.join(claudeHome, bestMatch);
          this.log(`Found partial match: ${matchPath}`);
          return matchPath;
        }
      } catch (error) {
        this.log(`Error searching directory ${claudeHome}: ${error}`);
      }
    }

    throw new Error(`No Claude sessions found for project: ${projectPath}`);
  }

  public listAllSessions(): Map<string, string[]> {
    const claudeHomes = this.getClaudeHomes();
    const allSessions = new Map<string, string[]>();

    for (const claudeHome of claudeHomes) {
      try {
        const projects = fs.readdirSync(claudeHome);

        for (const project of projects) {
          const projectPath = path.join(claudeHome, project);
          if (fs.statSync(projectPath).isDirectory()) {
            const sessionFiles = fs.readdirSync(projectPath)
              .filter(f => f.endsWith('.jsonl'));

            if (sessionFiles.length > 0) {
              allSessions.set(projectPath, sessionFiles);
            }
          }
        }
      } catch (error) {
        this.log(`Error listing sessions in ${claudeHome}: ${error}`);
      }
    }

    return allSessions;
  }
}