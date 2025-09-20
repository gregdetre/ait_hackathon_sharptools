# Performance Analysis

Analyze the performance implications of the following git diff.

## Instructions

Evaluate:
1. **Performance Impact**: Will these changes improve or degrade performance?
2. **Resource Usage**: Memory, CPU, network, or storage implications
3. **Scalability**: How changes affect system scalability
4. **Bottlenecks**: Potential new performance bottlenecks
5. **Optimizations**: Opportunities for performance improvements

## Git Diff

```
{GIT_DIFF}
```

## Response Format

Return a JSON object with the following structure:
```json
{
  "performanceImpact": "positive|negative|neutral",
  "estimatedImpact": "percentage or description of expected change",
  "resourceImplications": {
    "memory": "impact description",
    "cpu": "impact description",
    "network": "impact description",
    "storage": "impact description"
  },
  "potentialBottlenecks": ["list", "of", "potential", "bottlenecks"],
  "optimizationOpportunities": ["list", "of", "optimization", "suggestions"],
  "scalabilityConsiderations": ["list", "of", "scalability", "notes"]
}
```
