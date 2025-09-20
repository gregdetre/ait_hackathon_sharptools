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
