# Git Diff Analyzer - Implementation Plan

## Overview

The Git Diff Analyzer is a real-time web application that monitors git changes and provides AI-powered analysis through multiple visualization panels. It replaces traditional git diff displays with rich, interactive analysis components.

## Project Structure

```
sharptools/git-diff-analyzer/
├── package.json                    # Dependencies and scripts
├── config.json                     # Application configuration
├── prompts/                        # LLM prompt templates
│   ├── code-summary.md
│   ├── impact-analysis.md
│   ├── security-review.md
│   └── performance-analysis.md
├── src/
│   ├── server/
│   │   ├── index.ts                # Main server (HTTP + WebSocket)
│   │   ├── git-monitor.ts          # Git diff monitoring
│   │   └── llm-processor.ts        # LLM processing pipeline
│   ├── client/
│   │   └── index.html              # Single-page React application
│   └── shared/
│       └── types.ts                # Shared TypeScript interfaces
```

## Architecture

### Core Components

1. **Git Monitor** (`git-monitor.ts`)
   - File system watching with chokidar
   - Fallback polling mechanism
   - Support for static file mode
   - Git diff generation and parsing

2. **LLM Processor** (`llm-processor.ts`)
   - V1: Fake data generation for testing
   - V2: OpenAI integration with configurable prompts
   - Analysis result formatting

3. **WebSocket Server** (`index.ts`)
   - Real-time communication with clients
   - Broadcasts diff changes and analysis updates
   - Manual refresh capability

4. **React Frontend** (`index.html`)
   - Multiple analysis panels
   - Real-time updates via WebSocket
   - Responsive grid layout
   - Optional raw diff view

## Implementation Steps

### Phase 1: Core Infrastructure ✅ COMPLETED

1. **Project Setup**
   - [x] Create folder structure
   - [x] Initialize package.json with dependencies
   - [x] Set up TypeScript configuration
   - [x] Create configuration system

2. **Backend Implementation**
   - [x] Git monitoring module with file watching
   - [x] LLM processor with fake data
   - [x] HTTP server with WebSocket support
   - [x] Configuration management

3. **Frontend Implementation**
   - [x] React components for analysis panels
   - [x] WebSocket integration
   - [x] Responsive UI design
   - [x] Real-time updates

### Phase 2: Installation & Testing

1. **Dependencies Installation**
   ```bash
   cd sharptools/git-diff-analyzer
   npm install
   ```

2. **Configuration Setup**
   - Update `config.json` with appropriate paths
   - Set `watchFolder` to target git repository
   - Configure server port (default: 8788)

3. **Start Application**
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

4. **Access Application**
   - Open browser to `http://127.0.0.1:8788`
   - Test file watching by making changes to monitored folder
   - Test manual refresh functionality

### Phase 3: LLM Integration (Future)

1. **OpenAI Integration**
   - Enable LLM processing in config
   - Implement prompt loading from `prompts/` folder
   - Add error handling for API failures

2. **Prompt Customization**
   - Create custom prompt templates
   - Add prompt validation
   - Support for dynamic prompt parameters

## Configuration

### config.json Structure

```json
{
  "server": {
    "port": 8788,
    "host": "127.0.0.1"
  },
  "gitMonitor": {
    "mode": "folder-watch",
    "watchFolder": "/path/to/git/repo",
    "staticFilePath": null,
    "pollInterval": 2000
  },
  "llm": {
    "enabled": false,
    "promptsFolder": "./prompts"
  },
  "ui": {
    "showRawDiff": true,
    "refreshInterval": 1000
  }
}
```

### Configuration Options

- **server**: HTTP server settings
- **gitMonitor**: Git monitoring configuration
  - `mode`: "folder-watch" or "static-file"
  - `watchFolder`: Path to git repository to monitor
  - `staticFilePath`: Path to static diff file (for static mode)
  - `pollInterval`: Fallback polling interval in ms
- **llm**: LLM processing settings
  - `enabled`: Enable/disable LLM processing
  - `promptsFolder`: Path to prompt templates
- **ui**: Frontend settings
  - `showRawDiff`: Show/hide raw diff panel
  - `refreshInterval`: UI refresh interval

## Dependencies

### Production Dependencies
- `ws`: WebSocket server implementation
- `chokidar`: File system watching
- `openai`: OpenAI API client (for future LLM integration)

### Development Dependencies
- `tsx`: TypeScript execution
- `typescript`: TypeScript compiler
- `@types/ws`: WebSocket type definitions
- `@types/node`: Node.js type definitions

## API Endpoints

### HTTP Endpoints
- `GET /`: Main application page
- `GET /api/config`: Get current configuration
- `POST /api/refresh`: Trigger manual refresh

### WebSocket Messages

#### Client → Server
```typescript
// Request manual refresh
{ type: 'refresh' }

// Request current state
{ type: 'get-current-state' }
```

