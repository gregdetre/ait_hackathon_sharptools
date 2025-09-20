# Git Diff Analyzer - Prompt Writer Integration Guide

## Overview

This guide explains how to create and integrate custom prompts for the Git Diff Analyzer system. The analyzer uses LLM prompts to generate real-time analysis of git changes, providing developers with AI-powered insights about their code modifications.

## System Architecture

The Git Diff Analyzer works as follows:
1. **Git Monitor**: Watches for file changes in the repository
2. **LLM Processor**: Loads prompts and sends git diff data to LLM APIs
3. **Analysis Results**: Returns structured JSON responses displayed in the UI
4. **Real-time Updates**: Results are pushed to connected clients via WebSocket

## Prompt File Structure

### Location
All prompt files should be placed in the `prompts/` directory:
```
sharptools/git-diff-analyzer/
├── prompts/
│   ├── code-summary.md          # Existing
│   ├── impact-analysis.md       # Existing  
│   ├── security-review.md       # Existing
│   ├── performance-analysis.md  # Existing
│   └── your-custom-prompt.md    # Your new prompt
```

### File Naming Convention
- Use kebab-case: `your-analysis-type.md`
- Be descriptive: `database-schema-analysis.md` not `db.md`
- Match the analysis type: `code-quality-review.md`

## Prompt Template Structure

### Required Sections

Every prompt file must include these sections:

#### 1. Title Header
```markdown
# Your Analysis Type Name

Brief description of what this analysis does.
```

#### 2. Instructions Section
```markdown
## Instructions

Provide clear, numbered instructions for what the LLM should analyze:
1. **First Analysis Point**: What to look for
2. **Second Analysis Point**: Another aspect to evaluate
3. **Third Analysis Point**: Additional considerations
```

#### 3. Git Diff Placeholder
```markdown
## Git Diff

```
{GIT_DIFF}
```
```

**Important**: Always use `{GIT_DIFF}` exactly as shown - this is replaced with actual diff content.

#### 4. Response Format
```markdown
## Response Format

Return a JSON object with the following structure:
```json
{
  "field1": "description of field1",
  "field2": number,
  "field3": ["array", "of", "strings"],
  "nestedObject": {
    "subField": "description"
  }
}
```
```

## Creating Custom Prompts

### Step 1: Define Your Analysis Type

Choose what aspect of the code changes you want to analyze:
- **Code Quality**: Style, patterns, best practices
- **Architecture**: Design patterns, structure, coupling
- **Testing**: Test coverage, test quality, missing tests
- **Documentation**: Documentation completeness, accuracy
- **Dependencies**: New dependencies, version changes, security
- **Accessibility**: WCAG compliance, usability
- **Internationalization**: i18n considerations, locale support

### Step 2: Write Clear Instructions

**Good Instructions:**
```markdown
## Instructions

Analyze the following git diff for code quality issues:

1. **Code Style**: Check for consistent formatting, naming conventions
2. **Best Practices**: Look for anti-patterns or violations of best practices
3. **Complexity**: Identify overly complex functions or classes
4. **Documentation**: Check if new code has adequate comments/docstrings
5. **Error Handling**: Verify proper error handling and edge cases
```

**Bad Instructions:**
```markdown
## Instructions

Check the code for problems and tell me what's wrong.
```

### Step 3: Design JSON Response Structure

**Key Principles:**
- Use descriptive field names
- Include both qualitative and quantitative data
- Provide actionable recommendations
- Use consistent data types
- Include confidence levels when appropriate

**Example Structure:**
```json
{
  "overallScore": 85,
  "issues": [
    {
      "severity": "medium",
      "type": "code-style",
      "description": "Function name doesn't follow naming convention",
      "file": "src/utils.ts",
      "line": 42,
      "recommendation": "Rename function to use camelCase"
    }
  ],
  "strengths": ["Good error handling", "Clear variable names"],
  "recommendations": ["Add JSDoc comments", "Extract complex logic"],
  "confidence": 0.92
}
```

## Integration Process

### 1. Create Your Prompt File

Create a new `.md` file in the `prompts/` directory following the template structure.

### 2. Update LLM Processor (Future Enhancement)

Currently, the system uses fake data. When LLM integration is enabled, you'll need to:

1. **Register your prompt**: Add your analysis type to the LLM processor
2. **Handle response parsing**: Ensure your JSON structure is properly parsed
3. **Error handling**: Define fallback behavior for malformed responses

### 3. Update Frontend (If Needed)

The current UI automatically displays any analysis results. For custom analysis types, you might want to:

