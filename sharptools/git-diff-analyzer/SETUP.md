# Git Diff Analyzer - Setup Instructions

## Environment Setup

To enable LLM processing, you need to set up your API key for either OpenAI or Claude:

## OpenAI Setup

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

## Claude Setup

### 1. Get Anthropic API Key
1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Create a new API key
3. Copy the key

### 2. Set Environment Variable

**Option A: Environment Variable**
```bash
export ANTHROPIC_API_KEY="your_api_key_here"
```

**Option B: Create .env file**
```bash
# Create .env file in the git-diff-analyzer directory
echo "ANTHROPIC_API_KEY=your_api_key_here" > .env
```

**Option C: Add to your shell profile**
```bash
# Add to ~/.bashrc or ~/.zshrc
echo 'export ANTHROPIC_API_KEY="your_api_key_here"' >> ~/.bashrc
source ~/.bashrc
```

### 3. Start the Server

```bash
cd sharptools/git-diff-analyzer
npm start
```

## Configuration

The LLM settings can be configured in `config.json`. You can choose between OpenAI and Claude:

### OpenAI Configuration
```json
{
  "llm": {
    "enabled": true,
    "provider": "openai",
    "promptsFolder": "./prompts",
    "model": "gpt-4",
    "temperature": 0.1,
    "maxCompletionTokens": 2000
  }
}
```

### Claude Configuration
```json
{
  "llm": {
    "enabled": true,
    "provider": "claude",
    "promptsFolder": "./prompts",
    "model": "claude-3-5-sonnet-20241022",
    "temperature": 0.1,
    "maxCompletionTokens": 2000
  }
}
```

### Available Models

**OpenAI Models:**
- `gpt-4`
- `gpt-4-turbo`
- `gpt-3.5-turbo`

**Claude Models:**
- `claude-3-5-sonnet-20241022` (recommended)
- `claude-3-opus-20240229`
- `claude-3-sonnet-20240229`
- `claude-3-haiku-20240307`

## Troubleshooting

### LLM Processing Disabled
If you see "LLM processing disabled, using fake data" in the logs:

**For OpenAI:**
- Check that `OPENAI_API_KEY` is set correctly
- Verify the API key is valid
- Check your OpenAI account has sufficient credits

**For Claude:**
- Check that `ANTHROPIC_API_KEY` is set correctly
- Verify the API key is valid
- Check your Anthropic account has sufficient credits

### API Errors
- Check your account billing status
- Verify API key permissions
- Check rate limits
- Ensure you're using the correct model name for your provider

### Fallback Behavior
If LLM processing fails, the system will:
1. Use fake data for that analysis type
2. Continue processing other analysis types
3. Log errors for debugging

### Testing Your Setup
You can test your configuration using the test script:

```bash
# Test Claude integration
npx tsx test-claude.ts

# Or test with a specific config file
npx tsx src/server/index.ts --config config-claude.json
```
