# Code Summary Analysis

Analyze the following git diff and provide a comprehensive summary of the code changes.

## Instructions

Please provide:
1. **Overview**: High-level summary of what changed
2. **File Analysis**: List of modified files and their purposes
3. **Key Changes**: Most important modifications
4. **Code Quality**: Assessment of the changes
5. **Complexity**: Estimate of change complexity (low/medium/high)

## Git Diff

```
{GIT_DIFF}
```

## Response Format

Return a JSON object with the following structure:
```json
{
  "overview": "Brief description of changes",
  "filesChanged": number,
  "keyChanges": ["list", "of", "important", "changes"],
  "complexity": "low|medium|high",
  "qualityAssessment": "Assessment of code quality",
  "recommendations": ["list", "of", "recommendations"]
}
```
