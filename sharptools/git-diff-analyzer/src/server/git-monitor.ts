import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import chokidar from 'chokidar';
import { EventEmitter } from 'events';
import { GitMonitorConfig, GitDiffData } from '../shared/types';
import { RepomixService } from './repomix-service';

export class GitMonitor extends EventEmitter {
  private config: GitMonitorConfig;
  private watcher?: chokidar.FSWatcher;
  private pollTimer?: NodeJS.Timeout;
  private lastDiffHash: string = '';
  private repomixService: RepomixService;

  constructor(config: GitMonitorConfig) {
    super();
    this.config = config;
    this.repomixService = new RepomixService();
  }

  async start(): Promise<void> {
    console.log(`Starting GitMonitor in ${this.config.mode} mode`);
    
    if (this.config.mode === 'static-file') {
      await this.startStaticFileMode();
    } else {
      await this.startFolderWatchMode();
    }

    // Always set up polling as fallback
    this.startPolling();
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }
    
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  async manualRefresh(): Promise<void> {
    console.log('Manual refresh triggered');
    await this.checkForChanges();
  }

  private async startStaticFileMode(): Promise<void> {
    if (!this.config.staticFilePath) {
      throw new Error('Static file path not configured');
    }

    const filePath = this.config.staticFilePath;
    if (!fs.existsSync(filePath)) {
      throw new Error(`Static file not found: ${filePath}`);
    }

    // Read the static file once and emit it
    const content = fs.readFileSync(filePath, 'utf-8');
    const diffData: GitDiffData = {
      diffText: content,
      timestamp: new Date(),
      fileCount: this.countFiles(content),
      additions: this.countAdditions(content),
      deletions: this.countDeletions(content)
    };

    this.emit('diff-changed', diffData);
  }

  private async startFolderWatchMode(): Promise<void> {
    if (!this.config.watchFolder) {
      throw new Error('Watch folder not configured');
    }

    // Resolve relative paths relative to the current working directory
    const watchPath = path.resolve(this.config.watchFolder);
    if (!fs.existsSync(watchPath)) {
      throw new Error(`Watch folder not found: ${watchPath}`);
    }

    // Set up file system watcher
    this.watcher = chokidar.watch(watchPath, {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**'
      ],
      persistent: true,
      ignoreInitial: true
    });

    this.watcher.on('change', () => this.checkForChanges());
    this.watcher.on('add', () => this.checkForChanges());
    this.watcher.on('unlink', () => this.checkForChanges());

    console.log(`Watching folder: ${watchPath}`);
    
    // Get initial diff
    await this.checkForChanges();
  }

  private startPolling(): void {
    if (this.config.pollInterval && this.config.pollInterval > 0) {
      this.pollTimer = setInterval(() => {
        this.checkForChanges();
      }, this.config.pollInterval);
    }
  }

  private async checkForChanges(): Promise<void> {
    try {
      const diffData = await this.getCurrentGitDiff();
      const diffHash = this.hashString(diffData.diffText);
      
      if (diffHash !== this.lastDiffHash) {
        this.lastDiffHash = diffHash;
        this.emit('diff-changed', diffData);
      }
    } catch (error) {
      console.error('Error checking for git changes:', error);
      this.emit('error', error);
    }
  }

  private async getCurrentGitDiff(): Promise<GitDiffData> {
    return new Promise(async (resolve, reject) => {
      const cwd = this.config.mode === 'folder-watch' 
        ? path.resolve(this.config.watchFolder)
        : process.cwd();

      const gitProcess = spawn('git', ['diff', '--color=never'], { 
        cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      gitProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      gitProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      gitProcess.on('close', async (code) => {
        if (code !== 0 && stderr) {
          reject(new Error(`Git diff failed: ${stderr}`));
          return;
        }

        // Check if diff is too large
        if (this.repomixService.isDiffTooLarge(stdout)) {
          console.log(`⚠️ Git diff too large (${stdout.length} characters), rejecting`);
          const diffData: GitDiffData = {
            diffText: stdout,
            timestamp: new Date(),
            fileCount: this.countFiles(stdout),
            additions: this.countAdditions(stdout),
            deletions: this.countDeletions(stdout)
          };
          // Emit a special event for large diffs
          this.emit('diff-too-large', diffData);
          resolve(diffData);
          return;
        }

        // Try to generate repomix output
        let repomixOutput: string | undefined;
        let repomixSize: number | undefined;
        
        try {
          const repomixResult = await this.repomixService.generateRepomixOutput(cwd);
          if (repomixResult) {
            repomixOutput = repomixResult.output;
            repomixSize = repomixResult.size;
            console.log(`✅ Repomix output included (${repomixSize} characters)`);
          }
        } catch (error) {
          console.error('Failed to generate repomix output:', error);
        }

        const diffData: GitDiffData = {
          diffText: stdout,
          timestamp: new Date(),
          fileCount: this.countFiles(stdout),
          additions: this.countAdditions(stdout),
          deletions: this.countDeletions(stdout),
          repomixOutput,
          repomixSize
        };

        resolve(diffData);
      });

      gitProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  private countFiles(diffText: string): number {
    const matches = diffText.match(/^diff --git/gm);
    return matches ? matches.length : 0;
  }

  private countAdditions(diffText: string): number {
    const matches = diffText.match(/^\+(?!\+\+)/gm);
    return matches ? matches.length : 0;
  }

  private countDeletions(diffText: string): number {
    const matches = diffText.match(/^-(?!--)/gm);
    return matches ? matches.length : 0;
  }

  private hashString(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return hash.toString();
  }
}
