import { Outlet, useLocation } from 'react-router-dom'
import { useLang } from '@/i18n/LanguageContext'
import { translations } from '@/i18n/translations'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function AppShell() {
  const { pathname } = useLocation()
  const { t } = useLang()
  // Page titles live under the `pageTitles` namespace, keyed by pathname.
  const title = translations.en.pageTitles[pathname]
    ? t(`pageTitles.${pathname}`)
    : t('pageTitles.fallback')
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <TopBar title={title} />
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
