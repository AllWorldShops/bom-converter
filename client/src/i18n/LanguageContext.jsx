import { createContext, useContext, useState, useCallback } from 'react'
import { translations } from './translations'

const LanguageContext = createContext(null)

export const LANGUAGES = [
  { code: 'en', label: 'EN' },
  { code: 'zh', label: '中文' },
]

const STORAGE_KEY = 'pecko_lang'

function resolve(dict, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict)
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem(STORAGE_KEY) || 'en')

  const setLang = useCallback(code => {
    localStorage.setItem(STORAGE_KEY, code)
    setLangState(code)
  }, [])

  // t('nav.dashboard') → string. Falls back to English, then to the key itself.
  // Supports {var} interpolation: t('chat.askAbout', { part: '193643-1' }).
  const t = useCallback((key, vars) => {
    let str = resolve(translations[lang], key)
    if (str == null) str = resolve(translations.en, key)
    if (str == null) return key
    if (vars) for (const [k, v] of Object.entries(vars)) str = str.replaceAll(`{${k}}`, v)
    return str
  }, [lang])

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLang = () => useContext(LanguageContext)
