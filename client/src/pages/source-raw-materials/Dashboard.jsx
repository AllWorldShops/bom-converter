import { Boxes } from 'lucide-react'
import { useLang } from '@/i18n/LanguageContext'

export default function SourceRawMaterialsDashboard() {
  const { t } = useLang()
  return (
    <div className="flex flex-col items-center justify-center min-h-64 text-center">
      <Boxes size={48} className="text-slate-600 mb-4" />
      <h2 className="text-xl font-semibold text-slate-200 mb-2">{t('srmDash.title')}</h2>
      <p className="text-slate-400 max-w-sm">{t('srmDash.body')}</p>
    </div>
  )
}
