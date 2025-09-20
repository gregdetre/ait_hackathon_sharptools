import { promises as fs } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { AnalysisResult, GitDiffData, LLMConfig } from '../shared/types';

export class LLMProcessor {
  private config: LLMConfig;
  private openai?: OpenAI;
  private promptCache: Map<string, string> = new Map();
  private isInitialized: boolean = false;

  constructor(config: LLMConfig) {
    this.config = config;
    
    if (config.enabled) {
      this.initializeOpenAI();
    }
  }

  private initializeOpenAI(): void {
    const apiKey = process.env.OPENAI_API_KEY;
    console.log('Initializing OpenAI client...');
    console.log('API Key present:', !!apiKey);
    console.log('API Key length:', apiKey ? apiKey.length : 0);
    
    if (!apiKey) {
      console.warn('OPENAI_API_KEY not found in environment variables. LLM processing will use fake data.');
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

  async processGitDiff(diffData: GitDiffData): Promise<AnalysisResult[]> {
    console.log('🔄 Processing git diff with LLM...');
    console.log('Config enabled:', this.config.enabled);
    console.log('Is initialized:', this.isInitialized);
    console.log('OpenAI client exists:', !!this.openai);
    
    if (!this.config.enabled || !this.isInitialized || !this.openai) {
      console.log('⚠️ LLM processing disabled, using fake data');
      return this.generateFakeAnalysis(diffData);
    }

    try {
      const analyses: AnalysisResult[] = [];
      const timestamp = new Date();
      let hasErrors = false;

      // Process each prompt type
      const promptTypes = ['code-summary', 'impact-analysis', 'security-review', 'performance-analysis'];
      
      for (const promptType of promptTypes) {
        try {
          const analysis = await this.processPrompt(promptType, diffData, timestamp);
          analyses.push(analysis);
        } catch (error) {
          console.error(`Error processing ${promptType}:`, error);
          hasErrors = true;
          // For the first prompt failure, throw the error to trigger server error handling
          if (promptType === 'code-summary') {
            throw error;
          }
          // Add fallback analysis for other prompt types
          analyses.push(this.generateFallbackAnalysis(promptType, diffData, timestamp));
        }
      }

      // If all prompts failed, throw an error to trigger server error handling
      if (hasErrors && analyses.every(a => a.confidence === 0.0)) {
        throw new Error('All LLM processing failed - check API key and token limits');
      }

      return analyses;
    } catch (error) {
      console.error('Error in LLM processing:', error);
      // Re-throw the error so the server can handle it and send llm-error message
      throw error;
    }
  }

  private async processPrompt(promptType: string, diffData: GitDiffData, timestamp: Date): Promise<AnalysisResult> {
    console.log(`📝 Processing prompt: ${promptType}`);
    let promptTemplate = await this.loadPromptTemplate(promptType);
    
    // Replace git diff placeholder
    let prompt = promptTemplate.replace('{GIT_DIFF}', diffData.diffText);
    
    // Add repomix output if available
    if (diffData.repomixOutput && diffData.repomixSize) {
      console.log(`📦 Including repomix output (${diffData.repomixSize} characters)`);
      prompt = prompt.replace('{GIT_DIFF}', `${diffData.diffText}\n\n## Codebase Context (Repomix Output)\n\n\`\`\`xml\n${diffData.repomixOutput}\n\`\`\``);
    }
    
    console.log(`📏 Prompt length: ${prompt.length} characters`);

    try {
      console.log(`🚀 Making OpenAI API call for ${promptType}...`);
      const response = await this.openai!.chat.completions.create({
        model: this.config.model || 'gpt-4',
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

      const content = response.choices[0]?.message?.content;
      console.log(`📄 Response content length: ${content ? content.length : 'null'}`);
      
      if (!content) {
        console.error(`❌ No response content from OpenAI for ${promptType}`);
        console.error('Full response:', JSON.stringify(response, null, 2));
        throw new Error('No response content from OpenAI');
      }

      // Parse JSON response
      let parsedContent;
      try {
        parsedContent = JSON.parse(content);
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
        timestamp
      };
    } catch (error) {
      console.error(`OpenAI API error for ${promptType}:`, error);
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
      'impact-analysis': 'Impact Analysis',
      'security-review': 'Security Review',
      'performance-analysis': 'Performance Analysis'
    };
    return titles[promptType] || promptType;
  }

  private generateFallbackAnalysis(promptType: string, diffData: GitDiffData, timestamp: Date): AnalysisResult {
    const fallbackContent = {
      error: 'LLM processing failed',
      fallback: true,
      filesChanged: diffData.fileCount,
      linesAdded: diffData.additions,
      linesDeleted: diffData.deletions,
      message: 'Analysis could not be completed due to an error'
    };

    return {
      id: promptType,
      type: promptType,
      title: this.getTitleForType(promptType),
      content: fallbackContent,
      confidence: 0.0,
      timestamp
    };
  }

  private generateFakeAnalysis(diffData: GitDiffData): AnalysisResult[] {
    const analyses: AnalysisResult[] = [];
    const timestamp = new Date();

    // Code Summary Analysis
    analyses.push({
      id: 'code-summary',
      type: 'code-summary',
      title: 'Code Summary',
      content: {
        filesChanged: diffData.fileCount,
        linesAdded: diffData.additions,
        linesDeleted: diffData.deletions,
        summary: diffData.fileCount > 0 
          ? `Modified ${diffData.fileCount} file(s) with ${diffData.additions} additions and ${diffData.deletions} deletions`
          : 'No changes detected',
        keyChanges: diffData.fileCount > 0 ? [
          'Updated API endpoints',
          'Refactored utility functions', 
          'Added error handling'
        ] : []
      },
      confidence: 0.95,
      timestamp
    });

    // Impact Analysis
    analyses.push({
      id: 'impact-analysis',
      type: 'impact-analysis',
      title: 'Impact Analysis',
      content: {
        riskLevel: diffData.fileCount > 5 ? 'high' : diffData.fileCount > 2 ? 'medium' : 'low',
        affectedComponents: diffData.fileCount > 0 ? [
          'Authentication system',
          'Database layer',
          'API responses'
        ] : [],
        breakingChanges: diffData.fileCount > 3,
        testingRecommendations: [
          'Run integration tests',
          'Verify API contracts',
          'Check database migrations'
        ]
      },
      confidence: 0.87,
      timestamp
    });

    // Security Review
    analyses.push({
      id: 'security-review',
      type: 'security-review',
      title: 'Security Review',
      content: {
        securityScore: Math.floor(Math.random() * 20) + 80, // 80-100
        issues: diffData.additions > 50 ? [
          {
            severity: 'medium',
            type: 'Input Validation',
            description: 'New user input fields may need validation'
          }
        ] : [],
        recommendations: [
          'Review new input validation',
          'Check authentication changes',
          'Verify access control updates'
        ],
        hasSecurityImplications: diffData.fileCount > 0
      },
      confidence: 0.78,
      timestamp
    });

    // Performance Analysis
    analyses.push({
      id: 'performance-analysis',
      type: 'performance-analysis',
      title: 'Performance Analysis',
      content: {
        performanceImpact: diffData.additions > diffData.deletions ? 'neutral' : 'positive',
        potentialBottlenecks: diffData.fileCount > 3 ? [
          'Database query optimization needed',
          'Consider caching for new endpoints'
        ] : [],
        optimizationOpportunities: [
          'Bundle size could be reduced',
          'Consider lazy loading for new components'
        ],
        estimatedImpact: `${Math.floor(Math.random() * 10) - 5}% performance change`
      },
      confidence: 0.65,
      timestamp
    });

    return analyses;
  }
}
