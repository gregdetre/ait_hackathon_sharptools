import http from 'http'
import { promises as fs } from 'fs'
import path from 'path'
import url from 'url'
import { getThemeMode, getPort } from './config'

// Load env from .env.local if present
try {
  const dotenv = require('dotenv')
  const dotenvPath = path.resolve(process.cwd(), '.env.local')
  dotenv.config({ path: dotenvPath })
} catch {}

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {}
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const [k, v] = a.split('=')
      const key = k.replace(/^--/, '')
      if (typeof v === 'string') args[key] = v
      else args[key] = true
    }
  }
  return args
}

const args = parseArgs(process.argv)
const HOST = (args.host as string) || process.env.HOST || '127.0.0.1'
const PORT = Number(args.port || getPort())
const STATIC_DIR = (args.dir as string) || process.env.STATIC_DIR || path.resolve(__dirname, '../docs/chat')
const DISABLE_CACHE = (args['no-cache'] as boolean) ?? true
const QUIET = (args.quiet as boolean) || false

function log(...parts: any[]) { if (!QUIET) console.log(...parts) }

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8'
    case '.js': return 'text/javascript; charset=utf-8'
    case '.css': return 'text/css; charset=utf-8'
    case '.json': return 'application/json; charset=utf-8'
    case '.svg': return 'image/svg+xml'
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.gif': return 'image/gif'
    default: return 'application/octet-stream'
  }
}

function sendJson(res: http.ServerResponse, status: number, obj: unknown) {
  const body = Buffer.from(JSON.stringify(obj))
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', String(body.length))
  if (DISABLE_CACHE) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    res.setHeader('Surrogate-Control', 'no-store')
  }
  res.end(body)
}

async function handleChat(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const raw = Buffer.concat(chunks).toString('utf-8') || '{}'
    const data = JSON.parse(raw)
    const message = String((data?.message ?? '')).trim()
    const model = String((data?.model ?? 'gpt-4o')).trim()
    if (!message) return sendJson(res, 400, { error: "Missing 'message'" })

    let OpenAI: any
    try {
      const m = await import('openai')
      OpenAI = (m as any).default || m
    } catch (e: any) {
      return sendJson(res, 500, { error: `LLM backend not available: ${e?.message || String(e)}` })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return sendJson(res, 500, { error: 'LLM backend not configured: Missing OPENAI_API_KEY' })

    const client = new OpenAI({ apiKey })
    const resp = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: message }],
      temperature: 0.2
    })
    const reply = resp?.choices?.[0]?.message?.content ?? ''
    return sendJson(res, 200, { reply })
  } catch (e: any) {
    return sendJson(res, 500, { error: e?.message || String(e) })
  }
}

async function serveStatic(res: http.ServerResponse, filePath: string) {
  try {
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html')
    const data = await fs.readFile(filePath)
    res.statusCode = 200
    res.setHeader('Content-Type', contentTypeFor(filePath))
    if (DISABLE_CACHE) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
      res.setHeader('Surrogate-Control', 'no-store')
    }
    res.setHeader('Content-Length', String(data.length))
    res.end(data)
  } catch {
    res.statusCode = 404
    res.end('Not Found')
  }
}

function safeJoin(baseDir: string, requestedPath: string): string | null {
  const p = path.normalize(path.join(baseDir, requestedPath))
  const rel = path.relative(baseDir, p)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  return p
}

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET'
  const parsed = url.parse(req.url || '/')
  const pathname = decodeURIComponent(parsed.pathname || '/')
  log(`${method} ${pathname}`)

  if (method === 'GET' && pathname === '/config') {
    return void sendJson(res, 200, { themeMode: getThemeMode(), port: PORT })
  }

  if (method === 'POST' && pathname === '/chat') return void (await handleChat(req, res))

  if (method !== 'GET' && method !== 'HEAD') {
    res.statusCode = 405
    return void res.end('Method Not Allowed')
  }

  let requestedPath = pathname
  if (!path.extname(requestedPath)) {
    const htmlCandidate = requestedPath.endsWith('/') ? requestedPath + 'index.html' : requestedPath + '.html'
    const joinedHtml = safeJoin(STATIC_DIR, htmlCandidate.replace(/^\//, ''))
    if (joinedHtml) {
      try {
        const st = await fs.stat(joinedHtml)
        if (st.isFile()) return void (await serveStatic(res, joinedHtml))
      } catch { /* continue */ }
    }
  }

  const joined = safeJoin(STATIC_DIR, requestedPath.replace(/^\//, ''))
  if (!joined) {
    res.statusCode = 403
    return void res.end('Forbidden')
  }
  await serveStatic(res, joined)
})

server.listen(PORT, HOST, () => {
  console.log(`Chat server (TS) at http://${HOST}:${PORT}`)
  console.log(`Serving static from: ${STATIC_DIR}`)
})
