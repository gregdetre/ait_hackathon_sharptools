import { runCli, type CliOptions } from 'repomix';
import path from 'path';
import { promises as fs } from 'fs';

export class RepomixService {
  private readonly maxOutputSize = 50000; // 50,000 characters
  private readonly maxDiffSize = 50000; // 50,000 characters

  /**
   * Check if git diff is too large
   */
  isDiffTooLarge(diffText: string): boolean {
    return diffText.length > this.maxDiffSize;
  }

  /**
   * Generate repomix output for the current codebase
   */
  async generateRepomixOutput(workingDirectory: string): Promise<{ output: string; size: number } | null> {
    try {
      console.log('🔄 Generating repomix output...');
      
      // Create temporary output file
      const tempOutputPath = path.join(workingDirectory, 'temp-repomix-output.xml');
      
      const options: CliOptions = {
        output: tempOutputPath,
        style: 'xml',
        compress: true,
        quiet: true,
        include: '**/*.py,**/*.ts', // Only include Python and TypeScript files
        ignore: '**/node_modules/**,**/.git/**,**/dist/**,**/build/**'
      };

      console.log('📦 Running repomix with options:', {
        compress: options.compress,
        include: options.include,
        ignore: options.ignore
      });

      const result = await runCli(['.'], workingDirectory, options);
      
      if (!result.success) {
        console.error('❌ Repomix failed:', result.error);
        return null;
      }

      // Read the generated output
      const output = await fs.readFile(tempOutputPath, 'utf-8');
      const size = output.length;

      // Clean up temporary file
      await fs.unlink(tempOutputPath).catch(() => {
        // Ignore cleanup errors
      });

      console.log(`📊 Repomix output size: ${size} characters`);

      // Check if output is within size limit
      if (size > this.maxOutputSize) {
        console.log(`⚠️ Repomix output too large (${size} > ${this.maxOutputSize}), not including in analysis`);
        return null;
      }

      console.log('✅ Repomix output generated successfully');
      return { output, size };

    } catch (error) {
      console.error('❌ Error generating repomix output:', error);
      return null;
    }
  }

  /**
   * Get size limits for display purposes
   */
  getSizeLimits() {
    return {
      maxDiffSize: this.maxDiffSize,
      maxRepomixSize: this.maxOutputSize
    };
  }
}
