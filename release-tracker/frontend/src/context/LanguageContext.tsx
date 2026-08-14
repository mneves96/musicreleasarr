import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { en, type TranslationKey, type TranslationValue } from '../i18n/en'
import { fr } from '../i18n/fr'

export type Language = 'fr' | 'en'

const LANGUAGE_STORAGE_KEY = 'app.language'
const DICTIONARIES: Record<Language, Record<TranslationKey, TranslationValue>> = { en, fr }

function readStoredLanguage(): Language {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
  // Anglais par defaut (demande explicite) si rien n'est stocke, plutot que
  // de deviner via navigator.language - comportement previsible/coherent
  // avec le fait que rien d'autre dans l'app ne se base sur la langue du
  // navigateur.
  return stored === 'fr' ? 'fr' : 'en'
}

interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error("useLanguage doit etre utilise a l'interieur de <LanguageProvider>")
  return ctx
}

// Meme patron que ThemeContext.tsx (localStorage, pose un attribut sur
// <html>, aucune synchronisation backend) - reglage volontairement
// client-only, voir Reglages > Apparence.
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(readStoredLanguage)

  useEffect(() => {
    document.documentElement.lang = language
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  }, [language])

  function t(key: TranslationKey, vars?: Record<string, string | number>): string {
    const value = DICTIONARIES[language][key]
    return typeof value === 'function' ? value(vars ?? {}) : value
  }

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>
}