#### Server → Client
```typescript
// Git diff update
{ 
  type: 'diff-update', 
  data: {
    diffText: string,
    timestamp: Date,
    fileCount: number,
    additions: number,
    deletions: number
  }
}

// Analysis results update
{ 
  type: 'analysis-update', 
  data: AnalysisResult[]
}

// Status update
{ 
  type: 'status-update', 
  data: { error?: string }
}
```

## Data Types

### Core Interfaces

```typescript
interface GitDiffData {
  diffText: string;
  timestamp: Date;
  fileCount: number;
  additions: number;
  deletions: number;
}

interface AnalysisResult {
  id: string;
  type: string;
  title: string;
  content: any;
  confidence: number;
  timestamp: Date;
}

interface WebSocketMessage {
  type: 'diff-update' | 'analysis-update' | 'status-update';
  data: any;
}
```

## UI Components

### Analysis Panels

1. **Code Summary Panel**
   - Files changed count
   - Lines added/deleted
   - Key changes list
   - Complexity assessment

2. **Impact Analysis Panel**
   - Risk level indicator
   - Breaking changes flag
   - Affected components
   - Testing recommendations

3. **Security Review Panel**
   - Security score (0-100)
   - Vulnerability list
   - Security improvements
   - Recommendations

4. **Performance Analysis Panel**
   - Performance impact assessment
   - Resource implications
   - Bottleneck identification
   - Optimization opportunities

### UI Features

- **Real-time Updates**: Live updates via WebSocket
- **Manual Refresh**: Button to trigger immediate check
- **Status Indicators**: Connection and monitoring status
- **Responsive Design**: Grid layout adapts to screen size
- **Collapsible Raw Diff**: Optional traditional diff view

## Development Workflow

### Local Development

1. **Start Development Server**
   ```bash
   npm run dev
   ```

2. **Make Changes**
   - Edit TypeScript files in `src/`
   - Modify React components in `index.html`
   - Update configuration in `config.json`

3. **Test Changes**
   - Server auto-reloads on file changes
   - Browser refresh to see frontend changes
   - Test with actual git repository changes

### Production Deployment

1. **Build Process**
   - No build step required for v1
   - All assets served directly from source

2. **Environment Setup**
   - Install Node.js dependencies
   - Configure `config.json` for target environment
   - Set up process manager (PM2, systemd, etc.)

3. **Monitoring**
   - Log file system watching events
   - Monitor WebSocket connections
   - Track LLM API usage (when enabled)

## Testing Strategy

### Unit Tests
- Git monitor functionality
- LLM processor logic
- WebSocket message handling

### Integration Tests
- File system watching
- WebSocket communication
- Configuration loading

### Manual Testing
- Real git repository monitoring
- UI responsiveness
- Error handling scenarios

## Security Considerations

### File System Access
- Validate watch folder paths
- Prevent directory traversal
- Limit file access scope

### WebSocket Security
- Validate message formats
- Rate limit connections
- Handle malformed messages

### LLM Integration (Future)
- Secure API key storage
- Input sanitization
- Output validation

## Performance Considerations

### File System Monitoring
- Efficient file watching with chokidar
- Debounced change detection
- Fallback polling mechanism

### WebSocket Management
- Connection pooling
- Message batching
- Memory leak prevention

### Frontend Optimization
- Efficient React rendering
- Minimal re-renders
- Optimized WebSocket updates

## Troubleshooting

### Common Issues

1. **File Watching Not Working**
   - Check folder permissions
   - Verify git repository exists
   - Enable polling fallback

2. **WebSocket Connection Failed**
   - Check firewall settings
   - Verify server is running
   - Check browser console for errors

3. **No Analysis Data**
   - Verify LLM processor is enabled
   - Check fake data generation
   - Review server logs

### Debug Mode

Enable debug logging by setting environment variable:
```bash
DEBUG=git-diff-analyzer:* npm start
```

## Future Enhancements

### Phase 2 Features
- Real LLM integration with OpenAI
- Custom prompt templates
- Analysis result caching
- Export functionality

### Phase 3 Features
- Multiple repository support
- Analysis history
- Custom analysis types
- Plugin system

### Phase 4 Features
- Team collaboration features
- Integration with CI/CD
- Advanced visualization
- Machine learning insights

## Getting Started

1. **Clone and Setup**
   ```bash
   cd sharptools/git-diff-analyzer
   npm install
   ```

2. **Configure**
   ```bash
   # Edit config.json
   vim config.json
   ```

3. **Run**
   ```bash
   npm start
   ```

4. **Access**
   Open browser to `http://127.0.0.1:8788`

## Support

For issues or questions:
- Check server logs for errors
- Verify configuration settings
- Test with simple git changes
- Review WebSocket connection status

---

**Status**: ✅ Implementation Complete - Ready for Testing
**Next Phase**: LLM Integration and Production Deployment
