# Impact Analysis

Analyze the potential impact of the following git diff on the overall system.

## Instructions

Evaluate:
1. **Risk Level**: Overall risk of these changes (low/medium/high)
2. **Breaking Changes**: Whether changes might break existing functionality
3. **Affected Systems**: Which parts of the system might be impacted
4. **Dependencies**: External dependencies or APIs affected
5. **Testing Requirements**: What should be tested

## Git Diff

```
{GIT_DIFF}
```

## Response Format

Return a JSON object with the following structure:
```json
{
  "riskLevel": "low|medium|high",
  "breakingChanges": boolean,
  "affectedSystems": ["list", "of", "affected", "systems"],
  "dependencyImpact": ["list", "of", "dependency", "changes"],
  "testingRecommendations": ["list", "of", "testing", "suggestions"],
  "deploymentConsiderations": ["list", "of", "deployment", "notes"]
}
```
