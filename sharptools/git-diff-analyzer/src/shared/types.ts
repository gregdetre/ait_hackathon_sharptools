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
  promptsFolder: string;
  model?: string;
  temperature?: number;
  maxCompletionTokens?: number;
}

export interface UIConfig {
  showRawDiff: boolean;
  refreshInterval: number;
}

export interface AppConfig {
  server: ServerConfig;
  gitMonitor: GitMonitorConfig;
  llm: LLMConfig;
  ui: UIConfig;
}

export interface AnalysisResult {
  id: string;
  type: string;
  title: string;
  content: any;
  confidence: number;
  timestamp: Date;
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
