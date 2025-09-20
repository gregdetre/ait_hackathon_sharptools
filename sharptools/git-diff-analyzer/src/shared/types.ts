export interface GitMonitorConfig {
  mode: 'static-file' | 'folder-watch';
  staticFilePath?: string;
  watchFolder?: string;
  pollInterval?: number;
}

export interface ServerConfig {
  port: number;
  host: string;
}

export interface LLMConfig {
  enabled: boolean;
  provider: 'openai' | 'claude';
  promptsFolder: string;
  templatesFolder?: string;
  model?: string;
  temperature?: number;
  maxCompletionTokens?: number;
}

export interface UIConfig {
  showRawDiff: boolean;
  refreshInterval: number;
}

export interface RepomixConfig {
  enabled: boolean;
}

export interface AppConfig {
  server: ServerConfig;
  gitMonitor: GitMonitorConfig;
  llm: LLMConfig;
  repomix: RepomixConfig;
  ui: UIConfig;
}

export interface AnalysisResult {
  id: string;
  type: string;
  title: string;
  content: any;
  confidence: number;
  timestamp: Date;
  promptUsed?: string;
}

export interface GitDiffData {
  diffText: string;
  timestamp: Date;
  fileCount: number;
  additions: number;
  deletions: number;
  repomixOutput?: string;
  repomixSize?: number;
}

export interface WebSocketMessage {
  type: 'diff-update' | 'analysis-update' | 'status-update' | 'llm-error' | 'diff-too-large';
  data: any;
}
