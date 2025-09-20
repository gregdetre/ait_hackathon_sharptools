# Git Diff Analyzer - Setup Instructions

## Environment Setup

To enable LLM processing, you need to set up your OpenAI API key:

### 1. Get OpenAI API Key
1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create a new API key
3. Copy the key

### 2. Set Environment Variable

**Option A: Environment Variable**
```bash
export OPENAI_API_KEY="your_api_key_here"
```

**Option B: Create .env file**
```bash
# Create .env file in the git-diff-analyzer directory
echo "OPENAI_API_KEY=your_api_key_here" > .env
```

**Option C: Add to your shell profile**
```bash
# Add to ~/.bashrc or ~/.zshrc
echo 'export OPENAI_API_KEY="your_api_key_here"' >> ~/.bashrc
source ~/.bashrc
```

### 3. Start the Server

```bash
cd sharptools/git-diff-analyzer
npm start
```

## Configuration

The LLM settings can be configured in `config.json`:

```json
{
  "llm": {
    "enabled": true,
    "promptsFolder": "./prompts",
    "model": "gpt-4",
    "temperature": 0.1,
    "maxCompletionTokens": 2000
  }
}
```

## Troubleshooting

### LLM Processing Disabled
If you see "LLM processing disabled, using fake data" in the logs:
- Check that `OPENAI_API_KEY` is set correctly
- Verify the API key is valid
- Check your OpenAI account has sufficient credits

### API Errors
- Check your OpenAI account billing status
- Verify API key permissions
- Check rate limits

### Fallback Behavior
If LLM processing fails, the system will:
1. Use fake data for that analysis type
2. Continue processing other analysis types
3. Log errors for debugging
