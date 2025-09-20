import * as fs from 'fs';
import * as path from 'path';
import { Message, MessageRole, ExportMode, SessionData, ClaudeMessage } from '../types';

export class SessionParser {
  private verbose: boolean;
  private exportMode: ExportMode;

  constructor(exportMode: ExportMode = ExportMode.FULL_CONVERSATION, verbose: boolean = false) {
    this.exportMode = exportMode;
    this.verbose = verbose;
  }

  private log(message: string): void {
    if (this.verbose) {
      console.log(`[SessionParser] ${message}`);
    }
  }

  private parseMessage(data: ClaudeMessage, index: number): Message | null {
    if (!data.message || !data.message.role) {
      return null;
    }

    const { role, content } = data.message;

    // Convert content to string if needed
    let processedContent: string;
    if (typeof content === 'string') {
      processedContent = content;
    } else {
      // For non-string content, stringify it
      processedContent = JSON.stringify(content, null, 2);
    }

    const messageRole = role.toLowerCase() as MessageRole;
    if (!Object.values(MessageRole).includes(messageRole)) {
      this.log(`Unknown message role: ${role}`);
      return null;
    }

    return {
      role: messageRole,
      content: processedContent,
      timestamp: data.timestamp || new Date().toISOString(),
      index
    };
  }

  private shouldIncludeMessage(message: Message): boolean {
    switch (this.exportMode) {
      case ExportMode.PROMPTS_ONLY:
        return message.role === MessageRole.USER;
      case ExportMode.OUTPUTS_ONLY:
        return message.role === MessageRole.ASSISTANT;
      case ExportMode.FULL_CONVERSATION:
        return true;
      default:
        return true;
    }
  }

  public parseSession(sessionPath: string): SessionData | null {
    const sessionId = path.basename(sessionPath, '.jsonl');
    const messages: Message[] = [];

    try {
      const content = fs.readFileSync(sessionPath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());

      this.log(`Processing session ${sessionId} with ${lines.length} lines`);

      lines.forEach((line, index) => {
        try {
          const data = JSON.parse(line) as ClaudeMessage;
          const message = this.parseMessage(data, index);

          if (message && this.shouldIncludeMessage(message)) {
            messages.push(message);
          }
        } catch (error) {
          this.log(`Error parsing line ${index + 1}: ${error}`);
        }
      });

      if (messages.length === 0) {
        this.log(`No messages found for session ${sessionId}`);
        return null;
      }

      const stats = {
        userMessages: messages.filter(m => m.role === MessageRole.USER).length,
        assistantMessages: messages.filter(m => m.role === MessageRole.ASSISTANT).length,
        systemMessages: messages.filter(m => m.role === MessageRole.SYSTEM).length,
        totalMessages: messages.length
      };

      this.log(`Session ${sessionId}: Found ${stats.totalMessages} messages`);

      return {
        sessionId,
        messages,
        stats,
        projectPath: path.dirname(sessionPath),
        exportedAt: new Date().toISOString()
      };
    } catch (error) {
      this.log(`Error reading session file ${sessionPath}: ${error}`);
      return null;
    }
  }

  public parseDirectory(directory: string): SessionData[] {
    const sessionFiles = fs.readdirSync(directory)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => path.join(directory, f));

    this.log(`Found ${sessionFiles.length} session files in ${directory}`);

    const sessions: SessionData[] = [];

    for (const sessionFile of sessionFiles) {
      const sessionData = this.parseSession(sessionFile);
      if (sessionData) {
        sessions.push(sessionData);
      }
    }

    this.log(`Successfully parsed ${sessions.length} sessions`);
    return sessions;
  }
}