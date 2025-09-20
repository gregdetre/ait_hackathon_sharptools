export type ThemeMode = 'light' | 'dark' | 'auto'

export function getThemeMode(): ThemeMode {
  const raw = String(process.env.THEME_MODE || 'light').toLowerCase()
  if (raw === 'light' || raw === 'dark' || raw === 'auto') return raw
  return 'light'
}

export function getPort(): number {
  const raw = String(process.env.PORT || '8787').trim()
  const n = Number(raw)
  if (Number.isFinite(n) && n > 0 && n < 65536) return n
  return 8787
}

// Chat model configuration
export type Provider = 'anthropic'

export type ChatModelId = 'claude-sonnet-4' | 'claude-opus-4.1'

export interface ChatModelInfo {
  id: ChatModelId
  label: string
  provider: Provider
  apiModel: string
}

const CHAT_MODELS: Record<ChatModelId, ChatModelInfo> = {
  'claude-sonnet-4': {
    id: 'claude-sonnet-4',
    label: 'Claude Sonnet 4',
    provider: 'anthropic',
    // Closest current Anthropic model identifier
    apiModel: 'claude-3-5-sonnet-20240620'
  },
  'claude-opus-4.1': {
    id: 'claude-opus-4.1',
    label: 'Claude Opus 4.1',
    provider: 'anthropic',
    // Closest current Anthropic model identifier
    apiModel: 'claude-3-opus-20240229'
  }
}

export function getAvailableModels(): ChatModelInfo[] {
  return Object.values(CHAT_MODELS)
}

function normalizeModelId(input: string | undefined | null): ChatModelId | null {
  if (!input) return null
  const raw = String(input).trim().toLowerCase()
  // Accept ids or friendly aliases
  if (raw === 'claude-sonnet-4' || raw === 'sonnet' || raw === 'sonnet4' || raw === 'claude-sonnet') return 'claude-sonnet-4'
  if (raw === 'claude-opus-4.1' || raw === 'opus' || raw === 'opus4.1' || raw === 'claude-opus') return 'claude-opus-4.1'
  return null
}

export function getDefaultModelId(): ChatModelId {
  const envModel = normalizeModelId(process.env.CHAT_MODEL)
  return envModel || 'claude-sonnet-4'
}

// Primary entry: resolve a model from an argument or environment, falling back to default
export function getModel(modelArg?: string): ChatModelInfo {
  const resolved = normalizeModelId(modelArg) || getDefaultModelId()
  return CHAT_MODELS[resolved]
}
