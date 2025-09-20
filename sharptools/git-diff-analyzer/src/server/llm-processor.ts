import { promises as fs } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { AnalysisResult, GitDiffData, LLMConfig } from '../shared/types';
import { EventEmitter } from 'events';

export class LLMProcessor extends EventEmitter {
  private config: LLMConfig;
  private openai?: OpenAI;
  private claude?: Anthropic;
  private promptCache: Map<string, string> = new Map();
  private isInitialized: boolean = false;

  constructor(config: LLMConfig) {
    super();
    this.config = config;
    
    if (config.enabled) {
      if (config.provider === 'openai') {
        this.initializeOpenAI();
      } else if (config.provider === 'claude') {
        this.initializeClaude();
      }
    }
  }

  private initializeOpenAI(): void {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('OPENAI_API_KEY not found in environment variables. LLM processing disabled.');
      this.isInitialized = false;
      return;
    }

    try {
      this.openai = new OpenAI({
        apiKey: apiKey,
      });
      this.isInitialized = true;
      console.log('✅ OpenAI client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize OpenAI client:', error);
      this.isInitialized = false;
    }
  }

  private initializeClaude(): void {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn('ANTHROPIC_API_KEY not found in environment variables. LLM processing disabled.');
      this.isInitialized = false;
      return;
    }

    try {
      this.claude = new Anthropic({
        apiKey: apiKey,
      });
      this.isInitialized = true;
      console.log('✅ Claude client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Claude client:', error);
      this.isInitialized = false;
    }
  }

  async processGitDiff(diffData: GitDiffData): Promise<void> {
    console.log('🔄 Processing git diff with LLM...');
    console.log('Config enabled:', this.config.enabled);
    console.log('Provider:', this.config.provider);
    console.log('Is initialized:', this.isInitialized);
    console.log('OpenAI client exists:', !!this.openai);
    console.log('Claude client exists:', !!this.claude);
    
    const hasClient = (this.config.provider === 'openai' && this.openai) || 
                     (this.config.provider === 'claude' && this.claude);
    
    if (!this.config.enabled || !this.isInitialized || !hasClient) {
      console.log('⚠️ LLM processing disabled - no analysis will be performed');
      return;
    }

    try {
      const timestamp = new Date();

      // Process only the two desired analyses: D3.js force diagram first, then code-summary
      
      // 1. Process D3.js force diagram analysis
      try {
        console.log('🔄 Processing D3.js force diagram analysis...');
        const d3Analysis = await this.processD3ForceDiagramAnalysis(diffData, timestamp);
        this.emit('analysis-complete', d3Analysis);
        console.log('✅ Completed D3.js force diagram analysis');
      } catch (error) {
        console.error('Error processing D3.js force diagram analysis:', error);
        // Don't fail the entire process for D3 errors, just log them
      }

      // 2. Process code-summary
      try {
        console.log('🔄 Processing code-summary...');
        const codeSummaryAnalysis = await this.processPrompt('code-summary', diffData, timestamp);
        this.emit('analysis-complete', codeSummaryAnalysis);
        console.log('✅ Completed code-summary');
      } catch (error) {
        console.error('Error processing code-summary:', error);
        throw error; // Fail the entire process if code-summary fails
      }

    } catch (error) {
      console.error('Error in LLM processing:', error);
      // Re-throw the error so the server can handle it and send llm-error message
      throw error;
    }
  }

  private async processPrompt(promptType: string, diffData: GitDiffData, timestamp: Date): Promise<AnalysisResult> {
    const promptTemplate = await this.loadPromptTemplate(promptType);
    const prompt = promptTemplate.replace('{GIT_DIFF}', diffData.diffText);
    
    console.log(`📏 Prompt length: ${prompt.length} characters`);

    try {
      let content: string;
      
      if (this.config.provider === 'openai' && this.openai) {
        console.log(`🚀 Making OpenAI API call for ${promptType}...`);
        const response = await this.openai.chat.completions.create({
          model: this.config.model || 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_completion_tokens: this.config.maxCompletionTokens || 2000,
        });

        console.log(`📥 Received response for ${promptType}:`, {
          choices: response.choices?.length || 0,
          usage: response.usage,
          model: response.model
        });

        content = response.choices[0]?.message?.content || '';
        console.log(`📄 Response content length: ${content ? content.length : 'null'}`);
        
        if (!content) {
          console.error(`❌ No response content from OpenAI for ${promptType}`);
          console.error('Full response:', JSON.stringify(response, null, 2));
          throw new Error('No response content from OpenAI');
        }
      } else if (this.config.provider === 'claude' && this.claude) {
        console.log(`🚀 Making Claude API call for ${promptType}...`);
        const response = await this.claude.messages.create({
          model: this.config.model || 'claude-3-sonnet-20240229',
          max_tokens: this.config.maxCompletionTokens || 2000,
          temperature: this.config.temperature || 0.1,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
        });

        console.log(`📥 Received response for ${promptType}:`, {
          usage: response.usage,
          model: response.model
        });

        content = response.content[0]?.type === 'text' ? response.content[0].text : '';
        console.log(`📄 Response content length: ${content ? content.length : 'null'}`);
        
        if (!content) {
          console.error(`❌ No response content from Claude for ${promptType}`);
          console.error('Full response:', JSON.stringify(response, null, 2));
          throw new Error('No response content from Claude');
        }
      } else {
        throw new Error(`No valid client available for provider: ${this.config.provider}`);
      }

      // Parse JSON response - handle markdown code blocks
      let parsedContent;
      try {
        // Remove markdown code blocks if present
        let jsonContent = content.trim();
        if (jsonContent.startsWith('```json')) {
          jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonContent.startsWith('```')) {
          jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        parsedContent = JSON.parse(jsonContent);
      } catch (error) {
        console.error(`Failed to parse JSON response for ${promptType}:`, content);
        throw new Error('Invalid JSON response from LLM');
      }

      return {
        id: promptType,
        type: promptType,
        title: this.getTitleForType(promptType),
        content: parsedContent,
        confidence: 0.9, // High confidence for LLM responses
        timestamp,
        promptUsed: prompt
      };
    } catch (error) {
      console.error(`${this.config.provider} API error for ${promptType}:`, error);
      throw error;
    }
  }

  private async loadPromptTemplate(promptType: string): Promise<string> {
    // Check cache first
    if (this.promptCache.has(promptType)) {
      return this.promptCache.get(promptType)!;
    }

    try {
      const promptPath = path.join(this.config.promptsFolder, `${promptType}.md`);
      const content = await fs.readFile(promptPath, 'utf-8');
      
      // Cache the template
      this.promptCache.set(promptType, content);
      
      return content;
    } catch (error) {
      console.error(`Failed to load prompt template for ${promptType}:`, error);
      throw new Error(`Prompt template not found: ${promptType}.md`);
    }
  }

  private getTitleForType(promptType: string): string {
    const titles: Record<string, string> = {
      'code-summary': 'Code Summary',
      'd3-force-diagram': 'D3.js Force Diagram - Class Visualization'
    };
    return titles[promptType] || promptType;
  }

  /**
   * Process D3.js force diagram analysis for class visualization
   */
  private async processD3ForceDiagramAnalysis(diffData: GitDiffData, timestamp: Date): Promise<AnalysisResult> {
    try {
      console.log('🔍 Analyzing classes in the project...');
      
      // Extract classes from the diff and project
      const classData = await this.extractClassData(diffData);
      
      console.log(`📊 Found ${classData.nodes.length} classes`);
      
      // Create D3.js force diagram data
      const d3Data = {
        nodes: classData.nodes,
        links: classData.links,
        metadata: {
          totalClasses: classData.nodes.length,
          createdClasses: classData.nodes.filter(n => n.status === 'created').length,
          modifiedClasses: classData.nodes.filter(n => n.status === 'modified').length,
          deletedClasses: classData.nodes.filter(n => n.status === 'deleted').length,
          unchangedClasses: classData.nodes.filter(n => n.status === 'unchanged').length,
          timestamp: timestamp.toISOString()
        }
      };

      return {
        id: 'd3-force-diagram',
        type: 'd3-force-diagram',
        title: 'D3.js Force Diagram - Class Visualization',
        content: d3Data,
        confidence: 0.9,
        timestamp,
        promptUsed: 'D3.js force diagram analysis'
      };
      
    } catch (error) {
      console.error('D3.js force diagram analysis failed:', error);
      return {
        id: 'd3-force-diagram',
        type: 'd3-force-diagram',
        title: 'D3.js Force Diagram - Class Visualization',
        content: {
          error: 'D3.js force diagram analysis failed',
          fallback: true,
          message: error instanceof Error ? error.message : 'Unknown error',
          nodes: [],
          links: [],
          metadata: {
            totalClasses: 0,
            createdClasses: 0,
            modifiedClasses: 0,
            deletedClasses: 0,
            unchangedClasses: 0,
            timestamp: timestamp.toISOString()
          }
        },
        confidence: 0.0,
        timestamp,
        promptUsed: 'D3.js force diagram analysis (failed)'
      };
    }
  }

  /**
   * Extract class data from diff and project files
   */
  private async extractClassData(diffData: GitDiffData): Promise<{ nodes: any[], links: any[] }> {
    const nodes: any[] = [];
    const links: any[] = [];
    const classMap = new Map<string, any>();
    
    try {
      // Parse diff to find changed files
      const changedFiles = this.parseDiffToFiles(diffData);
      
      // Extract classes from diff content
      for (const file of changedFiles) {
        const filePath = file.pathNew || file.pathOld;
        const fileStatus = this.getFileStatus(file);
        
        // Extract classes from file content
        const classes = this.extractClassesFromContent(file.diffContent || '', filePath);
        
        if (classes.length > 0) {
          // If classes are found, create nodes for each class
          for (const className of classes) {
            const nodeId = `${filePath}:${className}`;
            
            if (!classMap.has(nodeId)) {
              const node = {
                id: nodeId,
                name: className,
                file: filePath,
                status: fileStatus,
                color: this.getStatusColor(fileStatus),
                size: this.calculateClassSize(file.diffContent || '', className)
              };
              
              classMap.set(nodeId, node);
              nodes.push(node);
            }
          }
        } else {
          // If no classes found, create a file node using the filename
          const fileName = this.extractFileName(filePath);
          const nodeId = `file:${filePath}`;
          
          if (!classMap.has(nodeId)) {
            const node = {
              id: nodeId,
              name: fileName,
              file: filePath,
              status: fileStatus,
              color: this.getStatusColor(fileStatus),
              size: this.calculateFileSize(file.diffContent || '')
            };
            
            classMap.set(nodeId, node);
            nodes.push(node);
          }
        }
      }
      
      // Add classes from unchanged files (simplified - in a real implementation, 
      // you'd scan the entire project)
      const unchangedClasses = this.generateUnchangedClasses(changedFiles);
      for (const className of unchangedClasses) {
        const nodeId = `unchanged:${className}`;
        const node = {
          id: nodeId,
          name: className,
          file: 'unchanged',
          status: 'unchanged',
          color: '#ffffff', // white
          size: 5
        };
        
        classMap.set(nodeId, node);
        nodes.push(node);
      }
      
      // Generate links between classes (simplified - in a real implementation,
      // you'd analyze imports and dependencies)
      const links = this.generateClassLinks(nodes);
      
      return { nodes, links };
      
    } catch (error) {
      console.error('Error extracting class data:', error);
      return { nodes: [], links: [] };
    }
  }

  /**
   * Extract class names from file content
   */
  private extractClassesFromContent(content: string, filePath: string): string[] {
    const classes: string[] = [];
    const seenClasses = new Set<string>();
    
    // Only process TypeScript/JavaScript files
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (!['ts', 'tsx', 'js', 'jsx'].includes(ext || '')) {
      return classes;
    }
    
    // More precise TypeScript/JavaScript class patterns
    // Only match at the beginning of lines or after whitespace/braces
    const classPatterns = [
      /(?:^|\s|\{|\})\s*class\s+([A-Z][a-zA-Z0-9_]*)/gm,
      /(?:^|\s|\{|\})\s*interface\s+([A-Z][a-zA-Z0-9_]*)/gm,
      /(?:^|\s|\{|\})\s*type\s+([A-Z][a-zA-Z0-9_]*)/gm,
      /(?:^|\s|\{|\})\s*enum\s+([A-Z][a-zA-Z0-9_]*)/gm
    ];
    
    for (const pattern of classPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const className = match[1];
        // Additional validation: class names should start with uppercase letter
        // and not be common reserved words
        if (className && 
            className[0] === className[0].toUpperCase() &&
            !['Of', 'Where', 'Should', 'The', 'And', 'Or', 'But', 'For', 'With', 'From', 'To', 'In', 'On', 'At', 'By'].includes(className) &&
            !seenClasses.has(className)) {
          classes.push(className);
          seenClasses.add(className);
        }
      }
    }
    
    return classes;
  }

  /**
   * Extract filename from file path
   */
  private extractFileName(filePath: string): string {
    if (!filePath) return 'unknown';
    
    // Extract just the filename without extension
    const fileName = filePath.split('/').pop() || filePath;
    const nameWithoutExt = fileName.split('.')[0];
    
    // Convert kebab-case to Title Case
    return nameWithoutExt
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Calculate file size based on content length
   */
  private calculateFileSize(content: string): number {
    const lines = content.split('\n').length;
    return Math.max(8, Math.min(25, Math.floor(lines / 10) + 8));
  }

  /**
   * Get file status from diff
   */
  private getFileStatus(file: any): 'created' | 'modified' | 'deleted' | 'unchanged' {
    if (file.pathOld && !file.pathNew) return 'deleted';
    if (!file.pathOld && file.pathNew) return 'created';
    if (file.pathOld && file.pathNew && file.pathOld !== file.pathNew) return 'modified';
    return 'modified'; // default for files in diff
  }

  /**
   * Get color for file status
   */
  private getStatusColor(status: string): string {
    switch (status) {
      case 'created': return '#00ff00'; // green
      case 'deleted': return '#ff0000'; // red
      case 'modified': return '#ffa500'; // orange
      case 'unchanged': return '#ffffff'; // white
      default: return '#cccccc'; // gray
    }
  }

  /**
   * Calculate class size based on content
   */
  private calculateClassSize(content: string, className: string): number {
    // Simple heuristic: count lines containing the class name
    const lines = content.split('\n');
    const classLines = lines.filter(line => line.includes(className));
    return Math.min(Math.max(classLines.length * 2, 5), 20);
  }

  /**
   * Generate some unchanged classes for visualization
   */
  private generateUnchangedClasses(changedFiles: any[]): string[] {
    // In a real implementation, you'd scan the entire project
    // For now, return some sample classes
    return [
      'BaseComponent',
      'ApiClient',
      'UserService',
      'DatabaseConnection',
      'Logger',
      'ConfigManager',
      'AuthHandler',
      'CacheManager'
    ];
  }

  /**
   * Generate links between classes
   */
  private generateClassLinks(nodes: any[]): any[] {
    const links: any[] = [];
    
    // Simple heuristic: create links between classes in the same file
    const fileGroups = new Map<string, any[]>();
    
    for (const node of nodes) {
      if (!fileGroups.has(node.file)) {
        fileGroups.set(node.file, []);
      }
      fileGroups.get(node.file)!.push(node);
    }
    
    // Create links within each file
    for (const [file, classes] of fileGroups) {
      for (let i = 0; i < classes.length; i++) {
        for (let j = i + 1; j < classes.length; j++) {
          links.push({
            source: classes[i].id,
            target: classes[j].id,
            type: 'co-location',
            strength: 0.5
          });
        }
      }
    }
    
    // Create some cross-file links (simplified)
    const changedClasses = nodes.filter(n => n.status !== 'unchanged');
    for (let i = 0; i < Math.min(changedClasses.length, 5); i++) {
      const unchangedNodes = nodes.filter(n => n.status === 'unchanged');
      if (unchangedNodes.length > 0) {
        const randomUnchanged = unchangedNodes[Math.floor(Math.random() * unchangedNodes.length)];
        links.push({
          source: changedClasses[i].id,
          target: randomUnchanged.id,
          type: 'dependency',
          strength: 0.3
        });
      }
    }
    
    return links;
  }

  /**
   * Parse diff text into structured file and hunk data
   */
  private parseDiffToFiles(diffData: GitDiffData): any[] {
    const files: any[] = [];
    const diffLines = diffData.diffText.split('\n');
    let currentFile: any = null;
    let currentHunk: any = null;
    let hunkId = 0;
    let fileContent = '';
    
    for (let i = 0; i < diffLines.length; i++) {
      const line = diffLines[i];
      
      // File header
      if (line.startsWith('diff --git')) {
        if (currentFile) {
          currentFile.diffContent = fileContent;
          files.push(currentFile);
        }
        
        const match = line.match(/diff --git a\/(.+) b\/(.+)/);
        if (match) {
          const oldPath = match[1];
          const newPath = match[2];
          
          currentFile = {
            id: `file_${files.length}`,
            pathOld: oldPath,
            pathNew: newPath,
            status: oldPath === newPath ? 'modified' : 'renamed',
            language: this.getLanguageFromPath(newPath),
            isBinary: false,
            stats: { hunks: 0, additions: 0, deletions: 0 },
            hunks: [],
            diffContent: ''
          };
          hunkId = 0;
          fileContent = '';
        }
      }
      // Hunk header
      else if (line.startsWith('@@')) {
        if (currentFile) {
          const hunkMatch = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
          if (hunkMatch) {
            const oldStart = parseInt(hunkMatch[1]);
            const oldCount = parseInt(hunkMatch[2] || '1');
            const newStart = parseInt(hunkMatch[3]);
            const newCount = parseInt(hunkMatch[4] || '1');
            
            currentHunk = {
              id: `hunk_${hunkId++}`,
              oldStart,
              oldCount,
              newStart,
              newCount,
              content: line + '\n'
            };
            
            currentFile.hunks.push(currentHunk);
            currentFile.stats.hunks++;
            fileContent += line + '\n';
          }
        }
      }
      // Content lines
      else if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
        currentHunk.content += line + '\n';
        fileContent += line + '\n';
        
        if (line.startsWith('+')) {
          currentFile.stats.additions++;
        } else if (line.startsWith('-')) {
          currentFile.stats.deletions++;
        }
      }
    }
    
    // Add the last file
    if (currentFile) {
      currentFile.diffContent = fileContent;
      files.push(currentFile);
    }
    
    return files;
  }

  /**
   * Get language from file path
   */
  private getLanguageFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'py': 'python',
      'java': 'java',
      'go': 'go',
      'rs': 'rust',
      'md': 'markdown',
      'json': 'json',
      'yaml': 'yaml',
      'yml': 'yaml',
      'css': 'css',
      'scss': 'scss',
      'html': 'html',
      'xml': 'xml'
    };
    return languageMap[ext || ''] || 'unknown';
  }


}
