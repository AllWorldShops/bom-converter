import { useLang, LANGUAGES } from '@/i18n/LanguageContext'
import { cn } from '@/lib/utils'

export default function TopBar({ title }) {
  const { lang, setLang } = useLang()
  return (
    <header className="h-14 bg-navy-900 border-b border-navy-700 flex items-center justify-between px-6">
      <h2 className="text-base font-semibold text-slate-100">{title}</h2>
      <div className="flex items-center rounded-lg border border-navy-600 overflow-hidden text-xs">
        {LANGUAGES.map(l => (
          <button
            key={l.code}
            onClick={() => setLang(l.code)}
            className={cn(
              'px-3 py-1.5 font-medium transition-colors',
              lang === l.code ? 'bg-electric-500/20 text-electric-300' : 'text-slate-400 hover:text-slate-200'
            )}
          >
            {l.label}
          </button>
        ))}
      </div>
    </header>
  )
}
