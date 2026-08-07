import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemeMode = 'dark' | 'light'
export type AccentColor = 'violet' | 'blue' | 'sky' | 'emerald' | 'amber' | 'rose' | 'pink' | 'indigo'

export const ACCENT_COLORS: AccentColor[] = ['violet', 'blue', 'sky', 'emerald', 'amber', 'rose', 'pink', 'indigo']

const THEME_STORAGE_KEY = 'app.theme'
const ACCENT_STORAGE_KEY = 'app.accent'

function readStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  return stored === 'light' ? 'light' : 'dark'
}

function readStoredAccent(): AccentColor {
  const stored = localStorage.getItem(ACCENT_STORAGE_KEY)
  return (ACCENT_COLORS as string[]).includes(stored ?? '') ? (stored as AccentColor) : 'violet'
}

interface ThemeContextValue {
  theme: ThemeMode
  accent: AccentColor
  setTheme: (theme: ThemeMode) => void
  setAccent: (accent: AccentColor) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme doit etre utilise a l'interieur de <ThemeProvider>")
  return ctx
}

// Theme (clair/sombre) et accent (8 couleurs au choix) - poses sur <html>
// via data-theme/data-accent, lus par les variables CSS de index.css.
// Violet + sombre restent les valeurs par defaut (comportement historique
// de l'app pour qui n'a jamais touche au reglage).
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(readStoredTheme)
  const [accent, setAccent] = useState<AccentColor>(readStoredAccent)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.accent = accent
    localStorage.setItem(ACCENT_STORAGE_KEY, accent)
  }, [accent])

  return <ThemeContext.Provider value={{ theme, accent, setTheme, setAccent }}>{children}</ThemeContext.Provider>
}
