import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, RefreshCw, Settings, Users, Building2, Ruler, Factory, Package, SlidersHorizontal, LogOut, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

const navItemBase = 'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors'
const activeClass = 'bg-electric-500/20 text-electric-300'
const inactiveClass = 'text-slate-400 hover:bg-navy-700 hover:text-slate-100'

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [settingsOpen, setSettingsOpen] = useState(() => pathname.startsWith('/settings'))
  const isAdmin = user?.role === 'ADMIN'

  async function handleLogout() {
    try {
      await logout()
    } finally {
      navigate('/login')
    }
  }

  return (
    <aside className="w-64 min-h-screen bg-navy-900 border-r border-navy-700 flex flex-col">
      <div className="p-6 border-b border-navy-700">
        <p className="text-xs text-slate-500 uppercase tracking-widest font-mono">Pecko</p>
        <h1 className="text-lg font-bold text-slate-100 mt-1">BOM Converter</h1>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        <NavLink
          to="/dashboard"
          className={({ isActive }) => cn(navItemBase, isActive ? activeClass : inactiveClass)}
        >
          <LayoutDashboard size={18} /> Dashboard
        </NavLink>
        <NavLink
          to="/convert"
          className={({ isActive }) => cn(navItemBase, isActive ? activeClass : inactiveClass)}
        >
          <RefreshCw size={18} /> Convert BOM
        </NavLink>

        {isAdmin && (
          <div className="pt-4">
            <button
              onClick={() => setSettingsOpen(o => !o)}
              className={cn(navItemBase, 'w-full justify-between', inactiveClass)}
            >
              <span className="flex items-center gap-3">
                <Settings size={18} /> Settings
              </span>
              <ChevronDown
                size={14}
                className={cn('transition-transform', settingsOpen && 'rotate-180')}
              />
            </button>

            {settingsOpen && (
              <div className="ml-4 mt-1 space-y-1">
                {[
                  { to: '/settings/users', icon: Users, label: 'Users' },
                  { to: '/settings/customers', icon: Building2, label: 'Customers' },
                  { to: '/settings/unit-of-measure', icon: Ruler, label: 'Unit of Measure' },
                  { to: '/settings/manufacturer-mappings', icon: Factory, label: 'Manufacturers' },
                  { to: '/settings/product-registry', icon: Package, label: 'Product Registry' },
                  { to: '/settings/advanced', icon: SlidersHorizontal, label: 'Advanced' },
                ].map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) => cn(navItemBase, isActive ? activeClass : inactiveClass)}
                  >
                    <Icon size={16} /> {label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-navy-700">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-electric-500/20 flex items-center justify-center text-electric-300 font-bold text-sm font-mono">
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-100 truncate">{user?.username}</p>
            <p className="text-xs text-slate-500 truncate">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className={cn(navItemBase, 'w-full', inactiveClass)}
        >
          <LogOut size={16} /> Sign Out
        </button>
      </div>
    </aside>
  )
}