1. **Add custom styling**: Create specific CSS for your analysis type
2. **Custom components**: Build React components for specialized display
3. **Interactive features**: Add drill-down capabilities for detailed views

## Best Practices

### Prompt Writing

1. **Be Specific**: Give clear, actionable instructions
2. **Use Examples**: Include examples of good vs. bad code when helpful
3. **Set Boundaries**: Define what the analysis should and shouldn't cover
4. **Consider Context**: Account for different types of changes (new features, bug fixes, refactoring)

### JSON Response Design

1. **Consistent Structure**: Use similar field names across different analysis types
2. **Actionable Data**: Provide specific recommendations, not just observations
3. **Confidence Levels**: Include confidence scores for subjective assessments
4. **Hierarchical Data**: Use nested objects for complex information

### Error Handling

1. **Graceful Degradation**: Design prompts to handle edge cases
2. **Fallback Responses**: Define what to return when analysis fails
3. **Validation**: Ensure JSON responses can be parsed reliably

## Example: Custom Code Quality Prompt

```markdown
# Code Quality Analysis

Analyze the code changes for quality, maintainability, and adherence to best practices.

## Instructions

Evaluate the following aspects of the code changes:

1. **Code Style**: Check for consistent formatting, naming conventions, and style guidelines
2. **Function Design**: Assess function length, complexity, and single responsibility principle
3. **Error Handling**: Verify proper error handling, exception management, and edge cases
4. **Documentation**: Check for adequate comments, docstrings, and inline documentation
5. **Performance**: Identify potential performance issues or inefficiencies
6. **Security**: Look for security vulnerabilities or unsafe practices

## Git Diff

```
{GIT_DIFF}
```

## Response Format

Return a JSON object with the following structure:
```json
{
  "overallScore": 85,
  "qualityMetrics": {
    "codeStyle": 90,
    "functionDesign": 80,
    "errorHandling": 85,
    "documentation": 70,
    "performance": 90,
    "security": 95
  },
  "issues": [
    {
      "severity": "medium",
      "category": "code-style",
      "description": "Function name doesn't follow camelCase convention",
      "file": "src/utils.ts",
      "line": 42,
      "recommendation": "Rename getUserData to getUserData"
    }
  ],
  "strengths": [
    "Excellent error handling in new functions",
    "Good use of TypeScript types",
    "Clear variable naming"
  ],
  "recommendations": [
    "Add JSDoc comments to public functions",
    "Consider extracting complex logic into smaller functions",
    "Add unit tests for new utility functions"
  ],
  "confidence": 0.88
}
```
```

## Testing Your Prompts

### 1. Manual Testing

1. Create test git changes
2. Run the analyzer with your prompt
3. Verify JSON response structure
4. Check that all fields are populated correctly

### 2. Edge Case Testing

Test with:
- Empty diffs
- Very large diffs
- Binary file changes
- Merge conflicts
- Renamed files

### 3. Response Validation

Ensure your JSON responses:
- Parse correctly
- Include all required fields
- Handle missing data gracefully
- Provide meaningful values

## Troubleshooting

### Common Issues

1. **Malformed JSON**: Ensure proper JSON syntax in response format
2. **Missing Fields**: Verify all required fields are included
3. **Type Mismatches**: Check that field types match the specification
4. **Empty Responses**: Handle cases where analysis can't be performed

### Debug Tips

1. **Test with Simple Changes**: Start with small, simple diffs
2. **Validate JSON**: Use JSON validators to check response format
3. **Check Logs**: Review server logs for LLM processing errors
4. **Incremental Development**: Build prompts incrementally, testing each section

## Future Enhancements

### Planned Features

1. **Dynamic Prompt Loading**: Load prompts without server restart
2. **Prompt Versioning**: Track prompt changes and versions
3. **A/B Testing**: Test different prompt variations
4. **Custom Parameters**: Pass additional context to prompts
5. **Prompt Templates**: Reusable prompt components

### Integration Opportunities

1. **CI/CD Integration**: Run analysis in automated pipelines
2. **IDE Plugins**: Integrate with development environments
3. **Team Dashboards**: Aggregate analysis across team members
4. **Historical Analysis**: Track quality trends over time

## Support

For questions or issues with prompt integration:

1. **Check Documentation**: Review this guide and implementation plan
2. **Test Examples**: Use existing prompts as templates
3. **Validate Structure**: Ensure your prompt follows the required format
4. **Debug Systematically**: Test each component individually

---

**Note**: This system is currently in proof-of-concept phase. LLM integration is planned for future versions. Current implementation uses fake data for testing the UI and WebSocket communication.
