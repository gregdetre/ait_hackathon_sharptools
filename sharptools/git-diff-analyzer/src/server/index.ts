import http from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import url from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { GitMonitor } from './git-monitor';
import { LLMProcessor } from './llm-processor';
import { AppConfig, WebSocketMessage, GitDiffData, AnalysisResult } from '../shared/types';

class GitDiffAnalyzerServer {
  private config: AppConfig;
  private server: http.Server;
  private wss: WebSocketServer;
  private gitMonitor: GitMonitor;
  private llmProcessor: LLMProcessor;
  private clients: Set<WebSocket> = new Set();
  private currentDiff: GitDiffData | null = null;
  private currentAnalyses: AnalysisResult[] = [];

  constructor(config: AppConfig) {
    this.config = config;
    this.server = http.createServer(this.handleHttpRequest.bind(this));
    this.wss = new WebSocketServer({ server: this.server });
    this.gitMonitor = new GitMonitor(config.gitMonitor);
    this.llmProcessor = new LLMProcessor(config.llm.enabled, config.llm.promptsFolder);

    this.setupWebSocket();
    this.setupGitMonitor();
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('WebSocket client connected');
      this.clients.add(ws);

      // Send current state to new client
      if (this.currentDiff) {
        this.sendToClient(ws, {
          type: 'diff-update',
          data: this.currentDiff
        });
      }

      if (this.currentAnalyses.length > 0) {
        this.sendToClient(ws, {
          type: 'analysis-update',
          data: this.currentAnalyses
        });
      }

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          await this.handleWebSocketMessage(ws, data);
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });
  }

  private setupGitMonitor(): void {
    this.gitMonitor.on('diff-changed', async (diffData: GitDiffData) => {
      console.log(`Git diff changed: ${diffData.fileCount} files, +${diffData.additions} -${diffData.deletions}`);
      
      this.currentDiff = diffData;
      this.broadcast({
        type: 'diff-update',
        data: diffData
      });

      // Process with LLM
      try {
        const analyses = await this.llmProcessor.processGitDiff(diffData);
        this.currentAnalyses = analyses;
        this.broadcast({
          type: 'analysis-update',
          data: analyses
        });
      } catch (error) {
        console.error('Error processing diff with LLM:', error);
      }
    });

    this.gitMonitor.on('error', (error) => {
      console.error('GitMonitor error:', error);
      this.broadcast({
        type: 'status-update',
        data: { error: error.message }
      });
    });
  }

  private async handleWebSocketMessage(ws: WebSocket, message: any): Promise<void> {
    switch (message.type) {
      case 'refresh':
        console.log('Manual refresh requested');
        await this.gitMonitor.manualRefresh();
        break;
      
      case 'get-current-state':
        if (this.currentDiff) {
          this.sendToClient(ws, {
            type: 'diff-update',
            data: this.currentDiff
          });
        }
        if (this.currentAnalyses.length > 0) {
          this.sendToClient(ws, {
            type: 'analysis-update',
            data: this.currentAnalyses
          });
        }
        break;
        
      default:
        console.warn('Unknown WebSocket message type:', message.type);
    }
  }

  private sendToClient(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcast(message: WebSocketMessage): void {
    this.clients.forEach(client => {
      this.sendToClient(client, message);
    });
  }

  private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = req.method || 'GET';
    const parsed = url.parse(req.url || '/');
    const pathname = decodeURIComponent(parsed.pathname || '/');

    console.log(`${method} ${pathname}`);

    // API endpoints
    if (method === 'GET' && pathname === '/api/config') {
      this.sendJson(res, 200, this.config);
      return;
    }

    if (method === 'POST' && pathname === '/api/refresh') {
      try {
        await this.gitMonitor.manualRefresh();
        this.sendJson(res, 200, { success: true });
      } catch (error) {
        this.sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' });
      }
      return;
    }

    // Serve static files
    if (method === 'GET') {
      await this.serveStatic(res, pathname);
      return;
    }

    res.statusCode = 405;
    res.end('Method Not Allowed');
  }

  private async serveStatic(res: http.ServerResponse, pathname: string): Promise<void> {
    try {
      let filePath: string;

      if (pathname === '/') {
        filePath = path.join(__dirname, '../client/index.html');
      } else {
        // Remove leading slash and join with client directory
        const relativePath = pathname.replace(/^\//, '');
        filePath = path.join(__dirname, '../client', relativePath);
      }

      // Security check - ensure file is within client directory
      const clientDir = path.resolve(__dirname, '../client');
      const resolvedPath = path.resolve(filePath);
      
      if (!resolvedPath.startsWith(clientDir)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }

      const data = await fs.readFile(resolvedPath);
      const contentType = this.getContentType(resolvedPath);
      
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(data.length));
      res.end(data);

    } catch (error) {
      res.statusCode = 404;
      res.end('Not Found');
    }
  }

  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.html': return 'text/html; charset=utf-8';
      case '.js': return 'text/javascript; charset=utf-8';
      case '.css': return 'text/css; charset=utf-8';
      case '.json': return 'application/json; charset=utf-8';
      case '.svg': return 'image/svg+xml';
      case '.png': return 'image/png';
      case '.jpg':
      case '.jpeg': return 'image/jpeg';
      default: return 'application/octet-stream';
    }
  }

  private sendJson(res: http.ServerResponse, status: number, obj: unknown): void {
    const body = Buffer.from(JSON.stringify(obj, null, 2));
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', String(body.length));
    res.end(body);
  }

  async start(): Promise<void> {
    await this.gitMonitor.start();
    
    this.server.listen(this.config.server.port, this.config.server.host, () => {
      console.log(`Git Diff Analyzer server running at http://${this.config.server.host}:${this.config.server.port}`);
      console.log(`WebSocket server ready for real-time updates`);
    });
  }

  async stop(): Promise<void> {
    await this.gitMonitor.stop();
    this.wss.close();
    this.server.close();
  }
}

// Load configuration and start server
async function main() {
  try {
    const configPath = path.resolve(__dirname, '../../config.json');
    const configData = await fs.readFile(configPath, 'utf-8');
    const config: AppConfig = JSON.parse(configData);
    
    const server = new GitDiffAnalyzerServer(config);
    await server.start();
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down...');
      await server.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
