export type ThemeMode = 'light' | 'dark' | 'auto'

export function getThemeMode(): ThemeMode {
  const raw = String(process.env.THEME_MODE || 'light').toLowerCase()
  if (raw === 'light' || raw === 'dark' || raw === 'auto') return raw
  return 'light'
}
