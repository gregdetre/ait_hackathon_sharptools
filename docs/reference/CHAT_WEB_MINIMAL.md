# Minimal Chat Web — Reference

### Introduction
A tiny, dependency-light chat web experience consisting of a static HTML UI and a TypeScript Node server. The server serves `docs/chat` and exposes `POST /chat` backed by OpenAI.

### See also
- `docs/chat/index.html` — minimal client UI (no frameworks)
- `sharptools/chat-server.ts` — TypeScript Node server (static + POST /chat)
- `docs/reference/libraries/VERCEL_AI_SDK.md` — notes on using Vercel AI SDK (optional alternative)
- `gjdutils/src/gjdutils/llms_openai.py` — Python OpenAI helper (legacy for comparison)
- OpenAI Node SDK docs — `https://github.com/openai/openai-node`

### Principles, key decisions
- Keep server simple: built on Node `http` only, no framework
- Serve static from `docs/chat` with extensionless `.html` support
- Lazy-load OpenAI and return clear errors if `OPENAI_API_KEY` is missing
- Prefer streaming in future, start with simple JSON response
- Keep client dependency-free and small

### Architecture overview
- UI: `docs/chat/index.html` makes `fetch('/chat')` with `{ message, model }`
- Server: `sharptools/chat-server.ts`
  - `GET` serves static files from `../docs/chat`
  - `POST /chat` reads JSON body, calls OpenAI, returns `{ reply }`
  - Basic cache disabling for dev

### Setup and running
1) Install deps
```bash
cd sharptools
npm install
```
2) Export your OpenAI key (same shell)
```bash
export OPENAI_API_KEY=sk-... 
```
3) Start server
```bash
npm run chat
# Chat server (TS) at http://127.0.0.1:8787
```
4) Open UI
```bash
open http://127.0.0.1:8787
```

### Common tasks
- Change default model: edit `model` default in `chat-server.ts`
- Serve from a different folder: run `npm run chat -- --dir=/abs/path`
- Quiet logs: `npm run chat -- --quiet`

### Gotchas
- Missing `OPENAI_API_KEY` → server returns JSON error on `/chat`
- Port conflicts → run with `--port=XXXX`
- TypeScript type errors in other tools won’t block running via `tsx`

### Planned enhancements
- Streaming responses (SSE) for faster perceived latency
- Provider abstraction via Vercel AI SDK
- Basic message history on the client

### Troubleshooting
- 404 on `/` → ensure `docs/chat/index.html` exists and server cwd is project root
- 500 on `/chat` → confirm `OPENAI_API_KEY` and network access
- Permission issues → try a different port or run locally without proxies
