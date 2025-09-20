import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import chokidar from 'chokidar';
import { EventEmitter } from 'events';
import { GitMonitorConfig, GitDiffData, RepomixConfig } from '../shared/types';
import { RepomixService } from './repomix-service';

export class GitMonitor extends EventEmitter {
  private config: GitMonitorConfig;
  private watcher?: chokidar.FSWatcher;
  private pollTimer?: NodeJS.Timeout;
  private lastDiffHash: string = '';
  private repomixService: RepomixService;
  private repomixConfig: RepomixConfig;
  private isProcessing: boolean = false;
  private consecutiveNoChanges: number = 0;

  constructor(config: GitMonitorConfig, repomixConfig: RepomixConfig) {
    super();
    this.config = config;
    this.repomixConfig = repomixConfig;
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

  /**
   * Notify that LLM processing has completed
   */
  notifyLLMProcessingComplete(): void {
    console.log('✅ LLM processing completed, resuming git monitoring');
    this.isProcessing = false;
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
    // Prevent multiple simultaneous checks
    if (this.isProcessing) {
      console.log('⏳ Skipping git check - already processing');
      return;
    }

    try {
      this.isProcessing = true;
      
      // First, do a quick check to see if there are any changes at all
      const hasChanges = await this.hasGitChanges();
      
      if (!hasChanges) {
        // No changes at all - skip processing
        this.consecutiveNoChanges++;
        console.log(`📋 No git changes detected (quick check) - consecutive: ${this.consecutiveNoChanges}`);
        
        // If we've had many consecutive no-changes, we can reduce polling frequency
        if (this.consecutiveNoChanges > 10) {
          console.log('🐌 Reducing polling frequency due to inactivity');
          this.consecutiveNoChanges = 0; // Reset counter
          // Could implement adaptive polling here if needed
        }
        return;
      }
      
      // Reset consecutive no-changes counter
      this.consecutiveNoChanges = 0;
      
      // There are changes, now get the full diff
      const diffData = await this.getCurrentGitDiff();
      const diffHash = this.hashString(diffData.diffText);
      
      if (diffHash !== this.lastDiffHash) {
        console.log(`🔄 Git diff changed (${diffData.fileCount} files, +${diffData.additions} -${diffData.deletions})`);
        this.lastDiffHash = diffHash;
        this.emit('diff-changed', diffData);
      } else {
        console.log('📋 Git diff unchanged (same content)');
      }
    } catch (error) {
      console.error('Error checking for git changes:', error);
      this.emit('error', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Quick check to see if there are any git changes without generating the full diff
   */
  private async hasGitChanges(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const cwd = this.config.mode === 'folder-watch' 
        ? path.resolve(this.config.watchFolder)
        : process.cwd();

      // Use git status --porcelain for a quick check
      const gitProcess = spawn('git', ['status', '--porcelain'], { 
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

      gitProcess.on('close', (code) => {
        if (code !== 0 && stderr) {
          reject(new Error(`Git status failed: ${stderr}`));
          return;
        }

        // If there's any output, there are changes
        const hasChanges = stdout.trim().length > 0;
        resolve(hasChanges);
      });

      gitProcess.on('error', (error) => {
        reject(error);
      });
    });
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

        // Truncate diff if it's too large instead of rejecting it
        const truncatedDiff = this.repomixService.truncateDiffIfNeeded(stdout);
        
        // Try to generate repomix output if enabled
        let repomixOutput: string | undefined;
        let repomixSize: number | undefined;
        
        if (this.repomixConfig.enabled) {
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
        } else {
          console.log('📦 Repomix disabled in configuration');
        }

        const diffData: GitDiffData = {
          diffText: truncatedDiff,
          timestamp: new Date(),
          fileCount: this.countFiles(truncatedDiff),
          additions: this.countAdditions(truncatedDiff),
          deletions: this.countDeletions(truncatedDiff),
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
    // For large strings, sample every nth character to improve performance
    if (str.length > 10000) {
      const sampleRate = Math.max(1, Math.floor(str.length / 1000));
      let sampledStr = '';
      for (let i = 0; i < str.length; i += sampleRate) {
        sampledStr += str[i];
      }
      str = sampledStr;
    }
    
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
