# Security Review

Perform a security analysis of the following git diff.

## Instructions

Look for:
1. **Input Validation**: New user inputs that need validation
2. **Authentication**: Changes to auth/authorization logic
3. **Data Exposure**: Potential data leaks or exposure
4. **Injection Vulnerabilities**: SQL, XSS, or other injection risks
5. **Cryptography**: Proper use of encryption/hashing
6. **Access Control**: Permission and access control changes

## Git Diff

```
{GIT_DIFF}
```

## Response Format

Return a JSON object with the following structure:
```json
{
  "securityScore": number_0_to_100,
  "vulnerabilities": [
    {
      "severity": "low|medium|high|critical",
      "type": "vulnerability type",
      "description": "detailed description",
      "recommendation": "how to fix"
    }
  ],
  "securityImprovements": ["list", "of", "positive", "security", "changes"],
  "recommendations": ["list", "of", "security", "recommendations"]
}
```
