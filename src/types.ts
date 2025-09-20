export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system'
}

export enum ExportMode {
  PROMPTS_ONLY = 'prompts',
  OUTPUTS_ONLY = 'outputs',
  FULL_CONVERSATION = 'full'
}

export interface Message {
  role: MessageRole;
  content: string;
  timestamp: string;
  index: number;
}

export interface SessionData {
  sessionId: string;
  messages: Message[];
  stats: {
    userMessages: number;
    assistantMessages: number;
    systemMessages: number;
    totalMessages: number;
  };
  projectPath: string;
  exportedAt: string;
}

export interface ExportOptions {
  projectPath: string;
  outputDir: string;
  exportMode: ExportMode;
  verbose: boolean;
}

export interface ClaudeMessage {
  message: {
    role: string;
    content: string | any;
  };
  timestamp?: string;
}